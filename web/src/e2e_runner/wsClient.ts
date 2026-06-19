/**
 * Minimal JSON-text WebSocket client for the E2E runner.
 *
 * The backend's UnifiedWebSocketRunner supports a "text mode" in which messages
 * are JSON strings instead of MsgPack. The harness opts into it with
 * `set_mode {mode:text}` right after connecting, which keeps this client
 * dependency-free (no MsgPack, no auth/Supabase) and easy to reason about in CI.
 */
import type { WsEvent } from "./types";

export type WsMessageHandler = (msg: WsEvent) => void;

export class HarnessWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<WsMessageHandler>();

  /** Resolve the /ws URL from the current page origin (proxied by Vite to the backend). */
  static defaultUrl(): string {
    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${host}/ws`;
  }

  async connect(url: string = HarnessWsClient.defaultUrl()): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        ws.send(JSON.stringify({ command: "set_mode", data: { mode: "text" } }));
        this.ws = ws;
        resolve();
      };
      ws.onerror = () =>
        reject(new Error(`WebSocket connection to ${url} failed`));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
      };
      ws.onmessage = (event) => {
        let msg: WsEvent | null = null;
        try {
          msg = JSON.parse(
            typeof event.data === "string" ? event.data : String(event.data)
          ) as WsEvent;
        } catch {
          return;
        }
        for (const handler of this.handlers) handler(msg);
      };
    });
  }

  onMessage(handler: WsMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.ws.send(JSON.stringify(payload));
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }
}
