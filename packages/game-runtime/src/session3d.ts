import { frame3D } from "./systems/presentation3d.js";
import {
  gameSnapshot3D,
  type GameAssetBinding3D,
  type GameDocument3D,
  type GameEntity3D,
  type GameEntityState3D,
  type GameEvent3D,
  type GameParticleEmission,
  type GameInputFrame3D,
  type GameInspection3D,
  type GameInspectionQuery3D,
  type GameRenderFrame3D,
  type GameScene3D,
  type GameSnapshot3D,
  type GameStepResult3D
} from "@nodetool-ai/protocol";
import { initialGameplayState, runGameplayTick } from "./gameplay/lifecycle.js";
import type { GameScriptStats } from "./scripts.js";
import { prepareGameScripts3D, type GameScriptRunner3D } from "./scripts3d.js";
import { validateGame3D } from "./validate3d.js";
import { initialCamera3D, resolveCamera3D } from "./spatial3d/camera.js";
import { digestGame3D } from "./spatial3d/digest.js";
import { ZERO3 } from "./spatial3d/math.js";
import { pairKey3D, type Contact3D, type EntityState3D } from "./spatial3d/state.js";
import { GAME_PHYSICS_BUILD_3D, prepareRapier3D, SpatialWorld3D, type PreparedCollider3D } from "./spatial3d/world.js";

import { statefulGameSystem } from "./systems/pipeline.js";
import { create3DSystemPipeline } from "./systems/tick3d.js";

import { updateVisualHierarchy3D } from "./systems/hierarchy3d.js";
import type { GameSystemContext3D } from "./systems/context3d.js";
import { stepScripts3D } from "./systems/scripts3d.js";
import { stepPhysics3D } from "./systems/physics3d.js";
import { stepContacts3D } from "./systems/contacts3d.js";
import { stepGameplay3D } from "./systems/gameplay3d.js";
import { stepAnimation3D } from "./systems/animation3d.js";
import { stepPresentation3D, readStepResult3D } from "./systems/presentation3d.js";

export interface GameSession3DOptions {
  readonly recordTimings?: boolean;
  readonly signal?: AbortSignal;
  readonly eventSink?: (event: GameEvent3D) => void;
  readonly resolveCollider?: (
    binding: Extract<GameAssetBinding3D, { mediaKind: "collider" }>,
    signal?: AbortSignal
  ) => Promise<PreparedCollider3D & { readonly digest: string }>;
}

export interface GameSession3D {
  step(input: GameInputFrame3D): GameStepResult3D & { readonly scriptStats?: GameScriptStats };
  takePresentationEvents(): readonly (GameEvent3D | GameParticleEmission)[];
  frame(): GameRenderFrame3D;
  inspect(query?: GameInspectionQuery3D): GameInspection3D;
  snapshot(): GameSnapshot3D;
  dispose(): void;
}

function initialState3D(definition: GameEntity3D, spawnTick: number): EntityState3D {
  const animation = definition.animator3d;
  const clipId = animation?.initialClip ? animation.clips[animation.initialClip] : undefined;
  const state: EntityState3D = {
    definition, definitionId: definition.id, ...initialGameplayState(definition, spawnTick),
    transform: structuredClone(definition.transform3d), localTransform: structuredClone(definition.transform3d),
    previousTransform: structuredClone(definition.transform3d), velocity: { ...(definition.body3d?.velocity ?? ZERO3) },
    angularVelocity: { ...(definition.body3d?.angularVelocity ?? ZERO3) }
  };
  if (definition.props !== undefined) { state.props = structuredClone(definition.props); }
  if (definition.character3d) {
    state.controller = { grounded: false, coyoteRemaining: 0, jumpBufferRemaining: 0, verticalVelocity: definition.body3d?.velocity.y ?? 0 };
  }
  if (animation && clipId) {
    state.animation = { clipId, startTick: spawnTick, playbackRate: animation.playbackRate, loop: animation.loop };
  }
  return state;
}

