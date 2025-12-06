import { WebSocketManager } from "./WebSocketManager";
import { WORKER_URL } from "../../stores/BASE_URL";
import log from "loglevel";

type MessageHandler = (message: any) => void;

/**
 * Global WebSocket Manager - Singleton pattern.
 *
 * Establishes a single shared WebSocket to the worker backend (WORKER_URL) and
 * multiplexes messages by `workflow_id` or `job_id`. Consumers subscribe with
 * a routing key and receive only their messages. Built-in reconnect with up to
 * 5 attempts/1s backoff; `ensureConnection` blocks until connected.
 */
class GlobalWebSocketManager {
  private static instance: GlobalWebSocketManager | null = null;
  private wsManager: WebSocketManager | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private isConnecting = false;
  private isConnected = false;

  private constructor() {
    // Private constructor for singleton
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
      log.info("GlobalWebSocketManager: Establishing connection");

      this.wsManager = new WebSocketManager({
        url: WORKER_URL,
        binaryType: "arraybuffer",
        reconnect: true,
        reconnectInterval: 1000,
        reconnectAttempts: 5
      });

      this.wsManager.on("open", () => {
        log.info("GlobalWebSocketManager: Connected");
        this.isConnected = true;
        this.isConnecting = false;
      });

      this.wsManager.on("message", (data: any) => {
        this.routeMessage(data);
      });

      this.wsManager.on("error", (error: Error) => {
        log.error("GlobalWebSocketManager: Error:", error);
      });

      this.wsManager.on("close", () => {
        log.info("GlobalWebSocketManager: Disconnected");
        this.isConnected = false;
        this.isConnecting = false;
      });

      this.wsManager.on(
        "reconnecting",
        (attempt: number, maxAttempts: number) => {
          log.info(
            `GlobalWebSocketManager: Reconnecting ${attempt}/${maxAttempts}`
          );
          this.isConnecting = true;
        }
      );

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
    log.debug("GlobalWebSocketManager: Routing message", message);

    // Route by workflow_id or job_id
    const routingKey = message.workflow_id || message.job_id;

    if (!routingKey) {
      log.warn(
        "GlobalWebSocketManager: Message without workflow_id or job_id",
        message
      );
      return;
    }

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
}

// Export singleton instance
export const globalWebSocketManager = GlobalWebSocketManager.getInstance();
