/**
 * Turn graded chat runs into supervised fine-tuning records.
 *
 * A record is one finished chat turn in the Hugging Face chat format — the
 * `messages` and `tools` a chat template renders — taken from the last
 * request the turn made, with the model's final reply appended. Only runs
 * whose outcome checks all passed become records; the rest are the reason
 * for fine-tuning, not material for it.
 *
 * Thinking text is dropped. The model is trained on what it says and calls,
 * and Gemma's guide is to keep earlier thoughts out of multi-turn history.
 */
import { createHash } from "node:crypto";
import type { WireExchange, WireMessage } from "./ollama-capture.js";
import type { RunBehaviour } from "./run-behaviour.js";

/** One sampled run, as `finetune-data.ts sample` appends it. */
export interface ChatTrace {
  taskId: string;
  objective: string;
  model: string;
  sample: number;
  /** OLLAMA_THINK during the run; null when the model's default applied. */
  think: string | null;
  achieved: boolean;
  completed: boolean;
  outcomes: Array<{ name: string; passed: boolean }>;
  toolCallCount: number;
  durationMs: number;
  error?: string;
  /** Every request's reply and stats, in order. */
  replies: Array<
    Pick<WireExchange, "reply" | "doneReason" | "promptTokens" | "evalTokens" | "status" | "costUsd"> & {
      messageCount: number;
    }
  >;
  /** The last request in full: what the model saw before its final reply. */
  finalRequest: Pick<WireExchange, "messages" | "tools"> | null;
}

/**
 * A trace line as `sample` writes it now: the run's behaviour counters ride
 * along. Lines written before them lack the fields, and `traceRunBehaviour`
 * recomputes them.
 */
export type ChatTraceLine = ChatTrace & Partial<RunBehaviour>;

export interface SftMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    type: "function";
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  name?: string;
}

export interface SftRecord {
  messages: SftMessage[];
  tools: unknown[];
  meta: {
    taskId: string;
    model: string;
    sample: number;
    assistantTurns: number;
    toolCallCount: number;
    /**
     * Ollama's token count for the last request: the record minus its final
     * reply, rendered with Ollama's template. The trainer compares its own
     * render against it to prove the chat templates agree; that comparison
     * holds only for runs sampled with `think` "false".
     */
    finalPromptTokens: number | null;
    think: string | null;
  };
}

export type RejectReason =
  | "not-achieved"
  | "no-final-request"
  | "empty-final-reply"
  | "final-reply-calls-tools"
  | "history-mismatch"
  | "duplicate"
  | "validation";

function argumentsObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return { input: value };
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Stands in for an image (a timeline frame preview, say). Records are text
 * only, so the student sees that an image arrived without seeing it; the
 * run's actions are still worth learning.
 */
export const IMAGE_PLACEHOLDER = "[image]";

/** One wire message in chat-template form, without thinking or images. */
export function toSftMessage(message: WireMessage): SftMessage {
  const role = message.role as SftMessage["role"];
  const images = (message.images ?? []).map(() => IMAGE_PLACEHOLDER).join("\n");
  const text = message.content ?? "";
  const out: SftMessage = { role, content: images === "" ? text : text === "" ? images : `${images}\n${text}` };
  if (message.tool_calls?.length) {
    out.tool_calls = message.tool_calls.map((call) => ({
      type: "function",
      function: { name: call.function.name, arguments: argumentsObject(call.function.arguments) }
    }));
  }
  if (role === "tool" && message.tool_name) out.name = message.tool_name;
  return out;
}

/**
 * Give each tool result the name of the call it answers. NodeTool sends tool
 * results without `tool_name`; chat templates render the name back.
 */
export function nameToolResults(messages: SftMessage[]): SftMessage[] {
  let pending: string[] = [];
  return messages.map((message) => {
    if (message.role === "assistant") {
      pending = (message.tool_calls ?? []).map((c) => c.function.name);
      return message;
    }
    if (message.role !== "tool") return message;
    const name = pending.shift();
    return message.name !== undefined || name === undefined ? message : { ...message, name };
  });
}

const callKey = (message: SftMessage): string =>
  JSON.stringify([message.content.trim(), message.tool_calls ?? []]);

/**
 * Convert one trace, or say why it is not training material.
 *
 * `history-mismatch` means the product rewrote an earlier assistant turn
 * before the last request (compaction, say), so the final view no longer
 * shows what the model actually produced at that step.
 */
export function traceToSft(trace: ChatTrace): SftRecord | RejectReason {
  if (!trace.achieved) return "not-achieved";
  const request = trace.finalRequest;
  const last = trace.replies.at(-1);
  if (request === null || last === undefined) return "no-final-request";
  const final = toSftMessage(last.reply);
  if (final.tool_calls?.length) return "final-reply-calls-tools";
  if (final.content.trim() === "") return "empty-final-reply";

  const messages = nameToolResults(request.messages.map(toSftMessage));
  const produced = trace.replies.slice(0, -1).map((r) => callKey(toSftMessage(r.reply)));
  const replayed = messages.filter((m) => m.role === "assistant").slice(-produced.length);
  if (produced.length > 0 && replayed.map(callKey).join("\n") !== produced.join("\n")) {
    return "history-mismatch";
  }
  messages.push(final);
  return {
    messages,
    tools: request.tools,
    meta: {
      taskId: trace.taskId,
      model: trace.model,
      sample: trace.sample,
      assistantTurns: messages.filter((m) => m.role === "assistant").length,
      toolCallCount: trace.toolCallCount,
      finalPromptTokens: last.promptTokens,
      think: trace.think
    }
  };
}

/** What the model said in a record — the part training learns, for dedup. */
export function recordFingerprint(record: SftRecord): string {
  const said = record.messages.filter((m) => m.role === "assistant").map(callKey).join("\n");
  return createHash("sha256").update(`${record.meta.taskId}\n${said}`).digest("hex");
}

export interface ExportSummary {
  kept: number;
  rejected: Partial<Record<RejectReason, number>>;
  byTask: Record<string, number>;
}

/** Filter, convert and de-duplicate a set of traces. */
export function exportSft(
  traces: Iterable<ChatTrace>,
  options: { heldOut?: (trace: ChatTrace) => boolean } = {}
): {
  records: SftRecord[];
  summary: ExportSummary;
} {
  const records: SftRecord[] = [];
  const seen = new Set<string>();
  const summary: ExportSummary = { kept: 0, rejected: {}, byTask: {} };
  for (const trace of traces) {
    // A run of a validation task never becomes training data.
    const result = options.heldOut?.(trace) ? "validation" : traceToSft(trace);
    let reason: RejectReason | null = typeof result === "string" ? result : null;
    if (typeof result !== "string") {
      const key = recordFingerprint(result);
      if (seen.has(key)) reason = "duplicate";
      else {
        seen.add(key);
        records.push(result);
        summary.kept += 1;
        summary.byTask[trace.taskId] = (summary.byTask[trace.taskId] ?? 0) + 1;
      }
    }
    if (reason !== null) summary.rejected[reason] = (summary.rejected[reason] ?? 0) + 1;
  }
  return { records, summary };
}
