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
  Message,
  MessageTextContent,
  ToolCallUpdate,
  PlanningUpdate,
  TaskUpdate,
  ErrorMessage
} from "@nodetool-ai/protocol";

export type WebSocketCtor = typeof WebSocket;

/**
 * A field value as it comes off the wire. msgpack and JSON both decode into
 * this domain, so a frame's own fields have a contract before anything narrows
 * them to a protocol shape.
 */
export type ChatFrameValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | ChatFrameValue[]
  | ChatFrameFields;

export interface ChatFrameFields {
  [field: string]: ChatFrameValue | undefined;
}

/** What a WebSocket hands `onmessage`: a text frame, or binary as a buffer or a view over one. */
type InboundFrame = string | ArrayBuffer | ArrayBufferView;

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
export interface ChatMessageEvent extends Message {
  type: "message";
  role: "user" | "assistant" | "system" | "tool";
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
export interface ChatRawEvent extends ChatFrameFields {
  type: string;
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

/** Outbound `chat_message` command: one user turn, in the shape the server persists. */
interface ChatMessageCommand {
  command: "chat_message";
  data: Message & {
    type: "message";
    role: "user";
    content: MessageTextContent[];
    thread_id: string;
    /** Persisted on the message row, but absent from the protocol `Message`. */
    agent_mode: boolean;
  };
}

/** Outbound `stop` command: cancel the in-flight turn on a thread. */
interface StopCommand {
  command: "stop";
  data: { thread_id: string };
}

/** Outbound `resume_chat` command: replay a thread's frames after `last_seq`. */
interface ResumeChatCommand {
  command: "resume_chat";
  data: { thread_id: string; last_seq: number };
}

type ChatCommand = ChatMessageCommand | StopCommand | ResumeChatCommand;

export interface SendChatMessageOptions {
  threadId: string;
  text: string;
  model?: string | null;
  provider?: string | null;
  agentMode?: boolean;
  tools?: string[] | null;
  collections?: string[] | null;
  /**
   * Whether the turn's tool calls run, ask, or are blocked — `"auto"` runs
   * everything, `"default"` parks actions on an approval request, `"plan"`
   * blocks them. Omitted leaves the server's default (`"default"`), which
   * needs a surface that can answer approvals.
   */
  permissionMode?: "plan" | "default" | "auto" | null;
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

type ListenerStore = { [K in keyof EventMap]: Set<Listener<K>> };

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
  private readonly listeners: ListenerStore = {
    chunk: new Set(),
    message: new Set(),
    tool_call: new Set(),
    error: new Set(),
    generation_stopped: new Set(),
    thread_update: new Set(),
    planning_update: new Set(),
    task_update: new Set(),
    raw: new Set(),
    state: new Set()
  };

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
    const set = this.listeners[event];
    set.add(listener);
    return () => {
      set.delete(listener);
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
    ws.onmessage = (ev: MessageEvent<InboundFrame>) => this.handleRaw(ev.data);
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
        collections: opts.collections ?? null,
        permission_mode: opts.permissionMode ?? null
      }
    });
  }

  /** Send a `stop` command for the given thread. */
  stop(threadId: string): void {
    this.sendCommand({ command: "stop", data: { thread_id: threadId } });
  }

  /**
   * Reattach to a thread's in-flight turn after a disconnect: the server
   * replays every frame it stamped after `lastSeq`, so a dropped socket costs
   * no output and no second inference.
   */
  resume(threadId: string, lastSeq: number): void {
    this.sendCommand({
      command: "resume_chat",
      data: { thread_id: threadId, last_seq: lastSeq }
    });
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit("state", state);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const fn of this.listeners[event]) {
      try {
        fn(payload);
      } catch (err) {
        // Don't let one buggy listener break the dispatcher.
        console.error("[ChatSocket] listener for", event, "threw:", err);
      }
    }
  }

  private sendCommand(payload: ChatCommand): void {
    if (!this.socket || this.socket.readyState !== this.Ctor.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    let frame: string | Uint8Array;
    try {
      frame = pack(payload);
    } catch (err) {
      console.warn(
        "[ChatSocket] msgpack encode failed, falling back to JSON:",
        err
      );
      frame = JSON.stringify(payload);
    }
    this.socket.send(frame);
  }

  private handleRaw(inbound: InboundFrame): void {
    const frame = isTextFrame(inbound)
      ? parseTextFrame(inbound)
      : decodeBinaryFrame(inbound);
    if (!frame) return;

    this.emit("raw", frame);
    const type = frame.type;
    if (isKnownEventType(type)) {
      // SAFETY: `isKnownEventType` proved the tag is one of `EventMap`'s
      // discriminated keys, so the frame is that key's payload. TypeScript
      // cannot correlate a union key with its own payload across the generic
      // `emit` call.
      this.emit(type, frame as EventMap[typeof type]);
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

/** Every event with a typed handler; `raw` and `state` are local, not frame tags. */
type KnownType = Exclude<keyof EventMap, "raw" | "state">;

const KNOWN_TYPES: ReadonlySet<string> = new Set<KnownType>([
  "chunk",
  "message",
  "tool_call",
  "error",
  "generation_stopped",
  "thread_update",
  "planning_update",
  "task_update"
]);

function isKnownEventType(type: string): type is KnownType {
  return KNOWN_TYPES.has(type);
}

function isTextFrame(inbound: InboundFrame): inbound is string {
  return typeof inbound === "string";
}

/** `typeof` calls null, arrays and byte blobs "object" too; a frame body is none of those. */
function isFrameFields(value: ChatFrameValue): value is ChatFrameFields {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  );
}

function isFrameTag(value: ChatFrameValue | undefined): value is string {
  return typeof value === "string";
}

function toChatEvent(decoded: ChatFrameValue): ChatEvent | null {
  if (!isFrameFields(decoded) || !isFrameTag(decoded.type)) return null;
  // SAFETY: the two predicates above establish exactly what `ChatEvent`'s
  // widest member `ChatRawEvent` declares — a keyed frame body with a string
  // `type`. Tags we model narrow further in `handleRaw`.
  return decoded as ChatRawEvent;
}

function parseTextFrame(text: string): ChatEvent | null {
  try {
    return toChatEvent(JSON.parse(text));
  } catch (err) {
    console.error("[ChatSocket] failed to parse JSON frame:", err);
    return null;
  }
}

function decodeBinaryFrame(
  inbound: ArrayBuffer | ArrayBufferView
): ChatEvent | null {
  try {
    return toChatEvent(unpack(frameBytes(inbound)));
  } catch (err) {
    console.error("[ChatSocket] failed to decode msgpack frame:", err);
    return null;
  }
}

/** Some platforms deliver a Buffer-like view rather than a bare `ArrayBuffer`. */
function frameBytes(inbound: ArrayBuffer | ArrayBufferView): Uint8Array {
  return inbound instanceof ArrayBuffer
    ? new Uint8Array(inbound)
    : new Uint8Array(inbound.buffer, inbound.byteOffset, inbound.byteLength);
}

function globalCtor(): WebSocketCtor | null {
  if (typeof WebSocket !== "undefined") return WebSocket;
  return null;
}
