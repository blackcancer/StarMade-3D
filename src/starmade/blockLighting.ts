import {
  createStarMadeEncodedCubeShapeFaces,
  type StarMadeEncodedCubeShapeFace
} from "../geometry/starmadeEncodedCube.js";
import type { BlockDefinition } from "./blockConfig.js";

export const STARMADE_OCCLUSION_COLOR_PERM = 31;
export const STARMADE_OCCLUSION_LIGHT_SCALE = 1.28;
export const STARMADE_OCCLUSION_RAY_LENGTH = 22;
export const STARMADE_OCCLUSION_DEFAULT_RAY_COUNT = 128;

export type StarMadeRgb = readonly [number, number, number];
export type StarMadeRgba = readonly [number, number, number, number];
export type StarMadeVec3 = readonly [number, number, number];
export type StarMadeGridPoint = readonly [number, number];
export type StarMadeGridPoint3 = readonly [number, number, number];

export interface StarMadeBlockLightSource {
  readonly grid: StarMadeGridPoint;
  readonly position?: StarMadeGridPoint3;
  readonly color: StarMadeRgba;
  readonly active?: boolean;
  readonly passable?: boolean;
  readonly rayPassable?: boolean;
  readonly lightCell?: boolean;
  readonly lightPassOnBlockItself?: boolean;
  readonly innerLightSides?: readonly number[];
  readonly innerLightPassThroughSides?: readonly number[];
  readonly innerLightBlockedSides?: readonly number[];
  readonly visibleSides?: readonly number[];
  readonly visibilityBlockerSides?: readonly number[];
}

export interface StarMadeBlockLightBlocker {
  readonly grid: StarMadeGridPoint;
  readonly position?: StarMadeGridPoint3;
  readonly active?: boolean;
  readonly passable?: boolean;
  readonly rayPassable?: boolean;
  readonly lightCell?: boolean;
  readonly lightPassOnBlockItself?: boolean;
  readonly innerLightSides?: readonly number[];
  readonly innerLightPassThroughSides?: readonly number[];
  readonly innerLightBlockedSides?: readonly number[];
  readonly visibleSides?: readonly number[];
  readonly visibilityBlockerSides?: readonly number[];
}

export interface StarMadeBlockLightSurfaceOptions {
  readonly size: number;
  readonly sources: readonly StarMadeBlockLightSource[];
  readonly blockers?: readonly StarMadeBlockLightBlocker[];
  readonly rayCount?: number;
  readonly rayLength?: number;
}

export interface StarMadeBlockLightSolid {
  readonly position: StarMadeGridPoint3;
  readonly active?: boolean;
  readonly passable?: boolean;
  readonly rayPassable?: boolean;
  readonly lightCell?: boolean;
  readonly lightPassOnBlockItself?: boolean;
  readonly innerLightSides?: readonly number[];
  readonly innerLightPassThroughSides?: readonly number[];
  readonly innerLightBlockedSides?: readonly number[];
  readonly visibleSides?: readonly number[];
  readonly visibilityBlockerSides?: readonly number[];
  readonly shapeFaces?: readonly StarMadeBlockLightShapeFace[];
}

export type StarMadeBlockLightShapeFace = StarMadeEncodedCubeShapeFace;

export interface StarMadeBlockLightVolumeOptions {
  readonly size: StarMadeGridPoint3;
  readonly sources: readonly StarMadeBlockLightSource[];
  readonly solids?: readonly StarMadeBlockLightSolid[];
  readonly blockers?: readonly StarMadeBlockLightBlocker[];
  readonly rayCount?: number;
  readonly rayLength?: number;
}

export type StarMadeBlockLightBlockTraits = Pick<
  StarMadeBlockLightSolid,
  | "lightCell"
  | "rayPassable"
  | "lightPassOnBlockItself"
  | "innerLightSides"
  | "innerLightPassThroughSides"
  | "innerLightBlockedSides"
  | "visibleSides"
  | "visibilityBlockerSides"
>;

export function starMadeBlockLightTraitsFromBlock(
  block: Pick<BlockDefinition, "blockStyle" | "transparent" | "lightSource" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">> & {
    readonly lodCollisionPhysical?: boolean;
  },
  options: { readonly orientation?: number } = {}
): StarMadeBlockLightBlockTraits {
  const isSprite = block.blockStyle === 3;
  const hasLod = block.lodShape.length > 0;
  const isPhysicalLod = hasLod && (block.lodCollisionPhysical ?? true);
  const orientation = options.orientation ?? FRONT;
  const slab = block.slab ?? 0;
  const lightPassOnBlockItself = isStarMadeSolidBlockStyle(block.blockStyle) || slab > 0;
  const lightCell =
    block.transparent || isSprite || block.lodShapeStyle === 1 || (hasLod && block.lightSource) || lightPassOnBlockItself;
  const rayPassable = (block.transparent && !isPhysicalLod) || isSprite || (block.lightSource && (isSprite || hasLod));
  const visibleSides = starMadeVisibleSidesForBlock(block, orientation);
  const visibilityBlockerSides = starMadeVisibilityBlockerSidesForBlock(block, orientation);
  const innerLightBlockedSides = slab > 0 ? [starMadeSlabVisibilityBlockerSide(orientation)] : undefined;
  const innerLightSides = slab > 0
    ? undefined
    : lightPassOnBlockItself
      ? starMadeInnerLightSidesForBlock(block, orientation)
      : undefined;
  const innerLightPassThroughSides = slab > 0
    ? undefined
    : lightPassOnBlockItself
      ? starMadeInnerLightPassThroughSidesForBlock(block, orientation)
      : undefined;

  return {
    lightCell,
    rayPassable,
    ...(lightPassOnBlockItself ? { lightPassOnBlockItself } : {}),
    ...(innerLightSides && innerLightSides.length > 0 ? { innerLightSides } : {}),
    ...(innerLightPassThroughSides && innerLightPassThroughSides.length > 0 ? { innerLightPassThroughSides } : {}),
    ...(innerLightBlockedSides ? { innerLightBlockedSides } : {}),
    ...(visibleSides ? { visibleSides } : {}),
    ...(visibilityBlockerSides.length > 0 ? { visibilityBlockerSides } : {})
  };
}

export function createStarMadeBlockLightSourceFromBlock(
  block: Pick<BlockDefinition, "blockStyle" | "transparent" | "lightSource" | "lightSourceColor" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">>,
  options: {
    readonly grid: StarMadeGridPoint;
    readonly position?: StarMadeGridPoint3;
    readonly active?: boolean;
    readonly orientation?: number;
    readonly overrides?: Partial<StarMadeBlockLightSource>;
  }
): StarMadeBlockLightSource {
  return {
    grid: options.grid,
    position: options.position,
    color: block.lightSourceColor,
    active: options.active,
    ...starMadeBlockLightTraitsFromBlock(block, { orientation: options.orientation }),
    ...options.overrides
  };
}

export function createStarMadeBlockLightSolidFromBlock(
  block: Pick<BlockDefinition, "blockStyle" | "transparent" | "lightSource" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">>,
  options: {
    readonly position: StarMadeGridPoint3;
    readonly active?: boolean;
    readonly orientation?: number;
    readonly overrides?: Partial<StarMadeBlockLightSolid>;
  }
): StarMadeBlockLightSolid {
  return {
    position: options.position,
    active: options.active,
    ...starMadeBlockLightTraitsFromBlock(block, { orientation: options.orientation }),
    shapeFaces: cachedShapeFacesForBlock(block, options.orientation),
    ...options.overrides
  };
}

export function createStarMadeBlockLightBlockerFromBlock(
  block: Pick<BlockDefinition, "blockStyle" | "transparent" | "lightSource" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">>,
  options: {
    readonly grid: StarMadeGridPoint;
    readonly position?: StarMadeGridPoint3;
    readonly active?: boolean;
    readonly orientation?: number;
    readonly overrides?: Partial<StarMadeBlockLightBlocker>;
  }
): StarMadeBlockLightBlocker {
  return {
    grid: options.grid,
    position: options.position,
    active: options.active,
    ...starMadeBlockLightTraitsFromBlock(block, { orientation: options.orientation }),
    ...options.overrides
  };
}

