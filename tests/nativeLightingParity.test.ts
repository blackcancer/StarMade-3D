import { describe, expect, it } from "vitest";
import { computeStarMadeBlockLightVolume, getStarMadeBlockLightVolumeCell } from "../src";

describe("StarMade-Open Occlusion.gatherAirBlock raw radiance", () => {
  it("sums source radiance without an extra 128/rayCount exposure gain", () => {
    // Sample.java: one ray points along +X. Ray.java advances by .3;
    // its first grid crossing is at x=.6, so depths[0]=1/.6.
    // Occlusion.java: gather += color.rgb * depths[0] * 2.5 * color.a.
    // Only the six occlusion channels are normalized after the loop.
    const volume = computeStarMadeBlockLightVolume({
      size: [4, 3, 3], rayCount: 1, rayLength: 1,
      solids: [{position:[1, 0, 1]}],
      sources: [{grid:[2,1], position:[2,1,1], color:[.02,.04,.06,.5]}]
    });
    const cell = getStarMadeBlockLightVolumeCell(volume, [1,1,1]);
    expect(cell).toBeDefined();
    for (const [index, channel] of [.02,.04,.06].entries()) {
      expect(cell!.gather[index]).toBeCloseTo(channel * (1 / .6) * 2.5 * .5, 10);
    }
    expect(cell!.lightDirection).toEqual([1,0,0]);
  });
});
