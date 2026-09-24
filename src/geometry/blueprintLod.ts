import { segmentBlockPosition, STARMADE_SEGMENT_BLOCK_COUNT, STARMADE_SEGMENT_DIM, type SegmentDataLike } from "../starmade/segmentData.js";

export interface StarMadeBlueprintLodMaterial {
  /** Linear RGB reflectance in [0, 1], typically the mean of a block's atlas tile. */
  readonly color: readonly [number, number, number];
  /** Linear RGB self-emission in [0, 1]; stored separately from surface reflectance. */
  readonly emission?: readonly [number, number, number];
  /** Only identical visual groups can merge. Defaults to the block type. */
  readonly group?: string;
}

export interface StarMadeBlueprintLodOptions {
  readonly segments: readonly SegmentDataLike[];
  /** Occluders only; do not include any of the owned segments here. */
  readonly neighborSegments?: readonly SegmentDataLike[];
  readonly cellSize?: 1 | 2 | 4;
  readonly palette?: (blockType: number) => StarMadeBlueprintLodMaterial | undefined;
}

export interface StarMadeBlueprintLod {
  readonly cellSize: 1 | 2 | 4;
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly emissiveColors: number[];
  readonly indices: number[];
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } | null;
  readonly sourceBlockCount: number;
  readonly cellCount: number;
  readonly quadCount: number;
  readonly triangleCount: number;
  /** Conservative displacement bound from occupied unit cubes, not from native slabs/models. */
  readonly maxVoxelDisplacement: number;
}

type Vector = [number, number, number];
interface Material {
  readonly key: string;
  readonly color: readonly [number, number, number];
  readonly emission: readonly [number, number, number];
}
interface Cell {
  readonly position: Vector;
  readonly materials: Map<Material, number>;
}
interface Surface {
  readonly axis: number;
  readonly sign: number;
  readonly plane: number;
  readonly mask: Map<string, { readonly u: number; readonly v: number; readonly material: Material }>;
}
const gray = [0.5, 0.5, 0.5] as const;
const black = [0, 0, 0] as const;

/**
 * Opaque, texture-free preview: every occupied block (including native partial
 * shapes and glass) is a full cube. Coarse cells are occupied if any constituent
 * block exists; their dominant visual group supplies color. No local lights are
 * evaluated. Keep the original blueprint for exact display and picking.
 *
 * The implementation iterates sparse occupied surfaces, never a region-sized
 * dense bounding box. Output order is independent of segment iteration order.
 */
