import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { BlockConfig, BlueprintHeader, emptySegment, emptySmd3File, setBlock, writeSmd3, writeSmbph, writeSmbpm } from 'starmade-decoder';
import { prepareBlueprintLod, readBlueprintLod } from './lod/prepare.mjs';

// Synthetic game resources: no game textures or blueprint data are copied into the repository.
function png(red, green, blue) {
  function chunk(type, data) {
    const input = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of input) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const prefix = Buffer.alloc(4), suffix = Buffer.alloc(4);
    prefix.writeUInt32BE(data.length); suffix.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([prefix, input, suffix]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(16); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(16 * 49);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pixels.set([red, green, blue], y * 49 + 1 + x * 3);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

function region(two = false) {
  const segment = emptySegment();
  setBlock(segment, 16, 16, 16, { type: 1, hp: 100, active: true, orientation: 0 });
  if (two) setBlock(segment, 17, 16, 16, { type: 1, hp: 100, active: true, orientation: 0 });
  return writeSmd3({ ...emptySmd3File(), segments: [segment] });
}

function docking(offset) {
  return writeSmbpm({ metaVersion: 2, manager: null,
    dockingEntries: [{ name: 'ATTACHED_0', posX: offset[0] + 16, posY: offset[1] + 16, posZ: offset[2] + 16,
      sizeX: 1, sizeY: 1, sizeZ: 1, style: 0, orientation: 0, offset: { x: offset[0], y: offset[1], z: offset[2] } }],
    railRootMin: null, railRootMax: null, wirelessMarkers: [], railChildren: [], childTransforms: [],
    aiConfig: null, railDockerPieces: [], cargoPoints: [], lockBoxPoints: [], thrustConfig: null });
}

async function fixture() {
  const directory = await mkdtemp('/tmp/starmade-lod-host-test-');
  const starmadeRoot = join(directory, 'game'), blueprint = join(directory, 'Ship');
  const config = join(starmadeRoot, 'data/config/BlockConfig.xml');
  const texture = join(starmadeRoot, 'data/textures/block/Default/64/t000.png');
  const put = async (path, bytes) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); };
  await put(config, '<Config><Block type="1" name="Hull" icon="0" textureId="0"><Hitpoints>100</Hitpoints></Block></Config>');
  await put(join(starmadeRoot, 'data/config/BlockTypes.properties'), '');
  const normals = Buffer.alloc(36); normals.writeFloatBE(1, 0); normals.writeFloatBE(1, 16); normals.writeFloatBE(1, 32);
  await put(join(starmadeRoot, 'data/IcoVectors.bin'), normals);
  for (const layer of [0, 1, 2, 3]) await put(join(starmadeRoot, `data/textures/block/Default/64/t00${layer}.png`), png(255, 0, 0));
  await put(join(starmadeRoot, 'data/textures/customTemplates/64/custom.png'), png(0, 255, 0));
  const sources = [];
  for (const entity of ['', 'ATTACHED_0', 'ATTACHED_0/ATTACHED_0']) {
    const folder = join(blueprint, entity), source = join(folder, 'DATA/region.0.0.0.smd3');
    await put(source, region()); sources.push(source);
    await put(join(folder, 'header.smbph'), writeSmbph(new BlueprintHeader({ headerVersion: 5, entityType: 'SHIP',
      boundingBox: { minX: 0, minY: 0, minZ: 0, maxX: 31, maxY: 31, maxZ: 31 },
      blockCountByType: [{ type: 1, count: 1 }], totalBlockCount: 1 })));
  }
  await put(join(blueprint, 'meta.smbpm'), docking([8, 2, -4]));
  await put(join(blueprint, 'ATTACHED_0/meta.smbpm'), docking([-3, 5, 7]));
  return { directory, blueprint, starmadeRoot, sources, config, texture,
    options: { starmadeRoot }, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('host prepares all LOD levels beside SMD3, preserves nested docks and reads warm without image/config processing', async () => {
  const f = await fixture();
  try {
    const originals = await Promise.all(f.sources.map(path => readFile(path)));
    assert.equal(await readBlueprintLod(f.blueprint, f.options), undefined);
    const generated = await prepareBlueprintLod(f.blueprint, f.options);
    assert.equal(generated.schema, 1);
    assert.deepEqual(generated.cache, { regions: 3, reused: 0, built: 12 });
    assert.equal(generated.regions.length, 9);
    assert.deepEqual(generated.entities.map(entity => [entity.id, entity.parentId ?? null, entity.transform.slice(12, 15)]), [
      ['Ship', null, [0, 0, 0]], ['Ship/ATTACHED_0', 'Ship', [8, 2, -4]],
      ['Ship/ATTACHED_0/ATTACHED_0', 'Ship/ATTACHED_0', [-3, 5, 7]]
    ]);
    for (let i = 0; i < f.sources.length; i++) {
      assert.deepEqual(await readFile(f.sources[i]), originals[i], 'SMD3 source changed');
      assert.ok((await readdir(f.sources[i].slice(0, -5))).includes('manifest.json'));
    }
    for (const record of generated.regions) {
      assert.equal(record.mesh.sourceBlockCount, 1);
      assert.equal(record.mesh.triangleCount, 12);
      assert.deepEqual(record.mesh.colors.slice(0, 3), [1, 0, 0]);
    }
    const originalPath = process.env.PATH;
    const load = mock.method(BlockConfig, 'load', () => { throw Error('Warm path parsed BlockConfig'); });
    let warm;
    try { process.env.PATH = '/missing-lod-test-executables'; warm = await readBlueprintLod(f.blueprint, f.options); }
    finally { process.env.PATH = originalPath; load.mock.restore(); }
    assert.equal(load.mock.callCount(), 0);
    assert.deepEqual(warm.entities, generated.entities);
    assert.deepEqual(warm.regions, generated.regions);
    assert.deepEqual(warm.cache, { regions: 3, reused: 12, built: 0 });
  } finally { await f.cleanup(); }
});

test('source changes invalidate the snapshot but reuse unchanged entity meshes', async () => {
  const f = await fixture();
  try {
    await prepareBlueprintLod(f.blueprint, f.options);
    await writeFile(f.sources[0], region(true));
    assert.equal(await readBlueprintLod(f.blueprint, f.options), undefined);
    const rebuilt = await prepareBlueprintLod(f.blueprint, f.options);
    assert.deepEqual(rebuilt.cache, { regions: 3, reused: 6, built: 6 });
    assert.equal(rebuilt.regions.find(value => value.entityId === 'Ship' && value.cellSize === 1).mesh.sourceBlockCount, 2);
    assert.equal((await readBlueprintLod(f.blueprint, f.options)).cache.built, 0);
  } finally { await f.cleanup(); }
});

test('configuration, atlas and docking metadata changes invalidate generated previews', async () => {
  const f = await fixture();
  try {
    await prepareBlueprintLod(f.blueprint, f.options);
    const config = await readFile(f.config);
    await writeFile(f.config, Buffer.concat([config, Buffer.from('\n')]));
    assert.equal(await readBlueprintLod(f.blueprint, f.options), undefined);
    await writeFile(f.config, config);
    assert.ok(await readBlueprintLod(f.blueprint, f.options));
    const texture = await readFile(f.texture);
    await writeFile(f.texture, png(0, 0, 255));
    assert.equal(await readBlueprintLod(f.blueprint, f.options), undefined);
    await writeFile(f.texture, texture);
    await writeFile(join(f.blueprint, 'meta.smbpm'), docking([9, 2, -4]));
    assert.equal(await readBlueprintLod(f.blueprint, f.options), undefined);
    const updated = await prepareBlueprintLod(f.blueprint, f.options);
    assert.deepEqual(updated.entities[1].transform.slice(12, 15), [9, 2, -4]);
    assert.equal(updated.cache.reused, 0);
  } finally { await f.cleanup(); }
});

test('loose server-database SMD3 uses the same sidecar contract and refuses symlink sources', async () => {
  const f = await fixture();
  try {
    const source = f.sources[0], before = await readFile(source);
    const generated = await prepareBlueprintLod(source, f.options);
    assert.equal(generated.entities.length, 1);
    assert.equal(generated.regions.length, 3);
    assert.deepEqual(generated.cache, { regions: 1, reused: 0, built: 4 });
    assert.deepEqual((await readBlueprintLod(source, f.options)).regions, generated.regions);
    assert.deepEqual(await readFile(source), before);
    const link = join(f.directory, 'linked.smd3'); await symlink(source, link);
    await assert.rejects(prepareBlueprintLod(link, f.options), /symlink/);
  } finally { await f.cleanup(); }
});
