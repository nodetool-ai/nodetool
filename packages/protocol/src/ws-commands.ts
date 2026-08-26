/**
 * @nodetool-ai/protocol – WebSocket inbound frame schemas
 *
 * `messages.ts` validates the server→client direction (`ProcessingMessage`).
 * This file is the client→server counterpart: the command envelope every
 * `run_job` / `cancel_job` / `stream_input` / … frame arrives in, plus the
 * handful of control frames that aren't wrapped in a `command` envelope
 * (`ping`, `client_tools_manifest`, `tool_result`, `tool_approval_response`,
 * `plan_approval_response`, `secret_request_response`, `renderer_tool_result`).
 *
 * Schemas here are intentionally loose: every field is optional (the
 * per-command handler in `unified-websocket-runner.ts` still decides what's
 * required and returns its own `{ error }` reply for missing fields — that
 * behavior predates this file and must not change), and `.passthrough()` is
 * used everywhere so an extra/forward-compatible field never fails
 * validation. What these schemas catch is *wrong shape*: a `string` where
 * the wire contract needs an `object`, a `graph` with `nodes`/`edges` that
 * aren't arrays, a `command` that isn't one of the known literals — the
 * "near-valid frame" class from the malformed-protocol journey, not
 * ordinary missing-optional-field traffic.
 */

import { z } from "zod";
import type { UnifiedCommandType } from "./messages.js";

// ---------------------------------------------------------------------------
// Command envelope
// ---------------------------------------------------------------------------

/**
 * Every literal of `UnifiedCommandType`, duplicated as a runtime tuple so
 * Zod can validate against it. Kept in exact sync with the type via the
 * compile-time assertion below — if the two ever drift, `typecheck` fails
 * here instead of silently accepting/rejecting the wrong commands at
 * runtime.
 */
export const UNIFIED_COMMAND_TYPES = [
  "run_job",
  "reconnect_job",
  "resume_job",
  "cancel_job",
  "update_node_properties",
  "get_status",
  "set_mode",
  "set_permission_mode",
  "clear_models",
  "stream_input",
  "end_input_stream",
  "chat_message",
  "resume_chat",
  "list_chat_turns",
  "inference",
  "stop",
  "list_workflows",
  "get_workflow",
  "list_assets",
  "get_asset",
  "list_nodes",
  "get_node",
  "generate_media",
  "generate_text",
  "transcribe_audio"
] as const;

type _AssertCommandTypesCoverType =
  (typeof UNIFIED_COMMAND_TYPES)[number] extends UnifiedCommandType
    ? UnifiedCommandType extends (typeof UNIFIED_COMMAND_TYPES)[number]
      ? true
      : never
    : never;
// If this line fails to typecheck, `UNIFIED_COMMAND_TYPES` above has drifted
// from `UnifiedCommandType` in messages.ts — add/remove the literal there too.
const _commandTypesMatch: _AssertCommandTypesCoverType = true;
void _commandTypesMatch;

export const unifiedCommandTypeSchema = z.enum(UNIFIED_COMMAND_TYPES);

/** Loose passthrough record — used for commands whose `data` payload is
 * validated further downstream (tRPC procedures) or isn't safety-critical
 * enough to warrant its own schema here. */
const looseDataSchema = z.record(z.string(), z.unknown());

const runJobGraphSchema = z
  .object({
    nodes: z.array(z.record(z.string(), z.unknown())),
    edges: z.array(z.record(z.string(), z.unknown()))
  })
  .passthrough();

export const runJobDataSchema = z
  .object({
    job_id: z.string().nullable().optional(),
    workflow_id: z.string().optional(),
    concurrent: z.boolean().optional(),
    user_id: z.string().optional(),
    auth_token: z.string().optional(),
    job_name: z.string().nullable().optional(),
    params: z.record(z.string(), z.unknown()).nullable().optional(),
    // MessagePack clients commonly encode an absent optional object as nil
    // instead of omitting its map key. Treat nil like absence for workflow
    // runs, where workflow_id supplies the graph.
    graph: runJobGraphSchema.nullable().optional(),
    explicit_types: z.boolean().optional(),
    require_terminal_result: z.boolean().optional(),
    execution_options: z
      .object({
        persistence: z.enum(["job", "session"]).optional(),
        event_detail: z.enum(["full", "outputs", "terminal"]).optional(),
        asset_persistence: z.enum(["auto", "temporary"]).optional()
      })
      .passthrough()
      .nullable()
      .optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    application_id: z.string().nullable().optional(),
    application_version: z.number().nullable().optional(),
    operation_id: z.string().nullable().optional()
  })
  .passthrough();

