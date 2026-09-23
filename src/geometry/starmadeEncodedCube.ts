import { BufferAttribute, BufferGeometry, IntType } from "three";
import {
  type StarMadeCubeAtlasLayout,
  tileIdToStarMadeLayer,
  tileIdToStarMadeLocalTile
} from "../starmade/atlas.js";
import {
  resolveStarMadeBlockTextureId,
  starMadeBlockUsesTextureAnimation,
  type BlockDefinition,
  type BlockFaceTextures
} from "../starmade/blockConfig.js";

export interface StarMadeEncodedCubeGeometryOptions {
  readonly starMadeAtlasLayout?: StarMadeCubeAtlasLayout;
  readonly textures?: BlockFaceTextures;
  readonly block?: BlockDefinition;
  readonly orientation?: number;
  readonly slab?: number;
  readonly sideTexturesPointToOrientation?: boolean;
  readonly extendedTexture?: boolean;
  readonly cubePosition?: readonly [number, number, number];
  readonly chunkPosition?: readonly [number, number, number];
  readonly light?: readonly [number, number, number];
  readonly occlusion?: number;
  /** Per-vertex RGB light override (0-indexed write order, 4 per face). Replaces uniform light when provided. */
  readonly vertexLights?: readonly (readonly [number, number, number])[];
  /** Per-vertex sun occlusion override 0..31. Replaces uniform occlusion when provided. */
  readonly vertexOcclusion?: readonly number[];
  readonly overlay?: number;
  readonly normalMode?: number;
  readonly animated?: boolean;
  readonly active?: boolean;
  readonly hitPoints?: number;
  readonly xyScaleManip?: number;
  readonly onlyInBuildMode?: boolean;
  readonly textureTypeOffset?: number | readonly number[];
  readonly visibleSides?: readonly boolean[];
}

export const STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE = "starMadeVertex";
export const STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE = "ivert";
export const STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION = 2;

export interface StarMadeEncodedGeometryBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly starMadeVertices: number[];
  readonly indices: number[];
  readonly faceSourceSides: number[];
  readonly faceDrawBuckets: number[];
  readonly shapeFaces: StarMadeEncodedCubeShapeFace[];
}

export type StarMadeEncodedCubeShapeVertex = readonly [number, number, number];

export interface StarMadeEncodedCubeShapeFace {
  readonly sourceSide: number;
  readonly lightSide: number;
  readonly drawBucket: number;
  readonly normal: readonly [number, number, number];
  readonly vertices: readonly StarMadeEncodedCubeShapeVertex[];
  readonly surface: boolean;
  readonly fullAxisSide: number | null;
}

const defaultTextures: BlockFaceTextures = {
  front: 0,
  back: 0,
  top: 0,
  bottom: 0,
  right: 0,
  left: 0
};

type TexOrderMap = ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>;

