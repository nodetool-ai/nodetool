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

import { importNodeBuiltin } from "@nodetool-ai/config";

// The base only needs crypto (request IDs) and events (EventEmitter).
// Lazy-load so the module *graph* loads off-Node; instantiating a concrete
// bridge there throws at construction. Notably the base does NOT require
// child_process — that belongs to the stdio subclass only.
const nodeCrypto = await importNodeBuiltin<typeof import("node:crypto")>(
  "node:crypto"
);
const nodeEvents = await importNodeBuiltin<typeof import("node:events")>(
  "node:events"
);

function notOnNode(api: string): never {
  throw new Error(`${api} requires Node — PythonBridgeBase is Node-only`);
}
const randomUUID =
  nodeCrypto?.randomUUID ??
  ((): string => notOnNode("node:crypto.randomUUID"));
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
const EventEmitter = (nodeEvents?.EventEmitter ??
  FallbackEmitter) as unknown as typeof import("node:events").EventEmitter;

import { createLogger } from "@nodetool-ai/config";

import {
  BRIDGE_PROTOCOL_VERSION,
  MIN_BRIDGE_PROTOCOL_VERSION,
  MIN_NODETOOL_CORE_VERSION
} from "@nodetool-ai/protocol/bridge-protocol";

const log = createLogger("nodetool.runtime.python-bridge-base");
import type {
  PythonNodeMetadata,
  ExecuteResult,
  ExecuteInputBlobs,
  ProgressEvent,
  StreamCallback,
  PythonProviderInfo,
  PythonBridgeOptions,
  PythonWorkerLoadError,
  PythonWorkerStatus,
  UnifiedModelLike,
  ModelDownloadRequest,
  ModelDownloadUpdate,
  PythonBridge
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
  process.env["NODETOOL_PYTHON_EXECUTE_TIMEOUT_MS"] ?? 12 * 60 * 1000
);
const DEFAULT_STATUS_TIMEOUT_MS = Number(
  process.env["NODETOOL_PYTHON_STATUS_TIMEOUT_MS"] ?? 10000
);
const DEFAULT_DOWNLOAD_IDLE_TIMEOUT_MS = Number(
  process.env["NODETOOL_PYTHON_DOWNLOAD_IDLE_TIMEOUT_MS"] ?? 5 * 60 * 1000
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
  protected _options: PythonBridgeOptions;
  protected _connected = false;
  private _connectPromise: Promise<void> | null = null;

  constructor(options: PythonBridgeOptions = {}) {
    super();
    this._options = options;
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
          typeof data.protocol_version === "number"
            ? data.protocol_version
            : 1;
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
        (err as unknown as Record<string, unknown>).traceback = data.traceback;
        streamReq.reject(err);
        return;
      }
      const pending = this._pending.get(requestId);
      if (pending) {
        this._pending.delete(requestId);
        const data = msg.data as { error: string; traceback?: string };
        const err = new Error(data.error);
        (err as unknown as Record<string, unknown>).traceback = data.traceback;
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
  }

  // ── Discover ───────────────────────────────────────────────────────

  protected async _discover(): Promise<void> {
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      this._pending.set(requestId, {
        resolve: () => {
          this._pending.delete(requestId);
          resolve();
        },
        reject: (err) => {
          this._pending.delete(requestId);
          reject(err);
        }
      });
      this._send({ type: "discover", request_id: requestId, data: {} });
    });
  }

  // ── Node execution ─────────────────────────────────────────────────

  async execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
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
          data: { node_type: nodeType, fields, secrets, blobs }
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
    onProgress?: (event: ProgressEvent) => void
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

    const streamPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      this._pendingStream.set(requestId, { resolve, reject, onChunk });
    });

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

    this._send({
      type: "execute.stream",
      request_id: requestId,
      data: { node_type: nodeType, fields, secrets, blobs }
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
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      this._pendingStream.set(requestId, {
        resolve,
        reject,
        onChunk: () => {}
      });
      this._send({ type: "worker.status", request_id: requestId, data: {} });
    });
    this._workerStatus =
      result as unknown as PythonWorkerStatus;
    this._loadErrors = this._workerStatus.load_errors ?? this._loadErrors;
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
          new Error(
            `Python worker status timed out after ${timeoutMs}ms.`
          )
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([statusPromise, timeoutPromise]);
      this._workerStatus = result as unknown as PythonWorkerStatus;
      this._loadErrors = this._workerStatus.load_errors ?? this._loadErrors;
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
                `Model download "${requestId}" stalled: no progress for ${idleTimeoutMs}ms.` +
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
          onProgress(event as unknown as ModelDownloadUpdate);
        }
      });
      this._pendingStream.set(requestId, {
        resolve: () => settle(resolve),
        reject: (err) => settle(() => reject(err)),
        onChunk: () => {}
      });
      armIdleTimer();
      try {
        this._send({ type: "models.download", request_id: requestId, data: req });
      } catch (err) {
        settle(() => reject(err instanceof Error ? err : new Error(String(err))));
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
    this.cancel(requestId);
    const streamReq = this._pendingStream.get(requestId);
    if (streamReq) {
      streamReq.reject(
        new Error(`Model download "${requestId}" was cancelled.`)
      );
    }
  }

  /** Delete a cached model from the worker's HF_HOME. Returns whether it existed. */
  async deleteCachedModel(repoId: string): Promise<boolean> {
    const result = await this._providerCall("models.delete", { repo_id: repoId });
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
      this._send({ type, request_id: requestId, data });
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
