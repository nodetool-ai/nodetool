import {
  gameInputFrame3D, gameSnapshot3D, type GameAssetBinding3D, type GameCameraState3D,
  type GameDocument3D, type GameEntity3D, type GameEntityState3D, type GameEvent3D, type GameHudLabel,
  type GameInputFrame3D, type GameInspection3D, type GameInspectionQuery3D, type GameQueryResult3D,
  type GameRenderFrame3D, type GameScene3D, type GameScriptCommand3D, type GameSnapshot3D,
  type GameStepResult3D, type GameVector3
} from "@nodetool-ai/protocol";
import {
  advanceGameplayRandom, applyGameplayCommand, claimGameplayContact, finalizeGameplayEntities,
  initialGameplayState, MAX_GAME_SPAWNED_INSTANCES, projectGameplayHud, queueGameplayBehavior,
  runGameplayPhases, runGameplayTick, type GameplayQueues
} from "./gameplay/lifecycle.js";
import { scriptSourceKey, type GameScriptStats } from "./scripts.js";
import { prepareGameScripts3D, type GameScriptCall3D, type GameScriptRunner3D } from "./scripts3d.js";
import { validateGame3D } from "./validate3d.js";
import { applyCameraLook3D, initialCamera3D, resolveCamera3D } from "./spatial3d/camera.js";
import { digestGame3D } from "./spatial3d/digest.js";
import { compose3, ZERO3 } from "./spatial3d/math.js";
import { pairKey3D, type Contact3D, type EntityState3D } from "./spatial3d/state.js";
import { GAME_PHYSICS_BUILD_3D, prepareRapier3D, SpatialWorld3D, type PreparedCollider3D } from "./spatial3d/world.js";

export interface GameSession3DOptions {
  readonly signal?: AbortSignal;
  readonly eventSink?: (event: GameEvent3D) => void;
  readonly resolveCollider?: (binding: Extract<GameAssetBinding3D, { mediaKind: "collider" }>, signal?: AbortSignal) => Promise<PreparedCollider3D & { readonly digest: string }>;
}

export interface GameSession3D {
  step(input: GameInputFrame3D): GameStepResult3D & { readonly scriptStats?: GameScriptStats };
  frame(): GameRenderFrame3D;
  inspect(query?: GameInspectionQuery3D): GameInspection3D;
  snapshot(): GameSnapshot3D;
  dispose(): void;
}

type Spawn3D = Extract<GameScriptCommand3D, { kind: "spawn" }> | { readonly prefabId: string };

function initialState3D(definition: GameEntity3D, spawnTick: number): EntityState3D {
  const animation = definition.animator3d;
  const clipId = animation?.initialClip ? animation.clips[animation.initialClip] : undefined;
  const state: EntityState3D = {
    definition, definitionId: definition.id, ...initialGameplayState(definition, spawnTick),
    transform: structuredClone(definition.transform3d), localTransform: structuredClone(definition.transform3d),
    previousTransform: structuredClone(definition.transform3d), velocity: { ...(definition.body3d?.velocity ?? ZERO3) },
    angularVelocity: { ...(definition.body3d?.angularVelocity ?? ZERO3) }
  };
  if (definition.character3d) {
    state.controller = { grounded: false, coyoteRemaining: 0, jumpBufferRemaining: 0, verticalVelocity: definition.body3d?.velocity.y ?? 0 };
  }
  if (animation && clipId) {
    state.animation = { clipId, startTick: spawnTick, playbackRate: animation.playbackRate, loop: animation.loop };
  }
  return state;
}

