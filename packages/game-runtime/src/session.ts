import type {
  GameDocument,
  GameEntity,
  GameEvent,
  GameHudLabel,
  GameInputFrame,
  GameRenderFrame,
  GameScene,
  GameSnapshot
} from "@nodetool-ai/protocol";
import { gameSnapshot } from "@nodetool-ai/protocol";
import { validateGame } from "./validate.js";
import { hasGameScripts, prepareGameScripts, scriptSourceKey, type GameScriptCall, type GameScriptRunner, type GameScriptStats } from "./scripts.js";

interface EntityState {
  readonly definition: GameEntity;
  readonly sourceId?: string;
  spawnTick: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  visual?: ScriptVisual;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  active: boolean;
  health?: number;
  patrolOrigin?: number;
  patrolDirection?: -1 | 1;
}

export interface GameStepResult {
  readonly tick: number;
  readonly events: readonly GameEvent[];
  readonly frame: GameRenderFrame;
  readonly scriptStats?: GameScriptStats;
}

export interface GameInspection {
  readonly tick: number;
  readonly sceneId: string;
  readonly score: number;
  readonly won: boolean;
  readonly entities: readonly GameSnapshot["entities"][number][];
}

export interface GameSession {
  step(input: GameInputFrame): GameStepResult;
  frame(): GameRenderFrame;
  inspect(query?: { entityId?: string }): GameInspection;
  snapshot(): GameSnapshot;
  dispose(): void;
}

export interface GameReplayResult {
  readonly snapshot: GameSnapshot;
  readonly steps: readonly GameStepResult[];
}

function overlaps(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  if (!ac || !bc || !a.active || !b.active) {
    return false;
  }
  return Math.abs(a.x - b.x) * 2 < ac.width + bc.width &&
    Math.abs(a.y - b.y) * 2 < ac.height + bc.height;
}

function touches(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  return Boolean(ac && bc &&
    Math.abs(a.x - b.x) * 2 <= ac.width + bc.width &&
    Math.abs(a.y - b.y) * 2 <= ac.height + bc.height);
}

const MAX_EVENTS_PER_TICK = 512;
const MAX_SPAWNED_INSTANCES = 1024;

interface ContactPair {
  readonly entityId: string;
  readonly otherId: string;
  readonly sensor: boolean;
  readonly normalX: number;
  readonly normalY: number;
}

function contactKey(a: string, b: string): string {
  return a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]);
}

function canCollide(a: EntityState, b: EntityState): boolean {
  const ac = a.definition.collider2d;
  const bc = b.definition.collider2d;
  return Boolean(ac && bc && a.active && b.active &&
    ((ac.mask ?? 0xffffffff) & (bc.category ?? 1)) !== 0 &&
    ((bc.mask ?? 0xffffffff) & (ac.category ?? 1)) !== 0);
}

interface SweepHit {
  readonly time: number;
  readonly normalX: number;
  readonly normalY: number;
}

/** Sweep the moving AABB through one displacement against a stationary AABB. */
function sweepAabb(moving: EntityState, other: EntityState, dx: number, dy: number): SweepHit | undefined {
  const a = moving.definition.collider2d;
  const b = other.definition.collider2d;
  if (!a || !b) {
    return undefined;
  }
  const halfX = (a.width + b.width) / 2;
  const halfY = (a.height + b.height) / 2;
  const offsetX = other.x - moving.x;
  const offsetY = other.y - moving.y;
  if (Math.abs(offsetX) < halfX && Math.abs(offsetY) < halfY) {
    const useX = halfX - Math.abs(offsetX) <= halfY - Math.abs(offsetY);
    const normalX = useX ? Math.sign(-offsetX) || -Math.sign(dx) : 0;
    const normalY = useX ? 0 : Math.sign(-offsetY) || -Math.sign(dy);
    if (dx * normalX + dy * normalY >= 0 && !a.sensor && !b.sensor) {
      return undefined;
    }
    return { time: 0, normalX, normalY };
  }
  const xEntry = dx > 0 ? (offsetX - halfX) / dx : dx < 0 ? (offsetX + halfX) / dx : -Infinity;
  const xExit = dx > 0 ? (offsetX + halfX) / dx : dx < 0 ? (offsetX - halfX) / dx : Infinity;
  const yEntry = dy > 0 ? (offsetY - halfY) / dy : dy < 0 ? (offsetY + halfY) / dy : -Infinity;
  const yExit = dy > 0 ? (offsetY + halfY) / dy : dy < 0 ? (offsetY - halfY) / dy : Infinity;
  if (dx === 0 && Math.abs(offsetX) >= halfX || dy === 0 && Math.abs(offsetY) >= halfY) {
    return undefined;
  }
  const entry = Math.max(xEntry, yEntry);
  if (entry > Math.min(xExit, yExit) || entry < 0 || entry > 1) {
    return undefined;
  }
  return xEntry >= yEntry
    ? { time: entry, normalX: -Math.sign(dx), normalY: 0 }
    : { time: entry, normalX: 0, normalY: -Math.sign(dy) };
}

