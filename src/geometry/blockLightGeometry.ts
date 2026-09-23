import { BufferAttribute, BufferGeometry, IntType } from "three";
import {
  getStarMadeBlockLightFaceLight,
  getStarMadeBlockLightFaceVertexLights,
  getStarMadeBlockLightShapeFaceVertexLight,
  type StarMadeBlockLightVolume,
  type StarMadeGridPoint3
} from "../starmade/blockLighting.js";
import { type StarMadeEncodedCubeShapeFace } from "./starmadeEncodedCube.js";
import {
  STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE,
  STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE
} from "./starmadeEncodedCube.js";
import {
  STARMADE_OCCLUSION_COLOR_PERM,
  STARMADE_OCCLUSION_LIGHT_SCALE
} from "../starmade/blockLighting.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API types
// ─────────────────────────────────────────────────────────────────────────────

export interface StarMadeBlockLightGeometryOptions {
  /**
   * The block-light volume to sample from.
   */
  readonly volume: StarMadeBlockLightVolume;
  /**
   * World-space offset added to block positions when mapping to the volume grid.
   * [shiftX, shiftY, shiftZ] such that volumePosition = worldPosition + shift.
   */
  readonly volumeShift: readonly [number, number, number];
  /**
   * Multiplier applied to the raw light channel value after StarMade normalization.
   * Use > 1 to boost weak light propagation. Default 1.
   */
  readonly castBoost?: number;
  /**
   * Minimum sun occlusion floor for vertex/face occlusion channel.
   * Prevents fully-dark faces even with zero block-light. Default 0.
   */
  readonly occlusionFloor?: number;
}

export interface StarMadeBlockLightGeometryResult {
  /** Number of faces updated. */
  readonly faceCount: number;
  /** Number of vertices updated. */
  readonly vertexCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies StarMade block-light data from a computed volume to an encoded cube geometry.
 *
 * Reads the geometry's encoded vertex attribute (starMadeVertex / ivert), samples
 * the block-light volume for each face, and re-encodes the rgb light channels and
 * occlusion channel per vertex using StarMade-Open's encoding scheme.
 *
 * The geometry must have been produced by createStarMadeEncodedCubeGeometry() and
 * carry userData.starMadeFaceSourceSides / userData.starMadeShapeFaces metadata.
 *
 * @param geometry  The BufferGeometry to update in-place.
 * @param worldOffset  World position of encoded local block [0,0,0], normally
 *                    segment origin minus 16 plus the entity translation.
 * @param options  Light volume + encoding parameters.
 * @returns Counts of updated faces and vertices.
 */
export function applyStarMadeBlockLightToEncodedCubeGeometry(
  geometry: BufferGeometry,
  worldOffset: readonly [number, number, number],
  options: StarMadeBlockLightGeometryOptions
): StarMadeBlockLightGeometryResult {
  const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE) as BufferAttribute | undefined;
  const positions = geometry.getAttribute("position") as BufferAttribute | undefined;

  if (!encoded || encoded.itemSize < 4 || !positions) {
    return { faceCount: 0, vertexCount: 0 };
  }

  const nextEncoded = new Int32Array(encoded.array as Int32Array);
  const totalFaceCount = Math.floor(encoded.count / 4);
  const { volume, volumeShift, castBoost = 1, occlusionFloor = 0 } = options;

  const userData = geometry.userData as StarMadeEncodedCubeGeometryUserData;
  const faceSourceSides = userData.starMadeFaceSourceSides;
  const shapeFaces = userData.starMadeShapeFaces;

  let updatedFaces = 0;
  let updatedVertices = 0;

