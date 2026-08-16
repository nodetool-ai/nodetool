/**
 * WebSocket manager for React Native chat communication.
 * Adapted from web/src/lib/websocket/WebSocketManager.ts
 * 
 * Key differences from web version:
 * - Uses React Native's built-in WebSocket (no EventEmitter dependency)
 * - Simplified event handling with callbacks
 * - Compatible with msgpack encoding
 */

import { pack, unpack } from 'msgpackr';
import {
  ConnectionState,
  WebSocketConfig,
  WebSocketMessageData
} from '../types/chat';
import { isAppForeground, subscribeAppLifecycle } from '../hooks/useAppLifecycle';
import { isRecord, isString } from '../utils/typePredicates';

type WebSocketMessage = { type: string };

/** The message an unknown thrown value or error event carries, or `fallback`. */
function messageOf(value: unknown, fallback: string): string {
  return isRecord(value) &&
    'message' in value &&
    isString(value.message) &&
    value.message
    ? value.message
    : fallback;
}

/** A `catch` binding is `unknown` — narrow it rather than assert it. */
function toError(thrown: unknown, fallback: string): Error {
  return thrown instanceof Error
    ? thrown
    : new Error(messageOf(thrown, fallback));
}

interface WebSocketCallbacks {
  onStateChange?: (state: ConnectionState, previousState: ConnectionState) => void;
  onMessage?: (data: WebSocketMessageData) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
  onReconnecting?: (attempt: number, maxAttempts: number) => void;
}

const STATE_TRANSITIONS: Record<string, { from: ConnectionState[]; to: ConnectionState }> = {
  connect: {
    from: ['disconnected', 'failed'],
    to: 'connecting',
  },
  connected: {
    from: ['connecting', 'reconnecting'],
    to: 'connected',
  },
  disconnect: {
    from: ['connected', 'connecting', 'reconnecting'],
    to: 'disconnecting',
  },
  disconnected: {
    from: ['disconnecting', 'connecting', 'connected', 'reconnecting'],
    to: 'disconnected',
  },
  reconnect: {
    from: ['disconnected', 'failed'],
    to: 'reconnecting',
  },
  failed: {
    // 'disconnected' included so a close that exhausts (or forbids) reconnects
    // reaches the terminal state instead of being indistinguishable from an
    // ordinary disconnect. Mirrors the web manager.
    from: ['connecting', 'reconnecting', 'disconnected'],
    to: 'failed',
  },
};

export class WebSocketManager {
  private config: Required<Omit<WebSocketConfig, 'protocols'>>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  private lastInboundAt = 0;
  private probeSentAt = 0;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;
  private messageQueue: WebSocketMessage[] = [];
  private connectionResolver: (() => void) | null = null;
  private connectionRejector: ((error: Error) => void) | null = null;
  private callbacks: WebSocketCallbacks = {};
  private backgrounded = false;
  private lifecycleUnsubscribe: (() => void) | null = null;

  constructor(config: WebSocketConfig) {
    this.backgrounded = !isAppForeground();
    this.lifecycleUnsubscribe = subscribeAppLifecycle((event) => {
      if (event === 'foreground') {
        this.handleForeground();
      } else {
        this.handleBackground();
      }
    });
    this.config = {
      url: config.url,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      reconnectDecay: config.reconnectDecay ?? 1.5,
      reconnectAttempts: config.reconnectAttempts ?? 10,
      timeoutInterval: config.timeoutInterval ?? 30000,
      heartbeatInterval: config.heartbeatInterval ?? 45000,
      heartbeatTimeout: config.heartbeatTimeout ?? 10000,
      headers: config.headers ?? {},
    };
  }

