> Historical development evidence. The 1.0.0 acceptance, supported scope and current limitations are recorded in [the release validation report](v1-validation.md).

# StarMade-Open Pipeline Fidelity Roadmap

> Reprise du 20 septembre 2026 : les validations ci-dessous sont historiques. Elles ne qualifient pas cette livraison. Voir `validation-2026-09-20.md` et le rapport de couverture actuel.

Created: 2026-05-21
Project: `/srv/dev/StarMade-3D`
Reference implementation: `/srv/dev/StarMade-Open`
Game assets reference: `/srv/StarMade`

This roadmap is the active porting contract for making the StarMade-3D rendering
pipelines faithful to StarMade-Open. A pipeline is not considered done because it
renders plausibly; it is done only when its StarMade-Open source path is mapped,
the TypeScript implementation follows the same data contract, and automated plus
visual checks prove the behavior on reference fixtures.

## Current Baseline

StarMade-3D already has:

- embedded StarMade shader sources from the game data tree;
- StarMade shader preprocessing and WebGL compatibility reporting;
- an experimental `cube.quads13` material using StarMade-style packed cube data;
- cube atlas and normal atlas loading for the Default texture pack;
- segment geometry generation with StarMade-like `starMadeVertex` encoding;
- block config normalization from decoder-shaped data;
- block-light scene construction from segments/entities;
- LOD model definition parsing and OgreMax prototype instancing;
- a simplified directional shadow pass for cubes and LOD;
- an Isanth visual-test scene with real blueprint, cube blocks, LOD, block lights,
  spot sources, and WebGL readiness diagnostics.

Latest known validation before this roadmap:

- unit tests: 192/192 passing;
- typecheck: passing;
- build: passing;
- `/isanth.html`: WebGL ready, 3200 blocks, 199 LOD, 45 spots, `missingLods=[]`,
  non-black canvas, no blocking network failures.

## Non-Negotiable Rules

1. StarMade-Open remains the authority for rendering behavior.
2. No runtime dependency on `StarMade-Decoder`; it stays dev/test-only.
3. Do not freeze the architecture around Three.js until the faithful pipelines are
   measured against StarMade-scale scenes.
4. A visual approximation is not enough. Each pipeline needs source references,
   targeted tests, and a browser/WebGL proof.
5. Preserve the library boundary: asset URLs and decoded StarMade data are supplied
   by the host application.
6. Keep the visual-test scene useful, but move reusable logic into `src/`.

## Definition of Faithful

A pipeline reaches "faithful" only when all relevant checks are true:

- Source map: the StarMade-Open classes and shader files used as references are
  listed in this roadmap or adjacent docs.
- Data parity: TypeScript inputs/outputs match the StarMade-Open data shape or an
  explicitly documented neutral equivalent.
- Numeric parity: packed fields, texture ids, orientation codes, lighting values,
  split distances, or draw-state values are covered by fixtures where possible.
- Shader parity: the generated WebGL shader still represents the StarMade shader,
  with compatibility rewrites limited and tested.
- Visual parity: reference blueprints render with matching pass composition,
  material state, lighting, shadows, transparency, LOD, and effects within known
  WebGL/Three constraints.
- Regression gate: `npm run typecheck`, `npm test -- --run`, `npm run build`, and
  the browser Isanth smoke check pass.

## Working Loop

For each pipeline:

1. Inspect and quote-map the StarMade-Open source files.
2. Record the exact behavioral contract to port.
3. Add or update focused tests before broad visual work.
4. Port the smallest coherent slice into `src/`.
5. Wire the visual-test only after the library API exists.
6. Run typecheck, tests, build, and WebGL smoke.
7. Update this roadmap status before moving to the next pipeline.

## Pipeline Order

### P0 - Fidelity Harness And Source Map

Status: complete
Priority: first

Reference sources:

- `org/schema/game/client/view/MainGameGraphics.java`
- `org/schema/game/client/view/WorldDrawer.java`
- `org/schema/game/client/view/SegmentDrawer.java`
- `org/schema/game/client/view/effects/DepthBufferScene.java`
- `org/schema/game/client/view/effects/Shadow.java`
- `org/schema/game/client/view/shader/CubeMeshQuadsShader13.java`
- `org/schema/game/client/view/cubes/CubeMeshBufferContainer.java`
- `src/main/resources/data/shader/**`

Tasks:

