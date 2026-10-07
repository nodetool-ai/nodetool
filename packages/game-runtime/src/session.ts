import { frameFor } from "./systems/presentation2d.js";
import { contactKey } from "./systems/collision2d.js";
import type { GameSystemContext2D } from "./systems/context2d.js";
import type { EntityState, ContactPair, WorldTransform, ScriptVisual } from "./systems/state2d.js";
import { stepScripts2D } from "./systems/scripts2d.js";
import { stepContacts2D } from "./systems/contacts2d.js";
import { stepGameplay2D } from "./systems/gameplay2d.js";
import { stepPresentation2D, readStepResult2D } from "./systems/presentation2d.js";
import type {
  GameDocument,
  GameEntity,
  GameEvent,
  GameHudLabel,
  GameInputFrame,
  GameRenderFrame,
  GameScene,
  GameSnapshot,
  GameStepTimings
} from "@nodetool-ai/protocol";
import { gameSnapshot } from "@nodetool-ai/protocol";
import {
  initialGameplayState,
  runGameplayTick
} from "./gameplay/lifecycle.js";
import { validateGame } from "./validate.js";
import { hasGameScripts, prepareGameScripts, type GameScriptRunner, type GameScriptStats } from "./scripts.js";

import { statefulGameSystem } from "./systems/pipeline.js";
import { create2DSystemPipeline } from "./systems/tick2d.js";

export interface GameSessionOptions {
  readonly recordTimings?: boolean;
}