  for (let faceGroup = 0; faceGroup < totalFaceCount; faceGroup++) {
    const firstVertexIndex = faceGroup * 4;
    // Complete four-vertex groups and an item size >= 4 keep every encoded
    // component below in bounds; absent components cannot arise here.
    const firstVertexCode = nextEncoded[firstVertexIndex * encoded.itemSize];
    const firstFaceCode = nextEncoded[firstVertexIndex * encoded.itemSize + 1];
    const encodedOrigin = decodeEncodedCubeOrigin(nextEncoded[firstVertexIndex * encoded.itemSize + 2]);
    const firstSecondaryCode = nextEncoded[firstVertexIndex * encoded.itemSize + 3];

    const local = decodeEncodedCubeLocalPosition(firstVertexCode);
    const worldPosition: readonly [number, number, number] = [
      worldOffset[0] + local[0],
      worldOffset[1] + local[1],
      worldOffset[2] + local[2]
    ];
    const gridPosition: StarMadeGridPoint3 = [
      Math.round(worldPosition[0] + volumeShift[0]),
      Math.round(worldPosition[1] + volumeShift[1]),
      Math.round(worldPosition[2] + volumeShift[2])
    ];

    const encodedFaceIndex = decodeEncodedCubeFaceSide(firstFaceCode);
    const faceIndex = resolveBlockLightFaceSide(
      faceSourceSides?.[faceGroup],
      encodedFaceIndex,
      decodeEncodedCubeNormalMode(firstSecondaryCode)
    );

    if (faceIndex < 0 || faceIndex > 5) {
      continue;
    }

    // A missing sample is dark. Borrowing an unrelated face leaks light through
    // closed surfaces; shaped faces are gathered by the native shape sampler below.
    const faceRaw = getStarMadeBlockLightFaceLight(volume, gridPosition, faceIndex);
    const faceLight = faceRaw
      ? ([
          normalizeBlockLightChannel(faceRaw[0], castBoost),
          normalizeBlockLightChannel(faceRaw[1], castBoost),
          normalizeBlockLightChannel(faceRaw[2], castBoost)
        ] as const)
      : ([0, 0, 0] as const);
    // CenterVertex scales RGBA equally. Apply any explicit display floor afterwards.
    const faceOcclusion = Math.max((faceRaw?.[3] ?? 0) * STARMADE_OCCLUSION_LIGHT_SCALE, occlusionFloor);
    const faceVertexLights = getStarMadeBlockLightFaceVertexLights(volume, gridPosition, faceIndex);

    updatedFaces++;

    for (let vertexOffset = 0; vertexOffset < 4; vertexOffset++) {
      const vertexIndex = firstVertexIndex + vertexOffset;
      const vertexGridPos = vertexGridPosition(positions, vertexIndex, volumeShift, worldOffset, encodedOrigin);
      const vertexLight = getStarMadeBlockLightShapeFaceVertexLight(
        volume,
        gridPosition,
        vertexGridPos,
        shapeFaces?.[faceGroup] ?? faceIndex
      ) ?? faceVertexLights[vertexOffset];

      const light = vertexLight
        ? ([
            normalizeBlockLightChannel(vertexLight[0], castBoost),
            normalizeBlockLightChannel(vertexLight[1], castBoost),
            normalizeBlockLightChannel(vertexLight[2], castBoost)
          ] as const)
        : faceLight;
      const occlusion = vertexLight ? Math.max(vertexLight[3] * STARMADE_OCCLUSION_LIGHT_SCALE, occlusionFloor) : faceOcclusion;

      nextEncoded[vertexIndex * encoded.itemSize] = encodeBlockLightCubeIndex(local, light);
      nextEncoded[vertexIndex * encoded.itemSize + 3] = encodeBlockLightSecondaryOcclusion(
        nextEncoded[vertexIndex * encoded.itemSize + 3],
        occlusion
      );
      updatedVertices++;
    }
  }

  const nextAttribute = new BufferAttribute(nextEncoded, encoded.itemSize);
  nextAttribute.gpuType = IntType;
  geometry.setAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE, nextAttribute);
  geometry.setAttribute(STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE, nextAttribute);

  return { faceCount: updatedFaces, vertexCount: updatedVertices };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types and helpers
// ─────────────────────────────────────────────────────────────────────────────

interface StarMadeEncodedCubeGeometryUserData {
  readonly starMadeFaceSourceSides?: readonly number[];
  readonly starMadeShapeFaces?: readonly StarMadeEncodedCubeShapeFace[];
}

/** StarMade element directions [front,back,top,bottom,right,left] — same as starMadeElementDirections in blockLighting.ts */
const STARMADE_BLOCK_FACE_DIRECTIONS = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0]
] as const;

