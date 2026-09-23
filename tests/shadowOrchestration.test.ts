import { describe, expect, it } from "vitest";
import { Box3, BoxGeometry, BufferGeometry, ClampToEdgeWrapping, Color, Group, Mesh, MeshBasicMaterial, NearestFilter, NoColorSpace, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial, Texture, Vector3,
  type Camera, type WebGLRenderer, type WebGLRenderTarget } from "three";
import { createStarMadeCubeShadowPipeline, createStarMadeDirectionalShadowPipeline,
  bindStarMadeDirectionalShadowRoot, bindStarMadeDirectionalShadowRoots,
  createStarMadePointLightShadowPipeline, createStarMadeCubeShaderMaterial,
  createStarMadeLodShaderMaterial, applyStarMadeShadowParamsToShaderMaterial } from "../src";

const bounds = () => new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
function rendererDouble(onRender?: (scene: Scene, camera: Camera) => void) {
  const initialTarget = {name: "original-target"} as unknown as WebGLRenderTarget;
  const state = {target: initialTarget, layer: 4, mip: 2, color: new Color(0x123456), alpha: 0.25, renders: [] as Scene[]};
  const renderer = {
    autoClear: false, xr: {enabled: true},
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.layer,
    getActiveMipmapLevel: () => state.mip,
    getClearColor: (out: Color) => out.copy(state.color),
    getClearAlpha: () => state.alpha,
    setRenderTarget: (target: WebGLRenderTarget, layer = 0, mip = 0) => { Object.assign(state, {target, layer, mip}); },
    setClearColor: (color: Color | number, alpha: number) => {state.color.set(color); state.alpha = alpha;},
    clear: () => {},
    render: (scene: Scene, camera: Camera) => {
      scene.updateMatrixWorld(true);
      state.renders.push(scene);
      onRender?.(scene, camera);
    }
  };
  return {renderer: renderer as unknown as WebGLRenderer, state, initialTarget};
}
function assertRestored(mock: ReturnType<typeof rendererDouble>) {
  expect(mock.state.target).toBe(mock.initialTarget);
  expect(mock.state.layer).toBe(4);
  expect(mock.state.mip).toBe(2);
  expect(mock.state.color.getHex()).toBe(0x123456);
  expect(mock.state.alpha).toBe(0.25);
  expect(mock.renderer.autoClear).toBe(false);
  expect(mock.renderer.xr.enabled).toBe(true);
}
function mesh(name: string) {
  const object = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  object.name = name;
  return object;
}