function updateVisualHierarchy3D(states: readonly EntityState3D[]): void {
  const byId = new Map(states.map((state) => [state.definition.id, state]));
  const children = new Map<string, EntityState3D[]>();
  const queue: EntityState3D[] = [];
  for (const state of states) {
    const parentId = state.definition.parentId;
    if (!parentId) queue.push(state);
    else {
      const siblings = children.get(parentId) ?? [];
      siblings.push(state);
      children.set(parentId, siblings);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const state = queue[index];
    const parent = state.definition.parentId ? byId.get(state.definition.parentId) : undefined;
    if (parent) {
      state.transform = compose3(parent.transform, state.localTransform);
      state.active = state.active && parent.active;
    }
    queue.push(...children.get(state.definition.id) ?? []);
  }
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

function frame3D(document: GameDocument3D, scene: GameScene3D, states: readonly EntityState3D[], camera: GameCameraState3D,
  tick: number, score: number, won: boolean, hud: ReadonlyMap<string, GameHudLabel>): GameRenderFrame3D {
  const cameraDefinition = states.find((state) => state.definition.id === camera.entityId)?.definition.camera3d;
  if (!cameraDefinition) throw new Error(`Missing active camera ${camera.entityId}`);
  return {
    dimension: "3d", gameId: document.id, sceneId: scene.id, tick, presentation: document.presentation,
    fonts: Object.fromEntries(Object.entries(document.assets).flatMap(([slot, binding]) => binding.mediaKind === "font" ? [[slot, binding]] : [])),
    camera: { entityId: camera.entityId, transform: structuredClone(camera.transform), projection: cameraDefinition.projection },
    entities: states.filter((state) => state.active).map((state) => {
      const lifetime = state.definition.behaviors.find((behavior) => behavior.kind === "lifetime");
      const progress = lifetime?.kind === "lifetime" ? Math.max(0, Math.min(1, (tick - state.spawnTick) / lifetime.ticks)) : 0;
      const transform = structuredClone(state.transform);
      const previousTransform = structuredClone(state.previousTransform);
      if (lifetime?.kind === "lifetime") {
        const scale = 1 + (lifetime.endScale - 1) * progress;
        const previousScale = 1 + (lifetime.endScale - 1) * Math.max(0, (tick - state.spawnTick - 1) / lifetime.ticks);
        transform.scale = { x: transform.scale.x * scale, y: transform.scale.y * scale, z: transform.scale.z * scale };
        previousTransform.scale = { x: previousTransform.scale.x * previousScale, y: previousTransform.scale.y * previousScale, z: previousTransform.scale.z * previousScale };
      }
      const entity: GameRenderFrame3D["entities"][number] = { entityId: state.definition.id, transform, previousTransform,
        opacity: (state.opacity ?? 1) * (lifetime?.kind === "lifetime" && lifetime.fade ? 1 - progress : 1) };
      if (state.definition.primitive) entity.primitive = state.definition.primitive;
      if (state.definition.model) entity.model = state.definition.model;
      if (state.animation) entity.animation = structuredClone(state.animation);
      return entity;
    }),
    lights: states.filter((state) => state.active && state.definition.light3d).map((state) => ({ entityId: state.definition.id, transform: structuredClone(state.transform), light: state.definition.light3d! })),
    environment: scene.environment,
    hud: projectGameplayHud(document.scenes.some((candidate) => candidate.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "collectible" || behavior.kind === "winWhenCollected"))), score, won, hud)
  };
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
export async function createGameSession3D(value: GameDocument3D, seed: number, savedSnapshot?: GameSnapshot3D, options: GameSession3DOptions = {}): Promise<GameSession3D> {
  options.signal?.throwIfAborted();
  const validation = validateGame3D(value);
  if (!validation.valid || !validation.document) throw new Error(`Invalid 3D game: ${validation.errors.join("; ")}`);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("Game seed must be a nonnegative safe integer");
  const document = validation.document;
  const contentDigest = await digestGame3D(document);
  const saved = savedSnapshot ? gameSnapshot3D.parse(savedSnapshot) : undefined;
  if (saved && (saved.gameRevision !== document.revision || saved.contentDigest !== contentDigest || saved.physicsBuild !== GAME_PHYSICS_BUILD_3D)) {
    throw new Error("Snapshot revision, source digest, or physics build does not match the game");
  }
  const prepared = new Map<string, PreparedCollider3D>();
  for (const [slot, binding] of Object.entries(document.assets)) {
    if (binding.mediaKind !== "collider") continue;
    if (!options.resolveCollider) throw new Error(`Prepared collider resolver required for ${slot}`);
    const geometry = await options.resolveCollider(binding, options.signal);
    options.signal?.throwIfAborted();
    if (geometry.digest !== binding.digest) throw new Error(`Prepared collider digest mismatch for ${slot}`);
    if (geometry.vertices.length === 0 || geometry.vertices.length % 3 !== 0 || geometry.vertices.length > 3_000_000 ||
      geometry.vertices.some((number) => !Number.isFinite(number)) || geometry.indices && (geometry.indices.length % 3 !== 0 || geometry.indices.some((index) => index >= geometry.vertices.length / 3))) {
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
    if (document.scenes.some((scene) => scene.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "script"))) ||
      Object.values(document.prefabs).some((prefab) => prefab.entities.some((entity) => entity.behaviors.some((behavior) => behavior.kind === "script")))) {
      const scriptDocument = { ...document, scenes: [...document.scenes, ...Object.entries(document.prefabs).map(([id, prefab]) => ({ ...document.scenes[0], id: `prefab:${id}`, entities: prefab.entities }))] };
      runner = await prepareGameScripts3D(scriptDocument);
    }
    options.signal?.throwIfAborted();
    if (saved?.pendingCommands.length) throw new Error("Committed snapshots cannot contain unapplied commands");
    if (saved && new Set(saved.entities.map((entity) => entity.id)).size !== saved.entities.length) throw new Error("Snapshot entity IDs must be unique");
    let scene = document.scenes.find((candidate) => candidate.id === (saved?.sceneId ?? document.entrySceneId));
    if (!scene) throw new Error("Snapshot scene is missing");
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
    let music = saved?.music ?? (scene.music ? { ...scene.music, voiceId: `scene:${scene.id}:music`, startTick: tick } : null);
    let states = saved ? saved.entities.map((entity): EntityState3D => {
      const source = entity.prefabId ? document.prefabs[entity.prefabId]?.entities.find((definition) => definition.id === entity.sourceId) :
        scene!.entities.find((definition) => definition.id === (entity.sourceId ?? entity.id));
      if (!source) throw new Error(`Snapshot entity definition missing for ${entity.id}`);
      const definition = { ...source, id: entity.id, parentId: entity.parentId, templateOnly: entity.sourceId ? false : source.templateOnly };
      const state: EntityState3D = { ...initialState3D(definition, entity.spawnTick), sourceId: entity.sourceId, prefabId: entity.prefabId, instanceId: entity.instanceId,
        active: entity.active, health: entity.health, transform: structuredClone(entity.transform), localTransform: structuredClone(entity.localTransform ?? source.transform3d),
        previousTransform: structuredClone(entity.previousTransform), velocity: { ...entity.velocity }, angularVelocity: { ...entity.angularVelocity },
        animation: structuredClone(entity.animation), opacity: entity.opacity };
      if (entity.controller) state.controller = { ...entity.controller, grounded: entity.grounded };
      return state;
    }) : sceneStates3D(scene, tick);
    let activeContacts = new Map<string, Contact3D>((saved?.activeContacts ?? []).map((contact) => [pairKey3D(contact.entityId, contact.otherId), { ...contact, normal: ZERO3, time: 0 }]));
    spatial = new SpatialWorld3D(rapier, scene, states, prepared, saved?.physics);
    const currentSpatial = (): SpatialWorld3D => {
      if (!spatial) throw new Error("3D spatial session is not initialized");
      return spatial;
    };
    let cameraEntity = states.find((state) => state.definition.id === scene!.activeCameraId);
    if (!cameraEntity) throw new Error("Active camera is missing");
    let camera = saved ? structuredClone(saved.camera) : initialCamera3D(cameraEntity);
    if (!saved) resolveCamera3D(camera, cameraEntity, states, currentSpatial());
    let failed = false;
    let disposed = false;
    const assertAvailable = (): void => {
      if (disposed) throw new Error("Game session is disposed");
      if (failed) throw new Error("Game session stopped after a failed step");
    };
    const frame = (): GameRenderFrame3D => { assertAvailable(); return frame3D(document, scene!, states, camera, tick, score, won, hud); };
    const snapshot = (): GameSnapshot3D => {
      assertAvailable();
      return { dimension: "3d", schemaVersion: 3, engineVersion: "2", gameRevision: document.revision, contentDigest, physicsBuild: GAME_PHYSICS_BUILD_3D,
        sceneId: scene!.id, tick, rngState, score, won, spawnSequence, scriptState: structuredClone(scriptState), pendingEvents: structuredClone(previousEvents),
        pendingCommands: [], queryResults: structuredClone(queries), activeContacts: [...activeContacts.values()].map(({ entityId, otherId, sensor }) => ({ entityId, otherId, sensor })),
        entities: states.map(snapshotEntity3D), camera: structuredClone(camera), hud: [...hud.values()].map((label) => ({ ...label })),
        music: structuredClone(music), prefabInstances: structuredClone(instances), physics: currentSpatial().snapshot() };
    };
    return {
      step(value): GameStepResult3D & { readonly scriptStats?: GameScriptStats } {
        assertAvailable();
        return runGameplayTick<GameStepResult3D & { readonly scriptStats?: GameScriptStats }, GameEvent3D>(({ events, emit }) => {
          const input = gameInputFrame3D.parse(value);
          if (input.pressed.some((action) => !document.inputActions.includes(action)) || input.justPressed.some((action) => !document.inputActions.includes(action)) ||
            Object.keys(input.axes).some((axis) => !document.inputAxes.includes(axis))) throw new Error("Unknown 3D input action or axis");
          const queues: GameplayQueues<Spawn3D> = { despawns: new Set(), spawns: [] };
          const intents = new Map<string, { movement: GameVector3; jump: boolean }>();
          const posed = new Set<string>();
          const spatialQueries: { entityId: string; command: Extract<GameScriptCommand3D, { kind: "rayQuery" | "shapeQuery" }> }[] = [];
          const calls: GameScriptCall3D[] = [];
          let scriptStats: GameScriptStats | undefined;
          return runGameplayPhases({
            prepare(): void {
              for (const state of states) state.previousTransform = structuredClone(state.transform);
              applyCameraLook3D(camera, cameraEntity!, input);
              for (const state of states) {
                if (!state.active) continue;
                state.definition.behaviors.forEach((behavior, index) => {
                  queueGameplayBehavior(behavior, state.definition.id, state.spawnTick, tick, previousEvents, queues);
                  if (behavior.kind === "script") {
                    const sourceKey = scriptSourceKey(state.prefabId ? `prefab:${state.prefabId}` : scene!.id, state.sourceId ?? state.definition.id, index);
                    const stateKey = scriptSourceKey(scene!.id, state.definition.id, index);
                    calls.push({ sourceKey, stateKey, entityId: state.definition.id, source: state.sourceId ?? state.definition.id,
                      state: scriptState[stateKey] ?? null, position: { ...state.transform.position }, velocity: { ...state.velocity },
                      grounded: state.controller?.grounded ?? false, maxCommands: behavior.maxCommands, maxTickMs: behavior.maxTickMs });
                  }
                });
              }
              if (runner && calls.length > 0) {
                const batch = runner.run(calls, { ...input, tick, events: previousEvents, queries, camera: { yaw: camera.yaw, pitch: camera.pitch },
                  world: states.filter((state) => state.active).map((state) => ({ id: state.definition.id, source: state.sourceId ?? state.definition.id,
                    position: { ...state.transform.position }, velocity: { ...state.velocity }, grounded: state.controller?.grounded ?? false })) }, rngState);
                const byId = new Map(states.map((state) => [state.definition.id, state]));
                for (let index = 0; index < batch.results.length; index += 1) {
                  const result = batch.results[index];
                  scriptState[calls[index].stateKey] = result.state;
                  const state = byId.get(result.entityId);
                  if (!state) throw new Error(`Script target missing: ${result.entityId}`);
                  for (const command of result.commands) {
                    switch (command.kind) {
                      case "characterIntent":
                        if (!state.definition.character3d) throw new Error(`Character intent requires a character (${result.entityId})`);
                        intents.set(result.entityId, { movement: command.movement, jump: command.jump }); break;
                      case "setVelocity":
                        if (!state.definition.body3d || state.definition.body3d.type === "static" || state.definition.character3d) throw new Error(`Velocity requires a dynamic body or platform (${result.entityId})`);
                        currentSpatial().setVelocity(state, command.velocity); break;
                      case "impulse": currentSpatial().impulse(state, command.impulse); break;
                      case "teleport":
                        if (!state.definition.body3d || state.definition.body3d.type === "static") throw new Error(`Teleport requires a dynamic or kinematic body (${result.entityId})`);
                        currentSpatial().teleport(state, command); break;
                      case "setKinematicPose": currentSpatial().setKinematicPose(state, command); posed.add(result.entityId); break;
                      case "setVisual":
                        if (state.definition.body3d || state.definition.collider3d || state.definition.character3d) throw new Error(`Visual transform requires a nonphysical entity (${result.entityId})`);
                        if (command.rotation) state.localTransform.rotation = command.rotation;
                        if (command.scale) state.localTransform.scale = command.scale;
                        if (!state.definition.parentId) state.transform = structuredClone(state.localTransform);
                        if (command.opacity !== undefined) state.opacity = command.opacity;
                        break;
                      case "playAnimation": {
                        const animator = state.definition.animator3d;
                        const clipId = animator?.clips[command.clip];
                        if (!animator || !clipId) throw new Error(`Unknown animation ${command.clip} for ${result.entityId}`);
                        if (state.animation?.clipId !== clipId) state.animation = { clipId, startTick: tick + 1, playbackRate: animator.playbackRate, loop: animator.loop,
                          transitionTicks: animator.transitionTicks, previousClipId: state.animation?.clipId, previousStartTick: state.animation?.startTick };
                        break;
                      }
                      case "rayQuery":
                      case "shapeQuery":
                        if (spatialQueries.length >= 64) throw new Error("3D query command limit exceeded");
                        if (spatialQueries.some((query) => query.command.queryId === command.queryId)) throw new Error(`Duplicate query ID ${command.queryId}`);
                        spatialQueries.push({ entityId: result.entityId, command }); break;
                      default: applyGameplayCommand(command, result.entityId, queues, hud, emit);
                    }
                  }
                }
                rngState = batch.rngState;
                scriptStats = batch.stats;
              }
            },
            advanceSpatial(): Contact3D[] {
              const contacts = currentSpatial().step(states, input, camera.yaw, intents, posed);
              return contacts;
            },
            reduceContacts(contacts): void {
              const currentContacts = new Map(contacts.map((contact) => [pairKey3D(contact.entityId, contact.otherId), contact]));
              const byId = new Map(states.map((state) => [state.definition.id, state]));
              for (const contact of contacts) {
                const phase = activeContacts.has(pairKey3D(contact.entityId, contact.otherId)) ? "stay" : "enter";
                emit({ kind: "contact", sceneId: scene!.id, entityId: contact.entityId, otherId: contact.otherId, phase, sensor: contact.sensor, normal: contact.normal });
                if (phase !== "enter") continue;
                const a = byId.get(contact.entityId);
                const b = byId.get(contact.otherId);
                if (!a || !b) continue;
                for (const [actor, target] of [[a, b], [b, a]]) {
                  score = claimGameplayContact(actor, target, actor.definition.interactionActor ?? { collects: false, activatesTriggers: false }, queues, score, emit);
                }
              }
              for (const [key, contact] of activeContacts) {
                if (!currentContacts.has(key)) emit({ kind: "contact", sceneId: scene!.id, entityId: contact.entityId, otherId: contact.otherId, phase: "exit", sensor: contact.sensor, normal: ZERO3 });
              }
              activeContacts = currentContacts;
              won = finalizeGameplayEntities(states, queues, score, won, scene!.id, tick, events, emit);
            },
            commit(): GameStepResult3D & { readonly scriptStats?: GameScriptStats } {
              const rootRemovals = new Set(instances.filter((instance) => queues.despawns.has(instance.rootId)).map((instance) => instance.id));
              for (const state of states) {
                if (state.instanceId && rootRemovals.has(state.instanceId)) queues.despawns.add(state.definition.id);
              }
              if (queues.despawns.size > 0) {
                const children = new Map<string, string[]>();
                const removals: string[] = [];
                for (const state of states) {
                  if (state.sourceId && queues.despawns.has(state.definition.id)) removals.push(state.definition.id);
                  const parentId = state.definition.parentId;
                  if (!parentId) continue;
                  const siblings = children.get(parentId) ?? [];
                  siblings.push(state.definition.id);
                  children.set(parentId, siblings);
                }
                for (let index = 0; index < removals.length; index += 1) {
                  for (const child of children.get(removals[index]) ?? []) {
                    if (queues.despawns.has(child)) continue;
                    queues.despawns.add(child);
                    removals.push(child);
                  }
                }
              }
              for (const state of states) {
                if (queues.despawns.has(state.definition.id)) state.active = false;
                if (!state.active) currentSpatial().remove(state.definition.id);
              }
              states = states.filter((state) => {
                if (!state.sourceId || !queues.despawns.has(state.definition.id)) return true;
                state.definition.behaviors.forEach((behavior, index) => { if (behavior.kind === "script") delete scriptState[scriptSourceKey(scene!.id, state.definition.id, index)]; });
                return false;
              });
              instances = instances.filter((instance) => !rootRemovals.has(instance.id));
              for (const spawn of queues.spawns) {
                const prefab = document.prefabs[spawn.prefabId];
                const legacyTemplate = scene!.entities.find((entity) => entity.id === spawn.prefabId && entity.templateOnly);
                const definitions = prefab?.entities ?? (legacyTemplate ? [legacyTemplate] : undefined);
                const rootId = prefab?.rootId ?? legacyTemplate?.id;
                if (!definitions || !rootId) throw new Error(`Missing spawn prefab ${spawn.prefabId}`);
                if (states.filter((state) => state.sourceId).length + definitions.length > MAX_GAME_SPAWNED_INSTANCES) throw new Error("Game spawned instance limit exceeded");
                spawnSequence += 1;
                const instanceId = `${spawn.prefabId}#${spawnSequence}`;
                const mapping = Object.fromEntries(definitions.map((definition) => [definition.id, prefab ? `${instanceId}/${definition.id}` : instanceId]));
                if (Object.values(mapping).some((id) => states.some((state) => state.definition.id === id))) throw new Error("Spawned entity ID collides with an existing entity");
                const spawned = definitions.map((source): EntityState3D => ({ ...initialState3D(remapDefinition3D(source, mapping), tick + 1), sourceId: source.id,
                  instanceId, prefabId: prefab ? spawn.prefabId : undefined }));
                const root = spawned.find((state) => state.definition.id === mapping[rootId]);
                if (!root) throw new Error("Prefab root is missing");
                if ("position" in spawn && spawn.position) root.transform.position = root.localTransform.position = { ...spawn.position };
                if ("rotation" in spawn && spawn.rotation) root.transform.rotation = root.localTransform.rotation = spawn.rotation;
                if ("velocity" in spawn && spawn.velocity) root.velocity = { ...spawn.velocity };
                updateVisualHierarchy3D(spawned);
                for (const state of spawned) { state.previousTransform = structuredClone(state.transform); currentSpatial().add(state); }
                states.push(...spawned);
                instances.push({ id: instanceId, prefabId: spawn.prefabId, rootId: mapping[rootId], mapping });
              }
              queries = spatialQueries.map(({ entityId, command }): GameQueryResult3D => command.kind === "rayQuery" ?
                { queryId: command.queryId, ...currentSpatial().rayQuery(command.origin, command.direction, command.maxDistance, command.mask, entityId) } :
                { queryId: command.queryId, ...currentSpatial().shapeQuery(command, entityId) });
              if (queues.transitionTo) {
                const next = document.scenes.find((candidate) => candidate.id === queues.transitionTo);
                if (!next) throw new Error(`Missing scene ${queues.transitionTo}`);
                const nextStates = sceneStates3D(next, tick + 1);
                const nextSpatial = new SpatialWorld3D(rapier, next, nextStates, prepared);
                currentSpatial().dispose();
                spatial = nextSpatial;
                scene = next;
                states = nextStates;
                activeContacts = new Map();
                spawnSequence = 0;
                instances = [];
                scriptState = {};
                hud = new Map();
                queries = [];
                music = scene.music ? { ...scene.music, voiceId: `scene:${scene.id}:music`, startTick: tick + 1 } : null;
                cameraEntity = states.find((state) => state.definition.id === scene!.activeCameraId);
                if (!cameraEntity) throw new Error("Active camera is missing");
                camera = initialCamera3D(cameraEntity);
                emit({ kind: "sceneTransition", sceneId: scene.id });
              }
              updateVisualHierarchy3D(states);
              resolveCamera3D(camera, cameraEntity!, states, currentSpatial());
              previousEvents = structuredClone(events);
              rngState = advanceGameplayRandom(rngState);
              tick += 1;
              const result: GameStepResult3D & { scriptStats?: GameScriptStats } = { tick, events, frame: frame() };
              if (scriptStats) result.scriptStats = scriptStats;
              return result;
            }
          });
        }, () => { failed = true; }, options.eventSink);
      },
      frame,
      inspect(query): GameInspection3D {
        assertAvailable();
        return { dimension: "3d", tick, sceneId: scene!.id, score, won,
          entities: states.filter((state) => !query?.entityId || state.definition.id === query.entityId).map(snapshotEntity3D), camera: structuredClone(camera) };
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
