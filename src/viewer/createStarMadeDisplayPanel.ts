import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Camera, type Texture } from 'three';
import { bindStarMadeDisplayScanline } from './displayScanline.js';
import type { StarMadeDisplayBackground } from '../starmade/displayText.js';
import type { BlockPosition } from '../inspection/model.js';
import { parseStarMadeDisplayText, starMadeDisplayMatrix } from '../starmade/displayText.js';

import type { StarMadeDisplayValueSource } from '../starmade/displayValues.js';

export interface StarMadeDisplayPanelOptions {
  readonly position: BlockPosition;
  readonly orientation: number;
  /** Shared native screen-gui texture; remains owned by the host. */
  readonly background: Texture;
  readonly backgrounds?: Partial<Record<StarMadeDisplayBackground,Texture>>;
  /** Supply a fresh canvas. The host must load the native font before creating panels. */
  readonly createCanvas: () => HTMLCanvasElement;
  readonly fontFamily: string;
  readonly text?: string;
  /** Entity-bound calculated values; takes precedence over the fallback resolver. */
  readonly values?: StarMadeDisplayValueSource;
  readonly resolveVariable?: (name: string) => string | undefined;
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
  const maxDistance = options.maxTextDistance ?? 500;
  if (!Number.isFinite(maxDistance) || maxDistance < 0) throw Error('Invalid display text distance');
  const canvas = options.createCanvas(); const candidate = canvas.getContext('2d');
  if (!candidate) throw Error('Display panel needs a 2D canvas context');
  const context = candidate;
  const root = new Group(); root.name = 'StarMade display 479'; root.matrixAutoUpdate = false;
  const backgroundMaterial = new MeshBasicMaterial({ map: options.background, transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  const background = surface(256,256,backgroundMaterial); root.add(background);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const textMaterial = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false });
  const text = surface(1,1,textMaterial); text.position.set(7,7,.1); text.renderOrder=1; const textFrame = new Group(); textFrame.add(text); root.add(textFrame);
  let backgroundEffect: ReturnType<typeof bindStarMadeDisplayScanline>, textEffect: ReturnType<typeof bindStarMadeDisplayScanline>;
  let previous = ''; let raw = options.text; let disposed = false;
  function update(...values: [] | [string | undefined]) {
    if (disposed) throw Error('Display panel disposed');
    raw = values.length ? values[0] : raw; const style = parseStarMadeDisplayText(raw, token => options.values?.resolve(token) ?? options.resolveToken?.(token), name => options.values?.resolveVariable?.(name) ?? options.resolveVariable?.(name));
    const signature = JSON.stringify(style); if (signature === previous) return false;
    if (style.text.length > 16384) throw Error('Display text exceeds 16384 characters');
    const screen = style.background === 'blue' ? options.background : options.backgrounds?.[style.background];
    if (style.drawBackground && !screen) throw Error('Missing native display background: '+style.background);
    let width = 1, height = 0;
    const runs = style.segments.filter(segment=>segment.text.length>0).map(segment=>{
      const font = `${segment.bold ? 'bold ' : ''}${segment.fontSize}px "${options.fontFamily}"`;
      context.font=font; const lines=segment.text.split('\n'), metrics=context.measureText('Mg');
      const lineHeight=Math.ceil(metrics.fontBoundingBoxAscent+metrics.fontBoundingBoxDescent);
      if (!Number.isFinite(lineHeight) || lineHeight<=0) throw Error('Invalid display canvas dimensions');
      width=Math.max(width,Math.ceil(Math.max(...lines.map(line=>context.measureText(line).width)))+2);
      const y=height; height+=lineHeight*lines.length;
      return {segment,font,lines,metrics,lineHeight,y};
    });
    height=Math.max(1,height)+2;
    if (!Number.isFinite(width) || width>4096 || height>4096) throw Error('Display canvas dimensions exceed supported limits');
    // Three r164 uses immutable WebGL2 texture storage: resized canvases need reallocation.
    texture.dispose(); canvas.width=width*2; canvas.height=height*2;
    context.scale(2,2); context.textBaseline='alphabetic'; context.strokeStyle='#000000'; context.lineWidth=1;
    for (const {segment,font,lines,metrics,lineHeight,y} of runs) {
      context.font=font; context.fillStyle='#'+[16,8,0].map(shift=>Math.round(((segment.color>>shift)&255)*250/255).toString(16).padStart(2,'0')).join('');
      lines.forEach((line,i)=>{const baseline=y+metrics.fontBoundingBoxAscent+i*lineHeight+1;context.strokeText(line,1,baseline);context.fillText(line,1,baseline);});
    }
    background.visible=style.drawBackground;
    backgroundMaterial.map=screen ?? options.background;
    backgroundEffect.uDiffuseTexture.value=backgroundMaterial.map;
    backgroundEffect.smDisplayHolographic.value=textEffect.smDisplayHolographic.value=style.holographic;
    textFrame.rotation.set(...style.rotation.map(degrees=>degrees*Math.PI/180) as [number,number,number]);
    text.scale.set(width,height,1); texture.needsUpdate=true;
    root.matrix.copy(starMadeDisplayMatrix(options.position,options.orientation,style.offset)); root.matrixWorldNeedsUpdate=true;
    previous=signature; return true;
  }
  /** Native clock advances at twice elapsed seconds; independent of text rasterization. */
  function updateTime(deltaSeconds: number) {
    if (disposed) throw Error('Display panel disposed');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds<0) throw Error('Invalid display time');
    backgroundEffect.uTime.value += deltaSeconds*2; textEffect.uTime.value=backgroundEffect.uTime.value;
  }
  const world = new Vector3(), eye = new Vector3();
  function updateVisibility(camera: Camera) {
    root.getWorldPosition(world); camera.getWorldPosition(eye); text.visible=world.distanceTo(eye)<=maxDistance;
  }
  function dispose() {
    if (disposed) return; disposed=true; root.removeFromParent(); background.geometry.dispose(); text.geometry.dispose(); backgroundMaterial.dispose(); textMaterial.dispose(); texture.dispose();
  }
  try { backgroundEffect=bindStarMadeDisplayScanline(backgroundMaterial); textEffect=bindStarMadeDisplayScanline(textMaterial); update(); } catch (error) { dispose(); throw error; }
  return { root, background, text, texture, update, updateTime, updateVisibility, dispose };
}
