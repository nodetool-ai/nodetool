/**
 * Chat demo "cast" format — a self-contained, backend-free capture of one
 * chat conversation, replayed through the real `ChatView` UI.
 *
 * Mirrors the workflow cast (`../castTypes.ts`) in spirit — a time-stamped
 * timeline of small, typed events that a player folds into props as a pure
 * function of elapsed time — but the events describe chat state (messages,
 * streaming tokens, tool calls, status) instead of workflow protocol
 * messages, since `ChatView` is driven by simple props rather than a
 * store-backed reducer.
 */
import type { LanguageModel, Message, TodoItem } from "../../stores/ApiTypes";

/** Schema version. Bump on breaking changes to the cast shape. */
export const CHAT_CAST_VERSION = 1 as const;

export type ChatViewStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error"
  | "streaming"
  | "reconnecting"
  | "disconnecting"
  | "failed";

export type ChatCastEventPayload =
  /** Set the connection/turn status shown by the composer and thread. */
  | { kind: "status"; status: ChatViewStatus }
  /** Append a fully-formed message (user turn, or a message that arrives whole). */
  | { kind: "message"; message: Message }
  /** Start a new assistant message with empty content, to be filled by `chunk`s. */
  | { kind: "assistantStart"; id: string; toolCalls?: Message["tool_calls"] }
  /** Append `text` to the assistant message with the given id. */
  | { kind: "chunk"; id: string; text: string }
  /** Mark a tool call on the given message id as actively running (or clear it). */
  | { kind: "toolRunning"; toolCallId: string | null; toolMessage?: string | null }
  /** Attach/replace the `tool_calls` array on a message once results land. */
  | { kind: "toolResult"; id: string; toolCalls: Message["tool_calls"] }
  /** A progress ramp (e.g. media generation) shown above the composer. */
  | { kind: "progress"; progress: number; total: number; message: string | null }
  /** Todo list shown in the sidebar, mirroring `GlobalChatStore.todosByThread`. */
  | { kind: "todos"; todos: TodoItem[] };

export interface ChatCastEvent {
  /** Milliseconds from the start of the timeline. */
  t: number;
  payload: ChatCastEventPayload;
}

/** A complete, replayable chat-panel demo recording. */
export interface ChatDemoCast {
  version: typeof CHAT_CAST_VERSION;
  kind: "chat";
  /** Unique id for the cast. */
  id: string;
  /** Human title shown in the demo gallery. */
  name: string;
  description?: string;
  createdAt: string;
  /** Total timeline length in ms. */
  durationMs: number;
  /** Suggested frame rate for rendering this cast. Defaults to 30. */
  fps?: number;
  /** The model badge shown in the composer/header. */
  model: LanguageModel;
  /** Timeline of chat events, sorted ascending by `t`. */
  events: ChatCastEvent[];
}

/** Narrow runtime guard — enough to fail fast on a malformed cast. */
export function isChatDemoCast(value: unknown): value is ChatDemoCast {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === CHAT_CAST_VERSION &&
    c.kind === "chat" &&
    typeof c.id === "string" &&
    Array.isArray(c.events)
  );
}