function cachedShapeFacesForBlock(
  block: Pick<BlockDefinition, "blockStyle"> & Partial<BlockDefinition>,
  orientation = 0
): readonly StarMadeBlockLightShapeFace[] {
  let byOrientation = blockShapeFacesCache.get(block);

  if (!byOrientation) {
    byOrientation = new Map();
    blockShapeFacesCache.set(block, byOrientation);
  }

  const normalizedOrientation = positiveModulo(Math.trunc(orientation), 24);
  const cached = byOrientation.get(normalizedOrientation);

  if (cached) {
    return cached;
  }

  const shapeFaces = createStarMadeEncodedCubeShapeFaces({
    block: block as BlockDefinition,
    orientation: normalizedOrientation
  });
  byOrientation.set(normalizedOrientation, shapeFaces);
  return shapeFaces;
}

export function starMadeVisibleSidesForBlock(
  block: Pick<BlockDefinition, "blockStyle" | "lodShape">,
  orientation = FRONT
): readonly number[] | undefined {
  if (block.lodShape.length > 0 || block.blockStyle !== 3) {
    return undefined;
  }

  const normalizedOrientation = positiveModulo(Math.trunc(orientation), starMadeElementDirections.length);

  if (normalizedOrientation === TOP || normalizedOrientation === BOTTOM) {
    return [FRONT, BACK, RIGHT, LEFT];
  }

  if (normalizedOrientation === FRONT || normalizedOrientation === BACK) {
    return [TOP, BOTTOM, RIGHT, LEFT];
  }

  return [FRONT, BACK, TOP, BOTTOM];
}

export function starMadeSlabVisibilityBlockerSide(orientation: number): number {
  return starMadeSwitchLeftRightSide(oppositeSide[positiveModulo(Math.trunc(orientation), starMadeElementDirections.length)]);
}

function starMadeVisibilityBlockerSidesForBlock(
  block: Pick<BlockDefinition, "blockStyle" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">>,
  orientation: number
): readonly number[] {
  if ((block.slab ?? 0) > 0) {
    return [starMadeSlabVisibilityBlockerSide(orientation)];
  }

  if (!isStarMadeSolidBlockStyle(block.blockStyle) || (block.lodShape.length > 0 && block.lodShapeStyle === 1)) {
    return [];
  }

  if (block.blockStyle === 1) {
    return starMadeWedgeSidesToCheckForVisForOrientation(orientation);
  }

  return fullAxisSidesForShapeFaces(cachedShapeFacesForBlock(block, orientation));
}

function starMadeInnerLightSidesForBlock(
  block: Pick<BlockDefinition, "blockStyle" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">>,
  orientation: number
): readonly number[] {
  // The only caller requires lightPassOnBlockItself and slab <= 0, which
  // already proves isStarMadeSolidBlockStyle(block.blockStyle).
  if (block.blockStyle === 1) {
    const sides: number[] = [];

    collectValidSides(sides, starMadeWedgeSidesAngledForOrientation(orientation));
    collectValidSides(sides, starMadeWedgeOpenToAirSidesForOrientation(orientation));
    return sides;
  }

  const sides: number[] = [];

  for (const face of cachedShapeFacesForBlock(block, orientation)) {
    if (face.surface && face.fullAxisSide === null && !sides.includes(face.lightSide)) {
      sides.push(face.lightSide);
    }
  }

  return sides;
}

function starMadeInnerLightPassThroughSidesForBlock(
  block: Pick<BlockDefinition, "blockStyle" | "lodShape" | "lodShapeStyle"> &
    Partial<Pick<BlockDefinition, "slab" | "sideTexturesPointToOrientation" | "individualSides">>,
  orientation: number
): readonly number[] {
  // As above, the caller only requests these sides for a non-slab solid style.
  if (block.blockStyle === 1) {
    return starMadeWedgeSidesAngledForOrientation(orientation);
  }

  const sides: number[] = [];

  for (const face of cachedShapeFacesForBlock(block, orientation)) {
    if (face.surface && face.fullAxisSide === null && !sides.includes(face.lightSide)) {
      sides.push(face.lightSide);
    }
  }

  return sides;
}

function starMadeWedgeSidesAngledForOrientation(orientation: number): readonly number[] {
  return starMadeWedgeSidesAngled[positiveModulo(Math.trunc(orientation), starMadeWedgeSidesAngled.length)];
}

function starMadeWedgeOpenToAirSidesForOrientation(orientation: number): readonly number[] {
  return starMadeWedgeOpenToAirSides[positiveModulo(Math.trunc(orientation), starMadeWedgeOpenToAirSides.length)];
}

function starMadeWedgeSidesToCheckForVisForOrientation(orientation: number): readonly number[] {
  return starMadeWedgeSidesToCheckForVis[positiveModulo(Math.trunc(orientation), starMadeWedgeSidesToCheckForVis.length)];
}

export interface StarMadeOcclusionRay {
  readonly points: readonly number[];
  readonly depths: readonly number[];
  readonly sideWeights: readonly number[];
}

export interface StarMadeOcclusionSample {
  readonly rays: readonly StarMadeOcclusionRay[];
  readonly sideWeightSums: readonly number[];
  readonly sideWeightInv: readonly number[];
}

export interface StarMadeBlockLightSurfaceCell {
  readonly grid: StarMadeGridPoint;
  readonly airPosition: StarMadeGridPoint3;
  readonly gather: StarMadeRgb;
  readonly occlusion: readonly number[];
  readonly topFaceLight: StarMadeRgb;
}

export interface StarMadeBlockLightVolumeCell {
  readonly position: StarMadeGridPoint3;
  readonly gather: StarMadeRgb;
  readonly lightDirection: StarMadeVec3;
  readonly occlusion: readonly number[];
  readonly sideLights: readonly StarMadeRgba[];
  readonly sideLightDirections: readonly StarMadeVec3[];
}

export interface StarMadeBlockLightSurface {
  readonly size: number;
  readonly rayCount: number;
  readonly rayLength: number;
  readonly colorPerm: number;
  readonly lightScale: number;
  readonly volume: StarMadeBlockLightVolume;
  readonly cells: readonly StarMadeBlockLightSurfaceCell[];
}

export interface StarMadeBlockLightVolume {
  readonly size: StarMadeGridPoint3;
  readonly rayCount: number;
  readonly rayLength: number;
  readonly colorPerm: number;
  readonly lightScale: number;
  readonly sources: readonly StarMadeBlockLightSource[];
  readonly solids: readonly StarMadeBlockLightSolid[];
  readonly cells: readonly StarMadeBlockLightVolumeCell[];
}

export interface StarMadeLodBlockLight {
  readonly primarySide: number;
  readonly oppositePrimarySide: number;
  readonly sideData: readonly (StarMadeRgba | null)[];
  readonly lightDiffuse: readonly StarMadeRgba[];
  readonly lightVec: readonly StarMadeVec3[];
}

const FRONT = 0;
const BACK = 1;
const TOP = 2;
const BOTTOM = 3;
const RIGHT = 4;
const LEFT = 5;
const blockShapeFacesCache = new WeakMap<object, Map<number, readonly StarMadeBlockLightShapeFace[]>>();
const volumeSolidMapCache = new WeakMap<StarMadeBlockLightVolume, Map<string, StarMadeBlockLightSolid>>();
const volumeCellMapCache = new WeakMap<StarMadeBlockLightVolume, Map<string, StarMadeBlockLightVolumeCell>>();

interface StarMadeBlockLightVoxelLookup {
  readonly sources: ReadonlyMap<string, StarMadeBlockLightSource>;
  readonly solids: ReadonlyMap<string, StarMadeBlockLightSolid>;
}

