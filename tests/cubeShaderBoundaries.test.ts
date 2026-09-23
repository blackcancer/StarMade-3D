import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, BufferGeometry, Group, Matrix4, Mesh, NoColorSpace, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, PerspectiveCamera, ShaderMaterial, Texture, Vector2, Vector3, Vector4 } from "three";
import {
  createStarMadeCubeShaderMaterial, createStarMadeLodShaderMaterial,
  createStarMadeDirectionalShadowPipeline, setStarMadeCubeShaderSpotLights,
  createStarMadeCubeTextureArray, createStarMadeCubeAtlasLayout, starMadeCubeTextureArraySourceY,
  applyStarMadeCubeTextureArrayTileGutters, applyStarMadeShadowParamsToShaderMaterial,
  applyStarMadeLodBlockLightToShaderMaterial, applyStarMadeSunToLodShaderMaterial, applyStarMadeSunToLodObject3D,
  applyStarMadeSceneSunToShaderMaterial, setStarMadeLodShaderBlockLightSamples, setStarMadeCubeShaderVertexLighting,
  updateStarMadeBlockLightSourcesViewSpace,
  applyStarMadeBlockLightSourcesToCubeShaderMaterial, createStarMadeCubeSpotLightsFromBlockLights,
  buildStarMadeLodLightSamples, type StarMadeBlockLightSpotSource
} from "../src";

import { injectStarMadeShadowVertex, injectStarMadeShadowFragment, injectStarMadeLodShadowFragment } from "../src/shaders/shadowShaderTransform";

// Evaluate the scalar arithmetic/control flow from the emitted GLSL with a
// recording sampler. This checks cascade selection, not GPU compilation or pixels.
function scalarShadow(fragment: string, splits: number, far: Vector4, depth: number) {
  const start = fragment.indexOf("float shadowCoef(){");
  expect(start).toBeGreaterThanOrEqual(0);
  let end = fragment.indexOf("{", start), nesting = 1;
  const bodyStart = ++end;
  while (nesting && end < fragment.length) { if (fragment[end] === "{") nesting++; else if (fragment[end] === "}") nesting--; end++; }
  expect(nesting).toBe(0);
  const body = fragment.slice(bodyStart, end - 1).replace(/\b(float|int)\s+(\w+)/g, "let $2").replace(/\bfloat\(/g, "Number(");
  const samples: number[] = [];
  const run = new Function("starMadeShadowStrength", "starMadeShadowUseMapArray", "starMadeShadowMapArrayMode",
    "starMadeShadowFarDistances", "starMadeShadowSeam", "starMadeShadowSeamMult", "gl_FragCoord",
    "starMadeShadowSplitCount", "shad", "mix", "starMadeShadowMinI", body);
  const value = run(1, true, 0, far, 0.0001, 5000, {z: depth}, () => splits,
    (index: number) => { samples.push(index); return [0.2, 0.4, 0.6][index]; },
    (a: number, b: number, weight: number) => a * (1 - weight) + b * weight, Math.min);
  return {value, samples};
}

afterEach(() => vi.unstubAllGlobals());
function fixtureTexture(image: unknown): Texture {
  const texture = new Texture();
  texture.image = image;
  return texture;
}

describe("Receiver shadow shader regression", () => {
  it.each([createStarMadeCubeShaderMaterial, createStarMadeLodShaderMaterial])("samples all cascades past the legacy cutoff", create => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 600);
    const pipeline = createStarMadeDirectionalShadowPipeline({sceneBounds: new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5)), splitCount: 3, viewCamera: camera});
    const fragment = create().fragmentShader;
    for (const [distance, index, expected] of [[50, 0, 0.2], [150, 1, 0.4], [300, 2, 0.6]]) {
      const depth = (new Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z + 1) / 2;
      const result = scalarShadow(fragment, 3, pipeline.shadowParams.farDistances!, depth);
      expect(result.samples).toEqual([index]);
      expect(result.value).toBe(expected);
    }
  });

  it("keeps single-split shadows at far camera depths and blends adjacent cascade seams", () => {
    const fragment = createStarMadeCubeShaderMaterial().fragmentShader;
    const far = new Vector4(0.9983, 0.9983, 0.9983, 1);
    expect(scalarShadow(fragment, 1, far, 0.998)).toEqual({value: 0.2, samples: [0]});
    expect(scalarShadow(fragment, 1, far, 0.999)).toEqual({value: 0.2, samples: [0]});
    expect(scalarShadow(fragment, 3, new Vector4(0.3, 0.6, 0.8, 1), 0.99)).toEqual({value: 1, samples: []});
    const splits = new Vector4(0.5, 0.8, 1, 1);
    expect(scalarShadow(fragment, 3, splits, 0.5).value).toBeCloseTo(0.3, 12);
    expect(scalarShadow(fragment, 3, splits, 0.8).value).toBeCloseTo(0.5, 12);
  });
});

