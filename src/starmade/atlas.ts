export interface AtlasGrid {
  readonly columns: number;
  readonly rows: number;
  readonly uvInset?: number;
}

export interface StarMadeCubeTextureLayer {
  readonly layer: number;
  readonly textureIdOffset: number;
  readonly tileCount: number;
  readonly name: string;
}

export interface StarMadeCubeAtlasLayout {
  readonly tileSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly uvInset: number;
  readonly layers: readonly StarMadeCubeTextureLayer[];
  readonly overlayName: string;
}

export interface TileUvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export const STARMADE_CUBE_UV_INSET = 0.00485;

export function tileIdToUvRect(tileId: number, atlas: AtlasGrid): TileUvRect {
  if (!Number.isInteger(tileId) || tileId < 0) {
    throw new Error(`tileId must be a non-negative integer, got ${tileId}`);
  }

  if (!Number.isInteger(atlas.columns) || atlas.columns <= 0) {
    throw new Error(`atlas.columns must be a positive integer, got ${atlas.columns}`);
  }

  if (!Number.isInteger(atlas.rows) || atlas.rows <= 0) {
    throw new Error(`atlas.rows must be a positive integer, got ${atlas.rows}`);
  }

  const column = tileId % atlas.columns;
  const row = Math.floor(tileId / atlas.columns);

  if (row >= atlas.rows) {
    throw new Error(`tileId ${tileId} is outside a ${atlas.columns}x${atlas.rows} atlas`);
  }

  const width = 1 / atlas.columns;
  const height = 1 / atlas.rows;
  const inset = atlas.uvInset ?? 0;

  if (!Number.isFinite(inset) || inset < 0 || inset * 2 >= Math.min(width, height)) {
    throw new Error(`atlas.uvInset must be non-negative and smaller than half a tile, got ${inset}`);
  }

  return {
    u0: column * width + inset,
    v0: row * height + inset,
    u1: (column + 1) * width - inset,
    v1: (row + 1) * height - inset
  };
}

export function uvRectToQuad(rect: TileUvRect): readonly number[] {
  return [
    rect.u0,
    rect.v1,
    rect.u1,
    rect.v1,
    rect.u1,
    rect.v0,
    rect.u0,
    rect.v0
  ];
}

export function createStarMadeCubeAtlasLayout(tileSize: number): StarMadeCubeAtlasLayout {
  if (!Number.isInteger(tileSize) || tileSize <= 0) {
    throw new Error(`tileSize must be a positive integer, got ${tileSize}`);
  }

  const columns = 16;
  const rows = 16;
  const tileCount = columns * rows;

  return {
    tileSize,
    columns,
    rows,
    uvInset: STARMADE_CUBE_UV_INSET,
    layers: [
      { layer: 0, textureIdOffset: 0, tileCount, name: "t000" },
      { layer: 1, textureIdOffset: tileCount, tileCount, name: "t001" },
      { layer: 2, textureIdOffset: tileCount * 2, tileCount, name: "t002" },
      { layer: 3, textureIdOffset: tileCount * 3, tileCount, name: "t003" },
      { layer: 7, textureIdOffset: tileCount * 7, tileCount, name: "custom" }
    ],
    overlayName: "overlays"
  };
}

export function tileIdToStarMadeLayer(tileId: number, layout: StarMadeCubeAtlasLayout): StarMadeCubeTextureLayer {
  if (!Number.isInteger(tileId) || tileId < 0) {
    throw new Error(`tileId must be a non-negative integer, got ${tileId}`);
  }

  const layer = layout.layers.find((candidate) => {
    return tileId >= candidate.textureIdOffset && tileId < candidate.textureIdOffset + candidate.tileCount;
  });

  if (!layer) {
    throw new Error(`tileId ${tileId} is outside StarMade cube atlas layers`);
  }

  return layer;
}

export function tileIdToStarMadeLocalTile(tileId: number, layout: StarMadeCubeAtlasLayout): number {
  const layer = tileIdToStarMadeLayer(tileId, layout);
  return tileId - layer.textureIdOffset;
}
