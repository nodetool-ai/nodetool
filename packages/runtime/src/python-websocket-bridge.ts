/**
 * Python worker bridge using a remote WebSocket transport.
 *
 * Unlike {@link PythonStdioBridge}, this bridge NEVER spawns a process — it
 * connects to an already-running worker (Docker, remote host, sidecar) by URL.
 * The worker lifecycle is owned externally; this bridge only owns the socket.
 *
 * Wire protocol: one WS BINARY message == exactly one msgpack frame. There is
 * NO 4-byte length prefix (that framing belongs to the stdio transport). The
 * worker sends frames via `ws.send(msgpack.packb(msg))`; we decode every
 * incoming binary message with msgpack.decode and feed it to the shared
 * {@link PythonBridgeBase._handleMessage}.
 *
 * Resilience: if the socket drops unexpectedly (worker restart, network blip),
 * the bridge rejects all in-flight requests, emits "exit", and then reconnects
 * with exponential backoff (1s, 2s, 4s, … capped at maxReconnectDelayMs).
 * After a successful reconnect it re-runs discover + worker.status and emits
 * "reconnected". An explicit {@link close} disables reconnect.
 */

import { pack, unpack } from "msgpackr";

import WebSocket from "ws";

import { createLogger } from "@nodetool-ai/config";

import { PythonBridgeBase } from "./python-bridge-base.js";

const log = createLogger("nodetool.runtime.python-websocket-bridge");

import type {
  PythonNodeMetadata,
  ExecuteResult,
  ExecuteInputBlobs,
  ProgressEvent,
  StreamCallback,
  PythonProviderInfo,
  PythonBridgeOptions,
  PythonWorkerLoadError,
  PythonWorkerStatus
} from "./python-bridge-types.js";

export type {
  PythonNodeMetadata,
  ExecuteResult,
  ExecuteInputBlobs,
  ProgressEvent,
  StreamCallback,
  PythonProviderInfo,
  PythonBridgeOptions,
  PythonWorkerLoadError,
  PythonWorkerStatus
};

/** Mirror of the stdio bridge's frame ceiling, used here for `maxPayload`. */
const MAX_BRIDGE_FRAME_SIZE = Number(
  process.env["NODETOOL_BRIDGE_MAX_FRAME_SIZE"] ?? 256 * 1024 * 1024
);

const DEFAULT_STARTUP_TIMEOUT_MS = 20000;
const DEFAULT_RECONNECT_RPC_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30000;
const INITIAL_RECONNECT_DELAY_MS = 1000;

export interface WebsocketPythonBridgeOptions extends PythonBridgeOptions {
  /**
   * Upper bound on the exponential reconnect backoff (ms). The delay starts at
   * 1s and doubles each attempt up to this cap. Default 30000.
   */
  maxReconnectDelayMs?: number;
}

/**
 * Attach permanent no-op 'error' sinks to a socket so a late 'error' event
 * cannot crash the host process.
 *
 * When a WebSocket is still CONNECTING, tearing it down (close/terminate)
 * makes it asynchronously emit a late 'error' ("WebSocket was closed before
 * the connection was established"), and the underlying TCP socket may emit its
 * own error too. If the only 'error' listener has been detached, Node
 * escalates an unhandled 'error' on the EventEmitter into a process crash.
 * Sinks on both the WebSocket and (if reachable) its TCP socket swallow them.
 */
