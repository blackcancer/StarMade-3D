import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileLoader, LoadingManager, Mesh, Object3D, Skeleton, SkinnedMesh, Texture, TextureLoader,
  MeshPhongMaterial, type Material } from "three";
import * as vendor from "../src/vendor/OgreMaxLoader.js";
import { element as e, documentFixture as doc, type ElementFixture } from "./helpers/elementFixture";

type Result = Object3D & { skeleton?: unknown; animations?: unknown[] };
type Load = (url: string, onLoad?: (result: Result) => void,
  onProgress?: (event: ProgressEvent) => void, onError?: (error: Error) => void) => Promise<Result>;
const Vendor = vendor as unknown as {
  OgreMaxLoader: new (manager?: LoadingManager) => {
    load: Load; texturePath: string; withCredentials: boolean;
    parse(xml: unknown): unknown;
  };
  DotMaterialLoader: new (manager?: LoadingManager) => {
    load(url: string, onLoad?: (materials: Material[]) => void,
      onProgress?: (event: ProgressEvent) => void, onError?: (error: Error) => void): Promise<Material[]>;
    path: string; texturePath: string; withCredentials: boolean;
    parse(text: string): Material[];
  };
};

const triangle = () => e('mesh', {}, e('submeshes', {}, e('submesh', {},
  e('geometry', {vertexcount: 3}, e('vertexbuffer', {positions: 'true'},
    ...[[0, 0, 0], [1, 0, 0], [0, 1, 0]].map(([x, y, z]) => e('vertex', {}, e('position', {x, y, z}))))),
  e('faces', {}, e('face', {v1: 0, v2: 1, v3: 2})))));
const scene = (...meshes: string[]) => e('scene', {}, e('nodes', {},
  ...meshes.map((meshFile, index) => e('node', {name: `node-${index}`},
    e('entity', {name: `mesh-${index}`, meshFile})))));
const skeleton = () => e('skeleton', {}, e('bones', {}, e('bone', {id:0, name:'root'}, e('position', {x:3}))), e('bonehierarchy'));
const rigged = (multiple = false) => {
  const mesh = triangle();
  if (multiple) mesh.children[0].children.push(triangle().children[0].children[0]);
  // A skeleton link alone does not make static vertices weighted.
  for (const submesh of mesh.children[0].children) {
    submesh.children.push(e('boneassignments', {}, ...[0, 1, 2].map(vertexindex =>
      e('vertexboneassignment', {vertexindex, boneindex: 0, weight: 1}))));
  }
  mesh.children.push(e('skeletonlink', {name:'rig.skeleton'}));
  return mesh;
};
const materialScene = () => e('scene', {}, e('nodes', {}, e('node', {}, e('entity', {name:'hull', meshFile:'hull.mesh'},
  e('subentities', {}, e('subentity', {index:0,materialName:'hull'}), e('subentity', {index:1,materialName:'absent'}))))));
const materialText = (withTexture = false) => `material hull\n{\ntechnique\n{\npass\n{\ndiffuse 0.2 0.3 0.4\n${withTexture ? 'texture_unit\n{\ntexture hull.png\n}\n' : ''}}\n}\n}`;

