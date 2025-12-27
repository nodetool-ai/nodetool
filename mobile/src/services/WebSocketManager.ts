/**
 * WebSocket manager for React Native chat communication.
 * Adapted from web/src/lib/websocket/WebSocketManager.ts
 * 
 * Key differences from web version:
 * - Uses React Native's built-in WebSocket (no EventEmitter dependency)
 * - Simplified event handling with callbacks
 * - Compatible with msgpack encoding
 */

import { encode, decode } from '@msgpack/msgpack';
import { 
  ConnectionState, 
  WebSocketConfig,
  WebSocketMessageData 
} from '../types/chat';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
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
    from: ['connecting', 'reconnecting'],
    to: 'failed',
  },
};

export class WebSocketManager {
  private config: Required<Omit<WebSocketConfig, 'protocols'>>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;
  private messageQueue: WebSocketMessage[] = [];
  private connectionResolver: (() => void) | null = null;
  private connectionRejector: ((error: Error) => void) | null = null;
  private callbacks: WebSocketCallbacks = {};

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 1000,
      reconnectDecay: config.reconnectDecay ?? 1.5,
      reconnectAttempts: config.reconnectAttempts ?? 10,
      timeoutInterval: config.timeoutInterval ?? 30000,
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

  public send(message: WebSocketMessage): void {
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
      const encoded = encode(message);
      this.ws!.send(encoded);
    } catch (error) {
      console.error('Failed to send message:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = (event) => this.handleMessage(event);
    this.ws.onerror = (event) => this.handleError(event as any);
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
    try {
      let data: any;

      if (event.data instanceof ArrayBuffer) {
        data = decode(new Uint8Array(event.data));
      } else if (typeof event.data === 'string') {
        // Try to parse as JSON string
        try {
          data = JSON.parse(event.data);
        } catch {
          data = event.data;
        }
      } else {
        // Handle Blob (common in React Native)
        const buffer = await this.blobToArrayBuffer(event.data);
        data = decode(new Uint8Array(buffer));
      }

      console.log('[WS Receive]', data);
      this.callbacks.onMessage?.(data);
    } catch (error) {
      console.error('Failed to process message:', error);
      this.callbacks.onError?.(error as Error);
    }
  }

  private async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  private handleError(event: { message?: string }): void {
    console.error('WebSocket error:', event);
    this.callbacks.onError?.(new Error(event.message || 'WebSocket error occurred'));
  }

  private handleClose(event: WebSocketCloseEvent): void {
    console.log(
      `WebSocket closed: code=${event.code}, reason=${event.reason}, intentional=${this.intentionalDisconnect}`
    );

    this.ws = null;
    this.clearConnectionTimeout();

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
        this.ws = new WebSocket(this.config.url);
        // Set binary type for msgpack
        this.ws.binaryType = 'arraybuffer';
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
    if (this.messageQueue.length === 0) return;

    console.log(`Processing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      try {
        this.send(message);
      } catch (error) {
        console.error('Failed to send queued message:', error);
        this.callbacks.onError?.(error as Error);
      }
    }
  }

  public destroy(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();
    this.callbacks = {};

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageQueue = [];
    this.state = 'disconnected';
  }
}
