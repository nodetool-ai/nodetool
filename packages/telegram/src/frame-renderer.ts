/**
 * FrameRenderer — the pure fold from server frames to render operations
 * (design §6).
 *
 * A turn's visible state in a Telegram chat is two messages: a **status line**
 * that reports what the agent is doing, and a **stream message** that grows as
 * text arrives. This module owns the rules that decide when each is created,
 * edited, rolled over and finalized. It performs no I/O, imports no Telegram
 * types, and reads no clock — `nowMs` is a parameter — so the whole streaming
 * UX is exercised by scripted frame sequences in tests.
 *
 * The adapter maps each op onto one Bot API call.
 */

import type {
  ErrorMessage,
  JobUpdate,
  Message,
  NodeUpdate,
  OutputUpdate,
  PlanningUpdate,
  ProcessingMessage,
  TaskUpdate,
  ToolCallUpdate
} from "@nodetool-ai/protocol";

import { DEFAULT_CHUNK_MAX, TELEGRAM_MESSAGE_LIMIT, splitOnce } from "./chunk.js";
import { markdownToTelegramHtml } from "./markdown-html.js";

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

/** Which of the turn's two messages an op acts on. */
export type RenderTarget = "status" | "stream";

/** How the adapter must ask Telegram to parse the text. */
export type ParseMode = "html" | "none";

/** An asset the turn produced, to be sent as a photo or document. */
export interface AssetAttachment {
  /** Where the bytes live — `asset://…` or an absolute URL. */
  readonly uri: string;
  /** Display name, when the frame carried one. */
  readonly name: string | null;
  /** Content type, when the frame carried one. */
  readonly contentType: string | null;
}

export interface TypingOp {
  readonly kind: "typing";
}

export interface SendOp {
  readonly kind: "send";
  readonly target: RenderTarget;
  readonly text: string;
  readonly parseMode: ParseMode;
}

export interface EditOp {
  readonly kind: "edit";
  readonly target: RenderTarget;
  readonly text: string;
  readonly parseMode: ParseMode;
}

/**
 * The message reaches its final content and stops being edited. `create` is
 * true when no message exists yet, so the adapter sends instead of edits.
 */
export interface FinalizeOp {
  readonly kind: "finalize";
  readonly target: RenderTarget;
  readonly text: string;
  readonly parseMode: ParseMode;
  readonly create: boolean;
}

export interface AttachOp {
  readonly kind: "attach";
  readonly asset: AssetAttachment;
}

export interface StopNoteOp {
  readonly kind: "stop-note";
  readonly text: string;
}

export type RenderOp = TypingOp | SendOp | EditOp | FinalizeOp | AttachOp | StopNoteOp;

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** The final assistant message the server persists at the end of a turn. */
export interface FinalMessageFrame extends Message {
  readonly type: "message";
}

/** Ack for a `stop` command. */
export interface GenerationStoppedFrame {
  readonly type: "generation_stopped";
  readonly thread_id?: string | null;
  readonly message?: string | null;
}

/**
 * Frames carry an optional monotonic sequence number. `resume_chat` replays
 * everything after `last_seq`, and a replay that overlaps must not re-emit ops
 * — the fold drops any frame whose seq it has already applied.
 */
export interface FrameEnvelope {
  readonly seq?: number | null;
}

export type RenderFrame = (ProcessingMessage | FinalMessageFrame | GenerationStoppedFrame) &
  FrameEnvelope;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface RendererOptions {
  /** Minimum gap between edits of the stream message. Default 1500 ms. */
  readonly editThrottleMs?: number;
  /** Rendered length at which the stream message rolls over. Default 3800. */
  readonly rolloverChars?: number;
}