describe("Shadow pass orchestration regressions — no GPU claimed by renderer doubles", () => {
  it("keeps every caster pass, preserves original parents and world transforms", () => {
    const parent = new Group(); parent.position.set(10, 20, 30);
    const a = mesh("a"); a.position.set(1, 2, 3);
    const b = mesh("b"); b.position.set(4, 5, 6);
    parent.add(a, b);
    const pipeline = createStarMadeCubeShadowPipeline({sceneBounds: bounds(), casterPasses: [{root: a}, {root: b}]});
    expect(pipeline.directional.casterMeshCount).toBe(2);
    expect(pipeline.directional.casterTriangleCount).toBe(24);
    expect(pipeline.pointLight).toBeNull();
    const mock = rendererDouble(); pipeline.render(mock.renderer);
    const rendered = mock.state.renders[0];
    expect(rendered.getObjectByName("a")!.getWorldPosition(new Vector3()).toArray()).toEqual([11, 22, 33]);
    expect(rendered.getObjectByName("b")!.getWorldPosition(new Vector3()).toArray()).toEqual([14, 25, 36]);
    expect(a.parent).toBe(parent); expect(b.parent).toBe(parent);
    a.position.x = 7;
    pipeline.render(mock.renderer);
    expect(mock.state.renders[1].getObjectByName("a")!.getWorldPosition(new Vector3()).x).toBe(17);
    assertRestored(mock);
  });

  it.each([1, 2, 3])("renders %s directional splits and restores caller render state", splitCount => {
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), splitCount});
    const root = new Group(); root.add(mesh("caster"));
    bindStarMadeDirectionalShadowRoots(pipeline, [root, root]);
    expect(pipeline.casterMeshCount).toBe(1);
    const mock = rendererDouble(); pipeline.render(mock.renderer);
    expect(mock.state.renders).toHaveLength(splitCount);
    assertRestored(mock);
    root.add(mesh("new-caster"));
    bindStarMadeDirectionalShadowRoot(pipeline, root);
    expect(pipeline.casterMeshCount).toBe(2);
    bindStarMadeDirectionalShadowRoots(pipeline, []);
    expect(pipeline.casterMeshCount).toBe(0);
    pipeline.render(mock.renderer);
    expect(mock.state.renders).toHaveLength(splitCount);
  });

  it("restores directional render state if a draw throws", () => {
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds()});
    bindStarMadeDirectionalShadowRoot(pipeline, mesh("caster"));
    const mock = rendererDouble(() => { throw new Error("simulated lost context"); });
    expect(() => pipeline.render(mock.renderer)).toThrow("simulated lost context");
    assertRestored(mock);
  });

  it("renders point-light maps, updates entity transforms and restores state on failures", () => {
    const source = {key: "lamp", position: new Vector3(2, 3, 4), color: new Vector3(1, 0.5, 0.2)};
    const pipeline = createStarMadePointLightShadowPipeline({sources: [source], receiverCenter: new Vector3()});
    const parent = new Group(); parent.position.x = 10;
    const caster = mesh("point-caster"); parent.add(caster);
    pipeline.addCaster(caster);
    expect(pipeline.casterTriangleCount).toBe(12);
    expect(pipeline.bias).toBe(0.003);
    caster.position.x = 4;
    const mock = rendererDouble(); pipeline.render(mock.renderer);
    expect(mock.state.renders[0].getObjectByName("point-caster")!.getWorldPosition(new Vector3()).x).toBe(14);
    assertRestored(mock);
    const broken = rendererDouble(() => { throw Error("draw failed"); });
    expect(() => pipeline.render(broken.renderer)).toThrow("draw failed");
    assertRestored(broken);
  });

  it("supports explicit/default light centers and applies directional uniforms to cube/LOD receivers", () => {
    for (const pointLightCenter of [undefined, new Vector3(1, 2, 3)]) {
      const sources = [{key: "lamp", position: new Vector3(2, 3, 4), color: new Vector3(1, 1, 1)}];
      const pipeline = createStarMadeCubeShadowPipeline({sceneBounds: bounds(), pointLightSources: sources,
        pointLightCenter, casterPasses: [{root: mesh("caster")}], mapSize: 32});
      const cube = createStarMadeCubeShaderMaterial();
      const lod = createStarMadeLodShaderMaterial();
      const root = new Group(); root.add(new Mesh(new BoxGeometry(), lod));
      pipeline.applyToScene(cube);
      pipeline.applyToScene(cube, [root]);
      expect(cube.uniforms.starMadeShadowMap0.value).toBe(pipeline.directional.renderTarget.texture);
      expect(lod.uniforms.starMadeShadowMap0.value).toBe(pipeline.directional.renderTarget.texture);
      expect(pipeline.pointLight?.sourceCount).toBe(1);
      const mock = rendererDouble(); pipeline.render(mock.renderer);
      expect(mock.state.renders).toHaveLength(2);
      assertRestored(mock);
    }
    const empty = createStarMadeCubeShadowPipeline({sceneBounds: bounds(), pointLightSources: []});
    expect(empty.pointLight).toBeNull();
    const mock = rendererDouble(); empty.render(mock.renderer);
    expect(mock.state.renders).toHaveLength(0);
  });

  it("disables stale array sampling when switching back to 2D, but preserves partial updates", () => {
    const material = createStarMadeCubeShaderMaterial();
    const array = new Texture();
    applyStarMadeShadowParamsToShaderMaterial(material, {mapArray: array, mapArrayMode: "blockSources"});
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(1);
    applyStarMadeShadowParamsToShaderMaterial(material, {bias: 0.1});
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(true);
    const texture = new Texture();
    applyStarMadeShadowParamsToShaderMaterial(material, {maps: [texture]});
    expect(material.uniforms.starMadeShadowUseMapArray.value).toBe(false);
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(0);
    expect(material.uniforms.starMadeShadowMap0.value).toBe(texture);
  });
});


