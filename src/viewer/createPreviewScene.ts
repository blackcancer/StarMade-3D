import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  type Texture
} from "three";
import { createBlockCubeGeometry } from "../geometry/cube.js";
import { createStarMadeBlockMaterial, createStarMadeBlockMaterials } from "../shaders/index.js";
import { blockDefinitionFromConfig, type DecoderBlockDefinitionLike } from "../starmade/blockConfig.js";
import type { StarMadeCubeTexturePack } from "../textures/index.js";

export interface PreviewScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly cube: Mesh;
}

export interface PreviewSceneOptions {
  readonly block?: DecoderBlockDefinitionLike;
  readonly map?: Texture | null;
  readonly overlayMap?: Texture | null;
  readonly texturePack?: StarMadeCubeTexturePack;
}

export function createPreviewScene(options: PreviewSceneOptions = {}): PreviewScene {
  const scene = new Scene();
  scene.background = new Color(0x111318);

  const camera = new PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(2.4, 1.8, 2.8);
  camera.lookAt(0, 0, 0);

  const block = blockDefinitionFromConfig(
    options.block ?? {
      id: 1,
      name: "Preview Block",
      textureIds: [33, 33, 33, 33, 33, 33]
    }
  );

  const cube = new Mesh(
    createBlockCubeGeometry({
      block,
      starMadeAtlasLayout: options.texturePack?.layout
    }),
    options.texturePack
      ? createStarMadeBlockMaterials(options.texturePack, {
          tint: 0xffffff,
          transparent: block.transparent,
          opacity: block.transparent ? 0.72 : 1,
          blockLightColor: block.lightSource ? lightColor(block.lightSourceColor) : 0x000000
        })
      : createStarMadeBlockMaterial({
          tint: options.map ? 0xffffff : block.transparent ? 0x8fd8ff : 0x5aa9e6,
          map: options.map,
          overlayMap: options.overlayMap,
          transparent: block.transparent,
          opacity: block.transparent ? 0.72 : 1,
          blockLightColor: block.lightSource ? lightColor(block.lightSourceColor) : 0x000000
        })
  );

  scene.add(cube);
  scene.add(new AmbientLight(0xffffff, 0.45));

  const keyLight = new DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  return { scene, camera, cube };
}

function lightColor(value: readonly [number, number, number, number]): Color {
  return new Color().setRGB(value[0], value[1], value[2]);
}
