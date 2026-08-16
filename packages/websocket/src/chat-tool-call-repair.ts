/**
 * Keeping a chat transcript well-formed when a turn does not finish.
 *
 * A superseding user message cancels the turn in flight (`beginChatTurn`), and
 * the assistant message announcing a tool call has usually already been
 * persisted by then. Without the result row that belongs with it, the thread
 * holds a tool call nobody answered — which Anthropic rejects outright ("
 * `tool_use` ids were found without `tool_result` blocks"), so switching model
 * on such a thread fails every later turn.
 *
 * Two users, one wording:
 *  - the runner writes {@link SUPERSEDED_TOOL_RESULT} for calls left open when
 *    a turn tears down, so the row is never missing in the first place;
 *  - {@link repairOrphanedToolCalls} patches history at *load* time, for the
 *    threads already carrying an orphan. It returns a new array and writes
 *    nothing back — repairing the stored rows is a separate decision.
 */

import type { Message as ProviderMessage } from "@nodetool-ai/runtime";
import { isString } from "./lib/wire-values.js";

/**
 * What an abandoned tool call reports to the model.
 *
 * The wording is deliberate. When a turn is superseded the tool has often
 * ALREADY run: the provider loop checks its abort signal before dispatching a
 * call, never during, so a call in flight runs to completion and only its
 * result is lost. Telling the model the call did not execute would invite it
 * to repeat a side effect that already landed — worse than saying nothing.
 * State the interruption, admit the outcome is unknown, and send the model to
 * look.
 */
export const SUPERSEDED_TOOL_RESULT =
  "[interrupted] A new user message ended this turn before the result of " +
  "this tool call was recorded. The call may already have run and taken " +
  "effect — its outcome is unknown. Check the current state before running " +
  "it again.";

/** Ids of tool calls in `messages` that no later tool message answers. */
export function orphanedToolCallIds(
  messages: readonly ProviderMessage[]
): string[] {
  const answered = new Set<string>();
  for (const m of messages) {
    if (m.role === "tool" && isString(m.toolCallId)) {
      answered.add(m.toolCallId);
    }
  }
  const orphans: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !Array.isArray(m.toolCalls)) continue;
    for (const call of m.toolCalls) {
      if (isString(call.id) && !answered.has(call.id)) {
        orphans.push(call.id);
      }
    }
  }
  return orphans;
}

/** The tool message a never-answered call gets. */
export function supersededToolMessage(
  toolCallId: string,
  threadId?: string | null
): ProviderMessage {
  const message: ProviderMessage = {
    role: "tool",
    content: SUPERSEDED_TOOL_RESULT,
    toolCallId,
    toolCalls: null
  };
  if (threadId !== undefined) {
    message.threadId = threadId;
  }
  return message;
}

/**
 * Insert a synthetic result for every tool call the transcript leaves open.
 *
 * Each missing result is placed directly after the tool messages that already
 * follow its assistant message, which is where the provider converters expect
 * it. A call whose assistant message is absent from `messages` is left alone:
 * on the resume fast path the array is a slice of the thread, and the real
 * result may simply sit outside it.
 */
export function repairOrphanedToolCalls(
  messages: readonly ProviderMessage[]
): ProviderMessage[] {
  const orphans = new Set(orphanedToolCallIds(messages));
  if (orphans.size === 0) return [...messages];

  const out: ProviderMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    out.push(m);
    if (m.role !== "assistant" || !Array.isArray(m.toolCalls)) continue;
    const missing = m.toolCalls.filter(
      (call) => isString(call.id) && orphans.has(call.id)
    );
    if (missing.length === 0) continue;
    // Step over the real results this assistant did get, so the synthetic ones
    // join that block instead of splitting it.
    while (i + 1 < messages.length && messages[i + 1].role === "tool") {
      out.push(messages[++i]);
    }
    for (const call of missing) {
      out.push(supersededToolMessage(call.id, m.threadId));
    }
  }
  return out;
}