describe("PSSM thresholds in receiver camera depth space", () => {
  it("selects all three default perspective cascades at their world distances", () => {
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), splitCount: 3});
    // Independently projected receiver depths, rather than the light camera's depth.
    const camera = new PerspectiveCamera(55, 1, 0.1, 600);
    const distances = [100.94189362974942, 216.52630291113978, 600];
    const thresholds = pipeline.shadowParams.farDistances!.toArray().slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const projected = new Vector3(0, 0, -distances[i]).applyMatrix4(camera.projectionMatrix);
      expect(thresholds[i]).toBeCloseTo((projected.z + 1) / 2, 12);
    }
    const choose = (distance: number) => {
      const depth = (new Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z + 1) / 2;
      return depth < thresholds[0] ? 0 : depth < thresholds[1] ? 1 : 2;
    };
    expect([choose(50), choose(150), choose(300)]).toEqual([0, 1, 2]);
  });

  it("supports the valid zero near plane of an orthographic receiver", () => {
    const viewCamera = new OrthographicCamera(-10, 10, 10, -10, 0, 100);
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), splitCount: 2, viewCamera});
    expect(pipeline.shadowParams.farDistances!.toArray()).toEqual([0.5, 1, 1, 1]);
    expect(pipeline.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  });

  it("uses the actual orthographic projection and refreshes linked uniforms when it changes", () => {
    const viewCamera = new OrthographicCamera(-10, 10, 10, -10, 1, 101);
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), splitCount: 2,
      splitLambda: 0, cameraNearForSplits: 1, cameraFarForSplits: 101, viewCamera});
    const cube = createStarMadeCubeShaderMaterial();
    pipeline.applyToCubeMaterial(cube);
    const far = pipeline.shadowParams.farDistances!;
    expect(far.toArray()).toEqual([0.5, 1, 1, 1]);
    expect(cube.uniforms.starMadeShadowFarDistances.value).toBe(far);
    bindStarMadeDirectionalShadowRoot(pipeline, mesh("caster"));
    // Split distances stay fixed, but the same world points now project halfway as far.
    viewCamera.far = 201;
    viewCamera.updateProjectionMatrix();
    pipeline.render(rendererDouble().renderer);
    expect(far.x).toBeCloseTo(0.25, 12);
    expect(far.y).toBeCloseTo(0.5, 12);
    expect(far.z).toBeCloseTo(0.5, 12);
    expect(cube.uniforms.starMadeShadowFarDistances.value).toBe(far);
  });
});


