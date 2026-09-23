/** @fileoverview Native face transfer, geometric corner matching and shadow-depth regressions. */
import { describe, expect, it } from "vitest";
import { Box3, FloatType, NearestFilter, Vector3 } from "three";
import { applyStarMadeBlockLightToEncodedCubeGeometry, createStarMadeEncodedCubeGeometry,
  createStarMadeDirectionalShadowPipeline, createStarMadePointLightShadowPipeline,
  getStarMadeBlockLightFaceLight, getStarMadeBlockLightShapeFaceVertexLight,
  type StarMadeBlockLightVolume } from "../src";

const makeVolume = (): StarMadeBlockLightVolume => ({
  size: [4, 4, 4], rayCount: 128, rayLength: 22, colorPerm: 31, lightScale: 1.28, sources: [],
  solids: [{ position: [1, 0, 1] }, { position: [2, 0, 1] }],
  cells: [
    { position: [1, 1, 1], gather: [8, 0.2, 0.6], occlusion: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], lightDirection: [0, 1, 0], sideLights: [], sideLightDirections: [] },
    { position: [2, 1, 1], gather: [0, 0.4, 0.2], occlusion: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], lightDirection: [0, 1, 0], sideLights: [], sideLightDirections: [] }
  ]
});

describe("Lighting transport uses native clamping and geometric corners", () => {
  it("clamps each air-to-face transfer before sharing, rather than clamping the final average", () => {
    const volume = makeVolume();
    expect(getStarMadeBlockLightFaceLight(volume, [1, 0, 1], 2)).toEqual([1, 0.2, 0.6, 0.5]);
    // Two adjacent top faces share x=1.5. Native expectation: (min(8,1)+0)/2 = .5,
    // NOT min((8+0)/2,1) = 1. The volume itself must retain raw gather for diagnostics.
    const light = getStarMadeBlockLightShapeFaceVertexLight(volume, [1, 0, 1], [3, 1, 3], 2)!;
    expect(light[0]).toBe(0.5);
    expect(light[1]).toBeCloseTo(0.3);
    expect(light[2]).toBeCloseTo(0.4);
    expect(light[3]).toBe(0.5);
    expect(volume.cells[0].gather[0]).toBe(8);
  });

  it("packs equal RGB and occlusion at a shared corner regardless of the face's buffer ordinal", () => {
    const volume = makeVolume();
    const values: number[][] = [];
    for (const x of [1, 2]) {
      const geometry = createStarMadeEncodedCubeGeometry({ light: [0, 0, 0] });
      applyStarMadeBlockLightToEncodedCubeGeometry(geometry, [-16, -16, -16], { volume, volumeShift: [x, 0, 1] });
      const position = geometry.getAttribute("position"), encoded = geometry.getAttribute("ivert");
      let found = false;
      for (let i = 0; i < encoded.count; i++) {
        if (((encoded.getY(i) >>> 2) & 7) !== 2 || position.getX(i) + x !== 1.5 || position.getZ(i) + 1 !== 1.5) continue;
        values.push([(encoded.getX(i) >>> 16) & 31, (encoded.getX(i) >>> 21) & 31,
          (encoded.getX(i) >>> 26) & 31, (encoded.getW(i) >>> 15) & 31]);
        found = true;
      }
      expect(found).toBe(true);
      geometry.dispose();
    }
    // CenterVertex native multiplier is 1.28 on RGBA; quantization is round(x*31).
    expect(values).toEqual([[20, 12, 16, 20], [20, 12, 16, 20]]);
  });
});

describe("Raw depth has sufficient precision and no color interpolation", () => {
  it.each([1, 2, 3])("uses float nearest-sampled depth for %s directional split(s)", splitCount => {
    const pipeline = createStarMadeDirectionalShadowPipeline({
      sceneBounds: new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)), splitCount
    });
    expect(pipeline.renderTarget.texture.type).toBe(FloatType);
    expect(pipeline.renderTarget.texture.minFilter).toBe(NearestFilter);
    expect(pipeline.renderTarget.texture.magFilter).toBe(NearestFilter);
    pipeline.renderTarget.dispose();
  });
  it("does not quantize projected-source depth to eight bits", () => {
    const pipeline = createStarMadePointLightShadowPipeline({
      sources: [{ key: "test", position: new Vector3(0, 4, 0), color: new Vector3(1, 1, 1) }], receiverCenter: new Vector3()
    });
    expect(pipeline.renderTarget.texture.type).toBe(FloatType);
    expect(pipeline.renderTarget.texture.magFilter).toBe(NearestFilter);
    pipeline.renderTarget.dispose();
  });
});
