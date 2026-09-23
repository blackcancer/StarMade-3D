import { loadStarMadeShaderSources } from '../../src/shaders/sources.js';
await loadStarMadeShaderSources('/starmade-assets/shaders.json');
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  FrontSide,
  Matrix4,
  Mesh,
  Object3D,
  Scene,
  ShaderMaterial,
  NoColorSpace,
  Texture,
  Vector3,
  Vector4,
  WebGLArrayRenderTarget,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  compileStarMadeWebgl2ShaderProgram,
  createStarMadeEncodedCubeGeometry,
  createPreviewScene,
  createStarMadeBlockLightBlockerFromBlock,
  createStarMadeBlockLightSolidFromBlock,
  createStarMadeBlockLightSourceFromBlock,
  applyStarMadeLodBlockLightToObject3D,
  collectStarMadeLodShaderMaterials,
  createStarMadeCubeShaderMaterial,
  createStarMadeCubeTextureArray,
  createStarMadeThreeShaderProgramSources,
  createStarMadeLodShaderMaterial,
  STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION,
  STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE,
  STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE,
  blockDefinitionFromConfig,
  computeStarMadeBlockLightSurface,
  computeStarMadeLodBlockLight,
  computeStarMadeLodBlockLightFromVolume,
  createStarMadeLodModelRegistry,
  OgreMaxLoader,
  getStarMadeBlockLightSurfaceTopAverageLight,
  loadStarMadeCubeTexturePack,
  parseStarMadeLodModelDefinitions,
  resolveStarMadeLodModelReference,
  tileIdToStarMadeLayer,
  tileIdToStarMadeLocalTile,
  computeStarMadeBlockLightVolume,
  type StarMadeLodBlockLight,
  type StarMadeBlockLightVolume,
  type StarMadeCubeAtlasLayout,
  type StarMadeLodModelDefinition,
  type StarMadeLodModelReference,
  applyStarMadeSceneSunToLodObject3D,
  createStarMadeDirectionalShadowPipeline,
  bindStarMadeDirectionalShadowRoot,
  applyStarMadeBlockLightToEncodedCubeGeometry,
  updateStarMadeCubeShaderTime,
} from "../../src";
import "./style.css";

const STARMADE_LOGIC_CONNECTION_TUBE_RADIUS = 0.1;
const STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS = 8;
const STARMADE_MAIN_CONFIG_URL = "/starmade-assets/config/mainConfig.xml";
const STARMADE_LOD_MODEL_BASE_URL = "/starmade-assets/models/lod";
const WHITE_LIGHT_SURFACE_SIZE = 20;
const WHITE_LIGHT_SURFACE_ORIGIN = new Vector3(15, -14.85, 0);
const WHITE_LIGHT_SURFACE_SOURCE_GRID = [10, 10] as const;
const RED_LIGHT_SURFACE_SOURCE_GRID = [4, 10] as const;
const BLUE_LIGHT_SURFACE_SOURCE_GRID = [16, 10] as const;
const DESK_LIGHT_SURFACE_GRID = [15, 12] as const;
const DESK_LIGHT_SHADOW_PROBE_GRID = [14, 13] as const;
const WHITE_LIGHT_BLOCKER_WALL_GRID_X = 13;
const WHITE_LIGHT_BLOCKER_WALL_HEIGHT = 3;
const WHITE_LIGHT_SURFACE_MAX_RADIUS = 10;
const SHOWCASE_BLOCK_LIGHT_SIZE = [40, 24, 28] as const;
const SHOWCASE_BLOCK_LIGHT_SHIFT = [8, 18, 14] as const;
// Preview point only; a native-frame comparison must provide the sector light.
const STARMADE_PREVIEW_SUN_POSITION = new Vector3(450, 900, 0);
// StarMade-Open Shadow.getDepthSize(): BEST = 2048 (SIMPLE = 1024).
const STARMADE_LOD_SHADOW_MAP_SIZE = 2048;
const STARMADE_CUBE_SHADOW_STRENGTH = 1;
const STARMADE_FACE_LABELS = ["front", "back", "top", "bottom", "right", "left"] as const satisfies readonly FaceLabel[];
const STARMADE_RUNTIME_GEOMETRY_MESH_LIMIT = 8;
const STARMADE_RUNTIME_GEOMETRY_VERTEX_SAMPLE_LIMIT = 8;
const STARMADE_RUNTIME_GEOMETRY_TRIANGLE_SAMPLE_LIMIT = 8;
const STARMADE_RUNTIME_CASTER_MESH_LIMIT = 4;
const STARMADE_RUNTIME_CASTER_VERTEX_SAMPLE_LIMIT = 4;
const STARMADE_RUNTIME_CASTER_TRIANGLE_SAMPLE_LIMIT = 4;

const canvas = document.querySelector<HTMLCanvasElement>("#viewport");

if (!canvas) {
  throw new Error("missing #viewport canvas");
}

const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const webglContext = renderer.getContext();
const cubeShaderDefines = ["INTATT", "texarray", "normaltexarray", "normalmap"] as const;
const cubeShaderSources = createStarMadeThreeShaderProgramSources("cube.quads13", {
  defines: cubeShaderDefines
});
const cubeShaderProbe =
  "WebGL2RenderingContext" in window && webglContext instanceof WebGL2RenderingContext
    ? compileStarMadeWebgl2ShaderProgram(webglContext, cubeShaderSources)
    : {
        ok: false,
        vertex: { ok: false, log: "WebGL2 is unavailable" },
        fragment: { ok: false, log: "WebGL2 is unavailable" },
        programLog: "WebGL2 is unavailable"
      };

const gravityUnitInput = {
  id: 56,
  name: "Gravity Unit",
  textureIds: [288, 289, 290, 290, 290, 290],
  individualSides: 6,
  sideTexturesPointToOrientation: true,
  blockStyle: 0
};
const gravityUnit = blockDefinitionFromConfig(gravityUnitInput);
const slabInputs = [
  {
    id: 698,
    name: "Grey Basic Armor 1/4",
    textureIds: [33, 33, 33, 33, 33, 33],
    slabIds: [700, 699, 698],
    blockStyle: 0
  },
  {
    id: 699,
    name: "Grey Basic Armor 1/2",
    textureIds: [33, 33, 33, 33, 33, 33],
    slabIds: [700, 699, 698],
    blockStyle: 0
  },
  {
    id: 700,
    name: "Grey Basic Armor 3/4",
    textureIds: [33, 33, 33, 33, 33, 33],
    slabIds: [700, 699, 698],
    blockStyle: 0
  }
];
const slabs = slabInputs.map((input) => blockDefinitionFromConfig(input));
const wedgeInput = {
  id: 599,
  name: "Grey Basic Armor Wedge",
  textureIds: [33, 33, 33, 33, 33, 33],
  blockStyle: 1
};
const wedgeBlock = blockDefinitionFromConfig(wedgeInput);
const cornerInput = {
  id: 600,
  name: "Grey Basic Armor Corner",
  textureIds: [33, 33, 33, 33, 33, 33],
  blockStyle: 2
};
const cornerBlock = blockDefinitionFromConfig(cornerInput);
const tetraInput = {
  id: 601,
  name: "Grey Basic Armor Tetra",
  textureIds: [33, 33, 33, 33, 33, 33],
  blockStyle: 4
};
const tetraBlock = blockDefinitionFromConfig(tetraInput);
const pentaInput = {
  id: 602,
  name: "Grey Basic Armor Hepta",
  textureIds: [33, 33, 33, 33, 33, 33],
  blockStyle: 5
};
const pentaBlock = blockDefinitionFromConfig(pentaInput);
const normal24Input = {
  id: 608,
  name: "Rail Basic",
  textureIds: [33, 33, 33, 33, 33, 33],
  blockStyle: 6
};
const normal24Block = blockDefinitionFromConfig(normal24Input);
const spriteInput = {
  id: 93,
  name: "Blue Flowers",
  textureIds: [448, 448, 448, 448, 448, 448],
  transparent: true,
  blockStyle: 3
};
const spriteBlock = blockDefinitionFromConfig(spriteInput);
const activeLightInput = {
  id: 55,
  name: "White Light",
  textureIds: [64, 64, 64, 64, 64, 64],
  hasActivationTexture: true,
  lightSource: true,
  blockStyle: 0
};
const activeLightOnBlock = blockDefinitionFromConfig(activeLightInput);
const activeLightOffBlock = blockDefinitionFromConfig({
  ...activeLightInput,
  name: "White Light Inactive",
  textureIds: activeLightInput.textureIds.map((textureId) => textureId + 1)
});
const redLightBlock = blockDefinitionFromConfig({
  id: 282,
  name: "Red Light",
  textureIds: [68, 68, 68, 68, 68, 68],
  lightSource: true,
  lightSourceColor: [1, 0, 0, 1],
  blockStyle: 0
});
const blueLightBlock = blockDefinitionFromConfig({
  id: 283,
  name: "Blue Light",
  textureIds: [76, 76, 76, 76, 76, 76],
  lightSource: true,
  lightSourceColor: [0, 0.33333334, 1, 1],
  blockStyle: 0
});
const lodVisualBlocks = [
  {
    key: "white-rod",
    active: false,
    block: blockDefinitionFromConfig({
      id: 80,
      name: "White Rod Light",
      textureIds: [80, 80, 80, 80, 80, 80],
      transparent: true,
      lightSource: true,
      lodShape: "WhiteLightRod",
      lodShapeStyle: 1,
      blockStyle: 3
    })
  },
  {
    key: "pipe",
    active: false,
    block: blockDefinitionFromConfig({
      id: 613,
      name: "Pipe",
      textureIds: [124, 124, 124, 124, 124, 124],
      lodShape: "Pipe",
      lodShapeStyle: 1,
      blockStyle: 6
    })
  },
  {
    key: "white-bar",
    active: false,
    block: blockDefinitionFromConfig({
      id: 326,
      name: "White Light Bar",
      textureIds: [108, 108, 108, 108, 108, 108],
      lightSource: true,
      lodShape: "WhiteLightBar",
      lodShapeStyle: 2,
      blockStyle: 6
    })
  },
  {
    key: "button-active",
    active: true,
    block: blockDefinitionFromConfig({
      id: 598,
      name: "Small Button",
      textureIds: [443, 443, 443, 443, 443, 443],
      canActivate: true,
      hasActivationTexture: true,
      lodShape: "SmallButtonInactive",
      lodShapeActive: "SmallButtonActive",
      lodShapeStyle: 0,
      blockStyle: 0
    })
  }
] as const;
const deskLodBlock = blockDefinitionFromConfig({
  id: 975,
  name: "Blue Console Desk",
  textureIds: [27, 377, 377, 377, 377, 377],
  transparent: true,
  canActivate: true,
  individualSides: 6,
  lodShape: "BlueConsole",
  lodShapeStyle: 0,
  lodCollisionPhysical: true,
  blockStyle: 6
});
const greyBasicArmorBlock = blockDefinitionFromConfig({
  id: 5,
  name: "Grey Basic Armor",
  textureIds: [33, 33, 33, 33, 33, 33],
  blockStyle: 0
});
const whiteLightBlockerWallBlock = greyBasicArmorBlock;
const blockLightSurfaceSources = [
  { key: "red", label: "Red Light", block: redLightBlock, grid: RED_LIGHT_SURFACE_SOURCE_GRID },
  { key: "white", label: "White Light", block: activeLightOnBlock, grid: WHITE_LIGHT_SURFACE_SOURCE_GRID },
  { key: "blue", label: "Blue Light", block: blueLightBlock, grid: BLUE_LIGHT_SURFACE_SOURCE_GRID }
] as const;
const whiteLightBlockerWallEntries = Array.from({ length: WHITE_LIGHT_SURFACE_SIZE * WHITE_LIGHT_BLOCKER_WALL_HEIGHT }, (_, index) => {
  const gridZ = index % WHITE_LIGHT_SURFACE_SIZE;
  const level = Math.floor(index / WHITE_LIGHT_SURFACE_SIZE) + 1;

  return {
    grid: [WHITE_LIGHT_BLOCKER_WALL_GRID_X, gridZ] as const,
    position: [WHITE_LIGHT_BLOCKER_WALL_GRID_X, level, gridZ] as const
  };
});
const blockLightSurfaceSourceInputs = blockLightSurfaceSources.map((source) =>
  createStarMadeBlockLightSourceFromBlock(source.block, {
    grid: source.grid,
    active: true
  })
);
const whiteLightBlockerWallInputs = whiteLightBlockerWallEntries.map((entry) =>
  createStarMadeBlockLightBlockerFromBlock(whiteLightBlockerWallBlock, {
    grid: entry.grid,
    position: entry.position
  })
);
const blockLightSurfaceLightingWithoutDesk = computeStarMadeBlockLightSurface({
  size: WHITE_LIGHT_SURFACE_SIZE,
  sources: blockLightSurfaceSourceInputs,
  blockers: whiteLightBlockerWallInputs
});
const blockLightSurfaceLighting = computeStarMadeBlockLightSurface({
  size: WHITE_LIGHT_SURFACE_SIZE,
  sources: blockLightSurfaceSourceInputs,
  blockers: [
    ...whiteLightBlockerWallInputs,
    createStarMadeBlockLightBlockerFromBlock(deskLodBlock, {
      grid: DESK_LIGHT_SURFACE_GRID
    })
  ]
});
const lightReceiverBlock = greyBasicArmorBlock;
const animatedForcefieldInput = {
  id: 659,
  name: "Forcefield (Red)",
  textureIds: [224, 224, 224, 224, 224, 224],
  transparent: true,
  animated: true,
  canActivate: true,
  lightSource: true,
  lightSourceColor: [1, 0, 0, 0.06],
  blockStyle: 0
};
const animatedForcefieldBlock = blockDefinitionFromConfig(animatedForcefieldInput);
const logicBlockInputs = [
  {
    key: "button",
    id: 598,
    name: "Button",
    textureIds: [443, 443, 443, 443, 443, 443],
    canActivate: true,
    hasActivationTexture: true,
    drawLogicConnection: true,
    logicBlock: true,
    logicSignaledByRail: true,
    logicBlockButton: true,
    blockStyle: 0
  },
  {
    key: "activation",
    id: 332,
    name: "Activation Module",
    textureIds: [427, 427, 427, 427, 427, 427],
    canActivate: true,
    hasActivationTexture: true,
    drawLogicConnection: true,
    logicBlock: true,
    logicSignaledByRail: true,
    logicBlockButton: false,
    blockStyle: 0
  },
  {
    key: "not",
    id: 333,
    name: "NOT-Signal",
    textureIds: [433, 433, 433, 433, 433, 433],
    canActivate: true,
    hasActivationTexture: true,
    drawLogicConnection: true,
    logicBlock: true,
    blockStyle: 0
  },
  {
    key: "and",
    id: 334,
    name: "AND-Signal",
    textureIds: [437, 437, 437, 437, 437, 437],
    canActivate: true,
    hasActivationTexture: true,
    drawLogicConnection: true,
    logicBlock: true,
    blockStyle: 0
  },
  {
    key: "or",
    id: 335,
    name: "OR-Signal",
    textureIds: [435, 435, 435, 435, 435, 435],
    canActivate: true,
    hasActivationTexture: true,
    drawLogicConnection: true,
    logicBlock: true,
    blockStyle: 0
  },
  {
    key: "beam",
    id: 1489,
    name: "Logic Beam",
    textureIds: [798, 796, 800, 800, 796, 796],
    canActivate: true,
    hasActivationTexture: true,
    drawLogicConnection: true,
    logicBlock: true,
    logicBlockButton: true,
    individualSides: 6,
    blockStyle: 0
  }
] as const;
const logicBlocks = logicBlockInputs.map((input) => ({
  key: input.key,
  block: blockDefinitionFromConfig(input)
}));
const logicConnections = [
  { from: "button", to: "activation", active: true },
  { from: "activation", to: "and", active: true },
  { from: "not", to: "and", active: false },
  { from: "and", to: "or", active: true },
  { from: "or", to: "beam", active: true }
] as const;
const orientationPositions = [
  [-3.25, 1.35, 0],
  [-1.95, 1.35, 0],
  [-0.65, 1.35, 0],
  [0.65, 1.35, 0],
  [1.95, 1.35, 0],
  [3.25, 1.35, 0]
] as const;
const logicNodePositions = new Map(
  [
    ["button", [-3.25, -10.85, 0] as const],
    ["activation", [-1.95, -10.85, 0] as const],
    ["not", [-1.95, -12.05, 0] as const],
    ["and", [-0.65, -10.85, 0] as const],
    ["or", [0.65, -10.85, 0] as const],
    ["beam", [1.95, -10.85, 0] as const]
  ] satisfies ReadonlyArray<readonly [string, readonly [number, number, number]]>
);
const activeLightTestPositions = [
  [-1.3, -8.15, 0],
  [0, -8.15, 0],
  [1.3, -8.15, 0]
] as const;
const lightReceiverTestPositions = [
  [-1.3, -9.35, 0],
  [0, -9.35, 0],
  [1.3, -9.35, 0]
] as const;
const showcaseActivationParams = new URLSearchParams(window.location.search);
const showcaseInitialToggleLightActive =
  showcaseActivationParams.get("activation-toggle") === "0" ? showcaseActivationParams.get("active") === "1" : true;
const showcaseBlockLightSourceInputs = createShowcaseBlockLightSourceInputs(showcaseInitialToggleLightActive);
const showcaseBlockLightSolids = [
  ...Array.from({ length: WHITE_LIGHT_SURFACE_SIZE ** 2 }, (_, i) => {
    const p = whiteLightSurfaceCellPosition(i % WHITE_LIGHT_SURFACE_SIZE, Math.floor(i / WHITE_LIGHT_SURFACE_SIZE));
    return createShowcaseBlockLightSolid(lightReceiverBlock, [p.x,p.y,p.z], STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION);
  }),
  ...whiteLightBlockerWallEntries.map(entry => {
    const p = whiteLightSurfaceCellPosition(entry.grid[0], entry.grid[1]);
    return createShowcaseBlockLightSolid(whiteLightBlockerWallBlock, [p.x,p.y+entry.position[1],p.z], STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION);
  }),

  ...orientationPositions.map((position, orientation) =>
    createShowcaseBlockLightSolid(gravityUnit, position, orientation)
  ),
  ...slabs.map((block, index) =>
    createShowcaseBlockLightSolid(block, [-3.25 + index * 1.3, -0.95, 0] as const, STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION)
  ),
  ...[0, 1, 2, 3].map((orientation, index) =>
    createShowcaseBlockLightSolid(wedgeBlock, [0.65 + index * 1.3, -0.95, 0] as const, orientation)
  ),
  ...[0, 1, 2, 3].map((orientation, index) =>
    createShowcaseBlockLightSolid(cornerBlock, [0.65 + index * 1.3, -2.15, 0] as const, orientation)
  ),
  ...[0, 1, 2, 3].map((orientation, index) =>
    createShowcaseBlockLightSolid(tetraBlock, [0.65 + index * 1.3, -3.35, 0] as const, orientation)
  ),
  ...[0, 1, 2, 3].map((orientation, index) =>
    createShowcaseBlockLightSolid(pentaBlock, [0.65 + index * 1.3, -4.55, 0] as const, orientation)
  ),
  ...[0, 1, 2, 3].map((orientation, index) =>
    createShowcaseBlockLightSolid(normal24Block, [0.65 + index * 1.3, -5.75, 0] as const, orientation)
  ),
  ...[0, 1, 2, 3, 4, 5].map((orientation, index) =>
    createShowcaseBlockLightSolid(spriteBlock, [-3.25 + index * 1.3, -6.95, 0] as const, orientation)
  ),
  createShowcaseBlockLightSolid(activeLightOffBlock, activeLightTestPositions[0], STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION),
  createShowcaseBlockLightSolid(activeLightOnBlock, activeLightTestPositions[1], STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION),
  createShowcaseBlockLightSolid(activeLightOnBlock, activeLightTestPositions[2], STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION),
  ...lightReceiverTestPositions.map((position) =>
    createShowcaseBlockLightSolid(lightReceiverBlock, position, STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION)
  ),
  ...logicBlocks.map(({ block, key }) => {
    const position = logicNodePositions.get(key);

    if (!position) {
      throw new Error(`Missing visual-test logic node position for ${key}`);
    }

    return createShowcaseBlockLightSolid(block, position, STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION);
  })
];
const showcaseBlockLightVolumesByToggleState = {
  off: computeShowcaseBlockLightVolumes(false),
  on: computeShowcaseBlockLightVolumes(true)
} as const;

