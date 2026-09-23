import { describe, expect, it } from "vitest";
import { blockDefinitionFromConfig } from "../src/starmade/blockConfig";
import {
  collectStarMadeSegmentSceneOccupiedBlocks,
  computeStarMadeSegmentSceneBounds,
  createStarMadeSegmentBlockLightScene,
  starMadeSegmentBlockWorldPosition,
  worldToStarMadeSegmentBlockLightGrid
} from "../src/starmade/blockLightScene";
import {
  segmentBlockIndex,
  STARMADE_SEGMENT_BLOCK_COUNT,
  type SegmentBlockDataLike,
  type SegmentDataLike
} from "../src/starmade/segmentData";

const airBlock: SegmentBlockDataLike = { type: 0, hp: 0, orientation: 0, active: false };
const armorBlock = blockDefinitionFromConfig({
  id: 1,
  name: "Grey Basic Armor",
  textureIds: [33],
  blockStyle: 0
});
const lightBlock = blockDefinitionFromConfig({
  id: 2,
  name: "White Light",
  textureIds: [64],
  lightSource: true,
  lightSourceColor: [1, 1, 1, 1],
  blockStyle: 0
});
const blockDefinitions = new Map([
  [armorBlock.id, armorBlock],
  [lightBlock.id, lightBlock]
]);

describe("StarMade segment block-light scene", () => {
  it("collects occupied blocks with StarMade world-space segment offsets", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1, orientation: 4 },
      { x: 17, y: 16, z: 16, type: 2, active: true }
    ], 32, 0, -32);
    const occupied = collectStarMadeSegmentSceneOccupiedBlocks(
      [{ name: "ship", offset: [-3, 2, 5], segments: [segment] }],
      blockDefinitions
    );

    expect(occupied).toHaveLength(2);
    expect(occupied[0]).toMatchObject({
      entityName: "ship",
      blockIndex: segmentBlockIndex(16, 16, 16),
      blockDefinition: armorBlock,
      worldPosition: [29, 2, -27]
    });
    expect(occupied[1].worldPosition).toEqual([30, 2, -27]);
    expect(starMadeSegmentBlockWorldPosition(segment, segmentBlockIndex(17, 16, 16), [-3, 2, 5])).toEqual([
      30,
      2,
      -27
    ]);
  });

  it("builds a reusable block-light volume from scene entities", () => {
    const segment = makeSegment([
      { x: 15, y: 16, z: 16, type: 1 },
      { x: 16, y: 16, z: 16, type: 2, active: true }
    ]);
    const scene = createStarMadeSegmentBlockLightScene({
      entities: [{ name: "ship", segments: [segment] }],
      blockDefinitions,
      rayCount: 16
    });

    expect(scene.occupiedBlocks).toBe(2);
    expect(scene.lightSourceBlocks).toBe(1);
    expect(scene.activeLightSourceBlocks).toBe(1);
    expect(scene.inactiveLightSourceBlocks).toBe(0);
    expect(scene.lightSourceTypes).toEqual(["White Light"]);
    expect(scene.bounds).toEqual({ min: [-1, 0, 0], max: [0, 0, 0] });
    expect(scene.shift).toEqual([2, 1, 1]);
    expect(scene.size).toEqual([4, 3, 3]);
    expect(scene.occupied.map((entry) => entry.gridPosition)).toEqual([
      [1, 1, 1],
      [2, 1, 1]
    ]);
    expect(scene.volume.rayCount).toBe(16);
    expect(scene.volume.sources).toHaveLength(1);
    expect(scene.volume.solids).toHaveLength(2);
    expect(scene.volume.cells.length).toBeGreaterThan(0);
    expect(worldToStarMadeSegmentBlockLightGrid([0, 0, 0], scene.shift)).toEqual([2, 1, 1]);
  });

  it("reports inactive source blocks while excluding them from the active volume", () => {
    const segment = makeSegment([{ x: 16, y: 16, z: 16, type: 2, active: false }]);
    const scene = createStarMadeSegmentBlockLightScene({
      entities: [{ segments: [segment] }],
      blockDefinitions
    });

    expect(scene.lightSourceBlocks).toBe(1);
    expect(scene.activeLightSourceBlocks).toBe(0);
    expect(scene.inactiveLightSourceBlocks).toBe(1);
    expect(scene.volume.sources).toHaveLength(0);
  });

  it("keeps empty scenes and empty bounds well-defined", () => {
    expect(computeStarMadeSegmentSceneBounds([])).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    const scene = createStarMadeSegmentBlockLightScene({ entities: [], blockDefinitions });
    expect(scene.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(scene.shift).toEqual([1, 1, 1]);
    expect(scene.size).toEqual([3, 3, 3]);
    expect(scene.occupied).toEqual([]);
    expect(scene.volume.cells).toEqual([]);
    expect(scene.lightSourceTypes).toEqual([]);
  });

  it("ignores missing and unknown blocks and defaults unspecified light activation to on", () => {
    const blocks: SegmentBlockDataLike[] = [];
    blocks[1] = { type: 999, hp: 127, orientation: 0, active: true };
    // Deliberately simulate a legacy untyped input with no activation field.
    blocks[2] = { type: 2, hp: 127, orientation: 0 } as SegmentBlockDataLike;
    const segment: SegmentDataLike = { x: 0, y: 0, z: 0, blocks, blockCount: 2 };
    const scene = createStarMadeSegmentBlockLightScene({ entities: [{ segments: [segment] }], blockDefinitions, rayCount: 8, rayLength: 1 });
    expect(scene.occupied).toHaveLength(1);
    expect(scene.occupied[0]).toMatchObject({ entityName: "entity", blockIndex: 2, worldPosition: [-14, -16, -16] });
    expect(scene.lightSourceBlocks).toBe(1);
    expect(scene.activeLightSourceBlocks).toBe(1);
    expect(scene.inactiveLightSourceBlocks).toBe(0);
    expect(scene.volume.sources[0].active).toBe(true);
    expect(starMadeSegmentBlockWorldPosition(segment, 2)).toEqual([-14, -16, -16]);
  });
});

function makeSegment(
  entries: readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly type: number;
    readonly hp?: number;
    readonly orientation?: number;
    readonly active?: boolean;
  }[],
  x = 0,
  y = 0,
  z = 0
): SegmentDataLike {
  const blocks = Array.from({ length: STARMADE_SEGMENT_BLOCK_COUNT }, () => airBlock);

  for (const entry of entries) {
    blocks[segmentBlockIndex(entry.x, entry.y, entry.z)] = {
      type: entry.type,
      hp: entry.hp ?? 127,
      orientation: entry.orientation ?? 0,
      active: entry.active ?? false
    };
  }

  return {
    x,
    y,
    z,
    blocks,
    blockCount: entries.length
  };
}
