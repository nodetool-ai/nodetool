/**
 * Thin WebSocket wrapper with reconnect/backoff and msgpack encoding.
 *
 * Exposes a small state machine (`ConnectionState`) plus EventEmitter-like events
 * for `open/close/message/error/reconnecting/stateChange`. Queues outbound
 * messages until connected, retries with exponential-ish backoff, and enforces
 * valid transitions to avoid double-connect/disconnect races.
 */
import { encode, decode } from "@msgpack/msgpack";
import log from "loglevel";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnecting"
  | "failed";

export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectDecay?: number;
  reconnectAttempts?: number;
  timeoutInterval?: number;
  binaryType?: BinaryType;
}

export interface WebSocketMessage {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface ConnectionStateTransition {
  from: ConnectionState[];
  to: ConnectionState;
  guard?: () => boolean;
}

const STATE_TRANSITIONS: Record<string, ConnectionStateTransition> = {
  connect: {
    from: ["disconnected", "failed"],
    to: "connecting"
  },
  connected: {
    from: ["connecting", "reconnecting"],
    to: "connected"
  },
  disconnect: {
    from: ["connected", "connecting", "reconnecting"],
    to: "disconnecting"
  },
  disconnected: {
    from: ["disconnecting", "connecting", "connected", "reconnecting"],
    to: "disconnected"
  },
  reconnect: {
    from: ["disconnected", "failed"],
    to: "reconnecting"
  },
  failed: {
    from: ["connecting", "reconnecting"],
    to: "failed"
  }
};

// Simple event emitter for browser environment
type EventHandler = (...args: unknown[]) => void;

export class WebSocketManager {
  private config: Required<Omit<WebSocketConfig, "protocols">> & {
    protocols?: string | string[];
  };
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;
  private messageQueue: WebSocketMessage[] = [];
  private connectionPromise: Promise<void> | null = null;
  private connectionResolver: (() => void) | null = null;
  private connectionRejector: ((error: Error) => void) | null = null;
  