const oppositeSide = [BACK, FRONT, BOTTOM, TOP, LEFT, RIGHT] as const;
const starMadeWedgeSidesAngled = [
  [TOP],     // WedgeTopFront
  [TOP],     // WedgeTopRight
  [TOP],     // WedgeTopBack
  [TOP],     // WedgeTopLeft
  [BOTTOM],  // WedgeBottomFront
  [BOTTOM],  // WedgeBottomRight
  [BOTTOM],  // WedgeBottomBack
  [BOTTOM],  // WedgeBottomLeft
  [RIGHT],   // WedgeLeftFront
  [FRONT],   // WedgeLeftRight
  [LEFT],    // WedgeLeftBack
  [FRONT]    // WedgeLeftLeft
] as const;
const starMadeWedgeOpenToAirSides = [
  [LEFT, RIGHT],   // WedgeTopFront
  [BACK, FRONT],  // WedgeTopRight
  [LEFT, RIGHT],   // WedgeTopBack
  [BACK, FRONT],  // WedgeTopLeft
  [LEFT, RIGHT],   // WedgeBottomFront
  [BACK, FRONT],  // WedgeBottomRight
  [LEFT, RIGHT],   // WedgeBottomBack
  [BACK, FRONT],  // WedgeBottomLeft
  [BOTTOM, TOP],  // WedgeLeftFront
  [BOTTOM, TOP],  // WedgeLeftRight
  [BOTTOM, TOP],  // WedgeLeftBack
  [BOTTOM, TOP]   // WedgeLeftLeft
] as const;
const starMadeWedgeSidesToCheckForVis = [
  [BOTTOM, FRONT], // WedgeTopFront
  [BOTTOM, RIGHT], // WedgeTopRight
  [BOTTOM, BACK],  // WedgeTopBack
  [BOTTOM, LEFT],  // WedgeTopLeft
  [TOP, FRONT],    // WedgeBottomFront
  [LEFT, TOP],     // WedgeBottomRight
  [TOP, BACK],     // WedgeBottomBack
  [RIGHT, TOP],    // WedgeBottomLeft
  [LEFT, FRONT],   // WedgeLeftFront
  [LEFT, BACK],    // WedgeLeftRight
  [RIGHT, FRONT],  // WedgeLeftBack
  [RIGHT, BACK]    // WedgeLeftLeft
] as const;
const STARMADE_MUSHROOM_BLOCK_ID = 104;
const starMadeOriencubePrimarySides = [
  FRONT,
  FRONT,
  FRONT,
  FRONT,
  BACK,
  BACK,
  BACK,
  BACK,
  BOTTOM,
  BOTTOM,
  BOTTOM,
  BOTTOM,
  TOP,
  TOP,
  TOP,
  TOP,
  RIGHT,
  RIGHT,
  RIGHT,
  RIGHT,
  LEFT,
  LEFT,
  LEFT,
  LEFT
] as const;
const starMadeElementDirections = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0]
] as const satisfies readonly StarMadeVec3[];

