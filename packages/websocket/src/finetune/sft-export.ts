/**
 * Turn graded chat runs into supervised fine-tuning records.
 *
 * A record is one stretch of a chat run in the Hugging Face chat format — the
 * `messages` and `tools` a chat template renders — taken from the last
 * request of that stretch, with the reply to it appended. A run the product
 * never compacted is one stretch, ending in the model's final reply. A
 * compaction rewrites the history the model sees, so each stretch between
 * compactions becomes its own record. Only runs whose outcome checks all
 * passed become records; the rest are the reason for fine-tuning, not
 * material for it.
 *
 * Thinking text is dropped. The model is trained on what it says and calls,
 * and Gemma's guide is to keep earlier thoughts out of multi-turn history.
 */
import { createHash } from "node:crypto";
import { COMPACTION_SUMMARY_PROMPT } from "../session/chat-compaction.js";
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
  /**
   * The last request before each compaction, oldest first, with the index of
   * the reply that answered it. Absent when the history was never rewritten.
   */
  segments?: TraceSegment[];
  /** What the run's compaction summaries and refused requests cost; neither is in `replies`. */
  compactionCostUsd?: number;
  /**
   * The input window the chat turn compacted against (`sample
   * --context-window`), or null when the provider's own window applied.
   * Whether a record fits the student is measured in the student's tokens by
   * `train.py check --max-seq`, not here: the teacher's counts differ by up
   * to a quarter, and images count in them but not in a record.
   */
  contextWindow?: number | null;
}

/** The end of one stretch of a run: its last request and the reply to it. */
export interface TraceSegment {
  request: Pick<WireExchange, "messages" | "tools">;
  replyIndex: number;
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
    /** Which stretch of the run this record is, from 0, and how many it had. */
    segment: number;
    segments: number;
  };
}

export type RejectReason =
  | "not-achieved"
  | "no-final-request"
  | "empty-final-reply"
  | "final-reply-calls-tools"
  | "history-mismatch"
  | "segment-reply-empty"
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
 * True for the request a compaction sends its summarizer. It runs on the
 * teacher's provider, so the capture records it beside the chat's own
 * requests, but it is not a step of the run and never becomes a record.
 */
export function isCompactionSummaryRequest(exchange: Pick<WireExchange, "messages">): boolean {
  // Some providers move the system message into the first user message
  // (OpenRouter's o1/o3 path prefixes it with "Instructions:"), so look for
  // the prompt in whichever message comes first.
  return exchange.messages[0]?.content?.includes(COMPACTION_SUMMARY_PROMPT) === true;
}

/**
 * The run's own completed requests, and what everything else it sent cost:
 * the compaction summaries and requests the provider refused (a context-limit
 * error the turn retried after compacting). The sampler keeps that cost in its
 * budget and leaves those requests out of the trace.
 */
export function splitCompactionRequests<T extends Pick<WireExchange, "messages" | "costUsd" | "status">>(
  exchanges: readonly T[]
): { chat: T[]; summaryCostUsd: number } {
  const chat: T[] = [];
  let summaryCostUsd = 0;
  for (const exchange of exchanges) {
    const completed = exchange.status >= 200 && exchange.status < 300;
    if (completed && !isCompactionSummaryRequest(exchange)) chat.push(exchange);
    else summaryCostUsd += exchange.costUsd ?? 0;
  }
  return { chat, summaryCostUsd };
}

/**
 * Indexes of the requests after which the history was rewritten: request
 * `i + 1` does not start with every message request `i` sent. The chat turn
 * only appends (cache invariant I2), so this marks a compaction.
 */
export function segmentEnds(requests: ReadonlyArray<Pick<WireExchange, "messages">>): number[] {
  const ends: number[] = [];
  for (let i = 0; i + 1 < requests.length; i++) {
    const sent = requests[i]!.messages;
    const next = requests[i + 1]!.messages;
    const extends_ = sent.length <= next.length && sent.every((m, k) => JSON.stringify(m) === JSON.stringify(next[k]));
    if (!extends_) ends.push(i);
  }
  return ends;
}

/** The segments `sample` stores for a run's requests: every stretch but the last. */
export function traceSegments(exchanges: ReadonlyArray<Pick<WireExchange, "messages" | "tools">>): TraceSegment[] {
  return segmentEnds(exchanges).map((i) => ({
    request: { messages: exchanges[i]!.messages, tools: exchanges[i]!.tools },
    replyIndex: i
  }));
}

