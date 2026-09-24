# Persistent blueprint LOD previews

These derived previews reduce geometry, texture transfer and lighting work before
the native renderer is ready. They are distinct from StarMade's per-block model
LODs. Original SMD3 files remain the source of truth.

## Storage

The companion directory has the SMD3 filename **without its extension**:

```text
blueprints/My Ship/DATA/
  My Ship.0.0.0.smd3
  My Ship.0.0.0/
    .starmade-3d-lod
    manifest.json
    <generation UUID>.bin

server-database/world0/DATA/
  ENTITY_SHIP_example.0.0.0.smd3
  ENTITY_SHIP_example.0.0.0/
    .starmade-3d-lod
    manifest.json
    <generation UUID>.bin
```

Attachments use their own companion directories under `ATTACHED_N/DATA`.
No SMD3 bytes, names or game metadata are changed. The Decoder skips these
directories because their names do not end in `.smd3`.

Manifest version 1 records the source SHA-256, configuration identity and each
entry's dependency identity and payload SHA-256. Entries are per segment and
resolution (1, 2 or 4 blocks per cell), plus hierarchy metadata. Payloads are
opaque bytes to the Node cache API; the example encodes mesh arrays as UTF-8 JSON.
The HTTP example sends only the requested resolution, compressed with gzip.

Writes publish a new manifest atomically after immutable payloads are complete.
Source changes during generation abort publication. Readers reject stale or
corrupt caches. Existing unmarked directories and symbolic links are refused.
Old payloads remain readable by concurrent readers; they are not automatically
garbage-collected. With readers and generation stopped, deleting only a managed
companion directory discards that cache and permits regeneration.

## Generate from the repository

With the pinned Decoder built, Node 22.16+, ImageMagick and unzip installed:

```sh
STARMADE_DIR=/path/to/StarMade npm run lod:prepare -- "/path/to/blueprints/My Ship"
STARMADE_DIR=/path/to/StarMade npm run lod:prepare -- "/path/to/server-database/world0/DATA/ENTITY_SHIP_example.0.0.0.smd3"
```

The account needs write access to the source's parent directory. Generation is
explicit; viewing pages performs read-only cache access. Missing or stale caches
fall back to normal streaming on `/isanth.html`. `/isanth-lod.html` displays only
the prepared cache and reports failure if it is unavailable. No cache is generated
as a side effect of an HTTP request.

The command accepts a blueprint folder (recursive dockings) or a single SMD3
region. Server-database batch discovery and entity metadata assembly belong to
the host; an isolated region has an identity transform. Compressed `.sment`
archives must first be extracted by the host. This command is repository tooling,
not an executable installed by the npm package.

Cold generation decodes the blueprint and averages local texture atlases. Warm
reading verifies source/resource hashes and reads cached meshes without decoding
SMD3, parsing BlockConfig, decoding images or loading native shaders. Repeating
the generation command still decodes sources to compare per-segment dependencies,
but reuses unchanged mesh payloads.

The example invalidates caches when SMD3 content, blueprint metadata, block
configuration, the orientation table, color atlases or generator settings change.
An edited segment also invalidates its face neighbours. Other SMD3 files of the
same entity conservatively invalidate the region's configuration, so cross-file
changes may rebuild more meshes than strictly necessary. A host can implement
finer dependency keys using the Node API. Do not edit game assets concurrently
with generation; snapshot checks detect observed changes, not a filesystem-wide
transaction.

## Library APIs

The browser entry exposes `createStarMadeBlueprintLod` and
`createStarMadeBlueprintLodScene`. Filesystem code is available separately from
`starmade-3d/node`, keeping Node imports out of browser applications.

```ts
import { createStarMadeBlueprintLod, createStarMadeBlueprintLodScene } from 'starmade-3d';
import { buildStarMadeLodCache, readStarMadeLodCache } from 'starmade-3d/node';

const mesh = createStarMadeBlueprintLod({
  segments,                 // SegmentDataLike[], entity-local coordinates
  neighborSegments,         // adjacent geometry for culling, not emitted
  cellSize: 2,
  palette: blockType => palette.get(blockType)
});
const cache = await buildStarMadeLodCache({
  sourcePath: '/data/ship.0.0.0.smd3',
  configurationKey: generatorAndAssetsHash,
  expectedSourceFingerprint: hashBeforeDecoding,
  segments: [{
    key: '0,0,0/lod2',
    dependencyKey: segmentAndNeighbourHash,
    build: () => new TextEncoder().encode(JSON.stringify(mesh))
  }],
  signal
});
const cached = await readStarMadeLodCache({
  sourcePath: '/data/ship.0.0.0.smd3', configurationKey: generatorAndAssetsHash, signal
}); // undefined means absent, stale or corrupt; IO/ownership errors throw
```