function decodeEncodedCubeLocalPosition(value: number): readonly [number, number, number] {
  const index = Math.trunc(value) % 65536;
  const z = Math.floor(index / 1024);
  const y = Math.floor((index - z * 1024) / 32);
  const x = index - z * 1024 - y * 32;

  return [x, y, z];
}

function decodeEncodedCubeFaceSide(value: number): number {
  return Math.floor((Math.trunc(value) % 32) / 4);
}

function decodeEncodedCubeOrigin(value: number): readonly [number, number, number] {
  // Matches the chunk contribution in starmadeEncodedCube.decodeShaderPosition.
  return [
    ((value & 255) - 128) * 32 - 16,
    (((value >>> 8) & 255) - 128) * 32 - 16,
    (((value >>> 16) & 255) - 128) * 32 - 16
  ];
}

function decodeEncodedCubeNormalMode(value: number): number {
  return Math.trunc(value) % 512;
}

function resolveBlockLightFaceSide(
  sourceSide: number | undefined,
  encodedSide: number,
  normalMode: number
): number {
  if (sourceSide !== undefined && sourceSide >= 0 && sourceSide <= 5) {
    return sourceSide;
  }

  return dominantNormalSide(normalMode) ?? encodedSide;
}

function dominantNormalSide(normalMode: number): number | null {
  if (normalMode <= 0) {
    return null;
  }

  const first = Math.floor(normalMode / 64);
  const second = Math.floor((normalMode - first * 64) / 8);
  const third = normalMode - first * 64 - second * 8;
  const normal = [0, 0, 0];

  for (const index of [first, second, third]) {
    const direction = STARMADE_BLOCK_FACE_DIRECTIONS[index - 1];

    if (!direction) { continue; }

    normal[0] += direction[0];
    normal[1] += direction[1];
    normal[2] += direction[2];
  }

  let dominantSide = 0;
  let dominantAbs = 0;

  for (let side = 0; side < STARMADE_BLOCK_FACE_DIRECTIONS.length; side++) {
    const direction = STARMADE_BLOCK_FACE_DIRECTIONS[side];
    const projection = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2];

    if (projection > dominantAbs) {
      dominantAbs = projection;
      dominantSide = side;
    }
  }

  return dominantAbs > 0 ? dominantSide : null;
}

function normalizeBlockLightChannel(value: number, boost: number): number {
  const scaled = Math.max(0, value * STARMADE_OCCLUSION_LIGHT_SCALE * boost);

  return Math.round(Math.min(1, scaled) * STARMADE_OCCLUSION_COLOR_PERM);
}

function encodeBlockLightCubeIndex(
  position: readonly [number, number, number],
  light: readonly [number, number, number]
): number {
  const index = position[0] + position[1] * 32 + position[2] * 1024;
  const r = Math.min(31, Math.max(0, Math.round(light[0])));
  const g = Math.min(31, Math.max(0, Math.round(light[1])));
  const b = Math.min(31, Math.max(0, Math.round(light[2])));

  return index + r * 65536 + g * 2097152 + b * 67108864;
}

function encodeBlockLightSecondaryOcclusion(value: number, occlusion: number): number {
  const currentOcclusion = Math.floor(value / 32768) % 32;
  const encodedOcclusion = Math.min(31, Math.max(0, Math.round(occlusion * 31)));

  return value - currentOcclusion * 32768 + encodedOcclusion * 32768;
}

function vertexGridPosition(
  positions: BufferAttribute,
  vertexIndex: number,
  volumeShift: readonly [number, number, number],
  worldOffset: readonly [number, number, number],
  encodedOrigin: readonly [number, number, number]
): StarMadeGridPoint3 {
  // Positions already include the encoded segment origin. Apply only its
  // displacement into world space, so entity translation and face sampling agree.
  return [
    (positions.getX(vertexIndex) + worldOffset[0] - encodedOrigin[0] + volumeShift[0]) * 2,
    (positions.getY(vertexIndex) + worldOffset[1] - encodedOrigin[1] + volumeShift[1]) * 2,
    (positions.getZ(vertexIndex) + worldOffset[2] - encodedOrigin[2] + volumeShift[2]) * 2
  ];
}
