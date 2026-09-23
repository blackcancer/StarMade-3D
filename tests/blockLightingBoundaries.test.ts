import { describe, expect, it } from "vitest";
import {
  computeStarMadeBlockLightSurface,
  computeStarMadeBlockLightVolume,
  computeStarMadeLodBlockLight,
  computeStarMadeLodBlockLightFromSideData,
  computeStarMadeLodBlockLightFromVolume,
  createStarMadeBlockLightSolidFromBlock,
  createStarMadeLodSideDataFromVolume,
  createStarMadeOcclusionSample,
  getStarMadeBlockLightFaceLight,
  getStarMadeBlockLightFaceLightDirection,
  getStarMadeBlockLightFaceVertexLight,
  getStarMadeBlockLightShapeFaceVertexLight,
  getStarMadeBlockLightSurfaceCell,
  getStarMadeBlockLightSurfaceTopAverageLight,
  getStarMadeBlockLightSurfaceVertexLight,
  getStarMadeBlockLightVertexLight,
  starMadeBlockLightTraitsFromBlock,
  starMadeSlabVisibilityBlockerSide,
  type StarMadeBlockLightShapeFace,
  type StarMadeBlockLightSolid,
  type StarMadeBlockLightVolume,
  type StarMadeBlockLightVolumeCell,
  type StarMadeGridPoint3,
  type StarMadeRgb
} from "../src/starmade/blockLighting";

const center: StarMadeGridPoint3 = [2, 2, 2];
const add = (a: StarMadeGridPoint3, b: StarMadeGridPoint3): StarMadeGridPoint3 =>
  [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vertexAt = (relative: StarMadeGridPoint3): StarMadeGridPoint3 =>
  [center[0] * 2 + relative[0], center[1] * 2 + relative[1], center[2] * 2 + relative[2]];

function cell(position: StarMadeGridPoint3, gather: StarMadeRgb): StarMadeBlockLightVolumeCell {
  return {
    position, gather, lightDirection: [0, 1, 0], occlusion: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    sideLights: [], sideLightDirections: []
  };
}

function volume(solids: readonly StarMadeBlockLightSolid[], cells: readonly StarMadeBlockLightVolumeCell[] = []): StarMadeBlockLightVolume {
  return { size: [8, 8, 8], rayCount: 128, rayLength: 22, colorPerm: 31, lightScale: 1.28, sources: [], solids, cells };
}

function face(overrides: Partial<StarMadeBlockLightShapeFace> = {}): StarMadeBlockLightShapeFace {
  return {
    sourceSide: 2, lightSide: 2, drawBucket: 2, normal: [0, 1, 0],
    vertices: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],
    surface: true, fullAxisSide: 2, ...overrides
  };
}

