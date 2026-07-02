import { EventEmitter } from "node:events";

import type { ASRResult } from "./providers/types.js";

export interface NodeMetadataProperty {
  name: string;
  type: { type: string; type_args?: Array<{ type: string }> };
  default?: unknown;
  description?: string;
}

export interface NodeMetadataOutput {
  name: string;
  type: { type: string; type_args?: Array<{ type: string }> };
}

export interface PythonNodeMetadata {
  node_type: string;
  title: string;
  description: string;
  properties: NodeMetadataProperty[];
  outputs: NodeMetadataOutput[];
  required_settings: string[];
  recommended_models?: unknown[];
  is_streaming_output?: boolean;
  is_streaming_input?: boolean;
  is_dynamic?: boolean;
}

export interface ExecuteResult {
  outputs: Record<string, unknown>;
  blobs: Record<string, Uint8Array>;
}

export type ExecuteInputBlobs = Record<string, Uint8Array | Uint8Array[]>;

export interface ProgressEvent {
  request_id: string;
  progress: number;
  total: number;
}

/**
 * Structural subset of the `@nodetool-ai/protocol` UnifiedModel that the bridge
 * passes through verbatim from the worker's `models.list_cached` response.
 *
 * Typed structurally (rather than importing UnifiedModel) so the runtime base
 * does not drag `@nodetool-ai/protocol`'s heavier graph into its dependency
 * graph — the worker normalizes the model JSON; the bridge only forwards it.
 */
export type UnifiedModelLike = Record<string, unknown> & {
  id: string;
  name: string;
  repo_id?: string | null;
  downloaded?: boolean | null;
};

/** Request payload for the worker `models.download` RPC. */
export interface ModelDownloadRequest {
  repo_id: string;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  path?: string | null;
  model_type?: string | null;
}

/**
 * A `models.download` progress frame. Mirrors the worker's progress `data`
 * field AND the local `DownloadUpdate` the web ModelDownloadStore already
 * consumes, so the same JSON sink works for local and worker downloads.
 */
export interface ModelDownloadUpdate {
  status: "start" | "progress" | "completed" | "error" | "cancelled";
  repo_id: string;
  path: string | null;
  model_type: string | null;
  downloaded_bytes: number;
  total_bytes: number;
  downloaded_files: number;
  current_files: string[];
  total_files: number;
  error?: string;
}

// ── ComfyUI proxy (bridge protocol v3+) ───────────────────────────────────
//
// The worker can front a co-located, loopback-only ComfyUI server and proxy it
// over the bridge as `comfy.*` messages. All shapes below mirror the worker's
// `comfy_handler.py`; the authoritative field-level reference is
// `docs/comfy-proxy.md` in nodetool-core. Events and results carry an index
// signature so worker-side additions pass through untyped rather than being
// dropped.

/**
 * The `comfy` block on `worker.status` (protocol v3+). Present only when the
 * worker fronts a ComfyUI server; `enabled` is the routing signal — only send
 * `comfy.*` to a worker whose last status reported `enabled: true`.
 */
export interface ComfyStatusInfo {
  enabled: boolean;
  /** Loopback URL the worker proxies to (e.g. http://127.0.0.1:8188). */
  url?: string;
  /** Whether the worker could reach ComfyUI at last check (comfy.status only). */
  reachable?: boolean;
}

/**
 * A `comfy.event` frame's `data`. `comfy.execute` streams its lifecycle as
 * these dedicated frames — NOT as `progress` — because ComfyUI's events don't
 * fit the `{progress,total,message}` shape. `event` is the discriminator, in
 * emission order: queued → queue → started/cached → executing → progress →
 * node_output → preview → completed/cancelled.
 */
export interface ComfyEvent {
  event:
    | "queued"
    | "queue"
    | "started"
    | "cached"
    | "executing"
    | "progress"
    | "node_output"
    | "preview"
    | "completed"
    | "cancelled";
  prompt_id?: string;
  /** `executing`/`progress`/`node_output`/`preview`: the ComfyUI node id. */
  node?: string | null;
  /** `progress`: current step and total for the running node. */
  value?: number;
  max?: number;
  /** `queue`: remaining queued prompts. */
  queue_remaining?: number;
  /** `cached`: node ids served from cache. */
  nodes?: string[];
  /** `node_output`: the raw ComfyUI output payload for that node. */
  output?: Record<string, unknown>;
  /** `preview`: raw preview image bytes (only when `previews: true`). */
  blob?: Uint8Array;
  mime_type?: string;
  [key: string]: unknown;
}

