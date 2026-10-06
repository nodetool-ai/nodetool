import { gravityScaleOf, touchingOf } from "./collision2d.js";
import type { GameSystemContext2D } from "./context2d.js";
import { applyGameplayCommand, queueGameplayBehavior } from "../gameplay/lifecycle.js";
import { scriptSourceKey } from "../scripts.js";
export function stepScripts2D(context: GameSystemContext2D): void {
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
          maxCommands: behavior.maxCommands,
          maxTickMs: behavior.maxTickMs
        });
      } else {
        queueGameplayBehavior(behavior, entity.id, state.spawnTick, context.tick, context.previousEvents, context.queues);
      }
    }
  }
  if (context.scriptRunner && context.scriptCalls.length > 0) {
    const world = context.states
      .filter((state) => state.active && (state.definition.collider2d || state.definition.camera2d))
      .map((state) => ({ id: state.definition.id, source: state.sourceId ?? state.definition.id, x: state.x, y: state.y }));
    const batch = context.scriptRunner.run(
      context.scriptCalls,
      { tick: context.tick, pressed: [...context.pressed], justPressed: context.input.justPressed, events: context.previousEvents, world },
      context.rngState
    );
    const byId = new Map(context.states.map((state) => [state.definition.id, state]));
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
        // A spawned instance can expire in the tick before a script reacts to its contact.
        if (command.kind === "despawn" && !byId.get(command.entityId)?.active && !context.isSpawnedId(command.entityId)) {
          throw new Error(`Game script uses missing entity ${command.entityId}`);
        }
      }
    }
    for (const [index, item] of batch.results.entries()) {
      const call = context.scriptCalls[index];
      context.scriptState[call.stateKey] = item.state;
      const state = byId.get(item.entityId);
      if (!state) {
        throw new Error(`Game script entity ${item.entityId} disappeared`);
      }
      for (const command of item.commands) {
        if (command.kind === "setVelocity") {
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
        } else {
          applyGameplayCommand(command, item.entityId, context.queues, context.hud, context.emit);
        }
      }
    }
    context.rngState = batch.rngState;
    context.scriptStats = batch.stats;
  }
}
