/**
 * @nodetool-ai/sdk — TypeScript SDK for the NodeTool server.
 *
 * Surfaces:
 *   - `createNodetoolClient()` — typed tRPC client (full AppRouter coverage)
 *     plus a `.chat()` factory for the streaming WebSocket.
 *   - `ChatSocket` — typed event-emitter wrapper around the chat WebSocket
 *     protocol (msgpack frames, with JSON fallback).
 *
 * Works in both browsers (native `WebSocket`/`fetch`) and Node ≥18 (native
 * `fetch`; pass a `WebSocket` constructor from the `ws` package).
 */

export { createNodetoolClient } from "./client.js";
export type {
  NodetoolClient,
  CreateNodetoolClientOptions
} from "./client.js";

export { ChatSocket } from "./chat.js";
export type {
  ChatEvent,
  ChatChunkEvent,
  ChatMessageEvent,
  ChatToolCallEvent,
  ChatErrorEvent,
  ChatGenerationStoppedEvent,
  ChatThreadUpdateEvent,
  ChatRawEvent,
  SendChatMessageOptions,
  ChatSocketOptions,
  ConnectionState,
  WebSocketCtor
} from "./chat.js";

// Re-export the underlying tRPC AppRouter type so consumers can write their
// own typed wrappers without depending on @nodetool-ai/websocket directly.
export type { AppRouter } from "@nodetool-ai/websocket/trpc";

// Re-export the most commonly used protocol types.
export type {
  Chunk,
  ContentType,
  JobStatus,
  TaskUpdate,
  PlanningUpdate,
  ToolCallUpdate,
  ErrorMessage
} from "@nodetool-ai/protocol";
