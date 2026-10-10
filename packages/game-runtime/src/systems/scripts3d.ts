import { gameParticleEmissionOf, type GameEntityProps } from "@nodetool-ai/protocol";
import type { EntityState3D } from "../spatial3d/state.js";
import type { GameSystemContext3D } from "./context3d.js";
import { applyGameplayCommand, queueGameplayBehavior, type GameplayCommand } from "../gameplay/lifecycle.js";
import { assertDestroyCommands, awaitsDestroy, scriptContacts, scriptLifecycle, type GameScriptLifecycleRecord } from "../script-lifecycle.js";
import { planScriptProps } from "../script-props.js";
import type { GameScriptCall3D } from "../scripts3d.js";
import { scriptSourceKey } from "../scripts.js";
import { playAnimationGraphState3D, setAnimationParameter3D } from "./animation-graph3d.js";

const NO_TAGS: readonly string[] = Object.freeze([]);

function scriptMetadata(state: EntityState3D): Pick<GameScriptCall3D, "tags" | "active" | "rotation"> {
  return { tags: state.definition.tags ?? NO_TAGS, active: state.active, rotation: [...state.transform.rotation] };
}

/** A script call without its state, built from the entity at the current point of the tick. */
export function scriptCall3D(context: GameSystemContext3D, state: EntityState3D, index: number): Omit<GameScriptCall3D, "state"> {
  const behavior = state.definition.behaviors[index];
  if (behavior?.kind !== "script") {
    throw new Error(`Behavior ${index} of ${state.definition.id} is not a script`);
  }
  return {
    sourceKey: scriptSourceKey(
      state.prefabId ? `prefab:${state.prefabId}` : context.currentScene().id,
      state.sourceId ?? state.definition.id,
      index
    ),
    stateKey: scriptSourceKey(context.currentScene().id, state.definition.id, index),
    entityId: state.definition.id,
    source: state.sourceId ?? state.definition.id,
    position: { ...state.transform.position },
    velocity: { ...state.velocity },
    grounded: state.controller?.grounded ?? false,
    ...scriptMetadata(state),
    maxCommands: behavior.maxCommands,
    maxTickMs: behavior.maxTickMs
  };
}

/** `onDestroy` calls for lifecycle behaviors whose entity despawned in the previous tick, in a fixed order. */
function destroyCalls3D(context: GameSystemContext3D, hookSources: ReadonlySet<string>): GameScriptCall3D[] {
  const calls: GameScriptCall3D[] = [];
  for (const state of context.states) {
    if (state.active) {
      continue;
    }
    state.definition.behaviors.forEach((behavior, index) => {
      if (behavior.kind !== "script") {
        return;
      }
      const call = scriptCall3D(context, state, index);
      const record = context.scriptState[call.stateKey];
      if (hookSources.has(call.sourceKey) && awaitsDestroy(record)) {
        calls.push({ ...call, state: record as GameScriptCall3D["state"], lifecycle: { destroy: true } });
      }
    });
  }
  for (const stateKey of Object.keys(context.scriptState).sort()) {
    const record = context.scriptState[stateKey];
    if (awaitsDestroy(record) && (record as GameScriptLifecycleRecord).removed !== undefined) {
      const { removed, ...rest } = record as GameScriptLifecycleRecord;
      calls.push({ ...(removed as unknown as Omit<GameScriptCall3D, "state">), stateKey, state: rest as unknown as GameScriptCall3D["state"], lifecycle: { destroy: true } });
    }
  }
  return calls;
}