  /**
   * Set callbacks for WebSocket events
   */
  public setCallbacks(callbacks: WebSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
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

    const previousState = this.state;
    this.state = transition.to;
    this.callbacks.onStateChange?.(this.state, previousState);
    console.log(`WebSocket state: ${previousState} -> ${this.state}`);
    return true;
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  private handleForeground(): void {
    this.backgrounded = false;
    this.resumeFromBackground();
  }

  private handleBackground(): void {
    this.backgrounded = true;
    this.pauseForBackground();
  }

  /**
   * Bring the socket back after the app was suspended. A healthy connection is
   * left alone; otherwise the backoff counter is reset and a reconnect starts
   * immediately rather than waiting out an exponential delay that was scheduled
   * (or skipped) while the app was in the background.
   *
   * Idempotent — safe to call from both the AppState listener and an owner.
   */
  public resumeFromBackground(): void {
    if (this.isConnected()) {
      // The socket may be half-open: suspended radios and cellular/wifi
      // handoffs kill connections without an onclose, and readyState keeps
      // saying OPEN. Make it prove otherwise.
      this.checkLiveness();
      return;
    }

    if (
      this.intentionalDisconnect ||
      !this.config.reconnect ||
      this.state === 'connecting' ||
      this.state === 'reconnecting' ||
      this.state === 'disconnecting'
    ) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;

    if (this.state === 'connected') {
      // State says connected but the socket isn't OPEN — it died while
      // suspended without an onclose. Close it so handleClose drives recovery.
      console.log('WebSocket: app foregrounded with a stale socket, closing it');
      this.ws?.close();
      return;
    }

    console.log('WebSocket: app foregrounded, reconnecting immediately');
    void this.reconnect();
  }

  /**
   * Stop burning reconnect attempts while the app is suspended. A live socket
   * is deliberately left open — iOS often keeps short backgrounds alive, and
   * closing it would drop chat stream continuity for no reason.
   */
  public pauseForBackground(): void {
    if (this.reconnectTimer) {
      console.log('WebSocket: app backgrounded, cancelling pending reconnect');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'reconnecting') {
      // Already connecting
      return;
    }

    if (!this.transitionTo('connect')) {
      if (this.state === 'connected') {
        return Promise.resolve();
      }
      throw new Error(`Cannot connect from state: ${this.state}`);
    }

    return this.establishConnection();
  }

  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();
    this.messageQueue = [];

    if (!this.transitionTo('disconnect')) {
      return;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    } else {
      this.transitionTo('disconnected');
    }
  }

  public send<T extends WebSocketMessage>(message: T): void {
    if (!this.isConnected()) {
      if (
        this.config.reconnect &&
        (this.state === 'connecting' || this.state === 'reconnecting')
      ) {
        console.log('Queueing message while connecting');
        this.messageQueue.push(message);
        return;
      }
      throw new Error(`Cannot send message in state: ${this.state}`);
    }

    try {
      console.log('[WS Send]', message);
      const encoded = pack(message);
      this.ws!.send(encoded);
    } catch (error) {
      console.error('Failed to send message:', error);
      this.callbacks.onError?.(toError(error, 'Failed to send message'));
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) {return;}

    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = (event) => this.handleMessage(event);
    this.ws.onerror = (event) => this.handleError(event);
    this.ws.onclose = (event) => this.handleClose(event);
  }

  private handleOpen(): void {
    console.log('WebSocket connection opened');
    this.clearConnectionTimeout();
    this.reconnectAttempt = 0;

    if (!this.transitionTo('connected')) {
      return;
    }

    this.callbacks.onOpen?.();

    this.startLivenessWatchdog();

    // Process queued messages
    this.processMessageQueue();

    // Resolve connection promise
    if (this.connectionResolver) {
      this.connectionResolver();
      this.connectionResolver = null;
      this.connectionRejector = null;
    }
  }

