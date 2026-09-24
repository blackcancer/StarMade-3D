import { BufferGeometry, Float32BufferAttribute, Group, LOD, Mesh, ShaderMaterial, type Camera } from "three";
import type { StarMadeBlueprintLod } from "../geometry/blueprintLod.js";

export interface StarMadeBlueprintLodSceneData {
  readonly entities: readonly {
    readonly id: string;
    readonly parentId?: string | null;
    /** Local-to-parent matrix in Three.js column-major order. */
    readonly transform: readonly number[];
  }[];
  readonly regions: readonly {
    readonly entityId: string;
    readonly cellSize: 1 | 2 | 4;
    readonly mesh: StarMadeBlueprintLod;
  }[];
}

export interface StarMadeBlueprintLodSceneOptions {
  /** Distances from each entity origin, divided by camera zoom; strictly increasing, starting at zero. */
  readonly distances?: readonly [number, number, number];
}

export interface StarMadeBlueprintLodScene {
  readonly root: Group;
  /** Update after camera or entity movement. Level transitions use 10% hysteresis. */
  update(camera: Camera): void;
  /** Detach and release the geometries and shared material; safe to call repeatedly. */
  dispose(): void;
}

/** A texture-free approximate preview, with one global sun and per-vertex self-emission. */
export function createStarMadeBlueprintLodScene(
  data: StarMadeBlueprintLodSceneData,
  options: StarMadeBlueprintLodSceneOptions = {}
): StarMadeBlueprintLodScene {
  const distances = options.distances ?? [0, 128, 512];
  if (distances.length !== 3 || distances.some(value => !Number.isFinite(value)) || distances[0] !== 0 || distances[1] <= distances[0] || distances[2] <= distances[1]) {
    throw new RangeError("LOD distances must be three finite increasing values starting at zero");
  }
  const root = new Group();
  root.name = "StarMadeBlueprintLod";
  const geometries: BufferGeometry[] = [];
  const lods: LOD[] = [];
  const material = new ShaderMaterial({
    vertexColors: true,
    toneMapped: false,
    vertexShader: `
attribute vec3 emissiveColor;
varying vec3 lodColor;
void main() {
  vec3 sunDirection = normalize(mat3(viewMatrix) * vec3(0.4, 0.8, 0.3));
  float diffuse = 0.2 + 0.8 * max(dot(normalize(normalMatrix * normal), sunDirection), 0.0);
  lodColor = color * diffuse + emissiveColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
varying vec3 lodColor;
void main() {
  gl_FragColor = vec4(lodColor, 1.0);
  #include <colorspace_fragment>
}`
  });
  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    material.dispose();
    root.removeFromParent();
    root.clear();
  }

  try {
    const entities = new Map<string, Group>();
    const parents = new Map<string, string>();
    const levels = new Map<string, Map<number, Group>>();
    for (const entity of data.entities) {
      if (typeof entity.id !== "string" || entity.id.length === 0) throw new TypeError("LOD entity id must be a nonempty string");
      if (entities.has(entity.id)) throw new Error(`Duplicate LOD entity id ${entity.id}`);
      if (entity.transform.length !== 16 || entity.transform.some(value => !Number.isFinite(value))) throw new RangeError("LOD entity transform must be a finite 4x4 matrix");
      const group = new Group();
      group.name = entity.id;
      group.matrixAutoUpdate = false;
      group.matrix.fromArray([...entity.transform]);
      entities.set(entity.id, group);
      levels.set(entity.id, new Map());
      if (entity.parentId !== undefined && entity.parentId !== null) parents.set(entity.id, entity.parentId);
    }
    for (const [id, group] of entities) {
      const visited = new Set<string>();
      let ancestor: string | undefined = id;
      while (ancestor !== undefined) {
        if (visited.has(ancestor)) throw new Error(`LOD entity hierarchy contains a cycle at ${ancestor}`);
        visited.add(ancestor);
        ancestor = parents.get(ancestor);
      }
      const parentId = parents.get(id);
      if (parentId === undefined) root.add(group);
      else {
        const parent = entities.get(parentId);
        if (!parent) throw new Error(`Unknown LOD parent entity ${parentId}`);
        parent.add(group);
      }
    }
    for (const region of data.regions) {
      const entityLevels = levels.get(region.entityId);
      if (!entityLevels) throw new Error(`Unknown LOD mesh entity ${region.entityId}`);
      if (region.cellSize !== 1 && region.cellSize !== 2 && region.cellSize !== 4) throw new RangeError("LOD region cellSize must be 1, 2 or 4");
      const source = region.mesh;
      validateMesh(source, region.cellSize);
      const geometry = new BufferGeometry();
      geometries.push(geometry);
      geometry.setAttribute("position", new Float32BufferAttribute(source.positions, 3));
      geometry.setAttribute("normal", new Float32BufferAttribute(source.normals, 3));
      geometry.setAttribute("color", new Float32BufferAttribute(source.colors, 3));
      geometry.setAttribute("emissiveColor", new Float32BufferAttribute(source.emissiveColors, 3));
      geometry.setIndex(source.indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      let level = entityLevels.get(region.cellSize);
      if (!level) {
        level = new Group();
        level.name = `lod:${region.entityId}:${region.cellSize}`;
        entityLevels.set(region.cellSize, level);
      }
      const mesh = new Mesh(geometry, material);
      mesh.userData.entityId = region.entityId;
      mesh.userData.cellSize = region.cellSize;
      level.add(mesh);
    }
    for (const [id, entityLevels] of levels) {
      const lod = new LOD();
      lod.autoUpdate = false;
      const sizes = [1, 2, 4];
      for (let index = 0; index < sizes.length; index++) {
        const level = entityLevels.get(sizes[index]);
        if (!level) continue;
        level.visible = lod.levels.length === 0;
        lod.addLevel(level, distances[index], 0.1);
      }
      entities.get(id)!.add(lod);
      lods.push(lod);
    }
    root.updateMatrixWorld(true);
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    root,
    update(camera): void {
      if (disposed) return;
      root.updateWorldMatrix(true, true);
      camera.updateWorldMatrix(true, false);
      for (const lod of lods) lod.update(camera);
    },
    dispose
  };
}

function validateMesh(mesh: StarMadeBlueprintLod, cellSize: number): void {
  const length = mesh.positions.length;
  if (mesh.cellSize !== cellSize || length % 3 !== 0 || mesh.normals.length !== length || mesh.colors.length !== length || mesh.emissiveColors.length !== length || mesh.indices.length % 3 !== 0) {
    throw new RangeError("Invalid LOD mesh attribute sizes or cellSize");
  }
  for (const values of [mesh.positions, mesh.normals, mesh.colors, mesh.emissiveColors]) {
    if (values.some(value => !Number.isFinite(Math.fround(value)))) throw new RangeError("LOD mesh attributes must be finite Float32 values");
  }
  if (mesh.indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= length / 3)) throw new RangeError("LOD mesh indices must refer to existing vertices");
}
