import type { GameDocument, GameEntity, GameInputFrame, GameScene, GameSnapshot } from "@nodetool-ai/protocol";
import { queryTiles, sweepBox, tileCollision, type Box } from "./physics.js";
import { createScriptedGameSession } from "./session.js";

export const MAX_GAME_ROUTE_TICKS = 18_000;
const MAX_PATH_NODES = 8_192;
const STALL_TICKS = 600;

export interface GameRouteInput extends GameInputFrame {
  readonly ticks: number;
}

export interface GameAutoplayOptions {
  readonly targetPrefix?: string;
  readonly win?: boolean;
  readonly playerId?: string;
  readonly seed?: number;
  readonly maxTicks?: number;
  readonly maxWallTimeMs?: number;
  readonly signal?: AbortSignal;
}

export interface GameLevelStats {
  readonly scenes: number;
  readonly entities: number;
  readonly tiles: number;
  readonly solidTiles: number;
  readonly collectibles: number;
  readonly scripts: number;
  readonly prefabs: number;
}

interface AutoplayObservation {
  readonly route: readonly GameRouteInput[];
  readonly tick: number;
  readonly winTick: number | null;
  readonly reachedTargets: readonly string[];
  readonly levelStats: GameLevelStats;
  readonly snapshot: GameSnapshot;
}

export type GameAutoplayResult = AutoplayObservation & (
  { readonly status: "reached" } |
  { readonly status: "failed"; readonly reason: "unsupported" | "target_not_found" | "steering_stalled" | "tick_budget" | "wall_time_budget" | "path_budget" | "cancelled" | "simulation_error"; readonly message: string }
);

type EntityState = GameSnapshot["entities"][number];
interface Point { readonly x: number; readonly y: number }

export function gameLevelStats(document: GameDocument): GameLevelStats {
  const entities = document.scenes.flatMap((scene) => scene.entities);
  return {
    scenes: document.scenes.length,
    entities: entities.length,
    tiles: entities.reduce((total, entity) => total + (entity.tilemap?.tiles.length ?? 0), 0),
    solidTiles: entities.reduce((total, entity) => total + (entity.tilemap?.tiles.filter((tile) => tile.solid ?? entity.tilemap?.solid ?? false).length ?? 0), 0),
    collectibles: entities.filter((entity) => entity.behaviors.some((behavior) => behavior.kind === "collectible")).length,
    scripts: entities.reduce((total, entity) => total + entity.behaviors.filter((behavior) => behavior.kind === "script").length, 0),
    prefabs: entities.filter((entity) => entity.templateOnly).length
  };
}

interface PlayerControls {
  left: string;
  right: string;
  up?: string;
  down?: string;
  jump?: string;
  speed: number;
}

function controls(document: GameDocument, player: GameEntity): PlayerControls | undefined {
  const movement = player.behaviors.find((behavior) => behavior.kind === "movement");
  if (movement?.kind === "movement") {
    return { ...movement, speed: movement.speed };
  }
  if (!player.behaviors.some((behavior) => behavior.kind === "script") || !document.inputActions.includes("left") || !document.inputActions.includes("right")) {
    return undefined;
  }
  const jump = ["jump", "space", "up"].find((action) => document.inputActions.includes(action));
  const input: PlayerControls = { left: "left", right: "right", speed: 6 };
  if (jump) {
    input.jump = jump;
  }
  if (document.inputActions.includes("up")) {
    input.up = "up";
  }
  if (document.inputActions.includes("down")) {
    input.down = "down";
  }
  return input;
}

function playerOf(document: GameDocument, scene: GameScene, snapshot: GameSnapshot, playerId?: string): GameEntity | undefined {
  const activeIds = new Set(snapshot.entities.filter((state) => state.active).map((state) => state.id));
  const candidates = scene.entities.filter((entity) => entity.body2d?.type === "kinematic" && entity.collider2d && !entity.collider2d.sensor &&
    activeIds.has(entity.id) && controls(document, entity));
  if (playerId) {
    return candidates.find((entity) => entity.id === playerId);
  }
  return candidates.find((entity) => entity.id === "player" || entity.id === "hero") ?? (candidates.length === 1 ? candidates[0] : undefined);
}

function boxOf(entity: GameEntity, state: EntityState): Box {
  return { x: state.x, y: state.y, halfWidth: (entity.collider2d?.width ?? 0) / 2, halfHeight: (entity.collider2d?.height ?? 0) / 2 };
}

