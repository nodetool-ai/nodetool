import { EventEmitter } from "../EventEmitter";
import { UNIFIED_WS_URL } from "../../stores/BASE_URL";
import {
  handleResourceChange,
  invalidateAllResourceQueries
} from "../../stores/resourceChangeHandler";
import { handleSystemStats, SystemStatsMessage } from "../../stores/systemStatsHandler";
import { ResourceChangeUpdate } from "../../stores/ApiTypes";
import { ConnectionState, WebSocketManager } from "./WebSocketManager";
import { FrontendToolRegistry } from "../tools/frontendTools";
import { getFrontendToolRuntimeState } from "../tools/frontendToolRuntimeState";
import { validateInboundMessage } from "./validateInboundMessage";
import type {
  RendererRegisteredMessage,
  RendererToolCallMessage
} from "@nodetool-ai/protocol";

/**
 * Base shape of every message routed through the WebSocket.
 * Handlers receive the full decoded message and cast to their specific type.
 */
export interface WebSocketMessage {
  type: string;
  thread_id?: string;
  workflow_id?: string;
  job_id?: string;
  [key: string]: unknown;
}

type MessageHandler = (message: WebSocketMessage) => void;

function isResourceChange(msg: WebSocketMessage): msg is WebSocketMessage & ResourceChangeUpdate {
  return msg.type === "resource_change";
}

function isSystemStats(msg: WebSocketMessage): msg is WebSocketMessage & SystemStatsMessage {
  return msg.type === "system_stats";
}

function isRendererRegistered(
  msg: WebSocketMessage
): msg is WebSocketMessage & RendererRegisteredMessage {
  return (
    msg.type === "renderer_registered" &&
    typeof msg.renderer_id === "string" &&
    msg.renderer_id.length > 0
  );
}

function isRendererToolCall(
  msg: WebSocketMessage
): msg is WebSocketMessage & RendererToolCallMessage {
  return (
    msg.type === "renderer_tool_call" &&
    typeof msg.renderer_id === "string" &&
    msg.renderer_id.length > 0 &&
    typeof msg.tool_call_id === "string" &&
    msg.tool_call_id.length > 0 &&
    typeof msg.name === "string" &&
    msg.name.length > 0 &&
    "args" in msg
  );
}

function requestRendererToolConsent(name: string, args: unknown): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return false;
  }
  let details: string;
  try {
    details = JSON.stringify(args, null, 2);
  } catch {
    details = String(args);
  }
  return window.confirm(
    `Allow the connected MCP client to run ${name}?\n\nArguments:\n${details}`
  );
}

interface RpcResponse extends WebSocketMessage {
  type: "rpc_response";
  request_id: string;
}

function isRpcResponse(msg: WebSocketMessage): msg is RpcResponse {
  return (
    msg.type === "rpc_response" &&
    "request_id" in msg &&
    typeof msg.request_id === "string"
  );
}

interface GlobalWebSocketEvents {
  open: () => void;
  close: (code?: number, reason?: string) => void;
  error: (error: Error) => void;
  message: (message: WebSocketMessage) => void;
  reconnecting: (attempt: number, maxAttempts: number) => void;
  stateChange: (state: ConnectionState, previous: ConnectionState) => void;
}

type GlobalWebSocketEvent = keyof GlobalWebSocketEvents;

const RECONNECT_INTERVAL_MS = 1000;

/**
 * How many consecutive failed connects still carry the `resume_job` hint.
 *
 * The hint asks the server to replay the handshake at the instance that owns
 * the run. When that instance is gone — a deploy replaces machine ids while
 * the job row still reads `running` — the replay is addressed at a dead
 * machine and the handshake fails. Retrying with the same hint fails the same
 * way forever, and because this is the one socket the whole app shares, chat
 * and every other consumer stay dark with it. So the third attempt goes out
 * hint-less and connects wherever the proxy puts it; `reconnect_job` then
 * answers from the persisted row — the run's real status, without the replayed
 * frames.
 */
const MAX_HINTED_ATTEMPTS = 2;

