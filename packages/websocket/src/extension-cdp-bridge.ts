/**
 * In-process broker for the `/ws/extension` side channel.
 *
 * Topology (see the extension-CDP-proxy design spec):
 *
 *   Chrome extension  <--JSON text frames-->  /ws/extension route
 *                                                     |
 *                                          registerSocket / clear
 *                                                     |
 *                                            ExtensionBridge (singleton)
 *                                                     |
 *                                              getChannel()
 *                                                     |
 *                            in-process ExtensionChannel { send, onMessage, close }
 *                                                     |
 *                                  host-process ExtensionCdpClient (Track A)
 *
 * The bridge is intentionally dumb: it forwards every frame transparently and
 * never interprets CDP semantics. CDP command/response/event routing lives in
 * the `ExtensionCdpClient`; debugger attach/detach lives in the extension.
 *
 * v1 supports a single extension connection. A second extension socket replaces
 * the first (the first is closed and any open channel observers are notified of
 * disconnect).
 */

import { createLogger } from "@nodetool-ai/config";
import {
  parseExtensionFrame,
  type ExtensionFrame
} from "@nodetool-ai/automation-nodes/lib/extension-protocol";

const log = createLogger("nodetool.websocket.extension-bridge");

/**
 * The minimal `ws`-style socket surface the bridge needs. Satisfied by the
 * `@fastify/websocket` socket without importing its type here (keeps this module
 * free of a hard `ws` dependency and trivially fakeable in tests).
 */
export interface ExtensionSocket {
  send(data: string): void;
  close(): void;
  on(event: "message", cb: (raw: Buffer | ArrayBuffer | Buffer[]) => void): void;
  on(event: "close", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}

/**
 * The in-process channel an {@link ExtensionCdpClient} rides. Track A's client
 * is constructed with exactly this shape (or a WS URL). Frames are typed
 * {@link ExtensionFrame} objects in-process; the bridge serializes them to/from
 * JSON text on the wire to the extension.
 */
export interface ExtensionChannel {
  /** Send a frame host→ext. No-op (logged) if no extension is connected. */
  send(frame: ExtensionFrame): void;
  /**
   * Register a handler for inbound ext→host frames. Returns an unsubscribe fn.
   * The handler is also invoked with a synthetic `error` frame when the
   * extension socket disconnects, so the client can reject pending commands.
   */
  onMessage(cb: (frame: ExtensionFrame) => void): () => void;
  /** Close the channel: detaches this observer and closes the extension socket. */
  close(): void;
  /** Whether an extension socket is currently registered. */
  readonly connected: boolean;
}

/**
 * Module-level singleton that holds the current extension socket and fans
 * inbound frames out to in-process channel observers.
 */
export class ExtensionBridge {
  private socket: ExtensionSocket | null = null;
  private observers = new Set<(frame: ExtensionFrame) => void>();

  /**
   * Register a freshly-connected extension socket. Replaces any existing one
   * (v1 is single-connection): the previous socket is closed first.
   */
  registerSocket(socket: ExtensionSocket): void {
    if (this.socket && this.socket !== socket) {
      log.warn(
        "Extension already connected; replacing previous socket (v1 is single-connection)"
      );
      const prev = this.socket;
      this.socket = null;
      try {
        prev.close();
      } catch {
        /* previous socket already gone */
      }
    }

    this.socket = socket;
    log.info("Extension socket registered");

    socket.on("message", (raw) => {
      const text = bufferToString(raw);
      const frame = parseExtensionFrame(text);
      if (!frame) {
        log.warn("Dropping unparseable extension frame");
        return;
      }
      for (const observer of this.observers) {
        try {
          observer(frame);
        } catch (err) {
          log.error(
            "Extension channel observer threw",
            err instanceof Error ? err : new Error(String(err))
          );
        }
      }
    });

    socket.on("close", () => this.handleSocketGone(socket, "closed"));
    socket.on("error", (err) => {
      log.error("Extension socket error", err);
      this.handleSocketGone(socket, "error");
    });
  }

  /** Forget the given socket if it is still the active one. */
  clear(socket: ExtensionSocket): void {
    if (this.socket === socket) {
      this.handleSocketGone(socket, "cleared");
    }
  }

  /** True when an extension socket is currently registered. */
  get connected(): boolean {
    return this.socket !== null;
  }

  /**
   * Hand a host-process consumer an {@link ExtensionChannel} bridging to the
   * current (and any future) extension socket. The channel survives extension
   * reconnects; it observes the bridge, not a specific socket.
   */
  getChannel(): ExtensionChannel {
    // Arrow functions capture the bridge's `this` lexically (no `const self =
    // this` alias); the getter delegates to one so it reads live state too.
    const isConnected = (): boolean => this.socket !== null;
    return {
      send: (frame: ExtensionFrame): void => {
        const socket = this.socket;
        if (!socket) {
          log.warn(
            `No extension connected; dropping ${frame.kind} frame host→ext`
          );
          return;
        }
        try {
          socket.send(JSON.stringify(frame));
        } catch (err) {
          log.error(
            "Failed to send frame to extension",
            err instanceof Error ? err : new Error(String(err))
          );
        }
      },
      onMessage: (cb: (frame: ExtensionFrame) => void): (() => void) => {
        this.observers.add(cb);
        return () => {
          this.observers.delete(cb);
        };
      },
      close: (): void => {
        const socket = this.socket;
        if (socket) {
          this.socket = null;
          try {
            socket.close();
          } catch {
            /* socket already gone */
          }
        }
      },
      get connected(): boolean {
        return isConnected();
      }
    };
  }

  private handleSocketGone(socket: ExtensionSocket, reason: string): void {
    if (this.socket !== socket) return;
    this.socket = null;
    log.info(`Extension socket gone (${reason}); notifying observers`);
    const errorFrame: ExtensionFrame = {
      kind: "error",
      message: `Extension connection ${reason}`
    };
    for (const observer of this.observers) {
      try {
        observer(errorFrame);
      } catch (err) {
        log.error(
          "Extension channel observer threw on disconnect",
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }
}

function bufferToString(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return (raw as Buffer).toString("utf8");
}

/** The process-wide extension bridge singleton. */
export const extensionBridge = new ExtensionBridge();