function obstacles(scene: GameScene, snapshot: GameSnapshot, player: GameEntity, minX: number, minY: number, maxX: number, maxY: number): Box[] {
  const result: Box[] = [];
  const byId = new Map(snapshot.entities.map((state) => [state.id, state]));
  const collider = player.collider2d;
  for (const entity of scene.entities) {
    const state = byId.get(entity.id);
    if (!state?.active || entity.id === player.id) {
      continue;
    }
    const other = entity.collider2d;
    if (collider && other && entity.body2d?.type === "static" && !other.sensor &&
      (collider.mask & other.category) !== 0 && (other.mask & collider.category) !== 0) {
      result.push(boxOf(entity, state));
    }
    const map = entity.tilemap;
    if (map && collider && (collider.mask & (map.category ?? 1)) !== 0 && ((map.mask ?? 0xffffffff) & collider.category) !== 0) {
      for (const tile of queryTiles(tileCollision(map), minX - state.x, minY - state.y, maxX - state.x, maxY - state.y)) {
        result.push({ ...tile, x: tile.x + state.x, y: tile.y + state.y });
      }
    }
  }
  return result;
}

function blocked(scene: GameScene, snapshot: GameSnapshot, player: GameEntity, from: Box, to: Point): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return obstacles(scene, snapshot, player, Math.min(from.x, to.x) - from.halfWidth, Math.min(from.y, to.y) - from.halfHeight,
    Math.max(from.x, to.x) + from.halfWidth, Math.max(from.y, to.y) + from.halfHeight)
    .some((box) => sweepBox(from, box, dx, dy, false) !== undefined);
}