interface ScriptVisual {
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  tint?: string;
  opacity?: number;
}

interface WorldTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

function initialState(entity: GameEntity, world: WorldTransform, spawnTick = 0): EntityState {
  const health = entity.behaviors.find((behavior) => behavior.kind === "health");
  const patrol = entity.behaviors.find((behavior) => behavior.kind === "patrol");
  const state: EntityState = {
    definition: entity,
    spawnTick,
    x: world.x,
    y: world.y,
    previousX: world.x,
    previousY: world.y,
    rotation: world.rotation,
    scaleX: world.scaleX,
    scaleY: world.scaleY,
    velocityX: entity.body2d?.velocity.x ?? 0,
    velocityY: entity.body2d?.velocity.y ?? 0,
    active: !entity.templateOnly
  };
  if (health?.kind === "health") {
    state.health = health.maximum;
  }
  if (patrol?.kind === "patrol") {
    state.patrolOrigin = patrol.axis === "x" ? state.x : state.y;
    state.patrolDirection = 1;
  }
  return state;
}

function initialSceneStates(scene: GameScene, spawnTick = 0): EntityState[] {
  const definitions = new Map(scene.entities.map((entity) => [entity.id, entity]));
  const children = new Map<string, string[]>();
  const queue: string[] = [];
  for (const entity of scene.entities) {
    if (!entity.parentId) {
      queue.push(entity.id);
    } else {
      const siblings = children.get(entity.parentId) ?? [];
      siblings.push(entity.id);
      children.set(entity.parentId, siblings);
    }
  }
  const transforms = new Map<string, WorldTransform>();
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    const entity = definitions.get(id);
    if (!entity) continue;
    const local = entity.transform2d;
    const ancestor = entity.parentId ? transforms.get(entity.parentId) : undefined;
    if (!ancestor) {
      const world = { x: local.x, y: local.y, rotation: local.rotation, scaleX: local.scaleX, scaleY: local.scaleY };
      transforms.set(entity.id, world);
    } else {
      const x = local.x * ancestor.scaleX;
      const y = local.y * ancestor.scaleY;
      const cos = Math.cos(ancestor.rotation);
      const sin = Math.sin(ancestor.rotation);
      transforms.set(entity.id, {
        x: ancestor.x + x * cos - y * sin,
        y: ancestor.y + x * sin + y * cos,
        rotation: ancestor.rotation + local.rotation,
        scaleX: ancestor.scaleX * local.scaleX,
        scaleY: ancestor.scaleY * local.scaleY
      });
    }
    for (const childId of children.get(id) ?? []) queue.push(childId);
  }
  return scene.entities.map((entity) => {
    const world = transforms.get(entity.id);
    if (!world) throw new Error(`Missing world transform for ${entity.id}`);
    return initialState(entity, world, spawnTick);
  });
}

function animationFrame(entity: GameEntity, age: number): GameRenderFrame["sprites"][number]["frame"] {
  const animator = entity.animator;
  if (!animator) return undefined;
  const index = Math.floor(Math.max(0, age) / animator.ticksPerFrame);
  return animator.frames[animator.loop ? index % animator.frames.length : Math.min(index, animator.frames.length - 1)];
}

