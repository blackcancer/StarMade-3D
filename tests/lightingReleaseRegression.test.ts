/**
 * @fileoverview Regression tests for the assembled lighting.3 release.
 *
 * Exercises closed gather-cell boundaries on all six axes without treating a
 * partially occupied block as a full cube. Assertions use explicit face-color
 * oracles; GPU execution is qualified separately from these CPU tests.
 */
import { describe, expect, it } from "vitest";
import {
  createStarMadeLodSideDataFromVolume,
  computeStarMadeLodBlockLight,
  getStarMadeBlockLightFaceLight,
  getStarMadeBlockLightFaceLightDirection,
  type StarMadeBlockLightSolid,
  type StarMadeBlockLightSurface,
  type StarMadeBlockLightVolume,
  type StarMadeGridPoint3
} from "../src";

const directions = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]] as const;
const opposite = [1, 0, 3, 2, 5, 4] as const;
const receiver = [1, 1, 1] as const;

/**
 * Creates a detached volume with one lit gather cell adjacent to a receiver.
 * @param side - Receiver face pointing toward the gather cell.
 * @param policy - Optional solid policy at the gather cell; omission denotes air.
 * @returns Independent volume with known color, occlusion and light direction.
 */
function volumeFor(side: number, policy?: Partial<StarMadeBlockLightSolid>): StarMadeBlockLightVolume {
  const direction = directions[side];
  const donor: StarMadeGridPoint3 = [1 + direction[0], 1 + direction[1], 1 + direction[2]];
  return {
    size: [3, 3, 3], rayCount: 128, rayLength: 22, colorPerm: 31, lightScale: 1.28,
    sources: [], solids: [{ position: receiver }, ...(policy ? [{ ...policy, position: donor }] : [])],
    cells: [{ position: donor, gather: [0.2, 0.4, 0.6], occlusion: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      lightDirection: [1, 2, 3], sideLights: [], sideLightDirections: [] }]
  };
}

describe("Closed gather boundaries on cubes and LOD receivers", () => {
  it.each([0, 1, 2, 3, 4, 5])("does not export light through a closed boundary facing receiver side %s", side => {
    const volume = volumeFor(side, { lightPassOnBlockItself: true, visibilityBlockerSides: [opposite[side]] });
    expect(getStarMadeBlockLightFaceLight(volume, receiver, side)).toEqual([0, 0, 0, 0]);
    expect(getStarMadeBlockLightFaceLightDirection(volume, receiver, side)).toEqual([0, 0, 0]);
    expect(createStarMadeLodSideDataFromVolume(volume, receiver)[opposite[side]]).toEqual([0, 0, 0, 0]);
    expect(volume.cells[0].gather).toEqual([0.2, 0.4, 0.6]);
  });

  it.each([0, 1, 2, 3, 4, 5])("keeps open boundaries on receiver side %s transmissive", side => {
    const volume = volumeFor(side, { lightPassOnBlockItself: true, visibilityBlockerSides: [side] });
    expect(getStarMadeBlockLightFaceLight(volume, receiver, side)).toEqual([0.2, 0.4, 0.6, 0.5]);
    expect(getStarMadeBlockLightFaceLightDirection(volume, receiver, side)).toEqual([1, 2, 3]);
    expect(createStarMadeLodSideDataFromVolume(volume, receiver)[opposite[side]]).toEqual([0.2, 0.4, 0.6, 0.5]);
  });

  it.each([
    ["air", undefined, false],
    ["opaque unspecified boundary", {}, true],
    ["explicitly opaque", { lightPassOnBlockItself: false }, true],
    ["inner-light pass without full boundaries", { lightPassOnBlockItself: true }, false],
    ["empty closed-boundary set", { visibilityBlockerSides: [] }, false],
    ["passable material", { passable: true, visibilityBlockerSides: [3] }, false],
    ["native ray-passable exception", { rayPassable: true, visibilityBlockerSides: [3] }, false]
  ] as const)("respects %s rather than forcing a full-cube proxy", (_name, policy, blocked) => {
    const volume = volumeFor(2, policy);
    expect(getStarMadeBlockLightFaceLight(volume, receiver, 2)).toEqual(blocked ? [0, 0, 0, 0] : [0.2, 0.4, 0.6, 0.5]);
    expect(getStarMadeBlockLightFaceLightDirection(volume, receiver, 2)).toEqual(blocked ? [0, 0, 0] : [1, 2, 3]);
  });

  it.each([true, false])("applies the same closed-boundary policy to surface LODs (closed=%s)", closed => {
    const volume = volumeFor(5, { lightPassOnBlockItself: true, visibilityBlockerSides: closed ? [4] : [] });
    const donor = volume.cells[0];
    const surface: StarMadeBlockLightSurface = {
      size: 3, rayCount: 128, rayLength: 22, colorPerm: 31, lightScale: 1.28, volume,
      cells: Array.from({ length: 9 }, (_, index) => {
        const x = index % 3, z = Math.floor(index / 3);
        return { grid: [x, z], airPosition: [x, 1, z],
          gather: x === 0 && z === 1 ? donor.gather : [0, 0, 0],
          occlusion: donor.occlusion, topFaceLight: [0, 0, 0] };
      })
    };
    expect(computeStarMadeLodBlockLight({ surface, grid: [1, 1], primarySide: 2 }).sideData[4])
      .toEqual(closed ? [0, 0, 0, 0] : [0.2, 0.4, 0.6, 0.5]);
  });
});
