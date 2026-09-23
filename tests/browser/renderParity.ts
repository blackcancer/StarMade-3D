import { setStarMadeShaderSources } from '../../src/shaders/sources.js';
setStarMadeShaderSources((globalThis as unknown as { testShaderCorpus: Record<string, string> }).testShaderCorpus);
/**
 * @fileoverview WebGL2 native-lighting regression probes with independent scalar oracles.
 *
 * Run through scripts/render-parity-check.mjs. No golden image produced by this
 * renderer is used as a native oracle. Native client screenshot parity is separate.
 */
import { Box3, BoxGeometry, MeshBasicMaterial, ShaderMaterial as ThreeShaderMaterial, Matrix4, DataArrayTexture, DataTexture, Float32BufferAttribute,
  Mesh, NearestFilter, NoBlending, NoColorSpace, NoToneMapping, OrthographicCamera,
  RGBAFormat, LinearSRGBColorSpace, Scene, Vector2, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget,
  type BufferGeometry, type ShaderMaterial } from "three";
import { applyStarMadeSceneSunToShaderMaterial, createStarMadeCubeShaderMaterial, createStarMadeEncodedCubeGeometry,
  createStarMadeDirectionalShadowPipeline, bindStarMadeDirectionalShadowRoot,
  createStarMadeLodShaderMaterial, setStarMadeLodShaderBlockLightSamples } from "../../src/index";

