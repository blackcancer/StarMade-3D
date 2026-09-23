import { starMadeDisplayTextsFromManager, type StarMadeDisplayText } from '../starmade/displayText.js';
import type { SegmentDataLike } from '../starmade/segmentData.js';
import type { BlueprintControllerLike } from './functional.js';
import { Matrix4 } from 'three';
import { resolveStarMadeRailPose, type StarMadeMatrix4f } from '../starmade/docking.js';
import { blocksFromSegments, InspectionDocument, type BlockPosition } from './model.js';

interface Offset { readonly x: number; readonly y: number; readonly z: number }
export interface RailRequest {
  readonly rail: { readonly position: Offset; readonly type?: number; readonly orientation?: number } | null;
  readonly docked: { readonly position: Offset; readonly type?: number; readonly orientation?: number } | null;
  readonly railTransform?: StarMadeMatrix4f | null;
  readonly dockedTransform?: StarMadeMatrix4f | null;
}
export interface InspectionBlueprintEntityLike {
  readonly name: string;
  readonly offset?: Offset;
  readonly worldOffset?: Offset;
  readonly segments: readonly { readonly headerVersion: number; readonly usedSlots: number; readonly segments: readonly (SegmentDataLike & { readonly version?: number; readonly lastChanged?: bigint | string | number })[] }[];
  readonly children: readonly InspectionBlueprintEntityLike[];
  readonly logic?: { readonly controllers: readonly BlueprintControllerLike[] } | null;
  readonly meta?: {
    readonly manager?: unknown;
    readonly childTransforms: readonly { readonly name: string; readonly mode: 'rail' | 'docking'; readonly offset: Offset }[];
    readonly railChildren: readonly { readonly name: string; readonly request: RailRequest | null }[];
  } | null;
}
export interface InspectionBlueprintNode {
  readonly id: string; readonly parentId?: string; readonly name: string; readonly label: string;
  readonly offset: BlockPosition; readonly localOffset: BlockPosition;
  readonly headerVersion: number; readonly usedSlots: number;
  readonly segments: readonly SegmentDataLike[];
  readonly controllers: readonly BlueprintControllerLike[];
  readonly displayTexts?: readonly StarMadeDisplayText[];
  readonly docking: { readonly mode: 'rail' | 'docking' | 'unknown'; readonly parentConnector: BlockPosition | null; readonly childConnector: BlockPosition | null; readonly rawRailRequest: RailRequest | null } | null;
}
const tuple = (p: Offset): BlockPosition => [p.x, p.y, p.z];
const connector = (p: Offset | undefined): BlockPosition | null => p ? [p.x - 16, p.y - 16, p.z - 16] : null;
const basename = (name: string) => name.replaceAll('\\', '/').split('/').pop();
/** Keep every attachment, including empty intermediate parents. Paths are scoped to this import snapshot. */
export function inspectionBlueprintEntities(root: InspectionBlueprintEntityLike, rootId: string): InspectionBlueprintNode[] {
  const nodes: InspectionBlueprintNode[] = [];
  const seen = new Set<InspectionBlueprintEntityLike>();
  const visit = (entity: InspectionBlueprintEntityLike, id: string, parent?: InspectionBlueprintNode, owner?: InspectionBlueprintEntityLike) => {
    if (seen.has(entity)) throw new Error('Repeated or cyclic blueprint entity');
    seen.add(entity);
    const local = tuple(entity.offset ?? { x: 0, y: 0, z: 0 });
    const offset = entity.worldOffset ? tuple(entity.worldOffset) : local.map((v, i) => v + (parent?.offset[i] ?? 0)) as [number, number, number];
    const transform = owner?.meta?.childTransforms.find(t => basename(t.name) === entity.name);
    const request = owner?.meta?.railChildren.find(t => basename(t.name) === entity.name)?.request ?? null;
    const node: InspectionBlueprintNode = {
      id, parentId: parent?.id, name: parent ? entity.name : 'root', label: entity.name, offset, localOffset: local,
      headerVersion: entity.segments[0]?.headerVersion ?? 0,
      usedSlots: entity.segments.reduce((total, file) => total + file.usedSlots, 0),
      segments: entity.segments.flatMap(file => file.segments.map(s => ({ x: s.x, y: s.y, z: s.z, blockCount: s.blockCount, version: s.version, lastChanged: s.lastChanged?.toString(), blocks: s.blocks }))),
      controllers: entity.logic?.controllers ?? [],
      displayTexts: starMadeDisplayTextsFromManager(entity.meta?.manager),
      docking: parent ? { mode: transform?.mode ?? 'unknown', parentConnector: connector(request?.rail?.position), childConnector: connector(request?.docked?.position), rawRailRequest: request } : null
    };
    nodes.push(node);
    entity.children.forEach((child, index) => visit(child, `${id}/${index}`, node, entity));
  };
  visit(root, rootId); return nodes;
}
/** Select an entity together with arbitrarily deep sub-dockings. */
export function inspectionSubtree(document: InspectionDocument, entityId: string): ReadonlySet<string> {
  if (!document.entity(entityId)) throw new Error('Unknown entity');
  const result = new Set([entityId]); const pending = [entityId];
  while (pending.length) {
    const parent = pending.pop()!;
    for (const entity of document.entities) if (entity.parentId === parent) { result.add(entity.id); pending.push(entity.id); }
  }
  return result;
}
export function inspectEntityHierarchy(document: InspectionDocument) {
  return document.entities.map(entity => {
    let depth = 0; let parent = document.entity(entity.parentId!);
    while (parent) { depth++; parent = document.entity(parent.parentId!); }
    const subtree = inspectionSubtree(document, entity.id);
    return { id: entity.id, parentId: entity.parentId, depth, blockCount: entity.blocks.length,
      subtreeBlockCount: document.query(b => subtree.has(b.ref.entityId)).length,
      children: document.entities.filter(child => child.parentId === entity.id).map(child => child.id) };
  });
}

/** Build an inspection snapshot using saved rail poses. Unsupported/missing poses are explicit diagnostics. */
export function inspectionDocumentFromBlueprint(nodes: readonly InspectionBlueprintNode[], definitions: ReadonlyMap<number, { readonly blockStyle: number }>, documentId: string) {
  const diagnostics: { entityId: string; code: 'attachment-offset-fallback'; message: string }[] = [];
  const entities = nodes.map(node => {
    let transform = new Matrix4().makeTranslation(...node.localOffset);
    if (node.parentId) {
      const request = node.docking?.rawRailRequest;
      try {
        if (!request?.rail || !request.docked || !request.railTransform || !request.dockedTransform ||
          request.rail.type === undefined || request.rail.orientation === undefined || request.docked.type === undefined || request.docked.orientation === undefined) throw new Error('Incomplete saved rail pose');
        const rail = definitions.get(request.rail.type), docked = definitions.get(request.docked.type);
        if (!rail || !docked) throw new Error('Unknown connector definition');
        transform = resolveStarMadeRailPose({ rail: { ...request.rail, type: request.rail.type, orientation: request.rail.orientation }, docked: { ...request.docked, type: request.docked.type, orientation: request.docked.orientation }, railTransform: request.railTransform, dockedTransform: request.dockedTransform }, rail.blockStyle, docked.blockStyle);
      } catch (error) {
        diagnostics.push({ entityId: node.id, code: 'attachment-offset-fallback', message: String(error) });
      }
    }
    return { id: node.id, parentId: node.parentId, transform: transform.toArray(), blocks: blocksFromSegments(node.segments) };
  });
  return { document: new InspectionDocument(documentId, 0, entities), diagnostics };
}