/**
 * One stretch as a record: `request` plus the reply at `replyIndex`, after
 * checking that the request replays every reply the stretch produced since
 * `firstReply`.
 */
function stretchRecord(
  trace: ChatTrace,
  request: Pick<WireExchange, "messages" | "tools">,
  firstReply: number,
  replyIndex: number,
  position: { segment: number; segments: number }
): SftRecord | RejectReason {
  const answer = trace.replies[replyIndex]!;
  const reply = toSftMessage(answer.reply);
  const messages = nameToolResults(request.messages.map(toSftMessage));
  const produced = trace.replies.slice(firstReply, replyIndex).map((r) => callKey(toSftMessage(r.reply)));
  const replayed = messages.filter((m) => m.role === "assistant").slice(-produced.length);
  if (produced.length > 0 && replayed.map(callKey).join("\n") !== produced.join("\n")) {
    return "history-mismatch";
  }
  messages.push(reply);
  return {
    messages,
    tools: request.tools,
    meta: {
      taskId: trace.taskId,
      model: trace.model,
      sample: trace.sample,
      assistantTurns: messages.filter((m) => m.role === "assistant").length,
      toolCallCount: trace.toolCallCount,
      finalPromptTokens: answer.promptTokens,
      think: trace.think,
      ...position
    }
  };
}

/**
 * Convert one trace into one record per stretch, oldest first, or say why it
 * is not training material.
 *
 * `history-mismatch` means a request does not replay what the model produced
 * earlier in its stretch, so the record would not show what the model
 * actually said at that step. A compaction the trace does not record as a
 * segment shows up this way.
 */
export function traceToSftRecords(trace: ChatTrace): SftRecord[] | RejectReason {
  if (!trace.achieved) return "not-achieved";
  const request = trace.finalRequest;
  const last = trace.replies.at(-1);
  if (request === null || last === undefined) return "no-final-request";
  const final = toSftMessage(last.reply);
  if (final.tool_calls?.length) return "final-reply-calls-tools";
  if (final.content.trim() === "") return "empty-final-reply";

  const stretches = [...(trace.segments ?? []), { request, replyIndex: trace.replies.length - 1 }];
  const records: SftRecord[] = [];
  let firstReply = 0;
  for (const [segment, stretch] of stretches.entries()) {
    const reply = trace.replies[stretch.replyIndex];
    if (reply === undefined) return "no-final-request";
    const said = toSftMessage(reply.reply);
    if (said.content.trim() === "" && !said.tool_calls?.length) return "segment-reply-empty";
    const record = stretchRecord(trace, stretch.request, firstReply, stretch.replyIndex, {
      segment,
      segments: stretches.length
    });
    if (typeof record === "string") return record;
    records.push(record);
    firstReply = stretch.replyIndex + 1;
  }
  return records;
}

/** The record of a run's last stretch, the one that ends in its final reply. */
export function traceToSft(trace: ChatTrace): SftRecord | RejectReason {
  const records = traceToSftRecords(trace);
  return typeof records === "string" ? records : records.at(-1)!;
}

/** What the model said in a record — the part training learns, for dedup. */
export function recordFingerprint(record: SftRecord): string {
  const said = record.messages.filter((m) => m.role === "assistant").map(callKey).join("\n");
  return createHash("sha256").update(`${record.meta.taskId}\n${said}`).digest("hex");
}

export interface ExportSummary {
  /** Records written. A compacted run gives one per stretch. */
  kept: number;
  /** Runs that became more than one record. */
  segmentedRuns: number;
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
  const summary: ExportSummary = { kept: 0, segmentedRuns: 0, rejected: {}, byTask: {} };
  for (const trace of traces) {
    // A run of a validation task never becomes training data.
    const result = options.heldOut?.(trace) ? "validation" : traceToSftRecords(trace);
    if (typeof result === "string") {
      summary.rejected[result] = (summary.rejected[result] ?? 0) + 1;
      continue;
    }
    if (result.length > 1) summary.segmentedRuns += 1;
    for (const record of result) {
      const key = recordFingerprint(record);
      if (seen.has(key)) {
        summary.rejected.duplicate = (summary.rejected.duplicate ?? 0) + 1;
        continue;
      }
      seen.add(key);
      records.push(record);
      summary.kept += 1;
      summary.byTask[trace.taskId] = (summary.byTask[trace.taskId] ?? 0) + 1;
    }
  }
  return { records, summary };
}