export interface RendererState {
  /** Markdown for the currently open stream message. */
  readonly carry: string;
  /** A stream message exists in the chat. */
  readonly streamOpen: boolean;
  /** Length of `carry` as last rendered, so a no-op edit is skipped. */
  readonly renderedLength: number;
  /** `nowMs` of the last stream edit, for the throttle. */
  readonly lastEditMs: number;
  /** A typing action has been requested for this turn. */
  readonly typingSent: boolean;
  /** Latest status line, or null when nothing has been reported. */
  readonly status: string | null;
  /** A status message exists in the chat. */
  readonly statusOpen: boolean;
  /** Status text as last rendered. */
  readonly statusRendered: string | null;
  /** The turn has ended — later frames render nothing. */
  readonly ended: boolean;
  /** Highest applied sequence number, for replay suppression. */
  readonly lastSeq: number | null;
  readonly editThrottleMs: number;
  readonly rolloverChars: number;
}

export const DEFAULT_EDIT_THROTTLE_MS = 1500;

export function createRendererState(options: RendererOptions = {}): RendererState {
  return {
    carry: "",
    streamOpen: false,
    renderedLength: 0,
    lastEditMs: Number.NEGATIVE_INFINITY,
    typingSent: false,
    status: null,
    statusOpen: false,
    statusRendered: null,
    ended: false,
    lastSeq: null,
    editThrottleMs: options.editThrottleMs ?? DEFAULT_EDIT_THROTTLE_MS,
    rolloverChars: options.rolloverChars ?? DEFAULT_CHUNK_MAX
  };
}

export interface FoldResult {
  readonly state: RendererState;
  readonly ops: readonly RenderOp[];
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

interface Presented {
  readonly text: string;
  readonly parseMode: ParseMode;
}

function present(markdown: string): Presented {
  const result = markdownToTelegramHtml(markdown);
  return result.ok
    ? { text: result.html, parseMode: "html" }
    : { text: result.text, parseMode: "none" };
}

/**
 * Split `markdown` so the rendered head fits in `limit`. Escaping expands the
 * text (`&` becomes five characters), so the budget is walked down by the
 * measured expansion ratio rather than assumed.
 */
function splitForRender(markdown: string, limit: number): { head: string; rest: string } {
  let budget = Math.min(markdown.length, limit);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { head, rest } = splitOnce(markdown, budget);
    if (head.length === 0) {
      break;
    }
    const rendered = present(head).text.length;
    if (rendered <= limit) {
      return { head, rest };
    }
    const next = Math.floor((budget * limit) / rendered) - 1;
    if (next < 1 || next >= budget) {
      budget = budget - 1;
    } else {
      budget = next;
    }
    if (budget < 1) {
      break;
    }
  }
  return { head: markdown.slice(0, limit), rest: markdown.slice(limit) };
}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------

function statusOps(state: RendererState, line: string): FoldResult {
  if (state.statusRendered === line) {
    return { state, ops: [] };
  }
  const rendered = present(line);
  const op: RenderOp = state.statusOpen
    ? { kind: "edit", target: "status", text: rendered.text, parseMode: rendered.parseMode }
    : { kind: "send", target: "status", text: rendered.text, parseMode: rendered.parseMode };
  return {
    state: { ...state, status: line, statusOpen: true, statusRendered: line },
    ops: [op]
  };
}

function toolLine(frame: ToolCallUpdate): string {
  const detail = frame.message != null && frame.message.length > 0 ? ` — ${frame.message}` : "";
  const done = /(^|\b)(completed|finished|done|success)/i.test(frame.message ?? "");
  const failed = /(^|\b)(failed|error)/i.test(frame.message ?? "");
  const icon = failed ? "❌" : done ? "✅" : "🔧";
  return `${icon} ${frame.name}${detail}`;
}

function taskLine(frame: TaskUpdate): string {
  const label = frame.step?.title ?? frame.task?.title ?? frame.event;
  return `📋 ${label}`;
}

function planningLine(frame: PlanningUpdate): string {
  const detail = frame.content != null && frame.content.length > 0 ? ` — ${frame.content}` : "";
  return `🧠 ${frame.phase} (${frame.status})${detail}`;
}

function nodeLine(frame: NodeUpdate): string {
  return `⚙️ ${frame.node_name} (${frame.status})`;
}

function jobLine(frame: JobUpdate): string {
  return `▶️ job ${frame.status}`;
}

// ---------------------------------------------------------------------------
// Text stream
// ---------------------------------------------------------------------------

