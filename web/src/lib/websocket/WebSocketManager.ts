/**
 * Thin WebSocket wrapper with reconnect/backoff and msgpack encoding.
 *
 * Exposes a small state machine (`ConnectionState`) plus EventEmitter events
 * for `open/close/message/error/reconnecting/stateChange`. Queues outbound
 * messages for the whole time a reconnect is pending — including the backoff
 * window, which is when callers are most likely to send — retries with
 * exponential backoff and jitter for as long as it takes, and enforces valid
 * transitions to avoid double-connect/disconnect races.
 *
 * A liveness watchdog covers the failure mode `onclose` cannot: a half-open
 * socket (laptop sleep, NAT/proxy drop, network switch) where the browser still
 * reports OPEN but nothing arrives. The server heartbeats every 25s, so a
 * longer stretch of inbound silence means the connection is suspect — we probe
 * with a ping and, if that stays unanswered, tear the socket down so the normal
 * reconnect path runs instead of silently dropping every run update.
 */
import { EventEmitter } from "../EventEmitter";
import { pack, unpack } from "msgpackr";
import { isFunction, isObjectLike, isString } from "../../utils/typePredicates";

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
  /**
   * Cap on consecutive reconnect attempts. Defaults to `Infinity`: a client
   * that stops retrying stays dark until something else (a tab focus, a network
   * event) happens to rebuild it, which for a background tab may be never.
   */
  reconnectAttempts?: number;
  /** Ceiling on the exponential backoff delay. */
  maxReconnectInterval?: number;
  timeoutInterval?: number;
  binaryType?: BinaryType;
  /**
   * Inbound silence (ms) after which the connection is probed with a ping.
   * Must stay above the server's 25s heartbeat. 0 disables the watchdog.
   */
  heartbeatInterval?: number;
  /** Grace period (ms) for traffic to arrive after a probe. */
  heartbeatTimeout?: number;
  /** Cap on messages queued while offline; the oldest are dropped first. */
  maxQueueSize?: number;
  /**
   * Resolve the URL afresh for every connect attempt. `url` is fixed at
   * construction, but a reconnect may need different query parameters than the
   * first connect did — a refreshed auth token, or the run this client wants
   * the server to route it back to. Falls back to `url` when it throws.
   */
  urlProvider?: () => string | Promise<string>;
}

export interface WebSocketMessage {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface WebSocketManagerEvents {
  open: () => void;
  close: (code: number, reason: string, wasClean: boolean) => void;
  error: (error: unknown) => void;
  message: (data: unknown) => void;
  messageSent: (message: WebSocketMessage) => void;
  reconnecting: (attempt: number, maxAttempts: number) => void;
  stateChange: (
    newState: ConnectionState,
    previousState: ConnectionState
  ) => void;
}

/**
 * Heartbeat frames are about the socket that carried them, so replaying one
 * queued during an outage would only answer a question nobody is still asking.
 */
function isLivenessFrame(message: WebSocketMessage): boolean {
  return message.type === "ping" || message.type === "pong";
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
    from: ["connecting", "reconnecting", "disconnected"],
    to: "failed"
  }
};