const texturePack = await loadStarMadeCubeTexturePack({
  baseUrl: "/starmade-assets/textures/block",
  customBaseUrl: "/starmade-assets/custom-block-textures",
  pack: "Default",
  tileSize: 256,
  includeCustom: true,
  includeNormals: true
});

const preview = createPreviewScene({
  block: gravityUnitInput,
  texturePack
});
preview.scene.remove(preview.cube);
preview.camera.position.set(13.5, 6.4, 22.8);
preview.camera.lookAt(6, -7.2, 0);
const controls = new OrbitControls(preview.camera, renderer.domElement);
controls.target.set(6, -7.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 55;
controls.update();
const autoRotateShapes = false;
const urlParams = new URLSearchParams(window.location.search);
const normalDebugMode = clampIntegerParam(urlParams.get("normal-debug"), 0, 4, 0);
const normalStrength = clampNumberParam(urlParams.get("normal-strength"), 0.1, 8, 1);
const activationAutoToggle = urlParams.get("activation-toggle") !== "0";
const experimentalTextureArray = await createStarMadeCubeTextureArray(texturePack);
const experimentalNormalTextureArray = await createStarMadeCubeTextureArray(texturePack, { source: "normal" });
const experimentalCubeMaterial = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  normalDebugMode,
  normalStrength,
  sun: { position: STARMADE_PREVIEW_SUN_POSITION }
});
const lightSourceCubeMaterial = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  normalDebugMode,
  normalStrength,
  sun: { position: STARMADE_PREVIEW_SUN_POSITION }
});
const spriteCubeMaterial = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  alphaDiscard: true,
  doubleSided: true,
  normalDebugMode,
  normalStrength,
  sun: { position: STARMADE_PREVIEW_SUN_POSITION }
});
const transparentCubeMaterial = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  blended: true,
  normalDebugMode,
  normalStrength,
  sun: { position: STARMADE_PREVIEW_SUN_POSITION }
});
const lightSourceTransparentCubeMaterial = createStarMadeCubeShaderMaterial({
  textureLayers: texturePack.layers,
  normalTextureLayers: texturePack.normalLayers,
  overlayMap: texturePack.overlay,
  blended: true,
  normalDebugMode,
  normalStrength,
  sun: { position: STARMADE_PREVIEW_SUN_POSITION }
});
const logicConnectionTubeMaterial = createLogicConnectionTubeMaterial();
const blockLightOff = [0, 0, 0] as const;
const experimentalCubes = orientationPositions.map((position, orientation) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: gravityUnit,
    orientation
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(position[0], position[1], position[2]);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const slabMeshes = slabs.map((block, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block,
    orientation: STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(-3.25 + index * 1.3, -0.95, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { block, cube, geometry };
});
const wedgeMeshes = [0, 1, 2, 3].map((orientation, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: wedgeBlock,
    orientation
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(0.65 + index * 1.3, -0.95, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const cornerMeshes = [0, 1, 2, 3].map((orientation, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: cornerBlock,
    orientation
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(0.65 + index * 1.3, -2.15, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const tetraMeshes = [0, 1, 2, 3].map((orientation, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: tetraBlock,
    orientation
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(0.65 + index * 1.3, -3.35, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const pentaMeshes = [0, 1, 2, 3].map((orientation, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: pentaBlock,
    orientation
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(0.65 + index * 1.3, -4.55, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const normal24Meshes = [0, 1, 2, 3].map((orientation, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: normal24Block,
    orientation
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  cube.position.set(0.65 + index * 1.3, -5.75, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const spriteOrientations = [0, 1, 2, 3, 4, 5] as const;
const spriteMeshes = spriteOrientations.map((orientation, index) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: spriteBlock,
    orientation
  });
  const cube = new Mesh(geometry, spriteCubeMaterial);
  cube.position.set(-3.25 + index * 1.3, -6.95, 0);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { cube, geometry, orientation };
});
const activeLightOffGeometry = createStarMadeEncodedCubeGeometry({
  starMadeAtlasLayout: texturePack.layout,
  block: activeLightOffBlock
});
const activeLightOnGeometry = createStarMadeEncodedCubeGeometry({
  starMadeAtlasLayout: texturePack.layout,
  block: activeLightOnBlock
});
const blockLightOn = blockLightVectorFromColor(activeLightOnBlock.lightSourceColor);
const activeLightMeshes = [
  {
    label: "off",
    block: activeLightOffBlock,
    geometry: activeLightOffGeometry,
    cube: new Mesh(activeLightOffGeometry, lightSourceCubeMaterial)
  },
  {
    label: "toggle",
    block: activeLightOffBlock,
    geometry: activeLightOffGeometry,
    cube: new Mesh(activeLightOffGeometry, lightSourceCubeMaterial)
  },
  {
    label: "on",
    block: activeLightOnBlock,
    geometry: activeLightOnGeometry,
    cube: new Mesh(activeLightOnGeometry, lightSourceCubeMaterial)
  }
] as const;
activeLightMeshes.forEach((entry, index) => {
  const position = activeLightTestPositions[index];

  entry.cube.position.set(position[0], position[1], position[2]);
  preview.scene.add(entry.cube);
});
const lightReceiverMeshes = [
  {
    label: "receiver-off",
    light: blockLightOff,
    geometry: createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: texturePack.layout,
      block: lightReceiverBlock,
      light: blockLightOff
    }),
    cube: new Mesh(undefined, experimentalCubeMaterial)
  },
  {
    label: "receiver-toggle",
    light: blockLightOff,
    geometry: createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: texturePack.layout,
      block: lightReceiverBlock,
      light: blockLightOff
    }),
    cube: new Mesh(undefined, experimentalCubeMaterial)
  },
  {
    label: "receiver-on",
    light: blockLightOn,
    geometry: createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: texturePack.layout,
      block: lightReceiverBlock,
      light: blockLightOff
    }),
    cube: new Mesh(undefined, experimentalCubeMaterial)
  }
] as const;
lightReceiverMeshes.forEach((entry, index) => {
  const position = lightReceiverTestPositions[index];

  entry.cube.geometry = entry.geometry;
  entry.cube.position.set(position[0], position[1], position[2]);
  applyVisualTestShowcaseLighting(entry.geometry, entry.cube.position);
  preview.scene.add(entry.cube);
});
const whiteLightSurfaceCells = Array.from({ length: WHITE_LIGHT_SURFACE_SIZE * WHITE_LIGHT_SURFACE_SIZE }, (_, index) => {
  const gridX = index % WHITE_LIGHT_SURFACE_SIZE;
  const gridZ = Math.floor(index / WHITE_LIGHT_SURFACE_SIZE);
  const light = whiteLightSurfaceLightForCell(gridX, gridZ);
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: lightReceiverBlock,
    light: blockLightOff
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  const position = whiteLightSurfaceCellPosition(gridX, gridZ);
  cube.position.copy(position);
  applyWhiteLightSurfaceFaceLighting(geometry, position);
  preview.scene.add(cube);

  return { gridX, gridZ, light, geometry, cube };
});
const whiteLightSurfaceSourceMeshes = blockLightSurfaceSources.map((source) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: source.block,
    light: blockLightVectorFromColor(source.block.lightSourceColor)
  });
  const cube = new Mesh(geometry, lightSourceCubeMaterial);
  cube.position.copy(whiteLightSurfaceCellPosition(source.grid[0], source.grid[1]).add(new Vector3(0, 1, 0)));
  preview.scene.add(cube);

  return { ...source, geometry, cube };
});
const whiteLightSurfaceSourceMesh =
  whiteLightSurfaceSourceMeshes.find((source) => source.key === "white") ??
  (() => {
    throw new Error("Missing white light surface source");
  })();
const whiteLightBlockerWallRoot = new Object3D();
whiteLightBlockerWallRoot.name = "White Light Blocker Wall";
const whiteLightBlockerWallMeshes = whiteLightBlockerWallEntries.map((entry) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block: whiteLightBlockerWallBlock,
    light: blockLightOff
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  const position = whiteLightSurfaceCellPosition(entry.grid[0], entry.grid[1]).add(new Vector3(0, entry.position[1], 0));

  cube.position.copy(position);
  applyWhiteLightSurfaceFaceLighting(geometry, position);
  whiteLightBlockerWallRoot.add(cube);

  return { ...entry, geometry, cube };
});
preview.scene.add(whiteLightBlockerWallRoot);
const logicBlockMeshes = logicBlocks.map(({ key, block }) => {
  const geometry = createStarMadeEncodedCubeGeometry({
    starMadeAtlasLayout: texturePack.layout,
    block,
    orientation: STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION
  });
  const cube = new Mesh(geometry, experimentalCubeMaterial);
  const position = logicNodePositions.get(key);

  if (!position) {
    throw new Error(`Missing visual-test logic node position for ${key}`);
  }

  cube.position.set(position[0], position[1], position[2]);
  applyVisualTestShowcaseLighting(geometry, cube.position);
  preview.scene.add(cube);

  return { key, block, cube, geometry };
});
const logicConnectionTubes = logicConnections.map((connection) => {
  const from = logicNodePositions.get(connection.from);
  const to = logicNodePositions.get(connection.to);

  if (!from || !to) {
    throw new Error(`Invalid visual-test logic connection ${connection.from} -> ${connection.to}`);
  }

  const start = new Vector3(from[0], from[1], from[2]);
  const end = new Vector3(to[0], to[1], to[2]);
  const geometry = createStarMadeLogicConnectionTubeGeometry(start, end);
  const tube = new Mesh(geometry, logicConnectionTubeMaterial);
  tube.renderOrder = 2;
  preview.scene.add(tube);

  return { ...connection, tube, geometry };
});
const visualTestShowcaseLightReceivers = [
  ...experimentalCubes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...slabMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...wedgeMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...cornerMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...tetraMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...pentaMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...normal24Meshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...spriteMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...lightReceiverMeshes.map(({ cube, geometry }) => ({ cube, geometry })),
  ...logicBlockMeshes.map(({ cube, geometry }) => ({ cube, geometry }))
] as const;
let visualTestShowcaseLightToggleState: boolean | null = null;
const animatedForcefieldGeometry = createStarMadeEncodedCubeGeometry({
  starMadeAtlasLayout: texturePack.layout,
  block: animatedForcefieldBlock
});
const animatedForcefieldMesh = new Mesh(animatedForcefieldGeometry, experimentalCubeMaterial);
animatedForcefieldMesh.material = animatedForcefieldBlock.lightSource
  ? animatedForcefieldBlock.transparent
    ? lightSourceTransparentCubeMaterial
    : lightSourceCubeMaterial
  : animatedForcefieldBlock.transparent
    ? transparentCubeMaterial
    : experimentalCubeMaterial;
animatedForcefieldMesh.position.set(3.25, -8.15, 0);
preview.scene.add(animatedForcefieldMesh);
const lodModelRegistry = createStarMadeLodModelRegistry(
  parseStarMadeLodModelDefinitions(await fetchText(STARMADE_MAIN_CONFIG_URL))
);
const lodVisualEntries = await Promise.all(
  lodVisualBlocks.map(async (entry, index) => {
    const modelReference = resolveBlockLodModelReference(entry.block, lodModelRegistry, entry.active);
    const root = await loadStarMadeLodObject(modelReference, { emissiveOn: entry.active });

    root.position.set(-3.25 + index * 1.55, -13.35, 0);
    preview.scene.add(root);

    return {
      ...entry,
      modelReference,
      root,
      diagnostic: inspectStarMadeLodObject(root, {
        blockId: entry.block.id,
        blockName: entry.block.name,
        lodShape: modelReference.name,
        lodShapeStyle: entry.block.lodShapeStyle,
        active: entry.active,
        sceneUrl: modelReference.sceneUrl,
        texturePath: modelReference.texturePath
      })
    };
  })
);
let lodTestDiagnostics = inspectStarMadeLodTest(lodVisualEntries, lodModelRegistry.size);
const deskLodModelReference = resolveBlockLodModelReference(deskLodBlock, lodModelRegistry, false);
const deskLodRoot = await loadStarMadeLodObject(deskLodModelReference, { emissiveOn: false });
const deskSurfaceLight = getStarMadeBlockLightSurfaceTopAverageLight(
  blockLightSurfaceLighting,
  DESK_LIGHT_SURFACE_GRID[0],
  DESK_LIGHT_SURFACE_GRID[1]
);
const deskLodLight = computeStarMadeLodBlockLight({
  surface: blockLightSurfaceLighting,
  grid: DESK_LIGHT_SURFACE_GRID
});
const deskLodVolumeLight = computeStarMadeLodBlockLightFromVolume({
  volume: blockLightSurfaceLighting.volume,
  position: [DESK_LIGHT_SURFACE_GRID[0], 1, DESK_LIGHT_SURFACE_GRID[1]]
});
const deskLodLightUniform = applyStarMadeLodBlockLight(deskLodRoot, deskLodVolumeLight);
applyStarMadeSceneSunToLodObject3D(deskLodRoot, { position: STARMADE_PREVIEW_SUN_POSITION });
deskLodRoot.position.copy(whiteLightSurfaceCellPosition(DESK_LIGHT_SURFACE_GRID[0], DESK_LIGHT_SURFACE_GRID[1]).add(new Vector3(0, 1, 0)));
preview.scene.add(deskLodRoot);
const lodVisualShadowCasters = lodVisualEntries
  .filter((entry) => !entry.block.lightSource)
  .map((entry) =>
    createStarMadeShadowCaster({
      key: `lod-${entry.key}`,
      label: entry.block.name,
      type: "lod",
      root: entry.root
    })
  );
const lodShadowCasterRoleDiagnostic = {
  lodCasterKeys: lodVisualShadowCasters.map((caster) => caster.key),
  lightSourceLodKeys: lodVisualEntries.filter((entry) => entry.block.lightSource).map((entry) => entry.key)
};
console.log("[StarMade-3D] LOD shadow caster roles", lodShadowCasterRoleDiagnostic);
console.log("[StarMade-3D] LOD shadow caster roles JSON", JSON.stringify(lodShadowCasterRoleDiagnostic));
// Native cube shadows belong to the main sun. The RGB block-light volume already
// includes voxel occluders; projecting three colored shadow masks over the whole
// material would incorrectly tint/darken the sun and multiply block light twice.
const sunShadowBounds = new Box3().setFromObject(preview.scene);
const sunShadowPipeline = createStarMadeDirectionalShadowPipeline({
  lightDirection: STARMADE_PREVIEW_SUN_POSITION.clone().sub(sunShadowBounds.getCenter(new Vector3())),
  sceneBounds: sunShadowBounds,
  viewCamera: preview.camera,
  mapSize: STARMADE_LOD_SHADOW_MAP_SIZE,
  strength: STARMADE_CUBE_SHADOW_STRENGTH,
  cubeTextureLayers: texturePack.layers
});
bindStarMadeDirectionalShadowRoot(sunShadowPipeline, preview.scene);
for (const material of [experimentalCubeMaterial, spriteCubeMaterial, transparentCubeMaterial,
  lightSourceCubeMaterial, lightSourceTransparentCubeMaterial]) {
  sunShadowPipeline.applyToCubeMaterial(material);
}
sunShadowPipeline.applyToLodObject3D(preview.scene);
lodTestDiagnostics = {
  ...lodTestDiagnostics,
  shadowReceiverMaterialCount: countStarMadeLodShadowReceivers(lodVisualEntries.map((entry) => entry.root))
};
const deskDirectionalShadowDiagnostic = inspectStarMadeSunShadowPipeline(sunShadowPipeline);
const deskLightDiagnostic = inspectStarMadeDeskLightTest(
  deskLodRoot,
  deskLodBlock,
  deskLodModelReference,
  deskSurfaceLight,
  deskLodLight,
  deskLodLightUniform,
  deskDirectionalShadowDiagnostic
);
installStarMadeVisualDebugHooks(deskLodRoot, []);
const experimentalProbeScene = new Scene();
experimentalProbeScene.add(new Mesh(experimentalCubes[0].geometry, experimentalCubeMaterial));
renderer.compile(experimentalProbeScene, preview.camera);

const spriteDebug = spriteMeshes.map(({ geometry, orientation }) => inspectEncodedGeometry(geometry, orientation));
updateVisualTestShowcaseLighting(showcaseInitialToggleLightActive);
const showcaseLightingDiagnostics = inspectShowcaseLightingEntries();
console.log(
  "[StarMade-3D] Showcase block light JSON",
  JSON.stringify({
    model: "toggle-aware global showcase volumes",
    sourcePositions: showcaseBlockLightSourceInputs.map((source) => ({
      color: source.color,
      grid: source.grid,
      position: source.position
    })),
    solidCount: showcaseBlockLightSolids.length,
    litEntryCount: showcaseLightingDiagnostics.filter((entry) => entry.maxLight.some((channel) => channel > 0)).length,
    saturatedEntryCount: showcaseLightingDiagnostics.filter((entry) => entry.maxLight.some((channel) => channel >= 31)).length,
    entries: showcaseLightingDiagnostics
  })
);

console.log("[StarMade-3D] Visual test loaded", {
  gravityUnit: {
    id: gravityUnit.id,
    name: gravityUnit.name,
    textureIds: gravityUnit.textureIds
  },
  wedge: {
    id: wedgeBlock.id,
    name: wedgeBlock.name
  },
  corner: {
    id: cornerBlock.id,
    name: cornerBlock.name
  },
  tetra: {
    id: tetraBlock.id,
    name: tetraBlock.name
  },
  penta: {
    id: pentaBlock.id,
    name: pentaBlock.name
  },
  normal24: {
    id: normal24Block.id,
    name: normal24Block.name
  },
  sprite: {
    id: spriteBlock.id,
    name: spriteBlock.name,
    textureIds: spriteBlock.textureIds,
    transparent: spriteBlock.transparent,
    shownOrientations: spriteOrientations
  },
  activation: {
    blockId: activeLightOffBlock.id,
    blockName: activeLightOffBlock.name,
    offTextureIds: activeLightOffBlock.textureIds,
    onTextureIds: activeLightOnBlock.textureIds,
    autoToggle: activationAutoToggle,
    lightSourceColor: activeLightOnBlock.lightSourceColor,
    encodedLightOff: blockLightOff,
    encodedLightOn: blockLightOn
  },
  animatedTexture: {
    blockId: animatedForcefieldBlock.id,
    blockName: animatedForcefieldBlock.name,
    textureIds: animatedForcefieldBlock.textureIds,
    animated: animatedForcefieldBlock.animated
  },
  logicConnections: {
    blocks: logicBlockMeshes.map(({ key, block }) => ({
      key,
      id: block.id,
      name: block.name,
      drawLogicConnection: block.drawLogicConnection,
      logicBlock: block.logicBlock,
      logicBlockButton: block.logicBlockButton,
      logicSignaledByRail: block.logicSignaledByRail
    })),
    connections: logicConnections
  },
  lod: lodTestDiagnostics,
  controls: {
    autoRotateShapes,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    target: [controls.target.x, controls.target.y, controls.target.z]
  },
  normalMaps: {
    loadedLayers: texturePack.normalLayers?.size ?? 0,
    textureArrayDepth: experimentalNormalTextureArray.image.depth,
    debugMode: normalDebugMode,
    strength: normalStrength,
    debugModes: {
      1: "raw normal texture sample after alpha discard",
      2: "decoded tangent-space bump after alpha discard",
      3: "TBN-transformed normal direction",
      4: "normal-mapped Lambert response"
    }
  }
});
console.log("[StarMade-3D] Cube render debug JSON", JSON.stringify(createCubeRenderDebugDiagnostics()));
console.table(
  spriteDebug.map((entry) => ({
    orientation: entry.orientation,
    topFace: entry.highestFace.label,
    topCenterY: round3(entry.highestFace.center[1]),
    bottomFace: entry.lowestFace.label,
    bottomCenterY: round3(entry.lowestFace.center[1]),
    sizeX: round3(entry.bounds.size[0]),
    sizeY: round3(entry.bounds.size[1]),
    sizeZ: round3(entry.bounds.size[2])
  }))
);
console.debug("[StarMade-3D] Sprite geometry diagnostics", spriteDebug);
console.debug("[StarMade-3D] Ogre LOD diagnostics", lodTestDiagnostics);

if (!cubeShaderProbe.ok) {
  console.error("[StarMade-3D] WebGL2 shader probe failed", cubeShaderProbe);
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  preview.camera.aspect = width / height;
  preview.camera.updateProjectionMatrix();
}

let previousFrameTime = performance.now();

function frame(): void {
  const now = performance.now();
  const deltaSeconds = (now - previousFrameTime) / 1000;
  previousFrameTime = now;
  const rotationY = now / 1000;
  const rotationX = Math.sin(now / 1300) * 0.12;
  for (const material of [experimentalCubeMaterial, lightSourceCubeMaterial, spriteCubeMaterial,
    transparentCubeMaterial, lightSourceTransparentCubeMaterial]) {
    updateStarMadeCubeShaderTime(material, deltaSeconds);
  }
  const textureAnimationFrame = experimentalCubeMaterial.uniforms.animationTime.value;
  const activationToggleActive = activationAutoToggle ? Math.floor(now / 1200) % 2 === 1 : urlParams.get("active") === "1";
  activeLightMeshes[1].cube.geometry = activationToggleActive ? activeLightOnGeometry : activeLightOffGeometry;
  updateVisualTestShowcaseLighting(activationToggleActive);
  logicConnectionTubeMaterial.uniforms.time.value = (now % 5000) / 5000;

  if (autoRotateShapes) {
    for (const { cube } of experimentalCubes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of slabMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of wedgeMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of cornerMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of tetraMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of pentaMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of normal24Meshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of spriteMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    for (const { cube } of activeLightMeshes) {
      cube.rotation.y = rotationY;
      cube.rotation.x = rotationX;
    }
    animatedForcefieldMesh.rotation.y = rotationY;
    animatedForcefieldMesh.rotation.x = rotationX;
  }

  controls.update();
  sunShadowPipeline.render(renderer);
  renderer.render(preview.scene, preview.camera);
  window.__STARMADE_3D_READY__ = {
    meshes: preview.scene.children.length,
    cubeVertices: experimentalCubes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0),
    experimentalRenderedVertices:
      experimentalCubes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      slabMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      wedgeMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      cornerMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      tetraMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      pentaMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      normal24Meshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      spriteMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      activeLightMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      lightReceiverMeshes.reduce((total, entry) => total + entry.cube.geometry.getAttribute("position").count, 0) +
      whiteLightSurfaceCells.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      whiteLightSurfaceSourceMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      logicBlockMeshes.reduce((total, entry) => total + entry.geometry.getAttribute("position").count, 0) +
      animatedForcefieldGeometry.getAttribute("position").count +
      lodTestDiagnostics.vertexCount,
    materialName: experimentalCubeMaterial.name,
    textureLayers: texturePack.layers.size,
    overlayLoaded: texturePack.overlay !== undefined,
    normalTextureLayers: texturePack.normalLayers?.size ?? 0,
    geometryGroups: experimentalCubes.reduce((total, entry) => total + entry.geometry.groups.length, 0),
    controls: {
      enabled: controls.enabled,
      enableDamping: controls.enableDamping,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      target: [round3(controls.target.x), round3(controls.target.y), round3(controls.target.z)],
      autoRotateShapes
    },
    orientationTest: {
      blockId: gravityUnit.id,
      blockName: gravityUnit.name,
      textureIds: gravityUnit.textureIds,
      defaultTextureOrientation: STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION,
      sideTexturesPointToOrientation: gravityUnit.sideTexturesPointToOrientation,
      orientations: experimentalCubes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        firstFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0)
      }))
    },
    slabTest: {
      blocks: slabMeshes.map(({ block, geometry }) => ({
        id: block.id,
        name: block.name,
        slab: block.slab,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count
      }))
    },
    wedgeTest: {
      blockId: wedgeBlock.id,
      blockName: wedgeBlock.name,
      blockStyle: wedgeBlock.blockStyle,
      orientations: wedgeMeshes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        angledFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(2 * 4),
        angledSecondaryCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getW(2 * 4)
      }))
    },
    cornerTest: {
      blockId: cornerBlock.id,
      blockName: cornerBlock.name,
      blockStyle: cornerBlock.blockStyle,
      orientations: cornerMeshes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        angledFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(1 * 4 + 2),
        angledSecondaryCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getW(1 * 4 + 2)
      }))
    },
    tetraTest: {
      blockId: tetraBlock.id,
      blockName: tetraBlock.name,
      blockStyle: tetraBlock.blockStyle,
      orientations: tetraMeshes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        angledFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(2 * 4),
        angledSecondaryCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getW(2 * 4)
      }))
    },
    pentaTest: {
      blockId: pentaBlock.id,
      blockName: pentaBlock.name,
      blockStyle: pentaBlock.blockStyle,
      orientations: pentaMeshes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        extraFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(6 * 4),
        extraSecondaryCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getW(6 * 4)
      }))
    },
    normal24Test: {
      blockId: normal24Block.id,
      blockName: normal24Block.name,
      blockStyle: normal24Block.blockStyle,
      orientations: normal24Meshes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        firstFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0)
      }))
    },
    spriteTest: {
      blockId: spriteBlock.id,
      blockName: spriteBlock.name,
      blockStyle: spriteBlock.blockStyle,
      transparent: spriteBlock.transparent,
      orientations: spriteMeshes.map(({ geometry, orientation }) => ({
        orientation,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        firstFaceCode: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0)
      })),
      diagnostics: spriteDebug
    },
    activationTest: {
      blockId: activeLightOffBlock.id,
      blockName: activeLightOffBlock.name,
      hasActivationTexture: activeLightOffBlock.hasActivationTexture,
      autoToggle: activationAutoToggle,
      toggleActive: activationToggleActive,
      offTextureIds: activeLightOffBlock.textureIds,
      onTextureIds: activeLightOnBlock.textureIds,
      entries: activeLightMeshes.map(({ label, block, cube }) => ({
        label,
        blockName: block.name,
        textureIds: block.textureIds,
        encodedVertices: cube.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        firstFaceCode: cube.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0),
        firstFace: decodeFaceCode(cube.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0))
      }))
    },
    blockLightTest: {
      sourceBlockId: activeLightOnBlock.id,
      sourceBlockName: activeLightOnBlock.name,
      sourceLightColor: activeLightOnBlock.lightSourceColor,
      encodedLightOff: blockLightOff,
      encodedLightOn: blockLightOn,
      toggleActive: activationToggleActive,
      entries: lightReceiverMeshes.map(({ label, cube }) => {
        const encoded = cube.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
        const vertexLights = Array.from({ length: encoded.count }, (_, index) => decodeLightCode(encoded.getX(index)));

        return {
          label,
          encodedVertices: encoded.count,
          firstVertexCode: encoded.getX(0),
          firstVertexLight: vertexLights[0],
          maxLight: vertexLights.reduce(
            (max, light) => [
              Math.max(max[0], light.red),
              Math.max(max[1], light.green),
              Math.max(max[2], light.blue)
            ] as [number, number, number],
            [0, 0, 0] as [number, number, number]
          ),
          materialMatchesOpaque: cube.material === experimentalCubeMaterial
        };
      })
    },
    showcaseLightTest: {
      model: "Previous visual-test blocks use toggle-aware global diagnostic volumes with the same source and block role rules",
      entries: inspectShowcaseLightingEntries()
    },
    blockLightSurfaceTest: {
      surfaceSize: WHITE_LIGHT_SURFACE_SIZE,
      layerHeight: 1,
      receiverBlockId: lightReceiverBlock.id,
      receiverBlockName: lightReceiverBlock.name,
      sourceBlockId: activeLightOnBlock.id,
      sourceBlockName: activeLightOnBlock.name,
      sourceGrid: WHITE_LIGHT_SURFACE_SOURCE_GRID,
      sourcePosition: toVectorTuple(whiteLightSurfaceSourceMesh.cube.position),
      sourceLightColor: activeLightOnBlock.lightSourceColor,
      sourceCount: whiteLightSurfaceSourceMeshes.length,
      sources: whiteLightSurfaceSourceMeshes.map((source) => ({
        key: source.key,
        label: source.label,
        blockId: source.block.id,
        blockName: source.block.name,
        grid: source.grid,
        position: toVectorTuple(source.cube.position),
        sourceLightColor: source.block.lightSourceColor,
        firstVertexLight: decodeLightCode(source.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getX(0))
      })),
      maxRadius: WHITE_LIGHT_SURFACE_MAX_RADIUS,
      pipeline: {
        model: "StarMade-Open Occlusion rays -> 3D air gather -> setLightFromAirBlock face transfer -> LOD sideData",
        rayCount: blockLightSurfaceLighting.rayCount,
        rayLength: blockLightSurfaceLighting.rayLength,
        colorPerm: blockLightSurfaceLighting.colorPerm,
        lightScale: blockLightSurfaceLighting.lightScale
      },
      encodedLightOn: blockLightOn,
      cellCount: whiteLightSurfaceCells.length,
      litCellCount: whiteLightSurfaceCells.filter((cell) =>
        whiteLightSurfaceCellTopLight(cell).some((channel) => channel > 0)
      ).length,
      lightHistogram: whiteLightSurfaceLightHistogram(whiteLightSurfaceCells),
      sourceFirstVertexLight: decodeLightCode(
        whiteLightSurfaceSourceMesh.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getX(0)
      ),
      blockerWall: {
        blockId: whiteLightBlockerWallBlock.id,
        blockName: whiteLightBlockerWallBlock.name,
        gridX: WHITE_LIGHT_BLOCKER_WALL_GRID_X,
        length: WHITE_LIGHT_SURFACE_SIZE,
        height: WHITE_LIGHT_BLOCKER_WALL_HEIGHT,
        blockCount: whiteLightBlockerWallMeshes.length,
        firstPosition: whiteLightBlockerWallMeshes[0] ? toVectorTuple(whiteLightBlockerWallMeshes[0].cube.position) : null,
        lastPosition: whiteLightBlockerWallMeshes.at(-1) ? toVectorTuple(whiteLightBlockerWallMeshes.at(-1)!.cube.position) : null,
        shadowCasterKey: "white-light-blocker-wall"
      },
      sampledCells: whiteLightSurfaceSampleCells().map((sample) => inspectWhiteLightSurfaceCell(sample[0], sample[1])),
      desk: deskLightDiagnostic,
      behavior: {
        rayStopsAtFirstSurface: true,
        computedFaces: STARMADE_FACE_LABELS,
        litFaces: ["top"],
        nonLitFaces: ["bottom"],
        perVertexFalloff: true
      }
    },
    logicConnectionTest: {
      nodes: logicBlockMeshes.map(({ key, block, cube, geometry }) => ({
        key,
        blockId: block.id,
        blockName: block.name,
        textureIds: block.textureIds,
        canActivate: block.canActivate,
        hasActivationTexture: block.hasActivationTexture,
        drawLogicConnection: block.drawLogicConnection,
        logicBlock: block.logicBlock,
        logicBlockButton: block.logicBlockButton,
        logicSignaledByRail: block.logicSignaledByRail,
        position: [round3(cube.position.x), round3(cube.position.y), round3(cube.position.z)] as const,
        encodedVertices: geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
        firstFace: decodeFaceCode(geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0))
      })),
      connections: logicConnectionTubes.map(({ from, to, active, tube, geometry }) => ({
        from,
        to,
        active,
        style: "starmade-octagonal-tube",
        radius: STARMADE_LOGIC_CONNECTION_TUBE_RADIUS,
        radialSegments: STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS,
        winding: "outside",
        vertices: geometry.getAttribute("position").count,
        visible: tube.visible
      })),
      connectionTubeCount: logicConnectionTubes.length,
      tubeShaderTime: round3(logicConnectionTubeMaterial.uniforms.time.value)
    },
    lodTest: lodTestDiagnostics,
    animatedTextureTest: {
      blockId: animatedForcefieldBlock.id,
      blockName: animatedForcefieldBlock.name,
      animated: animatedForcefieldBlock.animated,
      transparent: animatedForcefieldBlock.transparent,
      textureIds: animatedForcefieldBlock.textureIds,
      animationFrameCount: 4,
      animationTime: textureAnimationFrame,
      materialAnimationTime: transparentCubeMaterial.uniforms.animationTime.value,
      materialTransparent: transparentCubeMaterial.transparent,
      materialDepthWrite: transparentCubeMaterial.depthWrite,
      materialExtraAlpha: transparentCubeMaterial.uniforms.extraAlpha.value,
      meshUsesTransparentMaterial: animatedForcefieldMesh.material === transparentCubeMaterial,
      encodedVertices: animatedForcefieldGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
      firstFaceCode: animatedForcefieldGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0),
      firstFace: decodeFaceCode(animatedForcefieldGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0))
    },
    experimentalMaterial: {
      name: experimentalCubeMaterial.name,
      glslVersion: experimentalCubeMaterial.glslVersion ?? "",
      textureArrayDepth: experimentalTextureArray.image.depth,
      textureArrayWidth: experimentalTextureArray.image.width,
      textureArrayHeight: experimentalTextureArray.image.height,
      normalMapped:
        experimentalCubeMaterial.uniforms.normalTex0.value === texturePack.normalLayers?.get(0)
        || experimentalCubeMaterial.uniforms.cTexNormal.value === experimentalNormalTextureArray,
      normalTextureArrayDepth: experimentalNormalTextureArray.image.depth,
      normalTextureArrayWidth: experimentalNormalTextureArray.image.width,
      normalTextureArrayHeight: experimentalNormalTextureArray.image.height,
      normalDebugMode: experimentalCubeMaterial.uniforms.starMadeNormalDebugMode.value,
      normalStrength: experimentalCubeMaterial.uniforms.starMadeNormalStrength.value,
      hasOverlay: experimentalCubeMaterial.uniforms.overlayTex.value !== undefined,
      transparent: experimentalCubeMaterial.transparent,
      depthWrite: experimentalCubeMaterial.depthWrite,
      side: experimentalCubeMaterial.side,
      spriteTransparent: spriteCubeMaterial.transparent,
      spriteDepthWrite: spriteCubeMaterial.depthWrite,
      spriteSide: spriteCubeMaterial.side,
      cubeShadowUniforms: {
        experimental: readShaderShadowUniforms(experimentalCubeMaterial),
        sprite: readShaderShadowUniforms(spriteCubeMaterial),
        transparent: readShaderShadowUniforms(transparentCubeMaterial)
      },
      spriteMeshesUseSpriteMaterial: spriteMeshes.every(({ cube }) => cube.material === spriteCubeMaterial),
      gravitySide: experimentalCubes[0].cube.material === experimentalCubeMaterial ? experimentalCubeMaterial.side : -1,
      extraAlpha: experimentalCubeMaterial.uniforms.extraAlpha.value,
      encodedVertices:
        experimentalCubes.reduce(
          (total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
          0
        ) +
        slabMeshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        wedgeMeshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        cornerMeshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        tetraMeshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        pentaMeshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        normal24Meshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        spriteMeshes.reduce((total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count, 0) +
        activeLightMeshes.reduce(
          (total, entry) => total + entry.cube.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
          0
        ) +
        lightReceiverMeshes.reduce(
          (total, entry) => total + entry.cube.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
          0
        ) +
        logicBlockMeshes.reduce(
          (total, entry) => total + entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
          0
        ) +
        animatedForcefieldGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count,
      encodedAttributeItemSize: experimentalCubes[0].geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).itemSize
    },
    shaderProbe: {
      id: cubeShaderSources.id,
      target: cubeShaderSources.target,
      defines: cubeShaderSources.defines,
      ok: cubeShaderProbe.ok,
      vertexOk: cubeShaderProbe.vertex.ok,
      fragmentOk: cubeShaderProbe.fragment.ok,
      vertexLog: cubeShaderProbe.vertex.log,
      fragmentLog: cubeShaderProbe.fragment.log,
      programLog: cubeShaderProbe.programLog
    }
  };
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
frame();