export interface GameStepResult {
  readonly timings?: GameStepTimings;
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
  takePresentationEvents(): readonly GameEvent[];
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

function initialState(entity: GameEntity, world: WorldTransform, spawnTick = 0): EntityState {
  const patrol = entity.behaviors.find((behavior) => behavior.kind === "patrol");
  const state: EntityState = {
    definition: entity,
    ...(entity.props === undefined ? {} : { props: structuredClone(entity.props) }),
    ...initialGameplayState(entity, spawnTick),
    x: world.x,
    y: world.y,
    previousX: world.x,
    previousY: world.y,
    rotation: world.rotation,
    scaleX: world.scaleX,
    scaleY: world.scaleY,
    velocityX: entity.body2d?.velocity.x ?? 0,
    velocityY: entity.body2d?.velocity.y ?? 0
  };
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

/** One session owns mutable simulation state. All boundaries remain plain data. */
function createGameSessionWithRunner(
  value: GameDocument,
  seed: number,
  savedSnapshot?: GameSnapshot,
  eventSink?: (event: GameEvent) => void,
  scriptRunner?: GameScriptRunner,
  options: GameSessionOptions = {}
): GameSession {
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
  let music: GameSnapshot["music"] = scene.music
    ? {
        voiceId: `scene:${scene.id}:music`,
        assetId: scene.music.assetId,
        startTick: 0,
        volume: scene.music.volume,
        fadeInTicks: scene.music.fadeInTicks,
        fadeOutTicks: scene.music.fadeOutTicks
      }
    : null;
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

  function restoreSavedSnapshot(parsed: GameSnapshot): void {
    if (parsed.gameRevision !== document.revision || parsed.engineVersion !== document.engineVersion) {
      throw new Error("Save revision or engine version does not match the game");
    }
    const savedScene = document.scenes.find((candidate) => candidate.id === parsed.sceneId);
    if (!savedScene) {
      throw new Error(`Save refers to missing scene ${parsed.sceneId}`);
    }
    scene = savedScene;
    sceneId = savedScene.id;
    music =
      parsed.music ??
      (savedScene.music
        ? {
            voiceId: `scene:${savedScene.id}:music`,
            assetId: savedScene.music.assetId,
            startTick: parsed.tick,
            volume: savedScene.music.volume,
            fadeInTicks: savedScene.music.fadeInTicks,
            fadeOutTicks: savedScene.music.fadeOutTicks
          }
        : null);
    if (
      music &&
      (!savedScene.music ||
        music.assetId !== savedScene.music.assetId ||
        music.voiceId !== `scene:${savedScene.id}:music` ||
        music.startTick > parsed.tick)
    ) {
      throw new Error("Save music does not match the scene");
    }
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
      if (saved.props !== undefined) { state.props = structuredClone(saved.props); }
      state.health = saved.health;
      state.patrolOrigin = saved.patrolOrigin;
      state.patrolDirection = saved.patrolDirection;
      state.animation = saved.animation;
      state.animationTick = saved.animationTick;
      const visual: ScriptVisual = {};
      if (saved.flipX !== undefined) visual.flipX = saved.flipX;
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
    activeContacts = new Map(
      parsed.activeContacts.map((pair) => [contactKey(pair.entityId, pair.otherId), { ...pair, normalX: 0, normalY: 0 }])
    );
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
      music: music ? { ...music } : null,
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
        if (state.props !== undefined) { entity.props = structuredClone(state.props); }
        if (state.visual) Object.assign(entity, state.visual);
        if (state.health !== undefined) entity.health = state.health;
        if (state.patrolOrigin !== undefined) entity.patrolOrigin = state.patrolOrigin;
        if (state.patrolDirection !== undefined) entity.patrolDirection = state.patrolDirection;
        if (state.animation !== undefined) entity.animation = state.animation;
        if (state.animationTick !== undefined) entity.animationTick = state.animationTick;
        return entity;
      })
    };
  }

  function isSpawnedId(entityId: string): boolean {
    const separator = entityId.lastIndexOf("#");
    const prefabId = entityId.slice(0, separator);
    return separator > 0 && scene.entities.some((entity) => entity.templateOnly && entity.id === prefabId);
  }

  let presentationEvents: GameEvent[] = [];
  type Context = GameSystemContext2D;
  type SystemState = (Partial<GameSnapshot> & { readonly gameplaySnapshot?: GameSnapshot }) | null;
  const scripts = statefulGameSystem<GameDocument, GameScene, Context, SystemState>(
    "scripts",
    stepScripts2D,
    () => ({ scriptState: structuredClone(scriptState), rngState, pendingEvents: structuredClone(previousEvents) }),
    (saved) => {
      if (!saved?.scriptState || saved.rngState === undefined || !saved.pendingEvents) {
        throw new Error("Missing script system state");
      }
      scriptState = structuredClone(saved.scriptState);
      rngState = saved.rngState;
      previousEvents = structuredClone(saved.pendingEvents);
    }
  );
  const contacts = statefulGameSystem<GameDocument, GameScene, Context, SystemState>(
    "contacts",
    stepContacts2D,
    () => ({ activeContacts: [...activeContacts.values()].map(({ entityId, otherId, sensor }) => ({ entityId, otherId, sensor })) }),
    (saved) => {
      if (!saved?.activeContacts) {
        throw new Error("Missing contact system state");
      }
      activeContacts = new Map(
        saved.activeContacts.map((pair) => [contactKey(pair.entityId, pair.otherId), { ...pair, normalX: 0, normalY: 0 }])
      );
    }
  );
  const gameplay = statefulGameSystem<GameDocument, GameScene, Context, SystemState>("gameplay", stepGameplay2D, () => ({ gameplaySnapshot: snapshot() }), (saved) => {
    if (!saved?.gameplaySnapshot) {
      throw new Error("Missing gameplay system state");
    }
    restoreSavedSnapshot(saved.gameplaySnapshot);
  });
  const presentation = statefulGameSystem<GameDocument, GameScene, Context, SystemState>(
    "presentation",
    stepPresentation2D,
    () => null,
    () => {
      presentationEvents = [];
    }
  );
  const pipeline = create2DSystemPipeline({ scripts, contacts, gameplay, presentation });
  pipeline.init(document, scene);
  if (savedSnapshot) {
    const normalized = gameSnapshot.parse(savedSnapshot);
    pipeline.restore({
      input: null,
      scripts: normalized,
      physics: null,
      contacts: normalized,
      gameplay: { gameplaySnapshot: normalized },
      presentation: null
    });
  }

  const systemContext: GameSystemContext2D = {
    input: { pressed: [], justPressed: [] },
    pressed: new Set(),
    scriptCalls: [],
    queues: { despawns: new Set(), spawns: [] },
    scriptStats: undefined,
    observations: new Map(),
    queuedDespawns: new Set(),
    queuedSpawns: [],
    result: undefined,
    events: [],
    emit: () => {},
    get states() {
      return states;
    },
    set states(value) {
      states = value;
    },

    get scene() {
      return scene;
    },
    set scene(value) {
      scene = value;
    },
    get scriptState() {
      return scriptState;
    },
    set scriptState(value) {
      scriptState = value;
    },

    get tick() {
      return tick;
    },
    set tick(value) {
      tick = value;
    },
    get previousEvents() {
      return previousEvents;
    },
    set previousEvents(value) {
      previousEvents = value;
    },
    scriptRunner,
    get rngState() {
      return rngState;
    },
    set rngState(value) {
      rngState = value;
    },
    document,
    isSpawnedId,
    get hud() {
      return hud;
    },
    set hud(value) {
      hud = value;
    },

    get activeContacts() {
      return activeContacts;
    },
    set activeContacts(value) {
      activeContacts = value;
    },
    get score() {
      return score;
    },
    set score(value) {
      score = value;
    },
    get won() {
      return won;
    },
    set won(value) {
      won = value;
    },
    get sceneId() {
      return sceneId;
    },
    set sceneId(value) {
      sceneId = value;
    },

    get failed() {
      return failed;
    },
    set failed(value) {
      failed = value;
    },
    get spawnSequence() {
      return spawnSequence;
    },
    set spawnSequence(value) {
      spawnSequence = value;
    },
    initialState,
    get music() {
      return music;
    },
    set music(value) {
      music = value;
    },
    initialSceneStates,
    get presentationEvents() {
      return presentationEvents;
    },
    set presentationEvents(value) {
      presentationEvents = value;
    },
    frameFor
  };
  function step(input: GameInputFrame): GameStepResult {
    if (disposed) {
      throw new Error("Game session is disposed");
    }
    if (failed) {
      throw new Error("Game session stopped after a failed step");
    }
    const pressed = new Set<string>();
    for (const action of input.pressed) {
      if (!document.inputActions.includes(action)) {
        throw new Error(`Unknown input action ${action}`);
      }
    }
    return runGameplayTick(
      ({ events, emit }) => {
        systemContext.input = input;
        systemContext.pressed = pressed;
        systemContext.queuedDespawns = new Set();
        systemContext.queuedSpawns = [];
        systemContext.queues = { despawns: systemContext.queuedDespawns, spawns: systemContext.queuedSpawns };
        systemContext.scriptCalls = [];
        systemContext.scriptStats = undefined;
        systemContext.result = undefined;
        systemContext.events = events;
        systemContext.emit = emit;
        const timings = options.recordTimings ? pipeline.stepTimed(systemContext) : undefined;
      if (!options.recordTimings) { pipeline.step(systemContext); }
        const result = readStepResult2D(systemContext);
        return timings ? { ...result, timings } : result;
      },
      () => {
        failed = true;
      },
      eventSink
    );
  }

  return {
    takePresentationEvents(): readonly GameEvent[] {
      const pending = presentationEvents;
      presentationEvents = [];
      return pending;
    },
    step,
    frame(): GameRenderFrame {
      if (disposed) {
        throw new Error("Game session is disposed");
      }
      if (failed) {
        throw new Error("Game session stopped after a failed step");
      }
      return frameFor(document, scene, states, tick, score, won, hud);
    },
    inspect(query): GameInspection {
      const current = snapshot();
      return {
        tick,
        sceneId,
        score,
        won,
        entities: query?.entityId ? current.entities.filter((entity) => entity.id === query.entityId) : current.entities
      };
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

export function createGameSession(
  document: GameDocument,
  seed: number,
  savedSnapshot?: GameSnapshot,
  eventSink?: (event: GameEvent) => void,
  options: GameSessionOptions = {}
): GameSession {
  return createGameSessionWithRunner(document, seed, savedSnapshot, eventSink, undefined, options);
}

export async function createScriptedGameSession(
  document: GameDocument,
  seed: number,
  savedSnapshot?: GameSnapshot,
  eventSink?: (event: GameEvent) => void,
  options: GameSessionOptions = {}
): Promise<GameSession> {
  const validation = validateGame(document);
  if (!validation.valid || !validation.document) throw new Error(`Invalid game: ${validation.errors.join("; ")}`);
  if (!hasGameScripts(validation.document)) return createGameSession(validation.document, seed, savedSnapshot, eventSink, options);
  const runner = await prepareGameScripts(validation.document);
  try {
    return createGameSessionWithRunner(validation.document, seed, savedSnapshot, eventSink, runner, options);
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
