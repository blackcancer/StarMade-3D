> Historical document retained from the input archive. Current measured acceptance and limitations are in [the rendering correction report](render-parity-2026-09-20.md).

# StarMade-Open Rendering Source Map

Created: 2026-05-21
Reference root: `/srv/dev/StarMade-Open`
Target root: `/srv/dev/StarMade-3D`

This document maps StarMade-Open rendering sources to the StarMade-3D pipelines
that must be ported faithfully. It is intentionally source-oriented: when a
pipeline changes, inspect these files first and update this map if new sources
become authoritative.

## P0 - Render Entry Points And Pass Order

Primary sources:

- `src/main/java/org/schema/game/client/view/MainGameGraphics.java`
- `src/main/java/org/schema/game/client/view/WorldDrawer.java`
- `src/main/java/org/schema/game/client/view/SegmentDrawer.java`
- `src/main/java/org/schema/game/client/view/SegmentLodDrawer.java`
- `src/main/java/org/schema/game/client/view/effects/DepthBufferScene.java`
- `src/main/java/org/schema/game/client/view/effects/Shadow.java`

Why they matter:

- `MainGameGraphics` and `WorldDrawer` establish frame-level render ordering.
- `SegmentDrawer` owns segment collection, sorting, pass split, lighting update,
  LOD coordination, and the main cube shader instance.
- `SegmentLodDrawer` connects StarMade block LOD data to LOD draw systems.
- `DepthBufferScene` and `Shadow` define depth/shadow resources and uniforms used
  by the segment shader path.

Target areas:

- `examples/visual-test/isanth.ts`
- future render orchestration modules under `src/renderer` or `src/starmade`
- `src/shaders/shadowPipeline.ts`

## P1 - Block Config, Element Metadata, And Texture Resolution

Primary sources:

- `src/main/java/org/schema/game/common/data/element/ElementKeyMap.java`
- `src/main/java/org/schema/game/common/data/element/ElementInformation.java`
- `src/main/java/org/schema/game/common/data/element/Element.java`
- `src/main/java/org/schema/game/common/data/world/SegmentData.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeMeshBufferContainer.java`
- game config files under `/srv/StarMade/data/config`
- texture packs under `/srv/StarMade/data/textures/block`
- texture order files:
  - `/srv/StarMade/data/textures/texOrderNormal.config`
  - `/srv/StarMade/data/textures/texOrderPointToOrientation.config`
  - `/srv/StarMade/data/textures/texOrder4x4.config`
- custom texture roots under `/srv/StarMade/customBlockTextures` and
  `/srv/StarMade/data/textures/customTemplates`

Critical behavior to preserve:

- block style and individual-side metadata;
- active/inactive texture convention;
- animated texture offset;
- distinction between raw `Animated` element metadata and texture-frame
  animation eligibility;
- extended texture area;
- resource-injection overlay mapping;
- build-mode-only drawing;
- slab/cargo special cases;
- HP damage code;
- texture atlas page/layer/local tile resolution;
- normal map and overlay texture selection.
- broader `BlockConfig.xml` element metadata needed by later faithful pipelines:
  control relationships, recipes/consistence, factory/source data, collision
  shapes and physics flags, effect armor values, logic flags, reactor and
  chamber hierarchy, chamber config groups, prerequisites, exclusions, upgrades,
  wildcard ids, and LOD activation style.
- BlockConfig element information should continue to mirror StarMade-Open
  `ElementInformation` helpers where practical: `BlockStyle`, resource
  injection, default orientation, LOD/blend classification, source reference,
  chamber relationship/capacity helpers, and typed references instead of raw XML
  strings.

Target areas:

- `src/starmade/blockConfig.ts`
- `/srv/dev/StarMade-Decoder/src/config/BlockConfig.ts` as the canonical
  dev/test parser for enriched `BlockConfig.xml` metadata consumed by
  StarMade-3D
- `src/starmade/atlas.ts`
- `src/textures/cubeAtlas.ts`
- `vite.config.ts` dev-only asset serving
- `examples/visual-test/isanth.ts` P1 runtime diagnostics
- `scripts/isanth-webgl-smoke.mjs` P1 CDP regression checks
- `tests/blockConfig.test.ts`
- `tests/decoderBlockConfig.test.ts`
- `tests/atlas.test.ts`
- `tests/textures.test.ts`

## P2 - Cube Mesh, Shapes, Visibility, And Packed Vertex Encoding

