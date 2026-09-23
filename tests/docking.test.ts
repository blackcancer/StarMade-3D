import { it, expect } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { starMadeMatrix4f, starMadeDockingConnectorFrame, resolveStarMadeRailPose, type StarMadeMatrix4f } from '../src/starmade/docking.js';
const native = (matrix: Matrix4): StarMadeMatrix4f => Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`m${Math.floor(i / 4)}${i % 4}`, matrix.elements[i % 4 * 4 + Math.floor(i / 4)]])) as unknown as StarMadeMatrix4f;
const piece = { position: { x: 16, y: 16, z: 16 }, type: 663, orientation: 12 };
it('converts named native matrices with exact translation and rejects nonrigid or invalid frames', () => {
  const m = new Matrix4().makeRotationY(.7).setPosition(-9, 2, 4);
  expect(starMadeMatrix4f(native(m)).elements).toEqual(m.elements);
  for (const bad of [{ ...native(m), m00: NaN }, { ...native(m), m30: 1 }, { ...native(m), m31: 1 }, { ...native(m), m32: 1 }, { ...native(m), m33: 0 }, native(new Matrix4().makeScale(-1, 1, 1)), native(new Matrix4().makeScale(2, .5, 1))]) expect(() => starMadeMatrix4f(bad)).toThrow();
  expect(() => starMadeDockingConnectorFrame({ ...piece, position: { x: .5, y: 0, z: 0 } }, 6, false)).toThrow();
  expect(() => starMadeDockingConnectorFrame(piece, 0, false)).toThrow(/Unsupported/);
  for (const orientation of [-1, 24, .5]) expect(() => starMadeDockingConnectorFrame({ ...piece, orientation }, 6, false)).toThrow();
  expect(starMadeDockingConnectorFrame({ ...piece, type: 1 }, 0, false).elements).toEqual(new Matrix4().elements);
  expect(new Vector3().setFromMatrixPosition(starMadeDockingConnectorFrame({ ...piece, type: 679 }, 6, false)).toArray()).toEqual([0, 0, 0]);
});
it('uses six native connector translation directions for all 24 orientations and mirror frames', () => {
  const directions = [[0,0,1],[0,0,-1],[0,-1,0],[0,1,0],[-1,0,0],[1,0,0]];
  for (let orientation = 0; orientation < 24; orientation++) {
    const frame = starMadeDockingConnectorFrame({ ...piece, orientation }, 6, false);
    expect(new Vector3().setFromMatrixPosition(frame).toArray()).toEqual(directions[Math.floor(orientation / 4)]);
    expect(frame.determinant()).toBeCloseTo(1);
    expect(new Vector3().setFromMatrixPosition(starMadeDockingConnectorFrame({ ...piece, orientation }, 6, true)).length()).toBe(0);
  }
});
it('reconstructs the Isanth attachment and composes a saved turret rotation about its connector', () => {
  const request = { rail: { position: { x: 7, y: 13, z: 14 }, type: 938, orientation: 15 }, docked: { position: { x: 16, y: 16, z: 15 }, type: 663, orientation: 11 }, railTransform: native(new Matrix4()), dockedTransform: native(new Matrix4().makeTranslation(0, -2, 1)) };
  const matrix = resolveStarMadeRailPose(request, 6, 6);
  expect(new Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([-9, -4, 0]);
  expect(matrix.clone().setPosition(0,0,0).elements).toEqual(new Matrix4().elements);
  const turning = { ...request, railTransform: native(new Matrix4().makeRotationY(Math.PI / 2)) };
  const rotated = resolveStarMadeRailPose(turning, 6, 6);
  const connector = new Vector3(0,0,-1);
  expect(connector.clone().applyMatrix4(rotated).distanceTo(connector.clone().applyMatrix4(matrix))).toBeLessThan(1e-10);
  expect(new Vector3(1,0,0).transformDirection(rotated).distanceTo(new Vector3(0,0,-1))).toBeLessThan(1e-10);
  const parent = new Matrix4().makeRotationZ(Math.PI / 2).setPosition(10,0,0);
  const childWorld = parent.clone().multiply(rotated);
  const p = new Vector3(2,3,4); expect(p.clone().applyMatrix4(childWorld).applyMatrix4(childWorld.clone().invert()).distanceTo(p)).toBeLessThan(1e-10);
  expect(request.railTransform).toEqual(native(new Matrix4()));
});

import { inspectionBlueprintEntities, inspectionDocumentFromBlueprint, type RailRequest } from '../src/inspection/blueprint.js';
it('imports rail poses into the parent hierarchy and reports every offset fallback explicitly', () => {
  const leaf = { name: 'ATTACHED_0', segments: [], children: [] };
  const nodes = inspectionBlueprintEntities({ ...leaf, name: 'root', children: [leaf] }, 'ship');
  const request: RailRequest = { rail: { ...piece }, docked: { ...piece, orientation: 8 }, railTransform: native(new Matrix4()), dockedTransform: native(new Matrix4()) };
  const definitions = new Map([[663, { blockStyle: 6 }]]);
  const withRequest = (rawRailRequest: RailRequest | null) => [nodes[0], { ...nodes[1], docking: { mode: 'rail' as const, parentConnector: null, childConnector: null, rawRailRequest } }];
  const good = inspectionDocumentFromBlueprint(withRequest(request), definitions, 'doc');
  expect(good.diagnostics).toEqual([]);
  expect(good.document.entity('ship/0')!.transform![13]).toBe(1);
  expect(good.document.entity('ship/0')!.parentId).toBe('ship');
  const invalid = [null, { ...request, rail: null }, { ...request, docked: null }, { ...request, railTransform: null }, { ...request, dockedTransform: null }, { ...request, rail: { position: piece.position } }, { ...request, rail: { position: piece.position, type: 663 } }, { ...request, docked: { position: piece.position } }, { ...request, docked: { position: piece.position, type: 663 } }];
  for (const r of invalid) expect(inspectionDocumentFromBlueprint(withRequest(r), definitions, 'doc').diagnostics).toMatchObject([{ entityId: 'ship/0', code: 'attachment-offset-fallback' }]);
  expect(inspectionDocumentFromBlueprint([nodes[0], { ...nodes[1], docking: null }], definitions, 'doc').diagnostics).toHaveLength(1);
  expect(inspectionDocumentFromBlueprint(withRequest(request), new Map(), 'doc').diagnostics[0].message).toMatch(/Unknown/);
  expect(inspectionDocumentFromBlueprint(withRequest({ ...request, docked: { ...piece, type: 999 } }), definitions, 'doc').diagnostics[0].message).toMatch(/Unknown/);
  expect(inspectionDocumentFromBlueprint(withRequest(request), new Map([[663, { blockStyle: 0 }]]), 'doc').diagnostics[0].message).toMatch(/Unsupported/);
});
