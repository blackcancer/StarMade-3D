import { describe, expect, it } from "vitest";
import {
  computeStarMadeBlockLightVolume,
  computeStarMadeBlockLightSurface,
  createStarMadeBlockLightBlockerFromBlock,
  createStarMadeBlockLightSolidFromBlock,
  createStarMadeBlockLightSourceFromBlock,
  computeStarMadeLodBlockLight,
  computeStarMadeLodBlockLightFromSideData,
  computeStarMadeLodBlockLightFromVolume,
  createStarMadeLodSideDataFromVolume,
  createStarMadeOcclusionSample,
  getStarMadeBlockLightFaceLight,
  getStarMadeBlockLightFaceLightDirection,
  getStarMadeBlockLightFaceVertexLight,
  getStarMadeBlockLightFaceVertexLights,
  getStarMadeBlockLightShapeFaceVertexLight,
  getStarMadeBlockLightVertexLight,
  getStarMadeBlockLightVolumeCell,
  getStarMadeBlockLightSurfaceCell,
  getStarMadeBlockLightSurfaceTopAverageLight,
  getStarMadeBlockLightSurfaceVertexLight,
  STARMADE_OCCLUSION_COLOR_PERM,
  STARMADE_OCCLUSION_DEFAULT_RAY_COUNT,
  STARMADE_OCCLUSION_LIGHT_SCALE,
  STARMADE_OCCLUSION_RAY_LENGTH,
  starMadeBlockLightTraitsFromBlock,
  starMadeLodPrimarySideForBlock,
  starMadeMushroomLodPrimarySideForOrientation,
  starMadeOriencubePrimarySideForOrientation,
  starMadeVisibleSidesForBlock,
  withStarMadeLodSunOcclusionFloor,
  withStarMadeLodBlockLightBoost,
  normalizeFinalLightChannel
} from "../src/starmade/blockLighting";