/** Bounded grid search runs only when a top-down body's direct route is blocked. */
function pathTo(scene: GameScene, snapshot: GameSnapshot, player: GameEntity, state: EntityState, target: Point, shouldStop: () => boolean): Point[] | undefined {
  const start = boxOf(player, state);
  if (!blocked(scene, snapshot, player, start, target)) {
    return [target];
  }
  const size = Math.max(0.25, Math.min(start.halfWidth, start.halfHeight));
  const columns = Math.ceil((target.x - start.x) / size);
  const rows = Math.ceil((target.y - start.y) / size);
  const directions = [{ x: Math.sign(columns) || 1, y: 0 }, { x: 0, y: Math.sign(rows) || 1 },
    { x: -(Math.sign(columns) || 1), y: 0 }, { x: 0, y: -(Math.sign(rows) || 1) }];
  const queue = [{ x: 0, y: 0, parent: -1 }];
  const seen = new Set(["0,0"]);
  for (let head = 0; head < queue.length && queue.length < MAX_PATH_NODES; head += 1) {
    if (head % 64 === 0 && shouldStop()) {
      return undefined;
    }
    const current = queue[head];
    const point = { x: start.x + current.x * size, y: start.y + current.y * size };
    if (Math.hypot(point.x - target.x, point.y - target.y) <= size && !blocked(scene, snapshot, player, { ...start, ...point }, target)) {
      const points = [target];
      let index = head;
      while (index > 0) {
        const node = queue[index];
        points.push({ x: start.x + node.x * size, y: start.y + node.y * size });
        index = node.parent;
      }
      return points.reverse();
    }
    for (const direction of directions) {
      const x = current.x + direction.x;
      const y = current.y + direction.y;
      const key = `${x},${y}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const next = { x: start.x + x * size, y: start.y + y * size };
      if (!blocked(scene, snapshot, player, { ...start, ...point }, next)) {
        if (queue.length >= MAX_PATH_NODES) {
          return undefined;
        }
        queue.push({ x, y, parent: head });
      }
    }
  }
  return undefined;
}

function appendRoute(route: GameRouteInput[], input: GameInputFrame): void {
  const last = route.at(-1);
  if (last && input.justPressed.length === 0 && last.pressed.join("\0") === input.pressed.join("\0")) {
    route[route.length - 1] = { ...last, ticks: last.ticks + 1 };
  } else {
    route.push({ ...input, ticks: 1 });
  }
}

/** Steering verifies only the route it executes. Exhausting a budget does not prove a level impossible. */
export async function autoplayNativeGame(document: GameDocument, options: GameAutoplayOptions = {}): Promise<GameAutoplayResult> {
  if (options.targetPrefix !== undefined && (!options.targetPrefix.trim() || options.win === true)) {
    throw new Error("Choose a nonempty targetPrefix or win, not both");
  }
  const maxTicks = options.maxTicks ?? 7_200;
  const maxWallTimeMs = options.maxWallTimeMs ?? 15_000;
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 1 || maxTicks > MAX_GAME_ROUTE_TICKS) {
    throw new Error(`maxTicks must be between 1 and ${MAX_GAME_ROUTE_TICKS}`);
  }
  if (!Number.isFinite(maxWallTimeMs) || maxWallTimeMs < 1 || maxWallTimeMs > 30_000) {
    throw new Error("maxWallTimeMs must be between 1 and 30000");
  }
  const session = await createScriptedGameSession(document, options.seed ?? 1);
  const route: GameRouteInput[] = [];
  const reached = new Set<string>();
  const levelStats = gameLevelStats(document);
  let snapshot = session.snapshot();
  let winTick: number | null = null;
  let previous: string[] = [];
  let waypoints: Point[] = [];
  let waypointIndex = 0;
  let lastTarget = "";
  let bestDistance = Infinity;
  let progressTick = 0;
  let lastJump = -60;
  const started = Date.now();
  const result = (): AutoplayObservation => ({ route, tick: snapshot.tick, winTick, reachedTargets: [...reached], levelStats, snapshot });
  const fail = (reason: Extract<GameAutoplayResult, { status: "failed" }>["reason"], message: string): GameAutoplayResult => ({ ...result(), status: "failed", reason, message });
  const allTargets = document.scenes.flatMap((scene) => scene.entities).filter((entity) => !entity.templateOnly && entity.collider2d &&
    options.targetPrefix !== undefined && entity.id.startsWith(options.targetPrefix)).map((entity) => entity.id);
  const targetIds = new Set(allTargets);
  const collectibleIds = new Set(document.scenes.flatMap((scene) => scene.entities)
    .filter((entity) => entity.behaviors.some((behavior) => behavior.kind === "collectible")).map((entity) => entity.id));
  const markReached = (id: string): void => {
    if ((options.targetPrefix === undefined ? collectibleIds : targetIds).has(id)) {
      reached.add(id);
    }
  };
  try {
    if (options.targetPrefix !== undefined && allTargets.length === 0) {
      return fail("target_not_found", "No authored collider matches targetPrefix");
    }
    if (targetIds.size !== allTargets.length) {
      return fail("unsupported", "Prefix targets must have unique entity IDs across scenes");
    }
    for (let tick = 0; tick < maxTicks; tick += 1) {
      if (tick % 120 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (options.signal?.aborted) {
        return fail("cancelled", "Autoplay was cancelled");
      }
      if (Date.now() - started >= maxWallTimeMs) {
        return fail("wall_time_budget", "Autoplay reached its wall time budget");
      }
      const scene = document.scenes.find((candidate) => candidate.id === snapshot.sceneId);
      if (!scene) {
        return fail("unsupported", "The active scene is unavailable");
      }
      const player = playerOf(document, scene, snapshot, options.playerId);
      const state = snapshot.entities.find((entity) => entity.id === player?.id && entity.active);
      let pressed: string[] = [];
      if (!player || !state) {
        // A title scene can transition after a standard confirm action.
        if (tick >= 120) {
          return fail("unsupported", "No unambiguous controllable body was found. Supply playerId for a supported body");
        }
        const startAction = ["start", "confirm", "space", "jump", "up"].find((action) => document.inputActions.includes(action));
        if (startAction && tick % 30 === 0) {
          pressed = [startAction];
        }
      } else {
        const input = controls(document, player);
        if (!input) {
          return fail("unsupported", "Player controls are unsupported");
        }
        const definitions = new Map(scene.entities.map((entity) => [entity.id, entity]));
        const targets = snapshot.entities.filter((entity) => entity.active && definitions.get(entity.id)?.collider2d &&
          (options.targetPrefix !== undefined ? targetIds.has(entity.id) && !reached.has(entity.id)
            : definitions.get(entity.id)?.behaviors.some((behavior) => behavior.kind === "collectible" ||
              behavior.kind === "trigger" && (behavior.event === "win" || behavior.event === "victory"))));
        targets.sort((a, b) => Math.hypot(a.x - state.x, a.y - state.y) - Math.hypot(b.x - state.x, b.y - state.y) || a.id.localeCompare(b.id));
        // Scripts consume contact and collection events on the following tick.
        const target = targets[0] ?? (options.targetPrefix === undefined && reached.size > 0 ? state : undefined);
        if (!target) {
          return fail("unsupported", "No reachable target is known for this win condition. Use targetPrefix for a scripted goal");
        }
        const distance = Math.hypot(target.x - state.x, target.y - state.y);
        const targetKey = `${scene.id}:${target.id}`;
        if (targetKey !== lastTarget) {
          lastTarget = targetKey;
          waypoints = [];
          waypointIndex = 0;
          bestDistance = Infinity;
          progressTick = tick;
        }
        if (distance < bestDistance - 0.05) {
          bestDistance = distance;
          progressTick = tick;
        }
        if (tick - progressTick >= STALL_TICKS) {
          return fail("steering_stalled", "Steering made no progress for 600 ticks. This does not prove the target impossible");
        }
        const gravity = scene.gravity?.y ?? 0;
        if (gravity > 0 || (scene.gravity?.x ?? 0) !== 0) {
          return fail("unsupported", "Autoplay supports top-down scenes and downward-gravity platformers");
        }
        let aim: Point = target;
        if (gravity === 0) {
          if (waypoints.length === 0) {
            const path = pathTo(scene, snapshot, player, state, target, () => options.signal?.aborted === true || Date.now() - started >= maxWallTimeMs);
            if (options.signal?.aborted) {
              return fail("cancelled", "Autoplay was cancelled");
            }
            if (Date.now() - started >= maxWallTimeMs) {
              return fail("wall_time_budget", "Autoplay reached its wall time budget");
            }
            if (!path) {
              return fail("path_budget", "The bounded obstacle search found no route. This does not prove the target impossible");
            }
            waypoints = path;
          }
          while (waypointIndex < waypoints.length - 1 && Math.hypot(waypoints[waypointIndex].x - state.x, waypoints[waypointIndex].y - state.y) <= input.speed / 60 + 0.01) {
            waypointIndex += 1;
          }
          aim = waypoints[waypointIndex] ?? target;
        }
        const tolerance = input.speed / 120;
        if (aim.x < state.x - tolerance) {
          pressed.push(input.left);
        }
        if (aim.x > state.x + tolerance) {
          pressed.push(input.right);
        }
        if (gravity === 0) {
          if (aim.y > state.y + tolerance && input.up) {
            pressed.push(input.up);
          }
          if (aim.y < state.y - tolerance && input.down) {
            pressed.push(input.down);
          }
        } else if (input.jump) {
          const box = boxOf(player, state);
          const direction = Math.sign(aim.x - state.x);
          const grounded = blocked(scene, snapshot, player, box, { x: box.x, y: box.y - 0.02 });
          const wall = blocked(scene, snapshot, player, box, { x: box.x + direction * 0.4, y: box.y });
          const groundAhead = blocked(scene, snapshot, player, { ...box, x: box.x + direction * 0.8 }, { x: box.x + direction * 0.8, y: box.y - 0.1 });
          const needsJump = aim.y > state.y + 0.4 || wall || grounded && !groundAhead;
          if (tick - lastJump > 24 && needsJump && (grounded || wall)) {
            lastJump = tick;
          }
          if (tick - lastJump < 20) {
            pressed.push(input.jump);
          }
        }
      }
      pressed = [...new Set(pressed)];
      const input = { pressed, justPressed: pressed.filter((action) => !previous.includes(action)) };
      let step;
      try {
        step = session.step(input);
      } catch (error) {
        return fail("simulation_error", error instanceof Error ? error.message : String(error));
      }
      appendRoute(route, input);
      previous = pressed;
      snapshot = session.snapshot();
      for (const event of step.events) {
        if (event.kind === "win" || event.kind === "trigger" && (event.event === "win" || event.event === "victory")) {
          winTick ??= step.tick;
        }
        if (event.kind === "contact" && player && (event.entityId === player.id || event.otherId === player.id)) {
          markReached(event.entityId === player.id ? event.otherId : event.entityId);
        }
        if (event.kind === "collected" && event.byId === player?.id) {
          markReached(event.entityId);
        }
      }
      if (snapshot.won) {
        winTick ??= snapshot.tick;
      }
      if (options.targetPrefix !== undefined ? allTargets.every((id) => reached.has(id)) : winTick !== null) {
        return { ...result(), status: "reached" };
      }
    }
    return fail("tick_budget", `Autoplay reached its ${maxTicks}-tick budget`);
  } finally {
    session.dispose();
  }
}