/** Options for a {@link PythonBridge.comfyExecute} call. */
export interface ComfyExecuteOptions {
  /**
   * Input files referenced from the workflow JSON via `"blob:<key>"`
   * placeholders. The worker uploads them to ComfyUI and splices in the real
   * filename before submitting.
   */
  blobs?: Record<string, Uint8Array>;
  /** Request `preview` events (extra bandwidth); off by default. */
  previews?: boolean;
  /** Max seconds to wait for the ComfyUI run before the worker gives up. */
  timeout?: number;
}

/** Terminal `result.data` of a {@link PythonBridge.comfyExecute} call. */
export interface ComfyExecuteResult {
  prompt_id?: string;
  outputs?: Record<string, unknown>;
  blobs?: Record<string, Uint8Array>;
  [key: string]: unknown;
}

/** Request payload for {@link PythonBridge.comfyModelsDownload}. */
export interface ComfyModelDownloadRequest {
  /** Raw ComfyUI folder ("checkpoints", "loras", …) or a nodetool type string. */
  folder: string;
  /** Direct download URL, mutually exclusive with `repo_id`. */
  url?: string;
  /** HuggingFace repo id, mutually exclusive with `url`. */
  repo_id?: string;
  filename?: string;
  [key: string]: unknown;
}

/** A `progress` frame from {@link PythonBridge.comfyModelsDownload}. */
export interface ComfyModelDownloadUpdate {
  status: "start" | "progress" | "completed" | "error" | "cancelled";
  downloaded_bytes: number;
  total_bytes: number;
  error?: string;
  [key: string]: unknown;
}

/** One file entry from {@link PythonBridge.comfyModelsList}. */
export interface ComfyModelInfo {
  folder: string;
  filename: string;
  size?: number;
  [key: string]: unknown;
}

export interface PythonBridgeOptions {
  wsUrl?: string;
  /**
   * Shared-secret bearer token for the remote WebSocket worker. When set, the
   * WebSocket bridge sends an `Authorization: Bearer <token>` header on every
   * handshake (initial connect AND each reconnect); the worker rejects the
   * handshake with HTTP 401 if it doesn't match. When unset/empty, no header is
   * sent and the worker accepts all connections (local/dev backward compat).
   * Threaded from `NODETOOL_WORKER_TOKEN` by {@link createPythonBridge}.
   */
  workerToken?: string;
  pythonPath?: string;
  workerArgs?: string[];
  autoRestart?: boolean;
  startupTimeoutMs?: number;
  /** Max time to wait for a single node execute (0 = no timeout). */
  executeTimeoutMs?: number;
  /**
   * Max time to wait for the initial worker.status fetch during connect()
   * (0 = no timeout). Guards against a silent worker hanging connect()
   * forever. Default ~10000ms.
   */
  statusTimeoutMs?: number;
  /**
   * Max time to wait for the post-open RPC phase (discover + worker.status)
   * during connect() and reconnect on the WebSocket bridge (0 = no timeout).
   * The startup timeout only covers the TCP/WS handshake, not the RPC phase,
   * so a worker that accepts the socket but never answers discover would
   * otherwise wedge the reconnect loop forever. Default ~20000ms.
   */
  reconnectRpcTimeoutMs?: number;
  /**
   * Max time a model download may go without any progress frame before it is
   * considered stalled, cancelled, and rejected (0 = no timeout). This is an
   * inactivity timeout — the clock resets on every progress frame — so a large
   * but steadily-progressing download is never killed, while a worker that
   * hangs mid-download cannot leak its pending entries forever. Default ~5min.
   */
  downloadIdleTimeoutMs?: number;
}

export type StreamCallback = (chunk: Record<string, unknown>) => void;

export interface PythonProviderInfo {
  id: string;
  capabilities: string[];
  required_secrets: string[];
}

export interface PythonWorkerLoadError {
  module: string;
  phase: string;
  error: string;
  error_type?: string;
}

export interface PythonWorkerStatus {
  protocol_version: number;
  node_count: number;
  provider_count: number;
  namespaces: string[];
  load_errors: PythonWorkerLoadError[];
  transport: string;
  max_frame_size: number;
  /**
   * ComfyUI proxy status (protocol v3+). Present only when the worker fronts a
   * ComfyUI server; used to route `comfy.*` requests (see {@link ComfyStatusInfo}).
   */
  comfy?: ComfyStatusInfo;
}

/**
 * Transport-agnostic public surface of a Python worker bridge. Both the
 * concrete {@link PythonBridgeBase} subclasses and the {@link SwappableBridge}
 * wrapper satisfy this, so consumers hold one stable reference whose behavior
 * follows the active worker.
 *
 * Extends EventEmitter so `on`/`off`/`once`/`emit`/`removeAllListeners` are part
 * of the contract. The signatures here are copied verbatim from
 * `PythonBridgeBase` (the source of truth); `setTarget` is intentionally
 * excluded — it lives only on the WebSocket bridge and is superseded by
 * SwappableBridge.
 */