/**
 * Global WebSocket Manager - Singleton pattern.
 *
 * Establishes a single shared WebSocket to the unified backend and
 * multiplexes messages by job_id or thread_id. Consumers subscribe with a
 * routing key and receive only their messages. Reconnects indefinitely with
 * backoff, and cuts the backoff short when the network or the tab comes back;
 * `ensureConnection` blocks until connected and reuses Supabase auth when
 * available.
 */
class GlobalWebSocketManager extends EventEmitter<GlobalWebSocketEvents> {
  private static instance: GlobalWebSocketManager | null = null;
  private wsManager: WebSocketManager | null = null;
  private resumeJobIdProvider: (() => string | null) | null = null;
  private consecutiveConnectFailures = 0;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  /** Routing keys already reported as unhandled (log once, payload-free). */
  private loggedUnhandledKeys = new Set<string>();
  private isConnecting = false;
  private isConnected = false;
  private networkListenersSetup = false;
  private hasEverConnected = false;
  private networkCleanup: (() => void) | null = null;
  private rendererId: string | null = null;

  private constructor() {
    super();
    this.setupNetworkListeners();
  }

  static getInstance(): GlobalWebSocketManager {
    if (!GlobalWebSocketManager.instance) {
      GlobalWebSocketManager.instance = new GlobalWebSocketManager();
    }
    return GlobalWebSocketManager.instance;
  }

  /**
   * True while an existing manager is still working towards a connection —
   * including the reconnect-backoff window, during which `isConnected` and
   * `isConnecting` are both false (the "close" event fires before the
   * "reconnecting" event that the backoff timer eventually triggers).
   * Without this, `ensureConnection` would build a second manager whose
   * `on("message")` handler routes every message a second time.
   */
  private isManagerBusy(): boolean {
    const state = this.wsManager?.getState();
    return (
      state === "connecting" || state === "reconnecting" || state === "disconnected"
    );
  }