  private async handleMessage(event: WebSocketMessageEvent): Promise<void> {
    // Any frame proves the socket is alive, decodable or not.
    this.lastInboundAt = Date.now();
    this.probeSentAt = 0;

    try {
      let data: unknown;

      if (event.data instanceof ArrayBuffer) {
        data = unpack(new Uint8Array(event.data));
      } else if (isString(event.data)) {
        // Try to parse as JSON string
        try {
          data = JSON.parse(event.data);
        } catch {
          data = event.data;
        }
      } else {
        // Handle Blob (common in React Native)
        const buffer = await this.blobToArrayBuffer(event.data);
        data = unpack(new Uint8Array(buffer));
      }

      if (this.handleLivenessFrame(data)) {
        return;
      }

      console.log('[WS Receive]', data);
      this.callbacks.onMessage?.(data as WebSocketMessageData);
    } catch (error) {
      console.error('Failed to process message:', error);
      this.callbacks.onError?.(toError(error, 'Failed to process message'));
    }
  }

  /**
   * Consume heartbeat frames instead of forwarding them: they carry no chat
   * content. Returns true when the frame was a heartbeat.
   */
  private handleLivenessFrame(data: unknown): boolean {
    const type =
      isRecord(data) ? (data as { type?: unknown }).type : undefined;

    if (type === 'ping') {
      try {
        this.send({ type: 'pong' });
      } catch (error) {
        console.log('Failed to answer server ping:', error);
      }
      return true;
    }

    return type === 'pong';
  }

  private async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  private handleError(event: unknown): void {
    console.error('WebSocket error:', event);
    this.callbacks.onError?.(
      new Error(messageOf(event, 'WebSocket error occurred'))
    );
  }

  private handleClose(event: WebSocketCloseEvent): void {
    console.log(
      `WebSocket closed: code=${event.code}, reason=${event.reason}, intentional=${this.intentionalDisconnect}`
    );

    this.ws = null;
    this.clearConnectionTimeout();
    this.stopLivenessWatchdog();

    const wasConnecting =
      this.state === 'connecting' || this.state === 'reconnecting';

    if (!this.transitionTo('disconnected')) {
      return;
    }

    // Handle connection promise rejection
    if (wasConnecting && this.connectionRejector) {
      this.connectionRejector(
        new Error(`Connection failed: ${event.reason || 'Unknown reason'}`)
      );
      this.connectionResolver = null;
      this.connectionRejector = null;
    }

    this.callbacks.onClose?.(event.code ?? 0, event.reason ?? '');

    // Handle reconnection
    const shouldReconnect = this.shouldReconnect(event);
    console.log(
      `Should reconnect: ${shouldReconnect}, attempts: ${this.reconnectAttempt}/${this.config.reconnectAttempts}`
    );

    if (shouldReconnect) {
      this.scheduleReconnect();
    } else if (!this.intentionalDisconnect) {
      this.transitionTo('failed');
    }
  }

