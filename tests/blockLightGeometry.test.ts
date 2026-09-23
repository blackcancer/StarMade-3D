import { describe, expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, IntType } from "three";
import { applyStarMadeBlockLightToEncodedCubeGeometry } from "../src/geometry/blockLightGeometry";
import { createStarMadeEncodedCubeGeometry, createStarMadeEncodedCubeShapeFaces } from "../src/geometry/starmadeEncodedCube";
import { computeStarMadeBlockLightVolume, type StarMadeBlockLightVolume, type StarMadeGridPoint3 } from "../src/starmade/blockLighting";

describe("applyStarMadeBlockLightToEncodedCubeGeometry", () => {
  it.each([1, 3])("shares light at the actual fractional corners of slab %s", slab => {
    const options = {slab, orientation:2};
    const geo = createStarMadeEncodedCubeGeometry(options);
    const shapeFaces = createStarMadeEncodedCubeShapeFaces(options);
    const volume: StarMadeBlockLightVolume = {
      size:[6,6,6], rayCount:128, rayLength:22, colorPerm:31, lightScale:1.28, sources:[],
      solids:[{position:[2,2,2],shapeFaces},{position:[3,2,2],shapeFaces}],
      cells:[2,3].map(x=>({position:[x,2,3] as const, gather:[x===2?.2:.8,0,0] as const,
        lightDirection:[0,0,1] as const, occlusion:[1,1,1,1,1,1],sideLights:[],sideLightDirections:[]}))
    };
    applyStarMadeBlockLightToEncodedCubeGeometry(geo,[-16,-16,-16],{volume,volumeShift:[2,2,2]});
    const p=geo.getAttribute('position'),encoded=geo.getAttribute('ivert');
    let shared=0;
    for(let i=0;i<4;i++) if(p.getX(i)===.5) {
      expect((encoded.getX(i)>>>16)&31).toBe(Math.round((.2+.8)/2*1.28*31));
      shared++;
    }
    expect(shared).toBe(2);
  });
  it("returns zero counts when no encoded attribute is present", () => {
    const geo = new BufferGeometry();
    const volume = computeStarMadeBlockLightVolume({ size: [3, 3, 3], sources: [], solids: [] });
    const result = applyStarMadeBlockLightToEncodedCubeGeometry(geo, [0, 0, 0], {
      volume,
      volumeShift: [0, 0, 0]
    });
    expect(result.faceCount).toBe(0);
    expect(result.vertexCount).toBe(0);
  });

  it("returns zero counts for geometry without position attribute", () => {
    const geo = new BufferGeometry();
    const encoded = new Int32Array(4 * 4);
    geo.setAttribute("starMadeVertex", new BufferAttribute(encoded, 4));
    const volume = computeStarMadeBlockLightVolume({ size: [3, 3, 3], sources: [], solids: [] });
    const result = applyStarMadeBlockLightToEncodedCubeGeometry(geo, [0, 0, 0], {
      volume,
      volumeShift: [0, 0, 0]
    });
    expect(result.faceCount).toBe(0);
  });

  it("applies light encoding to a minimal 1-face geometry", () => {
    const geo = new BufferGeometry();
    const encoded = new Int32Array(4 * 4);
    // 4 vertices of 1 face, all zero-encoded (local position 0,0,0, face side 0)
    geo.setAttribute("starMadeVertex", new BufferAttribute(encoded, 4));
    geo.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));

    const volume = computeStarMadeBlockLightVolume({
      size: [5, 5, 5],
      sources: [{ grid: [2, 2], position: [2, 2, 2], color: [1, 1, 1, 1], active: true }],
      solids: []
    });

    const result = applyStarMadeBlockLightToEncodedCubeGeometry(geo, [0, 0, 0], {
      volume,
      volumeShift: [2, 2, 2],
      castBoost: 1.0,
      occlusionFloor: 0
    });

    expect(result.faceCount).toBe(1);
    expect(result.vertexCount).toBe(4);
    expect(geo.getAttribute("starMadeVertex")).not.toBeNull();
  });

  it("respects castBoost: brighter boost yields higher encoded light values", () => {
    const makeGeo = () => {
      const geo = new BufferGeometry();
      const encoded = new Int32Array(4 * 4);
      geo.setAttribute("starMadeVertex", new BufferAttribute(encoded, 4));
      geo.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
      return geo;
    };

    const volume = computeStarMadeBlockLightVolume({
      size: [5, 5, 5],
      sources: [{ grid: [2, 2], position: [2, 2, 2], color: [0.5, 0.5, 0.5, 1], active: true }],
      solids: []
    });

    const geo1 = makeGeo();
    const geo2 = makeGeo();

    applyStarMadeBlockLightToEncodedCubeGeometry(geo1, [0, 0, 0], {
      volume, volumeShift: [2, 2, 2], castBoost: 1.0
    });
    applyStarMadeBlockLightToEncodedCubeGeometry(geo2, [0, 0, 0], {
      volume, volumeShift: [2, 2, 2], castBoost: 3.0
    });

    const attr1 = geo1.getAttribute("starMadeVertex") as BufferAttribute;
    const attr2 = geo2.getAttribute("starMadeVertex") as BufferAttribute;

    // First vertex code: higher boost should yield >= same encoded value
    const v1 = attr1.getX(0);
    const v2 = attr2.getX(0);
    // The encoded red channel sits in bits 16-20
    const r1 = Math.floor(v1 / 65536) % 32;
    const r2 = Math.floor(v2 / 65536) % 32;
    expect(r2).toBeGreaterThanOrEqual(r1);
  });

  it("updates occlusion through the active StarMade shader's 5-bit secondary field", () => {
    const geo = new BufferGeometry();
    const encoded = new Int32Array(4 * 4);
    encoded[3] = 7 * 32768 + 2 * 1048576;
    geo.setAttribute("starMadeVertex", new BufferAttribute(encoded, 4));
    geo.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));

    const volume = computeStarMadeBlockLightVolume({ size: [3, 3, 3], sources: [], solids: [] });
    applyStarMadeBlockLightToEncodedCubeGeometry(geo, [0, 0, 0], {
      volume,
      volumeShift: [1, 1, 1],
      occlusionFloor: 1
    });

    const attr = geo.getAttribute("starMadeVertex") as BufferAttribute;
    const secondary = attr.getW(0);

    expect(Math.floor(secondary / 32768) % 32).toBe(31);
    expect(Math.floor(secondary / 1048576) % 4).toBe(2);
  });

  it("rejects undersized encodings without changing geometry attributes", () => {
    const geometry = new BufferGeometry();
    const encoded = new BufferAttribute(new Int32Array(12), 3);
    geometry.setAttribute("starMadeVertex", encoded);
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(12), 3));
    expect(applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [0, 0, 0], {
      volume: lightingFixture(), volumeShift: [0, 0, 0]
    })).toEqual({ faceCount: 0, vertexCount: 0 });
    expect(geometry.getAttribute("starMadeVertex")).toBe(encoded);
  });

  it("samples shared vertices after entity translation without counting the encoded segment offset twice", () => {
    const geometry = createStarMadeEncodedCubeGeometry({
      cubePosition: [16, 16, 16], chunkPosition: [129, 128, 127],
      visibleSides: [false, false, true, false, false, false]
    });
    const lighting = lightingFixture();
    const result = applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [26, 4, -18], {
      volume: lighting, volumeShift: [-40, -18, 4]
    });
    expect(result).toEqual({ faceCount: 1, vertexCount: 4 });
    const encoded = geometry.getAttribute("starMadeVertex") as BufferAttribute;
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < encoded.count; index++) {
      expect(decodeRgb(encoded.getX(index))).toEqual(positions.getX(index) > 32 ? [20, 0, 20] : [31, 0, 0]);
    }
    expect(geometry.getAttribute("ivert")).toBe(encoded);
    expect(encoded.gpuType).toBe(IntType);
  });

  it.each([
    { sourceSide: 0, encodedSide: 2, normalMode: 197, expected: [4, 0, 0] },
    { sourceSide: -1, encodedSide: 0, normalMode: 197, expected: [31, 0, 0] },
    { sourceSide: 6, encodedSide: 0, normalMode: 197, expected: [31, 0, 0] },
    { sourceSide: undefined, encodedSide: 0, normalMode: 80, expected: [4, 0, 0] }
  ])("resolves explicit sides, angled normals and canceled normals: %j", ({ sourceSide, encodedSide, normalMode, expected }) => {
    const geometry = singleFace(encodedSide, normalMode);
    geometry.userData.starMadeFaceSourceSides = [sourceSide];
    applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [-16, -16, -16], {
      volume: lightingFixture(false), volumeShift: [2, 2, 2]
    });
    expect(decodeRgb(geometry.getAttribute("starMadeVertex").getX(0))).toEqual(expected);
  });

  it.each([-1, 6])("leaves unsupported face side %i untouched", side => {
    const geometry = singleFace(side, 0);
    const before = Array.from(geometry.getAttribute("starMadeVertex").array);
    expect(applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [-16, -16, -16], {
      volume: lightingFixture(), volumeShift: [2, 2, 2]
    })).toEqual({ faceCount: 0, vertexCount: 0 });
    expect(Array.from(geometry.getAttribute("starMadeVertex").array)).toEqual(before);
  });

  it("does not borrow unrelated face light when the requested face has no sample", () => {
    const geometry = singleFace(0, 0);
    const lighting = lightingFixture(false);
    const sourceOnly: StarMadeBlockLightVolume = {
      ...lighting, solids: [],
      sources: [{ grid: [2, 2], position: [2, 2, 2], color: [1, 1, 1, 1] }],
      cells: [{ ...lighting.cells[0], gather: [-1, 0.1, 2], occlusion: [] }]
    };
    applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [-16, -16, -16], {
      volume: sourceOnly, volumeShift: [2, 2, 2], castBoost: 2, occlusionFloor: 0.5
    });
    const encoded = geometry.getAttribute("starMadeVertex");
    expect(decodeRgb(encoded.getX(0))).toEqual([0, 0, 0]);
    expect(Math.floor(encoded.getW(0) / 32768) % 32).toBe(16);
    expect(encoded.getZ(0)).toBe(128 + 128 * 256 + 128 * 65536);
  });

  it("keeps missing face samples dark instead of inventing a white ambient source", () => {
    const geometry = singleFace(5, 0);
    applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [-16, -16, -16], {
      volume: { ...lightingFixture(), solids: [], cells: [] }, volumeShift: [2, 2, 2]
    });
    expect(decodeRgb(geometry.getAttribute("starMadeVertex").getX(0))).toEqual([0, 0, 0]);
  });
});

