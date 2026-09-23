import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BlockConfig, parseSmd3, SMToolConfig } from "starmade-decoder";
import { createStarMadeEncodedSegmentGeometry, createStarMadeEncodedSegmentGeometryBatches,
  STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE, createStarMadeCubeAtlasLayout, blockDefinitionFromConfig
} from "../../src";
import { requireStarMadeDirectory } from "../helpers/gameInstallation";

const starmadeDir = requireStarMadeDirectory();
const isanthFixturePath = join(starmadeDir, "blueprints/Isanth Type-PNR-25-B/DATA/Isanth Type-PNR-25-B.0.0.0.smd3");
const isanthCFixturePath = join(starmadeDir, "blueprints/Isanth Type-PNR-25-C/DATA/Isanth Type-PNR-25-C.0.0.0.smd3");
// These are fixture/geometry checks, NOT proof of in-game pixel parity.
describe("Installed game blueprint integration", () => {
it("meshes the real Isanth Type-PNR-25-B SMD3 fixture from StarMade-Decoder output", () => {
    const smd3 = parseSmd3(readFileSync(isanthFixturePath));
    const config = SMToolConfig.fromData({ starmadeDir, worldDir: "world0" });
    const realBlockDefinitions = new Map(
      BlockConfig.load(config).all.map((block) => [block.id, blockDefinitionFromConfig(block)] as const)
    );
    const atlasLayout = createStarMadeCubeAtlasLayout(64);

    expect(smd3.segments).toHaveLength(2);
    expect(smd3.segments.map((segment) => segment.blockCount)).toEqual([2907, 260]);

    let totalVertices = 0;
    let totalIndices = 0;
    const totalBlocks = smd3.segments.reduce((sum, segment) => sum + segment.blockCount, 0);

    for (const segment of smd3.segments) {
      const geometry = createStarMadeEncodedSegmentGeometry({
        segment,
        blockDefinitions: realBlockDefinitions,
        neighborSegments: smd3.segments,
        starMadeAtlasLayout: atlasLayout
      });
      const positions = geometry.getAttribute("position");
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      totalVertices += positions.count;
      totalIndices += geometry.index?.count ?? 0;

      expect(positions.count).toBe(encoded.count);
      expect(geometry.index?.count).toBeGreaterThan(0);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
    }

    const mergedBounds = smd3.segments
      .map((segment) =>
        createStarMadeEncodedSegmentGeometry({
          segment,
          blockDefinitions: realBlockDefinitions,
          neighborSegments: smd3.segments,
          starMadeAtlasLayout: atlasLayout
        }).boundingBox
      )
      .reduce((bounds, box) => {
        if (box) {
          bounds.min.x = Math.min(bounds.min.x, box.min.x);
          bounds.min.y = Math.min(bounds.min.y, box.min.y);
          bounds.min.z = Math.min(bounds.min.z, box.min.z);
          bounds.max.x = Math.max(bounds.max.x, box.max.x);
          bounds.max.y = Math.max(bounds.max.y, box.max.y);
          bounds.max.z = Math.max(bounds.max.z, box.max.z);
        }
        return bounds;
      }, {
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity }
      });

    expect(mergedBounds.max.z - mergedBounds.min.z).toBeLessThanOrEqual(64);
    expect(totalVertices).toBeGreaterThan(totalBlocks);
    expect(totalVertices).toBeLessThan(totalBlocks * 24);
    expect(totalIndices).toBe(Math.floor(totalVertices * 1.5));
  });
it("meshes the Isanth-C SMD3 fixture with opaque/blended batch separation", () => {
    const smd3 = parseSmd3(readFileSync(isanthCFixturePath));
    const config = SMToolConfig.fromData({ starmadeDir, worldDir: "world0" });
    const realBlockDefinitions = new Map(
      BlockConfig.load(config).all.map((block) => [block.id, blockDefinitionFromConfig(block)] as const)
    );
    const atlasLayout = createStarMadeCubeAtlasLayout(64);

    expect(smd3.segments).toHaveLength(2);

    let totalOpaque = 0;
    let totalBlended = 0;
    let totalOpaqueVerts = 0;
    let totalBlendedVerts = 0;

    for (const segment of smd3.segments) {
      const batches = createStarMadeEncodedSegmentGeometryBatches({
        segment,
        blockDefinitions: realBlockDefinitions,
        neighborSegments: smd3.segments,
        starMadeAtlasLayout: atlasLayout
      });

      totalOpaque += batches.opaqueBlockCount;
      totalBlended += batches.blendedBlockCount;
      totalOpaqueVerts += batches.opaque.getAttribute("position").count;
      totalBlendedVerts += batches.blended.getAttribute("position").count;

      if (batches.opaque.getAttribute("position").count > 0) {
        expect(batches.opaque.index!.count).toBe(
          Math.floor(batches.opaque.getAttribute("position").count / 4) * 6
        );
      }
      if (batches.blended.getAttribute("position").count > 0) {
        expect(batches.blended.index!.count).toBe(
          Math.floor(batches.blended.getAttribute("position").count / 4) * 6
        );
      }
    }

    // Isanth-C: 3105 total blocks; LOD blocks are excluded from cube geometry
    // Only non-LOD blocks are meshed; totalOpaque + totalBlended <= 3105
    expect(totalOpaque + totalBlended).toBeGreaterThan(0);
    expect(totalOpaque + totalBlended).toBeLessThanOrEqual(3105);
    expect(totalOpaque).toBeGreaterThan(totalBlended);
    expect(totalBlended).toBeGreaterThan(0);
    expect(totalOpaqueVerts).toBeGreaterThan(0);
    expect(totalOpaqueVerts).toBeLessThan(totalOpaque * 24);
  });
it("P2 reference: Isanth-B segment geometry matches StarMade-Open face-count contract", () => {
    const smd3 = parseSmd3(readFileSync(isanthFixturePath));
    const config = SMToolConfig.fromData({ starmadeDir, worldDir: "world0" });
    const realBlockDefinitions = new Map(
      BlockConfig.load(config).all.map((block) => [block.id, blockDefinitionFromConfig(block)] as const)
    );
    const atlasLayout = createStarMadeCubeAtlasLayout(64);

    let totalVerts = 0;
    let totalIndices = 0;
    let totalCulled = 0;
    let totalLodHidden = 0;

    for (const segment of smd3.segments) {
      const batches = createStarMadeEncodedSegmentGeometryBatches({
        segment,
        blockDefinitions: realBlockDefinitions,
        neighborSegments: smd3.segments,
        starMadeAtlasLayout: atlasLayout
      });

      totalVerts += batches.opaque.getAttribute("position").count;
      totalVerts += batches.blended.getAttribute("position").count;
      totalIndices += batches.opaque.index!.count + batches.blended.index!.count;
      totalCulled += batches.culledBlockCount;
      totalLodHidden += batches.lodHiddenBlockCount;
    }

    // StarMade-Open contract: indices = vertices / 4 * 6 (quads → 2 triangles)
    expect(totalIndices).toBe(Math.floor(totalVerts / 4) * 6);

    // Isanth-B reference baseline (captured 2026-05-21, StarMade-3D P2 complete)
    // 3167 blocks, face-culling reduces to ~28820 verts
    expect(totalVerts).toBeGreaterThan(20000);
    expect(totalVerts).toBeLessThan(40000);
    expect(totalCulled).toBeGreaterThan(500);
    expect(totalLodHidden).toBeGreaterThan(50);

    // Each vertex quad (4 verts) encodes exactly 6 indices
    expect(totalIndices % 6).toBe(0);
  });
it("Isanth-B geometry generation completes in reasonable time", async () => {
      // P6 exit criteria: large scenes remain responsive
      const smd3 = parseSmd3(readFileSync(isanthFixturePath));
      const config = SMToolConfig.fromData({ starmadeDir, worldDir: "world0" });
      const defs = new Map(BlockConfig.load(config).all.map(b => [b.id, blockDefinitionFromConfig(b)] as const));
      const atlasLayout = createStarMadeCubeAtlasLayout(64);

      const start = Date.now();
      let totalVerts = 0;
      for (const segment of smd3.segments) {
        const batches = createStarMadeEncodedSegmentGeometryBatches({
          segment, blockDefinitions: defs, neighborSegments: smd3.segments, starMadeAtlasLayout: atlasLayout
        });
        totalVerts += batches.opaque.getAttribute("position").count;
        totalVerts += batches.blended.getAttribute("position").count;
      }
      const elapsed = Date.now() - start;

      // Should complete well under 30 seconds (nominal: ~5s)
      expect(elapsed).toBeLessThan(30000);
      expect(totalVerts).toBeGreaterThan(20000);
    });
});
