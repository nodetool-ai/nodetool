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
  pythonPath?: string;
  workerArgs?: string[];
  autoRestart?: boolean;
  startupTimeoutMs?: number;
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
