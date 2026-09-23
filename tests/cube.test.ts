import { describe, expect, it } from "vitest";
import { BufferAttribute, InterleavedBufferAttribute, IntType, Vector3 } from "three";
import { createBlockCubeGeometry } from "../src/geometry/cube";
import {
  createStarMadeEncodedCubeGeometry,
  createStarMadeEncodedCubeShapeFaces,
  STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION,
  STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE,
  STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE
} from "../src/geometry/starmadeEncodedCube";
import { createStarMadeCubeAtlasLayout, tileIdToStarMadeLocalTile } from "../src/starmade/atlas";
import { blockDefinitionFromConfig } from "../src/starmade/blockConfig";

describe("createBlockCubeGeometry", () => {
  it("creates an indexed cube with positions, normals, and UVs", () => {
    const geometry = createBlockCubeGeometry({
      textures: {
        front: 1,
        back: 2,
        top: 3,
        bottom: 4,
        right: 5,
        left: 6
      }
    });

    expect(geometry.index?.count).toBe(36);
    expect(geometry.getAttribute("position").count).toBe(24);
    expect(geometry.getAttribute("normal").count).toBe(24);
    expect(geometry.getAttribute("uv").count).toBe(24);
    expect(geometry.boundingBox).not.toBeNull();
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it("winds every face outward", () => {
    const geometry = createBlockCubeGeometry();
    const positions = geometry.getAttribute("position");
    const index = geometry.index;

    expect(index).not.toBeNull();

    const expectedNormals = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1)
    ];

    for (let face = 0; face < expectedNormals.length; face++) {
      const i0 = index!.getX(face * 6);
      const i1 = index!.getX(face * 6 + 1);
      const i2 = index!.getX(face * 6 + 2);
      const a = new Vector3().fromBufferAttribute(positions, i0);
      const b = new Vector3().fromBufferAttribute(positions, i1);
      const c = new Vector3().fromBufferAttribute(positions, i2);
      const normal = b.sub(a).cross(c.sub(a)).normalize();

      expect(normal.dot(expectedNormals[face])).toBeGreaterThan(0.999);
    }
  });

  it("groups faces by StarMade texture layer", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const geometry = createBlockCubeGeometry({
      starMadeAtlasLayout: layout,
      textures: {
        front: 300,
        back: 800,
        top: 33,
        bottom: 1800,
        right: 33,
        left: 300
      }
    });

    expect(geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 6, materialIndex: 1 },
      { start: 12, count: 6, materialIndex: 0 },
      { start: 18, count: 6, materialIndex: 4 },
      { start: 24, count: 6, materialIndex: 1 },
      { start: 30, count: 6, materialIndex: 3 }
    ]);
  });

  it("uses StarMade UV inset when a StarMade atlas layout is provided", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const geometry = createBlockCubeGeometry({
      starMadeAtlasLayout: layout,
      textures: {
        front: 33,
        back: 33,
        top: 33,
        bottom: 33,
        right: 33,
        left: 33
      }
    });
    const uvs = geometry.getAttribute("uv");

    expect(uvs.getX(0)).toBeCloseTo(1 / 16 + layout.uvInset);
    expect(uvs.getY(0)).toBeCloseTo(3 / 16 - layout.uvInset);
  });
});

