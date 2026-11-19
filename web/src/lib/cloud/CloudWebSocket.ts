/**
 * The workflow socket of a cloud document in the desktop app (decision D25;
 * WP1.15). It behaves as the browser's `WebSocket` for `WebSocketManager`,
 * but the main process opens the socket, to `/ws` on the signed-in server,
 * with the account's credential. Frames cross over IPC.
 *
 * The URL the manager passes is ignored: the renderer cannot point the
 * socket anywhere else.
 */

type SocketEvent =
  | { id: number; kind: "open" }
  | { id: number; kind: "message"; data: Uint8Array | string }
  | { id: number; kind: "close"; code: number; reason: string };

export interface CloudSocketBridge {
  open: () => Promise<{ ok: true; id: number } | { ok: false; error: string }>;
  send: (id: number, data: Uint8Array | string) => Promise<boolean>;
  close: (id: number) => Promise<void>;
  onEvent: (callback: (event: SocketEvent) => void) => () => void;
}

/** The desktop app's socket bridge, or null in a browser. */
export function desktopCloudSocketBridge(): CloudSocketBridge | null {
  return (typeof window !== "undefined" && window.api?.cloud?.socket) || null;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** A close the main process gives when it could not open the socket. */
const ABNORMAL_CLOSE = 1006;

export class CloudWebSocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;

  readonly url: string;
  readonly protocol = "";
  readonly extensions = "";
  binaryType: BinaryType = "arraybuffer";
  readyState: number = CONNECTING;
  bufferedAmount = 0;

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  private id: number | null = null;
  /** Events that arrive before the id is known. */
  private early: SocketEvent[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    url: string,
    private readonly bridge: CloudSocketBridge
  ) {
    this.url = url;
    this.unsubscribe = bridge.onEvent((event) => {
      if (this.id === null) {
        this.early.push(event);
      } else if (event.id === this.id) {
        this.handle(event);
      }
    });
    void bridge.open().then(
      (result) => {
        if (!result.ok) {
          this.finish(ABNORMAL_CLOSE, result.error, true);
          return;
        }
        if (this.readyState === CLOSING || this.readyState === CLOSED) {
          // Closed by the manager while the main process was opening it.
          void bridge.close(result.id);
          return;
        }
        this.id = result.id;
        const early = this.early;
        this.early = [];
        for (const event of early) {
          if (event.id === result.id) {
            this.handle(event);
          }
        }
      },
      () => this.finish(ABNORMAL_CLOSE, "OFFLINE", true)
    );
  }

  send(data: string | ArrayBufferLike | ArrayBufferView | Blob): void {
    if (this.readyState !== OPEN || this.id === null) {
      throw new DOMException("The socket is not open.", "InvalidStateError");
    }
    let frame: Uint8Array | string;
    if (typeof data === "string") {
      frame = data;
    } else if (ArrayBuffer.isView(data)) {
      frame = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    } else if (data instanceof ArrayBuffer) {
      frame = new Uint8Array(data.slice(0));
    } else {
      throw new TypeError("A cloud socket sends strings and bytes only.");
    }
    const id = this.id;
    void this.bridge.send(id, frame).then(
      (sent) => {
        if (!sent && this.id === id && this.readyState === OPEN) {
          // A refused frame breaks the run's protocol, so the socket ends.
          this.close(1000, "frame refused");
          this.fire("error");
        }
      },
      () => undefined
    );
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === CLOSING || this.readyState === CLOSED) {
      return;
    }
    this.readyState = CLOSING;
    if (this.id !== null) {
      void this.bridge.close(this.id);
    }
    // The main process sends nothing for a close this side asked for.
    this.finish(code, reason, false);
  }

  addEventListener(): void {
    throw new Error("CloudWebSocket supports the on* handlers only.");
  }

  removeEventListener(): void {
    // Nothing is added, so nothing is removed.
  }

  dispatchEvent(): boolean {
    return false;
  }

  private handle(event: SocketEvent): void {
    if (this.readyState === CLOSED) {
      return;
    }
    if (event.kind === "open") {
      if (this.readyState === CONNECTING) {
        this.readyState = OPEN;
        this.fire("open");
      }
    } else if (event.kind === "message") {
      const data =
        typeof event.data === "string"
          ? event.data
          : event.data.buffer.slice(event.data.byteOffset, event.data.byteOffset + event.data.byteLength);
      this.onmessage?.(new MessageEvent("message", { data }));
    } else {
      this.finish(event.code, event.reason, event.code !== 1000 && event.code !== 1001);
    }
  }

  private finish(code: number, reason: string, withError: boolean): void {
    if (this.readyState === CLOSED) {
      return;
    }
    this.readyState = CLOSED;
    this.unsubscribe();
    if (withError) {
      this.fire("error");
    }
    this.onclose?.(new CloseEvent("close", { code, reason, wasClean: !withError }));
  }

  private fire(type: "open" | "error"): void {
    const event = new Event(type);
    if (type === "open") {
      this.onopen?.(event);
    } else {
      this.onerror?.(event);
    }
  }
}

/** A `createSocket` for `WebSocketManager` over this bridge. */
export function cloudSocketFactory(bridge: CloudSocketBridge): (url: string) => WebSocket {
  return (url) => new CloudWebSocket(url, bridge) as unknown as WebSocket;
}
