import type {
  GameDocument,
  GameEntity,
  GameEvent,
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
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
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

interface WorldTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

function initialState(entity: GameEntity, world: WorldTransform): EntityState {
  const health = entity.behaviors.find((behavior) => behavior.kind === "health");
  const patrol = entity.behaviors.find((behavior) => behavior.kind === "patrol");
  const state: EntityState = {
    definition: entity,
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

function initialSceneStates(scene: GameScene): EntityState[] {
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
    return initialState(entity, world);
  });
}

function frameFor(document: GameDocument, states: readonly EntityState[], tick: number, score: number, won: boolean): GameRenderFrame {
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
      const sprite: GameRenderFrame["sprites"][number] = {
        entityId: entity.id,
        assetId: entity.sprite.assetId,
        x: state.x,
        y: state.y,
        previousX: state.previousX,
        previousY: state.previousY,
        rotation: state.rotation,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        width: entity.sprite.width,
        height: entity.sprite.height,
        layer: entity.sprite.layer
      };
      if (entity.sprite.frame) sprite.frame = entity.sprite.frame;
      if (entity.sprite.tint) sprite.tint = entity.sprite.tint;
      if (entity.sprite.opacity !== undefined) sprite.opacity = entity.sprite.opacity;
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
        if (tile.frame) item.frame = tile.frame;
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
    hud: [
      { id: "score", text: `Score: ${score}`, x: 16, y: 16 },
      ...(won ? [{ id: "win", text: "You win!", x: 16, y: 48 }] : [])
    ]
  };
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
  let scriptState: GameSnapshot["scriptState"] = {};
  let disposed = false;

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
    states = initialSceneStates(savedScene);
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
      const spawned = initialState({ ...source, id: saved.id, templateOnly: false }, sourceState);
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
      state.active = saved.active;
      state.health = saved.health;
      state.patrolOrigin = saved.patrolOrigin;
      state.patrolDirection = saved.patrolDirection;
    }
    tick = parsed.tick;
    score = parsed.score;
    won = parsed.won;
    rngState = parsed.rngState;
    spawnSequence = parsed.spawnSequence;
    previousEvents = parsed.pendingEvents;
    scriptState = { ...parsed.scriptState };
  }

  function snapshot(): GameSnapshot {
    if (disposed) {
      throw new Error("Game session is disposed");
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
      pendingEvents: previousEvents,
      scriptState: { ...scriptState },
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
        if (state.sourceId) entity.sourceId = state.sourceId;
        if (state.health !== undefined) entity.health = state.health;
        if (state.patrolOrigin !== undefined) entity.patrolOrigin = state.patrolOrigin;
        if (state.patrolDirection !== undefined) entity.patrolDirection = state.patrolDirection;
        return entity;
      })
    };
  }

  function step(input: GameInputFrame): GameStepResult {
    if (disposed) {
      throw new Error("Game session is disposed");
    }
    const pressed = new Set(input.pressed);
    for (const action of pressed) {
      if (!document.inputActions.includes(action)) {
        throw new Error(`Unknown input action ${action}`);
      }
    }
    const events: GameEvent[] = [];
    const emit = (event: GameEvent): void => {
      events.push(event);
      eventSink?.(event);
    };
    const queuedDespawns = new Set<string>();
    const queuedSpawns: string[] = [];
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
          queuedSpawns.push(behavior.prefabId);
        } else if (behavior.kind === "script") {
          const sourceKey = scriptSourceKey(scene.id, state.sourceId ?? entity.id, index);
          const stateKey = scriptSourceKey(scene.id, entity.id, index);
          scriptCalls.push({ sourceKey, stateKey, entityId: entity.id, state: scriptState[stateKey] ?? null,
            x: state.x, y: state.y, velocityX: state.velocityX, velocityY: state.velocityY,
            maxCommands: behavior.maxCommands, maxTickMs: behavior.maxTickMs });
        }
      }
    }
    let scriptStats: GameScriptStats | undefined;
    if (scriptRunner && scriptCalls.length > 0) {
      const batch = scriptRunner.run(scriptCalls, { tick, pressed: [...pressed], justPressed: input.justPressed, events: previousEvents }, rngState);
      for (const item of batch.results) {
        for (const command of item.commands) {
          if (command.kind === "spawn" && !scene.entities.some((entity) => entity.id === command.prefabId && entity.templateOnly)) {
            throw new Error(`Game script uses missing prefab ${command.prefabId}`);
          }
          if (command.kind === "sceneTransition" && !document.scenes.some((candidate) => candidate.id === command.sceneId)) {
            throw new Error(`Game script uses missing scene ${command.sceneId}`);
          }
          if (command.kind === "despawn" && !states.some((state) => state.definition.id === command.entityId && state.active)) {
            throw new Error(`Game script uses missing entity ${command.entityId}`);
          }
        }
      }
      for (const [index, item] of batch.results.entries()) {
        const call = scriptCalls[index];
        scriptState[call.stateKey] = item.state;
        const state = states.find((candidate) => candidate.definition.id === item.entityId);
        if (!state) throw new Error(`Game script entity ${item.entityId} disappeared`);
        for (const command of item.commands) {
          if (command.kind === "setVelocity") {
            state.velocityX = command.x;
            state.velocityY = command.y;
          } else if (command.kind === "emit") {
            emit({ kind: "trigger", event: command.event, entityId: item.entityId });
          } else if (command.kind === "spawn") {
            queuedSpawns.push(command.prefabId);
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
    for (const state of states) {
      if (!state.active || state.definition.body2d?.type !== "kinematic") {
        continue;
      }
      const oldX = state.x;
      state.x += state.velocityX * dt;
      if (states.some((other) => other !== state && other.definition.body2d?.type === "static" && !other.definition.collider2d?.sensor && overlaps(state, other))) {
        state.x = oldX;
      }
      const oldY = state.y;
      state.y += state.velocityY * dt;
      if (states.some((other) => other !== state && other.definition.body2d?.type === "static" && !other.definition.collider2d?.sensor && overlaps(state, other))) {
        state.y = oldY;
      }
    }
    for (const state of states) {
      if (!state.active || state.definition.body2d?.type !== "kinematic") {
        continue;
      }
      for (const other of states) {
        if (state === other || !overlaps(state, other)) {
          continue;
        }
        emit({ kind: "contact", entityId: state.definition.id, otherId: other.definition.id });
        for (const behavior of other.definition.behaviors) {
          if (behavior.kind === "collectible" && !queuedDespawns.has(other.definition.id)) {
            queuedDespawns.add(other.definition.id);
            score += behavior.score;
            emit({ kind: "collected", entityId: other.definition.id, byId: state.definition.id, score: behavior.score });
          } else if (behavior.kind === "trigger") {
            emit({ kind: "trigger", event: behavior.event, entityId: other.definition.id });
          }
        }
      }
    }
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
      if (audio && events.some((event) => event.kind === audio.onEvent && (event.kind !== "collected" || event.entityId === state.definition.id))) {
        emit({ kind: "audio", assetId: audio.assetId });
      }
    }
    for (const prefabId of queuedSpawns) {
      const source = scene.entities.find((entity) => entity.id === prefabId && entity.templateOnly);
      if (!source) {
        throw new Error(`Missing spawn template ${prefabId}`);
      }
      spawnSequence += 1;
      const sourceState = states.find((state) => state.definition.id === source.id);
      if (!sourceState) throw new Error(`Missing spawn template state ${source.id}`);
      const spawned = initialState({ ...source, id: `${prefabId}#${spawnSequence}`, templateOnly: false }, sourceState);
      states.push({ ...spawned, sourceId: prefabId });
    }
    if (transitionTo) {
      const nextScene = document.scenes.find((candidate) => candidate.id === transitionTo);
      if (!nextScene) {
        throw new Error(`Missing scene ${transitionTo}`);
      }
      scene = nextScene;
      sceneId = nextScene.id;
      states = initialSceneStates(nextScene);
      spawnSequence = 0;
      scriptState = {};
      emit({ kind: "sceneTransition", sceneId });
    }
    previousEvents = events;
    rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0;
    tick += 1;
    const result: GameStepResult = { tick, events, frame: frameFor(document, states, tick, score, won) };
    if (scriptStats) return { ...result, scriptStats };
    return result;
  }

  return {
    step,
    frame(): GameRenderFrame {
      if (disposed) throw new Error("Game session is disposed");
      return frameFor(document, states, tick, score, won);
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