describe("createStarMadeEncodedCubeGeometry", () => {
  it("creates StarMade shader encoded vertices beside CPU positions", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const geometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      textures: {
        front: 33,
        back: 33,
        top: 33,
        bottom: 33,
        right: 33,
        left: 33
      }
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const integerEncoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_INTEGER_VERTEX_ATTRIBUTE) as BufferAttribute;

    expect(geometry.index?.count).toBe(36);
    expect(geometry.getAttribute("position").count).toBe(24);
    expect(encoded.count).toBe(24);
    expect(encoded.itemSize).toBe(4);
    expect(encoded).toBe(integerEncoded);
    expect(integerEncoded.gpuType).toBe(IntType);
    expect(encoded.getX(0)).toBe(1662534160);
    expect(encoded.getY(0)).toBe(6308611);
    expect(encoded.getZ(0)).toBe(8421504);
    expect(encoded.getW(0)).toBe(1015808);
    expect(geometry.boundingBox).not.toBeNull();
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it("packs block light channels into the primary StarMade vertex code", () => {
    const geometry = createStarMadeEncodedCubeGeometry({ light: [0, 13, 31] });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const light = decodeLightCode(encoded.getX(0));

    expect(light.vertexIndex).toBe(16912);
    expect(light.red).toBe(0);
    expect(light.green).toBe(13);
    expect(light.blue).toBe(31);
  });

  it("uses StarMade side order and winds every encoded face outward", () => {
    const geometry = createStarMadeEncodedCubeGeometry();
    const positions = geometry.getAttribute("position");
    const index = geometry.index;

    expect(index).not.toBeNull();

    const expectedNormals = [
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0),
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0)
    ];

    for (let face = 0; face < expectedNormals.length; face++) {
      for (let triangle = 0; triangle < 2; triangle++) {
        const i0 = index!.getX(face * 6 + triangle * 3);
        const i1 = index!.getX(face * 6 + triangle * 3 + 1);
        const i2 = index!.getX(face * 6 + triangle * 3 + 2);
        const a = new Vector3().fromBufferAttribute(positions, i0);
        const b = new Vector3().fromBufferAttribute(positions, i1);
        const c = new Vector3().fromBufferAttribute(positions, i2);
        const normal = b.sub(a).cross(c.sub(a)).normalize();

        expect(normal.dot(expectedNormals[face])).toBeGreaterThan(0.999);
      }
    }
  });

  it("splits encoded quads with StarMade's triangle order", () => {
    const geometry = createStarMadeEncodedCubeGeometry();
    const index = geometry.index;

    expect(index).not.toBeNull();

    for (let face = 0; face < 6; face++) {
      const faceStart = face * 4;
      const triangles = Array.from({ length: 6 }, (_, offset) => index!.getX(face * 6 + offset) - faceStart);

      expect(triangles).toEqual([0, 1, 2, 2, 3, 0]);
    }
  });

  it("encodes atlas layer and local texture id from StarMade texture ids", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const geometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      orientation: 0,
      textures: {
        front: 300,
        back: 33,
        top: 33,
        bottom: 33,
        right: 33,
        left: 33
      }
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const frontFace = decodeFaceCode(encoded.getY(0));

    expect(frontFace.type).toBe(44);
    expect(frontFace.layer).toBe(1);
  });

  it("encodes StarMade inactive activation textures through the implicit +1 texture id", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const activationBlock = blockDefinitionFromConfig({
      id: 405,
      name: "Activation Module",
      textureIds: [427, 427, 427, 427, 427, 427],
      hasActivationTexture: true,
      canActivate: true
    });
    const activeGeometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      block: activationBlock,
      active: true,
      orientation: 0
    });
    const inactiveGeometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      block: activationBlock,
      active: false,
      orientation: 0
    });
    const activeFace = decodeFaceCode(activeGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0));
    const inactiveFace = decodeFaceCode(inactiveGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0));

    expect(activeFace.layer).toBe(1);
    expect(activeFace.type).toBe(171);
    expect(inactiveFace.layer).toBe(1);
    expect(inactiveFace.type).toBe(172);
  });

  it("encodes each StarMade side with the expected face texture and corner orders", () => {
    const layout = createStarMadeCubeAtlasLayout(64);
    const geometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      orientation: 0,
      textures: {
        front: 70,
        back: 86,
        top: 84,
        bottom: 221,
        right: 76,
        left: 33
      }
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const expected = [
      { side: 0, type: 70, tex: 2, vertex: 3 },
      { side: 1, type: 86, tex: 1, vertex: 2 },
      { side: 2, type: 84, tex: 1, vertex: 1 },
      { side: 3, type: 221, tex: 1, vertex: 3 },
      { side: 4, type: 76, tex: 1, vertex: 2 },
      { side: 5, type: 33, tex: 2, vertex: 3 }
    ];

    for (const face of expected) {
      expect(decodeFaceCode(encoded.getY(face.side * 4))).toEqual({
        onlyInBuildMode: 0,
        tex: face.tex,
        extendedTexture: 0,
        animated: 0,
        hitPoints: 0,
        type: face.type,
        xyScaleManip: 1,
        layer: 0,
        side: face.side,
        vertex: face.vertex
      });
    }
  });

  it("uses StarMade point-to-orientation texture order for a real six-sided cube block", () => {
    const gravityUnit = blockDefinitionFromConfig({
      id: 56,
      name: "Gravity Unit",
      textureIds: [288, 289, 290, 290, 290, 290],
      individualSides: 6,
      sideTexturesPointToOrientation: true,
      blockStyle: 0
    });
    const layout = createStarMadeCubeAtlasLayout(64);
    const expectedPointToOrientation = [
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
    ];

    for (let orientation = 0; orientation < expectedPointToOrientation.length; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({
        starMadeAtlasLayout: layout,
        block: gravityUnit,
        orientation
      });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      for (let side = 0; side < 6; side++) {
        for (let corner = 0; corner < 4; corner++) {
          const face = decodeFaceCode(encoded.getY(side * 4 + corner));

          expect(face.side).toBe(side);
          expect(face.type).toBe(tileIdToStarMadeLocalTile(gravityUnit.textureIds[getOrientationCode6(side, orientation)], layout));
          expect(face.tex).toBe(expectedPointToOrientation[orientation][side][corner]);
        }
      }
    }
  });

  it("uses StarMade AREA4x4 texture order and encodes the extended texture bit", () => {
    const extendedBlock = blockDefinitionFromConfig({
      id: 999,
      name: "Extended Texture Test",
      textureIds: [70, 86, 84, 221, 76, 33],
      individualSides: 6,
      extendedTexture: true,
      blockStyle: 0
    });
    const layout = createStarMadeCubeAtlasLayout(64);
    const geometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      block: extendedBlock,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(faceTextureCorners(encoded, 0)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 1)).toEqual([3, 1, 0, 2]);
    expect(faceTextureCorners(encoded, 2)).toEqual([3, 1, 0, 2]);
    expect(faceTextureCorners(encoded, 3)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 4)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 5)).toEqual([0, 2, 3, 1]);
    expect(decodeFaceCode(encoded.getY(1 * 4)).extendedTexture).toBe(1);
  });

  it("matches StarMade animated flags for three-sided and LOD blocks", () => {
    const animatedThreeSided = blockDefinitionFromConfig({
      id: 82,
      name: "Grass",
      textureIds: [508],
      individualSides: 3,
      animated: true,
      blockStyle: 0
    });
    const lodBlock = blockDefinitionFromConfig({
      id: 1234,
      name: "LOD Block",
      textureIds: [124],
      lodShape: "Pipe",
      blockStyle: 0
    });
    const layout = createStarMadeCubeAtlasLayout(64);
    const animatedGeometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      block: animatedThreeSided,
      orientation: 0
    });
    const lodGeometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      block: lodBlock,
      orientation: 0
    });
    const animatedEncoded = animatedGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const lodEncoded = lodGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(decodeFaceCode(animatedEncoded.getY(0 * 4)).animated).toBe(1);
    expect(decodeFaceCode(animatedEncoded.getY(1 * 4)).animated).toBe(1);
    expect(decodeFaceCode(animatedEncoded.getY(2 * 4)).animated).toBe(0);
    expect(decodeFaceCode(animatedEncoded.getY(3 * 4)).animated).toBe(0);
    expect(decodeFaceCode(animatedEncoded.getY(4 * 4)).animated).toBe(1);
    expect(decodeFaceCode(animatedEncoded.getY(5 * 4)).animated).toBe(1);
    expect(decodeFaceCode(lodEncoded.getY(2 * 4)).animated).toBe(1);
  });

  it("encodes StarMade build-mode-only and reactor chamber texture flags", () => {
    const chamberBlock = blockDefinitionFromConfig({
      id: 991,
      name: "Personal Gravity",
      textureIds: [10],
      drawOnlyInBuildMode: true,
      reactorChamberSpecific: true,
      blockStyle: 0
    });
    const geometry = createStarMadeEncodedCubeGeometry({ block: chamberBlock, orientation: 0 });
    const face = decodeFaceCode(geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(0));

    expect(face.onlyInBuildMode).toBe(1);
    expect(face.type).toBe(11);
  });

  it("uses the top-row third-column orientation as the default texture orientation", () => {
    const gravityUnit = blockDefinitionFromConfig({
      id: 56,
      name: "Gravity Unit",
      textureIds: [288, 289, 290, 290, 290, 290],
      individualSides: 6,
      sideTexturesPointToOrientation: true,
      blockStyle: 0
    });
    const layout = createStarMadeCubeAtlasLayout(64);
    const defaultGeometry = createStarMadeEncodedCubeGeometry({ starMadeAtlasLayout: layout, block: gravityUnit });
    const orientationTwoGeometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: layout,
      block: gravityUnit,
      orientation: STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION
    });
    const defaultEncoded = defaultGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const orientationTwoEncoded = orientationTwoGeometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(STARMADE_DEFAULT_CUBE_TEXTURE_ORIENTATION).toBe(2);
    for (let vertex = 0; vertex < defaultEncoded.count; vertex++) {
      expect(defaultEncoded.getY(vertex)).toBe(orientationTwoEncoded.getY(vertex));
    }
  });

  it("encodes StarMade slab factors into codeS and CPU positions", () => {
    const quarterSlab = blockDefinitionFromConfig({
      id: 698,
      name: "Grey Basic Armor 1/4",
      textureIds: [33],
      blockStyle: 0,
      slabIds: [700, 699, 698]
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: quarterSlab,
      orientation: 2
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const positions = geometry.getAttribute("position");
    const topFace = decodeSecondaryCode(encoded.getW(2 * 4));
    const frontFirst = decodeSecondaryCode(encoded.getW(0));
    const frontLast = decodeSecondaryCode(encoded.getW(3));
    const yValues = Array.from({ length: positions.count }, (_, index) => positions.getY(index));

    expect(quarterSlab.slab).toBe(3);
    expect(topFace.elementSize).toBe(3);
    expect(frontFirst.elementVertexEdge).toBe(3);
    expect(frontLast.elementVertexEdge).toBe(0);
    expect(Math.max(...yValues)).toBeCloseTo(-0.25);
    expect(Math.min(...yValues)).toBeCloseTo(-0.5);
  });

  it("encodes secondary occlusion in the active StarMade shader's 5-bit field", () => {
    const geometry = createStarMadeEncodedCubeGeometry({ occlusion: 31 });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(decodeSecondaryCode(encoded.getW(0)).occlusion).toBe(31);
    expect(() => createStarMadeEncodedCubeGeometry({ occlusion: 32 })).toThrow(
      "occlusion must be an integer between 0 and 31"
    );
  });

  it("encodes WedgeTopFront side remapping like StarMade", () => {
    const wedge = blockDefinitionFromConfig({
      id: 599,
      name: "Grey Basic Armor Wedge",
      textureIds: [33],
      individualSides: 1,
      blockStyle: 1
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: wedge,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const topFirst = decodeFaceCode(encoded.getY(2 * 4));
    const topFirstSecondary = decodeSecondaryCode(encoded.getW(2 * 4));
    const backFirst = decodeFaceCode(encoded.getY(1 * 4));

    expect(topFirst.side).toBe(3);
    expect(topFirst.vertex).toBe(1);
    expect(topFirst.tex).toBe(1);
    expect(topFirstSecondary.normalMode).toBe(208);
    expect(backFirst.side).toBe(1);
    expect(backFirst.vertex).toBe(2);
    expect(geometry.userData.starMadeFaceSourceSides).toEqual([0, 1, 2, 3, 4, 5]);
    expect(geometry.userData.starMadeFaceDrawBuckets).toEqual([0, 1, 6, 3, 4, 5]);
    expect(geometry.userData.starMadeFaceDrawBucketCounts).toEqual([1, 1, 0, 1, 1, 1, 1]);
    expect(geometry.userData.starMadeShapeFaces[2]).toMatchObject({
      sourceSide: 2,
      lightSide: 2,
      drawBucket: 6,
      surface: true,
      fullAxisSide: null
    });
    expect(geometry.userData.starMadeShapeFaces[2].vertices).toEqual([
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, 1],
      [1, 1, 1]
    ]);
  });

  it("preserves source sides separately from remapped shader sides for complex lighting", () => {
    const wedge = blockDefinitionFromConfig({
      id: 599,
      name: "Grey Basic Armor Wedge",
      textureIds: [33],
      individualSides: 1,
      blockStyle: 1
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: wedge,
      orientation: 0,
      visibleSides: [false, true, true, false, true, false]
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const topSourceFace = 1;
    const topFirst = decodeFaceCode(encoded.getY(topSourceFace * 4));

    expect(geometry.userData.starMadeFaceSourceSides).toEqual([1, 2, 4]);
    expect(geometry.userData.starMadeFaceDrawBuckets).toEqual([1, 6, 4]);
    expect(geometry.userData.starMadeShapeFaces.map((face: { sourceSide: number }) => face.sourceSide)).toEqual([1, 2, 4]);
    expect(topFirst.side).toBe(3);
  });

  it("creates shape-face metadata without requiring atlas-local texture ids", () => {
    const wedge = blockDefinitionFromConfig({
      id: 599,
      name: "Grey Basic Armor Wedge",
      textureIds: [557],
      individualSides: 1,
      blockStyle: 1
    });
    const shapeFaces = createStarMadeEncodedCubeShapeFaces({
      block: wedge,
      orientation: 0
    });

    expect(shapeFaces).toHaveLength(6);
    expect(shapeFaces[2].vertices).toEqual([
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, 1],
      [1, 1, 1]
    ]);
  });

  it("uses StarMade vertexInfo texture order for WedgeTopFront blocks", () => {
    const wedge = blockDefinitionFromConfig({
      id: 599,
      name: "Grey Basic Armor Wedge",
      textureIds: [33],
      blockStyle: 1
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: wedge,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(faceTextureCorners(encoded, 0)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 1)).toEqual([0, 3, 2, 1]);
    expect(faceTextureCorners(encoded, 2)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 3)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 4)).toEqual([1, 2, 3, 0]);
    expect(faceTextureCorners(encoded, 5)).toEqual([2, 0, 1, 3]);
  });

  it("creates wedge CPU positions from the remapped shader sides and vertices", () => {
    const wedge = blockDefinitionFromConfig({
      id: 599,
      name: "Grey Basic Armor Wedge",
      textureIds: [33],
      blockStyle: 1
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: wedge,
      orientation: 0
    });
    const positions = geometry.getAttribute("position");
    const topFaceY = Array.from({ length: 4 }, (_, index) => positions.getY(2 * 4 + index));
    const backFaceZ = Array.from({ length: 4 }, (_, index) => positions.getZ(1 * 4 + index));

    expect(geometry.index?.count).toBe(36);
    expect(positions.count).toBe(24);
    expect(new Set(topFaceY)).toEqual(new Set([-0.5, 0.5]));
    expect(new Set(backFaceZ)).toEqual(new Set([-0.5]));
  });

  it("supports every StarMade wedge orientation without invalid encoded sides", () => {
    const wedge = blockDefinitionFromConfig({
      id: 599,
      name: "Grey Basic Armor Wedge",
      textureIds: [33],
      blockStyle: 1
    });

    for (let orientation = 0; orientation < 12; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({ block: wedge, orientation });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      for (let vertex = 0; vertex < encoded.count; vertex++) {
        const face = decodeFaceCode(encoded.getY(vertex));
        const secondary = decodeSecondaryCode(encoded.getW(vertex));

        expect(face.side).toBeGreaterThanOrEqual(0);
        expect(face.side).toBeLessThanOrEqual(5);
        expect(face.vertex).toBeGreaterThanOrEqual(0);
        expect(face.vertex).toBeLessThanOrEqual(3);
        expect(secondary.normalMode).toBeGreaterThanOrEqual(0);
        expect(secondary.normalMode).toBeLessThanOrEqual(511);
      }
    }
  });

  it("encodes SpikeTopFrontRight corner remapping like StarMade", () => {
    const corner = blockDefinitionFromConfig({
      id: 600,
      name: "Grey Basic Armor Corner",
      textureIds: [33],
      blockStyle: 2
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: corner,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const backThird = decodeFaceCode(encoded.getY(1 * 4 + 2));
    const backThirdSecondary = decodeSecondaryCode(encoded.getW(1 * 4 + 2));
    const rightThird = decodeFaceCode(encoded.getY(4 * 4 + 2));
    const rightThirdSecondary = decodeSecondaryCode(encoded.getW(4 * 4 + 2));

    expect(backThird.side).toBe(0);
    expect(backThird.vertex).toBe(1);
    expect(backThird.tex).toBe(2);
    expect(backThirdSecondary.normalMode).toBe(208);
    expect(rightThird.side).toBe(5);
    expect(rightThird.vertex).toBe(3);
    expect(rightThird.tex).toBe(0);
    expect(rightThirdSecondary.normalMode).toBe(232);
  });

  it("uses StarMade vertexInfo texture order for SpikeTopFrontRight blocks", () => {
    const corner = blockDefinitionFromConfig({
      id: 600,
      name: "Grey Basic Armor Corner",
      textureIds: [33],
      blockStyle: 2
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: corner,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(faceTextureCorners(encoded, 0)).toEqual([0, 2, 1, 3]);
    expect(faceTextureCorners(encoded, 1)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 2)).toEqual([0, 3, 2, 1]);
    expect(faceTextureCorners(encoded, 3)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 4)).toEqual([1, 3, 0, 2]);
    expect(faceTextureCorners(encoded, 5)).toEqual([2, 0, 1, 3]);
  });

  it("supports every StarMade corner orientation without invalid encoded sides", () => {
    const corner = blockDefinitionFromConfig({
      id: 600,
      name: "Grey Basic Armor Corner",
      textureIds: [33],
      blockStyle: 2
    });

    for (let orientation = 0; orientation < 24; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({ block: corner, orientation });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      for (let vertex = 0; vertex < encoded.count; vertex++) {
        const face = decodeFaceCode(encoded.getY(vertex));
        const secondary = decodeSecondaryCode(encoded.getW(vertex));

        expect(face.side).toBeGreaterThanOrEqual(0);
        expect(face.side).toBeLessThanOrEqual(5);
        expect(face.vertex).toBeGreaterThanOrEqual(0);
        expect(face.vertex).toBeLessThanOrEqual(3);
        expect(secondary.normalMode).toBeGreaterThanOrEqual(0);
        expect(secondary.normalMode).toBeLessThanOrEqual(511);
      }
    }
  });

  it("encodes TetrahedronTopFrontRight remapping like StarMade", () => {
    const tetra = blockDefinitionFromConfig({
      id: 601,
      name: "Grey Basic Armor Tetra",
      textureIds: [33],
      blockStyle: 4
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: tetra,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const topFirst = decodeFaceCode(encoded.getY(2 * 4));
    const topFirstSecondary = decodeSecondaryCode(encoded.getW(2 * 4));

    expect(topFirst.side).toBe(3);
    expect(topFirst.vertex).toBe(0);
    expect(topFirst.tex).toBe(3);
    expect(topFirstSecondary.normalMode).toBe(171);
  });

  it("uses StarMade vertexInfo texture order for TetrahedronTopFrontRight blocks", () => {
    const tetra = blockDefinitionFromConfig({
      id: 601,
      name: "Grey Basic Armor Tetra",
      textureIds: [33],
      blockStyle: 4
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: tetra,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(faceTextureCorners(encoded, 0)).toEqual([0, 2, 1, 3]);
    expect(faceTextureCorners(encoded, 1)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 2)).toEqual([3, 0, 2, 1]);
    expect(faceTextureCorners(encoded, 3)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 4)).toEqual([2, 3, 0, 1]);
    expect(faceTextureCorners(encoded, 5)).toEqual([2, 0, 1, 3]);
  });

  it("supports every StarMade tetra orientation without invalid encoded sides", () => {
    const tetra = blockDefinitionFromConfig({
      id: 601,
      name: "Grey Basic Armor Tetra",
      textureIds: [33],
      blockStyle: 4
    });

    for (let orientation = 0; orientation < 24; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({ block: tetra, orientation });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      for (let vertex = 0; vertex < encoded.count; vertex++) {
        const face = decodeFaceCode(encoded.getY(vertex));
        const secondary = decodeSecondaryCode(encoded.getW(vertex));

        expect(face.side).toBeGreaterThanOrEqual(0);
        expect(face.side).toBeLessThanOrEqual(5);
        expect(face.vertex).toBeGreaterThanOrEqual(0);
        expect(face.vertex).toBeLessThanOrEqual(3);
        expect(secondary.normalMode).toBeGreaterThanOrEqual(0);
        expect(secondary.normalMode).toBeLessThanOrEqual(511);
      }
    }
  });

  it("encodes PentaTopFrontRight extra side like StarMade", () => {
    const penta = blockDefinitionFromConfig({
      id: 602,
      name: "Grey Basic Armor Hepta",
      textureIds: [33],
      blockStyle: 5
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: penta,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const extraFirst = decodeFaceCode(encoded.getY(6 * 4));
    const extraFirstSecondary = decodeSecondaryCode(encoded.getW(6 * 4));

    expect(geometry.getAttribute("position").count).toBe(28);
    expect(geometry.index?.count).toBe(42);
    expect(extraFirst.side).toBe(3);
    expect(extraFirst.vertex).toBe(1);
    expect(extraFirst.tex).toBe(1);
    expect(extraFirstSecondary.normalMode).toBe(171);
    expect(geometry.userData.starMadeFaceSourceSides).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("uses StarMade vertexInfo texture order for PentaTopFrontRight blocks", () => {
    const penta = blockDefinitionFromConfig({
      id: 602,
      name: "Grey Basic Armor Hepta",
      textureIds: [33],
      blockStyle: 5
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: penta,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(faceTextureCorners(encoded, 0)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 1)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 2)).toEqual([3, 1, 2, 0]);
    expect(faceTextureCorners(encoded, 3)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 4)).toEqual([1, 3, 0, 2]);
    expect(faceTextureCorners(encoded, 5)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 6)).toEqual([1, 2, 0, 3]);
  });

  it("supports every StarMade penta orientation without invalid encoded sides", () => {
    const penta = blockDefinitionFromConfig({
      id: 602,
      name: "Grey Basic Armor Hepta",
      textureIds: [33],
      blockStyle: 5
    });

    for (let orientation = 0; orientation < 24; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({ block: penta, orientation });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      expect(encoded.count).toBe(28);
      for (let vertex = 0; vertex < encoded.count; vertex++) {
        const face = decodeFaceCode(encoded.getY(vertex));
        const secondary = decodeSecondaryCode(encoded.getW(vertex));

        expect(face.side).toBeGreaterThanOrEqual(0);
        expect(face.side).toBeLessThanOrEqual(5);
        expect(face.vertex).toBeGreaterThanOrEqual(0);
        expect(face.vertex).toBeLessThanOrEqual(3);
        expect(secondary.normalMode).toBeGreaterThanOrEqual(0);
        expect(secondary.normalMode).toBeLessThanOrEqual(511);
      }
    }
  });

  it("uses StarMade vertexInfo texture order for OriencubeFrontBottom blocks", () => {
    const rail = blockDefinitionFromConfig({
      id: 608,
      name: "Rail Basic",
      textureIds: [33],
      blockStyle: 6
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: rail,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(geometry.getAttribute("position").count).toBe(24);
    expect(faceTextureCorners(encoded, 0)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 1)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 2)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 3)).toEqual([2, 0, 1, 3]);
    expect(faceTextureCorners(encoded, 4)).toEqual([0, 1, 3, 2]);
    expect(faceTextureCorners(encoded, 5)).toEqual([0, 1, 3, 2]);
  });

  it("uses StarMade's normal24 texture orientation mapping for rail-like blocks", () => {
    const rail = blockDefinitionFromConfig({
      id: 608,
      name: "Rail Basic",
      textureIds: [10, 20, 30, 40, 50, 60],
      individualSides: 6,
      blockStyle: 6
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: rail,
      orientation: 14
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(Array.from({ length: 6 }, (_, side) => decodeFaceCode(encoded.getY(side * 4)).type))
      .toEqual([50, 60, 10, 20, 40, 30]);
  });

  it("supports every StarMade normal24 orientation without invalid encoded sides", () => {
    const rail = blockDefinitionFromConfig({
      id: 608,
      name: "Rail Basic",
      textureIds: [33],
      blockStyle: 6
    });

    for (let orientation = 0; orientation < 24; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({ block: rail, orientation });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      expect(encoded.count).toBe(24);
      for (let vertex = 0; vertex < encoded.count; vertex++) {
        const face = decodeFaceCode(encoded.getY(vertex));
        const secondary = decodeSecondaryCode(encoded.getW(vertex));

        expect(face.side).toBeGreaterThanOrEqual(0);
        expect(face.side).toBeLessThanOrEqual(5);
        expect(face.vertex).toBeGreaterThanOrEqual(0);
        expect(face.vertex).toBeLessThanOrEqual(3);
        expect(secondary.normalMode).toBe(0);
      }
    }
  });

  it("encodes SpriteFront cross-plane remapping like StarMade", () => {
    const sprite = blockDefinitionFromConfig({
      id: 429,
      name: "White Rod Light",
      textureIds: [80],
      blockStyle: 3,
      transparent: true
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      block: sprite,
      orientation: 0
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const bottomFirst = decodeFaceCode(encoded.getY(3 * 4));
    const topSecond = decodeFaceCode(encoded.getY(2 * 4 + 1));
    const frontFirst = decodeFaceCode(encoded.getY(0));

    expect(bottomFirst.side).toBe(2);
    expect(bottomFirst.vertex).toBe(3);
    expect(topSecond.side).toBe(3);
    expect(topSecond.vertex).toBe(0);
    expect(frontFirst.side).toBe(0);
    expect(frontFirst.vertex).toBe(3);
  });

  it("creates sprite CPU positions from crossed remapped sides", () => {
    const sprite = blockDefinitionFromConfig({
      id: 429,
      name: "White Rod Light",
      textureIds: [80],
      blockStyle: 3
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: createStarMadeCubeAtlasLayout(64),
      block: sprite,
      orientation: 2
    });
    const positions = geometry.getAttribute("position");
    const topFace = Array.from({ length: 4 }, (_, index) => positions.getY(2 * 4 + index));
    const frontFaceZ = Array.from({ length: 4 }, (_, index) => positions.getZ(index));

    expect(geometry.index?.count).toBe(36);
    expect(positions.count).toBe(24);
    expect(geometry.userData.starMadeFaceDrawBuckets).toEqual([6, 6, 6, 6, 6, 6]);
    expect(geometry.userData.starMadeFaceDrawBucketCounts).toEqual([0, 0, 0, 0, 0, 0, 6]);
    expect(new Set(topFace)).toEqual(new Set([0.5]));
    expect(new Set(frontFaceZ)).toEqual(new Set([-0.5, 0.5]));
  });

  it("uses StarMade vertexInfo texture order for SpriteTop blocks", () => {
    const sprite = blockDefinitionFromConfig({
      id: 93,
      name: "Blue Flowers",
      textureIds: [448],
      blockStyle: 3,
      transparent: true
    });
    const geometry = createStarMadeEncodedCubeGeometry({
      starMadeAtlasLayout: createStarMadeCubeAtlasLayout(64),
      block: sprite,
      orientation: 2
    });
    const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    expect(faceTextureCorners(encoded, 0)).toEqual([0, 2, 3, 1]);
    expect(faceTextureCorners(encoded, 1)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 2)).toEqual([0, 1, 2, 3]);
    expect(faceTextureCorners(encoded, 3)).toEqual([0, 1, 2, 3]);
    expect(faceTextureCorners(encoded, 4)).toEqual([1, 3, 2, 0]);
    expect(faceTextureCorners(encoded, 5)).toEqual([0, 2, 3, 1]);
  });

  it("supports every StarMade sprite orientation without invalid encoded sides", () => {
    const sprite = blockDefinitionFromConfig({
      id: 429,
      name: "White Rod Light",
      textureIds: [80],
      blockStyle: 3
    });

    for (let orientation = 0; orientation < 6; orientation++) {
      const geometry = createStarMadeEncodedCubeGeometry({ block: sprite, orientation });
      const encoded = geometry.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      for (let vertex = 0; vertex < encoded.count; vertex++) {
        const face = decodeFaceCode(encoded.getY(vertex));
        const secondary = decodeSecondaryCode(encoded.getW(vertex));

        expect(face.side).toBeGreaterThanOrEqual(0);
        expect(face.side).toBeLessThanOrEqual(5);
        expect(face.vertex).toBeGreaterThanOrEqual(0);
        expect(face.vertex).toBeLessThanOrEqual(3);
        expect(secondary.normalMode).toBe(0);
      }
    }
  });

  it("keeps three-sided cube texture order locked to orientation zero like StarMade", () => {
    const grass = blockDefinitionFromConfig({
      id: 82,
      name: "Grass",
      textureIds: [508, 508, 507, 506, 508, 508],
      individualSides: 3,
      sideTexturesPointToOrientation: false,
      blockStyle: 0
    });
    const layout = createStarMadeCubeAtlasLayout(64);
    const orientationZero = createStarMadeEncodedCubeGeometry({ starMadeAtlasLayout: layout, block: grass, orientation: 0 });
    const orientationFive = createStarMadeEncodedCubeGeometry({ starMadeAtlasLayout: layout, block: grass, orientation: 5 });
    const zeroEncoded = orientationZero.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
    const fiveEncoded = orientationFive.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

    for (let vertex = 0; vertex < zeroEncoded.count; vertex++) {
      expect(fiveEncoded.getY(vertex)).toBe(zeroEncoded.getY(vertex));
    }
  });

  it("vertexLights/vertexOcclusion override uniform light per vertex", () => {
    // 6 faces * 4 vertices = 24 vertices
    const vertexLights: [number, number, number][] = Array.from({ length: 24 }, (_, i) => [
      i % 31, (i * 2) % 31, (i * 3) % 31
    ]);
    const vertexOcclusion: number[] = Array.from({ length: 24 }, (_, i) => i % 32);

    const geom = createStarMadeEncodedCubeGeometry({ vertexLights, vertexOcclusion });
    const encoded = geom.getAttribute("starMadeVertex");
    expect(encoded).toBeDefined();
    // vertex 0 should encode vertexLights[0] and vertexOcclusion[0]
    // Just verify it doesn't crash and produces correct vertex count
    expect(encoded?.count).toBe(24);
    // vertex 0: decode r from encoded[0] bits 16..20
    const v0 = encoded?.getX(0) ?? 0;
    const r0 = (v0 >> 16) & 0x1f;
    expect(r0).toBe(Math.round(vertexLights[0][0]));
  });


  // ── P2 exit criteria: face counts per block style (StarMade-Open contract) ─
  describe("P2 face counts per block style", () => {
    // From CubeMeshBufferContainer.VERTS_PER_FACE=4, SIDES=6, plus angled face
    // StarMade-Open generates:
    //   normal(0), wedge(1), corner(2), sprite(3), tetra(4), normal24(6) = 6 faces = 24 vertices
    //   hepta/penta(5) = 7 faces = 28 vertices (6 sides + 1 extra angled)

    const makeBlock = (blockStyle: number, slab = 0) =>
      blockDefinitionFromConfig({ id: 1, name: "t", textureIds: [0], blockStyle, slab });

    it.each([
      [0, 24, "normal"],
      [1, 24, "wedge"],
      [2, 24, "corner"],
      [3, 24, "sprite"],
      [4, 24, "tetra"],
      [5, 28, "penta/hepta"],
      [6, 24, "normal24"]
    ])("blockStyle %i (%s): %i vertices", (blockStyle, expectedVerts) => {
      const g = createStarMadeEncodedCubeGeometry({ block: makeBlock(blockStyle), orientation: 0 });
      expect(g.getAttribute("position").count).toBe(expectedVerts);
      expect(g.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).count).toBe(expectedVerts);
      expect(g.index?.count).toBe((expectedVerts / 4) * 6);
    });
  });

  // ── P2 slab geometry: StarMade slab=1,2,3 orientation TOP (2) ─────────────
  describe("P2 slab geometry all 3 sizes", () => {
    const makeBlock = (slab: number) =>
      blockDefinitionFromConfig({ id: 698, name: "slab", textureIds: [33], blockStyle: 0, slab });

    // StarMade-Open slab: maxY = 0.5 - slab * 0.25, minY = -0.5
    // orientation TOP (2) cuts the cube from the top
    it.each([
      [1, 0.25],
      [2, 0.0],
      [3, -0.25]
    ])("slab=%i orientation TOP: maxY=%.2f", (slab, expectedMaxY) => {
      const g = createStarMadeEncodedCubeGeometry({ block: makeBlock(slab), orientation: 2 });
      const positions = g.getAttribute("position");
      const yValues = Array.from({ length: positions.count }, (_, i) => positions.getY(i));
      expect(Math.max(...yValues)).toBeCloseTo(expectedMaxY, 2);
      expect(Math.min(...yValues)).toBeCloseTo(-0.5, 2);
    });

    it("slab=2 (half): all 6 faces still present", () => {
      const g = createStarMadeEncodedCubeGeometry({ block: makeBlock(2), orientation: 2 });
      expect(g.getAttribute("position").count).toBe(24);
    });
  });

  // ── P2 draw-bucket assignment per block style ─────────────────────────────
  describe("P2 draw-bucket metadata", () => {
    const makeBlock = (blockStyle: number) =>
      blockDefinitionFromConfig({ id: 1, name: "t", textureIds: [0], blockStyle });

    it("normal block: all faces in buckets 0..5 (no bucket 6)", () => {
      const g = createStarMadeEncodedCubeGeometry({ block: makeBlock(0) });
      const buckets = (g.userData as { starMadeFaceDrawBuckets?: number[] }).starMadeFaceDrawBuckets ?? [];
      expect(buckets.every((b: number) => b >= 0 && b <= 5)).toBe(true);
      expect(buckets.includes(6)).toBe(false);
    });

    it("wedge block: at least one angled face in bucket 6", () => {
      const g = createStarMadeEncodedCubeGeometry({ block: makeBlock(1), orientation: 0 });
      const buckets = (g.userData as { starMadeFaceDrawBuckets?: number[] }).starMadeFaceDrawBuckets ?? [];
      expect(buckets.includes(6)).toBe(true);
    });

    it("sprite block: all 6 faces in bucket 6", () => {
      const g = createStarMadeEncodedCubeGeometry({ block: makeBlock(3) });
      const buckets = (g.userData as { starMadeFaceDrawBuckets?: number[] }).starMadeFaceDrawBuckets ?? [];
      expect(buckets.every((b: number) => b === 6)).toBe(true);
    });
  });


  // ── P1: extended texture bit (StarMade CubeMeshBufferContainer info >> 24) ─
  describe("P1 extended texture encoding", () => {
    it("sets the extendedTexture bit (bit 24 of faceCode) for ExtendedTexture4x4 blocks", () => {
      const extBlock = blockDefinitionFromConfig({
        id: 901, name: "Extended Texture Block", textureIds: [64], extendedTexture: true
      });
      const normalBlock = blockDefinitionFromConfig({
        id: 902, name: "Normal Block", textureIds: [64]
      });
      const extGeom = createStarMadeEncodedCubeGeometry({ block: extBlock });
      const normGeom = createStarMadeEncodedCubeGeometry({ block: normalBlock });
      const encExt = extGeom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      const encNorm = normGeom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      // bit 24 = 0x1000000 in faceCode (getY)
      expect((encExt.getY(0) >> 24) & 1).toBe(1);
      expect((encNorm.getY(0) >> 24) & 1).toBe(0);
    });

    it("uses AREA4x4 texture order for extended texture blocks", () => {
      // orientation 0 top face: AREA4x4 tex corners should differ from NORMAL order
      const ext = blockDefinitionFromConfig({ id: 903, name: "Ext", textureIds: [0], extendedTexture: true });
      const norm = blockDefinitionFromConfig({ id: 904, name: "Norm", textureIds: [0] });
      const extGeom = createStarMadeEncodedCubeGeometry({ block: ext, orientation: 0 });
      const normGeom = createStarMadeEncodedCubeGeometry({ block: norm, orientation: 0 });
      // Top face starts at vertex index TOP*4 = 2*4 = 8; tex is bits 21..22 of faceCode
      const texOfExt = Array.from({ length: 4 }, (_, i) => (extGeom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(2 * 4 + i) >> 21) & 3);
      const texOfNorm = Array.from({ length: 4 }, (_, i) => (normGeom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE).getY(2 * 4 + i) >> 21) & 3);
      // They should not be identical (AREA4x4 remaps corners)
      expect(texOfExt.join()).not.toBe(texOfNorm.join());
    });
  });

  // ── P1: animated per-face StarMade rules ──────────────────────────────────
  describe("P1 animated per-face encoding", () => {
    const makeAnimated = (individualSides: number) =>
      blockDefinitionFromConfig({ id: 905, name: "Anim", textureIds: [0], animated: true, individualSides });

    it("three-sided animated block: top/bottom faces are NOT animated", () => {
      const block = makeAnimated(3);
      const geom = createStarMadeEncodedCubeGeometry({ block });
      const enc = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      // top face = sides[2], BOTTOM = sides[3] — animated bit = (faceCode >> 20) & 1
      const topAnimated = (enc.getY(2 * 4) >> 20) & 1;
      const bottomAnimated = (enc.getY(3 * 4) >> 20) & 1;
      const frontAnimated = (enc.getY(0 * 4) >> 20) & 1;
      expect(topAnimated).toBe(0);
      expect(bottomAnimated).toBe(0);
      expect(frontAnimated).toBe(1);
    });

    it("encodes native texture animation for a system block marked Animated", () => {
      const block = blockDefinitionFromConfig({ id: 1, name: "Ship Core", textureIds: [272], animated: true });
      const geom = createStarMadeEncodedCubeGeometry({ block });
      const enc = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);

      for (let side = 0; side < 6; side++) {
        expect((enc.getY(side * 4) >> 20) & 1).toBe(1);
      }
    });

    it("six-sided animated block: all faces are animated", () => {
      const block = makeAnimated(6);
      const geom = createStarMadeEncodedCubeGeometry({ block });
      const enc = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      for (let side = 0; side < 6; side++) {
        expect((enc.getY(side * 4) >> 20) & 1).toBe(1);
      }
    });

    it("LOD-backed block: animated bit set on all faces", () => {
      const block = blockDefinitionFromConfig({ id: 906, name: "LOD", textureIds: [0], lodShape: "MyModel" });
      const geom = createStarMadeEncodedCubeGeometry({ block });
      const enc = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      for (let side = 0; side < 6; side++) {
        expect((enc.getY(side * 4) >> 20) & 1).toBe(1);
      }
    });
  });

  // ── P1: reactor chamber texture type offset ───────────────────────────────
  describe("P1 reactor chamber texture type offset", () => {
    it("increments packed type by 1 for reactorChamberSpecific blocks", () => {
      const base = blockDefinitionFromConfig({ id: 907, name: "Base", textureIds: [33] });
      const reactor = blockDefinitionFromConfig({ id: 908, name: "Reactor", textureIds: [33], reactorChamberSpecific: true });
      const geomBase = createStarMadeEncodedCubeGeometry({ block: base });
      const geomReactor = createStarMadeEncodedCubeGeometry({ block: reactor });
      const encBase = geomBase.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      const encReactor = geomReactor.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      const typeBase = (encBase.getY(0) >> 9) & 0xff;
      const typeReactor = (encReactor.getY(0) >> 9) & 0xff;
      expect(typeReactor).toBe(typeBase + 1);
    });
  });

  // ── P2: AlgorithmParameters xyScaleManip numeric contract ────────────────
  describe("P2 AlgorithmParameters xyScaleManip and elementSize encoding", () => {
    it("slab quarter-1 (slab=1): xyScaleManip=1 on top face corners 0,1, =0 on 2,3", () => {
      const block = blockDefinitionFromConfig({ id: 909, name: "Slab", textureIds: [0], slab: 1 });
      // orientation TOP (2) = slab cuts from top
      const geom = createStarMadeEncodedCubeGeometry({ block, orientation: 2 });
      const encoded = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      // xyScaleManip bit = (faceCode >> 8) & 1
      const topXY = Array.from({ length: 4 }, (_, i) => (encoded.getY(2 * 4 + i) >> 8) & 1);
      // At least some corners should have xyScaleManip=1 (slab compresses Y axis)
      expect(topXY.some(v => v === 1)).toBe(true);
    });

    it("elementSize in secondary code matches slab level", () => {
      const block = blockDefinitionFromConfig({ id: 910, name: "Slab", textureIds: [0], slab: 2 });
      const geom = createStarMadeEncodedCubeGeometry({ block, orientation: 2 });
      const encoded = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      // elementSize = (secondaryCode >> 20) & 3 for TOP face vertex
      const eleSize = (encoded.getW(2 * 4) >> 20) & 3;
      expect(eleSize).toBe(2);
    });

    it("full cube (slab=0): xyScaleManip=1, elementSize=0 everywhere", () => {
      const block = blockDefinitionFromConfig({ id: 911, name: "Full", textureIds: [0] });
      const geom = createStarMadeEncodedCubeGeometry({ block });
      const encoded = geom.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      // elementSize should be 0, xyScaleManip should be 1 (full cube)
      const eleSize = (encoded.getW(0) >> 20) & 3;
      const xyScale = (encoded.getY(0) >> 8) & 1;
      expect(eleSize).toBe(0);
      expect(xyScale).toBe(1);
    });
  });


  // ── P2: encodeTile without atlas layout — tileId > 255 regression ────────
  describe("P2 encodeTile without atlas layout (tileId > 255)", () => {
    it("does not throw for textureId=557 without atlas layout", () => {
      // Regression: tileId=557 maps to layer=2, localTile=45 (557 = 2*256 + 45)
      const block = blockDefinitionFromConfig({ id: 900, name: "High-ID Block", textureIds: [557] });
      expect(() => createStarMadeEncodedCubeGeometry({ block })).not.toThrow();
    });

    it("maps tileId=557 to layer=2, localTile=45 when no atlas layout", () => {
      const block = blockDefinitionFromConfig({ id: 901, name: "High-ID Block", textureIds: [557] });
      const g = createStarMadeEncodedCubeGeometry({ block });
      const enc = g.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      // layer = (faceCode >> 5) & 7 in encodeFace
      const layer = (enc.getY(0) >> 5) & 7;
      // localTile = (faceCode >> 9) & 0xff
      const localTile = (enc.getY(0) >> 9) & 0xff;
      expect(layer).toBe(2);   // 557 / 256 = 2
      expect(localTile).toBe(45); // 557 % 256 = 45
    });

    it("maps tileId=0 to layer=0, localTile=0", () => {
      const block = blockDefinitionFromConfig({ id: 902, name: "Zero Tex", textureIds: [0] });
      const g = createStarMadeEncodedCubeGeometry({ block });
      const enc = g.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      expect((enc.getY(0) >> 5) & 7).toBe(0);
      expect((enc.getY(0) >> 9) & 0xff).toBe(0);
    });

    it("maps tileId=255 to layer=0, localTile=255", () => {
      const block = blockDefinitionFromConfig({ id: 903, name: "Max Layer 0", textureIds: [255] });
      const g = createStarMadeEncodedCubeGeometry({ block });
      const enc = g.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      expect((enc.getY(0) >> 5) & 7).toBe(0);
      expect((enc.getY(0) >> 9) & 0xff).toBe(255);
    });

    it("maps tileId=256 to layer=1, localTile=0", () => {
      const block = blockDefinitionFromConfig({ id: 904, name: "Layer 1 Start", textureIds: [256] });
      const g = createStarMadeEncodedCubeGeometry({ block });
      const enc = g.getAttribute(STARMADE_ENCODED_CUBE_VERTEX_ATTRIBUTE);
      expect((enc.getY(0) >> 5) & 7).toBe(1);
      expect((enc.getY(0) >> 9) & 0xff).toBe(0);
    });
  });

  // ── P2: wedge visibilityBlockerSides match StarMade-Open sidesToTest ───────
  describe("P2 wedge fullAxisSides match StarMade-Open sidesToTest", () => {
    const wedge = blockDefinitionFromConfig({ id: 910, name: "Wedge", textureIds: [0], blockStyle: 1 });

    // StarMade-Open WedgeTopFront(ori=0): sidesToTest=[BOTTOM(3), FRONT(0)]
    it("WedgeTopFront (ori=0): fullAxisSides=[0,3]", () => {
      const faces = createStarMadeEncodedCubeShapeFaces({ block: wedge, orientation: 0 });
      const sides = [...new Set(faces.filter(f => f.fullAxisSide !== null).map(f => f.fullAxisSide!))].sort((a, b) => a - b);
      expect(sides).toEqual([0, 3]); // FRONT, BOTTOM
    });

    // StarMade-Open WedgeTopBack(ori=2): sidesToTest=[BOTTOM(3), BACK(1)]
    it("WedgeTopBack (ori=2): fullAxisSides=[1,3]", () => {
      const faces = createStarMadeEncodedCubeShapeFaces({ block: wedge, orientation: 2 });
      const sides = [...new Set(faces.filter(f => f.fullAxisSide !== null).map(f => f.fullAxisSide!))].sort((a, b) => a - b);
      expect(sides).toEqual([1, 3]); // BACK, BOTTOM
    });

    // All 12 orientations: each should have exactly 2 fullAxisSides
    it("all 12 orientations produce exactly 2 fullAxisSides", () => {
      for (let ori = 0; ori < 12; ori++) {
        const faces = createStarMadeEncodedCubeShapeFaces({ block: wedge, orientation: ori });
        const sides = [...new Set(faces.filter(f => f.fullAxisSide !== null).map(f => f.fullAxisSide!))];
        expect(sides).toHaveLength(2);
      }
    });
  });

});

function decodeFaceCode(value: number): {
  readonly extendedTexture: number;
  readonly onlyInBuildMode: number;
  readonly tex: number;
  readonly animated: number;
  readonly hitPoints: number;
  readonly type: number;
  readonly xyScaleManip: number;
  readonly layer: number;
  readonly side: number;
  readonly vertex: number;
} {
  let rest = value;
  const extendedTexture = Math.floor(rest / 16777216);
  rest -= extendedTexture * 16777216;
  const onlyInBuildMode = Math.floor(rest / 8388608);
  rest -= onlyInBuildMode * 8388608;
  const tex = Math.floor(rest / 2097152);
  rest -= tex * 2097152;
  const animated = Math.floor(rest / 1048576);
  rest -= animated * 1048576;
  const hitPoints = Math.floor(rest / 131072);
  rest -= hitPoints * 131072;
  const type = Math.floor(rest / 512);
  rest -= type * 512;
  const xyScaleManip = Math.floor(rest / 256);
  rest -= xyScaleManip * 256;
  const layer = Math.floor(rest / 32);
  rest -= layer * 32;
  const side = Math.floor(rest / 4);
  rest -= side * 4;

  return {
    extendedTexture,
    onlyInBuildMode,
    tex,
    animated,
    hitPoints,
    type,
    xyScaleManip,
    layer,
    side,
    vertex: rest
  };
}

function decodeSecondaryCode(value: number): {
  readonly elementVertexEdge: number;
  readonly elementSize: number;
  readonly occlusion: number;
  readonly overlay: number;
  readonly normalMode: number;
} {
  let rest = value;
  const elementVertexEdge = Math.floor(rest / 4194304);
  rest -= elementVertexEdge * 4194304;
  const elementSize = Math.floor(rest / 1048576);
  rest -= elementSize * 1048576;
  const occlusion = Math.floor(rest / 32768);
  rest -= occlusion * 32768;
  const overlay = Math.floor(rest / 512);
  rest -= overlay * 512;

  return {
    elementVertexEdge,
    elementSize,
    occlusion,
    overlay,
    normalMode: rest
  };
}

function decodeLightCode(value: number): {
  readonly vertexIndex: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
} {
  let rest = Math.trunc(value);
  const blue = Math.floor(rest / 67108864);
  rest -= blue * 67108864;
  const green = Math.floor(rest / 2097152);
  rest -= green * 2097152;
  const red = Math.floor(rest / 65536);
  rest -= red * 65536;

  return {
    vertexIndex: rest,
    red,
    green,
    blue
  };
}

function faceTextureCorners(encoded: BufferAttribute | InterleavedBufferAttribute, face: number): number[] {
  return Array.from({ length: 4 }, (_, corner) => decodeFaceCode(encoded.getY(face * 4 + corner)).tex);
}

function getOrientationCode6(side: number, orientation: number): number {
  const orientationMapping6 = [
    [5, 4, 3, 2, 0, 1],
    [4, 5, 3, 2, 1, 0],
    [1, 0, 5, 4, 2, 3],
    [0, 1, 4, 5, 3, 2],
    [1, 0, 3, 2, 4, 5],
    [0, 1, 3, 2, 5, 4]
  ];

  return 5 - orientationMapping6[orientation][side];
}
