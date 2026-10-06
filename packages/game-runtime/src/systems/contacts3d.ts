import type { GameSystemContext3D } from "./context3d.js";
import { claimGameplayContact } from "../gameplay/lifecycle.js";
import { ZERO3 } from "../spatial3d/math.js";
import { pairKey3D } from "../spatial3d/state.js";
export function stepContacts3D(context: GameSystemContext3D): void {
  if (!context.spatialStep) {
    throw new Error("Character stage did not prepare the spatial step");
  }
  context.contacts = context.currentSpatial().collectContacts(context.states, context.spatialStep);
  const currentContacts = new Map(context.contacts.map((contact) => [pairKey3D(contact.entityId, contact.otherId), contact]));
  const byId = new Map(context.states.map((state) => [state.definition.id, state]));
  for (const contact of context.contacts) {
    const phase = context.activeContacts.has(pairKey3D(contact.entityId, contact.otherId)) ? "stay" : "enter";
    context.emit({
      kind: "contact",
      sceneId: context.currentScene().id,
      entityId: contact.entityId,
      otherId: contact.otherId,
      phase,
      sensor: contact.sensor,
      normal: contact.normal
    });
    if (phase !== "enter") {
      continue;
    }
    const a = byId.get(contact.entityId);
    const b = byId.get(contact.otherId);
    if (!a || !b) {
      continue;
    }
    for (const [actor, target] of [
      [a, b],
      [b, a]
    ]) {
      context.score = claimGameplayContact(
        actor,
        target,
        actor.definition.interactionActor ?? {
          collects: false,
          activatesTriggers: false
        },
        context.queues,
        context.score,
        context.emit
      );
    }
  }
  for (const [key, contact] of context.activeContacts) {
    if (!currentContacts.has(key)) {
      context.emit({
        kind: "contact",
        sceneId: context.currentScene().id,
        entityId: contact.entityId,
        otherId: contact.otherId,
        phase: "exit",
        sensor: contact.sensor,
        normal: ZERO3
      });
    }
  }
  context.activeContacts = currentContacts;
}