export interface PythonBridge extends EventEmitter {
  connect(): Promise<void>;
  ensureConnected(): Promise<void>;
  execute(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<ExecuteResult>;
  executeStream(
    nodeType: string,
    fields: Record<string, unknown>,
    secrets: Record<string, string>,
    blobs: ExecuteInputBlobs,
    onProgress?: (event: ProgressEvent) => void
  ): AsyncGenerator<ExecuteResult>;
  cancel(requestId: string): void;
  getNodeMetadata(): PythonNodeMetadata[];
  getLoadErrors(): PythonWorkerLoadError[];
  getWorkerStatus(): Promise<PythonWorkerStatus>;
  hasNodeType(nodeType: string): boolean;
  readonly isConnected: boolean;
  isAvailable(): boolean;
  listProviders(): Promise<PythonProviderInfo[]>;
  getProviderModels(
    providerId: string,
    modelType: string,
    secrets?: Record<string, string>
  ): Promise<Record<string, unknown>[]>;
  providerGenerate(
    providerId: string,
    messages: Record<string, unknown>[],
    model: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  providerTextToImage(
    providerId: string,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array>;
  providerImageToImage(
    providerId: string,
    image: Uint8Array,
    params: Record<string, unknown>,
    secrets?: Record<string, string>
  ): Promise<Uint8Array>;
  providerASR(
    providerId: string,
    audio: Uint8Array,
    model: string,
    options?: Record<string, unknown>
  ): Promise<ASRResult>;
  providerEmbedding(
    providerId: string,
    text: string | string[],
    model: string,
    dimensions?: number
  ): Promise<number[][]>;
  listCachedModels(): Promise<UnifiedModelLike[]>;
  downloadModel(
    req: ModelDownloadRequest,
    onProgress: (update: ModelDownloadUpdate) => void,
    requestId?: string
  ): Promise<void>;
  cancelModelDownload(requestId: string): void;
  deleteCachedModel(repoId: string): Promise<boolean>;
  supportsModelManagement(): boolean;

  // ── ComfyUI proxy (protocol v3+, gated by supportsComfy) ─────────────────
  /**
   * Whether the attached worker fronts a ComfyUI server and speaks the
   * `comfy.*` family (protocol v3+ AND `worker.status.comfy.enabled`). Route
   * ComfyUI jobs only to workers where this is true.
   */
  supportsComfy(): boolean;
  /** The last-known `comfy` block from `worker.status`, or null. */
  getComfyStatus(): ComfyStatusInfo | null;
  /**
   * Submit a ComfyUI workflow (API-format prompt JSON) and drain its
   * `comfy.event` lifecycle via `onEvent`. Resolves on the terminal `result`,
   * rejects on `error`. Cancellable through the standard {@link cancel} with the
   * returned/passed `requestId`.
   */
  comfyExecute(
    prompt: Record<string, unknown>,
    options?: ComfyExecuteOptions,
    onEvent?: (event: ComfyEvent) => void,
    requestId?: string
  ): Promise<ComfyExecuteResult>;
  /** `{queue_running, queue_pending}` — for a queue-position/ETA UI. */
  comfyQueue(): Promise<Record<string, unknown>>;
  /** Global interrupt: stops whatever ComfyUI is running. Admin-only. */
  comfyInterrupt(): Promise<void>;
  /** Best-effort per-prompt cancel — the safe user-facing cancel. */
  comfyCancelPrompt(promptId: string): Promise<void>;
  /** Stage a file into ComfyUI's input dir; returns the stored filename. */
  comfyUpload(
    filename: string,
    bytes: Uint8Array,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  /** Fetch a file from ComfyUI by name. */
  comfyView(
    filename: string,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  /** Full ComfyUI node catalog. */
  comfyObjectInfo(): Promise<Record<string, unknown>>;
  /** ComfyUI system/VRAM stats. */
  comfySystemStats(): Promise<Record<string, unknown>>;
  /** Worker-level ComfyUI health: `{enabled, url, reachable}`. */
  comfyStatus(): Promise<ComfyStatusInfo>;
  /** Unload models from VRAM without a cold restart. */
  comfyFree(options?: Record<string, unknown>): Promise<void>;
  /** List model files on the worker's persistent volume. */
  comfyModelsList(folder?: string): Promise<ComfyModelInfo[]>;
  /** Download a model file onto the worker's volume, streaming progress. */
  comfyModelsDownload(
    req: ComfyModelDownloadRequest,
    onProgress: (update: ComfyModelDownloadUpdate) => void,
    requestId?: string
  ): Promise<void>;
  /** Remove a model file from the worker's volume. */
  comfyModelsDelete(folder: string, filename: string): Promise<boolean>;

  getRecentStderrSummary(limit?: number): string | null;
  close(): void;
}