const starMadeFaceTextureKeys = ["front", "back", "top", "bottom", "right", "left"] as const;
const FRONT = 0;
const BACK = 1;
const TOP = 2;
const BOTTOM = 3;
const RIGHT = 4;
const LEFT = 5;
const starMadeNormals = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0]
] as const;
const cubeFaceShapeVertexOffsets = (side: number): readonly StarMadeEncodedCubeShapeVertex[] => {
  if (side === FRONT) {
    return [[1, 1, 1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1]];
  }

  if (side === BACK) {
    return [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]];
  }

  if (side === TOP) {
    return [[1, 1, -1], [-1, 1, -1], [-1, 1, 1], [1, 1, 1]];
  }

  if (side === BOTTOM) {
    return [[1, -1, 1], [-1, -1, 1], [-1, -1, -1], [1, -1, -1]];
  }

  if (side === RIGHT) {
    return [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]];
  }

  return [[-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, -1, 1]];
};
const vertexOrderMap = [
  [3, 1, 0, 2],
  [2, 0, 1, 3],
  [1, 0, 2, 3],
  [3, 2, 0, 1],
  [2, 0, 1, 3],
  [3, 1, 0, 2]
] as const;
const texOrderMapNormal = [
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [2, 0, 1, 3],
    [2, 0, 1, 3]
  ],
  [
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [2, 0, 1, 3],
    [2, 0, 1, 3]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [3, 2, 0, 1],
    [0, 1, 3, 2],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [0, 1, 3, 2],
    [3, 2, 0, 1],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ]
] as const;
const texOrderMapPointToOrientation = [
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [0, 1, 3, 2],
    [0, 1, 3, 2]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [3, 2, 0, 1],
    [3, 2, 0, 1]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [1, 3, 2, 0]
  ],
  [
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ]
] as const;
const texOrderMap4x4 = [
  [
    [2, 0, 1, 3],
    [3, 1, 0, 2],
    [3, 1, 0, 2],
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [0, 2, 3, 1]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [3, 2, 0, 1],
    [2, 0, 1, 3],
    [2, 0, 1, 3]
  ],
  [
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [0, 1, 3, 2],
    [2, 0, 1, 3],
    [2, 0, 1, 3]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [3, 2, 0, 1],
    [0, 1, 3, 2],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ],
  [
    [2, 0, 1, 3],
    [1, 3, 2, 0],
    [0, 1, 3, 2],
    [3, 2, 0, 1],
    [1, 3, 2, 0],
    [2, 0, 1, 3]
  ]
] as const;
const quadPosMarks = [
  [2, 4, 0],
  [2, 4, 0],
  [4, 0, 2],
  [4, 0, 2],
  [0, 4, 2],
  [0, 4, 2]
] as const;
// StarMade fills extOrderPerm with BlockShapeAlgorithm.permute(new byte[]{0,1,2,3}).
const vertexPermutationIndex = [
  [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1],
  [0, 3, 2, 1], [0, 3, 1, 2], [1, 0, 2, 3], [1, 0, 3, 2],
  [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 2, 0], [1, 3, 0, 2],
  [2, 1, 0, 3], [2, 1, 3, 0], [2, 0, 1, 3], [2, 0, 3, 1],
  [2, 3, 0, 1], [2, 3, 1, 0], [3, 1, 2, 0], [3, 1, 0, 2],
  [3, 2, 1, 0], [3, 2, 0, 1], [3, 0, 2, 1], [3, 0, 1, 2]
] as const;
const wedgeExtOrderPointers = [
  [14, 4, 10, 10, 9, 14],
  [14, 9, 1, 10, 10, 10],
  [9, 10, 14, 10, 10, 23],
  [23, 10, 21, 10, 6, 14],
  [14, 3, 10, 10, 10, 12],
  [14, 4, 10, 1, 8, 14],
  [7, 10, 10, 14, 18, 14],
  [12, 10, 10, 21, 10, 6],
  [14, 0, 4, 10, 10, 14],
  [14, 10, 10, 18, 0, 14],
  [14, 1, 10, 11, 10, 14],
  [14, 10, 9, 10, 10, 19]
] as const;
const spikeExtOrderPointers = [
  [2, 10, 4, 10, 11, 14],
  [2, 10, 0, 10, 10, 23],
  [14, 11, 0, 10, 10, 2],
  [14, 11, 0, 10, 9, 14],
  [14, 18, 10, 0, 10, 12],
  [14, 18, 10, 3, 18, 14],
  [15, 10, 10, 2, 4, 14],
  [15, 10, 10, 4, 10, 15],
  [0, 10, 10, 2, 4, 14],
  [2, 10, 9, 14, 4, 14],
  [6, 10, 15, 14, 10, 23],
  [0, 10, 14, 23, 10, 23],
  [14, 0, 18, 10, 9, 14],
  [14, 0, 18, 10, 10, 12],
  [14, 1, 10, 11, 10, 12],
  [14, 0, 10, 9, 9, 14],
  [23, 10, 21, 23, 0, 14],
  [14, 18, 19, 13, 0, 19],
  [14, 4, 11, 1, 2, 14],
  [2, 10, 8, 14, 1, 14],
  [14, 8, 5, 10, 10, 10],
  [12, 6, 9, 21, 19, 11],
  [15, 10, 10, 22, 10, 0],
  [14, 9, 1, 9, 10, 6]
] as const;
const spriteExtOrderPointers = [
  [6, 2, 10, 3, 17, 1],  // SpriteFront
  [0, 0, 3, 10, 21, 6],  // SpriteBack
  [3, 10, 0, 0, 10, 3],  // SpriteTop / SpriteUp
  [10, 3, 2, 13, 3, 10], // SpriteBottom
  [6, 21, 6, 21, 0, 0],  // SpriteRight
  [1, 17, 1, 17, 0, 0]   // SpriteLeft
] as const;
const spikeSideTransformCodes = [
  [1, 1, 2, 3, 4996, 4997, 4993, 4993, 8, 8, 8, 8, 12, 13, 14, 15, 5584, 5585, 5588, 5588, 20, 20, 22, 23],
  [4806, 4806, 4802, 4803, 4, 5, 6, 4, 8, 8, 8, 8, 12, 13, 14, 15, 5584, 5585, 5574, 5574, 23, 21, 22, 23],
  [4807, 4807, 4802, 4803, 4, 5, 7, 7, 8, 8, 8, 8, 12, 13, 14, 15, 16, 17, 18, 18, 5778, 5767, 5782, 5783],
  [0, 2, 2, 3, 4996, 4997, 4992, 4992, 8, 8, 8, 8, 12, 13, 14, 15, 16, 17, 17, 19, 9811, 9811, 9814, 9815],
  [0, 1, 2, 2, 6530, 6530, 6534, 6535, 8, 9, 10, 11, 12, 12, 12, 12, 7127, 7127, 7122, 7123, 20, 21, 21, 23],
  [6336, 6337, 6341, 6341, 5, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12, 12, 7126, 7126, 7122, 7123, 20, 21, 22, 22],
  [6336, 6337, 6340, 6340, 4, 6, 6, 7, 8, 9, 10, 11, 12, 12, 12, 12, 19, 17, 18, 19, 7316, 7317, 7313, 7313],
  [0, 1, 3, 3, 6531, 6531, 6534, 6535, 8, 9, 10, 11, 12, 12, 12, 12, 16, 16, 18, 19, 7316, 7317, 7312, 7312],
  [0, 0, 0, 0, 4, 5, 6, 7, 8, 9, 10, 8, 6346, 6350, 6350, 6351, 7892, 7889, 7890, 7892, 20, 21, 22, 20],
  [0, 0, 0, 0, 4, 5, 6, 7, 8, 9, 9, 11, 2315, 2315, 2318, 2319, 19, 17, 18, 19, 2707, 2709, 2710, 2707],
  [0, 0, 0, 0, 4, 5, 6, 7, 2120, 2121, 2124, 2124, 12, 12, 14, 15, 16, 17, 18, 18, 2704, 2709, 2710, 2704],
  [0, 0, 0, 0, 4, 5, 6, 7, 2120, 2121, 2125, 2125, 15, 13, 14, 15, 2519, 2513, 2514, 2519, 23, 21, 22, 23],
  [0, 1, 2, 3, 4, 4, 4, 4, 3662, 3662, 3658, 3659, 12, 13, 14, 14, 4048, 4054, 4054, 4051, 20, 20, 22, 23],
  [0, 1, 2, 3, 4, 4, 4, 4, 9, 9, 10, 11, 3852, 3853, 3849, 3849, 4048, 4053, 4053, 4051, 20, 21, 21, 23],
  [0, 1, 2, 3, 4, 4, 4, 4, 8, 8, 10, 11, 3852, 3853, 3848, 3848, 16, 18, 18, 19, 4244, 4242, 4242, 4247],
  [0, 1, 2, 3, 4, 4, 4, 4, 3663, 3663, 3658, 3659, 12, 13, 13, 15, 16, 17, 17, 19, 4244, 4241, 4241, 4247],
  [7876, 7873, 7874, 7876, 4, 5, 6, 6, 8271, 8265, 8266, 8271, 15, 13, 14, 15, 16, 16, 16, 16, 20, 21, 22, 23],
  [7879, 7873, 7874, 7879, 5, 5, 6, 7, 8, 9, 10, 10, 8456, 8461, 8462, 8456, 16, 16, 16, 16, 20, 21, 22, 23],
  [0, 1, 2, 1, 8064, 8069, 8070, 8064, 9, 9, 10, 11, 8459, 8461, 8462, 8459, 16, 16, 16, 16, 20, 21, 22, 23],
  [1, 1, 2, 3, 8067, 8069, 8070, 8067, 8268, 8265, 8266, 8268, 12, 13, 14, 14, 16, 16, 16, 16, 20, 21, 22, 23],
  [9408, 9413, 9413, 9411, 4, 5, 5, 7, 9800, 9806, 9806, 9803, 12, 14, 14, 15, 16, 17, 18, 19, 20, 20, 20, 20],
  [9408, 9414, 9414, 9411, 4, 6, 6, 7, 8, 9, 9, 11, 9996, 9993, 9993, 9999, 16, 17, 18, 19, 20, 20, 20, 20],
  [0, 1, 3, 3, 9604, 9601, 9601, 9607, 8, 10, 10, 11, 9996, 9994, 9994, 9999, 16, 17, 18, 19, 20, 20, 20, 20],
  [0, 2, 2, 3, 9604, 9602, 9602, 9607, 9800, 9805, 9805, 9803, 12, 13, 13, 15, 16, 17, 18, 19, 20, 20, 20, 20]
] as const;
const tetraExtOrderPointers = [
  [2, 14, 22, 10, 16, 14],
  [8, 10, 23, 18, 5, 23],
  [8, 11, 13, 10, 10, 8],
  [14, 10, 9, 11, 9, 6],
  [14, 1, 18, 4, 0, 12],
  [2, 18, 10, 5, 4, 14],
  [1, 10, 11, 12, 4, 2],
  [15, 19, 10, 10, 10, 23]
] as const;
const tetraSideTransformCodes = [
  [1, 1, 2, 3, 4, 4, 4, 4, 4118, 4118, 4114, 4116, 12, 13, 14, 14, 16, 16, 16, 16, 20, 20, 22, 23],
  [0, 0, 0, 0, 4, 5, 6, 4, 5607, 5601, 5605, 5605, 13, 13, 14, 15, 16, 16, 16, 16, 23, 21, 22, 23],
  [0, 0, 0, 0, 4, 5, 7, 7, 5792, 5798, 5796, 5796, 12, 12, 14, 15, 16, 17, 18, 18, 20, 20, 20, 20],
  [0, 2, 2, 3, 4, 4, 4, 4, 4311, 4309, 4309, 4307, 12, 13, 15, 15, 16, 17, 17, 19, 20, 20, 20, 20],
  [0, 1, 2, 2, 4, 4, 4, 4, 9, 9, 10, 11, 4139, 4141, 4137, 4137, 16, 16, 16, 16, 20, 21, 21, 23],
  [0, 0, 0, 0, 5, 5, 6, 7, 8, 9, 10, 10, 7138, 7138, 7142, 7136, 16, 16, 16, 16, 20, 21, 22, 22],
  [0, 0, 0, 0, 4, 6, 6, 7, 8, 9, 11, 11, 7331, 7329, 7329, 7335, 19, 17, 18, 19, 20, 20, 20, 20],
  [0, 1, 3, 3, 4, 4, 4, 4, 8, 10, 10, 11, 4332, 4330, 4330, 4328, 16, 16, 18, 19, 20, 20, 20, 20]
] as const;
const pentaExtOrderPointers = [
  [14, 10, 18, 10, 11, 14, 8],
  [23, 10, 10, 10, 10, 14, 12],
  [14, 10, 9, 10, 10, 23, 14],
  [14, 9, 10, 10, 10, 14, 4],
  [14, 18, 10, 10, 10, 14, 9],
  [14, 10, 10, 18, 18, 14, 14],
  [12, 10, 10, 10, 10, 14, 23],
  [14, 10, 10, 9, 10, 12, 22]
] as const;
const pentaSixthSideOrientations = [TOP, TOP, TOP, TOP, BOTTOM, BOTTOM, BOTTOM, BOTTOM] as const;
const pentaSideTransformCodes = [
  [0, 1, 2, 3, 4, 5, 6, 6, 9, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 19, 20, 21, 22, 23, 4119, 4113, 4115, 4115],
  [3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 8, 12, 13, 14, 15, 16, 17, 18, 16, 20, 21, 22, 23, 5600, 5602, 5602, 5604],
  [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 21, 22, 23, 5795, 5793, 5797, 5795],
  [0, 1, 2, 3, 4, 5, 5, 7, 8, 10, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 22, 23, 4304, 4310, 4306, 4306],
  [0, 1, 2, 3, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 14, 16, 18, 18, 19, 20, 21, 22, 23, 4140, 4142, 4142, 4136],
  [0, 1, 2, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13, 13, 14, 15, 17, 17, 18, 19, 20, 21, 22, 23, 7139, 7141, 7141, 7143],
  [0, 1, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 14, 15, 16, 17, 18, 19, 20, 21, 22, 22, 7332, 7330, 7334, 7332],
  [0, 1, 2, 3, 4, 6, 6, 7, 8, 9, 10, 11, 12, 13, 13, 15, 16, 17, 18, 19, 20, 21, 21, 23, 4333, 4333, 4329, 4335]
] as const;
const orientcubeExtOrderPointers = [
  [10, 14, 10, 14, 1, 1],
  [1, 1, 10, 14, 1, 1],
  [14, 10, 10, 14, 1, 1],
  [21, 21, 10, 14, 1, 1],
  [19, 14, 14, 10, 21, 21],
  [1, 1, 14, 10, 21, 21],
  [14, 10, 14, 10, 21, 21],
  [21, 21, 14, 10, 21, 21],
  [10, 14, 14, 10, 14, 10],
  [10, 14, 1, 1, 14, 10],
  [10, 14, 10, 14, 14, 10],
  [10, 14, 21, 21, 14, 10],
  [14, 10, 14, 10, 10, 14],
  [14, 10, 1, 1, 10, 14],
  [14, 10, 10, 14, 10, 14],
  [14, 10, 21, 21, 10, 14],
  [21, 21, 21, 21, 1, 1],
  [21, 21, 21, 21, 10, 14],
  [21, 21, 21, 21, 21, 21],
  [21, 21, 21, 21, 14, 10],
  [1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 10, 14],
  [1, 1, 1, 1, 21, 21],
  [1, 1, 1, 1, 14, 10]
] as const;

