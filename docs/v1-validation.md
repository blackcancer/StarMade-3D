# Qualification 1.0.0

Executed on 23 September 2026, directly in the project checkout. The complete
`release:qualify` sequence passed all nine required commands, with source SHA-256
fingerprints unchanged between its beginning and end. The release includes a
machine-readable qualification manifest. Raw game assets and browser bundles are
kept locally and are not distributed.

## Results

| Requirement | Measured result |
|---|---|
| TypeScript project check | PASS |
| Tooling assertions | 40 passed, none skipped |
| Runtime unit assertions | 763 passed; repeated against built modules for coverage |
| Pinned real Decoder integration | 3 passed |
| Installed game assets | 12 passed |
| Per-module runtime coverage | 46 modules; 11,168/11,168 lines, 3,783/3,783 V8 branches, 814/814 functions |
| Software WebGL regressions | 41 passed |
| Actual main entry | 17 passed, 331 HTTP resources loaded |
| Actual inspection entry | 20 passed, including three-level docking fixture and real Isanth |
| Isanth cameras | Overview, front, slabs and inner captures; no runtime exceptions |
| npm archive consumer | ESM execution and strict TypeScript compilation, without skipLibCheck, passed |
| Runtime dependency audit | `npm audit --omit=dev` passed |

The installed game qualification ran from **2026-09-23T00:56:28.345Z** to **2026-09-23T01:02:40.762Z** (UTC).
Node 22.16.0, Three.js 0.164.1, Chromium 153.0.8010.12 and ANGLE/SwiftShader
were used. The initial concurrent main-page attempt timed out; the complete
sequential release run passed with the original assertions and timeouts unchanged.

Main-page assertions verify material RGBA preservation through HTTP/GPU loading,
floating-point shadow depth, nearest raw-depth sampling, colored lamp coordinates,
shared floor corners, animation and absence of WebGL errors. The GPU fixture covers
lighting, occlusion, emission, LOD directionality and shadow filtering. Manual review
of the captured main surfaces and Isanth front/slabs found no recurrence of the
reported speckled faces. These results do **not** establish full native-client pixel
parity or test every camera, hardware driver and future shader corpus.

## External reference provenance

- Decoder 2.0.0: `4cb21bd72258c87eb8115f90449a8334c34658a6`.
- StarMade-Open: `decf3a1990f29b9505041f122188bf19489bcf7e`.
- Installed shader corpus: 236 files; digest `01f2838633f8174cd8696178ba5eaea01c150cb9834038c8549ee0aa7db17365`.
- Pinned source shader corpus: 246 files; digest `72f93bb6f70de40dcfd2514caa0a46526c9a2090060cc23c1fe992f43eed5249`; the 41 GPU regressions also passed with this external corpus.

Corpus digests use SHA-256 over sorted relative POSIX path, NUL, file bytes, NUL
for every file under `data/shader`. They identify inputs without redistributing them.
The package starts with an empty shader registry. Registration, fetch failure,
cancellation and atomic replacement are covered by runtime tests. See [assets](assets.md).

CI obtains the pinned private reference through `STARMADE_REFERENCE_TOKEN` and
runs code, coverage, package, performance and GPU checks. Fork pull requests need
a trusted maintainer run for that reference. CI does not replace the installed-game
release recipes. No unavailable input is reported as a passing recipe.

## CPU performance budgets

Measured on Intel Core Processor (Haswell, no TSX). These are CPU logical-document,
meshing and synchronization measurements, not rendering frame-rate guarantees.
Peak RSS: 452.5 MiB, below the 1.5 GiB budget. Incremental per-cell sync also asserts
at most 27 rebuilt cells for the tested one-cell edit and exact disposal accounting.

| Operation | Measured ms | Blocking budget ms |
|---|---:|---:|
| document 4096 cells | 25.1 | 5000 |
| 10000 indexed lookups in 4096 | 22.7 | 1000 |
| snapshot edit in 4096 | 38.9 | 5000 |
| native segment meshing 4096 | 149.6 | 15000 |
| per-cell scene initial 4096 | 252.1 | 5000 |
| per-cell scene incremental 4096 | 46.6 | 1000 |
| document 32768 cells | 142.6 | 5000 |
| 10000 indexed lookups in 32768 | 13.7 | 1000 |
| snapshot edit in 32768 | 264.1 | 5000 |
| native segment meshing 32768 | 328.0 | 15000 |
| document 262144 cells | 1739.4 | 5000 |
| 10000 indexed lookups in 262144 | 13.1 | 1000 |
| snapshot edit in 262144 | 1826.5 | 5000 |
| native segment meshing 262144 | 1626.4 | 15000 |

## Accepted scope and limits

Rendering and inspection are the library scope; application UI, editor commands,
persistence, undo/redo, physics, network state and gameplay simulation belong to
consumers. Functional colors are optional presentation choices. Saved controller
links do not imply simulated effectiveness, power or damage.

Static saved NORMAL24/core rail poses are interpreted, including nested entity
composition. Missing or unsupported metadata produces an attachment-offset fallback
diagnostic. Native voxel block-light helpers support translated entities; arbitrary
rotating/moving assemblies require a host-provided appropriate lighting field.
PNG is a rendered snapshot. glTF/GLB reports shader approximation and current-pose
animation limitations. See [API stability](api-stability.md) and [inspection contracts](inspection-api.md).