describe("Cube spot light positions", () => {
  it("updates real Vector4 point-light slots as view-space points", () => {
    const material = createStarMadeCubeShaderMaterial();
    setStarMadeCubeShaderSpotLights(material, [{position: new Vector3(3, 4, -5), color: [0.5, 0.2, 0.1], intensity: 2}]);
    expect(material.uniforms.starMadeLightSources.value[1].position.toArray()).toEqual([3, 4, -5, 1]);
    expect(material.uniforms.starMadeLightSources.value[1].diffuse.toArray()).toEqual([1.2, 0.48, 0.24, 1]);
    expect(material.uniforms.spotCount.value).toBe(1);
  });
});

describe("Texture array assembly and input validation", () => {
  function atlasImage(seed = 0, width = 4, height = 4) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = seed + i;
    return {width, height, pixels};
  }
  function canvasFixture(contextAvailable = true) {
    let current = atlasImage();
    const context = {
      clearRect: vi.fn(),
      drawImage: (image: ReturnType<typeof atlasImage>) => {current = image;},
      getImageData: () => ({data: current.pixels})
    };
    const canvas = {width: 0, height: 0, getContext: () => contextAvailable ? context : null};
    vi.stubGlobal("document", {createElement: (tag: string) => {expect(tag).toBe("canvas"); return canvas;}});
    return {canvas, context};
  }
  const pack = (images: readonly object[], normalImages?: readonly object[]) => ({
    layout: createStarMadeCubeAtlasLayout(4),
    layers: new Map(images.map((image, index) => [index, fixtureTexture(image)])),
    ...(normalImages ? {normalLayers: new Map(normalImages.map((image, index) => [index, fixtureTexture(image)]))} : {})
  });

  it("assembles every color layer with stable row orientation and local tile gutters", async () => {
    const fixture = canvasFixture();
    const images = [atlasImage(), atlasImage(40), atlasImage(80), atlasImage(120)];
    const texture = await createStarMadeCubeTextureArray(pack(images));
    expect(texture.image.width).toBe(4); expect(texture.image.height).toBe(4); expect(texture.image.depth).toBe(4);
    expect(fixture.canvas.width).toBe(4); expect(fixture.canvas.height).toBe(4);
    expect(fixture.context.clearRect).toHaveBeenCalledTimes(4);
    const data = texture.image.data as Uint8Array;
    for (let layer = 0; layer < 4; layer++) {
      expect([...data.slice(layer * 64, layer * 64 + 4)]).toEqual([...images[layer].pixels.slice(20, 24)]);
      expect([...data.slice(layer * 64 + 60, layer * 64 + 64)]).toEqual([...images[layer].pixels.slice(40, 44)]);
    }
    expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.wrapS).toBe(RepeatWrapping); expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.magFilter).toBe(LinearFilter); expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true); expect(texture.version).toBe(1);
  });

  it("fills unavailable normal layers neutrally, using color dimensions as a fallback", async () => {
    canvasFixture();
    const neutral = await createStarMadeCubeTextureArray(pack([atlasImage()]), {source: "normal", layers: [0, 1]});
    expect(neutral.image.depth).toBe(2);
    expect([...neutral.image.data!]).toEqual(Array.from({length: 32}, () => [128, 128, 255, 0]).flat());
    const partial = await createStarMadeCubeTextureArray(pack([atlasImage()], [atlasImage(20)]), {source: "normal", layers: [0, 1]});
    expect([...partial.image.data!.slice(0, 4)]).toEqual([40, 41, 42, 43]);
    expect([...partial.image.data!.slice(64, 68)]).toEqual([128, 128, 255, 0]);
  });

  it("rejects missing color/reference layers and unavailable canvas", async () => {
    await expect(createStarMadeCubeTextureArray(pack([]), {layers: [7]})).rejects.toThrow("Missing StarMade cube texture layer 7");
    await expect(createStarMadeCubeTextureArray(pack([]), {source: "normal", layers: [7]})).rejects.toThrow("reference layer");
    await expect(createStarMadeCubeTextureArray(pack([]), {layers: []})).rejects.toThrow("reference layer");
    canvasFixture(false);
    await expect(createStarMadeCubeTextureArray(pack([atlasImage()]), {layers: [0]})).rejects.toThrow("Canvas 2D context");
  });

  it.each([
    [{height: 4}, "width"], [{width: 0, height: 4}, "width"],
    [{width: 4}, "height"], [{width: 4, height: 0}, "height"]
  ])("rejects unavailable image dimension %o", async (image, dimension) => {
    await expect(createStarMadeCubeTextureArray(pack([image]), {layers: [0]})).rejects.toThrow(`image ${dimension} is unavailable`);
  });

  it.each([[8, 4], [4, 8]])("rejects differently sized atlas layers %sx%s", async (width, height) => {
    canvasFixture();
    await expect(createStarMadeCubeTextureArray(pack([atlasImage(), atlasImage(0, width, height)]), {layers: [0, 1]})).rejects.toThrow("identical dimensions");
  });

  it("rejects invalid row/gutter inputs without changing input pixels", () => {
    for (const row of [-1, 0.5, 4]) expect(() => starMadeCubeTextureArraySourceY(row, 4)).toThrow("targetY");
    const data = new Uint8Array(256).fill(5);
    for (const [width, height] of [[5, 4], [4, 5]]) {
      expect(() => applyStarMadeCubeTextureArrayTileGutters(data, 0, width, height, 4)).toThrow("not aligned");
    }
    for (const gutter of [0, -1, 2]) expect(() => applyStarMadeCubeTextureArrayTileGutters(data, 0, 4, 4, 4, gutter)).toThrow("gutterSize");
    expect([...data]).toEqual(Array(256).fill(5));
  });

  it.each([
    [null, false], [{data: new Uint8Array(4)}, true], [{width: 4, height: 4}, true],
    [{width: 0, height: 4}, false], [{width: 4, height: 0}, false],
    [{width: 4, height: 4, complete: false}, false], [{tagName: "VIDEO"}, true]
  ])("uploads only usable browser image sources %o", (image, uploaded) => {
    const texture = fixtureTexture(image);
    const version = texture.version;
    createStarMadeCubeShaderMaterial({textureLayers: new Map([[0, texture]])});
    expect(texture.version > version).toBe(uploaded);
    const lodTexture = fixtureTexture(image);
    createStarMadeLodShaderMaterial({mainTexture: lodTexture});
    expect(lodTexture.version > 0).toBe(uploaded);
  });
});

