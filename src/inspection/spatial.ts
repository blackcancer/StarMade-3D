import { Box3, Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { InspectionDocument, type BlockPosition, type BlockReference, type ResolvedBlock } from './model.js';

export function entityWorldMatrix(document: InspectionDocument, entityId: string): Matrix4 {
  let entity = document.entity(entityId);
  if (!entity) throw new Error('Unknown entity');
  const result = new Matrix4();
  while (entity) {
    result.premultiply(new Matrix4().fromArray(entity.transform!));
    entity = document.entity(entity.parentId!);
  }
  return result;
}
/** null denotes scene space; never rounds points into a block implicitly. */
export function convertInspectionPoint(document: InspectionDocument, point: BlockPosition, from: string | null, to: string | null): BlockPosition {
  const world = from === null ? new Matrix4() : entityWorldMatrix(document, from);
  const destination = to === null ? new Matrix4() : entityWorldMatrix(document, to);
  if (destination.determinant() === 0) throw new Error('Singular destination transform');
  return new Vector3(...point).applyMatrix4(world).applyMatrix4(destination.invert()).toArray() as [number, number, number];
}
/** Cell occupancy bounds, not visual geometry or collision bounds. */
export function inspectionBounds(document: InspectionDocument, blocks: readonly ResolvedBlock[] = document.query()): Box3 {
  const result = new Box3();
  for (const block of blocks) {
    const centre = new Vector3(...block.ref.position);
    const box = new Box3(centre.clone().addScalar(-0.5), centre.clone().addScalar(0.5));
    result.union(box.applyMatrix4(entityWorldMatrix(document, block.ref.entityId)));
  }
  return result;
}
export interface InspectionFilter {
  readonly entities?: ReadonlySet<string>;
  readonly cells?: ReadonlySet<string>;
  /** Inclusive local block-centre range; arbitrary combinations implement layers and XYZ cuts. */
  readonly min?: BlockPosition;
  readonly max?: BlockPosition;
}
export function inspectionPredicate(filter: InspectionFilter): (block: ResolvedBlock) => boolean {
  return block => (!filter.entities || filter.entities.has(block.ref.entityId)) &&
    (!filter.cells || filter.cells.has(JSON.stringify([block.ref.entityId, ...block.ref.position]))) &&
    (!filter.min || block.ref.position.every((v, i) => v >= filter.min![i])) &&
    (!filter.max || block.ref.position.every((v, i) => v <= filter.max![i]));
}
export function measureBlockCentres(document: InspectionDocument, a: BlockReference, b: BlockReference): number {
  if (!document.resolve(a) || !document.resolve(b)) throw new Error('Missing measurement block');
  const start = convertInspectionPoint(document, a.position, a.entityId, null);
  const end = convertInspectionPoint(document, b.position, b.entityId, null);
  return new Vector3(...start).distanceTo(new Vector3(...end));
}
/** Optional camera helper; direction is from target toward camera. Returns the host controls target. */
export function frameInspectionBounds(camera: PerspectiveCamera | OrthographicCamera, bounds: Box3, direction = new Vector3(1, 1, 1), padding = 1.2): Vector3 {
  if (bounds.isEmpty() || !Number.isFinite(padding) || padding < 1 || direction.lengthSq() === 0) throw new Error('Invalid framing bounds/direction/padding');
  const target = bounds.getCenter(new Vector3());
  const radius = Math.max(bounds.getSize(new Vector3()).length() * 0.5, 0.001) * padding;
  let distance: number;
  if (camera instanceof PerspectiveCamera) {
    const vertical = camera.getEffectiveFOV() * Math.PI / 360;
    const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
    distance = radius / Math.sin(halfAngle);
  } else {
    const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
    const halfHeight = radius / Math.min(1, aspect);
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.right = halfHeight * aspect; camera.left = -camera.right;
    camera.zoom = 1;
    distance = radius * 2;
  }
  camera.position.copy(target).addScaledVector(direction.clone().normalize(), distance);
  camera.near = Math.max(0.001, distance - radius * 1.1);
  camera.far = distance + radius * 1.1;
  camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return target;
}
