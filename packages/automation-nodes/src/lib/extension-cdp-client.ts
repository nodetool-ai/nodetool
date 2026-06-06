/**
 * WebSocket RPC layer that speaks the `/ws/extension` wire protocol and exposes
 * a synthetic `chrome-remote-interface`-shaped `client`.
 *
 * The agentic action loop (`CdpPage`) is transport-agnostic: it only ever uses
 * `client.Domain.command(params) => Promise<result>` and
 * `client.Domain.event(cb) => unsubscribe`. This module replicates exactly that
 * shape, but instead of talking to a local CDP socket it tunnels CDP commands
 * and events to/from the Chrome extension over a JSON side channel.
 *
 * Transport is pluggable: the constructor accepts either an in-process
 * {@link ExtensionChannel} (when the action loop runs inside the nodetool
 * server and rides the `ExtensionBridge`) or a WebSocket URL (when it runs in a
 * separate CLI process and connects to `/ws/extension` directly).
 *
 * See {@link file://./extension-protocol.ts} for the wire-protocol types.
 */

import type {
  CdpCommandFrame,
  CdpEventFrame,
  CdpResultFrame,
  ExtensionFrame,
  ExtensionHostToExtFrame
} from "./extension-protocol.js";
import { parseExtensionFrame } from "./extension-protocol.js";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.automation.extension-cdp");

/** Default `/ws/extension` endpoint used when only a URL transport is needed. */
const DEFAULT_WS_URL = "ws://localhost:7777/ws/extension";

/** Heartbeat interval. A missed pong by the next tick fails the connection. */
const HEARTBEAT_MS = 15_000;

/**
 * A bidirectional frame channel. The in-process bridge implements this directly;
 * the WS-URL transport is adapted to it internally.
 */
export interface ExtensionChannel {
  /** Send a host→ext frame. */
  send(frame: ExtensionHostToExtFrame): void;
  /** Register a handler for inbound ext→host frames. Idempotent per instance. */
  onMessage(handler: (frame: ExtensionFrame) => void): void;
  /** Tear down the channel. */
  close(): void;
}

/** Listener for forwarded CDP events, keyed by fully-qualified method name. */
type EventListener = (params: Record<string, unknown>) => void;

/**
 * A synthetic CDP domain member. One callable services both shapes `CdpPage`
 * uses: a command `(params?) => Promise<result>` and an event subscription
 * `(cb) => unsubscribe`. Overloads keep call sites typed; the runtime branches
 * on whether the argument is a function.
 */
interface DomainMember {
  (params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  (cb: (params: Record<string, unknown>) => void): () => void;
}

/** A synthetic CDP domain namespace (commands + events as own properties). */
type DomainNamespace = Record<string, DomainMember>;

/**
 * The synthetic `chrome-remote-interface` client surface consumed by
 * `CdpPage`. Each domain is a plain object whose own keys are command/event
 * functions; `CdpPage` only does property access + call, including dynamic
 * access like `client.Page[eventName](cb)`.
 */
export interface ExtensionCdpClientApi {
  Page: DomainNamespace;
  Runtime: DomainNamespace;
  Network: DomainNamespace;
  DOM: DomainNamespace;
  Input: DomainNamespace;
  Emulation: DomainNamespace;
  Console: DomainNamespace;
  Fetch: DomainNamespace;
  /** Close the underlying transport. Mirrors `chrome-remote-interface`'s `close`. */
  close(): Promise<void>;
}

interface PendingCommand {
  resolve: (result: Record<string, unknown>) => void;
  reject: (err: Error) => void;
}

export interface ExtensionCdpClientOptions {
  /** Logical session key routed in attach/detach control frames. */
  sessionId?: string;
}

/**
 * RPC bridge to the Chrome extension. Construct, then read {@link client}.
 *
 * Lifecycle: construct → {@link attach} → use {@link client} → {@link detach}
 * (or {@link close}). The transport opens lazily on first use for the WS-URL
 * form; the in-process channel is assumed already open.
 */
export class ExtensionCdpClient {
  private readonly channel: ExtensionChannel;
  private readonly sessionId?: string;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  /** method → set of listeners. CDP event names are fully qualified. */
  private readonly eventListeners = new Map<string, Set<EventListener>>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private awaitingPong = false;
  private closed = false;
  /** Resolves on the next `attached` control frame. */
  private attachResolve: (() => void) | null = null;
  private attachReject: ((err: Error) => void) | null = null;

