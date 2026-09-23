import { Group, Matrix4, type Object3D } from 'three';
import { blockReferenceKey, InspectionDocument, type ResolvedBlock } from './model.js';
import { compareInspectionDocuments } from './analysis.js';
import { entityWorldMatrix } from './spatial.js';
import { InspectionHitIndex, InspectionSelection } from './picking.js';

export interface InspectionVisual {
  /** Cell-centred object, owned by the factory. Materials/textures may be shared. */
  readonly object: Object3D;
  /** Release only resources owned by this visual, including resource-manager handles. */
  dispose(): void;
}
export interface InspectionBuildContext {
  readonly document: InspectionDocument;
  readonly block: ResolvedBlock;
  /** Actual visible logical neighbours; cuts must rebuild faces against this set. */
  readonly visible: ReadonlyMap<string, ResolvedBlock>;
}
export interface InspectionInvalidation {
  readonly geometry: readonly string[];
  readonly transforms: readonly string[];
  /** Conservative scene-wide invalidation; propagation may cross arbitrarily many segments. */
  readonly lighting: boolean;
  readonly bounds: boolean;
}
/** Optional per-cell synchronizer; hosts may use the same document/diff contracts for chunk batching. */
export class InspectionScene {
  readonly root = new Group();
  readonly hits = new InspectionHitIndex();
  readonly selection = new InspectionSelection();
  private visuals = new Map<string, { visual: InspectionVisual; wrapper: Group }>();
  private document?: InspectionDocument;
  private filter: (block: ResolvedBlock) => boolean = () => true;
  private filterDirty = false;
  constructor(private readonly build: (context: InspectionBuildContext) => InspectionVisual) {}
  setFilter(filter: (block: ResolvedBlock) => boolean): void { this.filter = filter; this.filterDirty = true; }
  sync(document: InspectionDocument): InspectionInvalidation {
    const visible = new Map(document.query(this.filter).map(b => [blockReferenceKey(b.ref), b]));
    const dirty = new Set<string>();
    const previous = this.document;
    const diff = previous && compareInspectionDocuments(previous, document);
    const all = !previous || previous.id !== document.id || this.filterDirty;
    if (all) for (const key of visible.keys()) dirty.add(key);
    if (diff) for (const change of diff.blocks) {
      // A shape may touch any of the 26 surrounding cells, not only six axial neighbours.
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const p = change.ref.position;
        dirty.add(blockReferenceKey({ entityId: change.ref.entityId, position: [p[0] + x, p[1] + y, p[2] + z] }));
      }
    }
    const prepared = new Map<string, InspectionVisual>();
    try {
      for (const [key, block] of visible) if (dirty.has(key) || !this.visuals.has(key)) prepared.set(key, this.build({ document, block, visible }));
    } catch (error) {
      for (const visual of prepared.values()) visual.dispose();
      throw error;
    }
    const changed: string[] = [];
    for (const [key, entry] of this.visuals) if (!visible.has(key) || prepared.has(key)) {
      this.hits.unbind(entry.wrapper); this.root.remove(entry.wrapper); entry.visual.dispose(); this.visuals.delete(key); changed.push(key);
    }
    for (const [key, visual] of prepared) {
      const wrapper = new Group(); wrapper.add(visual.object); this.root.add(wrapper);
      this.visuals.set(key, { visual, wrapper });
      if (!changed.includes(key)) changed.push(key);
    }
    const transforms: string[] = [];
    for (const [key, entry] of this.visuals) {
      const block = visible.get(key)!;
      const matrix = entityWorldMatrix(document, block.ref.entityId);
      matrix.multiply(new Matrix4().makeTranslation(...block.ref.position));
      if (!entry.wrapper.matrix.equals(matrix)) transforms.push(key);
      entry.wrapper.matrixAutoUpdate = false; entry.wrapper.matrix.copy(matrix); entry.wrapper.matrixWorldNeedsUpdate = true;
      this.hits.bindBlock(entry.wrapper, document, block.ref);
    }
    if (previous && previous.id !== document.id) this.selection.clear();
    this.selection.reconcile(document); this.root.updateMatrixWorld(true);
    this.document = document; this.filterDirty = false;
    const lighting = all || diff!.blocks.length > 0 || diff!.entities.length > 0;
    return { geometry: changed, transforms, lighting, bounds: lighting };
  }
  /** Overlay factory receives selected cells; avoids mutating shared materials. */
  selectedObjects(): readonly Object3D[] {
    return this.selection.values().flatMap(ref => {
      const visual = this.visuals.get(blockReferenceKey(ref));
      return visual ? [visual.wrapper] : [];
    });
  }
  dispose(): void {
    for (const entry of this.visuals.values()) { this.hits.unbind(entry.wrapper); entry.visual.dispose(); this.root.remove(entry.wrapper); }
    this.visuals.clear(); this.selection.clear(); this.document = undefined;
  }
}