describe("Shadow caster materials and exported diagnostics", () => {
  it.each(["directional", "point"] as const)("retains texture identity and routes material kinds in %s passes", kind => {
    const layers = new Map([0, 1, 2, 3, 7].map(layer => [layer, new Texture()]));
    const root = new Group();
    const originals: [string, Mesh["material"]][] = [
      ["generic", new MeshBasicMaterial()],
      ["cube", createStarMadeCubeShaderMaterial()],
      ["alpha", createStarMadeCubeShaderMaterial({blended: true})],
      ["lod", createStarMadeLodShaderMaterial()],
      ["array", [new MeshBasicMaterial(), createStarMadeCubeShaderMaterial()]],
      ["empty", []]
    ];
    for (const [name, material] of originals) {
      const object = new Mesh(new BoxGeometry().toNonIndexed(), Array.isArray(material) ? [...material] : material);
      object.name = name;
      root.add(object);
    }
    const noMaterial = new Mesh(new BufferGeometry()); noMaterial.name = "absent";
    // Models can be assembled before their optional material/geometry is supplied.
    Object.assign(noMaterial, {material: undefined});
    root.add(noMaterial);
    const noGeometry = new Mesh(); noGeometry.name = "no-geometry";
    Object.assign(noGeometry, {geometry: undefined}); root.add(noGeometry);
    const pointSource = {key: "lamp", position: new Vector3(2, 3, 4), color: new Vector3(1, 1, 1)};
    const pipeline = kind === "directional"
      ? createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), cubeTextureLayers: layers, frustumPadding: 6})
      : createStarMadePointLightShadowPipeline({sources: [pointSource], receiverCenter: new Vector3(), cubeTextureLayers: layers});
    if (kind === "directional") bindStarMadeDirectionalShadowRoot(pipeline as ReturnType<typeof createStarMadeDirectionalShadowPipeline>, root);
    else (pipeline as ReturnType<typeof createStarMadePointLightShadowPipeline>).addCaster(root);
    expect(pipeline.casterMeshCount).toBe(7);
    expect(pipeline.casterTriangleCount).toBe(72);
    const mock = rendererDouble(); pipeline.render(mock.renderer);
    const rendered = mock.state.renders[0];
    // Simulate each actual draw callback, including cached depth-material reuse.
    // Geometry submission and framebuffer behavior are checked separately on WebGL2.
    const invoke = (name: string) => {
      const object = rendered.getObjectByName(name) as Mesh;
      object.onBeforeRender(mock.renderer, rendered, new PerspectiveCamera(), object.geometry, object.material as ShaderMaterial, null as never);
    };
    for (const [name] of originals) invoke(name);
    invoke("absent");
    const sourceCube = originals[1][1] as ShaderMaterial;
    sourceCube.uniforms.animationTime.value = 3;
    sourceCube.uniforms.shift.value.set(2, -1, 3);
    sourceCube.uniforms.lodThreshold.value = 256;
    invoke("cube");
    expect(((rendered.getObjectByName("cube") as Mesh).material as ShaderMaterial).uniforms.animationTime.value).toBe(3);
    const depth = ((rendered.getObjectByName("cube") as Mesh).material as ShaderMaterial);
    expect(depth.uniforms.shift.value.toArray()).toEqual([2, -1, 3]);
    expect(depth.uniforms.shift.value).not.toBe(sourceCube.uniforms.shift.value);
    expect(depth.uniforms.lodThreshold.value).toBe(256);
    sourceCube.uniforms.shift.value.set(-2, 0, 0);
    invoke("cube");
    expect(depth.uniforms.shift.value.toArray()).toEqual([-2, 0, 0]);
    delete sourceCube.uniforms.shift;
    delete sourceCube.uniforms.lodThreshold;
    delete sourceCube.uniforms.animationTime;
    invoke("cube");
    expect(((rendered.getObjectByName("cube") as Mesh).material as ShaderMaterial).uniforms.animationTime.value).toBe(0);
    expect(depth.uniforms.shift.value.toArray()).toEqual([0, 0, 0]);
    expect(depth.uniforms.lodThreshold.value).toBe(128);
    const materialFor = (name: string) => (rendered.getObjectByName(name) as Mesh).material as ShaderMaterial;
    const genericName = kind === "directional" ? "StarMadeGenericShadowDepthMaterial" : "StarMadePointLightGenericShadowDepthMaterial";
    expect(materialFor("generic").name).toBe(genericName);
    expect(materialFor("empty").name).toBe(genericName);
    expect(materialFor("absent").name).toBe(genericName);
    expect(materialFor("no-geometry").name).toBe(genericName);
    expect(materialFor("cube").name).toBe("StarMadeCubeShadowDepthMaterial");
    expect(materialFor("alpha").name).toBe("StarMadeCubeShadowDepthMaterial:blended");
    expect(materialFor("lod").name).toBe("StarMadeLodShadowDepthMaterial");
    expect(materialFor("array")).toBe(materialFor("cube"));
    for (const layer of [0, 1, 2, 3, 7]) {
      expect(materialFor("cube").uniforms[`mainTex${layer}`].value).toBe(layers.get(layer));
      expect(materialFor("alpha").uniforms[`mainTex${layer}`].value).toBe(layers.get(layer));
    }
    // A non-StarMade shader must retain its ordinary geometry in the depth pass.
    expect((root.getObjectByName("alpha") as Mesh).material).toBe(originals[2][1]);
    expect(root.children).toHaveLength(8);
    expect(pipeline.renderTarget.texture.minFilter).toBe(NearestFilter);
    expect(pipeline.renderTarget.texture.wrapS).toBe(ClampToEdgeWrapping);
    expect(pipeline.renderTarget.texture.wrapT).toBe(ClampToEdgeWrapping);
    expect(pipeline.renderTarget.texture.colorSpace).toBe(NoColorSpace);
    expect(pipeline.renderTarget.texture.generateMipmaps).toBe(false);
    assertRestored(mock);
  });

  it("retains point strength overrides for subsequent cube and LOD receivers, including zero", () => {
    const pipeline = createStarMadePointLightShadowPipeline({sources: [{key: "lamp", position: new Vector3(2, 3, 4),
      color: new Vector3(1, 0, 0)}], receiverCenter: new Vector3(), frustumHalfSize: 9, cameraNear: 1, cameraFar: 90,
      mapSize: 16, strength: 0.6, bias: 0.02, cubeTextureLayers: new Map()});
    const cube = createStarMadeCubeShaderMaterial();
    const lod = createStarMadeLodShaderMaterial(); const root = new Mesh(new BufferGeometry(), lod);
    pipeline.applyToCubeMaterial(cube, 0);
    expect(cube.uniforms.starMadeShadowStrength.value).toBe(0);
    expect(pipeline.shadowParams.strength).toBe(0);
    pipeline.applyToLodObject3D(root);
    expect(lod.uniforms.starMadeShadowStrength.value).toBe(0);
    expect(pipeline.applyToLodObject3D(root, 0.7)).toBe(1);
    expect(lod.uniforms.starMadeShadowStrength.value).toBe(0.7);
    pipeline.applyToCubeMaterial(cube);
    expect(cube.uniforms.starMadeShadowStrength.value).toBe(0.7);
    expect(pipeline.strength).toBe(0.6);
    expect(pipeline.bias).toBe(0.02);
    expect(pipeline.mapSize).toBe(16);
    const mock = rendererDouble((_scene, camera) => {
      expect((camera as OrthographicCamera).left).toBe(-9);
      expect((camera as OrthographicCamera).near).toBe(1);
      expect((camera as OrthographicCamera).far).toBe(90);
    });
    pipeline.render(mock.renderer);
    assertRestored(mock);
  });

  it("accepts an empty source list without drawing or corrupting caller state", () => {
    const pipeline = createStarMadePointLightShadowPipeline({sources: [], receiverCenter: new Vector3()});
    pipeline.addCaster(mesh("unused"));
    expect(pipeline.sourceCount).toBe(0);
    expect(pipeline.renderTarget.depth).toBe(1);
    expect(pipeline.shadowParams.matrices).toEqual([]);
    expect(pipeline.shadowParams.colors).toEqual([]);
    const mock = rendererDouble(); pipeline.render(mock.renderer);
    expect(mock.state.renders).toEqual([]);
    assertRestored(mock);
  });

  it("derives the perspective split range from the actual camera unless explicitly overridden", () => {
    const viewCamera = new PerspectiveCamera(65, 2, 2, 202);
    const derived = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), splitCount: 2, splitLambda: 0, viewCamera});
    const overridden = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds(), splitCount: 2, splitLambda: 0,
      viewCamera, cameraNearForSplits: 2, cameraFarForSplits: 102, cubeTextureLayers: new Map()});
    const projected = (distance: number) => (new Vector3(0, 0, -distance).applyMatrix4(viewCamera.projectionMatrix).z + 1) / 2;
    expect(derived.shadowParams.farDistances!.x).toBeCloseTo(projected(102), 12);
    expect(overridden.shadowParams.farDistances!.x).toBeCloseTo(projected(52), 12);
    expect(overridden.shadowParams.farDistances!.y).toBeCloseTo(projected(102), 12);
    expect(overridden.shadowParams.farDistances!.z).toBeCloseTo(projected(102), 12);
  });
});


