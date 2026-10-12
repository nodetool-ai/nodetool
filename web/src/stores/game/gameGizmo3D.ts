import { Box3, Matrix4, Plane, Quaternion, Raycaster, Vector3, type Object3D } from "three";
import type { GameTransform3D } from "@nodetool-ai/protocol";

export type GameGizmoMode3D = "translate" | "rotate" | "scale";
export type GameGizmoSpace3D = "world" | "local";
/** `center` turns around the selection centre, `active` around the last selected entity, `individual` around each entity's own origin. */
export const GAME_GIZMO_PIVOTS_3D = ["center", "active", "individual"] as const;
export type GameGizmoPivot3D = (typeof GAME_GIZMO_PIVOTS_3D)[number];
/** Translation in units, rotation in degrees, scale as a factor step. */
export interface GameSnapIncrements3D {
  readonly translate: number;
  readonly rotate: number;
  readonly scale: number;
}

export function gameTransformMatrix3D(transform: GameTransform3D): Matrix4 {
  return new Matrix4().compose(new Vector3(transform.position.x, transform.position.y, transform.position.z),
    new Quaternion().fromArray(transform.rotation), new Vector3(transform.scale.x, transform.scale.y, transform.scale.z));
}

export function gameTransformFromMatrix3D(matrix: Matrix4): GameTransform3D {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  return { position: { x: position.x, y: position.y, z: position.z }, rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: { x: scale.x, y: scale.y, z: scale.z } };
}

/**
 * The selected ids a group transform moves directly, in selection order. An entity whose ancestor is also selected
 * follows that ancestor, so moving it again would apply the edit twice.
 */
export function gameSelectionRoots3D(ids: readonly string[], parentOf: ReadonlyMap<string, string | undefined>): string[] {
  const selected = new Set(ids);
  return [...selected].filter((id) => {
    const seen = new Set([id]);
    for (let parent = parentOf.get(id); parent !== undefined && !seen.has(parent); parent = parentOf.get(parent)) {
      if (selected.has(parent)) { return false; }
      seen.add(parent);
    }
    return true;
  });
}

/** Each id with every entity below it in the parent hierarchy. A parent cycle stops the walk instead of looping. */
export function gameSelectionWithDescendants3D(ids: readonly string[], parentOf: ReadonlyMap<string, string | undefined>): Set<string> {
  const children = new Map<string, string[]>();
  for (const [id, parent] of parentOf) {
    if (parent === undefined) { continue; }
    const siblings = children.get(parent) ?? [];
    siblings.push(id);
    children.set(parent, siblings);
  }
  const result = new Set(ids);
  const queue = [...result];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const child of children.get(queue[cursor]) ?? []) {
      if (!result.has(child)) { result.add(child); queue.push(child); }
    }
  }
  return result;
}

export interface GameGizmoEntry3D {
  readonly id: string;
  /** World matrix when the gesture started. */
  readonly world: Matrix4;
}

/**
 * The gizmo's start frame. It sits at the selection centre (the mean of the entries' origins), or at the active entity
 * for `active`. It takes the active entity's orientation so local space follows that entity. `activeWorld` is the active
 * entity's world matrix, which may belong to an entity that is not an entry, such as a selected child of a selected
 * parent. Without it the last entry is active. Its scale is one, so a scale drag reads as a factor.
 */
export function gameGizmoPivot3D(entries: readonly GameGizmoEntry3D[], activeWorld: Matrix4 | undefined, pivot: GameGizmoPivot3D): Matrix4 {
  const active = activeWorld ?? entries.at(-1)?.world;
  if (!active || entries.length === 0) { return new Matrix4(); }
  const activePosition = new Vector3();
  const rotation = new Quaternion();
  active.decompose(activePosition, rotation, new Vector3());
  let position = activePosition;
  if (pivot !== "active") {
    position = new Vector3();
    for (const entry of entries) { position.add(new Vector3().setFromMatrixPosition(entry.world)); }
    position.divideScalar(entries.length);
  }
  return new Matrix4().compose(position, rotation, new Vector3(1, 1, 1));
}

