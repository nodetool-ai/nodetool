/**
 * @nodetool-ai/protocol – Message Types
 *
 * TypeScript equivalents of the Python message types defined in:
 *   src/nodetool/workflows/types.py
 *   src/nodetool/types/job.py
 *   src/nodetool/metadata/types.py (Chunk)
 *   src/nodetool/types/prediction.py
 *
 * Every message is discriminated by a literal `type` field so that
 * consumers can switch on `msg.type` for exhaustive handling.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum TaskUpdateEvent {
  TaskPlanned = "task_planned",
  TaskRemoved = "task_removed",
  TaskCreated = "task_created",
  StepStarted = "step_started",
  EnteredConclusionStage = "entered_conclusion_stage",
  StepCompleted = "step_completed",
  StepFailed = "step_failed",
  TaskCompleted = "task_completed"
}

export type Severity = "info" | "warning" | "error";

export type ContentType =
  | "text"
  | "audio"
  | "image"
  | "video"
  | "document"
  | "tool_call"
  | "agent_status";

export type EdgeType = "data" | "control";

export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "error";

export type NodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "error";

export type EdgeStatus = "active" | "completed";

// ---------------------------------------------------------------------------
// Lightweight embedded types
// ---------------------------------------------------------------------------

/** Mirrors RunStateInfo from src/nodetool/types/job.py */
export interface RunStateInfo {
  status: string;
  suspended_node_id?: string | null;
  suspension_reason?: string | null;
  error_message?: string | null;
  execution_strategy?: string | null;
  is_resumable: boolean;
}

/**
 * Minimal Task / Step references used by TaskUpdate and StepResult.
 * Full definitions live in the agent layer; here we keep only the
 * shape needed to transport messages. The known fields match the
 * Task / Step interfaces in api-types but are all optional because
 * the wire format varies between events.
 */
export interface TaskRef {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  instructions?: string;
  status?: string;
  steps?: StepRef[];
  result?: unknown;
  error?: string | null;
  [key: string]: unknown;
}

