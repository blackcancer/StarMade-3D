export const STARMADE_SEGMENT_DIM = 32;
export const STARMADE_SEGMENT_BLOCK_COUNT =
  STARMADE_SEGMENT_DIM * STARMADE_SEGMENT_DIM * STARMADE_SEGMENT_DIM;

export interface SegmentBlockDataLike {
  readonly type: number;
  readonly hp: number;
  readonly orientation: number;
  /** Raw storage activation bit; block-specific interpretation belongs to rendering. */
  readonly active: boolean;
  /** Reserved v7 bits 26..31. Absent is equivalent to zero (Decoder 2.x). */
  readonly extra?: number;
}

export interface SegmentDataLike {
  /** StarMade stores segment origins in block coordinates, aligned to STARMADE_SEGMENT_DIM. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly blocks: readonly SegmentBlockDataLike[];
  readonly blockCount?: number;
}

export function segmentKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Fast row-major offset. Callers writing data must validate coordinates first. */
export function segmentBlockIndex(
  x: number,
  y: number,
  z: number,
  dim = STARMADE_SEGMENT_DIM
): number {
  return x + y * dim + z * dim * dim;
}

/** Inverse of segmentBlockIndex for a valid local offset. */
export function segmentBlockPosition(
  index: number,
  dim = STARMADE_SEGMENT_DIM
): { readonly x: number; readonly y: number; readonly z: number } {
  const z = Math.floor(index / (dim * dim));
  const y = Math.floor((index % (dim * dim)) / dim);
  const x = index % dim;

  return { x, y, z };
}

export function getSegmentBlock(
  segment: SegmentDataLike,
  x: number,
  y: number,
  z: number,
  dim = STARMADE_SEGMENT_DIM
): SegmentBlockDataLike | undefined {
  if (!isSegmentBlockCoordinate(x, y, z, dim)) {
    return undefined;
  }

  return segment.blocks[segmentBlockIndex(x, y, z, dim)];
}

export function isSegmentBlockCoordinate(
  x: number,
  y: number,
  z: number,
  dim = STARMADE_SEGMENT_DIM
): boolean {
  return Number.isInteger(dim) && dim > 0 &&
    Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
    x >= 0 && x < dim && y >= 0 && y < dim && z >= 0 && z < dim;
}

export function isAirSegmentBlock(block: SegmentBlockDataLike | undefined): boolean {
  return block === undefined || block.type === 0;
}
