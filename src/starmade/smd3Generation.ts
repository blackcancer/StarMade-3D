import {
  segmentBlockIndex,
  isSegmentBlockCoordinate,
  STARMADE_SEGMENT_BLOCK_COUNT,
  STARMADE_SEGMENT_DIM,
  type SegmentBlockDataLike
} from "./segmentData.js";

export interface StarMadeGeneratedSmd3File {
  readonly headerVersion: number;
  readonly usedSlots: number;
  /** Generated data is complete; never pretend recovered decoder data is complete. */
  readonly complete: true;
  readonly segments: StarMadeGeneratedSegmentData[];
}

export interface StarMadeGeneratedSegmentData {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lastChanged: bigint;
  readonly version: number;
  readonly blocks: SegmentBlockDataLike[];
  readonly blockCount: number;
}

export interface StarMadeSmd3BlockInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly type: number;
  readonly hp?: number;
  readonly orientation?: number;
  readonly active?: boolean;
  readonly extra?: number;
}

export interface StarMadeSmd3GenerationOptions {
  readonly headerVersion?: number;
  readonly segmentVersion?: number;
  readonly lastChanged?: bigint | number;
  readonly includeEmptySegments?: boolean;
}

const AIR_BLOCK: SegmentBlockDataLike = Object.freeze({
  type: 0,
  hp: 0,
  orientation: 0,
  active: false
});

/**
 * Builds one region in the Decoder's structural data model, without serializing it.
 * The pinned Decoder writer accepts source versions 6/7 and emits version 7;
 * choosing legacy metadata here does not implement a legacy binary writer.
 */
export function createStarMadeSmd3FileFromBlocks(
  blocks: readonly StarMadeSmd3BlockInput[],
  options: StarMadeSmd3GenerationOptions = {}
): StarMadeGeneratedSmd3File {
  const segmentVersion = checkedInteger(options.segmentVersion ?? 7, 3, 7, "segmentVersion");
  const headerVersion = checkedInteger(options.headerVersion ?? segmentVersion, 0, 255, "headerVersion");
  const lastChanged = checkedTimestamp(options.lastChanged ?? Date.now());
  const segments = new Map<string, StarMadeGeneratedSegmentData>();
  let region: string | undefined;

  for (const input of blocks) {
    const nextRegion = starMadeSmd3RegionKey(input.x, input.y, input.z);
    if (region !== undefined && region !== nextRegion) {
      throw new RangeError("Blocks span multiple SMD3 regions; use createStarMadeSmd3RegionsFromBlocks");
    }
    region = nextRegion;
    const segmentOrigin = blockToSegmentOrigin(input.x, input.y, input.z);
    const key = `${segmentOrigin.x},${segmentOrigin.y},${segmentOrigin.z}`;
    let segment = segments.get(key);

    if (!segment) {
      segment = createStarMadeSmd3Segment(segmentOrigin.x, segmentOrigin.y, segmentOrigin.z, {
        version: segmentVersion,
        lastChanged
      });
      segments.set(key, segment);
    }

    setStarMadeSmd3SegmentBlock(segment, input);
  }

  const sortedSegments = [...segments.values()].sort(compareSegments);
  const nonEmptySegments = options.includeEmptySegments
    ? sortedSegments
    : sortedSegments.filter((segment) => segment.blockCount > 0 || segment.blocks.some(hasAirPayload));

  return {
    headerVersion,
    complete: true,
    usedSlots: nonEmptySegments.length,
    segments: nonEmptySegments
  };
}

/**
 * Creates one independently writable file per 512-block region. StarMade's
 * region zero spans block coordinates [-256, 255], not [0, 511]. Map keys are
 * region coordinates "x,y,z"; they are NOT segment origins or storage cells.
 */
export function createStarMadeSmd3RegionsFromBlocks(
  blocks: readonly StarMadeSmd3BlockInput[],
  options: StarMadeSmd3GenerationOptions = {}
): ReadonlyMap<string, StarMadeGeneratedSmd3File> {
  const normalized = { ...options, lastChanged: checkedTimestamp(options.lastChanged ?? Date.now()) };
  // Validate options even for empty input; all regions share the same timestamp.
  createStarMadeSmd3FileFromBlocks([], normalized);
  const groups = new Map<string, StarMadeSmd3BlockInput[]>();
  for (const block of blocks) {
    const key = starMadeSmd3RegionKey(block.x, block.y, block.z);
    let group = groups.get(key);
    if (!group) { group = []; groups.set(key, group); }
    group.push(block);
  }
  return new Map([...groups].map(([key, group]) => [key, createStarMadeSmd3FileFromBlocks(group, normalized)]));
}

/** Region addressing from SegmentData4Byte/Smd3Writer, using signed int32 blocks. */
export function starMadeSmd3RegionKey(x: number, y: number, z: number): string {
  return [x, y, z].map((coordinate) => {
    checkedInteger(coordinate, -0x80000000, 0x7fffffff, "block coordinate");
    return Math.floor((Math.floor(coordinate / STARMADE_SEGMENT_DIM) + 8) / 16);
  }).join(",");
}

