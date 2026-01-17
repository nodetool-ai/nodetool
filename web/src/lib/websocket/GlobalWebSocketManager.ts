import { EventEmitter } from "events";
import { WebSocketManager } from "./WebSocketManager";
import { UNIFIED_WS_URL } from "../../stores/BASE_URL";
import { isLocalhost } from "../../stores/ApiClient";
import log from "loglevel";
import { FrontendToolRegistry } from "../tools/frontendTools";

type MessageHandler = (message: any) => void;
type GlobalWebSocketEvent =
  | "open"
  | "close"
  | "error"
  | "message"
  | "reconnecting"
  | "stateChange";

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

  private constructor() {
    super();
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
      // Wait for ongoing connection
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.isConnected && this.wsManager) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    try {
      const wsUrl = await this.buildAuthenticatedUrl();
      log.info("GlobalWebSocketManager: Establishing connection");

      this.wsManager = new WebSocketManager({
        url: wsUrl,
        binaryType: "arraybuffer",
        reconnect: true,
        reconnectInterval: 1000,
        reconnectAttempts: 5
      });

      this.wsManager.on("open", () => {
        log.info("GlobalWebSocketManager: Connected");
        this.isConnected = true;
        this.isConnecting = false;
        this.emit("open");
        
        // Send frontend tools manifest to the server on connection
        this.sendToolsManifest();
      });

      this.wsManager.on("message", (data: any) => {
        this.routeMessage(data);
        this.emit("message", data);
      });

      this.wsManager.on("error", (error: Error) => {
        log.error("GlobalWebSocketManager: Error:", error);
        this.emit("error", error);
      });

      this.wsManager.on("close", (code?: number, reason?: string) => {
        log.info("GlobalWebSocketManager: Disconnected");
        this.isConnected = false;
        this.isConnecting = false;
        this.emit("close", code, reason);
      });

      this.wsManager.on(
        "reconnecting",
        (attempt: number, maxAttempts: number) => {
          log.info(
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
      log.error("GlobalWebSocketManager: Failed to connect:", error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Route incoming message to registered handlers
   */
  private routeMessage(message: any): void {
    const routingKeys = new Set<string>();

    if (message.thread_id) {
      routingKeys.add(message.thread_id);
    }

    if (message.workflow_id) {
      routingKeys.add(message.workflow_id);
    }

    if (routingKeys.size === 0) {
      log.debug(
        "GlobalWebSocketManager: Message without job_id or thread_id",
        message
      );
      return;
    }

    routingKeys.forEach((routingKey) => {
      const handlers = this.messageHandlers.get(routingKey);
      if (handlers && handlers.size > 0) {
        handlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            log.error("GlobalWebSocketManager: Handler error:", error);
          }
        });
      } else {
        log.debug(
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

    log.debug(`GlobalWebSocketManager: Subscribed handler for ${key}`);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(key);
          log.debug(`GlobalWebSocketManager: Removed all handlers for ${key}`);
        }
      }
    };
  }

  /**
   * Send a message through the WebSocket
   */
  async send(message: any): Promise<void> {
    await this.ensureConnection();

    if (!this.wsManager) {
      throw new Error("WebSocket not connected");
    }

    log.debug("GlobalWebSocketManager: Sending message", message);
    this.wsManager.send(message);
  }

  /**
   * Disconnect the WebSocket
   */
  disconnect(): void {
    if (this.wsManager) {
      log.info("GlobalWebSocketManager: Disconnecting");
      this.wsManager.disconnect();
      this.wsManager = null;
      this.isConnected = false;
      this.isConnecting = false;
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
      log.info(`GlobalWebSocketManager: Sending tools manifest (${manifest.length} tools)`);
      try {
        this.wsManager.send({
          type: "client_tools_manifest",
          tools: manifest
        });
      } catch (error) {
        log.error("GlobalWebSocketManager: Failed to send tools manifest:", error);
      }
    }
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
      log.error("GlobalWebSocketManager: Failed to resolve auth token", error);
    }

    return UNIFIED_WS_URL;
  }
}

// Export singleton instance
export const globalWebSocketManager = GlobalWebSocketManager.getInstance();
