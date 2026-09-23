import { Box3, Box3Helper, Group, Matrix4, Vector3 } from 'three';
import { InspectionDocument, type BlockReference } from './model.js';
import { entityWorldMatrix } from './spatial.js';

/** Non-destructive selection overlay of occupied cells (not collision or exact LOD silhouettes). */
export function createInspectionHighlight(document: InspectionDocument, refs: readonly BlockReference[], color = 0x44eeff) {
  const root = new Group(); const helpers: Box3Helper[] = [];
  for (const ref of refs) {
    if (!document.resolve(ref)) continue;
    const helper = new Box3Helper(new Box3(new Vector3(-0.505, -0.505, -0.505), new Vector3(0.505, 0.505, 0.505)), color);
    const transform = new Group(); transform.matrixAutoUpdate = false;
    transform.matrix.copy(entityWorldMatrix(document, ref.entityId).multiply(new Matrix4().makeTranslation(...ref.position)));
    transform.add(helper); root.add(transform); helpers.push(helper);
  }
  let disposed = false;
  return { root, dispose() {
    if (disposed) return;
    disposed = true;
    for (const helper of helpers) { helper.geometry.dispose(); (helper.material as LineBasicMaterial).dispose(); }
    root.clear(); root.removeFromParent();
  } };
}

import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';
import { inspectRelations, type InspectionRelation } from './analysis.js';
import { convertInspectionPoint } from './spatial.js';
/** Display only explicit controller/member edges, using each entity's complete transform. */
export function createInspectionRelationOverlay(document: InspectionDocument, relations: readonly InspectionRelation[], color = 0xffcc55) {
  const result = inspectRelations(document, relations);
  const positions = result.relations.flatMap(relation => [
    ...convertInspectionPoint(document, relation.from.position, relation.from.entityId, null),
    ...convertInspectionPoint(document, relation.to.position, relation.to.entityId, null)
  ]);
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({ color }); const root = new LineSegments(geometry, material);
  let disposed = false;
  return { root, diagnostics: result.diagnostics, dispose() {
    if (disposed) return; disposed = true;
    root.removeFromParent(); geometry.dispose(); material.dispose();
  } };
}
