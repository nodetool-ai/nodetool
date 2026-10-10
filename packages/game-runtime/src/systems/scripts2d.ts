import { applyGameUiCommand, gameParticleEmissionOf, gameUiCommandTarget, type GameEntityProps } from "@nodetool-ai/protocol";
import { evaluateVisual } from "../visual-animation.js";
import { gravityScaleOf, touchingOf } from "./collision2d.js";
import type { EntityState } from "./state2d.js";
import type { GameSystemContext2D } from "./context2d.js";
import { applyGameplayCommand, queueGameplayBehavior, type GameplayCommand } from "../gameplay/lifecycle.js";
import { assertDestroyCommands, awaitsDestroy, removedDestroyCall, scriptContacts, scriptLifecycle } from "../script-lifecycle.js";
import { planScriptProps } from "../script-props.js";
import { scriptSourceKey, type GameScriptCall, type GameScriptInput } from "../scripts.js";

const NO_TAGS: readonly string[] = Object.freeze([]);
/** Fields of a removed instance's last call that its onDestroy hook reads. */
const REMOVED_FIELDS_2D = ["x", "y", "velocityX", "velocityY", "touching", "tags", "rotation"] as const;

interface ScriptMetadata2D { readonly tags: readonly string[]; readonly rotation: number; readonly active: boolean }

function scriptMetadata(state: EntityState, tick: number): ScriptMetadata2D {
  return { tags: state.definition.tags ?? NO_TAGS, active: state.active,
    rotation: state.visual?.rotation ?? evaluateVisual(state.definition, tick - state.spawnTick, state.rotation, state.scaleX, state.scaleY).rotation };
}

/** A script call without its state, built from the entity at the current point of the tick. */
export function scriptCall2D(context: GameSystemContext2D, state: EntityState, index: number): Omit<GameScriptCall, "state"> {
  const behavior = state.definition.behaviors[index];
  if (behavior?.kind !== "script") {
    throw new Error(`Behavior ${index} of ${state.definition.id} is not a script`);
  }
  return {
    sourceKey: scriptSourceKey(context.scene.id, state.sourceId ?? state.definition.id, index),
    stateKey: scriptSourceKey(context.scene.id, state.definition.id, index),
    entityId: state.definition.id,
    source: state.sourceId ?? state.definition.id,
    x: state.x,
    y: state.y,
    velocityX: state.velocityX,
    velocityY: state.velocityY,
    touching: touchingOf(context, state),
    // Entity metadata belongs to schema 4. Older documents keep their exact script input.
    ...(context.document.schemaVersion === 4 ? scriptMetadata(state, context.tick) : undefined),
    maxCommands: behavior.maxCommands,
    maxTickMs: behavior.maxTickMs
  };
}

/** Whether either side of a 2D contact has a sensor collider. Despawned instances resolve through their template. */
function sensorContact2D(context: GameSystemContext2D, event: { readonly entityId: string; readonly otherId: string }): boolean {
  const sensor = (id: string): boolean => {
    const definition = context.states.find((state) => state.definition.id === id)?.definition
      ?? context.scene.entities.find((entity) => entity.id === id.slice(0, Math.max(0, id.lastIndexOf("#"))));
    return definition?.collider2d?.sensor === true;
  };
  return sensor(event.entityId) || sensor(event.otherId);
}

/** `onDestroy` calls for lifecycle behaviors whose entity despawned in the previous tick, in a fixed order. */
function destroyCalls2D(context: GameSystemContext2D, hookSources: ReadonlySet<string>): GameScriptCall[] {
  const calls: GameScriptCall[] = [];
  for (const state of context.states) {
    if (state.active) {
      continue;
    }
    state.definition.behaviors.forEach((behavior, index) => {
      if (behavior.kind !== "script") {
        return;
      }
      const record = context.scriptState[scriptSourceKey(context.scene.id, state.definition.id, index)];
      if (!awaitsDestroy(record) || !hookSources.has(scriptSourceKey(context.scene.id, state.sourceId ?? state.definition.id, index))) {
        return;
      }
      calls.push({ ...scriptCall2D(context, state, index), state: record as GameScriptCall["state"], lifecycle: { destroy: true } });
    });
  }
  const ids = new Set(context.states.map((state) => state.definition.id));
  const destroyContext = {
    sceneId: context.scene.id, hookSources, exists: (id: string) => ids.has(id), fields: REMOVED_FIELDS_2D,
    limitsOf: (sourceKey: string) => {
      const [, sourceId, index] = JSON.parse(sourceKey) as [string, string, number];
      const behavior = context.scene.entities.find((entity) => entity.id === sourceId)?.behaviors[index];
      return behavior?.kind === "script" ? behavior : undefined;
    }
  };
  for (const stateKey of Object.keys(context.scriptState).sort()) {
    const call = removedDestroyCall(stateKey, context.scriptState[stateKey], destroyContext);
    if (call) { calls.push(call as unknown as GameScriptCall); }
  }
  return calls;
}