/**
 * Close the status message when a text message takes over as the visible
 * surface. Only a *new* stream message replaces it — editing one that already
 * exists changes nothing about which message the user is watching.
 */
function closeStatus(state: RendererState, ops: RenderOp[]): RendererState {
  if (!state.statusOpen || state.status === null || state.streamOpen) {
    return state;
  }
  const rendered = present(state.status);
  ops.push({
    kind: "finalize",
    target: "status",
    text: rendered.text,
    parseMode: rendered.parseMode,
    create: false
  });
  return { ...state, statusOpen: false, statusRendered: null };
}

/**
 * Finalize every full message's worth of buffered text, leaving `carry` at
 * whatever still fits in one message.
 */
function rollOver(state: RendererState, nowMs: number, ops: RenderOp[]): RendererState {
  let next = state;
  while (present(next.carry).text.length > next.rolloverChars) {
    next = closeStatus(next, ops);
    const { head, rest } = splitForRender(next.carry, next.rolloverChars);
    if (head.length === 0) {
      break;
    }
    const rendered = present(head);
    ops.push({
      kind: "finalize",
      target: "stream",
      text: rendered.text,
      parseMode: rendered.parseMode,
      create: !next.streamOpen
    });
    next = { ...next, carry: rest, streamOpen: false, renderedLength: 0, lastEditMs: nowMs };
  }
  return next;
}

/**
 * Emit whatever the accumulated text requires: rollover of anything past the
 * message limit, then a create or a throttled edit for the remainder.
 */
function flushText(state: RendererState, nowMs: number, force: boolean): FoldResult {
  const ops: RenderOp[] = [];
  let next = rollOver(state, nowMs, ops);

  if (next.carry.length === 0) {
    return { state: next, ops };
  }

  if (!next.streamOpen) {
    next = closeStatus(next, ops);
    const rendered = present(next.carry);
    ops.push({
      kind: "send",
      target: "stream",
      text: rendered.text,
      parseMode: rendered.parseMode
    });
    return {
      state: { ...next, streamOpen: true, renderedLength: next.carry.length, lastEditMs: nowMs },
      ops
    };
  }

  const unchanged = next.renderedLength === next.carry.length;
  const throttled = nowMs - next.lastEditMs < next.editThrottleMs;
  if (unchanged || (throttled && !force)) {
    return { state: next, ops };
  }

  const rendered = present(next.carry);
  ops.push({
    kind: "edit",
    target: "stream",
    text: rendered.text,
    parseMode: rendered.parseMode
  });
  return {
    state: { ...next, renderedLength: next.carry.length, lastEditMs: nowMs },
    ops
  };
}

