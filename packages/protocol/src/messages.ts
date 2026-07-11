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
  TaskCompleted = "task_completed",
  TaskFailed = "task_failed"
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
   * 1-based position in the server's pending-run queue. Present when
   * `status === "queued"` because the client already has
   * `MAX_CONCURRENT_JOBS` runs in flight. The run starts automatically
   * (a `running` update follows) once an earlier run finishes.
   */
  queue_position?: number | null;
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

export interface ProviderCost {
  provider: string;
  amount: number;
  unit: string;
  /** Provider model / endpoint the charge applies to (e.g. a FAL endpoint id). */
  model?: string | null;
  /** Billing unit the provider prices by (e.g. "megapixels", "seconds", "images"). */
  billing_unit?: string | null;
  /** Number of billing units consumed. */
  quantity?: number | null;
  /** Price per billing unit, in `unit`/currency terms. */
  unit_price?: number | null;
  /** ISO 4217 currency of `amount`/`unit_price` (e.g. "USD"). */
  currency?: string | null;
  /**
   * Provider-side request identifier (e.g. a FAL queue request id). Lets the
   * runner reconcile the initial estimate against the provider's actual billed
   * cost after the fact. `amount` is an estimate until reconciled.
   */
  provider_request_id?: string | null;
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
  /** Actual provider charge for the last completed run (when reported by the node). */
  provider_cost?: ProviderCost | null;
  workflow_id?: string | null;
}

/**
 * A generator committed one complete artifact (one `process()` result, or one
 * `genProcess` stream-end). Authoritative variant carrier — never suppressed.
 *
 * The kernel actor emits a BARE event: `node_id`, `node_name`, `node_type`,
 * `outputs`. `job_id` and `index` are stamped DOWNSTREAM by the relay (the
 * unified websocket runner / browser runner), so both are optional on the wire
 * — see the generation-events RFC §4.2 / §5 / Decision 8.
 */
