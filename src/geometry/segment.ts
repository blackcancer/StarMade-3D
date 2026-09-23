import type { BufferGeometry } from "three";
import {
  appendStarMadeEncodedCubeGeometryData,
  createStarMadeEncodedGeometryBuffers,
  createStarMadeEncodedGeometryFromBuffers,
  createStarMadeEncodedCubeShapeFaces
} from "./starmadeEncodedCube.js";
import type { StarMadeCubeAtlasLayout } from "../starmade/atlas.js";
import {
  starMadeHitPointsCodeFromByteHp,
  starMadeResourceOverlay,
  type BlockDefinition
} from "../starmade/blockConfig.js";
import {
  isAirSegmentBlock,
  segmentBlockIndex,
  segmentBlockPosition,
  segmentKey,
  STARMADE_SEGMENT_BLOCK_COUNT,
  STARMADE_SEGMENT_DIM,
  type SegmentBlockDataLike,
  type SegmentDataLike
} from "../starmade/segmentData.js";

export type SegmentBlockDefinitionSource =
  | readonly BlockDefinition[]
  | ReadonlyMap<number, BlockDefinition>
  | ((blockType: number) => BlockDefinition | undefined);

export type SegmentNeighborSource =
  | readonly SegmentDataLike[]
  | ReadonlyMap<string, SegmentDataLike>
  | ((x: number, y: number, z: number) => SegmentDataLike | undefined);

export interface SegmentBlockContext {
  readonly segment: SegmentDataLike;
  readonly block: SegmentBlockDataLike;
  readonly blockDefinition: BlockDefinition | undefined;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SegmentFaceContext extends SegmentBlockContext {
  readonly side: number;
  readonly neighborBlock: SegmentBlockDataLike | undefined;
  readonly neighborBlockDefinition: BlockDefinition | undefined;
}

export interface StarMadeEncodedSegmentGeometryOptions {
  readonly segment: SegmentDataLike;
  readonly blockDefinitions?: SegmentBlockDefinitionSource;
  readonly neighborSegments?: SegmentNeighborSource;
  readonly starMadeAtlasLayout?: StarMadeCubeAtlasLayout;
  readonly pass?: StarMadeSegmentGeometryPass;
  readonly light?: readonly [number, number, number] | ((context: SegmentBlockContext) => readonly [number, number, number]);
  readonly occlusion?: number | ((context: SegmentBlockContext) => number);
  readonly overlay?: number | ((context: SegmentBlockContext) => number);
  readonly isBlockMeshed?: (context: SegmentBlockContext) => boolean;
  readonly isFaceVisible?: (context: SegmentFaceContext) => boolean;
}

export type StarMadeSegmentGeometryPass = "all" | "opaque" | "blended";

export interface StarMadeEncodedSegmentGeometryBatches {
  readonly opaque: BufferGeometry;
  readonly blended: BufferGeometry;
  readonly opaqueBlockCount: number;
  readonly blendedBlockCount: number;
  readonly totalMeshedBlockCount: number;
  /** Fully-culled blocks (all faces hidden by neighbors). P6 diagnostic. */
  readonly culledBlockCount: number;
  /** LOD-model blocks excluded from cube geometry (lodShapeStyle != 1). P6 diagnostic. */
  readonly lodHiddenBlockCount: number;
}

const faceOffsets = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0]
] as const;

const defaultSegmentLight = [0, 0, 0] as const;
const FRONT = 0;
const BACK = 1;
const TOP = 2;
const BOTTOM = 3;
const RIGHT = 4;
const LEFT = 5;
const STARMADE_CARGO_SPACE_BLOCK_ID = 689;
const STARMADE_CARGO_BUILDMODE_BLOCK_ID = 390;
const JAVA_RANDOM_MULTIPLIER = 0x5DEECE66Dn;
const JAVA_RANDOM_ADDEND = 0xBn;
const JAVA_RANDOM_MASK = (1n << 48n) - 1n;
const oppositeSide = [BACK, FRONT, BOTTOM, TOP, LEFT, RIGHT] as const;
const visibilityBlockerSidesCache = new WeakMap<BlockDefinition, Map<number, readonly number[]>>();

