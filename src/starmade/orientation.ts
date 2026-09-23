import { MathUtils, Quaternion, Vector3 } from "three";

enum Side {
  Front = "front",
  Back = "back",
  Top = "top",
  Bottom = "bottom",
  Right = "right",
  Left = "left"
}

const sideVectors: Record<Side, Vector3> = {
  [Side.Front]: new Vector3(0, 0, 1),
  [Side.Back]: new Vector3(0, 0, -1),
  [Side.Top]: new Vector3(0, 1, 0),
  [Side.Bottom]: new Vector3(0, -1, 0),
  [Side.Right]: new Vector3(1, 0, 0),
  [Side.Left]: new Vector3(-1, 0, 0)
};

const normal24Orientations = [
  [Side.Front, Side.Bottom],
  [Side.Front, Side.Left],
  [Side.Front, Side.Top],
  [Side.Front, Side.Right],
  [Side.Back, Side.Bottom],
  [Side.Back, Side.Left],
  [Side.Back, Side.Top],
  [Side.Back, Side.Right],
  [Side.Bottom, Side.Back],
  [Side.Bottom, Side.Left],
  [Side.Bottom, Side.Front],
  [Side.Bottom, Side.Right],
  [Side.Top, Side.Back],
  [Side.Top, Side.Left],
  [Side.Top, Side.Front],
  [Side.Top, Side.Right],
  [Side.Right, Side.Front],
  [Side.Right, Side.Top],
  [Side.Right, Side.Back],
  [Side.Right, Side.Bottom],
  [Side.Left, Side.Front],
  [Side.Left, Side.Top],
  [Side.Left, Side.Back],
  [Side.Left, Side.Bottom]
] as const satisfies ReadonlyArray<readonly [Side, Side]>;

const spriteLodNormal24Indices = [
  0,
  4,
  8,
  12,
  16,
  20
] as const;

const oriencubeSecondaryYRotation: Readonly<Record<string, number>> = Object.freeze({
  [`${Side.Front}:${Side.Bottom}`]: 0,
  [`${Side.Front}:${Side.Left}`]: 90,
  [`${Side.Front}:${Side.Top}`]: 180,
  [`${Side.Front}:${Side.Right}`]: 270,
  [`${Side.Back}:${Side.Bottom}`]: 180,
  [`${Side.Back}:${Side.Left}`]: 90,
  [`${Side.Back}:${Side.Top}`]: 0,
  [`${Side.Back}:${Side.Right}`]: 270,
  [`${Side.Bottom}:${Side.Back}`]: 180,
  [`${Side.Bottom}:${Side.Left}`]: 270,
  [`${Side.Bottom}:${Side.Front}`]: 0,
  [`${Side.Bottom}:${Side.Right}`]: 90,
  [`${Side.Top}:${Side.Back}`]: 180,
  [`${Side.Top}:${Side.Left}`]: 90,
  [`${Side.Top}:${Side.Front}`]: 0,
  [`${Side.Top}:${Side.Right}`]: 270,
  [`${Side.Right}:${Side.Front}`]: 0,
  [`${Side.Right}:${Side.Top}`]: 90,
  [`${Side.Right}:${Side.Back}`]: 180,
  [`${Side.Right}:${Side.Bottom}`]: 270,
  [`${Side.Left}:${Side.Front}`]: 0,
  [`${Side.Left}:${Side.Top}`]: 270,
  [`${Side.Left}:${Side.Back}`]: 180,
  [`${Side.Left}:${Side.Bottom}`]: 90
});

const normal24Quaternions = normal24Orientations.map(([primary, secondary]) =>
  makeOriencubeBasicTransformQuaternion(primary, secondary)
);

export function getStarMadeNormal24OrientationQuaternion(orientation = 0): Quaternion {
  return normal24Quaternions[modulo(orientation, normal24Quaternions.length)].clone();
}

export function getStarMadeLodOrientationQuaternion(orientation = 0, blockStyle = 0): Quaternion {
  const lodOrientation = blockStyle === 3
    ? spriteLodNormal24Indices[modulo(orientation, spriteLodNormal24Indices.length)]
    : orientation;

  return getStarMadeNormal24OrientationQuaternion(lodOrientation);
}

function makeOriencubeBasicTransformQuaternion(primary: Side, secondary: Side): Quaternion {
  return getOriencubePrimaryQuaternion(primary).multiply(getOriencubeSecondaryQuaternion(primary, secondary));
}

function getOriencubePrimaryQuaternion(primary: Side): Quaternion {
  switch (primary) {
    case Side.Front:
      return axisQuaternion("x", 90);
    case Side.Back:
      return axisQuaternion("x", -90);
    case Side.Top:
      return new Quaternion();
    case Side.Bottom:
      return axisQuaternion("z", -180);
    case Side.Right:
      return axisQuaternion("z", 90);
    case Side.Left:
      return axisQuaternion("z", -90);
  }
}

function getOriencubeSecondaryQuaternion(primary: Side, secondary: Side): Quaternion {
  // Only the 24 statically listed pairs call this helper; each has an explicit rotation.
  return axisQuaternion("y", oriencubeSecondaryYRotation[`${primary}:${secondary}`]);
}

function axisQuaternion(axis: "x" | "y" | "z", degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(sideVectors[axisSide(axis)], MathUtils.degToRad(degrees));
}

function axisSide(axis: "x" | "y" | "z"): Side {
  if (axis === "x") {
    return Side.Right;
  }

  if (axis === "y") {
    return Side.Top;
  }

  return Side.Front;
}

function modulo(value: number, divisor: number): number {
  return ((Math.trunc(value) % divisor) + divisor) % divisor;
}
