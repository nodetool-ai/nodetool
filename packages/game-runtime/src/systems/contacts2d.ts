import type { GameSystemContext2D } from "./context2d.js";
import { claimGameplayContact } from "../gameplay/lifecycle.js";
export function stepContacts2D(context: GameSystemContext2D): void {
  const currentContacts = context.observations;
  const stateById = new Map(context.states.map((state) => [state.definition.id, state]));
  for (const [key, pair] of currentContacts) {
    const phase = context.activeContacts.has(key) ? "stay" : "enter";
    context.emit({ kind: "contact", entityId: pair.entityId, otherId: pair.otherId, phase, normalX: pair.normalX, normalY: pair.normalY });
    if (phase !== "enter") {
      continue;
    }
    const state = stateById.get(pair.entityId);
    const other = stateById.get(pair.otherId);
    if (!state || !other) {
      continue;
    }
    for (const [actor, target] of [
      [state, other],
      [other, state]
    ]) {
      if (actor.definition.body2d?.type !== "kinematic") {
        continue;
      }
      context.score = claimGameplayContact(
        actor,
        target,
        {
          collects: !actor.definition.collider2d?.sensor,
          activatesTriggers: true
        },
        context.queues,
        context.score,
        context.emit
      );
    }
  }
  for (const [key, pair] of context.activeContacts) {
    if (!currentContacts.has(key)) {
      context.emit({ kind: "contact", entityId: pair.entityId, otherId: pair.otherId, phase: "exit", normalX: 0, normalY: 0 });
    }
  }
  context.activeContacts = currentContacts;
}