export function stepScripts2D(context: GameSystemContext2D): void {
  const hasActiveScripts = context.scriptRunner && context.states.some((state) => state.active
    && state.definition.behaviors.some((behavior) => behavior.kind === "script"));
  // Entity metadata belongs to schema 4. Older documents keep their exact script input.
  const supportsMetadata = context.document.schemaVersion === 4;
  const metadataByState = new Map<EntityState, ScriptMetadata2D>();
  const metadataOf = (state: EntityState): ScriptMetadata2D | undefined => {
    if (!supportsMetadata) { return undefined; }
    let metadata = metadataByState.get(state);
    if (!metadata) { metadata = scriptMetadata(state, context.tick); metadataByState.set(state, metadata); }
    return metadata;
  };
  const worldAtStart = hasActiveScripts ? context.states.filter((state) => state.active)
    .map((state) => ({ id: state.definition.id, source: state.sourceId ?? state.definition.id, x: state.x, y: state.y,
      velocityX: state.velocityX, velocityY: state.velocityY, grounded: touchingOf(context, state).down, ...metadataOf(state) })) : [];
  const hookSources = context.scriptRunner?.hookSources;
  const hasHooks = hookSources !== undefined && hookSources.size > 0;
  if (hasHooks) { context.scriptCalls.push(...destroyCalls2D(context, hookSources)); }
  const sceneEnter = context.tick === 0 || context.previousEvents.some((event) => event.kind === "sceneTransition");
  for (const state of context.states) {
    state.previousX = state.x;
    state.previousY = state.y;
    if (!state.active) {
      continue;
    }
    const entity = state.definition;
    for (const [index, behavior] of entity.behaviors.entries()) {
      if (behavior.kind === "movement") {
        const dx = Number(context.pressed.has(behavior.right)) - Number(context.pressed.has(behavior.left));
        const dy = Number(context.pressed.has(behavior.up)) - Number(context.pressed.has(behavior.down));
        const length = Math.hypot(dx, dy) || 1;
        state.velocityX = (dx / length) * behavior.speed;
        state.velocityY = (dy / length) * behavior.speed;
      } else if (behavior.kind === "patrol") {
        const coordinate = behavior.axis === "x" ? state.x : state.y;
        const origin = state.patrolOrigin ?? coordinate;
        // Only travel away from the origin turns the body, so a wall at the limit cannot cancel a turn.
        if ((coordinate - origin) * (state.patrolDirection ?? 1) >= behavior.distance) {
          state.patrolDirection = state.patrolDirection === 1 ? -1 : 1;
        }
        const speed = behavior.speed * (state.patrolDirection ?? 1);
        // A body under gravity keeps its fall speed while it walks.
        const falls = gravityScaleOf(context, state) !== 0;
        state.velocityX = behavior.axis === "x" ? speed : falls ? state.velocityX : 0;
        state.velocityY = behavior.axis === "y" ? speed : falls ? state.velocityY : 0;
      } else if (behavior.kind === "script") {
        const sourceKey = scriptSourceKey(context.scene.id, state.sourceId ?? entity.id, index);
        const stateKey = scriptSourceKey(context.scene.id, entity.id, index);
        const lifecycle = hasHooks && hookSources.has(sourceKey)
          ? scriptLifecycle(sceneEnter, scriptContacts(entity.id, context.previousEvents, (event) => sensorContact2D(context, event)))
          : undefined;
        context.scriptCalls.push({
          sourceKey,
          stateKey,
          entityId: entity.id,
          source: state.sourceId ?? entity.id,
          state: context.scriptState[stateKey] ?? null,
          x: state.x,
          y: state.y,
          velocityX: state.velocityX,
          velocityY: state.velocityY,
          touching: touchingOf(context, state),
          ...metadataOf(state),
          maxCommands: behavior.maxCommands,
          maxTickMs: behavior.maxTickMs,
          ...(lifecycle === undefined ? undefined : { lifecycle })
        });
      } else {
        queueGameplayBehavior(behavior, entity.id, state.spawnTick, context.tick, context.previousEvents, context.queues);
      }
    }
  }
  context.scriptRunner?.retain?.(new Set(context.scriptCalls.map((call) => call.stateKey)));
  if (context.scriptRunner && context.scriptCalls.length > 0) {
    const world = context.states
      .filter((state) => state.active && (state.definition.collider2d || state.definition.camera2d))
      .map((state) => ({ id: state.definition.id, source: state.sourceId ?? state.definition.id, x: state.x, y: state.y,
        ...metadataOf(state) }));
    // Each active entity's props travel once; scripts read them on `entity`, `world` and `world.get`.
    const legacyInput: GameScriptInput = { tick: context.tick, pressed: [...context.pressed], justPressed: context.input.justPressed,
      events: context.previousEvents, world };
    const props: Record<string, GameEntityProps> = {};
    for (const state of context.states) {
      if (supportsMetadata && state.active && state.props !== undefined && Object.keys(state.props).length > 0) { props[state.definition.id] = state.props; }
    }
    const scriptInput: GameScriptInput = supportsMetadata ? { ...legacyInput, props } : legacyInput;
    const batch = context.scriptRunner.run(
      context.scriptCalls,
      scriptInput,
      context.rngState,
      worldAtStart
    );
    const byId = new Map(context.states.map((state) => [state.definition.id, state]));
    for (const [index, item] of batch.results.entries()) {
      if (context.scriptCalls[index].lifecycle?.destroy) { assertDestroyCommands(item.commands, item.entityId, context.tick); }
    }
    const plannedProps = planScriptProps(batch.results, (entityId) => byId.get(entityId)?.props, context.tick, supportsMetadata);
    for (const item of batch.results) {
      for (const command of item.commands) {
        if (command.kind === "spawn" && !context.scene.entities.some((entity) => entity.id === command.prefabId && entity.templateOnly)) {
          throw new Error(`Game script uses missing prefab ${command.prefabId}`);
        }
        if (command.kind === "sceneTransition" && !context.document.scenes.some((candidate) => candidate.id === command.sceneId)) {
          throw new Error(`Game script uses missing scene ${command.sceneId}`);
        }
        if (command.kind === "playAnimation" && !byId.get(item.entityId)?.definition.animator?.clips?.[command.clip]) {
          throw new Error(`Game script plays missing animation clip ${command.clip} on ${item.entityId}`);
        }
        if (command.kind === "hud" && command.fontId && context.document.assets[command.fontId]?.mediaKind !== "font") {
          throw new Error(`Game script uses missing font ${command.fontId}`);
        }
        if (command.kind === "ui") {
          const target = gameUiCommandTarget([...(context.document.ui?.nodes ?? []), ...(context.scene.ui?.nodes ?? [])], command);
          if (typeof target === "string") { throw new Error(target); }
        }
        // A spawned instance can expire in the tick before a script reacts to its contact.
        if (command.kind === "despawn" && !byId.get(command.entityId)?.active && !context.isSpawnedId(command.entityId)) {
          throw new Error(`Game script uses missing entity ${command.entityId}`);
        }
      }
    }
    for (const [index, item] of batch.results.entries()) {
      const call = context.scriptCalls[index];
      if (call.lifecycle?.destroy) {
        // A removed instance's record ends with its onDestroy call. An authored entity keeps its record, marked destroyed.
        if (!byId.has(item.entityId)) { delete context.scriptState[call.stateKey]; }
        else { context.scriptState[call.stateKey] = item.state; }
        for (const command of item.commands) {
          applyGameplayCommand(command as GameplayCommand, item.entityId, context.queues, context.hud, context.emit);
        }
        continue;
      }
      context.scriptState[call.stateKey] = item.state;
      const state = byId.get(item.entityId);
      if (!state) {
        throw new Error(`Game script entity ${item.entityId} disappeared`);
      }
      for (const command of item.commands) {
        if (command.kind === "setProp" || command.kind === "removeProp") {
          state.props = plannedProps.get(item.entityId);
        } else if (command.kind === "setVelocity") {
          state.velocityX = command.x;
          state.velocityY = command.y;
        } else if (command.kind === "setPosition") {
          state.x = command.x;
          state.y = command.y;
          state.previousX = command.x;
          state.previousY = command.y;
        } else if (command.kind === "setVisual") {
          const { kind: _kind, ...visual } = command;
          state.visual = { ...state.visual, ...visual };
        } else if (command.kind === "playAnimation") {
          // Replaying the current clip continues it, so scripts can request a clip every tick.
          if (state.animation !== command.clip) {
            state.animation = command.clip;
            state.animationTick = context.tick + 1;
          }
        } else if (command.kind === "ui") {
          applyGameUiCommand(context.ui, command);
        } else if (command.kind === "emitParticles") {
          (context.queues.particles ??= []).push(gameParticleEmissionOf(command, item.entityId));
        } else {
          applyGameplayCommand(command, item.entityId, context.queues, context.hud, context.emit);
        }
      }
    }
    context.rngState = batch.rngState;
    context.scriptStats = batch.stats;
  }
}
