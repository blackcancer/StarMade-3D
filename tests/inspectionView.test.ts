import { describe, it, expect } from 'vitest';
import { Box3, Group, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, Vector3, type Intersection } from 'three';
import { InspectionDocument, blockReferenceKey } from '../src/inspection/model.js';
import { entityWorldMatrix, convertInspectionPoint, inspectionBounds, inspectionPredicate, measureBlockCentres, frameInspectionBounds } from '../src/inspection/spatial.js';
import { InspectionHitIndex, InspectionSelection } from '../src/inspection/picking.js';
const ref = { entityId: 'child', position: [0, 0, 0] as const };
const raw = { type: 1, hp: 255, orientation: 0, active: false };
const d = new InspectionDocument('b', 0, [
  { id: 'root', transform: new Matrix4().makeTranslation(10, 0, 0).toArray(), blocks: [{ position: [0, 0, 0], state: raw }] },
  { id: 'child', parentId: 'root', transform: new Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 3, 0).toArray(), blocks: [{ position: ref.position, state: raw }] }
]);
describe('spatial inspection and picking', () => {
  it('composes hierarchies, round trips points, bounds and measurements independently of rendering', () => {
    expect(entityWorldMatrix(d, 'child').elements[12]).toBe(10);
    expect(convertInspectionPoint(d, [1, 0, 0], 'child', null)).toEqual([10, 4, 0]);
    const local = convertInspectionPoint(d, [10, 4, 0], null, 'child');
    expect(local[0]).toBeCloseTo(1); expect(local[1]).toBeCloseTo(0);
    expect(convertInspectionPoint(d, [0, 0, 0], 'root', 'child')[0]).toBeCloseTo(-3);
    expect(() => entityWorldMatrix(d, 'bad')).toThrow();
    const singular = new InspectionDocument('b', 0, [{ id: 's', transform: new Matrix4().makeScale(0, 1, 1).toArray(), blocks: [] }]);
    expect(() => convertInspectionPoint(singular, [0, 0, 0], null, 's')).toThrow(/Singular/);
    expect(inspectionBounds(d).min.toArray()).toEqual([9.5, -0.5, -0.5]);
    expect(inspectionBounds(d).max.toArray()).toEqual([10.5, 3.5, 0.5]);
    expect(inspectionBounds(d, []).isEmpty()).toBe(true);
    expect(measureBlockCentres(d, ref, { entityId: 'root', position: [0, 0, 0] })).toBe(3);
    expect(() => measureBlockCentres(d, { ...ref, position: [1, 0, 0] }, ref)).toThrow();
    expect(() => measureBlockCentres(d, ref, { ...ref, position: [1, 0, 0] })).toThrow();
  });
  it('supports isolation, local layers and XYZ cuts', () => {
    expect(d.query(inspectionPredicate({}))).toHaveLength(2);
    expect(d.query(inspectionPredicate({ entities: new Set(['child']) }))).toHaveLength(1);
    expect(d.query(inspectionPredicate({ cells: new Set([blockReferenceKey(ref)]), min: [0, 0, 0], max: [0, 0, 0] }))).toHaveLength(1);
    expect(d.query(inspectionPredicate({ min: [1, 0, 0] }))).toHaveLength(0);
    expect(d.query(inspectionPredicate({ max: [-1, 0, 0] }))).toHaveLength(0);
  });
  it('frames both camera types and rejects invalid requests', () => {
    const bounds = inspectionBounds(d);
    for (const camera of [new PerspectiveCamera(50, 0.5), new OrthographicCamera(-2, 2, 1, -1), new OrthographicCamera(-0.5, 0.5, 1, -1)]) {
      expect(frameInspectionBounds(camera, bounds).toArray()).toEqual([10, 1.5, 0]);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1); expect(Math.abs(point.z)).toBeLessThan(1);
      }
    }
    expect(() => frameInspectionBounds(new PerspectiveCamera(), new Box3())).toThrow();
    expect(() => frameInspectionBounds(new PerspectiveCamera(), bounds, new Vector3())).toThrow();
    expect(() => frameInspectionBounds(new PerspectiveCamera(), bounds, new Vector3(1, 0, 0), 0)).toThrow();
    expect(() => frameInspectionBounds(new PerspectiveCamera(), bounds, new Vector3(1, 0, 0), NaN)).toThrow();
    expect(frameInspectionBounds(new PerspectiveCamera(), new Box3(new Vector3(), new Vector3())).toArray()).toEqual([0, 0, 0]);
  });
  it('maps grouped LODs, triangles and instances, rejecting stale or unmapped intersections', () => {
    const index = new InspectionHitIndex(); const root = new Group(); const mesh = new Mesh(); root.add(mesh);
    const hit: Intersection = { object: mesh, point: new Vector3(10, 3, 0), distance: 1 };
    expect(index.resolve(d, hit)).toBeUndefined();
    index.bindBlock(root, d, ref);
    expect(index.resolve(d, hit)).toMatchObject({ ref, face: null, revision: 0, space: 'scene', state: raw });
    expect(index.resolve(d, hit)!.point).not.toBe(hit.point);
    expect(index.resolve(d.apply(0, []), hit)).toBeUndefined();
    index.bindTriangles(mesh, d, [{ ref, face: 4 }]);
    expect(index.resolve(d, hit)).toBeUndefined();
    expect(index.resolve(d, { ...hit, faceIndex: 0 })!.face).toBe(4);
    expect(index.resolve(d, { ...hit, faceIndex: 10 })).toBeUndefined();
    index.bindInstances(mesh, d, [ref]);
    expect(index.resolve(d, hit)).toBeUndefined();
    expect(index.resolve(d, { ...hit, instanceId: 0 })!.ref).toEqual(ref);
    expect(index.resolve(d, { ...hit, instanceId: 10 })).toBeUndefined();
    index.bindBlock(mesh, d, { ...ref, position: [1, 0, 0] });
    expect(index.resolve(d, hit)).toBeUndefined();
    index.unbind(mesh); index.unbind(root); expect(index.resolve(d, hit)).toBeUndefined();
  });
  it('preserves multi-selection through remesh and prunes deleted cells', () => {
    const s = new InspectionSelection(); s.set(ref); expect(s.has(ref)).toBe(true);
    expect(s.values()).toEqual([ref]); s.reconcile(d); expect(s.values()).toHaveLength(1);
    s.reconcile(d.apply(0, [{ kind: 'block', ref, state: null }])); expect(s.values()).toEqual([]);
    s.set(ref); s.set(ref, false); expect(s.has(ref)).toBe(false);
    s.set(ref); s.clear(); expect(s.values()).toEqual([]);
  });
});