export function stepScripts3D(context: GameSystemContext3D): void {
  const hookSources = context.runner?.hookSources;
  const hasHooks = hookSources !== undefined && hookSources.size > 0;
  if (hasHooks) { context.calls.push(...destroyCalls3D(context, hookSources)); }
  const sceneEnter = context.tick === 0 || context.previousEvents.some((event) => event.kind === "sceneTransition");
  for (const state of context.states) {
    if (!state.active) {
      continue;
    }
    state.definition.behaviors.forEach((behavior, index) => {
      queueGameplayBehavior(behavior, state.definition.id, state.spawnTick, context.tick, context.previousEvents, context.queues);
      if (behavior.kind === "script") {
        const sourceKey = scriptSourceKey(
          state.prefabId ? `prefab:${state.prefabId}` : context.currentScene().id,
          state.sourceId ?? state.definition.id,
          index
        );
        const stateKey = scriptSourceKey(context.currentScene().id, state.definition.id, index);
        const lifecycle = hasHooks && hookSources.has(sourceKey)
          ? scriptLifecycle(sceneEnter, scriptContacts(state.definition.id, context.previousEvents, (event) => event.sensor === true))
          : undefined;
        context.calls.push({
          sourceKey,
          stateKey,
          entityId: state.definition.id,
          source: state.sourceId ?? state.definition.id,
          state: context.scriptState[stateKey] ?? null,
          position: { ...state.transform.position },
          velocity: { ...state.velocity },
          grounded: state.controller?.grounded ?? false,
          ...scriptMetadata(state),
          maxCommands: behavior.maxCommands,
          maxTickMs: behavior.maxTickMs,
          ...(lifecycle === undefined ? undefined : { lifecycle })
        });
      }
    });
  }
  context.runner?.retain?.(new Set(context.calls.map((call) => call.stateKey)));
  if (context.runner && context.calls.length > 0) {
    // Each active entity's props travel once; scripts read them on `entity`, `world` and `world.get`.
    const props: Record<string, GameEntityProps> = {};
    for (const state of context.states) {
      if (state.active && state.props !== undefined && Object.keys(state.props).length > 0) { props[state.definition.id] = state.props; }
    }
    const batch = context.runner.run(
      context.calls,
      {
        ...context.input,
        tick: context.tick,
        events: context.previousEvents,
        queries: context.queries,
        camera: { yaw: context.camera.yaw, pitch: context.camera.pitch },
        world: context.states
          .filter((state) => state.active)
          .map((state) => ({
            id: state.definition.id,
            source: state.sourceId ?? state.definition.id,
            position: { ...state.transform.position },
            velocity: { ...state.velocity },
            grounded: state.controller?.grounded ?? false,
            ...scriptMetadata(state)
          })),
        props
      },
      context.rngState
    );
    const byId = new Map(context.states.map((state) => [state.definition.id, state]));
    for (const [index, result] of batch.results.entries()) {
      if (context.calls[index].lifecycle?.destroy) { assertDestroyCommands(result.commands, result.entityId, context.tick); }
    }
    const plannedProps = planScriptProps(batch.results, (entityId) => byId.get(entityId)?.props, context.tick, true);
    for (let index = 0; index < batch.results.length; index += 1) {
      const result = batch.results[index];
      const call = context.calls[index];
      if (call.lifecycle?.destroy) {
        // A removed instance's record ends with its onDestroy call. An authored entity keeps its record, marked destroyed.
        if (!byId.has(result.entityId)) { delete context.scriptState[call.stateKey]; }
        else { context.scriptState[call.stateKey] = result.state; }
        for (const command of result.commands) {
          applyGameplayCommand(command as GameplayCommand, result.entityId, context.queues, context.hud, context.emit);
        }
        continue;
      }
      context.scriptState[call.stateKey] = result.state;
      const state = byId.get(result.entityId);
      if (!state) {
        throw new Error(`Script target missing: ${result.entityId}`);
      }
      for (const command of result.commands) {
        switch (command.kind) {
          case "setProp":
          case "removeProp":
            state.props = plannedProps.get(result.entityId);
            break;
          case "characterIntent":
            if (!state.definition.character3d) {
              throw new Error(`Character intent requires a character (${result.entityId})`);
            }
            context.intents.set(result.entityId, {
              movement: command.movement,
              jump: command.jump
            });
            break;
          case "setVelocity":
            if (!state.definition.body3d || state.definition.body3d.type === "static" || state.definition.character3d) {
              throw new Error(`Velocity requires a dynamic body or platform (${result.entityId})`);
            }
            context.currentSpatial().setVelocity(state, command.velocity);
            break;
          case "impulse":
            context.currentSpatial().impulse(state, command.impulse);
            break;
          case "teleport":
            if (!state.definition.body3d || state.definition.body3d.type === "static") {
              throw new Error(`Teleport requires a dynamic or kinematic body (${result.entityId})`);
            }
            context.currentSpatial().teleport(state, command);
            break;
          case "setKinematicPose":
            context.currentSpatial().setKinematicPose(state, command);
            context.posed.add(result.entityId);
            break;
          case "setVisual":
            if (state.definition.body3d || state.definition.collider3d || state.definition.character3d) {
              throw new Error(`Visual transform requires a nonphysical entity (${result.entityId})`);
            }
            if (command.rotation) {
              state.localTransform.rotation = command.rotation;
            }
            if (command.scale) {
              state.localTransform.scale = command.scale;
            }
            if (!state.definition.parentId) {
              state.transform = structuredClone(state.localTransform);
            }
            if (command.opacity !== undefined) {
              state.opacity = command.opacity;
            }
            break;
          case "setAnimParam":
            setAnimationParameter3D(context.document, state, command.name, command.value);
            break;
          case "playAnimation": {
            if (playAnimationGraphState3D(context.document, state, command.clip, context.tick + 1)) {
              break;
            }
            const animator = state.definition.animator3d;
            const clipId = animator?.clips[command.clip];
            if (!animator || !clipId) {
              throw new Error(`Unknown animation ${command.clip} for ${result.entityId}`);
            }
            if (state.animation?.clipId !== clipId) {
              state.animation = {
                clipId,
                startTick: context.tick + 1,
                playbackRate: animator.playbackRate,
                loop: animator.loop,
                transitionTicks: animator.transitionTicks,
                previousClipId: state.animation?.clipId,
                previousStartTick: state.animation?.startTick
              };
            }
            break;
          }
          case "rayQuery":
          case "shapeQuery":
            if (context.spatialQueries.length >= 64) {
              throw new Error("3D query command limit exceeded");
            }
            if (context.spatialQueries.some((query) => query.command.queryId === command.queryId)) {
              throw new Error(`Duplicate query ID ${command.queryId}`);
            }
            context.spatialQueries.push({ entityId: result.entityId, command });
            break;
          case "emitParticles":
            (context.queues.particles ??= []).push(gameParticleEmissionOf(command, result.entityId));
            break;
          default:
            applyGameplayCommand(command, result.entityId, context.queues, context.hud, context.emit);
        }
      }
    }
    context.rngState = batch.rngState;
    context.scriptStats = batch.stats;
  }
}
