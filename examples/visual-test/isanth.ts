import { attachDisplays, loadDisplayAssets } from './displayAssets.js';
import { blocksFromSegments, type StarMadeDisplayText } from '../../src/index.js';
import { loadStarMadeShaderSources } from '../../src/shaders/sources.js';
await loadStarMadeShaderSources('/starmade-assets/shaders.json');
import {
  Box3,
  Color,
  FrontSide,
  Group,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createStarMadeEncodedSegmentGeometryBatches } from "../../src/geometry/segment";
import { applyStarMadeBlockLightToEncodedCubeGeometry } from "../../src/geometry/blockLightGeometry";
import {
} from "../../src/geometry/starmadeEncodedCube";
import {
  blockDefinitionFromElementInfo,
  blockDefinitionFromConfig,
  starMadeBlockUsesTextureAnimation,
  type BlockDefinition,
  type DecoderBlockDefinitionLike,
  type DecoderBlockElementInfoLike
} from "../../src/starmade/blockConfig";
import {
  createStarMadeSegmentBlockLightScene,
  type StarMadeSegmentBlockLightScene
} from "../../src/starmade/blockLightScene";
import {
  createStarMadeLodModelRegistry,
  parseStarMadeLodModelDefinitions
} from "../../src/starmade/lodModels";
import {
  collectStarMadeLodBlockInstances,
  loadStarMadeLodPrototypes,
  addStarMadeLodInstances,
  starMadeSegmentBlockInstanceKey
} from "../../src/starmade/lodInstancing";
import {
  STARMADE_SEGMENT_DIM,
  type SegmentDataLike
} from "../../src/starmade/segmentData";
import {
  createStarMadeCubeShaderMaterial,
  applyStarMadeSceneSunToShaderMaterial,
  applyStarMadeBlockLightSourcesToCubeShaderMaterial,
  updateStarMadeBlockLightSourcesViewSpace,
  updateStarMadeCubeShaderTime,
  updateStarMadeCubeShaderClipPlanes,
  updateStarMadeCubeShaderMVP,
  collectStarMadeLodShaderMaterials,
  type StarMadeBlockLightSpotSource
} from "../../src/shaders/cubeShaderMaterial";
import {
  createStarMadeDirectionalShadowPipeline,
  bindStarMadeDirectionalShadowRoot,
  type StarMadeDirectionalShadowPipeline
} from "../../src/shaders/shadowPipeline";
import { loadStarMadeCubeTexturePack } from "../../src/textures";
import "./style.css";

interface Smd3ScenePayload {
  readonly headerVersion: number;
  readonly usedSlots: number;
  readonly segments: readonly SegmentDataLike[];
  readonly entities?: readonly Smd3EntityPayload[];
}

interface Smd3EntityPayload {
  readonly displayTexts?: readonly StarMadeDisplayText[];
  readonly name: string;
  readonly headerVersion: number;
  readonly usedSlots: number;
  readonly offset?: readonly [number, number, number];
  readonly segments: readonly SegmentDataLike[];
}

interface SceneEntity {
  readonly displayTexts?: readonly StarMadeDisplayText[];
  readonly name: string;
  readonly offset: readonly [number, number, number];
  readonly segments: readonly SegmentDataLike[];
}

interface BlockConfigPayload {
  readonly source?: string;
  readonly blocks?: readonly DecoderBlockDefinitionLike[];
  readonly elementInfo?: readonly DecoderBlockElementInfoLike[];
}

interface StarMadeSceneReadyState {
  readonly scene: string;
  readonly shipCount: number;
  readonly headerVersion: number;
  readonly usedSlots: number;
  readonly entities: number;
  readonly entitySummaries: readonly {
    readonly name: string;
    readonly offset: readonly [number, number, number];
    readonly segments: number;
    readonly blocks: number;
  }[];
  readonly segments: number;
  readonly segmentOrigins: readonly (readonly [number, number, number])[];
  readonly totalBlocks: number;
  readonly cubeBlocks: number;
  readonly redCrystalArmorBlocks: number;
  readonly lodBlocks: number;
  readonly missingLods: readonly string[];
  readonly meshes: number;
  readonly segmentMeshes: number;
  readonly opaqueSegmentMeshes: number;
  readonly transparentSegmentMeshes: number;
  /** P6: total faces hidden by neighbor face-culling across all segments. */
  readonly culledSegmentBlocks: number;
  /** P6: blocks with a non-sprite LOD model, excluded from cube geometry. */
  readonly lodHiddenSegmentBlocks: number;
  /** P6: explicit draw-pass order as executed (StarMade-Open: opaque→blended→LOD). */
  readonly drawPassOrder: readonly string[];
  readonly opaqueSegmentDrawBucketCounts: readonly number[];
  readonly transparentSegmentDrawBucketCounts: readonly number[];
  readonly opaqueSegmentMaterial: SegmentMaterialDiagnostic;
  readonly transparentSegmentMaterial: SegmentMaterialDiagnostic;
  readonly lodMeshes: number;
  readonly lodVertices: number;
  readonly lodTriangles: number;
  readonly lodTexturedMaterials: number;
  readonly lodFallbackMaterials: number;
  readonly lodEmissiveMaterials: number;
  readonly lodTransparentMaterials: number;
  readonly lodDepthWriteDisabledMaterials: number;
  readonly lodNormalMappedMaterials: number;
  readonly lodSpriteStyleBlocks: number;
  readonly renderedVertices: number;
  readonly renderedIndices: number;
  readonly textureLayers: number;
  readonly normalTextureLayers: number;
  readonly p1: IsanthP1Diagnostic;
  readonly sceneSun: IsanthSceneSunDiagnostic;
  readonly blockLight: IsanthBlockLightDiagnostic;
  readonly spotSourceCount: number;
  readonly shadow: IsanthShadowDiagnostic;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  };
}

