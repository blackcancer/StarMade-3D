import { inspectionBlueprintEntities, type InspectionBlueprintEntityLike, type InspectionBlueprintNode } from './blueprint.js';
import { STARMADE_SEGMENT_BLOCK_COUNT, type SegmentBlockDataLike, type SegmentDataLike } from '../starmade/segmentData.js';

/** Structural Decoder 2.1 contract: no Node.js dependency in the browser package. */
export interface StarMadeStreamEntity extends Omit<InspectionBlueprintEntityLike, 'segments' | 'children'> {
  readonly kind: 'entity';
  readonly path: string;
  readonly parentPath: string | null;
}
export interface StarMadeStreamSegment {
  readonly kind: 'segment'; readonly entityPath: string;
  readonly x: number; readonly y: number; readonly z: number;
  readonly words: Uint32Array; readonly headerVersion: number;
  readonly version?: number; readonly lastChanged?: bigint | string;
}
export interface StarMadeStreamEnd {
  readonly kind: 'end'; readonly status: 'complete' | 'partial' | 'error' | 'cancelled';
  readonly diagnostics: readonly unknown[];
}
export type StarMadeBlueprintStreamEvent = StarMadeStreamEntity | StarMadeStreamSegment | StarMadeStreamEnd;
export type StarMadeInspectionStreamEvent =
  | { readonly kind: 'entity'; readonly node: InspectionBlueprintNode }
  | { readonly kind: 'segment'; readonly entityId: string; readonly segment: StarMadeStreamedSegment; readonly headerVersion: number }
  | { readonly kind: 'end'; readonly status: 'complete' };

export interface StarMadeStreamedSegment extends SegmentDataLike { readonly version?: number; readonly lastChanged?: string }

/** Decode only allocated words; air remains sparse. Input words may be transferred after return. */
export function segmentFromStarMadeWords(input: Pick<StarMadeStreamSegment, 'x' | 'y' | 'z' | 'words' | 'version' | 'lastChanged'>): StarMadeStreamedSegment {
  if (!(input.words instanceof Uint32Array) || input.words.length !== STARMADE_SEGMENT_BLOCK_COUNT ||
      ![input.x, input.y, input.z].every(v => Number.isSafeInteger(v) && v % 32 === 0)) throw new Error('Invalid compact segment');
  const blocks: SegmentBlockDataLike[] = new Array(STARMADE_SEGMENT_BLOCK_COUNT);
  let blockCount = 0;
  for (let i = 0; i < input.words.length; i++) {
    const word = input.words[i];
    if (word === 0) continue;
    const type = word & 8191;
    blocks[i] = { type, hp: (word >>> 13) & 127, active: Boolean(word & (1 << 20)), orientation: (word >>> 21) & 31, extra: word >>> 26 };
    if (type !== 0) blockCount++;
  }
  return { x: input.x, y: input.y, z: input.z, blocks, blockCount, version: input.version, lastChanged: input.lastChanged?.toString() };
}

/** Demand-driven adapter. Retains entity metadata, never segments; early return closes the source. */
export async function* streamStarMadeInspection(source: AsyncIterable<StarMadeBlueprintStreamEvent>, signal?: AbortSignal): AsyncGenerator<StarMadeInspectionStreamEvent> {
  const entities = new Map<string, { source: InspectionBlueprintEntityLike; node: InspectionBlueprintNode }>();
  let complete = false;
  for await (const event of source) {
    signal?.throwIfAborted();
    if (complete) throw new Error('Event after stream completion');
    if (event.kind === 'entity') {
      if (!event.path || entities.has(event.path)) throw new Error('Duplicate or empty stream entity');
      const entity = { ...event, segments: [], children: [] };
      let node: InspectionBlueprintNode;
      if (event.parentPath === null) {
        if (entities.size) throw new Error('Multiple stream roots');
        [node] = inspectionBlueprintEntities(entity, event.path);
      } else {
        const parent = entities.get(event.parentPath);
        if (!parent) throw new Error('Missing stream parent');
        [, node] = inspectionBlueprintEntities({ ...parent.source, worldOffset: { x: parent.node.offset[0], y: parent.node.offset[1], z: parent.node.offset[2] }, children: [entity] }, event.parentPath);
        node = { ...node, id: event.path };
      }
      entities.set(event.path, { source: entity, node });
      yield { kind: 'entity', node };
    } else if (event.kind === 'segment') {
      if (!entities.has(event.entityPath)) throw new Error('Missing segment entity');
      yield { kind: 'segment', entityId: event.entityPath, segment: segmentFromStarMadeWords(event), headerVersion: event.headerVersion };
    } else {
      if (event.status !== 'complete') throw new Error(`Blueprint stream ${event.status}`, { cause: event.diagnostics });
      complete = true;
    }
  }
  signal?.throwIfAborted();
  if (!complete) throw new Error('Blueprint stream ended without completion');
  yield { kind: 'end', status: 'complete' };
}
