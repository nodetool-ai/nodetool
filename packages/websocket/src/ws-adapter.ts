import type { WebSocket } from "@fastify/websocket";
import type { WebSocketConnection } from "./unified-websocket-runner.js";

type WsFrame = { type: string; bytes?: Uint8Array | null; text?: string | null };

/**
 * Adapts a ws WebSocket to the WebSocketConnection interface used by UnifiedWebSocketRunner.
 */
export class WsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: WsFrame[] = [];
  private waiters: Array<(frame: WsFrame) => void> = [];

  constructor(private socket: WebSocket) {
    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
      const frame: WsFrame = isBinary
        ? { type: "websocket.message", bytes }
        : { type: "websocket.message", text: bytes.toString() };
      const waiter = this.waiters.shift();
      if (waiter) waiter(frame);
      else this.queue.push(frame);
    });

    socket.on("error", () => {
      this.clientState = "disconnected";
      this.applicationState = "disconnected";
      const frame = { type: "websocket.disconnect" };
      for (const waiter of this.waiters) {
        waiter(frame);
      }
      this.waiters.length = 0;
    });

    socket.on("close", () => {
      this.clientState = "disconnected";
      this.applicationState = "disconnected";
      // Notify ALL pending waiters, not just the first one,
      // to prevent hanging promises when the socket closes.
      const frame = { type: "websocket.disconnect" };
      for (const waiter of this.waiters) {
        waiter(frame);
      }
      this.waiters.length = 0;
    });
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
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
    this.socket.close(code, reason);
  }
}