interface SegmentMaterialDiagnostic {
  readonly transparent: boolean;
  readonly depthWrite: boolean;
  readonly doubleSided: boolean;
  readonly extraAlpha: number;
  readonly shaderDefines: readonly string[];
  readonly usesOwnTangent: boolean;
  readonly usesShader4: boolean;
  readonly usesForce130: boolean;
  readonly usesTextureArray: boolean;
  readonly uses2DMainTex: boolean;
  readonly textureArrayColorSpace: string | null;
  readonly normalTextureArrayColorSpace: string | null;
  readonly mainTextureColorSpace: string | null;
  readonly normalTextureColorSpace: string | null;
  readonly mainTextureFlipY: boolean | null;
  readonly normalTextureFlipY: boolean | null;
  readonly sunDirectionFromUniform: boolean;
  readonly hasBlendedDiscard: boolean;
  readonly finalAlphaFromTexture: boolean;
  readonly lightSourceSlots: number;
  readonly spotCount: number;
  readonly shadowSplits: number;
  readonly shadowStrength: number;
}

type IsanthBlockLightScene = StarMadeSegmentBlockLightScene;

interface IsanthBlockLightDiagnostic {
  readonly volumeSize: readonly [number, number, number];
  readonly occupiedBlocks: number;
  readonly lightSourceBlocks: number;
  readonly activeLightSourceBlocks: number;
  readonly inactiveLightSourceBlocks: number;
  readonly volumeCells: number;
  readonly rayCount: number;
  readonly rayLength: number;
  readonly colorPerm: number;
  readonly lightScale: number;
  readonly lightSourceTypes: readonly string[];
}

interface IsanthP1Diagnostic {
  readonly source: string;
  readonly blockConfigBlocks: number;
  readonly mappedBlockDefinitions: number;
  readonly textureLayers: number;
  readonly normalTextureLayers: number;
  readonly maxAtlasTextureId: number;
  readonly maxBlockTextureId: number;
  readonly invalidTextureIds: readonly IsanthP1TextureIssue[];
  readonly activationTextureBlocks: number;
  readonly extendedTextureBlocks: number;
  readonly reactorChamberSpecificBlocks: number;
  readonly resourceInjectionBlocks: number;
  readonly buildModeOnlyBlocks: number;
  readonly rawAnimatedBlocks: number;
  readonly textureAnimatedBlocks: number;
  readonly staticAnimatedBlocks: readonly IsanthP1BlockCount[];
  readonly sceneStaticAnimatedBlocks: readonly IsanthP1BlockCount[];
  readonly sceneTextureAnimatedBlocks: readonly IsanthP1BlockCount[];
}

interface IsanthP1BlockCount {
  readonly id: number;
  readonly name: string;
  readonly count: number;
}

interface IsanthP1TextureIssue {
  readonly id: number;
  readonly name: string;
  readonly side: number;
  readonly textureId: number;
  readonly reason: string;
}


interface IsanthShadowDiagnostic {
  readonly enabled: boolean;
  readonly model: string;
  readonly mapSize: number;
  readonly strength: number;
  readonly bias: number;
  readonly splits: number;
  readonly farDistances: readonly [number, number, number, number];
  readonly casterMeshCount: number;
  readonly casterTriangleCount: number;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
}

interface IsanthSceneSun {
  readonly position: Vector3;
  readonly direction: Vector3;
  readonly ambient: Vector3;
  readonly diffuse: Vector3;
  readonly specular: Vector3;
  readonly sourceAmbient: Vector3;
  readonly occlusionFloor: number;
}

interface IsanthSceneSunDiagnostic {
  readonly position: readonly [number, number, number];
  readonly model: string;
  readonly direction: readonly [number, number, number];
  readonly ambient: readonly [number, number, number];
  readonly diffuse: readonly [number, number, number];
  readonly specular: readonly [number, number, number];
  readonly sourceAmbient: readonly [number, number, number];
  readonly occlusionFloor: number;
}


