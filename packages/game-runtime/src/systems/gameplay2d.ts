import { MAX_GAME_SPAWNED_INSTANCES } from "../gameplay/lifecycle.js";
import type { GameSystemContext2D } from "./context2d.js";
import { advanceGameplayRandom, finalizeGameplayEntities } from "../gameplay/lifecycle.js";
import { awaitsDestroy, type GameScriptLifecycleRecord } from "../script-lifecycle.js";
import { scriptSourceKey } from "../scripts.js";
import { scriptCall2D } from "./scripts2d.js";
export function stepGameplay2D(context: GameSystemContext2D): void {
  context.won = finalizeGameplayEntities(
    context.states,
    context.queues,
    context.score,
    context.won,
    context.sceneId,
    context.tick,
    context.events,
    context.emit
  );
  if (context.queuedDespawns.size > 0) {
    // Spawned instances leave the world when despawned; authored entities stay as inactive state.
    context.states = context.states.filter((state) => {
      if (!state.sourceId || !context.queuedDespawns.has(state.definition.id)) {
        return true;
      }
      state.definition.behaviors.forEach((behavior, index) => {
        if (behavior.kind !== "script") {
          return;
        }
        const key = scriptSourceKey(context.scene.id, state.definition.id, index);
        const record = context.scriptState[key];
        // A lifecycle behavior keeps its record until its onDestroy call runs in the next tick.
        if (awaitsDestroy(record) && context.scriptRunner?.hookSources?.has(scriptSourceKey(context.scene.id, state.sourceId ?? state.definition.id, index))) {
          context.scriptState[key] = { ...(record as GameScriptLifecycleRecord), removed: scriptCall2D(context, state, index) } as unknown as typeof record;
        } else {
          delete context.scriptState[key];
        }
      });
      return false;
    });
  }
  if (context.states.filter((state) => state.sourceId).length + context.queuedSpawns.length > MAX_GAME_SPAWNED_INSTANCES) {
    context.failed = true;
    throw new Error(`Game spawned instance limit exceeded (${MAX_GAME_SPAWNED_INSTANCES})`);
  }
  for (const spawn of context.queuedSpawns) {
    const prefabId = spawn.prefabId;
    const source = context.scene.entities.find((entity) => entity.id === prefabId && entity.templateOnly);
    if (!source) {
      throw new Error(`Missing spawn template ${prefabId}`);
    }
    context.spawnSequence += 1;
    const sourceState = context.states.find((state) => state.definition.id === source.id);
    if (!sourceState) {
      throw new Error(`Missing spawn template state ${source.id}`);
    }
    const spawned = context.initialState(
      { ...source, id: `${prefabId}#${context.spawnSequence}`, templateOnly: false },
      {
        ...sourceState,
        x: spawn.x ?? sourceState.x,
        y: spawn.y ?? sourceState.y
      },
      context.tick + 1
    );
    if (spawn.velocityX !== undefined) {
      spawned.velocityX = spawn.velocityX;
    }
    if (spawn.velocityY !== undefined) {
      spawned.velocityY = spawn.velocityY;
    }
    context.states.push({ ...spawned, sourceId: prefabId });
  }
  if (context.queues.transitionTo) {
    const nextScene = context.document.scenes.find((candidate) => candidate.id === context.queues.transitionTo);
    if (!nextScene) {
      throw new Error(`Missing scene ${context.queues.transitionTo}`);
    }
    context.scene = nextScene;
    context.sceneId = nextScene.id;
    context.music = nextScene.music
      ? {
          voiceId: `scene:${context.sceneId}:music`,
          assetId: nextScene.music.assetId,
          startTick: context.tick + 1,
          volume: nextScene.music.volume,
          fadeInTicks: nextScene.music.fadeInTicks,
          fadeOutTicks: nextScene.music.fadeOutTicks
        }
      : null;
    context.states = context.initialSceneStates(nextScene, context.tick + 1);
    context.activeContacts = new Map();
    context.spawnSequence = 0;
    context.scriptState = {};
    context.hud = new Map();
    context.emit({ kind: "sceneTransition", sceneId: context.sceneId });
  }
  context.previousEvents = structuredClone(context.events);
  context.rngState = advanceGameplayRandom(context.rngState);
  context.tick += 1;
}
