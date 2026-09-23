import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  Texture,
  TextureLoader,
  type Wrapping
} from "three";
import { ClampToEdgeWrapping } from "three";
import { createStarMadeCubeAtlasLayout, type StarMadeCubeAtlasLayout } from "../starmade/atlas.js";

export interface StarMadeCubeTexturePack {
  readonly layout: StarMadeCubeAtlasLayout;
  readonly layers: ReadonlyMap<number, Texture>;
  readonly normalLayers?: ReadonlyMap<number, Texture>;
  readonly overlay?: Texture;
}

export interface StarMadeCubeTexturePackOptions {
  readonly baseUrl: string;
  readonly customBaseUrl?: string;
  readonly pack?: string;
  readonly tileSize?: number;
  readonly includeCustom?: boolean;
  readonly includeOverlay?: boolean;
  readonly includeNormals?: boolean;
  readonly textureLoader?: TextureLoader;
  readonly wrapS?: Wrapping;
  readonly wrapT?: Wrapping;
}

export async function loadStarMadeCubeTexturePack(
  options: StarMadeCubeTexturePackOptions
): Promise<StarMadeCubeTexturePack> {
  const tileSize = options.tileSize ?? 64;
  const pack = options.pack ?? "Default";
  const loader = options.textureLoader ?? new TextureLoader();
  const layout = createStarMadeCubeAtlasLayout(tileSize);
  const layerEntries = layout.layers.filter((layer) => options.includeCustom !== false || layer.layer !== 7);
  const layers = new Map<number, Texture>();

  await Promise.all(
    layerEntries.map(async (layer) => {
      const texture = await loadTexture(loader, cubeTextureLayerUrl(options, pack, tileSize, layer.name, layer.layer));
      configureStarMadeTexture(texture, options);
      layers.set(layer.layer, texture);
    })
  );

  let normalLayers: Map<number, Texture> | undefined;
  if (options.includeNormals ?? false) {
    const loadedNormals = new Map<number, Texture>();
    normalLayers = loadedNormals;

    await Promise.all(
      layerEntries.map(async (layer) => {
        const texture = await loadOptionalTexture(
          loader,
          cubeTextureLayerUrl(options, pack, tileSize, `${layer.name}_NRM`, layer.layer)
        );

        if (texture) {
          configureStarMadeTexture(texture, options);
          loadedNormals.set(layer.layer, texture);
        }
      })
    );
  }

  let overlay: Texture | undefined;
  if (options.includeOverlay ?? true) {
    overlay = await loadTexture(loader, cubeTextureUrl(options.baseUrl, pack, tileSize, layout.overlayName));
    configureStarMadeTexture(overlay, options);
  }

  return { layout, layers, normalLayers, overlay };
}

export function cubeTextureUrl(baseUrl: string, pack: string, tileSize: number, name: string): string {
  const cleanBase = baseUrl.replace(/\/+$/g, "");
  return `${cleanBase}/${encodeURIComponent(pack)}/${tileSize}/${name}.png`;
}

export function customCubeTextureUrl(baseUrl: string, tileSize: number, name: string): string {
  const cleanBase = baseUrl.replace(/\/+$/g, "");
  return `${cleanBase}/${tileSize}/${name}.png`;
}

function cubeTextureLayerUrl(
  options: StarMadeCubeTexturePackOptions,
  pack: string,
  tileSize: number,
  name: string,
  layer: number
): string {
  if (layer === 7 && options.customBaseUrl) {
    return customCubeTextureUrl(options.customBaseUrl, tileSize, name);
  }

  return cubeTextureUrl(options.baseUrl, pack, tileSize, name);
}

function configureStarMadeTexture(texture: Texture, options: StarMadeCubeTexturePackOptions): void {
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.wrapS = options.wrapS ?? ClampToEdgeWrapping;
  texture.wrapT = options.wrapT ?? ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
}

function loadTexture(loader: TextureLoader, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function loadOptionalTexture(loader: TextureLoader, url: string): Promise<Texture | undefined> {
  return new Promise((resolve) => {
    loader.load(url, resolve, undefined, () => resolve(undefined));
  });
}