const STARMADE_MAIN_CONFIG_URL = "/starmade-assets/config/mainConfig.xml";
const STARMADE_LOD_MODEL_BASE_URL = "/starmade-assets/models/lod";
const ISANTH_BLOCK_LIGHT_RAY_COUNT = 128;
const ISANTH_BLOCK_LIGHT_CAST_BOOST = 1.0; // gather is now normalized by rayCount in the volume
// Preview fixture only: use the actual sector position for native image comparisons.
const ISANTH_PREVIEW_SUN_POSITION = new Vector3(450, 900, 0);
const ISANTH_STARMADE_DEFAULT_SUN_DIRECTION = ISANTH_PREVIEW_SUN_POSITION.clone().normalize();
const ISANTH_SCENE_SUN_AMBIENT = new Vector3(0.45, 0.45, 0.45);
const ISANTH_SCENE_SUN_DIFFUSE = new Vector3(1.0, 1.0, 1.0);
const ISANTH_SCENE_SUN_SPECULAR = new Vector3(0.45, 0.45, 0.45);
const ISANTH_SCENE_SUN_SOURCE_AMBIENT = new Vector3(0.05, 0.05, 0.05);
const ISANTH_SCENE_SUN_OCCLUSION_FLOOR = 0;
// StarMade-Open Shadow.getDepthSize(): BEST = 2048 (SIMPLE = 1024).
const ISANTH_SHADOW_MAP_SIZE = 2048;
const ISANTH_SHADOW_STRENGTH = 1; // Fully apply the native shadow coefficient.
const canvas = document.querySelector<HTMLCanvasElement>("#viewport");

if (!canvas) {
  throw new Error("missing #viewport canvas");
}

const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new Color(0x0f1117), 1);

const scene = new Scene();
scene.background = new Color(0x0f1117);

const camera = new PerspectiveCamera(50, 1, 0.1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 260;

const sceneSun = createIsanthSceneSun();

const [texturePack, smd3, decoderBlocks, mainConfigXml] = await Promise.all([
  loadStarMadeCubeTexturePack({
    baseUrl: "/starmade-assets/textures/block",
    customBaseUrl: "/starmade-assets/custom-block-textures",
    pack: "Default",
    tileSize: 256,
    includeCustom: true,
    includeNormals: true
  }),
  fetchJson<Smd3ScenePayload>("/starmade-assets/blueprints/isanth-smd3.json"),
  fetchJson<BlockConfigPayload>("/starmade-assets/config/block-config.json"),
  fetchText(STARMADE_MAIN_CONFIG_URL)
]);
const material = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  normalStrength: 1.0,
  lightPosition: sceneSun.position.clone()
});
const transparentMaterial = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  blended: true,
  normalStrength: 1.0,
  lightPosition: sceneSun.position.clone()
});
const cubeMaterials = [material, transparentMaterial] as const;
for (const cubeMaterial of cubeMaterials) {
  applyStarMadeSceneSunToShaderMaterial(cubeMaterial, sceneSun);
}
const blockDefinitions = createBlockDefinitionMap(decoderBlocks);
const lodModelRegistry = createStarMadeLodModelRegistry(parseStarMadeLodModelDefinitions(mainConfigXml));
const sceneEntities = createSceneEntities(smd3);
const isanthBlockLight = createStarMadeSegmentBlockLightScene({
  entities: sceneEntities,
  blockDefinitions,
  rayCount: ISANTH_BLOCK_LIGHT_RAY_COUNT
});
const allSegments = sceneEntities.flatMap((entity) => entity.segments);
const segmentLodBlocks = collectStarMadeLodBlockInstances({
  entities: sceneEntities,
  blockDefinitions,
  registry: lodModelRegistry,
  modelBaseUrl: STARMADE_LOD_MODEL_BASE_URL
});
const lodPrototypeResult = await loadStarMadeLodPrototypes(segmentLodBlocks);
const renderedLodBlockKeys = new Set(
  segmentLodBlocks
    .filter((entry) => lodPrototypeResult.prototypes.has(entry.modelReference.name))
    .map((entry) => entry.key)
);
const segmentRoot = new Group();
const entityRoots = new Map<string, Group>();
let renderedVertices = 0;
let renderedIndices = 0;
let opaqueSegmentMeshCount = 0;
let transparentSegmentMeshCount = 0;
let totalCulledBlocks = 0;
let totalLodHiddenBlocks = 0;
const opaqueSegmentDrawBucketCounts = createDrawBucketCounts();
const transparentSegmentDrawBucketCounts = createDrawBucketCounts();