function attachErrorSinks(ws: WebSocket): void {
  try {
    ws.on("error", () => {});
  } catch {
    /* best-effort */
  }
  // The raw TCP socket can emit its own error during a CONNECTING teardown.
  const rawSocket = (
    ws as unknown as { _socket?: { on?: (e: string, l: () => void) => void } }
  )._socket;
  if (rawSocket && typeof rawSocket.on === "function") {
    try {
      rawSocket.on("error", () => {});
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Terminate a socket crash-safely: attach error sinks (see
 * {@link attachErrorSinks}) before terminating so any late CONNECTING-state
 * error is swallowed rather than crashing the process.
 */
function crashSafeTerminate(ws: WebSocket): void {
  attachErrorSinks(ws);
  try {
    ws.terminate();
  } catch {
    /* best-effort cleanup */
  }
}

export class WebsocketPythonBridge extends PythonBridgeBase {
  private _ws: WebSocket | null = null;
  // Mutable so the bridge can be re-pointed at a different worker at runtime via
  // setTarget(); both are captured from options at construction as the default.
  private _wsUrl: string;
  private _workerToken: string | undefined;
  private readonly _maxReconnectDelayMs: number;
  private readonly _reconnectRpcTimeoutMs: number;
  private readonly _autoReconnect: boolean;

  /** Set once close() is called — permanently disables reconnect. */
  private _explicitlyClosed = false;
  /** Timer for a pending reconnect attempt, if any. */
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while a reconnect attempt is in flight (guards overlap). */
  private _reconnecting = false;
  /**
   * True once a connection has been fully established and announced (initial
   * connect() resolved, or a reconnect emitted "reconnected"). Gates the
   * "exit" emission so a socket that drops mid-reconnect — before any
   * "reconnected" was emitted for it — does not produce a duplicate "exit"
   * for consumers pairing exit/reconnected.
   */
  private _announcedConnected = false;
  /** Current backoff delay; doubles each failed attempt. */
  private _reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  /**
   * Set while an _openTransport handshake is in flight; invoking it rejects the
   * handshake and crash-safely tears down the CONNECTING socket. Lets close()
   * abort a connect that is still mid-handshake instead of waiting out the full
   * startup timeout.
   */
  private _abortHandshake: ((err: Error) => void) | null = null;
  /** Bound listeners for the active socket, removed before replacing it. */
  private _messageListener: ((data: WebSocket.RawData) => void) | null = null;
  private _closeListener: (() => void) | null = null;
  private _errorListener: ((err: Error) => void) | null = null;

  constructor(options: WebsocketPythonBridgeOptions = {}) {
    super(options);
    if (!options.wsUrl) {
      throw new Error(
        "WebsocketPythonBridge requires options.wsUrl — the remote worker WebSocket URL"
      );
    }
    this._wsUrl = options.wsUrl;
    // Shared-secret bearer token: when present, every handshake (connect AND
    // reconnect, both via _openSocket) carries `Authorization: Bearer <token>`.
    // An empty string is treated as unset (no header → worker accepts all).
    this._workerToken = options.workerToken || undefined;
    this._maxReconnectDelayMs =
      options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this._reconnectRpcTimeoutMs =
      options.reconnectRpcTimeoutMs ?? DEFAULT_RECONNECT_RPC_TIMEOUT_MS;
    // WebSocket transport reconnects by default — the worker lives elsewhere
    // and may restart independently. Set autoRestart: false to opt out.
    this._autoReconnect = options.autoRestart ?? true;
  }

  /** The remote worker WebSocket URL this bridge connects to. */
  get wsUrl(): string {
    return this._wsUrl;
  }

  /**
   * Re-point the bridge at a different worker without restarting the process.
   * Used by the worker-attach flow: attaching a provisioned GPU worker hands its
   * `{wsUrl, token}` here so the live bridge adopts it.
   *
   * No-op when `url` matches the current target (avoids a needless reconnect).
   * Otherwise the current socket is torn down — rejecting any in-flight requests
   * — the new url/token replace the instance fields, and a reconnect is forced
   * through the existing reconnect path so `_openSocket` uses the new values and
   * a successful re-point emits "reconnected" like any other reconnect. An empty
   * or missing token sends no `Authorization` header (worker accepts all).
   */
  setTarget(url: string, token?: string): void {
    if (url === this._wsUrl) return;

    this._wsUrl = url;
    // Match the constructor: an empty string means "no token" (no auth header).
    this._workerToken = token || undefined;

    // Cancel any pending/in-flight reconnect so the next attempt uses the new
    // target and backoff timing is deterministic.
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnecting = false;
    this._reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

    // Abort any in-flight handshake (CONNECTING socket) before tearing down.
    // _teardownSocket only acts on this._ws, but a handshake in progress lives
    // only in the _openTransport closure — without aborting it, its finishSuccess
    // would later set this._ws and clobber the new target's socket.
    if (this._abortHandshake) {
      const abort = this._abortHandshake;
      this._abortHandshake = null;
      abort(new Error("Python worker re-pointed via setTarget"));
    }

    // Tear down the current socket (detaches listeners → no spurious
    // _onUnexpectedClose) and reject in-flight requests, then drive a fresh
    // connect against the new target via the reconnect path.
    this._teardownSocket("Python worker re-pointed via setTarget");
    void this._attemptReconnect();
  }

  // ── Connection lifecycle ────────────────────────────────────────────

  /**
   * Connect to the remote worker. Overrides the base flow so the post-open RPC
   * phase (discover + worker.status) is bounded by a timeout: the startup
   * timeout only covers the TCP/WS handshake, so a worker that accepts the
   * socket but never answers discover would otherwise hang connect() forever.
   * On RPC timeout we tear down the half-open socket (crash-safe) and reject.
   */
  override async connect(): Promise<void> {
    this._assertCanConnect();
    await this._openTransport();
    try {
      await this._withRpcTimeout(this._runPostOpenRpc());
    } catch (err) {
      this._teardownSocket(
        err instanceof Error ? err.message : "Python worker connect failed"
      );
      throw err;
    }
    this._announcedConnected = true;
  }

  /**
   * Run discover + worker.status against the freshly-opened socket. discover
   * failures propagate (they mean the worker is unusable); a status failure is
   * tolerated — load_errors will simply be unavailable until the next fetch.
   */
  private async _runPostOpenRpc(): Promise<void> {
    await this._discover();
    try {
      // Use the status call bounded by statusTimeoutMs so a worker that
      // answers discover but hangs on status does not stall the RPC phase up
      // to the (larger) reconnectRpcTimeoutMs.
      await this._getWorkerStatusWithTimeout();
    } catch (err) {
      log.warn(
        "Failed to fetch worker status; load_errors will be unavailable until the next status fetch",
        err
      );
    }
  }

  /**
   * Race a post-open RPC promise against the configured RPC timeout. A worker
   * that accepts the socket but never answers (half-open: port up before
   * handlers are registered during a restart) is rejected rather than allowed
   * to hang. A timeout of 0 disables the bound.
   */
  private async _withRpcTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = this._reconnectRpcTimeoutMs;
    if (timeoutMs <= 0) {
      return promise;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Python worker did not answer discover/status within ${timeoutMs}ms (${this._wsUrl}).`
          )
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Detach long-lived listeners, crash-safely terminate the current socket,
   * clear connection state, and reject any requests left in flight (e.g. the
   * discover/status RPCs that timed out, or a user execute that slipped in
   * while the socket was briefly open). Idempotent and safe to call twice.
   */
  private _teardownSocket(reason: string): void {
    if (this._ws) {
      this._detachLongLivedListeners(this._ws);
      crashSafeTerminate(this._ws);
      this._ws = null;
    }
    // Cancel any reconnect armed by a mid-handshake close so a connect() the
    // caller saw fail cannot leave a background reconnect running behind it.
    // _attemptReconnect's catch re-schedules after this returns, so tearing the
    // timer down here does not interfere with the reconnect backoff loop.
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._connected = false;
    this._rejectAllPending(new Error(reason));
  }

  // ── Transport: open the remote socket ───────────────────────────────

  /**
   * Construct the `ws` WebSocket. The SINGLE place a socket is created — used by
   * both the initial connect and every reconnect (both run through
   * {@link _openTransport}), so the auth header is applied uniformly. When a
   * worker token is configured, send `Authorization: Bearer <token>` on the
   * handshake; otherwise send no header (worker accepts all).
   */
  private _openSocket(): WebSocket {
    return new WebSocket(this._wsUrl, {
      maxPayload: MAX_BRIDGE_FRAME_SIZE,
      headers: this._workerToken
        ? { Authorization: `Bearer ${this._workerToken}` }
        : undefined
    });
  }

  protected override async _openTransport(): Promise<void> {
    const startupTimeoutMs =
      this._options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = this._openSocket();
      ws.binaryType = "nodebuffer";

      const startupTimer = setTimeout(() => {
        finishError(
          new Error(
            `Python worker WebSocket did not open within ${startupTimeoutMs}ms (${this._wsUrl}).`
          )
        );
      }, startupTimeoutMs);

      // Listeners used only during the open handshake; replaced with the
      // long-lived listeners on success.
      const onOpen = () => finishSuccess();
      const onPreOpenError = (err: Error) => finishError(err);
      const onPreOpenClose = () =>
        finishError(
          new Error(
            `Python worker WebSocket closed before opening (${this._wsUrl}).`
          )
        );

      const cleanupHandshake = () => {
        clearTimeout(startupTimer);
        this._abortHandshake = null;
        ws.removeListener("open", onOpen);
        ws.removeListener("error", onPreOpenError);
        ws.removeListener("close", onPreOpenClose);
      };

      const finishError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupHandshake();
        // cleanupHandshake just removed the only 'error' listener. The socket
        // may still be CONNECTING, in which case terminate() emits a late
        // 'error' that would otherwise crash the process — terminate
        // crash-safely.
        crashSafeTerminate(ws);
        reject(err);
      };

      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        cleanupHandshake();
        this._ws = ws;
        this._connected = true;
        this._attachLongLivedListeners(ws);
        resolve();
      };

      // Let close() abort this handshake mid-flight instead of waiting out the
      // full startup timeout.
      this._abortHandshake = finishError;

      // close() may have already fired before we registered the aborter.
      if (this._explicitlyClosed) {
        finishError(
          new Error(`Python worker WebSocket closed before opening (${this._wsUrl}).`)
        );
        return;
      }

      ws.on("open", onOpen);
      ws.on("error", onPreOpenError);
      ws.on("close", onPreOpenClose);
    });
  }

  /**
   * Wire up the message/close/error handlers for an opened socket. Removed via
   * {@link _detachLongLivedListeners} before any reconnect so listeners never
   * leak across sockets.
   */
  private _attachLongLivedListeners(ws: WebSocket): void {
    this._messageListener = (data: WebSocket.RawData) => {
      try {
        const buf = this._toUint8Array(data);
        const msg = unpack(buf) as Record<string, unknown>;
        this._handleMessage(msg);
      } catch (err) {
        log.error(`Failed to decode WebSocket frame: ${err}`);
      }
    };
    this._closeListener = () => this._onUnexpectedClose();
    this._errorListener = (err: Error) => {
      log.warn(`Python worker WebSocket error: ${err.message}`);
      this._onUnexpectedClose();
    };

    ws.on("message", this._messageListener);
    ws.on("close", this._closeListener);
    ws.on("error", this._errorListener);
  }

  private _detachLongLivedListeners(ws: WebSocket): void {
    if (this._messageListener) ws.removeListener("message", this._messageListener);
    if (this._closeListener) ws.removeListener("close", this._closeListener);
    if (this._errorListener) ws.removeListener("error", this._errorListener);
    this._messageListener = null;
    this._closeListener = null;
    this._errorListener = null;
  }

  /** Normalize the various ws RawData shapes into a single Uint8Array. */
  private _toUint8Array(data: WebSocket.RawData): Uint8Array {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (Array.isArray(data)) return Buffer.concat(data);
    // Buffer is a Uint8Array subclass; msgpack.decode accepts it directly.
    return data as Uint8Array;
  }

  // ── Send ────────────────────────────────────────────────────────────

  protected override _send(msg: Record<string, unknown>): void {
    if (!this._ws || !this._connected) {
      throw new Error("Not connected to Python worker");
    }
    const payload = pack(msg);
    if (payload.length > MAX_BRIDGE_FRAME_SIZE) {
      throw new Error(
        `Outgoing Python bridge frame exceeds max size (${payload.length} > ${MAX_BRIDGE_FRAME_SIZE})`
      );
    }
    // Send as a single binary frame — no length prefix on WebSocket.
    this._ws.send(payload, { binary: true });
    // Every outbound frame to the remote worker is fresh activity. The cost
    // guard's reaper measures idle time from `last_activity_at`, and this bridge
    // is its designated heartbeat source: the server listens for "activity" and
    // touches the attached worker instance so an actively-executing worker is
    // never reaped as idle (see WorkerManager.getActiveWorker / touchWorkerInstance).
    this.emit("activity");
  }

  // ── Unexpected close → reject + reconnect ───────────────────────────

  private _onUnexpectedClose(): void {
    if (this._explicitlyClosed) return;
    // Guard re-entrancy: both 'close' and 'error' can fire for one drop.
    if (!this._connected) return;

    const reconnecting = this._reconnecting;
    this._connected = false;

    if (this._ws) {
      this._detachLongLivedListeners(this._ws);
      crashSafeTerminate(this._ws);
      this._ws = null;
    }

    // Reject in-flight requests in both cases. When this drop happens during
    // an in-flight reconnect (a fresh socket opened, then dropped while
    // discover/status were running), rejecting the pending discover promise is
    // what kicks _attemptReconnect's catch into owning teardown + backoff +
    // reschedule — so we deliberately do NOT reschedule here, avoiding a race
    // where two paths both grow/skip backoff non-deterministically.
    this._rejectAllPending(
      new Error("Python worker WebSocket closed unexpectedly")
    );

    if (reconnecting) {
      // The reconnect attempt owns re-announcement and the next backoff step.
      // Emitting "exit" here would produce a duplicate exit for a connection
      // that was never announced as reconnected.
      return;
    }

    // Only announce "exit" for the drop of a fully-established connection.
    if (this._announcedConnected) {
      this.emit("exit", null);
    }

    if (!this._autoReconnect) return;
    // Only auto-reconnect a connection that was fully established. A socket that
    // dropped mid-handshake (during the initial connect's discover/status phase,
    // before it was ever announced) is owned by connect()'s caller: the rejected
    // discover propagates out of connect(), and the caller decides whether to
    // retry. Arming a background reconnect here would race a caller-driven retry
    // into two live sockets. (Mirrors the _announcedConnected exit guard above.)
    if (!this._announcedConnected) return;
    this._scheduleReconnect();
  }

  private _scheduleReconnect(): void {
    if (this._explicitlyClosed || !this._autoReconnect) return;
    if (this._reconnectTimer || this._reconnecting) return;

    const delay = Math.min(this._reconnectDelayMs, this._maxReconnectDelayMs);
    log.info(
      `Scheduling Python worker WebSocket reconnect in ${delay}ms (${this._wsUrl}).`
    );
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      void this._attemptReconnect();
    }, delay);
  }

  private async _attemptReconnect(): Promise<void> {
    if (this._explicitlyClosed || this._reconnecting) return;
    this._reconnecting = true;
    try {
      await this._openTransport();
      // Re-run discovery + status against the (possibly new) worker so node
      // metadata and load errors reflect the current process. Bound the RPC
      // phase by a timeout: _openTransport only covers the handshake, so a
      // half-open worker (port up before handlers are registered during a
      // restart) that never answers discover would otherwise wedge the
      // reconnect loop forever with _reconnecting stuck true.
      await this._withRpcTimeout(this._runPostOpenRpc());
      // Success: reset backoff and announce.
      this._reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this._reconnecting = false;
      this._announcedConnected = true;
      log.info(`Python worker WebSocket reconnected (${this._wsUrl}).`);
      this.emit("reconnected");
    } catch (err) {
      // This catch is the single owner of teardown + backoff growth +
      // reschedule for a failed reconnect. _onUnexpectedClose deliberately
      // does NOT reschedule while _reconnecting is true, so backoff timing is
      // deterministic regardless of which event observed the drop first.
      this._reconnecting = false;
      log.warn(
        `Python worker WebSocket reconnect failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      // Tear down any half-open socket crash-safely (it may still be
      // CONNECTING, or open-but-silent on discover/status).
      this._teardownSocket(
        err instanceof Error ? err.message : "Python worker reconnect failed"
      );
      if (this._explicitlyClosed || !this._autoReconnect) return;
      this._reconnectDelayMs = Math.min(
        this._reconnectDelayMs * 2,
        this._maxReconnectDelayMs
      );
      this._scheduleReconnect();
    }
  }

  // ── Shutdown ────────────────────────────────────────────────────────

  override close(): void {
    this._explicitlyClosed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnecting = false;
    this._announcedConnected = false;
    // Abort an in-flight handshake (CONNECTING socket) so a pending connect()
    // rejects immediately instead of waiting out the startup timeout. The
    // aborter crash-safely terminates the CONNECTING socket.
    if (this._abortHandshake) {
      const abort = this._abortHandshake;
      this._abortHandshake = null;
      abort(
        new Error(`Python worker WebSocket closed before opening (${this._wsUrl}).`)
      );
    }
    if (this._ws) {
      this._detachLongLivedListeners(this._ws);
      // Detaching removed the error listener; close()/terminate() on a socket
      // that is still CONNECTING emits a late 'error' that would crash the
      // process. Attach permanent no-op error sinks first.
      const ws = this._ws;
      attachErrorSinks(ws);
      try {
        ws.close();
      } catch {
        /* best-effort cleanup */
      }
      try {
        ws.terminate();
      } catch {
        /* best-effort cleanup */
      }
      this._ws = null;
    }
    this._connected = false;
    if (this._pending.size > 0 || this._pendingStream.size > 0) {
      this._rejectAllPending(new Error("Python bridge closed"));
    }
  }
}
