import {
  DataArrayTexture,
  DataTexture,
  DoubleSide,
  FrontSide,
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  type Object3D,
  type Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4
} from "three";
import type { StarMadeCubeTexturePack } from "../textures/index.js";
import { createStarMadeThreeShaderProgramSources } from "./gpuValidation.js";
import { injectStarMadeShadowVertex, injectStarMadeShadowFragment, injectStarMadeLodShadowFragment } from "./shadowShaderTransform.js";

export const STARMADE_CUBE_SHADER_VERTEX_ATTRIBUTE = "starMadeVertex";
export const STARMADE_OPENGL_LIGHT_SOURCE_SLOTS = 8;

/**
 * StarMade-Open default LOD distance threshold in world units.
 * Source: EngineSettings.LOD_DISTANCE_IN_THRESHOLD default = 100.0f.
 * LOD_THRESH_SQUARED = (threshold + 16)^2 in SegmentDrawer.java.
 */
export const STARMADE_LOD_DISTANCE_THRESHOLD_DEFAULT = 100;
export const STARMADE_LOD_THRESH_SQUARED_DEFAULT = (STARMADE_LOD_DISTANCE_THRESHOLD_DEFAULT + 16) ** 2;
const STARMADE_LEGACY_LIGHT_SOURCE_SLOTS = 8;
const STARMADE_BLOCK_LIGHT_SOURCE_SLOTS = STARMADE_OPENGL_LIGHT_SOURCE_SLOTS - 1;
const STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY = 1.2;
const STARMADE_BLOCK_LIGHT_SPECULAR_INTENSITY = 0.3;
const STARMADE_BLOCK_LIGHT_QUADRATIC_ATTENUATION = 0.02;

export interface StarMadeShadowParams {
  readonly mapArray?: Texture | null | undefined;
  readonly maps?: readonly (Texture | null | undefined)[];
  readonly matrices?: readonly (Matrix4 | null | undefined)[];
  readonly mapArrayMode?: "splits" | "blockSources";
  /** Source colors used by blockSources shadow-map arrays. Classic StarMade-Open split shadows still use scalar shadowCoef(). */
  readonly colors?: readonly (Vector3 | null | undefined)[];
  readonly strength?: number;
  readonly bias?: number;
  readonly texelSize?: Vector2;
  /** StarMade-Open ShadowParams.texSize: x = map size, y = 1 / map size. */
  readonly texSize?: Vector2;
  /** StarMade-Open ShadowParams.far_d split thresholds in camera depth space. */
  readonly farDistances?: Vector4;
  readonly splits?: number;
}

export interface StarMadeCubeShaderMaterialOptions {
  readonly textureLayers?: ReadonlyMap<number, Texture> | null;
  readonly normalTextureLayers?: ReadonlyMap<number, Texture> | null;
  readonly textureArray?: DataArrayTexture | null;
  readonly normalTextureArray?: DataArrayTexture | null;
  readonly overlayMap?: Texture | null;
  readonly blended?: boolean;
  readonly alphaDiscard?: boolean;
  readonly doubleSided?: boolean;
  readonly selectTime?: number;
  readonly extraAlpha?: number;
  readonly density?: number;
  readonly animationTime?: number;
  /** Camera near plane distance. Used by shadow.glsl and depth shaders. Default 0.1. */
  readonly zNear?: number;
  /** Camera far plane distance. Used by shadow.glsl and depth shaders. Default 600. */
  readonly zFar?: number;
  /** Elapsed time in seconds, incremented each frame. Used by virtual/animated shaders. Default 0. */
  readonly uTime?: number;
  readonly spotCount?: number;
  readonly normalDebugMode?: number;
  readonly normalStrength?: number;
  readonly lightPosition?: Vector3;
  readonly viewPosition?: Vector3;
  /** Sun light configuration; feeds lightPos, ambient, diffuse, specular, starMadeLightSources[0]. */
  readonly sun?: StarMadeSceneSunOptions;
  readonly lodShadowMap?: Texture | null;
  readonly lodShadowMatrix?: Matrix4 | null;
  readonly lodShadowMap1?: Texture | null;
  readonly lodShadowMatrix1?: Matrix4 | null;
  readonly lodShadowMap2?: Texture | null;
  readonly lodShadowMatrix2?: Matrix4 | null;
  readonly lodShadowStrength?: number;
  readonly lodShadowBias?: number;
  readonly lodShadowTexelSize?: Vector2;
  readonly shadowParams?: StarMadeShadowParams;
}

export interface StarMadeCubeTextureArrayOptions {
  readonly layers?: readonly number[];
  readonly source?: "color" | "normal";
}

export interface StarMadeSceneSunOptions {
  /** Positional light in world space, before the camera transform; never normalized. */
  readonly position?: Vector3;
  /** @deprecated Legacy alias for position, not a directional-light vector. */
  readonly direction?: Vector3;
  /** Ambient light color. Default: (0.45, 0.45, 0.45). */
  readonly ambient?: Vector3;
  /** Diffuse light color. Default: (1, 1, 1). */
  readonly diffuse?: Vector3;
  /** Specular light color. Default: (0.45, 0.45, 0.45). */
  readonly specular?: Vector3;
  /** Source ambient contributed to gl_LightSource[0]. Default: (0.05, 0.05, 0.05). */
  readonly sourceAmbient?: Vector3;
}

export interface StarMadeLodShaderMaterialOptions {
  readonly mainTexture?: Texture | null;
  readonly emissiveTexture?: Texture | null;
  readonly normalTexture?: Texture | null;
  readonly emissiveOn?: boolean;
  readonly blended?: boolean;
  readonly lightPosition?: Vector3;
  readonly viewPosition?: Vector3;
  readonly shadowParams?: StarMadeShadowParams;
  /** Sun light configuration; feeds lightPos + starMadeLightSources[0]. */
  readonly sun?: StarMadeSceneSunOptions;
}

export interface StarMadeCubeShadowDepthMaterialOptions {
  readonly alphaDiscard?: boolean;
  readonly animationTime?: number;
  readonly lodThreshold?: number;
  readonly mainTexture0?: Texture | null;
  readonly mainTexture1?: Texture | null;
  readonly mainTexture2?: Texture | null;
  readonly mainTexture3?: Texture | null;
  readonly mainTexture7?: Texture | null;
}

export interface StarMadeLodShadowDepthMaterialOptions {
  readonly lightPosition?: Vector3;
}

export type StarMadeLodLightVec = readonly [number, number, number];
export type StarMadeLodLightDiffuse = readonly [number, number, number, number];

export interface StarMadeLodLightUniforms {
  readonly lightVec: readonly StarMadeLodLightVec[];
  readonly lightDiffuse: readonly StarMadeLodLightDiffuse[];
}

const cubeTextureArrayLayers = [0, 1, 2, 3] as const;
const starMadeOpenCubeRuntimeDefines = ["INTATT", "shader4", "force130"] as const;

/**
 * Preview lighting defaults. The host must supply the actual sector light position
 * to reproduce a game frame; a normalized shadow direction is not a light position.
 */
export const STARMADE_SCENE_LIGHTING_DEFAULTS = {
  sunPosition: new Vector3(450, 900, 0),
  sunDirection: new Vector3(450, 900, 0).normalize(),
  ambient: new Vector3(0.45, 0.45, 0.45),
  diffuse: new Vector3(1.0, 1.0, 1.0),
  specular: new Vector3(0.45, 0.45, 0.45),
  sourceAmbient: new Vector3(0.05, 0.05, 0.05)
} as const;

export function starMadeCubeTextureArraySourceY(targetY: number, height: number): number {
  if (!Number.isInteger(targetY) || targetY < 0 || targetY >= height) {
    throw new Error(`targetY must be an integer inside the texture height, got ${targetY}`);
  }

  return targetY;
}

export function applyStarMadeCubeTextureArrayTileGutters(
  data: Uint8Array,
  layerOffset: number,
  width: number,
  height: number,
  tileSize: number,
  gutterSize = Math.max(1, Math.floor(tileSize / 16))
): void {
  if (width % tileSize !== 0 || height % tileSize !== 0) {
    throw new Error(`StarMade texture atlas ${width}x${height} is not aligned to ${tileSize}px tiles`);
  }

  if (gutterSize <= 0 || gutterSize * 2 >= tileSize) {
    throw new Error(`gutterSize must be positive and smaller than half a tile, got ${gutterSize}`);
  }

  const columns = width / tileSize;
  const rows = height / tileSize;

  for (let tileY = 0; tileY < rows; tileY++) {
    const y0 = tileY * tileSize;
    const y1 = y0 + tileSize - 1;
    const sourceTop = y0 + gutterSize;
    const sourceBottom = y1 - gutterSize;

    for (let tileX = 0; tileX < columns; tileX++) {
      const x0 = tileX * tileSize;
      const x1 = x0 + tileSize - 1;
      const sourceLeft = x0 + gutterSize;
      const sourceRight = x1 - gutterSize;

      for (let y = y0; y <= y1; y++) {
        const sourceY = Math.min(sourceBottom, Math.max(sourceTop, y));

        for (let x = x0; x <= x1; x++) {
          const sourceX = Math.min(sourceRight, Math.max(sourceLeft, x));

          if (sourceX === x && sourceY === y) {
            continue;
          }

          const sourceOffset = layerOffset + (sourceY * width + sourceX) * 4;
          const targetOffset = layerOffset + (y * width + x) * 4;

          data[targetOffset] = data[sourceOffset];
          data[targetOffset + 1] = data[sourceOffset + 1];
          data[targetOffset + 2] = data[sourceOffset + 2];
          data[targetOffset + 3] = data[sourceOffset + 3];
        }
      }
    }
  }
}