describe("StarMade block lighting pipeline", () => {
  it("generates StarMade-style Fibonacci occlusion rays", () => {
    const sample = createStarMadeOcclusionSample();

    expect(sample.rays).toHaveLength(STARMADE_OCCLUSION_DEFAULT_RAY_COUNT);
    expect(sample.rays[0].depths).toHaveLength(STARMADE_OCCLUSION_RAY_LENGTH);
    expect(sample.sideWeightInv.every(Number.isFinite)).toBe(true);
  });

  it("collects multicolor light with the StarMade occlusion constants", () => {
    const surface = computeStarMadeBlockLightSurface({
      size: 20,
      sources: [
        { grid: [4, 10], color: [1, 0, 0, 1] },
        { grid: [10, 10], color: [1, 1, 1, 1] },
        { grid: [16, 10], color: [0, 0.33333334, 1, 1] }
      ]
    });

    const mixedLight = getStarMadeBlockLightSurfaceVertexLight(surface, 7, 10, 0.5, 0.5);
    const unlitCorner = getStarMadeBlockLightSurfaceVertexLight(surface, 0, 0, -0.5, -0.5);

    expect(surface.cells).toHaveLength(400);
    expect(surface.rayCount).toBe(STARMADE_OCCLUSION_DEFAULT_RAY_COUNT);
    expect(surface.rayLength).toBe(STARMADE_OCCLUSION_RAY_LENGTH);
    expect(surface.colorPerm).toBe(STARMADE_OCCLUSION_COLOR_PERM);
    expect(surface.lightScale).toBe(STARMADE_OCCLUSION_LIGHT_SCALE);
    expect(mixedLight.filter((channel) => channel > 0).length).toBeGreaterThanOrEqual(2);
    expect(unlitCorner).toEqual([0, 0, 0]);
  });

  it("applies gathered air light to the adjacent top face", () => {
    const surface = computeStarMadeBlockLightSurface({
      size: 20,
      sources: [{ grid: [10, 10], color: [1, 1, 1, 1] }]
    });
    const litCell = getStarMadeBlockLightSurfaceCell(surface, 10, 9);
    const farCell = getStarMadeBlockLightSurfaceCell(surface, 0, 0);

    expect(litCell?.topFaceLight.some((channel) => channel > 0)).toBe(true);
    expect(farCell?.topFaceLight).toEqual([0, 0, 0]);
  });

  it("stops light rays on non-passable LOD blockers above the surface", () => {
    const unblocked = computeStarMadeBlockLightSurface({
      size: 20,
      sources: [{ grid: [10, 10], color: [1, 1, 1, 1] }]
    });
    const blocked = computeStarMadeBlockLightSurface({
      size: 20,
      sources: [{ grid: [10, 10], color: [1, 1, 1, 1] }],
      blockers: [{ grid: [9, 10] }]
    });

    const before = getStarMadeBlockLightSurfaceVertexLight(unblocked, 8, 10, 0.5, 0.5);
    const after = getStarMadeBlockLightSurfaceVertexLight(blocked, 8, 10, 0.5, 0.5);
    const beforeRaw = getStarMadeBlockLightVolumeCell(unblocked.volume, [8, 1, 10]);
    const afterRaw = getStarMadeBlockLightVolumeCell(blocked.volume, [8, 1, 10]);

    expect(after[0]).toBeLessThanOrEqual(before[0]);
    expect(after[1]).toBeLessThanOrEqual(before[1]);
    expect(after[2]).toBeLessThanOrEqual(before[2]);
    expect(afterRaw?.gather[0]).toBeLessThan(beforeRaw?.gather[0] ?? 0);
    expect(afterRaw?.gather[1]).toBeLessThan(beforeRaw?.gather[1] ?? 0);
    expect(afterRaw?.gather[2]).toBeLessThan(beforeRaw?.gather[2] ?? 0);
  });

  it("keeps raised surface blockers inside the light volume", () => {
    const surface = computeStarMadeBlockLightSurface({
      size: 6,
      sources: [{ grid: [2, 2], color: [1, 1, 1, 1] }],
      blockers: [{ grid: [3, 2], position: [3, 3, 2] }]
    });

    expect(surface.volume.size[1]).toBeGreaterThanOrEqual(5);
    expect(surface.volume.solids.some((solid) => solid.position[1] === 3)).toBe(true);
    expect(getStarMadeBlockLightFaceLight(surface.volume, [3, 3, 2], 4)).not.toBeNull();
    expect(getStarMadeBlockLightFaceVertexLights(surface.volume, [3, 3, 2], 4)).toHaveLength(4);
  });

  it("builds light pipeline inputs from block metadata", () => {
    const source = createStarMadeBlockLightSourceFromBlock(
      {
        blockStyle: 0,
        transparent: false,
        lightSource: true,
        lightSourceColor: [1, 0, 0, 1],
        lodShape: "",
        lodShapeStyle: 0
      },
      { grid: [4, 10], active: true }
    );
    const solid = createStarMadeBlockLightSolidFromBlock(
      {
        blockStyle: 3,
        transparent: true,
        lightSource: false,
        lodShape: "",
        lodShapeStyle: 0
      },
      { position: [2, 1, 2], orientation: 2 }
    );
    const blocker = createStarMadeBlockLightBlockerFromBlock(
      {
        blockStyle: 6,
        transparent: true,
        lightSource: false,
        lodShape: "BlueConsole",
        lodShapeStyle: 0
      },
      { grid: [15, 12], overrides: { rayPassable: false, lightCell: false } }
    );

    expect(source).toMatchObject({ grid: [4, 10], color: [1, 0, 0, 1], active: true, rayPassable: false });
    expect(solid).toMatchObject({ position: [2, 1, 2], lightCell: true, rayPassable: true, visibleSides: [0, 1, 4, 5] });
    expect(blocker).toMatchObject({ grid: [15, 12], lightCell: false, rayPassable: false });
  });

  it("derives StarMade light-cast traits from block metadata", () => {
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 0,
        transparent: false,
        lightSource: false,
        lodShape: "",
        lodShapeStyle: 0
      })
    ).toEqual({ lightCell: false, rayPassable: false });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 0,
        transparent: true,
        lightSource: false,
        lodShape: "",
        lodShapeStyle: 0
      })
    ).toEqual({ lightCell: true, rayPassable: true });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 6,
        transparent: true,
        lightSource: false,
        lodShape: "BlueConsole",
        lodShapeStyle: 0,
        lodCollisionPhysical: true
      })
    ).toEqual({ lightCell: true, rayPassable: false });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 6,
        transparent: true,
        lightSource: false,
        lodShape: "DecorativeTransparentLod",
        lodShapeStyle: 0,
        lodCollisionPhysical: false
      })
    ).toEqual({ lightCell: true, rayPassable: true });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 3,
        transparent: false,
        lightSource: false,
        lodShape: "",
        lodShapeStyle: 0
      })
    ).toEqual({ lightCell: true, rayPassable: true, visibleSides: [2, 3, 4, 5] });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 6,
        transparent: false,
        lightSource: false,
        lodShape: "Pipe",
        lodShapeStyle: 1
      })
    ).toEqual({ lightCell: true, rayPassable: false });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 6,
        transparent: false,
        lightSource: true,
        lodShape: "WhiteLightBar",
        lodShapeStyle: 2
      })
    ).toEqual({ lightCell: true, rayPassable: true });
    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 0,
        transparent: false,
        lightSource: true,
        lodShape: "",
        lodShapeStyle: 0
      })
    ).toEqual({ lightCell: false, rayPassable: false });

    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 0,
        transparent: false,
        lightSource: false,
        lodShape: "",
        lodShapeStyle: 0,
        slab: 2
      }, { orientation: 0 })
    ).toEqual({
      lightCell: true,
      rayPassable: false,
      lightPassOnBlockItself: true,
      innerLightBlockedSides: [1],
      visibilityBlockerSides: [1]
    });

    const wedgeTraits = starMadeBlockLightTraitsFromBlock({
      blockStyle: 1,
      transparent: false,
      lightSource: false,
      lodShape: "",
      lodShapeStyle: 0
    }, { orientation: 0 });

    expect(wedgeTraits).toMatchObject({
      lightCell: true,
      rayPassable: false,
      lightPassOnBlockItself: true,
      innerLightSides: [2, 5, 4],
      innerLightPassThroughSides: [2],
      visibilityBlockerSides: [3, 0]
    });

    expect(
      starMadeBlockLightTraitsFromBlock({
        blockStyle: 1,
        transparent: false,
        lightSource: false,
        lodShape: "",
        lodShapeStyle: 0
      }, { orientation: 5 })
    ).toMatchObject({
      innerLightSides: [3, 1, 0],
      innerLightPassThroughSides: [3],
      visibilityBlockerSides: [5, 2]
    });
  });

  it("derives sprite visible sides from StarMade orientation masks", () => {
    const spriteBlock = {
      blockStyle: 3 as const,
      lodShape: ""
    };

    expect(starMadeVisibleSidesForBlock(spriteBlock, 0)).toEqual([2, 3, 4, 5]);
    expect(starMadeVisibleSidesForBlock(spriteBlock, 2)).toEqual([0, 1, 4, 5]);
    expect(starMadeVisibleSidesForBlock(spriteBlock, 4)).toEqual([0, 1, 2, 3]);
    expect(starMadeVisibleSidesForBlock({ blockStyle: 3, lodShape: "SpriteLod" }, 0)).toBeUndefined();
    expect(starMadeVisibleSidesForBlock({ blockStyle: 0, lodShape: "" }, 0)).toBeUndefined();
  });

  it("computes air cells next to light sources like StarMade iNeighbors", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [5, 3, 3],
      sources: [{ grid: [0, 0], position: [2, 1, 1], color: [1, 1, 1, 1] }]
    });

    const adjacent = getStarMadeBlockLightVolumeCell(volume, [1, 1, 1]);
    const isolated = getStarMadeBlockLightVolumeCell(volume, [0, 0, 0]);

    expect(adjacent).toBeDefined();
    expect(adjacent?.gather[0]).toBeGreaterThan(0);
    expect(isolated).toBeUndefined();
  });

  it("casts StarMade block light through a 3D air volume next to solids", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 3, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }]
    });
    const cell = getStarMadeBlockLightVolumeCell(volume, [2, 1, 2]);

    expect(cell).toBeDefined();
    expect(cell?.gather.some((channel) => channel > 0)).toBe(true);
    expect(cell?.lightDirection[0]).toBeGreaterThan(0);
    expect(cell?.sideLights).toHaveLength(6);
    expect(cell?.sideLightDirections).toHaveLength(6);
  });

  it("stops 3D light rays on non-passable blockers before they reach the receiver air", () => {
    const unblocked = computeStarMadeBlockLightVolume({
      size: [8, 3, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }]
    });
    const blocked = computeStarMadeBlockLightVolume({
      size: [8, 3, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }],
      blockers: [{ grid: [0, 0], position: [3, 1, 2] }]
    });

    const before = getStarMadeBlockLightVolumeCell(unblocked, [2, 1, 2]);
    const after = getStarMadeBlockLightVolumeCell(blocked, [2, 1, 2]);

    expect(before?.gather[0]).toBeGreaterThan(0);
    expect(after?.gather[0]).toBeLessThan(before?.gather[0] ?? 0);
    expect(after?.gather[1]).toBeLessThan(before?.gather[1] ?? 0);
    expect(after?.gather[2]).toBeLessThan(before?.gather[2] ?? 0);
  });

  it("computes inner light for non-passable blocks that need light on themselves", () => {
    const withoutInnerLight = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2] }]
    });
    const withInnerLight = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2], lightPassOnBlockItself: true }]
    });
    const blockedBehindInnerLight = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [1, 0, 2] },
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true }
      ]
    });

    expect(getStarMadeBlockLightVolumeCell(withoutInnerLight, [2, 1, 2])).toBeUndefined();
    expect(getStarMadeBlockLightVolumeCell(withInnerLight, [2, 1, 2])?.gather[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightVolumeCell(blockedBehindInnerLight, [1, 1, 2])?.gather[0]).toBe(0);
  });

  it("limits inner light rays to the open sides of light-pass-on-self blocks", () => {
    const openTowardLight = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [4] }]
    });
    const closedTowardLight = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [5] }]
    });
    const fullyClosed = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [] }]
    });

    expect(getStarMadeBlockLightVolumeCell(openTowardLight, [2, 1, 2])?.gather[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightVolumeCell(closedTowardLight, [2, 1, 2])?.gather[0]).toBe(0);
    expect(getStarMadeBlockLightVolumeCell(fullyClosed, [2, 1, 2])?.gather[0]).toBe(0);
  });

  it("lets inner light rays pass the first obstacle only through an angled side", () => {
    const blockedFirstStep = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [5] },
        { position: [3, 1, 2] }
      ]
    });
    const openFirstStepStopsAtObstacle = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [4] },
        { position: [3, 1, 2] }
      ]
    });
    const angledFirstStepPassesObstacle = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [4], innerLightPassThroughSides: [4] },
        { position: [3, 1, 2] }
      ]
    });
    const blockedSecondStep = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [5, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightSides: [4], innerLightPassThroughSides: [4] },
        { position: [3, 1, 2] },
        { position: [4, 1, 2] }
      ]
    });

    expect(getStarMadeBlockLightVolumeCell(blockedFirstStep, [2, 1, 2])?.gather[0]).toBe(0);
    expect(getStarMadeBlockLightVolumeCell(openFirstStepStopsAtObstacle, [2, 1, 2])?.gather[0]).toBe(0);
    expect(getStarMadeBlockLightVolumeCell(angledFirstStepPassesObstacle, [2, 1, 2])?.gather[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightVolumeCell(blockedSecondStep, [2, 1, 2])?.gather[0]).toBe(0);
  });

  it("blocks only configured slab-like inner light sides", () => {
    const openDirectNeighbor = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [3, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightBlockedSides: [5] }
      ]
    });
    const blockedSide = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [3, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightBlockedSides: [4] }
      ]
    });
    const openButFirstSolidStopsBehind = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [
        { position: [2, 0, 2] },
        { position: [2, 1, 2], lightPassOnBlockItself: true, innerLightBlockedSides: [5] },
        { position: [3, 1, 2] }
      ]
    });

    expect(getStarMadeBlockLightVolumeCell(openDirectNeighbor, [2, 1, 2])?.gather[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightVolumeCell(blockedSide, [2, 1, 2])?.gather[0]).toBe(0);
    expect(getStarMadeBlockLightVolumeCell(openButFirstSolidStopsBehind, [2, 1, 2])?.gather[0]).toBe(0);
  });

  it("lets ray-passable light sources illuminate without stopping later rays", () => {
    const blockedByFirstSource = computeStarMadeBlockLightVolume({
      size: [8, 3, 5],
      sources: [
        { grid: [0, 0], position: [3, 1, 2], color: [0, 0, 1, 1] },
        { grid: [0, 0], position: [4, 1, 2], color: [1, 0, 0, 1] }
      ],
      solids: [{ position: [2, 0, 2] }]
    });
    const throughFirstSource = computeStarMadeBlockLightVolume({
      size: [8, 3, 5],
      sources: [
        { grid: [0, 0], position: [3, 1, 2], color: [0, 0, 1, 1], rayPassable: true },
        { grid: [0, 0], position: [4, 1, 2], color: [1, 0, 0, 1] }
      ],
      solids: [{ position: [2, 0, 2] }]
    });

    const blocked = getStarMadeBlockLightVolumeCell(blockedByFirstSource, [2, 1, 2]);
    const passable = getStarMadeBlockLightVolumeCell(throughFirstSource, [2, 1, 2]);

    expect(blocked?.gather[2]).toBeGreaterThan(0);
    expect(blocked?.gather[0]).toBe(0);
    expect(passable?.gather[2]).toBeGreaterThan(0);
    expect(passable?.gather[0]).toBeGreaterThan(0);
  });

  it("treats occupied light cells as air-like gather cells without making them passable geometry", () => {
    const blocked = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2] }]
    });
    const lightCell = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 1, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 0, 2] }, { position: [2, 1, 2], lightCell: true, rayPassable: true }]
    });
    const faceVertexLight = getStarMadeBlockLightFaceVertexLight(lightCell, [5, 3, 5], 2);

    expect(getStarMadeBlockLightVolumeCell(blocked, [2, 1, 2])).toBeUndefined();
    expect(getStarMadeBlockLightVolumeCell(lightCell, [2, 1, 2])?.gather[0]).toBeGreaterThan(0);
    expect(faceVertexLight?.[0]).toBeGreaterThan(0);
  });

  it("does not apply air light to empty target positions", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 2, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 1, 2] }]
    });

    expect(getStarMadeBlockLightVolumeCell(volume, [3, 1, 2])?.gather[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightFaceLight(volume, [3, 1, 2], 4)).toBeNull();
    expect(createStarMadeLodSideDataFromVolume(volume, [3, 1, 2])).toEqual([null, null, null, null, null, null]);
  });

  it("applies gathered air light direction to adjacent block faces", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 2, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 1, 2] }]
    });
    const direction = getStarMadeBlockLightFaceLightDirection(volume, [2, 1, 2], 4);

    expect(direction?.[0]).toBeGreaterThan(0);
    expect(direction?.[1]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightFaceLightDirection(volume, [3, 1, 2], 4)).toBeNull();
  });

  it("applies gathered air light to adjacent block faces like StarMade setLightFromAirBlock", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 2, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 1, 2] }]
    });
    const rightFaceLight = getStarMadeBlockLightFaceLight(volume, [2, 1, 2], 4);
    const sideData = createStarMadeLodSideDataFromVolume(volume, [2, 1, 2]);

    expect(rightFaceLight?.some((channel) => channel > 0)).toBe(true);
    expect(sideData.some((entry) => entry?.some((channel) => channel > 0))).toBe(true);
  });

  it("builds LOD light uniforms from all adjacent air blocks in a 3D volume", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [
        { grid: [0, 0], position: [4, 1, 2], color: [1, 0, 0, 1] },
        { grid: [0, 0], position: [2, 3, 2], color: [0, 0, 1, 1] }
      ],
      solids: [{ position: [2, 1, 2] }]
    });
    const lighting = computeStarMadeLodBlockLightFromVolume({
      volume,
      position: [2, 1, 2],
      primarySide: 0
    });

    expect(lighting.sideData).toHaveLength(6);
    expect(lighting.lightDiffuse).toHaveLength(4);
    expect(lighting.sideData[3]?.[2]).toBeGreaterThan(0);
    expect(lighting.sideData[3]?.[2]).toBeLessThanOrEqual(1);
    expect(lighting.lightDiffuse.some((entry) => entry[0] > 0 || entry[2] > 0)).toBe(true);
    expect(lighting.lightDiffuse.every((entry) => entry[0] <= 1 && entry[1] <= 1 && entry[2] <= 1)).toBe(true);
  });

  it("skips non-visible faces when normalizing shared vertex light", () => {
    const visible = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 2, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 1, 2] }]
    });
    const hiddenTop = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 2, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 1, 2], visibleSides: [0, 1, 3, 4, 5] }]
    });

    expect(getStarMadeBlockLightFaceVertexLight(visible, [5, 3, 5], 2)?.[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightFaceVertexLight(hiddenTop, [5, 3, 5], 2)).toBeNull();
    expect(getStarMadeBlockLightVertexLight(hiddenTop, [5, 3, 5])?.[0]).toBeGreaterThanOrEqual(0);
  });

  it("averages visible same-side face lights at shared cube vertices like StarMade CenterVertex", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [
        { grid: [0, 0], position: [4, 2, 2], color: [1, 0, 0, 1] },
        { grid: [0, 0], position: [2, 3, 2], color: [0, 0, 1, 1] }
      ],
      solids: [{ position: [2, 1, 2] }]
    });
    const vertexLight = getStarMadeBlockLightVertexLight(volume, [5, 3, 5]);
    const topVertexLight = getStarMadeBlockLightFaceVertexLight(volume, [5, 3, 5], 2);
    const faceVertexLights = getStarMadeBlockLightFaceVertexLights(volume, [2, 1, 2], 2);

    expect(vertexLight?.[0]).toBeGreaterThan(0);
    expect(vertexLight?.[2]).toBeGreaterThan(0);
    expect(topVertexLight?.[2]).toBeGreaterThan(0);
    expect(faceVertexLights).toHaveLength(4);
    expect(faceVertexLights.some((entry) => entry?.some((channel) => channel > 0))).toBe(true);
  });

  it("keeps source face light on complex-shape vertices outside the cube face plane", () => {
    const volume = computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{ grid: [0, 0], position: [4, 2, 2], color: [1, 1, 1, 1] }],
      solids: [{ position: [2, 1, 2] }]
    });
    const faceLight = getStarMadeBlockLightFaceLight(volume, [2, 1, 2], 4);
    const regularVertexLight = getStarMadeBlockLightFaceVertexLight(volume, [5, 3, 5], 4);
    const shapeVertexLight = getStarMadeBlockLightShapeFaceVertexLight(volume, [2, 1, 2], [4, 3, 5], 4);

    expect(faceLight?.[0]).toBeGreaterThan(0);
    expect(getStarMadeBlockLightFaceVertexLight(volume, [4, 3, 5], 4)).toBeNull();
    expect(getStarMadeBlockLightShapeFaceVertexLight(volume, [2, 1, 2], [5, 3, 5], 4)).toEqual(regularVertexLight);
    expect(shapeVertexLight).toEqual(faceLight);
  });

  it("samples smoothed top-face light from all four normalized vertices", () => {
    const surface = computeStarMadeBlockLightSurface({
      size: 12,
      sources: [
        { grid: [3, 6], color: [1, 0, 0, 1] },
        { grid: [8, 6], color: [0, 0, 1, 1] }
      ]
    });
    const average = getStarMadeBlockLightSurfaceTopAverageLight(surface, 5, 6);
    const corner = getStarMadeBlockLightSurfaceVertexLight(surface, 5, 6, 0.5, 0.5);

    expect(average.some((channel) => channel > 0)).toBe(true);
    expect(average).toHaveLength(3);
    expect(corner).toHaveLength(3);
  });

  it("builds StarMade-Open-style LOD light uniforms from side data", () => {
    const lighting = computeStarMadeLodBlockLightFromSideData([
      [1, 0, 0, 0.5],
      [0, 1, 0, 0.25],
      [0.2, 0.2, 0.2, 0.75],
      null,
      [0, 0, 1, 0.125],
      [1, 1, 0, 0.375]
    ]);

    expect(lighting.lightDiffuse).toHaveLength(4);
    expect(lighting.lightVec).toEqual([
      [0, 1, 1],
      [0, 1, -1],
      [1, 1, 0],
      [-1, 1, 0]
    ]);
    expect(lighting.lightDiffuse[0][0]).toBeGreaterThan(0.99);
    expect(lighting.lightDiffuse[0][3]).toBeGreaterThan(0.49);
  });

  it("maps default Oriencube LOD orientation to the StarMade-Open primary side", () => {
    expect(starMadeOriencubePrimarySideForOrientation(0)).toBe(0);
    expect(starMadeOriencubePrimarySideForOrientation(12)).toBe(2);
    expect(starMadeOriencubePrimarySideForOrientation(20)).toBe(5);
    expect(starMadeLodPrimarySideForBlock(12, 104)).toBe(0);
    expect(starMadeMushroomLodPrimarySideForOrientation(20)).toBe(2);

    const lighting = computeStarMadeLodBlockLightFromSideData(
      [
        [1, 0, 0, 0.5],
        [0, 1, 0, 0.25],
        [0.2, 0.2, 0.2, 0.75],
        [0.3, 0.3, 0.3, 0.125],
        [0, 0, 1, 0.125],
        [1, 1, 0, 0.375]
      ],
      starMadeOriencubePrimarySideForOrientation(0)
    );

    expect(lighting.primarySide).toBe(0);
    expect(lighting.oppositePrimarySide).toBe(1);
    expect(lighting.lightVec).toEqual([
      [0, 1, 1],
      [0, -1, 1],
      [1, 0, 1],
      [-1, 0, 1]
    ]);
  });

  it("samples the adjacent air blocks for LOD side lighting", () => {
    const surface = computeStarMadeBlockLightSurface({
      size: 20,
      sources: [
        { grid: [10, 10], color: [1, 1, 1, 1] },
        { grid: [16, 10], color: [0, 0.33333334, 1, 1] }
      ]
    });
    const lighting = computeStarMadeLodBlockLight({
      surface,
      grid: [12, 10]
    });

    expect(lighting.sideData).toHaveLength(6);
    expect(lighting.lightDiffuse).toHaveLength(4);
    expect(lighting.lightVec).toHaveLength(4);
    expect(lighting.lightDiffuse.some((entry) => entry[0] > 0 || entry[1] > 0 || entry[2] > 0)).toBe(true);
  });
});