export const jobIdDataSchema = z
  .object({
    job_id: z.string().optional(),
    workflow_id: z.string().optional()
  })
  .passthrough();

export const streamInputDataSchema = z
  .object({
    job_id: z.string().optional(),
    input: z.string().optional(),
    value: z.unknown().optional(),
    handle: z.string().optional()
  })
  .passthrough();

export const endInputStreamDataSchema = z
  .object({
    job_id: z.string().optional(),
    input: z.string().optional(),
    handle: z.string().optional()
  })
  .passthrough();

export const updateNodePropertiesDataSchema = z
  .object({
    job_id: z.string().optional(),
    node_id: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export const getStatusDataSchema = z
  .object({
    job_id: z.string().optional()
  })
  .passthrough();

export const setModeDataSchema = z
  .object({
    mode: z.enum(["binary", "text"]).optional()
  })
  .passthrough();

export const chatMessageDataSchema = z
  .object({
    thread_id: z.string().optional()
  })
  .passthrough();

export const resumeChatDataSchema = z
  .object({
    thread_id: z.string().optional(),
    /**
     * Highest `chat_seq` the client has already received for this thread.
     * `0` (or omitted) declares a fresh client with no frame state — a page
     * that just reloaded. The server then replays only what persisted
     * history cannot provide (frames after the turn's last `message` frame)
     * and flags `replay_incomplete` so the client reconciles over REST.
     */
    last_seq: z.number().optional()
  })
  .passthrough();

export const reconnectJobDataSchema = z
  .object({
    job_id: z.string().optional(),
    workflow_id: z.string().optional(),
    /** Highest `job_seq` the client has already received for this job. */
    last_seq: z.number().optional()
  })
  .passthrough();

export const stopDataSchema = z
  .object({
    job_id: z.string().optional(),
    thread_id: z.string().optional()
  })
  .passthrough();

export const generateMediaDataSchema = z
  .object({
    mode: z.enum(["image", "image_edit", "inpaint", "video", "audio"]).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
    source_asset_id: z.string().optional(),
    mask_asset_id: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    aspect_ratio: z.string().optional(),
    resolution: z.string().optional(),
    strength: z.number().optional(),
    num_inference_steps: z.number().optional(),
    variations: z.number().optional(),
    voice: z.string().optional(),
    speed: z.number().optional(),
    audio_format: z.string().optional()
  })
  .passthrough();

export const transcribeAudioDataSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    asset_id: z.string().optional(),
    language: z.string().optional()
  })
  .passthrough();

/**
 * Per-command `data` schema lookup.
 *
 * Deliberately minimal: `handleCommand` already does its own `typeof`-guarded
 * extraction for almost every field and replies with a friendly
 * `{ error: "<field> is required" }` / `{ error: "<field> must be an object" }`
 * for anything mistyped — that behavior predates this file and this schema
 * layer must not shadow it with a differently-shaped `invalid_command`
 * rejection for input `handleCommand` already handles gracefully. Only
 * `run_job` gets a real schema here: its `graph` payload is handed to
 * `normalizeGraph`/`Graph.loadFromDict` with no `typeof` guard first, so a
 * wrong-shaped `graph` (a string, `nodes`/`edges` that aren't arrays, …) is
 * the "near-valid frame" case worth rejecting before it reaches hydration.
 * Every other command falls back to `looseDataSchema` (any object), which
 * only catches `data` not being an object at all — everything else is left
 * to `handleCommand`.
 */
/**
 * One message in a `generate_text` request. Role stays a bare string — the
 * runner maps anything it does not know onto "user" rather than rejecting the
 * frame, which is the loose-schema convention this file follows.
 */
