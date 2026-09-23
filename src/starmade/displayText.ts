import { Matrix4 } from 'three';
import type { BlockPosition } from '../inspection/model.js';

/** Decoder TextBlocks.toJSON shape. Keys retain orientation in their high 16 bits. */
export interface StarMadeDisplayText { readonly position: string; readonly text: string }
export type StarMadeDisplayBackground = 'blue' | 'red' | 'green' | 'yellow' | 'purple';
export interface StarMadeDisplaySegment {
  readonly text: string; readonly color: number; readonly fontSize: number; readonly bold: boolean;
}
export interface StarMadeDisplayStyle extends StarMadeDisplaySegment {
  readonly segments: readonly StarMadeDisplaySegment[];
  readonly offset: BlockPosition; readonly rotation: BlockPosition;
  readonly holographic: boolean; readonly background: StarMadeDisplayBackground;
  readonly drawBackground: boolean; readonly error: boolean;
}
/** Native ElementCollection.getIndex4: signed storage coordinates, not local centres. */
export function starMadeDisplayKey(position: BlockPosition, orientation: number): string {
  if (!position.every(v => Number.isInteger(v) && v + 16 >= -32768 && v + 16 <= 32767) || !Number.isInteger(orientation) || orientation < 0 || orientation > 5) throw Error('Invalid display coordinate/orientation');
  return (BigInt(orientation) << 48n | position.reduce((n, v, i) => n | (BigInt(v + 16) & 65535n) << BigInt(i * 16), 0n)).toString();
}
/** Read the optional Decoder manager structurally, without importing its runtime. */
export function starMadeDisplayTextsFromManager(manager: unknown): StarMadeDisplayText[] {
  if (!manager || typeof manager !== 'object' || !('texts' in manager)) return [];
  const texts = manager.texts as { entries(): ReadonlyMap<bigint, string> };
  return [...texts.entries()].map(([position, text]) => ({ position: position.toString(), text }));
}
/** Native cascading segments; host calculations and custom variables are read-only inputs. */
export function parseStarMadeDisplayText(raw: string | undefined,
  resolveToken: (token: string) => string | undefined = () => undefined,
  resolveVariable: (name: string) => string | undefined = () => undefined): StarMadeDisplayStyle {
  const source = raw ?? 'loading...';
  let color = 0xffffff, fontSize = 15, bold = false;
  let offset: BlockPosition = [0,0,0], rotation: BlockPosition = [0,0,0];
  let holographic = true, background: StarMadeDisplayBackground = 'blue', drawBackground = true;
  const segments: StarMadeDisplaySegment[] = [];
  let password = false;
  const add = (text: string) => {
    if (password || segments.length >= 32) return;
    password = /\[password\]/i.test(text);
    const resolved = password ? '' : text.replace(/\[([^\[\]]+)\]/g, (original, token: string) => {
      const lower = token.toLowerCase();
      if (lower.startsWith('set:') || lower.startsWith('unset:')) return '';
      if (lower.startsWith('var:')) return resolveVariable(token.slice(4).trim().toLowerCase()) ?? '';
      return resolveToken(lower) ?? original;
    });
    segments.push({ text: resolved, color, fontSize, bold });
  };
  const numeric = (value: string): number => {
    if (!value.trim() || !Number.isFinite(Number(value))) throw Error('Invalid numeric style');
    return Number(value);
  };
  try {
    let end = 0;
    for (const match of source.matchAll(/<style>(.*?)<\/style>/gi)) {
      if (match.index > end) add(source.slice(end,match.index));
      for (const item of match[1].split(',')) {
        const pair = item.split('='); if (pair.length !== 2) continue;
        const [key, value] = pair;
        switch (key.toLowerCase()) {
          case 'c': case 'color': {
            if (!/^[+-]?(?:#[\da-f]+|0x[\da-f]+|\d+)$/i.test(value)) throw Error('Invalid color');
            const sign = value.startsWith('-') ? -1 : 1; const v = value.replace(/^[+-]/, '');
            const decoded = sign * (v.startsWith('#') ? parseInt(v.slice(1),16) : /^0x/i.test(v) ? parseInt(v.slice(2),16) : /^0\d/.test(v) ? parseInt(v,8) : Number(v));
            if (!Number.isInteger(decoded) || decoded < -2147483648 || decoded > 2147483647 || /^0[0-9]*[89]/.test(v)) throw Error('Invalid color');
            color = decoded & 0xffffff; break;
          }
          case 'f': case 'font': {
            const index = Number(value);
            if (!/^[+-]?\d+$/.test(value) || index < -2147483648 || index > 2147483647) throw Error('Invalid font');
            fontSize = [16,18,20,24,30,40,70,100,300][index] ?? 15;
            bold = index >= 0 && index <= 8; break;
          }
          case 'o': case 'offset': case 'p': case 'pos': case 'position': {
            const values = value.split(':');
            if (values.length === 3) offset = values.map(v=>Math.max(-10,Math.min(10,numeric(v)))) as [number,number,number];
            break;
          }
          case 'r': case 'rot': case 'rotation': {
            const values = value.split(':');
            if (values.length === 3) rotation = values.map(numeric) as [number,number,number];
            else if (values.length === 1) rotation = [0,0,numeric(value)];
            break;
          }
          case 'h': case 'holo': case 'holographic': holographic = value.toLowerCase() === 'true'; break;
          case 'bg': case 'background':
            if (value.toLowerCase() === 'true') drawBackground = true;
            else if (value.toLowerCase() === 'false') drawBackground = false;
            else if (['blue','red','green','yellow','purple'].includes(value.toLowerCase())) background = value.toLowerCase() as StarMadeDisplayBackground;
        }
      }
      end = match.index + match[0].length;
      if (source[end] === '\n') end++;
    }
    if (end < source.length) add(source.slice(end));
    // Native fallback includes the original string when it contains only style tags.
    if (!segments.length) add(source);
    return { ...segments[0], text: segments.map(s=>s.text).join(''), segments, offset, rotation, holographic, background, drawBackground, error:false };
  } catch {
    const segment = {text:'style error!',color:0xffffff,fontSize:15,bold:false};
    return {...segment,segments:[segment],offset:[0,0,0],rotation:[0,0,0],holographic:true,background:'blue',drawBackground:true,error:true};
  }
}
/** Native screen origin/rotation/negative pixel scale, local to the owning entity. */
export function starMadeDisplayMatrix(position: BlockPosition, orientation: number, offset: BlockPosition = [0, 0, 0]): Matrix4 {
  starMadeDisplayKey(position, orientation);
  if (!offset.every(Number.isFinite)) throw Error('Invalid display offset');
  const [n, v, h] = [.51 + offset[0], .51 + offset[1], .5 + offset[2]];
  const translations = [[-h,v,n],[h,v,-n],[h,n,v],[-h,-n,v],[-n,v,-h],[n,v,h]];
  const rotation = [new Matrix4().makeRotationY(Math.PI), new Matrix4(), new Matrix4().makeRotationX(Math.PI/2), new Matrix4().makeRotationY(Math.PI).multiply(new Matrix4().makeRotationX(-Math.PI/2)), new Matrix4().makeRotationY(Math.PI/2), new Matrix4().makeRotationY(-Math.PI/2)][orientation];
  rotation.setPosition(...position.map((p,i) => p + translations[orientation][i]) as [number,number,number]);
  return rotation.multiply(new Matrix4().makeScale(-.00395,-.00395,-.00395));
}