export function createStarMadeEncodedGeometryBuffers(): StarMadeEncodedGeometryBuffers {
  return {
    positions: [],
    normals: [],
    uvs: [],
    starMadeVertices: [],
    indices: [],
    faceSourceSides: [],
    faceDrawBuckets: [],
    shapeFaces: []
  };
}

export function createStarMadeEncodedGeometryFromBuffers(buffers: StarMadeEncodedGeometryBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(buffers.normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(buffers.uvs), 2));
  const encodedVertexAttribute = new BufferAttribute(new Int32Array(buffers.starMadeVertices), 4);
  encodedVertexAttribute.gpuType = IntType;
  geometry.setAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE, encodedVertexAttribute);
  geometry.setAttribute(STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE, encodedVertexAttribute);
  geometry.setIndex(buffers.indices);
  geometry.userData.starMadeFaceSourceSides = [...buffers.faceSourceSides];
  geometry.userData.starMadeFaceDrawBuckets = [...buffers.faceDrawBuckets];
  geometry.userData.starMadeFaceDrawBucketCounts = starMadeFaceDrawBucketCounts(buffers.faceDrawBuckets);
  geometry.userData.starMadeShapeFaces = buffers.shapeFaces.map(copyShapeFace);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function appendStarMadeEncodedCubeGeometryData(
  buffers: StarMadeEncodedGeometryBuffers,
  options: StarMadeEncodedCubeGeometryOptions = {}
): void {
  const layout = options.starMadeAtlasLayout;
  const textures = options.textures ?? options.block?.textures ?? defaultTextures;
  const cubePosition = options.cubePosition ?? [16, 16, 16];
  const chunkPosition = options.chunkPosition ?? [128, 128, 128];
  const light = options.light ?? [24, 24, 24];
  const occlusion = checkedInteger(options.occlusion ?? 31, "occlusion", 0, 31);
  const vertexLights = options.vertexLights;
  const vertexOcclusion = options.vertexOcclusion;
  let _vi = 0;
  const overlay = checkedInteger(options.overlay ?? 0, "overlay", 0, 63);
  const normalMode = checkedInteger(options.normalMode ?? 0, "normalMode", 0, 511);
  const hitPoints = checkedInteger(options.hitPoints ?? 0, "hitPoints", 0, 7);
  const xyScaleManipOverride = options.xyScaleManip === undefined ? undefined : checkedInteger(options.xyScaleManip, "xyScaleManip", 0, 1);
  const active = options.active ?? false;
  const orientation = checkedInteger(options.orientation ?? STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION, "orientation", 0, 23);
  const textureOrientation = textureOrderOrientationForBlock(options.block, orientation);
  const slab = checkedInteger(options.slab ?? options.block?.slab ?? 0, "slab", 0, 3);
  const sideTexturesPointToOrientation =
    options.sideTexturesPointToOrientation ?? options.block?.sideTexturesPointToOrientation ?? false;
  const extendedTexture = options.extendedTexture ?? options.block?.extendedTexture ?? false;
  const texOrderMap = sideTexturesPointToOrientation
    ? texOrderMapPointToOrientation
    : extendedTexture
      ? texOrderMap4x4
      : texOrderMapNormal;

  const sourceSideCount = sourceSideCountForBlockStyle(options.block?.blockStyle ?? 0);

  for (let side = 0; side < sourceSideCount; side++) {
    if (options.visibleSides?.[side] === false) {
      continue;
    }

    const faceStart = buffers.positions.length / 3;
    const textureSide = textureSourceSideForShape(options.block?.blockStyle ?? 0, orientation, side);
    const tile = encodeTile(textureIdForSide(textureSide, orientation, active, options.block, textures), layout);
    const textureTypeOffset = textureTypeOffsetForSide(options.textureTypeOffset, side);
    const tileType = checkedInteger(
      tile.localTile + textureTypeOffset + (options.block?.reactorChamberSpecific ? 1 : 0),
      "type",
      0,
      255
    );
    const facePositions: Array<readonly [number, number, number]> = [];
    const shapeVertices: StarMadeEncodedCubeShapeVertex[] = [];
    let faceNormal: readonly [number, number, number] = starMadeNormals[textureSide];
    let faceDrawSide = side;
    let faceHasAngledNormal = false;

    for (let corner = 0; corner < 4; corner++) {
      const textureCorner = textureCornerForShape(
        options.block?.blockStyle ?? 0,
        orientation,
        textureOrientation,
        side,
        corner,
        texOrderMap
      );
      const shape = createShapeSide(
        options.block?.blockStyle ?? 0,
        orientation,
        side,
        corner,
        textureCorner
      );
      if (corner === 0) {
        faceDrawSide = shape.side;
      }
      faceHasAngledNormal ||= shape.normalMode > 0;
      const vertexCode = vertexOrderMap[shape.side][shape.vertexId];
      const halfBlock = createHalfBlockConfig(corner, shape.side, textureOrientation, slab);
      const xyScaleManip = xyScaleManipOverride ?? halfBlock.xyScaleManip;
      const surfaceNormal = shape.normalMode > 0 ? decodeNormalMode(shape.normalMode) : starMadeNormals[shape.side];
      const effectiveNormalMode = shape.normalMode || normalMode;
      const normal = effectiveNormalMode > 0 ? decodeNormalMode(effectiveNormalMode) : surfaceNormal;
      const position = decodeShaderPosition(shape.side, vertexCode, cubePosition, chunkPosition, {
        elementSize: halfBlock.elementSize,
        elementVertexEdge: halfBlock.elementVertexEdge,
        xyScaleManip
      });

      facePositions.push(position);
      shapeVertices.push(shapeVertexFromPosition(position, cubePosition, chunkPosition));
      buffers.positions.push(...position);
      buffers.normals.push(...normal);
      buffers.uvs.push(0, 0);
      faceNormal = surfaceNormal;
      const _vl = vertexLights ? (vertexLights[_vi] ?? light) : light;
      const _vo = vertexOcclusion !== undefined ? checkedInteger(vertexOcclusion[_vi] ?? occlusion, "vertexOcclusion", 0, 31) : occlusion;
      _vi++;
      buffers.starMadeVertices.push(
        encodeIndex(cubePosition, _vl),
        encodeFace({
          side: shape.side,
          layer: tile.layer,
          type: tileType,
          hitPoints,
          animated: starMadeAnimatedCodeForSide(options.block, side, options.animated),
          tex: shape.textureCorner,
          xyScaleManip,
          onlyInBuildMode: options.onlyInBuildMode ?? options.block?.drawOnlyInBuildMode ?? false,
          extendedTexture,
          vertexCode
        }),
        encodeSegmentIndex(chunkPosition),
        encodeSecondary({
          normalMode: effectiveNormalMode,
          overlay,
          occlusion: _vo,
          elementSize: halfBlock.elementSize,
          elementVertexEdge: halfBlock.elementVertexEdge
        })
      );
    }

    buffers.indices.push(...outwardFaceIndices(faceStart, facePositions, faceNormal));
    const drawBucket = starMadeFaceDrawBucketForShape(
      options.block?.blockStyle ?? 0,
      orientation,
      faceDrawSide,
      faceHasAngledNormal
    );
    buffers.faceSourceSides.push(side);
    buffers.faceDrawBuckets.push(drawBucket);
    buffers.shapeFaces.push(createShapeFaceDescriptor(side, textureSide, drawBucket, faceNormal, shapeVertices));
  }
}

