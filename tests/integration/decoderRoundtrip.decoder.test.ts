import { describe, expect, it } from "vitest";
import { parseSmd3, writeSmd3, BlockState } from "starmade-decoder";
import { createStarMadeSmd3FileFromBlocks, createStarMadeSmd3RegionsFromBlocks, createStarMadeSmd3Block, segmentBlockIndex } from "../../src";

describe("Decoder 2.0 pinned integration — real SDK, not a double", () => {
  it("round-trips separate regions including raw-air-only content", () => {
    const regions = createStarMadeSmd3RegionsFromBlocks([
      {x: -257, y: 0, z: 0, type: 1, extra: 63},
      {x: -256, y: 0, z: 0, type: 2, active: true},
      {x: 255, y: 0, z: 0, type: 3, orientation: 31},
      {x: 256, y: 0, z: 0, type: 0, hp: 7}
    ], {lastChanged: 7n});
    expect(regions.size).toBe(3);
    for (const region of regions.values()) {
      const result = parseSmd3(writeSmd3(region));
      expect(result.complete).toBe(true);
      for (const original of region.segments) {
        const decoded = result.segments.find(s => s.x === original.x && s.y === original.y && s.z === original.z)!;
        expect(decoded).toBeDefined();
        expect(decoded.blockCount).toBe(original.blockCount);
        expect(decoded.lastChanged).toBe(7n);
        expect(decoded.blocks.map(b => BlockState.fromWord(new BlockState(b).toWord()).toWord()))
          .toEqual(original.blocks.map(b => new BlockState(b).toWord()));
      }
    }
  });
it("creates StarMade-Decoder shaped SMD3 data and writes it through writeSmd3", () => {
    const generated = createStarMadeSmd3FileFromBlocks([
      { x: 0, y: 0, z: 0, type: 5, hp: 64, orientation: 3, active: true },
      { x: 32, y: 0, z: 0, type: 75 },
      { x: -1, y: 0, z: 0, type: 296, orientation: 10 }
    ], {
      lastChanged: 42n
    });

    const encoded = writeSmd3(generated);
    const decoded = parseSmd3(encoded);
    decoded.segments.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

    expect(decoded.headerVersion).toBe(7);
    expect(decoded.usedSlots).toBe(3);
    expect(decoded.segments.map((segment) => [segment.x, segment.y, segment.z])).toEqual([
      [-32, 0, 0],
      [0, 0, 0],
      [32, 0, 0]
    ]);

    const negativeSegment = decoded.segments[0];
    const rootSegment = decoded.segments[1];
    const nextSegment = decoded.segments[2];

    expect(negativeSegment.blocks[segmentBlockIndex(31, 0, 0)]).toMatchObject({
      type: 296,
      hp: 127,
      orientation: 10,
      active: false
    });
    expect(rootSegment.blocks[segmentBlockIndex(0, 0, 0)]).toMatchObject({
      type: 5,
      hp: 64,
      orientation: 3,
      active: true
    });
    expect(nextSegment.blocks[segmentBlockIndex(0, 0, 0)]).toMatchObject({
      type: 75,
      hp: 127,
      orientation: 0,
      active: false
    });
  });
  it("preserves every raw v7 field through BlockState and binary roundtrip", () => {
    const state = BlockState.fromWord(0xffffffff);
    expect(createStarMadeSmd3Block(state)).toEqual(state.toJSON());
    const generated = createStarMadeSmd3FileFromBlocks([
      {x: 0, y: 0, z: 0, ...state.toJSON()},
      {x: 31, y: 31, z: 31, type: 0, hp: 7, active: true, orientation: 31, extra: 63}
    ], {lastChanged: 1n});
    const decoded = parseSmd3(writeSmd3(generated));
    expect(decoded.complete).toBe(true);
    expect(decoded.segments[0].blocks[0]).toEqual(state.toJSON());
    expect(decoded.segments[0].blocks[32767]).toEqual(generated.segments[0].blocks[32767]);
  });
});
