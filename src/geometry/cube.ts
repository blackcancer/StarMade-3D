import { BufferAttribute, BufferGeometry } from "three";
import {
  type AtlasGrid,
  type StarMadeCubeAtlasLayout,
  tileIdToStarMadeLayer,
  tileIdToStarMadeLocalTile,
  tileIdToUvRect,
  uvRectToQuad
} from "../starmade/atlas.js";
import type { BlockDefinition, BlockFaceTextures } from "../starmade/blockConfig.js";

export interface CubeGeometryOptions {
  readonly size?: number;
  readonly atlas?: AtlasGrid;
  readonly starMadeAtlasLayout?: StarMadeCubeAtlasLayout;
  readonly textures?: BlockFaceTextures;
  readonly block?: BlockDefinition;
}

const defaultTextures: BlockFaceTextures = {
  front: 0,
  back: 0,
  top: 0,
  bottom: 0,
  right: 0,
  left: 0
};

const defaultAtlas: AtlasGrid = {
  columns: 16,
  rows: 16
};

export function createBlockCubeGeometry(options: CubeGeometryOptions = {}): BufferGeometry {
  const size = options.size ?? 1;
  const half = size / 2;
  const starMadeAtlasLayout = options.starMadeAtlasLayout;
  const atlas = options.atlas ?? atlasFromStarMadeLayout(starMadeAtlasLayout) ?? defaultAtlas;
  const textures = options.textures ?? options.block?.textures ?? defaultTextures;
  const faceTextureIds = [
    textures.right,
    textures.left,
    textures.top,
    textures.bottom,
    textures.front,
    textures.back
  ];

  const positions = [
    half, -half, -half, half, -half, half, half, half, half, half, half, -half,
    -half, -half, half, -half, -half, -half, -half, half, -half, -half, half, half,
    -half, half, half, half, half, half, half, half, -half, -half, half, -half,
    -half, -half, -half, half, -half, -half, half, -half, half, -half, -half, half,
    -half, -half, half, half, -half, half, half, half, half, -half, half, half,
    half, -half, -half, -half, -half, -half, -half, half, -half, half, half, -half
  ];

  const normals = [
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1
  ];

  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 6, 5, 4, 7, 6,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23
  ];

  const uvs = faceTextureIds.flatMap((tileId) => faceUvs(localTileId(tileId, starMadeAtlasLayout), atlas));

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  if (starMadeAtlasLayout) {
    for (let faceIndex = 0; faceIndex < faceTextureIds.length; faceIndex++) {
      // The dense six-face list has already passed tile validation when building UVs.
      const layer = tileIdToStarMadeLayer(faceTextureIds[faceIndex], starMadeAtlasLayout);
      const materialIndex = starMadeAtlasLayout.layers.findIndex((candidate) => candidate.layer === layer.layer);
      geometry.addGroup(faceIndex * 6, 6, materialIndex);
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function faceUvs(tileId: number, atlas: AtlasGrid): readonly number[] {
  return uvRectToQuad(tileIdToUvRect(tileId, atlas));
}

function localTileId(tileId: number, layout: StarMadeCubeAtlasLayout | undefined): number {
  if (!layout) {
    return tileId;
  }

  return tileIdToStarMadeLocalTile(tileId, layout);
}

function atlasFromStarMadeLayout(layout: StarMadeCubeAtlasLayout | undefined): AtlasGrid | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    columns: layout.columns,
    rows: layout.rows,
    uvInset: layout.uvInset
  };
}
