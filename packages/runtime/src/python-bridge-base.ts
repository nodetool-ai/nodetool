/**
 * Transport-agnostic Python worker bridge base class.
 *
 * Holds all the protocol logic that is independent of how bytes move
 * between the JS runtime and the Python worker — pending-request bookkeeping,
 * message dispatch, discover/execute/cancel, provider RPC, and the shared
 * connection lifecycle. Concrete transports (stdio, WebSocket) subclass this
 * and implement the small set of transport hooks below.
 *
 * The wire protocol itself (msgpack-encoded `{type, request_id, data}` frames)
 * is shared; only framing/transport differs per subclass.
 */

import { getNodeBuiltinSync, safeProcessEnv } from "@nodetool-ai/config";

// The base only needs crypto (request IDs) and events (EventEmitter).
// Lazy-load so the module *graph* loads off-Node; instantiating a concrete
// bridge there throws at construction. Notably the base does NOT require
// child_process — that belongs to the stdio subclass only.
const nodeCrypto = getNodeBuiltinSync<typeof import("node:crypto")>("node:crypto");
const nodeEvents = getNodeBuiltinSync<typeof import("node:events")>("node:events");

function notOnNode(api: string): never {
  throw new Error(`${api} requires Node — PythonBridgeBase is Node-only`);
}
const randomUUID =
  nodeCrypto?.randomUUID ?? ((): string => notOnNode("node:crypto.randomUUID"));
// Re-export the EventEmitter type/class — falls back to a no-op so the
// module evaluates off-Node; consumers that instantiate the bridge will
// fail at construction time, not at module load.
class FallbackEmitter {
  on(_: string, __: (...args: unknown[]) => void): this {
    notOnNode("node:events.EventEmitter");
  }
  emit(_: string, ...__: unknown[]): boolean {
    notOnNode("node:events.EventEmitter");
  }
  removeAllListeners(): this {
    notOnNode("node:events.EventEmitter");
  }
}
// SAFETY: off-Node the fallback stands in for `EventEmitter` and throws from
// every member. It cannot implement the full class (`once`, `off`,
// `listenerCount`, the static helpers), which `PythonBridge extends
// EventEmitter` puts in the package's public contract.
const EventEmitter = (nodeEvents?.EventEmitter ??
  FallbackEmitter) as unknown as typeof import("node:events").EventEmitter;

import { createLogger } from "@nodetool-ai/config";

import {
  BRIDGE_PROTOCOL_VERSION,
  MIN_BRIDGE_PROTOCOL_VERSION,
  MIN_NODETOOL_CORE_VERSION
} from "@nodetool-ai/protocol/bridge-protocol";
import { validateBridgeFrame } from "@nodetool-ai/protocol";
import { isNumber } from "./type-predicates.js";

const log = createLogger("nodetool.runtime.python-bridge-base");

/**
 * Inbound bridge-frame validation gate (task B3). Every frame
 * `_handleMessage` dispatches is safe-parsed against its
 * `@nodetool-ai/protocol` schema first when this returns true; a frame that
 * fails gets a structured, non-fatal rejection (see
 * {@link PythonBridgeBase._handleInvalidFrame}) instead of silently
 * dispatching malformed data.
 *
 * Mirrors `shouldValidateOutboundWs` in
 * `packages/websocket/src/unified-websocket-runner.ts`: set
 * `NODETOOL_VALIDATE_BRIDGE_FRAMES=1`/`=0` to force on/off; unset, it
 * defaults to on under `NODE_ENV=test`/Vitest and off otherwise, so a worker
 * bug that emits a malformed frame fails the test that exercised it rather
 * than risking a perf hit validating every frame in production before the
 * mechanism has burned in.
 */
function shouldValidateBridgeFrames(): boolean {
  const override = safeProcessEnv()["NODETOOL_VALIDATE_BRIDGE_FRAMES"]?.trim();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  const env = safeProcessEnv();
  return env["NODE_ENV"] === "test" || Boolean(env["VITEST"]);
}
import type {
  PythonNodeMetadata,
  ExecuteResult,
  ExecuteInputBlobs,
  ExecuteIdentity,
  JobBoundary,
  ModelEvictRequest,
  ModelEvictResult,
  ProgressEvent,
  StreamCallback,
  PythonProviderInfo,
  PythonBridgeOptions,
  PythonWorkerLoadError,
  PythonWorkerStatus,
  UnifiedModelLike,
  ModelDownloadRequest,
  ModelDownloadUpdate,
  ComfyStatusInfo,
  ComfyEvent,
  ComfyExecuteOptions,
  ComfyExecuteResult,
  ComfyModelDownloadRequest,
  ComfyModelDownloadUpdate,
  ComfyModelInfo,
  PythonBridge
} from "./python-bridge-types.js";
import {
  comfyStatusInfoSchema,
  workerStatusSchema
} from "./python-bridge-types.js";

interface PendingRequest {
  resolve: (value: ExecuteResult) => void;
  reject: (error: Error) => void;
  onProgress?: (event: ProgressEvent) => void;
}

interface PendingStreamRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  onChunk: StreamCallback;
}

const DEFAULT_EXECUTE_TIMEOUT_MS = Number(
  safeProcessEnv()["NODETOOL_PYTHON_EXECUTE_TIMEOUT_MS"] ?? 12 * 60 * 1000
);
const DEFAULT_STATUS_TIMEOUT_MS = Number(
  safeProcessEnv()["NODETOOL_PYTHON_STATUS_TIMEOUT_MS"] ?? 30000
);
const DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS = Number(
  safeProcessEnv()["NODETOOL_PYTHON_DOWNLOAD_IDLE_TIMEOUT_MS"] ?? 5 * 60 * 1000
);

