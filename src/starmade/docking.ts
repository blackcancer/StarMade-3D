import { Matrix4, Vector3 } from 'three';
import { getStarMadeNormal24OrientationQuaternion } from './orientation.js';

/** Native row-major named Matrix4f fields (Decoder-compatible). */
export type StarMadeMatrix4f = Readonly<Record<`m${0 | 1 | 2 | 3}${0 | 1 | 2 | 3}`, number>>;
export interface StarMadeDockingPiece {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly type: number;
  readonly orientation: number;
}
export interface StarMadeRailPose {
  readonly rail: StarMadeDockingPiece;
  readonly docked: StarMadeDockingPiece;
  /** RailRequest.turretTransform, called railTransform by Decoder. */
  readonly railTransform: StarMadeMatrix4f;
  /** RailRequest.movedTransform, called dockedTransform by Decoder. */
  readonly dockedTransform: StarMadeMatrix4f;
}
/** Read and validate an affine rigid native transform; no implicit transpose of translation. */
export function starMadeMatrix4f(value: StarMadeMatrix4f): Matrix4 {
  const rows = Array.from({ length: 16 }, (_, i) => value[`m${Math.floor(i / 4)}${i % 4}` as keyof StarMadeMatrix4f]);
  if (!rows.every(Number.isFinite) || rows[12] !== 0 || rows[13] !== 0 || rows[14] !== 0 || rows[15] !== 1) throw new Error('Invalid native affine matrix');
  const matrix = new Matrix4().set(...rows as Parameters<Matrix4['set']>);
  const rotation = matrix.clone().setPosition(0, 0, 0);
  const gram = rotation.clone().transpose().multiply(rotation).elements;
  if (Math.abs(rotation.determinant() - 1) > 1e-4 || gram.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-4)) throw new Error('Expected a rigid native transform');
  return matrix;
}
const directions = [[0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0]] as const;
/** RailRelation.getTrans: NORMAL24 connector frames and core/shipyard anchors. */
export function starMadeDockingConnectorFrame(piece: StarMadeDockingPiece, blockStyle: number, mirrored: boolean): Matrix4 {
  const p = piece.position;
  if (![p.x, p.y, p.z].every(Number.isSafeInteger)) throw new Error('Invalid docking position');
  const position = new Vector3(p.x - 16, p.y - 16, p.z - 16);
  if (piece.type === 1) return new Matrix4().setPosition(position);
  if (blockStyle !== 6) throw new Error('Unsupported docking connector style; expected NORMAL24');
  if (!Number.isInteger(piece.orientation) || piece.orientation < 0 || piece.orientation >= 24) throw new Error('Invalid docking orientation');
  const orientation = mirrored ? piece.orientation ^ 4 : piece.orientation;
  if (!mirrored && piece.type !== 679) position.add(new Vector3(...directions[Math.floor(orientation / 4)]));
  return new Matrix4().makeRotationFromQuaternion(getStarMadeNormal24OrientationQuaternion(orientation)).setPosition(position);
}
/** Static saved pose in the parent entity frame, following RailRelation.getBlockTransform.
 * Does not advance rail movement, run collision tests or change the saved request.
 */
export function resolveStarMadeRailPose(request: StarMadeRailPose, railBlockStyle: number, dockedBlockStyle: number): Matrix4 {
  const moving = starMadeMatrix4f(request.dockedTransform);
  const turret = starMadeMatrix4f(request.railTransform).setPosition(0, 0, 0);
  const to = starMadeDockingConnectorFrame(request.rail, railBlockStyle, false);
  const from = starMadeDockingConnectorFrame(request.docked, dockedBlockStyle, true);
  const toOrigin = new Vector3().setFromMatrixPosition(to);
  const fromOrigin = new Vector3().setFromMatrixPosition(from);
  to.premultiply(moving.clone().setPosition(0, 0, 0)).setPosition(toOrigin);
  from.premultiply(turret.invert()).setPosition(fromOrigin).invert();
  return new Matrix4().setPosition(new Vector3().setFromMatrixPosition(moving)).multiply(to).multiply(from);
}
