import {
  BufferAttribute,
  Float32BufferAttribute,
  FrontSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Object3D,
  type Texture
} from "three";
import { type BlockDefinition } from "./blockConfig.js";
import {
  starMadeSegmentBlockWorldPosition,
  type StarMadeSegmentSceneEntity
} from "./blockLightScene.js";
import {
  computeStarMadeLodBlockLightFromVolume,
  withStarMadeLodSunOcclusionFloor,
  type StarMadeBlockLightVolume,
  type StarMadeGridPoint3
} from "./blockLighting.js";
import { getStarMadeLodOrientationQuaternion } from "./orientation.js";
import { type StarMadeLodModelDefinition, type StarMadeLodModelReference } from "./lodModels.js";
import { loadStarMadeLodModel } from "./lodModels.js";
import { resolveStarMadeLodModelReference } from "./lodModels.js";
import type { SegmentDataLike } from "./segmentData.js";
import {
  applyStarMadeLodBlockLightToObject3D,
  collectStarMadeLodShaderMaterials,
  createStarMadeLodShaderMaterial
} from "../shaders/cubeShaderMaterial.js";
import {
  applyStarMadeSceneSunToShaderMaterial,
  type StarMadeSceneSunOptions
} from "../shaders/cubeShaderMaterial.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API types
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadeLodBlockInstance {
  /** Unique key identifying this instance (e.g. "entityName:segX,segY,segZ:blockIndex"). */
  readonly key: string;
  /** Block definition from BlockConfig. */
  readonly blockDefinition: BlockDefinition;
  /** LOD model reference resolved from the block definition. */
  readonly modelReference: StarMadeLodModelReference;
  /** Block raw data (orientation, active flag, etc.). */
  readonly block: { readonly orientation: number; readonly active?: boolean };
  /** World-space position of the block center [x,y,z]. */
  readonly worldPosition: readonly [number, number, number];
  /** Scene-space position for the Three.js object [x,y,z]. */
  readonly position: readonly [number, number, number];
  /** Entity name this block belongs to. */
  readonly entityName: string;
  /** Block ID. */
  readonly blockId: number;
}

export interface StarMadeLodInstanceOptions {
  /** Block-light volume to sample from. */
  readonly volume: StarMadeBlockLightVolume;
  /**
   * Shift to convert world-space position to volume grid coordinates.
   * volumeGridPos = worldPos + volumeShift.
   */
  readonly volumeShift: readonly [number, number, number];
  /** Sun occlusion floor (0..1). Default 0 (no artificial skylight floor). */
  readonly sunOcclusionFloor?: number;
  /** Scene sun for material lighting. */
  readonly sun?: StarMadeSceneSunOptions;
}

export interface StarMadeLodPrototypeLoadResult {
  readonly prototypes: ReadonlyMap<string, Object3D>;
  readonly missing: readonly string[];
}

export interface StarMadeLodInstanceStats {
  readonly instanceCount: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly texturedMaterials: number;
  readonly fallbackMaterials: number;
  readonly emissiveMaterials: number;
  readonly normalMappedMaterials: number;
  readonly spriteStyleInstances: number;
}