declare global {
  interface Window {
    __STARMADE_3D_READY__?: {
      meshes: number;
      cubeVertices: number;
      experimentalRenderedVertices: number;
      materialName: string;
      textureLayers: number;
      overlayLoaded: boolean;
      normalTextureLayers: number;
      geometryGroups: number;
      controls: {
        enabled: boolean;
        enableDamping: boolean;
        minDistance: number;
        maxDistance: number;
        target: readonly [number, number, number];
        autoRotateShapes: boolean;
      };
      orientationTest: {
        blockId: number;
        blockName: string;
        textureIds: readonly number[];
        defaultTextureOrientation: number;
        sideTexturesPointToOrientation: boolean;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          firstFaceCode: number;
        }[];
      };
      slabTest: {
        blocks: readonly {
          id: number;
          name: string;
          slab: number;
          encodedVertices: number;
        }[];
      };
      wedgeTest: {
        blockId: number;
        blockName: string;
        blockStyle: number;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          angledFaceCode: number;
          angledSecondaryCode: number;
        }[];
      };
      cornerTest: {
        blockId: number;
        blockName: string;
        blockStyle: number;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          angledFaceCode: number;
          angledSecondaryCode: number;
        }[];
      };
      tetraTest: {
        blockId: number;
        blockName: string;
        blockStyle: number;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          angledFaceCode: number;
          angledSecondaryCode: number;
        }[];
      };
      pentaTest: {
        blockId: number;
        blockName: string;
        blockStyle: number;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          extraFaceCode: number;
          extraSecondaryCode: number;
        }[];
      };
      normal24Test: {
        blockId: number;
        blockName: string;
        blockStyle: number;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          firstFaceCode: number;
        }[];
      };
      spriteTest: {
        blockId: number;
        blockName: string;
        blockStyle: number;
        transparent: boolean;
        orientations: readonly {
          orientation: number;
          encodedVertices: number;
          firstFaceCode: number;
        }[];
        diagnostics: readonly SpriteOrientationDiagnostic[];
      };
      activationTest: {
        blockId: number;
        blockName: string;
        hasActivationTexture: boolean;
        autoToggle: boolean;
        toggleActive: boolean;
        offTextureIds: readonly number[];
        onTextureIds: readonly number[];
        entries: readonly {
          label: string;
          blockName: string;
          textureIds: readonly number[];
          encodedVertices: number;
          firstFaceCode: number;
          firstFace: DecodedFaceCode;
        }[];
      };
      blockLightTest: {
        sourceBlockId: number;
        sourceBlockName: string;
        sourceLightColor: readonly [number, number, number, number];
        encodedLightOff: readonly [number, number, number];
        encodedLightOn: readonly [number, number, number];
        toggleActive: boolean;
        entries: readonly {
          label: string;
          encodedVertices: number;
          firstVertexCode: number;
          firstVertexLight: DecodedLightCode;
          materialMatchesOpaque: boolean;
        }[];
      };
      showcaseLightTest: {
        model: string;
        entries: readonly ShowcaseLightingEntryDiagnostic[];
      };
      blockLightSurfaceTest: BlockLightSurfaceDiagnostic;
      logicConnectionTest: {
        nodes: readonly {
          key: string;
          blockId: number;
          blockName: string;
          textureIds: readonly number[];
          canActivate: boolean;
          hasActivationTexture: boolean;
          drawLogicConnection: boolean;
          logicBlock: boolean;
          logicBlockButton: boolean;
          logicSignaledByRail: boolean;
          position: readonly [number, number, number];
          encodedVertices: number;
          firstFace: DecodedFaceCode;
        }[];
        connections: readonly {
          from: string;
          to: string;
          active: boolean;
          style: string;
          radius: number;
          radialSegments: number;
          winding: string;
          vertices: number;
          visible: boolean;
        }[];
        connectionTubeCount: number;
        tubeShaderTime: number;
      };
      lodTest: LodTestDiagnostic;
      animatedTextureTest: {
        blockId: number;
        blockName: string;
        animated: boolean;
        transparent: boolean;
        textureIds: readonly number[];
        animationFrameCount: number;
        animationTime: number;
        materialAnimationTime: number;
        materialTransparent: boolean;
        materialDepthWrite: boolean;
        materialExtraAlpha: number;
        meshUsesTransparentMaterial: boolean;
        encodedVertices: number;
        firstFaceCode: number;
        firstFace: DecodedFaceCode;
      };
      experimentalMaterial: {
        name: string;
        glslVersion: string;
        textureArrayDepth: number;
        textureArrayWidth: number;
        textureArrayHeight: number;
        normalMapped: boolean;
        normalTextureArrayDepth: number;
        normalTextureArrayWidth: number;
        normalTextureArrayHeight: number;
        normalDebugMode: number;
        normalStrength: number;
        hasOverlay: boolean;
        transparent: boolean;
        depthWrite: boolean;
        side: number;
        spriteTransparent: boolean;
        spriteDepthWrite: boolean;
        spriteSide: number;
        cubeShadowUniforms: {
          experimental: LodShadowUniformDiagnostic | null;
          sprite: LodShadowUniformDiagnostic | null;
          transparent: LodShadowUniformDiagnostic | null;
        };
        spriteMeshesUseSpriteMaterial: boolean;
        gravitySide: number;
        extraAlpha: number;
        encodedVertices: number;
        encodedAttributeItemSize: number;
      };
      shaderProbe: {
        id: string;
        target: string;
        defines: readonly string[];
        ok: boolean;
        vertexOk: boolean;
        fragmentOk: boolean;
        vertexLog: string;
        fragmentLog: string;
        programLog: string;
      };
    };
    __STARMADE_3D_DEBUG__?: {
      captureDiagnostics: () => StarMadeVisualRuntimeDiagnostic;
      inspectBlockerWall: () => BlockerWallRuntimeDiagnostic;
      getDeskLodUniforms: () => {
        readonly lightDiffuse: readonly (readonly [number, number, number, number])[];
        readonly lightVec: readonly (readonly [number, number, number])[];
        readonly blockLightUniform: readonly [number, number, number] | null;
        readonly shadowUniforms: LodShadowUniformDiagnostic | null;
        readonly emissiveOn: boolean | null;
      };
      setAllShadowStrength: (strength: number) => void;
      setDeskLodUniforms: (
        lightDiffuse: readonly (readonly [number, number, number, number])[],
        lightVec?: readonly (readonly [number, number, number])[],
        blockLight?: readonly [number, number, number]
      ) => void;
      setDeskLodEmissive: (enabled: boolean) => void;
    };
  }
}