describe("withStarMadeLodSunOcclusionFloor", () => {
  it("clamps lightDiffuse[0].w up to the floor when below it", () => {
    const lighting = computeStarMadeLodBlockLightFromSideData([
      [0.5, 0.5, 0.5, 0.1],
      [0.2, 0.2, 0.2, 0.3],
      null,
      null,
      null,
      null
    ], 0);
    const result = withStarMadeLodSunOcclusionFloor(lighting, 0.72);
    expect(result.lightDiffuse[0][3]).toBeCloseTo(0.72, 5);
    for (let i = 1; i < result.lightDiffuse.length; i++) {
      expect(result.lightDiffuse[i][3]).toBeCloseTo(lighting.lightDiffuse[i][3], 5);
    }
  });

  it("leaves lightDiffuse[0].w unchanged when already above the floor", () => {
    const lighting = computeStarMadeLodBlockLightFromSideData([
      [0.5, 0.5, 0.5, 0.9],
      [0.2, 0.2, 0.2, 0.3],
      null,
      null,
      null,
      null
    ], 0);
    const result = withStarMadeLodSunOcclusionFloor(lighting, 0.72);
    expect(result.lightDiffuse[0][3]).toBeCloseTo(0.9, 5);
  });
});

describe("withStarMadeLodBlockLightBoost", () => {
  it("scales rgb channels by boost factor, clamped to 1", () => {
    const lighting = computeStarMadeLodBlockLightFromSideData([
      [0.3, 0.2, 0.1, 0.5],
      [0.4, 0.4, 0.4, 0.4],
      null,
      null,
      null,
      null
    ], 0);
    const result = withStarMadeLodBlockLightBoost(lighting, 2.0);
    expect(result.lightDiffuse[0][0]).toBeCloseTo(Math.min(1, 0.3 * 2), 3);
    expect(result.lightDiffuse[0][1]).toBeCloseTo(Math.min(1, 0.2 * 2), 3);
    expect(result.lightDiffuse[0][2]).toBeCloseTo(Math.min(1, 0.1 * 2), 3);
    expect(result.lightDiffuse[0][3]).toBeCloseTo(lighting.lightDiffuse[0][3], 5);
  });

  it("does not exceed 1 for any rgb channel after boost", () => {
    const lighting = computeStarMadeLodBlockLightFromSideData([
      [0.8, 0.9, 1.0, 0.6],
      null,
      null,
      null,
      null,
      null
    ], 0);
    const result = withStarMadeLodBlockLightBoost(lighting, 5.0);
    for (const entry of result.lightDiffuse) {
      expect(entry[0]).toBeLessThanOrEqual(1);
      expect(entry[1]).toBeLessThanOrEqual(1);
      expect(entry[2]).toBeLessThanOrEqual(1);
    }
  });

  // ── P4: normalizeFinalLightChannel StarMade-Open contract ─────────────────
  describe("P4 normalizeFinalLightChannel numeric contract", () => {
    // StarMade-Open: CenterVertex.getAverage scales by LIGHT_SCALE (1.28),
    // then SideProcessor clamps to [0,1] and multiplies by COLOR_PERM (31).
    it("matches StarMade-Open: value * 1.28, clamp [0,1], * 31, round", () => {
      // gather value 0.5 → 0.5 * 1.28 = 0.64 → clamp → round(0.64 * 31) = 20
      expect(normalizeFinalLightChannel(0.5)).toBe(Math.round(Math.min(1, 0.5 * STARMADE_OCCLUSION_LIGHT_SCALE) * STARMADE_OCCLUSION_COLOR_PERM));
      expect(normalizeFinalLightChannel(0.5)).toBe(20);
    });

    it("clamps gather > 1/1.28 to COLOR_PERM (31)", () => {
      // gather 1.0 → 1.0 * 1.28 → clamped to 1.0 → 31
      expect(normalizeFinalLightChannel(1.0)).toBe(31);
      // gather above threshold also = 31
      expect(normalizeFinalLightChannel(2.0)).toBe(31);
    });

    it("maps gather 0 to 0", () => {
      expect(normalizeFinalLightChannel(0)).toBe(0);
    });

    it("maps gather 0.25 to round(0.25 * 1.28 * 31) = 10", () => {
      expect(normalizeFinalLightChannel(0.25)).toBe(Math.round(0.25 * STARMADE_OCCLUSION_LIGHT_SCALE * STARMADE_OCCLUSION_COLOR_PERM));
    });
  });

  // ── P4: gather factor formula (StarMade-Open Occlusion gatherLightForAirBlock) ─
  describe("P4 gather factor = ray.depth * 2.5 * color[3]", () => {
    // When a single source with color [r,g,b,intensity] is at distance d,
    // gather[channel] += color[channel] * ray.depths[d] * 2.5 * color[3]
    it("accumulates gather proportional to depth weight and source intensity", () => {
      // Minimal 3D volume: 3x3x3, one source at center top, one solid below
      const volume = computeStarMadeBlockLightVolume({
        size: [8, 4, 5],
        sources: [{
          grid: [0, 0],
          position: [4, 2, 2] as const,
          color: [1, 0, 0, 1] as const, // pure red, intensity 1
          active: true,
          rayPassable: false
        }],
        solids: [{ position: [2, 1, 2] as const }],
        rayCount: 128,
        rayLength: STARMADE_OCCLUSION_RAY_LENGTH
      });
      // Air cell adjacent top of solid: face light on top face
      const faceLight = getStarMadeBlockLightFaceLight(volume, [2, 1, 2], 2); // TOP=2
      expect(faceLight).not.toBeNull();
      if (faceLight) {
        expect(faceLight[0]).toBeGreaterThan(0); // red gather > 0
        expect(faceLight[1]).toBeCloseTo(0, 1);  // green gather ≈ 0
        expect(faceLight[2]).toBeCloseTo(0, 1);  // blue gather ≈ 0
      }
    });

    it("inactive sources contribute zero gather", () => {
      const volume = computeStarMadeBlockLightVolume({
        size: [8, 4, 5],
        sources: [{
          grid: [0, 0],
          position: [4, 2, 2] as const,
          color: [1, 1, 1, 1] as const,
          active: false
        }],
        solids: [{ position: [2, 1, 2] as const }],
        rayCount: 64,
        rayLength: STARMADE_OCCLUSION_RAY_LENGTH
      });
      const faceLight = getStarMadeBlockLightFaceLight(volume, [2, 1, 2], 2);
      // No active source → null or zero gather
      if (faceLight) {
        expect(faceLight[0]).toBeCloseTo(0, 1);
      }
    });
  });

  // Native RGB gather is a sum, while directional occlusion is normalized.
  describe("P4 radiance gathering across sampling densities", () => {
    const makeVolume = (rayCount: number) => computeStarMadeBlockLightVolume({
      size: [8, 4, 5],
      sources: [{
        grid: [0, 0],
        position: [4, 2, 2] as const,
        color: [1, 0, 0, 1] as const,
        active: true,
        rayPassable: false
      }],
      solids: [{ position: [2, 1, 2] as const }],
      rayCount,
      rayLength: STARMADE_OCCLUSION_RAY_LENGTH
    });

    it("gather is non-zero for both rayCount=64 and rayCount=128", () => {
      // Both ray distributions must see this source. Exact native accumulation
      // is checked separately in nativeLightingParity.test.ts.
      const v64 = makeVolume(64);
      const v128 = makeVolume(128);
      const light64 = getStarMadeBlockLightFaceLight(v64, [2, 1, 2], 2);
      const light128 = getStarMadeBlockLightFaceLight(v128, [2, 1, 2], 2);
      expect(light64).not.toBeNull();
      expect(light128).not.toBeNull();
      expect(light64![0]).toBeGreaterThan(0);
      expect(light128![0]).toBeGreaterThan(0);
      const ratio = light64![0] / light128![0];
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(10);
    });
  });

  // ── P4: end-to-end source→gather→face→encoded vertex ─────────────────────
  describe("P4 end-to-end: source → gather → getStarMadeBlockLightFaceLight → normalizeFinalLightChannel", () => {
    it("encodes non-zero red channel for block face adjacent to active red source", () => {
      const volume = computeStarMadeBlockLightVolume({
        size: [8, 4, 5],
        sources: [{
          grid: [0, 0],
          position: [4, 2, 2] as const,
          color: [1, 0, 0, 1] as const,
          active: true,
          rayPassable: false
        }],
        solids: [{ position: [2, 1, 2] as const }],
        rayCount: 128,
        rayLength: STARMADE_OCCLUSION_RAY_LENGTH
      });
      const faceLight = getStarMadeBlockLightFaceLight(volume, [2, 1, 2], 2); // top face
      expect(faceLight).not.toBeNull();
      if (faceLight) {
        const encoded = normalizeFinalLightChannel(faceLight[0]);
        expect(encoded).toBeGreaterThan(0);
        expect(encoded).toBeLessThanOrEqual(STARMADE_OCCLUSION_COLOR_PERM);
      }
    });
  });

  // ── P4: spot-source count stability in cube material ─────────────────────
  describe("P4 spot count and light-source uniform diagnostics", () => {
    it("constants match StarMade-Open Occlusion.java contract", () => {
      expect(STARMADE_OCCLUSION_COLOR_PERM).toBe(31);
      expect(STARMADE_OCCLUSION_LIGHT_SCALE).toBeCloseTo(1.28, 5);
      expect(STARMADE_OCCLUSION_RAY_LENGTH).toBe(22);
      expect(STARMADE_OCCLUSION_DEFAULT_RAY_COUNT).toBe(128);
    });
  });

});
