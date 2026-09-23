import type { BlockDefinition } from "./blockConfig.js";
import {
  computeStarMadeBlockLightVolume,
  createStarMadeBlockLightSolidFromBlock,
  createStarMadeBlockLightSourceFromBlock,
  type StarMadeBlockLightVolume,
  type StarMadeGridPoint3
} from "./blockLighting.js";
import {
  segmentBlockPosition,
  STARMADE_SEGMENT_DIM,
  type SegmentBlockDataLike,
  type SegmentDataLike
} from "./segmentData.js";

export interface StarMadeSegmentSceneEntity {
  readonly name?: string;
  readonly offset?: readonly [number, number, number];
  readonly segments: readonly SegmentDataLike[];
}

export interface StarMadeSegmentBlockLightSceneOptions {
  readonly entities: readonly StarMadeSegmentSceneEntity[];
  readonly blockDefinitions: ReadonlyMap<number, BlockDefinition>;
  readonly rayCount?: number;
  readonly rayLength?: number;
}

export interface StarMadeSegmentBlockLightScene {
  readonly volume: StarMadeBlockLightVolume;
  readonly shift: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly bounds: StarMadeSegmentSceneBounds;
  readonly occupied: readonly StarMadeSegmentSceneOccupiedBlock[];
  readonly occupiedBlocks: number;
  readonly lightSourceBlocks: number;
  readonly activeLightSourceBlocks: number;
  readonly inactiveLightSourceBlocks: number;
  readonly lightSourceTypes: readonly string[];
}

export interface StarMadeSegmentSceneOccupiedBlock {
  readonly entityName: string;
  readonly entityOffset: readonly [number, number, number];
  readonly segment: SegmentDataLike;
  readonly blockIndex: number;
  readonly block: SegmentBlockDataLike;
  readonly blockDefinition: BlockDefinition;
  readonly worldPosition: readonly [number, number, number];
  readonly gridPosition: readonly [number, number, number];
}

export interface StarMadeSegmentSceneBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

const ZERO_OFFSET = [0, 0, 0] as const;
const EMPTY_BOUNDS: StarMadeSegmentSceneBounds = Object.freeze({
  min: ZERO_OFFSET,
  max: ZERO_OFFSET
});

export function createStarMadeSegmentBlockLightScene(
  options: StarMadeSegmentBlockLightSceneOptions
): StarMadeSegmentBlockLightScene {
  const rawOccupied = collectStarMadeSegmentSceneOccupiedBlocks(options.entities, options.blockDefinitions);
  const bounds = rawOccupied.length > 0 ? computeStarMadeSegmentSceneBounds(rawOccupied) : EMPTY_BOUNDS;
  const shift = starMadeSegmentSceneBlockLightShift(bounds);
  const size = starMadeSegmentSceneBlockLightSize(bounds);
  const occupied = rawOccupied.map((entry) => ({
    ...entry,
    gridPosition: worldToStarMadeSegmentBlockLightGrid(entry.worldPosition, shift)
  }));
  const sources = occupied
    .filter((entry) => entry.blockDefinition.lightSource)
    .map((entry) =>
      createStarMadeBlockLightSourceFromBlock(entry.blockDefinition, {
        grid: [entry.gridPosition[0], entry.gridPosition[2]],
        position: entry.gridPosition,
        active: entry.block.active ?? true,
        orientation: entry.block.orientation
      })
    );
  const solids = occupied.map((entry) =>
    createStarMadeBlockLightSolidFromBlock(entry.blockDefinition, {
      position: entry.gridPosition,
      orientation: entry.block.orientation
    })
  );
  const volume = computeStarMadeBlockLightVolume({
    size,
    sources,
    solids,
    rayCount: options.rayCount,
    rayLength: options.rayLength
  });
  const lightSourceTypes = [
    ...new Set(
      occupied
        .filter((entry) => entry.blockDefinition.lightSource)
        .map((entry) => entry.blockDefinition.name)
    )
  ].sort();

  return {
    volume,
    shift,
    size,
    bounds,
    occupied,
    occupiedBlocks: occupied.length,
    lightSourceBlocks: sources.length,
    // The sources above all receive an explicit boolean, including default-on
    // input blocks; no second optional-activation fallback is needed here.
    activeLightSourceBlocks: sources.filter((source) => source.active).length,
    inactiveLightSourceBlocks: sources.filter((source) => !source.active).length,
    lightSourceTypes
  };
}