type FaceLabel = "front" | "back" | "top" | "bottom" | "right" | "left";

interface SpriteFaceDiagnostic {
  label: FaceLabel;
  encodedSide: number;
  textureCorners: readonly number[];
  center: readonly [number, number, number];
  yRange: readonly [number, number];
}

interface SpriteOrientationDiagnostic {
  orientation: number;
  bounds: {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
    size: readonly [number, number, number];
  };
  highestFace: SpriteFaceDiagnostic;
  lowestFace: SpriteFaceDiagnostic;
  faces: readonly SpriteFaceDiagnostic[];
}

interface DecodedFaceCode {
  side: number;
  tex: number;
  layer: number;
  type: number;
  hitPoints: number;
  animated: number;
}

interface DecodedLightCode {
  vertexIndex: number;
  red: number;
  green: number;
  blue: number;
  shaderOcclusion: readonly [number, number, number];
}

interface DecodedSecondaryOcclusionCode {
  encoded: number;
  shader: number;
}

interface ShowcaseLightingEntryDiagnostic {
  key: string;
  position: readonly [number, number, number];
  sampleGrid: readonly [number, number, number];
  firstVertexLight: DecodedLightCode;
  firstSecondaryOcclusion: DecodedSecondaryOcclusionCode;
  secondaryOcclusionRange: {
    encoded: readonly [number, number];
    shader: readonly [number, number];
  };
  maxLight: readonly [number, number, number];
}

interface BlockLightSurfaceCellDiagnostic {
  grid: readonly [number, number];
  position: readonly [number, number, number];
  encodedLight: readonly [number, number, number];
  topVertexLights: readonly DecodedLightCode[];
  frontVertexLight: DecodedLightCode;
  bottomVertexLight: DecodedLightCode;
}

interface BlockerWallFaceRuntimeDiagnostic {
  readonly vertices: readonly DecodedLightCode[];
  readonly max: readonly [number, number, number];
  readonly min: readonly [number, number, number];
  readonly average: readonly [number, number, number];
  readonly canvas: StarMadeCanvasSampleDiagnostic;
}

interface BlockerWallBlockRuntimeDiagnostic {
  readonly grid: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly leftWhiteSide: BlockerWallFaceRuntimeDiagnostic;
  readonly rightBlueSide: BlockerWallFaceRuntimeDiagnostic;
}

interface BlockerWallRuntimeDiagnostic {
  readonly blockCount: number;
  readonly rightBlueSideWhiteLeakCount: number;
  readonly rightBlueSideBrightCount: number;
  readonly blocks: readonly BlockerWallBlockRuntimeDiagnostic[];
}

interface BlockLightSurfaceSourceDiagnostic {
  key: string;
  label: string;
  blockId: number;
  blockName: string;
  grid: readonly [number, number];
  position: readonly [number, number, number];
  sourceLightColor: readonly [number, number, number, number];
  firstVertexLight: DecodedLightCode;
}

interface BlockLightSurfaceDiagnostic {
  surfaceSize: number;
  layerHeight: number;
  receiverBlockId: number;
  receiverBlockName: string;
  sourceBlockId: number;
  sourceBlockName: string;
  sourceGrid: readonly [number, number];
  sourcePosition: readonly [number, number, number];
  sourceLightColor: readonly [number, number, number, number];
  sourceCount: number;
  sources: readonly BlockLightSurfaceSourceDiagnostic[];
  maxRadius: number;
  pipeline: {
    model: string;
    rayCount: number;
    rayLength: number;
    colorPerm: number;
    lightScale: number;
  };
  encodedLightOn: readonly [number, number, number];
  cellCount: number;
  litCellCount: number;
  lightHistogram: Record<string, number>;
  sourceFirstVertexLight: DecodedLightCode;
  blockerWall: {
    blockId: number;
    blockName: string;
    gridX: number;
    length: number;
    height: number;
    blockCount: number;
    firstPosition: readonly [number, number, number] | null;
    lastPosition: readonly [number, number, number] | null;
    shadowCasterKey: string;
  };
  sampledCells: readonly BlockLightSurfaceCellDiagnostic[];
  desk: DeskLightDiagnostic;
  behavior: {
    rayStopsAtFirstSurface: boolean;
    computedFaces: readonly FaceLabel[];
    litFaces: readonly FaceLabel[];
    nonLitFaces: readonly FaceLabel[];
    perVertexFalloff: boolean;
  };
}

interface DeskLightDiagnostic {
  blockId: number;
  blockName: string;
  grid: readonly [number, number];
  position: readonly [number, number, number];
  lodShape: string;
  lodShapeStyle: 0 | 1 | 2;
  sceneUrl: string;
  sampledSurfaceLight: readonly [number, number, number];
  blockLightUniform: readonly [number, number, number] | null;
  receivesLodLightUniforms: boolean;
  materialCount: number;
  sideDataSource: "surface" | "volume";
  primarySide: number;
  oppositePrimarySide: number;
  sideData: readonly (readonly [number, number, number, number] | null)[];
  legacySurfaceSideData: readonly (readonly [number, number, number, number] | null)[];
  lightDiffuse: readonly (readonly [number, number, number, number])[];
  lightVec: readonly (readonly [number, number, number])[];
  receivesLodShadowUniforms: boolean;
  lodShadowUniforms: LodShadowUniformDiagnostic | null;
  shadowProbe: DeskShadowProbeDiagnostic;
  directionalShadow: DeskDirectionalShadowDiagnostic;
  lod: LodModelDiagnostic;
}

interface LodShadowUniformDiagnostic {
  hasShadowMapArray: boolean;
  usesShadowMapArray: boolean;
  shadowMapArrayMode: number | null;
  hasShadowMap0: boolean;
  shadowStrength: number | null;
  shadowBias: number | null;
  shadowTexelSize: readonly [number, number] | null;
  shadowTexSize: readonly [number, number] | null;
  shadowFarDistances: readonly [number, number, number, number] | null;
  shadowSplits: number | null;
}

interface DeskShadowProbeDiagnostic {
  grid: readonly [number, number];
  beforeDeskBlocker: readonly [number, number, number];
  afterDeskBlocker: readonly [number, number, number];
  delta: readonly [number, number, number];
  deltaScore: number;
  blocked: boolean;
}

interface DeskDirectionalShadowDiagnostic {
  enabled: boolean;
  model: string;
  sourceGrids: readonly (readonly [number, number])[];
  sourceCount: number;
  sourceShadows: readonly StarMadeShadowSourceDiagnostic[];
  casterBounds: LodModelDiagnostic["bounds"];
  casterMeshCount: number;
  casterTriangleCount: number;
  casterCount: number;
  casters: readonly StarMadeShadowCasterDiagnostic[];
  shadowMapSize: number;
  shadowStrength: number;
  shadowBias: number;
  cameraPosition: readonly [number, number, number];
  cameraTarget: readonly [number, number, number];
  cameraNear: number;
  cameraFar: number;
}

interface StarMadeShadowSourceDiagnostic {
  key: string;
  label: string;
  grid: readonly [number, number];
  color: readonly [number, number, number];
  cameraPosition: readonly [number, number, number];
  cameraTarget: readonly [number, number, number];
}

type StarMadeShadowCasterType = "lod" | "cube" | "mesh";

interface StarMadeShadowCaster {
  readonly key: string;
  readonly label: string;
  readonly type: StarMadeShadowCasterType;
  readonly root: Object3D;
  readonly alphaDiscard?: boolean;
}

interface StarMadeShadowCasterDiagnostic {
  readonly key: string;
  readonly label: string;
  readonly type: StarMadeShadowCasterType;
  readonly alphaDiscard: boolean;
  readonly bounds: LodModelDiagnostic["bounds"];
  readonly meshCount: number;
  readonly triangleCount: number;
}

interface StarMadeShadowPipeline {
  readonly key: string;
  readonly label: string;
  readonly grid: readonly [number, number];
  readonly color: Vector3;
  readonly casters: readonly StarMadeShadowCaster[];
  readonly renderTarget: WebGLRenderTarget | WebGLArrayRenderTarget;
  readonly renderLayer: number;
  readonly shadowMatrix: Matrix4;
  readonly sourceDiagnostic: StarMadeShadowSourceDiagnostic;
  readonly casterDiagnostics: readonly StarMadeShadowCasterDiagnostic[];
  readonly casterBounds: Box3;
  readonly casterMeshCount: number;
  readonly casterTriangleCount: number;
  readonly cameraNear: number;
  readonly cameraFar: number;
  render(): void;
}

interface StarMadeVisualRuntimeDiagnostic {
  readonly frame: number;
  readonly renderer: {
    readonly calls: number;
    readonly triangles: number;
    readonly points: number;
    readonly lines: number;
  };
  readonly desk: {
    readonly position: readonly [number, number, number];
    readonly bounds: LodModelDiagnostic["bounds"];
    readonly uniforms: StarMadeRuntimeLodUniformDiagnostic;
    readonly materials: readonly StarMadeRuntimeMaterialDiagnostic[];
  };
  readonly canvasSamples: readonly StarMadeCanvasSampleDiagnostic[];
  readonly shadowSamples: readonly StarMadeShadowLayerRuntimeDiagnostic[];
  readonly geometry: {
    readonly desk: StarMadeRuntimeObjectGeometryDiagnostic;
    readonly pipelineCasters: readonly StarMadeRuntimePipelineGeometryDiagnostic[];
  };
}

interface StarMadeRuntimeLodUniformDiagnostic {
  readonly lightDiffuse: readonly (readonly [number, number, number, number])[];
  readonly lightVec: readonly (readonly [number, number, number])[];
  readonly blockLightUniform: readonly [number, number, number] | null;
  readonly shadowUniforms: LodShadowUniformDiagnostic | null;
  readonly emissiveOn: boolean | null;
}

interface StarMadeRuntimeMaterialDiagnostic {
  readonly name: string;
  readonly sourceMaterialName: string;
  readonly transparent: boolean;
  readonly depthWrite: boolean;
  readonly side: number;
  readonly visibleUniforms: readonly string[];
  readonly shaderChecks: {
    readonly hasNormalMatrixUniform: boolean;
    readonly transformsLodLightVecByNormalMatrix: boolean;
    readonly hasShadowCoef: boolean;
    readonly usesScalarShadowCoef: boolean;
    readonly hasTextureAlphaDiscard: boolean;
    readonly hasEmissiveBranch: boolean;
  };
}

interface StarMadeCanvasSampleDiagnostic {
  readonly key: string;
  readonly world: readonly [number, number, number];
  readonly canvas: readonly [number, number] | null;
  readonly rgba: readonly [number, number, number, number] | null;
}

interface StarMadeShadowLayerRuntimeDiagnostic {
  readonly key: string;
  readonly layer: number;
  readonly samples: readonly StarMadeShadowPointRuntimeDiagnostic[];
}

interface StarMadeShadowPointRuntimeDiagnostic {
  readonly key: string;
  readonly world: readonly [number, number, number];
  readonly uvw: readonly [number, number, number] | null;
  readonly mapPixel: readonly [number, number] | null;
  readonly mapRgba: readonly [number, number, number, number] | null;
  readonly sampledDepth: number | null;
  readonly receiverDepth: number | null;
  readonly occludedByShaderRule: boolean | null;
  readonly blockerCandidates?: readonly StarMadeShadowBlockerCandidateDiagnostic[];
}

interface StarMadeShadowBlockerCandidateDiagnostic {
  readonly casterKey: string;
  readonly casterType: string;
  readonly meshPath: string;
  readonly triangle: number;
  readonly worldCenter: readonly [number, number, number];
  readonly uvw: readonly [number, number, number];
  readonly mapPixel: readonly [number, number];
  readonly pixelDistance: number;
  readonly depthDelta: number;
  readonly receiverWouldBeOccluded: boolean;
}

interface StarMadeRuntimePipelineGeometryDiagnostic {
  readonly key: string;
  readonly layer: number;
  readonly excludedEmissiveCasterKeys: readonly string[];
  readonly casterKeys: readonly string[];
  readonly casters: readonly StarMadeRuntimeObjectGeometryDiagnostic[];
}

interface StarMadeRuntimeObjectGeometryDiagnostic {
  readonly key: string;
  readonly label: string;
  readonly type: string;
  readonly objectType: string;
  readonly visible: boolean;
  readonly matrixWorld: readonly number[];
  readonly rootPosition: readonly [number, number, number];
  readonly rootQuaternion: readonly [number, number, number, number];
  readonly rootScale: readonly [number, number, number];
  readonly bounds: LodModelDiagnostic["bounds"];
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
  readonly truncatedMeshes: boolean;
  readonly warnings: readonly string[];
  readonly meshes: readonly StarMadeRuntimeMeshGeometryDiagnostic[];
}

interface StarMadeRuntimeMeshGeometryDiagnostic {
  readonly path: string;
  readonly name: string;
  readonly type: string;
  readonly visible: boolean;
  readonly materialNames: readonly string[];
  readonly materialSides: readonly number[];
  readonly materialTransparent: readonly boolean[];
  readonly materialDepthWrite: readonly boolean[];
  readonly textures: readonly StarMadeRuntimeTextureDiagnostic[];
  readonly localBounds: LodModelDiagnostic["bounds"];
  readonly worldBounds: LodModelDiagnostic["bounds"];
  readonly matrixWorld: readonly number[];
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
  readonly groups: readonly StarMadeRuntimeGeometryGroupDiagnostic[];
  readonly attributes: readonly StarMadeRuntimeGeometryAttributeDiagnostic[];
  readonly vertexSamples: readonly StarMadeRuntimeVertexSampleDiagnostic[];
  readonly triangleSamples: readonly StarMadeRuntimeTriangleSampleDiagnostic[];
  readonly warnings: readonly string[];
}

interface StarMadeRuntimeGeometryGroupDiagnostic {
  readonly start: number;
  readonly count: number;
  readonly materialIndex: number | undefined;
}

interface StarMadeRuntimeGeometryAttributeDiagnostic {
  readonly name: string;
  readonly itemSize: number;
  readonly count: number;
  readonly normalized: boolean;
  readonly arrayType: string;
  readonly gpuType: string | number | null;
  readonly usage: string | number | null;
  readonly isInterleaved: boolean;
  readonly firstValues: readonly number[];
  readonly componentMin: readonly number[];
  readonly componentMax: readonly number[];
  readonly decodedSamples?: readonly StarMadeRuntimeEncodedVertexSampleDiagnostic[];
}

interface StarMadeRuntimeEncodedVertexSampleDiagnostic {
  readonly vertex: number;
  readonly raw: readonly number[];
  readonly light: DecodedLightCode;
  readonly face: DecodedFaceCode;
}

interface StarMadeRuntimeVertexSampleDiagnostic {
  readonly index: number;
  readonly position: readonly [number, number, number] | null;
  readonly world: readonly [number, number, number] | null;
  readonly normal: readonly [number, number, number] | null;
  readonly worldNormal: readonly [number, number, number] | null;
  readonly uv: readonly [number, number] | null;
  readonly encoded?: StarMadeRuntimeEncodedVertexSampleDiagnostic;
}

interface StarMadeRuntimeTriangleSampleDiagnostic {
  readonly triangle: number;
  readonly indices: readonly [number, number, number];
  readonly area: number;
  readonly center: readonly [number, number, number] | null;
  readonly worldCenter: readonly [number, number, number] | null;
  readonly faceNormal: readonly [number, number, number] | null;
  readonly worldFaceNormal: readonly [number, number, number] | null;
  readonly averageNormal: readonly [number, number, number] | null;
  readonly worldAverageNormal: readonly [number, number, number] | null;
  readonly normalDot: number | null;
  readonly uvCenter: readonly [number, number] | null;
  readonly mainTextureRgba: readonly [number, number, number, number] | null;
  readonly shadowSamples: readonly StarMadeShadowPointRuntimeDiagnostic[];
}

interface StarMadeRuntimeTextureDiagnostic {
  readonly uniform: string;
  readonly name: string;
  readonly uuid: string;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly flipY: boolean;
  readonly colorSpace: string;
}

interface LodMeshDiagnostic {
  name: string;
  type: string;
  vertexCount: number;
  indexCount: number;
  triangleCount: number;
  materialNames: readonly string[];
  sourceMaterialNames: readonly string[];
  hasDiffuseMap: boolean;
  hasEmissiveMap: boolean;
  usesStarMadeLodShader: boolean;
  hasTangentColorAttribute: boolean;
  transparent: boolean;
  depthWrite: boolean;
  bounds: {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
    size: readonly [number, number, number];
  };
}

interface LodModelDiagnostic {
  blockId: number;
  blockName: string;
  lodShape: string;
  lodShapeStyle: 0 | 1 | 2;
  active: boolean;
  sceneUrl: string;
  texturePath: string;
  objectType: string;
  rootPosition: readonly [number, number, number];
  rootQuaternion: readonly [number, number, number, number];
  rootScale: readonly [number, number, number];
  sceneUp: readonly [number, number, number];
  nodeRotation: readonly [number, number, number, number] | null;
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  meshes: readonly LodMeshDiagnostic[];
  bounds: {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
    size: readonly [number, number, number];
  };
}

interface LodTestDiagnostic {
  registryModelCount: number;
  modelCount: number;
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  shadowReceiverMaterialCount: number;
  entries: readonly LodModelDiagnostic[];
}

interface LodVisualEntry {
  readonly key: string;
  readonly active: boolean;
  readonly block: ReturnType<typeof blockDefinitionFromConfig>;
  readonly modelReference: StarMadeLodModelReference;
  readonly root: Object3D;
  readonly diagnostic: LodModelDiagnostic;
}

type MeshObject = Mesh<BufferGeometry, Mesh["material"]>;