describe("Mixed-scene caster vertex formats", () => {
  it("routes ordinary opaque and transparent ShaderMaterials through generic depth, not integer cube depth", () => {
    const root = new Group();
    for (const transparent of [false, true]) root.add(new Mesh(new BoxGeometry(), new ShaderMaterial({ transparent })));
    const pipeline = createStarMadeDirectionalShadowPipeline({ sceneBounds: bounds() });
    bindStarMadeDirectionalShadowRoot(pipeline, root);
    const mock = rendererDouble(); pipeline.render(mock.renderer);
    let count = 0;
    mock.state.renders[0].traverse(o => {
      if (o instanceof Mesh) { expect((o.material as ShaderMaterial).name).toBe("StarMadeGenericShadowDepthMaterial"); count++; }
    });
    expect(count).toBe(2);
    pipeline.renderTarget.dispose();
  });
});

/** Release regression: a descendant is live after binding, not a static shadow snapshot. */
describe("Live descendant shadow transforms", () => {
  it("tracks nested matrix-managed LODs and their visibility on subsequent draws", () => {
    const parent = new Group(); parent.position.set(10, 0, 0);
    const root = new Group(); root.position.set(1, 0, 0); parent.add(root);
    const nested = new Group(); nested.position.set(0, 2, 0); root.add(nested);
    const child = mesh("live-child"); nested.add(child);
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: bounds()});
    bindStarMadeDirectionalShadowRoot(pipeline, root);
    child.matrixAutoUpdate = false;
    child.matrix.makeTranslation(3, 4, 5);
    const mock = rendererDouble();
    pipeline.render(mock.renderer);
    const shadow = mock.state.renders[0].getObjectByName("live-child")!;
    expect(shadow.getWorldPosition(new Vector3()).toArray()).toEqual([14, 6, 5]);
    const depthMaterial = (shadow as Mesh).material;
    child.matrix.makeTranslation(7, 8, 9); child.visible = false;
    nested.position.y = 12;
    pipeline.render(mock.renderer);
    expect(shadow.getWorldPosition(new Vector3()).toArray()).toEqual([18, 20, 9]);
    expect(shadow.visible).toBe(false);
    expect((shadow as Mesh).material).toBe(depthMaterial);
    child.visible = true;
    pipeline.render(mock.renderer);
    expect(shadow.visible).toBe(true);
    assertRestored(mock);
    pipeline.renderTarget.dispose();
  });
});