  /** The synthetic `chrome-remote-interface`-shaped client. */
  readonly client: ExtensionCdpClientApi;

  /**
   * @param transport In-process {@link ExtensionChannel} or a `ws://` URL. When
   *   omitted, `NODETOOL_EXTENSION_WS_URL` (default {@link DEFAULT_WS_URL}) is used.
   */
  constructor(
    transport?: ExtensionChannel | string,
    options: ExtensionCdpClientOptions = {}
  ) {
    this.sessionId = options.sessionId;
    if (transport && typeof transport !== "string") {
      this.channel = transport;
    } else {
      const url =
        (typeof transport === "string" ? transport : undefined) ??
        process.env.NODETOOL_EXTENSION_WS_URL ??
        DEFAULT_WS_URL;
      this.channel = createWebSocketChannel(url);
    }
    this.channel.onMessage((frame) => this.handleFrame(frame));
    this.client = this.buildClient();
    this.startHeartbeat();
  }

  /**
   * Send an `attach` control frame and resolve once the extension acknowledges
   * with `attached`. Rejects on a fatal `error`/`detach` before acknowledgment.
   */
  attach(timeoutMs = 30_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.attachResolve = null;
        this.attachReject = null;
        log.warn(
          `Attach timed out after ${timeoutMs}ms — no 'attached' frame from ` +
            "the extension (is it installed and attached to a tab?)"
        );
        reject(new Error(`Timed out after ${timeoutMs}ms attaching to extension`));
      }, timeoutMs);
      this.attachResolve = () => {
        clearTimeout(timer);
        resolve();
      };
      this.attachReject = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      log.debug("Sending attach frame", { sessionId: this.sessionId });
      this.channel.send({ kind: "attach", sessionId: this.sessionId });
    });
  }

  /** Send a `detach` control frame. Does not close the transport. */
  detach(reason?: string): void {
    if (this.closed) return;
    this.channel.send({ kind: "detach", sessionId: this.sessionId, reason });
  }

  /**
   * Reject all pending commands, stop the heartbeat, and close the transport.
   * Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopHeartbeat();
    this.rejectAll(new Error("Extension CDP connection closed"));
    try {
      this.channel.close();
    } catch {
      // ignore
    }
  }

  // --- internal -----------------------------------------------------------

  private buildClient(): ExtensionCdpClientApi {
    return {
      Page: this.buildDomain("Page"),
      Runtime: this.buildDomain("Runtime"),
      Network: this.buildDomain("Network"),
      DOM: this.buildDomain("DOM"),
      Input: this.buildDomain("Input"),
      Emulation: this.buildDomain("Emulation"),
      Console: this.buildDomain("Console"),
      Fetch: this.buildDomain("Fetch"),
      close: () => this.close()
    };
  }

  /**
   * A domain namespace as a `Proxy` so that any member access yields a callable.
   * The callable is polymorphic: invoked with a single function argument it is
   * treated as an event subscription (CDP event names start lowercase and
   * `CdpPage` always passes a callback); otherwise it is a command and the
   * member name maps to `Domain.command`.
   */
  private buildDomain(domain: string): DomainNamespace {
    const target: DomainNamespace = {};
    return new Proxy(target, {
      get: (_t, prop): DomainMember | undefined => {
        if (typeof prop !== "string") return undefined;
        const member = prop;
        // One synthetic member services both shapes; the runtime arg decides.
        const fn = (arg?: unknown): unknown => {
          if (typeof arg === "function") {
            return this.subscribe(
              `${domain}.${member}`,
              arg as (params: Record<string, unknown>) => void
            );
          }
          return this.sendCommand(
            `${domain}.${member}`,
            arg as Record<string, unknown> | undefined
          );
        };
        return fn as DomainMember;
      }
    }) as DomainNamespace;
  }

  private sendCommand(
    method: string,
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (this.closed) {
      return Promise.reject(new Error("Extension CDP connection closed"));
    }
    const id = this.nextId++;
    const frame: CdpCommandFrame = {
      kind: "cdp",
      id,
      method,
      params,
      sessionId: this.sessionId
    };
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.channel.send(frame);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private subscribe(method: string, cb: EventListener): () => void {
    let set = this.eventListeners.get(method);
    if (!set) {
      set = new Set();
      this.eventListeners.set(method, set);
    }
    set.add(cb);
    return () => {
      const current = this.eventListeners.get(method);
      if (!current) return;
      current.delete(cb);
      if (current.size === 0) this.eventListeners.delete(method);
    };
  }

  private handleFrame(frame: ExtensionFrame): void {
    switch (frame.kind) {
      case "cdp_result":
        this.handleResult(frame);
        break;
      case "cdp_event":
        this.handleEvent(frame);
        break;
      case "attached":
        log.info("Extension attached", { tabId: frame.tabId });
        this.attachResolve?.();
        this.attachResolve = null;
        this.attachReject = null;
        break;
      case "pong":
        this.awaitingPong = false;
        break;
      case "detach": {
        const err = new Error(
          frame.reason
            ? `Extension detached: ${frame.reason}`
            : "Extension detached"
        );
        log.warn(`Extension detached: ${frame.reason ?? "(no reason)"}`, {
          pending: this.pending.size
        });
        this.attachReject?.(err);
        this.attachReject = null;
        this.attachResolve = null;
        this.rejectAll(err);
        break;
      }
      case "error": {
        const err = new Error(frame.message);
        log.error(`Extension reported a fatal error: ${frame.message}`, {
          pending: this.pending.size
        });
        this.attachReject?.(err);
        this.attachReject = null;
        this.attachResolve = null;
        this.rejectAll(err);
        break;
      }
      default:
        // media_chunk / media_end / asset_chunk are handled by higher layers,
        // not the command/event RPC core.
        break;
    }
  }

  private handleResult(frame: CdpResultFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);
    if (frame.error) {
      log.debug(`CDP command #${frame.id} failed: ${frame.error.message}`);
      pending.reject(new Error(frame.error.message));
    } else {
      pending.resolve(frame.result ?? {});
    }
  }

  private handleEvent(frame: CdpEventFrame): void {
    const listeners = this.eventListeners.get(frame.method);
    if (!listeners || listeners.size === 0) return;
    const params = frame.params ?? {};
    for (const listener of [...listeners]) {
      listener(params);
    }
  }

  private rejectAll(err: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(err);
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (this.closed) return;
      if (this.awaitingPong) {
        // No pong since the last tick: the channel is dead.
        log.warn("Heartbeat timed out — no pong; treating channel as dead", {
          pending: this.pending.size
        });
        const err = new Error("Extension CDP heartbeat timed out");
        this.stopHeartbeat();
        this.rejectAll(err);
        try {
          this.channel.close();
        } catch {
          // ignore
        }
        this.closed = true;
        return;
      }
      this.awaitingPong = true;
      try {
        this.channel.send({ kind: "ping", ts: Date.now() });
      } catch {
        // Surfaced on the next tick as a missed pong.
      }
    }, HEARTBEAT_MS);
    // Don't keep the process alive solely for the heartbeat.
    this.heartbeat.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.awaitingPong = false;
  }
}

/**
 * Adapt a `ws` WebSocket URL to the {@link ExtensionChannel} interface. The
 * socket is created eagerly; frames sent before `open` are buffered and flushed
 * once connected.
 */
function createWebSocketChannel(url: string): ExtensionChannel {
  let handler: ((frame: ExtensionFrame) => void) | null = null;
  const outbox: string[] = [];
  let open = false;
  let socket: import("ws").WebSocket | null = null;

  const ready = (async () => {
    const { WebSocket } = await import("ws");
    socket = new WebSocket(url);
    socket.on("open", () => {
      open = true;
      for (const raw of outbox.splice(0)) socket?.send(raw);
    });
    socket.on("message", (data: import("ws").RawData) => {
      const frame = parseExtensionFrame(data.toString());
      if (frame && handler) handler(frame);
    });
  })();

  return {
    send(frame: ExtensionHostToExtFrame): void {
      const raw = JSON.stringify(frame);
      if (open && socket) {
        socket.send(raw);
      } else {
        outbox.push(raw);
        void ready;
      }
    },
    onMessage(cb: (frame: ExtensionFrame) => void): void {
      handler = cb;
    },
    close(): void {
      void ready.then(() => socket?.close()).catch(() => undefined);
    }
  };
}
