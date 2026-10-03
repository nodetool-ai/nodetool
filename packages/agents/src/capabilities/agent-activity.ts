/**
 * What an agent loop inside a capability reports while it runs.
 *
 * A capability that drives `provider.generateLoop` answers with one value when
 * the loop ends. A mini app waiting on that value showed a spinner for minutes.
 * The reporter puts the loop's text and tool calls on the run's context as the
 * standard processing messages (`chunk`, `tool_call_update`,
 * `tool_result_update`), so every host that listens to the context shows the
 * work while it happens: the script run route streams them, a workflow run
 * forwards them.
 */

import type { ProcessingContext, ProviderStreamItem } from "@nodetool-ai/runtime";
import { isChunk, isToolCall } from "@nodetool-ai/runtime";
import { capabilitySpec } from "./registry.js";
import { isString } from "../utils/type-guards.js";

/** The longest tool result summary one message carries. */
const RESULT_SUMMARY_CHARS = 400;

export interface AgentActivityReporter {
  /** Report one provider stream item: a text chunk or a tool call announcement. */
  event(item: ProviderStreamItem): void;
  /** Report how one tool call settled. */
  toolResult(
    call: { id: string; name: string },
    result: unknown,
    isError: boolean
  ): void;
}

const summarize = (result: unknown): string => {
  const text = isString(result) ? result : JSON.stringify(result) ?? "";
  return text.length > RESULT_SUMMARY_CHARS
    ? `${text.slice(0, RESULT_SUMMARY_CHARS)}…`
    : text;
};

/** The label a person reads for one tool call: the capability's own message, or its name. */
const callLabel = (name: string, args: Record<string, unknown>): string => {
  try {
    return capabilitySpec(name)?.userMessage?.(args) ?? name;
  } catch {
    return name;
  }
};

/**
 * A reporter that emits on `context`. `nodeId` names the loop in each message,
 * so a host can tell two loops of one run apart.
 */
export function agentActivityReporter(
  context: ProcessingContext,
  nodeId: string
): AgentActivityReporter {
  return {
    event(item) {
      if (isToolCall(item)) {
        context.emit({
          type: "tool_call_update",
          node_id: nodeId,
          tool_call_id: item.id,
          name: item.name,
          args: item.args ?? {},
          message: callLabel(item.name, item.args ?? {})
        });
        return;
      }
      if (isChunk(item) && !item.thinking && item.content_type !== "audio") {
        if (item.content.length === 0) return;
        context.emit({
          type: "chunk",
          node_id: nodeId,
          content: item.content,
          content_type: "text",
          done: false
        });
      }
    },
    toolResult(call, result, isError) {
      context.emit({
        type: "tool_result_update",
        node_id: nodeId,
        tool_call_id: call.id,
        name: call.name,
        result: { summary: summarize(result) },
        is_error: isError
      });
    }
  };
}
