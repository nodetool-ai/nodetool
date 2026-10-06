import type { GameScriptTouching } from "../scripts.js";
import { FACE_LEFT, FACE_RIGHT, queryTiles, sweepBox, tileCollision, type Box, type SweepHit } from "../physics.js";
import type { EntityState, Obstacle } from "./state2d.js";
import type { GameSystemContext2D } from "./context2d.js";
type CollisionContext2D = Readonly<Pick<GameSystemContext2D, "scene" | "states">>;
export const TOUCH_EPSILON = 1e-3;
const RIDE_EPSILON = 0.02;
export function overlaps(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  if (!ac || !bc || !a.active || !b.active) {
    return false;
  }
  return Math.abs(a.x - b.x) * 2 < ac.width + bc.width && Math.abs(a.y - b.y) * 2 < ac.height + bc.height;
}
export function contactKey(a: string, b: string): string {
  return a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]);
}
export function canCollide(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  return Boolean(
    ac &&
    bc &&
    a.active &&
    b.active &&
    ((ac.mask ?? 0xffffffff) & (bc.category ?? 1)) !== 0 &&
    ((bc.mask ?? 0xffffffff) & (ac.category ?? 1)) !== 0
  );
}
export function colliderBox(state: EntityState): Box | undefined {
  const collider = state.definition.collider2d;
  return collider ? { x: state.x, y: state.y, halfWidth: collider.width / 2, halfHeight: collider.height / 2 } : undefined;
}
/** Sweep one entity's collider through a displacement against another entity's collider. */
export function sweepAabb(moving: EntityState, other: EntityState, dx: number, dy: number): SweepHit | undefined {
  const a = colliderBox(moving);
  const b = colliderBox(other);
  if (!a || !b) {
    return undefined;
  }
  return sweepBox(a, b, dx, dy, Boolean(moving.definition.collider2d?.sensor || other.definition.collider2d?.sensor));
}
/** A box that kinematic bodies test against: a non-kinematic collider or one solid tile. */
export function obstaclesOf(state: EntityState, minX: number, minY: number, maxX: number, maxY: number, into: Obstacle[]): void {
  const entity = state.definition;
  const collider = entity.collider2d;
  if (
    collider &&
    Math.abs(state.x - (minX + maxX) / 2) * 2 <= maxX - minX + collider.width &&
    Math.abs(state.y - (minY + maxY) / 2) * 2 <= maxY - minY + collider.height
  ) {
    into.push({
      owner: state,
      box: { x: state.x, y: state.y, halfWidth: collider.width / 2, halfHeight: collider.height / 2 },
      solid: entity.body2d?.type === "static",
      sensor: collider.sensor,
      oneWay: collider.oneWay ?? false,
      internal: 0,
      category: collider.category ?? 1,
      mask: collider.mask ?? 0xffffffff
    });
  }
  const tilemap = entity.tilemap;
  if (tilemap && tilemap.tiles.length > 0) {
    for (const tile of queryTiles(tileCollision(tilemap), minX - state.x, minY - state.y, maxX - state.x, maxY - state.y)) {
      into.push({
        owner: state,
        box: { x: state.x + tile.x, y: state.y + tile.y, halfWidth: tile.halfWidth, halfHeight: tile.halfHeight },
        solid: true,
        sensor: false,
        oneWay: tile.oneWay,
        internal: tile.internal,
        category: tilemap.category ?? 1,
        mask: tilemap.mask ?? 0xffffffff
      });
    }
  }
}
export function canCollideObstacle(state: EntityState, obstacle: Obstacle): boolean {
  const collider = state.definition.collider2d;
  return Boolean(
    collider &&
    obstacle.owner.active &&
    obstacle.owner !== state &&
    ((collider.mask ?? 0xffffffff) & obstacle.category) !== 0 &&
    (obstacle.mask & (collider.category ?? 1)) !== 0
  );
}
export function gravityScaleOf(context: CollisionContext2D, state: EntityState): number {
  return context.scene.gravity && state.definition.body2d?.type === "kinematic" ? (state.definition.body2d.gravityScale ?? 1) : 0;
}
export function obstacleStates(context: CollisionContext2D): EntityState[] {
  return context.states.filter(
    (state) =>
      state.active &&
      state.definition.body2d?.type !== "kinematic" &&
      (state.definition.collider2d !== undefined || (state.definition.tilemap?.tiles.length ?? 0) > 0)
  );
}
/** Solid obstacles that could block this body, near its collider grown by a margin. */
export function solidsNear(context: CollisionContext2D, state: EntityState, margin: number, only?: EntityState): Obstacle[] {
  const box = colliderBox(state);
  if (!box || (box && state.definition.collider2d?.sensor)) {
    return [];
  }
  const found: Obstacle[] = [];
  for (const other of only ? [only] : obstacleStates(context)) {
    if (other !== state) {
      obstaclesOf(
        other,
        box.x - box.halfWidth - margin,
        box.y - box.halfHeight - margin,
        box.x + box.halfWidth + margin,
        box.y + box.halfHeight + margin,
        found
      );
    }
  }
  return found.filter((obstacle) => obstacle.solid && !obstacle.sensor && canCollideObstacle(state, obstacle));
}
/** Sides of the collider that rest against a solid. A one-way solid supports only from below. */
export function touchingOf(context: CollisionContext2D, state: EntityState): GameScriptTouching {
  const box = colliderBox(state);
  const touching = { down: false, up: false, left: false, right: false };
  if (!box) {
    return touching;
  }
  for (const obstacle of solidsNear(context, state, TOUCH_EPSILON)) {
    const o = obstacle.box;
    const overlapX = Math.min(box.x + box.halfWidth, o.x + o.halfWidth) - Math.max(box.x - box.halfWidth, o.x - o.halfWidth);
    const overlapY = Math.min(box.y + box.halfHeight, o.y + o.halfHeight) - Math.max(box.y - box.halfHeight, o.y - o.halfHeight);
    if (overlapX > TOUCH_EPSILON && Math.abs(box.y - box.halfHeight - (o.y + o.halfHeight)) <= TOUCH_EPSILON) {
      touching.down = true;
    }
    if (obstacle.oneWay) {
      continue;
    }
    if (overlapX > TOUCH_EPSILON && Math.abs(box.y + box.halfHeight - (o.y - o.halfHeight)) <= TOUCH_EPSILON) {
      touching.up = true;
    }
    if (
      overlapY > TOUCH_EPSILON &&
      (obstacle.internal & FACE_RIGHT) === 0 &&
      Math.abs(box.x - box.halfWidth - (o.x + o.halfWidth)) <= TOUCH_EPSILON
    ) {
      touching.left = true;
    }
    if (
      overlapY > TOUCH_EPSILON &&
      (obstacle.internal & FACE_LEFT) === 0 &&
      Math.abs(box.x + box.halfWidth - (o.x - o.halfWidth)) <= TOUCH_EPSILON
    ) {
      touching.right = true;
    }
  }
  return touching;
}
/** Whether the body rests on top of one of the platform's solids. */
export function standsOn(context: CollisionContext2D, body: EntityState, platform: EntityState): boolean {
  const box = colliderBox(body);
  if (!box) {
    return false;
  }
  return solidsNear(context, body, RIDE_EPSILON, platform).some(
    ({ box: o }) =>
      Math.min(box.x + box.halfWidth, o.x + o.halfWidth) - Math.max(box.x - box.halfWidth, o.x - o.halfWidth) > TOUCH_EPSILON &&
      Math.abs(box.y - box.halfHeight - (o.y + o.halfHeight)) <= RIDE_EPSILON
  );
}
/** Whether ground continues just past the body's leading edge. */
export function solidBelowAhead(context: CollisionContext2D, state: EntityState, direction: number): boolean {
  const box = colliderBox(state);
  if (!box) {
    return false;
  }
  const probeX = state.x + direction * (box.halfWidth + 0.05);
  const probeY = state.y - box.halfHeight - 0.1;
  return solidsNear(context, state, 0.3).some(
    ({ box: o }) => Math.abs(probeX - o.x) <= o.halfWidth && Math.abs(probeY - o.y) <= o.halfHeight
  );
}