export function createStarMadeEncodedSegmentGeometry(
  options: StarMadeEncodedSegmentGeometryOptions
): BufferGeometry {
  const target: SegmentGeometryBuildTarget = {
    pass: options.pass ?? "all",
    buffers: createStarMadeEncodedGeometryBuffers(),
    blockCount: 0
  };

  appendStarMadeEncodedSegmentGeometryToTargets(options, [target]);

  return createStarMadeEncodedGeometryFromBuffers(target.buffers);
}

export function createStarMadeEncodedSegmentGeometryBatches(
  options: Omit<StarMadeEncodedSegmentGeometryOptions, "pass">
): StarMadeEncodedSegmentGeometryBatches {
  const opaque: SegmentGeometryBuildTarget = {
    pass: "opaque",
    buffers: createStarMadeEncodedGeometryBuffers(),
    blockCount: 0
  };
  const blended: SegmentGeometryBuildTarget = {
    pass: "blended",
    buffers: createStarMadeEncodedGeometryBuffers(),
    blockCount: 0
  };

  const _stats = appendStarMadeEncodedSegmentGeometryToTargets(options, [opaque, blended]);

  return {
    opaque: createStarMadeEncodedGeometryFromBuffers(opaque.buffers),
    blended: createStarMadeEncodedGeometryFromBuffers(blended.buffers),
    opaqueBlockCount: opaque.blockCount,
    blendedBlockCount: blended.blockCount,
    totalMeshedBlockCount: opaque.blockCount + blended.blockCount,
    culledBlockCount: _stats.culledBlockCount,
    lodHiddenBlockCount: _stats.lodHiddenBlockCount
  };
}

export function starMadeSegmentGeometryPassForBlock(
  blockDefinition: BlockDefinition | undefined,
  block: SegmentBlockDataLike | undefined
): Exclude<StarMadeSegmentGeometryPass, "all"> {
  return isStarMadeSegmentBlockBlended(blockDefinition, block) ? "blended" : "opaque";
}

export function isStarMadeSegmentBlockBlended(
  blockDefinition: BlockDefinition | undefined,
  block: SegmentBlockDataLike | undefined
): boolean {
  if (!blockDefinition || isAirSegmentBlock(block)) {
    return false;
  }

  return blockDefinition.transparent
    || isStarMadeBlendBlockStyle(blockDefinition)
    || isStarMadeBlendedSpecialBlock(blockDefinition, block);
}

interface SegmentGeometryBuildTarget {
  readonly pass: StarMadeSegmentGeometryPass;
  readonly buffers: ReturnType<typeof createStarMadeEncodedGeometryBuffers>;
  blockCount: number;
}

function appendStarMadeEncodedSegmentGeometryToTargets(
  options: Omit<StarMadeEncodedSegmentGeometryOptions, "pass"> & { readonly pass?: StarMadeSegmentGeometryPass },
  targets: readonly SegmentGeometryBuildTarget[]
): { readonly culledBlockCount: number; readonly lodHiddenBlockCount: number } {
  const segment = options.segment;

  if (segment.blockCount === 0) {
    return { culledBlockCount: 0, lodHiddenBlockCount: 0 };
  }

  const resolveBlockDefinition = createBlockDefinitionResolver(options.blockDefinitions);
  const resolveSegment = createSegmentResolver(segment, options.neighborSegments);
  const maxBlocks = Math.min(segment.blocks.length, STARMADE_SEGMENT_BLOCK_COUNT);
  const chunkPosition = encodeSegmentPosition(segment);
  let culledBlockCount = 0;
  let lodHiddenBlockCount = 0;

  for (let index = 0; index < maxBlocks; index++) {
    const block = segment.blocks[index];

    if (isAirSegmentBlock(block)) {
      continue;
    }

    const position = segmentBlockPosition(index);
    const blockDefinition = resolveBlockDefinition(block.type);
    if (blockDefinition && blockDefinition.lodShape.length > 0 && blockDefinition.lodShapeStyle !== 1) {
      lodHiddenBlockCount++;
    }
    const context: SegmentBlockContext = {
      segment,
      block,
      blockDefinition,
      index,
      x: position.x,
      y: position.y,
      z: position.z
    };

    if (options.isBlockMeshed?.(context) === false) {
      continue;
    }

    const visibleSides = visibleSidesForBlock(options, context, resolveBlockDefinition, resolveSegment);

    if (!visibleSides.some(Boolean)) {
      culledBlockCount++;
      continue;
    }

    const renderPlan = createStarMadeSegmentRenderPlan(blockDefinition, block, index, segment, resolveBlockDefinition);
    const pass = starMadeSegmentGeometryPassForBlock(renderPlan.blockDefinition, block);

    for (const target of targets) {
      if (target.pass !== "all" && target.pass !== pass) {
        continue;
      }

      appendStarMadeEncodedCubeGeometryData(target.buffers, {
        starMadeAtlasLayout: options.starMadeAtlasLayout,
        block: renderPlan.blockDefinition,
        cubePosition: [position.x, position.y, position.z],
        chunkPosition,
        light: resolveBlockValue(options.light, context, defaultSegmentLight),
        occlusion: resolveBlockValue(options.occlusion, context, 31),
        overlay: resolveBlockValue(options.overlay, context, starMadeResourceOverlay(blockDefinition, block.orientation)),
        orientation: renderPlan.orientation,
        slab: renderPlan.slab,
        onlyInBuildMode: renderPlan.onlyInBuildMode,
        textureTypeOffset: renderPlan.textureTypeOffset,
        active: block.active,
        hitPoints: starMadeHitPointsCodeFromByteHp(block.hp),
        visibleSides
      });
      target.blockCount++;
    }
  }

  return { culledBlockCount, lodHiddenBlockCount };
}