/** FileLoader transport double; actual loader parsing and completion callbacks run. */
function transport(files: Record<string, ElementFixture | string | Error>, manual = false, progressTotal?: number) {
  const pending = new Map<string, () => void>();
  const requested: Array<{url: string; credentials: boolean}> = [];
  vi.stubGlobal('DOMParser', class {
    parseFromString(text: string) {
      const root = files[text];
      if (!(root && typeof root === 'object' && 'nodeName' in root)) throw Error(`No fixture for ${text}`);
      return doc(root);
    }
  });
  vi.spyOn(FileLoader.prototype, 'load').mockImplementation(function (this: FileLoader, url, onLoad, onProgress, onError) {
    requested.push({url, credentials: this.withCredentials});
    this.manager.itemStart(url);
    const finish = () => {
      pending.delete(url);
      onProgress?.({loaded: 4, total: progressTotal} as unknown as ProgressEvent);
      const value = files[url];
      if (value === undefined || value instanceof Error) {
        onError?.(value ?? Error('HTTP 404'));
        this.manager.itemError(url);
      } else {
        onLoad?.(typeof value === 'string' ? value : url);
      }
      this.manager.itemEnd(url);
    };
    pending.set(url, finish);
    if (!manual) queueMicrotask(finish);
  });
  return {requested, pending, finish: (url: string) => {
    const complete = pending.get(url);
    if (!complete) throw Error(`No pending request for ${url}`);
    complete();
  }};
}
const drain = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  for (const name of ['log', 'error', 'warn', 'table', 'groupCollapsed', 'groupEnd'] as const) {
    vi.spyOn(console, name).mockImplementation(() => {});
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('OgreMax asynchronous dependency completion', () => {
  it('rejects a missing mesh without resolving a partial scene or leaking a nested rejection', async () => {
    transport({'ship.scene': scene('missing.mesh')});
    const onLoad = vi.fn(), onError = vi.fn();
    await expect(new Vendor.OgreMaxLoader().load('ship.scene', onLoad, undefined, onError)).rejects.toThrow(/dependency error/);
    await drain(); // Vitest also fails the suite on any unhandled dependency rejection.
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('waits for every successful dependency and balances the external loading manager', async () => {
    const io = transport({'ship.scene': scene('a.mesh', 'b.mesh'), './a.mesh.xml': triangle(), './b.mesh.xml': triangle()}, true);
    const manager = new LoadingManager();
    const complete = vi.fn(); manager.onLoad = complete;
    const loader = new Vendor.OgreMaxLoader(manager);
    const onLoad = vi.fn(); const progress = vi.fn();
    const loading = loader.load('ship.scene', onLoad, progress);
    expect(() => loader.load('other.scene')).toThrow(/already in progress/);
    io.finish('ship.scene'); io.finish('./b.mesh.xml');
    await drain(); expect(onLoad).not.toHaveBeenCalled();
    io.finish('./a.mesh.xml');
    const object = await loading;
    expect(object.getObjectByName('mesh-0')).toBeInstanceOf(Mesh);
    expect(object.getObjectByName('mesh-1')).toBeInstanceOf(Mesh);
    expect(onLoad).toHaveBeenCalledWith(object);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', loaded: 4, total: 0, lengthComputable: false }));
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', loaded: 3, total: 3, lengthComputable: true }));
  });

  it('keeps an errored loader busy until remaining dependencies drain, then permits reuse', async () => {
    const io = transport({'ship.scene': scene('missing.mesh', 'late.mesh'), './late.mesh.xml': triangle(), 'retry.scene': scene()}, true);
    const loader = new Vendor.OgreMaxLoader();
    const onLoad = vi.fn(), onError = vi.fn();
    const failure = expect(loader.load('ship.scene', onLoad, undefined, onError)).rejects.toThrow(/dependency error/);
    io.finish('ship.scene'); io.finish('./missing.mesh.xml');
    await failure;
    expect(() => loader.load('retry.scene')).toThrow(/already in progress/);
    io.finish('./late.mesh.xml'); await drain();
    expect(onLoad).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledTimes(1);
    const retry = loader.load('retry.scene'); io.finish('retry.scene');
    expect((await retry).type).toBe('Scene');
  });

  it('rejects a missing root and malformed XML, and remains reusable', async () => {
    transport({'bad.scene': e('scene', {}, e('parsererror')), 'valid.scene': scene()});
    const loader = new Vendor.OgreMaxLoader();
    await expect(loader.load('missing.scene')).rejects.toThrow(/E_IO/);
    await expect(loader.load('bad.scene')).rejects.toThrow(/Malformed XML/);
    expect((await loader.load('valid.scene')).type).toBe('Scene');
  });

  it.each([false, true])('loads and binds skeletons to the complete mesh hierarchy (multiple=%s)', async multiple => {
    transport({'rig.mesh.xml': rigged(multiple), './rig.skeleton.xml': skeleton(), 'rig.skeleton.xml': skeleton()});
    const root = await new Vendor.OgreMaxLoader().load('rig.mesh.xml');
    const meshes: SkinnedMesh[] = [];
    root.traverse(object => { if (object instanceof SkinnedMesh) meshes.push(object); });
    expect(meshes).toHaveLength(multiple ? 2 : 1);
    for (const mesh of meshes) {
      expect(mesh.skeleton).toBeInstanceOf(Skeleton);
      expect(mesh.skeleton.bones[0].name).toBe('root');
      expect(mesh.skeleton.boneInverses[0].elements[12]).toBe(-3);
      expect(mesh.animations).toEqual([]);
    }
    expect(root.getObjectByName('root')?.parent).toBe(root);
    const standalone = await new Vendor.OgreMaxLoader().load('rig.skeleton.xml');
    expect(standalone.skeleton).toBeInstanceOf(Skeleton);
  });

  it.each([false, true])('loads scene materials with a missing-name fallback (textured=%s)', async textured => {
    const io = transport({'ship.scene':materialScene(), './hull.mesh.xml':triangle(), './ship.material':materialText(textured)});
    vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => new Texture());
    const loader = new Vendor.OgreMaxLoader(); loader.texturePath = '/textures/'; loader.withCredentials = true;
    const loaded = await loader.load('ship.scene');
    const mesh = loaded.getObjectByName('hull') as Mesh;
    const materials = mesh.material as Material[];
    expect(materials[0]).toBeInstanceOf(MeshPhongMaterial);
    expect((materials[0] as MeshPhongMaterial).color.toArray()).toEqual([.2,.3,.4]);
    expect(materials[1].type).toBe('MeshStandardMaterial');
    expect(io.requested[0]).toEqual({url:'ship.scene', credentials:true});
  });

  it('resolves names containing dots and retains an unnamed entity mesh name', async () => {
    const source = materialScene();
    delete source.children[0].children[0].children[0].attributes.name;
    transport({'ship.v2.scene':source, './hull.mesh.xml':triangle(), './ship.v2.material':materialText()});
    const loaded = await new Vendor.OgreMaxLoader().load('ship.v2.scene');
    const mesh = loaded.getObjectByName('submesh') as Mesh;
    expect((mesh.material as Material[])[0].name).toBe('hull');
  });

  it.each(['skeleton', 'material'])('rejects missing %s dependencies without unhandled rejections', async kind => {
    const files: Record<string, ElementFixture> = kind === 'skeleton' ? {'ship.scene':rigged()} : {'ship.scene':materialScene(), './hull.mesh.xml':triangle()};
    transport(files);
    const onLoad = vi.fn();
    await expect(new Vendor.OgreMaxLoader().load('ship.scene', onLoad)).rejects.toThrow(/dependency error/);
    await drain(); expect(onLoad).not.toHaveBeenCalled();
  });

  it('converts parse exceptions and propagates callback failures through the returned promise', async () => {
    transport({'ship.scene':scene()});
    for (const thrown of [Error('parser failure'), 'string failure', null]) {
      const loader = new Vendor.OgreMaxLoader();
      vi.spyOn(loader, 'parse').mockImplementation(() => {throw thrown;});
      await expect(loader.load('ship.scene')).rejects.toThrow(/E_RUNTIME/);
    }
    const successFailure = Error('onLoad failed');
    await expect(new Vendor.OgreMaxLoader().load('ship.scene', () => {throw successFailure;})).rejects.toThrow('onLoad failed');
    const errorFailure = Error('onError failed');
    await expect(new Vendor.OgreMaxLoader().load('missing.scene', undefined, undefined, () => {throw errorFailure;})).rejects.toBe(errorFailure);
    const onLoad = vi.fn();
    await expect(new Vendor.OgreMaxLoader().load('ship.scene', onLoad, () => {throw Error('progress failed');})).rejects.toThrow('progress failed');
    expect(onLoad).not.toHaveBeenCalled();
    vi.mocked(FileLoader.prototype.load).mockImplementationOnce(() => { throw Error('transport construction failed'); });
    await expect(new Vendor.OgreMaxLoader().load('ship.scene')).rejects.toThrow('transport construction failed');
  });

  it('allows chaining another operation from onLoad without replacing the first result', async () => {
    transport({'first.skeleton':skeleton(), 'next.scene':scene()});
    const loader = new Vendor.OgreMaxLoader();
    let next: Promise<Result> | undefined;
    const first = await loader.load('first.skeleton', () => {next = loader.load('next.scene');});
    expect(first.skeleton).toBeInstanceOf(Skeleton);
    expect((await next)?.type).toBe('Scene');
  });

  it('rejects an unsupported custom parser result and reports complete byte progress', async () => {
    transport({'ship.scene':scene()}, false, 8);
    const loader = new Vendor.OgreMaxLoader();
    vi.spyOn(loader, 'parse').mockReturnValue({});
    const progress = vi.fn();
    await expect(loader.load('ship.scene', undefined, progress)).rejects.toThrow(/Parser did not produce/);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', loaded: 4, total: 8, lengthComputable: true }));
  });
});

describe('DotMaterial asynchronous loading', () => {
  it('uses explicit or inferred texture paths, credentials, callbacks and progress', async () => {
    const io = transport({'folder/ship.material':materialText(true)});
    const textureLoad = vi.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => new Texture());
    for (const [path, texturePath, expected] of [['','','folder/'], ['/base/','','/base/'], ['/base/','/textures/','/textures/']]) {
      const loader = new Vendor.DotMaterialLoader(); loader.path=path; loader.texturePath=texturePath; loader.withCredentials=true;
      const loaded = vi.fn(), progress = vi.fn();
      const materials = await loader.load('folder/ship.material', loaded, progress);
      expect(materials[0].name).toBe('hull'); expect(loaded).toHaveBeenCalledWith(materials);
      expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', loaded: 4, total: 0, lengthComputable: false }));
      expect(textureLoad).toHaveBeenCalledWith(`${expected}hull.png`);
    }
    expect(io.requested.every(r => r.credentials)).toBe(true);
  });

  it('rejects IO, parser and callback errors and executes default callbacks', async () => {
    transport({'valid.material':materialText(), 'invalid.material':'material bad\nnot-a-brace'});
    await expect(new Vendor.DotMaterialLoader().load('missing.material')).rejects.toThrow(/E_IO/);
    await expect(new Vendor.DotMaterialLoader().load('invalid.material')).rejects.toThrow(/Expected/);
    expect(await new Vendor.DotMaterialLoader().load('valid.material')).toHaveLength(1);
    await expect(new Vendor.DotMaterialLoader().load('valid.material', () => {throw 'callback failed';})).rejects.toThrow('callback failed');
  });

  it('rejects throwing error or progress callbacks without leaving the promise pending', async () => {
    transport({'valid.material':materialText(), 'invalid.material':'material bad\nnot-a-brace'}, false, 8);
    for (const url of ['missing.material','invalid.material']) {
      const callbackError = Error('error observer failed');
      await expect(new Vendor.DotMaterialLoader().load(url, undefined, undefined, () => {throw callbackError;})).rejects.toBe(callbackError);
    }
    for (const url of ['valid.material','missing.material']) {
      const onLoad = vi.fn();
      await expect(new Vendor.DotMaterialLoader().load(url, onLoad, () => {throw Error('progress observer failed');})).rejects.toThrow('progress observer failed');
      expect(onLoad).not.toHaveBeenCalled();
    }
  });
});