export function createStarMadeCubeShaderMaterial(options: StarMadeCubeShaderMaterialOptions = {}): ShaderMaterial {
  const usesOpenTexturePipeline = options.textureLayers !== undefined || options.normalTextureLayers !== undefined;
  const normalMappedTextureLayers = options.normalTextureLayers !== undefined && options.normalTextureLayers !== null;
  const normalMappedTextureArray = options.normalTextureArray !== undefined && options.normalTextureArray !== null;
  const defines: string[] = [...starMadeOpenCubeRuntimeDefines];

  if (usesOpenTexturePipeline) {
    if (normalMappedTextureLayers) {
      defines.push("normalmap");
    }
  } else {
    defines.push("texarray");

    if (normalMappedTextureArray) {
      defines.push("normaltexarray", "normalmap");
    }
  }

  const alphaDiscard = options.alphaDiscard ?? options.blended ?? false;

  if (alphaDiscard) {
    defines.push("blended");
  }

  const sources = createStarMadeThreeShaderProgramSources("cube.quads13", {
    defines,
    lightSourceCount: STARMADE_OPENGL_LIGHT_SOURCE_SLOTS
  });
  const fallbackTexture = createFallbackTexture();
  const fallbackCubeTexture = createFallbackTexture();
  const shadowParams = resolveStarMadeShadowParams(options, fallbackTexture);
  const vertexShader = injectStarMadeShadowVertex(stripGlslVersion(sources.vertexSource));
  const fragmentShader = injectStarMadeShadowFragment(stripGlslVersion(sources.fragmentSource));
  const blended = options.blended ?? false;

  const material = new ShaderMaterial({
    name: "StarMadeCubeShaderMaterial:experimental",
    glslVersion: GLSL3,
    transparent: blended,
    depthWrite: !blended,
    side: options.doubleSided ? DoubleSide : FrontSide,
    vertexShader,
    fragmentShader,
    uniforms: createStarMadeCubeShaderUniforms({
      textureArray: options.textureArray ?? createFallbackTextureArray(),
      normalTextureArray: options.normalTextureArray ?? createFallbackTextureArray("normal"),
      mainTexture0: resolveCubeTextureLayer(options.textureLayers, 0, fallbackCubeTexture),
      mainTexture1: resolveCubeTextureLayer(options.textureLayers, 1, fallbackCubeTexture),
      mainTexture2: resolveCubeTextureLayer(options.textureLayers, 2, fallbackCubeTexture),
      mainTexture3: resolveCubeTextureLayer(options.textureLayers, 3, fallbackCubeTexture),
      mainTexture7: resolveCubeTextureLayer(options.textureLayers, 7, fallbackCubeTexture),
      normalTexture0: resolveCubeTextureLayer(options.normalTextureLayers, 0, createNeutralNormalTexture()),
      normalTexture1: resolveCubeTextureLayer(options.normalTextureLayers, 1, createNeutralNormalTexture()),
      normalTexture2: resolveCubeTextureLayer(options.normalTextureLayers, 2, createNeutralNormalTexture()),
      normalTexture3: resolveCubeTextureLayer(options.normalTextureLayers, 3, createNeutralNormalTexture()),
      normalTexture7: resolveCubeTextureLayer(options.normalTextureLayers, 7, createNeutralNormalTexture()),
      overlayMap: options.overlayMap ?? createFallbackTexture(0),
      shadowMapArray: shadowParams.mapArray,
      shadowUseMapArray: shadowParams.useMapArray,
      shadowMapArrayMode: shadowParams.mapArrayMode,
      shadowMap0: shadowParams.maps[0],
      shadowMatrix0: shadowParams.matrices[0],
      shadowMap1: shadowParams.maps[1],
      shadowMatrix1: shadowParams.matrices[1],
      shadowMap2: shadowParams.maps[2],
      shadowMatrix2: shadowParams.matrices[2],
      shadowColor0: shadowParams.colors[0],
      shadowColor1: shadowParams.colors[1],
      shadowColor2: shadowParams.colors[2],
      shadowStrength: shadowParams.strength,
      shadowBias: shadowParams.bias,
      shadowTexelSize: shadowParams.texelSize,
      shadowTexSize: shadowParams.texSize,
      shadowFarDistances: shadowParams.farDistances,
      shadowSplits: shadowParams.splits,
      selectTime: options.selectTime ?? 0,
      extraAlpha: options.extraAlpha ?? (alphaDiscard ? 1 : 0),
      density: options.density ?? 0,
      animationTime: options.animationTime ?? 0,
      zNear: options.zNear ?? 0.1,
      zFar: options.zFar ?? 600,
      uTime: options.uTime ?? 0,
      spotCount: options.spotCount ?? 0,
      normalDebugMode: options.normalDebugMode ?? 0,
      normalStrength: options.normalStrength ?? 1,
      lightPosition: (options.sun?.position ?? options.sun?.direction ?? options.lightPosition ?? STARMADE_SCENE_LIGHTING_DEFAULTS.sunPosition).clone(),
      lightSourceCount: STARMADE_OPENGL_LIGHT_SOURCE_SLOTS,
      viewPosition: options.viewPosition ?? new Vector3(0, 0, 0)
    })
  });

  material.userData.starMadeDefines = sources.defines;
  installStarMadeSunViewUpdate(material);
  if (options.sun) {
    applyStarMadeSceneSunToShaderMaterial(material, options.sun);
  }
  return material;
}

export function applyStarMadeShadowParamsToShaderMaterial(material: ShaderMaterial, shadowParams: StarMadeShadowParams): void {
  const maps = shadowParams.maps;
  const matrices = shadowParams.matrices;

  if (maps?.[0]) material.uniforms.starMadeShadowMap0.value = maps[0];
  if (maps?.[1]) material.uniforms.starMadeShadowMap1.value = maps[1];
  if (maps?.[2]) material.uniforms.starMadeShadowMap2.value = maps[2];
  if (shadowParams.mapArray) {
    material.uniforms.starMadeShadowMapArray.value = shadowParams.mapArray;
    material.uniforms.starMadeShadowUseMapArray.value = true;
  } else if (maps !== undefined) {
    // Switching from array shadows back to a single map must not keep the
    // previous array sampler active. Partial strength/bias updates keep it.
    material.uniforms.starMadeShadowUseMapArray.value = false;
    material.uniforms.starMadeShadowMapArrayMode.value = 0;
  }
  if (shadowParams.mapArrayMode) {
    material.uniforms.starMadeShadowMapArrayMode.value = shadowParams.mapArrayMode === "blockSources" ? 1 : 0;
  }
  if (matrices?.[0]) material.uniforms.starMadeShadowMatrix0.value = matrices[0];
  if (matrices?.[1]) material.uniforms.starMadeShadowMatrix1.value = matrices[1];
  if (matrices?.[2]) material.uniforms.starMadeShadowMatrix2.value = matrices[2];
  if (shadowParams.strength !== undefined) material.uniforms.starMadeShadowStrength.value = shadowParams.strength;
  if (shadowParams.bias !== undefined) material.uniforms.starMadeShadowBias.value = shadowParams.bias;
  if (shadowParams.texelSize) material.uniforms.starMadeShadowTexelSize.value = shadowParams.texelSize;
  if (shadowParams.texSize) material.uniforms.starMadeShadowTexSize.value = shadowParams.texSize;
  else if (shadowParams.texelSize) material.uniforms.starMadeShadowTexSize.value = starMadeShadowTexSizeFromTexelSize(shadowParams.texelSize);
  if (shadowParams.farDistances) material.uniforms.starMadeShadowFarDistances.value = shadowParams.farDistances;
  if (shadowParams.splits !== undefined) material.uniforms.starMadeShadowSplits.value = shadowParams.splits;
  if (shadowParams.colors?.[0]) material.uniforms.starMadeShadowColor0.value = shadowParams.colors[0];
  if (shadowParams.colors?.[1]) material.uniforms.starMadeShadowColor1.value = shadowParams.colors[1];
  if (shadowParams.colors?.[2]) material.uniforms.starMadeShadowColor2.value = shadowParams.colors[2];
  material.uniformsNeedUpdate = true;
}

export function applyStarMadeShadowParamsToCubeShaderMaterial(material: ShaderMaterial, shadowParams: StarMadeShadowParams): void {
  applyStarMadeShadowParamsToShaderMaterial(material, shadowParams);
}

export function applyStarMadeShadowParamsToLodShaderMaterial(material: ShaderMaterial, shadowParams: StarMadeShadowParams): void {
  applyStarMadeShadowParamsToShaderMaterial(material, shadowParams);
}

export function applyStarMadeShadowParamsToLodObject3D(root: Object3D, shadowParams: StarMadeShadowParams): number {
  let appliedCount = 0;

  for (const material of collectStarMadeLodShaderMaterials(root)) {
    applyStarMadeShadowParamsToLodShaderMaterial(material, shadowParams);
    appliedCount++;
  }

  return appliedCount;
}