/** Finalize the stream message and everything still buffered behind it. */
function finishText(state: RendererState, nowMs: number): FoldResult {
  const ops: RenderOp[] = [];
  let next = rollOver(state, nowMs, ops);

  if (next.carry.length > 0) {
    next = closeStatus(next, ops);
    const rendered = present(next.carry);
    ops.push({
      kind: "finalize",
      target: "stream",
      text: rendered.text,
      parseMode: rendered.parseMode,
      create: !next.streamOpen
    });
    next = { ...next, streamOpen: true, renderedLength: next.carry.length, lastEditMs: nowMs };
  }

  return { state: next, ops };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Every asset reference nested anywhere in an `output_update` value. */
export function collectAssetRefs(value: unknown, found: AssetAttachment[] = []): AssetAttachment[] {
  if (typeof value === "string") {
    if (value.startsWith("asset://")) {
      found.push({ uri: value, name: null, contentType: null });
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAssetRefs(item, found);
    }
    return found;
  }
  if (!isRecord(value)) {
    return found;
  }
  const uri = stringField(value, "uri") ?? stringField(value, "url");
  if (uri !== null) {
    found.push({
      uri,
      name: stringField(value, "name") ?? stringField(value, "filename"),
      contentType: stringField(value, "content_type") ?? stringField(value, "type")
    });
    return found;
  }
  for (const nested of Object.values(value)) {
    collectAssetRefs(nested, found);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Final message text
// ---------------------------------------------------------------------------

function textOfMessage(frame: FinalMessageFrame): string {
  const content = frame.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => (part as { text: string }).text)
    .join("");
}

// ---------------------------------------------------------------------------
// Fold
// ---------------------------------------------------------------------------

/**
 * Apply one frame to the renderer state.
 *
 * @param state Renderer state from `createRendererState` or a previous fold.
 * @param frame The server frame.
 * @param nowMs Caller's clock, in milliseconds. The only time source.
 */
export function foldFrame(
  state: RendererState,
  frame: RenderFrame,
  nowMs: number
): FoldResult {
  const seq = frame.seq;
  if (typeof seq === "number" && state.lastSeq !== null && seq <= state.lastSeq) {
    return { state, ops: [] };
  }
  const seen: RendererState =
    typeof seq === "number" ? { ...state, lastSeq: Math.max(seq, state.lastSeq ?? seq) } : state;

  if (seen.ended) {
    return { state: seen, ops: [] };
  }

  switch (frame.type) {
    case "chunk": {
      const content = frame.content;
      if (typeof content !== "string" || content.length === 0) {
        return { state: seen, ops: [] };
      }
      if (frame.thinking === true) {
        return { state: seen, ops: [] };
      }
      const ops: RenderOp[] = [];
      let next = seen;
      if (!next.typingSent && !next.streamOpen) {
        ops.push({ kind: "typing" });
        next = { ...next, typingSent: true };
      }
      next = { ...next, carry: next.carry + content };
      const flushed = flushText(next, nowMs, frame.done === true);
      return { state: flushed.state, ops: [...ops, ...flushed.ops] };
    }

    case "tool_call_update":
      return statusOps(seen, toolLine(frame));

    case "task_update":
      return statusOps(seen, taskLine(frame));

    case "planning_update":
      return statusOps(seen, planningLine(frame));

    case "node_update":
      return statusOps(seen, nodeLine(frame));

    case "job_update":
      return statusOps(seen, jobLine(frame));

    case "output_update": {
      const assets = collectAssetRefs((frame as OutputUpdate).value);
      return {
        state: seen,
        ops: assets.map((asset) => ({ kind: "attach", asset }) as const)
      };
    }

    case "message": {
      const finalText = textOfMessage(frame as FinalMessageFrame);
      const withText =
        seen.carry.length === 0 && finalText.length > 0
          ? { ...seen, carry: finalText }
          : seen;
      const finished = finishText(withText, nowMs);
      const ops: RenderOp[] = [...finished.ops];
      const closed = closeStatus(finished.state, ops);
      return { state: { ...closed, ended: true }, ops };
    }

    case "error": {
      const ops: RenderOp[] = [];
      let next = seen;
      if (next.carry.length > 0) {
        const flushed = finishText(next, nowMs);
        ops.push(...flushed.ops);
        next = flushed.state;
      }
      const line = `⚠️ ${(frame as ErrorMessage).message}`;
      const rendered = present(line);
      ops.push({
        kind: "finalize",
        target: "status",
        text: rendered.text,
        parseMode: rendered.parseMode,
        create: !next.statusOpen
      });
      return {
        state: { ...next, ended: true, statusOpen: false, status: line, statusRendered: null },
        ops
      };
    }

    case "generation_stopped": {
      const finished = finishText(seen, nowMs);
      const ops: RenderOp[] = [...finished.ops];
      const closed = closeStatus(finished.state, ops);
      ops.push({ kind: "stop-note", text: "⏹ stopped" });
      return { state: { ...closed, ended: true }, ops };
    }

    default:
      return { state: seen, ops: [] };
  }
}

/** Fold a whole sequence of frames, for tests and replay. */
export function foldFrames(
  state: RendererState,
  frames: readonly { frame: RenderFrame; nowMs: number }[]
): FoldResult {
  const ops: RenderOp[] = [];
  let next = state;
  for (const entry of frames) {
    const result = foldFrame(next, entry.frame, entry.nowMs);
    next = result.state;
    ops.push(...result.ops);
  }
  return { state: next, ops };
}

export { TELEGRAM_MESSAGE_LIMIT };