  private shouldReconnect(event: WebSocketCloseEvent): boolean {
    const noReconnectCodes = [
      1008, // Policy violation
      1009, // Message too big
      1010, // Mandatory extension
      1011, // Internal server error
      4000, // Custom: Authentication required
      4001, // Custom: Unauthorized
      4003, // Custom: Forbidden
    ];

    const eventCode = event.code ?? 0;

    if (this.intentionalDisconnect && eventCode === 1000) {
      return false;
    }

    return (
      this.config.reconnect &&
      !this.intentionalDisconnect &&
      this.reconnectAttempt < this.config.reconnectAttempts &&
      !noReconnectCodes.includes(eventCode)
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.backgrounded) {
      // Retrying against a suspended radio just exhausts the attempt budget;
      // resumeFromBackground() reconnects as soon as the app is active again.
      console.log('WebSocket: app backgrounded, deferring reconnect to foreground');
      return;
    }

    const delay = this.getReconnectDelay();
    this.reconnectAttempt++;

    console.log(
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
    console.log(`Attempting to reconnect (attempt ${this.reconnectAttempt})`);

    if (!this.transitionTo('reconnect')) {
      console.warn(`Failed to transition to reconnect state from ${this.state}`);
      return;
    }

    this.callbacks.onReconnecting?.(
      this.reconnectAttempt,
      this.config.reconnectAttempts
    );

    try {
      await this.establishConnection();
      console.log('Reconnection successful');
    } catch (error) {
      console.error(`Reconnection attempt ${this.reconnectAttempt} failed:`, error);
    }
  }

  private async establishConnection(): Promise<void> {
    this.intentionalDisconnect = false;
    this.clearTimers();

    return new Promise<void>((resolve, reject) => {
      this.connectionResolver = resolve;
      this.connectionRejector = reject;

      try {
        // React Native's WebSocket accepts a third `options.headers` argument
        // on native platforms; this is how we pass `Authorization` so the auth
        // token never appears in the URL. Headers are ignored on web, where the
        // server's `?api_key=` fallback would be needed instead.
        const hasHeaders = Object.keys(this.config.headers).length > 0;
        this.ws = hasHeaders
          ? new WebSocket(this.config.url, undefined, { headers: this.config.headers })
          : new WebSocket(this.config.url);
        // Set binary type for msgpack
        this.ws.binaryType = 'arraybuffer';
        this.setupEventHandlers();
        this.startConnectionTimeout();
      } catch (error) {
        this.handleConnectionError(toError(error, 'Failed to open WebSocket'));
        reject(error);
      }
    });
  }

  private getReconnectDelay(): number {
    const delay = Math.min(
      this.config.reconnectInterval *
        Math.pow(this.config.reconnectDecay, this.reconnectAttempt),
      30000 // Max 30 seconds
    );
    // Half-to-full jitter. Without it every client that dropped on a server
    // restart comes back in lockstep and hammers the server as it boots.
    return delay * (0.5 + Math.random() * 0.5);
  }

  /**
   * Ask the socket to prove it is alive right now — used when the environment
   * hints the connection may have died without notice (app foregrounded).
   */
  public checkLiveness(): void {
    if (this.state !== 'connected') {
      return;
    }
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.handleDeadConnection('socket no longer open');
      return;
    }
    this.probeLiveness();
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
    if (this.state !== 'connected' || this.backgrounded) {
      // A suspended app cannot service timers reliably; foregrounding runs the
      // check explicitly through resumeFromBackground().
      return;
    }

    if (this.probeSentAt) {
      if (Date.now() - this.probeSentAt >= this.config.heartbeatTimeout) {
        this.handleDeadConnection('no response to heartbeat probe');
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
      this.send({ type: 'ping' });
    } catch (error) {
      console.warn('Heartbeat probe failed to send:', error);
      this.handleDeadConnection('heartbeat probe could not be sent');
    }
  }

  /**
   * Drop a socket the runtime still calls OPEN but that has stopped carrying
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
        console.log('Failed to close dead socket:', error);
      }
    }

    this.callbacks.onError?.(
      new Error(`WebSocket liveness check failed: ${reason}`)
    );
    this.handleClose({
      code: 1006,
      reason: 'Heartbeat timeout',
    } as WebSocketCloseEvent);
  }

  private startConnectionTimeout(): void {
    this.connectionTimer = setTimeout(() => {
      if (this.state === 'connecting' || this.state === 'reconnecting') {
        console.error('Connection timeout');
        this.handleConnectionError(new Error('Connection timeout'));
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
    console.error('Connection error:', error);
    this.callbacks.onError?.(error);

    if (this.connectionRejector) {
      this.connectionRejector(error);
      this.connectionResolver = null;
      this.connectionRejector = null;
    }
  }

  private processMessageQueue(): void {
    if (this.messageQueue.length === 0) {return;}

    console.log(`Processing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      try {
        this.send(message);
      } catch (error) {
        console.error('Failed to send queued message:', error);
        this.callbacks.onError?.(toError(error, 'Failed to send queued message'));
      }
    }
  }

  public destroy(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();
    this.callbacks = {};
    this.lifecycleUnsubscribe?.();
    this.lifecycleUnsubscribe = null;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
    this.state = 'disconnected';
  }
}