export function applyStarMadeLodBlockLightToShaderMaterial(
  material: ShaderMaterial,
  lighting: StarMadeLodLightUniforms
): boolean {
  const lightDiffuseUniform = material.uniforms.lightDiffuse?.value;
  const lightVecUniform = material.uniforms.lightVec?.value;

  if (!Array.isArray(lightDiffuseUniform) || !Array.isArray(lightVecUniform)) {
    return false;
  }

  const uniformCount = Math.max(lightDiffuseUniform.length, lightVecUniform.length);
  for (let index = 0; index < uniformCount; index++) {
    const diffuseVector = lightDiffuseUniform[index] as StarMadeMutableVector4Like | undefined;
    const vecVector = lightVecUniform[index] as StarMadeMutableVector3Like | undefined;
    const diffuse = lighting.lightDiffuse[index] ?? [0, 0, 0, 0];
    const vec = lighting.lightVec[index] ?? [0, 0, 0];

    if (diffuseVector && typeof diffuseVector.set === "function") {
      diffuseVector.set(diffuse[0], diffuse[1], diffuse[2], diffuse[3]);
    }

    if (vecVector && typeof vecVector.set === "function") {
      // Native side vectors point from donor air into the receiver. The corrected
      // LOD shader needs world-space directions from receiver toward donor.
      vecVector.set(0 - vec[0], 0 - vec[1], 0 - vec[2]);
    }
  }

  material.uniformsNeedUpdate = true;
  return true;
}

export function collectStarMadeLodShaderMaterials(root: Object3D): ShaderMaterial[] {
  const materials: ShaderMaterial[] = [];

  root.traverse((object) => {
    const material = (object as StarMadeObjectWithMaterial).material;
    const objectMaterials = Array.isArray(material) ? material : material ? [material] : [];

    for (const entry of objectMaterials) {
      if (entry instanceof ShaderMaterial && isStarMadeLodShaderMaterial(entry)) {
        materials.push(entry);
      }
    }
  });

  return materials;
}

export function applyStarMadeLodBlockLightToObject3D(root: Object3D, lighting: StarMadeLodLightUniforms): number {
  let appliedCount = 0;

  for (const material of collectStarMadeLodShaderMaterials(root)) {
    if (applyStarMadeLodBlockLightToShaderMaterial(material, lighting)) {
      appliedCount++;
    }
  }

  return appliedCount;
}
/**
 * @deprecated Use applyStarMadeSceneSunToShaderMaterial with StarMadeSceneSunOptions.
 * Delegates to applyStarMadeSceneSunToShaderMaterial for backward compatibility.
 */
export function applyStarMadeSunToLodShaderMaterial(
  material: ShaderMaterial,
  sunDirection: Vector3,
  options?: {
    readonly ambient?: Vector3;
    readonly diffuse?: Vector3;
    readonly specular?: Vector3;
  }
): void {
  applyStarMadeSceneSunToShaderMaterial(material, {
    direction: sunDirection,
    ambient: options?.ambient,
    diffuse: options?.diffuse,
    specular: options?.specular
  });
}

/**
 * @deprecated Use applyStarMadeSceneSunToLodObject3D with StarMadeSceneSunOptions.
 * Delegates to applyStarMadeSceneSunToLodObject3D for backward compatibility.
 */
export function applyStarMadeSunToLodObject3D(
  root: Object3D,
  sunDirection: Vector3,
  options?: Parameters<typeof applyStarMadeSunToLodShaderMaterial>[2]
): number {
  return applyStarMadeSceneSunToLodObject3D(root, {
    direction: sunDirection,
    ambient: options?.ambient,
    diffuse: options?.diffuse,
    specular: options?.specular
  });
}


function isStarMadeLodShaderMaterial(material: ShaderMaterial): boolean {
  return material.name.startsWith("StarMadeLodShaderMaterial");
}


export interface StarMadeBlockLightSpotSource {
  /** Scene/world-space position [x,y,z] of the light source block before view transform. */
  readonly position: readonly [number, number, number];
  /** Normalized RGB color contribution (0..1 per channel). */
  readonly color: readonly [number, number, number, number];
  /** Whether this source is active. Defaults to true. */
  readonly active?: boolean;
}

/**
 * Feeds active block-light sources into a cube ShaderMaterial's spot-light slots.
 * Selects up to `maxSources` active sources closest to `centerPosition`,
 * writes them into `starMadeLightSources[1..N]`, and sets `spotCount = N`.
 *
 * The selected source list is stored on the material so callers can update the
 * positions to view space every frame. StarMade-Open's fixed-function light
 * positions are eye-space by the time cubeTArray.fsh runs.
 *
 * @param material  cube ShaderMaterial created by createStarMadeCubeShaderMaterial
 * @param sources   block-light sources from StarMadeBlockLightVolume.sources
 * @param centerPosition  world-space center used to rank nearest sources
 * @param maxSources  max slots to fill (default is every block-light slot)
 */
export function applyStarMadeBlockLightSourcesToCubeShaderMaterial(
  material: ShaderMaterial,
  sources: readonly StarMadeBlockLightSpotSource[],
  centerPosition: readonly [number, number, number],
  maxSources = STARMADE_BLOCK_LIGHT_SOURCE_SLOTS
): number {
  const lightSourcesUniform = material.uniforms.starMadeLightSources?.value;
  const spotCountUniform = material.uniforms.spotCount;

  if (!Array.isArray(lightSourcesUniform) || !spotCountUniform) {
    return 0;
  }

  const maxSlots = Math.min(maxSources, lightSourcesUniform.length - 1);
  const activeSources = sources.filter((s) => s.active !== false);
  const selectedSources = activeSources.length <= maxSlots
    ? activeSources.slice()
    : activeSources.map((s) => {
      const dx = s.position[0] - centerPosition[0];
      const dy = s.position[1] - centerPosition[1];
      const dz = s.position[2] - centerPosition[2];
      return { source: s, dist2: dx * dx + dy * dy + dz * dz };
    })
    .sort((a, b) => a.dist2 - b.dist2)
    .slice(0, maxSlots)
    .map((entry) => entry.source);

  (material.userData as StarMadeBlockLightSourceUserData).starMadeBlockLightSpotSources = selectedSources;
  const slotCount = writeStarMadeBlockLightSourceSlots(material, selectedSources);
  material.uniformsNeedUpdate = true;
  return slotCount;
}

export function updateStarMadeBlockLightSourcesViewSpace(
  material: ShaderMaterial,
  viewMatrix: Matrix4
): number {
  const selectedSources = (material.userData as StarMadeBlockLightSourceUserData).starMadeBlockLightSpotSources;

  if (!selectedSources) {
    return 0;
  }

  return writeStarMadeBlockLightSourceSlots(material, selectedSources, viewMatrix);
}

interface StarMadeBlockLightSourceUserData {
  starMadeBlockLightSpotSources?: readonly StarMadeBlockLightSpotSource[];
}

const starMadeBlockLightSourceViewPosition = new Vector3();

function writeStarMadeBlockLightSourceSlots(
  material: ShaderMaterial,
  activeSources: readonly StarMadeBlockLightSpotSource[],
  viewMatrix?: Matrix4
): number {
  const lightSourcesUniform = material.uniforms.starMadeLightSources?.value;
  const spotCountUniform = material.uniforms.spotCount;

  if (!Array.isArray(lightSourcesUniform) || !spotCountUniform) {
    return 0;
  }

  const maxSlots = lightSourcesUniform.length - 1;
  const slotCount = Math.min(activeSources.length, maxSlots);

  for (let i = 0; i < maxSlots; i++) {
    const slot = lightSourcesUniform[i + 1] as {
      position?: { set?: (x: number, y: number, z: number, w: number) => void };
      diffuse?: { set?: (x: number, y: number, z: number, w: number) => void };
      ambient?: { set?: (x: number, y: number, z: number, w: number) => void };
      specular?: { set?: (x: number, y: number, z: number, w: number) => void };
      constantAttenuation?: number;
      linearAttenuation?: number;
      quadraticAttenuation?: number;
    } | undefined;

    if (!slot) {
      continue;
    }

    const src = activeSources[i];

    if (src) {
      const position = viewMatrix
        ? starMadeBlockLightSourceViewPosition.set(src.position[0], src.position[1], src.position[2]).applyMatrix4(viewMatrix)
        : starMadeBlockLightSourceViewPosition.set(src.position[0], src.position[1], src.position[2]);

      // Position as a point light (w=1), in StarMade/OpenGL eye space during rendering.
      slot.position?.set?.(position.x, position.y, position.z, 1);
      const intensity = src.color[3];

      // Retain host color metadata. Native cube getSpot uses literal white
      // coefficients; colored block emission is carried by vertex lighting.
      slot.diffuse?.set?.(
        src.color[0] * intensity * STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY,
        src.color[1] * intensity * STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY,
        src.color[2] * intensity * STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY,
        1
      );
      // Ambient is zero; specular follows StarMade's hardcoded spot highlight.
      slot.ambient?.set?.(0, 0, 0, 1);
      slot.specular?.set?.(
        STARMADE_BLOCK_LIGHT_SPECULAR_INTENSITY * intensity,
        STARMADE_BLOCK_LIGHT_SPECULAR_INTENSITY * intensity,
        STARMADE_BLOCK_LIGHT_SPECULAR_INTENSITY * intensity,
        1
      );
      // Quadratic attenuation: StarMade-Open getSpot uses 0.02*d*d.
      if ("constantAttenuation" in slot) {
        (slot as Record<string, number>).constantAttenuation = 1;
      }
      if ("linearAttenuation" in slot) {
        (slot as Record<string, number>).linearAttenuation = 0;
      }
      if ("quadraticAttenuation" in slot) {
        (slot as Record<string, number>).quadraticAttenuation = STARMADE_BLOCK_LIGHT_QUADRATIC_ATTENUATION;
      }
    } else {
      // Zero out unused slots
      slot.position?.set?.(0, 0, 0, 0);
      slot.diffuse?.set?.(0, 0, 0, 0);
      slot.ambient?.set?.(0, 0, 0, 1);
      slot.specular?.set?.(0, 0, 0, 1);
    }
  }

  spotCountUniform.value = slotCount;
  return slotCount;
}


