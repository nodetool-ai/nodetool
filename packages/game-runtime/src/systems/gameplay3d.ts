import { updateVisualHierarchy3D } from "./hierarchy3d.js";
import type { GameSystemContext3D } from "./context3d.js";
import { type GameQueryResult3D } from "@nodetool-ai/protocol";
import { advanceGameplayRandom, finalizeGameplayEntities, MAX_GAME_SPAWNED_INSTANCES } from "../gameplay/lifecycle.js";
import { awaitsDestroy, type GameScriptLifecycleRecord } from "../script-lifecycle.js";
import { scriptCall3D } from "./scripts3d.js";
import { initialCamera3D } from "../spatial3d/camera.js";
import { type EntityState3D } from "../spatial3d/state.js";
import { SpatialWorld3D } from "../spatial3d/world.js";
export function stepGameplay3D(context: GameSystemContext3D): void {
  context.won = finalizeGameplayEntities(
    context.states,
    context.queues,
    context.score,
    context.won,
    context.currentScene().id,
    context.tick,
    context.events,
    context.emit
  );
  const rootRemovals = new Set(
    context.instances.filter((instance) => context.queues.despawns.has(instance.rootId)).map((instance) => instance.id)
  );
  for (const state of context.states) {
    if (state.instanceId && rootRemovals.has(state.instanceId)) {
      context.queues.despawns.add(state.definition.id);
    }
  }
  if (context.queues.despawns.size > 0) {
    const children = new Map<string, string[]>();
    const removals: string[] = [];
    for (const state of context.states) {
      if (state.sourceId && context.queues.despawns.has(state.definition.id)) {
        removals.push(state.definition.id);
      }
      const parentId = state.definition.parentId;
      if (!parentId) {
        continue;
      }
      const siblings = children.get(parentId) ?? [];
      siblings.push(state.definition.id);
      children.set(parentId, siblings);
    }
    for (let index = 0; index < removals.length; index += 1) {
      for (const child of children.get(removals[index]) ?? []) {
        if (context.queues.despawns.has(child)) {
          continue;
        }
        context.queues.despawns.add(child);
        removals.push(child);
      }
    }
  }
  for (const state of context.states) {
    if (context.queues.despawns.has(state.definition.id)) {
      state.active = false;
    }
    if (!state.active) {
      context.currentSpatial().remove(state.definition.id);
    }
  }
  context.states = context.states.filter((state) => {
    if (!state.sourceId || !context.queues.despawns.has(state.definition.id)) {
      return true;
    }
    state.definition.behaviors.forEach((behavior, index) => {
      if (behavior.kind !== "script") {
        return;
      }
      const call = scriptCall3D(context, state, index);
      const record = context.scriptState[call.stateKey];
      // A lifecycle behavior keeps its record until its onDestroy call runs in the next tick.
      if (awaitsDestroy(record) && context.runner?.hookSources?.has(call.sourceKey)) {
        context.scriptState[call.stateKey] = { ...(record as GameScriptLifecycleRecord), removed: call } as unknown as typeof record;
      } else {
        delete context.scriptState[call.stateKey];
      }
    });
    return false;
  });
  context.instances = context.instances.filter((instance) => !rootRemovals.has(instance.id));
  for (const spawn of context.queues.spawns) {
    const prefab = context.document.prefabs[spawn.prefabId];
    const legacyTemplate = context.currentScene().entities.find((entity) => entity.id === spawn.prefabId && entity.templateOnly);
    const definitions = prefab?.entities ?? (legacyTemplate ? [legacyTemplate] : undefined);
    const rootId = prefab?.rootId ?? legacyTemplate?.id;
    if (!definitions || !rootId) {
      throw new Error(`Missing spawn prefab ${spawn.prefabId}`);
    }
    if (context.states.filter((state) => state.sourceId).length + definitions.length > MAX_GAME_SPAWNED_INSTANCES) {
      throw new Error("Game spawned instance limit exceeded");
    }
    context.spawnSequence += 1;
    const instanceId = `${spawn.prefabId}#${context.spawnSequence}`;
    const mapping = Object.fromEntries(
      definitions.map((definition) => [definition.id, prefab ? `${instanceId}/${definition.id}` : instanceId])
    );
    if (Object.values(mapping).some((id) => context.states.some((state) => state.definition.id === id))) {
      throw new Error("Spawned entity ID collides with an existing entity");
    }
    const spawned = definitions.map(
      (source): EntityState3D => ({
        ...context.initialState3D(context.remapDefinition3D(source, mapping), context.tick + 1),
        sourceId: source.id,
        instanceId,
        prefabId: prefab ? spawn.prefabId : undefined
      })
    );
    const root = spawned.find((state) => state.definition.id === mapping[rootId]);
    if (!root) {
      throw new Error("Prefab root is missing");
    }
    if ("position" in spawn && spawn.position) {
      root.transform.position = root.localTransform.position = {
        ...spawn.position
      };
    }
    if ("rotation" in spawn && spawn.rotation) {
      root.transform.rotation = root.localTransform.rotation = spawn.rotation;
    }
    if ("velocity" in spawn && spawn.velocity) {
      root.velocity = { ...spawn.velocity };
      if (root.controller) {
        root.controller.verticalVelocity = spawn.velocity.y;
      }
    }
    updateVisualHierarchy3D(spawned);
    for (const state of spawned) {
      state.previousTransform = structuredClone(state.transform);
      context.currentSpatial().add(state);
    }
    context.states.push(...spawned);
    context.instances.push({
      id: instanceId,
      prefabId: spawn.prefabId,
      rootId: mapping[rootId],
      mapping
    });
  }
  context.queries = context.spatialQueries.map(
    ({ entityId, command }): GameQueryResult3D =>
      command.kind === "rayQuery"
        ? {
            queryId: command.queryId,
            ...context.currentSpatial().rayQuery(command.origin, command.direction, command.maxDistance, command.mask, entityId)
          }
        : {
            queryId: command.queryId,
            ...context.currentSpatial().shapeQuery(command, entityId)
          }
  );
  if (context.queues.transitionTo) {
    const next = context.document.scenes.find((candidate) => candidate.id === context.queues.transitionTo);
    if (!next) {
      throw new Error(`Missing scene ${context.queues.transitionTo}`);
    }
    const nextStates = context.sceneStates3D(next, context.tick + 1);
    const nextSpatial = new SpatialWorld3D(context.rapier, next, nextStates, context.prepared);
    context.currentSpatial().dispose();
    context.spatial = nextSpatial;
    context.scene = next;
    context.states = nextStates;
    context.activeContacts = new Map();
    context.spawnSequence = 0;
    context.instances = [];
    context.scriptState = {};
    context.hud = new Map();
    context.queries = [];
    context.music = context.scene.music
      ? {
          ...context.scene.music,
          voiceId: `scene:${context.scene.id}:music`,
          startTick: context.tick + 1
        }
      : null;
    const cameraEntity = context.states.find((state) => state.definition.id === context.currentScene().activeCameraId);
    if (!cameraEntity) {
      throw new Error("Active camera is missing");
    }
    context.cameraEntity = cameraEntity;
    context.camera = initialCamera3D(cameraEntity);
    context.emit({ kind: "sceneTransition", sceneId: context.scene.id });
  }
}
export function finalizeSimulation3D(context: GameSystemContext3D): void {
  context.previousEvents = structuredClone(context.events);
  context.rngState = advanceGameplayRandom(context.rngState);
  context.tick += 1;
}