describe("block light sampling at boundaries", () => {
  it("lights recessed slab faces from their own open cell without lighting the closed boundary", () => {
    const inset=face({vertices:[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]],fullAxisSide:null});
    const closed=face();
    const solid={position:center,lightPassOnBlockItself:true,shapeFaces:[inset]};
    const model=volume([solid],[cell(center,[0,.4,.8]),cell([2,3,2],[0,0,0])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model,center,vertexAt([1,0,1]),inset)).toEqual([0,.4,.8,.5]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model,center,vertexAt([1,1,1]),closed)).toEqual([0,0,0,.5]);
    const absent=volume([solid],[cell([2,3,2],[.2,0,0])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(absent,center,vertexAt([1,0,1]),inset)).toEqual([.2,0,0,.5]);
    const sparse=volume([solid],[{...cell(center,[0,2,.8]),occlusion:[]}]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(sparse,center,vertexAt([1,0,1]),inset)).toEqual([0,1,.8,0]);
  });
  it("returns no light for invalid faces, empty space and missing adjacent air", () => {
    const empty = volume([]);
    const occupied = volume([{ position: center }]);
    expect(getStarMadeBlockLightFaceLight(occupied, center, 99)).toBeNull();
    expect(getStarMadeBlockLightFaceLightDirection(occupied, center, 2)).toBeNull();
    expect(getStarMadeBlockLightVertexLight(empty, [1, 1, 1])).toBeNull();
    expect(getStarMadeBlockLightVertexLight(occupied, vertexAt([1, 1, 1]))).toBeNull();
    expect(getStarMadeBlockLightFaceVertexLight(occupied, vertexAt([1, 1, 1]), 99)).toBeNull();
    expect(getStarMadeBlockLightFaceVertexLight(occupied, vertexAt([0, 1, 1]), 2)).toBeNull();
    expect(createStarMadeLodSideDataFromVolume(occupied, center)).toEqual([null, null, null, null, null, null]);
  });

  it("does not borrow diagonal air light when the face has no exposed adjacent air", () => {
    const model = volume([{ position: center }], [
      { ...cell([3, 3, 3], [0.2, 0.4, 0.6]), occlusion: [] }
    ]);
    // Occlusion.setLightFromAirBlock transfers only to the six adjacent cells.
    // A vertex touching diagonal air is not evidence that the face is exposed.
    expect(getStarMadeBlockLightFaceVertexLight(model, vertexAt([1, 1, 1]), 2)).toBeNull();
  });

  it("counts an adjacent slab face only once at a half-height corner", () => {
    const top = face({vertices:[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]], fullAxisSide:null});
    const model = volume([
      {position:center, shapeFaces:[top]},
      {position:[3,2,2], shapeFaces:[top]}
    ], [cell([2,3,2],[.2,0,0]),cell([3,3,2],[.8,0,0])]);
    const light = getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1,0,1]), top);
    expect(light).not.toBeNull();
    // Two distinct faces, not two copies of the neighbor plus the receiver.
    expect(light![0]).toBeCloseTo((.2 + .8) / 2, 12);
  });

  it("uses zero occlusion for public sparse air data and clamps face and LOD RGB without altering occlusion", () => {
    const model = volume([{ position: center }], [{ ...cell([2, 3, 2], [-1, 2, 0.5]), occlusion: [] }]);
    expect(getStarMadeBlockLightFaceLight(model, center, 2)).toEqual([-1, 1, 0.5, 0]);
    expect(createStarMadeLodSideDataFromVolume(model, center)).toEqual([null, null, null, [0, 1, 0.5, 0], null, null]);
    expect(computeStarMadeLodBlockLightFromVolume({ volume: model, position: center }).primarySide).toBe(0);
  });

  it("keeps surface queries outside all four borders dark", () => {
    const surface = computeStarMadeBlockLightSurface({ size: 1, sources: [], rayCount: 8, rayLength: 1 });
    for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      expect(getStarMadeBlockLightSurfaceCell(surface, x, z)).toBeUndefined();
    }
    expect(getStarMadeBlockLightSurfaceVertexLight(surface, 10, 10, -0.5, 0.5)).toEqual([0, 0, 0]);
    expect(getStarMadeBlockLightSurfaceTopAverageLight(surface, 10, 10)).toEqual([0, 0, 0]);
    expect(computeStarMadeLodBlockLight({ surface, grid: [0, 0] }).sideData).toEqual([null, null, null, null, null, null]);
    const sparseSurface = { ...surface, cells: [{ ...surface.cells[0], gather: [2, -1, 0.5] as const, occlusion: [] }] };
    expect(computeStarMadeLodBlockLight({ surface: sparseSurface, grid: [1, 0] }).sideData[4]).toEqual([1, 0, 0.5, 0]);
  });

  it("preserves explicit blocker positions independently of their two-dimensional grid", () => {
    const model = computeStarMadeBlockLightVolume({
      size: [4, 4, 4], sources: [], rayCount: 8, rayLength: 1,
      blockers: [
        { grid: [0, 0], position: [2, 2, 2], active: true },
        { grid: [1, 1] }, { grid: [3, 3], active: false }
      ]
    });
    expect(model.solids[0].position).toEqual(center);
    expect(model.solids).toHaveLength(2);
    expect(model.solids[1].position).toEqual([1, 1, 1]);
    expect(getStarMadeBlockLightFaceLight(model, center, 2)).not.toBeNull();
  });
});

