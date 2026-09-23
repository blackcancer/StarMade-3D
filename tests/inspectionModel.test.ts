import { describe, it, expect } from 'vitest';
import { InspectionDocument, blockReferenceKey, blocksFromSegments, segmentsFromBlocks } from '../src/inspection/model.js';
const raw = { type: 999, hp: 231, orientation: 17, active: false, extra: 63 };
const ref = { entityId: 'ship', position: [-17, 0, 0] as const };
const entity = { id: 'ship', blocks: [{ position: ref.position, state: raw }] };

describe('inspection document', () => {
  it('owns immutable raw snapshots and stable cell identities across revisions', () => {
    const input = { ...raw };
    const d = new InspectionDocument('blueprint', 0, [{ ...entity, blocks: [{ position: ref.position, state: input }] }]);
    input.hp = 0;
    expect(d.resolve(ref)?.state).toEqual(raw);
    expect(Object.isFrozen(d.resolve(ref)?.state)).toBe(true);
    expect(d.query()).toHaveLength(1);
    expect(d.query(b => b.state.active)).toEqual([]);
    expect(d.resolve({ ...ref, entityId: 'other' })).toBeUndefined();
    expect(d.entity('none')).toBeUndefined();
    const next = d.apply(0, [{ kind: 'block', ref, state: { ...raw, active: true } }]);
    expect(next.revision).toBe(1);
    expect(next.resolve(ref)?.state.active).toBe(true);
    expect(d.resolve(ref)?.state.active).toBe(false);
    expect(blockReferenceKey(next.resolve(ref)!.ref)).toBe(blockReferenceKey(ref));
    expect(next.apply(1, [{ kind: 'block', ref, state: null }]).resolve(ref)).toBeUndefined();
    expect(next.apply(1, [{ kind: 'block', ref, state: { ...raw, type: 0 } }]).query()).toEqual([]);
    expect(() => d.apply(1, [])).toThrow(/revision/);
    expect(() => d.apply(0, [{ kind: 'block', ref: { ...ref, entityId: 'missing' }, state: raw }])).toThrow(/entity/);
    expect(() => d.apply(0, [{ kind: 'remove', entityId: 'missing' }])).toThrow(/entity/);
    expect(d.apply(0, [{ kind: 'remove', entityId: 'ship' }]).entities).toEqual([]);
    expect(d.apply(0, [{ kind: 'entity', entity: { id: 'new', blocks: [] } }]).entities).toHaveLength(2);
    expect(d.apply(0, [{ kind: 'entity', entity: { id: 'ship', blocks: [] } }]).query()).toEqual([]);
  });
  it('keeps equal local coordinates distinct between entities, validates graph and storage', () => {
    const d = new InspectionDocument('b', 0, [entity, { ...entity, id: 'child', parentId: 'ship' }]);
    expect(new Set(d.query().map(b => blockReferenceKey(b.ref))).size).toBe(2);
    expect(() => d.apply(0, [{ kind: 'remove', entityId: 'ship' }])).toThrow(/parent/);
    expect(() => new InspectionDocument('', 0, [])).toThrow();
    for (const revision of [-1, 1.2, Infinity]) expect(() => new InspectionDocument('b', revision, [])).toThrow();
    expect(() => new InspectionDocument('b', 0, [entity, entity])).toThrow(/Duplicate/);
    expect(() => new InspectionDocument('b', 0, [{ ...entity, id: '' }])).toThrow();
    expect(() => new InspectionDocument('b', 0, [{ ...entity, parentId: 'absent' }])).toThrow(/parent/);
    expect(() => new InspectionDocument('b', 0, [{ ...entity, parentId: 'ship' }])).toThrow(/Cycle/);
    expect(() => new InspectionDocument('b', 0, [{ ...entity, parentId: 'child' }, { id: 'child', parentId: 'ship', blocks: [] }])).toThrow(/Cycle/);
    expect(() => new InspectionDocument('b', 0, [{ ...entity, blocks: [...entity.blocks, ...entity.blocks] }])).toThrow(/Duplicate/);
    for (const position of [[NaN, 0, 0], [0.1, 0, 0], [0, 0], [Number.MAX_SAFE_INTEGER + 1, 0, 0]]) {
      expect(() => blockReferenceKey({ entityId: 's', position: position as any })).toThrow(/coordinate/);
    }
    expect(() => blockReferenceKey({ entityId: '', position: [0, 0, 0] })).toThrow();
    for (const state of [{ ...raw, type: -1 }, { ...raw, hp: 1.5 }, { ...raw, extra: -1 }, { ...raw, active: 1 }]) {
      expect(() => new InspectionDocument('b', 0, [{ id: 'a', blocks: [{ position: [0, 0, 0], state: state as any }] }])).toThrow(/state/);
    }
    expect(new InspectionDocument('b', 0, [{ id: 'a', blocks: [{ position: [0, 0, 0], state: { type: 0, hp: 0, orientation: 0, active: false } }] }]).query()).toEqual([]);
    for (const transform of [[], Array(16).fill(NaN), Array(16).fill(0)]) expect(() => new InspectionDocument('b', 0, [{ ...entity, transform }])).toThrow(/transform/);
  });
  it('converts negative and boundary segments without losing reserved bits or trusting blockCount', () => {
    const segments = segmentsFromBlocks([{ position: [-17, 0, 0], state: raw }, { position: [-16, 0, 0], state: raw }, { position: [16, 0, 0], state: raw }]);
    expect(segments.map(s => s.x)).toEqual([-32, 0, 32]);
    expect(blocksFromSegments(segments)).toEqual([{ position: [-17, 0, 0], state: raw }, { position: [-16, 0, 0], state: raw }, { position: [16, 0, 0], state: raw }]);
    expect(blocksFromSegments([{ x: 0, y: 0, z: 0, blocks: [], blockCount: 3 }])).toEqual([]);
    expect(() => blocksFromSegments([{ x: 1, y: 0, z: 0, blocks: [] }])).toThrow(/origin/);
    expect(() => blocksFromSegments([{ x: 0, y: 0, z: 0, blocks: Array(32769) }])).toThrow(/length/);
    expect(() => blocksFromSegments([segments[0], segments[0]])).toThrow(/Duplicate/);
    expect(segmentsFromBlocks([])).toEqual([]);
  });
});