Supply linear RGB `color`, optional linear RGB `emission`, and optional `group`
from the host's palette. Equal visual groups allow adjacent faces to merge.
The host owns decoding, fingerprints, palette resources and transport. Include
all geometry-affecting neighbours/settings in the dependency and configuration
keys, and capture `expectedSourceFingerprint` before decoding to prevent pairing
old decoded geometry with a newer source file.

```ts
const view = createStarMadeBlueprintLodScene({
  entities: [{ id: 'ship', transform: localMatrix.toArray() }],
  regions: [{ entityId: 'ship', cellSize: 2, mesh }]
}, { distances: [0, 128, 512] });
scene.add(view.root);
view.update(camera); // each frame after camera/entity movement
view.dispose();      // owned geometry/material only; idempotent
```

Provide `parentId` and local matrices for arbitrarily deep attachments. The
repository preparation script resolves saved rail poses using the inspection API
and preserves fallback diagnostics on each entity. Supply several resolutions
to enable automatic distance selection (10% hysteresis); supplying one resolution
keeps it visible at all distances. The demo requests resolution 2 only.

## Rendering limits

Greedy merging removes internal faces and joins equal coplanar rectangles.
Coarse cells use the most represented visual material with deterministic ties.
All occupied blocks become opaque cubes, including wedges, slabs, glass and
native models. Thin details can grow or disappear into neighbouring cells.
Color is averaged over the block's face textures: no UV/detail textures or
transparent surfaces are retained.

One shader uses a global sun, a small ambient term and self-emission. It does
not propagate local block lights or render shadow maps. Display text, animated
textures, block picking and native material fidelity require the detailed scene.
LOD geometry is an approximation and must not serve as authoritative collision,
functional mapping or editing data. The Isanth page replaces it with the streamed
native preview, then the final native rendering.

## Validation

`npm run coverage:check` enforces 100% lines, branches and functions per runtime
module, including the generator, viewer and Node cache. GPU and real-source
recipes remain separate: `npm run test:lod` and `npm run test:isanth:views`.
`npm run test:lod:host` uses synthetic fixtures and ImageMagick; it needs no game installation.
The LOD recipe captures four views, checks browser errors and transfer/first-frame
budgets, and rejects requests for native textures, shaders or configuration.

Measured locally on 2026-09-24 with Node 22.16 and Chromium/SwiftShader:

| Check | Result |
|---|---|
| Isanth generation | 2 entities, 4 segments, 14 cache entries; 3.69 s |
| Isanth triangles, cell sizes 1 / 2 / 4 | 3,292 / 800 / 330 |
| Repeated generation | 14 reused entries, 0 rebuilt |
| Warm host read | 204 ms, including integrity checks |
| Resolution-2 HTTP mesh payload | 9,791 bytes gzip; 4 draw calls |
| Cache fetch through first render | 555 ms after module/renderer initialization |
| Navigation through ready | 1.24 s, fresh Chromium test profile, warm server cache |
| Server-database fixture | 3,794 source blocks; 6,934 / 1,604 / 454 triangles |
| Original file integrity | All 3 exercised SMD3 SHA-256 values unchanged |
| Runtime CPU gate | 55 modules, 100% lines / branches / functions |
| Tests | 843 unit/integration, 43 tooling, 4 synthetic host tests passed |
| Package consumer | Browser and Node subpath imports/types passed |
| Browser rendering | Four LOD views without errors; four final native views pixel-identical to the prior shader-warmup reference |

These are local measurements, not client-device guarantees. The short first-render
measurement excludes navigation, module loading and WebGL context initialization;
the browser report records navigation-to-ready separately. Raw receipts, integrity
hashes and images are under `validation/blueprint-lod/`, with the blocking runtime
coverage report in `coverage/REPORT.md`.

The disposable Chromium profile uses a basic password store to avoid an unrelated
25-second desktop-keyring timeout before its first HTTP request. This changes only
the browser test harness, not the application or the user's browser settings.
