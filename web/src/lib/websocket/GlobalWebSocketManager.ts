import { WebSocketManager } from "./WebSocketManager";
import { UNIFIED_WS_URL } from "../../stores/BASE_URL";
import log from "loglevel";

type MessageHandler = (message: any) => void;

/**
 * Channel type for routing messages.
 * - "chat": Messages routed by thread_id
 * - "workflow": Messages routed by workflow_id or job_id
 */
export type Channel = "chat" | "workflow";

/**
 * Auth configuration for WebSocket connection.
 */
export type AuthConfig = {
  token: string | null; // null = localhost/anonymous
};

/**
 * Global WebSocket Manager - Singleton pattern.
 *
 * Establishes a single shared WebSocket to the unified backend endpoint and
 * multiplexes messages by channel and routing key. Messages are distinguished by:
 * - Has thread_id → Chat message (channel: "chat")
 * - Has workflow_id or job_id → Workflow message (channel: "workflow")
 *
 * Consumers subscribe with a channel and routing key, receiving only their messages.
 * Built-in reconnect with up to 5 attempts/1s backoff; `ensureConnection` blocks
 * until connected.
 */
class GlobalWebSocketManager {
  private static instance: GlobalWebSocketManager | null = null;
  private wsManager: WebSocketManager | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private currentUrl: string | null = null;
  private _isConnecting = false;
  private _isConnected = false;

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
   * Check if connected
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Check if currently connecting
   */
  get isConnecting(): boolean {
    return this._isConnecting;
  }

  /**
   * Get the underlying WebSocketManager (for sending tool results, etc.)
   */
  getWebSocketManager(): WebSocketManager | null {
    return this.wsManager;
  }