describe("Shader uniform boundary contracts", () => {
  it("applies all three shadow maps, colors and matrices while respecting explicit texSize", () => {
    const material = createStarMadeCubeShaderMaterial();
    const maps = [new Texture(), new Texture(), new Texture()];
    const matrices = [new Matrix4().makeTranslation(1, 0, 0), new Matrix4().makeTranslation(2, 0, 0), new Matrix4().makeTranslation(3, 0, 0)];
    const colors = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
    applyStarMadeShadowParamsToShaderMaterial(material, {maps, matrices, colors, mapArrayMode: "splits", texSize: new Vector2(64, 1 / 64)});
    for (let i = 0; i < 3; i++) {
      expect(material.uniforms[`starMadeShadowMap${i}`].value).toBe(maps[i]);
      expect(material.uniforms[`starMadeShadowMatrix${i}`].value).toBe(matrices[i]);
      expect(material.uniforms[`starMadeShadowColor${i}`].value).toBe(colors[i]);
    }
    expect(material.uniforms.starMadeShadowMapArrayMode.value).toBe(0);
    expect(material.uniforms.starMadeShadowTexSize.value.toArray()).toEqual([64, 1 / 64]);
    const derived = createStarMadeCubeShaderMaterial({shadowParams: {texelSize: new Vector2(1 / 128, 1 / 128)}});
    expect(derived.uniforms.starMadeShadowTexSize.value.toArray()).toEqual([128, 1 / 128]);
    const fallback = createStarMadeCubeShaderMaterial({lodShadowTexelSize: new Vector2(0, 0)});
    expect(fallback.uniforms.starMadeShadowTexSize.value.toArray()).toEqual([1024, 1 / 1024]);
    // Partial legacy vector-like inputs may only expose x.
    applyStarMadeShadowParamsToShaderMaterial(material, {texelSize: {x: 1 / 32} as Vector2});
    expect(material.uniforms.starMadeShadowTexSize.value.toArray()).toEqual([32, 1 / 32]);
  });

  it("zero-fills omitted LOD light slots and tolerates partial optional uniforms", () => {
    const material = createStarMadeLodShaderMaterial();
    const root = new Group(); root.add(new Mesh(new BufferGeometry(), material));
    const light = {lightVec: [[1, 2, 3] as const], lightDiffuse: [[0.1, 0.2, 0.3, 0.4] as const]};
    expect(applyStarMadeLodBlockLightToShaderMaterial(material, light)).toBe(true);
    expect(material.uniforms.lightVec.value[0].toArray()).toEqual([-1, -2, -3]);
    expect(material.uniforms.lightVec.value[3].toArray()).toEqual([0, 0, 0]);
    expect(material.uniforms.lightDiffuse.value[3].toArray()).toEqual([0, 0, 0, 0]);
    for (const uniforms of [{}, {lightVec: {value: []}}, {lightDiffuse: {value: []}}] as ShaderMaterial["uniforms"][]) {
      const partial = new ShaderMaterial({uniforms});
      expect(applyStarMadeLodBlockLightToShaderMaterial(partial, light)).toBe(false);
      expect(() => setStarMadeLodShaderBlockLightSamples(partial, [])).not.toThrow();
    }
    const direction = new Vector3(0, 0, 1);
    applyStarMadeSunToLodShaderMaterial(material, direction);
    expect(material.uniforms.lightPos.value.toArray()).toEqual([0, 0, 1]);
    const sun = {ambient: new Vector3(0.1, 0.2, 0.3), diffuse: new Vector3(0.4, 0.5, 0.6), specular: new Vector3(0.7, 0.8, 0.9)};
    applyStarMadeSunToLodShaderMaterial(material, direction, sun);
    expect(material.uniforms.ambient.value.toArray()).toEqual(sun.ambient.toArray());
    expect(material.uniforms.diffuse.value.toArray()).toEqual(sun.diffuse.toArray());
    expect(material.uniforms.specular.value.toArray()).toEqual(sun.specular.toArray());
    expect(applyStarMadeSunToLodObject3D(root, direction, {ambient: new Vector3(0.2, 0.3, 0.4)})).toBe(1);
    expect(material.uniforms.ambient.value.toArray()).toEqual([0.2, 0.3, 0.4]);
    applyStarMadeSceneSunToShaderMaterial(material, {});
    expect(material.uniforms.lightPos.value.toArray()).toEqual([450, 900, 0]);
  });

  it("updates optional vertex lighting values only when those uniforms exist", () => {
    const opts = {cubeBlockLightIntensityScale: 0, cubeBlockLightAttenuationConstant: 2, cubeBlockLightAttenuationLinear: 0.5};
    const material = new ShaderMaterial({uniforms: Object.fromEntries(Object.keys(opts).map(key => [key, {value: 99}]))});
    setStarMadeCubeShaderVertexLighting(material, opts);
    for (const [key, value] of Object.entries(opts)) expect(material.uniforms[key].value).toBe(value);
    expect(() => setStarMadeCubeShaderVertexLighting(new ShaderMaterial(), opts)).not.toThrow();
  });

  it("rejects missing injection anchors and transforms valid cube/LOD shader sources", () => {
    expect(() => injectStarMadeShadowVertex("void main(){}")).toThrow("gl_Position");
    expect(() => injectStarMadeShadowFragment("void main(){}")).toThrow("lightedColor");
    expect(() => injectStarMadeLodShadowFragment("void main(){}")).toThrow("totOcc");
    expect(() => injectStarMadeLodShadowFragment("void main(){ float totOcc = 0.0; }")).toThrow("alpha assignment");
    const cube = injectStarMadeShadowVertex("void main(){ vPos = modelViewMatrix * vec4(vertexPos, 1.0); gl_Position = vPos; }");
    expect(cube).toContain("modelMatrix * vec4(vertexPos, 1.0)");
    expect(cube).toContain("starMadeShadowCoord2 = starMadeShadowMatrix2 * starMadeShadowWorldPosition;");
    const plain = injectStarMadeShadowVertex("void main(){ gl_Position = vec4(position, 1.0); }");
    expect(plain).toContain("modelMatrix * vec4(position, 1.0)");
    expect(injectStarMadeShadowFragment("void main(){ starMadeFragColor = lightedColor; }")).toContain("starMadeFragColor.rgb *= starMadeCubeShadowVisibility(occlusion);");
    expect(injectStarMadeLodShadowFragment("void main(){ float totOcc = 0.0; starMadeFragColor.a = tex.a; }")).toContain("starMadeCubeShadowVisibility(vec4(0.0, 0.0, 0.0, totOcc))");
  });
});

