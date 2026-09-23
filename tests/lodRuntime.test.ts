import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, BufferGeometry, DataTexture, Group, Mesh, MeshPhongMaterial, ShaderMaterial, SkinnedMesh, Texture, Vector3 } from "three";
import { addStarMadeLodInstances, blockDefinitionFromConfig, computeStarMadeBlockLightVolume,
  createStarMadeLodInstance, createStarMadeLodShaderMaterial, loadStarMadeLodModel, loadStarMadeLodPrototypes,
  OgreMaxLoader, parseStarMadeLodModelDefinitions, type StarMadeLodBlockInstance } from "../src";

const reference = {name:"fixture", filename:"fixture", relpath:"fixture", sceneUrl:"/fixture.scene", texturePath:"/textures/"};
const entry = (name = 'fixture', style = 0): StarMadeLodBlockInstance => ({
  key:name, blockDefinition:blockDefinitionFromConfig({id:5,name,blockStyle:style,lodShape:name}),
  modelReference:{...reference,name}, block:{orientation:0,active:true}, worldPosition:[0,0,0], position:[1,2,3], entityName:'ship', blockId:5
});
const volume = computeStarMadeBlockLightVolume({size:[3,3,3],sources:[],solids:[]});
const options = {volume,volumeShift:[1,1,1] as const};
function prototype() {
  const root = new Group();
  const material = new MeshPhongMaterial(); material.name = 'source-material';
  root.add(new Mesh(new BoxGeometry(), material));
  return root;
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("LOD runtime conversion and instancing", () => {
  it("clones materials, positions the instance and adds required shader attributes", () => {
    const source = prototype();
    const originalMaterial = (source.children[0] as Mesh).material;
    const instance = createStarMadeLodInstance(source, entry(), options);
    expect(instance.position.toArray()).toEqual([1,2,3]);
    const cloned = instance.children[0].children[0] as Mesh;
    expect(cloned.material).toBeInstanceOf(ShaderMaterial);
    expect(cloned.material).not.toBe(originalMaterial);
    expect((source.children[0] as Mesh).material).toBe(originalMaterial);
    expect(cloned.geometry.getAttribute('color').getX(0)).toBe(1);
    expect(cloned.geometry.getAttribute('tangent').itemSize).toBe(4);
    expect((cloned.material as ShaderMaterial).userData.usesFallbackMainTexture).toBe(true);
    expect(cloned.renderOrder).toBe(0);
  });

  it("handles arrays, loaded data/image textures, and already-converted shader materials", () => {
    const source = new Group();
    const texture = new DataTexture(new Uint8Array([255,128,0,255]),1,1);
    const imageTexture = new Texture({width:2,height:2,complete:true} as never);
    const material = new MeshPhongMaterial({map:texture,emissiveMap:imageTexture,normalMap:texture});
    const shader = createStarMadeLodShaderMaterial();
    source.add(new Mesh(new BoxGeometry(),[material,shader]));
    const instance = createStarMadeLodInstance(source,{...entry(),block:{orientation:2,active:false}},
      {...options, sunOcclusionFloor:0, sun:{direction:new Vector3(1,2,3)}});
    const mats = (instance.children[0].children[0] as Mesh).material as ShaderMaterial[];
    expect(mats).toHaveLength(2);
    expect(mats[0].userData.hasNormalTexture).toBe(true);
    expect(mats[0].userData.hasEmissiveTexture).toBe(true);
    expect(mats[0].uniforms.emissiveOn.value).toBe(true);
    expect(mats[0].userData.usesFallbackMainTexture).toBe(false);
    expect(mats[1].name).toBe(shader.name);
    expect(mats[1]).not.toBe(shader);
    expect(texture.colorSpace).toBe('');
  });

  it.each([null, {}, {width:0,height:1}, {width:1,height:0}, {width:1,height:1,complete:false}])("falls back for an unuploadable texture image %s", image => {
    const source = prototype();
    ((source.children[0] as Mesh).material as MeshPhongMaterial).map = new Texture(image as never);
    const result = createStarMadeLodInstance(source,entry(),options);
    const mat = (result.children[0].children[0] as Mesh).material as ShaderMaterial;
    expect(mat.userData.usesFallbackMainTexture).toBe(true);
  });

  it("aggregates meaningful statistics and skips missing prototypes", () => {
    const source = prototype();
    const empty = new Mesh(new BufferGeometry(),new MeshPhongMaterial()); source.add(empty);
    const unindexed = new Mesh(new BoxGeometry().toNonIndexed(),new MeshPhongMaterial()); source.add(unindexed);
    const root = new Group();
    const stats = addStarMadeLodInstances([entry(),entry('sprite',3),entry('missing')], new Map([['fixture',source],['sprite',source]]),options,() => root);
    expect(stats.instanceCount).toBe(2); expect(stats.meshCount).toBe(6);
    expect(stats.triangleCount).toBe(48); expect(stats.spriteStyleInstances).toBe(1);
    expect(stats.vertexCount).toBe(120); expect(stats.fallbackMaterials).toBe(6);
    expect(root.children).toHaveLength(2);
    expect(addStarMadeLodInstances([],new Map(),options,() => root).instanceCount).toBe(0);
  });
});

describe("LOD async loading — model loader mocked, not claimed as real game I/O", () => {
  it("forwards texture path, deduplicates models and reports missing/failed models", async () => {
    const source = prototype();
    const load = vi.spyOn(OgreMaxLoader.prototype,'load').mockImplementation(async function(this: OgreMaxLoader,url: string) {
      expect(this.texturePath).toBe('/textures/');
      if(url.includes('failed')) throw Error('fixture download failure');
      return source;
    });
    vi.spyOn(console,'warn').mockImplementation(() => {});
    expect(await loadStarMadeLodModel(reference)).toBe(source);
    const missing = {...entry('missing'),modelReference:{...reference,name:'missing',sceneUrl:''}};
    const failed = {...entry('failed'),modelReference:{...reference,name:'failed',sceneUrl:'/failed.scene'}};
    const result = await loadStarMadeLodPrototypes([entry(),entry(),missing,failed]);
    expect(load).toHaveBeenCalledTimes(3);
    expect(result.prototypes.get('fixture')).toBe(source);
    expect(result.missing).toEqual(['failed','missing']);
    expect(await loadStarMadeLodPrototypes([])).toEqual({prototypes:new Map(),missing:[]});
    expect(parseStarMadeLodModelDefinitions('<Config/>')).toEqual([]);
  });

  it("replaces static skinned meshes lacking skin attributes and preserves mesh state", async () => {
    const source = new Group();
    const child = new SkinnedMesh(new BoxGeometry(),new MeshPhongMaterial());
    child.name='static'; child.position.set(1,2,3); child.visible=false; child.renderOrder=7;
    source.add(child);
    vi.spyOn(OgreMaxLoader.prototype,'load').mockResolvedValue(source);
    const result = await loadStarMadeLodPrototypes([entry()]);
    const prepared = result.prototypes.get('fixture')!.children[0] as Mesh;
    expect(prepared.type).toBe('Mesh'); expect(prepared.name).toBe('static');
    expect(prepared.position.toArray()).toEqual([1,2,3]); expect(prepared.visible).toBe(false); expect(prepared.renderOrder).toBe(7);
    expect(prepared.geometry).toBe(child.geometry);
  });

  it("waits for a delayed texture image without sleeping in the test", async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
    const source=prototype(); const texture=new Texture();
    ((source.children[0] as Mesh).material as MeshPhongMaterial).map=texture;
    vi.spyOn(OgreMaxLoader.prototype,'load').mockResolvedValue(source);
    const result=loadStarMadeLodPrototypes([entry()]);
    setTimeout(() => {texture.image={width:1,height:1,complete:true};},32);
    await vi.advanceTimersByTimeAsync(64);
    expect((await result).missing).toEqual([]);
  });

  it("bounds waiting for permanently absent texture data", async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
    const source=prototype(); const texture=new Texture();
    ((source.children[0] as Mesh).material as MeshPhongMaterial).map=texture;
    vi.spyOn(OgreMaxLoader.prototype,'load').mockResolvedValue(source);
    const result=loadStarMadeLodPrototypes([entry()]);
    await vi.advanceTimersByTimeAsync(10032);
    expect((await result).prototypes.has('fixture')).toBe(true);
    // Existing loader reports absent models, not missing textures: recorded as a parity limitation.
    expect(texture.image).toBeNull();
  });
});
