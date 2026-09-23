import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function git(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Cannot verify Git checkout ${directory}: ${result.error?.message ?? result.stderr.trim()}`);
  return result.stdout.trim();
}
export function gitBlobHash(content) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}
/** Read-only verification; never checks out, resets or edits a user's repository. */
export function verifyCheckout(directory, reference, { requireBuild = false } = {}) {
  if (!existsSync(directory)) throw new Error(`Missing reference checkout: ${directory}`);
  const commit = git(directory, ['rev-parse', 'HEAD']);
  if (commit !== reference.commit) throw new Error(`Reference commit mismatch: expected ${reference.commit}, got ${commit}`);
  const dirty = git(directory, ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'package.json', 'package-lock.json']);
  if (dirty) throw new Error(`Reference source contains uncommitted changes: ${directory}\n${dirty}`);
  if (reference.version) {
    const packageBytes = readFileSync(resolve(directory, 'package.json'));
    const pkg = JSON.parse(packageBytes);
    if (pkg.version !== reference.version) throw new Error(`Decoder version mismatch: expected ${reference.version}, got ${pkg.version}`);
    const committedPackage = spawnSync('git', ['-C', directory, 'show', 'HEAD:package.json']);
    if (reference.packageBlob && (committedPackage.status !== 0 || gitBlobHash(committedPackage.stdout) !== reference.packageBlob)) throw new Error('Decoder package.json differs from the pinned source blob');
  }
  for (const [path, hash] of Object.entries(reference.verifiedFiles ?? {})) {
    // git show checks repository bytes rather than working-tree CRLF conversions.
    const result = spawnSync('git', ['-C', directory, 'show', `HEAD:${path}`]);
    if (result.status !== 0 || gitBlobHash(result.stdout) !== hash) throw new Error(`Pinned source file mismatch: ${path}`);
  }
  if (requireBuild && !existsSync(resolve(directory, 'dist/index.js'))) throw new Error('Decoder build missing: run npm ci && npm run build in its checkout');
  return { directory, commit, version: reference.version ?? null };
}
export function verifyProjectReferences(projectRoot, { requireOpen = false } = {}) {
  const refs = JSON.parse(readFileSync(resolve(projectRoot, 'references.lock.json'), 'utf8'));
  if (refs.schemaVersion !== 1) throw new Error('Unsupported reference lock schema');
  const decoder = verifyCheckout(resolve(projectRoot, refs.decoder.directory), refs.decoder, { requireBuild: true });
  const gameSource = requireOpen
    ? verifyCheckout(process.env.STARMADE_OPEN_DIR ?? resolve(projectRoot, refs.gameSource.directory), refs.gameSource)
    : null;
  return { decoder, gameSource };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = verifyProjectReferences(root, { requireOpen: process.argv.includes('--require-open') });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Reference check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
