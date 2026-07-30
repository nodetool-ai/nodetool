/**
 * Net-level TCP fault proxy (docs/RELIABILITY_ARCHITECTURE.md §9 "WS
 * transport" row; task D2). Sits in front of a real TCP server (the
 * ws-server driver's hermetic `e2e-server`) and forwards bytes verbatim in
 * both directions until a configured {@link WsProxyFaultConfig} tells one
 * direction's pipe to misbehave.
 *
 * This is a raw byte-level proxy, not a WebSocket-aware one — it never
 * terminates the WS handshake or decodes frame payloads. The one thing it
 * does parse is the RFC 6455 frame *header* (via {@link WsFrameCounter}), just
 * enough to find frame boundaries in the byte stream so a fault can be
 * anchored on "after N frames" rather than an arbitrary byte count or a
 * wall-clock delay (§9: "event-anchored, not time-anchored", mirroring
 * `drivers/anchors.ts`'s message-type anchors one layer down, at the wire
 * instead of the decoded message).
 *
 * `ws-proxy.ts` is the seam-facing half (process-wide "is a fault active"
 * state the `WsServerDriver` consults); this file is the mechanism.
 */
import { type Socket, type Server, connect, createServer } from "node:net";

/** The six `ws-*` fault kinds §9 names, mapped 1:1 onto `cli.ts`'s
 * `KNOWN_FAULT_TYPES` `ws-*` entries (`ws-faults.ts` does that mapping). */
export type WsProxyFaultKind =
  | "drop-no-fin"
  | "delay"
  | "reorder"
  | "fragment"
  | "stall-reads"
  | "abrupt-close";

export interface WsProxyFaultConfig {
  kind: WsProxyFaultKind;
  /**
   * Frame-count anchor: the fault arms on the first frame *after* this many
   * frames have already been forwarded in the fault's relevant direction
   * (server->client for every kind except `abrupt-close`, which counts
   * client->server frames — see the class doc). Default 0: arm immediately,
   * i.e. on the very first frame.
   */
  afterFrames?: number;
  /** `delay` only: fixed added latency per chunk, ms. Default 200. */
  delayMs?: number;
  /** `fragment` only: TCP-write chunk size in bytes. Default 4. */
  chunkBytes?: number;
}

interface ProxiedConnection {
  clientSocket: Socket;
  serverSocket: Socket;
}

/**
 * Incrementally counts complete WebSocket frames in a byte stream that may
 * arrive split across many `data` events. Parses only the frame header
 * (RFC 6455 §5.2 — 2-10 header bytes plus an optional 4-byte mask key) to
 * find each frame's total length; payload bytes are never inspected. Good
 * enough for frame-boundary anchoring — not a full WS parser (continuation
 * frames are counted as their own frame, which is fine: this harness's
 * fixture messages are always single-frame sends).
 */
export class WsFrameCounter {
  private buf: Buffer = Buffer.alloc(0);
  /** Number of complete frames seen so far. */
  count = 0;

  feed(chunk: Buffer): void {
    this.buf = this.buf.length > 0 ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const frameLength = WsFrameCounter.tryFrameLength(this.buf);
      if (frameLength === null || this.buf.length < frameLength) return;
      this.count += 1;
      this.buf = this.buf.subarray(frameLength);
    }
  }

  /** Returns the total byte length of the frame starting at `buf[0]`, or
   * `null` if `buf` doesn't yet hold a complete header. */
  static tryFrameLength(buf: Buffer): number | null {
    if (buf.length < 2) return null;
    const secondByte = buf[1];
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;
    if (payloadLength === 126) {
      if (buf.length < 4) return null;
      payloadLength = buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (buf.length < 10) return null;
      payloadLength = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }
    if (masked) offset += 4;
    return offset + payloadLength;
  }
}