interface LodMaterialMap {
  map?: Texture | null;
  emissiveMap?: Texture | null;
  normalMap?: Texture | null;
}

type LodShaderMaterial = ShaderMaterial & {
  userData: {
    hasEmissiveTexture?: boolean;
    sourceMaterialName?: string;
  };
};

type MutableVector4Like = {
  x: number;
  y: number;
  z: number;
  w: number;
  set: (x: number, y: number, z: number, w: number) => void;
};

type MutableVector3Like = {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => void;
};

type MutableVector2Like = {
  x: number;
  y: number;
  set: (x: number, y: number) => void;
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function resolveBlockLodModelReference(
  block: ReturnType<typeof blockDefinitionFromConfig>,
  registry: ReadonlyMap<string, StarMadeLodModelDefinition>,
  active: boolean
): StarMadeLodModelReference {
  const modelName = active && block.lodShapeActive ? block.lodShapeActive : block.lodShape;
  const reference = resolveStarMadeLodModelReference(modelName, registry, STARMADE_LOD_MODEL_BASE_URL);

  if (!reference) {
    throw new Error(`Missing StarMade LOD model "${modelName}" for block ${block.name}`);
  }

  return reference;
}

async function loadStarMadeLodObject(
  modelReference: StarMadeLodModelReference,
  options: { readonly emissiveOn?: boolean } = {}
): Promise<Object3D> {
  const loader = new OgreMaxLoader();
  loader.texturePath = modelReference.texturePath;
  const scene = await loader.load(
    modelReference.sceneUrl,
    undefined,
    undefined,
    (error) => console.error("[StarMade-3D] Ogre LOD load failed", modelReference.name, error)
  );

  return prepareStarMadeLodObject(scene, options);
}

function inspectStarMadeLodTest(entries: readonly LodVisualEntry[], registryModelCount: number): LodTestDiagnostic {
  return {
    registryModelCount,
    modelCount: entries.length,
    meshCount: entries.reduce((total, entry) => total + entry.diagnostic.meshCount, 0),
    vertexCount: entries.reduce((total, entry) => total + entry.diagnostic.vertexCount, 0),
    triangleCount: entries.reduce((total, entry) => total + entry.diagnostic.triangleCount, 0),
    shadowReceiverMaterialCount: countStarMadeLodShadowReceivers(entries.map((entry) => entry.root)),
    entries: entries.map((entry) => entry.diagnostic)
  };
}

function prepareStarMadeLodObject(root: Object3D, options: { readonly emissiveOn?: boolean } = {}): Object3D {
  replaceStaticSkinnedMeshes(root);

  root.traverse((object) => {
    if (!isBufferMesh(object)) {
      return;
    }

    object.frustumCulled = false;
    ensureStarMadeLodTangentColorAttribute(object.geometry);
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
    object.material = createStarMadeLodMaterial(object.material, options);
  });

  return root;
}

function replaceStaticSkinnedMeshes(root: Object3D): void {
  const replacements: Array<{ parent: Object3D; source: MeshObject; replacement: MeshObject }> = [];

  root.traverse((object) => {
    if (!isBufferMesh(object) || !isStaticSkinnedMesh(object) || !object.parent) {
      return;
    }

    const replacement = new Mesh(object.geometry, object.material);
    replacement.name = object.name;
    replacement.position.copy(object.position);
    replacement.quaternion.copy(object.quaternion);
    replacement.scale.copy(object.scale);
    replacement.visible = object.visible;
    replacement.castShadow = object.castShadow;
    replacement.receiveShadow = object.receiveShadow;
    replacement.renderOrder = object.renderOrder;
    replacement.userData = { ...object.userData };
    replacements.push({ parent: object.parent, source: object, replacement });
  });

  for (const { parent, source, replacement } of replacements) {
    const sourceIndex = parent.children.indexOf(source);
    parent.remove(source);

    if (sourceIndex >= 0) {
      parent.children.splice(sourceIndex, 0, replacement);
      replacement.parent = parent;
    } else {
      parent.add(replacement);
    }
  }
}

function isStaticSkinnedMesh(object: MeshObject): boolean {
  const skinnedObject = object as MeshObject & { isSkinnedMesh?: boolean };
  const hasSkinAttributes =
    object.geometry.getAttribute("skinIndex") !== undefined && object.geometry.getAttribute("skinWeight") !== undefined;

  return skinnedObject.isSkinnedMesh === true && !hasSkinAttributes;
}

function createStarMadeLodMaterial(
  material: Mesh["material"],
  options: { readonly emissiveOn?: boolean } = {}
): Mesh["material"] {
  const materials = Array.isArray(material) ? material : [material];
  const converted = materials.map((entry) => {
    entry.side = FrontSide;
    entry.depthWrite = true;
    entry.needsUpdate = true;

    const mappedMaterial = entry as typeof entry & LodMaterialMap;
    configureStarMadeLodTexture(mappedMaterial.map);
    configureStarMadeLodTexture(mappedMaterial.emissiveMap);
    configureStarMadeLodTexture(mappedMaterial.normalMap);

    const hasEmissiveTexture = mappedMaterial.emissiveMap !== undefined && mappedMaterial.emissiveMap !== null;

    const shaderMaterial = createStarMadeLodShaderMaterial({
      mainTexture: mappedMaterial.map,
      emissiveTexture: mappedMaterial.emissiveMap,
      normalTexture: mappedMaterial.normalMap,
      emissiveOn: options.emissiveOn ?? hasEmissiveTexture,
      blended: false
    }) as LodShaderMaterial;
    shaderMaterial.name = `StarMadeLodShaderMaterial:${entry.name || "unnamed"}`;
    shaderMaterial.transparent = false;
    shaderMaterial.depthWrite = true;
    shaderMaterial.userData.hasEmissiveTexture = hasEmissiveTexture;
    shaderMaterial.userData.sourceMaterialName = entry.name;

    return shaderMaterial;
  });

  return Array.isArray(material) ? converted : converted[0];
}

function applyStarMadeLodBlockLight(
  root: Object3D,
  lighting: StarMadeLodBlockLight
): {
  readonly materialCount: number;
  readonly blockLightUniform: readonly [number, number, number] | null;
  readonly primarySide: number;
  readonly oppositePrimarySide: number;
  readonly sideData: readonly (readonly [number, number, number, number] | null)[];
  readonly lightDiffuse: readonly (readonly [number, number, number, number])[];
  readonly lightVec: readonly (readonly [number, number, number])[];
  readonly applied: boolean;
} {
  const materials = collectStarMadeLodShaderMaterials(root);
  const appliedCount = applyStarMadeLodBlockLightToObject3D(root, lighting);

  return {
    materialCount: materials.length,
    blockLightUniform: readFirstLodBlockLight(materials),
    primarySide: lighting.primarySide,
    oppositePrimarySide: lighting.oppositePrimarySide,
    sideData: roundNullableRgbaList(lighting.sideData),
    lightDiffuse: readFirstLodLightDiffuse(materials),
    lightVec: readFirstLodLightVec(materials),
    applied: appliedCount > 0
  };
}

function inspectStarMadeDeskLightTest(
  root: Object3D,
  block: ReturnType<typeof blockDefinitionFromConfig>,
  modelReference: StarMadeLodModelReference,
  sampledSurfaceLight: readonly [number, number, number],
  legacySurfaceLighting: StarMadeLodBlockLight,
  lodLightUniform: ReturnType<typeof applyStarMadeLodBlockLight>,
  directionalShadow: DeskDirectionalShadowDiagnostic
): DeskLightDiagnostic {
  const lodMaterials = collectStarMadeLodShaderMaterials(root);
  const lodShadowUniforms = readFirstLodShadowUniforms(lodMaterials);

  return {
    blockId: block.id,
    blockName: block.name,
    grid: DESK_LIGHT_SURFACE_GRID,
    position: toVectorTuple(root.position),
    lodShape: modelReference.name,
    lodShapeStyle: block.lodShapeStyle,
    sceneUrl: modelReference.sceneUrl,
    sampledSurfaceLight,
    blockLightUniform: lodLightUniform.blockLightUniform,
    receivesLodLightUniforms: lodLightUniform.applied,
    materialCount: lodLightUniform.materialCount,
    sideDataSource: "volume",
    primarySide: lodLightUniform.primarySide,
    oppositePrimarySide: lodLightUniform.oppositePrimarySide,
    sideData: lodLightUniform.sideData,
    legacySurfaceSideData: roundNullableRgbaList(legacySurfaceLighting.sideData),
    lightDiffuse: lodLightUniform.lightDiffuse,
    lightVec: lodLightUniform.lightVec,
    receivesLodShadowUniforms: lodShadowUniforms?.shadowStrength !== null,
    lodShadowUniforms,
    shadowProbe: inspectDeskShadowProbe(),
    directionalShadow,
    lod: inspectStarMadeLodObject(root, {
      blockId: block.id,
      blockName: block.name,
      lodShape: modelReference.name,
      lodShapeStyle: block.lodShapeStyle,
      active: false,
      sceneUrl: modelReference.sceneUrl,
      texturePath: modelReference.texturePath
    })
  };
}

function inspectDeskShadowProbe(): DeskShadowProbeDiagnostic {
  const gridX = DESK_LIGHT_SHADOW_PROBE_GRID[0];
  const gridZ = DESK_LIGHT_SHADOW_PROBE_GRID[1];
  const before = getStarMadeBlockLightSurfaceTopAverageLight(blockLightSurfaceLightingWithoutDesk, gridX, gridZ);
  const after = getStarMadeBlockLightSurfaceTopAverageLight(blockLightSurfaceLighting, gridX, gridZ);

  return {
    grid: DESK_LIGHT_SHADOW_PROBE_GRID,
    beforeDeskBlocker: before,
    afterDeskBlocker: after,
    delta: [before[0] - after[0], before[1] - after[1], before[2] - after[2]] as const,
    deltaScore: before.reduce((score, channel, index) => score + Math.max(0, channel - after[index]), 0),
    blocked: after.some((channel, index) => channel < before[index])
  };
}

function readFirstLodLightDiffuse(materials: readonly LodShaderMaterial[]): readonly (readonly [number, number, number, number])[] {
  for (const material of materials) {
    const lightDiffuse = material.uniforms.lightDiffuse?.value;

    if (Array.isArray(lightDiffuse)) {
      return lightDiffuse.map((vector) => {
        const entry = vector as MutableVector4Like | undefined;
        return entry && typeof entry.x === "number"
          ? ([round3(entry.x), round3(entry.y), round3(entry.z), round3(entry.w)] as const)
          : ([0, 0, 0, 0] as const);
      });
    }
  }

  return [];
}

function readFirstLodLightVec(materials: readonly LodShaderMaterial[]): readonly (readonly [number, number, number])[] {
  for (const material of materials) {
    const lightVec = material.uniforms.lightVec?.value;

    if (Array.isArray(lightVec)) {
      return lightVec.map((vector) => {
        const entry = vector as MutableVector3Like | undefined;
        return entry && typeof entry.x === "number"
          ? ([round3(entry.x), round3(entry.y), round3(entry.z)] as const)
          : ([0, 0, 0] as const);
      });
    }
  }

  return [];
}

function readFirstLodBlockLight(materials: readonly LodShaderMaterial[]): readonly [number, number, number] | null {
  for (const material of materials) {
    const vector = material.uniforms.starMadeLodBlockLight?.value as MutableVector3Like | undefined;

    if (vector && typeof vector.x === "number") {
      return [round3(vector.x), round3(vector.y), round3(vector.z)] as const;
    }
  }

  return null;
}

function readShaderShadowUniforms(material: ShaderMaterial): LodShadowUniformDiagnostic | null {
  const texelSize = material.uniforms.starMadeShadowTexelSize?.value as MutableVector2Like | undefined;
  const texSize = material.uniforms.starMadeShadowTexSize?.value as MutableVector2Like | undefined;
  const farDistances = material.uniforms.starMadeShadowFarDistances?.value as MutableVector4Like | undefined;
  const strength = material.uniforms.starMadeShadowStrength?.value;
  const bias = material.uniforms.starMadeShadowBias?.value;
  const splits = material.uniforms.starMadeShadowSplits?.value;
  const mapArrayMode = material.uniforms.starMadeShadowMapArrayMode?.value;

  if (material.uniforms.starMadeShadowMap0 === undefined) {
    return null;
  }

  return {
    hasShadowMapArray:
      material.uniforms.starMadeShadowMapArray?.value !== undefined && material.uniforms.starMadeShadowMapArray.value !== null,
    usesShadowMapArray: material.uniforms.starMadeShadowUseMapArray?.value === true,
    shadowMapArrayMode: typeof mapArrayMode === "number" ? mapArrayMode : null,
    hasShadowMap0: material.uniforms.starMadeShadowMap0.value !== undefined && material.uniforms.starMadeShadowMap0.value !== null,
    shadowStrength: typeof strength === "number" ? round3(strength) : null,
    shadowBias: typeof bias === "number" ? round3(bias) : null,
    shadowTexelSize: texelSize && typeof texelSize.x === "number" ? ([round3(texelSize.x), round3(texelSize.y)] as const) : null,
    shadowTexSize: texSize && typeof texSize.x === "number" ? ([round3(texSize.x), round3(texSize.y)] as const) : null,
    shadowFarDistances:
      farDistances && typeof farDistances.x === "number"
        ? ([round3(farDistances.x), round3(farDistances.y), round3(farDistances.z), round3(farDistances.w)] as const)
        : null,
    shadowSplits: typeof splits === "number" ? splits : null
  };
}

function readFirstLodShadowUniforms(materials: readonly LodShaderMaterial[]): LodShadowUniformDiagnostic | null {
  for (const material of materials) {
    const shadowUniforms = readShaderShadowUniforms(material);

    if (shadowUniforms) {
      return shadowUniforms;
    }
  }

  return null;
}

function readFirstLodEmissiveOn(materials: readonly LodShaderMaterial[]): boolean | null {
  for (const material of materials) {
    const value = material.uniforms.emissiveOn?.value;

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function setStarMadeLodEmissive(root: Object3D, enabled: boolean): void {
  for (const material of collectStarMadeLodShaderMaterials(root)) {
    if (material.uniforms.emissiveOn) {
      material.uniforms.emissiveOn.value = enabled;
    }
  }
}

function installStarMadeVisualDebugHooks(deskRoot: Object3D, shadowPipelines: readonly StarMadeShadowPipeline[]): void {
  const getDeskLodUniforms = (): StarMadeRuntimeLodUniformDiagnostic => {
    const materials = collectStarMadeLodShaderMaterials(deskRoot);

    return {
      lightDiffuse: readFirstLodLightDiffuse(materials),
      lightVec: readFirstLodLightVec(materials),
      blockLightUniform: readFirstLodBlockLight(materials),
      shadowUniforms: readFirstLodShadowUniforms(materials),
      emissiveOn: readFirstLodEmissiveOn(materials)
    };
  };

  window.__STARMADE_3D_DEBUG__ = {
    captureDiagnostics: () => captureStarMadeVisualRuntimeDiagnostics(deskRoot, shadowPipelines, getDeskLodUniforms),
    inspectBlockerWall: () => inspectWhiteLightBlockerWall(),
    getDeskLodUniforms,
    setAllShadowStrength: (strength) => {
      setStarMadeShadowStrength([deskRoot, ...lodVisualEntries.map((entry) => entry.root)], [
        experimentalCubeMaterial,
        spriteCubeMaterial,
        transparentCubeMaterial
      ], strength);
    },
    setDeskLodUniforms: (lightDiffuse, lightVec = [], _blockLight) => {
      const resolvedLightVec =
        lightVec.length > 0
          ? lightVec
          : Array.from({ length: lightDiffuse.length }, () => [0, 1, 0] as const);

      applyStarMadeLodBlockLightToObject3D(deskRoot, {
        lightDiffuse,
        lightVec: resolvedLightVec
      });
    },
    setDeskLodEmissive: (enabled) => {
      setStarMadeLodEmissive(deskRoot, enabled);
    }
  };
}

function setStarMadeShadowStrength(roots: readonly Object3D[], materials: readonly ShaderMaterial[], strength: number): void {
  for (const root of roots) {
    for (const material of collectStarMadeLodShaderMaterials(root)) {
      if (material.uniforms.starMadeShadowStrength) {
        material.uniforms.starMadeShadowStrength.value = strength;
        material.needsUpdate = true;
      }
    }
  }

  for (const material of materials) {
    if (material.uniforms.starMadeShadowStrength) {
      material.uniforms.starMadeShadowStrength.value = strength;
      material.needsUpdate = true;
    }
  }
}

function captureStarMadeVisualRuntimeDiagnostics(
  deskRoot: Object3D,
  shadowPipelines: readonly StarMadeShadowPipeline[],
  getDeskLodUniforms: () => StarMadeRuntimeLodUniformDiagnostic
): StarMadeVisualRuntimeDiagnostic {
  for (const pipeline of shadowPipelines) {
    pipeline.render();
  }
  renderer.render(preview.scene, preview.camera);

  const deskBounds = new Box3().setFromObject(deskRoot);
  const deskCenter = deskBounds.getCenter(new Vector3());
  const points = createStarMadeRuntimeDiagnosticPoints(deskRoot, deskBounds);

  return {
    frame: round3(performance.now()),
    renderer: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines
    },
    desk: {
      position: toVectorTuple(deskRoot.position),
      bounds: boxToDiagnostic(deskBounds),
      uniforms: getDeskLodUniforms(),
      materials: collectStarMadeLodShaderMaterials(deskRoot).map(inspectRuntimeLodMaterial)
    },
    canvasSamples: [
      ...points.map((point) => sampleCanvasAtWorldPoint(point.key, point.world)),
      sampleCanvasAtWorldPoint("desk-center-recheck", deskCenter)
    ],
    shadowSamples: shadowPipelines.map((pipeline) => ({
      key: pipeline.key,
      layer: pipeline.renderLayer,
      samples: points.map((point) => sampleShadowPipelineAtWorldPoint(pipeline, point.key, point.world, true))
    })),
    geometry: {
      desk: inspectRuntimeObjectGeometry(deskRoot, {
        key: "desk-lod",
        label: "Desk LOD receiver/caster",
        type: "lod",
        maxMeshes: STARMADE_RUNTIME_GEOMETRY_MESH_LIMIT,
        maxVertices: STARMADE_RUNTIME_GEOMETRY_VERTEX_SAMPLE_LIMIT,
        maxTriangles: STARMADE_RUNTIME_GEOMETRY_TRIANGLE_SAMPLE_LIMIT,
        shadowPipelines
      }),
      pipelineCasters: shadowPipelines.map((pipeline) => ({
        key: pipeline.key,
        layer: pipeline.renderLayer,
        excludedEmissiveCasterKeys: blockLightSurfaceSources.map((source) => `source-cube-${source.key}`),
        casterKeys: pipeline.casters.map((caster) => caster.key),
        casters: pipeline.casters.map((caster) =>
          inspectRuntimeObjectGeometry(caster.root, {
            key: caster.key,
            label: caster.label,
            type: caster.type,
            maxMeshes: STARMADE_RUNTIME_CASTER_MESH_LIMIT,
            maxVertices: STARMADE_RUNTIME_CASTER_VERTEX_SAMPLE_LIMIT,
            maxTriangles: STARMADE_RUNTIME_CASTER_TRIANGLE_SAMPLE_LIMIT,
            shadowPipelines: [pipeline]
          })
        )
      }))
    }
  };
}

function inspectRuntimeLodMaterial(material: ShaderMaterial): StarMadeRuntimeMaterialDiagnostic {
  return {
    name: material.name,
    sourceMaterialName: String(material.userData.sourceMaterialName ?? ""),
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    side: material.side,
    visibleUniforms: Object.keys(material.uniforms).sort(),
    shaderChecks: {
      hasNormalMatrixUniform: material.fragmentShader.includes("uniform mat3 normalMatrix;"),
      transformsLodLightVecByNormalMatrix: material.fragmentShader.includes("normalize(normalMatrix * lightPos)"),
      hasShadowCoef: material.fragmentShader.includes("float shadowCoef()"),
      usesScalarShadowCoef: material.fragmentShader.includes("1.0 - shadowCoef()"),
      hasTextureAlphaDiscard: material.fragmentShader.includes("if(tex.a < 0.01){ discard; }"),
      hasEmissiveBranch: material.fragmentShader.includes("if(emissiveOn)")
    }
  };
}

function inspectRuntimeObjectGeometry(
  root: Object3D,
  options: {
    readonly key: string;
    readonly label: string;
    readonly type: string;
    readonly maxMeshes: number;
    readonly maxVertices: number;
    readonly maxTriangles: number;
    readonly shadowPipelines: readonly StarMadeShadowPipeline[];
  }
): StarMadeRuntimeObjectGeometryDiagnostic {
  root.updateMatrixWorld(true);

  const bounds = new Box3().setFromObject(root);
  const meshes: StarMadeRuntimeMeshGeometryDiagnostic[] = [];
  const warnings: string[] = [];
  let meshCount = 0;
  let vertexCount = 0;
  let indexCount = 0;
  let triangleCount = 0;

  root.traverse((object) => {
    if (!isBufferMesh(object)) {
      return;
    }

    meshCount++;
    const position = object.geometry.getAttribute("position");
    const index = object.geometry.getIndex();
    const currentVertexCount = position?.count ?? 0;
    const currentIndexCount = index?.count ?? 0;

    vertexCount += currentVertexCount;
    indexCount += currentIndexCount;
    triangleCount += Math.floor((currentIndexCount || currentVertexCount) / 3);

    if (meshes.length >= options.maxMeshes) {
      return;
    }

    meshes.push(inspectRuntimeMeshGeometry(root, object, {
      maxVertices: options.maxVertices,
      maxTriangles: options.maxTriangles,
      shadowPipelines: options.shadowPipelines
    }));
  });

  if (meshCount === 0) {
    warnings.push("object has no BufferGeometry meshes");
  }

  if (bounds.isEmpty()) {
    warnings.push("object bounds are empty");
  }

  return {
    key: options.key,
    label: options.label,
    type: options.type,
    objectType: root.type,
    visible: root.visible,
    matrixWorld: matrixToRoundedArray(root.matrixWorld),
    rootPosition: toVectorTuple(root.position),
    rootQuaternion: toQuaternionTuple(root.quaternion),
    rootScale: toVectorTuple(root.scale),
    bounds: boxToDiagnostic(bounds),
    meshCount,
    vertexCount,
    indexCount,
    triangleCount,
    truncatedMeshes: meshCount > meshes.length,
    warnings,
    meshes
  };
}

function inspectRuntimeMeshGeometry(
  root: Object3D,
  mesh: MeshObject,
  options: {
    readonly maxVertices: number;
    readonly maxTriangles: number;
    readonly shadowPipelines: readonly StarMadeShadowPipeline[];
  }
): StarMadeRuntimeMeshGeometryDiagnostic {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!geometry.boundingBox && position) {
    geometry.computeBoundingBox();
  }
  const localBounds = geometry.boundingBox ?? new Box3();
  const worldBounds = localBounds.clone().applyMatrix4(mesh.matrixWorld);
  const warnings: string[] = [];

  if (!position) {
    warnings.push("missing position attribute");
  }

  if (!geometry.getAttribute("normal")) {
    warnings.push("missing normal attribute");
  }

  if (!geometry.getAttribute("uv")) {
    warnings.push("missing uv attribute");
  }

  if (geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE) && !geometry.getAttribute(STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE)) {
    warnings.push("encoded cube geometry has starMadeVertex but no integer ivert alias");
  }

  return {
    path: objectPath(root, mesh),
    name: mesh.name,
    type: mesh.type,
    visible: mesh.visible,
    materialNames: materials.map((entry) => entry.name),
    materialSides: materials.map((entry) => entry.side),
    materialTransparent: materials.map((entry) => entry.transparent),
    materialDepthWrite: materials.map((entry) => entry.depthWrite),
    textures: materials.flatMap(inspectRuntimeMaterialTextures),
    localBounds: boxToDiagnostic(localBounds),
    worldBounds: boxToDiagnostic(worldBounds),
    matrixWorld: matrixToRoundedArray(mesh.matrixWorld),
    vertexCount: position?.count ?? 0,
    indexCount: index?.count ?? 0,
    triangleCount: Math.floor(((index?.count ?? 0) || (position?.count ?? 0)) / 3),
    groups: geometry.groups.map((group) => ({
      start: group.start,
      count: group.count,
      materialIndex: group.materialIndex
    })),
    attributes: Object.keys(geometry.attributes)
      .sort()
      .map((name) => inspectRuntimeGeometryAttribute(name, geometry.getAttribute(name))),
    vertexSamples: sampleRuntimeGeometryVertices(mesh, options.maxVertices),
    triangleSamples: sampleRuntimeGeometryTriangles(mesh, options.maxTriangles, options.shadowPipelines),
    warnings
  };
}