export interface StarMadeLodBlockInstanceCollectionOptions {
  readonly entities: readonly StarMadeSegmentSceneEntity[];
  readonly blockDefinitions: ReadonlyMap<number, BlockDefinition>;
  readonly registry: ReadonlyMap<string, StarMadeLodModelDefinition>;
  readonly modelBaseUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment collection
// ─────────────────────────────────────────────────────────────────────────────

export function collectStarMadeLodBlockInstances(
  options: StarMadeLodBlockInstanceCollectionOptions
): readonly StarMadeLodBlockInstance[] {
  const entries: StarMadeLodBlockInstance[] = [];

  for (const entity of options.entities) {
    const entityName = entity.name ?? "entity";
    const entityOffset = entity.offset ?? ([0, 0, 0] as const);

    for (const segment of entity.segments) {
      for (let index = 0; index < segment.blocks.length; index++) {
        const block = segment.blocks[index];

        if (!block || block.type === 0) {
          continue;
        }

        const blockDefinition = options.blockDefinitions.get(block.type);

        if (!isStarMadeLodBlockDefinition(blockDefinition)) {
          continue;
        }

        const position = starMadeSegmentBlockWorldPosition(segment, index);
        const modelReference = resolveStarMadeBlockLodModelReference(
          blockDefinition,
          options.registry,
          options.modelBaseUrl,
          block.active ?? true
        ) ?? missingStarMadeLodModelReference(blockDefinition, block.active ?? true);

        entries.push({
          entityName,
          key: starMadeSegmentBlockInstanceKey(entityName, segment, index),
          block,
          blockDefinition,
          blockId: block.type,
          modelReference,
          position,
          worldPosition: [
            position[0] + entityOffset[0],
            position[1] + entityOffset[1],
            position[2] + entityOffset[2]
          ] as const
        });
      }
    }
  }

  return entries;
}

export function starMadeSegmentBlockInstanceKey(
  entityName: string,
  segment: SegmentDataLike,
  index: number
): string {
  return `${entityName}:${segment.x},${segment.y},${segment.z}:${index}`;
}

export function isStarMadeLodBlockDefinition(
  blockDefinition: BlockDefinition | undefined
): blockDefinition is BlockDefinition {
  return blockDefinition !== undefined && (blockDefinition.lodShape.length > 0 || blockDefinition.lodShapeActive.length > 0);
}

export function resolveStarMadeBlockLodModelReference(
  blockDefinition: BlockDefinition,
  registry: ReadonlyMap<string, StarMadeLodModelDefinition>,
  modelBaseUrl: string,
  active: boolean
): StarMadeLodModelReference | null {
  const modelName = starMadeBlockLodModelName(blockDefinition, active);

  if (!modelName) {
    return null;
  }

  return resolveStarMadeLodModelReference(modelName, registry, modelBaseUrl);
}

export function starMadeBlockLodModelName(blockDefinition: BlockDefinition, active: boolean): string {
  return active && blockDefinition.lodShapeActive ? blockDefinition.lodShapeActive : blockDefinition.lodShape;
}

function missingStarMadeLodModelReference(blockDefinition: BlockDefinition, active: boolean): StarMadeLodModelReference {
  return {
    name: starMadeBlockLodModelName(blockDefinition, active),
    filename: "",
    relpath: "",
    sceneUrl: "",
    texturePath: ""
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads and prepares LOD prototype Object3Ds for a set of block instances.
 * Deduplicates by modelReference.name — each distinct model is loaded once.
 * Returns the map of prototypes and any model names that failed to load.
 */
export async function loadStarMadeLodPrototypes(
  entries: readonly StarMadeLodBlockInstance[]
): Promise<StarMadeLodPrototypeLoadResult> {
  const references = new Map<string, StarMadeLodModelReference>();
  const missing = new Set<string>();

  for (const entry of entries) {
    if (!entry.modelReference.sceneUrl) {
      missing.add(entry.modelReference.name);
      continue;
    }

    references.set(entry.modelReference.name, entry.modelReference);
  }

  const loaded = await Promise.all(
    [...references.values()].map(async (reference) => {
      try {
        const raw = await loadStarMadeLodModel(reference);
        await waitForStarMadeLodTextures(raw);
        const prepared = prepareStarMadeLodObject(raw);
        return [reference.name, prepared] as const;
      } catch (error) {
        console.warn("[StarMade-3D] LOD prototype load failed:", reference.name, error);
        missing.add(reference.name);
        return null;
      }
    })
  );

  return {
    prototypes: new Map(loaded.filter((e): e is readonly [string, Object3D] => e !== null)),
    missing: [...missing].sort()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Instancing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a positioned, lit LOD instance from a loaded prototype.
 * Clones the prototype, converts Ogre materials to StarMade LOD shader materials,
 * applies block-light and sun, positions and orients the result.
 */
export function createStarMadeLodInstance(
  prototype: Object3D,
  entry: StarMadeLodBlockInstance,
  options: StarMadeLodInstanceOptions
): Object3D {
  const object = cloneStarMadeLodObject(prototype);

  // Convert Ogre materials → StarMade LOD shader materials
  convertLodObjectMaterials(object, options.sun);

  // Apply block-light from volume
  const gridPosition: StarMadeGridPoint3 = [
    Math.round(entry.worldPosition[0] + options.volumeShift[0]),
    Math.round(entry.worldPosition[1] + options.volumeShift[1]),
    Math.round(entry.worldPosition[2] + options.volumeShift[2])
  ];
  applyStarMadeLodBlockLightToObject3D(
    object,
    withStarMadeLodSunOcclusionFloor(
      computeStarMadeLodBlockLightFromVolume({
        volume: options.volume,
        position: gridPosition,
        orientation: entry.block.orientation,
        blockId: entry.blockId
      }),
      options.sunOcclusionFloor ?? 0
    )
  );

  // Apply sun uniforms
  if (options.sun) {
    for (const material of collectStarMadeLodShaderMaterials(object)) {
      applyStarMadeSceneSunToShaderMaterial(material, options.sun);
    }
  }

  // Apply material state (emissive, active/inactive)
  applyStarMadeLodMaterialState(object, entry.blockDefinition, entry.block.active !== false);

  // Position and orient in scene
  const target = new Group();
  target.name = `lod:${entry.blockDefinition.name}:${entry.modelReference.name}`;
  target.position.set(entry.position[0], entry.position[1], entry.position[2]);
  target.quaternion.copy(
    getStarMadeLodOrientationQuaternion(entry.block.orientation, entry.blockDefinition.blockStyle)
  );
  target.add(object);

  return target;
}

/**
 * Instantiates all LOD blocks into the provided parent Object3Ds.
 * Skips entries whose prototype is not in the map.
 * Returns aggregate stats.
 */
export function addStarMadeLodInstances(
  entries: readonly StarMadeLodBlockInstance[],
  prototypes: ReadonlyMap<string, Object3D>,
  options: StarMadeLodInstanceOptions,
  getParent: (entry: StarMadeLodBlockInstance) => Object3D
): StarMadeLodInstanceStats {
  let instanceCount = 0;
  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let texturedMaterials = 0;
  let fallbackMaterials = 0;
  let emissiveMaterials = 0;
  let normalMappedMaterials = 0;
  let spriteStyleInstances = 0;

  for (const entry of entries) {
    const prototype = prototypes.get(entry.modelReference.name);

    if (!prototype) {
      continue;
    }

    const object = createStarMadeLodInstance(prototype, entry, options);
    const stats = collectStarMadeLodInstanceStats(object);

    meshCount += stats.meshCount;
    vertexCount += stats.vertexCount;
    triangleCount += stats.triangleCount;
    texturedMaterials += stats.texturedMaterials;
    fallbackMaterials += stats.fallbackMaterials;
    emissiveMaterials += stats.emissiveMaterials;
    normalMappedMaterials += stats.normalMappedMaterials;

    if (entry.blockDefinition.blockStyle === 3) {
      spriteStyleInstances++;
    }

    instanceCount++;
    getParent(entry).add(object);
  }

  return {
    instanceCount,
    meshCount,
    vertexCount,
    triangleCount,
    texturedMaterials,
    fallbackMaterials,
    emissiveMaterials,
    normalMappedMaterials,
    spriteStyleInstances
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function cloneStarMadeLodObject(source: Object3D): Object3D {
  const clone = source.clone(true);

  clone.traverse((object) => {
    const candidate = object as Object3D & { isMesh?: boolean; material?: unknown };
    if (!candidate.isMesh) { return; }

    const mat = candidate.material;
    candidate.material = Array.isArray(mat)
      ? mat.map(cloneLodMaterial)
      : mat === undefined ? undefined : cloneLodMaterial(mat);
  });

  return clone;
}

/**
 * Copies per-draw lighting hooks with each independently owned material.
 * @param source - Prototype material, never mutated by an instance.
 * @returns A clone whose camera updates use the clone as their receiver.
 */
function cloneLodMaterial(source: unknown): unknown {
  const material = source as { clone(): { onBeforeRender?: unknown }; onBeforeRender?: unknown };
  const clone = material.clone();
  clone.onBeforeRender = material.onBeforeRender;
  if (clone instanceof ShaderMaterial) {
    // Three.js slices uniform arrays but shares their nested objects. Lighting
    // updates must not mutate the prototype or another instance's light samples.
    for (const name of ["starMadeLightSources", "lightVec", "lightDiffuse"]) {
      const uniform = clone.uniforms[name];
      if (uniform) uniform.value = cloneLodLightValue(uniform.value);
    }
  }
  return clone;
}

/**
 * Detaches nested light records and vector arrays, without duplicating textures.
 * @param value - A compatibility light record, vector, array, or scalar.
 * @returns An independent lighting value; scalar values are retained unchanged.
 */
function cloneLodLightValue(value: unknown): unknown {
  if (value instanceof Vector3 || value instanceof Vector4) return value.clone();
  if (Array.isArray(value)) return value.map(cloneLodLightValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneLodLightValue(item)]));
  }
  return value;
}

type LodMaterialMap = {
  map?: Texture | null;
  emissiveMap?: Texture | null;
  normalMap?: Texture | null;
};

function convertLodObjectMaterials(root: Object3D, sun?: StarMadeSceneSunOptions): void {
  root.traverse((object) => {
    const candidate = object as Object3D & { isMesh?: boolean; material?: unknown };
    if (!candidate.isMesh) { return; }

    const mats = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    const converted = mats.map((entry) => {
      if (entry instanceof ShaderMaterial) {
        return entry; // already converted
      }

      const mapped = entry as typeof entry & LodMaterialMap;
      const mainTexture = resolveUploadableTexture(mapped.map);
      const emissiveTexture = resolveUploadableTexture(mapped.emissiveMap);
      const normalTexture = resolveUploadableTexture(mapped.normalMap);

      configureStarMadeLodTexture(mainTexture);
      configureStarMadeLodTexture(emissiveTexture);
      configureStarMadeLodTexture(normalTexture);

      const hasEmissiveTexture = emissiveTexture !== null;
      const hasNormalTexture = normalTexture !== null;

      const shader = createStarMadeLodShaderMaterial({
        mainTexture,
        emissiveTexture,
        normalTexture,
        emissiveOn: hasEmissiveTexture,
        blended: false,
        sun
      }) as ShaderMaterial & { userData: Record<string, unknown> };

      shader.name = `StarMadeLodShaderMaterial:${(entry as { name?: string }).name ?? "unnamed"}`;
      shader.transparent = false;
      shader.depthWrite = true;
      shader.side = FrontSide;
      shader.userData.hasEmissiveTexture = hasEmissiveTexture;
      shader.userData.hasNormalTexture = hasNormalTexture;
      shader.userData.sourceMaterialName = (entry as { name?: string }).name;
      shader.userData.usesFallbackMainTexture = mainTexture === null;

      return shader;
    });

    candidate.material = Array.isArray(candidate.material) ? converted : converted[0];
  });

  // Ensure tangent/color attributes after material conversion
  root.traverse((object) => {
    const candidate = object as Object3D & { isMesh?: boolean; geometry?: { getAttribute(n: string): unknown; setAttribute(n: string, a: unknown): void; attributes: Record<string, unknown> } };
    if (!candidate.isMesh || !candidate.geometry) { return; }
    ensureLodTangentColorAttribute(candidate.geometry);
  });
}

function applyStarMadeLodMaterialState(
  root: Object3D,
  _blockDefinition: BlockDefinition,
  _active: boolean
): void {
  root.traverse((object) => {
    const candidate = object as Object3D & { isMesh?: boolean; material?: unknown; renderOrder?: number };
    if (!candidate.isMesh) { return; }

    const mats = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    for (const mat of mats) {
      // convertLodObjectMaterials guarantees ShaderMaterial on each mesh.
      const shader = mat as ShaderMaterial & { userData: Record<string, unknown> };
      if (shader.uniforms.emissiveOn) {
        shader.uniforms.emissiveOn.value = shader.userData.hasEmissiveTexture === true;
      }
      shader.transparent = false;
      shader.depthWrite = true;
      shader.side = FrontSide;
      shader.needsUpdate = true;
    }

    candidate.renderOrder = 0;
  });
}

function prepareStarMadeLodObject(root: Object3D): Object3D {
  replaceStaticSkinnedMeshes(root);
  return root;
}

function replaceStaticSkinnedMeshes(root: Object3D): void {
  const replacements: Array<{ parent: Object3D; source: object; replacement: object }> = [];

  root.traverse((object) => {
    const candidate = object as Object3D & {
      isMesh?: boolean;
      isSkinnedMesh?: boolean;
      geometry?: { getAttribute(n: string): unknown; skinIndex?: unknown; skinWeight?: unknown };
      parent?: Object3D;
    };

    const hasSkinAttrs =
      candidate.geometry?.getAttribute("skinIndex") !== undefined &&
      candidate.geometry?.getAttribute("skinWeight") !== undefined;

    if (!candidate.isMesh || !candidate.isSkinnedMesh || hasSkinAttrs || !candidate.parent) {
      return;
    }

    const src = candidate as unknown as { geometry: unknown; material: unknown; name: string; position: object; quaternion: object; scale: object; visible: boolean; castShadow: boolean; receiveShadow: boolean; renderOrder: number; userData: object };
    const replacement = new Mesh(src.geometry as never, src.material as never);
    replacement.name = src.name;
    (replacement.position as { copy(v: object): void }).copy(src.position);
    (replacement.quaternion as { copy(v: object): void }).copy(src.quaternion);
    (replacement.scale as { copy(v: object): void }).copy(src.scale);
    replacement.visible = src.visible;
    replacement.castShadow = src.castShadow;
    replacement.receiveShadow = src.receiveShadow;
    replacement.renderOrder = src.renderOrder;
    replacement.userData = { ...src.userData as object };
    replacements.push({ parent: candidate.parent, source: candidate, replacement });
  });

  for (const { parent, source, replacement } of replacements) {
    const idx = parent.children.indexOf(source as Object3D);
    parent.remove(source as Object3D);
    if (idx >= 0) {
      parent.children.splice(idx, 0, replacement as Object3D);
      (replacement as Object3D).parent = parent;
    } else {
      parent.add(replacement as Object3D);
    }
  }
}

function ensureLodTangentColorAttribute(geometry: {
  getAttribute(n: string): unknown;
  setAttribute(n: string, a: unknown): void;
  attributes: Record<string, unknown>;
}): void {
  const position = geometry.getAttribute("position") as BufferAttribute | undefined;
  if (!position) { return; }

  if (!geometry.getAttribute("color")) {
    const count = position.count;
    const colors = new Float32Array(count * 3).fill(1);
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  }

  if (!geometry.getAttribute("tangent")) {
    const count = position.count;
    const tangents = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      tangents[i * 4] = 1;
      tangents[i * 4 + 3] = 1;
    }
    geometry.setAttribute("tangent", new BufferAttribute(tangents, 4));
  }
}

function resolveUploadableTexture(texture: Texture | null | undefined): Texture | null {
  if (!texture) { return null; }
  const img = texture.image as { complete?: boolean; data?: unknown; width?: number; height?: number } | undefined | null;
  if (!img) { return null; }
  if (img.data !== undefined) { return texture; }
  if (typeof img.width === "number" && typeof img.height === "number") {
    return img.width > 0 && img.height > 0 && img.complete !== false ? texture : null;
  }
  return null;
}

function configureStarMadeLodTexture(texture: Texture | null): void {
  if (!texture) { return; }
  (texture as { colorSpace: string }).colorSpace = "" as string;
  texture.needsUpdate = true;
}

async function waitForStarMadeLodTextures(root: Object3D): Promise<void> {
  const textures = new Set<Texture>();

  root.traverse((object) => {
    const candidate = object as Object3D & { isMesh?: boolean; material?: unknown };
    if (!candidate.isMesh) { return; }
    const mats = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    for (const mat of mats) {
      const m = mat as LodMaterialMap;
      if (m.map) { textures.add(m.map); }
      if (m.emissiveMap) { textures.add(m.emissiveMap); }
      if (m.normalMap) { textures.add(m.normalMap); }
    }
  });

  await Promise.all([...textures].map(waitForTextureImage));
}

function waitForTextureImage(texture: Texture): Promise<void> {
  const img = texture.image as { complete?: boolean; data?: unknown; width?: number; height?: number } | undefined | null;
  if (img && (img.data !== undefined || (typeof img.width === "number" && img.width > 0 && img.complete !== false))) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const i = texture.image as typeof img;
      if (
        performance.now() - start > 10000 ||
        (i && (i.data !== undefined || (typeof i.width === "number" && i.width > 0 && i.complete !== false)))
      ) {
        resolve();
        return;
      }
      setTimeout(check, 16);
    };
    check();
  });
}