/**
 * Writes `chunk` to `socket` in `chunkBytes`-sized pieces. Synchronous and
 * loop-based (not `setImmediate`-deferred) on purpose: this runs inside a
 * `data` event handler, and a deferred, multi-tick version can still be
 * mid-flight when the *next* `data` event fires on the same socket pair —
 * two concurrently-running fragmenters racing to `write()` the same
 * destination socket interleave their pieces and corrupt the byte stream.
 * A single synchronous loop can't race anything: it either fully finishes
 * before the next `data` event is even dispatched, or the destination socket
 * is already destroyed (checked per piece) and the rest is silently dropped.
 */
function writeFragmented(socket: Socket, chunk: Buffer, chunkBytes: number): void {
  const step = Math.max(1, chunkBytes);
  for (let offset = 0; offset < chunk.length; offset += step) {
    if (socket.destroyed) return;
    socket.write(chunk.subarray(offset, Math.min(offset + step, chunk.length)));
  }
}

type Direction = "client-to-server" | "server-to-client";

/** Which direction a given fault kind's frame-count anchor applies to.
 * `abrupt-close` models "close hard right after the run_job command is
 * forwarded" (§9) — every journey's first `client_to_server` frame is the
 * `run_job` command envelope (`ws-server.ts`'s driver always sends `run`
 * first), so counting client->server frames with the default `afterFrames:
 * 0` closes right after that command reaches the server. Every other kind
 * targets server->client frames — the direction a client's parser actually
 * has to tolerate misbehaving. */
function relevantDirection(kind: WsProxyFaultKind): Direction {
  return kind === "abrupt-close" ? "client-to-server" : "server-to-client";
}

/**
 * One TCP proxy instance in front of one `(targetHost, targetPort)`. Every
 * accepted client connection gets its own pair of pipes (client->server,
 * server->client); `fault` (settable any time via {@link setFault}) governs
 * both pipes of every connection accepted while it's set — matching how a
 * real network fault (a flaky link, a saturated NAT table) affects whatever
 * is talking over it, not just connections opened after the fault started.
 */
