const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { strict: assert } = require('node:assert');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../..');
test('Runtime unit tests against the built package', () => {
  const result = spawnSync(process.execPath, [
    'node_modules/vitest/vitest.mjs', 'run', '--config', 'scripts/coverage/vitest.config.mjs'
  ], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Vitest must succeed; an empty/failed suite cannot qualify coverage');
});