Full client framebuffer parity, universal affine voxelization and game simulation
are not certified by these passing tests. CPU coverage counts JavaScript control
flow; it does not measure GPU GLSL branch execution. Intentional lighting changes
from the native shaders are retained and documented in the historical rendering
reports and changelog.

## Reproduce and enforce

With the pinned references built, the user's game installation available and the
example service running (or `STARMADE_ISANTH_URL` set to an equivalent local example):

```sh
STARMADE_DIR=/path/to/StarMade CHROMIUM_PATH=/path/to/chromium npm run release:qualify
npm run release:check
```

`release:qualify` writes command logs and an input fingerprint manifest locally.
`release:check` rejects missing/failed proofs, changed sources, non-100% coverage,
missing browser/package/performance results or an unfinished report. Publication
uses the validated npm-compatible `.tgz` attached to GitHub, as with Decoder;
this is not a publication on npmjs.org.

## Per-file coverage evidence

| Runtime module | Lines | V8 branches | Functions |
|---|---:|---:|---:|
| dist/geometry/blockLightGeometry.js | 189/189 | 51/51 | 11/11 |
| dist/geometry/cube.js | 90/90 | 18/18 | 6/6 |
| dist/geometry/segment.js | 453/453 | 190/190 | 40/40 |
| dist/geometry/starmadeEncodedCube.js | 1352/1352 | 573/573 | 46/46 |
| dist/index.js | 30/30 | 1/1 | 0/0 |
| dist/inspection/analysis.js | 103/103 | 69/69 | 14/14 |
| dist/inspection/blueprint.js | 87/87 | 73/73 | 20/20 |
| dist/inspection/export.js | 59/59 | 21/21 | 4/4 |
| dist/inspection/functional.js | 99/99 | 45/45 | 8/8 |
| dist/inspection/highlight.js | 55/55 | 10/10 | 5/5 |
| dist/inspection/model.js | 138/138 | 84/84 | 23/23 |
| dist/inspection/picking.js | 60/60 | 34/34 | 16/16 |
| dist/inspection/resources.js | 82/82 | 41/41 | 14/14 |
| dist/inspection/segmentAdapter.js | 39/39 | 15/15 | 4/4 |
| dist/inspection/spatial.js | 74/74 | 37/37 | 9/9 |
| dist/inspection/sync.js | 106/106 | 44/44 | 9/9 |
| dist/shaders/blockMaterial.js | 143/143 | 23/23 | 4/4 |
| dist/shaders/compat.js | 314/314 | 123/123 | 30/30 |
| dist/shaders/compatibility.js | 62/62 | 22/22 | 10/10 |
| dist/shaders/cubeShaderMaterial.js | 1295/1295 | 404/404 | 73/73 |
| dist/shaders/effectsMaterials.js | 335/335 | 12/12 | 6/6 |
| dist/shaders/gpuValidation.js | 206/206 | 45/45 | 8/8 |
| dist/shaders/index.js | 14/14 | 1/1 | 0/0 |
| dist/shaders/inspect.js | 108/108 | 27/27 | 5/5 |
| dist/shaders/outlineMaterial.js | 103/103 | 11/11 | 2/2 |
| dist/shaders/preprocess.js | 139/139 | 62/62 | 13/13 |
| dist/shaders/programs.js | 98/98 | 3/3 | 2/2 |
| dist/shaders/selectionMaterial.js | 105/105 | 5/5 | 3/3 |
| dist/shaders/shadowPipeline.js | 524/524 | 175/175 | 53/53 |
| dist/shaders/shadowShaderTransform.js | 212/212 | 15/15 | 4/4 |
| dist/shaders/sources.js | 24/24 | 16/16 | 2/2 |
| dist/starmade/atlas.js | 80/80 | 32/32 | 6/6 |
| dist/starmade/blockConfig.js | 269/269 | 153/153 | 23/23 |
| dist/starmade/blockLighting.js | 1318/1318 | 564/564 | 118/118 |
| dist/starmade/blockLightScene.js | 135/135 | 31/31 | 16/16 |
| dist/starmade/docking.js | 47/47 | 32/32 | 5/5 |
| dist/starmade/lodInstancing.js | 479/479 | 164/164 | 35/35 |
| dist/starmade/lodModels.js | 45/45 | 12/12 | 6/6 |
| dist/starmade/orientation.js | 127/127 | 23/23 | 10/10 |
| dist/starmade/segmentData.js | 31/31 | 20/20 | 6/6 |
| dist/starmade/smd3Generation.js | 178/178 | 77/77 | 18/18 |
| dist/textures/cubeAtlas.js | 68/68 | 32/32 | 13/13 |
| dist/textures/index.js | 2/2 | 1/1 | 0/0 |
| dist/vendor/OgreMaxLoader.js | 1588/1588 | 359/359 | 105/105 |
| dist/viewer/createPreviewScene.js | 44/44 | 19/19 | 2/2 |
| dist/viewer/createStarMadeCubeShadowPipeline.js | 59/59 | 14/14 | 7/7 |

