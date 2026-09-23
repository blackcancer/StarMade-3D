import { describe, expect, it } from "vitest";
import { blockDefinitionFromConfig } from "../src/starmade/blockConfig";
import {
  collectStarMadeLodBlockInstances,
  isStarMadeLodBlockDefinition,
  resolveStarMadeBlockLodModelReference,
  starMadeBlockLodModelName,
  starMadeSegmentBlockInstanceKey
} from "../src/starmade/lodInstancing";
import {
  segmentBlockIndex,
  STARMADE_SEGMENT_BLOCK_COUNT,
  type SegmentBlockDataLike,
  type SegmentDataLike
} from "../src/starmade/segmentData";
import type { StarMadeLodModelDefinition } from "../src/starmade/lodModels";

const airBlock: SegmentBlockDataLike = { type: 0, hp: 0, orientation: 0, active: false };
const armorBlock = blockDefinitionFromConfig({
  id: 1,
  name: "Grey Basic Armor",
  textureIds: [33],
  blockStyle: 0
});
const pipeBlock = blockDefinitionFromConfig({
  id: 2,
  name: "Pipe",
  textureIds: [124],
  lodShape: "Pipe",
  blockStyle: 6
});
const toggleLightBlock = blockDefinitionFromConfig({
  id: 3,
  name: "Light Bar",
  textureIds: [108],
  lodShape: "WhiteLightBarOff",
  lodShapeActive: "WhiteLightBar",
  blockStyle: 6
});
const blockDefinitions = new Map([
  [armorBlock.id, armorBlock],
  [pipeBlock.id, pipeBlock],
  [toggleLightBlock.id, toggleLightBlock]
]);
const registry = new Map<string, StarMadeLodModelDefinition>([
  ["Pipe", { name: "Pipe", filename: "Pipe", relpath: "Pipe" }],
  ["WhiteLightBar", { name: "WhiteLightBar", filename: "White_Light_Bar", relpath: "LightBar" }]
]);

describe("StarMade LOD segment collection", () => {
  it("resolves LOD block instances from segment entities", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 17, y: 16, z: 16, type: 2, orientation: 7 },
      { x: 18, y: 16, z: 16, type: 3, active: true, orientation: 12 }
    ], 32, 0, 0);
    const entries = collectStarMadeLodBlockInstances({
      entities: [{ name: "ship", offset: [-2, 3, 4], segments: [segment] }],
      blockDefinitions,
      registry,
      modelBaseUrl: "/models/lod"
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      key: starMadeSegmentBlockInstanceKey("ship", segment, segmentBlockIndex(17, 16, 16)),
      entityName: "ship",
      blockDefinition: pipeBlock,
      blockId: 2,
      position: [33, 0, 0],
      worldPosition: [31, 3, 4],
      modelReference: {
        name: "Pipe",
        sceneUrl: "/models/lod/Pipe/Pipe.scene",
        texturePath: "/models/lod/Pipe/"
      }
    });
    expect(entries[1]).toMatchObject({
      blockDefinition: toggleLightBlock,
      modelReference: {
        name: "WhiteLightBar",
        sceneUrl: "/models/lod/LightBar/White_Light_Bar.scene"
      }
    });
  });

  it("keeps missing LOD model names loadable as missing prototypes", () => {
    const segment = makeSegment([{ x: 16, y: 16, z: 16, type: 3, active: false }]);
    const entries = collectStarMadeLodBlockInstances({
      entities: [{ segments: [segment] }],
      blockDefinitions,
      registry,
      modelBaseUrl: "/models/lod"
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].modelReference).toEqual({
      name: "WhiteLightBarOff",
      filename: "",
      relpath: "",
      sceneUrl: "",
      texturePath: ""
    });
    expect(starMadeBlockLodModelName(toggleLightBlock, true)).toBe("WhiteLightBar");
    expect(starMadeBlockLodModelName(toggleLightBlock, false)).toBe("WhiteLightBarOff");
    expect(isStarMadeLodBlockDefinition(armorBlock)).toBe(false);
    expect(isStarMadeLodBlockDefinition(pipeBlock)).toBe(true);
  });

  it("resolves direct model references with the provided base URL", () => {
    expect(resolveStarMadeBlockLodModelReference(pipeBlock, registry, "/assets/models", true)).toEqual({
      name: "Pipe",
      filename: "Pipe",
      relpath: "Pipe",
      sceneUrl: "/assets/models/Pipe/Pipe.scene",
      texturePath: "/assets/models/Pipe/"
    });
  });
});

function makeSegment(
  entries: readonly {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly type: number;
    readonly hp?: number;
    readonly orientation?: number;
    readonly active?: boolean;
  }[],
  x = 0,
  y = 0,
  z = 0
): SegmentDataLike {
  const blocks = Array.from({ length: STARMADE_SEGMENT_BLOCK_COUNT }, () => airBlock);

  for (const entry of entries) {
    blocks[segmentBlockIndex(entry.x, entry.y, entry.z)] = {
      type: entry.type,
      hp: entry.hp ?? 127,
      orientation: entry.orientation ?? 0,
      active: entry.active ?? false
    };
  }

  return {
    x,
    y,
    z,
    blocks,
    blockCount: entries.length
  };
}