/**
 * Resolves a StarMadeSceneSunOptions into concrete Vector3 values.
 */
function resolveSceneSun(sun?: StarMadeSceneSunOptions): {
  position: Vector3;
  ambient: Vector3;
  diffuse: Vector3;
  specular: Vector3;
  sourceAmbient: Vector3;
} {
  return {
    position: sun?.position ?? sun?.direction ?? STARMADE_SCENE_LIGHTING_DEFAULTS.sunPosition.clone(),
    ambient: sun?.ambient ?? STARMADE_SCENE_LIGHTING_DEFAULTS.ambient.clone(),
    diffuse: sun?.diffuse ?? STARMADE_SCENE_LIGHTING_DEFAULTS.diffuse.clone(),
    specular: sun?.specular ?? STARMADE_SCENE_LIGHTING_DEFAULTS.specular.clone(),
    sourceAmbient: sun?.sourceAmbient ?? STARMADE_SCENE_LIGHTING_DEFAULTS.sourceAmbient.clone()
  };
}

/**
 * Applies scene sun parameters to a cube or LOD ShaderMaterial.
 * Updates: lightPos, ambient, diffuse, specular, starMadeFrontMaterial, starMadeLightSources[0].
 */
export function applyStarMadeSceneSunToShaderMaterial(
  material: ShaderMaterial,
  sun: StarMadeSceneSunOptions
): void {
  const resolved = resolveSceneSun(sun);

  const setV3 = (name: string, v: Vector3) => {
    const u = material.uniforms[name];
    if (u && u.value && typeof (u.value as { set?: unknown }).set === "function") {
      (u.value as { set: (x: number, y: number, z: number) => void }).set(v.x, v.y, v.z);
    }
  };

  setV3("lightPos", resolved.position);
  material.userData.starMadeSunWorldPosition = resolved.position.toArray();
  setV3("ambient", resolved.ambient);
  setV3("diffuse", resolved.diffuse);
  setV3("specular", resolved.specular);

  const frontMat = material.uniforms.starMadeFrontMaterial?.value as {
    ambient?: { set?: (x: number, y: number, z: number, w: number) => void };
    diffuse?: { set?: (x: number, y: number, z: number, w: number) => void };
    specular?: { set?: (x: number, y: number, z: number, w: number) => void };
  } | undefined;

  if (frontMat) {
    frontMat.ambient?.set?.(resolved.ambient.x, resolved.ambient.y, resolved.ambient.z, 1);
    frontMat.diffuse?.set?.(resolved.diffuse.x, resolved.diffuse.y, resolved.diffuse.z, 1);
    frontMat.specular?.set?.(resolved.specular.x, resolved.specular.y, resolved.specular.z, 1);
  }

  const sources = material.uniforms.starMadeLightSources?.value;
  if (Array.isArray(sources) && sources.length > 0) {
    const s0 = sources[0] as {
      position?: { set?: (x: number, y: number, z: number, w: number) => void };
      ambient?: { set?: (x: number, y: number, z: number, w: number) => void };
      diffuse?: { set?: (x: number, y: number, z: number, w: number) => void };
      specular?: { set?: (x: number, y: number, z: number, w: number) => void };
    };
    s0.position?.set?.(resolved.position.x, resolved.position.y, resolved.position.z, 1);
    s0.ambient?.set?.(resolved.sourceAmbient.x, resolved.sourceAmbient.y, resolved.sourceAmbient.z, 1);
    s0.diffuse?.set?.(resolved.diffuse.x, resolved.diffuse.y, resolved.diffuse.z, 1);
    s0.specular?.set?.(resolved.specular.x, resolved.specular.y, resolved.specular.z, 1);
  }
  material.uniformsNeedUpdate = true;
}

/**
 * Reproduces OpenGL's positional GL_LIGHT0 upload in eye space.
 *
 * @param material - Cube or LOD material with a stored world-space sun position.
 * @param viewMatrix - The current camera's matrixWorldInverse (not model-view).
 * @returns True when the eye-space light was updated; false for unrelated materials.
 * @remarks Each update starts from immutable world coordinates. Camera movement,
 * multiple cameras, and repeated draws never accumulate previous transforms.
 */
export function updateStarMadeSceneSunViewSpace(material: ShaderMaterial, viewMatrix: Matrix4): boolean {
  const world = material.userData.starMadeSunWorldPosition as readonly number[] | undefined;
  const position = material.uniforms.starMadeLightSources?.value?.[0]?.position;
  if (!world || !(position instanceof Vector4)) return false;
  position.set(world[0], world[1], world[2], 1).applyMatrix4(viewMatrix);
  // Shared ShaderMaterials can be drawn repeatedly without a program switch.
  material.uniformsNeedUpdate = true;
  return true;
}

/**
 * Installs a per-draw update after the renderer has updated the camera matrices.
 * @param material - Newly constructed native cube or LOD material.
 * @remarks The callback uses its receiver so explicit copies of the callback onto
 * cloned materials update the clone, never the prototype.
 */
function installStarMadeSunViewUpdate(material: ShaderMaterial): void {
  material.userData.starMadeSunWorldPosition = material.uniforms.lightPos.value.toArray();
  material.onBeforeRender = function (this: ShaderMaterial, _renderer, _scene, camera): void {
    updateStarMadeSceneSunViewSpace(this, camera.matrixWorldInverse);
  };
}

/**
 * Applies scene sun to all LOD ShaderMaterials in a scene graph.
 * Returns number of materials updated.
 */
export function applyStarMadeSceneSunToLodObject3D(
  root: Object3D,
  sun: StarMadeSceneSunOptions
): number {
  let count = 0;
  for (const material of collectStarMadeLodShaderMaterials(root)) {
    applyStarMadeSceneSunToShaderMaterial(material, sun);
    count++;
  }
  return count;
}

export function createStarMadeCubeShadowDepthMaterial(options: StarMadeCubeShadowDepthMaterialOptions = {}): ShaderMaterial {
  const defines = ["owntangent", "INTATT", "shader4"];

  if (options.alphaDiscard) {
    defines.push("blended");
  }

  const sources = createStarMadeThreeShaderProgramSources("cube.shadow", {
    defines
  });
  const fallbackTexture = createFallbackTexture();

  return new ShaderMaterial({
    name: options.alphaDiscard ? "StarMadeCubeShadowDepthMaterial:blended" : "StarMadeCubeShadowDepthMaterial",
    glslVersion: GLSL3,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    vertexShader: stripGlslVersion(sources.vertexSource),
    fragmentShader: stripGlslVersion(sources.fragmentSource),
    uniforms: createStarMadeCubeShadowDepthUniforms({
      animationTime: options.animationTime ?? 0,
      lodThreshold: options.lodThreshold ?? 128,
      mainTexture0: options.mainTexture0 ?? fallbackTexture,
      mainTexture1: options.mainTexture1 ?? fallbackTexture,
      mainTexture2: options.mainTexture2 ?? fallbackTexture,
      mainTexture3: options.mainTexture3 ?? fallbackTexture,
      mainTexture7: options.mainTexture7 ?? fallbackTexture
    })
  });
}

export function createStarMadeLodShadowDepthMaterial(options: StarMadeLodShadowDepthMaterialOptions = {}): ShaderMaterial {
  const sources = createStarMadeThreeShaderProgramSources("cube.lodShadow");
  const lightPosition = options.lightPosition ?? STARMADE_SCENE_LIGHTING_DEFAULTS.sunPosition.clone();

  return new ShaderMaterial({
    name: "StarMadeLodShadowDepthMaterial",
    glslVersion: GLSL3,
    side: DoubleSide,
    depthTest: true,
    depthWrite: true,
    vertexColors: true,
    vertexShader: stripGlslVersion(sources.vertexSource),
    fragmentShader: stripGlslVersion(sources.fragmentSource),
    uniforms: {
      starMadeLightSources: { value: defaultLightSources(lightPosition) }
    }
  });
}