  /**
   * Ensure WebSocket connection is established with optional auth token.
   * @param config Optional auth configuration with token for non-localhost
   */
  async ensureConnection(config?: AuthConfig): Promise<void> {
    // Build URL with optional auth token
    let wsUrl = UNIFIED_WS_URL;
    if (config?.token) {
      wsUrl = `${UNIFIED_WS_URL}?api_key=${config.token}`;
    }

    // If already connected to the same URL, return
    if (this._isConnected && this.wsManager && this.currentUrl === wsUrl) {
      return;
    }

    // If connecting to a different URL, disconnect first
    if (this.wsManager && this.currentUrl !== wsUrl) {
      log.info("GlobalWebSocketManager: Reconnecting with new auth");
      this.disconnect();
    }

    // If already connecting, wait for it
    if (this._isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this._isConnecting = true;
    this.currentUrl = wsUrl;

    this.connectionPromise = this.establishConnection(wsUrl);

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Internal method to establish the WebSocket connection
   */
  private async establishConnection(wsUrl: string): Promise<void> {
    try {
      log.info("GlobalWebSocketManager: Establishing connection to", wsUrl.replace(/api_key=[^&]+/, "api_key=***"));

      this.wsManager = new WebSocketManager({
        url: wsUrl,
        binaryType: "arraybuffer",
        reconnect: true,
        reconnectInterval: 1000,
        reconnectAttempts: 5
      });

      this.wsManager.on("open", () => {
        log.info("GlobalWebSocketManager: Connected");
        this._isConnected = true;
        this._isConnecting = false;
      });

      this.wsManager.on("message", (data: any) => {
        this.routeMessage(data);
      });

      this.wsManager.on("error", (error: Error) => {
        log.error("GlobalWebSocketManager: Error:", error);
      });

      this.wsManager.on("close", () => {
        log.info("GlobalWebSocketManager: Disconnected");
        this._isConnected = false;
        this._isConnecting = false;
      });

      this.wsManager.on(
        "reconnecting",
        (attempt: number, maxAttempts: number) => {
          log.info(
            `GlobalWebSocketManager: Reconnecting ${attempt}/${maxAttempts}`
          );
          this._isConnecting = true;
        }
      );

      await this.wsManager.connect();
    } catch (error) {
      log.error("GlobalWebSocketManager: Failed to connect:", error);
      this._isConnecting = false;
      throw error;
    }
  }

  /**
   * Detect the channel from a message based on its routing keys.
   * - Has thread_id → Chat message
   * - Has workflow_id or job_id → Workflow message
   */
  private detectChannel(message: any): Channel | null {
    if (message.thread_id) {
      return "chat";
    }
    if (message.workflow_id || message.job_id) {
      return "workflow";
    }
    return null;
  }

  /**
   * Create a composite key for routing: "channel:key"
   */
  private makeCompositeKey(channel: Channel, key: string): string {
    return `${channel}:${key}`;
  }

  /**
   * Route incoming message to registered handlers based on channel detection.
   */
  private routeMessage(message: any): void {
    log.debug("GlobalWebSocketManager: Routing message", message);

    const channel = this.detectChannel(message);
    
    if (!channel) {
      log.warn(
        "GlobalWebSocketManager: Message without thread_id, workflow_id, or job_id",
        message
      );
      return;
    }

    // Determine the routing key based on channel
    let routingKey: string | undefined;
    if (channel === "chat") {
      routingKey = message.thread_id;
    } else {
      // For workflow channel, try workflow_id first, then job_id
      routingKey = message.workflow_id || message.job_id;
    }

    if (!routingKey) {
      log.warn(
        `GlobalWebSocketManager: Message on ${channel} channel without routing key`,
        message
      );
      return;
    }

    const compositeKey = this.makeCompositeKey(channel, routingKey);
    const handlers = this.messageHandlers.get(compositeKey);
    
    if (handlers && handlers.size > 0) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          log.error("GlobalWebSocketManager: Handler error:", error);
        }
      });
    } else {
      // Also try routing by just the key for backward compatibility (workflow channel)
      // This handles cases where handlers were registered with just workflow_id
      if (channel === "workflow") {
        const legacyHandlers = this.messageHandlers.get(routingKey);
        if (legacyHandlers && legacyHandlers.size > 0) {
          legacyHandlers.forEach((handler) => {
            try {
              handler(message);
            } catch (error) {
              log.error("GlobalWebSocketManager: Handler error:", error);
            }
          });
          return;
        }
        
        // Also try job_id if workflow_id was used as the primary key
        if (message.job_id && message.workflow_id !== message.job_id) {
          const jobCompositeKey = this.makeCompositeKey(channel, message.job_id);
          const jobHandlers = this.messageHandlers.get(jobCompositeKey);
          if (jobHandlers && jobHandlers.size > 0) {
            jobHandlers.forEach((handler) => {
              try {
                handler(message);
              } catch (error) {
                log.error("GlobalWebSocketManager: Handler error:", error);
              }
            });
            return;
          }
        }
      }
      
      log.debug(
        `GlobalWebSocketManager: No handlers for ${compositeKey}`,
        message
      );
    }
  }

  /**
   * Register a message handler for a channel with a routing key.
   * @param channel The channel to subscribe to ("chat" or "workflow")
   * @param key The routing key (thread_id for chat, workflow_id/job_id for workflow)
   * @param handler The message handler function
   * @returns Unsubscribe function
   */
  subscribe(
    channel: Channel,
    key: string,
    handler: MessageHandler
  ): () => void;
  
  /**
   * Register a message handler with just a key (legacy/backward compatible).
   * @deprecated Use subscribe(channel, key, handler) instead
   * @param key The routing key
   * @param handler The message handler function
   * @returns Unsubscribe function
   */
  subscribe(key: string, handler: MessageHandler): () => void;
  
  subscribe(
    channelOrKey: Channel | string,
    keyOrHandler: string | MessageHandler,
    handler?: MessageHandler
  ): () => void {
    let compositeKey: string;
    let actualHandler: MessageHandler;
    
    if (typeof keyOrHandler === "function") {
      // Legacy signature: subscribe(key, handler)
      compositeKey = channelOrKey as string;
      actualHandler = keyOrHandler;
    } else {
      // New signature: subscribe(channel, key, handler)
      compositeKey = this.makeCompositeKey(channelOrKey as Channel, keyOrHandler);
      actualHandler = handler!;
    }
    
    if (!this.messageHandlers.has(compositeKey)) {
      this.messageHandlers.set(compositeKey, new Set());
    }
    this.messageHandlers.get(compositeKey)!.add(actualHandler);

    log.debug(`GlobalWebSocketManager: Subscribed handler for ${compositeKey}`);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(compositeKey);
      if (handlers) {
        handlers.delete(actualHandler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(compositeKey);
          log.debug(`GlobalWebSocketManager: Removed all handlers for ${compositeKey}`);
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
      this._isConnected = false;
      this._isConnecting = false;
      this.currentUrl = null;
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
      isConnected: this._isConnected,
      isConnecting: this._isConnecting
    };
  }
}

// Export singleton instance
export const globalWebSocketManager = GlobalWebSocketManager.getInstance();
