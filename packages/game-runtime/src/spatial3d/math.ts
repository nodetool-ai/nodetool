import type { GameTransform3D, GameQuaternion3D, GameVector3 } from "@nodetool-ai/protocol";

export const ZERO3: GameVector3 = { x: 0, y: 0, z: 0 };
export const IDENTITY3: GameQuaternion3D = [0, 0, 0, 1];

export function add3(a: GameVector3, b: GameVector3): GameVector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale3(a: GameVector3, amount: number): GameVector3 {
  return { x: a.x * amount, y: a.y * amount, z: a.z * amount };
}

export function rotate3(v: GameVector3, q: GameQuaternion3D): GameVector3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return { x: v.x + w * tx + y * tz - z * ty, y: v.y + w * ty + z * tx - x * tz, z: v.z + w * tz + x * ty - y * tx };
}

export function multiplyQuaternion(a: GameQuaternion3D, b: GameQuaternion3D): GameQuaternion3D {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}

export function compose3(parent: GameTransform3D, local: GameTransform3D): GameTransform3D {
  const scaled = { x: local.position.x * parent.scale.x, y: local.position.y * parent.scale.y, z: local.position.z * parent.scale.z };
  return { position: add3(parent.position, rotate3(scaled, parent.rotation)), rotation: multiplyQuaternion(parent.rotation, local.rotation),
    scale: { x: parent.scale.x * local.scale.x, y: parent.scale.y * local.scale.y, z: parent.scale.z * local.scale.z } };
}

export function quaternionObject(q: GameQuaternion3D): { x: number; y: number; z: number; w: number } {
  return { x: q[0], y: q[1], z: q[2], w: q[3] };
}

export function quaternionArray(q: { x: number; y: number; z: number; w: number }): GameQuaternion3D {
  return [q.x, q.y, q.z, q.w];
}

export function approach(current: number, desired: number, delta: number): number {
  return current < desired ? Math.min(desired, current + delta) : Math.max(desired, current - delta);
}

export function quantizeSpatial3D(value: number): number {
  return Math.round(value * 1e12) / 1e12;
}
