import type { BlockDefinition } from '../starmade/blockConfig.js';
import { blockReferenceKey, InspectionDocument, type BlockReference, type ResolvedBlock } from './model.js';
import { inspectionBounds } from './spatial.js';

export interface InspectionDiagnostic { readonly code: string; readonly message: string; readonly ref?: BlockReference }
export interface BlockDifference { readonly ref: BlockReference; readonly before?: ResolvedBlock; readonly after?: ResolvedBlock }
export function sameBlockState(a: ResolvedBlock, b: ResolvedBlock): boolean {
  return a.state.type === b.state.type && a.state.hp === b.state.hp && a.state.orientation === b.state.orientation && a.state.active === b.state.active && (a.state.extra ?? 0) === (b.state.extra ?? 0);
}
/** Entities match only by caller-supplied stable identity; names/proximity never establish identity. */
export function compareInspectionDocuments(before: InspectionDocument, after: InspectionDocument): {
  readonly blocks: readonly BlockDifference[];
  readonly entities: readonly { id: string; kind: 'added' | 'removed' | 'transform' }[];
} {
  const previous = new Map(before.query().map(b => [blockReferenceKey(b.ref), b]));
  const changes: BlockDifference[] = [];
  for (const block of after.query()) {
    const key = blockReferenceKey(block.ref); const old = previous.get(key);
    if (!old || !sameBlockState(old, block)) changes.push({ ref: block.ref, before: old, after: block });
    previous.delete(key);
  }
  for (const block of previous.values()) changes.push({ ref: block.ref, before: block });
  const entities: { id: string; kind: 'added' | 'removed' | 'transform' }[] = [];
  for (const entity of after.entities) {
    const old = before.entity(entity.id);
    if (!old) entities.push({ id: entity.id, kind: 'added' });
    else if (old.parentId !== entity.parentId || old.transform!.some((v, i) => v !== entity.transform![i])) entities.push({ id: entity.id, kind: 'transform' });
  }
  for (const entity of before.entities) if (!after.entity(entity.id)) entities.push({ id: entity.id, kind: 'removed' });
  return { blocks: changes, entities };
}
export function inspectDocument(document: InspectionDocument, definitions: ReadonlyMap<number, BlockDefinition> = new Map()) {
  const inventory = new Map<number, { type: number; name: string | null; count: number; rawActiveCount: number }>();
  const diagnostics: InspectionDiagnostic[] = [];
  for (const block of document.query()) {
    let entry = inventory.get(block.state.type);
    if (!entry) {
      const definition = definitions.get(block.state.type);
      entry = { type: block.state.type, name: definition?.name ?? null, count: 0, rawActiveCount: 0 };
      inventory.set(entry.type, entry);
      if (!definition) diagnostics.push({ code: 'unknown-block', message: `Unknown block type ${entry.type}`, ref: block.ref });
    }
    entry.count++; if (block.state.active) entry.rawActiveCount++;
  }
  return { inventory: [...inventory.values()].sort((a, b) => a.type - b.type), occupiedCells: document.query().length, bounds: inspectionBounds(document), diagnostics };
}
export interface InspectionRelation { readonly kind: string; readonly from: BlockReference; readonly to: BlockReference }
/** Only supplied relations are returned. Functional meaning belongs to a versioned game-specific provider. */
export function inspectRelations(document: InspectionDocument, relations: readonly InspectionRelation[]) {
  const valid: InspectionRelation[] = []; const diagnostics: InspectionDiagnostic[] = [];
  for (const relation of relations) {
    if (!document.resolve(relation.from) || !document.resolve(relation.to)) diagnostics.push({ code: 'dangling-relation', message: `Missing endpoint for ${relation.kind}` });
    else valid.push(relation);
  }
  return { relations: valid, diagnostics };
}
export interface InspectionAnnotation { readonly id: string; readonly documentId: string; readonly revision: number; readonly ref: BlockReference; readonly text: string }
export function resolveInspectionAnnotation(document: InspectionDocument, annotation: InspectionAnnotation) {
  if (annotation.documentId !== document.id) return { status: 'foreign' as const };
  if (annotation.revision !== document.revision) return { status: 'stale' as const };
  const block = document.resolve(annotation.ref);
  return { status: block ? 'resolved' as const : 'missing' as const, block };
}
export interface InspectionKeyframe<T> { readonly time: number; readonly value: T }
/** Deterministic step sampling, independent of wall-clock timers; useful for active states and asset frames. */
export function sampleInspectionTimeline<T>(frames: readonly InspectionKeyframe<T>[], time: number, duration: number, loop = false): T {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 || frames.length === 0) throw new Error('Invalid timeline');
  let previous = -Infinity;
  for (const frame of frames) {
    if (!Number.isFinite(frame.time) || frame.time < 0 || frame.time > duration || frame.time <= previous) throw new Error('Invalid keyframe order/time');
    previous = frame.time;
  }
  const t = loop ? ((time % duration) + duration) % duration : Math.max(0, Math.min(duration, time));
  let value = frames[0].value;
  for (const frame of frames) { if (frame.time > t) break; value = frame.value; }
  return value;
}
export function inspectionAssetCatalog(definitions: ReadonlyMap<number, BlockDefinition>) {
  return [...definitions.values()].sort((a, b) => a.id - b.id).map(d => ({ id: d.id, name: d.name, textures: { ...d.textures }, models: d.lodShape.slice(), activeModels: d.lodShapeActive.slice(), emissive: d.lightSource }));
}

/** A caller may supply rules verified against a specific game source/version. No rules are inferred here. */
export interface InspectionSystemProvider {
  readonly gameVersion: string;
  readonly source: string;
  relations(document: InspectionDocument): readonly InspectionRelation[];
}
export function inspectFunctionalSystems(document: InspectionDocument, provider: InspectionSystemProvider) {
  if (!provider.gameVersion.trim() || !provider.source.trim()) throw new Error('Functional rules require game version and source');
  return { gameVersion: provider.gameVersion, source: provider.source, ...inspectRelations(document, provider.relations(document)) };
}
export function describeInspectionBlock(document: InspectionDocument, ref: BlockReference, definitions: ReadonlyMap<number, BlockDefinition>) {
  const block = document.resolve(ref);
  if (!block) return undefined;
  return { ...block, entity: document.entity(ref.entityId)!, definition: definitions.get(block.state.type) };
}