export function createStarMadeLodShaderMaterial(options: StarMadeLodShaderMaterialOptions = {}): ShaderMaterial {
  const normalMapped = options.normalTexture !== undefined && options.normalTexture !== null;
  const hasEmissiveTexture = options.emissiveTexture !== undefined && options.emissiveTexture !== null;
  const defines = normalMapped ? ["normalmap", "owntangent"] : [];
  const sources = createStarMadeThreeShaderProgramSources("cube.lod", {
    defines,
    includeDefaultDefines: false
  });
  const fallbackTexture = createFallbackTexture();
  const shadowParams = resolveStarMadeShadowParams({ shadowParams: options.shadowParams }, fallbackTexture);
  const vertexShader = injectStarMadeShadowVertex(stripGlslVersion(sources.vertexSource));
  const fragmentShader = injectStarMadeLodShadowFragment(stripGlslVersion(sources.fragmentSource));
  const blended = options.blended ?? false;

  const material = new ShaderMaterial({
    name: "StarMadeLodShaderMaterial",
    glslVersion: GLSL3,
    transparent: blended,
    depthWrite: !blended,
    side: FrontSide,
    vertexColors: true,
    vertexShader,
    fragmentShader,
    uniforms: createStarMadeLodShaderUniforms({
      mainTexture: options.mainTexture ?? fallbackTexture,
      emissiveTexture: options.emissiveTexture ?? fallbackTexture,
      normalTexture: options.normalTexture ?? createNeutralNormalTexture(),
      emissiveOn: hasEmissiveTexture && (options.emissiveOn ?? true),
      shadowMapArray: shadowParams.mapArray,
      shadowUseMapArray: shadowParams.useMapArray,
      shadowMapArrayMode: shadowParams.mapArrayMode,
      shadowMap0: shadowParams.maps[0],
      shadowMatrix0: shadowParams.matrices[0],
      shadowMap1: shadowParams.maps[1],
      shadowMatrix1: shadowParams.matrices[1],
      shadowMap2: shadowParams.maps[2],
      shadowMatrix2: shadowParams.matrices[2],
      shadowColor0: shadowParams.colors[0],
      shadowColor1: shadowParams.colors[1],
      shadowColor2: shadowParams.colors[2],
      shadowStrength: shadowParams.strength,
      shadowBias: shadowParams.bias,
      shadowTexelSize: shadowParams.texelSize,
      shadowTexSize: shadowParams.texSize,
      shadowFarDistances: shadowParams.farDistances,
      shadowSplits: shadowParams.splits,
      lightPosition: (options.sun?.position ?? options.sun?.direction ?? options.lightPosition ?? STARMADE_SCENE_LIGHTING_DEFAULTS.sunPosition).clone(),
      viewPosition: options.viewPosition ?? new Vector3(0, 0, 0)
    })
  });
  material.userData.starMadeDefines = sources.defines;
  installStarMadeSunViewUpdate(material);
  if (options.sun) {
    applyStarMadeSceneSunToShaderMaterial(material, options.sun);
  }
  return material;
}

