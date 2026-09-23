import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { completeSmokeDiagnostics } from './isanth-webgl-smoke.mjs';

const exec = promisify(execFile);
const readyState = { totalBlocks: 3200, lodBlocks: 199, spotSourceCount: 45 };
const successfulSmoke = () => ({
  ok: false,
  readyMs: 100,
  readyState: { ...readyState },
  checks: [{ name: 'rendered geometry', ok: true }]
});
const baseline = () => ({ ...successfulSmoke(), ok: true });

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'starmade-smoke-baseline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const messages = [];
  t.mock.method(console, 'log', (...args) => messages.push(args.join(' ')));
  return {
    outputPath: join(directory, 'diagnostics.json'),
    baselinePath: join(directory, 'baseline.json'),
    messages
  };
}

async function finish(output, paths, withBaseline = true) {
  const code = await completeSmokeDiagnostics(output, {
    outputPath: paths.outputPath,
    ...(withBaseline ? { baseline: paths.baselinePath } : {})
  });
  const persisted = JSON.parse(await readFile(paths.outputPath, 'utf8'));
  return { code, persisted };
}

test('completion without a baseline persists the successful verdict before returning', async t => {
  const paths = await fixture(t);
  const { code, persisted } = await finish(successfulSmoke(), paths, false);
  assert.equal(code, 0);
  assert.equal(persisted.ok, true);
  assert.equal(persisted.baseline, undefined);
  assert.ok(paths.messages.some(message => message.includes('smoke PASS')));
});

test('a timing regression fails the completion code, summary and persisted diagnostic', async t => {
  const paths = await fixture(t);
  await writeFile(paths.baselinePath, JSON.stringify(baseline()));
  const { code, persisted } = await finish({ ...successfulSmoke(), readyMs: 2000 }, paths);
  assert.equal(code, 1);
  assert.equal(persisted.ok, false);
  assert.equal(persisted.baseline.ok, false);
  assert.deepEqual(persisted.baseline.regressions, ['readyMs: was 100, now 2000']);
  assert.ok(persisted.checks.some(check => check.name === 'baseline comparison' && !check.ok));
  assert.ok(paths.messages.some(message => message.includes('smoke FAIL')));
  assert.ok(paths.messages.some(message => message.includes('readyMs: was 100, now 2000')));
  assert.ok(!paths.messages.some(message => message.includes('smoke PASS')));
});

test('equal counts and the exact 1.5 timing boundary pass', async t => {
  const paths = await fixture(t);
  await writeFile(paths.baselinePath, JSON.stringify(baseline()));
  const { code, persisted } = await finish({ ...successfulSmoke(), readyMs: 150 }, paths);
  assert.equal(code, 0);
  assert.equal(persisted.ok, true);
  assert.equal(persisted.baseline.ok, true);
  assert.deepEqual(persisted.baseline.regressions, []);
});

test('loss of blocks, LOD or spot sources is included in the failed verdict', async t => {
  const paths = await fixture(t);
  await writeFile(paths.baselinePath, JSON.stringify(baseline()));
  const output = { ...successfulSmoke(), readyState: { totalBlocks: 3199, lodBlocks: 198, spotSourceCount: 44 } };
  const { code, persisted } = await finish(output, paths);
  assert.equal(code, 1);
  assert.deepEqual(persisted.baseline.regressions, [
    'totalBlocks: was 3200, now 3199',
    'lodBlocks: was 199, now 198',
    'spotSourceCount: was 45, now 44'
  ]);
});

test('missing current metrics cannot bypass an explicitly requested comparison', async t => {
  const paths = await fixture(t);
  await writeFile(paths.baselinePath, JSON.stringify(baseline()));
  const { code, persisted } = await finish({ ...successfulSmoke(), readyMs: null, readyState: null }, paths);
  assert.equal(code, 1);
  assert.equal(persisted.baseline.regressions.length, 4);
  assert.ok(persisted.baseline.regressions.every(message => message.includes('missing or invalid')));
});

test('additional failed checks are reported in the baseline verdict', async t => {
  const paths = await fixture(t);
  await writeFile(paths.baselinePath, JSON.stringify(baseline()));
  const output = successfulSmoke();
  output.checks.push({ name: 'shader compilation', ok: false });
  const { code, persisted } = await finish(output, paths);
  assert.equal(code, 1);
  assert.equal(persisted.ok, false);
  assert.deepEqual(persisted.baseline.regressions, ['failed checks: was 0, now 1']);
});

