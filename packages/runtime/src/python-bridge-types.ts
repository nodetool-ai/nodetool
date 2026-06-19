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
  getRecentStderrSummary(limit?: number): string | null;
  close(): void;
}
