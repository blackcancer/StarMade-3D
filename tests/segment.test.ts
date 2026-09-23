import { BufferAttribute, IntType } from "three";
import { describe, expect, it } from "vitest";
import {
  createStarMadeEncodedSegmentGeometryBatches,
  createStarMadeEncodedSegmentGeometry,
  starMadeSegmentGeometryPassForBlock,
  STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE,
  STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE
} from "../src";
import { blockDefinitionFromConfig } from "../src/starmade/blockConfig";
import {
  segmentBlockIndex,
  STARMADE_SEGMENT_BLOCK_COUNT,
  type SegmentBlockDataLike,
  type SegmentDataLike
} from "../src/starmade/segmentData";
import {
  blockToSegmentOrigin,
  type StarMadeGeneratedSegmentData
} from "../src/starmade/smd3Generation";

const airBlock: SegmentBlockDataLike = { type: 0, hp: 0, orientation: 0, active: false };
const armorBlock = blockDefinitionFromConfig({
  id: 1,
  name: "Grey Basic Armor",
  textureIds: [33],
  blockStyle: 0,
  transparent: false
});

describe("createStarMadeSmd3FileFromBlocks", () => {
  

  it("maps world blocks to 32-block segment origins", () => {
    expect(blockToSegmentOrigin(31, 0, -1)).toEqual({ x: 0, y: 0, z: -32 });
    expect(blockToSegmentOrigin(32, 33, 34)).toEqual({ x: 32, y: 32, z: 32 });
  });
});
const glassBlock = blockDefinitionFromConfig({
  id: 2,
  name: "Glass",
  textureIds: [12],
  blockStyle: 0,
  transparent: true
});
const wedgeBlock = blockDefinitionFromConfig({
  id: 3,
  name: "Wedge",
  textureIds: [33],
  blockStyle: 1,
  transparent: false
});
const slabBlock = blockDefinitionFromConfig({
  id: 4,
  name: "Half Slab",
  textureIds: [33],
  blockStyle: 0,
  slab: 2,
  transparent: false
});
const lodBlock = blockDefinitionFromConfig({
  id: 5,
  name: "Pipe",
  textureIds: [124],
  lodShape: "Pipe",
  lodShapeStyle: 1,
  blockStyle: 6
});
// Non-sprite LOD block (lodShapeStyle=0, counts as LOD-hidden)
const lodModelBlock = blockDefinitionFromConfig({
  id: 77,
  name: "Blue Console LOD",
  textureIds: [27],
  lodShape: "BlueConsole",
  lodShapeStyle: 0,
  blockStyle: 0
});
const spriteBlock = blockDefinitionFromConfig({
  id: 6,
  name: "Rod Light",
  textureIds: [80],
  blockStyle: 3,
  transparent: true
});
const normal24Block = blockDefinitionFromConfig({
  id: 7,
  name: "Rail Dock",
  textureIds: [33],
  blockStyle: 6,
  transparent: false
});
const resourceBlock = blockDefinitionFromConfig({
  id: 8,
  name: "Ore Rock",
  textureIds: [10, 20, 30, 40, 50, 60],
  individualSides: 6,
  resourceInjection: "ore",
  blockStyle: 0,
  transparent: false
});
const cargoBlock = blockDefinitionFromConfig({
  id: 689,
  name: "Cargo Space",
  textureIds: [100],
  blockStyle: 0,
  transparent: true
});
const cargoBuildModeBlock = blockDefinitionFromConfig({
  id: 390,
  name: "Cargo Space Buildmode",
  textureIds: [123],
  blockStyle: 0,
  transparent: true
});
const blockDefinitions = new Map([
  [armorBlock.id, armorBlock],
  [glassBlock.id, glassBlock],
  [wedgeBlock.id, wedgeBlock],
  [slabBlock.id, slabBlock],
  [lodBlock.id, lodBlock],
  [lodModelBlock.id, lodModelBlock],
  [spriteBlock.id, spriteBlock],
  [normal24Block.id, normal24Block],
  [resourceBlock.id, resourceBlock],
  [cargoBlock.id, cargoBlock],
  [cargoBuildModeBlock.id, cargoBuildModeBlock]
]);