import { BufferGeometry, BoxGeometry, MeshBasicMaterial } from 'three';
import { vi } from 'vitest';
import { InspectionScene } from '../src/inspection/sync.js';
import { buildInspectionSegments, inspectionSegmentTriangles } from '../src/inspection/segmentAdapter.js';
import { blockDefinitionFromConfig } from '../src/starmade/blockConfig.js';
it('rebuilds only affected cells, propagates transforms, preserves selection and releases exactly owned visuals', () => {
  const initial = new InspectionDocument('sync', 0, [{ id: 'a', blocks: [0, 1, 10].map(x => ({ position: [x, 0, 0] as const, state: raw })) }]);
  const disposed = vi.fn();
  const build = vi.fn(() => ({ object: new Mesh(), dispose: disposed })); const scene = new InspectionScene(build);
  const first = scene.sync(initial); expect(first.geometry).toHaveLength(3); expect(first.lighting).toBe(true);
  const far = scene.root.children[2];
  const same = scene.sync(initial); expect(same.geometry).toEqual([]); expect(same.lighting).toBe(false);
  const a = { entityId: 'a', position: [0, 0, 0] as const }; scene.selection.set(a);
  expect(scene.selectedObjects()).toEqual([scene.root.children[0]]);
  const updated = initial.apply(0, [{ kind: 'block', ref: a, state: { ...raw, active: true } }]);
  expect(scene.sync(updated).geometry).toHaveLength(2); expect(build).toHaveBeenCalledTimes(5); expect(scene.root.children).toContain(far);
  expect(scene.selection.has(a)).toBe(true);
  const moved = updated.apply(1, [{ kind: 'entity', entity: { ...updated.entity('a')!, transform: new Matrix4().makeTranslation(0, 2, 0).toArray() } }]);
  const movedResult = scene.sync(moved); expect(movedResult.geometry).toEqual([]); expect(movedResult.transforms).toHaveLength(3); expect(movedResult.lighting).toBe(true);
  const removed = moved.apply(2, [{ kind: 'block', ref: a, state: null }]);
  expect(scene.sync(removed).geometry).toHaveLength(2); expect(scene.selection.values()).toEqual([]);
  scene.selection.set({ entityId: 'a', position: [10, 0, 0] });
  scene.setFilter(inspectionPredicate({ max: [1, 0, 0] })); scene.sync(removed);
  expect(scene.root.children).toHaveLength(1); expect(scene.selectedObjects()).toEqual([]);
  scene.sync(new InspectionDocument('other', 0, initial.entities));
  scene.dispose(); expect(scene.root.children).toEqual([]); scene.dispose();
  expect(disposed).toHaveBeenCalledTimes(build.mock.calls.length);
  expect(scene.sync(initial).lighting).toBe(true); scene.dispose();
});
it('keeps prior scene intact when a replacement factory fails and disposes prepared resources', () => {
  const doc = new InspectionDocument('b', 0, [{ id: 'a', blocks: [0, 1].map(x => ({ position: [x, 0, 0] as const, state: raw })) }]);
  let fail = false; const dispose = vi.fn();
  const view = new InspectionScene(({ block }) => { if (fail && block.ref.position[0] === 1) throw Error('asset unavailable'); return { object: new Group(), dispose }; });
  view.sync(doc); const originals = view.root.children.slice(); fail = true; view.setFilter(() => true);
  expect(() => view.sync(doc)).toThrow('asset unavailable'); expect(dispose).toHaveBeenCalledTimes(1); expect(view.root.children).toEqual(originals);
  fail = false; view.sync(doc); view.dispose(); expect(dispose).toHaveBeenCalledTimes(5);
});
it('recreates cut faces across segment boundaries and resolves opaque/blended native triangles', () => {
  const armor = blockDefinitionFromConfig({ id: 1, name: 'Armor', textureIds: [1] });
  const glass = blockDefinitionFromConfig({ id: 2, name: 'Glass', textureIds: [2], transparent: true });
  const doc = new InspectionDocument('native', 0, [{ id: 'a', blocks: [15, 16].map(x => ({ position: [x, 0, 0] as const, state: raw })) }]);
  const options = { blockDefinitions: new Map([[1, armor], [2, glass]]) };
  const full = buildInspectionSegments(doc, 'a', undefined, options);
  expect(full.map(e => e.batches.opaque.getIndex()!.count)).toEqual([30, 30]);
  const cut = buildInspectionSegments(doc, 'a', inspectionPredicate({ max: [15, 0, 0] }), options);
  expect(cut[0].batches.opaque.getIndex()!.count).toBe(36);
  const triangles = inspectionSegmentTriangles(cut[0].batches.opaque, 'a', cut[0].origin);
  expect(triangles).toHaveLength(12); expect(triangles.every(t => t.ref.position.join(',') === '15,0,0')).toBe(true);
  expect(new Set(triangles.map(t => t.face)).size).toBe(6);
  const mesh = new Mesh(cut[0].batches.opaque, new MeshBasicMaterial()); const hits = new InspectionHitIndex(); hits.bindTriangles(mesh, doc, triangles);
  expect(hits.resolve(doc, { object: mesh, faceIndex: 0, distance: 1, point: new Vector3() })!.state).toEqual(raw);
  const changed = doc.apply(0, [{ kind: 'block', ref: { entityId: 'a', position: [15, 0, 0] }, state: { ...raw, type: 2 } }]);
  const transparent = buildInspectionSegments(changed, 'a', undefined, options);
  const glassSegment = transparent.find(e => e.origin[0] === 0)!;
  expect(inspectionSegmentTriangles(glassSegment.batches.blended, 'a', glassSegment.origin)).toHaveLength(10);
  expect(buildInspectionSegments(doc, 'a')).toHaveLength(2);
  expect(() => buildInspectionSegments(doc, 'bad')).toThrow();
  expect(() => inspectionSegmentTriangles(new BufferGeometry(), 'a', [0, 0, 0])).toThrow();
  const missingIndex = new BoxGeometry(); missingIndex.setAttribute('ivert', missingIndex.getAttribute('position')); missingIndex.setIndex(null);
  expect(() => inspectionSegmentTriangles(missingIndex, 'a', [0, 0, 0])).toThrow();
  const spy = vi.spyOn(BufferGeometry.prototype, 'dispose');
  expect(() => buildInspectionSegments(doc, 'a', undefined, { ...options, light: c => { if (c.segment.x === 32) throw Error('light unavailable'); return [0, 0, 0]; } })).toThrow('light unavailable');
  expect(spy).toHaveBeenCalledTimes(2); spy.mockRestore();
  for (const entry of [...full, ...cut, ...transparent]) { entry.batches.opaque.dispose(); entry.batches.blended.dispose(); }
});

