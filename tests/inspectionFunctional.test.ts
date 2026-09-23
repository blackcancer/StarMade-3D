import { it, expect } from 'vitest';
import { InspectionDocument } from '../src/inspection/model.js';
import { functionalBlockFromElementInfo, functionalControllersFromBlueprint, buildFunctionalMap, FUNCTIONAL_CATEGORIES, type FunctionalElementInfoLike } from '../src/inspection/functional.js';
function info(typeName: string, patch: Partial<FunctionalElementInfoLike> = {}): FunctionalElementInfoLike {
  return { identity: { id: 1, name: 'Untrusted display name', typeName }, render: { lightSource: false }, logic: { signal: false, controlling: [] }, classification: { reactorChamber: false, systemBlock: false, computer: null }, ...patch };
}
it('classifies configured identifiers and explicit flags, never translated display names', () => {
  const cases = [['SHIP_CORE', 'core'], ['REACTOR_POWER', 'energy'], ['THRUSTER_MODULE', 'propulsion'], ['SHIELD_CAPACITOR', 'shields'], ['DAMAGE_BEAM_MODULE', 'weapons'], ['STORAGE', 'logistics'], ['RAIL_DOCKER', 'docking'], ['SALVAGE_MODULE', 'support']] as const;
  for (const [type, category] of cases) expect(functionalBlockFromElementInfo(info(type)).category).toBe(category);
  expect(Object.keys(FUNCTIONAL_CATEGORIES)).toHaveLength(11);
  expect(functionalBlockFromElementInfo(info('DECORATIVE_THRUSTER')).category).toBeNull();
  const base = info('MOD_MODULE');
  expect(functionalBlockFromElementInfo({ ...base, classification: { ...base.classification, computer: { id: 414, typeName: 'DAMAGE_BEAM_COMPUTER' } } })).toMatchObject({ category: 'weapons', computerType: 414 });
  expect(functionalBlockFromElementInfo({ ...base, classification: { ...base.classification, computer: { id: null, typeName: 'UNKNOWN' }, reactorChamber: true } }).category).toBe('energy');
  expect(functionalBlockFromElementInfo(info('SWITCH', { logic: { signal: true, controlling: [] } })).category).toBe('logic');
  expect(functionalBlockFromElementInfo(info('GLOW', { render: { lightSource: true } })).category).toBe('lighting');
  expect(functionalBlockFromElementInfo({ ...base, classification: { ...base.classification, systemBlock: true } }).category).toBe('other');
  expect(functionalBlockFromElementInfo(info('CONSOLE', { logic: { signal: false, controlling: [1] } }))).toMatchObject({ category: 'other', canControl: true });
});
it('maps saved controller coordinates exactly, retains empty records and diagnoses stale or repeated links', () => {
  const raw = { hp: 255, orientation: 0, active: true };
  const d = new InspectionDocument('d', 0, [{ id: 'ship', blocks: [6, 16, 16, 3, 999].map((type, x) => ({ position: [x, 0, 0] as const, state: { ...raw, type } })) }]);
  const from = { entityId: 'ship', position: [0, 0, 0] as const }; const target = { entityId: 'ship', position: [1, 0, 0] as const };
  const native = [{ x: 16, y: 16, z: 16, groups: [{ type: 16, targets: [{ x: 17, y: 16, z: 16 }] }] }, { x: 19, y: 16, z: 16, groups: [] }];
  const controllers = functionalControllersFromBlueprint('ship', native);
  expect(controllers).toEqual([{ ref: from, groups: [{ targetType: 16, targets: [target] }] }, { ref: { entityId: 'ship', position: [3, 0, 0] }, groups: [] }]);
  const definitions = new Map([
    [6, { id: 6, typeName: 'CANNON_COMPUTER', name: 'Computer', category: 'weapons' as const, computerType: null, canControl: true }],
    [16, { id: 16, typeName: 'CANNON_BARREL', name: 'Barrel', category: 'weapons' as const, computerType: 6, canControl: false }],
    [3, { id: 3, typeName: 'DECORATION', name: 'Decoration', category: null, computerType: null, canControl: false }]
  ]);
  const map = buildFunctionalMap(d, definitions, controllers);
  expect(map.categories.get('weapons')).toHaveLength(3); expect(map.systems).toHaveLength(2); expect(map.systems[1].members).toEqual([]);
  expect(map.relations).toEqual([{ kind: 'saved-controller', from, to: target }]);
  expect(map.unlinked).toEqual([{ ...target, position: [2, 0, 0] }]); expect(map.diagnostics[0].code).toBe('unknown-functional-type');
  const bad = buildFunctionalMap(d, definitions, [controllers[0], controllers[0], { ref: { ...from, position: [99, 0, 0] }, groups: [] }, { ref: from, groups: [{ targetType: 3, targets: [target] }, { targetType: 16, targets: [{ ...target, position: [99, 0, 0] }] }, { targetType: 3, targets: [{ ...target, position: [3, 0, 0] }] }, { targetType: 999, targets: [{ ...target, position: [4, 0, 0] }] }] }]);
  expect(bad.diagnostics.map(d => d.code)).toEqual(['unknown-functional-type', 'duplicate-control-link', 'missing-controller', 'controlled-type-mismatch', 'missing-controlled-block']);
  expect(bad.relations).toHaveLength(3);
  expect(() => functionalControllersFromBlueprint('ship', [{ x: 16.5, y: 16, z: 16, groups: [] }])).toThrow();
});

