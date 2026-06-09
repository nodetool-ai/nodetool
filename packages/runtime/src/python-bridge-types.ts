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
