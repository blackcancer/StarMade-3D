import type { BufferGeometry } from 'three';
import { createStarMadeEncodedSegmentGeometryBatches, type StarMadeEncodedSegmentGeometryOptions } from '../geometry/segment.js';
import { segmentBlockPosition } from '../starmade/segmentData.js';
import { InspectionDocument, segmentsFromBlocks, type BlockPosition, type ResolvedBlock } from './model.js';
import type { InspectionFaceHit } from './picking.js';

/** Rebuild native cube/slab/wedge geometry from the filtered logical occupancy, restoring cut faces. */
export function buildInspectionSegments(document: InspectionDocument, entityId: string, predicate: (block: ResolvedBlock) => boolean = () => true,
  options: Omit<StarMadeEncodedSegmentGeometryOptions, 'segment' | 'neighborSegments' | 'pass' | 'isFaceVisible'> = {}) {
  const entity = document.entity(entityId);
  if (!entity) throw new Error('Unknown entity');
  const segments = segmentsFromBlocks(entity.blocks.filter(b => predicate({ ref: { entityId, position: b.position }, state: b.state })));
  const built: { origin: BlockPosition; batches: ReturnType<typeof createStarMadeEncodedSegmentGeometryBatches> }[] = [];
  try {
    for (const segment of segments) built.push({ origin: [segment.x, segment.y, segment.z], batches: createStarMadeEncodedSegmentGeometryBatches({ ...options, segment, neighborSegments: segments }) });
  } catch (error) {
    for (const entry of built) { entry.batches.opaque.dispose(); entry.batches.blended.dispose(); }
    throw error;
  }
  return built;
}
/** Exact native packed block index; never infer a slab/wedge cell by rounding a triangle centroid. */
export function inspectionSegmentTriangles(geometry: BufferGeometry, entityId: string, origin: BlockPosition): InspectionFaceHit[] {
  const encoded = geometry.getAttribute('ivert'); const indices = geometry.getIndex();
  if (!encoded || !indices) throw new Error('Expected indexed StarMade encoded geometry');
  const sides: number[] = geometry.userData.starMadeFaceSourceSides;
  const result: InspectionFaceHit[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const vertex = indices.getX(i);
    const p = segmentBlockPosition(encoded.getX(vertex) & 32767);
    result.push({ ref: { entityId, position: [origin[0] + p.x - 16, origin[1] + p.y - 16, origin[2] + p.z - 16] }, face: sides[Math.floor(vertex / 4)] });
  }
  return result;
}
