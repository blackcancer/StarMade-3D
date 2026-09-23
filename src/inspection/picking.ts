import { Vector3, type Intersection, type Object3D } from 'three';
import { blockReferenceKey, InspectionDocument, type BlockReference, type ResolvedBlock } from './model.js';

export interface InspectionFaceHit { readonly ref: BlockReference; readonly face: number | null }
export interface InspectionHit extends ResolvedBlock {
  readonly documentId: string;
  readonly revision: number;
  readonly face: number | null;
  readonly point: Vector3;
  readonly space: 'scene';
}
type Binding = { document: InspectionDocument; resolve: (hit: Intersection) => InspectionFaceHit | undefined };
/** Temporary mesh/triangle/instance lookup. Re-register rebuilt geometry; stale snapshots never resolve. */
export class InspectionHitIndex {
  private readonly bindings = new WeakMap<Object3D, Binding>();
  bind(object: Object3D, document: InspectionDocument, resolve: Binding['resolve']): void {
    this.bindings.set(object, { document, resolve });
  }
  bindBlock(object: Object3D, document: InspectionDocument, ref: BlockReference): void {
    this.bind(object, document, () => ({ ref, face: null }));
  }
  bindTriangles(object: Object3D, document: InspectionDocument, triangles: readonly InspectionFaceHit[]): void {
    const table = triangles.slice();
    this.bind(object, document, hit => hit.faceIndex == null ? undefined : table[hit.faceIndex]);
  }
  bindInstances(object: Object3D, document: InspectionDocument, refs: readonly BlockReference[]): void {
    const table = refs.slice();
    this.bind(object, document, hit => {
      const ref = hit.instanceId === undefined ? undefined : table[hit.instanceId];
      return ref && { ref, face: null };
    });
  }
  unbind(object: Object3D): void { this.bindings.delete(object); }
  resolve(document: InspectionDocument, intersection: Intersection): InspectionHit | undefined {
    let object: Object3D | null = intersection.object;
    while (object) {
      const binding = this.bindings.get(object);
      if (binding) {
        if (binding.document !== document) return undefined;
        const hit = binding.resolve(intersection);
        const block = hit && document.resolve(hit.ref);
        if (!block) return undefined;
        return { ...block, face: hit!.face, documentId: document.id, revision: document.revision, point: intersection.point.clone(), space: 'scene' };
      }
      object = object.parent;
    }
    return undefined;
  }
}

/** Cell selection survives remeshing; reconcile explicitly when adopting another snapshot. */
export class InspectionSelection {
  private readonly refs = new Map<string, BlockReference>();
  set(ref: BlockReference, selected = true): void {
    const key = blockReferenceKey(ref);
    if (selected) this.refs.set(key, Object.freeze({ entityId: ref.entityId, position: Object.freeze([...ref.position]) as BlockReference['position'] }));
    else this.refs.delete(key);
  }
  has(ref: BlockReference): boolean { return this.refs.has(blockReferenceKey(ref)); }
  values(): readonly BlockReference[] { return [...this.refs.values()]; }
  clear(): void { this.refs.clear(); }
  reconcile(document: InspectionDocument): void {
    for (const [key, ref] of this.refs) if (!document.resolve(ref)) this.refs.delete(key);
  }
}