- Create a source-map document or section listing every Java/shader source used by
  the cube, LOD, lighting, shadow, transparency, and post-process paths.
  - Created: `docs/starmade-open-source-map.md`.
- Add a reusable browser smoke script for `/isanth.html` that records ready state,
  WebGL errors, network failures, canvas pixel samples, and diagnostics JSON.
  - Created: `scripts/isanth-webgl-smoke.mjs`, exposed as `npm run smoke:isanth`.
  - CDP is currently expected on the local Windows browser
    (`http://127.0.0.1:9222` from WSL), not on the VPS.
  - The smoke script now injects periodic page-side `console.log` checkpoints and
    captures a PNG screenshot. Render-output checks use the screenshot as a
    fallback when WebGL `readPixels` returns black in the Windows CDP context even
    though the page visibly rendered.
- Add a diagnostic snapshot format for comparing render pipeline state over time.
  - Current artifact: `artifacts/isanth-webgl-smoke.json`.
  - Current local-CDP artifact: `artifacts/isanth-webgl-smoke-local.json` plus
    `artifacts/isanth-webgl-smoke-local.png`.
- Keep Isanth as the first reference scene, then add at least one blueprint with
  transparency, animated/active blocks, odd shapes, and heavier LOD pressure.

Exit criteria:

- One command can produce a stable render diagnostics artifact.
- The source map covers all pipelines P1-P8.
- Current baseline numbers are captured and versioned.

### P1 - Asset And BlockConfig Pipeline

Status: complete
Priority: after P0

Reference sources:

- `ElementKeyMap`
- `ElementInformation`
- `CubeMeshBufferContainer.putIndex`
- game config files under `/srv/StarMade/data/config`
- texture packs under `/srv/StarMade/data/textures/block`
- texture order files under `/srv/StarMade/data/textures/texOrder*.config`

Tasks:

- Complete BlockConfig normalization for render-critical fields: block style,
  individual sides, slab, extended texture, animated texture, activation state,
  activation texture convention, resource injection overlay, build-mode-only
  drawing, HP/damage texture logic, sprite/orientcube metadata.
  - Added render metadata fields for max HP, build-mode-only, extended texture,
    reactor chamber specificity, and resource injection.
  - Added helpers for StarMade active/inactive texture resolution, layer/local
    texture codes, resource overlay offsets, and HP byte damage code.
  - `StarMade-Decoder` now exposes render-critical `BlockConfig.xml` metadata
    directly on `BlockDefinition`: `OnlyDrawnInBuildMode`,
    `ExtendedTexture4x4`, `ResourceInjection`, `ChamberRoot`,
    `reactorChamberSpecific`, and `LodCollisionPhysical`.
  - `StarMade-Decoder` also exposes a typed `BlockDefinition.metadata` bundle for
    future render/gameplay parity work: control relationships, consistence and
    recipe inputs, cubatom data, inventory/source/factory metadata, collision
    flags/shapes, effect armor `Heat`/`Kinetic`/`EM`, logic/door/beacon/sensor/system
    flags, reactor/chamber hierarchy, chamber config groups, prerequisites, exclusions, upgrades,
    capacity, permissions, wildcard ids, and LOD activation style.
  - `StarMade-Decoder` now provides StarMade-Open-inspired element information:
    `BlockDefinition.toElementInfo(config)`,
    `BlockConfig.getElementInfoById/name/typeName()`, `BlockConfig.elementInfo`,
    `BlockStyle` and
    `ResourceInjection` descriptors, reference-resolved recipes/control links,
    collision/chamber/factory/classification profiles, default orientation, LOD
    and blend-style helpers.
  - Vite dev BlockConfig JSON now consumes `StarMade-Decoder`
    `BlockConfig.elementInfo` and exposes a compact ElementInformation-shaped
    payload to the visual test. `StarMade-3D` no longer owns a duplicate XML
    metadata parser for these fields. Broad `BlockConfig.xml` enrichment belongs
    in `StarMade-Decoder`; `StarMade-3D` consumes the resulting data contract.
