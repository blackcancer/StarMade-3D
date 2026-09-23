import { it, expect } from 'vitest';
import { Matrix4 } from 'three';
import { InspectionDocument } from '../src/inspection/model.js';
import { compareInspectionDocuments, inspectDocument, inspectRelations, resolveInspectionAnnotation, sampleInspectionTimeline, inspectionAssetCatalog } from '../src/inspection/analysis.js';
import { blockDefinitionFromConfig } from '../src/starmade/blockConfig.js';
const raw = { type: 2, hp: 255, orientation: 0, active: false };
const ref = { entityId: 'a', position: [0, 0, 0] as const };
const e = { id: 'a', blocks: [{ position: ref.position, state: raw }] };
const d = new InspectionDocument('d', 0, [e]);
it('diffs raw logical cells independently of entity movement and file segment layout', () => {
  expect(compareInspectionDocuments(d, d)).toEqual({ blocks: [], entities: [] });
  const moved = d.apply(0, [{ kind: 'entity', entity: { ...e, transform: new Matrix4().makeTranslation(5, 0, 0).toArray() } }]);
  expect(compareInspectionDocuments(d, moved)).toEqual({ blocks: [], entities: [{ id: 'a', kind: 'transform' }] });
  const added = d.apply(0, [{ kind: 'entity', entity: { ...e, id: 'b' } }]);
  expect(compareInspectionDocuments(d, added).entities).toEqual([{ id: 'b', kind: 'added' }]);
  expect(compareInspectionDocuments(added, d).entities).toEqual([{ id: 'b', kind: 'removed' }]);
  expect(compareInspectionDocuments(added, d).blocks[0].after).toBeUndefined();
  expect(compareInspectionDocuments(d, added).blocks[0].before).toBeUndefined();
  for (const state of [{ ...raw, type: 1 }, { ...raw, hp: 2 }, { ...raw, orientation: 1 }, { ...raw, active: true }, { ...raw, extra: 63 }]) {
    expect(compareInspectionDocuments(d, d.apply(0, [{ kind: 'block', ref, state }])).blocks).toHaveLength(1);
  }
  const zero = d.apply(0, [{ kind: 'block', ref, state: { ...raw, extra: 0 } }]);
  expect(compareInspectionDocuments(d, zero).blocks).toEqual([]);
  expect(compareInspectionDocuments(zero, d).blocks).toEqual([]);
  expect(compareInspectionDocuments(added, added.apply(1, [{ kind: 'entity', entity: { ...e, parentId: 'b' } }])).entities[0].kind).toBe('transform');
});
it('reports descriptive inventories and only supplied system relations', () => {
  const definition = blockDefinitionFromConfig({ id: 2, name: 'Armor', textureIds: [1] });
  expect(inspectDocument(d).diagnostics[0].code).toBe('unknown-block');
  const doc = d.apply(0, [{ kind: 'block', ref: { ...ref, position: [1, 0, 0] }, state: { ...raw, active: true } }, { kind: 'block', ref: { ...ref, position: [2, 0, 0] }, state: { ...raw, type: 1 } }]);
  const report = inspectDocument(doc, new Map([[2, definition]]));
  expect(report.occupiedCells).toBe(3); expect(report.inventory.map(e => e.type)).toEqual([1, 2]);
  expect(report.inventory[1]).toEqual({ type: 2, name: 'Armor', count: 2, rawActiveCount: 1 });
  const relation = { kind: 'controller', from: ref, to: { ...ref, position: [1, 0, 0] as const } };
  expect(inspectRelations(doc, [relation]).relations).toEqual([relation]);
  expect(inspectRelations(d, [relation]).diagnostics).toHaveLength(1);
  expect(inspectRelations(d, [{ ...relation, from: relation.to }]).diagnostics).toHaveLength(1);
  expect(inspectRelations(doc, []).relations).toEqual([]);
  const second = blockDefinitionFromConfig({ id: 1, name: 'Light', textureIds: [2], lightSource: true });
  expect(inspectionAssetCatalog(new Map([[2, definition], [1, second]])).map(a => a.id)).toEqual([1, 2]);
});
it('versions annotations and samples repeatable visual states without wall-clock time', () => {
  const annotation = { id: 'n', documentId: 'd', revision: 0, ref, text: 'Inspect' };
  expect(resolveInspectionAnnotation(d, annotation).status).toBe('resolved');
  expect(resolveInspectionAnnotation(d, { ...annotation, documentId: 'other' }).status).toBe('foreign');
  expect(resolveInspectionAnnotation(d, { ...annotation, revision: 1 }).status).toBe('stale');
  expect(resolveInspectionAnnotation(d, { ...annotation, ref: { ...ref, position: [1, 0, 0] } }).status).toBe('missing');
  const frames = [{ time: 0, value: false }, { time: 1, value: true }];
  expect(sampleInspectionTimeline(frames, 0.5, 2)).toBe(false);
  expect(sampleInspectionTimeline(frames, 1, 2)).toBe(true);
  expect(sampleInspectionTimeline(frames, -1, 2)).toBe(false);
  expect(sampleInspectionTimeline(frames, 99, 2)).toBe(true);
  expect(sampleInspectionTimeline(frames, 2.5, 2, true)).toBe(false);
  expect(sampleInspectionTimeline(frames, -0.5, 2, true)).toBe(true);
  for (const [time, duration] of [[NaN, 2], [0, NaN], [0, 0]]) expect(() => sampleInspectionTimeline(frames, time, duration)).toThrow();
  expect(() => sampleInspectionTimeline([], 0, 1)).toThrow();
  for (const bad of [[{ time: NaN, value: 0 }], [{ time: -1, value: 0 }], [{ time: 3, value: 0 }], [{ time: 1, value: 0 }, { time: 1, value: 1 }]]) expect(() => sampleInspectionTimeline(bad, 0, 2)).toThrow();
});

