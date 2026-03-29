import type { WebSocketConnection } from "./unified-websocket-runner.js";

/**
 * Adapts a ws WebSocket to the WebSocketConnection interface used by UnifiedWebSocketRunner.
 */
export class WsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: Array<{ type: string; bytes?: Uint8Array | null; text?: string | null }> = [];
  private waiters: Array<(frame: { type: string; bytes?: Uint8Array | null; text?: string | null }) => void> = [];

  constructor(private socket: any) {
    socket.on("message", (raw: any, isBinary: boolean) => {
      const frame = isBinary
        ? { type: "websocket.message", bytes: raw instanceof Uint8Array ? raw : new Uint8Array(raw as Buffer) }
        : { type: "websocket.message", text: raw.toString() };
      const waiter = this.waiters.shift();
      if (waiter) waiter(frame);
      else this.queue.push(frame);
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

  async receive(): Promise<{ type: string; bytes?: Uint8Array | null; text?: string | null }> {
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
