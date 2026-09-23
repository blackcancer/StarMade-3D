import { describe, expect, it, vi } from "vitest";
import {
  createStarMadeSmd3Block, createStarMadeSmd3FileFromBlocks, createStarMadeSmd3Segment,
  createStarMadeSmd3RegionsFromBlocks, starMadeSmd3RegionKey,
  setStarMadeSmd3SegmentBlock, createEmptyStarMadeSmd3Blocks, blockToSegmentOrigin,
  segmentBlockIndex, segmentBlockPosition, isSegmentBlockCoordinate, getSegmentBlock,
  isAirSegmentBlock, segmentKey, STARMADE_SEGMENT_BLOCK_COUNT,
} from "../src";

describe("Decoder 2.x structural generation boundary (without mocking the SDK)", () => {
  it("defaults to complete version 7 data and samples a safe timestamp", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1234);
    try {
      expect(createStarMadeSmd3FileFromBlocks([])).toEqual({headerVersion: 7, usedSlots: 0, complete: true, segments: []});
      expect(createStarMadeSmd3Segment(0, 0, 0)).toMatchObject({version: 7, lastChanged: 1234n, blockCount: 0});
      const data = createStarMadeSmd3FileFromBlocks([{x: 0, y: 0, z: 0, type: 1}]);
      expect(data.segments[0].lastChanged).toBe(1234n);
    } finally { clock.mockRestore(); }
  });

  it("preserves raw air fields, the activation bit and all six reserved bits", () => {
    expect(createStarMadeSmd3Block({type: 0})).toEqual({type: 0, hp: 0, orientation: 0, active: false, extra: 0});
    expect(createStarMadeSmd3Block({type: 1})).toEqual({type: 1, hp: 127, orientation: 0, active: false, extra: 0});
    for (let extra = 0; extra < 64; extra++) {
      for (let orientation = 0; orientation < 32; orientation++) {
        for (const active of [false, true]) {
          const data = {type: 8191, hp: 127, orientation, active, extra};
          expect(createStarMadeSmd3Block(data)).toEqual(data);
        }
      }
    }
    const air = {type: 0, hp: 7, orientation: 31, active: true, extra: 63};
    expect(createStarMadeSmd3Block(air)).toEqual(air);
  });

  it.each([
    ["type", -1], ["type", 8192], ["type", 1.5], ["type", NaN],
    ["hp", -1], ["hp", 128], ["hp", 0.5], ["hp", Infinity],
    ["orientation", -1], ["orientation", 32], ["orientation", 0.5],
    ["extra", -1], ["extra", 64], ["extra", 1.5]
  ])("rejects invalid %s=%s without truncating", (field, value) => {
    expect(() => createStarMadeSmd3Block({type: 1, [field]: value})).toThrow(RangeError);
  });
  it("rejects non-boolean activation at the JavaScript boundary", () => {
    expect(() => createStarMadeSmd3Block({type: 1, active: 1 as unknown as boolean})).toThrow(TypeError);
  });

  it("orders segments by z/y/x, reuses a segment, replaces and deletes blocks", () => {
    const file = createStarMadeSmd3FileFromBlocks([
      {x: 32, y: 0, z: 0, type: 1}, {x: 0, y: 32, z: 0, type: 2},
      {x: -1, y: 0, z: 0, type: 3}, {x: 0, y: 0, z: -1, type: 4},
      {x: 32, y: 0, z: 0, type: 5}, {x: 32, y: 0, z: 0, type: 0},
      {x: 0, y: 0, z: 0, type: 0}
    ], {headerVersion: 6, segmentVersion: 7, lastChanged: 42});
    expect(file).toMatchObject({headerVersion: 6, complete: true, usedSlots: 3});
    expect(file.segments.map(s => [s.x, s.y, s.z])).toEqual([[0, 0, -32], [-32, 0, 0], [0, 32, 0]]);
    expect(file.segments.map(s => s.blockCount)).toEqual([1, 1, 1]);
    expect(file.segments.every(s => s.lastChanged === 42n)).toBe(true);
    const kept = createStarMadeSmd3FileFromBlocks([{x: 0, y: 0, z: 0, type: 0}], {includeEmptySegments: true});
    expect(kept.usedSlots).toBe(1);
    expect(kept.segments[0].blockCount).toBe(0);
  });

  it("updates non-air counts once and leaves untouched air slots immutable", () => {
    const segment = createStarMadeSmd3Segment(-32, 0, 0);
    const input = {x: -1, y: 1, z: 1, type: 5, extra: 63};
    setStarMadeSmd3SegmentBlock(segment, input);
    expect(segment.blockCount).toBe(1);
    setStarMadeSmd3SegmentBlock(segment, {...input, type: 6});
    expect(segment.blockCount).toBe(1);
    expect(segment.blocks[segmentBlockIndex(31, 1, 1)]).toMatchObject({type: 6, extra: 63});
    setStarMadeSmd3SegmentBlock(segment, {...input, type: 0});
    expect(segment.blockCount).toBe(0);
    setStarMadeSmd3SegmentBlock(segment, {...input, type: 0});
    expect(segment.blockCount).toBe(0);
    const blocks = createEmptyStarMadeSmd3Blocks();
    expect(blocks).toHaveLength(STARMADE_SEGMENT_BLOCK_COUNT);
    expect(blocks).not.toBe(segment.blocks);
    expect(Object.isFrozen(blocks[0])).toBe(true);
  });

  it.each([
    [32, 0, 0], [-1, 0, 0], [0, 32, 0], [0, -1, 0], [0, 0, 32], [0, 0, -1],
    [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [NaN, 0, 0], [0, Infinity, 0]
  ])("rejects a write outside its segment (%s,%s,%s) atomically", (x, y, z) => {
    const segment = createStarMadeSmd3Segment(0, 0, 0);
    const before = segment.blocks.slice();
    expect(() => setStarMadeSmd3SegmentBlock(segment, {x, y, z, type: 1})).toThrow(RangeError);
    expect(segment.blockCount).toBe(0);
    expect(segment.blocks).toEqual(before);
  });

  it("rejects malformed block arrays and invalid values before mutation", () => {
    const segment = createStarMadeSmd3Segment(0, 0, 0);
    segment.blocks.length = 1;
    expect(() => setStarMadeSmd3SegmentBlock(segment, {x: 0, y: 0, z: 0, type: 1})).toThrow(/32768/);
    segment.blocks.length = 32768;
    delete segment.blocks[0];
    expect(() => setStarMadeSmd3SegmentBlock(segment, {x: 0, y: 0, z: 0, type: 1})).toThrow(/missing/);
    segment.blocks[0] = createStarMadeSmd3Block({type: 0});
    const before = segment.blocks[0];
    expect(() => setStarMadeSmd3SegmentBlock(segment, {x: 0, y: 0, z: 0, type: 8192})).toThrow();
    expect(segment.blocks[0]).toBe(before);
    expect(segment.blockCount).toBe(0);
  });

  it.each([-0x80000001, 0x80000000, 0.5, NaN, Infinity])("rejects non-int32 world coordinates %s", value => {
    for (const axis of ["x", "y", "z"] as const) {
      const point = {x: 0, y: 0, z: 0, [axis]: value};
      expect(() => blockToSegmentOrigin(point.x, point.y, point.z)).toThrow(RangeError);
      expect(() => createStarMadeSmd3Segment(point.x, point.y, point.z)).toThrow(RangeError);
    }
  });
  it("validates segment alignment, versions and header bytes even for empty input", () => {
    expect(() => createStarMadeSmd3Segment(1, 0, 0)).toThrow(/aligned/);
    for (const version of [2, 8, 3.5]) {
      expect(() => createStarMadeSmd3FileFromBlocks([], {segmentVersion: version})).toThrow();
      expect(() => createStarMadeSmd3Segment(0, 0, 0, {version})).toThrow();
    }
    for (const headerVersion of [-1, 256]) expect(() => createStarMadeSmd3FileFromBlocks([], {headerVersion})).toThrow();
    expect(createStarMadeSmd3Segment(0, 0, 0, {segmentVersion: 6, lastChanged: 1n}).version).toBe(6);
    expect(createStarMadeSmd3Segment(0, 0, 0, {version: 3, segmentVersion: 6}).version).toBe(3);
    expect(blockToSegmentOrigin(-0x80000000, 0x7fffffff, -32)).toEqual({x: -0x80000000, y: 0x7fffffe0, z: -32});
  });
  it.each([Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 0.5, -(1n << 63n) - 1n, 1n << 63n])("rejects lossy or oversized timestamp %s", lastChanged => {
    expect(() => createStarMadeSmd3Segment(0, 0, 0, {lastChanged})).toThrow(RangeError);
    expect(() => createStarMadeSmd3FileFromBlocks([], {lastChanged})).toThrow(RangeError);
  });
  it("accepts both exact signed 64-bit timestamp boundaries", () => {
    for (const lastChanged of [-(1n << 63n), (1n << 63n) - 1n]) {
      expect(createStarMadeSmd3Segment(0, 0, 0, {lastChanged}).lastChanged).toBe(lastChanged);
    }
  });
});