type Check = { name: string; ok: boolean; actual?: unknown; expected?: unknown; error?: string };
const checks: Check[] = [];
const shaderErrors: string[] = [];
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(512, 512, false);
renderer.outputColorSpace = LinearSRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.setClearColor(0, 0);
renderer.debug.onShaderError = (gl, _program, vertex, fragment) => {
  shaderErrors.push(`${gl.getShaderInfoLog(vertex)}\n${gl.getShaderInfoLog(fragment)}`);
};
const gl = renderer.getContext();
const target = new WebGLRenderTarget(65, 65, { depthBuffer: true, minFilter: NearestFilter, magFilter: NearestFilter });
target.texture.colorSpace = NoColorSpace;
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
const color = [64, 80, 96, 255];
const sun = new Vector3(0, 0, 100);
const textures: (DataTexture | DataArrayTexture)[] = [];
const materials: ShaderMaterial[] = [];
const geometries: BufferGeometry[] = [];
function rgba(value: readonly number[]): DataTexture {
  const texture = new DataTexture(new Uint8Array(value), 1, 1, RGBAFormat);
  texture.needsUpdate = true; textures.push(texture); return texture;
}
function array(value: readonly number[]): DataArrayTexture {
  const texture = new DataArrayTexture(new Uint8Array(value), 1, 1, 1);
  texture.needsUpdate = true; textures.push(texture); return texture;
}
function cube(options: Parameters<typeof createStarMadeCubeShaderMaterial>[0] = {}): ShaderMaterial {
  const material = createStarMadeCubeShaderMaterial({ textureLayers: new Map([[0, rgba(color)]]),
    lightPosition: sun.clone(), ...options });
  materials.push(material); return material;
}
function geometry(occlusion = 31): BufferGeometry {
  const result = createStarMadeEncodedCubeGeometry({ light: [0, 0, 0], occlusion });
  geometries.push(result); return result;
}
function lod(options: Parameters<typeof createStarMadeLodShaderMaterial>[0] = {}): ShaderMaterial {
  const material = createStarMadeLodShaderMaterial({ mainTexture: rgba(color), lightPosition: sun.clone(), ...options });
  materials.push(material); return material;
}
function lodGeometry(): BufferGeometry {
  const result = new BoxGeometry();
  result.setAttribute("color", new Float32BufferAttribute(new Float32Array(result.getAttribute("position").count * 3).fill(1), 3));
  geometries.push(result); return result;
}
function draw(material: ShaderMaterial, shape: BufferGeometry, display = false): number[] {
  const scene = new Scene(), mesh = new Mesh(shape, material);
  scene.add(mesh);
  material.uniforms.viewPos?.value.copy(camera.position);
  const errorsBefore = shaderErrors.length;
  renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
  const pixel = new Uint8Array(4);
  renderer.readRenderTargetPixels(target, 32, 32, 1, 1, pixel);
  if (shaderErrors.length !== errorsBefore) throw new Error(shaderErrors.slice(errorsBefore).join("\n"));
  const error = gl.getError();
  if (error !== gl.NO_ERROR) throw new Error(`WebGL error 0x${error.toString(16)}`);
  if (display) { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  return [...pixel];
}
function near(name: string, actual: number[], expected: number[], tolerance = 2): void {
  checks.push({ name, actual, expected, ok: actual.length === expected.length && actual.every((v, i) => Number.isFinite(v) && Math.abs(v - expected[i]) <= tolerance) });
}
function probe(name: string, run: () => void): void {
  try { run(); } catch (error) { checks.push({ name, ok: false, error: String(error) }); }
}
// Source: cubeLight.glsl. Zero specular/voxel light; unit front Lambert; occ.w=1.
const lit = color.slice(0, 3).map(v => Math.round(v * (0.05 + 0.2 * 1.1 + 1.1)));
probe("native cube ambient and diffuse", () => near("native cube ambient and diffuse", draw(cube(), geometry()), [...lit, 255]));
probe("optional overlay stays transparent", () => {
  near("optional overlay stays transparent", draw(cube(), geometry()), draw(cube({ overlayMap: rgba([255, 255, 255, 0]) }), geometry()), 0);
});
probe("disabled shadows do not add the shadow variant gain", () => {
  near("disabled shadows do not add the shadow variant gain", draw(cube({ shadowParams: { strength: 0 } }), geometry()), [...lit, 255]);
  near("enabled unoccluded shadows apply native gain", draw(cube({ shadowParams: { strength: 1 } }), geometry()), [...lit.map(v => Math.round(v * 1.2)), 255]);
});
probe("normal array Y is not flipped", () => {
  const sample = [128, 220, 200, 0];
  const bump = new Vector3(...sample.slice(0, 3).map(v => v / 255 * 2 - 1) as [number, number, number]).normalize();
  const expected = bump.toArray().map(v => Math.round((v * 0.5 + 0.5) * 255));
  near("normal array Y is not flipped", draw(cube({ textureLayers: undefined, textureArray: array(color),
    normalTextureArray: array(sample), normalDebugMode: 2, extraAlpha: 1 }), geometry()), [...expected, 255]);
});
probe("absent normal is not emissive", () => {
  const material = cube({ normalTextureLayers: new Map() });
  near("absent normal is not emissive", draw(material, geometry(0)), [...color.slice(0, 3).map(v => Math.round(v * 0.05)), 255]);
});
probe("emissive cube retains its texture brightness in shadow on either face", () => {
  const material = cube({ normalTextureLayers: new Map([[0, rgba([128, 128, 255, 255])]]),
    shadowParams: { strength: 1, maps: [rgba([64, 64, 64, 255])],
      matrices: [new Matrix4().makeScale(0, 0, 0).setPosition(0.5, 0.5, 0.75)] } });
  try {
    for (const sign of [1, -1]) {
      camera.position.set(0, 0, sign * 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
      const pixel = draw(material, geometry());
      checks.push({ name: `emissive cube face ${sign} retains emission`, actual: pixel,
        ok: pixel[3] === 255 && pixel.slice(0, 3).every((v, i) => v >= color[i] - 1) });
    }
  } finally {
    camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  }
});
probe("texture-array RGB does not receive implicit sRGB decoding", () => {
  near("texture-array RGB does not receive implicit sRGB decoding", draw(cube({ textureLayers: undefined, textureArray: array(color) }), geometry()), [...lit, 255]);
});
probe("sun upload follows camera without changing world position", () => {
  const material = cube({ lightPosition: new Vector3(10, 20, 30) });
  camera.position.set(2, 3, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  draw(material, geometry());
  const expected = new Vector4(10, 20, 30, 1).applyMatrix4(camera.matrixWorldInverse).toArray();
  near("sun upload follows camera without changing world position", material.uniforms.starMadeLightSources.value[0].position.toArray(), expected, 1e-9);
  draw(material, geometry());
  near("repeated sun upload does not accumulate the transform", material.uniforms.starMadeLightSources.value[0].position.toArray(), expected, 1e-9);
  near("world-space sun is preserved", material.uniforms.lightPos.value.toArray(), [10, 20, 30], 0);
});
camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
probe("point sun affects diffuse in its true position", () => {
  const location = new Vector3(10, 0, 2);
  // Front-face center is z=+0.5, not the model origin. No highlight (specPower=0).
  const lambert = (location.z - 0.5) / Math.hypot(location.x, location.z - 0.5);
  const gain = 0.05 + 0.22 + Math.min(1, lambert * 1.3) * 1.1;
  near("point sun affects diffuse in its true position", draw(cube({ lightPosition: location }), geometry()),
    [...color.slice(0, 3).map(v => Math.round(v * gain)), 255]);
});
probe("shared material uploads light uniforms between objects", () => {
  const material = cube();
  const scene = new Scene();
  for (const sign of [-1, 1]) {
    const mesh = new Mesh(geometry(), material);
    mesh.position.x = sign * 0.5; mesh.scale.setScalar(0.7);
    mesh.onBeforeRender = () => applyStarMadeSceneSunToShaderMaterial(material, {
      position: new Vector3(sign * 0.5, 0, sign < 0 ? 100 : -100)
    });
    scene.add(mesh);
  }
  material.uniforms.viewPos.value.copy(camera.position);
  renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
  const pixel = new Uint8Array(4);
  renderer.readRenderTargetPixels(target, 16, 32, 1, 1, pixel);
  near("shared material first object has native diffuse", [...pixel], [...lit, 255]);
  renderer.readRenderTargetPixels(target, 48, 32, 1, 1, pixel);
  near("shared material second object has its own light position", [...pixel],
    [...color.slice(0, 3).map(v => Math.round(v * (0.05 + 0.22))), 255]);
});
probe("spot coefficients are native white literals and attenuation is 0.02", () => {
  const material = cube({ spotCount: 1 });
  const spot = material.uniforms.starMadeLightSources.value[1];
  spot.position.set(0, 0, 0, 1); // Eye-space light at the camera.
  spot.diffuse.set(50, 0, 0, 1); spot.specular.set(0, 0, 50, 1);
  spot.constantAttenuation = 1; spot.linearAttenuation = 0; spot.quadraticAttenuation = 999;
  const attenuation = 1 / (1 + 0.02 * 4.5 * 4.5);
  near("spot coefficients are native white literals and attenuation is 0.02", draw(material, geometry(0)),
    [...color.slice(0, 3).map(v => Math.round(v * 0.05 + attenuation * (1.2 * v + 0.3 * 255))), 255]);
});
probe("LOD no-shadow baseline matches native zero-occlusion ambient", () => {
  // Native LOD adds five calculateLight calls, then multiplies by 0.2.
  near("LOD no-shadow baseline matches native zero-occlusion ambient", draw(lod(), lodGeometry()),
    [...color.slice(0, 3).map(v => Math.round(v * 0.05)), 255]);
  near("LOD shadow gain is conditional", draw(lod({ shadowParams: { strength: 1 } }), lodGeometry()),
    [...color.slice(0, 3).map(v => Math.round(v * 0.05 * 1.2)), 255]);
});
probe("LOD preserves native alpha without a non-native discard", () => {
  const material = lod({ mainTexture: rgba([200, 100, 50, 1]) });
  material.blending = NoBlending;
  near("LOD preserves native alpha without a non-native discard", draw(material, lodGeometry()), [10, 5, 3, 1], 1);
});
probe("LOD local color follows world-space exposure on opposite faces", () => {
  const material = lod();
  const shape = lodGeometry();
  setStarMadeLodShaderBlockLightSamples(material, [{ direction: [0, 0, 1], diffuse: [1, 0, 0, 0] }]);
  try {
    near("LOD exposed face receives local red", draw(material, shape), [16, 4, 5, 255], 1);
    camera.position.set(0, 0, -5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    near("LOD opposite face receives only static ambient", draw(material, shape), [3, 4, 5, 255], 1);
  } finally {
    camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  }
});
probe("LOD normal-mapped variant compiles and draws", () => {
  const material = lod({ normalTexture: rgba([128, 128, 255, 0]) });
  setStarMadeLodShaderBlockLightSamples(material, [{ direction: [0, 1, 1], diffuse: [0, 0, 0, 0.1] }]);
  const pixel = draw(material, lodGeometry());
  checks.push({ name: "LOD normal-mapped variant compiles and draws", actual: pixel, ok: pixel[3] === 255 && pixel[0] > 0 });
});
probe("LOD emission mask preserves shadows outside emitting texels", () => {
  const options = { shadowParams: { strength: 1 } };
  const ordinary = draw(lod(options), lodGeometry());
  near("black emission mask retains the shaded LOD output",
    draw(lod({ ...options, emissiveTexture: rgba([0, 0, 0, 255]) }), lodGeometry()), ordinary, 0);
  near("white emission mask retains full LOD texture brightness",
    draw(lod({ ...options, emissiveTexture: rgba([255, 255, 255, 255]) }), lodGeometry()), color, 1);
});
for (const distance of [80, 120]) probe(`finite normal-map fade at ${distance}`, () => {
  camera.position.set(0, 0, distance); camera.updateMatrixWorld(true);
  const pixel = draw(cube({ normalTextureLayers: new Map([[0, rgba([128, 128, 255, 0])]]) }), geometry());
  checks.push({ name: `finite normal-map fade at ${distance}`, actual: pixel, ok: pixel[0] > 0 && pixel[3] === 255 });
});
camera.position.set(0, 0, 5); camera.updateMatrixWorld(true);
probe("raw directional depth agrees with the light projection", () => {
  const shape = new BoxGeometry(), basic = new MeshBasicMaterial();
  const caster = new Mesh(shape, basic); caster.position.z = 1;
  const pipeline = createStarMadeDirectionalShadowPipeline({ lightDirection: new Vector3(0, 0, 1),
    sceneBounds: new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 2)), mapSize: 65, strength: 1, bias: 0.001 });
  try {
    bindStarMadeDirectionalShadowRoot(pipeline, caster);
    pipeline.render(renderer);
    const floatDepth = pipeline.renderTarget.texture.type === 1015;
    const pixel = floatDepth ? new Float32Array(4) : new Uint8Array(4);
    renderer.readRenderTargetPixels(pipeline.renderTarget, 32, 32, 1, 1, pixel);
    const projected = new Vector3(0, 0, 1.5).applyMatrix4(pipeline.camera.matrixWorldInverse).applyMatrix4(pipeline.camera.projectionMatrix);
    near("depth keeps analytic projection precision below 1/255", [pixel[0] / (floatDepth ? 1 : 255)], [(projected.z + 1) / 2], 0.000001);
    const material = cube(); pipeline.applyToCubeMaterial(material);
    // With a fully occluding caster, the native sun-shadow factor is .17 * 1.2.
    near("a real caster attenuates its receiver at the projected location", draw(material, geometry()),
      [...lit.map(v => Math.round(v * 0.17 * 1.2)), 255], 2);
    caster.scale.z = 0.02; caster.position.z = 0.53;
    pipeline.render(renderer);
    near("a thin caster 0.02 units above the receiver retains contact shadow", draw(material, geometry()),
      [...lit.map(v => Math.round(v * 0.17 * 1.2)), 255], 2);
    caster.position.x = 10;
    pipeline.render(renderer);
    near("moving the caster away restores sun visibility", draw(material, geometry()),
      [...lit.map(v => Math.round(v * 1.2)), 255], 2);
  } finally { pipeline.renderTarget.dispose(); shape.dispose(); basic.dispose(); }
});
probe("chunk shift is shared by native color and depth vertices", () => {
  const shape = geometry(), material = cube();
  material.uniforms.shift.value.set(1, 0, 0);
  const caster = new Mesh(shape, material);
  // cube-3rd.vsh and shadowcube.vsh both translate by shift * 32.
  const pipeline = createStarMadeDirectionalShadowPipeline({
    sceneBounds: new Box3(new Vector3(31, -1, -1), new Vector3(33, 1, 1)),
    lightDirection: new Vector3(0, 0, 1), mapSize: 65
  });
  try {
    bindStarMadeDirectionalShadowRoot(pipeline, caster);
    pipeline.render(renderer);
    const pixel = new Float32Array(4);
    renderer.readRenderTargetPixels(pipeline.renderTarget, 32, 32, 1, 1, pixel);
    const projected = new Vector3(32, 0, .5).applyMatrix4(pipeline.camera.matrixWorldInverse)
      .applyMatrix4(pipeline.camera.projectionMatrix);
    near("shifted chunk writes depth at its visible position", [pixel[0]], [(projected.z + 1) / 2], .000001);
    material.uniforms.shift.value.set(0, 0, 0);
    pipeline.render(renderer);
    renderer.readRenderTargetPixels(pipeline.renderTarget, 32, 32, 1, 1, pixel);
    near("live chunk shift clears the previous shadow location", [pixel[0]], [1], 0);
  } finally { pipeline.renderTarget.dispose(); }
});
probe("mixed shader casters retain their vertex format", () => {
  const shape = new BoxGeometry(), ordinary = new ThreeShaderMaterial({
    vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'void main(){gl_FragColor=vec4(1.0);}' });
  const pipeline = createStarMadeDirectionalShadowPipeline({ sceneBounds: new Box3(new Vector3(-1,-1,-1),new Vector3(1,1,1)), mapSize: 16 });
  try {
    bindStarMadeDirectionalShadowRoot(pipeline, new Mesh(shape, ordinary));
    if (gl.getError() !== gl.NO_ERROR) throw Error("A preceding probe left a GL error");
    pipeline.render(renderer);
    const error = gl.getError();
    checks.push({name:'ordinary float-position shaders draw in the depth pass without integer-attribute errors',ok:error===gl.NO_ERROR,actual:error});
  } finally {pipeline.renderTarget.dispose();shape.dispose();ordinary.dispose();}
});
probe("projected-source mode is independent of texture storage", () => {
  const first = rgba([64, 64, 64, 255]), second = rgba([255,255,255,255]);
  const depths = new DataArrayTexture(new Uint8Array([64,64,64,255,255,255,255,255]), 1, 1, 2);
  textures.push(depths);depths.needsUpdate = true;
  const matrices=[new Matrix4().makeTranslation(0.5,0.5,0),new Matrix4().makeTranslation(0.5,0.5,0)];
  const colors=[new Vector3(1,0,0),new Vector3(0,0,1)];
  const opts={matrices,colors, splits:2,strength:1,bias:0.001,mapArrayMode:'blockSources' as const};
  const arrayMaterial=cube({shadowParams:{...opts,mapArray:depths}});
  const flatMaterial=cube({shadowParams:{...opts,maps:[first,second]}});
  // Check the explicit two-source mode even when storage switches to 2D samplers.
  near("projected-source visibility blocks red without blocking blue",draw(arrayMaterial,geometry()), [Math.round(lit[0]*.17*1.2),Math.round(lit[1]*1.2),Math.round(lit[2]*1.2),255]);
  near('projected-source 2D and array paths agree per channel',draw(flatMaterial,geometry()),draw(arrayMaterial,geometry()),0);
});
for (const angle of [0, 10, 35, 70]) probe(`convex self-shadow at ${angle} degrees`, () => {
  const scene = new Scene(), shape = geometry(), material = cube();
  const mesh = new Mesh(shape, material); mesh.rotation.set(angle === 0 ? 0 : .17, angle * Math.PI / 180, angle === 0 ? 0 : .11); scene.add(mesh);
  const pipeline = createStarMadeDirectionalShadowPipeline({
    sceneBounds: new Box3().setFromObject(scene), lightDirection:angle === 0 ? new Vector3(.5,1,0) : new Vector3(0,0,1),
    mapSize:128, strength:1, frustumPadding:.25
  });
  const read = () => {
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
    const pixels = new Uint8Array(65*65*4); renderer.readRenderTargetPixels(target,0,0,65,65,pixels); return pixels;
  };
  try {
    bindStarMadeDirectionalShadowRoot(pipeline, mesh); pipeline.render(renderer); pipeline.applyToCubeMaterial(material);
    const actual = read();
    material.uniforms.starMadeShadowMap0.value = rgba([255,255,255,255]);
    const clear = read();
    let interior = 0, darkened = 0, maxLoss = 0;
    for (let y=2;y<63;y++) for (let x=2;x<63;x++) {
      const i=(y*65+x)*4;
      // Exclude silhouette pixels whose finite PCF footprint extends off the surface.
      if ([i,i-8,i+8,i-520,i+520].some(j=>clear[j+3]!==255)) continue;
      interior++;
      const loss=Math.max(clear[i]-actual[i],clear[i+1]-actual[i+1],clear[i+2]-actual[i+2]);
      maxLoss=Math.max(maxLoss,loss); if(loss>3)darkened++;
    }
    checks.push({name:`no interior self-shadow speckles at ${angle} degrees`,
      ok:interior>100 && darkened===0, actual:{interior,darkened,maxLoss},expected:{darkened:0}});
  } finally {pipeline.renderTarget.dispose();}
});
probe("display fixture", () => { draw(cube(), geometry(), true); });
probe("shadow edge uses a continuous tent footprint beyond one texel", () => {
  const bytes = new Uint8Array(8*8*4);
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) bytes.set([x<4?64:255,0,0,255],(y*8+x)*4);
  const map = new DataTexture(bytes,8,8,RGBAFormat); map.needsUpdate=true; textures.push(map);
  const material=cube({shadowParams:{maps:[map], matrices:[new Matrix4().makeTranslation(4.25/8,.5,0)],
    strength:1,texelSize:new Vector2(1/8,1/8)}});
  material.fragmentShader=material.fragmentShader.replace('starMadeFragColor = lightedColor;',
    'starMadeFragColor = vec4(vec3(shad(0)), 1.0); return;');
  // Integrated separable tent weights: lit weight 1.25 / total weight 2.
  near('shadow transition averages comparison results with a tent kernel',draw(material,geometry()),[159,159,159,255],1);
});
checks.push({ name: "no shader compilation failures", ok: shaderErrors.length === 0, actual: shaderErrors });
const debug = gl.getExtension("WEBGL_debug_renderer_info");
(window as unknown as { parityResult: unknown }).parityResult = {
  ok: checks.every(check => check.ok), checks, shaderErrors,
  renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  api: gl.getParameter(gl.VERSION),
  scope: "Scalar native lighting, shader transport, alpha and fallback regressions; not native client image parity"
};
document.querySelector("pre")!.textContent = JSON.stringify((window as unknown as { parityResult: unknown }).parityResult, null, 2);
for (const material of materials) material.dispose();
for (const shape of geometries) shape.dispose();
for (const texture of textures) texture.dispose();
target.dispose();
