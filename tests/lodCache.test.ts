import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildStarMadeLodCache, getStarMadeLodCacheDirectory, readStarMadeLodCache,
  type StarMadeLodCacheOptions, type StarMadeLodCacheSegment,
} from '../src/node/lodCache.js';

let root: string;
let options: StarMadeLodCacheOptions;
let directory: string;
const segment = (key = '0,0,0', dependencyKey = 'geometry-1', value = key): StarMadeLodCacheSegment => ({
  key, dependencyKey, build: () => new TextEncoder().encode(value),
});
const build = (segments = [segment()], extra: Partial<StarMadeLodCacheOptions> = {}) =>
  buildStarMadeLodCache({ ...options, ...extra, segments });
const manifest = async () => JSON.parse(await fs.readFile(join(directory, 'manifest.json'), 'utf8'));
const setManifest = async (value: unknown) => fs.writeFile(join(directory, 'manifest.json'), JSON.stringify(value));

// Deterministically simulate another process modifying a file at an IO boundary.
async function duringOpen(hook: (path: string) => Promise<void>, action: () => Promise<void>): Promise<void> {
  const original = fs.open;
  fs.open = async (...args: Parameters<typeof fs.open>) => { await hook(String(args[0])); return original(...args); };
  syncBuiltinESMExports();
  try { await action(); }
  finally { fs.open = original; syncBuiltinESMExports(); }
}