function inspectRuntimeGeometryAttribute(
  name: string,
  attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>
): StarMadeRuntimeGeometryAttributeDiagnostic {
  const itemSize = attribute.itemSize;
  const sampleCount = Math.min(attribute.count, STARMADE_RUNTIME_GEOMETRY_VERTEX_SAMPLE_LIMIT);
  const firstValues: number[] = [];
  const componentMin = Array.from({ length: itemSize }, () => Number.POSITIVE_INFINITY);
  const componentMax = Array.from({ length: itemSize }, () => Number.NEGATIVE_INFINITY);

  for (let index = 0; index < attribute.count; index++) {
    for (let component = 0; component < itemSize; component++) {
      const value = readAttributeComponent(attribute, index, component);

      if (index < sampleCount) {
        firstValues.push(round3(value));
      }

      componentMin[component] = Math.min(componentMin[component], value);
      componentMax[component] = Math.max(componentMax[component], value);
    }
  }

  return {
    name,
    itemSize,
    count: attribute.count,
    normalized: attribute.normalized,
    arrayType: attributeArrayType(attribute),
    gpuType: attributeGpuType(attribute),
    usage: attributeUsage(attribute),
    isInterleaved: "isInterleavedBufferAttribute" in attribute && attribute.isInterleavedBufferAttribute === true,
    firstValues,
    componentMin: componentMin.map(round3),
    componentMax: componentMax.map(round3),
    decodedSamples:
      name === STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE || name === STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE
        ? sampleEncodedAttribute(attribute, sampleCount)
        : undefined
  };
}

function sampleRuntimeGeometryVertices(mesh: MeshObject, limit: number): readonly StarMadeRuntimeVertexSampleDiagnostic[] {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

  if (!position) {
    return [];
  }

  return Array.from({ length: Math.min(position.count, limit) }, (_, index) => {
    const localPosition = readVector3Attribute(position, index);
    const localNormal = normal ? readVector3Attribute(normal, index).normalize() : null;

    return {
      index,
      position: toVectorTuple(localPosition),
      world: toVectorTuple(localPosition.clone().applyMatrix4(mesh.matrixWorld)),
      normal: localNormal ? toVectorTuple(localNormal) : null,
      worldNormal: localNormal ? toVectorTuple(localNormal.clone().transformDirection(mesh.matrixWorld)) : null,
      uv: uv ? readVector2AttributeTuple(uv, index) : null,
      encoded: encoded ? decodeRuntimeEncodedVertex(encoded, index) : undefined
    };
  });
}

function sampleRuntimeGeometryTriangles(
  mesh: MeshObject,
  limit: number,
  shadowPipelines: readonly StarMadeShadowPipeline[]
): readonly StarMadeRuntimeTriangleSampleDiagnostic[] {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");

  if (!position) {
    return [];
  }

  const index = geometry.getIndex();
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const mainTexture = firstRuntimeMaterialTexture(mesh.material, "mainTex");
  const triangleCount = Math.floor(((index?.count ?? 0) || position.count) / 3);

  return Array.from({ length: Math.min(triangleCount, limit) }, (_, triangle) => {
    const indices = readTriangleIndices(index, triangle);
    const p0 = readVector3Attribute(position, indices[0]);
    const p1 = readVector3Attribute(position, indices[1]);
    const p2 = readVector3Attribute(position, indices[2]);
    const edgeA = p1.clone().sub(p0);
    const edgeB = p2.clone().sub(p0);
    const cross = edgeA.clone().cross(edgeB);
    const area = cross.length() * 0.5;
    const faceNormal = area > 0 ? cross.clone().normalize() : null;
    const center = p0.clone().add(p1).add(p2).multiplyScalar(1 / 3);
    const worldCenter = center.clone().applyMatrix4(mesh.matrixWorld);
    const averageNormal = normal
      ? readVector3Attribute(normal, indices[0])
          .add(readVector3Attribute(normal, indices[1]))
          .add(readVector3Attribute(normal, indices[2]))
          .normalize()
      : null;
    const uvCenter = uv
      ? averageVector2Tuples(readVector2AttributeTuple(uv, indices[0]), readVector2AttributeTuple(uv, indices[1]), readVector2AttributeTuple(uv, indices[2]))
      : null;

    return {
      triangle,
      indices,
      area: round3(area),
      center: toVectorTuple(center),
      worldCenter: toVectorTuple(worldCenter),
      faceNormal: faceNormal ? toVectorTuple(faceNormal) : null,
      worldFaceNormal: faceNormal ? toVectorTuple(faceNormal.clone().transformDirection(mesh.matrixWorld)) : null,
      averageNormal: averageNormal ? toVectorTuple(averageNormal) : null,
      worldAverageNormal: averageNormal ? toVectorTuple(averageNormal.clone().transformDirection(mesh.matrixWorld)) : null,
      normalDot: faceNormal && averageNormal ? round3(faceNormal.dot(averageNormal)) : null,
      uvCenter,
      mainTextureRgba: mainTexture && uvCenter ? sampleTextureAtUv(mainTexture, uvCenter) : null,
      shadowSamples: shadowPipelines.map((pipeline) => sampleShadowPipelineAtWorldPoint(pipeline, `tri-${triangle}`, worldCenter))
    };
  });
}

function inspectRuntimeMaterialTextures(material: Mesh["material"]): readonly StarMadeRuntimeTextureDiagnostic[] {
  if (!(material instanceof ShaderMaterial)) {
    return [];
  }

  return ["mainTex", "emissiveTex", "starMadeShadowMap0", "starMadeShadowMapArray"]
    .map((uniform) => {
      const texture = material.uniforms[uniform]?.value;
      return texture instanceof Texture ? inspectRuntimeTexture(uniform, texture) : null;
    })
    .filter((entry): entry is StarMadeRuntimeTextureDiagnostic => entry !== null);
}

function inspectRuntimeTexture(uniform: string, texture: Texture): StarMadeRuntimeTextureDiagnostic {
  const size = textureImageSize(texture);

  return {
    uniform,
    name: texture.name,
    uuid: texture.uuid,
    imageWidth: size?.[0] ?? null,
    imageHeight: size?.[1] ?? null,
    flipY: texture.flipY,
    colorSpace: texture.colorSpace
  };
}

function firstRuntimeMaterialTexture(material: Mesh["material"], uniform: string): Texture | null {
  const materials = Array.isArray(material) ? material : [material];

  for (const entry of materials) {
    if (entry instanceof ShaderMaterial) {
      const value = entry.uniforms[uniform]?.value;

      if (value instanceof Texture) {
        return value;
      }
    }
  }

  return null;
}

function sampleTextureAtUv(texture: Texture, uv: readonly [number, number]): readonly [number, number, number, number] | null {
  const image = texture.image as CanvasImageSource | undefined;
  const size = textureImageSize(texture);

  if (!image || !size || size[0] <= 0 || size[1] <= 0) {
    return null;
  }

  try {
    const scratch = document.createElement("canvas");
    scratch.width = size[0];
    scratch.height = size[1];
    const context = scratch.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, size[0], size[1]);
    const wrappedU = uv[0] - Math.floor(uv[0]);
    const wrappedV = uv[1] - Math.floor(uv[1]);
    const x = Math.min(size[0] - 1, Math.max(0, Math.round(wrappedU * (size[0] - 1))));
    const y = Math.min(size[1] - 1, Math.max(0, Math.round((texture.flipY ? 1 - wrappedV : wrappedV) * (size[1] - 1))));
    const pixel = context.getImageData(x, y, 1, 1).data;

    return [pixel[0], pixel[1], pixel[2], pixel[3]] as const;
  } catch {
    return null;
  }
}

function textureImageSize(texture: Texture): readonly [number, number] | null {
  const image = texture.image as { readonly width?: number; readonly height?: number } | undefined;

  if (!image || typeof image.width !== "number" || typeof image.height !== "number") {
    return null;
  }

  return [image.width, image.height] as const;
}

function sampleEncodedAttribute(
  attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>,
  count: number
): readonly StarMadeRuntimeEncodedVertexSampleDiagnostic[] {
  return Array.from({ length: Math.min(attribute.count, count) }, (_, index) => decodeRuntimeEncodedVertex(attribute, index));
}

function decodeRuntimeEncodedVertex(
  attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>,
  index: number
): StarMadeRuntimeEncodedVertexSampleDiagnostic {
  const raw = Array.from({ length: attribute.itemSize }, (_, component) => readAttributeComponent(attribute, index, component));

  return {
    vertex: index,
    raw,
    light: decodeLightCode(raw[0] ?? 0),
    face: decodeFaceCode(raw[1] ?? 0)
  };
}

function readTriangleIndices(index: BufferAttribute | null, triangle: number): readonly [number, number, number] {
  if (!index) {
    return [triangle * 3, triangle * 3 + 1, triangle * 3 + 2] as const;
  }

  return [index.getX(triangle * 3), index.getX(triangle * 3 + 1), index.getX(triangle * 3 + 2)] as const;
}

function readVector3Attribute(
  attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>,
  index: number
): Vector3 {
  return new Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
}

function readVector2AttributeTuple(
  attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>,
  index: number
): readonly [number, number] {
  return [round3(attribute.getX(index)), round3(attribute.getY(index))] as const;
}

function averageVector2Tuples(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number]
): readonly [number, number] {
  return [round3((a[0] + b[0] + c[0]) / 3), round3((a[1] + b[1] + c[1]) / 3)] as const;
}

function readAttributeComponent(
  attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>,
  index: number,
  component: number
): number {
  if (component === 0) {
    return attribute.getX(index);
  }

  if (component === 1) {
    return attribute.getY(index);
  }

  if (component === 2) {
    return attribute.getZ(index);
  }

  return attribute.getW(index);
}

function attributeArrayType(attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>): string {
  const inspected = attribute as {
    readonly array?: { readonly constructor: { readonly name: string } };
    readonly data?: { readonly array?: { readonly constructor: { readonly name: string } } };
  };
  const raw = inspected.array ?? inspected.data?.array ?? null;

  return raw?.constructor.name ?? "unknown";
}

function attributeGpuType(attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>): string | number | null {
  const inspected = attribute as { readonly gpuType?: string | number };

  return inspected.gpuType ?? null;
}

function attributeUsage(attribute: NonNullable<ReturnType<BufferGeometry["getAttribute"]>>): string | number | null {
  const inspected = attribute as { readonly usage?: string | number; readonly data?: { readonly usage?: string | number } };
  const raw = inspected.usage ?? inspected.data?.usage ?? null;

  return typeof raw === "number" || typeof raw === "string" ? raw : null;
}

function objectPath(root: Object3D, target: Object3D): string {
  const parts: string[] = [];
  let current: Object3D | null = target;

  while (current && current !== root) {
    parts.unshift(current.name || current.type);
    current = current.parent;
  }

  parts.unshift(root.name || root.type);
  return parts.join("/");
}

function matrixToRoundedArray(matrix: Matrix4): readonly number[] {
  return matrix.elements.map(round3);
}

function createStarMadeRuntimeDiagnosticPoints(
  deskRoot: Object3D,
  deskBounds: Box3
): readonly { readonly key: string; readonly world: Vector3 }[] {
  const deskCenter = deskBounds.getCenter(new Vector3());
  const deskTop = new Vector3(deskCenter.x, deskBounds.max.y, deskCenter.z);
  const deskBottom = new Vector3(deskCenter.x, deskBounds.min.y, deskCenter.z);
  const probeTop = whiteLightSurfaceCellPosition(DESK_LIGHT_SHADOW_PROBE_GRID[0], DESK_LIGHT_SHADOW_PROBE_GRID[1]).add(
    new Vector3(0, 1.02, 0)
  );
  const probeFloor = whiteLightSurfaceCellPosition(DESK_LIGHT_SHADOW_PROBE_GRID[0], DESK_LIGHT_SHADOW_PROBE_GRID[1]).add(
    new Vector3(0, 0.51, 0)
  );
  const probeFloorFar = whiteLightSurfaceCellPosition(DESK_LIGHT_SHADOW_PROBE_GRID[0], DESK_LIGHT_SHADOW_PROBE_GRID[1] + 1).add(
    new Vector3(0, 0.51, 0)
  );

  return [
    { key: "desk-root", world: deskRoot.position.clone() },
    { key: "desk-center", world: deskCenter },
    { key: "desk-top", world: deskTop },
    { key: "desk-bottom", world: deskBottom },
    { key: "shadow-probe-top", world: probeTop },
    { key: "shadow-probe-floor", world: probeFloor },
    { key: "shadow-probe-floor-far", world: probeFloorFar },
    ...whiteLightSurfaceSourceMeshes.map((source) => ({
      key: `source-${source.key}`,
      world: source.cube.position.clone()
    }))
  ];
}

function sampleCanvasAtWorldPoint(key: string, world: Vector3): StarMadeCanvasSampleDiagnostic {
  const pixel = worldToCanvasPixel(world);

  return {
    key,
    world: toVectorTuple(world),
    canvas: pixel,
    rgba: pixel ? readCanvasPixel(pixel[0], pixel[1]) : null
  };
}

function worldToCanvasPixel(world: Vector3): readonly [number, number] | null {
  const projected = world.clone().project(preview.camera);

  if (projected.z < -1 || projected.z > 1) {
    return null;
  }

  const x = Math.round((projected.x * 0.5 + 0.5) * (canvas!.width - 1));
  const y = Math.round((-projected.y * 0.5 + 0.5) * (canvas!.height - 1));

  if (x < 0 || x >= canvas!.width || y < 0 || y >= canvas!.height) {
    return null;
  }

  return [x, y] as const;
}

function readCanvasPixel(x: number, y: number): readonly [number, number, number, number] {
  const pixel = new Uint8Array(4);
  webglContext.readPixels(x, canvas!.height - 1 - y, 1, 1, webglContext.RGBA, webglContext.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]] as const;
}

function sampleShadowPipelineAtWorldPoint(
  pipeline: StarMadeShadowPipeline,
  key: string,
  world: Vector3,
  includeBlockerCandidates = false
): StarMadeShadowPointRuntimeDiagnostic {
  const coord = new Vector4(world.x, world.y, world.z, 1).applyMatrix4(pipeline.shadowMatrix);

  if (coord.w === 0) {
    return {
      key,
      world: toVectorTuple(world),
      uvw: null,
      mapPixel: null,
      mapRgba: null,
      sampledDepth: null,
      receiverDepth: null,
      occludedByShaderRule: null,
      blockerCandidates: includeBlockerCandidates ? [] : undefined
    };
  }

  const uvw = [coord.x / coord.w, coord.y / coord.w, coord.z / coord.w] as const;
  const inside = uvw[0] >= 0 && uvw[0] <= 1 && uvw[1] >= 0 && uvw[1] <= 1 && uvw[2] >= 0 && uvw[2] <= 1;
  const mapPixel = inside
    ? ([
        Math.round(uvw[0] * (STARMADE_LOD_SHADOW_MAP_SIZE - 1)),
        Math.round(uvw[1] * (STARMADE_LOD_SHADOW_MAP_SIZE - 1))
      ] as const)
    : null;
  const mapRgba = mapPixel ? readShadowMapPixel(pipeline, mapPixel[0], mapPixel[1]) : null;
  const sampledDepth = mapRgba ? round3(mapRgba[0] / 255) : null;
  const receiverDepth = round3(uvw[2]);
  const occludedByShaderRule =
    sampledDepth !== null ? uvw[2] - sunShadowPipeline.bias > sampledDepth + 0.000001 : null;

  return {
    key,
    world: toVectorTuple(world),
    uvw: [round3(uvw[0]), round3(uvw[1]), round3(uvw[2])] as const,
    mapPixel,
    mapRgba,
    sampledDepth,
    receiverDepth,
    occludedByShaderRule,
    blockerCandidates:
      includeBlockerCandidates && mapPixel
        ? inspectShadowBlockerCandidates(pipeline, world, uvw, mapPixel)
        : includeBlockerCandidates
          ? []
          : undefined
  };
}