import { createInspectionHighlight } from '../src/inspection/highlight.js';
it('highlights transformed cells without editing any scene material', () => {
  const overlay = createInspectionHighlight(d, [ref, { ...ref, position: [5, 0, 0] }]);
  expect(overlay.root.children).toHaveLength(1); overlay.root.updateMatrixWorld(true);
  expect(overlay.root.children[0].getWorldPosition(new Vector3()).toArray()).toEqual([10, 3, 0]);
  const parent = new Group(); parent.add(overlay.root); const release = vi.fn();
  const helper = overlay.root.children[0].children[0] as Mesh; helper.geometry.addEventListener('dispose', release);
  overlay.dispose(); overlay.dispose(); expect(release).toHaveBeenCalledTimes(1); expect(parent.children).toEqual([]);
});

import { createInspectionRelationOverlay } from '../src/inspection/highlight.js';
it('draws only valid supplied relations in scene coordinates across transformed entities', () => {
  const overlay = createInspectionRelationOverlay(d, [{ kind: 'controller', from: { entityId: 'root', position: [0, 0, 0] }, to: ref }, { kind: 'invalid', from: ref, to: { ...ref, position: [9, 0, 0] } }]);
  expect([...overlay.root.geometry.getAttribute('position').array]).toEqual([10, 0, 0, 10, 3, 0]);
  expect(overlay.diagnostics).toHaveLength(1); const dispose = vi.fn(); overlay.root.geometry.addEventListener('dispose', dispose);
  const parent = new Group(); parent.add(overlay.root); overlay.dispose(); overlay.dispose(); expect(parent.children).toEqual([]); expect(dispose).toHaveBeenCalledTimes(1);
});