export async function createStarMadeCubeTextureArray(
  texturePack: StarMadeCubeTexturePack,
  options: StarMadeCubeTextureArrayOptions = {}
): Promise<DataArrayTexture> {
  const layers = options.layers ?? cubeTextureArrayLayers;
  const source = options.source ?? "color";
  const sourceTextures = source === "normal" ? texturePack.normalLayers : texturePack.layers;
  const fallbackTextures = texturePack.layers;
  const images = layers.map((layer) => {
    const texture = sourceTextures?.get(layer);

    if (!texture && source === "color") {
      throw new Error(`Missing StarMade cube texture layer ${layer}`);
    }

    return texture?.image as (CanvasImageSource & { readonly width?: number; readonly height?: number }) | undefined;
  });
  const referenceImage =
    images.find((image): image is CanvasImageSource & { readonly width?: number; readonly height?: number } => image !== undefined) ??
    layers
      .map((layer) => fallbackTextures.get(layer)?.image as (CanvasImageSource & { readonly width?: number; readonly height?: number }) | undefined)
      .find((image): image is CanvasImageSource & { readonly width?: number; readonly height?: number } => image !== undefined);

  if (!referenceImage) {
    throw new Error(`Missing StarMade cube texture reference layer for ${source} texture array`);
  }

  const width = imageWidth(referenceImage);
  const height = imageHeight(referenceImage);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context is unavailable for StarMade texture array creation");
  }

  canvas.width = width;
  canvas.height = height;

  const data = new Uint8Array(width * height * layers.length * 4);
  for (let index = 0; index < images.length; index++) {
    const image = images[index];

    if (!image) {
      fillNeutralNormalLayer(data, index, width, height);
      continue;
    }

    if (imageWidth(image) !== width || imageHeight(image) !== height) {
      throw new Error("StarMade cube texture layers must share identical dimensions");
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const layerData = context.getImageData(0, 0, width, height).data;
    const layerOffset = index * width * height * 4;
    const rowLength = width * 4;

    for (let targetY = 0; targetY < height; targetY++) {
      const sourceY = starMadeCubeTextureArraySourceY(targetY, height);
      data.set(
        layerData.subarray(sourceY * rowLength, (sourceY + 1) * rowLength),
        layerOffset + targetY * rowLength
      );
    }

    applyStarMadeCubeTextureArrayTileGutters(data, layerOffset, width, height, texturePack.layout.tileSize);
  }

  const texture = new DataArrayTexture(data, width, height, layers.length);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createStarMadeCubeShaderUniforms(options: {
  readonly textureArray: DataArrayTexture;
  readonly normalTextureArray: DataArrayTexture;
  readonly mainTexture0: Texture;
  readonly mainTexture1: Texture;
  readonly mainTexture2: Texture;
  readonly mainTexture3: Texture;
  readonly mainTexture7: Texture;
  readonly normalTexture0: Texture;
  readonly normalTexture1: Texture;
  readonly normalTexture2: Texture;
  readonly normalTexture3: Texture;
  readonly normalTexture7: Texture;
  readonly overlayMap: Texture;
  readonly shadowMapArray: Texture;
  readonly shadowUseMapArray: boolean;
  readonly shadowMapArrayMode: number;
  readonly shadowMap0: Texture;
  readonly shadowMatrix0: Matrix4;
  readonly shadowMap1: Texture;
  readonly shadowMatrix1: Matrix4;
  readonly shadowMap2: Texture;
  readonly shadowMatrix2: Matrix4;
  readonly shadowColor0: Vector3;
  readonly shadowColor1: Vector3;
  readonly shadowColor2: Vector3;
  readonly shadowStrength: number;
  readonly shadowBias: number;
  readonly shadowTexelSize: Vector2;
  readonly shadowTexSize: Vector2;
  readonly shadowFarDistances: Vector4;
  readonly shadowSplits: number;
  readonly selectTime: number;
  readonly extraAlpha: number;
  readonly density: number;
  readonly animationTime: number;
  readonly zNear: number;
  readonly zFar: number;
  readonly uTime: number;
  readonly spotCount: number;
  readonly normalDebugMode: number;
  readonly normalStrength: number;
  readonly lightPosition: Vector3;
  readonly lightSourceCount?: number;
  readonly viewPosition: Vector3;
}) {
  configureStarMadeCubeTextureArray(options.textureArray);
  configureStarMadeCubeTextureArray(options.normalTextureArray);
  configureStarMadeCubeTexture(options.mainTexture0);
  configureStarMadeCubeTexture(options.mainTexture1);
  configureStarMadeCubeTexture(options.mainTexture2);
  configureStarMadeCubeTexture(options.mainTexture3);
  configureStarMadeCubeTexture(options.mainTexture7);
  configureStarMadeCubeTexture(options.normalTexture0);
  configureStarMadeCubeTexture(options.normalTexture1);
  configureStarMadeCubeTexture(options.normalTexture2);
  configureStarMadeCubeTexture(options.normalTexture3);
  configureStarMadeCubeTexture(options.normalTexture7);

  return {
    cTex: { value: options.textureArray },
    cTexNormal: { value: options.normalTextureArray },
    mainTex0: { value: options.mainTexture0 },
    mainTex1: { value: options.mainTexture1 },
    mainTex2: { value: options.mainTexture2 },
    mainTex3: { value: options.mainTexture3 },
    mainTex7: { value: options.mainTexture7 },
    normalTex0: { value: options.normalTexture0 },
    normalTex1: { value: options.normalTexture1 },
    normalTex2: { value: options.normalTexture2 },
    normalTex3: { value: options.normalTexture3 },
    normalTex7: { value: options.normalTexture7 },
    overlayTex: { value: options.overlayMap },
    starMadeShadowMapArray: { value: options.shadowMapArray },
    starMadeShadowUseMapArray: { value: options.shadowUseMapArray },
    starMadeShadowMapArrayMode: { value: options.shadowMapArrayMode },
    starMadeShadowMap0: { value: options.shadowMap0 },
    starMadeShadowMatrix0: { value: options.shadowMatrix0 },
    starMadeShadowMap1: { value: options.shadowMap1 },
    starMadeShadowMatrix1: { value: options.shadowMatrix1 },
    starMadeShadowMap2: { value: options.shadowMap2 },
    starMadeShadowMatrix2: { value: options.shadowMatrix2 },
    starMadeShadowColor0: { value: options.shadowColor0 },
    starMadeShadowColor1: { value: options.shadowColor1 },
    starMadeShadowColor2: { value: options.shadowColor2 },
    starMadeShadowStrength: { value: options.shadowStrength },
    starMadeShadowBias: { value: options.shadowBias },
    starMadeShadowTexelSize: { value: options.shadowTexelSize },
    starMadeShadowTexSize: { value: options.shadowTexSize },
    starMadeShadowFarDistances: { value: options.shadowFarDistances },
    starMadeShadowSplits: { value: options.shadowSplits },
    animationTime: { value: options.animationTime },
    zNear: { value: options.zNear },
    zFar: { value: options.zFar },
    uTime: { value: options.uTime },
    allLight: { value: 0 },
    ambient: { value: new Vector3(0.45, 0.45, 0.45) },
    binormals: { value: defaultBinormals() },
    daa: { value: new Vector3(1.4, 1.4, 1.4) },
    density: { value: options.density },
    diffuse: { value: new Vector3(1, 1, 1) },
    dsa: { value: new Vector3(2.2, 2.2, 1.6) },
    extraAlpha: { value: options.extraAlpha },
    lightPos: { value: options.lightPosition },
    lodThreshold: { value: 100 }, // StarMade-Open LOD_DISTANCE_IN_THRESHOLD default
    normals: { value: defaultNormals() },
    quadPosMark: { value: defaultQuadPosMarks() },
    selectTime: { value: options.selectTime },
    shift: { value: new Vector3(0, 0, 0) },
    specular: { value: new Vector3(0.45, 0.45, 0.45) },
    spotCount: { value: options.spotCount },
    starMadeNormalDebugMode: { value: options.normalDebugMode },
    starMadeNormalStrength: { value: options.normalStrength },
    starMadeFrontLightModelProduct: { value: { sceneColor: new Vector4(0, 0, 0, 1) } },
    starMadeFrontMaterial: {
      value: {
        emission: new Vector4(0, 0, 0, 1),
        ambient: new Vector4(0.45, 0.45, 0.45, 1),
        diffuse: new Vector4(1, 1, 1, 1),
        specular: new Vector4(0.45, 0.45, 0.45, 1),
        shininess: 30
      }
    },
    starMadeLightSources: { value: defaultLightSources(options.lightPosition, options.lightSourceCount) },
    tangents: { value: defaultTangents() },
    v_inv: { value: new Matrix4() },
    viewPos: { value: options.viewPosition },
    zo: { value: new Vector4(0, 0, 0, 1) }
  };
}

function createStarMadeCubeShadowDepthUniforms(options: {
  readonly animationTime: number;
  readonly lodThreshold: number;
  readonly mainTexture0: Texture;
  readonly mainTexture1: Texture;
  readonly mainTexture2: Texture;
  readonly mainTexture3: Texture;
  readonly mainTexture7: Texture;
}) {
  configureStarMadeLodTexture(options.mainTexture0);
  configureStarMadeLodTexture(options.mainTexture1);
  configureStarMadeLodTexture(options.mainTexture2);
  configureStarMadeLodTexture(options.mainTexture3);
  configureStarMadeLodTexture(options.mainTexture7);

  return {
    animationTime: { value: options.animationTime },
    shift: { value: new Vector3(0, 0, 0) },
    normals: { value: defaultNormals() },
    tangents: { value: defaultTangents() },
    binormals: { value: defaultBinormals() },
    quadPosMark: { value: defaultQuadPosMarks() },
    lodThreshold: { value: options.lodThreshold },
    mainTex0: { value: options.mainTexture0 },
    mainTex1: { value: options.mainTexture1 },
    mainTex2: { value: options.mainTexture2 },
    mainTex3: { value: options.mainTexture3 },
    mainTex7: { value: options.mainTexture7 }
  };
}

function createStarMadeLodShaderUniforms(options: {
  readonly mainTexture: Texture;
  readonly emissiveTexture: Texture;
  readonly normalTexture: Texture;
  readonly emissiveOn: boolean;
  readonly shadowMapArray: Texture;
  readonly shadowUseMapArray: boolean;
  readonly shadowMapArrayMode: number;
  readonly shadowMap0: Texture;
  readonly shadowMatrix0: Matrix4;
  readonly shadowMap1: Texture;
  readonly shadowMatrix1: Matrix4;
  readonly shadowMap2: Texture;
  readonly shadowMatrix2: Matrix4;
  readonly shadowColor0: Vector3;
  readonly shadowColor1: Vector3;
  readonly shadowColor2: Vector3;
  readonly shadowStrength: number;
  readonly shadowBias: number;
  readonly shadowTexelSize: Vector2;
  readonly shadowTexSize: Vector2;
  readonly shadowFarDistances: Vector4;
  readonly shadowSplits: number;
  readonly lightPosition: Vector3;
  readonly viewPosition: Vector3;
}) {
  configureStarMadeLodTexture(options.mainTexture);
  configureStarMadeLodTexture(options.emissiveTexture);
  configureStarMadeLodTexture(options.normalTexture);

  return {
    mainTex: { value: options.mainTexture },
    emissiveTex: { value: options.emissiveTexture },
    normalTex: { value: options.normalTexture },
    emissiveOn: { value: options.emissiveOn },
    starMadeShadowMapArray: { value: options.shadowMapArray },
    starMadeShadowUseMapArray: { value: options.shadowUseMapArray },
    starMadeShadowMapArrayMode: { value: options.shadowMapArrayMode },
    starMadeShadowMap0: { value: options.shadowMap0 },
    starMadeShadowMatrix0: { value: options.shadowMatrix0 },
    starMadeShadowMap1: { value: options.shadowMap1 },
    starMadeShadowMatrix1: { value: options.shadowMatrix1 },
    starMadeShadowMap2: { value: options.shadowMap2 },
    starMadeShadowMatrix2: { value: options.shadowMatrix2 },
    starMadeShadowColor0: { value: options.shadowColor0 },
    starMadeShadowColor1: { value: options.shadowColor1 },
    starMadeShadowColor2: { value: options.shadowColor2 },
    starMadeShadowStrength: { value: options.shadowStrength },
    starMadeShadowBias: { value: options.shadowBias },
    starMadeShadowTexelSize: { value: options.shadowTexelSize },
    starMadeShadowTexSize: { value: options.shadowTexSize },
    starMadeShadowFarDistances: { value: options.shadowFarDistances },
    starMadeShadowSplits: { value: options.shadowSplits },
    lightPos: { value: options.lightPosition },
    lightVec: {
      value: [
        new Vector3(0, 1, 1),
        new Vector3(0, 1, -1),
        new Vector3(1, 1, 0),
        new Vector3(-1, 1, 0)
      ]
    },
    lightDiffuse: {
      value: [
        new Vector4(0, 0, 0, 0),
        new Vector4(0, 0, 0, 0),
        new Vector4(0, 0, 0, 0),
        new Vector4(0, 0, 0, 0)
      ]
    },
    viewPos: { value: options.viewPosition },
    ambient: { value: new Vector3(0.45, 0.45, 0.45) },
    daa: { value: new Vector3(1.4, 1.4, 1.4) },
    diffuse: { value: new Vector3(1, 1, 1) },
    dsa: { value: new Vector3(2.2, 2.2, 1.6) },
    specular: { value: new Vector3(0.45, 0.45, 0.45) },
    starMadeFrontLightModelProduct: { value: { sceneColor: new Vector4(0, 0, 0, 1) } },
    starMadeFrontMaterial: {
      value: {
        emission: new Vector4(0, 0, 0, 1),
        ambient: new Vector4(0.45, 0.45, 0.45, 1),
        diffuse: new Vector4(1, 1, 1, 1),
        specular: new Vector4(0.45, 0.45, 0.45, 1),
        shininess: 30
      }
    },
    starMadeLightSources: { value: defaultLightSources(options.lightPosition) }
  };
}

function resolveStarMadeShadowParams(options: StarMadeCubeShaderMaterialOptions, fallbackTexture: Texture): {
  readonly mapArray: Texture;
  readonly useMapArray: boolean;
  readonly mapArrayMode: number;
  readonly maps: readonly [Texture, Texture, Texture];
  readonly matrices: readonly [Matrix4, Matrix4, Matrix4];
  readonly colors: readonly [Vector3, Vector3, Vector3];
  readonly strength: number;
  readonly bias: number;
  readonly texelSize: Vector2;
  readonly texSize: Vector2;
  readonly farDistances: Vector4;
  readonly splits: number;
} {
  const params = options.shadowParams;
  const mapArray = params?.mapArray ?? createFallbackShadowMapArrayTexture();

  return {
    mapArray,
    useMapArray: params?.mapArray !== undefined && params.mapArray !== null,
    mapArrayMode: params?.mapArrayMode === "blockSources" ? 1 : 0,
    maps: [
      params?.maps?.[0] ?? options.lodShadowMap ?? fallbackTexture,
      params?.maps?.[1] ?? options.lodShadowMap1 ?? fallbackTexture,
      params?.maps?.[2] ?? options.lodShadowMap2 ?? fallbackTexture
    ],
    matrices: [
      params?.matrices?.[0] ?? options.lodShadowMatrix ?? new Matrix4(),
      params?.matrices?.[1] ?? options.lodShadowMatrix1 ?? new Matrix4(),
      params?.matrices?.[2] ?? options.lodShadowMatrix2 ?? new Matrix4()
    ],
    colors: [
      params?.colors?.[0]?.clone() ?? new Vector3(1, 1, 1),
      params?.colors?.[1]?.clone() ?? new Vector3(1, 1, 1),
      params?.colors?.[2]?.clone() ?? new Vector3(1, 1, 1)
    ],
    strength: params?.strength ?? options.lodShadowStrength ?? 0,
    bias: params?.bias ?? options.lodShadowBias ?? 0.00001,
    texelSize: params?.texelSize ?? options.lodShadowTexelSize ?? new Vector2(1 / 1024, 1 / 1024),
    texSize: params?.texSize ?? starMadeShadowTexSizeFromTexelSize(params?.texelSize ?? options.lodShadowTexelSize),
    farDistances: params?.farDistances ?? new Vector4(0.3333, 0.6666, 0.9983, 1.0),
    splits: Math.max(1, Math.min(3, Math.trunc(params?.splits ?? 3)))
  };
}

function starMadeShadowTexSizeFromTexelSize(texelSize?: Vector2): Vector2 {
  const inverseSize = texelSize?.y ?? texelSize?.x ?? 1 / 1024;
  return new Vector2(inverseSize > 0 ? 1 / inverseSize : 1024, inverseSize > 0 ? inverseSize : 1 / 1024);
}

function configureStarMadeCubeTextureArray(texture: Texture): void {
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}

function configureStarMadeCubeTexture(texture: Texture): void {
  // StarMade-Open samples cube atlases as raw texture values in its fixed-function GL pipeline.
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;

  if (texture instanceof DataTexture || hasUploadableTextureImage(texture.image)) {
    texture.needsUpdate = true;
  }
}

function configureStarMadeLodTexture(texture: Texture): void {
  // StarMade's legacy GLSL shaders expect raw atlas values, not sRGB-decoded linear samples.
  texture.colorSpace = NoColorSpace;

  if (texture instanceof DataTexture || hasUploadableTextureImage(texture.image)) {
    texture.needsUpdate = true;
  }
}

function hasUploadableTextureImage(image: Texture["image"]): boolean {
  const candidate = image as { readonly complete?: boolean; readonly data?: unknown; readonly width?: number; readonly height?: number } | undefined | null;

  if (!candidate) {
    return false;
  }

  if (candidate.data !== undefined) {
    return true;
  }

  if (typeof candidate.width === "number" && typeof candidate.height === "number") {
    return candidate.width > 0 && candidate.height > 0 && candidate.complete !== false;
  }

  return true;
}

function stripGlslVersion(source: string): string {
  return source.replace(/^\s*#version\s+300\s+es\s*\n/, "");
}

function createFallbackTexture(alpha = 255): DataTexture {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, alpha]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createFallbackShadowMapArrayTexture(): DataArrayTexture {
  const texture = new DataArrayTexture(new Uint8Array([
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255
  ]), 1, 1, 3);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function resolveCubeTextureLayer(
  layers: ReadonlyMap<number, Texture> | null | undefined,
  layer: number,
  fallbackTexture: Texture
): Texture {
  return layers?.get(layer) ?? fallbackTexture;
}

function createNeutralNormalTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array([128, 128, 255, 0]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function fillNeutralNormalLayer(data: Uint8Array, layerIndex: number, width: number, height: number): void {
  const layerOffset = layerIndex * width * height * 4;

  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = layerOffset + pixel * 4;
    data[offset] = 128;
    data[offset + 1] = 128;
    data[offset + 2] = 255;
    data[offset + 3] = 0;
  }
}

function createFallbackTextureArray(kind: "color" | "normal" = "color"): DataArrayTexture {
  const data = new Uint8Array(4 * cubeTextureArrayLayers.length);

  for (let index = 0; index < cubeTextureArrayLayers.length; index++) {
    const offset = index * 4;

    if (kind === "normal") {
      data[offset] = 128;
      data[offset + 1] = 128;
      data[offset + 2] = 255;
      data[offset + 3] = 0;
    } else {
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }

  const texture = new DataArrayTexture(data, 1, 1, cubeTextureArrayLayers.length);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function defaultNormals(): Vector3[] {
  return [
    new Vector3(0, 0, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0),
    new Vector3(0, -1, 0),
    new Vector3(1, 0, 0),
    new Vector3(-1, 0, 0)
  ];
}

function defaultTangents(): Vector3[] {
  return [
    new Vector3(0, 0, 0),
    new Vector3(-1, 0, 0),
    new Vector3(1, 0, 0),
    new Vector3(1, 0, 0),
    new Vector3(1, 0, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1)
  ];
}

function defaultBinormals(): Vector3[] {
  return [
    new Vector3(0, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
    new Vector3(0, 0, -1),
    new Vector3(0, 1, 0),
    new Vector3(0, 1, 0)
  ];
}

function defaultQuadPosMarks(): Vector3[] {
  return [
    new Vector3(2, 4, 0),
    new Vector3(2, 4, 0),
    new Vector3(4, 0, 2),
    new Vector3(4, 0, 2),
    new Vector3(0, 4, 2),
    new Vector3(0, 4, 2)
  ];
}

function defaultLightSources(position: Vector3, count = STARMADE_LEGACY_LIGHT_SOURCE_SLOTS): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    ambient: new Vector4(0.05, 0.05, 0.05, 1),
    diffuse: new Vector4(index === 0 ? 1 : 0, index === 0 ? 1 : 0, index === 0 ? 1 : 0, 1),
    specular: new Vector4(index === 0 ? 0.45 : 0, index === 0 ? 0.45 : 0, index === 0 ? 0.45 : 0, 1),
    position: new Vector4(position.x, position.y, position.z, 1),
    halfVector: new Vector4(0, 0, 1, 0),
    spotDirection: new Vector3(0, 0, -1),
    spotExponent: 0,
    spotCutoff: 180,
    spotCosCutoff: -1,
    constantAttenuation: 1,
    linearAttenuation: 0,
    quadraticAttenuation: index === 0 ? 0 : STARMADE_BLOCK_LIGHT_QUADRATIC_ATTENUATION
  }));
}

function imageWidth(image: { readonly width?: number }): number {
  const width = image.width ?? 0;

  if (width <= 0) {
    throw new Error("StarMade cube texture image width is unavailable");
  }

  return width;
}

function imageHeight(image: { readonly height?: number }): number {
  const height = image.height ?? 0;

  if (height <= 0) {
    throw new Error("StarMade cube texture image height is unavailable");
  }

  return height;
}

type StarMadeMutableVector4Like = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  set(x: number, y: number, z: number, w: number): unknown;
};

type StarMadeMutableVector3Like = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  set(x: number, y: number, z: number): unknown;
};