for (const entity of sceneEntities) {
  const entityRoot = new Group();
  entityRoot.name = `entity:${entity.name}`;
  entityRoot.position.set(entity.offset[0], entity.offset[1], entity.offset[2]);
  entityRoots.set(entity.name, entityRoot);
  segmentRoot.add(entityRoot);

  for (const segment of entity.segments) {
    const segmentBatches = createStarMadeEncodedSegmentGeometryBatches({
      segment,
      blockDefinitions,
      neighborSegments: entity.segments,
      starMadeAtlasLayout: texturePack.layout,
      isBlockMeshed: (context) =>
        !renderedLodBlockKeys.has(starMadeSegmentBlockInstanceKey(entity.name, context.segment, context.index))
    });
    const blockLightOrigin = [
      segment.x - STARMADE_SEGMENT_DIM / 2 + entity.offset[0],
      segment.y - STARMADE_SEGMENT_DIM / 2 + entity.offset[1],
      segment.z - STARMADE_SEGMENT_DIM / 2 + entity.offset[2]
    ] as const;
    const renderBatches = [
      { geometry: segmentBatches.opaque, material, transparent: false },
      { geometry: segmentBatches.blended, material: transparentMaterial, transparent: true }
    ] as const;

    for (const batch of renderBatches) {
      const positionAttribute = batch.geometry.getAttribute("position");

      if (positionAttribute.count === 0) {
        continue;
      }

      applyStarMadeBlockLightToEncodedCubeGeometry(
        batch.geometry,
        blockLightOrigin,
        {
          volume: isanthBlockLight.volume,
          volumeShift: isanthBlockLight.shift,
          castBoost: ISANTH_BLOCK_LIGHT_CAST_BOOST,
          occlusionFloor: sceneSun.occlusionFloor
        }
      );
      const mesh = new Mesh(batch.geometry, batch.material);
      mesh.frustumCulled = true;

      if (batch.transparent) {
        mesh.renderOrder = 10;
      }

      entityRoot.add(mesh);
      renderedVertices += positionAttribute.count;
      renderedIndices += batch.geometry.index?.count ?? 0;

      if (batch.transparent) {
        transparentSegmentMeshCount++;
        addDrawBucketCounts(transparentSegmentDrawBucketCounts, batch.geometry);
      } else {
        opaqueSegmentMeshCount++;
        addDrawBucketCounts(opaqueSegmentDrawBucketCounts, batch.geometry);
      }
    }
    totalCulledBlocks += segmentBatches.culledBlockCount;
    totalLodHiddenBlocks += segmentBatches.lodHiddenBlockCount;
  }
}
const segmentMeshCount = opaqueSegmentMeshCount + transparentSegmentMeshCount;

const lodStats = addStarMadeLodInstances(
  segmentLodBlocks,
  lodPrototypeResult.prototypes,
  {
    volume: isanthBlockLight.volume,
    volumeShift: isanthBlockLight.shift,
    sunOcclusionFloor: ISANTH_SCENE_SUN_OCCLUSION_FLOOR,
    sun: sceneSun
  },
  (entry) => entityRoots.get(entry.entityName) ?? segmentRoot
);
const lodShaderMaterials = collectStarMadeLodShaderMaterials(segmentRoot);

scene.add(segmentRoot);
const worldBounds = new Box3().setFromObject(segmentRoot);
const center = worldBounds.getCenter(new Vector3());
const size = worldBounds.getSize(new Vector3());
segmentRoot.position.sub(center);
const centeredBounds = new Box3().setFromObject(segmentRoot);
const shadowPipeline = createStarMadeDirectionalShadowPipeline({
  viewCamera: camera,
  lightDirection: sceneSun.direction.clone(),
  mapSize: ISANTH_SHADOW_MAP_SIZE,
  strength: ISANTH_SHADOW_STRENGTH,
  sceneBounds: centeredBounds,
  cubeTextureLayers: texturePack.layers
});
bindStarMadeDirectionalShadowRoot(shadowPipeline, segmentRoot);
for (const cubeMaterial of cubeMaterials) {
  shadowPipeline.applyToCubeMaterial(cubeMaterial);
}
// Block emission is already represented by vertex lighting. Additional spots are
// a host extension, not native block emission; keep them explicitly opt-in.
const experimentalBlockSpots = new URLSearchParams(location.search).get("experimentalBlockSpots") === "1";
const isanthSpotSources: StarMadeBlockLightSpotSource[] = isanthBlockLight.volume.sources
  .filter((s) => s.active !== false)
  .map((s) => ({
    position: blockLightGridToCenteredWorld(s.position ?? [s.grid[0], 0, s.grid[1]] as const, isanthBlockLight.shift, center),
    color: s.color,
    active: s.active
  }));
const isanthSceneCenter = [0, 0, 0] as const;
for (const cubeMaterial of cubeMaterials) {
  applyStarMadeBlockLightSourcesToCubeShaderMaterial(
    cubeMaterial, experimentalBlockSpots ? isanthSpotSources : [], isanthSceneCenter
  );
}
shadowPipeline.applyToLodObject3D(segmentRoot);
const displayAssets = await loadDisplayAssets();
const displayPanels = sceneEntities.flatMap(entity => attachDisplays(entityRoots.get(entity.name)!, blocksFromSegments(entity.segments), entity.displayTexts ?? [], displayAssets));
window.addEventListener("pagehide",()=>{displayPanels.forEach(panel=>panel.dispose());displayAssets.dispose();});

window.addEventListener("resize", resize);
resize();
renderer.setAnimationLoop(frame);

