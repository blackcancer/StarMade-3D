import { requireStarMadeDirectory } from "../helpers/gameInstallation";
import { describe, expect, it } from "vitest";
import { BlockConfig, SMToolConfig } from "starmade-decoder";
import {
  blockDefinitionFromElementInfo,
  blockDefinitionFromConfig,
  resolveStarMadeBlockTextureLayerLocal,
  starMadeBlockUsesTextureAnimation,
  starMadeResourceOverlay
} from "../../src/starmade/blockConfig";

function loadRealBlockConfig(): ReturnType<typeof BlockConfig.load> {
  const config = SMToolConfig.fromData({ starmadeDir: requireStarMadeDirectory(), worldDir: "world0" });

  return BlockConfig.load(config);
}

describe("StarMade-Decoder BlockConfig integration", () => {
  it("loads real StarMade BlockConfig render fields as a dev/test dependency", () => {
    const blockConfig = loadRealBlockConfig();
    const block = blockConfig.getByName("Grey Basic Armor") ?? blockConfig.all[0];

    expect(block).toBeDefined();
    expect(block.textureIds.length).toBeGreaterThan(0);

    const renderBlock = blockDefinitionFromConfig(block);
    expect(renderBlock.id).toBe(block.id);
    expect(renderBlock.textureIds.length).toBe(6);
    expect(renderBlock.textures.front).toBeTypeOf("number");
  });

  it("uses Decoder BlockElementInfo as the preferred render metadata boundary", () => {
    const blockConfig = loadRealBlockConfig();
    const shipCoreInfo = blockConfig.getElementInfoById(1);
    const whiteRodLightInfo = blockConfig.getElementInfoByName("White Rod Light");
    const resourceInfo = blockConfig.elementInfo.find((info) => info.render.resourceInjection.usesOverlay);

    expect(shipCoreInfo).toBeDefined();
    expect(whiteRodLightInfo).toBeDefined();
    expect(resourceInfo).toBeDefined();
    expect(shipCoreInfo?.identity.typeName).toBe("SHIP_CORE");
    expect(shipCoreInfo?.render.style.id).toBe(0);

    const shipCore = blockDefinitionFromElementInfo(shipCoreInfo!);
    const whiteRodLight = blockDefinitionFromElementInfo(whiteRodLightInfo!);
    const resourceBlock = blockDefinitionFromElementInfo(resourceInfo!);

    expect(shipCore).toMatchObject({
      id: 1,
      name: "Ship Core",
      animated: true,
      blockStyle: 0
    });
    expect(starMadeBlockUsesTextureAnimation(shipCore)).toBe(true);
    expect(whiteRodLight.lodShape).toBe("WhiteLightRod");
    expect(whiteRodLight.lodShapeStyle).toBe(1);
    expect(starMadeResourceOverlay(resourceBlock, 1)).toBe(resourceInfo!.render.resourceInjection.index);
  });

  it("loads real LOD model names and far-render style separately", () => {
    const blockConfig = loadRealBlockConfig();
    const block = blockConfig.getByName("White Rod Light");

    expect(block).toBeDefined();
    expect(block?.lodShape).toBe("WhiteLightRod");
    expect(block?.lodShapeStyle).toBe(1);

    const renderBlock = blockDefinitionFromConfig(block!);
    expect(renderBlock.lodShape).toBe("WhiteLightRod");
    expect(renderBlock.lodShapeStyle).toBe(1);
  });

  it("normalizes every real block texture into StarMade layer/local atlas codes", () => {
    const blockConfig = loadRealBlockConfig();
    const renderBlocks = blockConfig.elementInfo.map((info) => blockDefinitionFromElementInfo(info));

    expect(renderBlocks.length).toBeGreaterThan(1000);

    for (const block of renderBlocks) {
      expect(block.textureIds).toHaveLength(6);

      for (let side = 0; side < 6; side++) {
        const active = resolveStarMadeBlockTextureLayerLocal(block, side, 0, true);

        expect(active.layer).toBe(Math.floor(Math.abs(active.textureId) / 256));
        expect(active.localTile).toBe(active.textureId % 256);
        expect(active.localTile).toBeGreaterThanOrEqual(0);
        expect(active.localTile).toBeLessThan(256);

        if (block.hasActivationTexture) {
          const inactive = resolveStarMadeBlockTextureLayerLocal(block, side, 0, false);

          expect(inactive.textureId).toBe(active.textureId + 1);
          expect(inactive.layer).toBe(Math.floor(Math.abs(inactive.textureId) / 256));
          expect(inactive.localTile).toBe(inactive.textureId % 256);
        }
      }
    }
  });

  it("uses native catalogue animation flags without a hard-coded block-ID exclusion", () => {
    const blockConfig = loadRealBlockConfig();
    const renderBlocks = blockConfig.elementInfo.map((info) => blockDefinitionFromElementInfo(info));
    const shipCore = renderBlocks.find((block) => block.id === 1);
    const mineCore = renderBlocks.find((block) => block.id === 37);
    const forcefieldRed = renderBlocks.find((block) => block.id === 659);

    expect(shipCore?.name).toBe("Ship Core");
    expect(shipCore?.animated).toBe(true);
    expect(starMadeBlockUsesTextureAnimation(shipCore!)).toBe(true);

    expect(mineCore?.name).toBe("Mine Core");
    expect(mineCore?.animated).toBe(true);
    expect(starMadeBlockUsesTextureAnimation(mineCore!)).toBe(true);

    expect(forcefieldRed?.name).toBe("Forcefield (Red)");
    expect(forcefieldRed?.animated).toBe(true);
    expect(starMadeBlockUsesTextureAnimation(forcefieldRed!)).toBe(true);
    // CubeMeshBufferContainer.java obtains this bit directly from info.isAnimated().
    // Compare every real entry, including non-animated blocks; do not infer it from IDs.
    expect(renderBlocks.some((block) => !block.animated)).toBe(true);
    for (const block of renderBlocks) {
      expect(starMadeBlockUsesTextureAnimation(block)).toBe(block.animated);
    }
  });

  it("matches StarMade resource overlay offsets for Decoder-enriched resource-injection blocks", () => {
    const blockConfig = loadRealBlockConfig();
    const resourceBlocks = blockConfig.elementInfo
      .map((info) => blockDefinitionFromElementInfo(info))
      .filter((block) => block.resourceInjectionIndex > 0);

    expect(resourceBlocks.length).toBeGreaterThan(0);

    for (const block of resourceBlocks) {
      expect(starMadeResourceOverlay(block, 0)).toBe(0);
      expect(starMadeResourceOverlay(block, 1)).toBe(block.resourceInjectionIndex);
      expect(starMadeResourceOverlay(block, 19)).toBe(block.resourceInjectionIndex + 18);
      expect(starMadeResourceOverlay(block, 20)).toBe(0);
    }
  });
});