function decodeRgb(value: number): readonly number[] {
  return [(value >>> 16) & 31, (value >>> 21) & 31, (value >>> 26) & 31];
}

function singleFace(side: number, normalMode: number): BufferGeometry {
  const geometry = createStarMadeEncodedCubeGeometry({ visibleSides: [false, false, true, false, false, false] });
  delete geometry.userData.starMadeFaceSourceSides;
  delete geometry.userData.starMadeShapeFaces;
  const encoded = geometry.getAttribute("starMadeVertex");
  for (let index = 0; index < encoded.count; index++) {
    encoded.setY(index, side * 4);
    encoded.setW(index, normalMode);
  }
  return geometry;
}

function lightingFixture(withNeighbor = true): StarMadeBlockLightVolume {
  const sample = (position: StarMadeGridPoint3, gather: readonly [number, number, number]) => ({
    position, gather, lightDirection: [0, 1, 0] as const, occlusion: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    sideLights: [], sideLightDirections: []
  });
  return {
    size: [5, 5, 5], sources: [], solids: [{ position: [2, 2, 2] }, ...(withNeighbor ? [{ position: [3, 2, 2] as const }] : [])],
    cells: [sample([2, 3, 2], [1, 0, 0]), sample([3, 3, 2], [0, 0, 1]), sample([2, 2, 3], [0.1, 0, 0])],
    rayCount: 128, rayLength: 22, colorPerm: 31, lightScale: 1.28
  };
}