export interface StepRef {
  id?: string;
  name?: string;
  instructions?: string;
  status?: string;
  tool?: string | null;
  result?: unknown;
  error?: string | null;
  completed?: boolean;
  start_time?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

export interface JobUpdate {
  type: "job_update";
  status: string;
  job_id?: string | null;
  workflow_id?: string | null;
  message?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  traceback?: string | null;
  run_state?: RunStateInfo | null;
  duration?: number | null;
  /**
   * Per-property issues from pre-flight graph validation. Present when
   * `status === "failed"` and the failure was caused by a validation error
   * (not a runtime exception). Frontend uses this to highlight specific
   * fields on the offending nodes instead of showing a node-level banner.
   */
  validation_issues?: ValidationIssue[] | null;
}

export interface ValidationIssue {
  node_id: string;
  node_type?: string | null;
  property: string;
  message: string;
}

export interface NodeUpdate {
  type: "node_update";
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  error?: string | null;
  result?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
  workflow_id?: string | null;
}

export interface NodeProgress {
  type: "node_progress";
  node_id: string;
  progress: number;
  total: number;
  chunk?: string;
  workflow_id?: string | null;
}

export interface EdgeUpdate {
  type: "edge_update";
  workflow_id: string;
  edge_id: string;
  status: string;
  counter?: number | null;
}

export interface OutputUpdate {
  type: "output_update";
  node_id: string;
  node_name: string;
  output_name: string;
  value: unknown;
  output_type: string;
  metadata: Record<string, unknown>;
  workflow_id?: string | null;
}

export interface SaveUpdate {
  type: "save_update";
  node_id: string;
  name: string;
  value: unknown;
  output_type: string;
  metadata: Record<string, unknown>;
}

export interface BinaryUpdate {
  type: "binary_update";
  node_id: string;
  output_name: string;
  binary: Uint8Array;
}

export interface LogUpdate {
  type: "log_update";
  node_id: string;
  node_name: string;
  content: string;
  severity: Severity;
  workflow_id?: string | null;
}

export interface Notification {
  type: "notification";
  node_id: string;
  content: string;
  severity: Severity;
  workflow_id?: string | null;
}

export interface ErrorMessage {
  type: "error";
  message: string;
  thread_id?: string | null;
  workflow_id?: string | null;
}

export interface ToolCallUpdate {
  type: "tool_call_update";
  node_id?: string | null;
  thread_id?: string | null;
  workflow_id?: string | null;
  tool_call_id?: string | null;
  name: string;
  args: Record<string, unknown>;
  message?: string | null;
  step_id?: string | null;
  agent_execution_id?: string | null;
}

export interface ToolResultUpdate {
  type: "tool_result_update";
  node_id: string;
  thread_id?: string | null;
  workflow_id?: string | null;
  result: Record<string, unknown>;
}

export interface TaskUpdate {
  type: "task_update";
  node_id?: string | null;
  thread_id?: string | null;
  workflow_id?: string | null;
  task: TaskRef;
  step?: StepRef | null;
  event: TaskUpdateEvent;
}

export interface StepResult {
  type: "step_result";
  step: StepRef;
  result: unknown;
  error?: string | null;
  is_task_result?: boolean;
  thread_id?: string | null;
  workflow_id?: string | null;
}

export interface PlanningUpdate {
  type: "planning_update";
  node_id?: string | null;
  thread_id?: string | null;
  workflow_id?: string | null;
  phase: string;
  status: string;
  content?: string | null;
}

export interface Chunk {
  type: "chunk";
  node_id?: string | null;
  thread_id?: string | null;
  workflow_id?: string | null;
  content_type?: ContentType;
  content: string;
  content_metadata?: Record<string, unknown>;
  done?: boolean;
  thinking?: boolean;
}

export interface Prediction {
  type: "prediction";
  id: string;
  user_id: string;
  node_id: string;
  workflow_id?: string | null;
  provider?: string | null;
  model?: string | null;
  version?: string | null;
  node_type?: string | null;
  status: string;
  params?: Record<string, unknown>;
  data?: unknown | null;
  cost?: number | null;
  logs?: string | null;
  error?: string | null;
  duration?: number | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  [key: string]: unknown;
}

export interface LLMCallUpdate {
  type: "llm_call";
  node_id: string;
  node_name?: string | null;
  provider: string;
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  response: unknown;
  tool_calls?: Array<{ id: string; name: string; args: unknown }> | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  cost?: number | null;
  duration_ms: number;
  error?: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Unified websocket command/control/update types
// ---------------------------------------------------------------------------

export type WebSocketMode = "binary" | "text";

export type UnifiedCommandType =
  | "run_job"
  | "reconnect_job"
  | "resume_job"
  | "cancel_job"
  | "get_status"
  | "set_mode"
  | "clear_models"
  | "stream_input"
  | "end_input_stream"
  | "chat_message"
  | "inference"
  | "stop"
  | "list_workflows"
  | "get_workflow"
  | "list_assets"
  | "get_asset"
  | "list_nodes"
  | "get_node"
  | "generate_media";

/**
 * Read-only RPC commands that require a `request_id` and return a single
 * `rpc_response` frame. Distinguished from streaming commands (run_job,
 * chat_message, etc.) which fire-and-forget and stream results back.
 *
 * `generate_media` is included here because the sketch editor and other
 * non-chat callers want a single asset id back, not a streamed Message row.
 */
export type RpcCommandType =
  | "list_workflows"
  | "get_workflow"
  | "list_assets"
  | "get_asset"
  | "list_nodes"
  | "get_node"
  | "generate_media";

export interface WebSocketCommandEnvelope<
  C extends UnifiedCommandType = UnifiedCommandType,
  D extends Record<string, unknown> = Record<string, unknown>
> {
  command: C;
  data: D;
  /**
   * Opaque client-generated id, echoed back in the `rpc_response` frame.
   * REQUIRED for RPC commands (list_*, get_*); ignored for streaming
   * commands (run_job, chat_message, …).
   */
  request_id?: string;
}

// ── RPC request payloads ──────────────────────────────────────────
// Mirror the Zod input schemas in api-schemas/{workflows,assets,nodes}.ts.
// Kept loose (Record<string, unknown>) so adding optional filters in the
// underlying procedures doesn't require updating these envelopes.

export interface ListWorkflowsRequest {
  limit?: number;
  run_mode?: string;
  tag?: string;
  cursor?: string;
}

export interface GetWorkflowRequest {
  id: string;
}

export interface ListAssetsRequest {
  parent_id?: string;
  content_type?: string;
  workflow_id?: string;
  node_id?: string;
  job_id?: string;
  page_size?: number;
}

export interface GetAssetRequest {
  id: string;
}

export interface ListNodesRequest {
  namespace?: string;
  query?: string;
  fields?: "summary" | "full";
  limit?: number;
}

export interface GetNodeRequest {
  node_type: string;
}

/**
 * Request payload for the `generate_media` RPC. Drives the sketch editor's
 * direct-generation layers (text-to-image and image-to-image) and the
 * timeline's direct-gen clips (text-to-video, text-to-audio) — bypasses
 * the chat path so no thread/Message row is created. Returns
 * `{ asset_ids: string[] }`.
 */
export interface GenerateMediaRequest {
  /**
   * "image" = text-to-image; "image_edit" = image-to-image;
   * "video" = text-to-video; "audio" = text-to-speech.
   */
  mode: "image" | "image_edit" | "video" | "audio";
  provider: string;
  model: string;
  prompt: string;
  /** Required when mode === "image_edit". Bytes are loaded server-side. */
  source_asset_id?: string;
  width?: number;
  height?: number;
  strength?: number;
  num_inference_steps?: number;
  /** Number of variations to request (1..8, clamped server-side). */
  variations?: number;
  /** TTS voice id, when mode === "audio". */
  voice?: string;
  /** Playback rate for TTS, when mode === "audio". */
  speed?: number;
  /** Requested audio container ("mp3", "wav", "flac", "ogg", "aac", "pcm"). */
  audio_format?: string;
}

export interface GenerateMediaResponse {
  asset_ids: string[];
}

export interface RpcErrorPayload {
  code: string;
  message: string;
  apiCode?: string | null;
  trpcCode?: string;
}

/**
 * Single response frame for RPC commands. Either `result` or `error` is
 * set; both are absent only for malformed requests where the server
 * couldn't route the response (those use the legacy `{ error }` shape).
 */
export interface RpcResponseMessage {
  type: "rpc_response";
  request_id: string;
  command: UnifiedCommandType;
  result?: unknown;
  error?: RpcErrorPayload;
}

export interface PingMessage {
  type: "ping";
  ts?: number;
}

export interface PongMessage {
  type: "pong";
  ts: number;
}

export interface ClientToolManifestMessage {
  type: "client_tools_manifest";
  tools: Array<Record<string, unknown>>;
}

export interface ToolResultMessage {
  type: "tool_result";
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface SystemStatsMessage {
  type: "system_stats";
  stats: Record<string, unknown>;
}

export interface ResourceChangeMessage {
  type: "resource_change";
  event: "created" | "updated" | "deleted";
  resource_type: string;
  resource: Record<string, unknown>;
}

export type WebSocketControlMessage =
  | PingMessage
  | ClientToolManifestMessage
  | ToolResultMessage;

export type WebSocketServerMessage =
  | ProcessingMessage
  | PongMessage
  | SystemStatsMessage
  | ResourceChangeMessage
  | RpcResponseMessage
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Discriminated union – matches Python ProcessingMessage
// ---------------------------------------------------------------------------

export type ProcessingMessage =
  | JobUpdate
  | NodeUpdate
  | NodeProgress
  | EdgeUpdate
  | OutputUpdate
  | SaveUpdate
  | BinaryUpdate
  | LogUpdate
  | Notification
  | ErrorMessage
  | ToolCallUpdate
  | ToolResultUpdate
  | TaskUpdate
  | StepResult
  | PlanningUpdate
  | Chunk
  | Prediction
  | LLMCallUpdate;

/**
 * Literal union of every `type` discriminator value.
 */
export type MessageType = ProcessingMessage["type"];

/**
 * Extract a specific message variant by its type discriminator.
 *
 * @example
 *   type JU = MessageOfType<"job_update">; // JobUpdate
 */
export type MessageOfType<T extends MessageType> = Extract<
  ProcessingMessage,
  { type: T }
>;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Recursively sanitize memory:// URIs from a message payload.
 * Replaces any string starting with "memory://" with an empty string.
 * Mirrors Python's sanitize_memory_uris_for_client().
 */
export function sanitizeMemoryUris<T>(value: T): T {
  if (typeof value === "string") {
    return (value.startsWith("memory://") ? "" : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeMemoryUris) as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeMemoryUris(v);
    }
    return result as T;
  }
  return value;
}

/**
 * Encode a BinaryUpdate into a single Buffer/Uint8Array suitable for
 * binary WebSocket transmission.
 * Format: JSON header (node_id + output_name) + null byte + raw binary.
 * Mirrors Python's BinaryUpdate.encode().
 */
export function encodeBinaryUpdate(update: BinaryUpdate): Uint8Array {
  const header = JSON.stringify({
    type: update.type,
    node_id: update.node_id,
    output_name: update.output_name
  });
  const headerBytes = new TextEncoder().encode(header);
  const separator = new Uint8Array([0]); // null byte separator
  const result = new Uint8Array(headerBytes.length + 1 + update.binary.length);
  result.set(headerBytes, 0);
  result.set(separator, headerBytes.length);
  result.set(update.binary, headerBytes.length + 1);
  return result;
}