export function createStarMadeOcclusionSample(options: {
  readonly rayCount?: number;
  readonly rayLength?: number;
} = {}): StarMadeOcclusionSample {
  const rayCount = options.rayCount ?? STARMADE_OCCLUSION_DEFAULT_RAY_COUNT;
  const rayLength = options.rayLength ?? STARMADE_OCCLUSION_RAY_LENGTH;
  if (!Number.isSafeInteger(rayCount) || rayCount <= 0) {
    throw new RangeError("rayCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(rayLength) || rayLength <= 0) {
    throw new RangeError("rayLength must be a positive safe integer");
  }
  const rays: StarMadeOcclusionRay[] = [];
  const sideWeightSums = [0, 0, 0, 0, 0, 0];
  const increment = Math.PI * (3 - Math.sqrt(5));
  const offset = 2 / rayCount;

  for (let index = 0; index < rayCount; index++) {
    const y = index * offset - 1 + offset / 2;
    const radius = Math.sqrt(1 - y * y);
    const phi = index * increment;
    const ray = createStarMadeOcclusionRay(Math.cos(phi) * radius, y, Math.sin(phi) * radius, rayLength);

    rays.push(ray);
    for (let side = 0; side < sideWeightSums.length; side++) {
      sideWeightSums[side] += ray.sideWeights[side];
    }
  }

  return {
    rays,
    sideWeightSums,
    // A low ray count can leave a side unsampled; its contribution is zero,
    // rather than 0 * Infinity producing NaN in the gathered occlusion.
    sideWeightInv: sideWeightSums.map((value) => value > 0 ? 1 / value : 0)
  };
}

export function computeStarMadeBlockLightSurface(options: StarMadeBlockLightSurfaceOptions): StarMadeBlockLightSurface {
  const surfaceSolids = Array.from({ length: options.size * options.size }, (_, index): StarMadeBlockLightSolid => {
    const x = index % options.size;
    const z = Math.floor(index / options.size);

    return { position: [x, 0, z] as const };
  });
  const blockerSolids = (options.blockers ?? [])
    .filter((blocker) => blocker.active ?? true)
    .map((blocker): StarMadeBlockLightSolid => ({
      position: blocker.position ?? [blocker.grid[0], 1, blocker.grid[1]],
      active: blocker.active,
      passable: blocker.passable,
      rayPassable: blocker.rayPassable,
      lightCell: blocker.lightCell,
      lightPassOnBlockItself: blocker.lightPassOnBlockItself,
      innerLightSides: blocker.innerLightSides,
      innerLightPassThroughSides: blocker.innerLightPassThroughSides,
      innerLightBlockedSides: blocker.innerLightBlockedSides,
      visibleSides: blocker.visibleSides,
      visibilityBlockerSides: blocker.visibilityBlockerSides
    }));
  const maxY = Math.max(
    1,
    ...options.sources.filter((source) => source.active ?? true).map((source) => sourcePosition(source)[1]),
    ...blockerSolids.map((solid) => solid.position[1])
  );
  const volume = computeStarMadeBlockLightVolume({
    size: [options.size, maxY + 2, options.size],
    sources: options.sources,
    solids: [...surfaceSolids, ...blockerSolids],
    rayCount: options.rayCount,
    rayLength: options.rayLength
  });
  const cells: StarMadeBlockLightSurfaceCell[] = [];

  for (let z = 0; z < options.size; z++) {
    for (let x = 0; x < options.size; x++) {
      const airPosition = [x, 1, z] as const;
      const volumeCell = getStarMadeBlockLightVolumeCell(volume, airPosition);
      const gather = volumeCell?.gather ?? [0, 0, 0];
      const occlusion = volumeCell?.occlusion ?? [0, 0, 0, 0, 0, 0];
      const topFaceLight = getStarMadeBlockLightFaceLight(volume, [x, 0, z], TOP);

      cells.push({
        grid: [x, z],
        airPosition,
        gather,
        occlusion,
        topFaceLight: topFaceLight ? rgbaToRgb(topFaceLight) : [0, 0, 0]
      });
    }
  }

  return {
    size: options.size,
    rayCount: volume.rayCount,
    rayLength: volume.rayLength,
    colorPerm: volume.colorPerm,
    lightScale: volume.lightScale,
    volume,
    cells
  };
}

export function computeStarMadeBlockLightVolume(options: StarMadeBlockLightVolumeOptions): StarMadeBlockLightVolume {
  const sample = createStarMadeOcclusionSample({
    rayCount: options.rayCount,
    rayLength: options.rayLength
  });
  const activeSources = options.sources.filter((source) => source.active ?? true);
  const activeSolids = [
    ...(options.solids?.filter((solid) => solid.active ?? true) ?? []),
    ...(options.blockers?.filter((blocker) => blocker.active ?? true).map((blocker): StarMadeBlockLightSolid => ({
      position: blocker.position ?? [blocker.grid[0], 1, blocker.grid[1]],
      active: blocker.active,
      passable: blocker.passable,
      rayPassable: blocker.rayPassable,
      lightCell: blocker.lightCell,
      lightPassOnBlockItself: blocker.lightPassOnBlockItself,
      innerLightSides: blocker.innerLightSides,
      innerLightPassThroughSides: blocker.innerLightPassThroughSides,
      innerLightBlockedSides: blocker.innerLightBlockedSides,
      visibleSides: blocker.visibleSides,
      visibilityBlockerSides: blocker.visibilityBlockerSides
    })) ?? [])
  ];
  const lookup = createStarMadeBlockLightVoxelLookup(activeSources, activeSolids);
  const cells: StarMadeBlockLightVolumeCell[] = [];

  for (let y = 0; y < options.size[1]; y++) {
    for (let z = 0; z < options.size[2]; z++) {
      for (let x = 0; x < options.size[0]; x++) {
        const position = [x, y, z] as const;

        if (isBlockedVoxel(position, lookup) || !hasOccupiedNeighbor(position, lookup)) {
          continue;
        }

        const gather = gatherLightForAirBlock(position, options.size, lookup, sample);

        cells.push({
          position,
          gather: [gather.red, gather.green, gather.blue],
          lightDirection: gather.lightDirection,
          occlusion: gather.occlusion,
          sideLights: starMadeElementDirections.map((_, side) => [
            gather.red,
            gather.green,
            gather.blue,
            gather.occlusion[side]
          ] as const),
          sideLightDirections: starMadeElementDirections.map(() => gather.lightDirection)
        });
      }
    }
  }

  return {
    size: options.size,
    rayCount: sample.rays.length,
    // Positive rayCount and rayLength guarantee a first ray and depth.
    rayLength: sample.rays[0].depths.length,
    colorPerm: STARMADE_OCCLUSION_COLOR_PERM,
    lightScale: STARMADE_OCCLUSION_LIGHT_SCALE,
    sources: activeSources,
    solids: activeSolids,
    cells
  };
}

export function getStarMadeBlockLightVolumeCell(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3
): StarMadeBlockLightVolumeCell | undefined {
  let cellMap = volumeCellMapCache.get(volume);

  if (!cellMap) {
    cellMap = new Map(volume.cells.map((cell) => [positionKey3(cell.position), cell]));
    volumeCellMapCache.set(volume, cellMap);
  }

  return cellMap.get(positionKey3(position));
}

/**
 * Tests the exit boundary of a gather cell before exporting its light.
 * @param volume - Immutable sampled light volume.
 * @param position - Gather-cell grid coordinates.
 * @param exitSide - Direction from that cell toward the receiving face.
 * @returns Whether the solid geometry closes that boundary.
 * @remarks A LOD may need internal samples for its own material without being an
 * open conduit to its neighbors. Slabs/wedges only close their full boundary
 * faces. Explicit ray-passable materials (glass, sprites and native luminous LOD
 * exceptions) retain their transmission policy. No new full-cube proxy is added.
 */
function isGatherExitBlocked(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3,
  exitSide: number
): boolean {
  const solid = solidAtInVolume(volume, position);
  if (!solid || solid.passable || solid.rayPassable) return false;
  if (solid.visibilityBlockerSides) return solid.visibilityBlockerSides.includes(exitSide);
  return !solid.lightPassOnBlockItself;
}

export function getStarMadeBlockLightFaceLight(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3,
  faceSide: number
): StarMadeRgba | null {
  const faceDirection = starMadeElementDirections[faceSide];

  if (!hasVolumeOccupant(volume, position)) {
    return null;
  }

  if (!faceDirection) {
    return null;
  }

  const airPosition = [
    position[0] + faceDirection[0],
    position[1] + faceDirection[1],
    position[2] + faceDirection[2]
  ] as const;
  const airToBlockSide = oppositeSide[faceSide];
  const airCell = getStarMadeBlockLightVolumeCell(volume, airPosition);

  if (!airCell) {
    return null;
  }

  if (isGatherExitBlocked(volume, airPosition, airToBlockSide)) return [0, 0, 0, 0];

  // Occlusion.setLightFromAirBlock clamps gather before CenterVertex averaging.
  // Clamping the average instead lets one saturated cell bleach its neighbors.
  return [
    Math.min(1, airCell.gather[0]),
    Math.min(1, airCell.gather[1]),
    Math.min(1, airCell.gather[2]),
    airCell.occlusion[airToBlockSide] ?? 0
  ];
}

export function getStarMadeBlockLightFaceLightDirection(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3,
  faceSide: number
): StarMadeVec3 | null {
  const faceDirection = starMadeElementDirections[faceSide];

  if (!hasVolumeOccupant(volume, position) || !faceDirection) {
    return null;
  }

  const airPosition = [
    position[0] + faceDirection[0],
    position[1] + faceDirection[1],
    position[2] + faceDirection[2]
  ] as const;
  const airCell = getStarMadeBlockLightVolumeCell(volume, airPosition);

  if (airCell && isGatherExitBlocked(volume, airPosition, oppositeSide[faceSide])) return [0, 0, 0];
  return airCell?.lightDirection ?? null;
}

export function getStarMadeBlockLightFaceVertexLights(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3,
  faceSide: number
): readonly (StarMadeRgba | null)[] {
  return cubeFaceVertexOffsets(faceSide).map((offset) => {
    const vertex = [
      position[0] * 2 + offset[0],
      position[1] * 2 + offset[1],
      position[2] * 2 + offset[2]
    ] as const;

    return getStarMadeBlockLightFaceVertexLight(volume, vertex, faceSide);
  });
}

export function getStarMadeBlockLightVertexLight(
  volume: StarMadeBlockLightVolume,
  vertex: StarMadeGridPoint3
): StarMadeRgba | null {
  const sum = [0, 0, 0, 0];
  let count = 0;

  for (let side = 0; side < starMadeElementDirections.length; side++) {
    for (const position of blockPositionsForFaceVertex(vertex, side)) {
      const solid = solidAtInVolume(volume, position);

      if (
        !solid ||
        !(solid.active ?? true) ||
        (solid.passable ?? false) ||
        !isSolidFaceVisible(solid, side)
      ) {
        continue;
      }

      const light = getStarMadeBlockLightFaceLight(volume, solid.position, side);

      if (!light) {
        continue;
      }

      sum[0] += light[0];
      sum[1] += light[1];
      sum[2] += light[2];
      sum[3] += light[3];
      count++;
    }
  }

  if (count === 0) {
    return null;
  }

  return [sum[0] / count, sum[1] / count, sum[2] / count, sum[3] / count];
}

export function getStarMadeBlockLightFaceVertexLight(
  volume: StarMadeBlockLightVolume,
  vertex: StarMadeGridPoint3,
  faceSide: number
): StarMadeRgba | null {
  // A vertex is shared by all block faces that contain it.
  // We average the face light of every solid block whose face on
  // contains this vertex. The face light is sampled from the air cell adjacent
  // to that block on the given side (same as getStarMadeBlockLightFaceLight).
  const sum = [0, 0, 0, 0];
  let count = 0;

  for (const position of blockPositionsForFaceVertex(vertex, faceSide)) {
    const solid = solidAtInVolume(volume, position);

    if (
      !solid ||
      !(solid.active ?? true) ||
      (solid.passable ?? false) ||
      !isSolidFaceVisible(solid, faceSide)
    ) {
      continue;
    }

    // getStarMadeBlockLightFaceLight reads the air cell adjacent to solid on faceSide
    const light = getStarMadeBlockLightFaceLight(volume, solid.position, faceSide);

    if (!light) {
      // Native setLightFromAirBlock only transfers through adjacent faces.
      // Rounding a corner to diagonal air bypasses the face's occluders.
      continue;
    }

    sum[0] += light[0];
    sum[1] += light[1];
    sum[2] += light[2];
    sum[3] += light[3];
    count++;
  }

  if (count === 0) {
    return null;
  }

  return [sum[0] / count, sum[1] / count, sum[2] / count, sum[3] / count];
}

export function getStarMadeBlockLightShapeFaceVertexLight(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3,
  vertex: StarMadeGridPoint3,
  face: number | StarMadeBlockLightShapeFace
): StarMadeRgba | null {
  const sum = [0, 0, 0, 0];
  let count = 0;
  const self = solidAtInVolume(volume, position);
  const currentFace = typeof face === "number"
    ? solidShapeFaceForSide(self, face) ?? defaultShapeFace(face)
    : face;
  const relativeVertex = [
    vertex[0] - position[0] * 2,
    vertex[1] - position[1] * 2,
    vertex[2] - position[2] * 2
  ] as const;
  const axisNormalSide = axisSideForNormal(currentFace.normal);
  const blockedSides: number[] = [];

  const addLight = (light: StarMadeRgba | null): void => {
    if (light) {
      sum[0] += light[0];
      sum[1] += light[1];
      sum[2] += light[2];
      sum[3] += light[3];
    }

    count++;
  };

  for (const offset of overlappingOffsetsForVertex(relativeVertex)) {
    if (offset[0] === 0 && offset[1] === 0 && offset[2] === 0) {
      continue;
    }

    if (axisNormalSide !== null && relevantCoordForSide(currentFace.sourceSide, offset) !== 0) {
      continue;
    }

    const other = activeSolidAtInVolume(volume, [
      position[0] + offset[0],
      position[1] + offset[1],
      position[2] + offset[2]
    ]);

    if (!other) {
      continue;
    }

    const otherFace = solidShapeFaceForNormal(other, currentFace.normal);

    if (!otherFace) {
      continue;
    }

    // Native SideProcessor iterates the original triangle's three corners.
    // The renderer repeats a corner to store every face as a four-vertex quad;
    // that storage duplicate must not give this neighbor twice the light weight.
    const visitedVertices = new Set<string>();
    for (const otherVertex of otherFace.vertices) {
      const vertexKey = positionKey3(otherVertex);
      if (visitedVertices.has(vertexKey)) continue;
      visitedVertices.add(vertexKey);
      const relativeOtherVertex = [
        offset[0] * 2 + otherVertex[0],
        offset[1] * 2 + otherVertex[1],
        offset[2] * 2 + otherVertex[2]
      ] as const;

      if (!processorVerticesOverlap(currentFace.sourceSide, relativeVertex, relativeOtherVertex)) {
        continue;
      }

      const otherLightSide = axisNormalSide === null ? otherFace.lightSide : currentFace.sourceSide;
      const shareAllowed = axisNormalSide === null || isShapeVertexShareAllowed(
        volume,
        position,
        offset,
        starMadeElementDirections[axisNormalSide],
        blockedSides
      );

      if (shareAllowed) {
        addLight(shapeFaceLight(volume, other, otherFace, otherLightSide));
      } else {
        addLight(null);
      }
    }
  }

  if (
    self &&
    (self.active ?? true) &&
    !(self.passable ?? false) &&
    isSolidFaceVisible(self, currentFace.lightSide)
  ) {
    addLight(shapeFaceLight(volume, self, currentFace, currentFace.lightSide));
  }

  if (count === 0) {
    return null;
  }

  return [sum[0] / count, sum[1] / count, sum[2] / count, sum[3] / count];
}

function shapeFaceLight(
  volume: StarMadeBlockLightVolume,
  solid: StarMadeBlockLightSolid,
  face: StarMadeBlockLightShapeFace,
  side: number
): StarMadeRgba | null {
  // Unlike a full cube boundary, a recessed/partial face borders the open part
  // of its own voxel. Native gathering already computes that inner air sample;
  // using only the neighboring cell loses light behind slabs and angled faces.
  // Never reuse inner light across a complete opaque boundary.
  if (solid.lightPassOnBlockItself && face.fullAxisSide === null) {
    const inner = getStarMadeBlockLightVolumeCell(volume, solid.position);
    if (inner) {
      return [Math.min(1, inner.gather[0]), Math.min(1, inner.gather[1]),
        Math.min(1, inner.gather[2]), inner.occlusion[oppositeSide[side]] ?? 0];
    }
  }
  return getStarMadeBlockLightFaceLight(volume, solid.position, side);
}

export function createStarMadeLodSideDataFromVolume(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3
): readonly (StarMadeRgba | null)[] {
  if (!hasVolumeOccupant(volume, position)) {
    return starMadeElementDirections.map(() => null);
  }

  return starMadeElementDirections.map((direction, side) => {
    const airPosition = [
      position[0] - direction[0],
      position[1] - direction[1],
      position[2] - direction[2]
    ] as const;
    const airCell = getStarMadeBlockLightVolumeCell(volume, airPosition);

    if (!airCell) {
      return null;
    }

    if (isGatherExitBlocked(volume, airPosition, side)) return [0, 0, 0, 0];

    return normalizeLodLightData([
      airCell.gather[0],
      airCell.gather[1],
      airCell.gather[2],
      airCell.occlusion[side] ?? 0
    ]);
  });
}

export function getStarMadeBlockLightSurfaceCell(
  surface: StarMadeBlockLightSurface,
  gridX: number,
  gridZ: number
): StarMadeBlockLightSurfaceCell | undefined {
  if (gridX < 0 || gridX >= surface.size || gridZ < 0 || gridZ >= surface.size) {
    return undefined;
  }

  return surface.cells[gridZ * surface.size + gridX];
}

export function getStarMadeBlockLightSurfaceVertexLight(
  surface: StarMadeBlockLightSurface,
  gridX: number,
  gridZ: number,
  localX: number,
  localZ: number
): StarMadeRgb {
  const vertexLight = getStarMadeBlockLightFaceVertexLight(surface.volume, [
    gridX * 2 + (localX < 0 ? -1 : 1),
    1,
    gridZ * 2 + (localZ < 0 ? -1 : 1)
  ], TOP);

  if (!vertexLight) {
    return [0, 0, 0];
  }

  return [
    normalizeFinalLightChannel(vertexLight[0]),
    normalizeFinalLightChannel(vertexLight[1]),
    normalizeFinalLightChannel(vertexLight[2])
  ];
}

export function getStarMadeBlockLightSurfaceTopAverageLight(
  surface: StarMadeBlockLightSurface,
  gridX: number,
  gridZ: number
): StarMadeRgb {
  const vertexLights = getStarMadeBlockLightFaceVertexLights(surface.volume, [gridX, 0, gridZ], TOP).filter(
    (entry): entry is StarMadeRgba => entry !== null
  );

  if (vertexLights.length === 0) {
    return [0, 0, 0];
  }

  const sum = vertexLights.reduce(
    (next, light) => {
      next[0] += light[0];
      next[1] += light[1];
      next[2] += light[2];
      return next;
    },
    [0, 0, 0]
  );

  return [
    normalizeFinalLightChannel(sum[0] / vertexLights.length),
    normalizeFinalLightChannel(sum[1] / vertexLights.length),
    normalizeFinalLightChannel(sum[2] / vertexLights.length)
  ];
}

export function computeStarMadeLodBlockLight(options: {
  readonly surface: StarMadeBlockLightSurface;
  readonly grid: StarMadeGridPoint;
  readonly orientation?: number;
  readonly blockId?: number;
  readonly primarySide?: number;
}): StarMadeLodBlockLight {
  const primarySide = options.primarySide ?? starMadeLodPrimarySideForBlock(options.orientation ?? 0, options.blockId);
  const sideData = createStarMadeLodSideData(options.surface, options.grid);

  return computeStarMadeLodBlockLightFromSideData(sideData, primarySide);
}

export function computeStarMadeLodBlockLightFromVolume(options: {
  readonly volume: StarMadeBlockLightVolume;
  readonly position: StarMadeGridPoint3;
  readonly orientation?: number;
  readonly blockId?: number;
  readonly primarySide?: number;
}): StarMadeLodBlockLight {
  const primarySide = options.primarySide ?? starMadeLodPrimarySideForBlock(options.orientation ?? 0, options.blockId);
  const sideData = createStarMadeLodSideDataFromVolume(options.volume, options.position);

  return computeStarMadeLodBlockLightFromSideData(sideData, primarySide);
}

export function starMadeLodPrimarySideForBlock(orientation: number, blockId?: number): number {
  if (blockId === STARMADE_MUSHROOM_BLOCK_ID) {
    return starMadeMushroomLodPrimarySideForOrientation(orientation);
  }

  return starMadeOriencubePrimarySideForOrientation(orientation);
}

export function starMadeOriencubePrimarySideForOrientation(orientation: number): number {
  const index = positiveModulo(Math.trunc(orientation), starMadeOriencubePrimarySides.length);

  return starMadeOriencubePrimarySides[index];
}

export function starMadeMushroomLodPrimarySideForOrientation(orientation: number): number {
  return positiveModulo(Math.trunc(orientation), starMadeElementDirections.length);
}

export function computeStarMadeLodBlockLightFromSideData(
  sideData: readonly (StarMadeRgba | null)[],
  primarySide = TOP
): StarMadeLodBlockLight {
  const oppositePrimarySide = oppositeSide[primarySide] ?? BOTTOM;
  const primaryData = sideData[primarySide] ?? null;
  const lightDiffuse: StarMadeRgba[] = [];
  const lightVec: StarMadeVec3[] = [];

  for (let side = 0; side < starMadeElementDirections.length; side++) {
    if (side === primarySide || side === oppositePrimarySide) {
      continue;
    }

    const sideDirection = starMadeElementDirections[side];
    const primaryDirection = starMadeElementDirections[primarySide] ?? starMadeElementDirections[TOP];
    const diffuse: [number, number, number, number] = [0, 0, 0, 0];
    const directSideData = sideData[side] ?? null;
    let coloring = 0;

    lightVec.push([
      primaryDirection[0] + sideDirection[0],
      primaryDirection[1] + sideDirection[1],
      primaryDirection[2] + sideDirection[2]
    ]);

    if (directSideData && directSideData[0] >= 0) {
      diffuse[0] += directSideData[0];
      diffuse[1] += directSideData[1];
      diffuse[2] += directSideData[2];
      diffuse[3] += directSideData[3];
      coloring++;
    }

    if (primaryData && primaryData[0] >= 0) {
      const primaryFactor = 0.01;
      diffuse[0] += primaryData[0] * primaryFactor;
      diffuse[1] += primaryData[1] * primaryFactor;
      diffuse[2] += primaryData[2] * primaryFactor;
      diffuse[3] += primaryData[3] * primaryFactor;
      coloring += primaryFactor;
    }

    if (coloring > 0) {
      diffuse[0] /= coloring;
      diffuse[1] /= coloring;
      diffuse[2] /= coloring;
      diffuse[3] /= coloring;
    }

    lightDiffuse.push(diffuse);
  }

  return {
    primarySide,
    oppositePrimarySide,
    sideData: Array.from({ length: starMadeElementDirections.length }, (_, index) => sideData[index] ?? null),
    lightDiffuse,
    lightVec
  };
}

function createStarMadeLodSideData(
  surface: StarMadeBlockLightSurface,
  grid: StarMadeGridPoint
): readonly (StarMadeRgba | null)[] {
  return starMadeElementDirections.map((direction, side) => {
    if (direction[1] !== 0) {
      return null;
    }

    const airGridX = grid[0] - direction[0];
    const airGridZ = grid[1] - direction[2];
    const airCell = getStarMadeBlockLightSurfaceCell(surface, airGridX, airGridZ);

    if (!airCell) {
      return null;
    }

    if (isGatherExitBlocked(surface.volume, airCell.airPosition, side)) return [0, 0, 0, 0];
    return normalizeLodLightData([airCell.gather[0], airCell.gather[1], airCell.gather[2], airCell.occlusion[side] ?? 0]);
  });
}

function createStarMadeOcclusionRay(x: number, y: number, z: number, pointCount: number): StarMadeOcclusionRay {
  return {
    ...toGridRay(x, y, z, pointCount),
    sideWeights: [
      z < 0 ? -z : 0,
      z > 0 ? z : 0,
      y < 0 ? -y : 0,
      y > 0 ? y : 0,
      x < 0 ? -x : 0,
      x > 0 ? x : 0
    ]
  };
}

function positiveModulo(value: number, modulo: number): number {
  return (value % modulo + modulo) % modulo;
}

function toGridRay(dirX: number, dirY: number, dirZ: number, pointCount: number): {
  readonly points: readonly number[];
  readonly depths: readonly number[];
} {
  const scaleDirX = dirX * 0.3;
  const scaleDirY = dirY * 0.3;
  const scaleDirZ = dirZ * 0.3;
  const points: number[] = [];
  const depths: number[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;

  while (points.length < pointCount * 3) {
    const nextX = Math.round(x);
    const nextY = Math.round(y);
    const nextZ = Math.round(z);

    if (nextX !== currentX || nextY !== currentY || nextZ !== currentZ) {
      let rayX = nextX;
      let rayY = nextY;
      let rayZ = nextZ;

      while (points.length < pointCount * 3 && (rayX !== currentX || rayY !== currentY || rayZ !== currentZ)) {
        if (rayX !== currentX) {
          currentX += currentX < rayX ? 1 : -1;
        } else if (rayY !== currentY) {
          currentY += currentY < rayY ? 1 : -1;
        } else if (rayZ !== currentZ) {
          currentZ += currentZ < rayZ ? 1 : -1;
        }

        const depth = Math.sqrt(x * x + y * y + z * z);
        points.push(currentX, currentY, currentZ);
        depths.push(1 / depth);
        rayX = nextX;
        rayY = nextY;
        rayZ = nextZ;
      }
    }

    x += scaleDirX;
    y += scaleDirY;
    z += scaleDirZ;
  }

  return { points, depths };
}

function gatherLightForAirBlock(
  airPosition: StarMadeGridPoint3,
  size: StarMadeGridPoint3,
  lookup: StarMadeBlockLightVoxelLookup,
  sample: StarMadeOcclusionSample
): {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly lightDirection: StarMadeVec3;
  readonly occlusion: readonly number[];
} {
  const gather = [0, 0, 0];
  const lightDirection = [0, 0, 0];
  const occlusion = [0, 0, 0, 0, 0, 0];

  const innerLightFilter = getInnerLightFilterForCell(airPosition, lookup);

  for (const ray of sample.rays) {
    // Validated positive rayLength guarantees a first nonzero cardinal step.
    const firstRaySide = sideFromOffset(ray.points[0], ray.points[1], ray.points[2]);

    if (innerLightFilter && !isInnerLightRayAllowed(firstRaySide, innerLightFilter)) {
      continue;
    }

    let collided = false;

    for (let index = 0, depthIndex = 0; index < ray.points.length; index += 3, depthIndex++) {
      const position = [
        airPosition[0] + ray.points[index],
        airPosition[1] + ray.points[index + 1],
        airPosition[2] + ray.points[index + 2]
      ] as const;
      const source = sourceAtInLookup(lookup, position);
      const solid = solidAtInLookup(lookup, position);
      const passableInitialInnerLightStep = Boolean(
        innerLightFilter &&
        depthIndex === 0 &&
        innerLightFilter.passThroughSides.includes(firstRaySide)
      );

      if (source) {
        const factor = ray.depths[depthIndex] * 2.5 * source.color[3];
        gather[0] += source.color[0] * factor;
        gather[1] += source.color[1] * factor;
        gather[2] += source.color[2] * factor;
        lightDirection[0] += factor * ray.points[index];
        lightDirection[1] += factor * ray.points[index + 1];
        lightDirection[2] += factor * ray.points[index + 2];

        if (isRayBlockingVoxel(source) && !passableInitialInnerLightStep) {
          collided = true;
          break;
        }
      } else if (isRayBlockingVoxel(solid) && !passableInitialInnerLightStep) {
        collided = true;
        break;
      } else if (!isInsideVolume(size, position)) {
        break;
      }
    }

    if (!collided) {
      for (let side = 0; side < occlusion.length; side++) {
        occlusion[side] += ray.sideWeights[side];
      }
    }
  }

  // Occlusion.gatherAirBlock accumulates raw RGB radiance; only occlusion is
  // normalized with Sample.dataInv. A 128/rayCount gain here is not native and
  // prematurely saturates the face samples when fewer rays are requested.
  return {
    red: gather[0],
    green: gather[1],
    blue: gather[2],
    lightDirection: normalizeLightDirection(lightDirection),
    occlusion: occlusion.map((value, side) => value * sample.sideWeightInv[side])
  };
}

interface StarMadeInnerLightFilter {
  readonly openSides?: readonly number[];
  readonly passThroughSides: readonly number[];
  readonly blockedSides: readonly number[];
}

function getInnerLightFilterForCell(
  position: StarMadeGridPoint3,
  lookup: StarMadeBlockLightVoxelLookup
): StarMadeInnerLightFilter | undefined {
  const openSides: number[] = [];
  const passThroughSides: number[] = [];
  const blockedSides: number[] = [];
  let hasOpenSides = false;
  const sourceFilter = collectInnerLightFilter(openSides, passThroughSides, blockedSides, sourceAtInLookup(lookup, position));
  const solidFilter = collectInnerLightFilter(openSides, passThroughSides, blockedSides, solidAtInLookup(lookup, position));

  hasOpenSides = sourceFilter.hasOpenSides || solidFilter.hasOpenSides;

  if (!sourceFilter.hasFilter && !solidFilter.hasFilter) {
    return undefined;
  }

  return {
    openSides: hasOpenSides ? openSides : undefined,
    passThroughSides,
    blockedSides
  };
}

function collectInnerLightFilter(
  openSides: number[],
  passThroughSides: number[],
  blockedSides: number[],
  voxel:
    | {
        readonly passable?: boolean;
        readonly lightPassOnBlockItself?: boolean;
        readonly innerLightSides?: readonly number[];
        readonly innerLightPassThroughSides?: readonly number[];
        readonly innerLightBlockedSides?: readonly number[];
      }
    | undefined
): { readonly hasFilter: boolean; readonly hasOpenSides: boolean } {
  if (!voxel || !voxel.lightPassOnBlockItself || (voxel.passable ?? false)) {
    return { hasFilter: false, hasOpenSides: false };
  }

  collectValidSides(openSides, voxel.innerLightSides);
  collectValidSides(passThroughSides, voxel.innerLightPassThroughSides);
  collectValidSides(blockedSides, voxel.innerLightBlockedSides);

  return {
    hasFilter: Boolean(voxel.innerLightSides || voxel.innerLightPassThroughSides || voxel.innerLightBlockedSides),
    hasOpenSides: Boolean(voxel.innerLightSides)
  };
}

function collectValidSides(target: number[], sides: readonly number[] | undefined): void {
  if (!sides) {
    return;
  }

  for (const side of sides) {
    if (side >= 0 && side < starMadeElementDirections.length && !target.includes(side)) {
      target.push(side);
    }
  }
}

function isInnerLightRayAllowed(firstRaySide: number, filter: StarMadeInnerLightFilter): boolean {
  if (filter.blockedSides.includes(firstRaySide)) {
    return false;
  }

  return !filter.openSides || filter.openSides.includes(firstRaySide);
}

function sideFromOffset(x: number, y: number, z: number): number {
  if (z > 0) {
    return FRONT;
  }

  if (z < 0) {
    return BACK;
  }

  if (y > 0) {
    return TOP;
  }

  if (y < 0) {
    return BOTTOM;
  }

  if (x > 0) {
    return RIGHT;
  }

  // Both private callers supply a nonzero cardinal step: either the first
  // voxel of a generated ray, or an offset with Manhattan length exactly one.
  return LEFT;
}

function hasVolumeOccupant(volume: StarMadeBlockLightVolume, position: StarMadeGridPoint3): boolean {
  return Boolean(sourceAt(volume.sources, position) || solidAtInVolume(volume, position));
}

function activeSolidAtInVolume(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3
): StarMadeBlockLightSolid | undefined {
  const solid = solidAtInVolume(volume, position);

  if (!solid || !(solid.active ?? true) || (solid.passable ?? false)) {
    return undefined;
  }

  return solid;
}

function sourceAt(
  sources: readonly StarMadeBlockLightSource[],
  position: StarMadeGridPoint3
): StarMadeBlockLightSource | undefined {
  return sources.find((source) => samePosition3(sourcePosition(source), position));
}

function solidAtInVolume(
  volume: StarMadeBlockLightVolume,
  position: StarMadeGridPoint3
): StarMadeBlockLightSolid | undefined {
  let solidMap = volumeSolidMapCache.get(volume);

  if (!solidMap) {
    solidMap = new Map(volume.solids.map((solid) => [positionKey3(solid.position), solid]));
    volumeSolidMapCache.set(volume, solidMap);
  }

  return solidMap.get(positionKey3(position));
}

function isRayBlockingVoxel(voxel: { readonly passable?: boolean; readonly rayPassable?: boolean } | undefined): boolean {
  return Boolean(voxel && !(voxel.passable ?? false) && !(voxel.rayPassable ?? false));
}

function isBlockedVoxel(
  position: StarMadeGridPoint3,
  lookup: StarMadeBlockLightVoxelLookup
): boolean {
  const source = sourceAtInLookup(lookup, position);
  const solid = solidAtInLookup(lookup, position);

  return Boolean(isBlockingOwnLightCell(source) || isBlockingOwnLightCell(solid));
}

function isBlockingOwnLightCell(
  voxel: { readonly passable?: boolean; readonly lightCell?: boolean; readonly lightPassOnBlockItself?: boolean } | undefined
): boolean {
  return Boolean(voxel && !(voxel.passable ?? false) && !(voxel.lightCell ?? false) && !(voxel.lightPassOnBlockItself ?? false));
}

function hasOccupiedNeighbor(
  position: StarMadeGridPoint3,
  lookup: StarMadeBlockLightVoxelLookup
): boolean {
  return starMadeElementDirections.some((direction) => {
    const neighbor = [
      position[0] + direction[0],
      position[1] + direction[1],
      position[2] + direction[2]
    ] as const;

    return Boolean(sourceAtInLookup(lookup, neighbor) || solidAtInLookup(lookup, neighbor));
  });
}

function createStarMadeBlockLightVoxelLookup(
  sources: readonly StarMadeBlockLightSource[],
  solids: readonly StarMadeBlockLightSolid[]
): StarMadeBlockLightVoxelLookup {
  const sourceMap = new Map<string, StarMadeBlockLightSource>();
  const solidMap = new Map<string, StarMadeBlockLightSolid>();

  for (const source of sources) {
    const key = positionKey3(sourcePosition(source));
    if (!sourceMap.has(key)) {
      sourceMap.set(key, source);
    }
  }

  for (const solid of solids) {
    const key = positionKey3(solid.position);
    if (!solidMap.has(key)) {
      solidMap.set(key, solid);
    }
  }

  return { sources: sourceMap, solids: solidMap };
}

function sourceAtInLookup(
  lookup: StarMadeBlockLightVoxelLookup,
  position: StarMadeGridPoint3
): StarMadeBlockLightSource | undefined {
  return lookup.sources.get(positionKey3(position));
}

function solidAtInLookup(
  lookup: StarMadeBlockLightVoxelLookup,
  position: StarMadeGridPoint3
): StarMadeBlockLightSolid | undefined {
  return lookup.solids.get(positionKey3(position));
}

function isInsideVolume(size: StarMadeGridPoint3, position: StarMadeGridPoint3): boolean {
  return (
    position[0] >= 0 &&
    position[0] < size[0] &&
    position[1] >= 0 &&
    position[1] < size[1] &&
    position[2] >= 0 &&
    position[2] < size[2]
  );
}

function sourcePosition(source: StarMadeBlockLightSource): StarMadeGridPoint3 {
  return source.position ?? [source.grid[0], 1, source.grid[1]];
}

function samePosition3(a: StarMadeGridPoint3, b: StarMadeGridPoint3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function positionKey3(position: StarMadeGridPoint3): string {
  return `${position[0]},${position[1]},${position[2]}`;
}

function normalizeLightDirection(direction: readonly number[]): StarMadeVec3 {
  const length = Math.hypot(direction[0], direction[1], direction[2]);

  if (length <= 0) {
    return [0, 0, 0];
  }

  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function rgbaToRgb(color: StarMadeRgba): StarMadeRgb {
  return [color[0], color[1], color[2]];
}

function solidShapeFaceForSide(
  solid: StarMadeBlockLightSolid | undefined,
  side: number
): StarMadeBlockLightShapeFace | undefined {
  return solidShapeFaces(solid).find((face) => face.sourceSide === side && face.surface);
}

function solidShapeFaceForNormal(
  solid: StarMadeBlockLightSolid,
  normal: StarMadeVec3
): StarMadeBlockLightShapeFace | undefined {
  return solidShapeFaces(solid).find((face) =>
    face.surface && isSolidFaceVisible(solid, face.lightSide) && sameShapeNormal(face.normal, normal)
  );
}

function solidShapeFaces(solid: StarMadeBlockLightSolid | undefined): readonly StarMadeBlockLightShapeFace[] {
  if (solid?.shapeFaces?.length) {
    return solid.shapeFaces;
  }

  return defaultShapeFaces;
}

const defaultShapeFaces = starMadeElementDirections.map((normal, side): StarMadeBlockLightShapeFace => ({
  sourceSide: side,
  lightSide: side,
  drawBucket: side,
  normal,
  vertices: cubeFaceVertexOffsets(side),
  surface: true,
  fullAxisSide: side
}));

function defaultShapeFace(side: number): StarMadeBlockLightShapeFace {
  return defaultShapeFaces[side] ?? defaultShapeFaces[FRONT];
}

function overlappingOffsetsForVertex(vertex: StarMadeGridPoint3): readonly StarMadeGridPoint3[] {
  const x = Math.sign(vertex[0]);
  const y = Math.sign(vertex[1]);
  const z = Math.sign(vertex[2]);

  const offsets: StarMadeGridPoint3[] = [
    [x, 0, 0],
    [0, 0, z],
    [0, y, 0],
    [0, y, z],
    [x, y, 0],
    [x, 0, z],
    [x, y, z]
  ];
  // Half-height slab corners can have zero components. The seven cube-corner
  // candidates then alias the same neighbor; each neighbor contributes once.
  const seen = new Set<string>();
  return offsets.filter(offset => {
    const key = positionKey3(offset);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function relevantCoordForSide(side: number, offset: StarMadeGridPoint3): number {
  if (side === FRONT || side === BACK || side === 6) {
    return offset[2];
  }

  if (side === TOP || side === BOTTOM) {
    return offset[1];
  }

  return offset[0];
}

function processorVerticesOverlap(
  side: number,
  current: StarMadeGridPoint3,
  other: StarMadeGridPoint3
): boolean {
  if (side === FRONT || side === BACK) {
    return other[0] === current[0] && other[1] === current[1];
  }

  if (side === TOP || side === BOTTOM) {
    return other[0] === current[0] && other[2] === current[2];
  }

  if (side === RIGHT || side === LEFT) {
    return other[1] === current[1] && other[2] === current[2];
  }

  return other[0] === current[0] && other[1] === current[1] && other[2] === current[2];
}

function isShapeVertexShareAllowed(
  volume: StarMadeBlockLightVolume,
  center: StarMadeGridPoint3,
  otherOffset: StarMadeGridPoint3,
  sideDirection: StarMadeVec3,
  blockedSides: number[]
): boolean {
  // Port of SideProcessor.checkCloseBlock: a slab immediately in front of
  // the shaded face can block sharing across its closed edge, independently
  // of the solid above the neighboring face checked below. Slab traits carry
  // their closed side in innerLightBlockedSides; ordinary cubes do not.
  const close = activeSolidAtInVolume(volume, [
    center[0] + sideDirection[0],
    center[1] + sideDirection[1],
    center[2] + sideDirection[2]
  ]);
  if (close?.innerLightBlockedSides) {
    for (const side of fullAxisSidesForSolid(close)) {
      const direction = starMadeElementDirections[side];
      if ((direction[0] !== 0 && direction[0] === otherOffset[0]) ||
          (direction[1] !== 0 && direction[1] === otherOffset[1]) ||
          (direction[2] !== 0 && direction[2] === otherOffset[2])) return false;
    }
  }
  const remote = activeSolidAtInVolume(volume, [
    center[0] + otherOffset[0] + sideDirection[0],
    center[1] + otherOffset[1] + sideDirection[1],
    center[2] + otherOffset[2] + sideDirection[2]
  ]);
  const sidesToCheck = fullAxisSidesForSolid(remote);

  if (sidesToCheck.length === 0) {
    return true;
  }

  if (Math.abs(otherOffset[0]) + Math.abs(otherOffset[1]) + Math.abs(otherOffset[2]) === 1) {
    const direction = sideFromOffset(otherOffset[0], otherOffset[1], otherOffset[2]);

    if (sidesToCheck.includes(oppositeSide[direction])) {
      blockedSides.push(direction);
      return false;
    }

    return true;
  }

  return !blockedSides.some((direction) => sidesToCheck.includes(oppositeSide[direction]));
}

function fullAxisSidesForSolid(solid: StarMadeBlockLightSolid | undefined): readonly number[] {
  if (!solid) {
    return [];
  }

  if (solid.visibilityBlockerSides) {
    return solid.visibilityBlockerSides;
  }

  return fullAxisSidesForShapeFaces(solidShapeFaces(solid));
}

function fullAxisSidesForShapeFaces(faces: readonly StarMadeBlockLightShapeFace[]): readonly number[] {
  const sides: number[] = [];

  for (const face of faces) {
    if (face.fullAxisSide !== null && !sides.includes(face.fullAxisSide)) {
      sides.push(face.fullAxisSide);
    }
  }

  return sides;
}

function isStarMadeSolidBlockStyle(blockStyle: number): boolean {
  return blockStyle === 1 || blockStyle === 2 || blockStyle === 4 || blockStyle === 5;
}

function starMadeSwitchLeftRightSide(side: number): number {
  if (side === LEFT) {
    return RIGHT;
  }

  if (side === RIGHT) {
    return LEFT;
  }

  return side;
}

function axisSideForNormal(normal: readonly [number, number, number]): number | null {
  for (let side = 0; side < starMadeElementDirections.length; side++) {
    const direction = starMadeElementDirections[side];

    if (sameShapeNormal(normal, direction)) {
      return side;
    }
  }

  return null;
}

function sameShapeNormal(a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  return (
    Math.abs(a[0] - b[0]) < 0.0001 &&
    Math.abs(a[1] - b[1]) < 0.0001 &&
    Math.abs(a[2] - b[2]) < 0.0001
  );
}

function cubeFaceVertexOffsets(faceSide: number): readonly StarMadeGridPoint3[] {
  if (faceSide === FRONT) {
    return [[1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1]];
  }

  if (faceSide === BACK) {
    return [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]];
  }

  if (faceSide === TOP) {
    return [[1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, 1, 1]];
  }

  if (faceSide === BOTTOM) {
    return [[1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]];
  }

  if (faceSide === RIGHT) {
    return [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]];
  }

  return [[-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, -1, 1]];
}

function isSolidFaceVisible(solid: StarMadeBlockLightSolid, faceSide: number): boolean {
  return !solid.visibleSides || solid.visibleSides.includes(faceSide);
}

function blockPositionsForFaceVertex(
  vertex: StarMadeGridPoint3,
  faceSide: number
): readonly StarMadeGridPoint3[] {
  const direction = starMadeElementDirections[faceSide];

  if (!direction) {
    return [];
  }

  const axisCandidates: number[][] = [[], [], []];

  for (let axis = 0; axis < 3; axis++) {
    if (direction[axis] !== 0) {
      const fixedCoord = blockCoordinateFromFaceVertex(vertex[axis], direction[axis]);

      if (fixedCoord === null) {
        return [];
      }

      axisCandidates[axis].push(fixedCoord);
      continue;
    }

    for (const offset of [-1, 1]) {
      const coord = blockCoordinateFromFaceVertex(vertex[axis], offset);

      if (coord !== null && !axisCandidates[axis].includes(coord)) {
        axisCandidates[axis].push(coord);
      }
    }

    if (axisCandidates[axis].length === 0) {
      return [];
    }
  }

  const positions: StarMadeGridPoint3[] = [];

  for (const x of axisCandidates[0]) {
    for (const y of axisCandidates[1]) {
      for (const z of axisCandidates[2]) {
        positions.push([x, y, z]);
      }
    }
  }

  return positions;
}

function blockCoordinateFromFaceVertex(vertexCoordinate: number, faceOffset: number): number | null {
  const coord = (vertexCoordinate - faceOffset) / 2;

  return Number.isInteger(coord) ? coord : null;
}

export function normalizeFinalLightChannel(value: number): number {
  const scaled = Math.max(0, value * STARMADE_OCCLUSION_LIGHT_SCALE);

  return Math.round(Math.min(1, scaled) * STARMADE_OCCLUSION_COLOR_PERM);
}

function normalizeLodLightData(value: StarMadeRgba): StarMadeRgba {
  // LOD shader (lodcube.frag.glsl) receives lightDiffuse[i] and amplifies:
  //   lig_i = vec4(diffuse.rgb, min(1.0, diffuse.w * extraLight))  // extraLight = 8.0
  //   totOcc = sum(lig_i.w) * 0.36
  //   lightedColor *= 0.2  (normalize 5 contributions)
  //
  return [
    Math.min(1, Math.max(0, value[0])),
    Math.min(1, Math.max(0, value[1])),
    Math.min(1, Math.max(0, value[2])),
    value[3]
  ];
}

/**
 * Applies a sun occlusion floor to the first lightDiffuse slot of a LOD block-light result.
 * Mirrors StarMade-Open's minimum sun contribution on the primary side.
 * @param lighting result from computeStarMadeLodBlockLightFromSideData
 * @param floor minimum value for lightDiffuse[0].w (default 0.72)
 */
export function withStarMadeLodSunOcclusionFloor(
  lighting: StarMadeLodBlockLight,
  floor = 0.72
): StarMadeLodBlockLight {
  const lightDiffuse = lighting.lightDiffuse.map((entry, index): StarMadeRgba => {
    if (index !== 0) {
      return entry;
    }
    return [entry[0], entry[1], entry[2], Math.max(entry[3], floor)];
  });
  return { ...lighting, lightDiffuse };
}

/**
 * Scales the rgb channels of each lightDiffuse entry (not .w) by a boost factor, clamped to 1.
 * Used to compensate for block-light falloff in the volume.
 */
export function withStarMadeLodBlockLightBoost(
  lighting: StarMadeLodBlockLight,
  boost: number
): StarMadeLodBlockLight {
  const lightDiffuse = lighting.lightDiffuse.map((entry): StarMadeRgba => [
    Math.min(1, entry[0] * boost),
    Math.min(1, entry[1] * boost),
    Math.min(1, entry[2] * boost),
    entry[3]
  ]);
  const sideData = lighting.sideData.map((entry) => {
    if (!entry) {
      return null;
    }
    return [
      Math.min(1, entry[0] * boost),
      Math.min(1, entry[1] * boost),
      Math.min(1, entry[2] * boost),
      entry[3]
    ] as StarMadeRgba;
  });
  return { ...lighting, lightDiffuse, sideData };
}