export function createStarMadeEncodedCubeGeometry(options: StarMadeEncodedCubeGeometryOptions = {}): BufferGeometry {
  const buffers = createStarMadeEncodedGeometryBuffers();
  appendStarMadeEncodedCubeGeometryData(buffers, options);
  return createStarMadeEncodedGeometryFromBuffers(buffers);
}

export function createStarMadeEncodedCubeShapeFaces(
  options: Pick<
    StarMadeEncodedCubeGeometryOptions,
    "block" | "orientation" | "slab" | "sideTexturesPointToOrientation" | "visibleSides"
  > = {}
): readonly StarMadeEncodedCubeShapeFace[] {
  const buffers = createStarMadeEncodedGeometryBuffers();
  const shapeOnlyBlock = options.block
    ? { ...options.block, textureIds: [0] }
    : undefined;

  appendStarMadeEncodedCubeGeometryData(buffers, {
    ...options,
    block: shapeOnlyBlock,
    cubePosition: [16, 16, 16],
    chunkPosition: [128, 128, 128]
  });
  return buffers.shapeFaces.map(copyShapeFace);
}

function sourceSideCountForBlockStyle(blockStyle: number): number {
  return blockStyle === 5 ? 7 : 6;
}

function textureSourceSideForShape(blockStyle: number, orientation: number, side: number): number {
  if (blockStyle === 5 && side === 6) {
    return pentaSixthSideOrientations[orientation % 8];
  }

  return side;
}

function createShapeFaceDescriptor(
  sourceSide: number,
  lightSide: number,
  drawBucket: number,
  normal: readonly [number, number, number],
  vertices: readonly StarMadeEncodedCubeShapeVertex[]
): StarMadeEncodedCubeShapeFace {
  const uniqueVertices = new Set(vertices.map(shapeVertexKey));
  const surface = uniqueVertices.size >= 3;

  return {
    sourceSide,
    lightSide,
    drawBucket,
    normal,
    vertices: vertices.map(copyShapeVertex),
    surface,
    fullAxisSide: surface ? fullAxisSideForShapeFace(normal, vertices) : null
  };
}