interface StarMadeSegmentRenderPlan {
  readonly blockDefinition: BlockDefinition | undefined;
  readonly orientation: number;
  readonly slab?: number;
  readonly onlyInBuildMode?: boolean;
  readonly textureTypeOffset?: readonly number[];
}

function createStarMadeSegmentRenderPlan(
  blockDefinition: BlockDefinition | undefined,
  block: SegmentBlockDataLike,
  dataIndex: number,
  segment: SegmentDataLike,
  resolveBlockDefinition: (blockType: number) => BlockDefinition | undefined
): StarMadeSegmentRenderPlan {
  let renderBlockDefinition = blockDefinition;
  let orientation = normalizeOrientation(block.orientation);
  let slab: number | undefined;
  let onlyInBuildMode: boolean | undefined;
  let textureTypeOffset: readonly number[] | undefined;

  if (blockDefinition?.id === STARMADE_CARGO_SPACE_BLOCK_ID) {
    if (orientation === 4) {
      renderBlockDefinition = resolveBlockDefinition(STARMADE_CARGO_BUILDMODE_BLOCK_ID) ?? blockDefinition;
      orientation = TOP;
      onlyInBuildMode = true;
    } else {
      const cargoSlab = clampInteger(orientation, 0, 3);
      slab = cargoSlab;
      const randomOffset = starMadeCargoTextureRandomOffset(segment, dataIndex);
      textureTypeOffset = faceOffsets.map((_, side) =>
        (side === TOP || side === BOTTOM ? 0 : cargoSlab) + randomOffset
      );
      orientation = TOP;
    }
  }

  if (renderBlockDefinition?.resourceInjection !== undefined && renderBlockDefinition.resourceInjection !== "off") {
    orientation = 0;
  }

  return {
    blockDefinition: renderBlockDefinition,
    orientation,
    slab,
    onlyInBuildMode,
    textureTypeOffset
  };
}

function visibleSidesForBlock(
  options: StarMadeEncodedSegmentGeometryOptions,
  context: SegmentBlockContext,
  resolveBlockDefinition: (blockType: number) => BlockDefinition | undefined,
  resolveSegment: (x: number, y: number, z: number) => SegmentDataLike | undefined
): readonly boolean[] {
  const sourceVisibleSides = sourceVisibleSidesForBlock(context.blockDefinition, context.block.orientation);

  return faceOffsets.map((_, side) => {
    if (!sourceVisibleSides[side]) {
      return false;
    }

    const neighborBlock = adjacentBlock(context.segment, context.x, context.y, context.z, side, resolveSegment);
    const neighborBlockDefinition = isAirSegmentBlock(neighborBlock)
      ? undefined
      : resolveBlockDefinition(neighborBlock!.type);
    const faceContext: SegmentFaceContext = {
      ...context,
      side,
      neighborBlock,
      neighborBlockDefinition
    };

    return options.isFaceVisible?.(faceContext) ?? defaultFaceVisible(faceContext);
  });
}