export interface GenerationComplete {
  type: "generation_complete";
  node_id: string;
  node_name: string;
  node_type: string;
  /**
   * k-th committed generation of this node in this run. Stamped downstream by
   * the relay (DB ordering on the server, arrival order in the browser), absent
   * on the bare actor emit.
   */
  index?: number;
  /** The complete result dict for this artifact (same shape as a process() return). */
  outputs: Record<string, unknown>;
  /**
   * Scalar input properties resolved for this run — declared props, user-typed
   * dynamic props, and edge inputs, filtered to strings/numbers/booleans. The
   * actor stamps these so the relay can persist generation params (notably the
   * `prompt` that produced an image) into auto-saved asset metadata. Absent when
   * the node has no scalar inputs.
   */
  properties?: Record<string, unknown> | null;
  /** Stamped downstream by the runner relay, NOT by the actor. */
  job_id?: string | null;
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
  // Both ids are stamped by the unified websocket runner if absent. The kernel
  // emits `job_id` (the run id); `workflow_id` is backfilled from the active
  // run. Edge animations are scoped per run, so consumers key off `job_id`.
  workflow_id?: string;
  job_id?: string;
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
  /**
   * NEW. "append" = `value` is a chunk to concatenate onto the live display
   * buffer; "replace" = `value` is a whole snapshot that overwrites it. Absent
   * ⇒ treated as "append" (today's behavior) for back-compat.
   */
  disposition?: "append" | "replace";
  /** NEW (optional). Marks the final chunk of an append stream. */
  done?: boolean;
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

/**
 * Raw terminal output streamed from a node that drives an interactive
 * terminal program (e.g. Claude Code in tmux). `content` carries the verbatim
 * byte stream including ANSI escape sequences, intended for a client-side
 * terminal emulator (xterm.js) — NOT for plain-text rendering. Kept separate
 * from `Chunk` so text-chunk consumers never see escape sequences.
 */
export interface TerminalUpdate {
  type: "terminal_update";
  node_id: string;
  workflow_id?: string | null;
  /** Raw terminal output, including ANSI escape sequences. */
  content: string;
  /** Terminal grid size, for sizing the client-side emulator. */
  cols?: number;
  rows?: number;
  /**
   * When true, `content` is a full-screen snapshot: the client should reset
   * its terminal state before writing (used on attach and to compact the
   * stream after large bursts).
   */
  reset?: boolean;
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
  /**
   * The tool_call_id of an enclosing `run_subtask` call, if this event was
   * emitted from inside a subtask. Null/undefined at the root level. Used by
   * the renderer to nest tool-call cards.
   */
  parent_tool_call_id?: string | null;
  /**
   * Recursion depth: 0 at the chat root, 1 inside a top-level run_subtask, etc.
   * Optional — renderers that don't care can ignore it.
   */
  subtask_depth?: number | null;
}

export interface ToolResultUpdate {
  type: "tool_result_update";
  node_id: string;
  thread_id?: string | null;
  workflow_id?: string | null;
  result: Record<string, unknown>;
  tool_call_id?: string | null;
  name?: string | null;
  is_error?: boolean;
  parent_tool_call_id?: string | null;
  subtask_depth?: number | null;
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
  /**
   * Text chunks and externally-sourced audio carry a string (base64 for
   * binary payloads). In-process audio/CV chunks carry their samples as a
   * native interleaved `Float32Array` — no per-hop encode/decode. The
   * websocket transport encodes native samples to base64 (`encoding:
   * "f32le"`) at the wire boundary; worker postMessage structured-clones
   * them natively.
   */
  content: string | Float32Array;
  content_metadata?: Record<string, unknown>;
  done?: boolean;
  thinking?: boolean;
  /**
   * The tool_call_id of an enclosing `run_subtask` call when this chunk was
   * emitted from inside a subtask. Null/undefined at the root.
   */
  parent_tool_call_id?: string | null;
  /** Recursion depth: 0 at the chat root, 1 inside run_subtask, etc. */
  subtask_depth?: number | null;
}

/**
 * Opaque, provider-agnostic continuation token for resuming an upstream
 * conversation session across turns. Persisted on the ASSISTANT message that
 * concluded the turn (it records the state *after* this turn). On the next turn
 * a provider that supports server/SDK-side sessions resumes from this token and
 * sends only the new user delta instead of replaying the whole transcript;
 * stateless providers ignore it.
 *
 * Provider-agnostic by design. For the Claude Agent SDK, `token` is the SDK
 * `session_id`. An OpenAI Responses provider reuses this exact shape: store the
 * Responses `previous_response_id` as `token`, send the request with
 * `store: true`, then on each subsequent turn pass `previous_response_id =
 * token` and submit only the delta — reading and writing the token on the same
 * `provider_session` message column. The semantics are identical and
 * best-effort: a token may have expired or been pruned (Responses state lapses
 * after ~30 days; the Agent SDK's session JSONL can be deleted), so a failed
 * resume must fall back to a fresh session rather than erroring.
 */
export interface ProviderSession {
  /** Provider that owns the token (e.g. `PROVIDER_IDS.CLAUDE_AGENT_SDK`). */
  providerId: string;
  /** Model the session was created with; a mismatch forces a fresh session. */
  model: string;
  /**
   * The opaque continuation token: the Agent SDK `session_id` here;
   * `previous_response_id` for an OpenAI Responses provider.
   */
  token: string;
  /**
   * Count of conversation messages already absorbed by this session — the
   * resume cut point. The next turn sends only `messages.slice(checkpoint)`.
   */
  checkpoint: number;
  /** Optional hash of the system prompt; a mismatch invalidates the session. */
  systemHash?: string;
}

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

export interface TodoUpdate {
  type: "todo_update";
  thread_id?: string | null;
  workflow_id?: string | null;
  node_id?: string | null;
  todos: TodoItem[];
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
  | "update_node_properties"
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
  | "generate_media"
  | "transcribe_audio";

/**
 * Read-only RPC commands that require a `request_id` and return a single
 * `rpc_response` frame. Distinguished from streaming commands (run_job,
 * chat_message, etc.) which fire-and-forget and stream results back.
 *
 * `generate_media` is included here because the sketch editor and other
 * non-chat callers want a single asset id back, not a streamed Message row.
 * `transcribe_audio` likewise returns word-level caption timing in one shot.
 */
export type RpcCommandType =
  | "list_workflows"
  | "get_workflow"
  | "list_assets"
  | "get_asset"
  | "list_nodes"
  | "get_node"
  | "generate_media"
  | "transcribe_audio";

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
  | GenerationComplete
  | NodeProgress
  | EdgeUpdate
  | OutputUpdate
  | SaveUpdate
  | BinaryUpdate
  | LogUpdate
  | TerminalUpdate
  | Notification
  | ErrorMessage
  | ToolCallUpdate
  | ToolResultUpdate
  | TaskUpdate
  | StepResult
  | PlanningUpdate
  | Chunk
  | Prediction
  | LLMCallUpdate
  | TodoUpdate;

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