function shapeVertexFromPosition(
  position: readonly [number, number, number],
  cubePosition: readonly [number, number, number],
  chunkPosition: readonly [number, number, number]
): StarMadeEncodedCubeShapeVertex {
  const blockPosition = [
    cubePosition[0] - 16 + (chunkPosition[0] - 128) * 32,
    cubePosition[1] - 16 + (chunkPosition[1] - 128) * 32,
    cubePosition[2] - 16 + (chunkPosition[2] - 128) * 32
  ] as const;

  return [
    (position[0] - blockPosition[0]) * 2,
    (position[1] - blockPosition[1]) * 2,
    (position[2] - blockPosition[2]) * 2
  ];
}

function fullAxisSideForShapeFace(
  normal: readonly [number, number, number],
  vertices: readonly StarMadeEncodedCubeShapeVertex[]
): number | null {
  // A face is a fullAxisSide (getSidesToCheckForVis) when its normal is axial
  // AND its vertex set contains all 4 corners of the corresponding cube face.
  // StarMade-Open only includes faces that fully occlude the side of the unit cube.
  const side = axisSideForNormal(normal);

  if (side === null) {
    return null;
  }

  const expected = new Set(cubeFaceShapeVertexOffsets(side).map(shapeVertexKey));
  const actual = new Set(vertices.map(shapeVertexKey));

  for (const key of expected) {
    if (!actual.has(key)) {
      return null;
    }
  }

  return side;
}

function axisSideForNormal(normal: readonly [number, number, number]): number | null {
  for (let side = 0; side < starMadeNormals.length; side++) {
    const direction = starMadeNormals[side];

    if (
      Math.abs(normal[0] - direction[0]) < 0.0001 &&
      Math.abs(normal[1] - direction[1]) < 0.0001 &&
      Math.abs(normal[2] - direction[2]) < 0.0001
    ) {
      return side;
    }
  }

  return null;
}

function copyShapeFace(face: StarMadeEncodedCubeShapeFace): StarMadeEncodedCubeShapeFace {
  return {
    sourceSide: face.sourceSide,
    lightSide: face.lightSide,
    drawBucket: face.drawBucket,
    normal: [face.normal[0], face.normal[1], face.normal[2]],
    vertices: face.vertices.map(copyShapeVertex),
    surface: face.surface,
    fullAxisSide: face.fullAxisSide
  };
}

function starMadeFaceDrawBucketCounts(faceDrawBuckets: readonly number[]): readonly number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const bucket of faceDrawBuckets) {
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }

  return counts;
}

function copyShapeVertex(vertex: StarMadeEncodedCubeShapeVertex): StarMadeEncodedCubeShapeVertex {
  return [vertex[0], vertex[1], vertex[2]];
}

function shapeVertexKey(vertex: readonly [number, number, number]): string {
  return `${vertex[0]},${vertex[1]},${vertex[2]}`;
}

function textureIdForSide(
  side: number,
  orientation: number,
  active: boolean,
  block: BlockDefinition | undefined,
  textures: BlockFaceTextures
): number {
  if (!block) {
    return textures[starMadeFaceTextureKeys[side]];
  }

  return resolveStarMadeBlockTextureId(block, side, orientation, active);
}

function textureOrderOrientationForBlock(block: BlockDefinition | undefined, orientation: number): number {
  if (block?.individualSides === 3) {
    return 0;
  }

  if ((block?.individualSides ?? 1) >= 6) {
    return clampInteger(orientation, 0, 5);
  }

  return modulo(orientation, 6);
}

function textureCornerForShape(
  blockStyle: number,
  orientation: number,
  textureOrientation: number,
  side: number,
  corner: number,
  texOrderMap: TexOrderMap
): number {
  const shapeExtOrderPointers = extOrderPointersForShape(blockStyle, orientation);

  if (shapeExtOrderPointers) {
    const permutation = shapeExtOrderPointers[side];
    return vertexPermutationIndex[permutation][corner];
  }

  return texOrderMap[textureOrientation][side][corner];
}

function textureTypeOffsetForSide(offset: number | readonly number[] | undefined, side: number): number {
  if (offset === undefined) {
    return 0;
  }

  const value = Array.isArray(offset) ? offset[side] ?? 0 : offset;
  return checkedInteger(value, "textureTypeOffset", 0, 255);
}

function starMadeAnimatedCodeForSide(
  block: BlockDefinition | undefined,
  side: number,
  animatedOverride: boolean | undefined
): boolean {
  if (animatedOverride !== undefined) {
    return animatedOverride;
  }

  if (!block) {
    return false;
  }

  if ((block.lodShape?.length ?? 0) > 0 || (block.lodShapeActive?.length ?? 0) > 0) {
    return true;
  }

  if (!starMadeBlockUsesTextureAnimation(block)) {
    return false;
  }

  return block.individualSides !== 3 || (side !== TOP && side !== BOTTOM);
}

function starMadeFaceDrawBucketForShape(
  blockStyle: number,
  _orientation: number,
  drawSide: number,
  hasAngledNormal: boolean
): number {
  if (blockStyle === 3 || hasAngledNormal) {
    return 6;
  }

  return drawSide;
}

function extOrderPointersForShape(blockStyle: number, orientation: number): readonly number[] | undefined {
  if (blockStyle === 1) {
    return wedgeExtOrderPointers[modulo(Math.trunc(orientation), 12)];
  }

  if (blockStyle === 2) {
    return spikeExtOrderPointers[orientation % 24];
  }

  if (blockStyle === 3) {
    return spriteExtOrderPointers[orientation % 6];
  }

  if (blockStyle === 4) {
    return tetraExtOrderPointers[orientation % 8];
  }

  if (blockStyle === 5) {
    return pentaExtOrderPointers[orientation % 8];
  }

  if (blockStyle === 6) {
    return orientcubeExtOrderPointers[orientation % 24];
  }

  return undefined;
}

function createShapeSide(
  blockStyle: number,
  orientation: number,
  side: number,
  vertexId: number,
  textureCorner: number
): { readonly side: number; readonly vertexId: number; readonly normalMode: number; readonly textureCorner: number } {
  if (blockStyle === 1) {
    return createWedgeSide(modulo(Math.trunc(orientation), 12), side, vertexId, textureCorner);
  }

  if (blockStyle === 2) {
    return createSpikeSide(orientation % 24, side, vertexId, textureCorner);
  }

  if (blockStyle === 3) {
    return createSpriteSide(orientation % 6, side, vertexId, textureCorner);
  }

  if (blockStyle === 4) {
    return createTetraSide(orientation % 8, side, vertexId, textureCorner);
  }

  if (blockStyle === 5) {
    return createPentaSide(orientation % 8, side, vertexId, textureCorner);
  }

  return { side, vertexId, normalMode: 0, textureCorner };
}

