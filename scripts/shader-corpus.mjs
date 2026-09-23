// Read only the caller's installation; never generate a corpus inside src or dist.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
export function readShaderCorpus() {
  const root = process.env.STARMADE_SHADER_ROOT ?? (process.env.STARMADE_DIR && join(process.env.STARMADE_DIR, 'data/shader'));
  if (!root) throw Error('Set STARMADE_DIR or STARMADE_SHADER_ROOT: native shader assets are not distributed with StarMade-3D');
  const sources = {};
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) sources['data/shader/' + relative(root, file).replaceAll('\\', '/')] = readFileSync(file, 'utf8');
    }
  }
  visit(root); return sources;
}