export function collectStarMadeSegmentSceneOccupiedBlocks(
  entities: readonly StarMadeSegmentSceneEntity[],
  blockDefinitions: ReadonlyMap<number, BlockDefinition>
): readonly Omit<StarMadeSegmentSceneOccupiedBlock, "gridPosition">[] {
  const occupied: Omit<StarMadeSegmentSceneOccupiedBlock, "gridPosition">[] = [];

  for (const entity of entities) {
    const entityName = entity.name ?? "entity";
    const entityOffset = entity.offset ?? ZERO_OFFSET;

    for (const segment of entity.segments) {
      for (let index = 0; index < segment.blocks.length; index++) {
        const block = segment.blocks[index];

        if (!block || block.type === 0) {
          continue;
        }

        const blockDefinition = blockDefinitions.get(block.type);

        if (!blockDefinition) {
          continue;
        }

        occupied.push({
          entityName,
          entityOffset,
          segment,
          blockIndex: index,
          block,
          blockDefinition,
          worldPosition: starMadeSegmentBlockWorldPosition(segment, index, entityOffset)
        });
      }
    }
  }

  return occupied;
}

export function starMadeSegmentBlockWorldPosition(
  segment: SegmentDataLike,
  blockIndex: number,
  entityOffset: readonly [number, number, number] = ZERO_OFFSET
): readonly [number, number, number] {
  const position = segmentBlockPosition(blockIndex);
  const originOffset = STARMADE_SEGMENT_DIM / 2;

  return [
    segment.x + position.x - originOffset + entityOffset[0],
    segment.y + position.y - originOffset + entityOffset[1],
    segment.z + position.z - originOffset + entityOffset[2]
  ];
}

export function computeStarMadeSegmentSceneBounds(
  occupied: readonly Pick<StarMadeSegmentSceneOccupiedBlock, "worldPosition">[]
): StarMadeSegmentSceneBounds {
  if (occupied.length === 0) {
    return EMPTY_BOUNDS;
  }

  return occupied.reduce(
    (next, entry) => ({
      min: [
        Math.min(next.min[0], entry.worldPosition[0]),
        Math.min(next.min[1], entry.worldPosition[1]),
        Math.min(next.min[2], entry.worldPosition[2])
      ] as const,
      max: [
        Math.max(next.max[0], entry.worldPosition[0]),
        Math.max(next.max[1], entry.worldPosition[1]),
        Math.max(next.max[2], entry.worldPosition[2])
      ] as const
    }),
    {
      min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as const,
      max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as const
    }
  );
}

export function starMadeSegmentSceneBlockLightShift(
  bounds: StarMadeSegmentSceneBounds
): readonly [number, number, number] {
  return [
    1 - Math.floor(bounds.min[0]),
    1 - Math.floor(bounds.min[1]),
    1 - Math.floor(bounds.min[2])
  ];
}

export function starMadeSegmentSceneBlockLightSize(
  bounds: StarMadeSegmentSceneBounds
): readonly [number, number, number] {
  return [
    Math.max(1, Math.ceil(bounds.max[0] - bounds.min[0]) + 3),
    Math.max(1, Math.ceil(bounds.max[1] - bounds.min[1]) + 3),
    Math.max(1, Math.ceil(bounds.max[2] - bounds.min[2]) + 3)
  ];
}

export function worldToStarMadeSegmentBlockLightGrid(
  position: readonly [number, number, number],
  shift: readonly [number, number, number]
): StarMadeGridPoint3 {
  return [
    Math.round(position[0] + shift[0]),
    Math.round(position[1] + shift[1]),
    Math.round(position[2] + shift[2])
  ];
}