type StarMadeObjectWithMaterial = Object3D & {
  readonly material?: unknown;
};


export interface StarMadeCubeSpotLight {
  /** View-space position of the spot light. */
  readonly position: Vector3;
  /** Normalized RGB color (0..1 per channel). */
  readonly color: readonly [number, number, number];
  /** Light intensity multiplier. */
  readonly intensity: number;
}

/**
 * Writes spot-light sources into a cube ShaderMaterial via the existing
 * starMadeLightSources uniform (slots 1..maxSlots, slot 0 reserved for sun).
 *
 * This is a thin wrapper: prefer applyStarMadeBlockLightSourcesToCubeShaderMaterial
 * for automatic source selection. Use this function when you already have a
 * pre-computed, view-space StarMadeCubeSpotLight list.
 */
export function setStarMadeCubeShaderSpotLights(
  material: ShaderMaterial,
  spotLights: readonly StarMadeCubeSpotLight[],
  maxSlots: number = 7
): void {
  const lightSourcesUniform = material.uniforms.starMadeLightSources?.value;
  const spotCountUniform = material.uniforms.spotCount;

  if (!Array.isArray(lightSourcesUniform) || !spotCountUniform) {
    return;
  }

  const count = Math.min(spotLights.length, maxSlots, lightSourcesUniform.length - 1);

  for (let i = 0; i < count; i++) {
    const slot = lightSourcesUniform[i + 1];
    const light = spotLights[i];

    if (!slot || !light) {
      continue;
    }

    // position is already in view space
    if (slot.position instanceof Vector4) {
      slot.position.set(light.position.x, light.position.y, light.position.z, 1);
    } else if (slot.position instanceof Vector3) {
      slot.position.copy(light.position);
    }

    const di = STARMADE_BLOCK_LIGHT_DIFFUSE_INTENSITY * light.intensity;
    const si = STARMADE_BLOCK_LIGHT_SPECULAR_INTENSITY * light.intensity;

    if (slot.diffuse instanceof Vector4) {
      slot.diffuse.set(light.color[0] * di, light.color[1] * di, light.color[2] * di, 1);
    }

    if (slot.specular instanceof Vector4) {
      slot.specular.set(si, si, si, 1);
    }

    if (typeof slot.quadraticAttenuation === "number" || slot.quadraticAttenuation !== undefined) {
      (slot as Record<string, number>).quadraticAttenuation = STARMADE_BLOCK_LIGHT_QUADRATIC_ATTENUATION;
    }
  }

  // clear unused slots up to maxSlots
  for (let i = count; i < Math.min(maxSlots, lightSourcesUniform.length - 1); i++) {
    const slot = lightSourcesUniform[i + 1];

    if (!slot) {
      continue;
    }

    if (slot.diffuse instanceof Vector4) {
      slot.diffuse.set(0, 0, 0, 0);
    }

    if (slot.specular instanceof Vector4) {
      slot.specular.set(0, 0, 0, 0);
    }
  }

  spotCountUniform.value = count;
  material.uniformsNeedUpdate = true;
}

/**
 * Converts StarMadeBlockLightSpotSource world-space sources into view-space
 * StarMadeCubeSpotLight entries ready for setStarMadeCubeShaderSpotLights.
 *
 * @param sources     Active block-light sources in world/scene space.
 * @param viewMatrix  Camera matrixWorldInverse (world-to-view transform).
 * @param maxSlots    Maximum slots to fill (default 7).
 */