test('a successful comparison cannot hide an existing smoke failure', async t => {
  const paths = await fixture(t);
  const output = successfulSmoke();
  output.checks.push({ name: 'shader compilation', ok: false });
  await writeFile(paths.baselinePath, JSON.stringify(output));
  const { code, persisted } = await finish(output, paths);
  assert.equal(code, 1);
  assert.equal(persisted.ok, false);
  assert.equal(persisted.baseline.ok, true);
});

test('an unreadable baseline fails clearly and still writes diagnostics', async t => {
  const paths = await fixture(t);
  const { code, persisted } = await finish(successfulSmoke(), paths);
  assert.equal(code, 1);
  assert.equal(persisted.ok, false);
  assert.equal(persisted.baseline.error.code, 'ENOENT');
  assert.equal(persisted.baseline.path, paths.baselinePath);
  assert.ok(paths.messages.some(message => message.includes('ENOENT')));
});

test('malformed JSON is a diagnostic failure, not an ignored comparison', async t => {
  const paths = await fixture(t);
  await writeFile(paths.baselinePath, '{unfinished');
  const { code, persisted } = await finish(successfulSmoke(), paths);
  assert.equal(code, 1);
  assert.equal(persisted.ok, false);
  assert.equal(persisted.baseline.error.name, 'SyntaxError');
});

test('incomplete or malformed baseline metrics fail instead of weakening the comparison', async t => {
  const invalidBaselines = [
    null, [], {},
    { ...baseline(), readyMs: 0 },
    { ...baseline(), readyMs: '100' },
    { ...baseline(), readyState: [] },
    { ...baseline(), checks: [] },
    { ...baseline(), checks: [null] },
    { ...baseline(), checks: [{ ok: 'true' }] },
    { ...baseline(), readyState: { ...readyState, totalBlocks: -1 } },
    { ...baseline(), readyState: { ...readyState, lodBlocks: 1.5 } },
    { ...baseline(), readyState: { ...readyState, spotSourceCount: null } }
  ];
  for (const [index, value] of invalidBaselines.entries()) {
    await t.test(`invalid baseline ${index}`, async subtest => {
      const paths = await fixture(subtest);
      await writeFile(paths.baselinePath, JSON.stringify(value));
      const { code, persisted } = await finish(successfulSmoke(), paths);
      assert.equal(code, 1);
      assert.equal(persisted.ok, false);
      assert.match(persisted.baseline.error.message, /Malformed smoke baseline/);
    });
  }
});

test('empty checks and existing runtime errors cannot produce a successful completion', async t => {
  const paths = await fixture(t);
  assert.equal((await finish({ ...successfulSmoke(), checks: [] }, paths, false)).code, 1);
  await writeFile(paths.baselinePath, JSON.stringify(baseline()));
  const empty = await finish({ ...successfulSmoke(), checks: [] }, paths);
  assert.equal(empty.code, 1);
  assert.equal(empty.persisted.ok, false);
  assert.equal(empty.persisted.baseline.ok, true);
  const error = { code: 'CDP_UNAVAILABLE', message: 'Browser is unavailable' };
  const { code, persisted } = await finish({ ...successfulSmoke(), error }, paths, false);
  assert.equal(code, 2);
  assert.equal(persisted.ok, false);
  assert.deepEqual(persisted.error, error);
});

test('the actual CLI retains browser failure and invalid baseline diagnostics', async t => {
  const paths = await fixture(t);
  const scriptPath = fileURLToPath(new URL('./isanth-webgl-smoke.mjs', import.meta.url));
  const cliEnvironment = { ...process.env };
  delete cliEnvironment.NODE_TEST_CONTEXT;
  await assert.rejects(exec(process.execPath, [scriptPath,
    '--cdp', 'http://127.0.0.1:1', '--out', paths.outputPath, '--baseline', paths.baselinePath
  ], { timeout: 10000, env: cliEnvironment }), error => {
    assert.equal(error.code, 2);
    assert.match(error.stdout, /smoke FAIL/);
    assert.match(error.stdout, /baseline comparison/);
    return true;
  });
  const persisted = JSON.parse(await readFile(paths.outputPath, 'utf8'));
  assert.equal(persisted.ok, false);
  assert.equal(persisted.error.code, 'CDP_UNAVAILABLE');
  assert.equal(persisted.baseline.error.code, 'ENOENT');
});