const generateTextMessageSchema = z
  .object({
    role: z.string(),
    content: z.string()
  })
  .passthrough();

/**
 * `generate_text` gets a real schema for the same reason `run_job` does: its
 * `schema` payload becomes a tool's `inputSchema` and its `messages` are
 * mapped without a shape guard first, so a string where an object belongs, or
 * a `messages` that is not an array, is worth rejecting before it reaches the
 * provider. What is required is still `handleCommand`'s call.
 */
export const generateTextDataSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
    system: z.string().optional(),
    messages: z.array(generateTextMessageSchema).optional(),
    max_tokens: z.number().int().positive().optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    schema_name: z.string().optional(),
    schema_description: z.string().optional()
  })
  .passthrough();

/**
 * Request payload for the `generate_text` RPC — one LLM call, no thread, no
 * workflow, no job row. The text twin of `GenerateMediaRequest`, and how a
 * surface that needs a model to write or decide something reaches one without
 * authoring a graph to hold a single node.
 *
 * With `schema` set the call becomes structured output: the model is forced
 * to answer through one tool whose input schema is that shape, and the
 * response carries the parsed object in `data`. Without it the response
 * carries `text`.
 *
 * Unlike the `inference` command this does not stream — the caller wants the
 * finished answer, correlated to its `request_id`.
 */
export type GenerateTextRequest = z.infer<typeof generateTextDataSchema>;

export const commandDataSchemas = {
  run_job: runJobDataSchema,
  reconnect_job: reconnectJobDataSchema,
  resume_job: reconnectJobDataSchema,
  cancel_job: looseDataSchema,
  update_node_properties: looseDataSchema,
  get_status: looseDataSchema,
  set_mode: looseDataSchema,
  set_permission_mode: looseDataSchema,
  clear_models: looseDataSchema,
  stream_input: looseDataSchema,
  end_input_stream: looseDataSchema,
  chat_message: looseDataSchema,
  resume_chat: resumeChatDataSchema,
  list_chat_turns: looseDataSchema,
  inference: looseDataSchema,
  stop: looseDataSchema,
  list_workflows: looseDataSchema,
  get_workflow: looseDataSchema,
  list_assets: looseDataSchema,
  get_asset: looseDataSchema,
  list_nodes: looseDataSchema,
  get_node: looseDataSchema,
  generate_media: looseDataSchema,
  generate_text: generateTextDataSchema,
  transcribe_audio: looseDataSchema
} satisfies Record<UnifiedCommandType, z.ZodTypeAny>;

/**
 * The envelope every streaming/RPC command frame arrives in. `data` defaults
 * to `{}` (mirrors `command.data ?? {}` in `handleCommand`) and is loose here
 * — the per-command schema in `commandDataSchemas` validates its contents.
 *
 * `command` is deliberately `z.string()`, not the closed `unifiedCommandTypeSchema`
 * enum: an unrecognized command is not a malformed frame, it's a request for a
 * command this server build doesn't have — `handleCommand`'s `switch` already
 * replies `{ error: "Unknown command" }` for that, and this schema must not
 * pre-empt it (doing so would turn a graceful "unknown command" reply into an
 * envelope-rejection with a different shape for the same input).
 */
export const webSocketCommandEnvelopeSchema = z
  .object({
    command: z.string().min(1),
    data: looseDataSchema.optional(),
    // Non-RPC MessagePack clients may encode the unused optional key as nil.
    request_id: z.string().nullable().optional()
  })
  .passthrough();

export type WebSocketCommandEnvelopeShape = z.infer<
  typeof webSocketCommandEnvelopeSchema
>;

// ---------------------------------------------------------------------------
// Control frames (no `command` envelope)
// ---------------------------------------------------------------------------

export const pingMessageInSchema = z
  .object({
    type: z.literal("ping"),
    ts: z.number().optional()
  })
  .passthrough();

export const pongMessageInSchema = z
  .object({
    type: z.literal("pong"),
    ts: z.number().optional()
  })
  .passthrough();