import { AnimationClip, BoxGeometry, Group, Mesh, MeshBasicMaterial, ShaderMaterial, Scene, PerspectiveCamera, type WebGLRenderer } from 'three';
import { vi } from 'vitest';
import { exportInspectionGltf, captureInspectionPreview } from '../src/inspection/export.js';
it('exports real glTF and GLB, requiring explicit shader degradation without mutating host materials', async () => {
  class Reader {
    result: string | ArrayBuffer | null = null; onloadend?: () => void;
    async readAsArrayBuffer(blob: Blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
    async readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
  }
  vi.stubGlobal('FileReader', Reader);
  try {
    const group = new Group(); const geometry = new BoxGeometry(); const shader = new ShaderMaterial(); const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, shader); mesh.name = 'native'; mesh.animations = [new AnimationClip('spin', 1, [])]; group.add(mesh);
    await expect(exportInspectionGltf(group)).rejects.toThrow(/explicit/);
    const standard = new Mesh(geometry, [material, shader, material, material, material, material]); group.add(standard);
    const result = await exportInspectionGltf(group, { nativeShaders: 'approximate' });
    expect(result.diagnostics.map(d => d.code)).toEqual(['animation-snapshot', 'native-shader-approximation', 'native-shader-approximation']);
    expect(result.asset).toHaveProperty('asset.version', '2.0'); expect(result.asset).toHaveProperty('meshes');
    expect(mesh.material).toBe(shader); expect(standard.material[1]).toBe(shader);
    const binary = await exportInspectionGltf(group, { nativeShaders: 'approximate', binary: true });
    expect(binary.asset).toBeInstanceOf(ArrayBuffer); expect(new DataView(binary.asset as ArrayBuffer).getUint32(0, true)).toBe(0x46546c67);
    const plain = await exportInspectionGltf(new Mesh(geometry, material)); expect(plain.diagnostics).toEqual([]);
    geometry.dispose(); shader.dispose(); material.dispose();
  } finally { vi.unstubAllGlobals(); }
});
it('captures a PNG with the host viewport and restores its render target even on failure', () => {
  const target = {}; const setRenderTarget = vi.fn(); const render = vi.fn(); const scene = new Scene(); const camera = new PerspectiveCamera();
  const renderer = { getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1, setRenderTarget, render, domElement: { toDataURL: vi.fn(() => 'data:image/png;base64,x') } };
  expect(captureInspectionPreview(renderer as unknown as WebGLRenderer, scene, camera)).toContain('data:image/png');
  expect(render).toHaveBeenCalledWith(scene, camera); expect(setRenderTarget).toHaveBeenLastCalledWith(target, 2, 1);
  renderer.domElement.toDataURL.mockImplementationOnce(() => { throw Error('tainted'); });
  expect(() => captureInspectionPreview(renderer as unknown as WebGLRenderer, scene, camera)).toThrow('tainted');
  expect(setRenderTarget).toHaveBeenLastCalledWith(target, 2, 1);
});

import { BufferAttribute } from 'three';
it('removes native signed packed attributes from exports without modifying shared host geometry', async () => {
  class Reader { result: string | null = null; onloadend?: () => void; async readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); } }
  vi.stubGlobal('FileReader', Reader);
  try {
    const geometry = new BoxGeometry(); geometry.setAttribute('ivert', new BufferAttribute(new Int32Array(geometry.getAttribute('position').count * 4), 4));
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    const result = await exportInspectionGltf(mesh);
    expect(result.diagnostics[0].code).toBe('native-attributes-omitted');
    expect((result.asset as any).accessors.every((a: any) => [5120, 5121, 5122, 5123, 5125, 5126].includes(a.componentType))).toBe(true);
    expect(geometry.hasAttribute('ivert')).toBe(true);
    geometry.deleteAttribute('ivert'); geometry.setAttribute('starMadeVertex', new BufferAttribute(new Int32Array(geometry.getAttribute('position').count * 4), 4));
    expect((await exportInspectionGltf(mesh)).diagnostics).toHaveLength(1);
    geometry.dispose(); mesh.material.dispose();
  } finally { vi.unstubAllGlobals(); }
});

import { describeInspectionBlock, inspectFunctionalSystems } from '../src/inspection/analysis.js';
it('resolves definitions and requires explicit provenance for externally provided functional rules', () => {
  const defs = new Map([[2, blockDefinitionFromConfig({ id: 2, name: 'Armor', textureIds: [1] })]]);
  expect(describeInspectionBlock(d, ref, defs)).toMatchObject({ entity: e, definition: { name: 'Armor' }, state: raw });
  expect(describeInspectionBlock(d, ref, new Map())!.definition).toBeUndefined();
  expect(describeInspectionBlock(d, { ...ref, position: [4, 0, 0] }, defs)).toBeUndefined();
  const provider = { gameVersion: 'fixture-only', source: 'explicit test relations', relations: () => [{ kind: 'controller', from: ref, to: ref }] };
  expect(inspectFunctionalSystems(d, provider)).toMatchObject({ gameVersion: 'fixture-only', source: 'explicit test relations', relations: [{ from: ref, to: ref }] });
  expect(() => inspectFunctionalSystems(d, { ...provider, gameVersion: ' ' })).toThrow(/version/);
  expect(() => inspectFunctionalSystems(d, { ...provider, source: '' })).toThrow(/source/);
});
