import { Matrix4 } from 'three';
import type { BlockPosition } from '../inspection/model.js';

/** Decoder TextBlocks.toJSON shape. Keys retain orientation in their high 16 bits. */
export interface StarMadeDisplayText { readonly position: string; readonly text: string }
export interface StarMadeDisplayStyle {
  readonly text: string; readonly color: number; readonly fontSize: number;
  readonly offset: BlockPosition; readonly error: boolean;
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
/** AbstractTextBox style header. Each parse resets all style state, including offsets. */
export function parseStarMadeDisplayText(raw: string | undefined, resolveToken: (token: string) => string | undefined = () => undefined): StarMadeDisplayStyle {
  let text = raw ?? 'loading...', color = 0xffffff, fontSize = 16;
  let offset: BlockPosition = [0, 0, 0];
  try {
    if (text.startsWith('<style>') && text.indexOf('</style>') > 0) {
      const end = text.indexOf('</style>'); const header = text.slice(7, end);
      text = text.slice(end + 8).replace(/^\n/, '');
      for (const item of header.split(',')) {
        const pair = item.split('='); if (pair.length !== 2) continue;
        const [key, value] = pair;
        switch (key.toLowerCase()) {
          case 'c': case 'color': {
            if (!/^[+-]?(?:#[\da-f]+|0x[\da-f]+|\d+)$/i.test(value)) throw Error('Invalid color');
            const sign = value.startsWith('-') ? -1 : 1; const v = value.replace(/^[+-]/, '');
            const decoded = sign * (v.startsWith('#') ? parseInt(v.slice(1), 16) : /^0x/i.test(v) ? parseInt(v.slice(2), 16) : /^0\d/.test(v) ? parseInt(v, 8) : Number(v));
            if (!Number.isInteger(decoded) || decoded < -2147483648 || decoded > 2147483647 || /^0[0-9]*[89]/.test(v)) throw Error('Invalid color');
            color = decoded & 0xffffff; break;
          }
          case 'f': case 'font': {
            if (!/^[+-]?\d+$/.test(value)) throw Error('Invalid font');
            fontSize = [16, 18, 20, 24, 30][Number(value)] ?? fontSize; break;
          }
          case 'o': case 'offset': case 'p': case 'pos': case 'position': {
            const values = value.split(':');
            if (values.length === 3) {
              if (values.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw Error('Invalid offset');
              offset = values.map(Number) as [number, number, number];
            }
          }
        }
      }
    }
    // Never expose password-protected text; no HTML interpretation or executable substitutions.
    if (/\[password\]/i.test(text)) text = '';
    else text = text.replace(/\[([^\[\]]+)\]/g, (original, token: string) => resolveToken(token.toLowerCase()) ?? original);
    return { text, color, fontSize, offset, error: false };
  } catch { return { text: 'style error!', color: 0xffffff, fontSize: 16, offset: [0, 0, 0], error: true }; }
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