function frameFor(document: GameDocument, states: readonly EntityState[], tick: number, score: number, won: boolean, hud: ReadonlyMap<string, GameHudLabel>): GameRenderFrame {
  const cameraState = states.find((state) => state.active && state.definition.camera2d);
  const camera = cameraState?.definition.camera2d;
  const sprites: GameRenderFrame["sprites"] = [];
  const tiles: GameRenderFrame["tiles"] = [];
  for (const state of states) {
    if (!state.active) {
      continue;
    }
    const entity = state.definition;
    if (entity.sprite) {
      const age = tick - state.spawnTick;
      const lifetime = entity.behaviors.find((behavior) => behavior.kind === "lifetime");
      const progress = lifetime?.kind === "lifetime" ? Math.min(1, age / lifetime.ticks) : 0;
      const lifeScale = lifetime?.kind === "lifetime" ? 1 + (lifetime.endScale - 1) * progress : 1;
      const lifeOpacity = lifetime?.kind === "lifetime" && lifetime.fade ? 1 - progress : 1;
      const visual = state.visual;
      const opacity = (visual?.opacity ?? entity.sprite.opacity ?? 1) * lifeOpacity;
      const sprite: GameRenderFrame["sprites"][number] = {
        entityId: entity.id,
        assetId: entity.sprite.assetId,
        x: state.x,
        y: state.y,
        previousX: state.previousX,
        previousY: state.previousY,
        rotation: visual?.rotation ?? state.rotation,
        scaleX: (visual?.scaleX ?? state.scaleX) * lifeScale,
        scaleY: (visual?.scaleY ?? state.scaleY) * lifeScale,
        width: entity.sprite.width,
        height: entity.sprite.height,
        layer: entity.sprite.layer
      };
      const spriteFrame = animationFrame(entity, age) ?? entity.sprite.frame;
      if (spriteFrame) {
        sprite.frame = { ...spriteFrame };
      }
      const tint = visual?.tint ?? entity.sprite.tint;
      if (tint) sprite.tint = tint;
      if (opacity !== 1 || entity.sprite.opacity !== undefined) sprite.opacity = Math.max(0, Math.min(1, opacity));
      if (entity.sprite.blend === "additive") sprite.blend = "additive";
      if (document.assets[entity.sprite.assetId]?.sampling === "linear") sprite.sampling = "linear";
      sprites.push(sprite);
    }
    if (entity.tilemap) {
      for (const tile of entity.tilemap.tiles) {
        const item: GameRenderFrame["tiles"][number] = {
          entityId: entity.id,
          assetId: entity.tilemap.assetId,
          x: state.x + tile.x,
          y: state.y + tile.y,
          width: tile.width,
          height: tile.height,
          layer: entity.tilemap.layer
        };
        if (tile.frame) {
          item.frame = { ...tile.frame };
        }
        if (document.assets[entity.tilemap.assetId]?.sampling === "linear") item.sampling = "linear";
        tiles.push(item);
      }
    }
  }
  sprites.sort((a, b) => a.layer - b.layer);
  tiles.sort((a, b) => a.layer - b.layer);
  return {
    tick,
    width: camera?.width ?? 16,
    height: camera?.height ?? 9,
    pixelsPerUnit: document.pixelsPerUnit,
    camera: { x: cameraState?.x ?? 0, y: cameraState?.y ?? 0, zoom: camera?.zoom ?? 1 },
    sprites,
    tiles,
    // A script label with the id of a built-in label replaces it.
    hud: [
      ...(usesCollectibles(document) && !hud.has("score") ? [{ id: "score", text: `Score: ${score}`, x: 16, y: 16 }] : []),
      ...(won && !hud.has("win") ? [{ id: "win", text: "You win!", x: 16, y: 48 }] : []),
      ...[...hud.values()].map((label) => ({ ...label }))
    ]
  };
}

function usesCollectibles(document: GameDocument): boolean {
  return document.scenes.some((scene) => scene.entities.some((entity) =>
    entity.behaviors.some((behavior) => behavior.kind === "collectible" || behavior.kind === "winWhenCollected")));
}

interface QueuedSpawn {
  readonly prefabId: string;
  readonly x?: number;
  readonly y?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
}

