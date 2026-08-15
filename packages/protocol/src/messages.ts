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
 *
 * Zod is the source of truth: every `ProcessingMessage` variant (and the
 * types it embeds) is defined as a Zod schema first, with its TypeScript
 * type derived via `z.infer`. Where Zod's inference can't reproduce a
 * shape exactly — index signatures, `unknown` fields whose optionality
 * must stay exact — the TypeScript interface is still hand-written and
 * exported as before, and the schema is annotated `z.ZodType<ThatType>`
 * so the two never drift silently.
 *
 * `processingMessageSchema` (a `z.discriminatedUnion` on `type`) is the
 * single runtime validator for the whole union; `packages/protocol`'s
 * build emits it as JSON Schema to `dist/processing-messages.schema.json`
 * (see `scripts/generate-processing-messages-schema.ts`) for non-TS
 * consumers (the Python worker, external SDKs) to validate against.
 */

import { z } from "zod";
import {
  supervisorDecisionSchema,
  supervisorEscalationSchema,
  type SupervisorDecision,
  type SupervisorEscalation
} from "./supervisor.js";

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

/** Zod schema for {@link TaskUpdateEvent}. */
export const taskUpdateEventSchema = z.enum(TaskUpdateEvent);

export const severitySchema = z.enum(["info", "warning", "error"]);
export type Severity = z.infer<typeof severitySchema>;

export const contentTypeSchema = z.enum([
  "text",
  "audio",
  "image",
  "video",
  "document",
  "tool_call",
  "agent_status"
]);
export type ContentType = z.infer<typeof contentTypeSchema>;

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

export const runStateInfoSchema: z.ZodType<RunStateInfo> = z.object({
  status: z.string(),
  suspended_node_id: z.string().nullable().optional(),
  suspension_reason: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  execution_strategy: z.string().nullable().optional(),
  is_resumable: z.boolean()
});

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

// `TaskRef`/`StepRef` are mutually recursive and carry an index signature
// (`[key: string]: unknown`) on top of explicit optional fields — a shape
// `z.infer` cannot reproduce exactly (Zod's `.catchall()` would also widen
// the explicit fields' key type). The interfaces above remain the source
// of truth for the TS types; these schemas are hand-annotated to them and
// validate the same shape at runtime. `z.lazy` breaks the recursive cycle.
export const stepRefSchema: z.ZodType<StepRef> = z.lazy(() =>
  z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      instructions: z.string().optional(),
      status: z.string().optional(),
      tool: z.string().nullable().optional(),
      result: z.unknown().optional(),
      error: z.string().nullable().optional(),
      completed: z.boolean().optional(),
      start_time: z.number().optional()
    })
    .catchall(z.unknown())
);

export const taskRefSchema: z.ZodType<TaskRef> = z.lazy(() =>
  z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      instructions: z.string().optional(),
      status: z.string().optional(),
      steps: z.array(stepRefSchema).optional(),
      result: z.unknown().optional(),
      error: z.string().nullable().optional()
    })
    .catchall(z.unknown())
);

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

