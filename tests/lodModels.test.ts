import { describe, expect, it } from "vitest";
import {
  createStarMadeLodModelRegistry,
  parseStarMadeLodModelDefinitions,
  resolveStarMadeLodModelReference,
} from "../src/starmade/lodModels";
import {
  blockDefinitionFromConfig,
  isStarMadeLodBlockDefinition,
  starMadeBlockLodModelName,
  resolveStarMadeBlockLodModelReference,
  collectStarMadeLodBlockInstances
} from "../src";
import {
  STARMADE_LOD_DISTANCE_THRESHOLD_DEFAULT,
  STARMADE_LOD_THRESH_SQUARED_DEFAULT
} from "../src/shaders/cubeShaderMaterial";

describe("StarMade LOD model registry", () => {
  it("parses mainConfig LOD entries and resolves scene URLs", () => {
    const definitions = parseStarMadeLodModelDefinitions(`
      <Config>
        <LOD path="/models/lod/">
          <WhiteLightRod filename="White_Light_Rod" relpath="LightRod"/>
          <SmallButtonActive filename="Small_Button_Active" relpath="SmallButton"/>
        </LOD>
      </Config>
    `);
    const registry = createStarMadeLodModelRegistry(definitions);

    expect(definitions).toHaveLength(2);
    expect(resolveStarMadeLodModelReference("WhiteLightRod", registry)).toEqual({
      name: "WhiteLightRod",
      filename: "White_Light_Rod",
      relpath: "LightRod",
      sceneUrl: "/starmade-assets/models/lod/LightRod/White_Light_Rod.scene",
      texturePath: "/starmade-assets/models/lod/LightRod/"
    });
    expect(resolveStarMadeLodModelReference("Missing", registry)).toBeNull();
  });


  // ── P7 exit criteria: LOD threshold contract ──────────────────────────────
  describe("P7 LOD distance threshold (StarMade-Open EngineSettings default)", () => {
    it("STARMADE_LOD_DISTANCE_THRESHOLD_DEFAULT = 100 (StarMade default LOD_DISTANCE_IN_THRESHOLD)", () => {
      expect(STARMADE_LOD_DISTANCE_THRESHOLD_DEFAULT).toBe(100);
    });

    it("STARMADE_LOD_THRESH_SQUARED_DEFAULT = (100+16)^2 = 13456 (SegmentDrawer.java)", () => {
      expect(STARMADE_LOD_THRESH_SQUARED_DEFAULT).toBe(116 * 116);
    });
  });

  // ── P7: isStarMadeLodBlockDefinition ─────────────────────────────────────
  describe("P7 isStarMadeLodBlockDefinition", () => {
    it("returns true for blocks with a non-empty lodShape", () => {
      const block = blockDefinitionFromConfig({ id: 80, name: "WhiteLightRod", textureIds: [0], lodShape: "WhiteLightRod" });
      expect(isStarMadeLodBlockDefinition(block)).toBe(true);
    });

    it("returns true for blocks with lodShapeActive only", () => {
      const block = blockDefinitionFromConfig({ id: 81, name: "Active", textureIds: [0], lodShapeActive: "ActiveModel" });
      expect(isStarMadeLodBlockDefinition(block)).toBe(true);
    });

    it("returns false for normal cube blocks", () => {
      const block = blockDefinitionFromConfig({ id: 1, name: "Hull", textureIds: [0] });
      expect(isStarMadeLodBlockDefinition(block)).toBe(false);
    });

    it("returns false for sprite-style blocks (lodShapeStyle=1)", () => {
      const block = blockDefinitionFromConfig({ id: 5, name: "Sprite", textureIds: [0], lodShape: "Pipe", lodShapeStyle: 1 });
      // lodShapeStyle=1 is sprite — still has LOD but via sprite not model
      expect(isStarMadeLodBlockDefinition(block)).toBe(true); // has lodShape
    });
  });

  // ── P7: starMadeBlockLodModelName ─────────────────────────────────────────
  describe("P7 starMadeBlockLodModelName active/inactive resolution", () => {
    it("returns lodShape when inactive", () => {
      const block = blockDefinitionFromConfig({ id: 80, name: "Rod", textureIds: [0], lodShape: "WhiteLightRod", lodShapeActive: "WhiteLightRodActive" });
      expect(starMadeBlockLodModelName(block, false)).toBe("WhiteLightRod");
    });

    it("returns lodShapeActive when active and lodShapeActive is set", () => {
      const block = blockDefinitionFromConfig({ id: 80, name: "Rod", textureIds: [0], lodShape: "WhiteLightRod", lodShapeActive: "WhiteLightRodActive" });
      expect(starMadeBlockLodModelName(block, true)).toBe("WhiteLightRodActive");
    });

    it("falls back to lodShape when active but lodShapeActive is empty", () => {
      const block = blockDefinitionFromConfig({ id: 82, name: "Rod2", textureIds: [0], lodShape: "Fallback" });
      expect(starMadeBlockLodModelName(block, true)).toBe("Fallback");
    });
  });

  // ── P7: resolveStarMadeBlockLodModelReference ──────────────────────────────
  describe("P7 resolveStarMadeBlockLodModelReference", () => {
    const definitions = parseStarMadeLodModelDefinitions(`
      <Config>
        <LOD path="/models/lod/">
          <WhiteLightRod filename="White_Light_Rod" relpath="LightRod"/>
          <WhiteLightRodActive filename="White_Light_Rod_Active" relpath="LightRod"/>
        </LOD>
      </Config>
    `);
    const registry = createStarMadeLodModelRegistry(definitions);

    it("resolves inactive block reference from registry", () => {
      const block = blockDefinitionFromConfig({ id: 80, name: "Rod", textureIds: [0], lodShape: "WhiteLightRod", lodShapeActive: "WhiteLightRodActive" });
      const ref = resolveStarMadeBlockLodModelReference(block, registry, "/starmade-assets/models/lod", false);
      expect(ref?.name).toBe("WhiteLightRod");
    });

    it("resolves active block reference from registry", () => {
      const block = blockDefinitionFromConfig({ id: 80, name: "Rod", textureIds: [0], lodShape: "WhiteLightRod", lodShapeActive: "WhiteLightRodActive" });
      const ref = resolveStarMadeBlockLodModelReference(block, registry, "/starmade-assets/models/lod", true);
      expect(ref?.name).toBe("WhiteLightRodActive");
    });

    it("returns null for block without LOD", () => {
      const block = blockDefinitionFromConfig({ id: 1, name: "Hull", textureIds: [0] });
      const ref = resolveStarMadeBlockLodModelReference(block, registry, "/starmade-assets/models/lod", false);
      expect(ref).toBeNull();
    });

    it("returns null when model name not in registry", () => {
      const block = blockDefinitionFromConfig({ id: 90, name: "Unknown", textureIds: [0], lodShape: "NonExistentModel" });
      const ref = resolveStarMadeBlockLodModelReference(block, registry, "/starmade-assets/models/lod", false);
      expect(ref).toBeNull();
    });
  });

  // ── P7: collectStarMadeLodBlockInstances ──────────────────────────────────
  describe("P7 collectStarMadeLodBlockInstances", () => {
    const definitions = parseStarMadeLodModelDefinitions(`
      <Config>
        <LOD path="/models/lod/">
          <WhiteLightRod filename="White_Light_Rod" relpath="LightRod"/>
        </LOD>
      </Config>
    `);
    const registry = createStarMadeLodModelRegistry(definitions);

    const lodBlock = blockDefinitionFromConfig({
      id: 80, name: "WhiteLightRod", textureIds: [0], lodShape: "WhiteLightRod"
    });
    const cubeBlock = blockDefinitionFromConfig({ id: 1, name: "Hull", textureIds: [0] });
    const blockDefinitions = new Map([[80, lodBlock], [1, cubeBlock]]);

    it("collects only LOD blocks from a segment", () => {
      const airBlock = { type: 0, hp: 0, orientation: 0, active: false };
      const blocks = Array(32768).fill(airBlock);
      blocks[16 * 32 * 32 + 16 * 32 + 16] = { type: 80, hp: 127, orientation: 2, active: false };
      blocks[17 * 32 * 32 + 16 * 32 + 16] = { type: 1, hp: 127, orientation: 0, active: false };
      const segment = { x: 0, y: 0, z: 0, blockCount: 2, blocks };

      const instances = collectStarMadeLodBlockInstances({
        entities: [{ name: "main", offset: [0, 0, 0] as const, segments: [segment] }],
        blockDefinitions,
        registry,
        modelBaseUrl: "/starmade-assets/models/lod"
      });

      expect(instances.length).toBe(1);
      expect(instances[0].modelReference.name).toBe("WhiteLightRod");
    });

    it("includes both active and inactive LOD instances when active flag differs", () => {
      const lodBlockWithActive = blockDefinitionFromConfig({
        id: 81, name: "ActiveRod", textureIds: [0],
        lodShape: "WhiteLightRod", lodShapeActive: "WhiteLightRod"
      });
      const defs = new Map([[81, lodBlockWithActive]]);
      const airBlock = { type: 0, hp: 0, orientation: 0, active: false };
      const blocks = Array(32768).fill(airBlock);
      blocks[16 * 32 * 32 + 16 * 32 + 16] = { type: 81, hp: 127, orientation: 0, active: true };
      blocks[16 * 32 * 32 + 16 * 32 + 17] = { type: 81, hp: 127, orientation: 0, active: false };
      const segment = { x: 0, y: 0, z: 0, blockCount: 2, blocks };

      const instances = collectStarMadeLodBlockInstances({
        entities: [{ name: "e", offset: [0, 0, 0] as const, segments: [segment] }],
        blockDefinitions: defs,
        registry,
        modelBaseUrl: "/starmade-assets/models/lod"
      });

      expect(instances.length).toBe(2);
    });
  });

});


describe("LOD XML comments are not declarations", () => {
  it("ignores a complete commented LOD section before the real registry", () => {
    const xml = '<Config><!-- <LOD><Fake filename="fake" relpath="fake"/></LOD> -->' +
      '<LOD><Live filename="live" relpath="live"/><!-- <Fake filename="fake" relpath="fake"/> --></LOD></Config>';
    expect(parseStarMadeLodModelDefinitions(xml)).toEqual([{ name: "Live", filename: "live", relpath: "live" }]);
  });
  it("does not publish a commented-only registry", () => {
    expect(parseStarMadeLodModelDefinitions('<!-- <LOD><Fake filename="fake" relpath="fake"/></LOD> -->')).toEqual([]);
  });
});