Primary sources:

- `src/main/java/org/schema/game/client/view/cubes/CubeMeshBufferContainer.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeBuffer.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeBufferInt.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeBufferFloat.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeData.java`
- `src/main/java/org/schema/game/client/view/cubes/occlusion/Occlusion.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeDataPool.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeMeshNormal.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/CubeMeshDynOpt.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/CubeMeshManagerBulkOptimized.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/LODCubeMeshManagerBulkOptimized.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/LodMesher.java`
- `src/main/java/org/schema/game/client/view/cubes/shapes/AlgorithmParameters.java`
- `src/main/java/org/schema/game/client/view/cubes/shapes/BlockRenderInfo.java`
- `src/main/java/org/schema/game/client/view/cubes/shapes/BlockShape.java`
- `src/main/java/org/schema/game/client/view/cubes/shapes/BlockShapeAlgorithm.java`
- `src/main/java/org/schema/game/client/view/cubes/shapes/BlockStyle.java`
- `src/main/java/org/schema/game/client/view/cubes/shapes/GeneralBlockStyle.java`
- shape-specific files under:
  - `src/main/java/org/schema/game/client/view/cubes/shapes/wedge/**`
  - `src/main/java/org/schema/game/client/view/cubes/shapes/tetrahedron/**`
  - `src/main/java/org/schema/game/client/view/cubes/shapes/pentahedron/**`
  - `src/main/java/org/schema/game/client/view/cubes/shapes/spike/**`
  - `src/main/java/org/schema/game/client/view/cubes/shapes/sprite/**`
  - `src/main/java/org/schema/game/client/view/cubes/shapes/orientcube/**`
- `src/main/resources/data/shader/cube/quads13/cubeEncoding.glsl`

Critical behavior to preserve:

- side inclusion and neighbor visibility;
- orientation maps for 3, 6, and 24-orientation blocks;
- `BlockShapeAlgorithm` vertex and texture order;
- texture order styles `NORMAL`, `ORIENT`, and `AREA4x4`;
- face winding and side ids;
- encoded side/type/texture/vertex fields;
- layer and local texture id;
- active, animated, extended, HP, overlay, visibility, and occlusion fields;
- opaque/blended split, including `CubeData`'s opaque-first/blended-second
  buffering and `Occlusion`'s blended-neighbor face rules.

Target areas:

- `src/geometry/starmadeEncodedCube.ts`
- `src/geometry/segment.ts`
- `src/geometry/cube.ts`
- `src/starmade/orientation.ts`
- `src/starmade/segmentData.ts`
- `tests/cube.test.ts`
- `tests/segment.test.ts`
- `tests/orientation.test.ts`

## P3 - Cube Shader, Materials, And Texture Sampling

Primary sources:

- `src/main/java/org/schema/game/client/view/shader/CubeMeshQuadsShader13.java`
- `src/main/resources/data/shader/cube/quads13/cube-3rd.vsh`
- `src/main/resources/data/shader/cube/quads13/cube-3rd.fsh`
- `src/main/resources/data/shader/cube/quads13/depthcube.vsh`
- `src/main/resources/data/shader/cube/quads13/depthcube.fsh`
- `src/main/resources/data/shader/cube/quads13/shadowcube.vsh`
- `src/main/resources/data/shader/cube/quads13/shadowcube.fsh`
- `src/main/resources/data/shader/cube/cubeLight.glsl`
- `src/main/resources/data/shader/cube/cubeLightPerVertex.glsl`
- `src/main/resources/data/shader/cube/cubeLightVars.glsl`
- `src/main/resources/data/shader/cube/cubeTextures.glsl`

Critical behavior to preserve:

- shader defines: `INTATT`, `shader4`, `force130`, `blended`, `normalmap`,
  texture-array variants, quality variants;
- uniforms from `CubeMeshQuadsShader13`;
- `quadPosMark`, normals, tangents, binormals;
- overlay texture binding;
- color and normal texture samplers;
- animation frame updates;
- alpha discard and blended pass semantics;
- fixed-function OpenGL compatibility uniforms.

Target areas:

- `src/shaders/cubeShaderMaterial.ts`
- `src/shaders/compat.ts`
- `src/shaders/gpuValidation.ts`
- `src/shaders/preprocess.ts`
- `src/shaders/programs.ts`
- `src/shaders/sources.ts`
- `tests/shaders.test.ts`

## P4 - Lighting, Block Light, Spot Sources, And Occlusion