export const clientToolManifestMessageInSchema = z
  .object({
    type: z.literal("client_tools_manifest"),
    tools: z.array(z.unknown()).optional()
  })
  .passthrough();

export const toolResultMessageInSchema = z
  .object({
    type: z.literal("tool_result"),
    tool_call_id: z.string().optional()
  })
  .passthrough();

/** Result of a server/MCP request to execute a frontend tool in this renderer. */
export const rendererToolResultMessageInSchema = z
  .discriminatedUnion("ok", [
    z
      .object({
        type: z.literal("renderer_tool_result"),
        renderer_id: z.string().min(1),
        tool_call_id: z.string().min(1),
        ok: z.literal(true),
        result: z.unknown().optional(),
        error: z.never().optional(),
        elapsed_ms: z.number().nonnegative().optional()
      })
      .passthrough(),
    z
      .object({
        type: z.literal("renderer_tool_result"),
        renderer_id: z.string().min(1),
        tool_call_id: z.string().min(1),
        ok: z.literal(false),
        result: z.never().optional(),
        error: z.string().min(1),
        elapsed_ms: z.number().nonnegative().optional()
      })
      .passthrough()
  ]);

export const toolApprovalResponseMessageInSchema = z
  .object({
    type: z.literal("tool_approval_response"),
    approval_id: z.string().optional()
  })
  .passthrough();

export const planApprovalResponseMessageInSchema = z
  .object({
    type: z.literal("plan_approval_response"),
    approval_id: z.string().optional()
  })
  .passthrough();

/**
 * The client's answer to a `secret_request` frame — the bespoke dialog the
 * `request_secret` capability opens when sandboxed code needs a credential the
 * install does not hold.
 *
 * `saved` means the user typed a value and the dialog wrote it through
 * `settings.secrets.upsert`; `declined` means they closed it. **The value is
 * never in this frame.** It travels browser → tRPC → secret store, so the run
 * that asked learns only that a secret now exists, and reads it — if at all —
 * back through `nodetool.secrets.get` under its own declared scope.
 */
export const secretRequestResponseMessageInSchema = z
  .object({
    type: z.literal("secret_request_response"),
    approval_id: z.string().optional(),
    status: z.enum(["saved", "declined"]).optional()
  })
  .passthrough();

/** Every known control-frame `type`, keyed for lookup by the WS runner. */
export const controlMessageInSchemas = {
  ping: pingMessageInSchema,
  pong: pongMessageInSchema,
  client_tools_manifest: clientToolManifestMessageInSchema,
  tool_result: toolResultMessageInSchema,
  renderer_tool_result: rendererToolResultMessageInSchema,
  tool_approval_response: toolApprovalResponseMessageInSchema,
  plan_approval_response: planApprovalResponseMessageInSchema,
  secret_request_response: secretRequestResponseMessageInSchema
} as const;

export type ControlMessageInType = keyof typeof controlMessageInSchemas;

// ---------------------------------------------------------------------------
// Outbound-only server→client frames
// ---------------------------------------------------------------------------
//
// `processingMessageSchemas` (messages.ts) already covers every
// `ProcessingMessage` variant. These are the remaining `WebSocketServerMessage`
// shapes that carry a recognizable `type` but aren't part of that union —
// `pong`, `rpc_response`, `system_stats`, `resource_change`. Together with
// `processingMessageSchemas` they back the outbound validation gate in
// `unified-websocket-runner.ts` (`NODETOOL_VALIDATE_OUTBOUND_WS`). A frame
// whose `type` matches neither map is intentionally left unvalidated — the
// runner also sends ad hoc, type-less reply objects
// (`{ error: "invalid_command", details }`, `{ message: "Job started" }`,
// …) that were never meant to conform to a schema.

export const rpcErrorPayloadOutSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    apiCode: z.string().nullable().optional(),
    trpcCode: z.string().optional()
  })
  .passthrough();

export const rpcResponseMessageOutSchema = z
  .object({
    type: z.literal("rpc_response"),
    request_id: z.string(),
    command: z.string(),
    result: z.unknown().optional(),
    error: rpcErrorPayloadOutSchema.optional()
  })
  .passthrough();

