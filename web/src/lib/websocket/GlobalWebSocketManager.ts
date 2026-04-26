import { EventEmitter } from "../EventEmitter";
import { isLocalhost } from "../env";
import { UNIFIED_WS_URL } from "../../stores/BASE_URL";
import { handleResourceChange } from "../../stores/resourceChangeHandler";
import { handleSystemStats } from "../../stores/systemStatsHandler";
import { ResourceChangeUpdate } from "../../stores/ApiTypes";
import { WebSocketManager } from "./WebSocketManager";
import { FrontendToolRegistry } from "../tools/frontendTools";

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

// Message handlers can receive any message type - they are responsible for their own type checking
type MessageHandler = (message: any) => void;
type GlobalWebSocketEvent =
  | "open"
  | "close"
  | "error"
  | "message"
  | "reconnecting"
  | "stateChange";

// Configuration constants
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL_MS = 1000;

/**
 * Global WebSocket Manager - Singleton pattern.
 *
 * Establishes a single shared WebSocket to the unified backend and
 * multiplexes messages by job_id or thread_id. Consumers subscribe with a
 * routing key and receive only their messages. Built-in reconnect with up to
 * 5 attempts/1s backoff; `ensureConnection` blocks until connected and reuses
 * Supabase auth when available.
 */
class GlobalWebSocketManager extends EventEmitter {
  private static instance: GlobalWebSocketManager | null = null;
  private wsManager: WebSocketManager | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private isConnecting = false;
  private isConnected = false;
  private networkListenersSetup = false;
  private networkCleanup: (() => void) | null = null;

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
   * Ensure WebSocket connection is established
   */
  async ensureConnection(): Promise<void> {
    if (this.isConnected && this.wsManager) {
      return;
    }

    if (this.isConnecting) {
      // Wait for ongoing connection with timeout to prevent memory leak
      return new Promise((resolve, reject) => {
        const CONNECTION_TIMEOUT_MS = 30000; // 30 second timeout
        const checkInterval = setInterval(() => {
          if (this.isConnected && this.wsManager) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve();
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

    try {
      const wsUrl = await this.buildAuthenticatedUrl();
      console.info("GlobalWebSocketManager: Establishing connection");

      this.wsManager = new WebSocketManager({
        url: wsUrl,
        binaryType: "arraybuffer",
        reconnect: true,
        reconnectInterval: RECONNECT_INTERVAL_MS,
        reconnectAttempts: MAX_RECONNECT_ATTEMPTS
      });

      this.wsManager.on("open", () => {
        console.info("GlobalWebSocketManager: Connected");
        this.isConnected = true;
        this.isConnecting = false;
        this.emit("open");
        
        // Send frontend tools manifest to the server on connection
        this.sendToolsManifest();
      });

      this.wsManager.on("message", (data: unknown) => {
        const message = data as WebSocketMessage;
        this.routeMessage(message);
        this.emit("message", message);
      });

      this.wsManager.on("error", (error: Error) => {
        console.error("GlobalWebSocketManager: Error:", error);
        this.emit("error", error);
      });

      this.wsManager.on("close", (code?: number, reason?: string) => {
        console.info("GlobalWebSocketManager: Disconnected");
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
    // Handle resource_change messages separately
    if (message.type === "resource_change") {
      try {
        handleResourceChange(message as unknown as ResourceChangeUpdate);
      } catch (error) {
        console.error("GlobalWebSocketManager: Error handling resource change:", error);
      }
      // Resource change messages are not routed to specific handlers
      // They only trigger cache invalidation
      return;
    }

    // Handle system_stats messages separately
    if (message.type === "system_stats") {
      try {
        handleSystemStats(message as unknown as Parameters<typeof handleSystemStats>[0]);
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

    if (routingKeys.size === 0) {
      console.debug(
        "GlobalWebSocketManager: Message without routing key (job_id/workflow_id/thread_id)",
        message
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
      } else {
        console.debug(
          `GlobalWebSocketManager: No handlers for ${routingKey}`,
          message
        );
      }
    });
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

    // Return unsubscribe function
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

  /**
   * Send a message through the WebSocket
   */
  async send(message: Record<string, unknown>): Promise<void> {
    await this.ensureConnection();

    if (!this.wsManager) {
      throw new Error("WebSocket not connected");
    }

    console.debug("GlobalWebSocketManager: Sending message", message);
    this.wsManager.send(message);
  }

  /**
   * Disconnect the WebSocket
   */
  disconnect(): void {
    if (this.wsManager) {
      console.info("GlobalWebSocketManager: Disconnecting");
      this.wsManager.disconnect();
      this.wsManager = null;
      this.isConnected = false;
      this.isConnecting = false;
    }
    
    // Clean up network listeners
    if (this.networkCleanup) {
      this.networkCleanup();
      this.networkCleanup = null;
      this.networkListenersSetup = false;
    }
  }

  /**
   * Get connection state
   */
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

  getWebSocket(): WebSocket | null {
    return this.wsManager?.getWebSocket() ?? null;
  }

  subscribeEvent(
    event: GlobalWebSocketEvent,
    listener: (...args: any[]) => void
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
   * Set up network status monitoring to auto-reconnect on network changes
   */
  private setupNetworkListeners(): void {
    if (typeof window === "undefined" || this.networkListenersSetup) {
      return;
    }

    this.networkListenersSetup = true;

    const handleOnline = () => {
      console.info("GlobalWebSocketManager: Network came online, attempting reconnection");
      if (!this.isConnected && !this.isConnecting) {
        this.ensureConnection().catch((err) => {
          console.error("GlobalWebSocketManager: Failed to reconnect after network online:", err);
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.info("GlobalWebSocketManager: Tab became visible, checking connection");
        if (!this.isConnected && !this.isConnecting) {
          this.ensureConnection().catch((err) => {
            console.error("GlobalWebSocketManager: Failed to reconnect after visibility change:", err);
          });
        }
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Store cleanup function
    this.networkCleanup = () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }

  private async buildAuthenticatedUrl(): Promise<string> {
    if (isLocalhost) {
      return UNIFIED_WS_URL;
    }

    try {
      const { supabase } = await import("../supabaseClient");
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        return `${UNIFIED_WS_URL}?api_key=${session.access_token}`;
      }
    } catch (error) {
      console.error("GlobalWebSocketManager: Failed to resolve auth token", error);
    }

    return UNIFIED_WS_URL;
  }
}

// Export singleton instance
export const globalWebSocketManager = GlobalWebSocketManager.getInstance();