function restoreEntityStates3D(
  document: GameDocument3D,
  scene: GameScene3D,
  entities: readonly GameSnapshot3D["entities"][number][]
): EntityState3D[] {
  return entities.map((entity): EntityState3D => {
    const source = entity.prefabId
      ? document.prefabs[entity.prefabId]?.entities.find((definition) => definition.id === entity.sourceId)
      : scene.entities.find((definition) => definition.id === (entity.sourceId ?? entity.id));
    if (!source) throw new Error(`Snapshot entity definition missing for ${entity.id}`);
    const definition = {
      ...source,
      id: entity.id,
      parentId: entity.parentId,
      templateOnly: entity.sourceId ? false : source.templateOnly
    };
    const state: EntityState3D = {
      ...initialState3D(definition, entity.spawnTick),
      sourceId: entity.sourceId,
      prefabId: entity.prefabId,
      instanceId: entity.instanceId,
      active: entity.active,
      health: entity.health,
      transform: structuredClone(entity.transform),
      localTransform: structuredClone(entity.localTransform ?? source.transform3d),
      previousTransform: structuredClone(entity.previousTransform),
      velocity: { ...entity.velocity },
      angularVelocity: { ...entity.angularVelocity },
      animation: structuredClone(entity.animation),
      opacity: entity.opacity
    };
    if (entity.props !== undefined) { state.props = structuredClone(entity.props); }
    if (entity.controller) state.controller = { ...entity.controller, grounded: entity.grounded };
    return state;
  });
}

function sceneStates3D(scene: GameScene3D, spawnTick: number): EntityState3D[] {
  const states = scene.entities.map((definition) => initialState3D(definition, spawnTick));
  updateVisualHierarchy3D(states);
  for (const state of states) state.previousTransform = structuredClone(state.transform);
  return states;
}

function snapshotEntity3D(state: EntityState3D): GameEntityState3D {
  const entity: GameEntityState3D = {
    id: state.definition.id, spawnTick: state.spawnTick, active: state.active,
    transform: structuredClone(state.transform), localTransform: structuredClone(state.localTransform), previousTransform: structuredClone(state.previousTransform),
    velocity: { ...state.velocity }, angularVelocity: { ...state.angularVelocity }, grounded: state.controller?.grounded ?? false
  };
  if (state.props !== undefined) { entity.props = structuredClone(state.props); }
  if (state.sourceId) entity.sourceId = state.sourceId;
  if (state.prefabId) entity.prefabId = state.prefabId;
  if (state.instanceId) entity.instanceId = state.instanceId;
  if (state.definition.parentId) entity.parentId = state.definition.parentId;
  if (state.health !== undefined) entity.health = state.health;
  if (state.opacity !== undefined) entity.opacity = state.opacity;
  if (state.animation) entity.animation = structuredClone(state.animation);
  if (state.controller) {
    entity.controller = { coyoteRemaining: state.controller.coyoteRemaining, jumpBufferRemaining: state.controller.jumpBufferRemaining,
      verticalVelocity: state.controller.verticalVelocity };
    if (state.controller.supportId) entity.controller.supportId = state.controller.supportId;
  }
  return entity;
}

function remapDefinition3D(definition: GameEntity3D, mapping: Readonly<Record<string, string>>): GameEntity3D {
  const camera = definition.camera3d;
  const behavior = camera?.behavior;
  const remapped: GameEntity3D = { ...definition, id: mapping[definition.id], templateOnly: false };
  if (definition.parentId) remapped.parentId = mapping[definition.parentId] ?? definition.parentId;
  if (camera && behavior?.kind === "follow") remapped.camera3d = { ...camera, behavior: { ...behavior, targetId: mapping[behavior.targetId] ?? behavior.targetId } };
  return remapped;
}