export function createStarMadeBlueprintLod(options: StarMadeBlueprintLodOptions): StarMadeBlueprintLod {
  const cellSize = options.cellSize ?? 1;
  if (cellSize !== 1 && cellSize !== 2 && cellSize !== 4) throw new RangeError("LOD cellSize must be 1, 2 or 4");
  const cells = new Map<string, Cell>();
  const occupied = new Set<string>();
  const segmentOrigins = new Set<string>();
  const palette = new Map<number, Material>();
  let sourceBlockCount = 0;

  function readSegments(segments: readonly SegmentDataLike[], owned: boolean): void {
    for (const segment of segments) {
      const origin = [segment.x, segment.y, segment.z];
      if (origin.some(value => !Number.isSafeInteger(value) || value % STARMADE_SEGMENT_DIM !== 0)) {
        throw new RangeError("LOD segment origin must contain safe integers aligned to 32 blocks");
      }
      const originKey = origin.join(",");
      if (segmentOrigins.has(originKey)) throw new Error(`Duplicate LOD segment origin ${originKey}`);
      segmentOrigins.add(originKey);
      if (segment.blocks.length > STARMADE_SEGMENT_BLOCK_COUNT) throw new RangeError("LOD segment exceeds 32768 blocks");
      for (let index = 0; index < segment.blocks.length; index++) {
        const block = segment.blocks[index];
        if (!block || block.type === 0) continue;
        if (!Number.isSafeInteger(block.type) || block.type < 0) throw new RangeError("Invalid LOD block type");
        const local = segmentBlockPosition(index);
        const position: Vector = [
          Math.floor((segment.x + local.x - 16) / cellSize),
          Math.floor((segment.y + local.y - 16) / cellSize),
          Math.floor((segment.z + local.z - 16) / cellSize)
        ];
        const key = position.join(",");
        occupied.add(key);
        if (!owned) continue;
        sourceBlockCount++;
        let material = palette.get(block.type);
        if (!material) {
          const supplied = options.palette?.(block.type);
          const color = supplied?.color ?? gray;
          const emission = supplied?.emission ?? black;
          validateColor(color, "color");
          validateColor(emission, "emission");
          const group = supplied?.group ?? String(block.type);
          if (typeof group !== "string" || group.length === 0) throw new TypeError("LOD visual group must be a nonempty string");
          material = { key: JSON.stringify([group, color, emission]), color, emission };
          palette.set(block.type, material);
        }
        let cell = cells.get(key);
        if (!cell) {
          cell = { position, materials: new Map() };
          cells.set(key, cell);
        }
        // Count compatible types as the same visual group during aggregation.
        const compatible = [...cell.materials.keys()].find(candidate => candidate.key === material.key) ?? material;
        cell.materials.set(compatible, (cell.materials.get(compatible) ?? 0) + 1);
      }
    }
  }

  readSegments(options.segments, true);
  readSegments(options.neighborSegments ?? [], false);
  const surfaces = new Map<string, Surface>();
  const min: Vector = [Infinity, Infinity, Infinity];
  const max: Vector = [-Infinity, -Infinity, -Infinity];
  for (const cell of cells.values()) {
    const material = [...cell.materials].sort((a, b) => b[1] - a[1] || compareKey(a[0].key, b[0].key))[0][0];
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], cell.position[axis] * cellSize - 0.5);
      max[axis] = Math.max(max[axis], (cell.position[axis] + 1) * cellSize - 0.5);
      for (const sign of [-1, 1]) {
        const neighbor = [...cell.position];
        neighbor[axis] += sign;
        if (occupied.has(neighbor.join(","))) continue;
        const plane = cell.position[axis] + (sign === 1 ? 1 : 0);
        const key = `${axis},${sign},${plane}`;
        let surface = surfaces.get(key);
        if (!surface) {
          surface = { axis, sign, plane, mask: new Map() };
          surfaces.set(key, surface);
        }
        const u = cell.position[(axis + 1) % 3], v = cell.position[(axis + 2) % 3];
        surface.mask.set(`${u},${v}`, { u, v, material });
      }
    }
  }

  const positions: number[] = [], normals: number[] = [], colors: number[] = [], emissiveColors: number[] = [], indices: number[] = [];
  for (const surface of [...surfaces.values()].sort((a, b) => a.axis - b.axis || a.sign - b.sign || a.plane - b.plane)) {
    const { axis, sign, plane, mask } = surface;
    for (const face of [...mask.values()].sort((a, b) => a.v - b.v || a.u - b.u)) {
      const { u, v, material } = face;
      if (!mask.has(`${u},${v}`)) continue;
      let width = 1, height = 1;
      while (mask.get(`${u + width},${v}`)?.material.key === material.key) width++;
      extendHeight: while (true) {
        for (let x = 0; x < width; x++) {
          if (mask.get(`${u + x},${v + height}`)?.material.key !== material.key) break extendHeight;
        }
        height++;
      }
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask.delete(`${u + x},${v + y}`);
      const base = positions.length / 3;
      for (const [du, dv] of [[0, 0], [width, 0], [width, height], [0, height]]) {
        const position: Vector = [0, 0, 0], normal: Vector = [0, 0, 0];
        position[axis] = plane * cellSize - 0.5;
        position[(axis + 1) % 3] = (u + du) * cellSize - 0.5;
        position[(axis + 2) % 3] = (v + dv) * cellSize - 0.5;
        normal[axis] = sign;
        positions.push(...position);
        normals.push(...normal);
        colors.push(...material.color);
        emissiveColors.push(...material.emission);
      }
      if (sign === 1) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  return { cellSize, positions, normals, colors, emissiveColors, indices, bounds: cells.size === 0 ? null : { min, max }, sourceBlockCount, cellCount: cells.size, quadCount: positions.length / 12, triangleCount: indices.length / 3, maxVoxelDisplacement: Math.sqrt(3) * (cellSize - 1) };
}

function validateColor(color: readonly number[], name: string): void {
  if (color.length !== 3 || color.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError(`LOD ${name} must be three finite linear RGB values in [0, 1]`);
  }
}

function compareKey(a: string, b: string): number {
  return a < b ? -1 : 1;
}
