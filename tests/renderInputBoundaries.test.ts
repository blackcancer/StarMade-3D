/** @fileoverview Rendering input regressions for sparse, legacy and optional metadata. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, BufferAttribute, DataTexture, Group, Mesh, MeshPhongMaterial, Object3D,
  ShaderMaterial, SkinnedMesh, Texture } from "three";
import { addStarMadeLodInstances, blockDefinitionFromConfig, collectStarMadeLodBlockInstances,
  computeStarMadeBlockLightVolume, createStarMadeEncodedCubeGeometry, createStarMadeEncodedSegmentGeometry,
  createStarMadeLodInstance, createStarMadeLodShaderMaterial, faceTexturesFromTextureIds,
  loadStarMadeCubeTexturePack, loadStarMadeLodPrototypes, normalizeTextureIds, OgreMaxLoader,
  resolveStarMadeBlockTextureId, resolveStarMadeBlockTextureLayerLocal, segmentBlockIndex,
  starMadeBlockTextureOrientationCode, starMadeResourceOverlay,
  type BlockDefinition, type DecoderBlockDefinitionLike, type SegmentBlockDataLike,
  type SegmentDataLike, type StarMadeLodBlockInstance } from "../src";

const config = (extra: Partial<DecoderBlockDefinitionLike> = {}) => blockDefinitionFromConfig({ id: 5, name: "fixture", ...extra });
const reference = { name: "fixture", filename: "fixture", relpath: "fixture", sceneUrl: "/fixture.scene", texturePath: "/textures/" };
const entry: StarMadeLodBlockInstance = { key: "fixture", blockDefinition: config({ lodShape: "fixture" }),
  modelReference: reference, block: { orientation: 0, active: true }, worldPosition: [0, 0, 0],
  position: [0, 0, 0], entityName: "fixture", blockId: 5 };
const options = { volume: computeStarMadeBlockLightVolume({ size: [3, 3, 3], sources: [], solids: [] }), volumeShift: [1, 1, 1] as const };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Optional block rendering metadata", () => {
  it("normalizes sparse texture lists without producing invalid atlas indices", () => {
    expect(starMadeBlockTextureOrientationCode(undefined, 4, 0)).toBe(4);
    expect(normalizeTextureIds([], 1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(faceTexturesFromTextureIds([])).toEqual({ front: 0, back: 0, top: 0, bottom: 0, right: 0, left: 0 });
    expect(faceTexturesFromTextureIds(new Array<number>(6))).toEqual({ front: 0, back: 0, top: 0, bottom: 0, right: 0, left: 0 });
    for (const textureIds of [[], [300]]) {
      const block = { ...config(), textureIds };
      expect(resolveStarMadeBlockTextureId(block, 4, 0, true)).toBe(textureIds[0] ?? 0);
      expect(resolveStarMadeBlockTextureLayerLocal(block, 4, 0, true)).toMatchObject({ textureId: textureIds[0] ?? 0 });
    }
  });
  it.each([NaN, Infinity, -1, 0])("uses a bounded fallback for invalid full hitpoints %s", hp => {
    expect(config({ hp }).maxHitPointsFull).toBe(100);
  });
  it("handles partial light colors and unsupported style/slab values", () => {
    expect(config({ lightSourceColor: [] }).lightSourceColor).toEqual([1, 1, 1, 1]);
    expect(config({ blockStyle: 100, slab: -1 })).toMatchObject({ blockStyle: 0, slab: 0 });
  });
  it.each([["THREE_QUARTER", 1], ["HALF", 2], ["QUARTER", 3]] as const)("resolves %s slab identifiers", (name, slab) => {
    expect(config({ xmlTypeName: `HULL_${name}_SLAB` }).slab).toBe(slab);
  });
  it.each([[1, "ore"], [17, "flora"], [99, "off"], [{ index: 1 }, "ore"],
    [{ name: "FLORA", index: 1 }, "flora"], [{}, "off"], [null, "off"]] as const)("resolves resource descriptors %s", (value, expected) => {
    const block = config({ resourceInjection: value as DecoderBlockDefinitionLike["resourceInjection"] });
    expect(block.resourceInjection).toBe(expected);
    expect(starMadeResourceOverlay(block, 999)).toBe(0);
  });
  it("supports untyped legacy definitions without LOD name fields", () => {
    const block = { ...config({ animated: true }), lodShape: undefined, lodShapeActive: undefined } as unknown as BlockDefinition;
    const geometry = createStarMadeEncodedCubeGeometry({ block });
    expect((geometry.getAttribute("starMadeVertex").getY(0) >>> 20) & 1).toBe(1);
    geometry.dispose();
  });
  it("uses orientation zero when sampling an unmeshed legacy neighbor", () => {
    const blocks: SegmentBlockDataLike[] = [];
    blocks[segmentBlockIndex(16, 16, 16)] = { type: 5, hp: 127, orientation: 0, active: true };
    blocks[segmentBlockIndex(17, 16, 16)] = { type: 5, hp: 127, active: true } as SegmentBlockDataLike;
    const segment: SegmentDataLike = { x: 0, y: 0, z: 0, blocks, blockCount: 2 };
    const geometry = createStarMadeEncodedSegmentGeometry({ segment, blockDefinitions: [config()], isBlockMeshed: context => context.x === 16 });
    expect(geometry.index!.count).toBe(30);
  });
  it.each([false, undefined])("loads only color maps when normal loading is disabled or absent (%s)", async includeNormals => {
    const pack = await loadStarMadeCubeTexturePack({ baseUrl: "/fixture", includeNormals,
      textureLoader: { load: (_url: string, onLoad: (texture: Texture) => void) => onLoad(new Texture()) } as never });
    expect(pack.normalLayers).toBeUndefined();
    expect(pack.layers.size).toBeGreaterThan(0);
  });
});

describe("LOD conversion contracts", () => {
  it("keeps legacy implicit activation for missing model references", () => {
    const segment: SegmentDataLike = { x: 0, y: 0, z: 0, blockCount: 1,
      blocks: [{ type: 5, hp: 127, orientation: 0 } as SegmentBlockDataLike] };
    const result = collectStarMadeLodBlockInstances({ entities: [{ segments: [segment] }],
      blockDefinitions: new Map([[5, config({ lodShape: "fixture", lodShapeActive: "active" })]]), registry: new Map(), modelBaseUrl: "/fixture/" });
    expect(result[0].modelReference.name).toBe("active");
    expect(result[0].modelReference.sceneUrl).toBe("");
  });
  it("rejects invalid meshes without a material instead of publishing a usable instance", () => {
    const source = new Group(), mesh = new Mesh();
    (mesh as unknown as { material: unknown }).material = undefined; source.add(mesh);
    expect(() => createStarMadeLodInstance(source, entry, options)).toThrow();
  });
  it("names anonymous materials and reports real textured/emissive/normal material counts", () => {
    const source = new Group();
    const texture = new DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
    const material = new MeshPhongMaterial({ map: texture, normalMap: texture, emissiveMap: texture });
    material.name = undefined as never;
    source.add(new Mesh(new BoxGeometry(), [material]));
    const root = new Group();
    const stats = addStarMadeLodInstances([entry], new Map([["fixture", source]]), options, () => root);
    expect(stats).toMatchObject({ texturedMaterials: 1, emissiveMaterials: 1, normalMappedMaterials: 1 });
    expect(((root.children[0].children[0].children[0] as Mesh).material as ShaderMaterial[])[0].name).toMatch(/unnamed/);
  });
  it("clones foreign shader light metadata and tolerates missing native uniforms", () => {
    const material = new ShaderMaterial();
    material.uniforms.lightVec = { value: [null] };
    const root = new Group(); root.add(new Mesh(new BoxGeometry(), material));
    const result = createStarMadeLodInstance(root, entry, options);
    const cloned = (result.children[0].children[0] as Mesh).material as ShaderMaterial;
    expect(cloned.uniforms.lightVec.value).toEqual([null]);
  });
  it("loads already-decoded images and the normal/emissive textures from material arrays", async () => {
    const root = new Group();
    const data = new DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1);
    const image = new Texture({ width: 1, height: 1, complete: true } as never);
    root.add(new Mesh(new BoxGeometry(), [new MeshPhongMaterial({ map: data, emissiveMap: image, normalMap: data })]));
    vi.spyOn(OgreMaxLoader.prototype, "load").mockResolvedValue(root);
    const result = await loadStarMadeLodPrototypes([entry]);
    expect(result.prototypes.get("fixture")).toBe(root);
    expect(result.missing).toEqual([]);
  });
  it("repairs a skin-index-only static mesh without assuming that its parent lists it", async () => {
    const root = new Group(), unlistedParent = new Group();
    const geometry = new BoxGeometry();
    geometry.setAttribute("skinIndex", new BufferAttribute(new Uint16Array(geometry.getAttribute("position").count * 4), 4));
    const mesh = new SkinnedMesh(geometry, new MeshPhongMaterial());
    root.add(mesh); mesh.parent = unlistedParent;
    // Deliberately inconsistent imported scene graph, not a native rendering fixture.
    vi.spyOn(OgreMaxLoader.prototype, "load").mockResolvedValue(root);
    await loadStarMadeLodPrototypes([entry]);
    expect(unlistedParent.children[0]).toBeInstanceOf(Mesh);
    expect((unlistedParent.children[0] as Object3D).type).toBe("Mesh");
  });
  it("starts ready when a decoded texture image already exists", async () => {
    const root = new Group(); root.add(new Mesh(new BoxGeometry(), new MeshPhongMaterial({ map: new Texture({ width: 1, complete: true } as never) })));
    vi.spyOn(OgreMaxLoader.prototype, "load").mockResolvedValue(root);
    expect((await loadStarMadeLodPrototypes([entry])).missing).toEqual([]);
  });
  it("keeps an independently cloned empty native-light array", () => {
    const material = createStarMadeLodShaderMaterial();
    material.uniforms.lightVec.value = []; material.uniforms.lightDiffuse.value = [];
    const root = new Group(); root.add(new Mesh(new BoxGeometry(), material));
    const instance = createStarMadeLodInstance(root, entry, options);
    expect(((instance.children[0].children[0] as Mesh).material as ShaderMaterial).uniforms.lightVec.value).not.toBe(material.uniforms.lightVec.value);
  });
});
