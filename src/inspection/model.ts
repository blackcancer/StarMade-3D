import { segmentBlockIndex, segmentBlockPosition, type SegmentBlockDataLike, type SegmentDataLike } from '../starmade/segmentData.js';

export type BlockPosition = readonly [number, number, number];
export interface BlockReference { readonly entityId: string; readonly position: BlockPosition }
export interface InspectionBlock { readonly position: BlockPosition; readonly state: SegmentBlockDataLike }
export interface ResolvedBlock { readonly ref: BlockReference; readonly state: SegmentBlockDataLike }
export interface InspectionEntity {
  readonly id: string;
  readonly parentId?: string;
  /** Column-major affine local-to-parent matrix. Default identity. Block centres use origin + index - 16. */
  readonly transform?: readonly number[];
  readonly blocks: readonly InspectionBlock[];
}
export type InspectionChange =
  | { readonly kind: 'block'; readonly ref: BlockReference; readonly state: SegmentBlockDataLike | null }
  | { readonly kind: 'entity'; readonly entity: InspectionEntity }
  | { readonly kind: 'remove'; readonly entityId: string };
export const INSPECTION_IDENTITY: readonly number[] = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function coordinate(position: BlockPosition): void {
  if (position.length !== 3 || !position.every(Number.isSafeInteger)) throw new Error('Invalid block coordinate');
}
export function blockReferenceKey(ref: BlockReference): string {
  coordinate(ref.position);
  if (!ref.entityId) throw new Error('Empty entity identity');
  return JSON.stringify([ref.entityId, ...ref.position]);
}
function snapshotBlock(block: InspectionBlock): InspectionBlock {
  coordinate(block.position);
  const s = block.state;
  if (![s.type, s.hp, s.orientation, s.extra ?? 0].every(v => Number.isSafeInteger(v) && v >= 0) || typeof s.active !== 'boolean') throw new Error('Invalid raw block state');
  return Object.freeze({ position: Object.freeze([...block.position]) as BlockPosition, state: Object.freeze({ ...s }) });
}
function snapshotEntity(entity: InspectionEntity): InspectionEntity {
  if (!entity.id) throw new Error('Empty entity identity');
  const transform = entity.transform ?? INSPECTION_IDENTITY;
  if (transform.length !== 16 || !transform.every(Number.isFinite) || transform[3] !== 0 || transform[7] !== 0 || transform[11] !== 0 || transform[15] !== 1) throw new Error('Invalid affine transform');
  const keys = new Set<string>();
  const blocks = entity.blocks.map(snapshotBlock).filter(b => b.state.type !== 0);
  for (const b of blocks) {
    const key = blockReferenceKey({ entityId: entity.id, position: b.position });
    if (keys.has(key)) throw new Error('Duplicate block coordinate');
    keys.add(key);
  }
  return Object.freeze({ id: entity.id, parentId: entity.parentId, transform: Object.freeze([...transform]), blocks: Object.freeze(blocks) });
}

/** Immutable logical snapshot. Hosts own persistence, commands and undo/redo. */
export class InspectionDocument {
  readonly entities: readonly InspectionEntity[];
  private readonly byId: ReadonlyMap<string, InspectionEntity>;
  private readonly cells: ReadonlyMap<string, ResolvedBlock>;
  constructor(readonly id: string, readonly revision: number, entities: readonly InspectionEntity[]) {
    if (!id || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid document identity/revision');
    this.entities = Object.freeze(entities.map(snapshotEntity));
    const byId = new Map(this.entities.map(e => [e.id, e]));
    if (byId.size !== entities.length) throw new Error('Duplicate entity identity');
    for (const entity of this.entities) {
      let current: InspectionEntity | undefined = entity;
      const visited = new Set<string>();
      while (current) {
        if (visited.has(current.id)) throw new Error('Cycle in entity hierarchy');
        visited.add(current.id);
        if (current.parentId !== undefined && !byId.has(current.parentId)) throw new Error('Missing parent entity');
        current = byId.get(current.parentId!);
      }
    }
    this.byId = byId;
    this.cells = new Map(this.entities.flatMap(e => e.blocks.map(b => {
      const ref = Object.freeze({ entityId: e.id, position: b.position });
      return [blockReferenceKey(ref), Object.freeze({ ref, state: b.state })] as const;
    })));
    Object.freeze(this);
  }
  entity(id: string): InspectionEntity | undefined { return this.byId.get(id); }
  resolve(ref: BlockReference): ResolvedBlock | undefined { return this.cells.get(blockReferenceKey(ref)); }
  query(predicate: (block: ResolvedBlock) => boolean = () => true): readonly ResolvedBlock[] { return [...this.cells.values()].filter(predicate); }
  apply(expectedRevision: number, changes: readonly InspectionChange[]): InspectionDocument {
    if (expectedRevision !== this.revision) throw new Error('Stale document revision');
    const entities = new Map(this.byId);
    for (const change of changes) {
      if (change.kind === 'entity') entities.set(change.entity.id, change.entity);
      else if (change.kind === 'remove') {
        if (!entities.delete(change.entityId)) throw new Error('Unknown entity');
      } else {
        const entity = entities.get(change.ref.entityId);
        if (!entity) throw new Error('Unknown entity');
        const key = blockReferenceKey(change.ref);
        const blocks = entity.blocks.filter(b => blockReferenceKey({ entityId: entity.id, position: b.position }) !== key);
        if (change.state !== null) blocks.push({ position: change.ref.position, state: change.state });
        entities.set(entity.id, { ...entity, blocks });
      }
    }
    return new InspectionDocument(this.id, this.revision + 1, [...entities.values()]);
  }
}

/** Decoder-compatible segment adapter; unknown types and reserved raw fields are retained. */
export function blocksFromSegments(segments: readonly SegmentDataLike[]): InspectionBlock[] {
  const result: InspectionBlock[] = [];
  const origins = new Set<string>();
  for (const segment of segments) {
    const origin = [segment.x, segment.y, segment.z];
    if (!origin.every(v => Number.isSafeInteger(v) && v % 32 === 0)) throw new Error('Invalid segment origin');
    if (segment.blocks.length > 32768) throw new Error('Invalid segment length');
    const key = origin.join(',');
    if (origins.has(key)) throw new Error('Duplicate segment origin');
    origins.add(key);
    segment.blocks.forEach((state, index) => {
      if (state.type === 0) return;
      const { x, y, z } = segmentBlockPosition(index);
      result.push(snapshotBlock({ position: [segment.x + x - 16, segment.y + y - 16, segment.z + z - 16], state }));
    });
  }
  return result;
}
export function segmentsFromBlocks(blocks: readonly InspectionBlock[]): SegmentDataLike[] {
  const segments = new Map<string, { x: number; y: number; z: number; blocks: SegmentBlockDataLike[] }>();
  for (const input of blocks) {
    const block = snapshotBlock(input);
    const origin = block.position.map(v => Math.floor((v + 16) / 32) * 32);
    const key = origin.join(',');
    let segment = segments.get(key);
    if (!segment) {
      segment = { x: origin[0], y: origin[1], z: origin[2], blocks: Array(32768).fill(Object.freeze({ type: 0, hp: 0, orientation: 0, active: false })) };
      segments.set(key, segment);
    }
    const p = block.position.map((v, i) => v - origin[i] + 16);
    segment.blocks[segmentBlockIndex(p[0], p[1], p[2])] = block.state;
  }
  return [...segments.values()];
}