  async ensureConnection(): Promise<void> {
    if (this.isConnected && this.wsManager) {
      return;
    }

    if (this.isConnecting || (this.wsManager && this.isManagerBusy())) {
      // Wait for ongoing connection with timeout to prevent memory leak
      return new Promise((resolve, reject) => {
        const CONNECTION_TIMEOUT_MS = 30000; // 30 second timeout
        const checkInterval = setInterval(() => {
          if (this.isConnected && this.wsManager) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve();
            return;
          }
          if (!this.isConnecting && !(this.wsManager && this.isManagerBusy())) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            reject(new Error("WebSocket connection attempt failed"));
          }
        }, 100);

        // Add timeout to prevent interval from running forever
        const timeoutId = setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`));
        }, CONNECTION_TIMEOUT_MS);
      });
    }

    this.isConnecting = true;

    // Tear down any previous manager before replacing it. Overwriting
    // `this.wsManager` while the old one still holds an open (or reconnecting)
    // socket leaves an orphan that keeps routing messages into
    // `routeMessage` — every chunk and node update handled twice.
    this.teardownManager();

    try {
      const wsUrl = await this.buildAuthenticatedUrl();
      console.info("GlobalWebSocketManager: Establishing connection");

      this.wsManager = new WebSocketManager({
        url: wsUrl,
        // Every reconnect re-resolves the URL: the auth token may have been
        // refreshed, and a run that is still going needs its `resume_job` hint
        // recomputed against the state at that moment.
        urlProvider: () => this.buildAuthenticatedUrl(),
        binaryType: "arraybuffer",
        reconnect: true,
        reconnectInterval: RECONNECT_INTERVAL_MS
      });

      this.wsManager.on("open", () => {
        console.info("GlobalWebSocketManager: Connected");
        this.isConnected = true;
        this.isConnecting = false;
        this.consecutiveConnectFailures = 0;

        // After a reconnect, any `resource_change` events emitted while we
        // were offline are gone — refresh every active query so the UI
        // catches up. Skip on the first connection of the session.
        if (this.hasEverConnected) {
          invalidateAllResourceQueries();
        }
        this.hasEverConnected = true;

        this.emit("open");

        // Send frontend tools manifest to the server on connection
        this.sendToolsManifest();
      });

      this.wsManager.on("message", (data: unknown) => {
        const message = data as WebSocketMessage;
        validateInboundMessage(message);
        if (isRendererRegistered(message)) {
          this.rendererId = message.renderer_id;
          return;
        }
        if (isRendererToolCall(message)) {
          void this.executeRendererToolCall(message);
          return;
        }
        this.routeMessage(message);
        this.emit("message", message);
      });

      this.wsManager.on("error", (error: unknown) => {
        console.error("GlobalWebSocketManager: Error:", error);
        this.emit(
          "error",
          error instanceof Error ? error : new Error(String(error))
        );
      });

      this.wsManager.on("close", (code: number, reason: string) => {
        console.info("GlobalWebSocketManager: Disconnected");
        // A close with no open before it is a connect that never landed. Two
        // of those in a row retire the resume hint (see MAX_HINTED_ATTEMPTS).
        if (!this.isConnected) {
          this.consecutiveConnectFailures += 1;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.emit("close", code, reason);
      });

      this.wsManager.on(
        "reconnecting",
        (attempt: number, maxAttempts: number) => {
          console.info(
            `GlobalWebSocketManager: Reconnecting ${attempt}/${maxAttempts}`
          );
          this.isConnecting = true;
          this.emit("reconnecting", attempt, maxAttempts);
        }
      );

      this.wsManager.on("stateChange", (state, previous) => {
        this.emit("stateChange", state, previous);
      });

      await this.wsManager.connect();
    } catch (error) {
      console.error("GlobalWebSocketManager: Failed to connect:", error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Route incoming message to registered handlers.
   * Each handler is called at most once per message, even if the message
   * matches multiple routing keys (thread_id, workflow_id, job_id).
   *
   * Special handling for resource_change and system_stats messages which don't
   * have routing keys but should update global state.
   */
  private routeMessage(message: WebSocketMessage): void {
    if (isResourceChange(message)) {
      try {
        handleResourceChange(message);
      } catch (error) {
        console.error("GlobalWebSocketManager: Error handling resource change:", error);
      }
      return;
    }

    if (isSystemStats(message)) {
      try {
        handleSystemStats(message);
      } catch (error) {
        console.error("GlobalWebSocketManager: Error handling system stats:", error);
      }
      return;
    }

    const routingKeys = new Set<string>();

    if (message.thread_id) {
      routingKeys.add(message.thread_id);
    }

    if (message.workflow_id) {
      routingKeys.add(message.workflow_id);
    }

    if (message.job_id) {
      routingKeys.add(message.job_id);
    }

    if (isRpcResponse(message)) {
      routingKeys.add(message.request_id);
    }

    if (routingKeys.size === 0) {
      // Never log the message object itself: the console buffer retains its
      // arguments (for a later DevTools attach), so logging streamed chunk
      // payloads here pins them all — a multi-MB/s leak on realtime runs.
      console.debug(
        `GlobalWebSocketManager: Message without routing key (${message.type})`
      );
      return;
    }

    // Track which handlers have already been called for this message
    // to avoid duplicates when a message matches multiple routing keys
    const calledHandlers = new Set<MessageHandler>();

    routingKeys.forEach((routingKey) => {
      const handlers = this.messageHandlers.get(routingKey);
      if (handlers && handlers.size > 0) {
        handlers.forEach((handler) => {
          // Skip if this handler was already called for this message
          if (calledHandlers.has(handler)) {
            return;
          }
          calledHandlers.add(handler);
          try {
            handler(message);
          } catch (error) {
            console.error("GlobalWebSocketManager: Handler error:", error);
          }
        });
      } else if (!this.loggedUnhandledKeys.has(routingKey)) {
        // Once per key and payload-free: streamed runs hit this branch at
        // chunk rate (the job_id key often has no handler even when the
        // workflow_id key does), and console arguments are retained by the
        // browser — logging the message would pin every chunk.
        this.loggedUnhandledKeys.add(routingKey);
        console.debug(
          `GlobalWebSocketManager: No handlers for ${routingKey} (first: ${message.type})`
        );
      }
    });
  }

  /**
   * Inject a locally-produced protocol message into the same routing as
   * server-streamed messages.
   *
   * The in-browser workflow runner (for pure-browser sub-graphs) emits the
   * exact same `ProcessingMessage` shapes the unified WebSocket server sends.
   * Routing them through here means every subscriber — the canvas, the
   * results/status/log stores — handles a client-side run identically to a
   * server run, with no special-casing. This is the seam that lets browser
   * execution "hook into the same WebSocket protocol stream".
   */
  deliverLocal(message: WebSocketMessage): void {
    this.routeMessage(message);
    // Mirror the real socket path (wsManager "message" handler), which routes
    // and then re-emits, so manager-level "message" listeners also see
    // locally-produced messages.
    this.emit("message", message);
  }

  /**
   * Register a message handler for a workflow or job
   */
  subscribe(key: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(key)) {
      this.messageHandlers.set(key, new Set());
    }
    this.messageHandlers.get(key)!.add(handler);

    console.debug(`GlobalWebSocketManager: Subscribed handler for ${key}`);

    return () => {
      const handlers = this.messageHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(key);
          console.debug(`GlobalWebSocketManager: Removed all handlers for ${key}`);
        }
      }
    };
  }

  async send(message: Record<string, unknown>): Promise<void> {
    await this.ensureConnection();

    if (!this.wsManager) {
      throw new Error("WebSocket not connected");
    }

    console.debug("GlobalWebSocketManager: Sending message", message);
    this.wsManager.send(message);
  }

  /**
   * Execute a connection-level UI tool request from the MCP/server bridge.
   * This deliberately has its own frame type so it never enters the chat
   * reducer or requires a thread id.
   */
  private async executeRendererToolCall(
    message: RendererToolCallMessage
  ): Promise<void> {
    const startedAt = Date.now();
    const sendResult = async (
      payload:
        | { ok: true; result?: unknown }
        | { ok: false; error: string }
    ): Promise<void> => {
      try {
        await this.send({
          type: "renderer_tool_result",
          renderer_id: message.renderer_id,
          tool_call_id: message.tool_call_id,
          ...payload,
          elapsed_ms: Date.now() - startedAt
        });
      } catch (error) {
        console.error(
          "GlobalWebSocketManager: Failed to send renderer tool result:",
          error
        );
      }
    };

    if (message.renderer_id !== this.rendererId) {
      const error = `Renderer id mismatch: this connection is ${this.rendererId}`;
      await sendResult({
        ok: false,
        error
      });
      return;
    }

    const tool = FrontendToolRegistry.get(message.name);
    if (!tool) {
      await sendResult({
        ok: false,
        error: `Unsupported tool: ${message.name}`
      });
      return;
    }

    if (
      tool.requireUserConsent &&
      !requestRendererToolConsent(message.name, message.args)
    ) {
      const error = `User denied consent for tool: ${message.name}`;
      await sendResult({
        ok: false,
        error
      });
      return;
    }

    try {
      const result = await FrontendToolRegistry.call(
        message.name,
        message.args,
        message.tool_call_id,
        { getState: () => getFrontendToolRuntimeState() }
      );
      await sendResult({ ok: true, result });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `GlobalWebSocketManager: Renderer tool ${message.name} failed:`,
        error
      );
      await sendResult({
        ok: false,
        error: errorMessage
      });
    }
  }

  /** The server-assigned identity of this browser connection, if registered. */
  getRendererId(): string | null {
    return this.rendererId;
  }

  /**
   * Close and fully detach the current manager. Dropping the reference alone
   * is not enough: the manager keeps its socket and its reconnect timer, and
   * its listeners keep feeding `routeMessage`.
   */
  private teardownManager(): void {
    const manager = this.wsManager;
    if (!manager) {
      return;
    }
    this.wsManager = null;
    this.isConnected = false;
    this.rendererId = null;
    manager.disconnect();
    manager.destroy();
  }

  disconnect(): void {
    if (this.wsManager) {
      console.info("GlobalWebSocketManager: Disconnecting");
      this.teardownManager();
      this.isConnecting = false;
    }

    if (this.networkCleanup) {
      this.networkCleanup();
      this.networkCleanup = null;
      this.networkListenersSetup = false;
    }
  }

  getConnectionState(): {
    isConnected: boolean;
    isConnecting: boolean;
  } {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting
    };
  }

  isConnectionOpen(): boolean {
    return this.wsManager?.isConnected() ?? false;
  }

  subscribeEvent<K extends GlobalWebSocketEvent>(
    event: K,
    listener: GlobalWebSocketEvents[K]
  ): () => void {
    this.addListener(event, listener);
    return () => {
      this.removeListener(event, listener);
    };
  }

  /**
   * Send the frontend tools manifest to the server.
   * Called automatically on connection to expose UI tools to LLMs.
   */
  private sendToolsManifest(): void {
    const manifest = FrontendToolRegistry.getManifest();
    if (manifest.length > 0 && this.wsManager) {
      console.info(`GlobalWebSocketManager: Sending tools manifest (${manifest.length} tools)`);
      try {
        this.wsManager.send({
          type: "client_tools_manifest",
          tools: manifest
        });
      } catch (error) {
        console.error("GlobalWebSocketManager: Failed to send tools manifest:", error);
      }
    }
  }

  /**
   * Re-establish the connection after an event that may have killed it.
   *
   * Waking from sleep or switching networks usually leaves the socket
   * half-open: the browser still reports it as connected and `close` never
   * fires, so checking `isConnected` alone would conclude there is nothing to
   * do. Probe the socket instead, and only rebuild when it is genuinely gone.
   */
  private recoverConnection(trigger: string): void {
    if (this.isConnected && this.wsManager) {
      this.wsManager.checkLiveness();
      return;
    }
    // Already retrying: the manager owns the socket, so let it keep it — but
    // cut short whatever backoff it is sitting in, since the thing it was
    // waiting for (network, wake) has just happened.
    if (this.wsManager && this.isManagerBusy()) {
      this.wsManager.retryNow();
      return;
    }
    if (this.isConnecting) {
      return;
    }
    this.ensureConnection().catch((err) => {
      console.error(
        `GlobalWebSocketManager: Failed to reconnect after ${trigger}:`,
        err
      );
    });
  }

  /**
   * Set up network status monitoring to auto-reconnect on network changes
   */
  private setupNetworkListeners(): void {
    if (typeof window === "undefined" || this.networkListenersSetup) {
      return;
    }

    this.networkListenersSetup = true;

    const handleOnline = () => {
      console.info("GlobalWebSocketManager: Network came online, attempting reconnection");
      this.recoverConnection("network online");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.info("GlobalWebSocketManager: Tab became visible, checking connection");
        this.recoverConnection("tab visible");
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    this.networkCleanup = () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }

  /**
   * Name the run this connection should be routed back to, when the server is
   * spread over more than one instance.
   *
   * A run's replay buffer and control hooks live in the one process executing
   * it, so a reconnect balanced onto a different machine sees neither. The
   * hint lets the server replay the handshake at the owning instance
   * (`fly-replay`); it is ignored on a single-machine deployment.
   *
   * One job id, deliberately: the handshake resolves to exactly one machine.
   * With runs in flight on several instances the rest still reconnect here and
   * fall back to `reconnect_job`'s persisted-row path — their status is
   * correct, they just lose the replayed frames.
   */
  setResumeJobIdProvider(provider: (() => string | null) | null): void {
    this.resumeJobIdProvider = provider;
  }

  private async buildAuthenticatedUrl(): Promise<string> {
    const params = new URLSearchParams();
    try {
      const { supabase } = await import("../supabaseClient");
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        params.set("api_key", session.access_token);
      }
    } catch (error) {
      console.error("GlobalWebSocketManager: Failed to resolve auth token", error);
    }

    // The hint is an optimization; a store that cannot answer costs replayed
    // frames, never the connection.
    if (this.consecutiveConnectFailures < MAX_HINTED_ATTEMPTS) {
      try {
        const resumeJobId = this.resumeJobIdProvider?.();
        if (resumeJobId) {
          params.set("resume_job", resumeJobId);
        }
      } catch (error) {
        console.error(
          "GlobalWebSocketManager: Failed to resolve the resumable job",
          error
        );
      }
    }

    const query = params.toString();
    return query ? `${UNIFIED_WS_URL}?${query}` : UNIFIED_WS_URL;
  }
}

export const globalWebSocketManager = GlobalWebSocketManager.getInstance();