describe("Block lights across world and view space", () => {
  const source = (position: readonly [number, number, number], color: readonly [number, number, number, number] = [1, 0.5, 0.25, 1], active?: boolean): StarMadeBlockLightSpotSource => ({position, color, active});

  it("ranks active sources by distance, transforms selected positions every frame and clears obsolete slots", () => {
    const material = createStarMadeCubeShaderMaterial();
    expect(updateStarMadeBlockLightSourcesViewSpace(material, new Matrix4())).toBe(0);
    const selected = applyStarMadeBlockLightSourcesToCubeShaderMaterial(material,
      [source([10, 0, 0]), source([2, 0, 0], [0, 1, 0, 0.5]), source([0, 0, 0], undefined, false), source([1, 0, 0])], [0, 0, 0], 2);
    expect(selected).toBe(2);
    const slots = material.uniforms.starMadeLightSources.value;
    expect(slots[1].position.toArray()).toEqual([1, 0, 0, 1]);
    expect(slots[2].position.toArray()).toEqual([2, 0, 0, 1]);
    expect(slots[2].diffuse.toArray()).toEqual([0, 0.6, 0, 1]);
    expect(updateStarMadeBlockLightSourcesViewSpace(material, new Matrix4().makeTranslation(-3, 4, -5))).toBe(2);
    expect(slots[1].position.toArray()).toEqual([-2, 4, -5, 1]);
    expect(slots[2].position.toArray()).toEqual([-1, 4, -5, 1]);
    applyStarMadeBlockLightSourcesToCubeShaderMaterial(material, [], [0, 0, 0]);
    expect(slots[1].position.toArray()).toEqual([0, 0, 0, 0]);
    expect(slots[2].diffuse.toArray()).toEqual([0, 0, 0, 0]);
    expect(material.uniforms.spotCount.value).toBe(0);
  });

  it("handles missing light uniforms or sparse caller-defined slots", () => {
    for (const uniforms of [{}, {starMadeLightSources: {value: []}}, {spotCount: {value: 0}}] as ShaderMaterial["uniforms"][]) {
      const material = new ShaderMaterial({uniforms});
      expect(applyStarMadeBlockLightSourcesToCubeShaderMaterial(material, [source([1, 2, 3])], [0, 0, 0])).toBe(0);
      material.userData.starMadeBlockLightSpotSources = [source([1, 2, 3])];
      expect(updateStarMadeBlockLightSourcesViewSpace(material, new Matrix4())).toBe(0);
      expect(() => setStarMadeCubeShaderSpotLights(material, [])).not.toThrow();
    }
    const material = createStarMadeCubeShaderMaterial();
    const slots = material.uniforms.starMadeLightSources.value;
    slots[1] = undefined;
    slots[2] = {position: new Vector4(), diffuse: new Vector4()};
    expect(applyStarMadeBlockLightSourcesToCubeShaderMaterial(material, [source([1, 2, 3]), source([4, 5, 6])], [0, 0, 0])).toBe(2);
    expect(slots[2].position.toArray()).toEqual([4, 5, 6, 1]);
    expect(slots[2].diffuse.toArray()).toEqual([1.2, 0.6, 0.3, 1]);
    setStarMadeCubeShaderSpotLights(material, [{position: new Vector3(1, 1, 1), color: [1, 1, 1], intensity: 1}], 3);
    expect(slots[2].diffuse.toArray()).toEqual([0, 0, 0, 0]);
    slots[2] = undefined;
    expect(() => setStarMadeCubeShaderSpotLights(material, [], 3)).not.toThrow();
  });

  it("supports legacy Vector3 slots without requiring attenuation or color properties", () => {
    const material = new ShaderMaterial({uniforms: {spotCount: {value: 0}, starMadeLightSources: {value: [{}, {position: new Vector3()}, {}]}}});
    setStarMadeCubeShaderSpotLights(material, [{position: new Vector3(3, 4, 5), color: [1, 1, 1], intensity: 1}], 1);
    expect(material.uniforms.starMadeLightSources.value[1].position.toArray()).toEqual([3, 4, 5]);
    expect(material.uniforms.spotCount.value).toBe(1);
  });

  it("converts world sources to independent view positions with requested capacity", () => {
    const input = [source([1, 2, 3]), source([4, 5, 6])];
    const view = new Matrix4().makeTranslation(-1, -2, -3);
    const lights = createStarMadeCubeSpotLightsFromBlockLights(input, view);
    expect(lights.map(light => light.position.toArray())).toEqual([[0, 0, 0], [3, 3, 3]]);
    expect(lights[0].position).not.toBe(lights[1].position);
    expect(lights[0].color).toEqual([1, 0.5, 0.25]);
    expect(createStarMadeCubeSpotLightsFromBlockLights(input, view, 1)).toHaveLength(1);
    expect(createStarMadeCubeSpotLightsFromBlockLights([], view)).toEqual([]);
  });

  it("normalizes LOD directions, clamps intensity and excludes inactive sources", () => {
    const samples = buildStarMadeLodLightSamples([
      source([0, 3, 4], [1, 0, 0, 0.5]), source([0, 0, 0], [0, 1, 0, 2]),
      source([9, 9, 9], [0, 0, 1, 1], false)
    ], [0, 0, 0]);
    expect(samples).toHaveLength(2);
    expect(samples).toContainEqual({direction: [0, 0.6, 0.8], diffuse: [0.5, 0, 0, 0.5]});
    expect(samples).toContainEqual({direction: [0, 1, 0], diffuse: [0, 1, 0, 1]});
    const rgbOnly = {position: [1, 0, 0], color: [0, 0, 1]} as unknown as StarMadeBlockLightSpotSource;
    expect(buildStarMadeLodLightSamples([rgbOnly], [0, 0, 0], 1)).toEqual([{direction: [1, 0, 0], diffuse: [0, 0, 1, 1]}]);
    expect(buildStarMadeLodLightSamples([], [0, 0, 0])).toEqual([]);
  });
});