/**
 * Transport-agnostic Python bridge. Subclasses provide the transport via
 * {@link _openTransport} and {@link _send}, plus {@link close}. The optional
 * {@link _assertCanConnect} hook lets a transport refuse to connect (e.g. in
 * production).
 */
export abstract class PythonBridgeBase
  extends EventEmitter
  implements PythonBridge
{
  protected _nodeMetadata: PythonNodeMetadata[] = [];
  protected _loadErrors: PythonWorkerLoadError[] = [];
  protected _workerStatus: PythonWorkerStatus | null = null;
  protected _pending = new Map<string, PendingRequest>();
  protected _pendingStream = new Map<string, PendingStreamRequest>();
  /**
   * `comfy.execute` event callbacks, keyed by request id. Separate from the
   * pending maps because `comfy.event` frames are neither `progress` (wrong
   * shape) nor terminal — they stream the ComfyUI lifecycle while the same
   * request's terminal `result`/`error` settles via {@link _pendingStream}.
   */
  protected _pendingComfyEvents = new Map<
    string,
    (event: ComfyEvent) => void
  >();
  protected _options: PythonBridgeOptions;
  protected _connected = false;
  private _connectPromise: Promise<void> | null = null;

  constructor(options: PythonBridgeOptions = {}) {
    super();
    this._options = options;
  }

  /**
   * Requests still awaiting a worker reply (plain, streaming, and Comfy event
   * subscriptions). Exposed for leak accounting — a run that ended with
   * pending requests left a promise nothing will ever settle.
   */
  get pendingRequestCount(): number {
    return (
      this._pending.size +
      this._pendingStream.size +
      this._pendingComfyEvents.size
    );
  }

  // ── Transport hooks (implemented by subclasses) ─────────────────────

  /** Open the underlying transport and become connected. */
  protected abstract _openTransport(): Promise<void>;

  /** Encode + send a single protocol message over the transport. */
  protected abstract _send(msg: Record<string, unknown>): void;

  /** Tear down the transport and reject any pending requests. */
  abstract close(): void;

  /**
   * Optional guard invoked at the start of connect(). Throw to refuse.
   * Default is a no-op.
   */
  protected _assertCanConnect(): void {}

  // ── Connection lifecycle ───────────────────────────────────────────

  async connect(): Promise<void> {
    this._assertCanConnect();
    await this._openTransport();
    await this._discover();
    try {
      await this._getWorkerStatusWithTimeout();
    } catch (err) {
      log.warn(
        "Failed to fetch initial Python worker status; load_errors will be unavailable until next status fetch",
        err
      );
    }
  }

  ensureConnected(): Promise<void> {
    if (this._connected) return Promise.resolve();
    if (!this._connectPromise) {
      this._connectPromise = this.connect().then(
        () => {
          this._connectPromise = null;
        },
        (err) => {
          this._connectPromise = null;
          throw err;
        }
      );
    }
    return this._connectPromise;
  }

  // ── Message dispatch ────────────────────────────────────────────────

  protected _handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;
    const requestId = msg.request_id as string | null;

    if (shouldValidateBridgeFrames()) {
      const validation = validateBridgeFrame(msg);
      if (!validation.success) {
        this._handleInvalidFrame(type, requestId, validation.error);
        return;
      }
    }

    if (type === "discover" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending) {
        const data = msg.data as {
          nodes: PythonNodeMetadata[];
          protocol_version?: number;
          load_errors?: PythonWorkerLoadError[];
        };
        // Reject the discover promise only if the worker's protocol is below
        // the HARD FLOOR (a real wire break). Workers at or above the floor
        // but below BRIDGE_PROTOCOL_VERSION still connect — newer, additive
        // features are gated per-capability (e.g. supportsModelManagement),
        // so an older worker keeps running everything it understands. Workers
        // that pre-date the protocol_version field are treated as version 1
        // (the initial release) — same wire format, they just don't announce.
        const workerVersion =
          isNumber(data.protocol_version) ? data.protocol_version : 1;
        if (workerVersion < MIN_BRIDGE_PROTOCOL_VERSION) {
          this._pending.delete(requestId);
          pending.reject(
            new Error(
              `The installed nodetool-core speaks bridge protocol v${workerVersion}, ` +
                `but this Nodetool build requires at least v${MIN_BRIDGE_PROTOCOL_VERSION}. ` +
                `Please reinstall the Python environment from Settings → Packages ` +
                `(Reinstall environment) — it will fetch nodetool-core>=${MIN_NODETOOL_CORE_VERSION}.`
            )
          );
          return;
        }
        if (workerVersion > BRIDGE_PROTOCOL_VERSION) {
          // Forward-compat: a newer worker is expected to keep speaking
          // older protocols, so we proceed with a warning.
          this.emit(
            "stderr",
            `[python-bridge] Worker protocol v${workerVersion} is newer than ` +
              `JS runtime v${BRIDGE_PROTOCOL_VERSION}; assuming backward compatibility.\n`
          );
        }
        this._nodeMetadata = data.nodes;
        this._loadErrors = data.load_errors ?? [];
        pending.resolve({ outputs: {}, blobs: {} });
      }
    } else if (type === "result" && requestId) {
      const streamReq = this._pendingStream.get(requestId);
      if (streamReq) {
        this._pendingStream.delete(requestId);
        streamReq.resolve(msg.data as Record<string, unknown>);
        return;
      }
      const pending = this._pending.get(requestId);
      if (pending) {
        this._pending.delete(requestId);
        const data = msg.data as {
          outputs: Record<string, unknown>;
          blobs: Record<string, Uint8Array>;
        };
        pending.resolve({ outputs: data.outputs, blobs: data.blobs ?? {} });
      }
    } else if (type === "error" && requestId) {
      const streamReq = this._pendingStream.get(requestId);
      if (streamReq) {
        this._pendingStream.delete(requestId);
        const data = msg.data as { error: string; traceback?: string };
        const err = new Error(data.error);
        Reflect.set(err, "traceback", data.traceback);
        streamReq.reject(err);
        return;
      }
      const pending = this._pending.get(requestId);
      if (pending) {
        this._pending.delete(requestId);
        const data = msg.data as { error: string; traceback?: string };
        const err = new Error(data.error);
        Reflect.set(err, "traceback", data.traceback);
        pending.reject(err);
      }
    } else if (type === "chunk" && requestId) {
      const streamReq = this._pendingStream.get(requestId);
      if (streamReq) {
        streamReq.onChunk(msg.data as Record<string, unknown>);
      }
    } else if (type === "progress" && requestId) {
      const pending = this._pending.get(requestId);
      if (pending?.onProgress) {
        const data = msg.data as { progress: number; total: number };
        pending.onProgress({ request_id: requestId, ...data });
      }
      this.emit("progress", msg.data);
    } else if (type === "comfy.event" && requestId) {
      // Dedicated `comfy.execute` lifecycle frame. Distinct from `progress`
      // because ComfyUI's events don't fit `{progress,total,message}`. Without
      // this explicit case the frames would fall through and vanish silently.
      const onEvent = this._pendingComfyEvents.get(requestId);
      if (onEvent) {
        onEvent(msg.data as ComfyEvent);
      }
    }
  }

  /**
   * A frame decoded fine off the wire (valid msgpack) but failed its
   * `@nodetool-ai/protocol` schema — a worker-side protocol bug, not a
   * transport desync. Unlike an undecodable frame (bad length prefix,
   * corrupt msgpack — see each transport's `_failProtocol`), this does NOT
   * tear down the connection: only the request the malformed frame carries
   * a `request_id` for is failed, so a concurrent request already in flight
   * still settles normally.
   *
   * A frame with no (or non-string) `request_id` can't be attributed to any
   * pending request — logged and dropped, matching the dispatcher's
   * existing silent-ignore behavior for frame types/ids it doesn't
   * recognize.
   */
  private _handleInvalidFrame(
    type: string | undefined,
    requestId: string | null,
    reason: string | undefined
  ): void {
    log.warn(
      `Rejected malformed Python bridge frame (type=${type ?? "<unknown>"}, request_id=${
        requestId ?? "<none>"
      }): ${reason ?? "failed schema validation"}`
    );
    if (!requestId) return;

    const err = new Error(
      `Received malformed '${type ?? "<unknown>"}' frame from Python worker: ${
        reason ?? "failed schema validation"
      }`
    );

    const streamReq = this._pendingStream.get(requestId);
    if (streamReq) {
      this._pendingStream.delete(requestId);
      this._pendingComfyEvents.delete(requestId);
      streamReq.reject(err);
      return;
    }

    const pending = this._pending.get(requestId);
    if (pending) {
      this._pending.delete(requestId);
      pending.reject(err);
    }
  }

  protected _rejectAllPending(error: Error): void {
    for (const [, req] of this._pending) {
      req.reject(error);
    }
    this._pending.clear();
    for (const [, req] of this._pendingStream) {
      req.reject(error);
    }
    this._pendingStream.clear();
    this._pendingComfyEvents.clear();
  }

  // ── Discover ───────────────────────────────────────────────────────

  protected async _discover(): Promise<void> {
    const requestId = randomUUID();
    // Bound the discover RPC: _openTransport resolves as soon as the worker
    // signals readiness, so a worker that becomes READY but never answers
    // discover (wedged/hung post-ready init) would leave connect() pending
    // forever. Mirror _getWorkerStatusWithTimeout's timeout handling.
    const timeoutMs =
      this._options.statusTimeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      this._pending.set(requestId, {
        resolve: () => {
          if (timer) clearTimeout(timer);
          this._pending.delete(requestId);
          resolve();
        },
        reject: (err) => {
          if (timer) clearTimeout(timer);
          this._pending.delete(requestId);
          reject(err);
        }
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this._pending.delete(requestId);
          reject(
            new Error(`Python worker discover timed out after ${timeoutMs}ms.`)
          );
        }, timeoutMs);
      }
      try {
        this._send({ type: "discover", request_id: requestId, data: {} });
      } catch (err) {
        if (timer) clearTimeout(timer);
        this._pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Node execution ─────────────────────────────────────────────────

  /**
   * Snake-case the run identity onto the `execute` / `execute.stream` payload,
   * dropping fields the caller could not name so the worker sees an absent key
   * rather than a null it has to special-case.
   *
   * Sent unconditionally, not gated on {@link supportsJobLifecycle}: these are
   * extra dict entries, and a pre-v4 worker that reads `data["node_type"]`,
   * `["fields"]`, `["secrets"]` and `["blobs"]` never looks at them. Gating
   * them would only mean a worker that DOES understand them gets nothing
   * whenever its `worker.status` hasn't landed yet.
   */
  protected _identityPayload(
    identity: ExecuteIdentity | undefined
  ) {
    if (!identity) return {};
    const payload: Record<string, unknown> = {};
    if (identity.nodeId) payload.node_id = identity.nodeId;
    if (identity.jobId) payload.job_id = identity.jobId;
    if (identity.workflowId) payload.workflow_id = identity.workflowId;
    if (identity.userId) payload.user_id = identity.userId;
    if (identity.requiresVramGb != null) {
      payload.requires_vram_gb = identity.requiresVramGb;
    }
    return payload;
  }

  async execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void,
    identity?: ExecuteIdentity
  ): Promise<ExecuteResult> {
    const requestId = randomUUID();
    const timeoutMs =
      this._options.executeTimeoutMs ?? DEFAULT_EXECUTE_TIMEOUT_MS;

    log.debug("Python bridge execute dispatched", { nodeType, requestId });

    const executePromise = new Promise<ExecuteResult>((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject, onProgress });
      try {
        this._send({
          type: "execute",
          request_id: requestId,
          data: {
            node_type: nodeType,
            fields,
            secrets,
            blobs,
            ...this._identityPayload(identity)
          }
        });
      } catch (err) {
        this._pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    if (timeoutMs <= 0) {
      return executePromise;
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<ExecuteResult>((_, reject) => {
      timer = setTimeout(() => {
        if (!this._pending.has(requestId)) {
          return;
        }
        this._pending.delete(requestId);
        try {
          this.cancel(requestId);
        } catch {
          // Worker may already be gone; cancel is best-effort.
        }
        const stderrHint = this.getRecentStderrSummary(4);
        reject(
          new Error(
            `Python node "${nodeType}" timed out after ${timeoutMs}ms waiting for the worker.` +
              (stderrHint ? ` Recent stderr: ${stderrHint}` : "")
          )
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([executePromise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async *executeStream(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void,
    identity?: ExecuteIdentity
  ): AsyncGenerator<ExecuteResult> {
    const requestId = randomUUID();
    const chunks: ExecuteResult[] = [];
    let done = false;
    let error: Error | null = null;
    let finalResult: ExecuteResult | null = null;
    let emittedCount = 0;
    let resolveWait: (() => void) | null = null;

    if (onProgress) {
      this._pending.set(requestId, {
        resolve: () => undefined,
        reject: () => undefined,
        onProgress
      });
    }

    const onChunk = (chunk: Record<string, unknown>) => {
      chunks.push({
        outputs: (chunk.outputs as Record<string, unknown>) ?? {},
        blobs: (chunk.blobs as Record<string, Uint8Array>) ?? {}
      });
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const streamPromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, { resolve, reject, onChunk });
      }
    );

    streamPromise
      .then((result) => {
        finalResult = {
          outputs: (result.outputs as Record<string, unknown>) ?? {},
          blobs: (result.blobs as Record<string, Uint8Array>) ?? {}
        };
        done = true;
        this._pending.delete(requestId);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      })
      .catch((err) => {
        error = err;
        done = true;
        this._pending.delete(requestId);
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      });

    try {
      this._send({
        type: "execute.stream",
        request_id: requestId,
        data: {
          node_type: nodeType,
          fields,
          secrets,
          blobs,
          ...this._identityPayload(identity)
        }
      });

      while (true) {
        while (chunks.length > 0) {
          emittedCount += 1;
          yield chunks.shift()!;
        }
        if (done) break;
        if (error) throw error;
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
      if (error) throw error;
      if (emittedCount === 0 && finalResult) {
        yield finalResult;
      }
    } finally {
      // If the stream never reached its terminal frame (consumer abandoned the
      // generator via break/return, or the initial _send threw), the worker is
      // still producing output nobody reads. Cancel it and release pending
      // state so chunks[] stops growing and the entries don't leak.
      if (!done) {
        this._pending.delete(requestId);
        this._pendingStream.delete(requestId);
        try {
          this.cancel(requestId);
        } catch {
          // Worker may already be gone; cancel is best-effort.
        }
      }
    }
  }

  cancel(requestId: string): void {
    this._send({ type: "cancel", request_id: requestId, data: {} });
  }

  getNodeMetadata(): PythonNodeMetadata[] {
    return this._nodeMetadata;
  }

  getLoadErrors() {
    return this._loadErrors;
  }

  async getWorkerStatus() {
    const requestId = randomUUID();
    const result = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, {
          resolve,
          reject,
          onChunk: () => {}
        });
        try {
          this._send({
            type: "worker.status",
            request_id: requestId,
            data: {}
          });
        } catch (err) {
          this._pendingStream.delete(requestId);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );
    this._workerStatus = workerStatusSchema.parse(result);
    // A status reply that carries no `load_errors` leaves the ones `discover`
    // reported in place; only a reply that names the field replaces them.
    this._loadErrors =
      result["load_errors"] == null
        ? this._loadErrors
        : this._workerStatus.load_errors;
    return this._workerStatus;
  }

  /**
   * getWorkerStatus() guarded by a timeout so a silent worker cannot hang
   * connect() forever. On timeout we reject this single call and clean up its
   * pending entry + timer; connect()'s catch then logs and proceeds.
   *
   * Protected so transports that override connect() (e.g. the WebSocket
   * bridge, which wraps the whole RPC phase in its own timeout) can still
   * honor statusTimeoutMs for the status sub-call.
   */
  protected async _getWorkerStatusWithTimeout(): Promise<PythonWorkerStatus> {
    const timeoutMs =
      this._options.statusTimeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS;
    if (timeoutMs <= 0) {
      return this.getWorkerStatus();
    }

    const requestId = randomUUID();
    let timer: NodeJS.Timeout | undefined;

    const statusPromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, {
          resolve,
          reject,
          onChunk: () => {}
        });
        try {
          this._send({
            type: "worker.status",
            request_id: requestId,
            data: {}
          });
        } catch (err) {
          this._pendingStream.delete(requestId);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const timeoutPromise = new Promise<Record<string, unknown>>((_, reject) => {
      timer = setTimeout(() => {
        // Reject only this single call and drop its pending entry so a late
        // response is ignored rather than resolving a dead promise.
        this._pendingStream.delete(requestId);
        reject(
          new Error(`Python worker status timed out after ${timeoutMs}ms.`)
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([statusPromise, timeoutPromise]);
      this._workerStatus = workerStatusSchema.parse(result);
      // See getWorkerStatus: absence keeps the discover-reported errors.
      this._loadErrors =
        result["load_errors"] == null
          ? this._loadErrors
          : this._workerStatus.load_errors;
      return this._workerStatus;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  hasNodeType(nodeType: string): boolean {
    return this._nodeMetadata.some((n) => n.node_type === nodeType);
  }

  get isConnected(): boolean {
    return this._connected;
  }

  /**
   * Whether this bridge has a worker it can attempt to connect to. Gates
   * boot-time auto-connect — the server only eagerly calls ensureConnected()
   * when this returns true. The base default is true (a WebSocket bridge always
   * has a configured URL); the stdio subclass overrides it to report whether a
   * local Python interpreter was found.
   */
  isAvailable(): boolean {
    return true;
  }

  // ── Provider bridge methods ────────────────────────────────────────

  async listProviders(): Promise<PythonProviderInfo[]> {
    const result = await this._providerCall("provider.list", {});
    return (result as { providers: PythonProviderInfo[] }).providers;
  }

  async getProviderModels(
    providerId: string,
    modelType: string,
    secrets?: Record<string, string>
  ): Promise<Record<string, unknown>[]> {
    const result = await this._providerCall("provider.models", {
      provider: providerId,
      model_type: modelType,
      secrets: secrets ?? {}
    });
    return (result as { models: Record<string, unknown>[] }).models;
  }

  async providerGenerate(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result = await this._providerCall("provider.generate", {
      provider: providerId,
      messages,
      model,
      ...options
    });
    return (result as { message: Record<string, unknown> }).message;
  }

  async *providerStream(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const requestId = randomUUID();
    const chunks: Record<string, unknown>[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    const onChunk = (chunk: Record<string, unknown>) => {
      chunks.push(chunk);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const streamPromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, { resolve, reject, onChunk });
      }
    );

    streamPromise
      .then(() => {
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      })
      .catch((err) => {
        error = err;
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      });

    try {
      this._send({
        type: "provider.stream",
        request_id: requestId,
        data: { provider: providerId, messages, model, ...options }
      });

      while (true) {
        while (chunks.length > 0) yield chunks.shift()!;
        if (done) break;
        if (error) throw error;
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
      if (error) throw error;
    } finally {
      // Cancel the worker-side stream and drop pending state if the generator
      // is torn down before its terminal frame (consumer break/return, or a
      // throwing initial _send).
      if (!done) {
        this._pendingStream.delete(requestId);
        try {
          this.cancel(requestId);
        } catch {
          // Worker may already be gone; cancel is best-effort.
        }
      }
    }
  }

  async providerTextToImage(
    providerId: string,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array> {
    const result = await this._providerCall("provider.text_to_image", {
      provider: providerId,
      params,
      secrets: secrets ?? {}
    });
    return (result as { blobs: Record<string, Uint8Array> }).blobs.image;
  }

  async providerImageToImage(
    providerId: string,
    image: Uint8Array,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array> {
    const result = await this._providerCall("provider.image_to_image", {
      provider: providerId,
      image,
      params,
      secrets: secrets ?? {}
    });
    return (result as { blobs: Record<string, Uint8Array> }).blobs.image;
  }

  async *providerTTS(
    providerId: string,
    text: string,
    model: string,
    options?: Record<string, unknown>
  ): AsyncGenerator<Uint8Array> {
    const requestId = randomUUID();
    const chunks: Uint8Array[] = [];
    let done = false;
    let error: Error | null = null;
    let resolveWait: (() => void) | null = null;

    const onChunk = (chunk: Record<string, unknown>) => {
      const blobs = chunk.blobs as Record<string, Uint8Array> | undefined;
      if (blobs?.audio) chunks.push(blobs.audio);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const streamPromise = new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        this._pendingStream.set(requestId, { resolve, reject, onChunk });
      }
    );

    streamPromise
      .then(() => {
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      })
      .catch((err) => {
        error = err;
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      });

    try {
      this._send({
        type: "provider.tts",
        request_id: requestId,
        data: { provider: providerId, text, model, ...options }
      });

      while (true) {
        while (chunks.length > 0) yield chunks.shift()!;
        if (done) break;
        if (error) throw error;
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
      if (error) throw error;
    } finally {
      // Cancel the worker-side stream and drop pending state if the generator
      // is torn down before its terminal frame (consumer break/return, or a
      // throwing initial _send).
      if (!done) {
        this._pendingStream.delete(requestId);
        try {
          this.cancel(requestId);
        } catch {
          // Worker may already be gone; cancel is best-effort.
        }
      }
    }
  }

  async providerASR(
    providerId: string,
    audio: Uint8Array,
    model: string,
    options?: Record<string, unknown>
  ): Promise<import("./providers/types.js").ASRResult> {
    const result = await this._providerCall("provider.asr", {
      provider: providerId,
      audio,
      model,
      ...options
    });
    const r = result as {
      text: string;
      chunks?: Array<{ timestamp: [number, number]; text: string }>;
    };
    return {
      text: r.text,
      chunks: r.chunks
    };
  }

  async providerEmbedding(
    providerId: string,
    text: string | string[],
    model: string,
    dimensions?: number
  ): Promise<number[][]> {
    const result = await this._providerCall("provider.embedding", {
      provider: providerId,
      text,
      model,
      dimensions
    });
    return (result as { embeddings: number[][] }).embeddings;
  }

  // ── Worker model management (HuggingFace cache) ───────────────────────

  /**
   * List the models cached on the worker's HF_HOME. Cache-only (no network):
   * each entry is a UnifiedModel JSON with `downloaded` forced true. Requires a
   * worker that speaks bridge protocol v2 ({@link supportsModelManagement}).
   */
  async listCachedModels(): Promise<UnifiedModelLike[]> {
    const result = await this._providerCall("models.list_cached", {});
    return (result as { models: UnifiedModelLike[] }).models;
  }

  /**
   * Download a model onto the worker's persistent cache, streaming progress.
   *
   * The worker emits ordered `progress` frames (start → 0+ progress →
   * completed) followed by a terminal `result`. Each `progress` frame's `data`
   * is forwarded to {@link onProgress} verbatim; the promise resolves on the
   * terminal `result` and rejects on an `error` frame.
   *
   * The request is registered in BOTH pending maps: `_pending` (with
   * onProgress) so {@link _handleMessage} routes `progress` frames to the
   * callback, and `_pendingStream` for the terminal `result`/`error`. Both are
   * cleaned up on settle.
   *
   * Pass a stable `requestId` to make the download cancellable by a known key:
   * {@link cancelModelDownload}(requestId) then reaches this exact download.
   * Defaults to a random id when the caller has no need to cancel.
   *
   * Unlike a plain provider RPC, this download is settled defensively: an
   * inactivity timer (reset on every progress frame) rejects the promise if the
   * worker hangs mid-download, and {@link cancelModelDownload} rejects it
   * immediately. Either path clears BOTH pending maps so nothing leaks even when
   * no terminal `result`/`error` ever arrives.
   */
  async downloadModel(
    req: ModelDownloadRequest,
    onProgress: (update: ModelDownloadUpdate) => void,
    requestId: string = randomUUID()
  ): Promise<void> {
    // A blank token is not a credential: `Authorization: Bearer ` fails
    // differently than sending no header at all, and worse for a public repo.
    // Drop it here so every caller gets the rule, matching the worker's own
    // handling (nodetool-core#1008).
    const { token, ...rest } = req;
    const payload: Record<string, unknown> =
      typeof token === "string" && token.trim()
        ? { ...rest, token: token.trim() }
        : rest;
    return this._streamingDownload(
      "models.download",
      payload,
      // SAFETY: the worker's `models.download` progress frame carries exactly
      // these fields; unlike the comfy update shapes, `ModelDownloadUpdate`
      // declares no index signature, so the frame record does not overlap it.
      (u) => onProgress(u as unknown as ModelDownloadUpdate),
      requestId
    );
  }

  /**
   * Shared engine for the streaming-download RPCs (`models.download`,
   * `comfy.models.download`): a request that emits ordered `progress` frames
   * then a terminal `result`/`error`. Registers in BOTH pending maps and settles
   * defensively — an inactivity watchdog (reset on every progress frame) and
   * {@link cancel} both clear both maps so nothing leaks even if no terminal
   * frame ever arrives. See {@link downloadModel} for the full rationale.
   */
  protected _streamingDownload(
    type: string,
    data: Record<string, unknown>,
    onProgress: (update: Record<string, unknown>) => void,
    requestId: string
  ): Promise<void> {
    const idleTimeoutMs =
      this._options.downloadIdleTimeoutMs ?? DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this._pending.delete(requestId);
        this._pendingStream.delete(requestId);
        fn();
      };
      // Inactivity watchdog: a download making steady progress keeps resetting
      // the clock, but a worker that goes silent mid-download is cancelled and
      // rejected instead of leaking its pending entries forever.
      const armIdleTimer = () => {
        if (idleTimeoutMs <= 0) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            this.cancel(requestId);
          } catch {
            // Worker may already be gone; cancel is best-effort.
          }
          const stderrHint = this.getRecentStderrSummary(4);
          settle(() =>
            reject(
              new Error(
                `Download "${requestId}" stalled: no progress for ${idleTimeoutMs}ms.` +
                  (stderrHint ? ` Recent stderr: ${stderrHint}` : "")
              )
            )
          );
        }, idleTimeoutMs);
      };
      this._pending.set(requestId, {
        resolve: () => undefined,
        reject: () => undefined,
        onProgress: (event) => {
          armIdleTimer();
          onProgress({ ...event });
        }
      });
      this._pendingStream.set(requestId, {
        resolve: () => settle(resolve),
        reject: (err) => settle(() => reject(err)),
        onChunk: () => {}
      });
      armIdleTimer();
      try {
        this._send({ type, request_id: requestId, data });
      } catch (err) {
        settle(() =>
          reject(err instanceof Error ? err : new Error(String(err)))
        );
      }
    });
  }

  /**
   * Cancel an in-flight {@link downloadModel} by its request id. Sends the
   * cancel frame AND settles the local promise immediately by rejecting it —
   * the worker may never emit a terminal frame after a cancel (or may be hung),
   * so we cannot rely on `result`/`error` to clean up. Rejecting through the
   * pending-stream entry clears both pending maps; a no-op if the id is unknown.
   */
  cancelModelDownload(requestId: string): void {
    // Best-effort per the JSDoc: cancel() -> _send() throws when the transport
    // is down, but this must stay a no-op so a disconnected caller isn't hit
    // with 'Not connected' from a documented safe cancel.
    try {
      this.cancel(requestId);
    } catch {
      // Worker may already be gone; cancel is best-effort.
    }
    const streamReq = this._pendingStream.get(requestId);
    if (streamReq) {
      streamReq.reject(
        new Error(`Model download "${requestId}" was cancelled.`)
      );
    }
  }

  /** Delete a cached model from the worker's HF_HOME. Returns whether it existed. */
  async deleteCachedModel(repoId: string): Promise<boolean> {
    const result = await this._providerCall("models.delete", {
      repo_id: repoId
    });
    return Boolean((result as { deleted?: boolean }).deleted);
  }

  /**
   * Whether the attached worker speaks bridge protocol v2+ and therefore
   * supports the models.* RPC. This is the per-capability gate that lets an
   * older v1 worker connect normally (it sits above the hard floor) and simply
   * not expose worker model management — the Worker scope is hidden/disabled
   * rather than erroring. `models.*` was introduced in protocol v2, so the
   * floor here is a fixed 2, independent of BRIDGE_PROTOCOL_VERSION.
   */
  supportsModelManagement(): boolean {
    return (this._workerStatus?.protocol_version ?? 0) >= 2;
  }

  /**
   * Drop loaded model weights on the worker. The worker reclaims reactively on
   * its own thresholds; this is the path for what only the JS side knows — the
   * user switched workflows, another process wants the GPU, the worker is
   * idle. Introduced in protocol v4, so the floor here is a fixed 4.
   *
   * A pre-v4 worker would answer `Unknown message type`, so this resolves to an
   * empty eviction instead of sending: eviction is an optimization, and a host
   * asking to free memory on a worker that cannot should not have to branch.
   */
  async evictModels(req: ModelEvictRequest = {}): Promise<ModelEvictResult> {
    if (!this.supportsJobLifecycle()) {
      return { evicted: [] };
    }
    const result = await this._providerCall("models.evict", { ...req });
    const evictResult: ModelEvictResult = {
      // SAFETY: the worker answers `models.evict` with a list of model ids; a
      // reply that is not an array is treated as evicting nothing.
      evicted: Array.isArray(result.evicted) ? (result.evicted as string[]) : []
    };
    if (isNumber(result.freed_vram_gb)) {
      evictResult.freed_vram_gb = result.freed_vram_gb;
    }
    return evictResult;
  }

  // ── Run boundary (bridge protocol v4+) ─────────────────────────────────

  /**
   * Whether the attached worker speaks bridge protocol v4+ and therefore
   * understands `job.start` / `job.end` / `models.evict`. Per-capability soft
   * gate, like {@link supportsModelManagement}.
   *
   * This gates only the new message *types*. The identity fields v4 adds to
   * `execute` ride along regardless — see {@link _identityPayload}.
   */
  supportsJobLifecycle(): boolean {
    return (this._workerStatus?.protocol_version ?? 0) >= 4;
  }

  /**
   * Open a run boundary. Optional: the worker needs no `job.start` to
   * attribute an execution (every `execute` carries its own `job_id`), so this
   * exists as the one place to do a single reclaim pass per run instead of one
   * per node.
   */
  async jobStart(job: JobBoundary): Promise<void> {
    await this._jobBoundary("job.start", job);
  }

  /**
   * Close a run boundary: the worker's nodes for this job are retired and
   * their models become eligible for release. This is the caller
   * `release_nodes()` never had — without it the worker's model cache grows
   * across runs and is only ever trimmed reactively under memory pressure.
   *
   * Must fire on abnormal termination too (cancelled, client disconnected, run
   * abandoned), which is why `ExecutionSession` calls it from the same
   * `finally` that closes the bridge rather than off the success path.
   */
  async jobEnd(job: JobBoundary): Promise<void> {
    await this._jobBoundary("job.end", job);
  }

  /**
   * Send one boundary frame. Never rejects: a boundary is bookkeeping, and a
   * `job.end` that fails on a worker already tearing down must not turn a
   * finished run into a failed one. Failures are logged and swallowed.
   */
  private async _jobBoundary(
    type: "job.start" | "job.end",
    job: JobBoundary
  ): Promise<void> {
    if (!this.supportsJobLifecycle()) return;
    const data: Record<string, unknown> = { job_id: job.jobId };
    if (job.workflowId) data.workflow_id = job.workflowId;
    if (job.userId) data.user_id = job.userId;
    if (job.reason) data.reason = job.reason;
    try {
      await this._providerCall(type, data);
    } catch (err) {
      log.warn(`Python bridge ${type} failed`, {
        jobId: job.jobId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // ── ComfyUI proxy (bridge protocol v3+) ────────────────────────────────

  /**
   * Whether the attached worker fronts a ComfyUI server and speaks `comfy.*`.
   * Requires protocol v3+ (the `comfy.*` family) AND a `worker.status.comfy`
   * block reporting `enabled: true` — not every v3 worker has a ComfyUI, so
   * route ComfyUI jobs only where this is true. Per-capability soft gate, like
   * {@link supportsModelManagement}.
   */
  supportsComfy(): boolean {
    const status = this._workerStatus;
    return (
      (status?.protocol_version ?? 0) >= 3 && status?.comfy?.enabled === true
    );
  }

  /** The last-known `comfy` block from `worker.status`, or null. */
  getComfyStatus(): ComfyStatusInfo | null {
    return this._workerStatus?.comfy ?? null;
  }

  /**
   * Submit a ComfyUI workflow and drain its `comfy.event` lifecycle.
   *
   * `comfy.execute` streams `queued → queue → started/cached → executing →
   * progress → node_output → preview → completed/cancelled` as dedicated
   * `comfy.event` frames (routed to {@link onEvent}), then settles with a
   * terminal `result` (resolve) or `error` (reject) — `result` is always last.
   * The event callback is registered in {@link _pendingComfyEvents} and the
   * terminal frame in {@link _pendingStream}; both are cleared on settle.
   *
   * Cancellable via {@link cancelComfyExecute}(requestId): pass a stable
   * `requestId` (or reuse the returned default) to reach this exact run. Prefer
   * that over the bare {@link cancel} — a plain cancel frame does not settle the
   * local promise, so if the worker never emits a terminal frame the promise
   * would hang and the pending maps would leak.
   */
  comfyExecute(
    workflow: Record<string, unknown>,
    options: ComfyExecuteOptions = {},
    onEvent?: (event: ComfyEvent) => void,
    requestId: string = randomUUID()
  ): Promise<ComfyExecuteResult> {
    // The worker's field is `workflow`, not `prompt` — see the comfy.execute
    // request schema in nodetool-core's docs/comfy-proxy.md.
    const data: Record<string, unknown> = { workflow };
    if (options.blobs) data.blobs = options.blobs;
    if (options.previews) data.previews = true;
    if (options.includeTemp) data.include_temp = true;
    if (options.timeout != null) data.timeout = options.timeout;

    return new Promise<ComfyExecuteResult>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        this._pendingStream.delete(requestId);
        this._pendingComfyEvents.delete(requestId);
        fn();
      };
      if (onEvent) this._pendingComfyEvents.set(requestId, onEvent);
      this._pendingStream.set(requestId, {
        resolve: (result) =>
          settle(() => resolve(result as ComfyExecuteResult)),
        reject: (err) => settle(() => reject(err)),
        onChunk: () => {}
      });
      try {
        this._send({ type: "comfy.execute", request_id: requestId, data });
      } catch (err) {
        settle(() =>
          reject(err instanceof Error ? err : new Error(String(err)))
        );
      }
    });
  }

  /**
   * Cancel an in-flight {@link comfyExecute} by request id. Sends the cancel
   * frame AND settles the local promise by rejecting it — the worker may never
   * emit a terminal `result`/`error` after a cancel (or may be hung), so we
   * cannot rely on one to clean up. Rejecting through the pending-stream entry
   * runs comfyExecute's settle(), clearing BOTH `_pendingStream` and
   * `_pendingComfyEvents`. A no-op if the id is unknown. Mirrors
   * {@link cancelModelDownload}.
   */
  cancelComfyExecute(requestId: string): void {
    // Best-effort (see cancelModelDownload): swallow a 'Not connected' from
    // _send so a disconnected cancel stays the documented no-op.
    try {
      this.cancel(requestId);
    } catch {
      // Worker may already be gone; cancel is best-effort.
    }
    const streamReq = this._pendingStream.get(requestId);
    if (streamReq) {
      streamReq.reject(
        new Error(`ComfyUI execution "${requestId}" was cancelled.`)
      );
    }
  }

  async comfyQueue(): Promise<Record<string, unknown>> {
    return this._providerCall("comfy.queue", {});
  }

  async comfyInterrupt(): Promise<void> {
    await this._providerCall("comfy.interrupt", {});
  }

  async comfyCancelPrompt(promptId: string): Promise<void> {
    await this._providerCall("comfy.cancel", { prompt_id: promptId });
  }

  async comfyUpload(
    filename: string,
    bytes: Uint8Array,
    options: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    // The worker reads the payload from `data`, not `blob`.
    return this._providerCall("comfy.upload", {
      filename,
      data: bytes,
      ...options
    });
  }

  async comfyView(
    filename: string,
    options: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    return this._providerCall("comfy.view", { filename, ...options });
  }

  async comfyObjectInfo(): Promise<Record<string, unknown>> {
    // The worker wraps the catalog as `{object_info: {...}}`; unwrap so callers
    // get the catalog itself, as this method's contract promises.
    const result = await this._providerCall("comfy.object_info", {});
    return (
      (result.object_info as Record<string, unknown> | undefined) ?? result
    );
  }

  async comfySystemStats(): Promise<Record<string, unknown>> {
    return this._providerCall("comfy.system_stats", {});
  }

  async comfyStatus(): Promise<ComfyStatusInfo> {
    return comfyStatusInfoSchema.parse(
      await this._providerCall("comfy.status", {})
    );
  }

  async comfyFree(options: Record<string, unknown> = {}): Promise<void> {
    await this._providerCall("comfy.free", options);
  }

  async comfyModelsList(folder?: string): Promise<ComfyModelInfo[]> {
    const result = await this._providerCall("comfy.models.list", {});
    const models = (result as { models?: ComfyModelInfo[] }).models ?? [];
    // The worker always returns the whole volume — there is no `folder` filter
    // in the comfy.models.list request schema — so narrow it here.
    return folder ? models.filter((m) => m.folder === folder) : models;
  }

  async comfyModelsDownload(
    req: ComfyModelDownloadRequest,
    onProgress: (update: ComfyModelDownloadUpdate) => void,
    requestId: string = randomUUID()
  ): Promise<void> {
    return this._streamingDownload(
      "comfy.models.download",
      { ...req },
      (u) => onProgress(u as ComfyModelDownloadUpdate),
      requestId
    );
  }

  async comfyModelsDelete(folder: string, filename: string): Promise<boolean> {
    const result = await this._providerCall("comfy.models.delete", {
      folder,
      filename
    });
    return Boolean((result as { deleted?: boolean }).deleted);
  }

  protected async _providerCall(
    type: string,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const requestId = randomUUID();
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this._pendingStream.set(requestId, {
        resolve,
        reject,
        onChunk: () => {}
      });
      try {
        this._send({ type, request_id: requestId, data });
      } catch (err) {
        this._pendingStream.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ── Diagnostics ────────────────────────────────────────────────────

  /**
   * Recent worker stderr summary used to enrich timeout errors. Transports
   * that capture stderr (stdio) override this; the base returns null.
   */
  getRecentStderrSummary(_limit = 12): string | null {
    return null;
  }
}
