# Public API and compatibility — 1.0.0

The package is ESM, with declarations at its root export `starmade-3d`. Runtime
exports from `src/index.ts` and their declaration types are the supported API.
Deep imports are not exported and private helper implementation is not a contract.
Breaking changes to supported signatures, coordinate conventions, ownership or raw
state preservation require a major version. Additive APIs and fixes use minor/patch
versions respectively. Rendering fixes can change pixels; their regression evidence
and intentional deviations from the native pipeline must be documented.

Node >=22.16 is the supported tooling/headless environment. Browser native rendering
requires WebGL2. Three.js `^0.164.1` is a peer so the host and library share constructors
and GPU resources. Other Three.js minors and WebGPU are not qualified in 1.0.0.

The host owns the renderer, scene, camera, loop, data persistence, application history,
asset authorization and commands. Functional groups and saved relations are data;
colors, isolation and UI controls are choices of the consuming program.

Inspection contracts are in [inspection-api.md](inspection-api.md). Asset startup is
in [assets.md](assets.md). Identity belongs to the host; generated import path IDs are
snapshot-scoped. Exported measurements are cell envelopes, not collision meshes.
Raw activation bits are not a universal machine-on flag.

Static NORMAL24 rail and core connector poses are available through
`resolveStarMadeRailPose`, following `RailRelation.getBlockTransform`. It interprets
saved turret/movement matrices without simulating movement or collision. The blueprint
adapter diagnoses missing/unsupported poses before falling back to attachment offsets.
Legacy docking/planet-specific anchors are not silently claimed as full rail support.

The native voxel block-light scene helper accepts translated entities. The scene graph
and inspection support general affine matrices; arbitrary rotating/moving assemblies
require the host to recompute an appropriate lighting field. The library does not
simulate rail movement or automatically voxelize arbitrary affine geometry.

Animation helpers provide deterministic sampling and native supported material updates,
not a gameplay clock. glTF export reports approximated shaders and current-pose-only
animations. These qualified limitations are part of the 1.0.0 contract.

Ogre/Material loader progress callbacks receive an Event carrying `loaded`, `total` and `lengthComputable`. Pre-v1 numeric callback pairs are replaced by the Three.js-compatible event contract.