async function afterFirstStat(path: string, mutate: () => Promise<void>, action: () => Promise<void>): Promise<void> {
  const original = fs.open;
  fs.open = async (...args: Parameters<typeof fs.open>) => {
    const handle = await original(...args);
    if (String(args[0]) === path) {
      const stat = handle.stat.bind(handle);
      let first = true;
      handle.stat = (async (options: Parameters<typeof handle.stat>[0]) => {
        const value = await stat(options);
        if (first) { first = false; await mutate(); }
        return value;
      }) as typeof handle.stat;
    }
    return handle;
  };
  syncBuiltinESMExports();
  try { await action(); }
  finally { fs.open = original; syncBuiltinESMExports(); }
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'starmade-lod-cache-'));
  options = { sourcePath: join(root, 'entity.0.0.0.smd3'), configurationKey: 'generator-1/palette-a/cell-4' };
  await fs.writeFile(options.sourcePath, Buffer.from([1, 2, 3, 4]));
  directory = getStarMadeLodCacheDirectory(options.sourcePath);
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('SMD3 sidecar cache', () => {
  it('names the companion after the file stem and never modifies the source', async () => {
    expect(directory).toBe(join(root, 'entity.0.0.0'));
    expect(getStarMadeLodCacheDirectory(join(root, 'UPPER.SMD3'))).toBe(join(root, 'UPPER'));
    expect(() => getStarMadeLodCacheDirectory(join(root, 'entity.txt'))).toThrow(/smd3/);
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    const before = await fs.readFile(options.sourcePath);
    const created = await build([segment(), segment('32,0,0', 'geometry-2', 'mesh-two')]);
    expect(created).toMatchObject({ directory, configurationKey: options.configurationKey, built: 2, reused: 0 });
    expect(created.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readFile(options.sourcePath)).toEqual(before);
    const loaded = await readStarMadeLodCache(options);
    expect(loaded).toMatchObject({ built: 0, reused: 2 });
    expect(loaded!.entries.map(entry => Buffer.from(entry.payload).toString())).toEqual(['0,0,0', 'mesh-two']);
    const reused = await build([segment(), segment('32,0,0', 'geometry-2', 'wrong replacement')]);
    expect(reused).toMatchObject({ built: 0, reused: 2 });
    expect(Buffer.from(reused.entries[1].payload).toString()).toBe('mesh-two');
  });

  it('reuses unchanged dependencies after source changes and invalidates changed neighbours/configuration', async () => {
    await build([segment(), segment('32,0,0')]);
    const old = await manifest();
    await fs.writeFile(options.sourcePath, 'changed source');
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    const updated = await build([segment(), segment('32,0,0', 'new-neighbour', 'updated')]);
    expect(updated).toMatchObject({ reused: 1, built: 1 });
    expect(updated.sourceFingerprint).not.toBe(old.sourceFingerprint);
    expect(Buffer.from(updated.entries[1].payload).toString()).toBe('updated');
    expect(await readStarMadeLodCache({ ...options, configurationKey: 'new palette' })).toBeUndefined();
    expect(await build([segment()], { configurationKey: 'new palette' })).toMatchObject({ reused: 0, built: 1 });
    // Files referenced by old snapshots remain available to concurrent readers.
    expect(await fs.readFile(join(directory, old.entries[0].file), 'utf8')).toBe('0,0,0');
  });

  it('allows empty snapshots and protects duplicate segment keys before touching disk', async () => {
    await expect(build([segment(), segment()])).rejects.toThrow(/Duplicate/);
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    expect(await build([])).toMatchObject({ built: 0, reused: 0, entries: [] });
    expect(await readStarMadeLodCache(options)).toMatchObject({ entries: [] });
  });

  it('requires the fingerprint captured before decoding when supplied', async () => {
    await expect(buildStarMadeLodCache({ ...options, segments: [segment()], expectedSourceFingerprint: 'old' }))
      .rejects.toThrow(/decoded snapshot/);
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    const first = await build();
    expect(await buildStarMadeLodCache({ ...options, segments: [segment()], expectedSourceFingerprint: first.sourceFingerprint }))
      .toMatchObject({ reused: 1 });
  });

  it('rejects unowned directories, files and symbolic links without changing them', async () => {
    await fs.mkdir(directory);
    await fs.writeFile(join(directory, 'personal.txt'), 'keep');
    await expect(build()).rejects.toThrow(/not owned/);
    expect(await fs.readFile(join(directory, 'personal.txt'), 'utf8')).toBe('keep');
    await fs.rm(directory, { recursive: true });
    await fs.writeFile(directory, 'keep file');
    await expect(build()).rejects.toThrow(/directory/);
    expect(await fs.readFile(directory, 'utf8')).toBe('keep file');
    await fs.unlink(directory);
    const target = join(root, 'foreign');
    await fs.mkdir(target);
    await fs.symlink(target, directory);
    await expect(readStarMadeLodCache(options)).rejects.toThrow(/symlink/);
    expect(await fs.readdir(target)).toEqual([]);
    await fs.unlink(directory);
    await fs.mkdir(directory);
    await fs.writeFile(join(directory, '.starmade-3d-lod'), 'other application');
    await expect(build()).rejects.toThrow(/not owned/);
  });

  it('requires regular source files and reports IO failures rather than treating them as a cache miss', async () => {
    await fs.unlink(options.sourcePath);
    await fs.symlink(join(root, 'missing'), options.sourcePath);
    await expect(build()).rejects.toThrow(/regular file/);
    await fs.unlink(options.sourcePath);
    await fs.mkdir(options.sourcePath);
    await expect(build()).rejects.toThrow(/regular file/);
    await fs.rmdir(options.sourcePath);
    await expect(build()).rejects.toThrow(/ENOENT/);
    const bad = join(root, 'file');
    await fs.writeFile(bad, 'a');
    await expect(readStarMadeLodCache({ ...options, sourcePath: join(bad, 'child.smd3') })).rejects.toThrow(/ENOTDIR/);
  });

  it('rejects symbolic links for every cache input and non-regular manifests', async () => {
    await build();
    const current = await manifest();
    const target = join(root, 'foreign');
    await fs.writeFile(target, 'preserve');
    for (const filename of ['.starmade-3d-lod', 'manifest.json', current.entries[0].file]) {
      const path = join(directory, filename);
      const original = await fs.readFile(path);
      await fs.unlink(path);
      await fs.symlink(target, path);
      await expect(readStarMadeLodCache(options)).rejects.toThrow(/ELOOP/);
      await fs.unlink(path);
      await fs.writeFile(path, original);
    }
    await fs.unlink(join(directory, 'manifest.json'));
    await fs.mkdir(join(directory, 'manifest.json'));
    await expect(readStarMadeLodCache(options)).rejects.toThrow(/regular file/);
    expect(await fs.readFile(target, 'utf8')).toBe('preserve');
  });

  it('bounds input sizes and rejects corruption without exposing unchecked bytes', async () => {
    await build();
    const current = await manifest();
    const payload = join(directory, current.entries[0].file);
    await fs.writeFile(payload, 'tampered');
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    expect(await build()).toMatchObject({ built: 1 });
    const repaired = await manifest();
    await fs.unlink(join(directory, repaired.entries[0].file));
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    expect(await build()).toMatchObject({ built: 1 });
    const huge = join(directory, (await manifest()).entries[0].file);
    await fs.truncate(huge, 256 * 1024 * 1024 + 1);
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    await fs.truncate(join(directory, 'manifest.json'), 16 * 1024 * 1024 + 1);
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    await fs.writeFile(join(directory, '.starmade-3d-lod'), 'x'.repeat(65));
    await expect(readStarMadeLodCache(options)).rejects.toThrow(/not owned/);
  });

  it('treats malformed and unsafe manifests as misses', async () => {
    await build();
    const valid = await manifest();
    const entry = valid.entries[0];
    for (const invalid of [null, false, {}, { ...valid, format: 'other' }, { ...valid, version: 2 },
      { ...valid, sourceFingerprint: 0 }, { ...valid, sourceFingerprint: 'not a digest' },
      { ...valid, configurationKey: null }, { ...valid, entries: {} },
      ...[null, {}, { ...entry, key: 1 }, { ...entry, dependencyKey: false },
        { ...entry, file: 0 }, { ...entry, file: '../foreign' }, { ...entry, hash: 0 }, { ...entry, hash: 'bad' },
      ].map(bad => ({ ...valid, entries: [bad] })), { ...valid, entries: [entry, entry] }]) {
      await setManifest(invalid);
      expect(await readStarMadeLodCache(options)).toBeUndefined();
    }
    await fs.writeFile(join(directory, 'manifest.json'), '{invalid JSON');
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    await fs.unlink(join(directory, 'manifest.json'));
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    expect(await build()).toMatchObject({ built: 1 });
  });

  it('keeps the previous manifest when a builder fails, source changes, or returned data is invalid', async () => {
    await build();
    await fs.writeFile(join(directory, 'personal.txt'), 'keep');
    const before = await fs.readFile(join(directory, 'manifest.json'));
    const files = (await fs.readdir(directory)).sort();
    await expect(build([segment('new'), { ...segment('throws'), build() { throw new Error('generator failed'); } }]))
      .rejects.toThrow('generator failed');
    expect((await fs.readdir(directory)).sort()).toEqual(files);
    await expect(build([{ ...segment('bad'), build: () => 'invalid' as unknown as Uint8Array }]))
      .rejects.toThrow(/Uint8Array/);
    await expect(build([{ ...segment('new'), async build() {
      await fs.writeFile(options.sourcePath, 'changed during build');
      return new Uint8Array([1]);
    } }])).rejects.toThrow(/source changed during generation/);
    expect(await fs.readFile(join(directory, 'manifest.json'))).toEqual(before);
    expect((await fs.readdir(directory)).sort()).toEqual(files);
    expect(await fs.readFile(join(directory, 'personal.txt'), 'utf8')).toBe('keep');
  });

  it('honours cancellation before work and after generation without publishing a partial snapshot', async () => {
    const aborted = AbortSignal.abort(new Error('stop immediately'));
    await expect(build([], { signal: aborted })).rejects.toThrow('stop immediately');
    await expect(readStarMadeLodCache({ ...options, signal: aborted })).rejects.toThrow('stop immediately');
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    const controller = new AbortController();
    await expect(build([{ ...segment(), build() { controller.abort(); return new Uint8Array(); } }], {
      signal: controller.signal,
    })).rejects.toThrow(/abort/i);
    expect((await fs.readdir(directory))).toEqual(['.starmade-3d-lod']);
    const active = new AbortController();
    expect(await build([segment()], { signal: active.signal })).toMatchObject({ built: 1 });
    expect(await readStarMadeLodCache({ ...options, signal: active.signal })).toMatchObject({ reused: 1 });
  });

  it('leaves a recoverable owned directory if cancelled immediately after its creation', async () => {
    const controller = new AbortController();
    const original = fs.mkdir;
    fs.mkdir = (async (...args: Parameters<typeof fs.mkdir>) => {
      const value = await original(...args);
      if (String(args[0]) === directory) controller.abort();
      return value;
    }) as typeof fs.mkdir;
    syncBuiltinESMExports();
    try { await expect(build([segment()], { signal: controller.signal })).rejects.toThrow(/abort/i); }
    finally { fs.mkdir = original; syncBuiltinESMExports(); }
    expect(await fs.readFile(join(directory, '.starmade-3d-lod'), 'utf8')).toBe('starmade-3d-lod-cache');
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    expect(await build()).toMatchObject({ built: 1 });
  });

  it('rejects generated payloads larger than the readable per-segment limit', async () => {
    await expect(build([{ ...segment(), build: () => new Uint8Array(256 * 1024 * 1024 + 1) }]))
      .rejects.toThrow(/exceeds 256 MiB/);
    expect(await readStarMadeLodCache(options)).toBeUndefined();
  });

  it('publishes complete snapshots with concurrent generators and preserves existing readers', async () => {
    await build();
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const slow = build([{ ...segment('slow'), async build() { started(); await gate; return new Uint8Array([7]); } }]);
    await ready;
    expect((await readStarMadeLodCache(options))!.entries[0].key).toBe('0,0,0');
    const fast = await build([segment('fast'), segment('fast-2')]);
    expect((await readStarMadeLodCache(options))!.entries.map(entry => entry.key)).toEqual(['fast', 'fast-2']);
    release();
    await slow;
    expect((await readStarMadeLodCache(options))!.entries.map(entry => entry.key)).toEqual(['slow']);
    expect(fast.entries).toHaveLength(2);
    expect((await fs.readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('rechecks source identity after loading payloads', async () => {
    await build();
    await duringOpen(async path => {
      if (path.endsWith('.bin')) await fs.writeFile(options.sourcePath, 'new server revision');
    }, async () => { expect(await readStarMadeLodCache(options)).toBeUndefined(); });
  });

  it('rejects a source modified during fingerprinting before creating any cache files', async () => {
    await afterFirstStat(options.sourcePath, async () => { await fs.appendFile(options.sourcePath, 'changed'); }, async () => {
      await expect(build()).rejects.toThrow(/changed while hashing/);
    });
    expect(await readStarMadeLodCache(options)).toBeUndefined();
  });

  it('detects a server replacing the source inode while the old file descriptor is being hashed', async () => {
    await afterFirstStat(options.sourcePath, async () => {
      await fs.rename(options.sourcePath, join(root, 'previous.smd3'));
      await fs.writeFile(options.sourcePath, 'replacement');
    }, async () => { await expect(build()).rejects.toThrow(/changed while hashing/); });
    expect(await readStarMadeLodCache(options)).toBeUndefined();
    expect(await fs.readFile(options.sourcePath, 'utf8')).toBe('replacement');
  });

  it('bounds reads even if a cache file grows after its initial size check', async () => {
    await build();
    const marker = join(directory, '.starmade-3d-lod');
    await afterFirstStat(marker, async () => { await fs.writeFile(marker, 'x'.repeat(4096)); }, async () => {
      await expect(readStarMadeLodCache(options)).rejects.toThrow(/not owned/);
    });
  });

  it('cleans only owned generation files even when another process removed one', async () => {
    await build();
    const oldFiles = await fs.readdir(directory);
    await expect(build([segment('new'), { ...segment('throws'), async build() {
      for (const file of await fs.readdir(directory)) if (!oldFiles.includes(file)) await fs.unlink(join(directory, file));
      throw new Error('external deletion');
    } }])).rejects.toThrow('external deletion');
    expect((await fs.readdir(directory)).sort()).toEqual(oldFiles.sort());
  });

  it('surfaces a cleanup IO failure instead of deleting unexpected directories', async () => {
    await build();
    const oldFiles = await fs.readdir(directory);
    await expect(build([segment('new'), { ...segment('throws'), async build() {
      const file = (await fs.readdir(directory)).find(name => !oldFiles.includes(name))!;
      await fs.unlink(join(directory, file));
      await fs.mkdir(join(directory, file));
      throw new Error('generator failed');
    } }])).rejects.toThrow(/EISDIR/);
    expect((await readStarMadeLodCache(options))!.entries[0].key).toBe('0,0,0');
  });
});
