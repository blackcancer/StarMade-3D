/**
 * @fileoverview Resolves native zipped block textures for the development server.
 *
 * A normal atlas is also a material-data atlas: its alpha channel encodes
 * emission/specular strength. Legacy RGB PNG previews must not replace an RGBA
 * TGA supplied by the same pack. The HTTP endpoint remains PNG for browsers.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Resolves one decoded, query-free PNG request without leaving the texture root.
 * @param {string} root - Absolute directory containing native texture packs.
 * @param {string} requestPath - Decoded URL path below that directory.
 * @returns {{path: string, encoding: 'png'|'tga'}|null} Preferred existing archive.
 * @remarks Only normal atlases prefer TGA; color atlases retain PNG semantics.
 * Unknown files return null; malformed URL escaping is handled by the caller.
 */
export function resolveBlockTextureAsset(root, requestPath) {
  const pngPath = resolve(root, `.${requestPath}`);
  const child = relative(root, pngPath);
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`) || !pngPath.endsWith('.png')) return null;
  if (requestPath.endsWith('_NRM.png')) {
    const tgaPath = `${pngPath.slice(0, -4)}.tga.zip`;
    if (existsSync(tgaPath)) return { path: tgaPath, encoding: 'tga' };
  }
  const pngZip = `${pngPath}.zip`;
  return existsSync(pngZip) ? { path: pngZip, encoding: 'png' } : null;
}
