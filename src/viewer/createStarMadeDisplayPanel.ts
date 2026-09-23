import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Camera, type Texture } from 'three';
import type { BlockPosition } from '../inspection/model.js';
import { parseStarMadeDisplayText, starMadeDisplayMatrix } from '../starmade/displayText.js';

import type { StarMadeDisplayValueSource } from '../starmade/displayValues.js';

export interface StarMadeDisplayPanelOptions {
  readonly position: BlockPosition;
  readonly orientation: number;
  /** Shared native screen-gui texture; remains owned by the host. */
  readonly background: Texture;
  /** Supply a fresh canvas. The host must load the native font before creating panels. */
  readonly createCanvas: () => HTMLCanvasElement;
  readonly fontFamily: string;
  readonly text?: string;
  /** Entity-bound calculated values; takes precedence over the fallback resolver. */
  readonly values?: StarMadeDisplayValueSource;
  readonly resolveToken?: (token: string) => string | undefined;
  readonly maxTextDistance?: number;
}
function surface(width: number, height: number, material: MeshBasicMaterial): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const geometry = new PlaneGeometry(width, height).translate(width/2,height/2,0);
  const uv = geometry.getAttribute('uv'); for (let i=0;i<uv.count;i++) uv.setY(i,1-uv.getY(i));
  return new Mesh(geometry, material);
}
/** Supplemental unlit screen/text layer. Keep it outside native shadow caster roots. */
export function createStarMadeDisplayPanel(options: StarMadeDisplayPanelOptions) {
  const maxDistance = options.maxTextDistance ?? 30;
  if (!Number.isFinite(maxDistance) || maxDistance < 0) throw Error('Invalid display text distance');
  const canvas = options.createCanvas(); const candidate = canvas.getContext('2d');
  if (!candidate) throw Error('Display panel needs a 2D canvas context');
  const context = candidate;
  const root = new Group(); root.name = 'StarMade display 479'; root.matrixAutoUpdate = false;
  const backgroundMaterial = new MeshBasicMaterial({ map: options.background, transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  const background = surface(256,256,backgroundMaterial); root.add(background);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const textMaterial = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  const text = surface(1,1,textMaterial); text.position.set(7,7,.1); text.renderOrder=1; root.add(text);
  let previous = ''; let raw = options.text; let disposed = false;
  function update(...values: [] | [string | undefined]) {
    if (disposed) throw Error('Display panel disposed');
    raw = values.length ? values[0] : raw; const style = parseStarMadeDisplayText(raw, token => options.values?.resolve(token) ?? options.resolveToken?.(token));
    const signature = JSON.stringify(style); if (signature === previous) return false;
    if (style.text.length > 16384) throw Error('Display text exceeds 16384 characters');
    const font = `${style.fontSize}px "${options.fontFamily}"`;
    context.font=font; const lines=style.text.split('\n');
    const metrics=context.measureText('Mg');
    const lineHeight=Math.ceil(metrics.fontBoundingBoxAscent+metrics.fontBoundingBoxDescent);
    const width=Math.max(1,Math.ceil(Math.max(...lines.map(line=>context.measureText(line).width)))+2);
    const height=Math.max(1,lineHeight*lines.length)+2;
    if (!Number.isFinite(lineHeight) || lineHeight<=0 || width>4096 || height>4096) throw Error('Display canvas dimensions exceed supported limits');
    // Three r164 uses immutable WebGL2 texture storage: resized canvases need reallocation.
    texture.dispose();
    canvas.width=width*2; canvas.height=height*2;
    context.scale(2,2); context.font=font; context.textBaseline='alphabetic'; context.fillStyle='#'+[16,8,0].map(shift=>Math.round(((style.color>>shift)&255)*250/255).toString(16).padStart(2,'0')).join('');
    context.strokeStyle='#000000'; context.lineWidth=1;
    lines.forEach((line,i)=>{const baseline=metrics.fontBoundingBoxAscent+i*lineHeight+1;context.strokeText(line,1,baseline);context.fillText(line,1,baseline);});
    text.scale.set(width,height,1); texture.needsUpdate=true;
    root.matrix.copy(starMadeDisplayMatrix(options.position,options.orientation,style.offset)); root.matrixWorldNeedsUpdate=true;
    previous=signature; return true;
  }
  const world = new Vector3(), eye = new Vector3();
  function updateVisibility(camera: Camera) {
    root.getWorldPosition(world); camera.getWorldPosition(eye); text.visible=world.distanceTo(eye)<=maxDistance;
  }
  function dispose() {
    if (disposed) return; disposed=true; root.removeFromParent(); background.geometry.dispose(); text.geometry.dispose(); backgroundMaterial.dispose(); textMaterial.dispose(); texture.dispose();
  }
  try { update(); } catch (error) { dispose(); throw error; }
  return { root, background, text, texture, update, updateVisibility, dispose };
}
