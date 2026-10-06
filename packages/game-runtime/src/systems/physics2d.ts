import { MAX_GAME_EVENTS_PER_TICK } from "../gameplay/lifecycle.js";
import {
  contactKey,
  obstacleStates,
  gravityScaleOf,
  obstaclesOf,
  canCollideObstacle,
  TOUCH_EPSILON,
  standsOn,
  colliderBox,
  touchingOf,
  solidBelowAhead,
  canCollide,
  sweepAabb,
  overlaps
} from "./collision2d.js";
import type { ContactPair, EntityState, Obstacle } from "./state2d.js";
import type { GameSystemContext2D } from "./context2d.js";
import { faceOf, sweepBox, type Box, type SweepHit } from "../physics.js";
export function stepPhysics2D(context: GameSystemContext2D): void {
  const dt = 1 / context.document.tickRate;
  const motionStarts = new Map(context.states.map((state) => [state.definition.id, { x: state.x, y: state.y }]));
  const currentContacts = new Map<string, ContactPair>();
  const recordContact = (moving: EntityState, other: EntityState, hit: SweepHit): void => {
    const key = contactKey(moving.definition.id, other.definition.id);
    if (!currentContacts.has(key)) {
      if (context.events.length + currentContacts.size >= MAX_GAME_EVENTS_PER_TICK) {
        throw new Error(`Game event limit exceeded (${MAX_GAME_EVENTS_PER_TICK} per tick)`);
      }
      currentContacts.set(key, {
        entityId: moving.definition.id,
        otherId: other.definition.id,
        sensor: Boolean(moving.definition.collider2d?.sensor || other.definition.collider2d?.sensor),
        normalX: hit.normalX,
        normalY: hit.normalY
      });
    }
  };
  const kinematic = context.states.filter((state) => state.active && state.definition.body2d?.type === "kinematic");
  const obstacles = obstacleStates(context);
  const gravity = context.scene.gravity;
  if (gravity) {
    for (const state of kinematic) {
      const scale = gravityScaleOf(context, state);
      state.velocityX += gravity.x * scale * dt;
      state.velocityY += gravity.y * scale * dt;
    }
  }
  const moveBody = (
    state: EntityState,
    dx: number,
    dy: number,
    exclude: EntityState | undefined
  ): {
    blockedX: number;
    blockedY: number;
  } => {
    const collider = state.definition.collider2d;
    const blocked = { blockedX: 0, blockedY: 0 };
    if (!collider) {
      return blocked;
    }
    const halfWidth = collider.width / 2;
    const halfHeight = collider.height / 2;
    let remainingX = dx;
    let remainingY = dy;
    for (let pass = 0; pass < 2 && (remainingX !== 0 || remainingY !== 0); pass += 1) {
      const box = { x: state.x, y: state.y, halfWidth, halfHeight };
      const found: Obstacle[] = [];
      const minX = state.x - halfWidth + Math.min(0, remainingX);
      const maxX = state.x + halfWidth + Math.max(0, remainingX);
      const minY = state.y - halfHeight + Math.min(0, remainingY);
      const maxY = state.y + halfHeight + Math.max(0, remainingY);
      for (const other of obstacles) {
        if (other !== state && other !== exclude) {
          obstaclesOf(other, minX, minY, maxX, maxY, found);
        }
      }
      const hits: {
        obstacle: Obstacle;
        hit: SweepHit;
        blocks: boolean;
      }[] = [];
      for (const obstacle of found) {
        if (!canCollideObstacle(state, obstacle)) {
          continue;
        }
        const hit = sweepBox(box, obstacle.box, remainingX, remainingY, obstacle.sensor || collider.sensor);
        if (!hit) {
          continue;
        }
        const blocks = obstacle.solid && !obstacle.sensor && !collider.sensor;
        if (blocks) {
          // A face shared with a neighboring tile is inside the wall, so it never stops a body.
          if ((obstacle.internal & faceOf(hit)) !== 0) {
            continue;
          }
          // A one-way solid stops only a body that falls onto its top from above.
          if (obstacle.oneWay && !(hit.normalY > 0 && state.y - halfHeight >= obstacle.box.y + obstacle.box.halfHeight - TOUCH_EPSILON)) {
            continue;
          }
        }
        hits.push({ obstacle, hit, blocks });
      }
      hits.sort(
        (a, b) =>
          a.hit.time - b.hit.time ||
          (a.obstacle.owner.definition.id < b.obstacle.owner.definition.id
            ? -1
            : a.obstacle.owner.definition.id > b.obstacle.owner.definition.id
              ? 1
              : 0)
      );
      const solid = hits.find((item) => item.blocks);
      const travel = solid?.hit.time ?? 1;
      for (const { obstacle, hit, blocks } of hits) {
        if (hit.time > travel) {
          break;
        }
        if (!blocks || obstacle === solid?.obstacle) {
          recordContact(state, obstacle.owner, hit);
        }
      }
      state.x += remainingX * travel;
      state.y += remainingY * travel;
      if (!solid) {
        break;
      }
      if (solid.hit.normalX !== 0) {
        blocked.blockedX = solid.hit.normalX;
      }
      if (solid.hit.normalY !== 0) {
        blocked.blockedY = solid.hit.normalY;
      }
      remainingX = solid.hit.normalX === 0 ? remainingX * (1 - travel) : 0;
      remainingY = solid.hit.normalY === 0 ? remainingY * (1 - travel) : 0;
    }
    return blocked;
  };
  // Static bodies with a velocity are moving solids. They move first and carry the bodies that
  // stand on them; a body in the way is pushed out along the motion.
  const carries = new Map<
    EntityState,
    {
      dx: number;
      dy: number;
      platform: EntityState;
    }
  >();
  for (const platform of context.states) {
    if (!platform.active || platform.definition.body2d?.type !== "static" || (platform.velocityX === 0 && platform.velocityY === 0)) {
      continue;
    }
    const dx = platform.velocityX * dt;
    const dy = platform.velocityY * dt;
    const riders = kinematic.filter((body) => !carries.has(body) && standsOn(context, body, platform));
    platform.x += dx;
    platform.y += dy;
    for (const rider of riders) {
      carries.set(rider, { dx, dy, platform });
    }
    for (const body of kinematic) {
      const box = colliderBox(body);
      if (!box || carries.get(body)?.platform === platform || body.definition.collider2d?.sensor) {
        continue;
      }
      const found: Obstacle[] = [];
      obstaclesOf(
        platform,
        body.x - box.halfWidth + Math.min(0, dx),
        body.y - box.halfHeight + Math.min(0, dy),
        body.x + box.halfWidth + Math.max(0, dx),
        body.y + box.halfHeight + Math.max(0, dy),
        found
      );
      for (const obstacle of found) {
        if (!obstacle.solid || obstacle.sensor || obstacle.oneWay || !canCollideObstacle(body, obstacle)) {
          continue;
        }
        const o = obstacle.box;
        // Sweep relative to the platform's starting position, then push through the regular
        // collision solver so a platform cannot teleport its passenger through another wall.
        const hit = sweepBox(box, { ...o, x: o.x - dx, y: o.y - dy }, -dx, -dy, false);
        if (!hit || (obstacle.internal & faceOf(hit)) !== 0) {
          continue;
        }
        recordContact(body, platform, hit);
        // An earlier tile can already have pushed the body beyond this face.
        const pushX = hit.normalX * Math.max(0, (o.x - body.x) * hit.normalX + o.halfWidth + box.halfWidth);
        const pushY = hit.normalY * Math.max(0, (o.y - body.y) * hit.normalY + o.halfHeight + box.halfHeight);
        moveBody(body, pushX, pushY, platform);
      }
    }
  }
  for (const state of kinematic) {
    if (!state.definition.collider2d) {
      state.x += state.velocityX * dt;
      state.y += state.velocityY * dt;
      continue;
    }
    const carry = carries.get(state);
    if (carry) {
      moveBody(state, carry.dx, carry.dy, carry.platform);
    }
    const { blockedX, blockedY } = moveBody(state, state.velocityX * dt, state.velocityY * dt, undefined);
    // A blocked body loses the velocity that pushed into the solid, so gravity cannot build up while resting.
    if (blockedX * state.velocityX < 0) {
      state.velocityX = 0;
    }
    if (blockedY * state.velocityY < 0) {
      state.velocityY = 0;
    }
    const patrol = state.definition.behaviors.find((behavior) => behavior.kind === "patrol");
    if (patrol?.kind === "patrol" && patrol.axis === "x") {
      const direction = state.patrolDirection ?? 1;
      const ledge = patrol.turnAtLedges && touchingOf(context, state).down && !solidBelowAhead(context, state, direction);
      if (blockedX === -direction || ledge) {
        state.patrolDirection = direction === 1 ? -1 : 1;
      }
    }
  }
  for (let index = 0; index < context.states.length; index += 1) {
    const state = context.states[index];
    if (!state.active || state.definition.body2d?.type !== "kinematic") {
      continue;
    }
    for (let otherIndex = index + 1; otherIndex < context.states.length; otherIndex += 1) {
      const other = context.states[otherIndex];
      if (other.definition.body2d?.type !== "kinematic" || !canCollide(state, other)) {
        continue;
      }
      const stateStart = motionStarts.get(state.definition.id);
      const otherStart = motionStarts.get(other.definition.id);
      if (!stateStart || !otherStart) {
        continue;
      }
      const relativeX = state.x - stateStart.x - (other.x - otherStart.x);
      const relativeY = state.y - stateStart.y - (other.y - otherStart.y);
      const atStart = { ...state, x: stateStart.x, y: stateStart.y };
      const targetAtStart = { ...other, x: otherStart.x, y: otherStart.y };
      const hit = sweepAabb(atStart, targetAtStart, relativeX, relativeY);
      if (hit) {
        recordContact(state, other, hit);
      }
    }
  }
  const recordTouch = (state: EntityState, other: EntityState, a: Box, b: Box): void => {
    const horizontalGap = Math.abs(a.x - b.x) - (a.halfWidth + b.halfWidth);
    const verticalGap = Math.abs(a.y - b.y) - (a.halfHeight + b.halfHeight);
    const horizontal = horizontalGap >= verticalGap;
    recordContact(state, other, {
      time: 0,
      normalX: horizontal ? Math.sign(a.x - b.x) : 0,
      normalY: horizontal ? 0 : Math.sign(a.y - b.y)
    });
  };
  for (const state of kinematic) {
    const box = colliderBox(state);
    if (!box) {
      continue;
    }
    for (const other of kinematic) {
      if (state !== other && canCollide(state, other) && overlaps(state, other)) {
        recordTouch(state, other, box, colliderBox(other)!);
      }
    }
    const found: Obstacle[] = [];
    for (const other of obstacles) {
      if (other !== state) {
        obstaclesOf(other, box.x - box.halfWidth, box.y - box.halfHeight, box.x + box.halfWidth, box.y + box.halfHeight, found);
      }
    }
    for (const obstacle of found) {
      if (!canCollideObstacle(state, obstacle)) {
        continue;
      }
      const o = obstacle.box;
      const gapX = Math.abs(box.x - o.x) - (box.halfWidth + o.halfWidth);
      const gapY = Math.abs(box.y - o.y) - (box.halfHeight + o.halfHeight);
      const overlapping = gapX < 0 && gapY < 0;
      const touching = gapX <= 0 && gapY <= 0 && obstacle.solid && !obstacle.sensor;
      if (overlapping || touching) {
        recordTouch(state, obstacle.owner, box, o);
      }
    }
  }
  context.observations = currentContacts;
}
