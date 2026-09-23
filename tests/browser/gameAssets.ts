import { setStarMadeShaderSources } from '../../src/shaders/sources.js';
setStarMadeShaderSources((globalThis as unknown as { testShaderCorpus: Record<string, string> }).testShaderCorpus);
/**
 * @fileoverview Real game LOD loading and GPU drawing through in-memory file transport.
 *
 * STARMADE_DIR resources are supplied by the Node runner, never bundled in the
 * library or test repository. DOMParser is an independent oracle for live XML
 * declarations. Draws use diagnostic light samples, not a captured game sector.
 */
import { Box3, LoadingManager, Mesh, OrthographicCamera, Scene, ShaderMaterial,
  LinearSRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";
import { blockDefinitionFromConfig, computeStarMadeBlockLightVolume, createStarMadeLodInstance,
  createStarMadeLodModelRegistry, loadStarMadeLodModel, parseStarMadeLodModelDefinitions,
  resolveStarMadeLodModelReference, setStarMadeLodShaderBlockLightSamples } from "../../src/index";

type Fixture = { config: string; resources: Record<string, string> };
const fixture = (globalThis as unknown as { gameFixture: Fixture }).gameFixture;
const checks: { name: string; ok: boolean; actual?: unknown; expected?: unknown; error?: string }[] = [];
const records: unknown[] = [];
const failures: string[] = [];
const shaderErrors: string[] = [];
const missingResources: string[] = [];
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(80, 80); renderer.outputColorSpace = LinearSRGBColorSpace;
renderer.setClearColor(0, 0);
const gl = renderer.getContext();
renderer.debug.onShaderError = (gl, _program, vertex, fragment) => shaderErrors.push(`${gl.getShaderInfoLog(vertex)}\n${gl.getShaderInfoLog(fragment)}`);
const target = new WebGLRenderTarget(80, 80);
const volume = computeStarMadeBlockLightVolume({ size: [3, 3, 3], sources: [], solids: [] });
const gallery = document.createElement("canvas"); gallery.width = 900; gallery.height = 1100;
const context = gallery.getContext("2d")!;
context.fillStyle = "#171c24"; context.fillRect(0, 0, gallery.width, gallery.height);
context.font = "10px sans-serif";
const tile = document.createElement("canvas"); tile.width = 80; tile.height = 80;
const tileContext = tile.getContext("2d")!;
canvas.hidden = true; document.body.insertBefore(gallery, document.querySelector("pre"));

async function run(): Promise<void> {
  const xml = new DOMParser().parseFromString(fixture.config, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Malformed native mainConfig XML");
  const expected = [...xml.querySelector("LOD")!.children].map(node => ({ name: node.tagName,
    filename: node.getAttribute("filename"), relpath: node.getAttribute("relpath")!.replace(/^\/+|\/+$/g, "") }));
  const definitions = parseStarMadeLodModelDefinitions(fixture.config);
  checks.push({ name: "registry equals real XML elements, excluding comments", actual: definitions.length,
    expected: expected.length, ok: JSON.stringify(definitions) === JSON.stringify(expected) });
  const registry = createStarMadeLodModelRegistry(definitions);
  for (const [index, definition] of definitions.entries()) {
    try {
      const manager = new LoadingManager();
      let complete: () => void;
      const drained = new Promise<void>(resolve => { complete = resolve; });
      manager.onLoad = () => complete();
      manager.setURLModifier(url => {
        const path = decodeURIComponent(new URL(url, 'https://fixture.invalid/').pathname);
        const resource = fixture.resources[path];
        if (!resource) { missingResources.push(path); throw new Error(`Missing native asset: ${path}`); }
        return resource;
      });
      const ref = resolveStarMadeLodModelReference(definition.name, registry, '/game')!;
      const [prototype] = await Promise.all([loadStarMadeLodModel(ref, { manager }), drained]);
      const instance = createStarMadeLodInstance(prototype, { key: definition.name, modelReference: ref,
        blockDefinition: blockDefinitionFromConfig({ id: 5, name: definition.name, lodShape: definition.name }),
        block: { orientation: 0, active: true }, position: [0, 0, 0], worldPosition: [0, 0, 0],
        entityName: 'fixture', blockId: 5 }, { volume, volumeShift: [1, 1, 1], sun: { position: new Vector3(45, 90, 60) } });
      const scene = new Scene(); scene.add(instance); scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(instance);
      if (bounds.isEmpty() || ![...bounds.min, ...bounds.max].every(Number.isFinite)) throw new Error('Invalid model bounds');
      const center = bounds.getCenter(new Vector3());
      const radius = Math.max(...bounds.getSize(new Vector3()).toArray()) * 0.9;
      const camera = new OrthographicCamera(-radius, radius, radius, -radius, 0.01, 1000);
      camera.position.copy(center).add(new Vector3(2, 1.4, 2).normalize().multiplyScalar(radius * 5));
      camera.lookAt(center); camera.updateMatrixWorld(true);
      let meshes = 0, vertices = 0;
      instance.traverse(object => {
        if (!(object instanceof Mesh)) return;
        meshes++; vertices += object.geometry.getAttribute('position').count;
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(mat instanceof ShaderMaterial)) throw new Error('Material conversion failed');
          mat.uniforms.viewPos.value.copy(camera.position);
          setStarMadeLodShaderBlockLightSamples(mat, [
            { direction: [1, 1, 1], diffuse: [0.1, 0.1, 0.1, 0.2] },
            { direction: [-1, 1, -1], diffuse: [0.1, 0.1, 0.1, 0.2] }
          ]);
        }
      });
      const priorErrors = shaderErrors.length;
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
      const pixel = new Uint8Array(80 * 80 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 80, 80, pixel);
      let pixels = 0;
      for (let i = 3; i < pixel.length; i += 4) if (pixel[i] > 0) pixels++;
      if (shaderErrors.length !== priorErrors || gl.getError() !== gl.NO_ERROR) throw new Error('GPU shader/draw failure');
      if (pixels === 0) throw new Error('No model pixels were drawn');
      records.push({ model: definition.name, meshes, vertices, pixels, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
      checks.push({ name: `native LOD ${definition.name}`, ok: true });
      const image = tileContext.createImageData(80, 80);
      for (let y = 0; y < 80; y++) image.data.set(pixel.subarray((79 - y) * 320, (80 - y) * 320), y * 320);
      tileContext.putImageData(image, 0, 0);
      const x = index % 10 * 90, y = Math.floor(index / 10) * 110;
      context.drawImage(tile, x, y); context.fillStyle = '#eef0f3';
      context.fillText(definition.name.slice(0, 15), x + 1, y + 92, 88);
      // Retain the shared texture cache, but release per-model geometry and materials.
      const owned = new Set<{ dispose(): void }>();
      instance.traverse(object => { if (object instanceof Mesh) {
        owned.add(object.geometry); for (const mat of Array.isArray(object.material) ? object.material : [object.material]) owned.add(mat);
      } });
      for (const resource of owned) resource.dispose();
    } catch (error) {
      failures.push(definition.name);
      checks.push({ name: `native LOD ${definition.name}`, ok: false, error: String(error) });
    }
  }
  checks.push({ name: 'no missing source resources', ok: missingResources.length === 0, actual: missingResources });
  checks.push({ name: 'no shader compilation errors', ok: shaderErrors.length === 0, actual: shaderErrors });
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  (globalThis as unknown as { parityResult: unknown }).parityResult = { ok: checks.every(check => check.ok), checks,
    records, failures, missingResources, shaderErrors, nativeModelCount: expected.length,
    scope: 'Real native model, texture and material loading plus GPU drawing under diagnostic light; not native screenshot equivalence',
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    contactSheet: gallery.toDataURL('image/png') };
  document.querySelector('pre')!.textContent = `${records.length}/${definitions.length} real LOD models loaded and drawn.`;
  target.dispose();
}
void run().catch(error => {
  (globalThis as unknown as { parityResult: unknown }).parityResult = { ok: false, error: String(error), checks, records };
});