function inspectShadowBlockerCandidates(
  pipeline: StarMadeShadowPipeline,
  receiverWorld: Vector3,
  receiverUvw: readonly [number, number, number],
  receiverPixel: readonly [number, number]
): readonly StarMadeShadowBlockerCandidateDiagnostic[] {
  const candidates: StarMadeShadowBlockerCandidateDiagnostic[] = [];

  for (const caster of pipeline.casters) {
    caster.root.updateMatrixWorld(true);
    caster.root.traverse((object) => {
      if (!isBufferMesh(object)) {
        return;
      }

      const position = object.geometry.getAttribute("position");
      const index = object.geometry.getIndex();

      if (!position) {
        return;
      }

      const triangleCount = Math.floor(((index?.count ?? 0) || position.count) / 3);

      for (let triangle = 0; triangle < triangleCount; triangle++) {
        const indices = readTriangleIndices(index, triangle);
        const center = readVector3Attribute(position, indices[0])
          .add(readVector3Attribute(position, indices[1]))
          .add(readVector3Attribute(position, indices[2]))
          .multiplyScalar(1 / 3)
          .applyMatrix4(object.matrixWorld);

        const coord = new Vector4(center.x, center.y, center.z, 1).applyMatrix4(pipeline.shadowMatrix);

        if (coord.w === 0) {
          continue;
        }

        const uvw = [coord.x / coord.w, coord.y / coord.w, coord.z / coord.w] as const;

        if (uvw[0] < 0 || uvw[0] > 1 || uvw[1] < 0 || uvw[1] > 1 || uvw[2] < 0 || uvw[2] > 1) {
          continue;
        }

        const mapPixel = [
          Math.round(uvw[0] * (STARMADE_LOD_SHADOW_MAP_SIZE - 1)),
          Math.round(uvw[1] * (STARMADE_LOD_SHADOW_MAP_SIZE - 1))
        ] as const;
        const pixelDistance = Math.hypot(mapPixel[0] - receiverPixel[0], mapPixel[1] - receiverPixel[1]);
        const depthDelta = receiverUvw[2] - uvw[2];
        const worldDistance = receiverWorld.distanceTo(center);

        if (pixelDistance > 3 || depthDelta < -sunShadowPipeline.bias || worldDistance < 0.001) {
          continue;
        }

        candidates.push({
          casterKey: caster.key,
          casterType: caster.type,
          meshPath: objectPath(caster.root, object),
          triangle,
          worldCenter: toVectorTuple(center),
          uvw: [round3(uvw[0]), round3(uvw[1]), round3(uvw[2])] as const,
          mapPixel,
          pixelDistance: round3(pixelDistance),
          depthDelta: round3(depthDelta),
          receiverWouldBeOccluded: receiverUvw[2] - sunShadowPipeline.bias > uvw[2] + 0.000001
        });
      }
    });
  }

  return candidates
    .sort((a, b) => Number(b.receiverWouldBeOccluded) - Number(a.receiverWouldBeOccluded) || a.pixelDistance - b.pixelDistance)
    .slice(0, 8);
}

function readShadowMapPixel(
  pipeline: StarMadeShadowPipeline,
  x: number,
  y: number
): readonly [number, number, number, number] {
  const pixel = new Uint8Array(4);
  const previousRenderTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(pipeline.renderTarget, pipeline.renderLayer);
  renderer.readRenderTargetPixels(pipeline.renderTarget as WebGLRenderTarget, x, y, 1, 1, pixel);
  renderer.setRenderTarget(previousRenderTarget);

  return [pixel[0], pixel[1], pixel[2], pixel[3]] as const;
}

function roundNullableRgbaList(
  values: readonly (readonly [number, number, number, number] | null)[]
): readonly (readonly [number, number, number, number] | null)[] {
  return values.map((value) => {
    if (!value) {
      return null;
    }

    return [round3(value[0]), round3(value[1]), round3(value[2]), round3(value[3])] as const;
  });
}

function ensureStarMadeLodTangentColorAttribute(geometry: BufferGeometry): void {
  if (geometry.getAttribute("color")) {
    return;
  }

  const vertexCount = geometry.getAttribute("position").count;
  const colors = new Float32Array(vertexCount * 3);

  for (let index = 0; index < vertexCount; index++) {
    const offset = index * 3;
    colors[offset] = 1;
    colors[offset + 1] = 0;
    colors[offset + 2] = 0;
  }

  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

function configureStarMadeLodTexture(texture: Texture | null | undefined): void {
  if (!texture) {
    return;
  }

  // StarMade's legacy GLSL shaders operate on raw texture bytes; sRGB decode makes dark LOD atlas regions look unlit.
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  if (texture.image !== undefined && texture.image !== null) {
    texture.needsUpdate = true;
  }
}

function inspectStarMadeLodObject(
  root: Object3D,
  metadata: Pick<LodModelDiagnostic, "blockId" | "blockName" | "lodShape" | "lodShapeStyle" | "active" | "sceneUrl" | "texturePath">
): LodModelDiagnostic {
  const meshes: LodMeshDiagnostic[] = [];
  const bounds = new Box3();
  let lodNodeQuaternion: readonly [number, number, number, number] | null = null;
  let vertexCount = 0;
  let triangleCount = 0;

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object !== root && !lodNodeQuaternion && !isBufferMesh(object)) {
      lodNodeQuaternion = toQuaternionTuple(object.quaternion);
    }

    if (!isBufferMesh(object)) {
      return;
    }

    object.geometry.computeBoundingBox();
    const position = object.geometry.getAttribute("position");
    const index = object.geometry.getIndex();
    const meshVertexCount = position.count;
    const meshIndexCount = index?.count ?? 0;
    const meshTriangleCount = (meshIndexCount || meshVertexCount) / 3;
    const meshBounds = object.geometry.boundingBox ?? new Box3();
    const worldMeshBounds = meshBounds.clone().applyMatrix4(object.matrixWorld);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const shaderMaterials = materials.filter((entry): entry is LodShaderMaterial => entry instanceof ShaderMaterial);

    vertexCount += meshVertexCount;
    triangleCount += meshTriangleCount;
    bounds.union(worldMeshBounds);
    meshes.push({
      name: object.name,
      type: object.type,
      vertexCount: meshVertexCount,
      indexCount: meshIndexCount,
      triangleCount: meshTriangleCount,
      materialNames: materials.map((entry) => entry.name),
      sourceMaterialNames: shaderMaterials.map((entry) => entry.userData.sourceMaterialName ?? ""),
      hasDiffuseMap: shaderMaterials.some((entry) => entry.uniforms.mainTex?.value !== undefined),
      hasEmissiveMap: shaderMaterials.some((entry) => entry.uniforms.emissiveOn?.value === true),
      usesStarMadeLodShader: shaderMaterials.some((entry) => entry.name.startsWith("StarMadeLodShaderMaterial")),
      hasTangentColorAttribute: object.geometry.getAttribute("color") !== undefined,
      transparent: materials.some((entry) => entry.transparent),
      depthWrite: materials.every((entry) => entry.depthWrite),
      bounds: boxToDiagnostic(meshBounds)
    });
  });

  return {
    ...metadata,
    objectType: root.type,
    rootPosition: toVectorTuple(root.position),
    rootQuaternion: toQuaternionTuple(root.quaternion),
    rootScale: toVectorTuple(root.scale),
    sceneUp: toVectorTuple(root.up),
    nodeRotation: lodNodeQuaternion,
    meshCount: meshes.length,
    vertexCount,
    triangleCount,
    meshes,
    bounds: boxToDiagnostic(meshes.length > 0 ? bounds : new Box3())
  };
}

function isBufferMesh(object: Object3D): object is MeshObject {
  return object instanceof Mesh && object.geometry instanceof BufferGeometry;
}

function createStarMadeLogicConnectionTubeGeometry(start: Vector3, end: Vector3): BufferGeometry {
  const right = new Vector3(1, 0, 0);
  let up = new Vector3().crossVectors(right, new Vector3().subVectors(end, start));

  if (up.lengthSq() === 0) {
    up = new Vector3(0, 1, 0);
  }
  up.normalize();

  const forward = new Vector3().subVectors(end, start);
  right.crossVectors(up, forward);
  if (right.lengthSq() === 0) {
    right.set(1, 0, 0);
  }
  right.normalize();

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const startRing: Vector3[] = [];
  const endRing: Vector3[] = [];
  const normalRing: Vector3[] = [];

  for (let segment = 0; segment < STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS; segment++) {
    const angle = (segment / STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS) * Math.PI * 2;
    const radial = new Vector3()
      .addScaledVector(up, Math.cos(angle) * STARMADE_LOGIC_CONNECTION_TUBE_RADIUS)
      .addScaledVector(right, Math.sin(angle) * STARMADE_LOGIC_CONNECTION_TUBE_RADIUS);

    startRing.push(new Vector3().copy(start).add(radial));
    endRing.push(new Vector3().copy(end).add(radial));
    normalRing.push(radial.clone().normalize());
  }

  for (let segment = 0; segment < STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS; segment++) {
    const next = (segment + 1) % STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS;
    const vertexBase = positions.length / 3;
    const ringProgress = segment / STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS;
    const nextRingProgress = (segment + 1) / STARMADE_LOGIC_CONNECTION_TUBE_SEGMENTS;

    pushTubeVertex(positions, normals, uvs, startRing[segment], normalRing[segment], 0, ringProgress);
    pushTubeVertex(positions, normals, uvs, startRing[next], normalRing[next], 0, nextRingProgress);
    pushTubeVertex(positions, normals, uvs, endRing[next], normalRing[next], 1, nextRingProgress);
    pushTubeVertex(positions, normals, uvs, endRing[segment], normalRing[segment], 1, ringProgress);
    indices.push(vertexBase, vertexBase + 2, vertexBase + 1, vertexBase, vertexBase + 3, vertexBase + 2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function pushTubeVertex(
  positions: number[],
  normals: number[],
  uvs: number[],
  position: Vector3,
  normal: Vector3,
  tubeProgress: number,
  ringProgress: number
): void {
  positions.push(position.x, position.y, position.z);
  normals.push(normal.x, normal.y, normal.z);
  uvs.push(tubeProgress, ringProgress);
}

function createLogicConnectionTubeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: "StarMadeLogicConnectionTubeMaterial",
    transparent: false,
    depthTest: true,
    depthWrite: true,
    side: FrontSide,
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new Color(0x78c6ff) },
      lightDirection: { value: new Vector3(0.45, 0.7, 0.55).normalize() }
    },
    vertexShader: [
      "varying vec3 vNormal;",
      "varying vec2 vUv;",
      "void main() {",
      "  vNormal = normalize(normalMatrix * normal);",
      "  vUv = uv;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}"
    ].join("\n"),
    fragmentShader: [
      "uniform float time;",
      "uniform vec3 baseColor;",
      "uniform vec3 lightDirection;",
      "varying vec3 vNormal;",
      "varying vec2 vUv;",
      "void main() {",
      "  vec3 normalDirection = normalize(vNormal);",
      "  float diffuse = max(dot(normalDirection, normalize(lightDirection)), 0.0);",
      "  float glow = 0.5 - abs(1.0 - time - vUv.x);",
      "  vec3 endPulse = vec3(0.0, pow(vUv.x, 10.0) * 0.8, pow(1.0 - vUv.x, 10.0) * 0.8);",
      "  vec3 color = baseColor * (0.22 + diffuse * 0.45);",
      "  color += baseColor * max(1.0, pow(0.66 + glow, 16.0)) * 0.16;",
      "  color += endPulse * 2.4;",
      "  gl_FragColor = vec4(color, 1.0);",
      "}"
    ].join("\n")
  });
}

function inspectEncodedGeometry(geometry: Mesh["geometry"], orientation: number): SpriteOrientationDiagnostic {
  const positions = geometry.getAttribute("position");
  const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
  const bounds = geometry.boundingBox;

  if (!bounds) {
    throw new Error("Expected sprite geometry bounding box to be available.");
  }

  const faces = STARMADE_FACE_LABELS.map((label, faceIndex) => {
    const vertices = Array.from({ length: 4 }, (_, vertexOffset) => {
      const vertexIndex = faceIndex * 4 + vertexOffset;
      return new Vector3().fromBufferAttribute(positions, vertexIndex);
    });
    const center = vertices.reduce((sum, vertex) => sum.add(vertex), new Vector3()).multiplyScalar(0.25);
    const yValues = vertices.map((vertex) => vertex.y);
    const textureCorners = Array.from({ length: 4 }, (_, vertexOffset) => {
      const vertexIndex = faceIndex * 4 + vertexOffset;
      return decodeFaceCode(encoded.getY(vertexIndex)).tex;
    });

    return {
      label,
      encodedSide: decodeFaceCode(encoded.getY(faceIndex * 4)).side,
      textureCorners,
      center: toVectorTuple(center),
      yRange: [Math.min(...yValues), Math.max(...yValues)] as const
    } satisfies SpriteFaceDiagnostic;
  });

  const highestFace = faces.reduce((best, face) => (face.center[1] > best.center[1] ? face : best));
  const lowestFace = faces.reduce((best, face) => (face.center[1] < best.center[1] ? face : best));

  return {
    orientation,
    bounds: {
      min: toVectorTuple(bounds.min),
      max: toVectorTuple(bounds.max),
      size: toVectorTuple(bounds.max.clone().sub(bounds.min))
    },
    highestFace,
    lowestFace,
    faces
  };
}

function decodeFaceCode(value: number): DecodedFaceCode {
  let rest = Math.trunc(value);
  const tex = Math.floor(rest / 2097152);
  rest -= tex * 2097152;
  const animated = Math.floor(rest / 1048576);
  rest -= animated * 1048576;
  const hitPoints = Math.floor(rest / 131072);
  rest -= hitPoints * 131072;
  const type = Math.floor(rest / 512);
  rest -= type * 512;
  const layer = Math.floor(rest / 32);
  rest -= layer * 32;
  rest %= 32;
  const side = Math.floor(rest / 4);

  return { side, tex, layer, type, hitPoints, animated };
}

function decodeLightCode(value: number): DecodedLightCode {
  let rest = Math.trunc(value);
  const blue = Math.floor(rest / 67108864);
  rest -= blue * 67108864;
  const green = Math.floor(rest / 2097152);
  rest -= green * 2097152;
  const red = Math.floor(rest / 65536);
  rest -= red * 65536;

  return {
    vertexIndex: rest,
    red,
    green,
    blue,
    shaderOcclusion: [round3(red * 0.03225), round3(green * 0.03225), round3(blue * 0.03225)] as const
  };
}

function decodeSecondaryOcclusionCode(value: number): DecodedSecondaryOcclusionCode {
  const encoded = Math.floor(Math.trunc(value) / 32768) % 32;

  return {
    encoded,
    shader: round3(encoded * 0.03225)
  };
}

function blockLightVectorFromColor(color: readonly [number, number, number, number]): readonly [number, number, number] {
  const intensity = Math.max(0, Math.min(1, color[3])) * 31;

  return [
    encodeLightChannel(color[0] * intensity),
    encodeLightChannel(color[1] * intensity),
    encodeLightChannel(color[2] * intensity)
  ] as const;
}

function whiteLightSurfaceCellPosition(gridX: number, gridZ: number): Vector3 {
  const offset = (WHITE_LIGHT_SURFACE_SIZE - 1) / 2;

  return new Vector3(
    WHITE_LIGHT_SURFACE_ORIGIN.x + gridX - offset,
    WHITE_LIGHT_SURFACE_ORIGIN.y,
    WHITE_LIGHT_SURFACE_ORIGIN.z + gridZ - offset
  );
}

// One world unit remains one light voxel on every axis. The old X/Y-to-X/Z
// projection relocated the floor lamps beside the display's upper faces.
function visualTestShowcaseLightingGrid(cubePosition: Vector3): readonly [number, number, number] {
  return [Math.round(cubePosition.x + SHOWCASE_BLOCK_LIGHT_SHIFT[0]),
    Math.round(cubePosition.y + SHOWCASE_BLOCK_LIGHT_SHIFT[1]),
    Math.round(cubePosition.z + SHOWCASE_BLOCK_LIGHT_SHIFT[2])];
}

function applyVisualTestShowcaseLighting(
  geometry: BufferGeometry,
  cubePosition: Vector3,
  options: { readonly toggleLightActive?: boolean } = {}
): void {
  const gridPosition = visualTestShowcaseLightingGrid(cubePosition);

  applyWhiteLightSurfaceFaceLighting(geometry, cubePosition, {
    volume: showcaseBlockLightVolumeForCell(gridPosition, options.toggleLightActive),
    gridPosition
  });
}

function updateVisualTestShowcaseLighting(toggleLightActive: boolean): void {
  if (visualTestShowcaseLightToggleState === toggleLightActive) {
    return;
  }

  visualTestShowcaseLightToggleState = toggleLightActive;

  for (const { cube, geometry } of visualTestShowcaseLightReceivers) {
    applyVisualTestShowcaseLighting(geometry, cube.position, { toggleLightActive });
  }
}

function createShowcaseBlockLightSolid(
  block: Parameters<typeof createStarMadeBlockLightSolidFromBlock>[0],
  cubePosition: readonly [number, number, number],
  orientation: number
) {
  const position = visualTestShowcaseLightingGrid(new Vector3(cubePosition[0], cubePosition[1], cubePosition[2]));

  return createStarMadeBlockLightSolidFromBlock(block, {
    position,
    orientation
  });
}

function createShowcaseBlockLightSource(
  block: Parameters<typeof createStarMadeBlockLightSourceFromBlock>[0],
  cubePosition: readonly [number, number, number],
  active: boolean
) {
  const position = visualTestShowcaseLightingGrid(new Vector3(cubePosition[0], cubePosition[1], cubePosition[2]));

  return createStarMadeBlockLightSourceFromBlock(block, {
    grid: [position[0], position[2]],
    position,
    active
  });
}

function createShowcaseBlockLightSourceInputs(toggleLightActive: boolean) {
  return [
    ...blockLightSurfaceSources.map((source) => {
      const world = whiteLightSurfaceCellPosition(source.grid[0], source.grid[1]).add(new Vector3(0, 1, 0));
      return createShowcaseBlockLightSource(source.block, [world.x, world.y, world.z], true);
    }),
    createShowcaseBlockLightSource(activeLightOnBlock, activeLightTestPositions[1], toggleLightActive),
    createShowcaseBlockLightSource(activeLightOnBlock, activeLightTestPositions[2], true)
  ];
}

function computeShowcaseBlockLightVolumes(toggleLightActive: boolean): Map<string, StarMadeBlockLightVolume> {
  const sources = createShowcaseBlockLightSourceInputs(toggleLightActive);

  // Every object samples the same occlusion field, as in the Isanth segment path.
  // Computing one field per object with solids:[solid] makes its neighbors invisible
  // to transport, even though they are visible to the color and sun-shadow passes.
  const volume = computeStarMadeBlockLightVolume({
    size: SHOWCASE_BLOCK_LIGHT_SIZE,
    sources,
    solids: showcaseBlockLightSolids,
    rayCount: blockLightSurfaceLighting.rayCount,
    rayLength: blockLightSurfaceLighting.rayLength
  });
  return new Map(showcaseBlockLightSolids.map(solid => [blockLightVolumePositionKey(solid.position), volume]));
}

function showcaseBlockLightVolumeForCell(
  position: readonly [number, number, number],
  toggleLightActive = showcaseInitialToggleLightActive
): StarMadeBlockLightVolume {
  const volumes = toggleLightActive ? showcaseBlockLightVolumesByToggleState.on : showcaseBlockLightVolumesByToggleState.off;

  return (
    volumes.get(blockLightVolumePositionKey(position)) ??
    computeStarMadeBlockLightVolume({
      size: SHOWCASE_BLOCK_LIGHT_SIZE,
      sources: createShowcaseBlockLightSourceInputs(toggleLightActive),
      solids: showcaseBlockLightSolids,
      rayCount: blockLightSurfaceLighting.rayCount,
      rayLength: blockLightSurfaceLighting.rayLength
    })
  );
}

