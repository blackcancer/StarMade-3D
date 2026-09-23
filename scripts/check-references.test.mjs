import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitBlobHash, verifyCheckout, verifyProjectReferences } from './check-references.mjs';

function fixture(run) {
  const base = mkdtempSync(join(tmpdir(), 'starmade-reference-'));
  const sdk = join(base, 'sdk'); mkdirSync(sdk);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', sdk, ...args], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  try {
    git('init', '-q'); git('config', 'user.name', 'Reference Test'); git('config', 'user.email', 'test@example.invalid');
    git('config', 'core.autocrlf', 'false');
    writeFileSync(join(sdk, 'package.json'), '{"name":"starmade-decoder","version":"2.0.0"}\n');
    mkdirSync(join(sdk, 'src')); writeFileSync(join(sdk, 'src/index.ts'), 'export const fixture = true;\n');
    git('add', '.'); git('commit', '-qm', 'test fixture');
    const reference = {commit:git('rev-parse','HEAD'),version:'2.0.0', packageBlob:gitBlobHash(readFileSync(join(sdk,'package.json')))};
    run({base, sdk, git, reference});
  } finally { rmSync(base, {recursive:true, force:true}); }
}

test('reference verification is read-only and checks exact commit/version/blob', () => fixture(({sdk,reference}) => {
  const before = readFileSync(join(sdk,'package.json'));
  assert.equal(verifyCheckout(sdk,reference).commit,reference.commit);
  assert.deepEqual(readFileSync(join(sdk,'package.json')),before);
  assert.throws(() => verifyCheckout(sdk,{...reference, commit:'0'.repeat(40)}),/commit mismatch/);
  assert.throws(() => verifyCheckout(sdk,{...reference, version:'1.4.0'}),/version mismatch/);
  assert.throws(() => verifyCheckout(sdk,{...reference, packageBlob:'0'.repeat(40)}),/source blob/);
}));

test('missing, dirty and unbuilt references fail rather than silently skipping integration', () => fixture(({base,sdk,reference}) => {
  assert.throws(() => verifyCheckout(join(base,'missing'),reference),/Missing/);
  assert.throws(() => verifyCheckout(base,reference),/Cannot verify Git/);
  assert.throws(() => verifyCheckout(sdk,reference,{requireBuild:true}),/build missing/);
  mkdirSync(join(sdk,'dist')); writeFileSync(join(sdk,'dist/index.js'),'export {};');
  assert.equal(verifyCheckout(sdk,reference,{requireBuild:true}).version,'2.0.0');
  writeFileSync(join(sdk,'src/uncommitted.ts'),'export {};');
  assert.throws(() => verifyCheckout(sdk,reference),/uncommitted changes/);
}));

test('pinned Java/GLSL blobs are verified from Git rather than host line endings', () => fixture(({sdk,reference,git}) => {
  const blob = git('rev-parse','HEAD:src/index.ts');
  assert.equal(verifyCheckout(sdk,{...reference,verifiedFiles:{'src/index.ts':blob}}).commit,reference.commit);
  assert.throws(() => verifyCheckout(sdk,{...reference,verifiedFiles:{'src/index.ts':'0'.repeat(40)}}),/file mismatch/);
  assert.throws(() => verifyCheckout(sdk,{...reference,verifiedFiles:{'missing.ts':blob}}),/file mismatch/);
}));

test('project lock requires the SDK build and optionally the game-source checkout', () => fixture(({base,sdk,reference}) => {
  const root = join(base,'project'); mkdirSync(root);
  const lock = {schemaVersion:1,decoder:{...reference,directory:'../sdk'}, gameSource:{...reference,directory:'../sdk'}};
  const path = join(root,'references.lock.json'); writeFileSync(path,JSON.stringify(lock));
  assert.throws(() => verifyProjectReferences(root),/build missing/);
  mkdirSync(join(sdk,'dist')); writeFileSync(join(sdk,'dist/index.js'),'export {};');
  assert.equal(verifyProjectReferences(root).gameSource,null);
  const previous = process.env.STARMADE_OPEN_DIR;
  try {
    delete process.env.STARMADE_OPEN_DIR;
    assert.equal(verifyProjectReferences(root,{requireOpen:true}).gameSource.commit,reference.commit);
    process.env.STARMADE_OPEN_DIR = sdk;
    assert.equal(verifyProjectReferences(root,{requireOpen:true}).gameSource.commit,reference.commit);
  } finally {
    if (previous === undefined) delete process.env.STARMADE_OPEN_DIR; else process.env.STARMADE_OPEN_DIR=previous;
  }
  writeFileSync(path,JSON.stringify({...lock,schemaVersion:99}));
  assert.throws(() => verifyProjectReferences(root),/schema/);
}));
