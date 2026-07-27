/**
 * What to do when an operation is asked to run while it is already running.
 *
 * The document declares the intent (`OperationPolicy`); this decides, against
 * the live invocations, what the caller must do first. It stays pure: the
 * runtime owns cancelling and awaiting, this only says which invocations those
 * verbs apply to.
 */
import type { OperationBinding } from "./document.js";
import type { AppInstanceState } from "./state.js";
import { liveInvocations } from "./state.js";

export type RunDecision =
  | { kind: "start" }
  /** Cancel these invocations, then start. */
  | { kind: "replace"; cancel: string[] }
  /** Wait for these invocations to settle, then start. */
  | { kind: "queue"; after: string[] };

/**
 * With nothing in flight every policy starts immediately — the policy only
 * describes the collision.
 */
export const decideRun = (
  state: AppInstanceState,
  operation: OperationBinding
): RunDecision => {
  if (operation.policy === "parallel") return { kind: "start" };

  const live = liveInvocations(state, operation.id).map((i) => i.id);
  if (live.length === 0) return { kind: "start" };

  return operation.policy === "queue"
    ? { kind: "queue", after: live }
    : { kind: "replace", cancel: live };
};
