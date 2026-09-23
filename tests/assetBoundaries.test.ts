import { afterEach, describe, expect, it, vi } from "vitest";
import { ClampToEdgeWrapping, MirroredRepeatWrapping, RepeatWrapping, Texture, TextureLoader } from "three";
import { createStarMadeCubeAtlasLayout, tileIdToStarMadeLayer, tileIdToUvRect } from "../src/starmade/atlas";
import { loadStarMadeCubeTexturePack } from "../src/textures/cubeAtlas";
import { createBlockCubeGeometry } from "../src/geometry/cube";
import { getStarMadeNormal24OrientationQuaternion } from "../src/starmade/orientation";

afterEach(() => vi.restoreAllMocks());

describe("atlas input contracts", () => {
  it("rejects invalid tile and layout values before emitting UVs", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    for (const value of [-1, 0.5, NaN, Infinity]) {
      expect(() => tileIdToUvRect(value, layout)).toThrow(/tileId/);
      expect(() => tileIdToStarMadeLayer(value, layout)).toThrow(/tileId/);
    }
    for (const value of [0, -1, 0.5, NaN, Infinity]) {
      expect(() => createStarMadeCubeAtlasLayout(value)).toThrow(/tileSize/);
      expect(() => tileIdToUvRect(0, {columns:value, rows:16})).toThrow(/columns/);
      expect(() => tileIdToUvRect(0, {columns:16, rows:value})).toThrow(/rows/);
    }
    expect(() => tileIdToStarMadeLayer(1024, layout)).toThrow(/outside/);
    for (const uvInset of [-1, 1 / 32, NaN, Infinity]) {
      expect(() => tileIdToUvRect(0, {...layout, uvInset})).toThrow(/uvInset/);
    }
  });

  it("keeps all 24 baked rotations unit length and cube material groups bound to valid tiles", () => {
    const rotations = Array.from({length:24}, (_,i) => getStarMadeNormal24OrientationQuaternion(i));
    expect(rotations.every(q => Math.abs(q.length() - 1) < 1e-12)).toBe(true);
    const geometry = createBlockCubeGeometry({starMadeAtlasLayout:createStarMadeCubeAtlasLayout(64)});
    expect(geometry.groups).toEqual(Array.from({length:6}, (_,i) => ({start:6*i, count:6, materialIndex:0})));
    expect(() => createBlockCubeGeometry({textures:{front:undefined} as never})).toThrow(/tileId/);
    geometry.dispose();
  });
});

describe("texture pack I/O contracts", () => {
  it("uses the default loader and treats missing normal maps as optional", async () => {
    const urls:string[] = [];
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((url, onLoad, _progress, onError) => {
      urls.push(url);
      const texture = new Texture();
      if (url.endsWith("_NRM.png")) onError!(new Error("missing normal map"));
      else onLoad!(texture);
      return texture;
    });
    const pack = await loadStarMadeCubeTexturePack({baseUrl:"/textures", includeNormals:true});
    expect(pack.layers.size).toBe(5);
    expect(pack.normalLayers?.size).toBe(0);
    expect(pack.overlay).toBeInstanceOf(Texture);
    expect(urls).toContain("/textures/Default/64/custom.png");
    expect(pack.layers.get(7)?.wrapS).toBe(ClampToEdgeWrapping);
  });

  it("preserves wrapping and resolves successful normals with explicit pack settings", async () => {
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, onLoad) => {
      const texture = new Texture(); onLoad!(texture); return texture;
    });
    const pack = await loadStarMadeCubeTexturePack({baseUrl:"/textures", pack:"Custom Pack", tileSize:32,
      includeOverlay:false, includeCustom:false, includeNormals:true, wrapS:RepeatWrapping, wrapT:MirroredRepeatWrapping});
    expect(pack.layers.size).toBe(4);
    expect(pack.normalLayers?.size).toBe(4);
    expect(pack.overlay).toBeUndefined();
    expect(pack.layers.get(0)?.wrapS).toBe(RepeatWrapping);
    expect(pack.normalLayers?.get(0)?.wrapT).toBe(MirroredRepeatWrapping);
    const diffuseOnly = await loadStarMadeCubeTexturePack({baseUrl:"/textures", includeNormals:false, includeOverlay:false});
    expect(diffuseOnly.normalLayers).toBeUndefined();
    expect(diffuseOnly.layers.size).toBe(5);
  });

  it("propagates mandatory texture failure to the caller", async () => {
    const failure = new Error("atlas unavailable");
    vi.spyOn(TextureLoader.prototype, "load").mockImplementation((_url, _onLoad, _progress, onError) => {
      onError!(failure); return new Texture();
    });
    await expect(loadStarMadeCubeTexturePack({baseUrl:"/textures"})).rejects.toBe(failure);
  });
});