let didPublishReadyState = false;
const readyState: StarMadeSceneReadyState = {
  scene: "isanth-smd3",
  shipCount: 1,
  headerVersion: smd3.headerVersion,
  usedSlots: smd3.usedSlots,
  entities: sceneEntities.length,
  entitySummaries: sceneEntities.map((entity) => ({
    name: entity.name,
    offset: entity.offset,
    segments: entity.segments.length,
    blocks: entity.segments.reduce((total, segment) => total + (segment.blockCount ?? 0), 0)
  })),
  segments: allSegments.length,
  segmentOrigins: allSegments.map((segment) => [segment.x, segment.y, segment.z] as const),
  totalBlocks: allSegments.reduce((total, segment) => total + (segment.blockCount ?? 0), 0),
  cubeBlocks: sceneEntities.reduce(
    (total, entity) =>
      total + entity.segments.reduce(
        (entityTotal, segment) =>
          entityTotal + countCubeMeshedBlocks(entity.name, segment, blockDefinitions, renderedLodBlockKeys),
        0
      ),
    0
  ),
  redCrystalArmorBlocks: allSegments.reduce((total, segment) => total + countBlocksByName(segment, blockDefinitions, /red crystal armor/i), 0),
  lodBlocks: lodStats.instanceCount,
  missingLods: lodPrototypeResult.missing,
  meshes: segmentMeshCount + lodStats.meshCount,
  segmentMeshes: segmentMeshCount,
  opaqueSegmentMeshes: opaqueSegmentMeshCount,
  transparentSegmentMeshes: transparentSegmentMeshCount,
  culledSegmentBlocks: totalCulledBlocks,
  lodHiddenSegmentBlocks: totalLodHiddenBlocks,
  drawPassOrder: ["opaque", "blended", "LOD"],
  opaqueSegmentDrawBucketCounts,
  transparentSegmentDrawBucketCounts,
  opaqueSegmentMaterial: inspectSegmentMaterial(material),
  transparentSegmentMaterial: inspectSegmentMaterial(transparentMaterial),
  lodMeshes: lodStats.meshCount,
  lodVertices: lodStats.vertexCount,
  lodTriangles: lodStats.triangleCount,
  lodTexturedMaterials: lodStats.texturedMaterials,
  lodFallbackMaterials: lodStats.fallbackMaterials,
  lodEmissiveMaterials: lodStats.emissiveMaterials,
  lodTransparentMaterials: 0,
  lodDepthWriteDisabledMaterials: 0,
  lodNormalMappedMaterials: lodStats.normalMappedMaterials,
  lodSpriteStyleBlocks: lodStats.spriteStyleInstances,
  renderedVertices,
  renderedIndices,
  textureLayers: texturePack.layers.size,
  normalTextureLayers: texturePack.normalLayers?.size ?? 0,
  p1: inspectIsanthP1Diagnostics(
    decoderBlocks,
    blockDefinitions,
    sceneEntities,
    texturePack.layers.size,
    texturePack.normalLayers?.size ?? 0
  ),
  sceneSun: inspectIsanthSceneSun(sceneSun),
  blockLight: inspectIsanthBlockLight(isanthBlockLight),
  spotSourceCount: isanthSpotSources.length,
  shadow: inspectIsanthShadow(shadowPipeline),
  bounds: {
    min: vectorTuple(worldBounds.min),
    max: vectorTuple(worldBounds.max),
    size: vectorTuple(size)
  }
};

console.log("[StarMade-3D] Isanth SMD3 scene", readyState);
console.log("[StarMade-3D] Isanth P1 BlockConfig diagnostics", readyState.p1);
console.log("[StarMade-3D] Isanth shader debug", {
  opaque: readyState.opaqueSegmentMaterial,
  transparent: readyState.transparentSegmentMaterial,
  lod: {
    blocks: readyState.lodBlocks,
    meshes: readyState.lodMeshes,
    spriteStyleBlocks: readyState.lodSpriteStyleBlocks,
    normalMappedMaterials: readyState.lodNormalMappedMaterials,
    emissiveMaterials: readyState.lodEmissiveMaterials,
    transparentMaterials: readyState.lodTransparentMaterials,
    depthWriteDisabledMaterials: readyState.lodDepthWriteDisabledMaterials
  },
  renderedVertices,
  renderedIndices
});

function frame(): void {
  controls.update();
  camera.updateMatrixWorld(true);
  const now = performance.now();
  const _frameState = frame as unknown as { _lastMs?: number };
  const deltaS = Math.min(0.1, (_frameState._lastMs !== undefined ? (now - _frameState._lastMs) : 0) / 1000);
  _frameState._lastMs = now;

  for (const cubeMaterial of cubeMaterials) {
    updateStarMadeCubeShaderTime(cubeMaterial, deltaS);
    updateStarMadeCubeShaderClipPlanes(cubeMaterial, camera.near, camera.far);
    updateStarMadeCubeShaderMVP(cubeMaterial, camera.matrixWorldInverse, camera.projectionMatrix);
    cubeMaterial.uniforms.viewPos.value.copy(camera.position);
    updateStarMadeBlockLightSourcesViewSpace(cubeMaterial, camera.matrixWorldInverse);
  }

  for (const lodMaterial of lodShaderMaterials) {
    lodMaterial.uniforms.viewPos.value.copy(camera.position);
  }

  // All passes must observe the same animation frame.
  shadowPipeline.render(renderer);
  displayPanels.forEach(panel => {panel.updateTime(deltaS);panel.updateVisibility(camera);});
  renderer.render(scene, camera);

  if (!didPublishReadyState) {
    didPublishReadyState = true;
    (window as unknown as { __STARMADE_3D_READY__?: StarMadeSceneReadyState }).__STARMADE_3D_READY__ = readyState;
  }
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  fitCameraToBounds(size);
  camera.updateProjectionMatrix();
}

