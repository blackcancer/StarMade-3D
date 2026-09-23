import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = join(root, 'src');

// Native ESM imports let Node's V8 coverage describe the actual published JS,
// rather than Vite's transient transformed modules. Assertions remain in Vitest.
export default {
  root,
  plugins: [{
    name: 'coverage-production-esm',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !id.startsWith('.')) return;
      const source = resolve(dirname(importer.split('?')[0]), id);
      if (source !== sourceRoot && !source.startsWith(sourceRoot + sep)) return;
      let target = join(root, 'dist', source.slice(sourceRoot.length));
      const extension = extname(target);
      if (extension === '.ts') target = target.slice(0, -3) + '.js';
      else if (!extension) target = existsSync(target + '.js') ? target + '.js' : join(target, 'index.js');
      if (!existsSync(target)) throw new Error(`Missing production module: ${target}. Build before coverage.`);
      return { id: pathToFileURL(target).href, external: true };
    }
  }],
  test: {
    include: ['tests/*.test.ts'],
    setupFiles: ['scripts/coverage/flush.mjs', 'scripts/test-shaders.mjs'],
    sequence: { hooks: 'stack' },
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    // Vitest 4 replaces isolated fork processes after every file. Coverage needs
    // one retained process and one final V8 flush; the ordinary suite remains isolated.
    isolate: false,
    server: { deps: { external: [/\/dist\//] } }
  }
};