function blockLightVolumePositionKey(position: readonly [number, number, number]): string {
  return `${position[0]},${position[1]},${position[2]}`;
}

function createCubeRenderDebugDiagnostics() {
  const debugBlocks = [
    { key: "gravity", block: gravityUnit },
    { key: "active-light-on", block: activeLightOnBlock },
    { key: "active-light-off", block: activeLightOffBlock },
    { key: "button", block: logicBlocks[0].block },
    { key: "activation-module", block: logicBlocks[1].block },
    { key: "not-signal", block: logicBlocks[2].block },
    { key: "and-signal", block: logicBlocks[3].block },
    { key: "or-signal", block: logicBlocks[4].block },
    { key: "logic-beam", block: logicBlocks[5].block },
    { key: "blue-console-textures", block: deskLodBlock }
  ];
  const fragmentShader = experimentalCubeMaterial.fragmentShader;

  return {
    renderer: {
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      pixelRatio: renderer.getPixelRatio()
    },
    shaderPath: {
      hasMainTex0: fragmentShader.includes("uniform sampler2D mainTex0;"),
      hasNormalTex0: fragmentShader.includes("uniform sampler2D normalTex0;"),
      hasTextureArray: fragmentShader.includes("uniform sampler2DArray cTex;"),
      hasNormalTextureArray: fragmentShader.includes("uniform sampler2DArray cTexNormal;"),
      usesOpenNormalmapFinalEmission: fragmentShader.includes(
        "starMadeFragColor.rgb = max(emission*lightedColor.rgb, starMadeFragColor.rgb + spot);"
      ),
      usesTextureEmissionSpotInput: fragmentShader.includes("vec3 spot =  max(emission*mixTex.rgb")
    },
    materialTextures: {
      mainTex0: inspectTextureUniform(experimentalCubeMaterial.uniforms.mainTex0?.value),
      mainTex1: inspectTextureUniform(experimentalCubeMaterial.uniforms.mainTex1?.value),
      mainTex2: inspectTextureUniform(experimentalCubeMaterial.uniforms.mainTex2?.value),
      mainTex3: inspectTextureUniform(experimentalCubeMaterial.uniforms.mainTex3?.value),
      normalTex0: inspectTextureUniform(experimentalCubeMaterial.uniforms.normalTex0?.value),
      normalTex1: inspectTextureUniform(experimentalCubeMaterial.uniforms.normalTex1?.value),
      normalTex2: inspectTextureUniform(experimentalCubeMaterial.uniforms.normalTex2?.value),
      normalTex3: inspectTextureUniform(experimentalCubeMaterial.uniforms.normalTex3?.value)
    },
    lighting: showcaseLightingDiagnostics,
    blocks: debugBlocks.map(({ key, block }) => ({
      key,
      blockId: block.id,
      blockName: block.name,
      textureIds: block.textureIds,
      lightSource: block.lightSource,
      lightSourceColor: block.lightSourceColor,
      textures: Array.from(new Set(block.textureIds)).map((textureId) => inspectCubeTextureId(textureId, texturePack.layout))
    }))
  };
}

function inspectTextureUniform(texture: Texture | null | undefined) {
  const dimensions = texture ? textureImageDimensions(texture.image) : undefined;

  return {
    present: texture !== undefined && texture !== null,
    colorSpace: texture?.colorSpace,
    flipY: texture?.flipY,
    wrapS: texture?.wrapS,
    wrapT: texture?.wrapT,
    minFilter: texture?.minFilter,
    magFilter: texture?.magFilter,
    imageWidth: dimensions?.width ?? 0,
    imageHeight: dimensions?.height ?? 0,
    imageComplete: dimensions?.complete ?? null
  };
}

function inspectCubeTextureId(textureId: number, layout: StarMadeCubeAtlasLayout) {
  const layer = tileIdToStarMadeLayer(textureId, layout);
  const localTile = tileIdToStarMadeLocalTile(textureId, layout);
  const colorTexture = texturePack.layers.get(layer.layer);
  const normalTexture = texturePack.normalLayers?.get(layer.layer);

  return {
    textureId,
    layer: layer.layer,
    localTile,
    atlas: layer.name,
    color: colorTexture ? sampleAtlasTile(colorTexture, localTile, layout) : null,
    normal: normalTexture ? sampleAtlasTile(normalTexture, localTile, layout) : null
  };
}

function sampleAtlasTile(texture: Texture, localTile: number, layout: StarMadeCubeAtlasLayout) {
  const imageData = readTextureImageData(texture);

  if (!imageData) {
    return { readable: false };
  }

  const tileX = localTile % layout.columns;
  const tileY = Math.floor(localTile / layout.columns);
  const x0 = tileX * layout.tileSize;
  const y0 = tileY * layout.tileSize;
  const centerX = Math.min(imageData.width - 1, x0 + Math.floor(layout.tileSize / 2));
  const centerY = Math.min(imageData.height - 1, y0 + Math.floor(layout.tileSize / 2));
  const step = Math.max(1, Math.floor(layout.tileSize / 16));
  const totals = [0, 0, 0, 0] as [number, number, number, number];
  const min = [255, 255, 255, 255] as [number, number, number, number];
  const max = [0, 0, 0, 0] as [number, number, number, number];
  let count = 0;

  for (let y = y0; y < y0 + layout.tileSize && y < imageData.height; y += step) {
    for (let x = x0; x < x0 + layout.tileSize && x < imageData.width; x += step) {
      const rgba = readRgbaAt(imageData.data, imageData.width, x, y);
      for (let channel = 0; channel < 4; channel++) {
        totals[channel] += rgba[channel];
        min[channel] = Math.min(min[channel], rgba[channel]);
        max[channel] = Math.max(max[channel], rgba[channel]);
      }
      count++;
    }
  }

  return {
    readable: true,
    colorSpace: texture.colorSpace,
    flipY: texture.flipY,
    center: readRgbaAt(imageData.data, imageData.width, centerX, centerY),
    average: totals.map((value) => round3(value / Math.max(1, count))),
    min,
    max,
    alphaRange: [min[3], max[3]],
    emissionRange: [round3(Math.max(0, (min[3] / 255 - 0.5) * 2)), round3(Math.max(0, (max[3] / 255 - 0.5) * 2))]
  };
}

function readTextureImageData(texture: Texture): ImageData | undefined {
  const dimensions = textureImageDimensions(texture.image);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || dimensions.complete === false) {
    return undefined;
  }

  const readCanvas = document.createElement("canvas");
  readCanvas.width = dimensions.width;
  readCanvas.height = dimensions.height;
  const context = readCanvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return undefined;
  }

  context.drawImage(texture.image as CanvasImageSource, 0, 0, dimensions.width, dimensions.height);
  return context.getImageData(0, 0, dimensions.width, dimensions.height);
}

function textureImageDimensions(image: Texture["image"]): { readonly width: number; readonly height: number; readonly complete?: boolean } | undefined {
  const candidate = image as {
    readonly width?: number;
    readonly height?: number;
    readonly naturalWidth?: number;
    readonly naturalHeight?: number;
    readonly complete?: boolean;
  } | undefined | null;

  if (!candidate) {
    return undefined;
  }

  return {
    width: candidate.naturalWidth ?? candidate.width ?? 0,
    height: candidate.naturalHeight ?? candidate.height ?? 0,
    complete: candidate.complete
  };
}

function readRgbaAt(data: Uint8ClampedArray, width: number, x: number, y: number): readonly [number, number, number, number] {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function inspectShowcaseLightingEntries(): readonly ShowcaseLightingEntryDiagnostic[] {
  return [
    inspectShowcaseLightingEntry("gravity-0", experimentalCubes[0].cube, experimentalCubes[0].geometry),
    inspectShowcaseLightingEntry("slab-1-4", slabMeshes[0].cube, slabMeshes[0].geometry),
    inspectShowcaseLightingEntry("wedge-0", wedgeMeshes[0].cube, wedgeMeshes[0].geometry),
    inspectShowcaseLightingEntry("corner-0", cornerMeshes[0].cube, cornerMeshes[0].geometry),
    inspectShowcaseLightingEntry("tetra-0", tetraMeshes[0].cube, tetraMeshes[0].geometry),
    inspectShowcaseLightingEntry("penta-0", pentaMeshes[0].cube, pentaMeshes[0].geometry),
    inspectShowcaseLightingEntry("normal24-0", normal24Meshes[0].cube, normal24Meshes[0].geometry),
    inspectShowcaseLightingEntry("sprite-0", spriteMeshes[0].cube, spriteMeshes[0].geometry),
    inspectShowcaseLightingEntry("light-on", activeLightMeshes[2].cube, activeLightOnGeometry),
    inspectShowcaseLightingEntry("receiver-on", lightReceiverMeshes[2].cube, lightReceiverMeshes[2].geometry),
    inspectShowcaseLightingEntry("logic-button", logicBlockMeshes[0].cube, logicBlockMeshes[0].geometry)
  ];
}

function inspectShowcaseLightingEntry(key: string, cube: Mesh, geometry: BufferGeometry): ShowcaseLightingEntryDiagnostic {
  const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
  const vertexLights = Array.from({ length: encoded.count }, (_, index) => decodeLightCode(encoded.getX(index)));
  const secondaryOcclusions = Array.from({ length: encoded.count }, (_, index) => decodeSecondaryOcclusionCode(encoded.getW(index)));
  const maxLight = vertexLights.reduce(
    (max, light) => [
      Math.max(max[0], light.red),
      Math.max(max[1], light.green),
      Math.max(max[2], light.blue)
    ] as [number, number, number],
    [0, 0, 0] as [number, number, number]
  );

  return {
    key,
    position: toVectorTuple(cube.position),
    sampleGrid: visualTestShowcaseLightingGrid(cube.position),
    firstVertexLight: vertexLights[0],
    firstSecondaryOcclusion: secondaryOcclusions[0],
    secondaryOcclusionRange: secondaryOcclusions.reduce<{
      encoded: readonly [number, number];
      shader: readonly [number, number];
    }>(
      (range, occlusion) => ({
        encoded: [Math.min(range.encoded[0], occlusion.encoded), Math.max(range.encoded[1], occlusion.encoded)] as const,
        shader: [Math.min(range.shader[0], occlusion.shader), Math.max(range.shader[1], occlusion.shader)] as const
      }),
      { encoded: [31, 0] as const, shader: [1, 0] as const }
    ),
    maxLight
  };
}

function whiteLightSurfaceLightForCell(
  gridX: number,
  gridZ: number
): readonly [number, number, number] {
  return getStarMadeBlockLightSurfaceTopAverageLight(blockLightSurfaceLighting, gridX, gridZ);
}

function applyWhiteLightSurfaceFaceLighting(
  geometry: BufferGeometry,
  cubePosition: Vector3,
  options: {
    readonly volume?: StarMadeBlockLightVolume;
    readonly gridPosition?: readonly [number, number, number];
  } = {}
): void {
  const gridPosition = options.gridPosition ?? ([
    Math.round(cubePosition.x - WHITE_LIGHT_SURFACE_ORIGIN.x + (WHITE_LIGHT_SURFACE_SIZE - 1) / 2),
    Math.round(cubePosition.y - WHITE_LIGHT_SURFACE_ORIGIN.y),
    Math.round(cubePosition.z - WHITE_LIGHT_SURFACE_ORIGIN.z + (WHITE_LIGHT_SURFACE_SIZE - 1) / 2)
  ] as const);
  // One-block fixtures encode their center at [16,16,16]. Preserve source face
  // metadata and map each actual corner, not its buffer ordinal, into the volume.
  applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [-16, -16, -16], {
    volume: options.volume ?? blockLightSurfaceLighting.volume,
    volumeShift: gridPosition
  });
}

function encodeLightChannel(value: number): number {
  return Math.min(31, Math.max(0, Math.round(value)));
}


function createStarMadeShadowCaster(options: {
  readonly key: string;
  readonly label: string;
  readonly type: StarMadeShadowCasterType;
  readonly root: Object3D;
  readonly alphaDiscard?: boolean;
}): StarMadeShadowCaster {
  return options;
}


function inspectStarMadeSunShadowPipeline(pipeline: ReturnType<typeof createStarMadeDirectionalShadowPipeline>): DeskDirectionalShadowDiagnostic {
  return {
    enabled: true,
    model: "Native main-light shadow pass; voxel RGB occlusion is not projected onto sunlight",
    sourceGrids: [],
    sourceCount: 1,
    sourceShadows: [],
    casterBounds: boxToDiagnostic(sunShadowBounds),
    casterMeshCount: pipeline.casterMeshCount,
    casterTriangleCount: pipeline.casterTriangleCount,
    casterCount: 1,
    casters: [{ key: "full-preview-scene", label: "Full preview scene", type: "mesh", alphaDiscard: false,
      bounds: boxToDiagnostic(sunShadowBounds), meshCount: pipeline.casterMeshCount, triangleCount: pipeline.casterTriangleCount }],
    shadowMapSize: pipeline.mapSize,
    shadowStrength: pipeline.strength,
    shadowBias: pipeline.bias,
    cameraPosition: toVectorTuple(pipeline.camera.position),
    cameraTarget: toVectorTuple(sunShadowBounds.getCenter(new Vector3())),
    cameraNear: pipeline.camera.near,
    cameraFar: pipeline.camera.far
  };
}

function countStarMadeLodShadowReceivers(roots: readonly Object3D[]): number {
  return roots.reduce(
    (count, root) =>
      count +
      collectStarMadeLodShaderMaterials(root).filter((material) => material.uniforms.starMadeShadowMap0?.value !== undefined).length,
    0
  );
}

function whiteLightSurfaceSampleCells(): readonly (readonly [number, number])[] {
  const last = WHITE_LIGHT_SURFACE_SIZE - 1;

  return [
    RED_LIGHT_SURFACE_SOURCE_GRID,
    [7, 10],
    WHITE_LIGHT_SURFACE_SOURCE_GRID,
    [13, 10],
    BLUE_LIGHT_SURFACE_SOURCE_GRID,
    DESK_LIGHT_SURFACE_GRID,
    DESK_LIGHT_SHADOW_PROBE_GRID,
    [14, 14],
    [0, 0],
    [last, last]
  ] as const;
}

function whiteLightSurfaceCellTopLight(cell: { readonly geometry: BufferGeometry }): readonly [number, number, number] {
  const encoded = cell.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
  const topVertexLights = Array.from({ length: 4 }, (_, offset) => decodeLightCode(encoded.getX(2 * 4 + offset)));

  return [
    Math.max(...topVertexLights.map((entry) => entry.red)),
    Math.max(...topVertexLights.map((entry) => entry.green)),
    Math.max(...topVertexLights.map((entry) => entry.blue))
  ] as const;
}

function whiteLightSurfaceLightHistogram(cells: readonly { readonly geometry: BufferGeometry }[]): Record<string, number> {
  return cells.reduce<Record<string, number>>((histogram, cell) => {
    const key = whiteLightSurfaceCellTopLight(cell).join(",");
    histogram[key] = (histogram[key] ?? 0) + 1;
    return histogram;
  }, {});
}

function inspectWhiteLightSurfaceCell(gridX: number, gridZ: number): BlockLightSurfaceCellDiagnostic {
  const cell = whiteLightSurfaceCells.find((entry) => entry.gridX === gridX && entry.gridZ === gridZ);

  if (!cell) {
    throw new Error(`Missing white light surface cell ${gridX},${gridZ}`);
  }

  const encoded = cell.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

  return {
    grid: [gridX, gridZ] as const,
    position: toVectorTuple(cell.cube.position),
    encodedLight: cell.light,
    topVertexLights: Array.from({ length: 4 }, (_, offset) => decodeLightCode(encoded.getX(2 * 4 + offset))),
    frontVertexLight: decodeLightCode(encoded.getX(0)),
    bottomVertexLight: decodeLightCode(encoded.getX(3 * 4))
  };
}

function inspectWhiteLightBlockerWall(): BlockerWallRuntimeDiagnostic {
  const blocks = whiteLightBlockerWallMeshes.map((entry) => {
    const encoded = entry.geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE) as BufferAttribute;
    const position = entry.cube.position;

    return {
      grid: [entry.position[0], entry.position[1], entry.position[2]] as const,
      position: toVectorTuple(position),
      leftWhiteSide: inspectWhiteLightBlockerWallFace(
        encoded,
        5,
        `wall-left-white-${entry.position.join("-")}`,
        position.clone().add(new Vector3(-0.51, 0, 0))
      ),
      rightBlueSide: inspectWhiteLightBlockerWallFace(
        encoded,
        4,
        `wall-right-blue-${entry.position.join("-")}`,
        position.clone().add(new Vector3(0.51, 0, 0))
      )
    } satisfies BlockerWallBlockRuntimeDiagnostic;
  });

  const rightBlueSideWhiteLeakCount = blocks.filter((block) => {
    const [red, green, blue] = block.rightBlueSide.max;

    return red >= 8 && green >= 8 && blue >= 8;
  }).length;
  const rightBlueSideBrightCount = blocks.filter((block) =>
    block.rightBlueSide.max.some((channel) => channel >= 8)
  ).length;
  const diagnostic = {
    blockCount: blocks.length,
    rightBlueSideWhiteLeakCount,
    rightBlueSideBrightCount,
    blocks
  } satisfies BlockerWallRuntimeDiagnostic;

  console.log("[StarMade wall-debug] blocker wall face lights", {
    blockCount: diagnostic.blockCount,
    rightBlueSideWhiteLeakCount: diagnostic.rightBlueSideWhiteLeakCount,
    rightBlueSideBrightCount: diagnostic.rightBlueSideBrightCount,
    rightBlueSideRows: summarizeBlockerWallSide(blocks, "rightBlueSide"),
    leftWhiteSideRows: summarizeBlockerWallSide(blocks, "leftWhiteSide")
  });

  return diagnostic;
}

function inspectWhiteLightBlockerWallFace(
  encoded: BufferAttribute,
  faceIndex: number,
  key: string,
  world: Vector3
): BlockerWallFaceRuntimeDiagnostic {
  const vertices = Array.from({ length: 4 }, (_, offset) => decodeLightCode(encoded.getX(faceIndex * 4 + offset)));
  const channels = ["red", "green", "blue"] as const;
  const max = channels.map((channel) => Math.max(...vertices.map((vertex) => vertex[channel]))) as [number, number, number];
  const min = channels.map((channel) => Math.min(...vertices.map((vertex) => vertex[channel]))) as [number, number, number];
  const average = channels.map((channel) =>
    round3(vertices.reduce((sum, vertex) => sum + vertex[channel], 0) / vertices.length)
  ) as [number, number, number];

  return {
    vertices,
    max,
    min,
    average,
    canvas: sampleCanvasAtWorldPoint(key, world)
  };
}

function summarizeBlockerWallSide(
  blocks: readonly BlockerWallBlockRuntimeDiagnostic[],
  side: "leftWhiteSide" | "rightBlueSide"
): readonly {
  readonly y: number;
  readonly z: number;
  readonly average: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly rgba: readonly [number, number, number, number] | null;
}[] {
  return blocks.map((block) => ({
    y: block.grid[1],
    z: block.grid[2],
    average: block[side].average,
    max: block[side].max,
    rgba: block[side].canvas.rgba
  }));
}

function toVectorTuple(vector: Vector3): readonly [number, number, number] {
  return [round3(vector.x), round3(vector.y), round3(vector.z)] as const;
}

function toQuaternionTuple(quaternion: Object3D["quaternion"]): readonly [number, number, number, number] {
  return [round3(quaternion.x), round3(quaternion.y), round3(quaternion.z), round3(quaternion.w)] as const;
}

function boxToDiagnostic(box: Box3): LodModelDiagnostic["bounds"] {
  return {
    min: toVectorTuple(box.min),
    max: toVectorTuple(box.max),
    size: toVectorTuple(box.max.clone().sub(box.min))
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampIntegerParam(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function clampNumberParam(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
