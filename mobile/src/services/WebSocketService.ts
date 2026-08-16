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
 *
 * App lifecycle: the transport ({@link WebSocketManager}) reconnects itself
 * when the app returns to the foreground. This service adds the two pieces the
 * transport can't know about — it keeps the subscriber registry across the
 * reconnect (it is never cleared by a transport-level drop) and re-attaches
 * running jobs server-side with `reconnect_job`, since a fresh socket has no
 * association with jobs started on the old one.
 */
import { apiService } from './api';
import { useAuthStore } from '../stores/AuthStore';
import { WebSocketManager } from './WebSocketManager';
import { subscribeAppLifecycle } from '../hooks/useAppLifecycle';
import { validateInboundMessage } from './validateInboundMessage';
import type { WebSocketMessageData } from '../types/chat';

type MessageHandler = (message: Record<string, unknown>) => void;

/** Job statuses after which no further updates are expected. */
const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'error',
  'timed_out',
]);

class WebSocketService {
  private static instance: WebSocketService | null = null;
  private wsManager: WebSocketManager | null = null;
  private currentPath: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  /** job_id -> workflow_id for jobs believed to still be running. */
  private activeJobs: Map<string, string | null> = new Map();
  private hasOpened = false;

  private lifecycleUnsubscribe: (() => void) | null = null;

  private constructor() {
    // Private constructor for singleton. The AppState listener is attached
    // lazily on the first connection — an unused singleton holds none.
  }

  private ensureLifecycleSubscription(): void {
    if (this.lifecycleUnsubscribe) {
      return;
    }
    this.lifecycleUnsubscribe = subscribeAppLifecycle((event) => {
      if (event === 'foreground') {
        this.handleForeground();
      } else {
        this.handleBackground();
      }
    });
  }

  /**
   * Foregrounding: ask the transport to reconnect now instead of waiting out
   * its backoff. Subscribers are untouched, so they keep receiving messages on
   * the new socket; `handleOpen` re-attaches any running jobs.
   */
  private handleForeground(): void {
    if (!this.currentPath || !this.wsManager) {
      return;
    }
    this.wsManager.resumeFromBackground();
  }

  /** Backgrounding: stop the pending reconnect timer, keep a live socket. */
  private handleBackground(): void {
    this.wsManager?.pauseForBackground();
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
    if (this.wsManager && this.currentPath === path) {
      // Reuse a healthy socket, and also one the transport is already bringing
      // back up (e.g. a foreground-triggered reconnect) — replacing it here
      // would throw away an in-flight connection. Messages sent meanwhile are
      // queued by the manager.
      const state = this.wsManager.getState();
      if (
        this.wsManager.isConnected() ||
        state === 'connecting' ||
        state === 'reconnecting'
      ) {
        return;
      }
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
    this.ensureLifecycleSubscription();

    // Drop any previous (failed/closed) manager before opening a new one.
    this.wsManager?.destroy();
    this.currentPath = path;

    // The auth token is sent as an Authorization header (see WebSocketManager)
    // rather than a `?api_key=` query param, keeping it out of URLs/logs.
    const url = apiService.getWebSocketUrl(path);
    const session = useAuthStore.getState().session;
    const headers = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined;
    console.log('WebSocketService: Connecting to', url);

    const manager = new WebSocketManager({
      url,
      headers,
      reconnect: true,
      reconnectInterval: 1000,
      reconnectDecay: 1.5,
      reconnectAttempts: 10,
      timeoutInterval: 30000,
    });
    manager.setCallbacks({
      onOpen: () => this.handleOpen(),
      // SAFETY: the manager decodes a wire object and labels it with the chat
      // union; this router reads it by routing id instead of by variant, and
      // the union's members declare no index signature.
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
   * Called on every socket open, including reconnects. Subscribers survive a
   * reconnect on their own (the registry is independent of the transport), but
   * the server does not: a job started on the previous socket streams nowhere
   * until the new socket asks to be re-attached to it.
   */
  private handleOpen(): void {
    const reopened = this.hasOpened;
    this.hasOpened = true;
    if (!reopened || this.activeJobs.size === 0) {
      return;
    }

    for (const [jobId, workflowId] of this.activeJobs) {
      try {
        this.wsManager?.send({
          type: 'reconnect_job',
          command: 'reconnect_job',
          data: { job_id: jobId, workflow_id: workflowId },
        });
      } catch (error) {
        console.error('WebSocketService: Failed to re-attach job', jobId, error);
      }
    }
  }

  /**
   * Remember which jobs are still running so they can be re-attached after a
   * reconnect, and forget them once they reach a terminal status.
   */
  private trackJob(message: Record<string, unknown>): void {
    const jobId = message.job_id;
    if (typeof jobId !== 'string') {
      return;
    }

    const status = message.status;
    if (typeof status === 'string' && TERMINAL_JOB_STATUSES.has(status)) {
      this.activeJobs.delete(jobId);
      return;
    }

    const workflowId = message.workflow_id;
    this.activeJobs.set(jobId, typeof workflowId === 'string' ? workflowId : null);
  }

  /**
   * Route an incoming message to every subscriber whose key matches one of the
   * message's routing ids. Each handler is invoked at most once even when the
   * message carries several matching ids (e.g. both `workflow_id` and `job_id`).
   */
  private routeMessage(message: Record<string, unknown>): void {
    // Dev/test only (see validateInboundMessage) — observe-only, never
    // affects dispatch below.
    validateInboundMessage(message);
    this.trackJob(message);

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
  async send(message: Record<string, unknown>, path: string = '/ws'): Promise<void> {
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
    this.activeJobs.clear();
    this.hasOpened = false;
  }

  disconnect(): void {
    this.teardown();
  }
}

export const webSocketService = WebSocketService.getInstance();