function sourceVisibleSidesForBlock(
  blockDefinition: BlockDefinition | undefined,
  orientation: number
): readonly boolean[] {
  if (blockDefinition?.blockStyle !== 3) {
    return [true, true, true, true, true, true];
  }

  const visibleSides = [true, true, true, true, true, true];
  const normalizedOrientation = modulo(Math.trunc(orientation), 6);

  if (normalizedOrientation === 2 || normalizedOrientation === 3) {
    visibleSides[2] = false;
    visibleSides[3] = false;
  } else if (normalizedOrientation === 0 || normalizedOrientation === 1) {
    visibleSides[0] = false;
    visibleSides[1] = false;
  } else {
    visibleSides[4] = false;
    visibleSides[5] = false;
  }

  return visibleSides;
}

function defaultFaceVisible(context: SegmentFaceContext): boolean {
  if (isAirSegmentBlock(context.neighborBlock)) {
    return true;
  }

  return !defaultBlockOccludes(context);
}

function defaultBlockOccludes(context: SegmentFaceContext): boolean {
  const neighborBlock = context.neighborBlock;
  const neighborDefinition = context.neighborBlockDefinition;

  if (isAirSegmentBlock(neighborBlock) || !neighborDefinition || neighborDefinition.lodShape.length > 0) {
    return false;
  }

  const ownBlended = isStarMadeSegmentBlockBlended(context.blockDefinition, context.block);
  const neighborBlended = isStarMadeSegmentBlockBlended(neighborDefinition, neighborBlock);
  const neighborOrientation = normalizeOrientation(neighborBlock!.orientation ?? 0);
  const neighborSlab = neighborDefinition.slab;

  if (neighborSlab > 0) {
    const ownOrientation = normalizeOrientation(context.block.orientation);
    const ownSlab = context.blockDefinition?.slab ?? 0;

    if (
      ownSlab >= neighborSlab &&
      ownOrientation === neighborOrientation &&
      starMadeSwitchLeftRightSide(neighborOrientation % 6) !== oppositeSide[context.side]
    ) {
      return true;
    }

    if (starMadeSwitchLeftRightSide(neighborOrientation % 6) !== context.side) {
      return false;
    }
  }

  if (
    ownBlended
    && !neighborBlended
    && isStarMadeCubeBlockStyle(context.blockDefinition!.blockStyle)
    && isStarMadeCubeBlockStyle(neighborDefinition.blockStyle)
    && context.blockDefinition!.lodShape.length === 0
    && neighborDefinition.lodShape.length === 0
  ) {
    return true;
  }

  if (ownBlended) {
    return neighborBlended;
  }

  if (neighborBlended) {
    return false;
  }

  const blockerSides = starMadeVisibilityBlockerSidesForBlock(neighborDefinition, neighborOrientation);

  if (blockerSides.length > 0) {
    return blockerSides.includes(oppositeSide[context.side]);
  }

  return isFullOpaqueCube(neighborDefinition);
}

function isFullOpaqueCube(blockDefinition: BlockDefinition | undefined): boolean {
  return blockDefinition !== undefined
    && blockDefinition.transparent !== true
    && isStarMadeCubeBlockStyle(blockDefinition.blockStyle)
    && blockDefinition.slab === 0
    && blockDefinition.lodShape.length === 0
    && blockDefinition.lodShapeStyle === 0;
}

