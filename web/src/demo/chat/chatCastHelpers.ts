/**
 * Builders for authoring synthetic chat demo casts — cuts the per-cast
 * boilerplate down to the parts that differ, mirroring `../castHelpers.ts`.
 */
import type { ToolCall } from "../../stores/ApiTypes";
import type { ChatCastEvent, ChatViewStatus } from "./chatCastTypes";

export const userMessage = (t: number, text: string): ChatCastEvent => ({
  t,
  payload: {
    kind: "message",
    message: { type: "message", role: "user", content: text },
  },
});

export const assistantStart = (
  t: number,
  id: string,
  toolCalls?: ToolCall[]
): ChatCastEvent => ({
  t,
  payload: { kind: "assistantStart", id, toolCalls },
});

export const status = (t: number, status: ChatViewStatus): ChatCastEvent => ({
  t,
  payload: { kind: "status", status },
});

export const toolRunning = (
  t: number,
  toolCallId: string | null,
  toolMessage?: string | null
): ChatCastEvent => ({
  t,
  payload: { kind: "toolRunning", toolCallId, toolMessage },
});

export const toolResult = (
  t: number,
  id: string,
  toolCalls: ToolCall[]
): ChatCastEvent => ({ t, payload: { kind: "toolResult", id, toolCalls } });

export const progress = (
  t: number,
  progress: number,
  total: number,
  message: string | null = null
): ChatCastEvent => ({ t, payload: { kind: "progress", progress, total, message } });

/** Stream `text` split into `chunks` evenly across [startMs, startMs+spanMs]. */
export const assistantStream = (
  id: string,
  chunks: string[],
  startMs: number,
  spanMs: number
): ChatCastEvent[] =>
  chunks.map((text, i) => ({
    t: Math.round(startMs + (spanMs * i) / chunks.length),
    payload: { kind: "chunk", id, text },
  }));