- Verify texture id resolution for normal textures, overlays, custom textures,
  animated frames, active/inactive variants, and cargo/build-mode special cases.
  - Active/inactive `HasActivationTexture` convention is covered by tests and
    segment geometry now passes decoded block `active`.
  - HP byte damage encoding now matches StarMade-Open: full `127 -> 0`, destroyed
    `0 -> 7`.
  - Exact StarMade texture-order maps are now ported from `texOrderNormal.config`,
    `texOrderPointToOrientation.config`, and `texOrder4x4.config`.
  - `ExtendedTexture4x4` blocks now use the StarMade `AREA4x4` corner order and
    set the packed shader `extendedTexture` bit.
  - Animated texture flags now follow StarMade's per-face rule for three-sided
    animated blocks, while LOD-backed blocks still set the animated marker.
  - Resource-injection blocks now use orientation for overlay selection, then
    reset render texture orientation to `0` like `CubeMeshBufferContainer`.
  - Reactor-chamber-specific blocks now increment the packed local texture code.
  - Cargo space rendering now handles the StarMade build-mode texture substitution,
    build-mode bit, slab/orientation remap, and Java-compatible random texture
    offset used by `CubeMeshBufferContainer`.
  - Secondary packed occlusion was verified against the active StarMade shader
    source: runtime uses the 5-bit `0..31` field decoded by `/srv/StarMade`
    `cubeEncoding.glsl`, including block-light geometry updates.
  - Raw `Animated` metadata is now kept separate from texture animation
    eligibility. Static animated metadata blocks such as Ship Core, Shield
    Capacitor, Shield-Recharger, Rail Mass Enhancer, and Reactor Power no longer
    advance atlas frames in cube geometry, while true animated texture blocks
    still do.
- Keep texture loading URL-based; do not make runtime depend on `/srv/StarMade`.

Exit criteria:

- Fixtures cover normal, wedge/corner, sprite, activation, animated, extended,
  resource-injection, cargo/build-mode, and HP-damaged blocks.
- Texture id and atlas layer/local tile results match StarMade-Open rules.
- Real decoder-enriched `BlockConfig` metadata is covered by integration tests
  and the Isanth CDP smoke. Latest P1 CDP artifact:
  `artifacts/p1-blockconfig-highlevel-isanth-webgl-smoke.json`
  (`PASS`, 1516/1516 block definitions mapped, 0 invalid texture IDs, 28
  resource-injection blocks, 73 raw animated blocks vs 64 texture-animated
  blocks).

### P2 - Cube Geometry And Packed Vertex Pipeline

Status: complete
Priority: after P1

Reference sources:

- `CubeMeshBufferContainer.java`
- `BlockShapeAlgorithm.java`
- `BlockStyle.java`
- `AlgorithmParameters.java`
- `BlockRenderInfo.java`
- shape packages under `view/cubes/shapes/**`
- `data/shader/cube/quads13/cubeEncoding.glsl`

Tasks:

- Port the full face/side inclusion rules and packed field layout used by
  StarMade-Open.
- Finish shape fidelity for normal, normal24, wedge, corner, tetrahedron, spike,
  sprite, slab, and orientcube paths.
- Match orientation maps, side-order winding, texture order style, UV insets,
  layer encoding, active/animated offsets, HP code, occlusion code, and visibility
  code.
  - Started: `NORMAL`, `ORIENT`, and `AREA4x4` texture order styles are ported
    into `src/geometry/starmadeEncodedCube.ts` and covered by cube tests.
  - Added StarMade draw-bucket metadata per encoded face: buckets `0..5` map to
    side buffers and bucket `6` maps to angled/sprite faces, matching the
    `BlockShapeAlgorithm.put(..., angled)` / `CubeBuffer` split.
- Separate opaque and blended geometry the way SegmentDrawer expects.
  - Added `createStarMadeEncodedSegmentGeometryBatches()` and single-pass
    `pass: "opaque" | "blended"` filtering so hosts can draw StarMade-style cube
    passes without duplicating segment meshing logic.
  - Blended classification now follows the relevant StarMade sources:
    transparent blocks, sprite/blended block styles, LOD style `1`, and cargo
    special blocks are routed to the blended pass.
  - Segment visibility now culls internal faces between blended blocks and keeps
    opaque-vs-blended behavior aligned with `Occlusion`.

Exit criteria:

- Encoded attributes match expected fixtures for every supported block style.
- Face counts and material groups match StarMade-Open behavior on reference
  segments.
- Visual diagnostic cubes remain correct face-by-face after each change.

### P3 - Cube Shader And Material Pipeline

Status: complete
Priority: after P2

Reference sources:

- `CubeMeshQuadsShader13.java`
- `data/shader/cube/quads13/cube-3rd.vsh`
- `data/shader/cube/quads13/cube-3rd.fsh`
- `data/shader/cube/cubeLight*.glsl`
- `data/shader/cube/cubeTextures.glsl`

