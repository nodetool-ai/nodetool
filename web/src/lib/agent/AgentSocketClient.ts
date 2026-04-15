/**
 * AgentSocketClient — renderer-side WebSocket client for the agent runtime.
 *
 * Connects to `/ws/agent` on the NodeTool server and provides a typed
 * request/response API plus event subscriptions. Replaces the old Electron
 * IPC bridge (`window.api.agent`) that used to route to an in-process
 * agent SDK in the Electron main process.
 */

import { EventEmitter } from "eventemitter3";
import log from "loglevel";
import { AGENT_WS_URL } from "../../stores/BASE_URL";
import type {
  AgentClientCommand,
  AgentClientMessage,
  AgentClientPayload,
  AgentGetSessionMessagesRequest,
  AgentListSessionsRequest,
  AgentModelDescriptor,
  AgentModelsRequest,
  AgentServerMessage,
  AgentSessionInfoEntry,
  AgentSessionOptions,
  AgentStreamEvent,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./agentTypes";

const RECONNECT_INTERVAL_MS = 1500;
const REQUEST_TIMEOUT_MS = 30000;

export interface ToolCallRequestEvent {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  name: string;
  args: unknown;
}

export interface ToolsManifestRequestEvent {
  requestId: string;
  sessionId: string;
}

export interface AgentSocketEvents {
  open: () => void;
  close: () => void;
  reconnecting: () => void;
  stream: (event: AgentStreamEvent) => void;
  toolsManifestRequest: (event: ToolsManifestRequestEvent) => void;
  toolCallRequest: (event: ToolCallRequestEvent) => void;
  toolCallAbort: (event: { sessionId: string }) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AgentSocketClient extends EventEmitter<AgentSocketEvents> {
  private readonly url: string;
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private intentionalClose = false;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(url: string = AGENT_WS_URL) {
    super();
    this.url = url;
  }

  /** True if the socket is currently OPEN. */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Establish the socket, returning when it's OPEN. Idempotent. */
  connect(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.intentionalClose = false;

    this.connecting = new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url);
      } catch (error) {
        this.connecting = null;
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.socket = socket;
      let resolved = false;
      socket.onopen = () => {
        log.info(`[agent-ws] connected to ${this.url}`);
        this.connecting = null;
        resolved = true;
        this.emit("open");
        resolve();
      };
      socket.onmessage = (ev: MessageEvent) => {
        this.handleMessage(ev.data);
      };
      socket.onerror = (event: Event) => {
        log.warn("[agent-ws] socket error", event);
      };
      socket.onclose = () => {
        log.info("[agent-ws] socket closed");
        this.socket = null;
        this.connecting = null;
        this.failAllPending(new Error("Agent WebSocket closed"));
        this.emit("close");
        // If the connection never reached OPEN, reject the pending
        // connect() promise so callers don't hang forever.
        if (!resolved) {
          reject(new Error(`Agent WebSocket failed to connect to ${this.url}`));
        }
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };
    });

    return this.connecting;
  }

  /** Close the socket and stop reconnecting. */
  disconnect(): void {
    this.intentionalClose = true;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.failAllPending(new Error("Agent WebSocket disconnected"));
  }

  // ---------------------------------------------------------------------------
  // Public typed API mirroring the old window.api.agent surface
  // ---------------------------------------------------------------------------

  async createSession(options: AgentSessionOptions): Promise<string> {
    return this.request<"create_session", string>("create_session", {
      options,
    });
  }

  async listModels(options: AgentModelsRequest = {}): Promise<AgentModelDescriptor[]> {
    return this.request<"list_models", AgentModelDescriptor[]>("list_models", {
      options,
    });
  }

  /**
   * Send a user message. The reply is `void` — actual agent messages stream
   * over the `stream` event on this client.
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    await this.request<"send_message", void>("send_message", {
      session_id: sessionId,
      message,
    });
  }

  async stopExecution(sessionId: string): Promise<void> {
    await this.request<"stop_execution", void>("stop_execution", {
      session_id: sessionId,
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.request<"close_session", void>("close_session", {
      session_id: sessionId,
    });
  }

  async listSessions(
    options: AgentListSessionsRequest = {},
  ): Promise<AgentSessionInfoEntry[]> {
    return this.request<"list_sessions", AgentSessionInfoEntry[]>(
      "list_sessions",
      { options },
    );
  }

  async getSessionMessages(
    options: AgentGetSessionMessagesRequest,
  ): Promise<AgentTranscriptMessage[]> {
    return this.request<"get_session_messages", AgentTranscriptMessage[]>(
      "get_session_messages",
      { options },
    );
  }

  /** Reply to a server-initiated `tools_manifest_request`. */
  sendToolsManifestResponse(
    requestId: string,
    manifest: FrontendToolManifest[],
  ): void {
    this.sendMessageEnvelope({
      command: "tools_manifest_response",
      request_id: requestId,
      manifest,
    });
  }

  /** Reply to a server-initiated `tool_call_request`. */
  sendToolCallResponse(
    requestId: string,
    result: { result?: unknown; isError: boolean; error?: string },
  ): void {
    this.sendMessageEnvelope({
      command: "tool_call_response",
      request_id: requestId,
      result,
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Issue a request/response command. The `command` literal constrains the
   * shape of `payload` via `AgentClientPayload<C>` so callers can't pass
   * nonsense fields or miss required ones.
   */
  private async request<C extends AgentClientCommand, T>(
    command: C,
    payload: AgentClientPayload<C>,
  ): Promise<T> {
    await this.connect();
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Agent WebSocket is not connected");
    }

    return new Promise<T>((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Agent request '${command}' timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const envelope = {
        command,
        request_id: requestId,
        ...(payload as Record<string, unknown>)
      } as unknown as AgentClientMessage;

      try {
        this.socket!.send(JSON.stringify(envelope));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Send a typed outbound message (no response tracking). */
  private sendMessageEnvelope(envelope: AgentClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      log.warn("[agent-ws] send called but socket is not open", envelope);
      return;
    }
    try {
      this.socket.send(JSON.stringify(envelope));
    } catch (error) {
      log.error("[agent-ws] failed to send", error);
    }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let parsed: AgentServerMessage;
    try {
      parsed = JSON.parse(raw) as AgentServerMessage;
    } catch (error) {
      log.warn("[agent-ws] failed to parse message", error);
      return;
    }

    switch (parsed.type) {
      case "response": {
        const pending = this.pending.get(parsed.request_id);
        if (!pending) return;
        this.pending.delete(parsed.request_id);
        clearTimeout(pending.timer);
        if (parsed.error) {
          pending.reject(new Error(parsed.error));
        } else {
          pending.resolve(parsed.data);
        }
        return;
      }
      case "agent_stream_message": {
        this.emit("stream", {
          sessionId: parsed.session_id,
          message: parsed.message,
          done: parsed.done,
        });
        return;
      }
      case "tools_manifest_request": {
        this.emit("toolsManifestRequest", {
          requestId: parsed.request_id,
          sessionId: parsed.session_id,
        });
        return;
      }
      case "tool_call_request": {
        this.emit("toolCallRequest", {
          requestId: parsed.request_id,
          sessionId: parsed.session_id,
          toolCallId: parsed.tool_call_id,
          name: parsed.name,
          args: parsed.args,
        });
        return;
      }
      case "tool_call_abort": {
        this.emit("toolCallAbort", { sessionId: parsed.session_id });
        return;
      }
    }
  }

  private failAllPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    setTimeout(() => {
      if (this.intentionalClose) return;
      this.emit("reconnecting");
      this.connect().catch((error) => {
        log.warn("[agent-ws] reconnect failed", error);
      });
    }, RECONNECT_INTERVAL_MS);
  }
}

let singletonClient: AgentSocketClient | null = null;

/**
 * Get the singleton AgentSocketClient. Creates and connects on first use.
 */
export function getAgentSocketClient(): AgentSocketClient {
  if (!singletonClient) {
    singletonClient = new AgentSocketClient();
    void singletonClient.connect().catch((error) => {
      log.warn("[agent-ws] initial connect failed", error);
    });
  }
  return singletonClient;
}