function collectStarMadeLodInstanceStats(root: Object3D): {
  meshCount: number; vertexCount: number; triangleCount: number;
  texturedMaterials: number; fallbackMaterials: number;
  emissiveMaterials: number; normalMappedMaterials: number;
} {
  let meshCount = 0; let vertexCount = 0; let triangleCount = 0;
  let texturedMaterials = 0; let fallbackMaterials = 0;
  let emissiveMaterials = 0; let normalMappedMaterials = 0;

  root.traverse((object) => {
    const candidate = object as Object3D & {
      isMesh?: boolean;
      geometry?: { getAttribute(n: string): { count: number } | undefined; getIndex(): { count: number } | null };
      material?: unknown;
    };
    if (!candidate.isMesh || !candidate.geometry) { return; }

    const position = candidate.geometry.getAttribute("position");
    const index = candidate.geometry.getIndex();
    meshCount++;
    vertexCount += position?.count ?? 0;
    triangleCount += Math.floor((index?.count ?? position?.count ?? 0) / 3);

    const mats = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    for (const mat of mats) {
      // convertLodObjectMaterials guarantees ShaderMaterial on each mesh.
      const shader = mat as ShaderMaterial & { userData: Record<string, unknown> };
      if (shader.userData.usesFallbackMainTexture) { fallbackMaterials++; } else { texturedMaterials++; }
      if (shader.userData.hasEmissiveTexture) { emissiveMaterials++; }
      if (shader.userData.hasNormalTexture) { normalMappedMaterials++; }
    }
  });

  return { meshCount, vertexCount, triangleCount, texturedMaterials, fallbackMaterials, emissiveMaterials, normalMappedMaterials };
}