/** A zero-non-air-count segment can still carry nonzero persisted air fields. */
function hasAirPayload(block: SegmentBlockDataLike): boolean {
  return block.hp !== 0 || block.active || block.orientation !== 0 || (block.extra ?? 0) !== 0;
}

export function createStarMadeSmd3Segment(
  x: number,
  y: number,
  z: number,
  options: Pick<StarMadeSmd3GenerationOptions, "segmentVersion" | "lastChanged"> & { readonly version?: number } = {}
): StarMadeGeneratedSegmentData {
  const version = checkedInteger(options.version ?? options.segmentVersion ?? 7, 3, 7, "segmentVersion");
  const lastChanged = checkedTimestamp(options.lastChanged ?? Date.now());
  for (const coordinate of [x, y, z]) {
    checkedInteger(coordinate, -0x80000000, 0x7fffffff, "segment origin");
    if (coordinate % STARMADE_SEGMENT_DIM !== 0) {
      throw new RangeError("StarMade segment origins must be aligned to 32 blocks");
    }
  }

  return {
    x,
    y,
    z,
    lastChanged,
    version,
    blockCount: 0,
    blocks: createEmptyStarMadeSmd3Blocks()
  };
}

export function setStarMadeSmd3SegmentBlock(
  segment: StarMadeGeneratedSegmentData,
  input: StarMadeSmd3BlockInput
): void {
  const local = worldToLocalSegmentBlock(input.x, input.y, input.z, segment);
  // Validate before touching either the array or its non-air count. In particular,
  // local x=32 used to alias x=0,y=1 instead of rejecting a cross-segment write.
  if (!isSegmentBlockCoordinate(local.x, local.y, local.z)) {
    throw new RangeError("Block coordinates are outside the target StarMade segment");
  }
  if (segment.blocks.length !== STARMADE_SEGMENT_BLOCK_COUNT) {
    throw new RangeError("A StarMade segment must contain 32768 block slots");
  }
  const index = segmentBlockIndex(local.x, local.y, local.z);
  const previous = segment.blocks[index];
  if (previous === undefined) {
    throw new RangeError("A StarMade segment cannot contain missing block slots");
  }
  const next = createStarMadeSmd3Block(input);

  if (previous.type === 0 && next.type !== 0) {
    (segment as { blockCount: number }).blockCount += 1;
  } else if (previous.type !== 0 && next.type === 0) {
    (segment as { blockCount: number }).blockCount -= 1;
  }

  segment.blocks[index] = next;
}

export function createStarMadeSmd3Block(input: Omit<StarMadeSmd3BlockInput, "x" | "y" | "z">): SegmentBlockDataLike {
  const type = checkedInteger(input.type, 0, 0x1fff, "type");
  const active = input.active ?? false;
  if (typeof active !== "boolean") {
    throw new TypeError("StarMade SMD3 active must be a raw boolean storage bit");
  }
  return {
    type,
    hp: checkedInteger(input.hp ?? (type === 0 ? 0 : 127), 0, 0x7f, "hp"),
    orientation: checkedInteger(input.orientation ?? 0, 0, 0x1f, "orientation"),
    active,
    extra: checkedInteger(input.extra ?? 0, 0, 0x3f, "extra")
  };
}

export function createEmptyStarMadeSmd3Blocks(): SegmentBlockDataLike[] {
  return Array.from({ length: STARMADE_SEGMENT_BLOCK_COUNT }, () => AIR_BLOCK);
}

export function blockToSegmentOrigin(
  x: number,
  y: number,
  z: number
): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: floorToSegmentOrigin(x),
    y: floorToSegmentOrigin(y),
    z: floorToSegmentOrigin(z)
  };
}

function worldToLocalSegmentBlock(
  x: number,
  y: number,
  z: number,
  segment: StarMadeGeneratedSegmentData
): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: x - segment.x,
    y: y - segment.y,
    z: z - segment.z
  };
}

function floorToSegmentOrigin(value: number): number {
  checkedInteger(value, -0x80000000, 0x7fffffff, "block coordinate");
  return Math.floor(value / STARMADE_SEGMENT_DIM) * STARMADE_SEGMENT_DIM;
}

function compareSegments(left: StarMadeGeneratedSegmentData, right: StarMadeGeneratedSegmentData): number {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function checkedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Invalid StarMade SMD3 ${label}: ${value}`);
  }

  return value;
}

/** Java stores timestamps as signed 64-bit integers; do not round unsafe JS numbers. */
function checkedTimestamp(value: bigint | number): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError("StarMade lastChanged must be a safe integer or bigint");
  }
  const timestamp = BigInt(value);
  if (timestamp < -(1n << 63n) || timestamp > (1n << 63n) - 1n) {
    throw new RangeError("StarMade lastChanged must fit a signed 64-bit integer");
  }
  return timestamp;
}