/** One session owns mutable simulation state. All boundaries remain plain data. */
function createGameSessionWithRunner(value: GameDocument, seed: number, savedSnapshot?: GameSnapshot, eventSink?: (event: GameEvent) => void, scriptRunner?: GameScriptRunner): GameSession {
  const validation = validateGame(value);
  if (!validation.valid || !validation.document) {
    throw new Error(`Invalid game: ${validation.errors.join("; ")}`);
  }
  const document = validation.document;
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("Game seed must be a nonnegative safe integer");
  }
  if (hasGameScripts(document) && !scriptRunner) {
    throw new Error("Scripted games require createScriptedGameSession");
  }
  let sceneId = document.entrySceneId;
  const initialScene = document.scenes.find((candidate) => candidate.id === sceneId);
  if (!initialScene) {
    throw new Error(`Missing entry scene ${sceneId}`);
  }
  let scene: GameScene = initialScene;
  let states = initialSceneStates(scene);
  let tick = 0;
  let score = 0;
  let won = false;
  let rngState = seed >>> 0;
  let spawnSequence = 0;
  let previousEvents: GameEvent[] = [];
  let activeContacts = new Map<string, ContactPair>();
  let scriptState: GameSnapshot["scriptState"] = {};
  let hud = new Map<string, GameHudLabel>();
  let disposed = false;
  let failed = false;

  if (savedSnapshot) {
    const parsed = gameSnapshot.parse(savedSnapshot);
    if (parsed.gameRevision !== document.revision || parsed.engineVersion !== document.engineVersion) {
      throw new Error("Save revision or engine version does not match the game");
    }
    const savedScene = document.scenes.find((candidate) => candidate.id === parsed.sceneId);
    if (!savedScene) {
      throw new Error(`Save refers to missing scene ${parsed.sceneId}`);
    }
    scene = savedScene;
    sceneId = savedScene.id;
    states = initialSceneStates(savedScene, parsed.tick);
    const byId = new Map(parsed.entities.map((entity) => [entity.id, entity]));
    if (byId.size !== parsed.entities.length || states.some((state) => !byId.has(state.definition.id))) {
      throw new Error("Save entity set does not match the game revision");
    }
    for (const saved of parsed.entities) {
      if (!saved.sourceId) {
        if (!savedScene.entities.some((entity) => entity.id === saved.id)) {
          throw new Error(`Save has unknown entity ${saved.id}`);
        }
        continue;
      }
      const source = savedScene.entities.find((entity) => entity.id === saved.sourceId && entity.templateOnly);
      if (!source) {
        throw new Error(`Save refers to missing spawn template ${saved.sourceId}`);
      }
      const sourceState = states.find((state) => state.definition.id === source.id);
      if (!sourceState) throw new Error(`Missing spawn template state ${source.id}`);
      const spawned = initialState({ ...source, id: saved.id, templateOnly: false }, sourceState, saved.spawnTick ?? 0);
      states.push({ ...spawned, sourceId: source.id });
    }
    for (const state of states) {
      const saved = byId.get(state.definition.id);
      if (!saved) {
        continue;
      }
      state.x = saved.x;
      state.y = saved.y;
      state.previousX = saved.previousX;
      state.previousY = saved.previousY;
      state.velocityX = saved.velocityX;
      state.velocityY = saved.velocityY;
      state.spawnTick = saved.spawnTick ?? 0;
      state.active = saved.active;
      state.health = saved.health;
      state.patrolOrigin = saved.patrolOrigin;
      state.patrolDirection = saved.patrolDirection;
      const visual: ScriptVisual = {};
      if (saved.rotation !== undefined) visual.rotation = saved.rotation;
      if (saved.scaleX !== undefined) visual.scaleX = saved.scaleX;
      if (saved.scaleY !== undefined) visual.scaleY = saved.scaleY;
      if (saved.tint !== undefined) visual.tint = saved.tint;
      if (saved.opacity !== undefined) visual.opacity = saved.opacity;
      state.visual = Object.keys(visual).length > 0 ? visual : undefined;
    }
    tick = parsed.tick;
    score = parsed.score;
    won = parsed.won;
    rngState = parsed.rngState;
    spawnSequence = parsed.spawnSequence;
    previousEvents = structuredClone(parsed.pendingEvents);
    activeContacts = new Map(parsed.activeContacts.map((pair) => [contactKey(pair.entityId, pair.otherId), { ...pair, normalX: 0, normalY: 0 }]));
    scriptState = structuredClone(parsed.scriptState);
    hud = new Map(parsed.hud.map((label) => [label.id, { ...label }]));
  }

  function snapshot(): GameSnapshot {
    if (disposed) {
      throw new Error("Game session is disposed");
    }
    if (failed) {
      throw new Error("Game session stopped after a failed step");
    }
    return {
      gameRevision: document.revision,
      engineVersion: "1",
      sceneId,
      tick,
      rngState,
      score,
      won,
      spawnSequence,
      pendingEvents: structuredClone(previousEvents),
      activeContacts: [...activeContacts.values()].map(({ entityId, otherId, sensor }) => ({ entityId, otherId, sensor })),
      scriptState: structuredClone(scriptState),
      hud: [...hud.values()].map((label) => ({ ...label })),
      entities: states.map((state) => {
        const entity: GameSnapshot["entities"][number] = {
          id: state.definition.id,
          x: state.x,
          y: state.y,
          previousX: state.previousX,
          previousY: state.previousY,
          velocityX: state.velocityX,
          velocityY: state.velocityY,
          active: state.active
        };
        entity.spawnTick = state.spawnTick;
        if (state.sourceId) {
          entity.sourceId = state.sourceId;
        }
        if (state.visual) Object.assign(entity, state.visual);
        if (state.health !== undefined) entity.health = state.health;
        if (state.patrolOrigin !== undefined) entity.patrolOrigin = state.patrolOrigin;
        if (state.patrolDirection !== undefined) entity.patrolDirection = state.patrolDirection;
        return entity;
      })
    };
  }

  function isSpawnedId(entityId: string): boolean {
    const separator = entityId.lastIndexOf("#");
    const prefabId = entityId.slice(0, separator);
    return separator > 0 && scene.entities.some((entity) => entity.templateOnly && entity.id === prefabId);
  }

  function step(input: GameInputFrame): GameStepResult {
    if (disposed) {
      throw new Error("Game session is disposed");
    }
    if (failed) {
      throw new Error("Game session stopped after a failed step");
    }
    const pressed = new Set(input.pressed);
    for (const action of pressed) {
      if (!document.inputActions.includes(action)) {
        throw new Error(`Unknown input action ${action}`);
      }
    }
    try {
      const events: GameEvent[] = [];
      const emit = (event: GameEvent): void => {
        if (events.length >= MAX_EVENTS_PER_TICK) {
          failed = true;
          throw new Error(`Game event limit exceeded (${MAX_EVENTS_PER_TICK} per tick)`);
        }
        events.push(event);
        eventSink?.(structuredClone(event));
      };
      const queuedDespawns = new Set<string>();
      const queuedSpawns: QueuedSpawn[] = [];
      let transitionTo: string | undefined;
      const scriptCalls: GameScriptCall[] = [];
      for (const state of states) {
        state.previousX = state.x;
        state.previousY = state.y;
        if (!state.active) {
          continue;
        }
        const entity = state.definition;
        for (const [index, behavior] of entity.behaviors.entries()) {
          if (behavior.kind === "movement") {
            const dx = Number(pressed.has(behavior.right)) - Number(pressed.has(behavior.left));
            const dy = Number(pressed.has(behavior.up)) - Number(pressed.has(behavior.down));
            const length = Math.hypot(dx, dy) || 1;
            state.velocityX = (dx / length) * behavior.speed;
            state.velocityY = (dy / length) * behavior.speed;
          } else if (behavior.kind === "patrol") {
            const coordinate = behavior.axis === "x" ? state.x : state.y;
            const origin = state.patrolOrigin ?? coordinate;
            if (Math.abs(coordinate - origin) >= behavior.distance) {
              state.patrolDirection = state.patrolDirection === 1 ? -1 : 1;
            }
            const speed = behavior.speed * (state.patrolDirection ?? 1);
            state.velocityX = behavior.axis === "x" ? speed : 0;
            state.velocityY = behavior.axis === "y" ? speed : 0;
          } else if (behavior.kind === "sceneTransition" && previousEvents.some((event) => event.kind === "trigger" && event.event === behavior.onEvent)) {
            transitionTo = behavior.sceneId;
          } else if (behavior.kind === "spawn" && previousEvents.some((event) => event.kind === "trigger" && event.event === behavior.onEvent)) {
            queuedSpawns.push({ prefabId: behavior.prefabId });
          } else if (behavior.kind === "lifetime" && tick - state.spawnTick >= behavior.ticks) {
            queuedDespawns.add(entity.id);
          } else if (behavior.kind === "script") {
            const sourceKey = scriptSourceKey(scene.id, state.sourceId ?? entity.id, index);
            const stateKey = scriptSourceKey(scene.id, entity.id, index);
            scriptCalls.push({ sourceKey, stateKey, entityId: entity.id, source: state.sourceId ?? entity.id, state: scriptState[stateKey] ?? null,
              x: state.x, y: state.y, velocityX: state.velocityX, velocityY: state.velocityY,
              maxCommands: behavior.maxCommands, maxTickMs: behavior.maxTickMs });
          }
        }
      }
      let scriptStats: GameScriptStats | undefined;
      if (scriptRunner && scriptCalls.length > 0) {
        const world = states
          .filter((state) => state.active && (state.definition.collider2d || state.definition.camera2d))
          .map((state) => ({ id: state.definition.id, source: state.sourceId ?? state.definition.id, x: state.x, y: state.y }));
        const batch = scriptRunner.run(scriptCalls, { tick, pressed: [...pressed], justPressed: input.justPressed, events: previousEvents, world }, rngState);
        const byId = new Map(states.map((state) => [state.definition.id, state]));
        for (const item of batch.results) {
          for (const command of item.commands) {
            if (command.kind === "spawn" && !scene.entities.some((entity) => entity.id === command.prefabId && entity.templateOnly)) {
              throw new Error(`Game script uses missing prefab ${command.prefabId}`);
            }
            if (command.kind === "sceneTransition" && !document.scenes.some((candidate) => candidate.id === command.sceneId)) {
              throw new Error(`Game script uses missing scene ${command.sceneId}`);
            }
            // A spawned instance can expire in the tick before a script reacts to its contact.
            if (command.kind === "despawn" && !byId.get(command.entityId)?.active && !isSpawnedId(command.entityId)) {
              throw new Error(`Game script uses missing entity ${command.entityId}`);
            }
          }
        }
        for (const [index, item] of batch.results.entries()) {
          const call = scriptCalls[index];
          scriptState[call.stateKey] = item.state;
          const state = byId.get(item.entityId);
          if (!state) throw new Error(`Game script entity ${item.entityId} disappeared`);
          for (const command of item.commands) {
            if (command.kind === "setVelocity") {
              state.velocityX = command.x;
              state.velocityY = command.y;
            } else if (command.kind === "setPosition") {
              state.x = command.x;
              state.y = command.y;
            } else if (command.kind === "setVisual") {
              const { kind: _kind, ...visual } = command;
              state.visual = { ...state.visual, ...visual };
            } else if (command.kind === "hud") {
              const { kind: _kind, ...label } = command;
              if (label.text === "") hud.delete(label.id);
              else hud.set(label.id, label);
            } else if (command.kind === "emit") {
              emit({ kind: "trigger", event: command.event, entityId: item.entityId });
            } else if (command.kind === "spawn") {
              const { kind: _kind, ...spawn } = command;
              queuedSpawns.push(spawn);
            } else if (command.kind === "despawn") {
              queuedDespawns.add(command.entityId);
            } else if (command.kind === "sceneTransition") {
              transitionTo = command.sceneId;
            }
          }
        }
        rngState = batch.rngState;
        scriptStats = batch.stats;
      }
      const dt = 1 / document.tickRate;
      const motionStarts = new Map(states.map((state) => [state.definition.id, { x: state.x, y: state.y }]));
      const currentContacts = new Map<string, ContactPair>();
      const recordContact = (moving: EntityState, other: EntityState, hit: SweepHit): void => {
        const key = contactKey(moving.definition.id, other.definition.id);
        if (!currentContacts.has(key)) {
          if (events.length + currentContacts.size >= MAX_EVENTS_PER_TICK) {
            throw new Error(`Game event limit exceeded (${MAX_EVENTS_PER_TICK} per tick)`);
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
      for (const state of states) {
        if (!state.active || state.definition.body2d?.type !== "kinematic") {
          continue;
        }
        let remainingX = state.velocityX * dt;
        let remainingY = state.velocityY * dt;
        if (!state.definition.collider2d) {
          state.x += remainingX;
          state.y += remainingY;
          continue;
        }
        for (let pass = 0; pass < 2 && (remainingX !== 0 || remainingY !== 0); pass += 1) {
          const hits = states.flatMap((other) => {
            if (state === other || !canCollide(state, other) || other.definition.body2d?.type === "kinematic") {
              return [];
            }
            const hit = sweepAabb(state, other, remainingX, remainingY);
            return hit ? [{ other, hit }] : [];
          }).sort((a, b) => a.hit.time - b.hit.time || (a.other.definition.id < b.other.definition.id ? -1 : a.other.definition.id > b.other.definition.id ? 1 : 0));
          const solid = hits.find(({ other }) => other.definition.body2d?.type === "static" && !other.definition.collider2d?.sensor && !state.definition.collider2d?.sensor);
          const travel = solid?.hit.time ?? 1;
          for (const { other, hit } of hits) {
            if (hit.time > travel) {
              break;
            }
            if (other.definition.collider2d?.sensor || state.definition.collider2d?.sensor || other === solid?.other) {
              recordContact(state, other, hit);
            }
          }
          state.x += remainingX * travel;
          state.y += remainingY * travel;
          if (!solid) {
            break;
          }
          remainingX = solid.hit.normalX === 0 ? remainingX * (1 - travel) : 0;
          remainingY = solid.hit.normalY === 0 ? remainingY * (1 - travel) : 0;
        }
      }
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index];
        if (!state.active || state.definition.body2d?.type !== "kinematic") {
          continue;
        }
        for (let otherIndex = index + 1; otherIndex < states.length; otherIndex += 1) {
          const other = states[otherIndex];
          if (other.definition.body2d?.type !== "kinematic" || !canCollide(state, other)) {
            continue;
          }
          const stateStart = motionStarts.get(state.definition.id);
          const otherStart = motionStarts.get(other.definition.id);
          if (!stateStart || !otherStart) {
            continue;
          }
          const relativeX = (state.x - stateStart.x) - (other.x - otherStart.x);
          const relativeY = (state.y - stateStart.y) - (other.y - otherStart.y);
          const atStart = { ...state, x: stateStart.x, y: stateStart.y };
          const targetAtStart = { ...other, x: otherStart.x, y: otherStart.y };
          const hit = sweepAabb(atStart, targetAtStart, relativeX, relativeY);
          if (hit) {
            recordContact(state, other, hit);
          }
        }
      }
      for (const state of states) {
        if (!state.active || state.definition.body2d?.type !== "kinematic") {
          continue;
        }
        for (const other of states) {
          if (state === other || !canCollide(state, other) ||
            !(overlaps(state, other) || other.definition.body2d?.type === "static" && !other.definition.collider2d?.sensor && touches(state, other))) {
            continue;
          }
          const horizontalGap = Math.abs(state.x - other.x) - ((state.definition.collider2d?.width ?? 0) + (other.definition.collider2d?.width ?? 0)) / 2;
          const verticalGap = Math.abs(state.y - other.y) - ((state.definition.collider2d?.height ?? 0) + (other.definition.collider2d?.height ?? 0)) / 2;
          const horizontal = horizontalGap >= verticalGap;
          recordContact(state, other, { time: 0, normalX: horizontal ? Math.sign(state.x - other.x) : 0, normalY: horizontal ? 0 : Math.sign(state.y - other.y) });
        }
      }
      const stateById = new Map(states.map((state) => [state.definition.id, state]));
      for (const [key, pair] of currentContacts) {
        const phase = activeContacts.has(key) ? "stay" : "enter";
        emit({ kind: "contact", entityId: pair.entityId, otherId: pair.otherId, phase, normalX: pair.normalX, normalY: pair.normalY });
        if (phase !== "enter") {
          continue;
        }
        const state = stateById.get(pair.entityId);
        const other = stateById.get(pair.otherId);
        if (!state || !other) {
          continue;
        }
        for (const [actor, target] of [[state, other], [other, state]]) {
          if (actor.definition.body2d?.type !== "kinematic") {
            continue;
          }
          for (const behavior of target.definition.behaviors) {
            // Sensors detect contact but never collect, so patrolling hazards leave pickups alone.
            if (behavior.kind === "collectible" && !actor.definition.collider2d?.sensor && !queuedDespawns.has(target.definition.id)) {
              queuedDespawns.add(target.definition.id);
              score += behavior.score;
              emit({ kind: "collected", entityId: target.definition.id, byId: actor.definition.id, score: behavior.score });
            } else if (behavior.kind === "trigger") {
              emit({ kind: "trigger", event: behavior.event, entityId: target.definition.id });
            }
          }
        }
      }
      for (const [key, pair] of activeContacts) {
        if (!currentContacts.has(key)) {
          emit({ kind: "contact", entityId: pair.entityId, otherId: pair.otherId, phase: "exit", normalX: 0, normalY: 0 });
        }
      }
      activeContacts = currentContacts;
      for (const state of states) {
        if (queuedDespawns.has(state.definition.id)) {
          state.active = false;
        }
        for (const behavior of state.definition.behaviors) {
          if (behavior.kind === "winWhenCollected" && !won && score >= behavior.count) {
            won = true;
            emit({ kind: "win", score });
          }
        }
        const audio = state.definition.audioSource;
        if (audio && events.some((event) => (event.kind === audio.onEvent && (event.kind !== "collected" || event.entityId === state.definition.id)) ||
          (event.kind === "trigger" && event.event === audio.onEvent))) {
          emit({ kind: "audio", assetId: audio.assetId });
        }
      }
      if (queuedDespawns.size > 0) {
        // Spawned instances leave the world when despawned; authored entities stay as inactive state.
        states = states.filter((state) => {
          if (!state.sourceId || !queuedDespawns.has(state.definition.id)) return true;
          state.definition.behaviors.forEach((behavior, index) => {
            if (behavior.kind === "script") delete scriptState[scriptSourceKey(scene.id, state.definition.id, index)];
          });
          return false;
        });
      }
      if (states.filter((state) => state.sourceId).length + queuedSpawns.length > MAX_SPAWNED_INSTANCES) {
        failed = true;
        throw new Error(`Game spawned instance limit exceeded (${MAX_SPAWNED_INSTANCES})`);
      }
      for (const spawn of queuedSpawns) {
        const prefabId = spawn.prefabId;
        const source = scene.entities.find((entity) => entity.id === prefabId && entity.templateOnly);
        if (!source) {
          throw new Error(`Missing spawn template ${prefabId}`);
        }
        spawnSequence += 1;
        const sourceState = states.find((state) => state.definition.id === source.id);
        if (!sourceState) throw new Error(`Missing spawn template state ${source.id}`);
        const spawned = initialState({ ...source, id: `${prefabId}#${spawnSequence}`, templateOnly: false }, sourceState, tick + 1);
        if (spawn.x !== undefined) spawned.x = spawned.previousX = spawn.x;
        if (spawn.y !== undefined) spawned.y = spawned.previousY = spawn.y;
        if (spawn.velocityX !== undefined) spawned.velocityX = spawn.velocityX;
        if (spawn.velocityY !== undefined) spawned.velocityY = spawn.velocityY;
        states.push({ ...spawned, sourceId: prefabId });
      }
      if (transitionTo) {
        const nextScene = document.scenes.find((candidate) => candidate.id === transitionTo);
        if (!nextScene) {
          throw new Error(`Missing scene ${transitionTo}`);
        }
        scene = nextScene;
        sceneId = nextScene.id;
        states = initialSceneStates(nextScene, tick + 1);
        activeContacts = new Map();
        spawnSequence = 0;
        scriptState = {};
        hud = new Map();
        emit({ kind: "sceneTransition", sceneId });
      }
      previousEvents = structuredClone(events);
      rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0;
      tick += 1;
      const result: GameStepResult = { tick, events, frame: frameFor(document, states, tick, score, won, hud) };
      if (scriptStats) {
        return { ...result, scriptStats };
      }
      return result;
    } catch (error) {
      failed = true;
      throw error;
    }
  }

  return {
    step,
    frame(): GameRenderFrame {
      if (disposed) {
        throw new Error("Game session is disposed");
      }
      if (failed) {
        throw new Error("Game session stopped after a failed step");
      }
      return frameFor(document, states, tick, score, won, hud);
    },
    inspect(query): GameInspection {
      const current = snapshot();
      return { tick, sceneId, score, won, entities: query?.entityId ? current.entities.filter((entity) => entity.id === query.entityId) : current.entities };
    },
    snapshot,
    dispose(): void {
      disposed = true;
      states = [];
      previousEvents = [];
      scriptRunner?.dispose();
    }
  };
}