function starMadeVisibilityBlockerSidesForBlock(
  blockDefinition: BlockDefinition,
  orientation: number
): readonly number[] {
  if (blockDefinition.slab > 0) {
    return [starMadeSlabVisibilityBlockerSide(orientation)];
  }

  // defaultBlockOccludes has already rejected every named LOD model.
  if (!isStarMadeSolidBlockStyle(blockDefinition.blockStyle)) {
    return [];
  }

  let byOrientation = visibilityBlockerSidesCache.get(blockDefinition);

  if (!byOrientation) {
    byOrientation = new Map();
    visibilityBlockerSidesCache.set(blockDefinition, byOrientation);
  }

  const normalizedOrientation = modulo(Math.trunc(orientation), 24);
  const cached = byOrientation.get(normalizedOrientation);

  if (cached) {
    return cached;
  }

  const sides: number[] = [];

  for (const face of createStarMadeEncodedCubeShapeFaces({ block: blockDefinition, orientation: normalizedOrientation })) {
    if (face.fullAxisSide !== null && !sides.includes(face.fullAxisSide)) {
      sides.push(face.fullAxisSide);
    }
  }

  byOrientation.set(normalizedOrientation, sides);
  return sides;
}

function starMadeSlabVisibilityBlockerSide(orientation: number): number {
  return starMadeSwitchLeftRightSide(oppositeSide[modulo(Math.trunc(orientation), 6)]);
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

function isStarMadeSolidBlockStyle(blockStyle: number): boolean {
  return blockStyle === 1 || blockStyle === 2 || blockStyle === 4 || blockStyle === 5;
}

function isStarMadeBlendBlockStyle(blockDefinition: BlockDefinition): boolean {
  return blockDefinition.blockStyle === 3 || (blockDefinition.lodShape.length > 0 && blockDefinition.lodShapeStyle === 1);
}

function isStarMadeBlendedSpecialBlock(
  blockDefinition: BlockDefinition,
  _block: SegmentBlockDataLike | undefined
): boolean {
  return blockDefinition.id === STARMADE_CARGO_SPACE_BLOCK_ID;
}

function isStarMadeCubeBlockStyle(blockStyle: number): boolean {
  return blockStyle === 0 || blockStyle === 6;
}

function adjacentBlock(
  segment: SegmentDataLike,
  x: number,
  y: number,
  z: number,
  side: number,
  resolveSegment: (x: number, y: number, z: number) => SegmentDataLike | undefined
): SegmentBlockDataLike | undefined {
  const offset = faceOffsets[side];
  let blockX = x + offset[0];
  let blockY = y + offset[1];
  let blockZ = z + offset[2];
  let segmentX = segment.x;
  let segmentY = segment.y;
  let segmentZ = segment.z;

  if (blockX < 0) {
    blockX += STARMADE_SEGMENT_DIM;
    segmentX -= STARMADE_SEGMENT_DIM;
  } else if (blockX >= STARMADE_SEGMENT_DIM) {
    blockX -= STARMADE_SEGMENT_DIM;
    segmentX += STARMADE_SEGMENT_DIM;
  }

  if (blockY < 0) {
    blockY += STARMADE_SEGMENT_DIM;
    segmentY -= STARMADE_SEGMENT_DIM;
  } else if (blockY >= STARMADE_SEGMENT_DIM) {
    blockY -= STARMADE_SEGMENT_DIM;
    segmentY += STARMADE_SEGMENT_DIM;
  }

  if (blockZ < 0) {
    blockZ += STARMADE_SEGMENT_DIM;
    segmentZ -= STARMADE_SEGMENT_DIM;
  } else if (blockZ >= STARMADE_SEGMENT_DIM) {
    blockZ -= STARMADE_SEGMENT_DIM;
    segmentZ += STARMADE_SEGMENT_DIM;
  }

  const neighborSegment = resolveSegment(segmentX, segmentY, segmentZ);

  return neighborSegment?.blocks[segmentBlockIndex(blockX, blockY, blockZ)];
}

function createBlockDefinitionResolver(
  source: SegmentBlockDefinitionSource | undefined
): (blockType: number) => BlockDefinition | undefined {
  const cache = new Map<number, BlockDefinition | undefined>();

  return (blockType: number) => {
    if (cache.has(blockType)) {
      return cache.get(blockType);
    }

    const blockDefinition = resolveBlockDefinition(source, blockType);
    cache.set(blockType, blockDefinition);
    return blockDefinition;
  };
}

function resolveBlockDefinition(
  source: SegmentBlockDefinitionSource | undefined,
  blockType: number
): BlockDefinition | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof source === "function") {
    return source(blockType);
  }

  if (Array.isArray(source)) {
    const definitions = source as readonly BlockDefinition[];
    const indexedDefinition = definitions[blockType];

    if (indexedDefinition?.id === blockType) {
      return indexedDefinition;
    }

    return definitions.find((candidate) => candidate.id === blockType);
  }

  return (source as ReadonlyMap<number, BlockDefinition>).get(blockType);
}

