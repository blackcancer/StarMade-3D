import { describe, expect, it, vi } from "vitest";
import { createStarMadeBlueprintLod, type StarMadeBlueprintLodOptions } from "../src/geometry/blueprintLod.js";
import { segmentBlockIndex, type SegmentBlockDataLike, type SegmentDataLike } from "../src/starmade/segmentData.js";

function segment(points: readonly (readonly [number, number, number, number?])[], x = 0): SegmentDataLike {
  const blocks: SegmentBlockDataLike[] = [];
  for (const [px, py, pz, type = 1] of points) {
    blocks[segmentBlockIndex(px, py, pz)] = { type, hp: 100, orientation: 0, active: false };
  }
  return { x, y: 0, z: 0, blocks };
}

describe("blueprint preview LOD geometry", () => {
  it("returns an empty, serializable mesh for no occupied blocks", () => {
    const lod = createStarMadeBlueprintLod({ segments: [segment([[0, 0, 0, 0]])] });
    expect(lod).toMatchObject({ cellSize: 1, sourceBlockCount: 0, cellCount: 0, quadCount: 0, triangleCount: 0, bounds: null, maxVoxelDisplacement: 0 });
    expect([lod.positions, lod.normals, lod.colors, lod.emissiveColors, lod.indices]).toEqual([[], [], [], [], []]);
    expect(JSON.parse(JSON.stringify(lod))).toEqual(lod);
  });

  it("uses native block centers and outward winding on all six faces", () => {
    const lod = createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16]])] });
    expect(lod).toMatchObject({ sourceBlockCount: 1, cellCount: 1, quadCount: 6, triangleCount: 12, bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } });
    expect(lod.positions).toHaveLength(72);
    expect(lod.indices).toHaveLength(36);
    expect(new Set(lod.colors)).toEqual(new Set([0.5]));
    expect(new Set(lod.emissiveColors)).toEqual(new Set([0]));
    for (let i = 0; i < lod.indices.length; i += 3) {
      const a = lod.indices[i] * 3, b = lod.indices[i + 1] * 3, c = lod.indices[i + 2] * 3;
      const ab = lod.positions.slice(b, b + 3).map((v, axis) => v - lod.positions[a + axis]);
      const ac = lod.positions.slice(c, c + 3).map((v, axis) => v - lod.positions[a + axis]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      expect(cross.reduce((sum, value, axis) => sum + value * lod.normals[a + axis], 0)).toBeGreaterThan(0);
    }
  });

  it("greedily merges rectangular surfaces, including across segment boundaries", () => {
    const segments = [segment([[30, 16, 16], [31, 16, 16], [30, 17, 16], [31, 17, 16]]), segment([[0, 16, 16], [0, 17, 16]], 32)];
    const lod = createStarMadeBlueprintLod({ segments });
    expect(lod).toMatchObject({ sourceBlockCount: 6, cellCount: 6, quadCount: 6, bounds: { min: [13.5, -0.5, -0.5], max: [16.5, 1.5, 0.5] } });
    expect(createStarMadeBlueprintLod({ segments: [...segments].reverse() })).toEqual(lod);
  });

  it("uses neighbor segments only for boundary occlusion at every resolution", () => {
    const palette = vi.fn(() => ({ color: [0.2, 0.3, 0.4] as const }));
    for (const cellSize of [1, 2, 4] as const) {
      const lod = createStarMadeBlueprintLod({ segments: [segment([[31, 16, 16]])], neighborSegments: [segment([[0, 16, 16, 2]], 32)], cellSize, palette });
      expect(lod).toMatchObject({ sourceBlockCount: 1, cellCount: 1, quadCount: 5, triangleCount: 10 });
      expect(lod.normals.filter((_, index) => index % 3 === 0)).not.toContain(1);
      expect(lod.bounds?.max[0]).toBe(15.5);
    }
    expect(palette).toHaveBeenCalledTimes(3);
    expect(palette).toHaveBeenCalledWith(1);
    expect(palette).not.toHaveBeenCalledWith(2);
    const neighborOnly = createStarMadeBlueprintLod({ segments: [], neighborSegments: [segment([[0, 0, 0]])] });
    expect(neighborOnly).toMatchObject({ sourceBlockCount: 0, cellCount: 0, quadCount: 0, bounds: null });
    expect(() => createStarMadeBlueprintLod({ segments: [segment([])], neighborSegments: [segment([])] })).toThrow(/Duplicate/);
  });

  it("preserves holes and concavities instead of merging across absent cells", () => {
    const points = [];
    for (let y = 16; y < 19; y++) for (let x = 16; x < 19; x++) if (x !== 17 || y !== 17) points.push([x, y, 16] as const);
    const lod = createStarMadeBlueprintLod({ segments: [segment(points)] });
    let area = 0;
    for (let i = 0; i < lod.positions.length; i += 12) {
      const a = lod.positions.slice(i, i + 3), b = lod.positions.slice(i + 3, i + 6), d = lod.positions.slice(i + 9, i + 12);
      area += Math.hypot(...b.map((v, j) => v - a[j])) * Math.hypot(...d.map((v, j) => v - a[j]));
    }
    expect(area).toBe(32); // 16 front/back + 12 outer rim + 4 inner rim.
    expect(lod.quadCount).toBe(16);
  });

  it("keeps visual groups and emission separate, resolving each palette type once", () => {
    const palette = vi.fn((type: number) => ({ color: [1, 0, 0] as const, emission: [0, type / 10, 0] as const, group: "hull" }));
    const lod = createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16, 1], [17, 16, 16, 2], [18, 16, 16, 2]])], palette });
    expect(palette).toHaveBeenCalledTimes(2);
    expect(lod.quadCount).toBe(10);
    expect(lod.colors.slice(0, 3)).toEqual([1, 0, 0]);
    expect(lod.emissiveColors).toContain(0.1);
    expect(lod.emissiveColors).toContain(0.2);
    expect(createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16, 1], [17, 16, 16, 2]])] }).quadCount).toBe(10);
    expect(createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16, 1], [17, 16, 16, 2]])], palette: () => ({ color: [1, 0, 0], group: "same" }) }).quadCount).toBe(6);
  });

  it("coarsens occupied cells conservatively and chooses the dominant material deterministically", () => {
    const palette = (type: number) => ({ color: [type / 10, 0, 0] as const });
    const lod = createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16, 2], [17, 16, 16, 1], [16, 17, 16, 1]])], cellSize: 2, palette });
    expect(lod).toMatchObject({ sourceBlockCount: 3, cellCount: 1, quadCount: 6, maxVoxelDisplacement: Math.sqrt(3), bounds: { min: [-0.5, -0.5, -0.5], max: [1.5, 1.5, 1.5] } });
    expect(lod.colors[0]).toBe(0.1);
    const tie = createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16, 2], [17, 16, 16, 1]])], cellSize: 2, palette });
    expect(tie.colors[0]).toBe(0.1);
    expect(createStarMadeBlueprintLod({ segments: [segment([[16, 16, 16, 1], [17, 16, 16, 2]])], cellSize: 2, palette })).toEqual(tie);
    const negative = createStarMadeBlueprintLod({ segments: [segment([[15, 15, 15]])], cellSize: 4 });
    expect(negative.bounds).toEqual({ min: [-4.5, -4.5, -4.5], max: [-0.5, -0.5, -0.5] });
    expect(negative.maxVoxelDisplacement).toBe(3 * Math.sqrt(3));
  });

  it("aggregates compatible block types as one visual group when choosing the majority", () => {
    const lod = createStarMadeBlueprintLod({
      segments: [segment([[16, 16, 16, 3], [17, 16, 16, 1], [16, 17, 16, 2]])], cellSize: 2,
      palette: type => type === 3 ? { color: [0, 0, 1], group: "a" } : { color: [1, 0, 0], group: "b" }
    });
    expect(lod.colors.slice(0, 3)).toEqual([1, 0, 0]);
  });

  it("rejects invalid geometry and palette input explicitly", () => {
    const one = segment([[16, 16, 16]]);
    const build = (options: Partial<StarMadeBlueprintLodOptions>) => createStarMadeBlueprintLod({ segments: [one], ...options });
    expect(() => build({ cellSize: 3 as 1 })).toThrow(/cellSize/);
    for (const x of [0.5, 1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => build({ segments: [{ ...one, x }] })).toThrow(/origin/);
    expect(() => build({ segments: [one, one] })).toThrow(/Duplicate/);
    expect(() => build({ segments: [{ ...one, blocks: new Array(32769) }] })).toThrow(/32768/);
    for (const type of [-1, 1.5, NaN]) expect(() => build({ segments: [segment([[16, 16, 16, type]])] })).toThrow(/block type/);
    for (const color of [[1, 0], [NaN, 0, 0], [-1, 0, 0], [2, 0, 0]]) expect(() => build({ palette: () => ({ color: color as [number, number, number] }) })).toThrow(/color/);
    expect(() => build({ palette: () => ({ color: [0, 0, 0], emission: [0, 2, 0] }) })).toThrow(/emission/);
    for (const group of ["", 4]) expect(() => build({ palette: () => ({ color: [0, 0, 0], group: group as string }) })).toThrow(/group/);
    expect(build({ palette: () => undefined }).colors[0]).toBe(0.5);
  });
});
