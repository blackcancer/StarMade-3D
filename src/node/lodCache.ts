import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

const FORMAT = 'starmade-3d-lod-cache';
const MARKER = '.starmade-3d-lod';
const MANIFEST = 'manifest.json';
const SHA256 = /^[a-f0-9]{64}$/;
const PAYLOAD = /^[a-f0-9-]{36}\.bin$/;
const MAX_PAYLOAD_BYTES = 256 * 1024 * 1024;

export interface StarMadeLodCacheOptions {
  sourcePath: string;
  /** Include generator version, palette/texture identity and all rendering options. */
  configurationKey: string;
  signal?: AbortSignal;
}

export interface StarMadeLodCacheSegment {
  key: string;
  /** Hash the segment and every neighbour/dependency that affects its geometry or light. */
  dependencyKey: string;
  /** One encoded segment/level, at most 256 MiB. */
  build: () => Uint8Array | Promise<Uint8Array>;
}

export interface StarMadeLodCacheEntry {
  key: string;
  dependencyKey: string;
  payload: Uint8Array;
  reused: boolean;
}

export interface StarMadeLodCacheResult {
  directory: string;
  sourceFingerprint: string;
  configurationKey: string;
  entries: StarMadeLodCacheEntry[];
  reused: number;
  built: number;
}

interface StoredEntry {
  key: string;
  dependencyKey: string;
  file: string;
  hash: string;
}

interface Manifest {
  format: typeof FORMAT;
  version: 1;
  sourceFingerprint: string;
  configurationKey: string;
  entries: StoredEntry[];
}

/** DATA/entity.0.0.0.smd3 -> DATA/entity.0.0.0/. Never writes the source file. */
export function getStarMadeLodCacheDirectory(sourcePath: string): string {
  const source = resolve(sourcePath);
  if (extname(source).toLowerCase() !== '.smd3') throw new Error('LOD cache source must be an .smd3 file');
  return join(dirname(source), basename(source).slice(0, -5));
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sourceFingerprint(source: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (!(await lstat(source)).isFile()) throw new Error('LOD source must be a regular file, not a symlink');
  const hash = createHash('sha256');
  // O_NOFOLLOW protects the final path component even if it changes after lstat.
  const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    for await (const chunk of handle.createReadStream({ autoClose: false, signal })) hash.update(chunk);
    // Check the path, not only the open descriptor: servers may replace an SMD3 by rename.
    const after = await lstat(source, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error('LOD source changed while hashing');
    }
  } finally { await handle.close(); }
  return hash.digest('hex');
}

async function readFileSafely(path: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer | undefined> {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('LOD cache data must be a regular file');
    if (stat.size > maxBytes) return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of handle.createReadStream({ end: maxBytes, autoClose: false, signal })) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    return bytes.length > maxBytes ? undefined : bytes;
  }
  finally { await handle.close(); }
}

async function cacheDirectory(source: string, create: boolean, signal?: AbortSignal): Promise<string | undefined> {
  const directory = getStarMadeLodCacheDirectory(source);
  let info;
  try { info = await lstat(directory); }
  catch (error) {
    if (!isMissing(error)) throw error;
    if (!create) return undefined;
    // An existing directory, including an empty one, is never claimed implicitly.
    await mkdir(directory);
    // Finish the ownership marker even if cancellation arrives after mkdir.
    await writeFile(join(directory, MARKER), FORMAT, { flag: 'wx' });
    return directory;
  }
  if (!info.isDirectory()) throw new Error('LOD cache path must be a directory, not a symlink');
  const marker = await readFileSafely(join(directory, MARKER), 64, signal);
  if (marker?.toString() !== FORMAT) throw new Error('Refusing an existing directory not owned by StarMade-3D LOD cache');
  return directory;
}

async function readManifest(directory: string, signal?: AbortSignal): Promise<Manifest | undefined> {
  const bytes = await readFileSafely(join(directory, MANIFEST), 16 * 1024 * 1024, signal);
  if (!bytes) return undefined;
  let value;
  try { value = JSON.parse(bytes.toString()); }
  catch { return undefined; }
  if (!value || value.format !== FORMAT || value.version !== 1 ||
    typeof value.sourceFingerprint !== 'string' || !SHA256.test(value.sourceFingerprint) ||
    typeof value.configurationKey !== 'string' || !Array.isArray(value.entries)) return undefined;
  const keys = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || typeof entry.key !== 'string' || typeof entry.dependencyKey !== 'string' ||
      typeof entry.file !== 'string' || !PAYLOAD.test(entry.file) ||
      typeof entry.hash !== 'string' || !SHA256.test(entry.hash) || keys.has(entry.key)) return undefined;
    keys.add(entry.key);
  }
  return value as Manifest;
}

async function readPayload(directory: string, entry: StoredEntry, signal?: AbortSignal): Promise<Buffer | undefined> {
  const payload = await readFileSafely(join(directory, entry.file), MAX_PAYLOAD_BYTES, signal);
  return payload && hashBytes(payload) === entry.hash ? payload : undefined;
}

