/**
 * ChatSocket — typed wrapper around the unified NodeTool chat WebSocket.
 *
 * Wire format: msgpack frames by default (length-tagged, binary), with a JSON
 * text fallback if msgpack encoding fails. Inbound frames are decoded and
 * dispatched to the appropriate `on(<type>)` handlers as a discriminated
 * union, so consumers never see raw bytes.
 */

import { pack, unpack } from "msgpackr";
import type {
  Chunk,
  ToolCallUpdate,
  PlanningUpdate,
  TaskUpdate,
  ErrorMessage
} from "@nodetool-ai/protocol";

/* ─── Types ────────────────────────────────────────────────────────── */

export type WebSocketCtor = typeof WebSocket;

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

/** A streamed text chunk. `done: true` marks the end of one assistant turn. */
export interface ChatChunkEvent extends Chunk {
  type: "chunk";
}

/** A complete persisted message (assistant final or echoed user input). */
export interface ChatMessageEvent {
  type: "message";
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  thread_id?: string | null;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string | null;
  provider?: string | null;
  model?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Tool invocation announced mid-stream. */
export interface ChatToolCallEvent extends ToolCallUpdate {}

/** Server-side failure during chat processing. */
export interface ChatErrorEvent extends ErrorMessage {}

/** Ack frame after a `stop` command. */
export interface ChatGenerationStoppedEvent {
  type: "generation_stopped";
  thread_id?: string | null;
  job_id?: string | null;
  message?: string;
}

/** A new derived title for a thread (e.g. after summarisation). */
export interface ChatThreadUpdateEvent {
  type: "thread_update";
  thread_id: string;
  title?: string;
}

/** Anything else — surfaced raw so callers can opt in to it. */
export interface ChatRawEvent {
  type: string;
  [key: string]: unknown;
}

export type ChatEvent =
  | ChatChunkEvent
  | ChatMessageEvent
  | ChatToolCallEvent
  | ChatErrorEvent
  | ChatGenerationStoppedEvent
  | ChatThreadUpdateEvent
  | PlanningUpdate
  | TaskUpdate
  | ChatRawEvent;

export interface SendChatMessageOptions {
  threadId: string;
  text: string;
  model?: string | null;
  provider?: string | null;
  agentMode?: boolean;
  tools?: string[] | null;
  collections?: string[] | null;
}

export interface ChatSocketOptions {
  /** Full WebSocket URL, e.g. `ws://localhost:7777/ws`. */
  url: string;
  authToken?: string | null;
  /** Override for environments without a global `WebSocket`. */
  WebSocket?: WebSocketCtor;
  /** Initial reconnect backoff in ms (default 1500, capped at 15s). */
  reconnectDelayMs?: number;
  /** Max reconnect attempts before giving up (default 10, 0 disables). */
  maxReconnect?: number;
}

/* ─── Event-emitter ────────────────────────────────────────────────── */

type EventMap = {
  // Discriminated frame types
  chunk: ChatChunkEvent;
  message: ChatMessageEvent;
  tool_call: ChatToolCallEvent;
  error: ChatErrorEvent;
  generation_stopped: ChatGenerationStoppedEvent;
  thread_update: ChatThreadUpdateEvent;
  planning_update: PlanningUpdate;
  task_update: TaskUpdate;
  // Catch-all and lifecycle
  raw: ChatEvent;
  state: ConnectionState;
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

/* ─── Implementation ──────────────────────────────────────────────── */

const DEFAULT_RECONNECT_MS = 1500;
const DEFAULT_MAX_RECONNECT = 10;
const MAX_RECONNECT_MS = 15_000;

export class ChatSocket {
  private readonly url: string;
  private readonly authToken: string | null;
  private readonly Ctor: WebSocketCtor;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnect: number;

  private socket: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<keyof EventMap, Set<Listener<keyof EventMap>>>();

  constructor(options: ChatSocketOptions) {
    this.url = options.url;
    this.authToken = options.authToken ?? null;
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_MS;
    this.maxReconnect = options.maxReconnect ?? DEFAULT_MAX_RECONNECT;
    const Ctor = options.WebSocket ?? globalCtor();
    if (!Ctor) {
      throw new Error(
        "No `WebSocket` constructor available. Pass `WebSocket` from `ws` " +
          "(Node) or run in a browser context."
      );
    }
    this.Ctor = Ctor;
  }

  /** Current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   *
   * The `raw` event fires for every inbound frame, including types that don't
   * have their own typed handler — useful for bridging future server events.
   */
  on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<keyof EventMap>);
    return () => {
      set?.delete(listener as Listener<keyof EventMap>);
    };
  }