import { inspectionBlueprintEntities, inspectEntityHierarchy, inspectionSubtree, type InspectionBlueprintEntityLike } from '../src/inspection/blueprint.js';
it('identifies recursive dockings, empty parents and raw rail metadata without flattening identity', () => {
  const leaf: InspectionBlueprintEntityLike = { name: 'ATTACHED_0', offset: { x: 0, y: 2, z: 0 }, segments: [], children: [], logic: { controllers: [] } };
  const child: InspectionBlueprintEntityLike = { ...leaf, offset: { x: -9, y: -4, z: 0 }, worldOffset: { x: -9, y: -4, z: 0 }, children: [leaf], meta: { childTransforms: [{ name: 'root/ATTACHED_0/ATTACHED_0', mode: 'docking', offset: leaf.offset! }], railChildren: [] } };
  const request = { rail: { position: { x: 7, y: 13, z: 14 } }, docked: { position: { x: 16, y: 16, z: 15 } } };
  const root: InspectionBlueprintEntityLike = { name: 'Ship', segments: [{ headerVersion: 3, usedSlots: 1, segments: [{ x: 0, y: 0, z: 0, blocks: [], version: 1, lastChanged: 123n }, { x: 32, y: 0, z: 0, blocks: [] }] }], children: [child, { ...leaf, name: 'ATTACHED_1', meta: null }, { ...leaf, name: 'ATTACHED_2' }], meta: { childTransforms: [{ name: 'Ship\\ATTACHED_0', mode: 'rail', offset: child.offset! }], railChildren: [{ name: 'Ship/ATTACHED_0', request }, { name: 'Ship/ATTACHED_1', request: { rail: null, docked: null } }] } };
  const nodes = inspectionBlueprintEntities(root, 'ship');
  expect(nodes.map(n => n.id)).toEqual(['ship', 'ship/0', 'ship/0/0', 'ship/1', 'ship/2']);
  expect(nodes[1]).toMatchObject({ parentId: 'ship', offset: [-9, -4, 0], docking: { mode: 'rail', parentConnector: [-9, -3, -2], childConnector: [0, 0, -1], rawRailRequest: request } });
  expect(nodes[2]).toMatchObject({ parentId: 'ship/0', offset: [-9, -2, 0], docking: { mode: 'docking' } });
  expect(nodes[3].docking).toMatchObject({ mode: 'unknown', parentConnector: null, childConnector: null });
  expect(nodes[0]).toMatchObject({ docking: null, headerVersion: 3, usedSlots: 1 });
  expect(nodes[0].segments).toMatchObject([{ version: 1, lastChanged: '123' }, { lastChanged: undefined }]);
  expect(nodes[4].docking!.rawRailRequest).toBeNull();
  expect(inspectionBlueprintEntities({ ...leaf, children: [{ ...leaf, name: 'child' }] }, 'root')[1].docking!.mode).toBe('unknown');
  expect(() => inspectionBlueprintEntities({ ...root, children: [leaf, leaf] }, 'root')).toThrow(/Repeated/);
  const doc = new InspectionDocument('d', 0, nodes.map(n => ({ id: n.id, parentId: n.parentId, blocks: [] })));
  expect([...inspectionSubtree(doc, 'ship/0')]).toEqual(['ship/0', 'ship/0/0']);
  expect(inspectEntityHierarchy(doc).map(n => n.depth)).toEqual([0, 1, 2, 1, 1]);
  expect(inspectEntityHierarchy(doc)[0].children).toEqual(['ship/0', 'ship/1', 'ship/2']);
  expect(() => inspectionSubtree(doc, 'absent')).toThrow();
});

it('counts descendants independently from siblings, including through empty docking parents', () => {
  const block = { position: [0, 0, 0] as const, state: { type: 1, hp: 1, orientation: 0, active: false } };
  const doc = new InspectionDocument('dock-tree', 0, [
    { id: 'root', blocks: [block] }, { id: 'empty-dock', parentId: 'root', blocks: [] },
    { id: 'sub-dock', parentId: 'empty-dock', blocks: [block] }, { id: 'sibling', parentId: 'root', blocks: [block] }
  ]);
  expect(inspectEntityHierarchy(doc).map(n => [n.id, n.blockCount, n.subtreeBlockCount])).toEqual([
    ['root', 1, 3], ['empty-dock', 0, 1], ['sub-dock', 1, 1], ['sibling', 1, 1]
  ]);
  expect(functionalBlockFromElementInfo(info('PICKUP_RAIL')).category).toBe('docking');
});