function createSegmentResolver(
  segment: SegmentDataLike,
  source: SegmentNeighborSource | undefined
): (x: number, y: number, z: number) => SegmentDataLike | undefined {
  const centerKey = segmentKey(segment.x, segment.y, segment.z);

  if (!source) {
    return (x: number, y: number, z: number) => (segmentKey(x, y, z) === centerKey ? segment : undefined);
  }

  if (typeof source === "function") {
    return (x: number, y: number, z: number) =>
      segmentKey(x, y, z) === centerKey ? segment : source(x, y, z);
  }

  if (Array.isArray(source)) {
    const segmentMap = new Map<string, SegmentDataLike>();
    for (const candidate of source as readonly SegmentDataLike[]) {
      segmentMap.set(segmentKey(candidate.x, candidate.y, candidate.z), candidate);
    }
    segmentMap.set(centerKey, segment);

    return (x: number, y: number, z: number) => segmentMap.get(segmentKey(x, y, z));
  }

  return (x: number, y: number, z: number) =>
    segmentKey(x, y, z) === centerKey
      ? segment
      : (source as ReadonlyMap<string, SegmentDataLike>).get(segmentKey(x, y, z));
}

function encodeSegmentPosition(segment: SegmentDataLike): readonly [number, number, number] {
  return [
    normalizeEncodedSegmentCoordinate(segment.x, "segment.x"),
    normalizeEncodedSegmentCoordinate(segment.y, "segment.y"),
    normalizeEncodedSegmentCoordinate(segment.z, "segment.z")
  ];
}

function normalizeEncodedSegmentCoordinate(value: number, name: string): number {
  if (!Number.isInteger(value) || value % STARMADE_SEGMENT_DIM !== 0) {
    throw new Error(`${name} must be a block-coordinate segment origin aligned to ${STARMADE_SEGMENT_DIM}, got ${value}`);
  }

  const chunkCoordinate = value / STARMADE_SEGMENT_DIM;

  if (chunkCoordinate < -128 || chunkCoordinate > 127) {
    throw new Error(`${name} chunk coordinate must be an integer between -128 and 127, got ${chunkCoordinate}`);
  }

  return chunkCoordinate + 128;
}

function resolveBlockValue<T>(
  value: T | ((context: SegmentBlockContext) => T) | undefined,
  context: SegmentBlockContext,
  fallback: T
): T {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "function") {
    return (value as (context: SegmentBlockContext) => T)(context);
  }

  return value;
}

function normalizeOrientation(value: number): number {
  return modulo(Math.trunc(value), 24);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function starMadeCargoTextureRandomOffset(segment: SegmentDataLike, dataIndex: number): number {
  const segmentHash = javaVector3iHash(segment.x, segment.y, segment.z);
  const seed = BigInt(segmentHash + 1) * BigInt(dataIndex);
  return javaRandomNextInt(seed, 5) * 4;
}

function javaVector3iHash(x: number, y: number, z: number): number {
  let result = javaInt(Math.trunc(x) ^ (Math.trunc(x) >>> 16));
  result = javaInt(Math.imul(15, result) + (Math.trunc(y) ^ (Math.trunc(y) >>> 16)));
  result = javaInt(Math.imul(15, result) + (Math.trunc(z) ^ (Math.trunc(z) >>> 16)));
  return result;
}

function javaRandomNextInt(seed: bigint, bound: number): number {
  let state = (seed ^ JAVA_RANDOM_MULTIPLIER) & JAVA_RANDOM_MASK;

  while (true) {
    state = (state * JAVA_RANDOM_MULTIPLIER + JAVA_RANDOM_ADDEND) & JAVA_RANDOM_MASK;
    const bits = Number(state >> 17n);
    const value = bits % bound;

    if (bits - value + (bound - 1) >= 0) {
      return value;
    }
  }
}

function javaInt(value: number): number {
  return value | 0;
}