Tasks:

- Keep the real StarMade cube shader as the base, with compatibility rewrites
  restricted to WebGL/Three bridging.
- Match uniforms from `CubeMeshQuadsShader13`: `zNear`, `zFar`, `viewPos`,
  `lightPos`, `animationTime`, `lodThreshold`, `uTime`, `spotCount`,
  `extraAlpha`, `allLight`, texture samplers, normal samplers, overlay texture,
  `quadPosMark`, normals, tangents, and binormals.
- Implement material variants for opaque, blended/alpha discard, normal-mapped,
  build-mode-only, selected/low texture quality, and diagnostic modes.
- Remove test-only shortcuts where the StarMade shader has real behavior.

Exit criteria:

- WebGL2 compilation passes for the selected cube variants.
- Material diagnostics prove the expected StarMade uniforms/defines/samplers are
  present and populated.
- Opaque and blended cube passes render with correct alpha/discard behavior.

### P4 - Lighting Pipeline

Status: in progress
Priority: after P3

Reference sources:

- `SegmentDrawer.java`
- `SegmentLightingUpdateThreadManager`
- `CubeMeshBufferContainer` light/visibility data paths
- `data/shader/cube/cubeLight.glsl`
- `data/shader/cube/cubeLightPerVertex.glsl`
- `CubeMeshQuadsShader13.java`

Tasks:

- Confirm block-light volume math against StarMade-Open: source colors, active
  filtering, ray count, ray length, occlusion, color scale, and per-vertex gather.
- Match scene sun defaults from StarMade-Open and make camera/view-space updates
  deterministic.
- Match spot-source mapping into the OpenGL light-source compatibility layer.
- Cover `allLight` and build-mode lighting behavior explicitly.

Exit criteria:

- Numeric fixtures cover block-light propagation and encoded per-vertex light.
- Isanth and the second fixture render expected active/inactive light sources.
- Spot count and light-source uniform diagnostics stay stable.

### P5 - Shadow And Depth Pipeline

Status: complete
Priority: after P4

Reference sources:

- `org/schema/game/client/view/effects/Shadow.java`
- `org/schema/game/client/view/shader/ShadowShader.java`
- `org/schema/schine/graphicsengine/shader/ShadowParams.java`
- `data/shader/shadow.glsl`
- `data/shader/cube/quads13/depthcube.*`
- `data/shader/cube/quads13/shadowcube.*`

Tasks:

- Replace the current simplified one-split shadow path with a StarMade-Open style
  depth pipeline: texture-array shadow maps, split count, `far_d`, `texSize`,
  texture matrices, quality modes, and caster passes.
- Port depth materials for cube opaque/blended and LOD casters with alpha discard.
- Match shadow coefficient behavior from `shadow.glsl`, including normal, best,
  ultra, PCF/VSM paths where StarMade settings require them.
- Keep shadow diagnostics in the visual-test ready state.

Exit criteria:

- `shadowSplits`, `farDistances`, texture array mode, map size, and quality mode
  match the selected StarMade settings.
- Cubes and LOD cast and receive shadows in the same pass model.
- Browser smoke proves shadow maps are non-empty and affect final pixels.

### P6 - Segment Draw Orchestration Pipeline

Status: complete
Priority: after P5

Reference sources:

- `SegmentDrawer.java`
- `DrawableRemoteSegment`
- `SegmentSorterThread`
- `SegmentOcclusion`
- `LODCubeMeshManagerBulkOptimized`

Tasks:

- Port the draw-pass ordering: opaque, blended, LOD, deactivated segments, culling,
  sorting by camera/controller, and blend mode changes.
- Stabilize entity/segment transforms, child offsets, rail/dock transforms when the
  decoder exposes them, and origin handling.
- Add chunking/streaming/caching only after pass fidelity is correct.

Exit criteria:

- Diagnostics report pass counts, draw order, transparent counts, culled counts,
  LOD-hidden blocks, and segment origins.
- Large blueprint scenes remain responsive without changing visual semantics.

### P7 - LOD And OgreMax Pipeline

Status: complete
Priority: after P6, but small fixes can happen earlier if they block P5/P6

Reference sources:

- `view/meshlod/**`
- `SegmentLodDrawer`
- `LODCubeMeshManagerBulkOptimized`
- game model definitions and OgreMax XML under `/srv/StarMade/data`

Tasks:

- Complete LOD stage semantics: single mesh, double mesh, mesh+sprite, sprite,
  distance thresholds, margins, current-level transitions, and deferred sprites.
- Match materials: diffuse, emissive, normal maps, transparency, depth write,
  culling, light vector, shadow receiving, and alpha handling.
- Keep missing model diagnostics strict.

Exit criteria:

- No missing LOD definitions on reference scenes.
- LOD transitions match StarMade-Open thresholds.
- LOD material diagnostics match expected texture/emissive/transparent states.

### P8 - Selection, Build Overlays, And Interaction Visuals

Status: complete
Priority: after P7 unless needed for comparison

Reference sources:

- `SelectionShader.java`
- `OutlineShader.java`
- `BuildModeDrawer.java`
- `SingleBlockDrawer.java`
- `data/shader/cube/selection*.glsl`
- `data/shader/outline/**`

Tasks:

- Port selection outlines, block highlight, build-mode overlays, trigger/cargo
  visibility, and single-block preview rendering.
- Ensure these passes do not contaminate normal blueprint rendering when disabled.

Exit criteria:

- Interaction overlays can be enabled in the visual-test without regressing the
  base cube/LOD/shadow scene.

### P9 - World, Post-Process, And Effects Pipeline

Status: complete
Priority: after core blueprint fidelity

Reference sources:

- `MainGameGraphics.java`
- `WorldDrawer.java`
- `DepthBufferScene.java`
- `ExplosionDrawer.java`
- `BeamDrawer.java`
- `ShieldDrawer.java`
- `SunDrawer.java`
- shader folders: `bloom`, `gamma`, `fog`, `sky`, `stars`, `sun`, `shieldhit`,
  `simplebeam`, `thruster`, `water`, `ocean`, `atmosphere`

Tasks:

- Port only after the core segment renderer is faithful.
- Add depth-buffer, bloom/gamma/fog, sky/sun/stars, beams, shields, thrusters,
  transporter, hyperspace, water/ocean/atmosphere as separate sub-pipelines.

Exit criteria:

- Effects are opt-in library modules with their own diagnostics and visual gates.

### P10 - Library API, Performance, And Architecture Hardening

Status: open
Priority: ongoing, final hardening after P1-P7

Tasks:

- Keep renderer-facing APIs neutral and host-driven.
- Split reusable systems out of `examples/visual-test`.
- Add workers/cache/chunk streaming only where profiling proves the need.
- Revisit the engine choice after faithful StarMade-scale measurements.
- Keep public exports deliberate and covered by tests.

Exit criteria:

- The library can render reference blueprints through stable APIs.
- Performance work does not change visual output.
- Architecture decision is backed by measured scenes, not assumption.

## Immediate Next Steps

1. Finish P0: create the repeatable diagnostics harness and source map.
2. Start P1: audit BlockConfig and texture-resolution parity gaps.
3. Continue into P2 only after P1 fixtures cover activation, animated textures,
   extended textures, overlays, and HP/build-mode cases.
4. Do not expand post-process/effects work until cube, lighting, shadow, segment
   pass, and LOD fidelity gates are green.

## Progress Log

- 2026-05-21: Roadmap created. Current implementation is useful and validated on
  Isanth, but core fidelity remains open. The simplified one-split shadow path is
  explicitly not considered faithful yet.
- 2026-05-21: Added `docs/starmade-open-source-map.md` to anchor P0 source
  references across render entry points, BlockConfig, cube geometry, shader,
  lighting, shadows, segment orchestration, LOD, overlays, and effects.
- 2026-05-21: Added `scripts/isanth-webgl-smoke.mjs` and `npm run smoke:isanth`
  for CDP-based Isanth diagnostics: ready-state JSON, network/HTTP failures,
  runtime/log errors, canvas pixel sampling, WebGL error state, and hard checks
  for the current Isanth block/LOD/spot/shadow baseline.
- 2026-05-21: Started P1. BlockConfig now exposes additional render metadata and
  StarMade texture/overlay/HP helpers. Segment geometry now uses decoded active
  state for activation textures and uses StarMade's HP byte damage code direction
  instead of the previous reversed mapping.
- 2026-05-21: P1 dev asset endpoint now augments decoder blocks with raw
  `BlockConfig.xml` render metadata not exposed by the decoder yet. Verified
  `/starmade-assets/config/block-config.json` returns `Extended Texture Test`
  with `extendedTexture=true` and chamber blocks with `reactorChamberSpecific`.