function fitCameraToBounds(size: Vector3): void {
  const verticalFov = (camera.fov * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
  const distanceForLength = size.z / (2 * Math.tan(horizontalFov / 2));
  const distance = Math.max(20, distanceForHeight, distanceForLength) * 1.22;

  camera.near = Math.max(0.1, distance / 500);
  camera.far = Math.max(1000, distance + Math.max(size.x, size.y, size.z) * 3);
  camera.position.set(distance, Math.max(12, size.y * 1.8), 0);
  controls.target.set(0, 0, 0);
  controls.maxDistance = Math.max(controls.maxDistance, distance * 4);
  camera.updateProjectionMatrix();
  controls.update();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function createBlockDefinitionMap(payload: BlockConfigPayload): ReadonlyMap<number, BlockDefinition> {
  return new Map(blockDefinitionsFromPayload(payload).map((block) => [block.id, block] as const));
}

function blockDefinitionsFromPayload(payload: BlockConfigPayload): readonly BlockDefinition[] {
  if (payload.elementInfo) {
    return payload.elementInfo.map((info) => blockDefinitionFromElementInfo(info));
  }

  return (payload.blocks ?? []).map((block) => blockDefinitionFromConfig(block));
}

function blockConfigPayloadBlockCount(payload: BlockConfigPayload): number {
  return payload.elementInfo?.length ?? payload.blocks?.length ?? 0;
}

function inspectIsanthP1Diagnostics(
  payload: BlockConfigPayload,
  blockDefinitions: ReadonlyMap<number, BlockDefinition>,
  sceneEntities: readonly SceneEntity[],
  textureLayers: number,
  normalTextureLayers: number
): IsanthP1Diagnostic {
  const sceneCounts = collectSceneBlockCounts(sceneEntities);
  const maxAtlasTextureId = textureLayers * 256 - 1;
  let maxBlockTextureId = 0;
  let activationTextureBlocks = 0;
  let extendedTextureBlocks = 0;
  let reactorChamberSpecificBlocks = 0;
  let resourceInjectionBlocks = 0;
  let buildModeOnlyBlocks = 0;
  let rawAnimatedBlocks = 0;
  let textureAnimatedBlocks = 0;
  const invalidTextureIds: IsanthP1TextureIssue[] = [];
  const staticAnimatedBlocks: IsanthP1BlockCount[] = [];
  const sceneStaticAnimatedBlocks: IsanthP1BlockCount[] = [];
  const sceneTextureAnimatedBlocks: IsanthP1BlockCount[] = [];

  for (const block of blockDefinitions.values()) {
    if (block.hasActivationTexture) {
      activationTextureBlocks++;
    }
    if (block.extendedTexture) {
      extendedTextureBlocks++;
    }
    if (block.reactorChamberSpecific) {
      reactorChamberSpecificBlocks++;
    }
    if (block.resourceInjectionIndex > 0) {
      resourceInjectionBlocks++;
    }
    if (block.drawOnlyInBuildMode) {
      buildModeOnlyBlocks++;
    }
    if (block.animated) {
      rawAnimatedBlocks++;
    }
    if (starMadeBlockUsesTextureAnimation(block)) {
      textureAnimatedBlocks++;
    }

    const sceneCount = sceneCounts.get(block.id) ?? 0;
    if (block.animated && !starMadeBlockUsesTextureAnimation(block)) {
      const entry = { id: block.id, name: block.name, count: sceneCount };
      staticAnimatedBlocks.push(entry);

      if (sceneCount > 0) {
        sceneStaticAnimatedBlocks.push(entry);
      }
    } else if (starMadeBlockUsesTextureAnimation(block) && sceneCount > 0) {
      sceneTextureAnimatedBlocks.push({ id: block.id, name: block.name, count: sceneCount });
    }

    for (let side = 0; side < block.textureIds.length; side++) {
      const textureId = block.textureIds[side] ?? 0;
      maxBlockTextureId = Math.max(maxBlockTextureId, Math.abs(textureId));
      addTextureIssueIfInvalid(invalidTextureIds, block, side, textureId, maxAtlasTextureId, "base");

      if (block.hasActivationTexture) {
        const inactiveTextureId = textureId + 1;
        maxBlockTextureId = Math.max(maxBlockTextureId, Math.abs(inactiveTextureId));
        addTextureIssueIfInvalid(invalidTextureIds, block, side, inactiveTextureId, maxAtlasTextureId, "inactive +1");
      }
    }
  }

  return {
    source: payload.source ?? "Decoder BlockConfig; texture animation uses StarMade-3D P1 classifier",
    blockConfigBlocks: blockConfigPayloadBlockCount(payload),
    mappedBlockDefinitions: blockDefinitions.size,
    textureLayers,
    normalTextureLayers,
    maxAtlasTextureId,
    maxBlockTextureId,
    invalidTextureIds,
    activationTextureBlocks,
    extendedTextureBlocks,
    reactorChamberSpecificBlocks,
    resourceInjectionBlocks,
    buildModeOnlyBlocks,
    rawAnimatedBlocks,
    textureAnimatedBlocks,
    staticAnimatedBlocks: staticAnimatedBlocks.sort(sortBlockCountById),
    sceneStaticAnimatedBlocks: sceneStaticAnimatedBlocks.sort(sortBlockCountById),
    sceneTextureAnimatedBlocks: sceneTextureAnimatedBlocks.sort(sortBlockCountById)
  };
}

function addTextureIssueIfInvalid(
  target: IsanthP1TextureIssue[],
  block: BlockDefinition,
  side: number,
  textureId: number,
  maxAtlasTextureId: number,
  reason: string
): void {
  if (textureId < 0 || textureId > maxAtlasTextureId) {
    target.push({
      id: block.id,
      name: block.name,
      side,
      textureId,
      reason
    });
  }
}

function collectSceneBlockCounts(sceneEntities: readonly SceneEntity[]): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();

  for (const entity of sceneEntities) {
    for (const segment of entity.segments) {
      for (const block of segment.blocks) {
        if (!block || block.type === 0) {
          continue;
        }

        counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
      }
    }
  }

  return counts;
}

function sortBlockCountById(a: IsanthP1BlockCount, b: IsanthP1BlockCount): number {
  return a.id - b.id;
}

function createIsanthSceneSun(): IsanthSceneSun {
  return {
    position: ISANTH_PREVIEW_SUN_POSITION.clone(),
    direction: ISANTH_STARMADE_DEFAULT_SUN_DIRECTION.clone(),
    ambient: ISANTH_SCENE_SUN_AMBIENT.clone(),
    diffuse: ISANTH_SCENE_SUN_DIFFUSE.clone(),
    specular: ISANTH_SCENE_SUN_SPECULAR.clone(),
    sourceAmbient: ISANTH_SCENE_SUN_SOURCE_AMBIENT.clone(),
    occlusionFloor: ISANTH_SCENE_SUN_OCCLUSION_FLOOR
  };
}

function inspectIsanthSceneSun(sun: IsanthSceneSun): IsanthSceneSunDiagnostic {
  return {
    model: "Positional preview sun; not a captured native sector light",
    position: vectorTuple(sun.position),
    direction: vectorTuple(sun.direction),
    ambient: vectorTuple(sun.ambient),
    diffuse: vectorTuple(sun.diffuse),
    specular: vectorTuple(sun.specular),
    sourceAmbient: vectorTuple(sun.sourceAmbient),
    occlusionFloor: sun.occlusionFloor
  };
}

function createDrawBucketCounts(): number[] {
  return [0, 0, 0, 0, 0, 0, 0];
}

function addDrawBucketCounts(target: number[], geometry: { readonly userData: Record<string, unknown> }): void {
  const counts = geometry.userData.starMadeFaceDrawBucketCounts;

  if (!Array.isArray(counts)) {
    return;
  }

  for (let index = 0; index < target.length; index++) {
    const value = counts[index];

    if (typeof value === "number") {
      target[index] += value;
    }
  }
}

function createSceneEntities(smd3: Smd3ScenePayload): readonly SceneEntity[] {
  if (smd3.entities && smd3.entities.length > 0) {
    return smd3.entities.map((entity) => ({
      name: entity.name,
      offset: entity.offset ?? [0, 0, 0],
      segments: entity.segments, displayTexts: entity.displayTexts
    }));
  }

  return [{ name: "root", offset: [0, 0, 0], segments: smd3.segments }];
}

function inspectIsanthBlockLight(blockLight: IsanthBlockLightScene): IsanthBlockLightDiagnostic {
  return {
    volumeSize: blockLight.volume.size,
    occupiedBlocks: blockLight.occupiedBlocks,
    lightSourceBlocks: blockLight.lightSourceBlocks,
    activeLightSourceBlocks: blockLight.activeLightSourceBlocks,
    inactiveLightSourceBlocks: blockLight.inactiveLightSourceBlocks,
    volumeCells: blockLight.volume.cells.length,
    rayCount: blockLight.volume.rayCount,
    rayLength: blockLight.volume.rayLength,
    colorPerm: blockLight.volume.colorPerm,
    lightScale: blockLight.volume.lightScale,
    lightSourceTypes: blockLight.lightSourceTypes
  };
}

function countCubeMeshedBlocks(
  entityName: string,
  segment: SegmentDataLike,
  blockDefinitions: ReadonlyMap<number, BlockDefinition>,
  renderedLodBlockKeys: ReadonlySet<string>
): number {
  let count = 0;

  for (let index = 0; index < segment.blocks.length; index++) {
    const block = segment.blocks[index];

    if (!block || block.type === 0) {
      continue;
    }

    if (!renderedLodBlockKeys.has(starMadeSegmentBlockInstanceKey(entityName, segment, index)) && blockDefinitions.has(block.type)) {
      count++;
    }
  }

  return count;
}

function countBlocksByName(
  segment: SegmentDataLike,
  blockDefinitions: ReadonlyMap<number, BlockDefinition>,
  pattern: RegExp
): number {
  let count = 0;

  for (let index = 0; index < segment.blocks.length; index++) {
    const block = segment.blocks[index];

    if (!block || block.type === 0) {
      continue;
    }

    const blockDefinition = blockDefinitions.get(block.type);

    if (blockDefinition && pattern.test(blockDefinition.name)) {
      count++;
    }
  }

  return count;
}

function inspectSegmentMaterial(material: ShaderMaterial): SegmentMaterialDiagnostic {
  const usesTextureArray = material.fragmentShader.includes("uniform sampler2DArray cTex;");
  const shaderDefines = inspectShaderDefines(material);

  return {
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    doubleSided: material.side !== FrontSide,
    extraAlpha: material.uniforms.extraAlpha?.value ?? 0,
    shaderDefines,
    usesOwnTangent: shaderDefines.includes("owntangent") && material.fragmentShader.includes("mat3(tangentVec, binormalVec, normal)"),
    usesShader4: shaderDefines.includes("shader4") && material.vertexShader.includes("int typeI = int(type);"),
    usesForce130: shaderDefines.includes("force130") && material.fragmentShader.includes("flat in int layer;"),
    usesTextureArray,
    uses2DMainTex: material.fragmentShader.includes("uniform sampler2D mainTex0;"),
    textureArrayColorSpace: usesTextureArray ? inspectTextureColorSpace(material.uniforms.cTex?.value) : null,
    normalTextureArrayColorSpace: usesTextureArray ? inspectTextureColorSpace(material.uniforms.cTexNormal?.value) : null,
    mainTextureColorSpace: inspectTextureColorSpace(material.uniforms.mainTex0?.value),
    normalTextureColorSpace: inspectTextureColorSpace(material.uniforms.normalTex0?.value),
    mainTextureFlipY: inspectTextureFlipY(material.uniforms.mainTex0?.value),
    normalTextureFlipY: inspectTextureFlipY(material.uniforms.normalTex0?.value),
    sunDirectionFromUniform: material.fragmentShader.includes("starMadeLightSources[0].position.xyz - vPos.xyz"),
    hasBlendedDiscard: material.fragmentShader.includes("if(alphMod < 0.01)"),
    finalAlphaFromTexture: material.fragmentShader.includes("lightedColor.a = alphMod;"),
    lightSourceSlots: Array.isArray(material.uniforms.starMadeLightSources?.value)
      ? material.uniforms.starMadeLightSources.value.length
      : 0,
    spotCount: material.uniforms.spotCount?.value ?? 0,
    shadowSplits: material.uniforms.starMadeShadowSplits?.value ?? 0,
    shadowStrength: material.uniforms.starMadeShadowStrength?.value ?? 0
  };
}

function inspectShaderDefines(material: ShaderMaterial): readonly string[] {
  const defines = material.userData.starMadeDefines;

  return Array.isArray(defines) ? defines.map(String) : [];
}

function inspectTextureFlipY(texture: unknown): boolean | null {
  const flipY = (texture as Texture | undefined)?.flipY;

  return typeof flipY === "boolean" ? flipY : null;
}

function inspectTextureColorSpace(texture: unknown): string | null {
  const colorSpace = (texture as Texture | undefined)?.colorSpace;

  if (colorSpace === NoColorSpace) {
    return "NoColorSpace";
  }

  return typeof colorSpace === "string" ? colorSpace : null;
}



function inspectIsanthShadow(pipeline: StarMadeDirectionalShadowPipeline): IsanthShadowDiagnostic {
  return {
    enabled: true,
    model: "single directional StarMade shadow map applied through cube/LOD shadowCoef()",
    mapSize: pipeline.mapSize,
    strength: pipeline.strength,
    bias: pipeline.bias,
    splits: pipeline.shadowParams.splits ?? 0,
    farDistances: vector4Tuple(pipeline.shadowParams.farDistances),
    casterMeshCount: pipeline.casterMeshCount,
    casterTriangleCount: pipeline.casterTriangleCount,
    cameraPosition: [pipeline.camera.position.x, pipeline.camera.position.y, pipeline.camera.position.z] as const,
    cameraTarget: [0, 0, 0] as const
  };
}











function blockLightGridToCenteredWorld(
  position: readonly [number, number, number],
  shift: readonly [number, number, number],
  center: Vector3
): readonly [number, number, number] {
  return [
    position[0] - shift[0] - center.x,
    position[1] - shift[1] - center.y,
    position[2] - shift[2] - center.z
  ];
}

function vectorTuple(vector: Vector3): readonly [number, number, number] {
  return [round3(vector.x), round3(vector.y), round3(vector.z)];
}

function vector4Tuple(vector: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } | undefined): readonly [number, number, number, number] {
  return vector ? [round3(vector.x), round3(vector.y), round3(vector.z), round3(vector.w)] : [0, 0, 0, 0];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