function createSpikeSide(
  orientation: number,
  side: number,
  vertexId: number,
  textureCorner: number
): { readonly side: number; readonly vertexId: number; readonly normalMode: number; readonly textureCorner: number } {
  const code = spikeSideTransformCodes[orientation][side * 4 + vertexId];
  const normalMode = Math.floor(code / 24);
  const sideAndVertex = code - normalMode * 24;

  return {
    side: Math.floor(sideAndVertex / 4),
    vertexId: sideAndVertex % 4,
    normalMode,
    textureCorner
  };
}

function createTetraSide(
  orientation: number,
  side: number,
  vertexId: number,
  textureCorner: number
): { readonly side: number; readonly vertexId: number; readonly normalMode: number; readonly textureCorner: number } {
  const code = tetraSideTransformCodes[orientation][side * 4 + vertexId];
  const normalMode = Math.floor(code / 24);
  const sideAndVertex = code - normalMode * 24;

  return {
    side: Math.floor(sideAndVertex / 4),
    vertexId: sideAndVertex % 4,
    normalMode,
    textureCorner
  };
}

function createPentaSide(
  orientation: number,
  side: number,
  vertexId: number,
  textureCorner: number
): { readonly side: number; readonly vertexId: number; readonly normalMode: number; readonly textureCorner: number } {
  const code = pentaSideTransformCodes[orientation][side * 4 + vertexId];
  const normalMode = Math.floor(code / 24);
  const sideAndVertex = code - normalMode * 24;

  return {
    side: Math.floor(sideAndVertex / 4),
    vertexId: sideAndVertex % 4,
    normalMode,
    textureCorner
  };
}

function createSpriteSide(
  orientation: number,
  side: number,
  vertexId: number,
  textureCorner: number
): { readonly side: number; readonly vertexId: number; readonly normalMode: number; readonly textureCorner: number } {
  let sid = side;
  let vID = vertexId;

  if (orientation === 0 || orientation === 1) {
    if (side === BOTTOM) {
      if (vID === 0) {
        sid = TOP;
        vID = 3;
      } else if (vID === 3) {
        sid = TOP;
        vID = 0;
      }
    } else if (side === TOP) {
      if (vID === 1) {
        sid = BOTTOM;
        vID = 2;
      } else if (vID === 2) {
        sid = BOTTOM;
        vID = 1;
      }
    } else if (side === RIGHT) {
      if (vID === 2) {
        sid = LEFT;
        vID = 1;
      } else if (vID === 3) {
        sid = LEFT;
        vID = 0;
      }
    } else if (side === LEFT) {
      if (vID === 2) {
        sid = RIGHT;
        vID = 1;
      } else if (vID === 3) {
        sid = RIGHT;
        vID = 0;
      }
    } else if (side === FRONT || side === BACK) {
      vID = 0;
    }
  } else if (orientation === 2 || orientation === 3) {
    if (side === BOTTOM || side === TOP) {
      vID = 0;
    } else if (side === RIGHT) {
      if (vID === 0) {
        sid = LEFT;
        vID = 3;
      } else if (vID === 3) {
        sid = LEFT;
        vID = 0;
      }
    } else if (side === LEFT) {
      if (vID === 1) {
        sid = RIGHT;
        vID = 2;
      } else if (vID === 2) {
        sid = RIGHT;
        vID = 1;
      }
    } else if (side === FRONT) {
      if (vID === 1) {
        sid = BACK;
        vID = 2;
      } else if (vID === 2) {
        sid = BACK;
        vID = 1;
      }
    } else if (side === BACK) {
      if (vID === 0) {
        sid = FRONT;
        vID = 3;
      } else if (vID === 3) {
        sid = FRONT;
        vID = 0;
      }
    }
  } else {
    if (side === BOTTOM) {
      if (vID === 2) {
        sid = TOP;
        vID = 1;
      } else if (vID === 3) {
        sid = TOP;
        vID = 0;
      }
    } else if (side === TOP) {
      if (vID === 2) {
        sid = BOTTOM;
        vID = 1;
      } else if (vID === 3) {
        sid = BOTTOM;
        vID = 0;
      }
    } else if (side === RIGHT || side === LEFT) {
      vID = 0;
    } else if (side === FRONT) {
      if (vID === 2) {
        sid = BACK;
        vID = 1;
      } else if (vID === 3) {
        sid = BACK;
        vID = 0;
      }
    } else if (side === BACK) {
      if (vID === 2) {
        sid = FRONT;
        vID = 1;
      } else if (vID === 3) {
        sid = FRONT;
        vID = 0;
      }
    }
  }

  return { side: sid, vertexId: vID, normalMode: 0, textureCorner };
}

