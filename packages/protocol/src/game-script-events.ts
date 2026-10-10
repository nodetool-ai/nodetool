import { z } from "zod";
import { gameEntityPropertyValue } from "./game-entity-metadata.js";

/** Serialized size limit of one event payload. Payloads ride in the event stream and in every script call's input. */
export const MAX_GAME_EVENT_PAYLOAD_BYTES = 1024;

const encoder = new TextEncoder();

/** A JSON payload carried by a script event, at most 16 levels deep and 1 KiB serialized. */
export const gameEventPayload = gameEntityPropertyValue.superRefine((value, context) => {
  if (encoder.encode(JSON.stringify(value)).byteLength > MAX_GAME_EVENT_PAYLOAD_BYTES) {
    context.addIssue({ code: "custom", message: `Event payload exceeds ${MAX_GAME_EVENT_PAYLOAD_BYTES} bytes` });
  }
});

/** The receivers of a script event: one entity, or every entity with a tag. An event without a target is a broadcast. */
export const gameEventTarget = z.union([
  z.strictObject({ entityId: z.string().min(1).max(128) }),
  z.strictObject({ tag: z.string().min(1).max(128) })
]);

export type GameEventTarget = z.infer<typeof gameEventTarget>;

/**
 * Script command that emits a trigger event from the script's entity. `payload` and `target` are optional, and a
 * command without them produces the same event as before they existed.
 */
export const gameEmitCommand = z.strictObject({
  kind: z.literal("emit"), event: z.string().min(1).max(128), payload: gameEventPayload.optional(), target: gameEventTarget.optional()
});

export type GameEmitCommand = z.infer<typeof gameEmitCommand>;

/** Whether an event reaches an entity. Untargeted events reach every entity. */
export function gameEventReaches(event: { readonly target?: GameEventTarget }, entityId: string, tags: readonly string[] | undefined): boolean {
  const target = event.target;
  if (target === undefined) { return true; }
  return "entityId" in target ? target.entityId === entityId : tags?.includes(target.tag) === true;
}
