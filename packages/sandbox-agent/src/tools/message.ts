/**
 * Messaging tools — emit SandboxEvents onto the event bus.
 *
 * Manus splits "notify" (non-blocking) from "ask" (blocking question).
 * We keep that split even though both map to the same push-an-event
 * operation here; the *agent's* loop is what chooses to wait for a
 * user reply before the next step after an `ask`.
 *
 * `idle` is a sentinel event the agent emits to signal it has finished
 * the current objective (Manus convention, explicitly documented in the
 * leaked system prompt).
 */

import type {
  MessageNotifyUserInput,
  MessageNotifyUserOutput,
  MessageAskUserInput,
  MessageAskUserOutput,
  IdleInput,
  IdleOutput
} from "@nodetool-ai/sandbox/schemas";
import { newEventId, publish } from "../event-bus.js";

export async function messageNotifyUser(
  input: MessageNotifyUserInput
): Promise<MessageNotifyUserOutput> {
  const id = newEventId();
  publish({
    id,
    type: "notify",
    timestamp: Date.now(),
    text: input.text,
    attachments: input.attachments
  });
  return { event_id: id };
}

export async function messageAskUser(
  input: MessageAskUserInput
): Promise<MessageAskUserOutput> {
  const id = newEventId();
  publish({
    id,
    type: "ask",
    timestamp: Date.now(),
    text: input.text,
    attachments: input.attachments,
    suggest_user_takeover: input.suggest_user_takeover
  });
  return { event_id: id };
}

export async function idle(input: IdleInput): Promise<IdleOutput> {
  const id = newEventId();
  publish({
    id,
    type: "idle",
    timestamp: Date.now(),
    text: input.reason
  });
  return { event_id: id };
}