/** Prepare assets and WASM once; the returned fixed-step session performs no asynchronous work. */
export async function createGameSession3D(
  value: GameDocument3D,
  seed: number,
  savedSnapshot?: GameSnapshot3D,
  options: GameSession3DOptions = {}
): Promise<GameSession3D> {
  options.signal?.throwIfAborted();
  const validation = validateGame3D(value);
  if (!validation.valid || !validation.document) throw new Error(`Invalid 3D game: ${validation.errors.join("; ")}`);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("Game seed must be a nonnegative safe integer");
  const document = validation.document;
  const contentDigest = await digestGame3D(document);
  const saved = savedSnapshot ? gameSnapshot3D.parse(savedSnapshot) : undefined;
  if (
    saved &&
    (saved.gameRevision !== document.revision || saved.contentDigest !== contentDigest || saved.physicsBuild !== GAME_PHYSICS_BUILD_3D)
  ) {
    throw new Error("Snapshot revision, source digest, or physics build does not match the game");
  }
  const prepared = new Map<string, PreparedCollider3D>();
  for (const [slot, binding] of Object.entries(document.assets)) {
    if (binding.mediaKind !== "collider") continue;
    if (!options.resolveCollider) throw new Error(`Prepared collider resolver required for ${slot}`);
    const geometry = await options.resolveCollider(binding, options.signal);
    options.signal?.throwIfAborted();
    if (geometry.digest !== binding.digest) throw new Error(`Prepared collider digest mismatch for ${slot}`);
    if (
      geometry.vertices.length === 0 ||
      geometry.vertices.length % 3 !== 0 ||
      geometry.vertices.length > 3_000_000 ||
      geometry.vertices.some((number) => !Number.isFinite(number)) ||
      (geometry.indices && (geometry.indices.length % 3 !== 0 || geometry.indices.some((index) => index >= geometry.vertices.length / 3)))
    ) {
      throw new Error(`Invalid prepared collider geometry for ${slot}`);
    }
    prepared.set(slot, geometry);
  }
  options.signal?.throwIfAborted();
  const rapier = await prepareRapier3D();
  options.signal?.throwIfAborted();
  let runner: GameScriptRunner3D | undefined;
  let spatial: SpatialWorld3D | undefined;
  try {
    if (
      document.scenes.some((scene) => scene.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "script"))) ||
      Object.values(document.prefabs).some((prefab) =>
        prefab.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "script"))
      )
    ) {
      const scriptDocument = {
        ...document,
        scenes: [
          ...document.scenes,
          ...Object.entries(document.prefabs).map(([id, prefab]) => ({
            ...document.scenes[0],
            id: `prefab:${id}`,
            entities: prefab.entities
          }))
        ]
      };
      runner = await prepareGameScripts3D(scriptDocument);
    }
    options.signal?.throwIfAborted();
    if (saved?.pendingCommands.length) throw new Error("Committed snapshots cannot contain unapplied commands");
    if (saved && new Set(saved.entities.map((entity) => entity.id)).size !== saved.entities.length)
      throw new Error("Snapshot entity IDs must be unique");
    let scene = document.scenes.find((candidate) => candidate.id === (saved?.sceneId ?? document.entrySceneId));
    if (!scene) throw new Error("Snapshot scene is missing");
    function currentScene(): GameScene3D {
      if (!scene) {
        throw new Error("Session scene is missing");
      }
      return scene;
    }
    let tick = saved?.tick ?? 0;
    let rngState = saved?.rngState ?? seed >>> 0;
    let score = saved?.score ?? 0;
    let won = saved?.won ?? false;
    let spawnSequence = saved?.spawnSequence ?? 0;
    let scriptState = structuredClone(saved?.scriptState ?? {});
    let previousEvents = structuredClone(saved?.pendingEvents ?? []);
    let queries = structuredClone(saved?.queryResults ?? []);
    let hud = new Map((saved?.hud ?? []).map((label) => [label.id, structuredClone(label)]));
    let instances = structuredClone(saved?.prefabInstances ?? []);
    let music =
      saved?.music ??
      (scene.music
        ? {
            ...scene.music,
            voiceId: `scene:${scene.id}:music`,
            startTick: tick
          }
        : null);
    let states = sceneStates3D(scene, tick);
    let activeContacts = new Map<string, Contact3D>(
      (saved?.activeContacts ?? []).map((contact) => [pairKey3D(contact.entityId, contact.otherId), { ...contact, normal: ZERO3, time: 0 }])
    );
    spatial = new SpatialWorld3D(rapier, scene, states, prepared);
    const currentSpatial = (): SpatialWorld3D => {
      if (!spatial) throw new Error("3D spatial session is not initialized");
      return spatial;
    };
    let cameraEntity = states.find((state) => state.definition.id === currentScene().activeCameraId);
    if (!cameraEntity) {
      throw new Error("Active camera is missing");
    }
    let camera = initialCamera3D(cameraEntity);
    if (!saved) resolveCamera3D(camera, cameraEntity, states, currentSpatial());
    let previousCamera = structuredClone(camera.transform);
    function currentCameraEntity(): EntityState3D {
      if (!cameraEntity) {
        throw new Error("Active camera is missing");
      }
      return cameraEntity;
    }
    let failed = false;
    let disposed = false;
    const assertAvailable = (): void => {
      if (disposed) throw new Error("Game session is disposed");
      if (failed) throw new Error("Game session stopped after a failed step");
    };
    const frame = (): GameRenderFrame3D => {
      assertAvailable();
      return frame3D(document, currentScene(), states, camera, previousCamera, tick, score, won, hud);
    };
    const snapshot = (): GameSnapshot3D => {
      assertAvailable();
      const gameplayState = captureGameplay();
      const scriptSnapshot = captureScripts();
      const contactsState = captureContacts();
      const animationState = captureAnimation();
      const physicsState = capturePhysics();
      return {
        dimension: "3d",
        schemaVersion: 3,
        engineVersion: "2",
        gameRevision: document.revision,
        contentDigest,
        physicsBuild: GAME_PHYSICS_BUILD_3D,
        sceneId: gameplayState.sceneId,
        tick: gameplayState.tick,
        rngState: scriptSnapshot.rngState,
        score: gameplayState.score,
        won: gameplayState.won,
        spawnSequence: gameplayState.spawnSequence,
        scriptState: scriptSnapshot.scriptState,
        pendingEvents: scriptSnapshot.pendingEvents,
        pendingCommands: [],
        queryResults: scriptSnapshot.queryResults,
        activeContacts: contactsState.activeContacts,
        entities: gameplayState.entities,
        camera: animationState.camera,
        hud: gameplayState.hud,
        music: gameplayState.music,
        prefabInstances: gameplayState.prefabInstances,
        physics: physicsState.physics
      };
    };
    let presentationEvents: (GameEvent3D | GameParticleEmission)[] = [];
    const captureScripts = () => ({
      scriptState: structuredClone(scriptState),
      rngState,
      pendingEvents: structuredClone(previousEvents),
      queryResults: structuredClone(queries)
    });
    const capturePhysics = () => ({ physics: currentSpatial().snapshot() });
    const captureContacts = () => ({
      activeContacts: [...activeContacts.values()].map(({ entityId, otherId, sensor }) => ({ entityId, otherId, sensor }))
    });
    const captureGameplay = () => ({
      sceneId: currentScene().id,
      tick,
      score,
      won,
      spawnSequence,
      entities: states.map(snapshotEntity3D),
      hud: [...hud.values()].map((label) => ({ ...label })),
      music: structuredClone(music),
      prefabInstances: structuredClone(instances)
    });
    const captureAnimation = () => ({ camera: structuredClone(camera) });
    type SystemState = Partial<GameSnapshot3D> | null;
    const scripts = statefulGameSystem<GameDocument3D, GameScene3D, GameSystemContext3D, SystemState>(
      "scripts",
      stepScripts3D,
      captureScripts,
      (state) => {
        if (!state?.scriptState || state.rngState === undefined || !state.pendingEvents || !state.queryResults) {
          throw new Error("Missing script system state");
        }
        scriptState = structuredClone(state.scriptState);
        rngState = state.rngState;
        previousEvents = structuredClone(state.pendingEvents);
        queries = structuredClone(state.queryResults);
      }
    );
    const physics = statefulGameSystem<GameDocument3D, GameScene3D, GameSystemContext3D, SystemState>(
      "physics",
      stepPhysics3D,
      capturePhysics,
      (state) => {
        if (!state?.physics) { throw new Error("Missing physics system state"); }
        const restored = new SpatialWorld3D(rapier, currentScene(), states, prepared, state.physics);
        currentSpatial().dispose();
        spatial = restored;
      }
    );
    const contacts = statefulGameSystem<GameDocument3D, GameScene3D, GameSystemContext3D, SystemState>(
      "contacts",
      stepContacts3D,
      captureContacts,
      (state) => {
        if (!state?.activeContacts) { throw new Error("Missing contact system state"); }
        activeContacts = new Map(
          state.activeContacts.map((contact) => [pairKey3D(contact.entityId, contact.otherId), { ...contact, normal: ZERO3, time: 0 }])
        );
      }
    );
    const gameplay = statefulGameSystem<GameDocument3D, GameScene3D, GameSystemContext3D, SystemState>(
      "gameplay",
      stepGameplay3D,
      captureGameplay,
      (state) => {
        if (
          !state ||
          state.tick === undefined ||
          state.score === undefined ||
          state.won === undefined ||
          state.spawnSequence === undefined ||
          !state.entities ||
          !state.hud ||
          state.music === undefined ||
          !state.prefabInstances
        ) {
          throw new Error("Missing gameplay system state");
        }
        const restoredScene = document.scenes.find((candidate) => candidate.id === state.sceneId);
        if (!restoredScene) { throw new Error("Restored scene is missing"); }
        scene = restoredScene;
        tick = state.tick;
        score = state.score;
        won = state.won;
        spawnSequence = state.spawnSequence;
        hud = new Map(state.hud.map((label) => [label.id, structuredClone(label)]));
        music = structuredClone(state.music ?? (restoredScene.music
          ? { ...restoredScene.music, voiceId: `scene:${restoredScene.id}:music`, startTick: state.tick }
          : null));
        instances = structuredClone(state.prefabInstances);
        states = restoreEntityStates3D(document, restoredScene, state.entities);
        cameraEntity = states.find((entity) => entity.definition.id === restoredScene.activeCameraId);
        if (!cameraEntity) {
          throw new Error("Active camera is missing");
        }
      }
    );
    const animation = statefulGameSystem<GameDocument3D, GameScene3D, GameSystemContext3D, SystemState>(
      "animation",
      stepAnimation3D,
      captureAnimation,
      (state) => {
        if (!state?.camera) { throw new Error("Missing animation system state"); }
        camera = structuredClone(state.camera);
        previousCamera = structuredClone(camera.transform);
      }
    );
    const presentation = statefulGameSystem<GameDocument3D, GameScene3D, GameSystemContext3D, SystemState>(
      "presentation",
      stepPresentation3D,
      () => null,
      () => {
        presentationEvents = [];
      }
    );
    const pipeline = create3DSystemPipeline({
      scripts,
      physics,
      contacts,
      gameplay,
      animation,
      presentation
    });
    pipeline.init(document, scene);
    if (saved) {
      pipeline.restore({
        input: null,
        scripts: saved,
        character: null,
        physics: saved,
        contacts: saved,
        gameplay: saved,
        animation: saved,
        presentation: null
      });
    }
    const systemContext: GameSystemContext3D = {
      input: { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } },
      queues: { despawns: new Set(), spawns: [] },
      calls: [],
      intents: new Map(),
      posed: new Set(),
      spatialQueries: [],
      events: [],
      emit: () => {},
      scriptStats: undefined,
      spatialStep: undefined,
      contacts: [],
      result: undefined,
      document,
      get states() {
        return states;
      },
      set states(value) {
        states = value;
      },
      get previousCamera() {
        return previousCamera;
      },
      set previousCamera(value) {
        previousCamera = value;
      },
      get camera() {
        return camera;
      },
      set camera(value) {
        camera = value;
      },
      currentCameraEntity,
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
      get scriptState() {
        return scriptState;
      },
      set scriptState(value) {
        scriptState = value;
      },
      currentScene,
      runner,
      get queries() {
        return queries;
      },
      set queries(value) {
        queries = value;
      },
      get rngState() {
        return rngState;
      },
      set rngState(value) {
        rngState = value;
      },
      currentSpatial,
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
      get instances() {
        return instances;
      },
      set instances(value) {
        instances = value;
      },
      get spawnSequence() {
        return spawnSequence;
      },
      set spawnSequence(value) {
        spawnSequence = value;
      },
      get hud() {
        return hud;
      },
      set hud(value) {
        hud = value;
      },
      rapier,
      prepared,
      get spatial() {
        return currentSpatial();
      },
      set spatial(value) {
        spatial = value;
      },
      get scene() {
        return currentScene();
      },
      set scene(value) {
        scene = value;
      },
      get music() {
        return music;
      },
      set music(value) {
        music = value;
      },
      get cameraEntity() {
        return currentCameraEntity();
      },
      set cameraEntity(value) {
        cameraEntity = value;
      },
      initialState3D,
      remapDefinition3D,
      sceneStates3D,
      get presentationEvents() {
        return presentationEvents;
      },
      set presentationEvents(value) {
        presentationEvents = value;
      },
      frame
    };
    return {
      takePresentationEvents(): readonly (GameEvent3D | GameParticleEmission)[] {
        const pending = presentationEvents;
        presentationEvents = [];
        return pending;
      },
      step(value): GameStepResult3D & { readonly scriptStats?: GameScriptStats } {
        assertAvailable();
        return runGameplayTick<GameStepResult3D & { readonly scriptStats?: GameScriptStats }, GameEvent3D>(
          ({ events, emit }) => {
            systemContext.input = value;
            systemContext.queues = { despawns: new Set(), spawns: [] };
            systemContext.calls = [];
            systemContext.intents = new Map();
            systemContext.posed = new Set();
            systemContext.spatialQueries = [];
            systemContext.events = events;
            systemContext.emit = emit;
            systemContext.scriptStats = undefined;
            systemContext.spatialStep = undefined;
            systemContext.result = undefined;
            const timings = options.recordTimings ? pipeline.stepTimed(systemContext) : undefined;
            if (!options.recordTimings) { pipeline.step(systemContext); }
            const result = readStepResult3D(systemContext);
            return timings ? { ...result, timings } : result;
          },
          () => {
            failed = true;
            runner?.retain?.(new Set());
          },
          options.eventSink
        );
      },
      frame,
      inspect(query): GameInspection3D {
        assertAvailable();
        return {
          dimension: "3d",
          tick,
          sceneId: currentScene().id,
          score,
          won,
          entities: states.filter((state) => !query?.entityId || state.definition.id === query.entityId).map(snapshotEntity3D),
          camera: structuredClone(camera)
        };
      },
      snapshot,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        currentSpatial().dispose();
        runner?.dispose();
        states = [];
      }
    };
  } catch (error) {
    spatial?.dispose();
    runner?.dispose();
    throw error;
  }
}

export async function replayGame3D(document: GameDocument3D, seed: number, inputs: readonly GameInputFrame3D[], savedSnapshot?: GameSnapshot3D,
  options?: GameSession3DOptions): Promise<{ readonly snapshot: GameSnapshot3D; readonly steps: readonly GameStepResult3D[] }> {
  const session = await createGameSession3D(document, seed, savedSnapshot, options);
  try {
    const steps = inputs.map((input) => session.step(input));
    return { snapshot: session.snapshot(), steps };
  } finally {
    session.dispose();
  }
}