  // Event emitter
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      protocols: config.protocols,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      reconnectDecay: config.reconnectDecay ?? 1.5,
      reconnectAttempts: config.reconnectAttempts ?? 10,
      timeoutInterval: config.timeoutInterval ?? 30000,
      binaryType: config.binaryType ?? "arraybuffer"
    };
  }

  // Event emitter methods
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  removeAllListeners(): void {
    this.eventHandlers.clear();
  }

  private transitionTo(action: string): boolean {
    const transition = STATE_TRANSITIONS[action];
    if (!transition) {
      log.warn(`Invalid state transition action: ${action}`);
      return false;
    }

    if (!transition.from.includes(this.state)) {
      log.warn(`Cannot transition from ${this.state} to ${transition.to}`);
      return false;
    }

    if (transition.guard && !transition.guard()) {
      log.warn(
        `Guard prevented transition from ${this.state} to ${transition.to}`
      );
      return false;
    }

    const previousState = this.state;
    this.state = transition.to;
    this.emit("stateChange", this.state, previousState);
    log.debug(`State transition: ${previousState} -> ${this.state}`);
    return true;
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  public getWebSocket(): WebSocket | null {
    return this.ws;
  }

  public async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (!this.transitionTo("connect")) {
      if (this.state === "connected") {
        return Promise.resolve();
      }
      throw new Error(`Cannot connect from state: ${this.state}`);
    }

    this.connectionPromise = this.establishConnection();
    return this.connectionPromise;
  }

  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();
    this.messageQueue = [];

    if (!this.transitionTo("disconnect")) {
      return;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
    } else {
      this.transitionTo("disconnected");
    }
  }

  public send(message: WebSocketMessage): void {
    if (!this.isConnected()) {
      if (
        this.config.reconnect &&
        (this.state === "connecting" || this.state === "reconnecting")
      ) {
        log.debug("Queueing message while connecting");
        this.messageQueue.push(message);
        return;
      }
      throw new Error(`Cannot send message in state: ${this.state}`);
    }

    try {
      const encoded = encode(message);
      this.ws!.send(encoded);
      console.log("→ WS OUTGOING:", JSON.stringify(message, null, 2).slice(0, 500));
      this.emit("messageSent", message);
    } catch (error) {
      log.error("Failed to send message:", error);
      this.emit("error", error);
      throw error;
    }
  }

  public sendRaw(data: string | ArrayBuffer | Blob): void {
    if (!this.isConnected()) {
      throw new Error(`Cannot send data in state: ${this.state}`);
    }

    try {
      this.ws!.send(data);
    } catch (error) {
      log.error("Failed to send raw data:", error);
      this.emit("error", error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onerror = this.handleError.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
  }

  private handleOpen(): void {
    log.info("WebSocket connection opened");
    this.clearConnectionTimeout();
    this.reconnectAttempt = 0;

    if (!this.transitionTo("connected")) {
      return;
    }

    this.emit("open");

    // Process queued messages
    this.processMessageQueue();

    // Resolve connection promise
    if (this.connectionResolver) {
      this.connectionResolver();
      this.connectionResolver = null;
      this.connectionRejector = null;
      this.connectionPromise = null;
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      let data: unknown;

      if (this.config.binaryType === "arraybuffer") {
        if (event.data instanceof ArrayBuffer) {
          const decoded = decode(new Uint8Array(event.data));
          data = decoded;
        } else if (
          event.data instanceof Blob ||
          (event.data && typeof (event.data as Blob).arrayBuffer === "function")
        ) {
          const buf = await (event.data as Blob).arrayBuffer();
          data = decode(new Uint8Array(buf));
        } else if (typeof event.data === "string") {
          data = JSON.parse(event.data);
        } else {
          data = event.data;
        }
      } else if (typeof event.data === "string") {
        data = JSON.parse(event.data);
      } else {
      data = event.data;
    }

    console.log("← WS INCOMING:", JSON.stringify(data, null, 2).slice(0, 500));
    this.emit("message", data);
  } catch (error) {
      log.error("Failed to process message:", error);
      this.emit("error", error);
    }
  }

  private handleError(event: Event): void {
    log.error("WebSocket error:", event);
    this.emit("error", new Error("WebSocket error occurred"));
  }

  private handleClose(event: CloseEvent): void {
    log.info(
      `WebSocket closed: code=${event.code}, reason=${event.reason}, clean=${event.wasClean}, intentional=${this.intentionalDisconnect}`
    );

    this.ws = null;
    this.clearConnectionTimeout();

    const wasConnecting =
      this.state === "connecting" || this.state === "reconnecting";

    if (!this.transitionTo("disconnected")) {
      return;
    }

    // Handle connection promise rejection
    if (wasConnecting && this.connectionRejector) {
      this.connectionRejector(
        new Error(`Connection failed: ${event.reason || "Unknown reason"}`)
      );
      this.connectionResolver = null;
      this.connectionRejector = null;
      this.connectionPromise = null;
    }

    this.emit("close", event.code, event.reason, event.wasClean);

    // Handle reconnection
    const shouldReconnect = this.shouldReconnect(event);
    log.info(
      `Should reconnect: ${shouldReconnect}, attempts: ${this.reconnectAttempt}/${this.config.reconnectAttempts}`
    );

    if (shouldReconnect) {
      this.scheduleReconnect();
    } else if (!this.intentionalDisconnect) {
      this.transitionTo("failed");
    }
  }

  private shouldReconnect(event: CloseEvent): boolean {
    const noReconnectCodes = [
      1008, // Policy violation
      1009, // Message too big
      1010, // Mandatory extension
      1011, // Internal server error
      4000, // Custom: Authentication required
      4001, // Custom: Unauthorized
      4003 // Custom: Forbidden
    ];

    // Special case: if it was an intentional disconnect via close(1000), don't reconnect
    if (this.intentionalDisconnect && event.code === 1000) {
      return false;
    }

    return (
      this.config.reconnect &&
      !this.intentionalDisconnect &&
      this.reconnectAttempt < this.config.reconnectAttempts &&
      !noReconnectCodes.includes(event.code)
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = this.getReconnectDelay();
    this.reconnectAttempt++;

    log.info(
      `Scheduling reconnection attempt ${this.reconnectAttempt}/${this.config.reconnectAttempts} in ${delay}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) {
        this.reconnect();
      }
    }, delay);
  }

  private async reconnect(): Promise<void> {
    log.info(`Attempting to reconnect (attempt ${this.reconnectAttempt})`);

    if (!this.transitionTo("reconnect")) {
      log.warn(`Failed to transition to reconnect state from ${this.state}`);
      return;
    }

    this.emit(
      "reconnecting",
      this.reconnectAttempt,
      this.config.reconnectAttempts
    );

    try {
      await this.establishConnection();
      log.info("Reconnection successful");
    } catch (error) {
      log.error(`Reconnection attempt ${this.reconnectAttempt} failed:`, error);
      // The close handler will schedule the next attempt if needed
    }
  }

  private async establishConnection(): Promise<void> {
    this.intentionalDisconnect = false;
    this.clearTimers();

    return new Promise<void>((resolve, reject) => {
      this.connectionResolver = resolve;
      this.connectionRejector = reject;

      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols);
        this.ws.binaryType = this.config.binaryType;
        this.setupEventHandlers();
        this.startConnectionTimeout();
      } catch (error) {
        this.handleConnectionError(error as Error);
        reject(error);
      }
    });
  }

  private getReconnectDelay(): number {
    const delay = Math.min(
      this.config.reconnectInterval *
        Math.pow(this.config.reconnectDecay, this.reconnectAttempt - 1),
      30000 // Max 30 seconds
    );
    return delay;
  }

  private startConnectionTimeout(): void {
    this.connectionTimer = setTimeout(() => {
      if (this.state === "connecting" || this.state === "reconnecting") {
        log.error("Connection timeout");
        this.handleConnectionError(new Error("Connection timeout"));
        if (this.ws) {
          this.ws.close();
        }
      }
    }, this.config.timeoutInterval);
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearConnectionTimeout();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleConnectionError(error: Error): void {
    log.error("Connection error:", error);
    this.emit("error", error);

    if (this.connectionRejector) {
      this.connectionRejector(error);
      this.connectionResolver = null;
      this.connectionRejector = null;
      this.connectionPromise = null;
    }
  }

  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    log.info(`Processing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      try {
        this.send(message);
      } catch (error) {
        log.error("Failed to send queued message:", error);
        this.emit("error", error);
      }
    }
  }

  public destroy(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();
    this.removeAllListeners();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
    this.state = "disconnected";
  }
}

export class ReconnectingWebSocket extends WebSocketManager {
  constructor(url: string, protocols?: string | string[]) {
    super({
      url,
      protocols,
      reconnect: true,
      reconnectInterval: 1000,
      reconnectDecay: 1.5,
      reconnectAttempts: 10,
      timeoutInterval: 30000
    });
  }
}
