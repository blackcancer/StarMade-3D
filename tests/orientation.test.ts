import { describe, expect, it } from "vitest";
import {
  getStarMadeLodOrientationQuaternion,
  getStarMadeNormal24OrientationQuaternion
} from "../src/starmade/orientation";

describe("StarMade LOD orientation", () => {
  it("uses NORMAL24 orientation directly for normal LOD blocks", () => {
    expect(getStarMadeLodOrientationQuaternion(17, 6).toArray()).toEqual(
      getStarMadeNormal24OrientationQuaternion(17).toArray()
    );
  });

  it("maps sprite LOD orientations through StarMade's NORMAL24 buckets", () => {
    expect(getStarMadeLodOrientationQuaternion(2, 3).toArray()).toEqual(
      getStarMadeNormal24OrientationQuaternion(8).toArray()
    );
  });
});