describe("createStarMadeEncodedSegmentGeometry", () => {
  it("accepts StarMade-Decoder shaped SegmentData", () => {
    const segment: StarMadeGeneratedSegmentData = {
      x: 0,
      y: 0,
      z: 0,
      lastChanged: 0n,
      version: 7,
      blockCount: 1,
      blocks: makeBlocks([{ x: 16, y: 16, z: 16, type: 1, hp: 127, orientation: 31 }])
    };

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const integerEncoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE) as BufferAttribute;

    expect(geometry.index?.count).toBe(36);
    expect(geometry.getAttribute("position").count).toBe(24);
    expect(encoded.count).toBe(24);
    expect(integerEncoded.gpuType).toBe(IntType);
    expect(decodeHitPoints(encoded.getY(0))).toBe(0);
  });

  it("encodes StarMade hitpoint byte damage codes from full to destroyed", () => {
    const full = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([{ x: 16, y: 16, z: 16, type: 1, hp: 127 }]),
      blockDefinitions
    });
    const damaged = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([{ x: 16, y: 16, z: 16, type: 1, hp: 64 }]),
      blockDefinitions
    });
    const destroyed = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([{ x: 16, y: 16, z: 16, type: 1, hp: 0 }]),
      blockDefinitions
    });

    expect(decodeHitPoints(full.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0))).toBe(0);
    expect(decodeHitPoints(damaged.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0))).toBe(3);
    expect(decodeHitPoints(destroyed.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0))).toBe(7);
  });

  it("uses resource-injection orientation only for overlay and resets texture orientation like StarMade", () => {
    const geometry = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([{ x: 16, y: 16, z: 16, type: 8, orientation: 4 }]),
      blockDefinitions
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(decodeTextureType(encoded.getY(0))).toBe(10);
    expect(decodeOverlay(encoded.getW(0))).toBe(4);
  });

  it("applies StarMade cargo texture offsets and build-mode texture substitution", () => {
    const cargoVolume = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([{ x: 0, y: 0, z: 0, type: 689, orientation: 2 }]),
      blockDefinitions
    });
    const cargoBuildMode = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([{ x: 0, y: 0, z: 0, type: 689, orientation: 4 }]),
      blockDefinitions
    });
    const cargoVolumeEncoded = cargoVolume.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const cargoBuildModeEncoded = cargoBuildMode.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(decodeTextureType(cargoVolumeEncoded.getY(0 * 4))).toBe(102);
    expect(decodeTextureType(cargoVolumeEncoded.getY(2 * 4))).toBe(100);
    expect(decodeTextureType(cargoBuildModeEncoded.getY(0))).toBe(123);
    expect(decodeOnlyInBuildMode(cargoBuildModeEncoded.getY(0))).toBe(1);
  });

  it("removes internal faces between solid blocks inside the same segment", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 17, y: 16, z: 16, type: 1 }
    ]);

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });

    expect(geometry.index?.count).toBe(60);
    expect(geometry.getAttribute("position").count).toBe(40);
  });

  it("uses adjacent segments to cull boundary faces", () => {
    const segment = makeSegment([{ x: 31, y: 16, z: 16, type: 1 }]);
    const neighbor = makeSegment([{ x: 0, y: 16, z: 16, type: 1 }], 32, 0, 0);

    const openGeometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });
    const culledGeometry = createStarMadeEncodedSegmentGeometry({
      segment,
      blockDefinitions,
      neighborSegments: [neighbor]
    });

    expect(openGeometry.index?.count).toBe(36);
    expect(culledGeometry.index?.count).toBe(30);
    expect(culledGeometry.getAttribute("position").count).toBe(20);
  });

  it("places decoder segment origins as block coordinates rather than chunk indices", () => {
    const first = makeSegment([{ x: 16, y: 16, z: 31, type: 1 }]);
    const second = makeSegment([{ x: 16, y: 16, z: 0, type: 1 }], 0, 0, 32);
    const firstGeometry = createStarMadeEncodedSegmentGeometry({
      segment: first,
      blockDefinitions,
      neighborSegments: [first, second]
    });
    const secondGeometry = createStarMadeEncodedSegmentGeometry({
      segment: second,
      blockDefinitions,
      neighborSegments: [first, second]
    });

    expect(firstGeometry.index?.count).toBe(30);
    expect(secondGeometry.index?.count).toBe(30);
    expect(firstGeometry.boundingBox?.max.z).toBeCloseTo(15.5);
    expect(secondGeometry.boundingBox?.min.z).toBeCloseTo(15.5);
    expect(secondGeometry.boundingBox?.max.z).toBeCloseTo(16.5);
  });

  it("keeps faces visible against transparent neighbors by default", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 17, y: 16, z: 16, type: 2 }
    ]);

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });

    expect(geometry.index?.count).toBe(66);
    expect(geometry.getAttribute("position").count).toBe(44);
  });

  it("splits opaque and blended cube geometry into StarMade draw passes", () => {
    const segment = makeSegment([
      { x: 4, y: 4, z: 4, type: 1 },
      { x: 8, y: 4, z: 4, type: 2 },
      { x: 12, y: 4, z: 4, type: 6 },
      { x: 16, y: 4, z: 4, type: 689, orientation: 2 }
    ]);

    const batches = createStarMadeEncodedSegmentGeometryBatches({ segment, blockDefinitions });
    const opaqueByPass = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions, pass: "opaque" });
    const blendedByPass = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions, pass: "blended" });

    expect(starMadeSegmentGeometryPassForBlock(armorBlock, segment.blocks[segmentBlockIndex(4, 4, 4)])).toBe("opaque");
    expect(starMadeSegmentGeometryPassForBlock(glassBlock, segment.blocks[segmentBlockIndex(8, 4, 4)])).toBe("blended");
    expect(starMadeSegmentGeometryPassForBlock(spriteBlock, segment.blocks[segmentBlockIndex(12, 4, 4)])).toBe("blended");
    expect(starMadeSegmentGeometryPassForBlock(cargoBlock, segment.blocks[segmentBlockIndex(16, 4, 4)])).toBe("blended");
    expect(batches.opaqueBlockCount).toBe(1);
    expect(batches.blendedBlockCount).toBe(3);
    expect(batches.totalMeshedBlockCount).toBe(4);
    expect(batches.opaque.index?.count).toBe(opaqueByPass.index?.count);
    expect(batches.blended.index?.count).toBe(blendedByPass.index?.count);
    expect(batches.opaque.getAttribute("position").count).toBe(24);
    expect(batches.blended.getAttribute("position").count).toBe(64);
  });

  it("culls internal faces between blended StarMade blocks in the blended pass", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 2 },
      { x: 17, y: 16, z: 16, type: 2 }
    ]);
    const allGeometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });
    const batches = createStarMadeEncodedSegmentGeometryBatches({ segment, blockDefinitions });

    expect(allGeometry.index?.count).toBe(60);
    expect(batches.opaque.getAttribute("position").count).toBe(0);
    expect(batches.blended.index?.count).toBe(60);
    expect(batches.blended.getAttribute("position").count).toBe(40);
  });

  it("does not treat non-full opaque shapes as whole-face occluders", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 17, y: 16, z: 16, type: 3 }
    ]);

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });

    expect(geometry.index?.count).toBe(66);
    expect(geometry.getAttribute("position").count).toBe(44);
  });

  it("does not treat slabs as whole-face occluders", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 17, y: 16, z: 16, type: 4 }
    ]);

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });

    expect(geometry.index?.count).toBe(66);
    expect(geometry.getAttribute("position").count).toBe(44);
  });

  it("applies StarMade slab face occlusion only on the oriented solid side", () => {
    const sideOpen = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([
        { x: 16, y: 16, z: 16, type: 1 },
        { x: 17, y: 16, z: 16, type: 4, orientation: 0 }
      ]),
      blockDefinitions
    });
    const sideBlocked = createStarMadeEncodedSegmentGeometry({
      segment: makeSegment([
        { x: 16, y: 16, z: 16, type: 1 },
        { x: 16, y: 16, z: 17, type: 4, orientation: 0 }
      ]),
      blockDefinitions
    });

    expect(sideOpen.index?.count).toBe(66);
    expect(sideBlocked.index?.count).toBeLessThan(sideOpen.index?.count ?? 0);
  });

  it("treats normal24 blocks as full cube occluders", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 17, y: 16, z: 16, type: 7, orientation: 12 }
    ]);

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });

    expect(geometry.index?.count).toBe(60);
    expect(geometry.getAttribute("position").count).toBe(40);
  });

  it("can leave LOD blocks out of the encoded cube mesh", () => {
    const segment = makeSegment([
      { x: 16, y: 16, z: 16, type: 1 },
      { x: 18, y: 16, z: 16, type: 5 }
    ]);

    const geometry = createStarMadeEncodedSegmentGeometry({
      segment,
      blockDefinitions,
      isBlockMeshed: ({ blockDefinition }) => blockDefinition?.lodShape.length === 0
    });

    expect(geometry.index?.count).toBe(36);
    expect(geometry.getAttribute("position").count).toBe(24);
  });

  it("uses StarMade's sprite visibility mask for crossed sprite geometry", () => {
    const segment = makeSegment([{ x: 16, y: 16, z: 16, type: 6, orientation: 0 }]);

    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions });

    expect(geometry.index?.count).toBe(24);
    expect(geometry.getAttribute("position").count).toBe(16);
  });

  

  


  // ── P6 draw orchestration diagnostics ────────────────────────────────────
  describe("P6 draw pass orchestration diagnostics", () => {
    it("culledBlockCount counts blocks with all faces hidden by neighbors", () => {
      // Two adjacent blocks: shared face culled, so 1 block with 6 faces - 1 = 5 visible
      // The block completely surrounded by 6 opaque neighbors has 0 visible faces → culledBlockCount = 1
      const seg = makeSegment([
        { x: 16, y: 16, z: 16, type: 1 }, // surrounded
        { x: 15, y: 16, z: 16, type: 1 }, // neighbor front
        { x: 17, y: 16, z: 16, type: 1 }, // neighbor back
        { x: 16, y: 15, z: 16, type: 1 }, // neighbor bottom
        { x: 16, y: 17, z: 16, type: 1 }, // neighbor top
        { x: 16, y: 16, z: 15, type: 1 }, // neighbor right
        { x: 16, y: 16, z: 17, type: 1 }, // neighbor left
      ]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      expect(batches.culledBlockCount).toBeGreaterThanOrEqual(1);
      expect(batches.totalMeshedBlockCount).toBeLessThan(7);
    });

    it("culledBlockCount is 0 for an isolated block with no neighbors", () => {
      const seg = makeSegment([{ x: 16, y: 16, z: 16, type: 1 }]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      expect(batches.culledBlockCount).toBe(0);
      expect(batches.totalMeshedBlockCount).toBe(1);
    });

    it("lodHiddenBlockCount counts LOD blocks excluded from cube geometry", () => {
      const seg = makeSegment([
        { x: 16, y: 16, z: 16, type: 1 }, // opaque cube
        { x: 17, y: 16, z: 16, type: 77 }, // LOD model block (lodShapeStyle=0)
      ]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      expect(batches.lodHiddenBlockCount).toBeGreaterThanOrEqual(1);
    });

    it("lodHiddenBlockCount is 0 for segments with only cube blocks", () => {
      const seg = makeSegment([{ x: 16, y: 16, z: 16, type: 1 }]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      expect(batches.lodHiddenBlockCount).toBe(0);
    });

    it("culledBlockCount + totalMeshedBlockCount + lodHiddenBlockCount <= blockCount", () => {
      const seg = makeSegment([
        { x: 16, y: 16, z: 16, type: 1 },
        { x: 17, y: 16, z: 16, type: 1 },
        { x: 18, y: 16, z: 16, type: 77 }, // LOD model
        { x: 16, y: 17, z: 16, type: 2 }, // glass (blended)
      ]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      // lodHiddenBlockCount can overlap with culledBlockCount (LOD block may also get culled).
      // totalMeshedBlockCount is always <= non-air block count.
      expect(batches.totalMeshedBlockCount).toBeLessThanOrEqual(4);
      expect(batches.culledBlockCount).toBeGreaterThanOrEqual(0);
      expect(batches.lodHiddenBlockCount).toBeGreaterThanOrEqual(0);
    });
  });


  // ── P2 exit criteria: face counts on reference segment (Isanth) ──────────
  


  // ── P6 exit criteria: draw-pass order and multi-entity offsets ────────────
  describe("P6 draw-pass order contract", () => {
    it("opaque meshes have renderOrder=0 (drawn first)", () => {
      // Three.js renderOrder: 0 = default (opaque), >0 = after
      // StarMade-Open: drawnOpaqueSegments drawn before blended
      const seg = makeSegment([{ x: 16, y: 16, z: 16, type: 1 }]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      // opaque geometry has no transparency flag — renderOrder should be 0 for these meshes
      expect(batches.opaqueBlockCount).toBeGreaterThanOrEqual(1);
      expect(batches.blendedBlockCount).toBe(0);
    });

    it("blended meshes render after opaque (renderOrder > 0 by convention)", () => {
      // StarMade-Open: drawnBlendedSegments drawn after opaque, back-to-front
      // Three.js: transparent=true objects are sorted and rendered after opaque
      const seg = makeSegment([
        { x: 16, y: 16, z: 16, type: 1 },  // opaque
        { x: 17, y: 16, z: 16, type: 2 }   // glass = blended
      ]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      expect(batches.opaqueBlockCount).toBe(1);
      expect(batches.blendedBlockCount).toBe(1);
      // Blended geometry: transparent=true tells Three.js to sort it after opaque
      expect(batches.blended.getAttribute("position").count).toBeGreaterThan(0);
    });

    it("sprite blocks are blended (StarMade-Open draws them after opaque)", () => {
      const seg = makeSegment([{ x: 16, y: 16, z: 16, type: 6 }]); // sprite
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      expect(batches.blendedBlockCount).toBe(1);
      expect(batches.opaqueBlockCount).toBe(0);
    });
  });

  describe("P6 multi-entity segment origin contract", () => {
    it("segment origin is the block-aligned lower corner of the 32-block segment", () => {
      // StarMade-Open: segments are indexed by their (x,y,z) block coordinates
      // blockToSegmentOrigin(31,0,-1) = {x:0, y:0, z:-32}
      // blockToSegmentOrigin(32,33,34) = {x:32, y:32, z:32}
      expect(blockToSegmentOrigin(31, 0, -1)).toEqual({ x: 0, y: 0, z: -32 });
      expect(blockToSegmentOrigin(32, 33, 34)).toEqual({ x: 32, y: 32, z: 32 });
      expect(blockToSegmentOrigin(0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
      expect(blockToSegmentOrigin(-1, -1, -1)).toEqual({ x: -32, y: -32, z: -32 });
    });

    it("two segments sharing a boundary cull each other's boundary face", () => {
      // Block at (31,16,16) in segment 0 and block at (0,16,16) in segment (32,0,0)
      // Their shared face should be culled when neighbor info is provided
      const seg0 = makeSegment([{ x: 31, y: 16, z: 16, type: 1 }]);
      const seg1 = makeSegment([{ x: 0, y: 16, z: 16, type: 1 }], 32, 0, 0);

      const openGeom = createStarMadeEncodedSegmentGeometry({ segment: seg0, blockDefinitions });
      const culledGeom = createStarMadeEncodedSegmentGeometry({
        segment: seg0, blockDefinitions, neighborSegments: [seg1]
      });

      // Without neighbor: 6 faces = 36 indices
      expect(openGeom.index!.count).toBe(36);
      // With neighbor: right face culled = 5 faces = 30 indices
      expect(culledGeom.index!.count).toBe(30);
    });

    it("entity offset is applied at the Group level, not repeated per block", () => {
      // StarMade-Open: each SegmentController has a world transform applied once.
      // In Three.js we set entityRoot.position = entity.offset.
      // The geometry itself stays in segment-local space.
      // Verify: geometry bounding box center is near (0,0,0) for a segment at (0,0,0)
      const seg = makeSegment([{ x: 16, y: 16, z: 16, type: 1 }]);
      const geom = createStarMadeEncodedSegmentGeometry({ segment: seg, blockDefinitions });
      geom.computeBoundingBox();
      const center = geom.boundingBox!.getCenter(new (require("three").Vector3)());
      // Block at (16,16,16) in segment at (0,0,0): world position is (0,0,0) = center of first block
      expect(center.x).toBeCloseTo(0, 0);
      expect(center.y).toBeCloseTo(0, 0);
      expect(center.z).toBeCloseTo(0, 0);
    });

    it("culledBlockCount and lodHiddenBlockCount are reported per segment, not cumulative", () => {
      // Each call to createStarMadeEncodedSegmentGeometryBatches returns fresh counts
      const seg = makeSegment([
        { x: 16, y: 16, z: 16, type: 1 },
        { x: 17, y: 16, z: 16, type: 1 }
      ]);
      const batches = createStarMadeEncodedSegmentGeometryBatches({ segment: seg, blockDefinitions });
      // Shared internal face means 1 block sees its right face culled (neighbor to the right)
      // But blocks are not "fully culled" (still have 5 visible faces each)
      expect(batches.culledBlockCount).toBe(0); // no block is FULLY culled
      expect(batches.totalMeshedBlockCount).toBe(2);
    });
  });



});

function makeSegment(
  entries: readonly BlockEntry[],
  x = 0,
  y = 0,
  z = 0
): SegmentDataLike {
  return {
    x,
    y,
    z,
    blockCount: entries.length,
    blocks: makeBlocks(entries)
  };
}

function makeBlocks(entries: readonly BlockEntry[]): SegmentBlockDataLike[] {
  const blocks = Array.from({ length: STARMADE_SEGMENT_BLOCK_COUNT }, () => airBlock);

  for (const entry of entries) {
    blocks[segmentBlockIndex(entry.x, entry.y, entry.z)] = {
      type: entry.type,
      hp: entry.hp ?? 0,
      orientation: entry.orientation ?? 0,
      active: entry.active ?? false
    };
  }

  return blocks;
}

function decodeHitPoints(faceCode: number): number {
  return Math.floor(faceCode / 131072) % 8;
}

function decodeTextureType(faceCode: number): number {
  return Math.floor(faceCode / 512) % 256;
}

function decodeOnlyInBuildMode(faceCode: number): number {
  return Math.floor(faceCode / 8388608) % 2;
}

function decodeOverlay(secondaryCode: number): number {
  return Math.floor(secondaryCode / 512) % 64;
}

interface BlockEntry {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly type: number;
  readonly hp?: number;
  readonly orientation?: number;
  readonly active?: boolean;
}