export class WebSocketManager extends EventEmitter<WebSocketManagerEvents> {
  private config: Required<Omit<WebSocketConfig, "protocols" | "urlProvider">> & {
    protocols?: string | string[];
    urlProvider?: () => string | Promise<string>;
  };
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private livenessTimer: NodeJS.Timeout | null = null;
  private lastInboundAt = 0;
  private probeSentAt = 0;
  private reconnectAttempt = 0;
  private reconnectPending = false;
  private intentionalDisconnect = false;
  /**
   * Bumped by every teardown. `establishConnection` may await a URL provider,
   * and during that await `this.ws` is null — so a `disconnect()`/`destroy()`
   * landing in the window has nothing to close, and the socket it thought it
   * had killed opens a moment later with no owner: an orphan holding a server
   * runner session, possibly on a token that was being replaced. The attempt
   * re-checks the counter after the await and abandons the connect instead.
   */
  private connectGeneration = 0;
  private messageQueue: WebSocketMessage[] = [];
  private connectionPromise: Promise<void> | null = null;
  private connectionResolver: (() => void) | null = null;
  private connectionRejector: ((error: Error) => void) | null = null;

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      url: config.url,
      protocols: config.protocols,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      reconnectDecay: config.reconnectDecay ?? 1.5,
      reconnectAttempts: config.reconnectAttempts ?? Infinity,
      maxReconnectInterval: config.maxReconnectInterval ?? 30000,
      timeoutInterval: config.timeoutInterval ?? 30000,
      binaryType: config.binaryType ?? "arraybuffer",
      heartbeatInterval: config.heartbeatInterval ?? 45000,
      heartbeatTimeout: config.heartbeatTimeout ?? 10000,
      maxQueueSize: config.maxQueueSize ?? 100,
      urlProvider: config.urlProvider
    };
  }

  private transitionTo(action: string): boolean {
    const transition = STATE_TRANSITIONS[action];
    if (!transition) {
      console.warn(`Invalid state transition action: ${action}`);
      return false;
    }

    if (!transition.from.includes(this.state)) {
      console.warn(`Cannot transition from ${this.state} to ${transition.to}`);
      return false;
    }

    if (transition.guard && !transition.guard()) {
      console.warn(
        `Guard prevented transition from ${this.state} to ${transition.to}`
      );
      return false;
    }

    const previousState = this.state;
    this.state = transition.to;
    this.emit("stateChange", this.state, previousState);
    console.debug(`State transition: ${previousState} -> ${this.state}`);
    return true;
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === "connected" && this.ws?.readyState === WebSocket.OPEN;
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
    this.connectGeneration += 1;
    this.reconnectPending = false;
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
      if (this.canQueue() && !isLivenessFrame(message)) {
        console.debug(`Queueing message while ${this.state}`);
        this.messageQueue.push(message);
        // A long outage with a chatty caller would otherwise grow this without
        // bound. The oldest queued messages are the least useful on recovery.
        while (this.messageQueue.length > this.config.maxQueueSize) {
          this.messageQueue.shift();
        }
        return;
      }
      throw new Error(`Cannot send message in state: ${this.state}`);
    }

    try {
      const encoded = pack(message);
      this.ws!.send(encoded);
      this.emit("messageSent", message);
    } catch (error) {
      console.error("Failed to send message:", error);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Whether an outbound message can wait for the socket to come back.
   *
   * The backoff window between a drop and the next attempt sits in the
   * `disconnected` state, and it is exactly when a caller is most likely to
   * send: the run they just started, the chat message they just typed. Dropping
   * those on the floor is what makes a blip look like a broken app.
   */
  private canQueue(): boolean {
    if (!this.config.reconnect || this.intentionalDisconnect) {
      return false;
    }
    return (
      this.state === "connecting" ||
      this.state === "reconnecting" ||
      (this.state === "disconnected" && this.reconnectPending)
    );
  }

  private setupEventHandlers(): void {
    if (!this.ws) {return;}

    // Assign handlers directly (already bound as class methods)
    // This avoids creating new function references on each call
    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = (event) => this.handleMessage(event);
    this.ws.onerror = (event) => this.handleError(event);
    this.ws.onclose = (event) => this.handleClose(event);
  }

  private handleOpen(): void {
    console.info("WebSocket connection opened");
    this.clearConnectionTimeout();
    this.reconnectAttempt = 0;
    this.reconnectPending = false;

    if (!this.transitionTo("connected")) {
      return;
    }

    this.emit("open");

    this.startLivenessWatchdog();
    this.processMessageQueue();

    if (this.connectionResolver) {
      this.connectionResolver();
      this.connectionResolver = null;
      this.connectionRejector = null;
      this.connectionPromise = null;
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    // Any frame proves the socket is alive, decodable or not.
    this.lastInboundAt = Date.now();
    this.probeSentAt = 0;

    try {
      let data: unknown;

      if (this.config.binaryType === "arraybuffer") {
        if (event.data instanceof ArrayBuffer) {
          const decoded = unpack(new Uint8Array(event.data));
          data = decoded;
        } else if (event.data instanceof Blob) {
          const buf = await event.data.arrayBuffer();
          data = unpack(new Uint8Array(buf));
        } else if (
          event.data &&
          isObjectLike(event.data) &&
          "arrayBuffer" in event.data &&
          isFunction(event.data.arrayBuffer)
        ) {
          const buf = await (event.data.arrayBuffer as () => Promise<ArrayBuffer>)();
          data = unpack(new Uint8Array(buf));
        } else if (isString(event.data)) {
          data = JSON.parse(event.data);
        } else {
          data = event.data;
        }
      } else if (isString(event.data)) {
        data = JSON.parse(event.data);
      } else {
        data = event.data;
      }

      if (this.handleLivenessFrame(data)) {
        return;
      }

      this.emit("message", data);
    } catch (error) {
      console.error("Failed to process message:", error);
      this.emit("error", error);
    }
  }

  /**
   * Consume heartbeat frames instead of forwarding them: they carry no routing
   * key, so subscribers have nothing to do with them. Returns true when the
   * frame was a heartbeat.
   */
  private handleLivenessFrame(data: unknown): boolean {
    const type =
      data && isObjectLike(data)
        ? (data as { type?: unknown }).type
        : undefined;

    if (type === "ping") {
      try {
        this.send({ type: "pong", ts: Date.now() / 1000 });
      } catch (error) {
        console.debug("Failed to answer server ping:", error);
      }
      return true;
    }

    return type === "pong";
  }

  private handleError(event: Event): void {
    console.error("WebSocket error:", event);
    this.emit("error", new Error("WebSocket error occurred"));
  }

  private handleClose(event: CloseEvent): void {
    console.info(
      `WebSocket closed: code=${event.code}, reason=${event.reason}, clean=${event.wasClean}, intentional=${this.intentionalDisconnect}`
    );

    this.ws = null;
    this.clearConnectionTimeout();
    this.stopLivenessWatchdog();

    const wasConnecting =
      this.state === "connecting" || this.state === "reconnecting";

    if (!this.transitionTo("disconnected")) {
      return;
    }

    if (wasConnecting && this.connectionRejector) {
      this.connectionRejector(
        new Error(`Connection failed: ${event.reason || "Unknown reason"}`)
      );
      this.connectionResolver = null;
      this.connectionRejector = null;
      this.connectionPromise = null;
    }

    const shouldReconnect = this.shouldReconnect(event);
    console.info(
      `Should reconnect: ${shouldReconnect}, attempts: ${this.reconnectAttempt}/${this.config.reconnectAttempts}`
    );

    // Decided before the event fires: a listener that sends from its `close`
    // handler must see the same queueing window as one that sends a tick later.
    this.reconnectPending = shouldReconnect;
    this.emit("close", event.code, event.reason, event.wasClean);

    if (shouldReconnect) {
      this.scheduleReconnect();
    } else if (!this.intentionalDisconnect) {
      this.transitionTo("failed");
      console.warn(`Connection failed after ${this.reconnectAttempt} attempts`);
    }
  }

  private shouldReconnect(event: CloseEvent): boolean {
    // Don't reconnect if:
    // 1. Reconnection is disabled
    // 2. It was an intentional disconnect
    // 3. Max reconnection attempts reached
    // 4. Specific error codes that shouldn't trigger reconnection
    const noReconnectCodes = [
      // Note: 1001 (Going away) is intentionally NOT blocked to allow reconnect
      // when servers restart or proxies roll connections. Nor is 1011 (Internal
      // server error): a server that fell over is the case reconnect exists
      // for, and backoff keeps a genuinely broken one from being hammered.
      // What stays terminal is what retrying cannot fix — a rejected client, a
      // frame this client would only send again, a missing extension.
      1008, // Policy violation
      1009, // Message too big
      1010, // Mandatory extension
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

    console.info(
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
    console.info(`Attempting to reconnect (attempt ${this.reconnectAttempt})`);

    if (!this.transitionTo("reconnect")) {
      console.warn(`Failed to transition to reconnect state from ${this.state}`);
      return;
    }

    this.emit(
      "reconnecting",
      this.reconnectAttempt,
      this.config.reconnectAttempts
    );

    try {
      await this.establishConnection();
      console.info("Reconnection successful");
    } catch (error) {
      console.error(`Reconnection attempt ${this.reconnectAttempt} failed:`, error);
      // The close handler will schedule the next attempt if needed
    }
  }

  private async establishConnection(): Promise<void> {
    this.intentionalDisconnect = false;
    this.clearTimers();

    // Only yield when there is actually a provider to consult: callers rely on
    // the socket existing by the time `connect()` returns to the event loop.
    const provider = this.config.urlProvider;
    const generation = this.connectGeneration;
    const url = provider ? await this.resolveUrl(provider) : this.config.url;

    // Torn down while we were resolving the URL — opening the socket now would
    // leave one nothing can reach.
    if (this.connectGeneration !== generation || this.intentionalDisconnect) {
      throw new Error("Connection abandoned before the socket was opened");
    }

    return new Promise<void>((resolve, reject) => {
      this.connectionResolver = resolve;
      this.connectionRejector = reject;

      try {
        this.ws = new WebSocket(url, this.config.protocols);
        this.ws.binaryType = this.config.binaryType;
        this.setupEventHandlers();
        this.startConnectionTimeout();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handleConnectionError(err);
        reject(err);
      }
    });
  }

  /**
   * The URL for the connect about to be made. A provider that fails must not
   * cost us the connection — the configured URL still reaches the server, just
   * without whatever the provider wanted to add.
   */
  private async resolveUrl(
    provider: () => string | Promise<string>
  ): Promise<string> {
    try {
      return await provider();
    } catch (error) {
      console.error("WebSocketManager: URL provider failed", error);
      return this.config.url;
    }
  }

  private getReconnectDelay(): number {
    const delay = Math.min(
      this.config.reconnectInterval *
        Math.pow(this.config.reconnectDecay, this.reconnectAttempt),
      this.config.maxReconnectInterval
    );
    // Half-to-full jitter. Without it every client that dropped on a server
    // restart comes back in lockstep and hammers the server as it boots.
    return delay * (0.5 + Math.random() * 0.5);
  }

  /**
   * Ask the socket to prove it is alive right now. Cheap and idempotent —
   * callers use it when the environment hints the connection may have died
   * without notice (tab restored after sleep, network change).
   */
  public checkLiveness(): void {
    if (this.state !== "connected") {
      return;
    }
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.handleDeadConnection("socket no longer open");
      return;
    }
    this.probeLiveness();
  }

  /**
   * Collapse a pending backoff wait and retry immediately.
   *
   * Backoff assumes nothing has changed since the last failure. When the
   * environment says otherwise — the network came back, the tab woke up — the
   * remaining wait is dead time, and at the 30s ceiling that is 30s of a UI
   * that looks broken for no reason.
   */
  public retryNow(): void {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    // Restart the backoff ladder — the failures it was counting are stale.
    this.reconnectAttempt = 1;
    if (this.intentionalDisconnect) {
      return;
    }
    void this.reconnect();
  }

  private startLivenessWatchdog(): void {
    this.stopLivenessWatchdog();
    if (this.config.heartbeatInterval <= 0) {
      return;
    }

    this.lastInboundAt = Date.now();
    this.probeSentAt = 0;
    // Poll well below the silence threshold so a dead socket is caught within
    // roughly one heartbeat interval rather than two.
    const tick = Math.max(1000, Math.floor(this.config.heartbeatInterval / 4));
    this.livenessTimer = setInterval(() => this.checkForSilence(), tick);
  }

  private stopLivenessWatchdog(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }
    this.probeSentAt = 0;
  }

  private checkForSilence(): void {
    if (this.state !== "connected") {
      return;
    }

    if (this.probeSentAt) {
      if (Date.now() - this.probeSentAt >= this.config.heartbeatTimeout) {
        this.handleDeadConnection("no response to heartbeat probe");
      }
      return;
    }

    if (Date.now() - this.lastInboundAt >= this.config.heartbeatInterval) {
      this.probeLiveness();
    }
  }

  private probeLiveness(): void {
    if (this.probeSentAt) {
      return;
    }
    this.probeSentAt = Date.now();
    try {
      this.send({ type: "ping", ts: this.probeSentAt / 1000 });
    } catch (error) {
      console.warn("Heartbeat probe failed to send:", error);
      this.handleDeadConnection("heartbeat probe could not be sent");
    }
  }

  /**
   * Drop a socket the browser still calls OPEN but that has stopped carrying
   * traffic. `close()` alone is not enough: the closing handshake on a dead
   * connection can hang for minutes before `onclose` fires, so detach the
   * handlers and run the close path ourselves to get reconnect going now.
   */
  private handleDeadConnection(reason: string): void {
    const dead = this.ws;
    console.warn(`WebSocket appears dead (${reason}); reconnecting`);
    this.stopLivenessWatchdog();

    if (dead) {
      dead.onopen = null;
      dead.onmessage = null;
      dead.onerror = null;
      dead.onclose = null;
      try {
        dead.close();
      } catch (error) {
        console.debug("Failed to close dead socket:", error);
      }
    }

    this.emit("error", new Error(`WebSocket liveness check failed: ${reason}`));
    this.handleClose({
      code: 1006,
      reason: "Heartbeat timeout",
      wasClean: false
    } as CloseEvent);
  }

  private startConnectionTimeout(): void {
    this.connectionTimer = setTimeout(() => {
      if (this.state === "connecting" || this.state === "reconnecting") {
        console.error("Connection timeout");
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
    this.stopLivenessWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleConnectionError(error: Error): void {
    console.error("Connection error:", error);
    this.emit("error", error);

    if (this.connectionRejector) {
      this.connectionRejector(error);
      this.connectionResolver = null;
      this.connectionRejector = null;
      this.connectionPromise = null;
    }
  }

  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) {return;}

    console.info(`Processing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      try {
        this.send(message);
      } catch (error) {
        console.error("Failed to send queued message:", error);
        this.emit("error", error);
      }
    }
  }

  public destroy(): void {
    this.intentionalDisconnect = true;
    this.connectGeneration += 1;
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