describe("Segment addressing", () => {
  it("round-trips all 32768 offsets and supports explicit dimensions", () => {
    for (const dim of [2, 32]) for (let index = 0; index < dim ** 3; index++) {
      const {x, y, z} = segmentBlockPosition(index, dim);
      expect(segmentBlockIndex(x, y, z, dim)).toBe(index);
      expect(isSegmentBlockCoordinate(x, y, z, dim)).toBe(true);
    }
    expect(segmentBlockPosition(1024)).toEqual({x: 0, y: 0, z: 1});
    expect(segmentKey(-32, 0, 32)).toBe("-32,0,32");
  });
  it("rejects fractional dimensions/coordinates and returns undefined for invalid lookups", () => {
    const segment = createStarMadeSmd3Segment(0, 0, 0);
    for (const dim of [-1, 0, 0.5, NaN]) expect(isSegmentBlockCoordinate(0, 0, 0, dim)).toBe(false);
    for (const point of [[-1, 0, 0], [32, 0, 0], [0, -1, 0], [0, 32, 0], [0, 0, -1], [0, 0, 32], [0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]]) {
      expect(getSegmentBlock(segment, point[0], point[1], point[2])).toBeUndefined();
    }
    expect(getSegmentBlock(segment, 0, 0, 0)).toBe(segment.blocks[0]);
    expect(getSegmentBlock(segment, 0, 0, 0, 2)).toBe(segment.blocks[0]);
    expect(isAirSegmentBlock(undefined)).toBe(true);
    expect(isAirSegmentBlock(segment.blocks[0])).toBe(true);
    expect(isAirSegmentBlock(createStarMadeSmd3Block({type: 1}))).toBe(false);
  });
});