describe("shared shape face lighting", () => {
  it.each([
    { side: 0, normal: [0, 0, 1], offset: [1, 0, 0], corner: [1, 1, 1] },
    { side: 1, normal: [0, 0, -1], offset: [1, 0, 0], corner: [1, 1, -1] },
    { side: 2, normal: [0, 1, 0], offset: [1, 0, 0], corner: [1, 1, 1] },
    { side: 3, normal: [0, -1, 0], offset: [1, 0, 0], corner: [1, -1, 1] },
    { side: 4, normal: [1, 0, 0], offset: [0, 0, 1], corner: [1, 1, 1] },
    { side: 5, normal: [-1, 0, 0], offset: [0, 0, 1], corner: [-1, 1, 1] }
  ] as const)("averages only the matching neighboring face on cube side $side", ({ side, normal, offset, corner }) => {
    const other = add(center, offset);
    const model = volume([{ position: center }, { position: other }], [
      cell(add(center, normal), [1, 0, 0]), cell(add(other, normal), [0, 0, 1])
    ]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt(corner), side)).toEqual([0.5, 0, 0.5, 0.5]);
  });

  it("uses a default face when metadata omits the requested side", () => {
    const model = volume([{ position: center, shapeFaces: [face()] }], [cell([2, 2, 3], [1, 0, 0])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 0)).toEqual([1, 0, 0, 0.5]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 99)).toEqual([1, 0, 0, 0.5]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(volume([]), center, vertexAt([0, 0, 0]), 0)).toBeNull();
  });

  it.each([
    { active: false }, { passable: true }, { visibleSides: [0] },
    { shapeFaces: [face({ surface: false })] },
    { shapeFaces: [face({ normal: [0, 0, 1] })] }
  ])("does not share light from an unavailable matching face: %j", otherTraits => {
    const model = volume([{ position: center }, { position: [3, 2, 2], ...otherTraits }], [
      cell([2, 3, 2], [1, 0, 0]), cell([3, 3, 2], [0, 0, 1])
    ]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 2)).toEqual([1, 0, 0, 0.5]);
  });

  it("shares an angled face only at an exactly coincident three-dimensional vertex", () => {
    const angled = face({ sourceSide: 6, normal: [0.5, 0.5, 0.5], fullAxisSide: null });
    const matching = face({ ...angled, vertices: [[-2, 1, 1], [-1, 0, 1], [-1, 1, 0], [-1, 1, 1]] });
    const model = volume([{ position: center, shapeFaces: [angled] }, {
      position: [3, 2, 2], shapeFaces: [
        face({ normal: [0.4, 0.5, 0.5] }), face({ normal: [0.5, 0.4, 0.5] }),
        face({ normal: [0.5, 0.5, 0.4] }), matching
      ]
    }], [cell([2, 3, 2], [1, 0, 0]), cell([3, 3, 2], [0, 0, 1])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), angled)).toEqual([0.5, 0, 0.5, 0.5]);
  });

  it("counts an occluded neighbor as darkness instead of discarding its shared vertex", () => {
    const model = volume([
      { position: center }, { position: [3, 2, 2] }, { position: [3, 3, 2] }
    ], [cell([2, 3, 2], [1, 0, 0])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 2)).toEqual([0.5, 0, 0, 0.25]);
  });

  it.each([{ visibilityBlockerSides: [] }, { visibilityBlockerSides: [4] }])("allows light past a remote shape that does not close the shared side: %j", ({ visibilityBlockerSides }) => {
    const model = volume([
      { position: center }, { position: [3, 2, 2] },
      { position: [3, 3, 2], lightCell: true, visibilityBlockerSides }
    ], [cell([2, 3, 2], [1, 0, 0]), cell([3, 3, 2], [0, 0, 1])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 2)).toEqual([0.5, 0, 0.5, 0.5]);
  });

  it("extends edge occlusion to the diagonal neighbor without leaking its light", () => {
    const model = volume([
      { position: center }, { position: [3, 2, 2] }, { position: [3, 2, 3] },
      { position: [3, 3, 2], visibilityBlockerSides: [5] },
      { position: [3, 3, 3], shapeFaces: [face({ fullAxisSide: null }), face({ fullAxisSide: 5 }), face({ fullAxisSide: 5 })] }
    ], [cell([2, 3, 2], [1, 0, 0])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 2)).toEqual([1 / 3, 0, 0, 0.5 / 3]);
  });

  it("preserves diagonal light when the remote shape leaves the blocked edge open", () => {
    const model = volume([
      { position: center }, { position: [3, 2, 2] }, { position: [3, 2, 3] },
      { position: [3, 3, 2], visibilityBlockerSides: [5] },
      { position: [3, 3, 3], lightCell: true, visibilityBlockerSides: [4] }
    ], [cell([2, 3, 2], [1, 0, 0]), cell([3, 3, 3], [0, 0, 1])]);
    expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), 2)).toEqual([1 / 3, 0, 1 / 3, 1 / 3]);
  });
});

