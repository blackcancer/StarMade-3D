import { describe, expect, it } from "vitest";
import {
  blockDefinitionFromConfig,
  faceTexturesFromTextureIds,
  normalizeTextureIds,
  resolveStarMadeBlockTextureLayerLocal,
  starMadeBlockUsesTextureAnimation,
  starMadeHitPointsCodeFromByteHp,
  starMadeResourceOverlay
} from "../src/starmade/blockConfig";

describe("BlockConfig render normalization", () => {
  it("keeps six explicit StarMade face texture ids", () => {
    expect(faceTexturesFromTextureIds([1, 2, 3, 4, 5, 6])).toEqual({
      front: 1,
      back: 2,
      top: 3,
      bottom: 4,
      right: 5,
      left: 6
    });
  });

  it("expands three-sided texture ids like StarMade ElementInformation", () => {
    expect(normalizeTextureIds([20], 3)).toEqual([22, 22, 20, 21, 22, 22]);
  });

  it("creates a neutral runtime block definition from decoder-shaped data", () => {
    const block = blockDefinitionFromConfig({
      id: 1,
      name: "Basic Hull",
      textureIds: [12],
      blockStyle: 0,
      individualSides: 1,
      transparent: false,
      animated: false
    });

    expect(block).toMatchObject({
      id: 1,
      name: "Basic Hull",
      transparent: false,
      slab: 0,
      textures: {
        front: 12,
        back: 12,
        top: 12,
        bottom: 12,
        right: 12,
        left: 12
      }
    });
  });

  it("honors native Animated metadata even for system blocks", () => {
    const shipCore = blockDefinitionFromConfig({
      id: 1,
      name: "Ship Core",
      textureIds: [272],
      animated: true
    });
    const forcefield = blockDefinitionFromConfig({
      id: 659,
      name: "Forcefield (Red)",
      textureIds: [224],
      animated: true,
      transparent: true
    });

    expect(shipCore.animated).toBe(true);
    expect(starMadeBlockUsesTextureAnimation(shipCore)).toBe(true);
    expect(starMadeBlockUsesTextureAnimation(forcefield)).toBe(true);
  });

  it("preserves StarMade slab factors from decoder-shaped slab ids", () => {
    expect(
      blockDefinitionFromConfig({
        id: 700,
        name: "Grey Basic Armor 3/4",
        textureIds: [33],
        slabIds: [700, 699, 698]
      }).slab
    ).toBe(1);
    expect(
      blockDefinitionFromConfig({
        id: 699,
        name: "Grey Basic Armor 1/2",
        textureIds: [33],
        slabIds: [700, 699, 698]
      }).slab
    ).toBe(2);
    expect(
      blockDefinitionFromConfig({
        id: 698,
        name: "Grey Basic Armor 1/4",
        textureIds: [33],
        slabIds: [700, 699, 698]
      }).slab
    ).toBe(3);
  });

  it("preserves StarMade logic and activation flags used by connection overlays", () => {
    const block = blockDefinitionFromConfig({
      id: 332,
      name: "Activation Module",
      textureIds: [427],
      canActivate: true,
      hasActivationTexture: true,
      drawLogicConnection: true,
      logicBlock: true,
      logicSignaledByRail: true,
      logicBlockButton: false
    });

    expect(block).toMatchObject({
      canActivate: true,
      hasActivationTexture: true,
      drawLogicConnection: true,
      logicBlock: true,
      logicSignaledByRail: true,
      logicBlockButton: false
    });
  });

  it("resolves inactive activation textures with StarMade's implicit +1 convention", () => {
    const block = blockDefinitionFromConfig({
      id: 405,
      name: "Activation Module",
      textureIds: [427, 427, 427, 427, 427, 427],
      hasActivationTexture: true,
      canActivate: true
    });

    expect(resolveStarMadeBlockTextureLayerLocal(block, 0, 0, true)).toMatchObject({
      textureId: 427,
      layer: 1,
      localTile: 171
    });
    expect(resolveStarMadeBlockTextureLayerLocal(block, 0, 0, false)).toMatchObject({
      textureId: 428,
      layer: 1,
      localTile: 172
    });
  });

  it("matches StarMade hitpoint byte damage codes", () => {
    expect(starMadeHitPointsCodeFromByteHp(127)).toBe(0);
    expect(starMadeHitPointsCodeFromByteHp(126)).toBe(0);
    expect(starMadeHitPointsCodeFromByteHp(64)).toBe(3);
    expect(starMadeHitPointsCodeFromByteHp(0)).toBe(7);
  });

  it("matches StarMade resource-injection overlay offsets", () => {
    const ore = blockDefinitionFromConfig({
      id: 900,
      name: "Ore Rock",
      textureIds: [10],
      resourceInjection: "ore"
    });
    const flora = blockDefinitionFromConfig({
      id: 901,
      name: "Flora",
      textureIds: [10],
      resourceInjection: "flora"
    });

    expect(starMadeResourceOverlay(ore, 1)).toBe(1);
    expect(starMadeResourceOverlay(ore, 19)).toBe(19);
    expect(starMadeResourceOverlay(flora, 1)).toBe(17);
    expect(starMadeResourceOverlay(flora, 19)).toBe(35);
    expect(starMadeResourceOverlay(ore, 0)).toBe(0);
  });

  it("keeps LOD model names separate from the far-render style", () => {
    const block = blockDefinitionFromConfig({
      id: 80,
      name: "White Rod Light",
      textureIds: [80],
      lodShape: "WhiteLightRod",
      lodShapeActive: "WhiteLightRodActive",
      lodShapeStyle: 1
    });

    expect(block.lodShape).toBe("WhiteLightRod");
    expect(block.lodShapeActive).toBe("WhiteLightRodActive");
    expect(block.lodShapeStyle).toBe(1);
    expect(block.lodCollisionPhysical).toBe(true);
  });

  it("preserves the LOD physical collision flag used by light/shadow roles", () => {
    const block = blockDefinitionFromConfig({
      id: 975,
      name: "Blue Console",
      textureIds: [27, 377, 377, 377, 377, 377],
      transparent: true,
      lodShape: "BlueConsole",
      lodShapeStyle: 0,
      lodCollisionPhysical: true
    });

    expect(block.lodCollisionPhysical).toBe(true);
  });

  it("does not treat legacy numeric LOD style strings as model names", () => {
    const block = blockDefinitionFromConfig({
      id: 80,
      name: "Legacy Decoder LOD",
      textureIds: [80],
      lodShape: "2"
    });

    expect(block.lodShape).toBe("");
    expect(block.lodShapeStyle).toBe(2);
  });
});