export function createStarMadeCubeSpotLightsFromBlockLights(
  sources: readonly StarMadeBlockLightSpotSource[],
  viewMatrix: Matrix4,
  maxSlots: number = 7
): StarMadeCubeSpotLight[] {
  const out: StarMadeCubeSpotLight[] = [];
  const tmpPos = new Vector3();

  for (let i = 0; i < Math.min(maxSlots, sources.length); i++) {
    const s = sources[i];
    const [px, py, pz] = s.position;
    tmpPos.set(px, py, pz).applyMatrix4(viewMatrix);
    out.push({
      position: tmpPos.clone(),
      color: [s.color[0], s.color[1], s.color[2]],
      intensity: 1
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Vertex lighting uniforms (block-light intensity / attenuation overrides)
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadeCubeVertexLightingUniforms {
  /** Multiplier on the raw StarMade block-light channel value. Default 1. */
  readonly cubeBlockLightIntensityScale: number;
  /** Constant attenuation factor for the compat spot pipeline. Default 1. */
  readonly cubeBlockLightAttenuationConstant: number;
  /** Linear attenuation factor. Default 0. */
  readonly cubeBlockLightAttenuationLinear: number;
}

export const STARMADE_CUBE_VERTEX_LIGHTING_DEFAULTS: StarMadeCubeVertexLightingUniforms = {
  cubeBlockLightIntensityScale: 1,
  cubeBlockLightAttenuationConstant: 1,
  cubeBlockLightAttenuationLinear: 0
};

/**
 * Updates vertex-lighting uniform overrides on a cube ShaderMaterial.
 * These control the intensity scaling used by the compat block-light pipeline.
 */
export function setStarMadeCubeShaderVertexLighting(
  material: ShaderMaterial,
  opts: Partial<StarMadeCubeVertexLightingUniforms>
): void {
  const u = material.uniforms as Record<string, { value: unknown }>;

  if (opts.cubeBlockLightIntensityScale !== undefined && u.cubeBlockLightIntensityScale) {
    u.cubeBlockLightIntensityScale.value = opts.cubeBlockLightIntensityScale;
  }

  if (opts.cubeBlockLightAttenuationConstant !== undefined && u.cubeBlockLightAttenuationConstant) {
    u.cubeBlockLightAttenuationConstant.value = opts.cubeBlockLightAttenuationConstant;
  }

  if (opts.cubeBlockLightAttenuationLinear !== undefined && u.cubeBlockLightAttenuationLinear) {
    u.cubeBlockLightAttenuationLinear.value = opts.cubeBlockLightAttenuationLinear;
  }
  material.uniformsNeedUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// D. LOD block-light samples
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadeLodBlockLightSample {
  /** World-space direction from the receiver toward the light source, normalized. */
  readonly direction: readonly [number, number, number];
  /**
   * Diffuse contribution rgba where w = normalized linear gather value.
   * The LOD shader does: min(1.0, w * extraLight) where extraLight = 8.0.
   */
  readonly diffuse: readonly [number, number, number, number];
}

/**
 * Writes pre-computed LOD block-light samples into a LOD ShaderMaterial.
 * Feeds lightVec[0..N] and lightDiffuse[0..N].
 */
export function setStarMadeLodShaderBlockLightSamples(
  material: ShaderMaterial,
  samples: readonly StarMadeLodBlockLightSample[]
): void {
  const lightVecUniform = material.uniforms.lightVec?.value;
  const lightDiffuseUniform = material.uniforms.lightDiffuse?.value;

  if (!Array.isArray(lightVecUniform) || !Array.isArray(lightDiffuseUniform)) {
    return;
  }

  const count = Math.min(samples.length, lightVecUniform.length, lightDiffuseUniform.length);

  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    const vec = lightVecUniform[i] as StarMadeMutableVector3Like | undefined;
    const diff = lightDiffuseUniform[i] as StarMadeMutableVector4Like | undefined;

    if (vec && sample) {
      vec.set(sample.direction[0], sample.direction[1], sample.direction[2]);
    }

    if (diff && sample) {
      diff.set(sample.diffuse[0], sample.diffuse[1], sample.diffuse[2], sample.diffuse[3]);
    }
  }

  // zero remaining slots
  for (let i = count; i < lightVecUniform.length; i++) {
    const vec = lightVecUniform[i] as StarMadeMutableVector3Like | undefined;
    const diff = lightDiffuseUniform[i] as StarMadeMutableVector4Like | undefined;

    if (vec) { vec.set(0, 0, 0); }
    if (diff) { diff.set(0, 0, 0, 0); }
  }
  material.uniformsNeedUpdate = true;
}

/**
 * Builds LOD block-light samples from block-light sources, for feeding into
 * setStarMadeLodShaderBlockLightSamples. Selects the nearest sources by distance
 * to worldPosition, normalizes direction, and normalizes w by STARMADE_OCCLUSION_COLOR_PERM.
 *
 * @param sources      Active block-light sources (world-space positions).
 * @param worldPosition World-space center of the LOD object.
 * @param maxSlots     Max samples to return (default 4, matching lodcube.frag.glsl lightVec[4]).
 */
export function buildStarMadeLodLightSamples(
  sources: readonly StarMadeBlockLightSpotSource[],
  worldPosition: readonly [number, number, number],
  maxSlots = 4
): StarMadeLodBlockLightSample[] {
  const active = sources.filter((s) => s.active !== false);

  const ranked = active
    .map((s) => {
      const dx = s.position[0] - worldPosition[0];
      const dy = s.position[1] - worldPosition[1];
      const dz = s.position[2] - worldPosition[2];
      const dist2 = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(dist2);
      const dir: readonly [number, number, number] = dist > 0
        ? [dx / dist, dy / dist, dz / dist]
        : [0, 1, 0];
      // intensity: linear, normalized for LOD shader (gather-like, no exp curve)
      const intensity = Math.min(1, s.color[3] !== undefined ? (s.color as readonly number[])[3] : 1);
      return { dir, intensity, s };
    })
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, maxSlots);

  return ranked.map(({ dir, intensity, s }) => ({
    direction: dir,
    diffuse: [s.color[0] * intensity, s.color[1] * intensity, s.color[2] * intensity, intensity]
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// P3: Per-frame uniform update helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates time-dependent uniforms on a cube ShaderMaterial each frame.
 * Call this once per animation frame before rendering.
 *
 * @param material  Cube ShaderMaterial from createStarMadeCubeShaderMaterial.
 * @param deltaSeconds  Time elapsed since last frame in seconds.
 */
export function updateStarMadeCubeShaderTime(material: ShaderMaterial, deltaSeconds: number): void {
  const u = material.uniforms as Record<string, { value: number }>;

  if (u.uTime) {
    u.uTime.value += deltaSeconds;
  }

  if (u.animationTime) {
    // StarMade-Open: animationTime is an integer tile-frame counter.
    // The cube vertex shader does: type += animatedE * animationTime
    // StarMade-Open CubeMeshQuadsShader13 uses animationDelay = 0.5f.
    const _animState = material.userData as Record<string, number>;
    const prev = _animState._animAccum ?? 0;
    const next = prev + deltaSeconds;
    _animState._animAccum = next;
    const ANIM_FRAME_SECONDS = 0.5;
    if (next > ANIM_FRAME_SECONDS) {
      _animState._animAccum = next - ANIM_FRAME_SECONDS;
      // StarMade-Open: animationTime cycles modulo animationFrameCount (default 4).
      // Without the modulo, animationTime grows unbounded and pushes typeE outside
      // the block's animation frames into arbitrary atlas tiles (e.g. Ship Core flicker).
      const ANIM_FRAME_COUNT = 4;
      u.animationTime.value = (Math.floor(u.animationTime.value + 1)) % ANIM_FRAME_COUNT;
    }
  }
}

/**
 * Updates camera clip-plane uniforms on a cube ShaderMaterial.
 * Call this when the camera changes or once per frame.
 *
 * @param material  Cube ShaderMaterial from createStarMadeCubeShaderMaterial.
 * @param near  Camera near plane distance.
 * @param far   Camera far plane distance.
 */
export function updateStarMadeCubeShaderClipPlanes(
  material: ShaderMaterial,
  near: number,
  far: number
): void {
  const u = material.uniforms as Record<string, { value: number }>;

  if (u.zNear) {
    u.zNear.value = near;
  }

  if (u.zFar) {
    u.zFar.value = far;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P3: allLight / build-mode control
// ─────────────────────────────────────────────────────────────────────────────

/**
 * StarMade-Open allLight uniform values, mirroring CubeMeshQuadsShader13 / SegmentDrawer.
 *
 * -   = normal rendering (block-light + shadow)
 * -   = build-mode overlay (triggers visible,  define active)
 * -   = lighten (build-mode lighten tool, fully lit geometry)
 * -   = lighten + build overlay
 */
export type StarMadeAllLightMode = 0 | 1 | 2 | 3;

/**
 * Updates the  uniform on a cube ShaderMaterial.
 * Call this to switch build-mode visibility or the lighten state.
 *
 * StarMade-Open sets allLight > 1 to bypass block-light computation entirely;
 * allLight == 1 activates the  overlay path in the vertex shader.
 *
 * @param material  Cube ShaderMaterial from createStarMadeCubeShaderMaterial.
 * @param mode      0 = normal, 1 = build-overlay, 2 = lighten, 3 = lighten+overlay.
 */
export function setStarMadeCubeShaderAllLight(material: ShaderMaterial, mode: StarMadeAllLightMode): void {
  const u = material.uniforms as Record<string, { value: number }>;

  if (u.allLight) {
    u.allLight.value = mode;
    material.uniformsNeedUpdate = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P3: v_inv (MVP matrix) update — CubeMeshQuadsShader13.uploadMVP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates the  uniform on a cube ShaderMaterial.
 *
 * StarMade-Open  sets  to the
 * modelView × projection product (MVP). In Three.js terms this is
 * .
 *
 * For the segment renderer where mesh is at world origin: pass
 *  as  and 
 * as .
 *
 * Call once per frame before rendering.
 */
export function updateStarMadeCubeShaderMVP(
  material: ShaderMaterial,
  viewMatrix: Matrix4,
  projMatrix: Matrix4
): void {
  const u = material.uniforms as Record<string, { value: Matrix4 }>;

  if (u.v_inv?.value instanceof Matrix4) {
    u.v_inv.value.multiplyMatrices(projMatrix, viewMatrix);
  }
}
