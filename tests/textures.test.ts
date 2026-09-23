import { describe, expect, it } from "vitest";
import { NoColorSpace, Texture } from "three";
import { cubeTextureUrl, customCubeTextureUrl, loadStarMadeCubeTexturePack } from "../src/textures";

describe("cubeTextureUrl", () => {
  it("builds StarMade cube texture URLs without leaking filesystem paths", () => {
    expect(cubeTextureUrl("/starmade-assets/textures/block/", "Default", 64, "t000")).toBe(
      "/starmade-assets/textures/block/Default/64/t000.png"
    );
    expect(customCubeTextureUrl("/starmade-assets/custom-block-textures/", 64, "custom")).toBe(
      "/starmade-assets/custom-block-textures/64/custom.png"
    );
  });

  it("loads StarMade texture atlases as raw shader texels", async () => {
    const loadedUrls: string[] = [];
    const textureLoader = {
      load(url: string, onLoad: (texture: Texture) => void): void {
        loadedUrls.push(url);
        onLoad(new Texture());
      }
    };

    const pack = await loadStarMadeCubeTexturePack({
      baseUrl: "/starmade-assets/textures/block",
      includeCustom: false,
      includeNormals: true,
      textureLoader: textureLoader as never
    });

    expect(loadedUrls).toContain("/starmade-assets/textures/block/Default/64/t000.png");
    expect(pack.layers.get(0)?.colorSpace).toBe(NoColorSpace);
    expect(pack.layers.get(0)?.flipY).toBe(false);
    expect(pack.normalLayers?.get(0)?.colorSpace).toBe(NoColorSpace);
    expect(pack.normalLayers?.get(0)?.flipY).toBe(false);
    expect(pack.overlay?.colorSpace).toBe(NoColorSpace);
    expect(pack.overlay?.flipY).toBe(false);
  });

  it("loads StarMade custom texture sheet 7 from the custom texture directory", async () => {
    const loadedUrls: string[] = [];
    const textureLoader = {
      load(url: string, onLoad: (texture: Texture) => void): void {
        loadedUrls.push(url);
        onLoad(new Texture());
      }
    };

    const pack = await loadStarMadeCubeTexturePack({
      baseUrl: "/starmade-assets/textures/block",
      customBaseUrl: "/starmade-assets/custom-block-textures",
      includeCustom: true,
      includeNormals: true,
      textureLoader: textureLoader as never
    });

    expect(loadedUrls).toContain("/starmade-assets/custom-block-textures/64/custom.png");
    expect(loadedUrls).toContain("/starmade-assets/custom-block-textures/64/custom_NRM.png");
    expect(pack.layers.has(7)).toBe(true);
    expect(pack.normalLayers?.has(7)).toBe(true);
  });
});