export function createGameSession(document: GameDocument, seed: number, savedSnapshot?: GameSnapshot, eventSink?: (event: GameEvent) => void): GameSession {
  return createGameSessionWithRunner(document, seed, savedSnapshot, eventSink);
}

export async function createScriptedGameSession(document: GameDocument, seed: number, savedSnapshot?: GameSnapshot, eventSink?: (event: GameEvent) => void): Promise<GameSession> {
  const validation = validateGame(document);
  if (!validation.valid || !validation.document) throw new Error(`Invalid game: ${validation.errors.join("; ")}`);
  if (!hasGameScripts(validation.document)) return createGameSession(validation.document, seed, savedSnapshot, eventSink);
  const runner = await prepareGameScripts(validation.document);
  try {
    return createGameSessionWithRunner(validation.document, seed, savedSnapshot, eventSink, runner);
  } catch (error) {
    runner.dispose();
    throw error;
  }
}

export async function replayScriptedGame(document: GameDocument, seed: number, inputs: readonly GameInputFrame[], snapshot?: GameSnapshot): Promise<GameReplayResult> {
  const session = await createScriptedGameSession(document, seed, snapshot);
  try {
    const steps = inputs.map((input) => session.step(input));
    return { snapshot: session.snapshot(), steps };
  } finally {
    session.dispose();
  }
}

export function replayGame(document: GameDocument, seed: number, inputs: readonly GameInputFrame[], snapshot?: GameSnapshot): GameReplayResult {
  const session = createGameSession(document, seed, snapshot);
  try {
    const steps = inputs.map((input) => session.step(input));
    return { snapshot: session.snapshot(), steps };
  } finally {
    session.dispose();
  }
}