  /** Open the socket. No-op if already open or connecting. */
  connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === this.Ctor.OPEN ||
        this.socket.readyState === this.Ctor.CONNECTING)
    ) {
      return;
    }
    this.intentionalClose = false;
    this.setState("connecting");

    let url = this.url;
    if (this.authToken) {
      url +=
        (url.includes("?") ? "&" : "?") +
        "token=" +
        encodeURIComponent(this.authToken);
    }
    const ws = new this.Ctor(url);
    ws.binaryType = "arraybuffer";
    this.socket = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState("connected");
    };
    ws.onclose = () => {
      this.socket = null;
      if (this.intentionalClose) {
        this.setState("disconnected");
        return;
      }
      this.setState("reconnecting");
      this.scheduleReconnect();
    };
    ws.onerror = () => this.setState("error");
    ws.onmessage = (ev: MessageEvent) => this.handleRaw(ev.data);
  }

  /** Close the socket and cancel any pending reconnect. */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
  }

  /** Send a `chat_message` command. */
  send(opts: SendChatMessageOptions): void {
    this.sendCommand({
      command: "chat_message",
      data: {
        type: "message",
        role: "user",
        content: [{ type: "text", text: opts.text }],
        thread_id: opts.threadId,
        model: opts.model ?? null,
        provider: opts.provider ?? null,
        agent_mode: opts.agentMode ?? false,
        tools: opts.tools ?? null,
        collections: opts.collections ?? null
      }
    });
  }

  /** Send a `stop` command for the given thread. */
  stop(threadId: string): void {
    this.sendCommand({ command: "stop", data: { thread_id: threadId } });
  }

  /* ─── internals ───────────────────────────────────────────────── */

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit("state", state);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        // Don't let one buggy listener break the dispatcher.
        console.error("[ChatSocket] listener for", event, "threw:", err);
      }
    }
  }

  private sendCommand(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== this.Ctor.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    let frame: string | ArrayBufferLike | Uint8Array;
    try {
      frame = pack(payload);
    } catch (err) {
      console.warn(
        "[ChatSocket] msgpack encode failed, falling back to JSON:",
        err
      );
      frame = JSON.stringify(payload);
    }
    this.socket.send(frame as never);
  }

  private handleRaw(raw: unknown): void {
    let frame: ChatEvent | null = null;
    if (raw instanceof ArrayBuffer) {
      try {
        frame = unpack(new Uint8Array(raw)) as ChatEvent;
      } catch (err) {
        console.error("[ChatSocket] failed to decode msgpack frame:", err);
        return;
      }
    } else if (typeof raw === "string") {
      try {
        frame = JSON.parse(raw) as ChatEvent;
      } catch (err) {
        console.error("[ChatSocket] failed to parse JSON frame:", err);
        return;
      }
    } else if (raw && typeof raw === "object") {
      // Some platforms may deliver a Buffer-like directly.
      try {
        const u8 =
          raw instanceof Uint8Array
            ? raw
            : new Uint8Array(raw as ArrayBufferLike);
        frame = unpack(u8) as ChatEvent;
      } catch {
        return;
      }
    }
    if (!frame || typeof frame !== "object" || !("type" in frame)) return;

    this.emit("raw", frame);
    const type = (frame as ChatEvent).type;
    if (isKnownEventType(type)) {
      this.emit(type, frame as never);
    }
  }

  private scheduleReconnect(): void {
    if (this.maxReconnect === 0) {
      this.setState("error");
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnect) {
      this.setState("error");
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelayMs * this.reconnectAttempts,
      MAX_RECONNECT_MS
    );
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

/* ─── helpers ───────────────────────────────────────────────────── */

const KNOWN_TYPES = new Set([
  "chunk",
  "message",
  "tool_call",
  "error",
  "generation_stopped",
  "thread_update",
  "planning_update",
  "task_update"
] as const);

type KnownType = typeof KNOWN_TYPES extends Set<infer T> ? T : never;

function isKnownEventType(t: string): t is KnownType {
  return (KNOWN_TYPES as Set<string>).has(t);
}

function globalCtor(): WebSocketCtor | null {
  if (typeof WebSocket !== "undefined") return WebSocket;
  return null;
}
