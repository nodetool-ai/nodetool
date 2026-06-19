import type { WebSocket } from "@fastify/websocket";
import type { WebSocketConnection } from "./unified-websocket-runner.js";
import { WsMessageRateLimiter } from "./lib/ws-rate-limit.js";

type WsFrame = {
  type: string;
  bytes?: Uint8Array | null;
  text?: string | null;
};

/**
 * Adapts a ws WebSocket to the WebSocketConnection interface used by UnifiedWebSocketRunner.
 */
export class WsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: WsFrame[] = [];
  private waiters: Array<(frame: WsFrame) => void> = [];
  private disconnected = false;

  constructor(
    private socket: WebSocket,
    private rateLimiter: WsMessageRateLimiter = new WsMessageRateLimiter()
  ) {
    socket.on(
      "message",
      (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (this.disconnected) return;
        // Cap inbound message rate per connection — a flooding client is
        // disconnected with a policy-violation code instead of being serviced.
        if (!this.rateLimiter.allow()) {
          try {
            this.socket.close(1008, "Message rate limit exceeded");
          } catch {
            // socket already closing/closed
          }
          this.markDisconnected();
          return;
        }
        const bytes =
          raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
        const frame: WsFrame = isBinary
          ? { type: "websocket.message", bytes }
          : { type: "websocket.message", text: bytes.toString() };
        const waiter = this.waiters.shift();
        if (waiter) waiter(frame);
        else this.queue.push(frame);
      }
    );

    socket.on("error", () => this.markDisconnected());
    socket.on("close", () => this.markDisconnected());
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
    const frame: WsFrame = { type: "websocket.disconnect" };
    if (this.waiters.length > 0) {
      for (const waiter of this.waiters) waiter(frame);
      this.waiters.length = 0;
    } else {
      this.queue.push(frame);
    }
  }

  async accept(): Promise<void> {}

  async receive(): Promise<WsFrame> {
    const next = this.queue.shift();
    if (next) return next;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.socket.send(data);
  }

  async sendText(data: string): Promise<void> {
    this.socket.send(data);
  }

  async close(code?: number, reason?: string): Promise<void> {
    this.markDisconnected();
    this.socket.close(code, reason);
  }
}
