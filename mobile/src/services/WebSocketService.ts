/**
 * Mobile WebSocket Service — singleton router over a single shared connection.
 *
 * Mirrors web/src/lib/websocket/GlobalWebSocketManager.ts: it owns one
 * {@link WebSocketManager} (which provides the robust transport — exponential
 * backoff, connection timeout, and an outgoing message queue) and multiplexes
 * incoming messages to subscribers keyed by `workflow_id` / `job_id` /
 * `thread_id`. Consumers (e.g. WorkflowRunner) keep using `subscribe`/`send`
 * unchanged; the duplicate hand-rolled reconnect logic that used to live here
 * is gone.
 */
import { apiService } from './api';
import { useAuthStore } from '../stores/AuthStore';
import { WebSocketManager } from './WebSocketManager';
import type { WebSocketMessageData } from '../types/chat';

type MessageHandler = (message: Record<string, unknown>) => void;

function maskApiKey(url: string): string {
  return url.replace(/api_key=[^&]*/, 'api_key=***');
}

class WebSocketService {
  private static instance: WebSocketService | null = null;
  private wsManager: WebSocketManager | null = null;
  private currentPath: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Ensure a connection to `path` is established, reusing an existing one and
   * de-duplicating concurrent callers. Switching paths tears down the old
   * connection first.
   */
  async ensureConnection(path: string): Promise<void> {
    if (this.wsManager?.isConnected() && this.currentPath === path) {
      return;
    }

    if (this.wsManager && this.currentPath !== path) {
      this.teardown();
    }

    if (this.connectPromise && this.currentPath === path) {
      return this.connectPromise;
    }

    this.connectPromise = this.establish(path);
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async establish(path: string): Promise<void> {
    // Drop any previous (failed/closed) manager before opening a new one.
    this.wsManager?.destroy();
    this.currentPath = path;

    let url = apiService.getWebSocketUrl(path);
    const session = useAuthStore.getState().session;
    if (session?.access_token) {
      url += `?api_key=${session.access_token}`;
    }
    console.log('WebSocketService: Connecting to', maskApiKey(url));

    const manager = new WebSocketManager({
      url,
      reconnect: true,
      reconnectInterval: 1000,
      reconnectDecay: 1.5,
      reconnectAttempts: 10,
      timeoutInterval: 30000,
    });
    manager.setCallbacks({
      onMessage: (data: WebSocketMessageData) =>
        this.routeMessage(data as unknown as Record<string, unknown>),
      onError: (error: Error) =>
        console.error('WebSocketService: Error', error.message),
      onClose: (code: number, reason: string) =>
        console.log(`WebSocketService: Disconnected (code=${code}, reason=${reason})`),
    });
    this.wsManager = manager;

    await manager.connect();
  }

  /**
   * Route an incoming message to every subscriber whose key matches one of the
   * message's routing ids. Each handler is invoked at most once even when the
   * message carries several matching ids (e.g. both `workflow_id` and `job_id`).
   */
  private routeMessage(message: Record<string, unknown>): void {
    const routingKeys = new Set<string>();
    for (const field of ['workflow_id', 'job_id', 'thread_id'] as const) {
      const value = message[field];
      if (typeof value === 'string') {
        routingKeys.add(value);
      }
    }

    if (routingKeys.size === 0) {
      return;
    }

    const called = new Set<MessageHandler>();
    routingKeys.forEach((key) => {
      const handlers = this.messageHandlers.get(key);
      handlers?.forEach((handler) => {
        if (called.has(handler)) {
          return;
        }
        called.add(handler);
        try {
          handler(message);
        } catch (error) {
          console.error('WebSocketService: Handler error:', error);
        }
      });
    });
  }

  /**
   * Register a message handler for a workflow or job id. Returns an unsubscribe
   * function.
   */
  subscribe(key: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(key)) {
      this.messageHandlers.set(key, new Set());
    }
    this.messageHandlers.get(key)!.add(handler);

    return () => {
      const handlers = this.messageHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(key);
        }
      }
    };
  }

  /**
   * Send a message, connecting first if needed. The underlying manager queues
   * the message if a reconnect is in progress rather than dropping it.
   */
  async send(message: unknown, path: string = '/ws'): Promise<void> {
    await this.ensureConnection(path);

    if (!this.wsManager) {
      throw new Error('WebSocket not connected');
    }

    this.wsManager.send(message as { type: string });
  }

  /** Tear down the transport but keep subscriptions for the next connection. */
  private teardown(): void {
    this.wsManager?.destroy();
    this.wsManager = null;
    this.currentPath = null;
    this.connectPromise = null;
  }

  disconnect(): void {
    this.teardown();
  }
}

export const webSocketService = WebSocketService.getInstance();