function createWedgeSide(
  orientation: number,
  side: number,
  vertexId: number,
  textureCorner: number
): { readonly side: number; readonly vertexId: number; readonly normalMode: number; readonly textureCorner: number } {
  let sid = side;
  let vID = vertexId;
  let normalMode = 0;

  switch (orientation) {
    case 0:
      if (side === TOP) {
        normalMode = wedgeNormalMode(TOP, BACK);
        if (vID === 0) {
          sid = BOTTOM;
          vID = 3;
        } else if (vID === 1) {
          sid = BOTTOM;
          vID = 2;
        }
      } else if (side === LEFT && vID === 1) {
        vID = 0;
      } else if (side === RIGHT && vID === 2) {
        vID = 1;
      } else if (side === BACK) {
        vID = 0;
      }
      break;
    case 1:
      if (side === TOP) {
        normalMode = wedgeNormalMode(LEFT, TOP);
        if (vID === 2) {
          sid = BOTTOM;
          vID = 1;
        } else if (vID === 1) {
          sid = BOTTOM;
          vID = 2;
        }
      } else if (side === LEFT) {
        vID = 0;
      } else if (side === BACK && vID === 2) {
        vID = 1;
      } else if (side === FRONT && vID === 1) {
        vID = 2;
      }
      break;
    case 2:
      if (side === TOP) {
        normalMode = wedgeNormalMode(TOP, FRONT);
        if (vID === 2) {
          sid = BOTTOM;
          vID = 1;
        } else if (vID === 3) {
          sid = BOTTOM;
          vID = 0;
        }
      } else if (side === LEFT && vID === 0) {
        vID = 3;
      } else if (side === RIGHT && vID === 3) {
        vID = 2;
      } else if (side === FRONT) {
        vID = 0;
      }
      break;
    case 3:
      if (side === TOP) {
        normalMode = wedgeNormalMode(TOP, RIGHT);
        if (vID === 0) {
          sid = BOTTOM;
          vID = 3;
        } else if (vID === 3) {
          sid = BOTTOM;
          vID = 0;
        }
      } else if (side === RIGHT) {
        vID = 0;
      } else if (side === BACK && vID === 3) {
        vID = 0;
      } else if (side === FRONT && vID === 0) {
        vID = 3;
      }
      break;
    case 4:
      if (side === BOTTOM) {
        normalMode = wedgeNormalMode(BOTTOM, BACK);
        if (vID === 3) {
          sid = TOP;
          vID = 0;
        } else if (vID === 2) {
          sid = TOP;
          vID = 1;
        }
      } else if (side === LEFT && vID === 2) {
        vID = 1;
      } else if (side === RIGHT && vID === 1) {
        vID = 0;
      } else if (side === BACK) {
        vID = 0;
      }
      break;
    case 5:
      if (side === BOTTOM) {
        normalMode = wedgeNormalMode(BOTTOM, RIGHT);
        if (vID === 3) {
          sid = TOP;
          vID = 0;
        } else if (vID === 0) {
          sid = TOP;
          vID = 3;
        }
      } else if (side === RIGHT) {
        vID = 0;
      } else if (side === BACK && vID === 0) {
        vID = 3;
      } else if (side === FRONT && vID === 3) {
        vID = 0;
      }
      break;
    case 6:
      if (side === BOTTOM) {
        normalMode = wedgeNormalMode(BOTTOM, FRONT);
        if (vID === 1) {
          sid = TOP;
          vID = 2;
        } else if (vID === 0) {
          sid = TOP;
          vID = 3;
        }
      } else if (side === LEFT && vID === 3) {
        vID = 2;
      } else if (side === RIGHT && vID === 0) {
        vID = 1;
      } else if (side === FRONT) {
        vID = 0;
      }
      break;
    case 7:
      if (side === BOTTOM) {
        normalMode = wedgeNormalMode(BOTTOM, LEFT);
        if (vID === 1) {
          sid = TOP;
          vID = 2;
        } else if (vID === 2) {
          sid = TOP;
          vID = 1;
        }
      } else if (side === LEFT) {
        vID = 0;
      } else if (side === BACK && vID === 1) {
        vID = 0;
      } else if (side === FRONT && vID === 2) {
        vID = 1;
      }
      break;
    case 8:
      if (side === RIGHT) {
        normalMode = wedgeNormalMode(RIGHT, BACK);
        if (vID === 1) {
          sid = LEFT;
          vID = 2;
        } else if (vID === 2) {
          sid = LEFT;
          vID = 1;
        }
      } else if (side === BOTTOM && vID === 3) {
        vID = 0;
      } else if (side === TOP && vID === 0) {
        vID = 3;
      } else if (side === BACK) {
        vID = 0;
      }
      break;
    case 9:
      if (side === FRONT) {
        normalMode = wedgeNormalMode(RIGHT, FRONT);
        if (vID === 0) {
          sid = BACK;
          vID = 3;
        } else if (vID === 3) {
          sid = BACK;
          vID = 0;
        }
      } else if (side === RIGHT) {
        vID = 0;
      } else if (side === BOTTOM && vID === 0) {
        vID = 1;
      } else if (side === TOP && vID === 3) {
        vID = 2;
      }
      break;
    case 10:
      if (side === LEFT) {
        normalMode = wedgeNormalMode(LEFT, BACK);
        if (vID === 1) {
          sid = RIGHT;
          vID = 2;
        } else if (vID === 2) {
          sid = RIGHT;
          vID = 1;
        }
      } else if (side === BOTTOM && vID === 2) {
        vID = 3;
      } else if (side === TOP && vID === 1) {
        vID = 0;
      } else if (side === BACK) {
        vID = 0;
      }
      break;
    case 11:
      if (side === FRONT) {
        normalMode = wedgeNormalMode(LEFT, FRONT);
        if (vID === 1) {
          sid = BACK;
          vID = 2;
        } else if (vID === 2) {
          sid = BACK;
          vID = 1;
        }
      } else if (side === LEFT) {
        vID = 0;
      } else if (side === BOTTOM && vID === 1) {
        vID = 2;
      } else if (side === TOP && vID === 2) {
        vID = 1;
      }
      break;
  }

  return { side: sid, vertexId: vID, normalMode, textureCorner };
}

function wedgeNormalMode(firstSide: number, secondSide: number): number {
  return (firstSide + 1) * 64 + (secondSide + 1) * 8;
}

function createHalfBlockConfig(
  index: number,
  side: number,
  orientation: number,
  slab: number
): { readonly elementSize: number; readonly elementVertexEdge: number; readonly xyScaleManip: number } {
  let elementSize = 0;
  let elementVertexEdge = 0;
  let xyScaleManip = 1;

  if (slab === 0) {
    return { elementSize, elementVertexEdge, xyScaleManip };
  }

  if (orientation === 0) {
    if (side === 0 || side === 1) {
      elementSize = side === 0 ? slab : 0;
    } else {
      if (side === 2) {
        elementVertexEdge = index === 2 || index === 3 ? slab : 0;
      } else if (side === 3) {
        elementVertexEdge = index === 0 || index === 1 ? slab : 0;
      } else if (side === 4 || side === 5) {
        elementVertexEdge = index === 0 || index === 3 ? slab : 0;
      }
      xyScaleManip = 0;
    }
  } else if (orientation === 1) {
    if (side === 0 || side === 1) {
      elementSize = side === 0 ? 0 : slab;
    } else {
      if (side === 2) {
        elementVertexEdge = index === 2 || index === 3 ? 0 : slab;
      } else if (side === 3) {
        elementVertexEdge = index === 0 || index === 1 ? 0 : slab;
      } else if (side === 4 || side === 5) {
        elementVertexEdge = index === 0 || index === 3 ? 0 : slab;
      }
      xyScaleManip = 0;
    }
  } else if (orientation === 2) {
    if (side === 2 || side === 3) {
      elementSize = side === 2 ? slab : 0;
    } else if (side === 0) {
      elementVertexEdge = index === 2 || index === 3 ? 0 : slab;
    } else if (side === 1) {
      elementVertexEdge = index === 0 || index === 1 ? 0 : slab;
    } else if (side === 4) {
      elementVertexEdge = index === 0 || index === 1 ? 0 : slab;
    } else if (side === 5) {
      elementVertexEdge = index === 2 || index === 3 ? 0 : slab;
    }
  } else if (orientation === 3) {
    if (side === 2 || side === 3) {
      elementSize = side === 2 ? 0 : slab;
    } else if (side === 0) {
      elementVertexEdge = index === 2 || index === 3 ? slab : 0;
    } else if (side === 1) {
      elementVertexEdge = index === 0 || index === 1 ? slab : 0;
    } else if (side === 4) {
      elementVertexEdge = index === 0 || index === 1 ? slab : 0;
    } else if (side === 5) {
      elementVertexEdge = index === 2 || index === 3 ? slab : 0;
    }
  } else if (orientation === 4) {
    if (side === 4 || side === 5) {
      elementSize = side === 4 ? 0 : slab;
    } else {
      if (side === 0 || side === 1) {
        elementVertexEdge = index === 0 || index === 3 ? 0 : slab;
        xyScaleManip = 0;
      } else if (side === 2 || side === 3) {
        elementVertexEdge = index === 0 || index === 3 ? 0 : slab;
      }
    }
  } else if (orientation === 5) {
    if (side === 4 || side === 5) {
      elementSize = side === 4 ? slab : 0;
    } else {
      if (side === 0 || side === 1) {
        elementVertexEdge = index === 0 || index === 3 ? slab : 0;
        xyScaleManip = 0;
      } else if (side === 2 || side === 3) {
        elementVertexEdge = index === 0 || index === 3 ? slab : 0;
      }
    }
  }

  return { elementSize, elementVertexEdge, xyScaleManip };
}