describe("shape metadata and sampling limits", () => {
  it("maps both lateral slab orientations without reversing their closed face", () => {
    expect(starMadeSlabVisibilityBlockerSide(4)).toBe(4);
    expect(starMadeSlabVisibilityBlockerSide(5)).toBe(5);
  });

  it.each([2, 4, 5] as const)("derives inner light from the actual non-axis faces of block style %i", blockStyle => {
    const block = { blockStyle, transparent: false, lightSource: false, lodShape: "", lodShapeStyle: 0 as const };
    const solid = createStarMadeBlockLightSolidFromBlock(block, { position: center });
    const angledSides = [...new Set(solid.shapeFaces!.filter(entry => entry.surface && entry.fullAxisSide === null).map(entry => entry.lightSide))];
    expect(angledSides.length).toBeGreaterThan(0);
    expect(solid.innerLightSides).toEqual(angledSides);
    expect(solid.innerLightPassThroughSides).toEqual(angledSides);
    expect(solid.visibilityBlockerSides ?? []).toEqual([...new Set(solid.shapeFaces!.filter(entry => entry.fullAxisSide !== null).map(entry => entry.fullAxisSide))]);
  });

  it("does not treat an open LOD model as a solid visibility blocker", () => {
    const traits = starMadeBlockLightTraitsFromBlock({
      blockStyle: 1, transparent: false, lightSource: false, lodShape: "OpenModel", lodShapeStyle: 1
    });
    expect(traits.visibilityBlockerSides).toBeUndefined();
    expect(traits.lightCell).toBe(true);
  });

  it("provides a top-direction fallback for unknown primary LOD sides", () => {
    const lighting = computeStarMadeLodBlockLightFromSideData([], 99);
    expect(lighting.oppositePrimarySide).toBe(3);
    expect(lighting.lightDiffuse).toEqual(Array.from({ length: 5 }, () => [0, 0, 0, 0]));
    expect(lighting.lightVec).toEqual([[0, 1, 1], [0, 1, -1], [0, 2, 0], [1, 1, 0], [-1, 1, 0]]);
  });

  it("rejects invalid ray dimensions before producing NaN lighting or unbounded ray traversal", () => {
    for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createStarMadeOcclusionSample({ rayCount: value })).toThrow(/rayCount/);
      expect(() => createStarMadeOcclusionSample({ rayLength: value })).toThrow(/rayLength/);
    }
  });

  it("keeps low-count occlusion samples finite and starts each ray at a cardinal neighbor", () => {
    for (const rayCount of [1, 2, 8]) {
      const sample = createStarMadeOcclusionSample({ rayCount, rayLength: 1 });
      expect(sample.sideWeightInv.every(Number.isFinite)).toBe(true);
      for (const ray of sample.rays) {
        expect(ray.points).toHaveLength(3);
        expect(ray.points.reduce((sum, component) => sum + Math.abs(component), 0)).toBe(1);
        expect(ray.depths[0]).toBeGreaterThan(0);
      }
    }
    const result = computeStarMadeBlockLightVolume({ size: [2, 2, 2], sources: [], solids: [{ position: [0, 0, 0] }], rayCount: 1, rayLength: 1 });
    expect(result.cells.flatMap(entry => entry.occlusion).every(Number.isFinite)).toBe(true);
    expect(result.rayCount).toBe(1);
    expect(result.rayLength).toBe(1);
  });
});


describe("Slab closed edges prevent vertex-light leakage", () => {
  it.each([
    { side: 2, normal: [0, 1, 0], offset: [1, 0, 0], closed: 4, open: 5, corner: [1, 1, 1] },
    { side: 0, normal: [0, 0, 1], offset: [0, 1, 0], closed: 2, open: 3, corner: [1, 1, 1] },
    { side: 4, normal: [1, 0, 0], offset: [0, 0, 1], closed: 0, open: 1, corner: [1, 1, 1] }
  ] as const)("blocks sharing along the closed side on shaded face $side", ({ side, normal, offset, closed, open, corner }) => {
    const other = add(center, offset);
    const close = add(center, normal);
    for (const blockerSides of [[], [open], [closed]]) {
      const model = volume([
        { position: center }, { position: other },
        { position: close, lightCell: true, lightPassOnBlockItself: true,
          innerLightBlockedSides: [closed], visibilityBlockerSides: blockerSides }
      ], [cell(close, [1, 0, 0]), cell(add(other, normal), [0, 0, 1])]);
      // The blocked neighbor is a black contribution, not an omitted sample.
      expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt(corner), side))
        .toEqual(blockerSides[0] === closed ? [0.5, 0, 0, 0.25] : [0.5, 0, 0.5, 0.5]);
    }
  });
});


it("does not count the duplicate storage corner of a triangle twice", () => {
  const current = face({ sourceSide: 6, fullAxisSide: null, normal: [1, 1, 0] });
  const other = face({ ...current, vertices: [[-1, 1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1]] });
  const model = volume([{ position: center, shapeFaces: [current] },
    { position: [3, 2, 2], shapeFaces: [other] }], [cell([2, 3, 2], [1, 0, 0]), cell([3, 3, 2], [0, 0, 1])]);
  expect(getStarMadeBlockLightShapeFaceVertexLight(model, center, vertexAt([1, 1, 1]), current)).toEqual([0.5, 0, 0.5, 0.5]);
});