describe("Decoder 2.x region and raw-air preservation", () => {
  it.each([
    {hp: 1}, {active: true}, {orientation: 31}, {extra: 63}
  ])("keeps a zero-type segment containing raw payload %j", (payload) => {
    const block = {x: 31, y: 31, z: 31, type: 0, ...payload};
    const generated = createStarMadeSmd3FileFromBlocks([block], {lastChanged: 1n});
    expect(generated.usedSlots).toBe(1);
    expect(generated.segments[0].blockCount).toBe(0);
    expect(generated.segments[0].blocks[32767]).toEqual(createStarMadeSmd3Block(block));
  });

  it("maps the signed, half-region-shifted game boundaries on all axes", () => {
    for (const [input, region] of [[-769,-2], [-768,-1], [-257,-1], [-256,0], [255,0], [256,1], [767,1], [768,2]]) {
      expect(starMadeSmd3RegionKey(input, 0, 0)).toBe(`${region},0,0`);
      expect(starMadeSmd3RegionKey(0, input, 0)).toBe(`0,${region},0`);
      expect(starMadeSmd3RegionKey(0, 0, input)).toBe(`0,0,${region}`);
    }
    expect(starMadeSmd3RegionKey(-2147483648, 2147483647, 0)).toBe('-4194304,4194304,0');
    for (const value of [NaN, Infinity, 0.5, -2147483649, 2147483648]) {
      expect(() => starMadeSmd3RegionKey(value, 0, 0)).toThrow(RangeError);
    }
  });

  it("rejects multi-region data before it can reach the single-file writer", () => {
    expect(() => createStarMadeSmd3FileFromBlocks([
      {x: 255, y: 0, z: 0, type: 1}, {x: 256, y: 0, z: 0, type: 2}
    ])).toThrow(/multiple SMD3 regions/);
  });

  it("groups a large entity into independently writable regions without losing fields", () => {
    const blocks = [
      {x: -257, y: 0, z: 0, type: 1, extra: 1},
      {x: -256, y: 0, z: 0, type: 2, extra: 2},
      {x: 255, y: 0, z: 0, type: 3, extra: 3},
      {x: 256, y: 0, z: 0, type: 0, hp: 7}
    ];
    const regions = createStarMadeSmd3RegionsFromBlocks(blocks, {lastChanged: 5n});
    expect([...regions.keys()]).toEqual(['-1,0,0', '0,0,0', '1,0,0']);
    expect([...regions.values()].map(file => file.usedSlots)).toEqual([1, 2, 1]);
    for (const [key, file] of regions) {
      expect(file.complete).toBe(true);
      for (const segment of file.segments) {
        expect(starMadeSmd3RegionKey(segment.x, segment.y, segment.z)).toBe(key);
        expect(segment.lastChanged).toBe(5n);
      }
    }
    for (const block of blocks) {
      const file = regions.get(starMadeSmd3RegionKey(block.x, block.y, block.z))!;
      const origin = blockToSegmentOrigin(block.x, block.y, block.z);
      const segment = file.segments.find(s => s.x === origin.x && s.y === origin.y && s.z === origin.z)!;
      expect(getSegmentBlock(segment, block.x-origin.x, 0, 0)).toEqual(createStarMadeSmd3Block(block));
    }
  });

  it("validates empty grouping options and samples the timestamp only once", () => {
    expect(createStarMadeSmd3RegionsFromBlocks([]).size).toBe(0);
    expect(() => createStarMadeSmd3RegionsFromBlocks([], {segmentVersion: 8})).toThrow();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(42);
    try {
      const regions = createStarMadeSmd3RegionsFromBlocks([
        {x: 0, y: 0, z: 0, type: 1}, {x: 256, y: 0, z: 0, type: 2}
      ]);
      expect(clock).toHaveBeenCalledTimes(1);
      expect([...regions.values()].map(f => f.segments[0].lastChanged)).toEqual([42n,42n]);
    } finally { clock.mockRestore(); }
  });
});
