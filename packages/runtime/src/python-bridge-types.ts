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
  // Realtime capability flags emitted by node_to_metadata() in
  // nodetool-core (see PLAN-REALTIME.md item 6b). The TS-side NodeRegistry
  // uses these so Python and TS realtime nodes present a uniform surface.
  is_realtime_capable?: boolean;
  owns_warm_state?: boolean;
  is_media_adapter?: boolean;
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

// ---------------------------------------------------------------------------
// Realtime session protocol (PLAN-REALTIME.md item 6c)
// ---------------------------------------------------------------------------
//
// These types mirror the Python dataclasses in
// nodetool-core/src/nodetool/workflows/realtime.py and the verb wire-format
// implemented by StdioWorkerServer. The TS-side bridge translates these into
// `request_id`-tagged `start_session`, `update_parameter`, `push_input_frame`,
// and `stop_session` messages, and surfaces server-pushed
// `realtime_output_frame` events as a typed event on the bridge.
//
// The substrate intentionally stays minimal: payloads are JSON-shaped
// `Record<string, unknown>` so transport, encoding (base64, msgpack, etc.) and
// frame-format conventions can evolve without touching the bridge protocol
// itself.

export interface RealtimeMediaTrackPayload {
  track_id: string;
  kind: string; // "audio" | "video"
  node_id: string;
  input_name: string;
}

export interface RealtimeSessionInfoPayload {
  session_id: string;
  workflow_id: string | null;
  transport: string; // "websocket" | "webrtc"
  parameters: Record<string, unknown>;
  media_tracks: RealtimeMediaTrackPayload[];
}

export interface RealtimeStartSessionRequest {
  session: RealtimeSessionInfoPayload;
  node_type: string;
  fields?: Record<string, unknown>;
  secrets?: Record<string, string>;
  input_buffer_size?: number;
}

export interface RealtimeStartSessionResult {
  session_id: string;
  status: string; // "started"
}

export interface RealtimeUpdateParameterRequest {
  session_id: string;
  name: string;
  value: unknown;
}

export interface RealtimeUpdateParameterResult {
  session_id: string;
  ok: boolean;
  routed: boolean;
}

export interface RealtimePushInputFrameRequest {
  session_id: string;
  handle: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface RealtimePushInputFrameResult {
  session_id: string;
  ok: boolean;
  dropped_count: number;
}

export interface RealtimeStopSessionRequest {
  session_id: string;
  timeout?: number;
}

export interface RealtimeStopSessionResult {
  session_id: string;
  ok: boolean;
  error: string | null;
}

export interface RealtimeOutputFrameEvent {
  session_id: string;
  handle: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}