export const validationIssueSchema = z.object({
  node_id: z.string(),
  node_type: z.string().nullable().optional(),
  property: z.string(),
  message: z.string()
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const jobUpdateSchema = z.object({
  type: z.literal("job_update"),
  status: z.string(),
  job_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable().optional(),
  traceback: z.string().nullable().optional(),
  run_state: runStateInfoSchema.nullable().optional(),
  duration: z.number().nullable().optional(),
  /**
   * 1-based position in the server's pending-run queue. Present when
   * `status === "queued"` because the client already has
   * `MAX_CONCURRENT_JOBS` runs in flight. The run starts automatically
   * (a `running` update follows) once an earlier run finishes.
   */
  queue_position: z.number().nullable().optional(),
  /**
   * Per-property issues from pre-flight graph validation. Present when
   * `status === "failed"` and the failure was caused by a validation error
   * (not a runtime exception). Frontend uses this to highlight specific
   * fields on the offending nodes instead of showing a node-level banner.
   */
  validation_issues: z.array(validationIssueSchema).nullable().optional(),
  /**
   * Machine-readable reason for a `failed` status, when one exists. Set to
   * `BUDGET_EXCEEDED` when an app's spend budget refused the run — a websocket
   * client has no other way to tell that apart from a node crash, since both
   * arrive as `failed` with prose in `error`. Absent for ordinary failures.
   */
  error_code: z.string().nullable().optional()
});
export type JobUpdate = z.infer<typeof jobUpdateSchema>;

export const providerCostSchema = z.object({
  provider: z.string(),
  amount: z.number(),
  unit: z.string(),
  /** Provider model / endpoint the charge applies to (e.g. a FAL endpoint id). */
  model: z.string().nullable().optional(),
  /** Billing unit the provider prices by (e.g. "megapixels", "seconds", "images"). */
  billing_unit: z.string().nullable().optional(),
  /** Number of billing units consumed. */
  quantity: z.number().nullable().optional(),
  /** Price per billing unit, in `unit`/currency terms. */
  unit_price: z.number().nullable().optional(),
  /** ISO 4217 currency of `amount`/`unit_price` (e.g. "USD"). */
  currency: z.string().nullable().optional(),
  /**
   * Provider-side request identifier (e.g. a FAL queue request id). Lets the
   * runner reconcile the initial estimate against the provider's actual billed
   * cost after the fact. `amount` is an estimate until reconciled.
   */
  provider_request_id: z.string().nullable().optional()
});
export type ProviderCost = z.infer<typeof providerCostSchema>;

/**
 * Machine-readable companion to `node_update.error`. Lets a surface act on a
 * failure — reopen provider onboarding on the offending key, say — without
 * matching the prose the provider layer wrote.
 */
export const nodeErrorDetailSchema = z.object({
  /** `provider_auth`: the provider refused the credential (401/403). */
  code: z.string(),
  /** Provider id as the runtime knows it (e.g. `openai`). */
  provider: z.string().nullable().optional(),
  /** Secret key holding that provider's credential (e.g. `OPENAI_API_KEY`). */
  secret_key: z.string().nullable().optional()
});
export type NodeErrorDetail = z.infer<typeof nodeErrorDetailSchema>;

export const nodeUpdateSchema = z.object({
  type: z.literal("node_update"),
  node_id: z.string(),
  node_name: z.string(),
  node_type: z.string(),
  status: z.string(),
  error: z.string().nullable().optional(),
  /** Structured cause behind `error`, when the failure has one. */
  error_detail: nodeErrorDetailSchema.nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Actual provider charge for the last completed run (when reported by the node). */
  provider_cost: providerCostSchema.nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  /**
   * Run identity. Stamped downstream by the relay (the unified websocket runner
   * and the browser runner), not by the kernel actor, so it is optional on the
   * wire. Consumers that can see more than one run at a time — mini apps, a
   * second tab, the editor running the same workflow — key off this to keep
   * runs from contaminating each other.
   */
  job_id: z.string().nullable().optional()
});
export type NodeUpdate = z.infer<typeof nodeUpdateSchema>;

/**
 * A generator committed one complete artifact (one `process()` result, or one
 * `genProcess` stream-end). Authoritative variant carrier — never suppressed.
 *
 * The kernel actor emits a BARE event: `node_id`, `node_name`, `node_type`,
 * `outputs`. `job_id` and `index` are stamped DOWNSTREAM by the relay (the
 * unified websocket runner / browser runner), so both are optional on the wire
 * — see the generation-events RFC §4.2 / §5 / Decision 8.
 */
export const generationCompleteSchema = z.object({
  type: z.literal("generation_complete"),
  node_id: z.string(),
  node_name: z.string(),
  node_type: z.string(),
  /**
   * k-th committed generation of this node in this run. Stamped downstream by
   * the relay (DB ordering on the server, arrival order in the browser), absent
   * on the bare actor emit.
   */
  index: z.number().optional(),
  /** The complete result dict for this artifact (same shape as a process() return). */
  outputs: z.record(z.string(), z.unknown()),
  /**
   * Scalar input properties resolved for this run — declared props, user-typed
   * dynamic props, and edge inputs, filtered to strings/numbers/booleans. The
   * actor stamps these so the relay can persist generation params (notably the
   * `prompt` that produced an image) into auto-saved asset metadata. Absent when
   * the node has no scalar inputs.
   */
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  /** Stamped downstream by the runner relay, NOT by the actor. */
  job_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional()
});
export type GenerationComplete = z.infer<typeof generationCompleteSchema>;

export const nodeProgressSchema = z.object({
  type: z.literal("node_progress"),
  node_id: z.string(),
  progress: z.number(),
  total: z.number(),
  chunk: z.string().optional(),
  workflow_id: z.string().nullable().optional(),
  /** Run identity, stamped downstream by the relay. See {@link NodeUpdate.job_id}. */
  job_id: z.string().nullable().optional()
});
export type NodeProgress = z.infer<typeof nodeProgressSchema>;

export const edgeUpdateSchema = z.object({
  type: z.literal("edge_update"),
  // Both ids are stamped by the unified websocket runner if absent. The kernel
  // emits `job_id` (the run id); `workflow_id` is backfilled from the active
  // run. Edge animations are scoped per run, so consumers key off `job_id`.
  workflow_id: z.string().nullable().optional(),
  job_id: z.string().nullable().optional(),
  edge_id: z.string(),
  status: z.string(),
  counter: z.number().nullable().optional()
});
export type EdgeUpdate = z.infer<typeof edgeUpdateSchema>;

export const outputUpdateSchema = z.object({
  type: z.literal("output_update"),
  node_id: z.string(),
  node_name: z.string(),
  output_name: z.string(),
  value: z.unknown(),
  output_type: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  /**
   * NEW. "append" = `value` is a chunk to concatenate onto the live display
   * buffer; "replace" = `value` is a whole snapshot that overwrites it. Absent
   * ⇒ treated as "append" (today's behavior) for back-compat.
   */
  disposition: z.enum(["append", "replace"]).optional(),
  /** NEW (optional). Marks the final chunk of an append stream. */
  done: z.boolean().optional(),
  workflow_id: z.string().nullable().optional(),
  /** Run identity, stamped downstream by the relay. See {@link NodeUpdate.job_id}. */
  job_id: z.string().nullable().optional()
});
export type OutputUpdate = z.infer<typeof outputUpdateSchema>;

export const saveUpdateSchema = z.object({
  type: z.literal("save_update"),
  node_id: z.string(),
  name: z.string(),
  value: z.unknown(),
  output_type: z.string(),
  metadata: z.record(z.string(), z.unknown())
});
export type SaveUpdate = z.infer<typeof saveUpdateSchema>;

// `binary: Uint8Array` needs `z.instanceof`, which Zod infers exactly as
// `Uint8Array` — plain `z.infer` is fine here, no hand-written type needed.
export const binaryUpdateSchema = z.object({
  type: z.literal("binary_update"),
  node_id: z.string(),
  output_name: z.string(),
  binary: z.instanceof(Uint8Array)
});
export type BinaryUpdate = z.infer<typeof binaryUpdateSchema>;

export const logUpdateSchema = z.object({
  type: z.literal("log_update"),
  node_id: z.string(),
  node_name: z.string(),
  content: z.string(),
  severity: severitySchema,
  workflow_id: z.string().nullable().optional()
});
export type LogUpdate = z.infer<typeof logUpdateSchema>;

/**
 * Raw terminal output streamed from a node that drives an interactive
 * terminal program (e.g. Claude Code in tmux). `content` carries the verbatim
 * byte stream including ANSI escape sequences, intended for a client-side
 * terminal emulator (xterm.js) — NOT for plain-text rendering. Kept separate
 * from `Chunk` so text-chunk consumers never see escape sequences.
 */
export const terminalUpdateSchema = z.object({
  type: z.literal("terminal_update"),
  node_id: z.string(),
  workflow_id: z.string().nullable().optional(),
  /** Raw terminal output, including ANSI escape sequences. */
  content: z.string(),
  /** Terminal grid size, for sizing the client-side emulator. */
  cols: z.number().optional(),
  rows: z.number().optional(),
  /**
   * When true, `content` is a full-screen snapshot: the client should reset
   * its terminal state before writing (used on attach and to compact the
   * stream after large bursts).
   */
  reset: z.boolean().optional()
});
export type TerminalUpdate = z.infer<typeof terminalUpdateSchema>;

export const notificationSchema = z.object({
  type: z.literal("notification"),
  node_id: z.string(),
  content: z.string(),
  severity: severitySchema,
  workflow_id: z.string().nullable().optional()
});
export type Notification = z.infer<typeof notificationSchema>;

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional()
});
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export const toolCallUpdateSchema = z.object({
  type: z.literal("tool_call_update"),
  node_id: z.string().nullable().optional(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  tool_call_id: z.string().nullable().optional(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  message: z.string().nullable().optional(),
  step_id: z.string().nullable().optional(),
  agent_execution_id: z.string().nullable().optional(),
  /**
   * The tool_call_id of an enclosing `run_subtask` call, if this event was
   * emitted from inside a subtask. Null/undefined at the root level. Used by
   * the renderer to nest tool-call cards.
   */
  parent_tool_call_id: z.string().nullable().optional(),
  /**
   * Recursion depth: 0 at the chat root, 1 inside a top-level run_subtask, etc.
   * Optional — renderers that don't care can ignore it.
   */
  subtask_depth: z.number().nullable().optional()
});
export type ToolCallUpdate = z.infer<typeof toolCallUpdateSchema>;

export const toolResultUpdateSchema = z.object({
  type: z.literal("tool_result_update"),
  node_id: z.string(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  result: z.record(z.string(), z.unknown()),
  tool_call_id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  is_error: z.boolean().optional(),
  parent_tool_call_id: z.string().nullable().optional(),
  subtask_depth: z.number().nullable().optional()
});
export type ToolResultUpdate = z.infer<typeof toolResultUpdateSchema>;

export const taskUpdateSchema = z.object({
  type: z.literal("task_update"),
  node_id: z.string().nullable().optional(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  task: taskRefSchema,
  step: stepRefSchema.nullable().optional(),
  event: taskUpdateEventSchema
});
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const stepResultSchema = z.object({
  type: z.literal("step_result"),
  step: stepRefSchema,
  result: z.unknown(),
  error: z.string().nullable().optional(),
  is_task_result: z.boolean().optional(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional()
});
export type StepResult = z.infer<typeof stepResultSchema>;

export const planningUpdateSchema = z.object({
  type: z.literal("planning_update"),
  node_id: z.string().nullable().optional(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  phase: z.string(),
  status: z.string(),
  content: z.string().nullable().optional()
});
export type PlanningUpdate = z.infer<typeof planningUpdateSchema>;

export const chunkSchema = z.object({
  type: z.literal("chunk"),
  node_id: z.string().nullable().optional(),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  /**
   * Run identity, stamped downstream by the relay for workflow-sourced chunks.
   * Absent on chat chunks, which are scoped by `thread_id` instead.
   * See {@link NodeUpdate.job_id}.
   */
  job_id: z.string().nullable().optional(),
  content_type: contentTypeSchema.optional(),
  /**
   * Text chunks and externally-sourced audio carry a string (base64 for
   * binary payloads). In-process audio/CV chunks carry their samples as a
   * native interleaved `Float32Array` — no per-hop encode/decode. The
   * websocket transport encodes native samples to base64 (`encoding:
   * "f32le"`) at the wire boundary; worker postMessage structured-clones
   * them natively.
   */
  content: z.union([z.string(), z.instanceof(Float32Array)]),
  content_metadata: z.record(z.string(), z.unknown()).optional(),
  done: z.boolean().optional(),
  thinking: z.boolean().optional(),
  /**
   * The tool_call_id of an enclosing `run_subtask` call when this chunk was
   * emitted from inside a subtask. Null/undefined at the root.
   */
  parent_tool_call_id: z.string().nullable().optional(),
  /** Recursion depth: 0 at the chat root, 1 inside run_subtask, etc. */
  subtask_depth: z.number().nullable().optional()
});
export type Chunk = z.infer<typeof chunkSchema>;

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
export const providerSessionSchema = z.object({
  /** Provider that owns the token (e.g. `PROVIDER_IDS.CLAUDE_AGENT_SDK`). */
  providerId: z.string(),
  /** Model the session was created with; a mismatch forces a fresh session. */
  model: z.string(),
  /**
   * The opaque continuation token: the Agent SDK `session_id` here;
   * `previous_response_id` for an OpenAI Responses provider.
   */
  token: z.string(),
  /**
   * Count of conversation messages already absorbed by this session — the
   * resume cut point. The next turn sends only `messages.slice(checkpoint)`.
   */
  checkpoint: z.number(),
  /** Optional hash of the system prompt; a mismatch invalidates the session. */
  systemHash: z.string().optional()
});
export type ProviderSession = z.infer<typeof providerSessionSchema>;

export const todoStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export type TodoStatus = z.infer<typeof todoStatusSchema>;

export const todoItemSchema = z.object({
  content: z.string(),
  status: todoStatusSchema
});
export type TodoItem = z.infer<typeof todoItemSchema>;

export const todoUpdateSchema = z.object({
  type: z.literal("todo_update"),
  thread_id: z.string().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  node_id: z.string().nullable().optional(),
  todos: z.array(todoItemSchema)
});
export type TodoUpdate = z.infer<typeof todoUpdateSchema>;

/**
 * `Prediction` mixes fully-typed known fields with an index signature for
 * provider-specific extras. `.catchall(z.unknown())` matches that shape.
 */
export const predictionSchema = z
  .object({
    type: z.literal("prediction"),
    id: z.string(),
    user_id: z.string(),
    node_id: z.string(),
    workflow_id: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    capability: z.string().nullable().optional(),
    version: z.string().nullable().optional(),
    node_type: z.string().nullable().optional(),
    status: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
    data: z.unknown().nullable().optional(),
    cost: z.number().nullable().optional(),
    logs: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
    created_at: z.string().nullable().optional(),
    started_at: z.string().nullable().optional(),
    completed_at: z.string().nullable().optional()
  })
  .catchall(z.unknown());
export type Prediction = z.infer<typeof predictionSchema>;

export const llmCallUpdateSchema = z.object({
  type: z.literal("llm_call"),
  node_id: z.string(),
  node_name: z.string().nullable().optional(),
  provider: z.string(),
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
  response: z.unknown(),
  tool_calls: z
    .array(z.object({ id: z.string(), name: z.string(), args: z.unknown() }))
    .nullable()
    .optional(),
  tokens_input: z.number().nullable().optional(),
  tokens_output: z.number().nullable().optional(),
  cost: z.number().nullable().optional(),
  duration_ms: z.number(),
  error: z.string().nullable().optional(),
  timestamp: z.string()
});
export type LLMCallUpdate = z.infer<typeof llmCallUpdateSchema>;

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
  | "resume_chat"
  | "list_chat_turns"
  | "inference"
  | "stop"
  | "list_workflows"
  | "get_workflow"
  | "list_workflow_summaries"
  | "get_workflow_interface"
  | "get_workflow_interfaces"
  | "list_assets"
  | "get_asset"
  | "list_nodes"
  | "get_node"
  | "get_node_type_inventory"
  | "get_capabilities"
  | "preflight_workflow"
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
  | "list_workflow_summaries"
  | "get_workflow_interface"
  | "get_workflow_interfaces"
  | "list_assets"
  | "get_asset"
  | "list_nodes"
  | "get_node"
  | "get_node_type_inventory"
  | "get_capabilities"
  | "preflight_workflow"
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

export interface ListWorkflowSummariesRequest {
  limit?: number;
  cursor?: string;
}

export interface GetWorkflowInterfaceRequest {
  id: string;
  version: 1;
}

export interface GetWorkflowInterfacesRequest {
  ids: string[];
  version: 1;
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
  retryable: boolean;
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

/** Server-assigned identity for the browser/editor on this /ws connection. */
export interface RendererRegisteredMessage {
  type: "renderer_registered";
  renderer_id: string;
}

/** A frontend-tool request that is independent of a chat thread. */
export interface RendererToolCallMessage {
  type: "renderer_tool_call";
  renderer_id: string;
  tool_call_id: string;
  name: string;
  args: unknown;
}

interface RendererToolResultMessageBase {
  type: "renderer_tool_result";
  renderer_id: string;
  tool_call_id: string;
  elapsed_ms?: number;
}

/** Result for a connection-level frontend-tool request. */
export type RendererToolResultMessage = RendererToolResultMessageBase &
  (
    | {
        ok: true;
        result?: unknown;
        error?: never;
      }
    | {
        ok: false;
        result?: never;
        error: string;
      }
  );

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
  | RendererToolResultMessage
  | ToolResultMessage;

export type WebSocketServerMessage =
  | ProcessingMessage
  | PongMessage
  | RendererRegisteredMessage
  | RendererToolCallMessage
  | SystemStatsMessage
  | ResourceChangeMessage
  | RpcResponseMessage
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Discriminated union – matches Python ProcessingMessage
// ---------------------------------------------------------------------------

/**
 * Single runtime validator for the whole `ProcessingMessage` union,
 * discriminated on `type`. `packages/protocol`'s build converts this to
 * JSON Schema (see `scripts/generate-processing-messages-schema.ts`) so
 * non-TypeScript consumers can validate the same shapes.
 */
export const processingMessageSchema = z.discriminatedUnion("type", [
  jobUpdateSchema,
  nodeUpdateSchema,
  generationCompleteSchema,
  nodeProgressSchema,
  edgeUpdateSchema,
  outputUpdateSchema,
  saveUpdateSchema,
  binaryUpdateSchema,
  logUpdateSchema,
  terminalUpdateSchema,
  notificationSchema,
  errorMessageSchema,
  toolCallUpdateSchema,
  toolResultUpdateSchema,
  taskUpdateSchema,
  stepResultSchema,
  planningUpdateSchema,
  chunkSchema,
  predictionSchema,
  llmCallUpdateSchema,
  todoUpdateSchema,
  supervisorEscalationSchema,
  supervisorDecisionSchema
]);

export type ProcessingMessage = z.infer<typeof processingMessageSchema>;

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
// Per-type schema lookup + type guards
// ---------------------------------------------------------------------------

/** Every per-type schema, keyed by its `type` discriminator. */
export const processingMessageSchemas = {
  job_update: jobUpdateSchema,
  node_update: nodeUpdateSchema,
  generation_complete: generationCompleteSchema,
  node_progress: nodeProgressSchema,
  edge_update: edgeUpdateSchema,
  output_update: outputUpdateSchema,
  save_update: saveUpdateSchema,
  binary_update: binaryUpdateSchema,
  log_update: logUpdateSchema,
  terminal_update: terminalUpdateSchema,
  notification: notificationSchema,
  error: errorMessageSchema,
  tool_call_update: toolCallUpdateSchema,
  tool_result_update: toolResultUpdateSchema,
  task_update: taskUpdateSchema,
  step_result: stepResultSchema,
  planning_update: planningUpdateSchema,
  chunk: chunkSchema,
  prediction: predictionSchema,
  llm_call: llmCallUpdateSchema,
  todo_update: todoUpdateSchema,
  supervisor_escalation: supervisorEscalationSchema,
  supervisor_decision: supervisorDecisionSchema
} as const satisfies Record<MessageType, z.ZodType<ProcessingMessage>>;

/**
 * Cheap discriminant check shared by every `is*` guard below: narrows on
 * `type` alone (no field validation) so guards stay usable in hot paths.
 * Use `processingMessageSchemas[type].safeParse(value)` when a caller needs
 * full structural validation instead of just narrowing an already-trusted
 * `ProcessingMessage`.
 */
function hasType<T extends MessageType>(
  value: unknown,
  type: T
): value is { type: T } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === type
  );
}

export function isJobUpdate(value: unknown): value is JobUpdate {
  return hasType(value, "job_update");
}
export function isNodeUpdate(value: unknown): value is NodeUpdate {
  return hasType(value, "node_update");
}
export function isGenerationComplete(
  value: unknown
): value is GenerationComplete {
  return hasType(value, "generation_complete");
}
export function isNodeProgress(value: unknown): value is NodeProgress {
  return hasType(value, "node_progress");
}
export function isEdgeUpdate(value: unknown): value is EdgeUpdate {
  return hasType(value, "edge_update");
}
export function isOutputUpdate(value: unknown): value is OutputUpdate {
  return hasType(value, "output_update");
}
export function isSaveUpdate(value: unknown): value is SaveUpdate {
  return hasType(value, "save_update");
}
export function isBinaryUpdate(value: unknown): value is BinaryUpdate {
  return hasType(value, "binary_update");
}
export function isLogUpdate(value: unknown): value is LogUpdate {
  return hasType(value, "log_update");
}
export function isTerminalUpdate(value: unknown): value is TerminalUpdate {
  return hasType(value, "terminal_update");
}
export function isNotification(value: unknown): value is Notification {
  return hasType(value, "notification");
}
export function isErrorMessage(value: unknown): value is ErrorMessage {
  return hasType(value, "error");
}
export function isToolCallUpdate(value: unknown): value is ToolCallUpdate {
  return hasType(value, "tool_call_update");
}
export function isToolResultUpdate(value: unknown): value is ToolResultUpdate {
  return hasType(value, "tool_result_update");
}
export function isTaskUpdate(value: unknown): value is TaskUpdate {
  return hasType(value, "task_update");
}
export function isStepResult(value: unknown): value is StepResult {
  return hasType(value, "step_result");
}
export function isPlanningUpdate(value: unknown): value is PlanningUpdate {
  return hasType(value, "planning_update");
}
export function isChunk(value: unknown): value is Chunk {
  return hasType(value, "chunk");
}
export function isPrediction(value: unknown): value is Prediction {
  return hasType(value, "prediction");
}
export function isLLMCallUpdate(value: unknown): value is LLMCallUpdate {
  return hasType(value, "llm_call");
}
export function isTodoUpdate(value: unknown): value is TodoUpdate {
  return hasType(value, "todo_update");
}
export function isSupervisorEscalation(
  value: unknown
): value is SupervisorEscalation {
  return hasType(value, "supervisor_escalation");
}
export function isSupervisorDecision(
  value: unknown
): value is SupervisorDecision {
  return hasType(value, "supervisor_decision");
}

/** True when `value` is a structurally valid `ProcessingMessage`. */
export function isProcessingMessage(
  value: unknown
): value is ProcessingMessage {
  return processingMessageSchema.safeParse(value).success;
}

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