export class WsFaultProxy {
  private server: Server | null = null;
  private readonly connections = new Set<ProxiedConnection>();
  private port = 0;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
    private fault: WsProxyFaultConfig | null = null
  ) {}

  setFault(fault: WsProxyFaultConfig | null): void {
    this.fault = fault;
  }

  async listen(): Promise<number> {
    this.server = createServer((clientSocket) => this.handleConnection(clientSocket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    this.port = typeof address === "object" && address !== null ? address.port : 0;
    return this.port;
  }

  getPort(): number {
    return this.port;
  }

  async close(): Promise<void> {
    for (const conn of this.connections) {
      conn.clientSocket.destroy();
      conn.serverSocket.destroy();
    }
    this.connections.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  /**
   * Forces every currently-open connection's pair dead — used by the
   * client-reconnect-mid-run journey to sever a client mid-run outside the
   * declarative fault matrix. `"reset"` destroys both sockets (an ordinary
   * TCP RST/FIN teardown); `"half-open"` stops all forwarding and pauses
   * both sockets' reads without closing either — the same net-level black
   * hole `drop-no-fin` produces, just triggered on demand instead of after
   * a frame count.
   */
  killConnections(mode: "reset" | "half-open"): void {
    for (const conn of this.connections) {
      if (mode === "reset") {
        conn.clientSocket.destroy();
        conn.serverSocket.destroy();
      } else {
        conn.clientSocket.pause();
        conn.serverSocket.pause();
      }
    }
  }

  private handleConnection(clientSocket: Socket): void {
    const serverSocket = connect(this.targetPort, this.targetHost);
    const entry: ProxiedConnection = { clientSocket, serverSocket };
    this.connections.add(entry);
    clientSocket.setNoDelay(true);
    serverSocket.setNoDelay(true);

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      this.connections.delete(entry);
      clientSocket.destroy();
      serverSocket.destroy();
    };
    clientSocket.on("error", cleanup);
    serverSocket.on("error", cleanup);
    clientSocket.on("close", cleanup);
    serverSocket.on("close", cleanup);

    clientSocket.on("data", this.makePipe(clientSocket, serverSocket, "client-to-server"));
    serverSocket.on("data", this.makePipe(serverSocket, clientSocket, "server-to-client"));
  }

  /** Builds the `data`-event handler for one direction of one connection.
   * Per-pipe state (the frame counter, the one-shot flags below) lives in
   * this closure, not on the proxy or the connection entry, so concurrent
   * connections and the two directions of the same connection never share
   * counters. */
  private makePipe(from: Socket, to: Socket, direction: Direction): (chunk: Buffer) => void {
    const counter = new WsFrameCounter();
    let blackHoled = false;
    let reorderPending: Buffer | null = null;
    // The very first bytes in either direction are the plain-text HTTP
    // Upgrade request/response, not a WS frame at all — `WsFrameCounter`'s
    // frame-header parser applied to arbitrary HTTP header bytes produces a
    // garbage "frame length" that usually resolves within the header block
    // itself, silently arming a fault (and, for `drop-no-fin`/`stall-reads`,
    // swallowing the 101 response before the client ever sees it) during
    // the handshake instead of the application traffic the fault is meant to
    // target. Every fault kind is a no-op (plain pass-through, no counting)
    // until this direction's own handshake terminator (`\r\n\r\n`) has been
    // seen; a connection whose handshake never terminates within 16 KiB
    // (never happens for this harness's own client/server) falls back to
    // fault-active rather than hanging the scan forever.
    let handshakeDone = false;
    let handshakeScan: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    return (chunk: Buffer): void => {
      if (blackHoled) return;

      if (!handshakeDone) {
        to.write(chunk);
        handshakeScan =
          handshakeScan.length > 0 ? Buffer.concat([handshakeScan, chunk]) : chunk;
        if (handshakeScan.includes("\r\n\r\n") || handshakeScan.length > 16384) {
          handshakeDone = true;
        }
        return;
      }

      const fault = this.fault;
      if (!fault || direction !== relevantDirection(fault.kind)) {
        to.write(chunk);
        return;
      }

      counter.feed(chunk);
      const armed = counter.count > (fault.afterFrames ?? 0);

      switch (fault.kind) {
        case "drop-no-fin":
          // Half-open: once armed, never forward and never close either
          // socket — a live-looking connection nothing moves on.
          if (armed) {
            blackHoled = true;
            return;
          }
          to.write(chunk);
          return;

        case "abrupt-close":
          // Forward the frame that arms the fault (the run_job command
          // itself must actually reach the server), then hang up hard —
          // no FIN, no close frame — right after.
          to.write(chunk);
          if (armed) {
            blackHoled = true;
            from.destroy();
            to.destroy();
          }
          return;

        case "stall-reads":
          // Stop reading from `from` (the server side) once armed — its
          // socket buffer, then its own send buffer, backs up because
          // nothing drains it, which is the drain-timeout path's trigger.
          // The client-facing socket is untouched: any already-forwarded
          // bytes remain delivered.
          if (armed) {
            blackHoled = true;
            from.pause();
            return;
          }
          to.write(chunk);
          return;

        case "delay":
          setTimeout(
            () => {
              if (!to.destroyed) to.write(chunk);
            },
            fault.delayMs ?? 200
          );
          return;

        case "fragment":
          writeFragmented(to, chunk, fault.chunkBytes ?? 4);
          return;

        case "reorder":
          // Swap exactly one adjacent pair once armed, then resume in-order
          // forwarding — enough to exercise a client's/server's tolerance
          // for a single out-of-order delivery without permanently
          // reordering the whole stream.
          if (!armed) {
            to.write(chunk);
            return;
          }
          if (reorderPending === null) {
            reorderPending = chunk;
            return;
          }
          // Synchronous double-write, not `setImmediate`-deferred — same
          // interleaving hazard `writeFragmented` has: a deferred write can
          // still be pending when the next `data` event's own writes land,
          // putting bytes on `to` out of the order this fault itself
          // intended.
          {
            const previous = reorderPending;
            reorderPending = null;
            to.write(chunk);
            to.write(previous);
          }
          return;
      }
    };
  }
}
