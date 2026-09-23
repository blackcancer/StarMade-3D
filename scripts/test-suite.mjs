import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const suite = process.argv[2];
if (!['unit', 'decoder', 'game', 'all'].includes(suite)) throw new Error('Expected unit, decoder, game or all');
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, STARMADE_TEST_SUITE: suite }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