async function writeNewFile(path: string, payload: Uint8Array | string, created: string[], signal?: AbortSignal): Promise<void> {
  const handle = await open(path, 'wx');
  created.push(path);
  try { await handle.writeFile(payload, { signal }); }
  finally { await handle.close(); }
}

function result(directory: string, manifest: Manifest, entries: StarMadeLodCacheEntry[]): StarMadeLodCacheResult {
  const reused = entries.filter(entry => entry.reused).length;
  return { directory, sourceFingerprint: manifest.sourceFingerprint, configurationKey: manifest.configurationKey,
    entries, reused, built: entries.length - reused };
}

/** Returns undefined for absent, stale or damaged data; ownership/IO errors are explicit. */
export async function readStarMadeLodCache(options: StarMadeLodCacheOptions): Promise<StarMadeLodCacheResult | undefined> {
  const { sourcePath, configurationKey, signal } = options;
  signal?.throwIfAborted();
  const directory = await cacheDirectory(sourcePath, false, signal);
  if (!directory) return undefined;
  const manifest = await readManifest(directory, signal);
  if (!manifest || manifest.configurationKey !== configurationKey) return undefined;
  if (await sourceFingerprint(sourcePath, signal) !== manifest.sourceFingerprint) return undefined;
  const entries: StarMadeLodCacheEntry[] = [];
  for (const entry of manifest.entries) {
    const payload = await readPayload(directory, entry, signal);
    if (!payload) return undefined;
    entries.push({ key: entry.key, dependencyKey: entry.dependencyKey, payload, reused: true });
  }
  if (await sourceFingerprint(sourcePath, signal) !== manifest.sourceFingerprint) return undefined;
  return result(directory, manifest, entries);
}

/**
 * Builds a complete atomic snapshot. Segments with unchanged dependency keys are reused
 * even when another part of the SMD3 changed. The caller owns dependency completeness.
 * Generation files are immutable: concurrent readers keep a consistent old snapshot.
 * Superseded files are retained; removing this derived directory clears the cache.
 */
export async function buildStarMadeLodCache(options: StarMadeLodCacheOptions & {
  segments: readonly StarMadeLodCacheSegment[];
  /** Fingerprint captured before decoding; prevents publishing data from an older source snapshot. */
  expectedSourceFingerprint?: string;
}): Promise<StarMadeLodCacheResult> {
  const { sourcePath, configurationKey, segments, signal } = options;
  const keys = new Set<string>();
  for (const segment of segments) {
    if (keys.has(segment.key)) throw new Error(`Duplicate LOD segment key: ${segment.key}`);
    keys.add(segment.key);
  }
  const fingerprint = await sourceFingerprint(sourcePath, signal);
  if (options.expectedSourceFingerprint !== undefined && options.expectedSourceFingerprint !== fingerprint) {
    throw new Error('LOD source fingerprint no longer matches the decoded snapshot');
  }
  const directory = (await cacheDirectory(sourcePath, true, signal))!;
  const previous = await readManifest(directory, signal);
  const reusable = previous?.configurationKey === configurationKey ? previous.entries : [];
  const manifest: Manifest = { format: FORMAT, version: 1, sourceFingerprint: fingerprint, configurationKey, entries: [] };
  const entries: StarMadeLodCacheEntry[] = [];
  const created: string[] = [];
  try {
    for (const segment of segments) {
      signal?.throwIfAborted();
      const prior = reusable.find(entry => entry.key === segment.key && entry.dependencyKey === segment.dependencyKey);
      const cached = prior && await readPayload(directory, prior, signal);
      if (cached) {
        manifest.entries.push(prior);
        entries.push({ key: segment.key, dependencyKey: segment.dependencyKey, payload: cached, reused: true });
      } else {
        const built = await segment.build();
        if (!(built instanceof Uint8Array)) throw new Error('LOD segment builder must return Uint8Array');
        if (built.byteLength > MAX_PAYLOAD_BYTES) throw new RangeError('LOD segment payload exceeds 256 MiB');
        signal?.throwIfAborted();
        const payload = Buffer.from(built);
        const file = `${randomUUID()}.bin`;
        const path = join(directory, file);
        await writeNewFile(path, payload, created, signal);
        manifest.entries.push({ key: segment.key, dependencyKey: segment.dependencyKey, file, hash: hashBytes(payload) });
        entries.push({ key: segment.key, dependencyKey: segment.dependencyKey, payload, reused: false });
      }
    }
    const temporary = join(directory, `.manifest-${randomUUID()}.tmp`);
    await writeNewFile(temporary, JSON.stringify(manifest), created, signal);
    if (await sourceFingerprint(sourcePath, signal) !== fingerprint) throw new Error('LOD source changed during generation');
    signal?.throwIfAborted();
    // Recheck ownership before publishing; payload files cannot escape the managed directory.
    await cacheDirectory(sourcePath, false, signal);
    await rename(temporary, join(directory, MANIFEST));
    return result(directory, manifest, entries);
  } catch (error) {
    // Only names created by this call are removed. Existing cache/user files are untouched.
    for (const path of created) {
      try { await unlink(path); }
      catch (cleanupError) { if (!isMissing(cleanupError)) throw cleanupError; }
    }
    throw error;
  }
}
