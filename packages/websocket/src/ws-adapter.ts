import type { WebSocket } from "@fastify/websocket";
import type { WebSocketConnection } from "./unified-websocket-runner.js";
import { WsMessageRateLimiter } from "./lib/ws-rate-limit.js";
import {
  getWsConnectionHealthConfig,
  type WsConnectionHealthConfig
} from "./lib/ws-connection-health.js";

type WsFrame = {
  type: string;
  bytes?: Uint8Array | null;
  text?: string | null;
};

/**
 * Adapts a ws WebSocket to the WebSocketConnection interface used by UnifiedWebSocketRunner.
 *
 * Beyond the plumbing it enforces the per-connection health limits described in
 * `lib/ws-connection-health.ts`: a ping/idle deadline that closes half-open
 * peers, a bounded outbound buffer that makes `sendBytes`/`sendText` wait on a
 * slow reader instead of growing the heap, and a cap on undelivered inbound
 * frames.
 */
export class WsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: WsFrame[] = [];
  private waiters: Array<(frame: WsFrame) => void> = [];
  private disconnected = false;
  private readonly health: WsConnectionHealthConfig;
  private lastActivityAt = Date.now();
  private healthTimer: NodeJS.Timeout | null = null;

  constructor(
    private socket: WebSocket,
    private rateLimiter: WsMessageRateLimiter = new WsMessageRateLimiter(),
    health: WsConnectionHealthConfig = getWsConnectionHealthConfig()
  ) {
    this.health = health;

    socket.on(
      "message",
      (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (this.disconnected) return;
        this.lastActivityAt = Date.now();
        // Cap inbound message rate per connection — a flooding client is
        // disconnected with a policy-violation code instead of being serviced.
        if (!this.rateLimiter.allow()) {
          this.closeWith(1008, "Message rate limit exceeded");
          return;
        }
        const bytes =
          raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
        const frame: WsFrame = isBinary
          ? { type: "websocket.message", bytes }
          : { type: "websocket.message", text: bytes.toString() };
        const waiter = this.waiters.shift();
        if (waiter) {
          waiter(frame);
          return;
        }
        // Nothing is reading. Frames pile up only if the runner's receive loop
        // has stalled; past this depth the client is better served by a close
        // it can reconnect from than by an ever-growing queue.
        if (this.queue.length >= this.health.maxQueuedFrames) {
          this.closeWith(1008, "Inbound queue overflow");
          return;
        }
        this.queue.push(frame);
      }
    );

    // Any traffic proves the peer is alive: data frames, protocol pongs, and
    // the pings browsers send on their own.
    socket.on("pong", () => this.markActivity());
    socket.on("ping", () => this.markActivity());
    socket.on("error", () => this.markDisconnected());
    socket.on("close", () => this.markDisconnected());

    this.startHealthWatchdog();
  }

  private markActivity(): void {
    this.lastActivityAt = Date.now();
  }

  private closeWith(code: number, reason: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      // socket already closing/closed
    }
    this.markDisconnected();
  }

  /**
   * Transition to the disconnected state exactly once and unblock consumers.
   *
   * Wakes every pending `receive()` with a disconnect frame. When no `receive()`
   * is in flight (e.g. the socket drops while the runner is busy), the frame is
   * queued so the next `receive()` resolves instead of hanging forever.
   */
  private markDisconnected(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
    this.stopHealthWatchdog();
    const frame: WsFrame = { type: "websocket.disconnect" };
    if (this.waiters.length > 0) {
      for (const waiter of this.waiters) waiter(frame);
      this.waiters.length = 0;
    } else {
      this.queue.push(frame);
    }
  }

  /**
   * Probe the peer on a timer and give up on it once it has been silent past
   * the idle deadline.
   *
   * `close()` is not enough for a peer that is already gone — the closing
   * handshake has nobody to answer it and the socket can linger for minutes —
   * so the connection is terminated outright once the deadline passes.
   */
  private startHealthWatchdog(): void {
    if (!this.health.enabled || this.health.pingIntervalMs <= 0) return;

    this.healthTimer = setInterval(() => {
      if (this.disconnected) return;

      if (Date.now() - this.lastActivityAt >= this.health.idleTimeoutMs) {
        this.markDisconnected();
        try {
          this.socket.terminate?.();
        } catch {
          // socket already gone
        }
        return;
      }

      try {
        this.socket.ping?.();
      } catch {
        // A ping that cannot even be queued means the socket is finished.
        this.markDisconnected();
      }
    }, this.health.pingIntervalMs);

    // Never hold the process open for a watchdog.
    this.healthTimer.unref?.();
  }

  private stopHealthWatchdog(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  async accept(): Promise<void> {}

  async receive(): Promise<WsFrame> {
    const next = this.queue.shift();
    if (next) return next;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    await this.send(data);
  }

  async sendText(data: string): Promise<void> {
    await this.send(data);
  }

  /**
   * Write one frame, waiting first if the peer is behind.
   *
   * The runner serializes sends behind a lock, so waiting here propagates
   * backpressure all the way up to whatever is producing messages instead of
   * letting them accumulate in the socket's buffer.
   */
  private async send(data: Uint8Array | string): Promise<void> {
    if (this.disconnected) return;
    await this.awaitDrain();
    if (this.disconnected) return;
    try {
      this.socket.send(data);
    } catch {
      // The peer went away between the drain check and the write.
      this.markDisconnected();
    }
  }

  private async awaitDrain(): Promise<void> {
    const { maxBufferedBytes, drainTimeoutMs } = this.health;
    if (maxBufferedBytes <= 0) return;
    if (this.bufferedAmount() < maxBufferedBytes) return;

    const deadline = Date.now() + drainTimeoutMs;
    while (!this.disconnected && this.bufferedAmount() >= maxBufferedBytes) {
      if (Date.now() >= deadline) {
        // 1001 rather than a policy code: the client should treat this as a
        // routine drop and reconnect.
        this.closeWith(1001, "Client too slow to receive");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private bufferedAmount(): number {
    const buffered = this.socket.bufferedAmount;
    return typeof buffered === "number" ? buffered : 0;
  }

  async close(code?: number, reason?: string): Promise<void> {
    this.markDisconnected();
    this.socket.close(code, reason);
  }
}