export const pongMessageOutSchema = z
  .object({
    type: z.literal("pong"),
    ts: z.number()
  })
  .passthrough();

export const systemStatsMessageOutSchema = z
  .object({
    type: z.literal("system_stats"),
    stats: z.record(z.string(), z.unknown())
  })
  .passthrough();

export const resourceChangeMessageOutSchema = z
  .object({
    type: z.literal("resource_change"),
    event: z.enum(["created", "updated", "deleted"]),
    resource_type: z.string(),
    resource: z.record(z.string(), z.unknown())
  })
  .passthrough();

export const rendererRegisteredMessageOutSchema = z
  .object({
    type: z.literal("renderer_registered"),
    renderer_id: z.string().min(1)
  })
  .passthrough();

/** Server request to execute a frontend tool without a chat thread. */
export const rendererToolCallMessageOutSchema = z
  .object({
    type: z.literal("renderer_tool_call"),
    renderer_id: z.string().min(1),
    tool_call_id: z.string().min(1),
    name: z.string().min(1),
    args: z.unknown()
  })
  .passthrough();

/**
 * Reply to a `resume_chat` command. Sent before any replayed frames.
 *
 * `status` reports what the server holds for the thread's latest turn:
 * `"running"` (turn still executing; replay is followed by live frames),
 * `"finished"` (turn completed while the client was away; replay is the
 * whole tail), or `"unknown"` (nothing to replay — either no turn ran, or
 * the retention window elapsed; the client should refetch thread history).
 * `replay_incomplete` is true when the requested `last_seq` predates what
 * the bounded buffer still holds.
 */
export const chatResumedMessageOutSchema = z
  .object({
    type: z.literal("chat_resumed"),
    thread_id: z.string(),
    status: z.enum(["running", "finished", "unknown"]),
    last_seq: z.number(),
    replay_count: z.number(),
    replay_incomplete: z.boolean()
  })
  .passthrough();

/**
 * Reply to a `list_chat_turns` command, one frame per chat turn still
 * running for the requesting user. A client that starts with no local state
 * (a fresh page after a reload) sends `list_chat_turns` to discover threads
 * whose agent turn survived on the server, then reattaches each with
 * `resume_chat`. Routed by `thread_id` like every other chat frame.
 */
export const chatTurnActiveMessageOutSchema = z
  .object({
    type: z.literal("chat_turn_active"),
    thread_id: z.string(),
    status: z.literal("running"),
    last_seq: z.number()
  })
  .passthrough();

/**
 * Reply to a `reconnect_job` / `resume_job` command. Sent before any
 * replayed frames.
 *
 * `status` reports what the server holds for the job: `"running"` (the run
 * is still executing on some connection's runner; replay is followed by live
 * frames) or `"finished"` (the run ended while the client was away; replay
 * is the whole tail). `"unknown"` is declared for parity with
 * `chat_resumed` but is never sent today: with no replayable session the
 * server answers `reconnect_job` with a plain `job_update` carrying the
 * persisted row's outcome instead of this header.
 *
 * `replay_incomplete` is true when the requested `last_seq` predates what the
 * bounded buffer still holds.
 */
export const jobResumedMessageOutSchema = z
  .object({
    type: z.literal("job_resumed"),
    job_id: z.string(),
    workflow_id: z.string().nullable().optional(),
    status: z.enum(["running", "finished", "unknown"]),
    last_seq: z.number(),
    replay_count: z.number(),
    replay_incomplete: z.boolean()
  })
  .passthrough();

/** Non-`ProcessingMessage` outbound frame schemas, keyed by `type`. */
export const outboundControlMessageSchemas = {
  pong: pongMessageOutSchema,
  rpc_response: rpcResponseMessageOutSchema,
  system_stats: systemStatsMessageOutSchema,
  resource_change: resourceChangeMessageOutSchema,
  renderer_registered: rendererRegisteredMessageOutSchema,
  renderer_tool_call: rendererToolCallMessageOutSchema,
  chat_resumed: chatResumedMessageOutSchema,
  chat_turn_active: chatTurnActiveMessageOutSchema,
  job_resumed: jobResumedMessageOutSchema
} as const;