/**
 * The world matrix of every entry after the gizmo moved from `start` to `current`. The gizmo's change is read in its
 * own frame and replayed in each entity's frame: the shared pivot frame for `center` and `active`, and for
 * `individual` a frame at the entity's origin, turned like the gizmo in world space and like the entity in local space.
 */
export function gameGroupTransform3D(entries: readonly GameGizmoEntry3D[], start: Matrix4, current: Matrix4,
  pivot: GameGizmoPivot3D, space: GameGizmoSpace3D): Map<string, Matrix4> {
  const change = start.clone().invert().multiply(current);
  const startRotation = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(start));
  const result = new Map<string, Matrix4>();
  for (const entry of entries) {
    let frame = start;
    if (pivot === "individual") {
      const position = new Vector3();
      const rotation = new Quaternion();
      entry.world.decompose(position, rotation, new Vector3());
      frame = new Matrix4().compose(position, space === "local" ? rotation : startRotation, new Vector3(1, 1, 1));
    }
    result.set(entry.id, frame.clone().multiply(change).multiply(frame.clone().invert()).multiply(entry.world));
  }
  return result;
}

/** A world matrix expressed relative to the parent's world matrix, as the document stores it. */
export function gameLocalTransform3D(world: Matrix4, parentWorld: Matrix4 | null): GameTransform3D {
  return gameTransformFromMatrix3D(parentWorld ? parentWorld.clone().invert().multiply(world) : world);
}

/** Rounds to the nearest multiple of `increment`. A non-positive increment leaves the value unchanged. */
export function gameSnapValue3D(value: number, increment: number): number {
  if (!(increment > 0)) { return value; }
  const snapped = Math.round(value / increment) * increment;
  // Remove floating-point residue such as 0.30000000000000004 so stored documents stay readable.
  return Number(snapped.toFixed(10));
}

/** The values passed to the gizmo's translation, rotation (radians) and scale snapping, or null when snapping is off. */
export function gameGizmoSnaps3D(enabled: boolean, increments: GameSnapIncrements3D): {
  readonly translate: number | null; readonly rotate: number | null; readonly scale: number | null;
} {
  if (!enabled) { return { translate: null, rotate: null, scale: null }; }
  return { translate: increments.translate, rotate: increments.rotate * Math.PI / 180, scale: increments.scale };
}

/** The first point on `objects` the ray meets, else where it meets the ground plane, else null. */
export function gameSurfaceHit3D(raycaster: Raycaster, objects: readonly Object3D[], groundY = 0): Vector3 | null {
  const hit = raycaster.intersectObjects([...objects], true)[0];
  if (hit) { return hit.point.clone(); }
  return raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -groundY), new Vector3());
}

/**
 * How far to move a selection vertically so its lowest point rests on the surface below its centre. The ray starts at
 * the bounds' centre, so a selection sunk into a surface is lifted onto it. Without a surface below, the ground plane
 * at `groundY` is used.
 */
export function gameGroundOffset3D(bounds: Box3, objects: readonly Object3D[], groundY = 0): number {
  if (bounds.isEmpty()) { return 0; }
  const origin = bounds.getCenter(new Vector3());
  const raycaster = new Raycaster(origin, new Vector3(0, -1, 0));
  const hit = raycaster.intersectObjects([...objects], true)[0];
  return (hit ? hit.point.y : groundY) - bounds.min.y;
}

export type GameAxisView3D = "right" | "left" | "top" | "bottom" | "front" | "back";
const AXIS_VIEW_DIRECTIONS: Readonly<Record<GameAxisView3D, readonly [number, number, number]>> = {
  right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0], front: [0, 0, 1], back: [0, 0, -1]
};

/**
 * The camera position that looks at `target` along an axis from `distance` away. Top and bottom views lean a hair
 * toward +Z so the orbit camera keeps +X to the right and a defined up direction.
 */
export function gameAxisViewPosition3D(view: GameAxisView3D, target: Vector3, distance: number): Vector3 {
  const [x, y, z] = AXIS_VIEW_DIRECTIONS[view];
  const direction = new Vector3(x, y, y === 0 ? z : 1e-4).normalize();
  return target.clone().addScaledVector(direction, distance);
}