function encodeTile(tileId: number, layout: StarMadeCubeAtlasLayout | undefined): { readonly layer: number; readonly localTile: number } {
  if (layout) {
    return {
      layer: checkedInteger(tileIdToStarMadeLayer(tileId, layout).layer, "layer", 0, 7),
      localTile: checkedInteger(tileIdToStarMadeLocalTile(tileId, layout), "type", 0, 255)
    };
  }

  return {
    layer: Math.min(7, Math.floor(Math.max(0, tileId) / 256)),
    localTile: Math.max(0, tileId) % 256
  };
}

function encodeIndex(cubePosition: readonly [number, number, number], light: readonly [number, number, number]): number {
  const x = checkedInteger(cubePosition[0], "cubePosition.x", 0, 31);
  const y = checkedInteger(cubePosition[1], "cubePosition.y", 0, 31);
  const z = checkedInteger(cubePosition[2], "cubePosition.z", 0, 31);
  const red = checkedInteger(light[0], "light.r", 0, 31);
  const green = checkedInteger(light[1], "light.g", 0, 31);
  const blue = checkedInteger(light[2], "light.b", 0, 31);
  const index = x + y * 32 + z * 1024;

  return index + red * 65536 + green * 2097152 + blue * 67108864;
}

function encodeFace(options: {
  readonly side: number;
  readonly layer: number;
  readonly type: number;
  readonly hitPoints: number;
  readonly animated: boolean;
  readonly tex: number;
  readonly xyScaleManip: number;
  readonly onlyInBuildMode: boolean;
  readonly extendedTexture: boolean;
  readonly vertexCode: number;
}): number {
  return (
    options.side * 4 +
    options.layer * 32 +
    options.xyScaleManip * 256 +
    options.type * 512 +
    options.hitPoints * 131072 +
    (options.animated ? 1048576 : 0) +
    options.tex * 2097152 +
    (options.onlyInBuildMode ? 8388608 : 0) +
    (options.extendedTexture ? 16777216 : 0) +
    options.vertexCode
  );
}

function encodeSegmentIndex(chunkPosition: readonly [number, number, number]): number {
  const x = checkedInteger(chunkPosition[0], "chunkPosition.x", 0, 255);
  const y = checkedInteger(chunkPosition[1], "chunkPosition.y", 0, 255);
  const z = checkedInteger(chunkPosition[2], "chunkPosition.z", 0, 255);

  return x + y * 256 + z * 65536;
}

function encodeSecondary(options: {
  readonly normalMode: number;
  readonly overlay: number;
  readonly occlusion: number;
  readonly elementSize: number;
  readonly elementVertexEdge: number;
}): number {
  return (
    options.normalMode +
    options.overlay * 512 +
    options.occlusion * 32768 +
    options.elementSize * 1048576 +
    options.elementVertexEdge * 4194304
  );
}

function decodeNormalMode(normalMode: number): readonly [number, number, number] {
  const first = Math.floor(normalMode / 64);
  const second = Math.floor((normalMode - first * 64) / 8);
  const third = normalMode - first * 64 - second * 8;
  const normal = addNormal(addNormal(indexedNormal(first), indexedNormal(second)), indexedNormal(third));
  const length = Math.hypot(normal[0], normal[1], normal[2]);

  if (length === 0) {
    return [0, 0, 0];
  }

  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

function indexedNormal(index: number): readonly [number, number, number] {
  if (index <= 0 || index > starMadeNormals.length) {
    return [0, 0, 0];
  }

  return starMadeNormals[index - 1];
}

function addNormal(
  first: readonly [number, number, number],
  second: readonly [number, number, number]
): readonly [number, number, number] {
  return [first[0] + second[0], first[1] + second[1], first[2] + second[2]];
}

function decodeShaderPosition(
  side: number,
  vertexCode: number,
  cubePosition: readonly [number, number, number],
  chunkPosition: readonly [number, number, number],
  halfBlock: { readonly elementSize: number; readonly elementVertexEdge: number; readonly xyScaleManip: number }
): readonly [number, number, number] {
  const normal = starMadeNormals[side];
  const quadPosMark = quadPosMarks[side] as readonly number[];
  const quarters = vertexCode * 0.25;
  const mark = [
    modulo(Math.floor(quarters * quadPosMark[0]), 2),
    modulo(Math.floor(quarters * quadPosMark[1]), 2),
    modulo(Math.floor(quarters * quadPosMark[2]), 2)
  ] as const;
  const elementVertexEdge = halfBlock.elementVertexEdge * 0.25;
  // One axis-independent rule mirrors the GLSL expression. The native table
  // has no Y marker 2 or Z marker 4; duplicating the expression by axis created
  // unreachable branches while obscuring that shared invariant.
  const extra = quadPosMark.map((axisMark, axis) =>
    ((axisMark === 4 && halfBlock.xyScaleManip > 0.5) || (axisMark === 2 && halfBlock.xyScaleManip < 0.5))
      ? elementVertexEdge * (mark[axis] > 0 ? 1 : -1)
      : 0
  );

  return [
    cubePosition[0] - 16 + (-0.5 + Math.abs(normal[0]) * 0.5) + mark[0] - extra[0] + normal[0] * (0.5 - halfBlock.elementSize * 0.25) + (chunkPosition[0] - 128) * 32,
    cubePosition[1] - 16 + (-0.5 + Math.abs(normal[1]) * 0.5) + mark[1] - extra[1] + normal[1] * (0.5 - halfBlock.elementSize * 0.25) + (chunkPosition[1] - 128) * 32,
    cubePosition[2] - 16 + (-0.5 + Math.abs(normal[2]) * 0.5) + mark[2] - extra[2] + normal[2] * (0.5 - halfBlock.elementSize * 0.25) + (chunkPosition[2] - 128) * 32
  ];
}

function outwardFaceIndices(
  faceStart: number,
  positions: readonly (readonly [number, number, number])[],
  expectedNormal: readonly [number, number, number]
): readonly number[] {
  const dot = triangleNormalDot(positions[0], positions[1], positions[2], expectedNormal);

  if (dot >= 0) {
    return [faceStart, faceStart + 1, faceStart + 2, faceStart + 2, faceStart + 3, faceStart];
  }

  return [faceStart, faceStart + 2, faceStart + 1, faceStart, faceStart + 3, faceStart + 2];
}

function triangleNormalDot(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  normal: readonly [number, number, number]
): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];

  return cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2];
}

function checkedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got ${value}`);
  }

  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