Primary sources:

- `src/main/java/org/schema/game/client/view/SegmentDrawer.java`
- `src/main/java/org/schema/game/client/view/cubes/CubeMeshBufferContainer.java`
- `src/main/java/org/schema/game/client/view/cubes/occlusion/Occlusion.java`
- `src/main/java/org/schema/game/client/view/cubes/occlusion/Ambience.java`
- `src/main/java/org/schema/game/client/view/cubes/occlusion/Ray.java`
- `src/main/java/org/schema/game/client/view/cubes/occlusion/Sample.java`
- `src/main/java/org/schema/game/client/view/cubes/occlusion/SideProcessor.java`
- `src/main/resources/data/shader/cube/cubeLight.glsl`
- `src/main/resources/data/shader/cube/cubeLightPerVertex.glsl`
- `src/main/resources/data/shader/cube/cubeLightVars.glsl`
- `src/main/java/org/schema/game/client/view/shader/CubeMeshQuadsShader13.java`

Critical behavior to preserve:

- per-vertex RGB light and occlusion values;
- active light-source filtering;
- ray/gather parameters;
- scene sun defaults;
- `MainGameGraphics.spotLights` mapping;
- OpenGL light-source array compatibility;
- `allLight` behavior.

Target areas:

- `src/starmade/blockLighting.ts`
- `src/starmade/blockLightScene.ts`
- `src/geometry/blockLightGeometry.ts`
- `src/shaders/cubeShaderMaterial.ts`
- `tests/blockLighting.test.ts`
- `tests/blockLightScene.test.ts`
- `tests/blockLightGeometry.test.ts`

## P5 - Shadow And Depth Pipeline

Primary sources:

- `src/main/java/org/schema/game/client/view/effects/Shadow.java`
- `src/main/java/org/schema/game/client/view/shader/ShadowShader.java`
- `src/main/java/org/schema/schine/graphicsengine/shader/ShadowParams.java`
- `src/main/resources/data/shader/shadow.glsl`
- `src/main/resources/data/shader/shadow/shadow_vertex.glsl`
- `src/main/resources/data/shader/shadow/shadow_single_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_multi_noleak_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_multi_leak_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_pcf_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_pcf_4tap_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_pcf_8tap_random_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_pcf_gaussian_fragment.glsl`
- `src/main/resources/data/shader/shadow/shadow_pcf_trilinear_fragment.glsl`
- `src/main/resources/data/shader/shadow/view_vertex.glsl`
- `src/main/resources/data/shader/shadow/view_fragment.glsl`
- cube depth/shadow shaders listed in P3

Critical behavior to preserve:

- shadow map texture array (`stex`);
- split count and `far_d`;
- `texSize`;
- texture matrices;
- quality modes including normal/best/ultra and VSM where enabled;
- cube and LOD caster depth paths;
- alpha discard in shadow casters.

Target areas:

- `src/shaders/shadowPipeline.ts`
- `src/shaders/cubeShaderMaterial.ts`
- future tests for split/far-distance/texture-matrix parity

## P6 - Segment Sorting, Culling, And Draw Passes

Primary sources:

- `src/main/java/org/schema/game/client/view/SegmentDrawer.java`
- `src/main/java/org/schema/game/client/view/SegmentOcclusion.java`
- `src/main/java/org/schema/game/client/view/DrawableRemoteSegment.java`
- `src/main/java/org/schema/game/common/controller/SegmentController.java`
- `src/main/java/org/schema/game/common/data/world/Segment.java`
- `src/main/java/org/schema/game/common/data/world/SegmentData.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/DrawMarker.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/VBOManagerBulkBase.java`
- `src/main/java/org/schema/game/client/view/cubes/cubedyn/VBOSeg.java`

Critical behavior to preserve:

- opaque and blended segment arrays;
- distance sorting mode;
- segment-controller grouping;
- frustum and segment occlusion;
- deactivated segment handling;
- modelview transform and world origin handling;
- blend-function changes.

Target areas:

- future render orchestration modules;
- `examples/visual-test/isanth.ts` until the orchestration is extracted;
- diagnostics in the browser smoke artifact.

## P7 - LOD, OgreMax, Sprite LOD, And LOD Materials

Primary sources:

- `src/main/java/org/schema/game/client/view/SegmentLodDrawer.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODCapable.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODDeferredSpriteCollection.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODDoubleMesh.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODDrawerCollection.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODDrawerInterface.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODDrawerSystem.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODDrawerSystemInterface.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODMesh.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODMeshSprite.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODMeshSystem.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODSingleMesh.java`
- `src/main/java/org/schema/game/client/view/meshlod/LODSprite.java`
- model and material assets under `/srv/StarMade/data/models/lod`

Critical behavior to preserve:

- LOD level update based on camera distance;
- single mesh, double mesh, mesh+sprite, and sprite-only stages;
- transition margins;
- deferred sprite collection;
- material texture, normal, emissive, transparency, culling, depth-write, lighting,
  and shadow state.

Target areas:

- `src/starmade/lodModels.ts`
- `src/starmade/lodInstancing.ts`
- `src/vendor/OgreMaxLoader.js`
- `tests/lodModels.test.ts`
- `tests/lodInstancing.test.ts`

## P8 - Selection, Build Mode, And Interaction Overlays

Primary sources:

- `src/main/java/org/schema/game/client/view/SelectionShader.java`
- `src/main/java/org/schema/game/client/view/shader/OutlineShader.java`
- `src/main/java/org/schema/game/client/view/BuildModeDrawer.java`
- `src/main/java/org/schema/game/client/view/tools/SingleBlockDrawer.java`
- `src/main/resources/data/shader/cube/selectionSingle.vert.glsl`
- `src/main/resources/data/shader/cube/selectionSingle.frag.glsl`
- `src/main/resources/data/shader/cube/selectionSolid.vert.glsl`
- `src/main/resources/data/shader/cube/selectionSolid.frag.glsl`
- `src/main/resources/data/shader/outline/outline.vert.glsl`
- `src/main/resources/data/shader/outline/outline.frag.glsl`

Critical behavior to preserve:

- selection and solid selection passes;
- outline pass;
- build-mode-only visibility overlays;
- single-block preview rendering;
- interaction visuals isolated from normal render output unless enabled.

Target areas:

- future interaction/overlay modules;
- visual-test toggles after core blueprint rendering is faithful.

## P9 - World, Post-Process, And Gameplay Effects

Primary sources:

- `src/main/java/org/schema/game/client/view/MainGameGraphics.java`
- `src/main/java/org/schema/game/client/view/WorldDrawer.java`
- `src/main/java/org/schema/game/client/view/effects/ExplosionDrawer.java`
- `src/main/java/org/schema/game/client/view/beam/BeamDrawer.java`
- `src/main/java/org/schema/game/client/view/beam/BeamDrawerManager.java`
- `src/main/java/org/schema/game/client/view/effects/ShieldDrawer.java`
- `src/main/java/org/schema/game/client/view/effects/ShieldDrawerManager.java`
- `src/main/java/org/schema/game/client/view/sundrawer/SunDrawer.java`
- effect classes under `src/main/java/org/schema/game/client/view/effects/**`
- shader folders under `src/main/resources/data/shader/bloom/**`
- shader folders under `src/main/resources/data/shader/gamma/**`
- shader folders under `src/main/resources/data/shader/sky/**`
- shader folders under `src/main/resources/data/shader/stars/**`
- shader folders under `src/main/resources/data/shader/sun.*`
- shader folders under `src/main/resources/data/shader/shieldhit/**`
- shader folders under `src/main/resources/data/shader/simplebeam/**`
- shader folders under `src/main/resources/data/shader/thruster/**`
- shader folders under `src/main/resources/data/shader/water*`
- shader folders under `src/main/resources/data/shader/ocean/**`
- shader folders under `src/main/resources/data/shader/atmosphere/**`

Critical behavior to preserve:

- depth buffer handoff;
- bloom/gamma/fog and foreground/background FBO composition;
- sky, stars, sun, atmosphere, water/ocean;
- beams, shields, thrust, explosions, transporter, hyperspace and other effects.

Target areas:

- future optional modules after P1-P7 are stable.

## Verification Anchors

Use these commands and scenes as the default gate while this map evolves:

- `npm run typecheck`
- `npm test -- --run`
- `npm run build`
- visual-test route: `/isanth.html`
- public route through Apache: `https://initsysrev.net:8000/isanth.html`
- Vite local route on the VPS: `http://127.0.0.1:8001/isanth.html`

The browser/WebGL gate still needs to be automated as part of P0. Until then, any
manual visual check must record ready-state diagnostics, WebGL errors, network
failures, and a non-black canvas assertion.
