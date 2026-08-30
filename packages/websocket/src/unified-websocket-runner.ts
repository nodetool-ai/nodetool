import { randomUUID } from "node:crypto";
import { getSetting } from "./settings-registry.js";
import { ApiErrorCode } from "./error-codes.js";
import { ConfiguredProviderCache } from "./configured-providers.js";
import { admitSpend, releaseSpend, reserveSpend } from "./credit-gate.js";
import { JobConcurrencyQueue } from "./job-queue.js";
import { packWebSocketMessage, unpackWebSocketMessage } from "./messagepack.js";
import { createLogger, getByteLimitEnv } from "@nodetool-ai/config";
import { getAssetAdapter } from "./lib/storage.js";
import {
  isBoolean,
  isFiniteNumber,
  isFunctionValue,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "./lib/wire-values.js";
import {
  resourceEvents,
  type ResourceChangePayload
} from "./resource-events.js";
import {
  createSystemStatsSampler,
  systemStatsBroadcastEnabled
} from "./system-stats.js";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";
import { resolveContentUrls } from "./resolve-media-urls.js";
import {
  Graph,
  withExplicitNodeFlags,
  type NodeExecutor,
  type NodeTypeResolver,
  type NodeValidator
} from "@nodetool-ai/kernel";
import {
  ExecutionSession,
  isExecutionPreflightError,
  isUnitBilledCapability,
  priceGeneration,
  toRawGraphInput
} from "@nodetool-ai/execution";
import { createRunSupervisor } from "./run-supervisor.js";
import {
  chatTurnRegistry,
  type ChatTurnExecutionHooks,
  type ChatTurnSession
} from "./chat-turn-registry.js";
import {
  jobRunRegistry,
  type JobRunExecutionHooks,
  type JobRunSession
} from "./job-run-registry.js";
import {
  Application,
  Asset,
  Job,
  listApplicationVersions,
  invocationBelongsToApplication,
  invocationIdInUse,
  releasedApplicationRelease,
  releasedApplicationVersion,
  reserveInvocation,
  settleInvocation,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  Prediction,
  Workflow,
  type DBModel
} from "@nodetool-ai/models";
import { getInstanceId } from "./lib/instance-id.js";
import { requestRemoteJobCancel } from "./job-control.js";
import {
  estimateWorkflowCost,
  nodeExpectedQuantity,
  type WorkflowCostEstimateDetail
} from "@nodetool-ai/node-sdk/cost-estimate";
import { extractPricingParams } from "@nodetool-ai/node-sdk/pricing-params";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";
import type {
  ProviderTool,
  Message as ProviderMessage,
  MessageContent,
  BaseProvider,
  ProcessingContext,
  ImageModel as ProviderImageModel,
  VideoModel as ProviderVideoModel,
  TextToImageParams,
  TextToVideoParams,
  ImageToImageParams,
  InpaintingParams,
  ImageToVideoParams,
  PromptAssetRef
} from "@nodetool-ai/runtime";
import {
  ProcessingContext as RuntimeProcessingContext,
  detectImageMime,
  IMAGE_MIME_TO_EXT,
  calculateChatCost,
  expandEntitiesForGeneration,
  fetchExternalMedia,
  generateStructured,
  messageText,
  type Workspace
} from "@nodetool-ai/runtime";
import { applicationReleaseResponse } from "@nodetool-ai/protocol/api-schemas/applications.js";
import type {
  GraphData,
  HydratedGraphData,
  NodeDescriptor,
  ProviderCost,
  SupervisorRunOptions
} from "@nodetool-ai/protocol";
import {
  isSdkV1RetryableError
} from "@nodetool-ai/protocol/api-schemas/sdk-v1.js";
import type {
  UnifiedCommandType,
  WebSocketCommandEnvelope,
  WebSocketMode,
  RpcErrorPayload
} from "@nodetool-ai/protocol";
import {
  resolveNodetoolDelegate,
  webSocketCommandEnvelopeSchema,
  commandDataSchemas,
  controlMessageInSchemas,
  outboundControlMessageSchemas,
  processingMessageSchemas,
  type ControlMessageInType
} from "@nodetool-ai/protocol";
import { type SandboxClock } from "@nodetool-ai/agents";
import { type CapabilityRun } from "@nodetool-ai/agents";
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import { appRouter } from "./trpc/router.js";
import { createCallerFactory } from "./trpc/index.js";
import type { HttpApiOptions } from "./http-api.js";
import { retrieveAssetBytes } from "./lib/asset-paths.js";
import { resolveImageSize } from "./lib/media-size.js";
import {
  confineRunRequest,
  isAppSessionCommandAllowed,
  isRunRefusal,
  type AppSessionScope
} from "./lib/app-session-scope.js";
import { releaseBlockedReason } from "./lib/app-deployment-service.js";
import type {
  FrontendRendererRegistry,
  FrontendRendererToolCall,
  FrontendRendererToolResult
} from "./frontend-renderer-registry.js";
import {
  autoSaveAssets,
  encodeNativeAudioChunks,
  primaryTextOutputName
} from "./session/asset-autosave.js";
import {
  buildChatAgentSystemPrompt,
  CHAT_AGENT_SYSTEM_PROMPT,
  focusedUiToolNames,
  normalizeToolCallName,
  RESIDENT_TOOL_NAMES,
  unroutableToolMessage
} from "./session/chat-prompt.js";
import {
  createRuntimeContext,
  serverModelInterfaces
} from "./session/model-interfaces.js";
import {
  formatSanitizedError,
  sanitizeLargeText,
  type JsonSafeValue
} from "./session/sanitize.js";
import {
  attachPlanApproval as attachPlanApprovalTo,
  extractTextContent as extractMessageText
} from "./session/chat-history.js";

// The pure helpers moved to ./session/*; re-exported here so every existing
// import path keeps working.
export {
  CHAT_AGENT_SYSTEM_PROMPT,
  RESIDENT_TOOL_NAMES,
  buildChatAgentSystemPrompt,
  focusedUiToolNames,
  normalizeToolCallName,
  primaryTextOutputName,
  serverModelInterfaces,
  unroutableToolMessage
};
import type { ClientSession } from "./session/client-session.js";
import { ChatTurnHandler } from "./session/chat-turn.js";

const log = createLogger("nodetool.websocket.runner");
const TERMINAL_JOB_STATUSES = [
  "completed",
  "failed",
  "cancelled",
  "error"
];

/**
 * Largest binary (MsgPack) frame accepted from a client before deserialization.
 * MsgPack can amplify a small payload into a huge in-memory structure, so the
 * raw byte length is bounded up front. Override with the
 * `NODETOOL_WS_MAX_MESSAGE_BYTES` environment variable (value in bytes);
 * default 256 MiB.
 */
const DEFAULT_MAX_WS_MESSAGE_BYTES = 256 * 1024 * 1024;
function getMaxWsMessageBytes(): number {
  return getByteLimitEnv(
    "NODETOOL_WS_MAX_MESSAGE_BYTES",
    DEFAULT_MAX_WS_MESSAGE_BYTES
  );
}

/**
 * Outbound (server→client) frame validation gate. Every message `sendMessage`
 * emits whose `type` matches a known `ProcessingMessage` variant or one of
 * the small set of non-`ProcessingMessage` server frames (`pong`,
 * `rpc_response`, `system_stats`, `resource_change`) is safe-parsed against
 * its Zod schema before it goes on the wire; frames with an unrecognized (or
 * absent) `type` — the ad hoc `{ error, details }` command replies — are left
 * alone, as they always have been.
 *
 * Set `NODETOOL_VALIDATE_OUTBOUND_WS=1` to force validation on, `=0` to force
 * it off. Unset, it defaults to on under `NODE_ENV=test` or Vitest (`VITEST`)
 * and off everywhere else — a server bug that produces a malformed frame
 * should fail the test that exercised it, not corrupt a production
 * connection with a thrown error mid-stream. On failure it throws (the
 * caller — `sendMessage` — is already inside the code path the bug is in, so
 * failing loudly there is what surfaces it to the test).
 */
function shouldValidateOutboundWs(): boolean {
  const override = process.env["NODETOOL_VALIDATE_OUTBOUND_WS"]?.trim();
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return process.env["NODE_ENV"] === "test" || Boolean(process.env["VITEST"]);
}

/**
 * Throws when outbound validation is enabled and `message` carries a `type`
 * this package can validate but fails to conform to its schema. No-op for
 * unrecognized/absent `type` values — see {@link shouldValidateOutboundWs}.
 */
function assertValidOutboundMessage(message: Record<string, unknown>): void {
  if (!shouldValidateOutboundWs()) return;
  const type = isString(message["type"]) ? message["type"] : null;
  if (!type) return;
  const schema =
    processingMessageSchemas[type as keyof typeof processingMessageSchemas] ??
    outboundControlMessageSchemas[
      type as keyof typeof outboundControlMessageSchemas
    ];
  if (!schema) return;
  const parsed = schema.safeParse(message);
  if (!parsed.success) {
    throw new Error(
      `Outbound WebSocket message failed protocol validation (type: "${type}"): ` +
        parsed.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
          )
          .join("; ")
    );
  }
}

export interface WebSocketReceiveFrame {
  type: string;
  bytes?: Uint8Array | null;
  text?: string | null;
}

export interface WebSocketConnection {
  accept(): Promise<void>;
  receive(): Promise<WebSocketReceiveFrame>;
  sendBytes(data: Uint8Array): Promise<void>;
  sendText(data: string): Promise<void>;
  close(code?: number, reason?: string): Promise<void>;
  clientState?: "connected" | "disconnected";
  applicationState?: "connected" | "disconnected";
}

export interface RunJobRequest {
  job_id?: string;
  workflow_id?: string;
  /** Allow this run to start even if its workflow already has a run in flight. */
  concurrent?: boolean;
  user_id?: string;
  auth_token?: string;
  /** Human-readable run title; persisted as the job name. */
  job_name?: string;
  params?: Record<string, unknown>;
  graph?: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  explicit_types?: boolean;
  /** SDK opt-in: completed job updates are terminal only when they carry result.outputs. */
  require_terminal_result?: boolean;
  /** Optional SDK fast-path relaxations. Missing/invalid values use current defaults. */
  execution_options?: {
    persistence?: "job" | "session";
    event_detail?: "full" | "outputs" | "terminal";
    asset_persistence?: "auto" | "temporary";
  };
  /**
   * Supervise this run (docs/workflow-supervisor-design.md). Off unless the
   * client asks: supervision sends failure context to a model, so nothing else
   * on the request implies it.
   */
  supervise?: boolean;
  /** Supervisor configuration. Ignored unless `supervise` is true. */
  supervisor?: SupervisorRunOptions | null;
  /** Internal monotonic timestamp captured when runJob accepts the request. */
  _accepted_at_ms?: number;
  settings?: Record<string, unknown>;
  /**
   * The mini app this run belongs to, when one started it. Present only for
   * app runs: the server checks the app's spend budget before creating the job
   * and settles the ledger row when the run finishes.
   */
  application_id?: string | null;
  /** Released version the run executes against; absent for a draft run. */
  application_version?: number | null;
  /**
   * The app operation this run implements. Recorded on the ledger row so
   * per-operation governance reports come from real runs rather than being
   * inferred from workflow ids. Optional — a client that omits it still runs,
   * its rows just carry no operation.
   */
  operation_id?: string | null;
}

export interface RunJobExecutionOptions {
  persistence: "job" | "session";
  eventDetail: "full" | "outputs" | "terminal";
  assetPersistence: "auto" | "temporary";
}

export const DEFAULT_RUN_JOB_EXECUTION_OPTIONS: Readonly<RunJobExecutionOptions> =
  Object.freeze({
    persistence: "job",
    eventDetail: "full",
    assetPersistence: "auto"
  });

export function resolveRunJobExecutionOptions(
  value: RunJobRequest["execution_options"],
  sdkDefaults = false
): RunJobExecutionOptions {
  return {
    persistence: value?.persistence === "session" ? "session" : "job",
    eventDetail:
      value?.event_detail === "outputs" || value?.event_detail === "terminal"
        ? value.event_detail
        : "full",
    assetPersistence:
      value?.asset_persistence === "temporary" ||
      (value?.asset_persistence == null && sdkDefaults)
        ? "temporary"
        : "auto"
  };
}

export function resolveRunJobUserId(
  requestUserId: string | undefined,
  connectionUserId: string | null
): string {
  return requestUserId?.trim() || connectionUserId?.trim() || "1";
}

interface DirectMediaGenerationRequest {
  mode: "image" | "image_edit" | "inpaint" | "video" | "video_edit" | "audio";
  provider: string;
  model: string;
  prompt: string;
  sourceAssetId?: string;
  maskAssetId?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  strength?: number;
  numInferenceSteps?: number;
  durationSeconds?: number;
  variations?: number;
  voice?: string;
  speed?: number;
  audioFormat?: string;
}

/**
 * Chars per token for the up-front spend estimate. Deliberately low (real
 * English averages nearer 4) so the estimate over-books rather than under.
 */
const ESTIMATE_CHARS_PER_TOKEN = 3;

/** Output budget assumed when a request names no `max_tokens`. */
const ESTIMATE_DEFAULT_OUTPUT_TOKENS = 4096;

/**
 * A conservative up-front price for one text generation, in USD: every
 * character the messages carry counted as input tokens, plus the request's
 * whole output budget as output tokens, at the delegate model's rate.
 *
 * It over-estimates on purpose. The figure is what gets *reserved* for the
 * duration of the call, and the real cost replaces it afterwards — an
 * over-booking that is released beats letting concurrent calls each admit
 * against a balance none of them has spent yet.
 */
export function estimateDirectTextSpend(req: {
  provider: string;
  model: string;
  messages: Array<{ content: string }>;
  maxTokens?: number;
}): number {
  const delegate =
    req.provider === "nodetool" ? resolveNodetoolDelegate(req.model) : null;
  const modelId = delegate?.model ?? req.model;
  const providerId = delegate?.provider ?? req.provider;
  const chars = req.messages.reduce((sum, m) => sum + m.content.length, 0);
  const inputTokens = Math.ceil(chars / ESTIMATE_CHARS_PER_TOKEN);
  const outputTokens = req.maxTokens ?? ESTIMATE_DEFAULT_OUTPUT_TOKENS;
  try {
    return calculateChatCost(modelId, inputTokens, outputTokens, 0, providerId);
  } catch {
    // An unpriced model estimates at zero: the gate still admits against the
    // balance, and the real cost is recorded when the call returns.
    return 0;
  }
}

interface DirectTextGenerationRequest {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  /** Present → the call is structured output against this JSON Schema. */
  schema?: Record<string, unknown>;
  schemaName: string;
  schemaDescription: string;
}

export interface ActiveJob {
  jobId: string;
  workflowId: string | null;
  context: ProcessingContext;
  session: ExecutionSession;
  graph: HydratedGraphData;
  finished: boolean;
  status: "running" | "completed" | "failed" | "cancelled";
  error?: string;
  requireTerminalResult: boolean;
  executionOptions: RunJobExecutionOptions;
  timings: {
    acceptedAt: number;
    queueMs: number;
    graphLoadedMs: number;
    graphHydratedMs: number;
    preRunMs: number;
    persistenceMs: number;
    kernelStartedAt: number;
  };
  streamTask?: Promise<void>;
  /**
   * The detachable session this run's frames are stamped and buffered into,
   * so a client that drops mid-run can replay what it missed. Absent for runs
   * this connection never registered (a chat-triggered workflow run).
   */
  runSession?: JobRunSession;
  /** Running sum of node-level provider charges (e.g. kie credits) for this run. */
  providerCostTotal?: number;
  /**
   * Ledger-priced generation spend, per node id, for `prediction` messages the
   * cost ledger prices against the model catalogs (Replicate, Gemini, OpenAI,
   * MiniMax, ElevenLabs). Kept per node so a node that also reports its own
   * `provider_cost` — the provider's own number, which wins — is not counted
   * twice, whichever message arrives first.
   */
  predictionCostByNode?: Map<string, number>;
  /** Node ids that reported a charge of their own on a completed `node_update`. */
  selfReportedCostNodeIds?: Set<string>;
  /** Mini app this run belongs to, when one started it. Drives budget settlement. */
  applicationId?: string | null;
}

/** Highest `job_seq` a resubscribing client claims to already hold. */
function resumeLastSeq(data: Record<string, unknown>): number {
  const raw = data["last_seq"];
  return isFiniteNumber(raw) && raw > 0 ? raw : 0;
}

export function createRelayActivityWaiter(
  context: Pick<ProcessingContext, "addMessageListener" | "hasMessages">,
  executionSettled: Promise<void>,
  abortSignal?: AbortSignal
): () => Promise<void> {
  let pending = context.hasMessages();
  let resolveWaiter: (() => void) | null = null;
  let disposed = false;

  const notify = (): void => {
    pending = true;
    const resolve = resolveWaiter;
    resolveWaiter = null;
    resolve?.();
  };

  const removeMessageListener = context.addMessageListener(notify);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    removeMessageListener();
    abortSignal?.removeEventListener("abort", onAbort);
  };
  const settle = (): void => {
    notify();
    dispose();
  };
  const onAbort = (): void => settle();
  if (abortSignal?.aborted) {
    settle();
  } else {
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  }
  void executionSettled.then(settle, settle);

  return async (): Promise<void> => {
    if (pending) {
      pending = false;
      return;
    }
    await new Promise<void>((resolve) => {
      resolveWaiter = resolve;
    });
    pending = false;
  };
}

export class ToolBridge {
  private waiters = new Map<
    string,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
      scope?: string;
    }
  >();

  createWaiter(
    toolCallId: string,
    timeoutMs = 300_000,
    scope?: string
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.waiters.delete(toolCallId);
      };
      const wrappedResolve = (value: Record<string, unknown>) => {
        cleanup();
        resolve(value);
      };
      const wrappedReject = (reason: Error) => {
        cleanup();
        reject(reason);
      };
      this.waiters.set(toolCallId, {
        resolve: wrappedResolve,
        reject: wrappedReject,
        scope
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (this.waiters.has(toolCallId)) {
            wrappedReject(
              new Error(
                `Tool call ${toolCallId} timed out after ${timeoutMs}ms`
              )
            );
          }
        }, timeoutMs);
      }
    });
  }

  resolveResult(toolCallId: string, payload: Record<string, unknown>): void {
    const waiter = this.waiters.get(toolCallId);
    if (!waiter) return;
    waiter.resolve(payload);
  }

  /** Resolve every waiter in `scope` with the same payload. */
  resolveScope(scope: string, payload: Record<string, unknown>): void {
    for (const waiter of [...this.waiters.values()]) {
      if (waiter.scope === scope) {
        waiter.resolve(payload);
      }
    }
  }

  rejectResult(toolCallId: string, error: Error): void {
    const waiter = this.waiters.get(toolCallId);
    if (!waiter) return;
    waiter.reject(error);
  }

  cancelAll(): void {
    const error = new Error("All pending tool calls cancelled");
    for (const waiter of this.waiters.values()) {
      waiter.reject(error);
    }
    this.waiters.clear();
  }

  cancelScope(scope: string): void {
    const error = new Error(`Pending tool calls cancelled for ${scope}`);
    for (const [id, waiter] of this.waiters) {
      if (waiter.scope === scope) {
        waiter.reject(error);
        this.waiters.delete(id);
      }
    }
  }

  /**
   * Cancel every pending call except those scoped to `scope`. Used on
   * disconnect when a detached chat turn stays alive: its client tool calls
   * survive (the replay re-delivers the `tool_call` frames, so a reconnecting
   * client can still answer them) while everything else is rejected.
   */
  cancelAllExcept(scope: string): void {
    const error = new Error("All pending tool calls cancelled");
    for (const [id, waiter] of this.waiters) {
      if (waiter.scope === scope) continue;
      waiter.reject(error);
      this.waiters.delete(id);
    }
  }
}

export interface UnifiedWebSocketRunnerOptions {
  userId?: string;
  authToken?: string;
  /**
   * The app a deployed-app visitor may act on. Absent for every ordinary
   * session, which is what keeps this a narrowing and never a widening.
   */
  appSession?: AppSessionScope | null;
  defaultModel?: string;
  defaultProvider?: string;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
  resolveNodeType?: NodeTypeResolver;
  resolveProvider?: (
    providerId: string,
    userId: string
  ) => Promise<BaseProvider>;
  getSystemStats?: () => Record<string, unknown>;
  /**
   * Whether to broadcast `system_stats` to this client. Defaults to off on a
   * server that enforces auth: there the CPU/RAM belong to a shared container
   * the user does not own, so the readout is both wrong for them and a report
   * on someone else's host. Defaults to on for a local install, which is the
   * machine the numbers describe. See `systemStatsBroadcastEnabled`, which
   * also reads the `NODETOOL_SYSTEM_STATS` override.
   */
  systemStatsEnabled?: boolean;
  /**
   * Resolve the workspace directory for a run. `workflowId` is null for a chat
   * turn, which resolves to the user's default workspace — chat writes files
   * too, and they belong somewhere the user can find them.
   */
  workspaceResolver?: (
    workflowId: string | null,
    userId: string
  ) => Promise<Workspace | null>;
  /** Called before a workflow job starts — used to lazily connect the Python bridge. */
  beforeRunJob?: (graph: {
    nodes: ReadonlyArray<NodeDescriptor>;
  }) => Promise<void>;
  /** Resolve node metadata by type — used for auto_save_asset detection. */
  getNodeMetadata?: (nodeType: string) => NodeMetadata | undefined;
  /**
   * Optional pre-flight per-node validator. Forwarded through ExecutionSession to WorkflowRunner so
   * missing required fields and unset model selections abort the run before
   * any actor is spawned. `NodeRegistry.createNodeValidator()` from
   * `@nodetool-ai/node-sdk` produces a compatible callback.
   */
  validateNode?: NodeValidator;
  /**
   * Optional NodeRegistry. When supplied, MCP node tools surfaced to the
   * chat agent (`list_nodes`, `search_nodes`, etc.) read from this registry.
   */
  nodeRegistry?: NodeRegistry;
  /**
   * Python stdio bridge. Required to serve the read-only RPC commands
   * (list_workflows / get_workflow / list_assets / get_asset / list_nodes /
   * get_node) which delegate to the existing tRPC routers; those routers
   * accept the bridge in their context. Plain workflow execution and chat
   * keep working without it.
   */
  pythonBridge?: PythonBridge;
  /** Whether the Python bridge has finished hydrating. Same wiring as the tRPC HTTP context. */
  getPythonBridgeReady?: () => boolean;
  /** API options forwarded into the tRPC context (metadata roots, registry, etc.). */
  apiOptions?: HttpApiOptions;
  /** Registry used to expose this /ws connection as a live browser renderer. */
  frontendRendererRegistry?: FrontendRendererRegistry;
}

export interface SdkExecutionCapacitySnapshot {
  inFlightJobs: number;
  maxConcurrentJobs: number;
  queuedJobs: number;
  workflowInFlightJobs: number;
  maxConcurrentRunsForWorkflow: number;
  likelyQueued: boolean;
}

/** A workflow graph as it arrives on the wire, before hydration. */
type RawGraphData = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

/** The shape `crypto.randomUUID()` produces, on either side of the wire. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UnifiedWebSocketRunner implements ClientSession {
  websocket: WebSocketConnection | null = null;
  mode: WebSocketMode = "binary";
  userId: string | null;
  authToken: string | null;
  /**
   * Set when this connection was opened by a visitor to a deployed app's
   * hidden URL. `userId` is then the app's owner, so nothing downstream can
   * tell the two apart on its own — this is what does.
   */
  appSession: AppSessionScope | null;

  private defaultModel: string;
  private defaultProvider: string;
  readonly resolveExecutor: UnifiedWebSocketRunnerOptions["resolveExecutor"];
  readonly resolveNodeType?: UnifiedWebSocketRunnerOptions["resolveNodeType"];
  readonly resolveProvider?: UnifiedWebSocketRunnerOptions["resolveProvider"];
  private getSystemStats: () => Record<string, unknown>;
  private systemStatsEnabled: boolean;
  readonly workspaceResolver?: UnifiedWebSocketRunnerOptions["workspaceResolver"];
  private beforeRunJob?: UnifiedWebSocketRunnerOptions["beforeRunJob"];
  readonly getNodeMetadata?: UnifiedWebSocketRunnerOptions["getNodeMetadata"];
  readonly validateNode?: UnifiedWebSocketRunnerOptions["validateNode"];
  readonly nodeRegistry?: NodeRegistry;
  readonly pythonBridge?: PythonBridge;
  private getPythonBridgeReady?: () => boolean;
  private apiOptions?: HttpApiOptions;
  private frontendRendererRegistry?: FrontendRendererRegistry;
  private frontendRendererId: string | null = null;
  private configuredProvidersCache = new ConfiguredProviderCache({
    load: (userId) => this.buildConfiguredProviders(userId)
  });

  private sendLock: Promise<void> = Promise.resolve();
  private activeJobs = new Map<string, ActiveJob>();
  /**
   * Runs that arrived while {@link MAX_CONCURRENT_JOBS} runs were already in
   * flight. They start automatically (FIFO) as active jobs finish.
   */
  private jobQueue = new JobConcurrencyQueue<RunJobRequest>();
  private dequeuedJobs = new Set<string>();
  /**
   * Count of jobs that have passed the concurrency gate but haven't been added
   * to {@link activeJobs} yet (startJob awaits graph hydration first). Counted
   * toward the cap synchronously so two run_job commands arriving back-to-back
   * can't both slip past `activeJobs.size` and exceed MAX_CONCURRENT_JOBS.
   */
  private startingJobs = 0;
  /**
   * WS slot accounting, for leak accounting: after every run finishes both
   * must be back to zero. Read by the reliability harness's ws-server driver,
   * whose `cleanup-leaks` invariant can only assert what it can measure.
   */
  get slotCounters(): { activeJobs: number; startingJobs: number } {
    return {
      activeJobs: this.activeJobs.size,
      startingJobs: this.startingJobs
    };
  }
  private currentTask: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private statsPrimeTimer: NodeJS.Timeout | null = null;
  /**
   * Abort controllers for RPC calls that are still waiting on a provider.
   * An RPC has no chat turn to hang off, so a `stop` command and a dropped
   * socket reach an in-flight model call through this set.
   */
  private readonly rpcAborts = new Set<AbortController>();
  private clientToolsManifest: Record<string, Record<string, unknown>> = {};
  private clientToolsManifestReady = false;
  private toolBridge = new ToolBridge();
  /** Separate bridge for connection-level renderer calls; never resolves chat tool_result waiters. */
  private rendererToolBridge = new ToolBridge();
  /** Round-trips permission approvals for gated tool calls. */
  private approvalBridge = new ToolBridge();
  /** This connection's chat turns: state, permissions, and the turn loop. */
  private readonly chat: ChatTurnHandler;
  private observerRegistered = false;
  /**
   * The detachable session for the chat turn THIS connection is executing.
   * While set (and running), every outbound frame carrying its thread_id is
   * routed through the session: stamped with `chat_seq`, buffered for replay,
   * and delivered to whichever connection is currently attached — which stops
   * being this one if the socket drops mid-turn.
   */
  private chatTurnSession: ChatTurnSession | null = null;
  /**
   * Turns still executing on a previous connection's runner that THIS
   * connection reattached to via `resume_chat`, keyed by thread id. Client
   * frames for them (`tool_result`, approvals, `stop`) are forwarded to the
   * executing runner through the session's hooks.
   */
  private adoptedSessions = new Map<string, ChatTurnSession>();
  /**
   * This connection's identity as a chat-turn delivery target. A stable
   * object so `detach(target)` only clears the session's attachment when it
   * still points at THIS connection — never a newer one that reattached.
   */
  private readonly chatDeliveryTarget = {
    deliver: (message: Record<string, unknown>): Promise<void> =>
      this.sendToSocket(message)
  };
  /**
   * Job ids of runs still executing on a previous connection's runner that
   * THIS connection reattached to via `reconnect_job`. Client commands for
   * them (`cancel_job`, `stop`, `stream_input`, `end_input_stream`,
   * `update_node_properties`) are forwarded to the executing runner through
   * the session's hooks.
   *
   * Ids, not session objects: holding the session would pin its frame buffer
   * for this connection's whole life, defeating the registry's retention
   * drop. Resolved through the registry at every use, so a dropped session
   * simply resolves to null and its memory goes with it.
   */
  private adoptedJobIds = new Set<string>();
  /**
   * This connection's identity as a job-run delivery target. Separate object
   * from {@link chatDeliveryTarget} so a job session's `detach(target)` can
   * never be confused with a chat session's — both guard on identity.
   */
  private readonly jobDeliveryTarget = {
    deliver: (message: Record<string, unknown>): Promise<void> =>
      this.sendToSocket(message)
  };

  logError(context: string, error: unknown): void {
    log.error(context, formatSanitizedError(error));
  }

  /** The run built for the last chat turn — what PR 11 hands to the sandbox. */
  getChatCapabilityRun(): CapabilityRun | null {
    return this.chat.getCapabilityRun();
  }

  /**
   * The turn a stale `requestSeq` is measured against. Transitional: the
   * counter itself now lives on {@link ChatTurnHandler}, and this accessor
   * keeps the direct-inference handler's `currentRequestSeq` callback — and
   * the existing suites — reading it from here. Removed with the other
   * delegating members in T7/T8.
   */
  private get chatRequestSeq(): number {
    return this.chat.currentRequestSeq;
  }

  /**
   * Open a chat/inference turn: cancel whatever was running and hand back the
   * seq + signal the new turn runs under. A superseding message cancels the
   * previous turn exactly as an explicit Stop does.
   */
  private beginChatTurn() {
    return this.chat.beginTurn();
  }

  /** Abort the in-flight turn, if any. Idempotent. */
  private cancelChatTurn(): void {
    this.chat.cancel();
  }

  /**
   * Retire a turn that finished on its own. Clears the controller only when it
   * is still the current one — a superseding turn has already installed its
   * own, and clearing that would make a later Stop a no-op.
   */
  private endChatTurn(controller: AbortController | null): void {
    this.chat.endTurn(controller);
  }

  /**
   * Extract text from message content that may be a string or array of content items.
   * Mirrors Python's _extract_query_text / _extract_objective / _extract_text_content.
   */
  extractTextContent(content: unknown, fallback = ""): string {
    return extractMessageText(content, fallback);
  }

  /**
   * Chat-turn internals the existing suites drive directly. Transitional, like
   * {@link chatRequestSeq}: the implementations live on {@link ChatTurnHandler}
   * and these delegates go when the suites move onto it in T8.
   */
  materializeAssistantImageContent(
    content: MessageContent[],
    userId: string,
    workflowId: string | null
  ): Promise<Array<Record<string, unknown>>> {
    return this.chat.materializeAssistantImageContent(
      content,
      userId,
      workflowId
    );
  }

  materializeToolResultImages(
    toolResult: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    return this.chat.materializeToolResultImages(toolResult, ctx);
  }

  _logProviderCall(
    userId: string,
    provider: BaseProvider,
    providerId: string,
    model: string,
    workflowId: string | null,
    projectId: string | null
  ): Promise<void> {
    return this.chat._logProviderCall(
      userId,
      provider,
      providerId,
      model,
      workflowId,
      projectId
    );
  }

  /**
   * Hooks a resilient chat-turn session carries so a LATER connection that
   * reattaches can route the client's `tool_result` / approvals / `stop`
   * back to this runner — the one whose bridges own the pending waiters.
   */
  private buildChatTurnHooks(): ChatTurnExecutionHooks {
    return {
      resolveToolResult: (toolCallId, payload) =>
        this.toolBridge.resolveResult(toolCallId, payload),
      resolveApproval: (approvalId, payload) =>
        this.approvalBridge.resolveResult(approvalId, payload),
      cancelPendingCalls: (threadId) => {
        this.toolBridge.cancelScope(threadId);
        this.approvalBridge.cancelScope(threadId);
      }
    };
  }

  /** Abort every RPC still waiting on a provider. Idempotent. */
  private cancelRpcCalls(): void {
    for (const abort of this.rpcAborts) abort.abort();
    this.rpcAborts.clear();
  }

  sendDetached(message: Record<string, unknown>): void {
    void this.sendMessage(message).catch((err) => {
      this.logError("detached websocket send failed", err);
    });
  }

  private inferOutputType(value: unknown): string {
    if (value === null || value === undefined) return "any";
    if (isString(value)) return "str";
    if (isNumber(value)) return Number.isInteger(value) ? "int" : "float";
    if (isBoolean(value)) return "bool";
    if (Array.isArray(value)) return "list";
    if (isObjectLike(value)) return "dict";
    return "any";
  }

  private resolveOutputNodeForKey(
    active: ActiveJob,
    outputKey: string
  ): { id: string; name: string } | null {
    let fallback: { id: string; name: string } | null = null;
    for (const raw of active.graph.nodes) {
      const node = raw as { id?: unknown; name?: unknown; type?: unknown };
      const id = isString(node.id) ? node.id : null;
      if (!id) continue;
      const name = isString(node.name) ? node.name : id;
      const type = isString(node.type) ? node.type : "";
      if (name === outputKey || id === outputKey) return { id, name };
      if (type === "nodetool.output.Output" && !fallback)
        fallback = { id, name };
    }
    return fallback;
  }

  private async sendOutputUpdates(
    active: ActiveJob,
    outputs: Record<string, unknown[]>
  ): Promise<void> {
    for (const [outputKey, values] of Object.entries(outputs)) {
      const nodeRef = this.resolveOutputNodeForKey(active, outputKey) ?? {
        id: outputKey,
        name: outputKey
      };
      const seq = Array.isArray(values) ? values : [];
      for (const rawValue of seq) {
        const value = await active.context.normalizeOutputValue(rawValue);
        await this.sendMessage({
          type: "output_update",
          node_id: nodeRef.id,
          node_name: nodeRef.name,
          output_name: "output",
          value,
          output_type: this.inferOutputType(value),
          metadata: {},
          workflow_id: active.workflowId,
          job_id: active.jobId
        });
      }
    }
  }

  private async normalizeFinalOutputs(
    active: ActiveJob,
    outputs: Record<string, unknown[]>
  ): Promise<Record<string, unknown[]>> {
    const normalized: Record<string, unknown[]> = {};
    for (const [outputKey, values] of Object.entries(outputs)) {
      normalized[outputKey] = [];
      for (const value of Array.isArray(values) ? values : []) {
        normalized[outputKey].push(
          await active.context.normalizeOutputValue(value)
        );
      }
    }
    return normalized;
  }

  constructor(options: UnifiedWebSocketRunnerOptions) {
    this.userId = options.userId ?? null;
    this.authToken = options.authToken ?? null;
    this.appSession = options.appSession ?? null;
    this.defaultModel = options.defaultModel ?? "gpt-oss:20b";
    this.defaultProvider = options.defaultProvider ?? "ollama";
    this.resolveExecutor = options.resolveExecutor;
    this.resolveNodeType = options.resolveNodeType;
    this.resolveProvider = options.resolveProvider;
    this.workspaceResolver = options.workspaceResolver;
    this.beforeRunJob = options.beforeRunJob;
    this.getNodeMetadata = options.getNodeMetadata;
    this.validateNode = options.validateNode;
    this.nodeRegistry = options.nodeRegistry;
    this.pythonBridge = options.pythonBridge;
    this.getPythonBridgeReady = options.getPythonBridgeReady;
    this.apiOptions = options.apiOptions;
    this.frontendRendererRegistry = options.frontendRendererRegistry;
    this.getSystemStats = options.getSystemStats ?? createSystemStatsSampler();
    this.systemStatsEnabled =
      options.systemStatsEnabled ?? systemStatsBroadcastEnabled();
    this.chat = new ChatTurnHandler(this, {
      // A chat-driven workflow run shares the connection's concurrency
      // accounting, so it is registered and released here rather than in a
      // map of chat's own.
      jobs: {
        registerJob: (jobId, active) => {
          this.activeJobs.set(jobId, active);
        },
        dropJob: (jobId) => {
          this.activeJobs.delete(jobId);
        },
        releaseJob: (jobId) => {
          this.activeJobs.delete(jobId);
          this.drainQueue();
        },
        handleNodeProviderCost: (active, outbound) =>
          this._handleNodeProviderCost(active, outbound),
        runMeasuredCost: (active) => this.runMeasuredCost(active)
      },
      toolBridge: this.toolBridge,
      approvalBridge: this.approvalBridge,
      clientTools: () => this.clientToolsManifest,
      authToken: () => this.authToken,
      beforeRunJob: options.beforeRunJob,
      defaults: {
        provider: this.defaultProvider,
        model: this.defaultModel
      },
      hydrateGraph: (graph) => this.hydrateGraph(graph),
      configuredProviders: (userId) =>
        this.configuredProvidersCache.get(userId),
      entityRefResolver: (userId) => this.entityRefResolver(userId),
      resolveEntityReferenceImages: (userId, refs) =>
        this.resolveEntityReferenceImages(userId, refs),
      resolveSourceImageBytes: (data, mediaGeneration, userId) =>
        this.resolveSourceImageBytes(data, mediaGeneration, userId)
    });
  }

  isRendererConnected(): boolean {
    return (
      this.websocket !== null &&
      this.websocket.clientState !== "disconnected" &&
      this.websocket.applicationState !== "disconnected"
    );
  }

  isRendererReady(): boolean {
    return this.clientToolsManifestReady;
  }

  getRendererToolManifest(): Record<string, Record<string, unknown>> {
    return Object.fromEntries(
      Object.entries(this.clientToolsManifest).map(([name, manifest]) => [
        name,
        { ...manifest }
      ])
    );
  }

  /** Send a connection-level frontend tool call and await its renderer result. */
  async executeRendererTool(
    rendererId: string,
    call: FrontendRendererToolCall,
    timeoutMs = 300_000
  ): Promise<FrontendRendererToolResult> {
    if (this.frontendRendererId !== rendererId || !this.isRendererConnected()) {
      throw new Error(`Renderer "${rendererId}" is not connected`);
    }
    if (!this.isRendererReady()) {
      throw new Error(`Renderer "${rendererId}" is not ready`);
    }
    if (!this.clientToolsManifest[call.name]) {
      throw new Error(`Tool "${call.name}" is not available in renderer`);
    }
    const resultPromise = this.rendererToolBridge.createWaiter(
      call.tool_call_id,
      timeoutMs
    );
    try {
      await this.sendToSocket({
        type: "renderer_tool_call",
        renderer_id: rendererId,
        tool_call_id: call.tool_call_id,
        name: call.name,
        args: call.args
      });
      if (!this.isRendererConnected()) {
        throw new Error(
          `Renderer "${rendererId}" disconnected during tool call`
        );
      }
    } catch (error) {
      this.rendererToolBridge.rejectResult(
        call.tool_call_id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
    const result = await resultPromise;
    if (result.ok !== true) {
      throw new Error(
        isString(result.error) ? result.error : "Renderer tool failed"
      );
    }
    return {
      renderer_id: rendererId,
      tool_call_id: call.tool_call_id,
      ok: true,
      result: result.result ?? result.content
    };
  }

  async connect(
    websocket: WebSocketConnection,
    userId?: string,
    authToken?: string
  ): Promise<void> {
    if (userId) this.userId = userId;
    if (authToken) this.authToken = authToken;
    this.userId = this.userId ?? "1";

    await websocket.accept();
    this.websocket = websocket;
    if (this.frontendRendererRegistry) {
      this.frontendRendererId = this.frontendRendererRegistry.register(
        this.userId,
        this
      );
      await this.sendToSocket({
        type: "renderer_registered",
        renderer_id: this.frontendRendererId
      });
    }
    log.info("Client connected", { userId: this.userId });

    this.startHeartbeat();
    this.startStatsBroadcast();
    this.registerObserver();
  }

  async disconnect(): Promise<void> {
    log.info("Client disconnected");
    this.stopHeartbeat();
    this.stopStatsBroadcast();
    this.unregisterObserver();
    if (this.frontendRendererId) {
      this.frontendRendererRegistry?.unregister(this.frontendRendererId);
      this.frontendRendererId = null;
    }
    this.rendererToolBridge.cancelAll();
    // An RPC has no session to detach into and no client left to answer, so
    // it is always cancelled — unlike a resilient chat turn below.
    this.cancelRpcCalls();

    // A resilient chat turn survives the socket: detach it (frames keep
    // buffering in the session for replay) instead of aborting. The session's
    // detach-grace timer bounds how long it may run unattended. Its pending
    // client tool calls stay alive too — replay re-delivers the `tool_call`
    // frames, so a reconnecting client can still answer them. Everything
    // else (a sessionless `inference` turn, other pending calls) is cancelled
    // as before: nobody is left to receive its output.
    const detachedThreadId =
      this.chatTurnSession?.status === "running"
        ? this.chatTurnSession.threadId
        : null;
    if (detachedThreadId) {
      this.chatTurnSession?.detach(this.chatDeliveryTarget);
      this.toolBridge.cancelAllExcept(detachedThreadId);
      this.approvalBridge.cancelAllExcept(detachedThreadId);
    } else {
      this.toolBridge.cancelAll();
      this.approvalBridge.cancelAll();
      this.cancelChatTurn();
    }
    for (const session of this.adoptedSessions.values()) {
      session.detach(this.chatDeliveryTarget);
    }
    this.adoptedSessions.clear();
    this.currentTask = null;
    // A run with a resilient session survives the socket: detach it (frames
    // keep buffering for replay, and `streamJobMessages` keeps draining on
    // this now-socketless runner) instead of cancelling. The session's
    // detach-grace timer bounds how long it may run unattended. A run without
    // one — a chat-triggered workflow, whose owning turn is cancelled anyway
    // — is cancelled as before: nobody is left to receive its output.
    for (const [jobId, job] of this.activeJobs) {
      if (job.runSession) {
        job.runSession.detach(this.jobDeliveryTarget);
        continue;
      }
      job.session?.cancel();
      this.activeJobs.delete(jobId);
    }
    for (const adoptedId of this.adoptedJobIds) {
      jobRunRegistry
        .get(this.userId ?? "1", adoptedId)
        ?.detach(this.jobDeliveryTarget);
    }
    this.adoptedJobIds.clear();

    // Drain runs that were still queued (never started): the client is gone,
    // so they will never run. Mark their persisted rows cancelled instead of
    // leaving them as orphaned "scheduled" jobs in jobs.list.
    for (
      let queued = this.jobQueue.dequeue();
      queued;
      queued = this.jobQueue.dequeue()
    ) {
      const queuedId = queued.job_id;
      if (!queuedId) continue;
      try {
        const job = await Job.get(queuedId);
        if (job) {
          job.markCancelled();
          await job.save();
        }
      } catch (err) {
        this.logError("disconnect queue cancellation failed", err);
      }
    }

    for (const dequeuedId of this.dequeuedJobs) {
      try {
        const job = await Job.get(dequeuedId);
        if (job) {
          job.markCancelled();
          await job.save();
        }
      } catch (err) {
        this.logError("disconnect dequeued-job cancellation failed", err);
      }
    }

    if (this.websocket) {
      try {
        await this.websocket.close();
      } catch (error) {
        this.logError("disconnect websocket.close failed", error);
      }
    }
    this.websocket = null;
  }

  private serializeForJson(value: unknown): JsonSafeValue {
    if (value instanceof Uint8Array) return Array.from(value);
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.serializeForJson(v));
    if (isObjectLike(value)) {
      const out: { [key: string]: JsonSafeValue } = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.serializeForJson(v);
      }
      return out;
    }
    // SAFETY: bytes, dates, arrays and objects are handled above; what is left
    // is a JSON scalar.
    return value as JsonSafeValue;
  }

  send(message: Record<string, unknown>): Promise<void> {
    return this.sendMessage(message);
  }

  async sendMessage(message: Record<string, unknown>): Promise<void> {
    // Frames belonging to this connection's resilient chat turn go through the
    // session: seq-stamped, buffered for replay, delivered to the attached
    // connection (possibly a later one than this).
    const session = this.chatTurnSession;
    if (
      session &&
      session.status === "running" &&
      isString(message.thread_id) &&
      message.thread_id === session.threadId
    ) {
      session.emit(message);
      return;
    }
    // Same for a resilient run's frames — including its terminal job_update,
    // which is the one frame a reconnecting client most needs replayed.
    // Adopted sessions are checked too so a `cancel_job` this connection
    // issued against a run owned by another connection still buffers its
    // acknowledgement into that run's session rather than only this socket.
    const jobSession = this.resolveJobSession(message.job_id);
    if (jobSession && jobSession.status === "running") {
      jobSession.emit(message);
      return;
    }
    await this.sendToSocket(message);
  }

  /**
   * The resilient session a frame's `job_id` belongs to: one this connection
   * started, or one it adopted via `reconnect_job`.
   */
  private resolveJobSession(jobId: unknown): JobRunSession | null {
    if (!isNonEmptyString(jobId)) return null;
    const active = this.activeJobs.get(jobId);
    if (active?.runSession) return active.runSession;
    if (!this.adoptedJobIds.has(jobId)) return null;
    return jobRunRegistry.get(this.userId ?? "1", jobId);
  }

  /**
   * Where a client command for `jobId` should act: this connection's own
   * ExecutionSession, or — for a run this client reconnected to — the hooks
   * of the session whose runner still owns it. Null when nothing is running.
   */
  private resolveJobControl(
    jobId: string
  ): { hooks: JobRunExecutionHooks; workflowId: string | null } | null {
    const active = this.activeJobs.get(jobId);
    if (active) {
      const session = active.session;
      return {
        workflowId: active.workflowId,
        hooks: {
          cancel: () => session.cancel(),
          pushInput: (input, value, handle) =>
            session.pushInput(input, value, handle),
          finishInputStream: (input, handle) =>
            session.finishInputStream(input, handle),
          updateNodeProperties: (nodeId, properties) =>
            session.updateNodeProperties(nodeId, properties)
        }
      };
    }
    const registered = jobRunRegistry.get(this.userId ?? "1", jobId);
    if (registered && registered.status === "running") {
      return { hooks: registered.hooks, workflowId: registered.workflowId };
    }
    return null;
  }

  /** Raw socket delivery — no chat-turn interception. */
  async sendToSocket(message: Record<string, unknown>): Promise<void> {
    if (!this.websocket) return;
    if (
      this.websocket.clientState === "disconnected" ||
      this.websocket.applicationState === "disconnected"
    ) {
      return;
    }

    assertValidOutboundMessage(message);

    // Resolve storage keys in content to browser-accessible URLs before
    // sending over the wire.  This keeps DB storage URL-agnostic while
    // delivering ready-to-use URLs to the client.
    if (Array.isArray(message.content)) {
      message = {
        ...message,
        content: await resolveContentUrls(
          message.content as unknown[],
          (message.user_id as string | undefined) ?? this.userId ?? undefined
        )
      };
    }

    // In-process audio/CV chunks carry samples as a native Float32Array,
    // which neither msgpack nor JSON represents. Encode them to base64
    // f32le here — the one and only conversion on the path to the client.
    message = encodeNativeAudioChunks(message);

    // Snapshot the mode ONCE for this frame. Reading this.mode again after the
    // send-lock await would let a set_mode that lands mid-queue transmit a
    // payload prepared for the other mode (e.g. a binary payload with raw
    // Uint8Arrays JSON.stringify'd into index-keyed garbage).
    const mode = this.mode;
    const payload =
      mode === "text"
        ? (this.serializeForJson(message) as Record<string, unknown>)
        : message;

    const prev = this.sendLock;
    let release!: () => void;
    this.sendLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      const websocket = this.websocket;
      if (
        !websocket ||
        websocket.clientState === "disconnected" ||
        websocket.applicationState === "disconnected"
      ) {
        return;
      }
      if (mode === "binary") {
        await websocket.sendBytes(packWebSocketMessage(payload));
      } else {
        await websocket.sendText(JSON.stringify(payload));
      }
    } finally {
      release();
    }
  }

  async receiveMessage(): Promise<Record<string, unknown> | null> {
    if (!this.websocket) {
      throw new Error("WebSocket is not connected");
    }

    const message = await this.websocket.receive();
    if (message.type === "websocket.disconnect") return null;

    if (message.bytes) {
      const maxBytes = getMaxWsMessageBytes();
      if (message.bytes.length > maxBytes) {
        throw new Error(
          `Incoming WebSocket message exceeds maximum size: ` +
            `${message.bytes.length} > ${maxBytes} bytes ` +
            `(set NODETOOL_WS_MAX_MESSAGE_BYTES to raise the limit)`
        );
      }
      return unpackWebSocketMessage<Record<string, unknown>>(message.bytes);
    }
    if (message.text) {
      const maxBytes = getMaxWsMessageBytes();
      const textBytes = Buffer.byteLength(message.text, "utf8");
      if (textBytes > maxBytes) {
        throw new Error(
          `Incoming WebSocket message exceeds maximum size: ` +
            `${textBytes} > ${maxBytes} bytes ` +
            `(set NODETOOL_WS_MAX_MESSAGE_BYTES to raise the limit)`
        );
      }
      return JSON.parse(message.text) as Record<string, unknown>;
    }
    return null;
  }

  /**
   * Normalize a raw graph so that the kernel's NodeDescriptor contract is met.
   * The web-UI / Python serialisation stores node properties under `data`;
   * the kernel expects them under `properties`.
   */
  private normalizeGraph(graph: RawGraphData): RawGraphData {
    const nodes = graph.nodes.map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        return { ...rest, properties: data };
      }
      return n;
    });
    const edges = graph.edges.map((edge) => {
      const rawEdgeType = edge.edge_type ?? edge.type;
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type, ...rest } = edge;
      return { ...rest, edge_type };
    });
    return { nodes, edges };
  }

  private async hydrateGraph(graph: RawGraphData): Promise<HydratedGraphData> {
    const normalized = this.normalizeGraph(graph);
    if (!this.resolveNodeType) {
      // No registry resolver configured — behavior flags can only come from
      // the saved graph itself; absent ones are explicitly defaulted off.
      // `normalizeGraph` above moved a saved node's `data` to `properties`
      // and settled `edge_type`; what a saved record still lacks is the
      // declared string type of the four identity fields, so read them out
      // rather than assert them.
      const asGraphData: GraphData = {
        nodes: normalized.nodes.map((n) => ({
          ...n,
          id: String(n.id ?? ""),
          type: String(n.type ?? "")
        })),
        edges: normalized.edges.map((e) => ({
          ...e,
          source: String(e.source ?? ""),
          sourceHandle: String(e.sourceHandle ?? ""),
          target: String(e.target ?? ""),
          targetHandle: String(e.targetHandle ?? "")
        }))
      };
      return withExplicitNodeFlags(asGraphData);
    }

    const hydrated = await Graph.loadFromDict(normalized, {
      resolver: this.resolveNodeType
    });
    return {
      nodes: [...hydrated.nodes],
      edges: [...hydrated.edges]
    };
  }

  private getRawGraph(req: RunJobRequest):
    | Promise<{
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      }>
    | {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      } {
    if (req.graph) {
      return this.normalizeGraph(req.graph);
    }
    if (req.workflow_id && this.userId) {
      const userId = this.userId;
      const workflowId = req.workflow_id;
      return (async () => {
        const workflow = await Workflow.find(userId, workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        return this.normalizeGraph(
          workflow.graph as {
            nodes: Array<Record<string, unknown>>;
            edges: Array<Record<string, unknown>>;
          }
        );
      })();
    }
    throw new Error("workflow_id or graph is required");
  }

  /**
   * Surface a clean terminal job_update when pre-run setup fails (typically
   * because the Python bridge could not start). Without this the error would
   * bubble up to handleCommand and be sent as a generic `invalid_command`
   * envelope, which the UI does not associate with the job — the workflow
   * appears to spin forever instead of failing.
   */
  private async emitBeforeRunFailure(
    jobId: string,
    workflowId: string | null,
    err: unknown,
    persistJob: boolean
  ): Promise<void> {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logError("beforeRunJob failed", err);
    await this.sendMessage({
      type: "job_update",
      status: "failed",
      job_id: jobId,
      workflow_id: workflowId,
      error: errorMessage
    });
    if (!persistJob) return;
    try {
      const job = (await Job.get(jobId)) as Job | null;
      if (job) {
        job.markFailed(errorMessage);
        await job.save();
      }
    } catch (persistErr) {
      this.logError("beforeRunJob failure persistence failed", persistErr);
    }
  }

  /** Default cap when `MAX_CONCURRENT_JOBS` is unset/invalid. */
  private static readonly DEFAULT_MAX_CONCURRENT_JOBS = 4;
  /** Default per-workflow cap when `MAX_CONCURRENT_RUNS_PER_WORKFLOW` is unset/invalid. */
  private static readonly DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW = 4;
  /** How long a resolved concurrency-setting value is reused before re-reading. */
  private static readonly MAX_CONCURRENT_JOBS_TTL_MS = 5000;
  private maxConcurrentJobsCache: { value: number; at: number } | null = null;
  private maxRunsPerWorkflowCache: { value: number; at: number } | null = null;

  /**
   * Resolve the per-client concurrency cap from settings (>= 1), cached for a
   * few seconds so back-to-back run_job/drainQueue calls don't hit the settings
   * store every time. The setting changes rarely, so a short TTL is fine.
   */
  private async getMaxConcurrentJobs(): Promise<number> {
    const cached = this.maxConcurrentJobsCache;
    const value = await this.resolvePositiveIntSetting(
      "MAX_CONCURRENT_JOBS",
      UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_JOBS,
      cached
    );
    this.maxConcurrentJobsCache = value;
    return value.value;
  }

  /**
   * Resolve the per-workflow concurrency cap (>= 1) for runs that opt into
   * concurrency. When this many runs of the same workflow are already in
   * flight, further opted-in runs queue. Cached like {@link getMaxConcurrentJobs}.
   */
  private async getMaxConcurrentRunsPerWorkflow(): Promise<number> {
    const cached = this.maxRunsPerWorkflowCache;
    const value = await this.resolvePositiveIntSetting(
      "MAX_CONCURRENT_RUNS_PER_WORKFLOW",
      UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW,
      cached
    );
    this.maxRunsPerWorkflowCache = value;
    return value.value;
  }

  /**
   * Read a positive-integer setting, reusing the cached value while it's still
   * within the TTL. Falls back to `fallback` when the setting is unset/invalid
   * or the settings store is unavailable (e.g. DB not initialized) rather than
   * blocking the run, matching the runner's other best-effort DB access.
   */
  private async resolvePositiveIntSetting(
    key: string,
    fallback: number,
    cached: { value: number; at: number } | null
  ): Promise<{ value: number; at: number }> {
    const now = Date.now();
    if (
      cached &&
      now - cached.at < UnifiedWebSocketRunner.MAX_CONCURRENT_JOBS_TTL_MS
    ) {
      return cached;
    }
    let raw: string | null = null;
    try {
      raw = await getSetting(key);
    } catch {
      // Settings store unavailable — fall back to the default.
    }
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return { value, at: now };
  }

  /**
   * Jobs occupying a concurrency slot: live + reserved-but-not-yet-registered.
   *
   * The cap counts a *user's* runs, not a socket's. A run detached from a
   * dropped connection keeps executing, so counting only `activeJobs` would
   * let a client reconnect its way past the cap — four abandoned sockets and
   * a fresh one is eight concurrent runs. The registry is the cross-
   * connection count; `activeJobs` contributes only the entries it does not
   * already cover (a chat-triggered workflow run, which registers no
   * session), or the same run would be counted twice.
   */
  private get inFlightJobCount(): number {
    let sessionless = 0;
    for (const job of this.activeJobs.values()) {
      if (!job.runSession) sessionless += 1;
    }
    return (
      this.startingJobs +
      jobRunRegistry.countRunning(this.userId ?? "1") +
      sessionless
    );
  }

  /**
   * Number of live (unfinished) runs currently executing for a workflow. Used
   * to enforce the per-workflow concurrency limit so non-concurrent runs stay
   * sequential and their live node updates don't clobber each other in the
   * editor. Counted the same way as {@link inFlightJobCount}: the registry
   * across connections, plus this connection's sessionless entries.
   */
  private countActiveJobsForWorkflow(
    workflowId: string | null | undefined
  ): number {
    if (!workflowId) {
      return 0;
    }
    let count = jobRunRegistry.countRunningForWorkflow(
      this.userId ?? "1",
      workflowId
    );
    for (const job of this.activeJobs.values()) {
      if (!job.runSession && job.workflowId === workflowId && !job.finished) {
        count++;
      }
    }
    return count;
  }

  /**
   * The per-workflow concurrency limit a given run is subject to: concurrency
   * opt-in runs share the configurable {@link getMaxConcurrentRunsPerWorkflow}
   * cap; everything else stays strictly sequential (one run per workflow) so
   * live node updates don't clobber the editor.
   */
  private perWorkflowLimitFor(req: { concurrent?: boolean }): Promise<number> {
    return req.concurrent
      ? this.getMaxConcurrentRunsPerWorkflow()
      : Promise.resolve(1);
  }

  /**
   * Read-only view of the same admission counters used by runJob. This does
   * not reserve a slot or mutate the queue; lifecycle preflight can therefore
   * report likely queueing without changing current execution behavior.
   */
  async getSdkExecutionCapacitySnapshot(input: {
    workflowId: string;
    concurrent?: boolean;
  }): Promise<SdkExecutionCapacitySnapshot> {
    const [maxConcurrentJobs, maxConcurrentRunsForWorkflow] = await Promise.all(
      [
        this.getMaxConcurrentJobs(),
        this.perWorkflowLimitFor({ concurrent: input.concurrent })
      ]
    );
    const inFlightJobs = this.inFlightJobCount;
    const workflowInFlightJobs = this.countActiveJobsForWorkflow(
      input.workflowId
    );
    return {
      inFlightJobs,
      maxConcurrentJobs,
      queuedJobs: this.jobQueue.size,
      workflowInFlightJobs,
      maxConcurrentRunsForWorkflow,
      likelyQueued:
        inFlightJobs >= maxConcurrentJobs ||
        workflowInFlightJobs >= maxConcurrentRunsForWorkflow
    };
  }

  /**
   * Entry point for the "run_job" command. Starts the run immediately when the
   * client is under its concurrency cap, otherwise queues it (FIFO) and emits a
   * `queued` job update. Queued runs start automatically as active jobs finish.
   */
  /**
   * Best-effort pre-run cost estimate for a graph, in USD. Nodes the estimator
   * cannot price contribute nothing, so the figure is a floor — good enough to
   * stop a run that would obviously blow the budget, and never a reason to
   * refuse one it cannot price.
   */
  private estimateRunCost(req: RunJobRequest): number {
    try {
      const estimate = this.estimateGraphCost(req);
      if (!estimate) return 0;
      return Number.isFinite(estimate.total) ? estimate.total : 0;
    } catch (err) {
      this.logError("run cost estimate failed", err);
      return 0;
    }
  }

  /**
   * The graph estimate both gates read. One implementation so the budget gate,
   * the credit gate and the editor's cost panel price a run the same way —
   * including fan-out: a node asked for ten images is priced at ten, through
   * the same `nodeExpectedQuantity` the panel uses.
   */
  private estimateGraphCost(
    req: RunJobRequest
  ): WorkflowCostEstimateDetail | null {
    const nodes = req.graph?.nodes;
    if (!nodes || !this.getNodeMetadata) return null;
    const priced = nodes.map((node) => ({
      id: String(node.id),
      type: String(node.type),
      data: (node.data ?? {}) as Record<string, unknown>
    }));
    return estimateWorkflowCost({
      nodes: priced,
      getMetadata: (nodeType: string) => this.getNodeMetadata?.(nodeType),
      // Prices the model picked on a generic node (e.g. a FAL or kie model on
      // nodetool.image.TextToImage), which node-type metadata alone cannot.
      // Same lookup the editor's cost preview uses.
      getModelPrice: getModelUnitPrice,
      // A per-second model bills the clip it is asked for, so the duration
      // and resolution the node states have to reach the price lookup.
      getParams: (node) => extractPricingParams(node.data),
      quantities: Object.fromEntries(
        priced.map((node): [string, number] => [
          node.id,
          nodeExpectedQuantity(node.data)
        ])
      )
    });
  }

  /**
   * The slice of a run that spends through NodeTool's managed provider —
   * the only spend the credit balance meters. BYOK nodes are excluded on
   * purpose: their cost rides the user's own keys.
   */
  private estimateNodetoolSpend(req: RunJobRequest) {
    try {
      const estimate = this.estimateGraphCost(req);
      if (!estimate) {
        return { usesNodetool: false, estimatedUsd: 0 };
      }
      const items = estimate.items.filter(
        (item) => item.provider === "nodetool"
      );
      const total = items.reduce(
        (sum, item) =>
          sum +
          (Number.isFinite(item.estimated_cost) ? item.estimated_cost : 0),
        0
      );
      return { usesNodetool: items.length > 0, estimatedUsd: total };
    } catch (err) {
      this.logError("nodetool spend estimate failed", err);
      return { usesNodetool: false, estimatedUsd: 0 };
    }
  }

  /** Tell the client a run was refused, in the shape a failed job takes. */
  private refuseRun(
    req: RunJobRequest,
    jobId: string,
    code: ApiErrorCode,
    error: string
  ): false {
    this.sendDetached({
      type: "job_update",
      status: "failed",
      job_id: jobId,
      workflow_id: req.workflow_id ?? null,
      error,
      error_code: code
    });
    return false;
  }

  /**
   * The version number a stale client claimed, if the app really has it —
   * otherwise null, and the claim is unsupportable.
   *
   * Version history is per app and short (one row per publish), so listing it
   * is cheap; the ceiling exists only because the model helper takes a limit,
   * and it has to be high enough that an old claim is never truncated away by
   * the newest releases.
   */
  private async claimedApplicationVersion(
    applicationId: string,
    claimed: number | null | undefined,
    userId: string
  ): Promise<number | null> {
    if (claimed == null) return null;
    const versions = await listApplicationVersions(
      applicationId,
      10_000,
      userId
    );
    return versions.some((v) => v.version === claimed) ? claimed : null;
  }

  /**
   * Gate an app's run on its spend budget. Runs of a published app execute with
   * the creator's secrets, so this refuses before the job exists rather than
   * reporting an overspend afterwards. Returns false when the run was refused
   * (the client has already been told why).
   *
   * `application_id` arrives on the wire, so before any of that the app has to
   * be one this connection's user owns. Honouring the id as sent let a client
   * name a stranger's app and spend their budget — and pollute their release
   * telemetry, which is the same ledger.
   */
  private async admitApplicationRun(req: RunJobRequest): Promise<boolean> {
    const applicationId = req.application_id;
    if (!applicationId) return true;
    const jobId = req.job_id ?? randomUUID();
    req.job_id = jobId;
    // The connection's authenticated user, not `req.user_id`: the request body
    // is the thing being authorized, so it cannot supply the identity that
    // authorizes it.
    const userId = this.userId ?? "1";
    // Authorization sits outside the try below, which swallows a ledger outage
    // on purpose. Metering fails open; ownership fails closed — a lookup this
    // never completed is not permission to bill the app it names.
    let owned = false;
    try {
      const application = await Application.findById(applicationId);
      owned = application?.user_id === userId;
    } catch (err) {
      this.logError("application ownership check failed", err);
    }
    if (!owned) {
      log.warn("Run refused: application not owned by this user", {
        applicationId,
        jobId,
        userId
      });
      // Applications are owned by one user and there is no path today that
      // serves someone else's app to run — `releasedApplicationDocument`
      // itself requires ownership — so refusing cannot break a legitimate
      // run, and it is the only answer that keeps the budget a hard stop.
      return this.refuseRun(
        req,
        jobId,
        ApiErrorCode.NOT_FOUND,
        "Application not found"
      );
    }

    try {
      const estimatedUsd = this.estimateRunCost(req);
      // The client says whether this is a release run or a draft run; the
      // server decides which release the ledger records. A number taken on
      // faith would let a run bill itself to a version it never executed, and
      // the ledger is also the release telemetry — so a claim is only honoured
      // below once the server has found that version in the app's history.
      const released =
        req.application_version == null
          ? null
          : await releasedApplicationVersion(applicationId, userId);
      if (req.application_version != null && !released) {
        // A release run of an app that has released nothing. The claim is
        // unsupportable rather than merely stale, and letting it through would
        // file the run in the telemetry ledger as a release that never shipped.
        return this.refuseRun(
          req,
          jobId,
          ApiErrorCode.INVALID_INPUT,
          "This app has no released version to run"
        );
      }
      // Which version the ledger row belongs to. The release is the default,
      // because that is what a current client runs.
      let version = released?.version ?? null;
      if (released && released.version !== req.application_version) {
        log.warn("Run claimed a version other than the released one", {
          applicationId,
          jobId,
          claimed: req.application_version,
          released: released.version
        });
        // A client that loaded the app before the newest release still holds
        // that older snapshot and is about to execute it. Filing the run under
        // the current release would credit v2's metrics and budget with a run
        // of v1, so the row follows what actually ran — but only once the
        // server has confirmed the claimed version is a real version of this
        // app. That check is what keeps the client from picking its own
        // attribution: it can name a version it once had, not one it invents.
        const claimed = await this.claimedApplicationVersion(
          applicationId,
          req.application_version,
          userId
        );
        if (!claimed) {
          return this.refuseRun(
            req,
            jobId,
            ApiErrorCode.INVALID_INPUT,
            `This app has no version ${req.application_version} to run`
          );
        }
        version = claimed;
        // The run proceeds, but the client is stale and has no other way to
        // learn it: nothing in a job's updates mentions releases.
        this.sendDetached({
          type: "notification",
          node_id: "",
          severity: "warning",
          workflow_id: req.workflow_id ?? null,
          content: `Running version ${claimed} of this app; version ${released.version} has since been released. Reload to get the latest.`
        });
      }
      // Reserving claims the run against the budget in the same transaction
      // that checks it, so concurrent runs of one app cannot each read a total
      // that excludes the others and all be admitted.
      // The ledger holds one row per (application, invocation), so two runs
      // racing on one id lose the insert rather than double-spend. The loser
      // is refused like any other rejected run instead of surfacing a driver
      // error to the visitor.
      let decision: Awaited<ReturnType<typeof reserveInvocation>>;
      try {
        decision = await reserveInvocation({
          applicationId,
          version,
          invocationId: jobId,
          operationId: req.operation_id ?? undefined,
          estimatedUsd,
          requireFiniteBudget: this.appSession !== null
        });
      } catch (error) {
        log.warn("Application run ledger rejected the reservation", {
          applicationId,
          jobId,
          error: String(error)
        });
        return this.refuseRun(
          req,
          jobId,
          ApiErrorCode.INVALID_INPUT,
          "This app run named a run id that is already in use"
        );
      }
      if (!decision.allowed) {
        log.warn("Run refused by application budget", {
          applicationId,
          jobId,
          reason: decision.reason
        });
        return this.refuseRun(
          req,
          jobId,
          ApiErrorCode.BUDGET_EXCEEDED,
          decision.reason
        );
      }
    } catch (err) {
      // A ledger that is unavailable must not take runs down with it; the
      // refusals above are the only paths that block, and they return rather
      // than throw so an outage can never swallow one.
      this.logError("application budget check failed", err);
    }
    return true;
  }

  /**
   * Gate a run on the user's credit balance — but only the part of the run
   * that spends through NodeTool's managed provider. A graph with no
   * `nodetool` models passes untouched (BYOK stays unmetered); one with them
   * is refused when the balance is empty or can't cover the estimate.
   * Estimates are floors, so an empty balance refuses even a 0-estimate
   * nodetool call. Fails open on gate errors, like the application-budget
   * gate above.
   */
  private async admitCreditRun(req: RunJobRequest): Promise<boolean> {
    const { usesNodetool, estimatedUsd } = this.estimateNodetoolSpend(req);
    if (!usesNodetool) return true;
    // Pin the job id now so the reservation taken here can be released at the
    // run's terminal state (and on cancel-while-queued) under the same key.
    req.job_id ??= randomUUID();
    const decision = await admitSpend(this.userId, estimatedUsd);
    if (!decision.allowed) {
      return this.refuseRun(
        req,
        req.job_id,
        ApiErrorCode.BUDGET_EXCEEDED,
        decision.reason
      );
    }
    reserveSpend(this.userId ?? "1", req.job_id, estimatedUsd);
    return true;
  }

  /**
   * Narrow a run started by a deployed app's visitor to the one run the
   * session allows, or refuse it.
   *
   * The connection authenticates as the app's owner, so `admitApplicationRun`
   * below would happily approve anything it names — ownership is what that
   * check tests, and a visitor's session passes it. This is the check that
   * actually confines them, and it runs first: what comes out is built from
   * the signed session and the release, not from the request.
   *
   * The run executes only the release version the signed session names. A
   * later publish invalidates the session for execution, so the visitor must
   * reload and mint a session for the new release rather than run its graphs.
   */
  private async confineAppSessionRun(
    req: RunJobRequest
  ): Promise<RunJobRequest | null> {
    const scope = this.appSession;
    if (!scope) return req;
    // The client names the run so it can follow its own frames, but the id it
    // names is also the ledger key a job command is authorized against. An id
    // that is already a job or already in a ledger would let a visitor file a
    // row under someone else's run and then command it, so a taken id — and a
    // shape that is not a generated id at all — is refused rather than
    // silently replaced with one the client would never recognize.
    const requested = req.job_id ?? "";
    const jobId = requested === "" ? randomUUID() : requested;
    if (requested !== "" && !UUID_PATTERN.test(requested)) {
      this.refuseRun(
        req,
        jobId,
        ApiErrorCode.INVALID_INPUT,
        "This app run named an invalid run id"
      );
      return null;
    }
    if (
      requested !== "" &&
      ((await Job.get(requested)) !== null || (await invocationIdInUse(requested)))
    ) {
      this.refuseRun(
        req,
        jobId,
        ApiErrorCode.INVALID_INPUT,
        "This app run named a run id that is already in use"
      );
      return null;
    }
    const release = await releasedApplicationRelease(
      scope.applicationId,
      this.userId ?? ""
    );
    if (!release) {
      this.refuseRun(
        req,
        jobId,
        ApiErrorCode.NOT_FOUND,
        "This app is not available"
      );
      return null;
    }
    const parsedRelease = applicationReleaseResponse.safeParse(release);
    if (!parsedRelease.success) {
      this.refuseRun(
        req,
        jobId,
        ApiErrorCode.NOT_FOUND,
        "This app is not available"
      );
      return null;
    }
    if (releaseBlockedReason(parsedRelease.data)) {
      this.refuseRun(
        req,
        jobId,
        ApiErrorCode.NOT_FOUND,
        "This app is not available"
      );
      return null;
    }
    if (release.version !== scope.version) {
      this.refuseRun(
        req,
        jobId,
        ApiErrorCode.INVALID_INPUT,
        "This app has been updated. Reload the page before running it."
      );
      return null;
    }
    const confined = confineRunRequest(req, scope, release);
    if (isRunRefusal(confined)) {
      this.refuseRun(req, jobId, ApiErrorCode.INVALID_INPUT, confined.refused);
      return null;
    }
    confined.job_id = jobId;
    return confined;
  }

  async runJob(incoming: RunJobRequest): Promise<void> {
    const req = await this.confineAppSessionRun(incoming);
    if (!req) return;
    req._accepted_at_ms ??= performance.now();
    if (!(await this.admitApplicationRun(req))) return;
    if (!(await this.admitCreditRun(req))) return;
    const max = await this.getMaxConcurrentJobs();
    const perWorkflowMax = await this.perWorkflowLimitFor(req);
    // Queue the run when over the global cap, or when this workflow already has
    // its per-workflow limit of runs in flight — 1 for normal runs, or the
    // configurable MAX_CONCURRENT_RUNS_PER_WORKFLOW for runs that opt into
    // concurrency. Reserve the slot synchronously (after the awaits above) so
    // two run_job commands can't both observe a free slot before either registers.
    if (
      this.inFlightJobCount >= max ||
      this.countActiveJobsForWorkflow(req.workflow_id) >= perWorkflowMax
    ) {
      await this.enqueueJob(req);
      return;
    }
    this.startingJobs++;
    await this.startJob(req);
  }

  /** Queue a run that can't start yet, persist it, and notify the client. */
  private async enqueueJob(req: RunJobRequest): Promise<void> {
    const jobId = req.job_id ?? randomUUID();
    req.job_id = jobId;
    const position = this.jobQueue.enqueue(req);
    log.info("Job queued", { jobId, position });
    // Persist the queued run so it shows in jobs.list (Queue panel, reload,
    // other tabs). Best-effort, mirroring startJobInner's persistence. It flips
    // to "running" in startJobInner when a slot frees.
    if (
      resolveRunJobExecutionOptions(
        req.execution_options,
        req.require_terminal_result === true
      ).persistence === "job"
    ) {
      try {
        const existing = await Job.get(jobId);
        if (!existing) {
          await Job.create({
            id: jobId,
            workflow_id: req.workflow_id ?? "",
            user_id: resolveRunJobUserId(req.user_id, this.userId),
            status: "queued",
            name: req.job_name ?? "",
            params: req.params ?? {},
            graph: req.graph ?? { nodes: [], edges: [] }
          });
        }
      } catch (err) {
        this.logError("enqueue persistence failed", err);
      }
    }
    this.sendDetached({
      type: "job_update",
      status: "queued",
      job_id: jobId,
      workflow_id: req.workflow_id ?? null,
      queue_position: position,
      message: `Queued (#${position})`
    });
  }

  /**
   * Start the next queued run (if any) after a job slot frees up, and refresh
   * the reported positions of the runs still waiting.
   */
  private drainQueue(): void {
    void (async () => {
      const max = await this.getMaxConcurrentJobs().catch(
        () => UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_JOBS
      );
      const perWorkflowMax = await this.getMaxConcurrentRunsPerWorkflow().catch(
        () => UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW
      );
      // Fill free slots with the first queued run whose workflow is still under
      // its per-workflow limit (1 for normal runs, perWorkflowMax for opted-in
      // concurrent runs). startJob registers the job before it returns, so the
      // next iteration sees it as in-flight.
      while (this.inFlightJobCount < max) {
        const candidate = this.jobQueue
          .positions()
          .find(
            (p) =>
              this.countActiveJobsForWorkflow(p.workflowId) <
              (p.concurrent ? perWorkflowMax : 1)
          );
        if (!candidate) {
          break;
        }
        const next = this.jobQueue.remove(candidate.jobId);
        if (!next) {
          break;
        }
        // Reserve the slot synchronously, mirroring runJob, so a concurrent
        // run_job/drain can't also claim it before startJob registers.
        this.startingJobs++;
        const nextId = next.job_id;
        if (nextId) {
          this.dequeuedJobs.add(nextId);
        }
        try {
          await this.startJob(next);
        } catch (err) {
          // The dequeued job threw before it could register/stream. Don't
          // silently lose it: tell the client this run failed, then keep
          // draining so the rest of the queue still progresses.
          this.logError("startJob (from queue) failed", err);
          await this.sendMessage({
            type: "job_update",
            status: "failed",
            job_id: next.job_id ?? null,
            workflow_id: next.workflow_id ?? null,
            error: formatSanitizedError(err)
          });
        } finally {
          if (nextId) {
            this.dequeuedJobs.delete(nextId);
          }
        }
      }
      this.broadcastQueuePositions();
    })();
  }

  /** Push updated queue positions to every still-waiting run. */
  private broadcastQueuePositions(): void {
    for (const { jobId, workflowId, position } of this.jobQueue.positions()) {
      this.sendDetached({
        type: "job_update",
        status: "queued",
        job_id: jobId,
        workflow_id: workflowId,
        queue_position: position,
        message: `Queued (#${position})`
      });
    }
  }

  private async startJob(req: RunJobRequest): Promise<void> {
    // The caller (runJob/drainQueue) reserved a concurrency slot via
    // startingJobs++. Release it exactly once here: the slot is handed off to
    // activeJobs on successful registration, or freed on early return/throw.
    let slotReleased = false;
    const releaseSlot = () => {
      if (!slotReleased) {
        slotReleased = true;
        this.startingJobs = Math.max(0, this.startingJobs - 1);
      }
    };
    try {
      await this.startJobInner(req, releaseSlot);
    } finally {
      // Safety net: if startJobInner returned/threw without registering, the
      // slot is freed so it doesn't leak and permanently shrink the cap.
      releaseSlot();
    }
  }

  private async startJobInner(
    req: RunJobRequest,
    releaseSlot: () => void
  ): Promise<void> {
    const userId = resolveRunJobUserId(req.user_id, this.userId);
    const workflowId = req.workflow_id ?? null;
    const jobId = req.job_id ?? randomUUID();
    const executionOptions = resolveRunJobExecutionOptions(
      req.execution_options,
      req.require_terminal_result === true
    );
    const acceptedAt = req._accepted_at_ms ?? performance.now();
    const preparationStartedAt = performance.now();
    let phaseStartedAt = preparationStartedAt;

    const rawGraph = await this.getRawGraph(req);
    const graphLoadedMs = performance.now() - phaseStartedAt;

    // Hydrate the graph (resolves node types from the registry)
    phaseStartedAt = performance.now();
    const graph = await this.hydrateGraph(rawGraph);
    const graphHydratedMs = performance.now() - phaseStartedAt;

    // The kernel keys terminal outputs by node.name. For SDK runs, align output
    // node names with their public interface names before execution so the
    // authoritative terminal snapshot addresses the same pins as output_update.
    if (req.require_terminal_result) {
      for (const node of graph.nodes) {
        if (!node.type.startsWith("nodetool.output.")) continue;
        const properties = node.properties as Record<string, unknown> | null;
        const publicName = properties?.name;
        if (isString(publicName) && publicName.trim().length > 0) {
          node.name = publicName;
        }
      }
    }

    phaseStartedAt = performance.now();
    if (this.beforeRunJob) {
      try {
        await this.beforeRunJob(graph);
      } catch (err) {
        await this.emitBeforeRunFailure(
          jobId,
          workflowId,
          err,
          executionOptions.persistence === "job"
        );
        return;
      }
    }
    const preRunMs = performance.now() - phaseStartedAt;

    const workspace = this.workspaceResolver
      ? await this.workspaceResolver(workflowId ?? null, userId)
      : null;

    const context = createRuntimeContext({
      jobId,
      workflowId,
      userId,
      workspace,
      assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url",
      persistOutputAssets: executionOptions.assetPersistence === "auto"
    });
    // Agents planning inside this run pause for user approval over this
    // socket before executing their plan.
    this.attachPlanApproval(context, jobId);

    // Expose executor/node-type resolution on the context so that
    // sub-workflow nodes (WorkflowNode) can create child runners.
    context.setResolveExecutor((node) => this.resolveExecutor(node));
    if (this.resolveNodeType) {
      const resolverObj = isFunctionValue(this.resolveNodeType)
        ? { resolveNodeType: this.resolveNodeType }
        : this.resolveNodeType;
      context.setResolveNodeType(
        (nodeType) =>
          resolverObj.resolveNodeType(nodeType) as Promise<{
            nodeType: string;
            propertyTypes?: Record<string, string>;
            outputs?: Record<string, string>;
            supportsDynamicInputs?: boolean;
            descriptorDefaults?: Record<string, unknown>;
          } | null>
      );
    }

    // Persistence runs BEFORE the session exists, because
    // `ExecutionSession.create()` starts the kernel: a job cancelled while it
    // sat in the queue must never execute, and the only way to guarantee that
    // is to check before anything can run. (The DB-only cancel path — tRPC
    // `jobs.cancel` — doesn't remove the job from `jobQueue`, so drainQueue
    // can still hand us a cancelled job.)
    phaseStartedAt = performance.now();
    // Which machine holds this run's session, for owner-aware reconnects and
    // cross-instance cancel. Null on a single-machine deployment.
    const instanceId = getInstanceId();
    if (executionOptions.persistence === "job") {
      try {
        const existing = await Job.get(jobId);
        if (existing) {
          if (existing.status === "cancelled") {
            log.info("Skipping start of cancelled job", { jobId });
            // Nothing was registered in activeJobs yet — free the reserved
            // slot and promote any queued run, matching every other slot
            // release (streamJobMessages finally, the chat-run finally).
            // Without it a cancelled-while-queued job leaves its slot idle
            // and the next queued run stalls.
            releaseSlot();
            this.drainQueue();
            this.sendDetached({
              type: "job_update",
              status: "cancelled",
              job_id: jobId,
              workflow_id: workflowId
            });
            return;
          }
          // Was persisted as "queued" while waiting for a slot — flip it to
          // running now that it's actually starting. The stamp goes on here
          // too: the queued row may have been written by another instance.
          if (
            existing.status !== "running" ||
            existing.runner_instance !== instanceId
          ) {
            existing.markRunning();
            existing.runner_instance = instanceId;
            await existing.save();
          }
        } else {
          await Job.create({
            id: jobId,
            workflow_id: workflowId ?? "",
            user_id: userId,
            status: "running",
            name: req.job_name ?? "",
            started_at: new Date().toISOString(),
            params: req.params ?? {},
            graph,
            runner_instance: instanceId
          });
        }
      } catch (error) {
        this.logError("runJob persistence failed", error);
        // Persistence is best-effort in TS runtime mode.
      }
    }
    const persistenceMs = performance.now() - phaseStartedAt;

    // A5 (docs/RELIABILITY_TASKS.md Track A): the facade replaces the direct
    // `new WorkflowRunner` + later `runner.run()` pair — `graph` is already
    // hydrated/output-name-rewritten above, so this call re-hydrates it
    // (idempotent: `withExplicitNodeFlags`, used because this class has no
    // `NodeRegistry` of its own, passes every already-resolved field through
    // unchanged via `...node`) and starts the run immediately. `resolveExecutor`
    // is passed through as-is (not rebuilt from a registry+bridge) because
    // this class only ever holds the bootstrap-injected closure, never a
    // `NodeRegistry` instance.
    // Opt-in per request; a run that asked for no supervisor gets none, and a
    // supervisor that cannot be built leaves the run unsupervised rather than
    // failing it.
    const supervisor = await createRunSupervisor({
      supervise: req.supervise,
      supervisor: req.supervisor,
      context,
      defaultProvider: this.defaultProvider,
      defaultModel: this.defaultModel
    });

    const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
      graph: toRawGraphInput(graph),
      resolveExecutor: (node) =>
        this.resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      bridgeFactory: async () => null,
      // This runner owns a long-lived shared bridge, so `bridgeFactory` hands
      // the session nothing to close. The run boundary still has to reach that
      // bridge — pass it explicitly.
      jobLifecycleBridge: this.pythonBridge ?? null,
      jobId,
      workflowId,
      context,
      params: req.params ?? {},
      validateNode: this.validateNode
    };
    if (supervisor) {
      sessionOptions.supervisor = supervisor;
    }
    // A graph this runtime cannot honour (unknown model, unregistered
    // provider, missing credential) is refused before the kernel starts.
    // Route it through the same terminal `job_update` a failed pre-run hook
    // uses: a bare throw reaches handleCommand as a generic `invalid_command`
    // the UI never associates with the job, so the run appears to spin
    // forever instead of failing with the reason.
    let session: ExecutionSession;
    try {
      session = await ExecutionSession.create(sessionOptions);
    } catch (err) {
      if (!isExecutionPreflightError(err)) throw err;
      await this.emitBeforeRunFailure(
        jobId,
        workflowId,
        err,
        executionOptions.persistence === "job"
      );
      return;
    }

    const active: ActiveJob = {
      jobId,
      workflowId,
      context,
      session,
      graph,
      finished: false,
      status: "running",
      requireTerminalResult: req.require_terminal_result === true,
      executionOptions,
      timings: {
        acceptedAt,
        queueMs: Math.max(0, preparationStartedAt - acceptedAt),
        graphLoadedMs,
        graphHydratedMs,
        preRunMs,
        persistenceMs,
        kernelStartedAt: performance.now()
      },
      applicationId: req.application_id ?? null
    };
    // Decouple the run from this socket: from here on every frame carrying
    // this job_id is stamped with `job_seq` and buffered, so a client that
    // drops mid-run can `reconnect_job` from a fresh connection and replay
    // the tail — including the terminal job_update.
    //
    // Keyed on the connection's identity, not `userId`: every lookup
    // (`reconnect_job`, `cancel_job`, the slot counts) reads
    // `this.userId ?? "1"`, and a run opened under an explicit differing
    // `req.user_id` would be unreachable — no replay, and a cancel that
    // reports the job as not found.
    const runSession = jobRunRegistry.open(
      this.userId ?? "1",
      jobId,
      workflowId,
      {
        cancel: () => session.cancel(),
        pushInput: (input, value, handle) =>
          session.pushInput(input, value, handle),
        finishInputStream: (input, handle) =>
          session.finishInputStream(input, handle),
        updateNodeProperties: (nodeId, properties) =>
          session.updateNodeProperties(nodeId, properties)
      }
    );
    runSession.attach(this.jobDeliveryTarget, runSession.lastSeq);
    active.runSession = runSession;
    this.activeJobs.set(jobId, active);
    // Slot ownership transfers from startingJobs to the registry's running
    // count now that the job is registered. Released before the DB check
    // below so the reservation and the registry entry never both count.
    releaseSlot();
    log.info("Job started", { jobId, workflowId });
    await this.settleRunAgainstLostConnection(
      runSession,
      jobId,
      executionOptions
    );

    // The run itself already started inside `ExecutionSession.create()`
    // above — `session.result` is the same never-rejecting terminal-result
    // promise `runner.run()` used to return.
    const executePromise = session.result;

    // `streamJobMessages` handles its own failures, but nothing awaits this
    // promise — attach a terminal handler so a bug there can never surface as
    // an unhandled rejection (which Node 22 turns into a process exit).
    active.streamTask = this.streamJobMessages(active, executePromise).catch(
      (error: unknown) => {
        this.logError("job stream task failed", error);
      }
    );
  }

  /**
   * A run whose start was mid-flight when `disconnect()` fired registers
   * AFTER that walk of `activeJobs`, so nothing detached it and nothing
   * armed its grace timer — it would execute unattended forever, delivering
   * into a dead target. Two fixes, both after registration:
   *   - no live socket: detach, which starts the detach-grace countdown;
   *   - the row already reads cancelled: `disconnect()`'s queue drain (or a
   *     DB-only cancel) settled it while this run was starting, so cancel
   *     the run rather than let it execute to completion under a row that
   *     says it never did.
   */
  private async settleRunAgainstLostConnection(
    runSession: JobRunSession,
    jobId: string,
    executionOptions: RunJobExecutionOptions
  ): Promise<void> {
    const socketGone =
      !this.websocket ||
      this.websocket.clientState === "disconnected" ||
      this.websocket.applicationState === "disconnected";
    if (socketGone) {
      runSession.detach(this.jobDeliveryTarget);
    }
    if (executionOptions.persistence !== "job") return;
    try {
      const job = await Job.get(jobId);
      if (job?.status === "cancelled") {
        log.info("Job was cancelled while starting, cancelling the run", {
          jobId
        });
        runSession.cancel();
      }
    } catch (error) {
      this.logError("post-start cancellation check failed", error);
    }
  }

  private async streamJobMessages(
    active: ActiveJob,
    executePromise: Promise<{
      status: "completed" | "failed" | "cancelled";
      error?: string;
      outputs?: Record<string, unknown[]>;
    }>
  ): Promise<void> {
    // The drain loop has awaited operations (Asset.paginate, normalizeOutputValue,
    // sendMessage) that can throw. Guarantee the job slot is released and the
    // queue drains no matter what — otherwise one throw permanently leaks a
    // MAX_CONCURRENT_JOBS slot and stalls every queued run.
    try {
      await this._streamJobMessagesInner(active, executePromise);
    } catch (error) {
      // Without this catch the rejection escaped entirely: the caller only
      // assigns `active.streamTask` and never awaits it, so Node's default
      // unhandledRejection behaviour terminated the process — and none of the
      // terminal bookkeeping below ran, leaving the DB row stuck at "running",
      // the client UI spinning, and the app ledger holding the estimate.
      const message = error instanceof Error ? error.message : String(error);
      this.logError("job message streaming failed", error);
      active.finished = true;
      active.status = "failed";
      active.error = message;
      try {
        await this.sendMessage({
          type: "job_update",
          status: "failed",
          job_id: active.jobId,
          workflow_id: active.workflowId,
          error: message
        });
      } catch (sendError) {
        this.logError("terminal job_update send failed", sendError);
      }
      await this.persistTerminalJobStatus(active);
      await this.settleApplicationInvocation(active);
      releaseSpend(this.userId ?? "1", active.jobId);
    } finally {
      // Terminal: the session stops buffering and starts its retention
      // window, so a client reconnecting shortly after still gets the tail
      // (and the outcome) before the persisted row becomes the only source.
      active.runSession?.finish(active.status);
      this.activeJobs.delete(active.jobId);
      this.drainQueue();
    }
  }

  /**
   * Write the run's terminal status onto the persisted Job row. Skipped for
   * explicitly session-scoped runs, which own no row. Never throws —
   * persistence is best-effort and must not mask the run's own outcome.
   */
  private async persistTerminalJobStatus(active: ActiveJob): Promise<void> {
    if (
      (active.executionOptions?.persistence ??
        DEFAULT_RUN_JOB_EXECUTION_OPTIONS.persistence) !== "job"
    ) {
      return;
    }
    try {
      const job = (await Job.get(active.jobId)) as Job | null;
      // A DB-only cancel (tRPC `jobs.cancel`) can finalize the row as cancelled
      // while the job is still executing in memory. Don't overwrite that with a
      // completed/failed status when the in-flight run finishes.
      if (job) {
        if (job.status !== "cancelled") {
          if (active.status === "completed") {
            job.markCompleted();
          } else if (active.status === "failed") {
            job.markFailed(active.error ?? "Unknown error");
          } else if (active.status === "cancelled") {
            job.markCancelled();
          }
        }
        job.cost = this.runMeasuredCost(active);
        await job.save();
      }
    } catch (error) {
      this.logError("job persistence (final status) failed", error);
    }
  }

  /**
   * Close the app's ledger row at what the run actually cost. Until this lands
   * the run keeps counting against the budget at its estimate, which is the
   * conservative direction: a crash cannot free spend it may have incurred.
   * The total is what anything measured: charges a node reported for itself
   * plus generation the cost ledger priced. An absent total still means
   * "nothing measured this run", not "this run was free" — passing null keeps
   * the estimate standing rather than handing the spend back. Never throws.
   */
  private async settleApplicationInvocation(active: ActiveJob): Promise<void> {
    if (!active.applicationId) return;
    try {
      await settleInvocation(
        active.applicationId,
        active.jobId,
        this.runMeasuredCost(active),
        active.status === "failed"
          ? "failed"
          : active.status === "cancelled"
            ? "cancelled"
            : "completed"
      );
    } catch (error) {
      this.logError("application invocation settlement failed", error);
    }
  }

  private async _streamJobMessagesInner(
    active: ActiveJob,
    executePromise: Promise<{
      status: "completed" | "failed" | "cancelled";
      error?: string;
      outputs?: Record<string, unknown[]>;
    }>
  ): Promise<void> {
    let terminalSeen = false;
    let terminalWithResultSeen = false;
    let outputUpdateSeen = false;
    let finalOutputs: Record<string, unknown[]> = {};
    // Per-node arrival counter for `generation_complete.index` within this job.
    // The function is scoped to one job, so keying by node_id alone yields a
    // per-(job_id, node_id) monotonic index. DB-ordering reconciliation is a
    // later step (RFC Decision 8); this is the in-memory arrival order.
    const generationIndexByNode = new Map<string, number>();
    // Arrival positions already autosaved in THIS run, keyed `${nodeId} ${index}`.
    // A single generation_complete can persist several assets (a `list[image]`
    // output, or media + text), so dedupe by the event's arrival index — NOT by
    // a total asset count, which would under-save the next event (RFC D8).
    const autosavedSlots = new Set<string>();
    // Cross-run replay dedupe: the `generation_index` values already persisted
    // for a node by a PRIOR run. Warmed with ONE `Asset.paginate` on a node's
    // first generation_complete, then reused for every later variant — so an
    // N-variant run does one query per node, not one per variant (RFC D8).
    const persistedIndexByNode = new Map<string, Set<number>>();

    // The kernel opens every run with the same running update. Authoritative
    // SDK runs relay that one and avoid an otherwise duplicate WebSocket
    // frame. Legacy clients keep the eager acknowledgement.
    let runningSeen = false;
    if (!active.requireTerminalResult) {
      await this.sendMessage({
        type: "job_update",
        status: "running",
        job_id: active.jobId,
        workflow_id: active.workflowId
      });
      runningSeen = true;
    }
    // Guard the framing contract for authoritative runs: a terminal update
    // must never be the first job_update a client sees. The kernel emits
    // running before it can fail, but a run that dies before the kernel
    // starts — or a future reordering there — must not silently drop the
    // acknowledgement.
    const ensureRunningFrame = async (): Promise<void> => {
      if (runningSeen) return;
      runningSeen = true;
      await this.sendMessage({
        type: "job_update",
        status: "running",
        job_id: active.jobId,
        workflow_id: active.workflowId
      });
    };

    const executionSettled = executePromise
      .then((result) => {
        active.status = result.status;
        active.error = result.error;
        finalOutputs = result.outputs ?? {};
      })
      .catch((err) => {
        this.logError("job execution failed", err);
        active.status = "failed";
        active.error = formatSanitizedError(err);
      })
      .finally(() => {
        active.finished = true;
      });
    const waitForActivity = createRelayActivityWaiter(
      active.context,
      executionSettled
    );

    const graphNodes =
      (
        active.graph as {
          nodes?: Array<{ id?: unknown; type?: unknown }>;
        }
      ).nodes ?? [];
    const graphNodeMap = new Map<string, { id?: unknown; type?: unknown }>();
    for (const n of graphNodes) {
      if (isString(n.id)) {
        graphNodeMap.set(n.id, n);
      }
    }

    while (!active.finished || active.context.hasMessages()) {
      while (active.context.hasMessages()) {
        const msg = active.context.popMessage();
        if (!msg) break;
        const outbound: Record<string, unknown> = { ...msg };
        outbound.job_id ??= active.jobId;
        outbound.workflow_id ??= active.workflowId;
        // Leave a nullish error untouched (the kernel stamps `error: null` on
        // every update) — only sanitize a real error value. Formatting null here
        // would ship the literal string "null" to clients.
        if (outbound.error != null) {
          outbound.error = formatSanitizedError(outbound.error);
        }
        if (outbound.type === "notification" && isString(outbound.content)) {
          outbound.content = sanitizeLargeText(outbound.content);
        }

        // Every message, not just node updates: a `prediction` is where
        // ledger-priced generation spend (Replicate, Gemini, OpenAI, …)
        // reports itself, and this is the path whose terminal status and app
        // settlement read the run's measured cost.
        this._handleNodeProviderCost(active, outbound);
        if (outbound.type === "node_update" && outbound.status === "error") {
          log.error("Node error", {
            jobId: active.jobId,
            nodeId: outbound.node_id,
            error: outbound.error
          });
        } else if (
          outbound.type === "job_update" &&
          outbound.status === "failed"
        ) {
          log.error("Job failed", {
            jobId: active.jobId,
            error: outbound.error
          });
        }

        // Skip messages for constant/input nodes — they produce trivial
        // outputs that don't need to be relayed to the frontend.
        if (
          outbound.type === "output_update" ||
          outbound.type === "node_update" ||
          outbound.type === "generation_complete"
        ) {
          const nodeId = String(outbound.node_id ?? "");
          const node = graphNodeMap.get(nodeId);
          const nodeType = isString(node?.type) ? node.type : "";

          // Skip constant and input nodes entirely
          if (
            nodeType.startsWith("nodetool.constant.") ||
            nodeType.startsWith("nodetool.input.")
          ) {
            continue;
          }

          const meta = this.getNodeMetadata?.(nodeType);

          // Stamp an arrival-order `index` on generation_complete, keyed per
          // (job_id, node_id) (the function is job-scoped, so node_id alone
          // suffices). job_id/workflow_id were already backfilled by the
          // outbound spread above.
          if (outbound.type === "generation_complete") {
            const arrivalIndex = generationIndexByNode.get(nodeId) ?? 0;
            outbound.index = arrivalIndex;
            generationIndexByNode.set(nodeId, arrivalIndex + 1);

            // Autosave one generation per generation_complete on the RAW outputs
            // (before the normalize at the bottom of this block strips inline
            // bytes), tagged { jobId, nodeId, index }. This is the autosave
            // cutover (RFC §7, D3): persistence is driven per generation event,
            // not by the terminal node_update{completed} — so an N-execution
            // run persists N distinct generations.
            //
            // Replay dedupe (D8) is keyed on the event's arrival `index`, NOT on
            // a total asset count: a single generation_complete can persist
            // several assets (a `list[image]` output, or media + a text asset),
            // so a count-vs-index gate would under-save the very first run. Two
            // guards, both keyed by (nodeId, index):
            //   - in-run: skip if this arrival slot was already saved this run;
            //   - cross-run: skip if an asset for (jobId, nodeId) already carries
            //     metadata.generation_index === arrivalIndex (a reconnect replay
            //     re-streams the same events with arrivalIndex back at 0..N-1).
            // Server-only (D9): this is the websocket runner; the browser never
            // reaches runJob, so no browser autosave is introduced here.
            if (
              active.executionOptions.assetPersistence === "auto" &&
              meta?.auto_save_asset &&
              outbound.outputs != null
            ) {
              const userId = this.userId ?? "1";
              const slotKey = `${nodeId} ${arrivalIndex}`;
              // Warm the cross-run replay set once per node (on its first
              // generation_complete), then reconcile every later variant
              // against the in-memory set — one DB read per node, not per slot.
              let persistedIndices = persistedIndexByNode.get(nodeId);
              if (persistedIndices === undefined) {
                persistedIndices = new Set<number>();
                // Best-effort like every other persistence on this path: a
                // DB-free run (session persistence in the reliability harness,
                // a misconfigured deployment) must degrade to skipping the
                // replay dedupe, not kill the drain loop and fail the job.
                try {
                  const [persisted] = await Asset.paginate(userId, {
                    jobId: active.jobId,
                    nodeId,
                    limit: 1000
                  });
                  for (const a of persisted) {
                    const gi = (
                      a.metadata as { generation_index?: unknown } | null
                    )?.generation_index;
                    if (isNumber(gi)) persistedIndices.add(gi);
                  }
                } catch (err) {
                  log.warn("generation replay-dedupe read failed", {
                    nodeId,
                    error: err instanceof Error ? err.message : String(err)
                  });
                }
                persistedIndexByNode.set(nodeId, persistedIndices);
              }

              if (
                !autosavedSlots.has(slotKey) &&
                !persistedIndices.has(arrivalIndex)
              ) {
                autosavedSlots.add(slotKey);
                try {
                  await autoSaveAssets(
                    outbound.outputs as Record<string, unknown>,
                    {
                      userId,
                      workflowId: active.workflowId,
                      jobId: active.jobId,
                      nodeId,
                      textOutputName: primaryTextOutputName(meta),
                      generationIndex: arrivalIndex,
                      properties:
                        (outbound.properties as Record<
                          string,
                          unknown
                        > | null) ?? undefined
                    }
                  );
                } catch (err) {
                  log.warn("autoSaveAssets error", { error: String(err) });
                }
              }
            }
          }

          // Relay output_update for display-sink nodes (Output, Preview) and
          // for streaming or auto-saving generative nodes (FAL / Replicate /
          // Kie / …) so the client receives one event per yielded item — the
          // UI accumulates and renders each generation as it arrives. The
          // Preview node re-emits each chunk it receives on its own terminal
          // `output` handle; relaying those is what lets the preview stream
          // incrementally instead of collapsing to the final value.
          if (outbound.type === "output_update") {
            const isDisplaySink =
              nodeType.includes("Output") || nodeType.endsWith(".Preview");
            const isStreamingLeaf =
              Boolean(meta?.is_streaming_output) ||
              Boolean(meta?.auto_save_asset);
            if (!isDisplaySink && !isStreamingLeaf) continue;
            outputUpdateSeen = true;
          }

          const isNodeError =
            outbound.type === "node_update" && outbound.status === "error";
          if (
            !isNodeError &&
            (active.executionOptions.eventDetail === "terminal" ||
              (active.executionOptions.eventDetail === "outputs" &&
                (outbound.type === "node_update" ||
                  outbound.type === "generation_complete")))
          ) {
            continue;
          }

          // Materialize binary assets to temp URLs before sending over WebSocket
          if (outbound.type === "node_update" && outbound.result != null) {
            outbound.result = await active.context.normalizeOutputValue(
              outbound.result
            );
          }
          if (outbound.type === "output_update" && outbound.value != null) {
            outbound.value = await active.context.normalizeOutputValue(
              outbound.value
            );
          }
          // Normalize generation_complete.outputs the same way node_update.result
          // is treated (raw bytes → temp URLs) before sending over the wire.
          if (
            outbound.type === "generation_complete" &&
            outbound.outputs != null
          ) {
            outbound.outputs = await active.context.normalizeOutputValue(
              outbound.outputs
            );
          }
        }
        if (
          outbound.type === "edge_update" &&
          active.executionOptions.eventDetail !== "full"
        ) {
          continue;
        }
        const status =
          outbound.type === "job_update" ? String(outbound.status ?? "") : "";
        const suppressProvisionalCompletion =
          active.requireTerminalResult &&
          status === "completed" &&
          outbound.result === undefined;
        if (!suppressProvisionalCompletion) {
          if (outbound.type === "job_update") {
            if (status === "running") {
              runningSeen = true;
            } else if (TERMINAL_JOB_STATUSES.includes(status)) {
              await ensureRunningFrame();
            }
          }
          await this.sendMessage(outbound);
        }
        if (outbound.type === "job_update" && !suppressProvisionalCompletion) {
          if (TERMINAL_JOB_STATUSES.includes(status)) {
            terminalSeen = true;
            if (outbound.result !== undefined) {
              terminalWithResultSeen = true;
            }
          }
        }
      }
      if (!active.finished) {
        await waitForActivity();
      }
    }

    // The authoritative terminal snapshot is consumed in every event-detail
    // mode. Keep it just as client-safe as streamed output_update values;
    // otherwise Outputs/Full can replace a working temp URL with raw media.
    if (Object.keys(finalOutputs).length > 0) {
      finalOutputs = await this.normalizeFinalOutputs(active, finalOutputs);
    }

    if (
      active.executionOptions.eventDetail !== "terminal" &&
      !outputUpdateSeen &&
      Object.keys(finalOutputs).length > 0
    ) {
      await this.sendOutputUpdates(active, finalOutputs);
    }

    const relayCompletedAt = performance.now();

    if (
      !terminalSeen ||
      (!terminalWithResultSeen && Object.keys(finalOutputs).length > 0)
    ) {
      await ensureRunningFrame();
      await this.sendMessage({
        type: "job_update",
        status: active.status,
        job_id: active.jobId,
        workflow_id: active.workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });
    }

    const terminalDeliveredAt = performance.now();
    log.info("Job completed", {
      jobId: active.jobId,
      status: active.status,
      executionOptions: active.executionOptions,
      timings: {
        queueMs: active.timings.queueMs,
        graphLoadedMs: active.timings.graphLoadedMs,
        graphHydratedMs: active.timings.graphHydratedMs,
        preRunMs: active.timings.preRunMs,
        persistenceMs: active.timings.persistenceMs,
        executionAndRelayMs: Math.max(
          0,
          relayCompletedAt - active.timings.kernelStartedAt
        ),
        terminalDeliveryMs: Math.max(0, terminalDeliveredAt - relayCompletedAt),
        totalMs: Math.max(0, terminalDeliveredAt - active.timings.acceptedAt)
      }
    });

    await this.persistTerminalJobStatus(active);
    await this.settleApplicationInvocation(active);
    releaseSpend(this.userId ?? "1", active.jobId);
    // Slot release + queue drain happen in the streamJobMessages wrapper's
    // finally, so they run even if the drain loop above throws.
  }

  async reconnectJob(
    jobId: string,
    workflowId?: string,
    lastSeq = 0
  ): Promise<void> {
    // A resilient session is the authoritative answer: the run may be
    // executing on another connection's runner right now, or have finished
    // while this client was away — either way the seq-stamped buffer holds
    // exactly what was missed. Adopt it so this connection's `cancel_job` /
    // `stream_input` / `stop` reach the runner that owns the ExecutionSession.
    const registered = jobRunRegistry.get(this.userId ?? "1", jobId);
    if (registered) {
      const { replay, incomplete } = registered.attach(
        this.jobDeliveryTarget,
        lastSeq
      );
      if (registered.status === "running") {
        this.adoptedJobIds.add(jobId);
      }
      // Header first, then the missed tail; live frames queue behind them on
      // the session's ordered delivery chain.
      await registered.deliverReplay(this.jobDeliveryTarget, [
        {
          type: "job_resumed",
          job_id: jobId,
          workflow_id: workflowId ?? registered.workflowId ?? null,
          status: registered.status,
          last_seq: registered.lastSeq,
          replay_count: replay.length,
          replay_incomplete: incomplete
        },
        ...replay
      ]);
      return;
    }

    const active = this.activeJobs.get(jobId);
    if (!active) {
      // No session and no in-memory job: the run ended long enough ago that
      // retention elapsed, or this process never had it. A row that already
      // reached a settled outcome is echoed verbatim — a completed run stays
      // completed, and the replay-unavailable note rides alongside as an
      // `error` string explaining only the missing events.
      //
      // Every other row status (queued, scheduled, running) is reported as
      // failed: nothing is left that could
      // ever send this client another frame, and reporting the row as-is
      // parks the UI in a state that never settles — a `queued` row from a
      // dead connection's drained queue reads as "running" with a live Stop
      // button forever.
      // Ownership rule as in the jobs router: another user's row is
      // indistinguishable from a missing one — it must be neither reported
      // nor settled below.
      const row = (await Job.get(jobId)) as Job | null;
      const job = row && row.user_id === (this.userId ?? "1") ? row : null;
      const settled =
        job != null &&
        (job.status === "completed" ||
          job.status === "failed" ||
          job.status === "cancelled");
      const replayUnavailable =
        job != null && job.status !== "failed" && job.status !== "cancelled";
      // A non-settled row with no session and no in-memory job is a zombie:
      // nothing is left that could ever finish it. Persist the failure when
      // this instance owns the row (or nothing claims it), so the row stops
      // advertising an in-flight run — otherwise every reload rediscovers it,
      // reattaches, and re-reports the same loss forever. A row claimed by
      // another instance is left alone: on a multi-instance deployment this
      // connection may simply have been balanced away from a run that is
      // still executing.
      if (job && !settled) {
        const instanceId = getInstanceId();
        const ownedHere =
          !job.runner_instance ||
          !instanceId ||
          job.runner_instance === instanceId;
        if (ownedHere) {
          try {
            job.markFailed(
              "Run was lost after the execution connection went away."
            );
            await job.save();
          } catch (error) {
            this.logError("stale job row cleanup failed", error);
          }
        }
      }
      await this.sendMessage({
        type: "job_update",
        status: settled ? job.status : "failed",
        job_id: jobId,
        workflow_id: workflowId ?? job?.workflow_id ?? null,
        ...(job
          ? replayUnavailable
            ? {
                error:
                  "Job event replay is unavailable after the execution connection was lost."
              }
            : job.error
              ? { error: job.error }
              : {}
          : { error: `Job ${jobId} not found` })
      });
      return;
    }

    await this.sendMessage({
      type: "job_update",
      status: active.status,
      job_id: jobId,
      workflow_id: workflowId ?? active.workflowId
    });

    for (const status of Object.values(active.context.getNodeStatuses())) {
      await this.sendMessage({
        ...status,
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
    for (const status of Object.values(active.context.getEdgeStatuses())) {
      await this.sendMessage({
        ...status,
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
  }

  async cancelJob(
    jobId: string,
    workflowId?: string
  ): Promise<Record<string, unknown>> {
    if (!jobId) {
      return { error: "No job_id provided" };
    }

    // A run that's still queued has no ActiveJob yet — drop it from the queue
    // and tell the client it's cancelled before it ever starts.
    const queued = this.jobQueue.remove(jobId);
    if (queued) {
      releaseSpend(this.userId ?? "1", jobId);
      const cancelledWorkflowId = queued.workflow_id ?? workflowId ?? null;
      // Mark the persisted queued row cancelled so it leaves the queue in
      // jobs.list too (not just the in-memory queue).
      if (
        resolveRunJobExecutionOptions(
          queued.execution_options,
          queued.require_terminal_result === true
        ).persistence === "job"
      ) {
        try {
          const job = await Job.get(jobId);
          if (job) {
            job.markCancelled();
            await job.save();
          }
        } catch (err) {
          this.logError("cancel persistence failed", err);
        }
      }
      await this.sendMessage({
        type: "job_update",
        status: "cancelled",
        job_id: jobId,
        workflow_id: cancelledWorkflowId
      });
      this.broadcastQueuePositions();
      return {
        message: "Queued job cancelled",
        job_id: jobId,
        workflow_id: cancelledWorkflowId
      };
    }

    const active = this.activeJobs.get(jobId);
    if (!active) {
      // Not ours, but possibly still running on the connection that started
      // it (this client reconnected after a drop). Cancel through the
      // session's hooks and persist the row here — the owning runner's own
      // terminal bookkeeping still runs, and its `job_update` reaches this
      // client over the session it just adopted.
      const registered = jobRunRegistry.get(this.userId ?? "1", jobId);
      if (registered && registered.status === "running") {
        registered.cancel();
        try {
          const job = await Job.get(jobId);
          if (job && job.status !== "cancelled") {
            job.markCancelled();
            await job.save();
          }
        } catch (err) {
          this.logError("cancel persistence failed", err);
        }
        return {
          message: "Job cancellation requested",
          job_id: jobId,
          workflow_id: workflowId ?? registered.workflowId ?? ""
        };
      }
      // Nothing local holds it. With more than one instance the run may be
      // executing on another machine: write the cancellation to its row, which
      // the owning instance's poller picks up.
      const remote = await requestRemoteJobCancel(this.userId ?? "1", jobId);
      if (remote.cancelled) {
        return {
          message: "Job cancellation requested",
          job_id: jobId,
          workflow_id: workflowId ?? remote.workflowId ?? ""
        };
      }
      return {
        error: "Job not found or already completed",
        job_id: jobId,
        workflow_id: workflowId ?? ""
      };
    }

    if (active.session) {
      active.session.cancel();
    }
    active.status = "cancelled";

    // Persist the cancellation to the DB right away, mirroring the queued
    // branch and the tRPC jobs.cancel path. The runner's own cleanup can lag
    // (it drains in-flight messages before its .finally() persists), so
    // without this the persisted row stays "running" and jobs.list — which the
    // Queue panel reads from — keeps reporting the job as running even though
    // the toolbar Stop already fired.
    //
    // Deliberately NO eager `job_update cancelled` frame here: the kernel's
    // own terminal frame relays through the drain loop AFTER the node-level
    // terminal updates, and an out-of-band frame ahead of them tells the
    // client the job is over while nodes still read "running" — the exact
    // lifecycle violation the reliability harness's mid-run-cancel journeys
    // pin (`lifecycle.running-after-job-terminal`), and what left canvas
    // nodes stuck spinning after a Stop. The `cancel_job` RPC response is the
    // immediate acknowledgement; the ordered terminal arrives a beat later.
    if (
      (active.executionOptions?.persistence ??
        DEFAULT_RUN_JOB_EXECUTION_OPTIONS.persistence) === "job"
    ) {
      try {
        const job = await Job.get(jobId);
        if (job && job.status !== "cancelled") {
          job.markCancelled();
          await job.save();
        }
      } catch (err) {
        this.logError("cancel persistence failed", err);
      }
    }
    const cancelledWorkflowId = workflowId ?? active.workflowId ?? null;

    // Do NOT set active.finished = true here. Let the runner's cancellation
    // propagate through executePromise's .finally() callback so that
    // streamJobMessages can drain remaining messages and persist job state.
    return {
      message: "Job cancellation requested",
      job_id: jobId,
      workflow_id: cancelledWorkflowId ?? ""
    };
  }

  getStatus(jobId?: string) {
    if (jobId) {
      const active = this.activeJobs.get(jobId);
      if (!active) {
        return { status: "not_found", job_id: jobId };
      }
      return {
        status: active.status,
        job_id: active.jobId,
        workflow_id: active.workflowId
      };
    }

    return {
      active_jobs: Array.from(this.activeJobs.values()).map((job) => ({
        job_id: job.jobId,
        workflow_id: job.workflowId,
        status: job.status
      }))
    };
  }

  async clearModels(): Promise<Record<string, unknown>> {
    return {
      message:
        "Model clearing is managed by provider implementations in TS runtime"
    };
  }

  /**
   * Expose the plan-approval round-trip on a processing context so any Agent
   * that plans inside this run (e.g. an Agent node in plan mode) pauses for
   * user approval before executing. See PLAN_APPROVAL_CONTEXT_KEY in
   * `@nodetool-ai/agents`.
   */
  private attachPlanApproval(
    context: RuntimeProcessingContext,
    threadId: string | null,
    clock?: SandboxClock
  ): void {
    attachPlanApprovalTo(
      context,
      threadId,
      (id, plan) => this.chat.requestPlanApproval(id, plan),
      clock
    );
  }

  /**
   * Accumulate provider cost from a completed node_update into the job total.
   *
   * The ledger row is *not* written here. `ExecutionSession` attaches
   * `attachRunCostLedger` to the same context, so every surface — this server,
   * the CLI, the debug harness — records the charge once, from one
   * implementation. Writing it again here would double-count every FAL and kie
   * generation.
   */
  private _handleNodeProviderCost(
    active: ActiveJob,
    outbound: Record<string, unknown>
  ): void {
    if (outbound.type === "prediction") {
      this._handlePredictionCost(active, outbound);
      return;
    }
    if (
      outbound.type !== "node_update" ||
      outbound.status !== "completed" ||
      outbound.provider_cost == null
    ) {
      return;
    }
    const providerCost = outbound.provider_cost as ProviderCost;
    const amount = (providerCost as { amount?: unknown }).amount;
    if (isFiniteNumber(amount)) {
      (active.selfReportedCostNodeIds ??= new Set()).add(
        String(outbound.node_id ?? "")
      );
      active.providerCostTotal = (active.providerCostTotal ?? 0) + amount;
    } else {
      // A non-finite amount (NaN/Infinity from a buggy provider call) can't
      // be accumulated above, and JSON can't even represent it faithfully
      // (`JSON.stringify(NaN)` silently becomes `null`). Rather than ship a
      // `provider_cost` the wire contract calls a real number, drop it — the
      // rest of the `node_update` still reports normally.
      delete outbound.provider_cost;
    }
  }

  /**
   * Accumulate a completed unit-billed `prediction` into the run total, priced
   * the way the cost ledger prices it. Replicate, Gemini, OpenAI, MiniMax and
   * ElevenLabs generation reports no `provider_cost` of its own, so without
   * this a run on those providers settled as "nothing measured" and stayed
   * booked at its estimate.
   */
  private _handlePredictionCost(
    active: ActiveJob,
    outbound: Record<string, unknown>
  ): void {
    if (outbound.status !== "completed") return;
    const capability = isString(outbound.capability) ? outbound.capability : null;
    if (!isUnitBilledCapability(capability)) return;
    const provider = isString(outbound.provider) ? outbound.provider : "";
    const model = isString(outbound.model) ? outbound.model : "";
    if (!provider || !model) return;
    const priced = priceGeneration({
      userId: this.userId ?? "1",
      provider,
      model,
      capability,
      quantity: 1,
      params: isRecord(outbound.params) ? outbound.params : {}
    });
    if (!priced || !isFiniteNumber(priced.cost)) return;
    const nodeId = String(outbound.node_id ?? "");
    const byNode = (active.predictionCostByNode ??= new Map());
    byNode.set(nodeId, (byNode.get(nodeId) ?? 0) + priced.cost);
  }

  /**
   * What this run cost, as far as anything measured it: node-reported provider
   * charges plus ledger-priced generation on nodes that reported none. Null
   * when nothing measured — which keeps an app invocation standing at its
   * estimate rather than handing the spend back.
   */
  private runMeasuredCost(active: ActiveJob): number | null {
    const selfReported = active.selfReportedCostNodeIds;
    let total = active.providerCostTotal ?? 0;
    let measured = active.providerCostTotal != null;
    for (const [nodeId, cost] of active.predictionCostByNode ?? []) {
      // The provider's own number wins over the catalog's estimate for the
      // same node — counting both would double-bill a FAL or kie generation.
      if (selfReported?.has(nodeId)) continue;
      total += cost;
      measured = true;
    }
    return measured && total > 0 ? total : null;
  }

  /**
   * Resolve the source image bytes for image-edit / image-to-video calls.
   * Searches in priority order:
   *   1. `media_generation.source_asset_id`  → load from Asset storage
   *   2. The first `image_url` content block on the user message
   *      (supports asset_id, http(s) uri, and inline data:base64 payloads)
   * Returns `null` when no usable source image can be found.
   */
  private async resolveSourceImageBytes(
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    userId: string
  ): Promise<Uint8Array | null> {
    const tryLoadAsset = async (
      assetId: string
    ): Promise<Uint8Array | null> => {
      if (!assetId) return null;
      try {
        const asset = await Asset.find(userId, assetId);
        if (!asset) return null;
        return await retrieveAssetBytes(
          getAssetAdapter(),
          userId,
          assetId,
          asset.content_type
        );
      } catch (err) {
        log.warn("resolveSourceImageBytes: asset load failed", {
          assetId,
          error: err instanceof Error ? err.message : String(err)
        });
        return null;
      }
    };

    const explicitId = isString(mediaGeneration.source_asset_id)
      ? (mediaGeneration.source_asset_id as string)
      : null;
    if (explicitId) {
      const fromAsset = await tryLoadAsset(explicitId);
      if (fromAsset && fromAsset.length > 0) return fromAsset;
    }

    const content = data.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (!isObjectLike(c)) continue;
        const block = c as Record<string, unknown>;
        if (block.type !== "image_url") continue;
        const image = (block.image ?? {}) as Record<string, unknown>;
        const assetId = isString(image.asset_id)
          ? (image.asset_id as string)
          : null;
        if (assetId) {
          const bytes = await tryLoadAsset(assetId);
          if (bytes && bytes.length > 0) return bytes;
        }
        const uri = isString(image.uri) ? (image.uri as string) : null;
        if (uri) {
          if (uri.startsWith("asset://")) {
            // `@`-mentioned or library-dragged asset: `asset://<id>.<ext>`.
            const withoutScheme = uri.slice("asset://".length);
            const dotIdx = withoutScheme.lastIndexOf(".");
            const mentionedId =
              dotIdx > -1 ? withoutScheme.slice(0, dotIdx) : withoutScheme;
            const bytes = await tryLoadAsset(mentionedId);
            if (bytes && bytes.length > 0) return bytes;
          } else if (uri.startsWith("data:")) {
            const commaIdx = uri.indexOf(",");
            if (commaIdx > -1) {
              const b64 = uri.slice(commaIdx + 1);
              try {
                return new Uint8Array(Buffer.from(b64, "base64"));
              } catch {
                /* fall through */
              }
            }
          } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
            // A chat client picked this uri, so the media-ref egress policy
            // decides — including on every redirect hop, which the predicate
            // this replaced never saw.
            try {
              const resp = await fetchExternalMedia(uri);
              if (resp.ok) {
                return new Uint8Array(await resp.arrayBuffer());
              }
            } catch (err) {
              log.warn("resolveSourceImageBytes: fetch failed", {
                uri,
                error: err instanceof Error ? err.message : String(err)
              });
            }
          }
        }
        const data64 = isString(image.data) ? (image.data as string) : null;
        if (data64) {
          try {
            return new Uint8Array(Buffer.from(data64, "base64"));
          } catch {
            /* ignore */
          }
        }
      }
    }
    return null;
  }

  /**
   * Build the map of configured BaseProvider instances for the given user.
   * Used by MCP tools (`find_model`, media generation) that need provider
   * access. Called through {@link configuredProvidersCache}, which decides
   * when a credential connected mid-session forces a rebuild.
   */
  private async buildConfiguredProviders(
    userId: string
  ): Promise<Record<string, BaseProvider>> {
    const providersMod = await import("@nodetool-ai/runtime");
    const { getSecret: getStoredSecret } = await import("@nodetool-ai/models");
    const getSecret = (key: string) =>
      getStoredSecret(key, userId).then((v) => v ?? undefined);
    const ids: string[] = providersMod.listRegisteredProviderIds();
    const result: Record<string, BaseProvider> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          if (await providersMod.isProviderConfigured(id, getSecret)) {
            result[id] = await providersMod.getProvider(id, getSecret);
          }
        } catch (err) {
          log.debug("Skipping provider for find_model", {
            provider: id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      })
    );
    return result;
  }

  async handleInference(
    data: Record<string, unknown>,
    requestSeq: number,
    signal?: AbortSignal
  ): Promise<void> {
    const providerId = isString(data.provider)
      ? data.provider
      : this.defaultProvider;
    const model = isString(data.model) ? data.model : this.defaultModel;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    log.debug("Inference request", {
      model,
      provider: providerId,
      messages: rawMessages.length
    });

    const messages: ProviderMessage[] = rawMessages.map((m) => {
      const msg = m as Record<string, unknown>;
      return {
        role: (isString(msg.role)
          ? msg.role
          : "user") as ProviderMessage["role"],
        content: isString(msg.content)
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as MessageContent[])
            : "",
        toolCallId: isString(msg.toolCallId) ? msg.toolCallId : null,
        toolCalls: Array.isArray(msg.toolCalls)
          ? (msg.toolCalls as Array<{
              id: string;
              name: string;
              args: Record<string, unknown>;
            }>)
          : null,
        threadId: null
      };
    });

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured"
      });
      return;
    }

    const rawTools = Array.isArray(data.tools) ? data.tools : [];
    const tools: ProviderTool[] = rawTools
      .map((t) => {
        const tool = t as Record<string, unknown>;
        return {
          name: isString(tool.name) ? tool.name : "",
          description: isString(tool.description)
            ? tool.description
            : undefined,
          inputSchema:
            typeof tool.inputSchema === "object"
              ? (tool.inputSchema as Record<string, unknown>)
              : undefined
        };
      })
      .filter((t) => t.name.length > 0);

    const provider = await this.resolveProvider(providerId, this.userId ?? "1");
    for await (const item of provider.generateMessagesTraced({
      messages,
      model,
      tools: tools.length > 0 ? tools : undefined,
      signal
    })) {
      if (requestSeq !== this.chatRequestSeq) break; // cancelled
      if ("type" in item && item.type === "chunk") {
        await this.sendMessage({ ...item, seq: requestSeq });
      } else if ("name" in item) {
        const toolItem = item as {
          id: string;
          name: string;
          args: Record<string, unknown>;
        };
        log.info("Tool call", { tool: toolItem.name, args: toolItem.args });
        await this.sendMessage({
          type: "tool_call",
          id: toolItem.id,
          name: toolItem.name,
          args: toolItem.args,
          seq: requestSeq
        });
      }
    }

    if (requestSeq === this.chatRequestSeq) {
      log.debug("Inference complete");
      await this.sendMessage({ type: "inference_done", seq: requestSeq });
    }
  }

  /**
   * Run a one-shot media-generation request (text-to-image, image-to-image,
   * text-to-video, or text-to-audio) and return the produced asset ids.
   * Mirrors the image / image_edit / video / audio branches of
   * `handleMediaGenerationMessage` but skips the chat-thread machinery —
   * the caller wants asset ids, not a streamed Message row.
   *
   * Used by the `generate_media` RPC for the sketch editor's direct-gen
   * image layers and the timeline's direct-gen video / audio clips; the
   * chat-path equivalents stay in `handleMediaGenerationMessage` for now.
   */
  /**
   * Run a one-shot text generation and return the answer — no chat thread, no
   * job row, no workflow. The text twin of `runDirectMediaGeneration`, and
   * what a surface calls when it needs a model to write or decide one thing.
   *
   * With a schema the call is structured output: the model is forced through
   * one tool whose input schema is that shape, and the parsed object comes
   * back in `data`. `generateStructured` owns that mechanism, shared with the
   * Director node and the agent nodes, so a schema answered here and a schema
   * answered in a workflow are answered the same way.
   */
  private async runDirectTextGeneration(
    req: DirectTextGenerationRequest
  ): Promise<{ text: string; data: Record<string, unknown> | null }> {
    if (!this.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (req.messages.length === 0) {
      throw new Error("prompt or messages is required");
    }
    const userId = this.userId ?? "1";
    const provider = await this.resolveProvider(req.provider, userId);
    if (req.provider !== "nodetool") {
      // BYOK: the user's own keys, never metered.
      return this.runDirectTextGenerationInner(req, provider);
    }

    // NodeTool's managed provider: admit against the balance (including
    // in-flight reservations), hold the estimate for the duration of the call
    // so concurrent requests admit against each other, and record the real
    // token cost as a prediction row so the balance decrements.
    const estimatedUsd = estimateDirectTextSpend(req);
    const decision = await admitSpend(userId, estimatedUsd);
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const reservationKey = `text:${randomUUID()}`;
    reserveSpend(userId, reservationKey, estimatedUsd);
    try {
      const result = await this.runDirectTextGenerationInner(req, provider);
      // The estimate deliberately over-books, so the tracked token cost is
      // the charge — never the reservation.
      const cost = provider.getTotalCost();
      if (cost > 0) {
        try {
          await Prediction.create<Prediction>({
            user_id: userId,
            provider: "nodetool",
            model: req.model,
            node_type: req.schema ? "direct.structured" : "direct.text",
            cost,
            currency: "USD",
            billing_unit: "tokens",
            quantity: 1,
            workflow_id: null,
            node_id: "",
            status: "completed"
          });
        } catch (err) {
          this.logError("direct text cost persistence failed", err);
        }
      }
      return result;
    } finally {
      releaseSpend(userId, reservationKey);
    }
  }

  /**
   * The provider call itself. Runs under an abort signal registered on the
   * connection, so a `stop` command or a dropped socket interrupts a model
   * that is still generating instead of billing for an answer nobody reads.
   */
  private async runDirectTextGenerationInner(
    req: DirectTextGenerationRequest,
    provider: BaseProvider
  ): Promise<{ text: string; data: Record<string, unknown> | null }> {
    const messages: ProviderMessage[] = req.messages.map((m) => ({
      role: (m.role === "system" || m.role === "assistant" || m.role === "tool"
        ? m.role
        : "user") as ProviderMessage["role"],
      content: m.content,
      toolCallId: null,
      toolCalls: null,
      threadId: null
    }));

    const abort = new AbortController();
    this.rpcAborts.add(abort);
    try {
      if (req.schema) {
        const data = await generateStructured(provider, {
          messages,
          model: req.model,
          maxTokens: req.maxTokens,
          toolName: req.schemaName,
          toolDescription: req.schemaDescription,
          schema: req.schema,
          signal: abort.signal
        });
        return { text: "", data };
      }
      const result = await provider.generateMessageTraced({
        messages,
        model: req.model,
        maxTokens: req.maxTokens,
        signal: abort.signal
      });
      return { text: messageText(result.content), data: null };
    } finally {
      this.rpcAborts.delete(abort);
    }
  }

  private async runDirectMediaGeneration(
    req: DirectMediaGenerationRequest
  ): Promise<{ asset_ids: string[] }> {
    if (!this.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (!req.prompt || !req.prompt.trim()) {
      throw new Error("prompt is required");
    }
    const userId = this.userId ?? "1";
    const provider = await this.resolveProvider(req.provider, userId);
    if (req.provider !== "nodetool") {
      // BYOK: the user's own keys, never metered.
      return this.runDirectMediaGenerationInner(req, provider);
    }

    // NodeTool's managed provider: admit against the balance (including
    // in-flight reservations), reserve the unit-price estimate for the
    // duration of the call, and record the spend as a prediction row so the
    // balance actually decrements. Cost is the larger of the delegate's own
    // tracked cost and the unit-price estimate — fal-style delegates bill
    // per unit and track nothing themselves.
    const variations = Math.max(1, Math.min(Number(req.variations ?? 1), 8));
    // What the request states about the job, in the vocabulary the catalogs
    // bill in — a per-second video model prices the clip asked for, not one
    // second of it.
    const priceParams = extractPricingParams({
      resolution: req.resolution,
      duration_seconds: req.durationSeconds,
      width: req.width,
      height: req.height
    });
    const unit = getModelUnitPrice(
      { id: req.model, provider: "nodetool" },
      priceParams
    );
    const unitPrice =
      unit && !unit.declined && isFiniteNumber(unit.unit_price)
        ? unit.unit_price
        : 0;
    const estimatedUsd = unitPrice * variations;
    const decision = await admitSpend(userId, estimatedUsd);
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const reservationKey = `media:${randomUUID()}`;
    reserveSpend(userId, reservationKey, estimatedUsd);
    try {
      const result = await this.runDirectMediaGenerationInner(req, provider);
      const cost = Math.max(provider.getTotalCost(), estimatedUsd);
      if (cost > 0) {
        try {
          await Prediction.create<Prediction>({
            user_id: userId,
            provider: "nodetool",
            model: req.model,
            node_type: `direct.${req.mode}`,
            cost,
            currency: "USD",
            billing_unit: unit?.billing_unit ?? null,
            // The row's own invariant is cost = unit_price × quantity, so the
            // per-unit figure is derived from what was actually charged. It
            // differs from the catalog price whenever the delegate tracked
            // more than the estimate, and recording the catalog price then
            // would make the row fail to reproduce its own total.
            unit_price: cost / variations,
            quantity: variations,
            workflow_id: null,
            node_id: "",
            status: "completed"
          });
        } catch (err) {
          this.logError("direct media cost persistence failed", err);
        }
      }
      return result;
    } finally {
      releaseSpend(userId, reservationKey);
    }
  }

  /**
   * Entity-mention resolver over the Asset model, scoped to one user. Backs
   * `expandEntitiesForGeneration` on every direct-generation surface.
   */
  private entityRefResolver(
    userId: string
  ): {
    getAssetInfo: (assetId: string) => Promise<{
      id: string;
      content_type: string;
      name: string;
      metadata: Record<string, unknown> | null;
    } | null>;
  } {
    return {
      getAssetInfo: async (assetId) => {
        const asset = await Asset.find(userId, assetId);
        if (!asset) return null;
        return {
          id: asset.id,
          content_type: asset.content_type,
          name: asset.name,
          metadata: asset.metadata ?? null
        };
      }
    };
  }

  /**
   * Resolve entity-derived reference images to provider input bytes. A ref
   * whose asset is gone (or reads back empty) contributes nothing — the same
   * drop rule as an unresolvable mention.
   */
  private async resolveEntityReferenceImages(
    userId: string,
    refs: PromptAssetRef[]
  ): Promise<Uint8Array[]> {
    const out: Uint8Array[] = [];
    for (const ref of refs) {
      const bare = ref.uri.slice("asset://".length);
      const assetId = bare.slice(0, bare.lastIndexOf("."));
      if (!assetId) continue;
      const asset = await Asset.find(userId, assetId);
      if (!asset) continue;
      const bytes = await retrieveAssetBytes(
        getAssetAdapter(),
        userId,
        asset.id,
        asset.content_type
      );
      if (!bytes || bytes.length === 0) continue;
      out.push(bytes);
    }
    return out;
  }

  /**
   * Read one owned asset's bytes, with the descriptive errors the generation
   * paths surface verbatim to callers.
   */
  private async retrieveSourceAssetBytes(
    userId: string,
    assetId: string
  ): Promise<Uint8Array> {
    const asset = await Asset.find(userId, assetId);
    if (!asset) {
      throw new Error(`Source asset not found: ${assetId}`);
    }
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      userId,
      assetId,
      asset.content_type
    );
    if (!bytes) {
      throw new Error(`Source asset bytes not found: ${assetId}`);
    }
    return bytes;
  }

  private async runDirectMediaGenerationInner(
    req: DirectMediaGenerationRequest,
    provider: BaseProvider
  ): Promise<{ asset_ids: string[] }> {
    const userId = this.userId ?? "1";
    const variations = Math.max(1, Math.min(Number(req.variations ?? 1), 8));

    // Entity mentions in the prompt (`entity://<id>`, written by @-mention
    // pickers) expand against the library here: name inline, descriptor into
    // a Consistency references block, reference image routed into the
    // generation inputs below — the same rule node prompts get through
    // mapPromptAssetsToInputs. A mention that resolves to no entity drops.
    const { prompt, referenceImages } = await expandEntitiesForGeneration(
      req.prompt,
      this.entityRefResolver(userId)
    );
    const entityImageBytes = await this.resolveEntityReferenceImages(
      userId,
      referenceImages
    );

    const storeAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const asset = new Asset({
        user_id: userId,
        workflow_id: null,
        name: `${req.mode}_${Date.now()}`,
        content_type: contentType,
        // Home — see the chat media generation path above.
        parent_id: userId
      });
      const fileName = `${asset.id}.${ext}`;
      await storeAssetWithThumbnail(
        asset.user_id,
        asset.id,
        fileName,
        bytes,
        contentType
      );
      asset.size = bytes.length;
      await asset.save();
      return asset.id;
    };

    // Image modes are pixel-addressed on several providers (GPT Image's
    // `size`): derive explicit dimensions from the resolution tier + aspect
    // ratio when the caller sent none — the same numbers the generation nodes
    // always computed. Caller-supplied pixels win.
    const imageSize =
      req.mode === "image" || req.mode === "image_edit"
        ? (resolveImageSize(req.resolution, req.aspectRatio) ?? undefined)
        : undefined;
    const width = req.width ?? imageSize?.width;
    const height = req.height ?? imageSize?.height;

    if (req.mode === "video") {
      const videoModel: ProviderVideoModel = {
        id: req.model,
        name: req.model,
        provider: req.provider
      };
      let bytes: Uint8Array;
      if (req.sourceAssetId) {
        // A source image turns the request into image-to-video: the image is
        // the frame the animation starts from.
        const sourceBytes = await this.retrieveSourceAssetBytes(
          userId,
          req.sourceAssetId
        );
        const i2vParams: ImageToVideoParams = {
          model: videoModel,
          prompt,
          aspectRatio: req.aspectRatio ?? null,
          resolution: req.resolution ?? null,
          durationSeconds: req.durationSeconds ?? null
        };
        bytes = await provider.imageToVideo([sourceBytes], i2vParams);
      } else {
        const params: TextToVideoParams = {
          model: videoModel,
          prompt,
          durationSeconds: req.durationSeconds ?? null
        };
        bytes = await provider.textToVideo(params);
      }
      const assetId = await storeAsset(bytes, "video/mp4", "mp4");
      return { asset_ids: [assetId] };
    }

    if (req.mode === "video_edit") {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for video_edit");
      }
      const sourceBytes = await this.retrieveSourceAssetBytes(
        userId,
        req.sourceAssetId
      );
      const videoModel: ProviderVideoModel = {
        id: req.model,
        name: req.model,
        provider: req.provider
      };
      const bytes = await provider.videoToVideo(sourceBytes, {
        model: videoModel,
        prompt,
        strength: req.strength ?? null,
        durationSeconds: req.durationSeconds ?? null,
        resolution: req.resolution ?? null
      });
      const assetId = await storeAsset(bytes, "video/mp4", "mp4");
      return { asset_ids: [assetId] };
    }

    if (req.mode === "audio") {
      const supportedFormats = new Set([
        "mp3",
        "wav",
        "flac",
        "ogg",
        "aac",
        "pcm"
      ]);
      const requestedFormat =
        req.audioFormat && supportedFormats.has(req.audioFormat)
          ? req.audioFormat
          : null;

      // Prefer providers that return fully-encoded audio (OpenAI, HuggingFace).
      const encoded = await provider.textToSpeechEncoded({
        text: prompt,
        model: req.model,
        voice: req.voice,
        speed: req.speed,
        audioFormat: requestedFormat ?? undefined
      });

      if (encoded) {
        const mimeToExt: Record<string, string> = {
          "audio/mpeg": "mp3",
          "audio/wav": "wav",
          "audio/ogg": "ogg",
          "audio/flac": "flac",
          "audio/aac": "aac"
        };
        const ext = mimeToExt[encoded.mimeType] ?? "flac";
        const assetId = await storeAsset(encoded.data, encoded.mimeType, ext);
        return { asset_ids: [assetId] };
      }

      // Streaming-PCM fallback (OpenAI / Gemini), wrap in WAV unless caller
      // explicitly asked for raw PCM.
      const pcmChunks: Uint8Array[] = [];
      let totalBytes = 0;
      let chunkSampleRate = 24000;
      for await (const chunk of provider.textToSpeech({
        text: prompt,
        model: req.model,
        voice: req.voice,
        speed: req.speed,
        audioFormat: requestedFormat ?? undefined
      })) {
        if (chunk?.samples) {
          if (chunk.sampleRate) chunkSampleRate = chunk.sampleRate;
          const view = new Uint8Array(
            chunk.samples.buffer,
            chunk.samples.byteOffset,
            chunk.samples.byteLength
          );
          const copy = new Uint8Array(view);
          pcmChunks.push(copy);
          totalBytes += copy.byteLength;
        }
      }
      const merged = new Uint8Array(totalBytes);
      let off = 0;
      for (const c of pcmChunks) {
        merged.set(c, off);
        off += c.byteLength;
      }

      if (requestedFormat === "pcm") {
        const assetId = await storeAsset(merged, "audio/pcm", "pcm");
        return { asset_ids: [assetId] };
      }

      // Wrap raw 16-bit PCM in a WAV container so browsers can play it back.
      const sampleRate = chunkSampleRate;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const wavHeader = new ArrayBuffer(44);
      const dv = new DataView(wavHeader);
      const writeStr = (pos: number, str: string) => {
        for (let i = 0; i < str.length; i++)
          dv.setUint8(pos + i, str.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      dv.setUint32(4, 36 + merged.byteLength, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, numChannels, true);
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, byteRate, true);
      dv.setUint16(32, blockAlign, true);
      dv.setUint16(34, bitsPerSample, true);
      writeStr(36, "data");
      dv.setUint32(40, merged.byteLength, true);

      const wav = new Uint8Array(44 + merged.byteLength);
      wav.set(new Uint8Array(wavHeader), 0);
      wav.set(merged, 44);

      const assetId = await storeAsset(wav, "audio/wav", "wav");
      return { asset_ids: [assetId] };
    }

    const imageModel: ProviderImageModel = {
      id: req.model,
      name: req.model,
      provider: req.provider
    };

    let images: Uint8Array[];
    if (req.mode === "image" && entityImageBytes.length > 0) {
      // A mentioned entity carries a reference image: the generation becomes
      // an edit against those images, mirroring how node prompts with
      // entity images route through ImageToImage. The provider throws when
      // the chosen model cannot take input images.
      const params: ImageToImageParams = {
        model: imageModel,
        prompt,
        targetWidth: width ?? null,
        targetHeight: height ?? null,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null
      };
      images = await provider.imageToImages(entityImageBytes, params, variations);
    } else if (req.mode === "image") {
      const params: TextToImageParams = {
        model: imageModel,
        prompt,
        width,
        height,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null
      };
      images = await provider.textToImages(params, variations);
    } else if (req.mode === "inpaint") {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for inpaint");
      }
      if (!req.maskAssetId) {
        throw new Error("mask_asset_id is required for inpaint");
      }
      const adapter = getAssetAdapter();
      const [sourceAsset, maskAsset] = await Promise.all([
        Asset.find(userId, req.sourceAssetId),
        Asset.find(userId, req.maskAssetId)
      ]);
      if (!sourceAsset)
        throw new Error(`Source asset not found: ${req.sourceAssetId}`);
      if (!maskAsset)
        throw new Error(`Mask asset not found: ${req.maskAssetId}`);
      const [sourceBytes, maskBytes] = await Promise.all([
        retrieveAssetBytes(
          adapter,
          userId,
          req.sourceAssetId,
          sourceAsset.content_type
        ),
        retrieveAssetBytes(
          adapter,
          userId,
          req.maskAssetId,
          maskAsset.content_type
        )
      ]);
      if (!sourceBytes)
        throw new Error(`Source asset bytes not found: ${req.sourceAssetId}`);
      if (!maskBytes)
        throw new Error(`Mask asset bytes not found: ${req.maskAssetId}`);
      const params: InpaintingParams = {
        model: imageModel,
        prompt,
        targetWidth: req.width ?? null,
        targetHeight: req.height ?? null,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null,
        mask: maskBytes
      };
      images = await provider.inpaintImages([sourceBytes], params, variations);
    } else {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for image_edit");
      }
      const sourceAsset = await Asset.find(userId, req.sourceAssetId);
      if (!sourceAsset) {
        throw new Error(`Source asset not found: ${req.sourceAssetId}`);
      }
      const sourceBytes = await retrieveAssetBytes(
        getAssetAdapter(),
        userId,
        req.sourceAssetId,
        sourceAsset.content_type
      );
      if (!sourceBytes) {
        throw new Error(`Source asset bytes not found: ${req.sourceAssetId}`);
      }
      const params: ImageToImageParams = {
        model: imageModel,
        prompt,
        targetWidth: width ?? null,
        targetHeight: height ?? null,
        aspectRatio: req.aspectRatio ?? null,
        resolution: req.resolution ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null
      };
      images = await provider.imageToImages(
        [sourceBytes, ...entityImageBytes],
        params,
        variations
      );
    }

    const assetIds: string[] = [];
    for (const bytes of images) {
      const mimeType = detectImageMime(bytes);
      assetIds.push(
        await storeAsset(bytes, mimeType, IMAGE_MIME_TO_EXT[mimeType] ?? "png")
      );
    }
    return { asset_ids: assetIds };
  }

  /**
   * Transcribe a stored audio asset to word-level caption timing. Mirrors the
   * provider path used by the ASR node but skips the workflow machinery — the
   * caller (Studio transcript beats) wants `{ word, startMs, endMs }[]` back in
   * one shot. Timestamps are returned in milliseconds relative to the start of
   * the audio.
   */
  private async runDirectTranscription(req: {
    provider: string;
    model: string;
    assetId: string;
    language?: string;
  }): Promise<{
    text: string;
    words: Array<{ word: string; startMs: number; endMs: number }>;
  }> {
    if (!this.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (!req.assetId) {
      throw new Error("asset_id is required");
    }

    const userId = this.userId ?? "1";
    if (req.provider === "nodetool") {
      const creditDecision = await admitSpend(userId, 0);
      if (!creditDecision.allowed) {
        throw new Error(creditDecision.reason);
      }
    }
    const asset = await Asset.find(userId, req.assetId);
    if (!asset) {
      throw new Error(`Audio asset not found: ${req.assetId}`);
    }
    const bytes = await retrieveAssetBytes(
      getAssetAdapter(),
      userId,
      req.assetId,
      asset.content_type
    );
    if (!bytes) {
      throw new Error(`Audio asset bytes not found: ${req.assetId}`);
    }

    const provider = await this.resolveProvider(req.provider, userId);
    const result = await provider.automaticSpeechRecognition({
      audio: bytes,
      model: req.model,
      language: req.language,
      word_timestamps: true
    });

    // Metered provider: record what the delegate tracked so the spend lands
    // in the ledger the balance is computed from. Best-effort, never throws.
    if (req.provider === "nodetool" && provider.getTotalCost() > 0) {
      try {
        await Prediction.create<Prediction>({
          user_id: userId,
          provider: "nodetool",
          model: req.model,
          node_type: "direct.transcription",
          cost: provider.getTotalCost(),
          currency: "USD",
          workflow_id: null,
          node_id: "",
          status: "completed"
        });
      } catch (err) {
        this.logError("direct transcription cost persistence failed", err);
      }
    }

    const words = (result.chunks ?? [])
      .map((chunk) => ({
        word: chunk.text.trim(),
        startMs: Math.round(chunk.timestamp[0] * 1000),
        endMs: Math.round(chunk.timestamp[1] * 1000)
      }))
      .filter((w) => w.word.length > 0);

    return { text: result.text, words };
  }

  /**
   * Build a tRPC caller bound to this connection's `userId`. Used to dispatch
   * the read-only RPC commands (list_workflows, get_workflow, list_assets,
   * get_asset, list_nodes, get_node) onto the existing tRPC routers — single
   * source of truth, no logic duplication.
   */
  private getTrpcCaller() {
    if (!this.nodeRegistry || !this.apiOptions || !this.pythonBridge) {
      throw new Error(
        "RPC commands require nodeRegistry, apiOptions, and pythonBridge"
      );
    }
    const factory = createCallerFactory(appRouter);
    return factory({
      userId: this.userId,
      registry: this.nodeRegistry,
      apiOptions: this.apiOptions,
      pythonBridge: this.pythonBridge,
      getPythonBridgeReady: this.getPythonBridgeReady ?? (() => true)
    });
  }

  /**
   * Invoke a tRPC procedure and send back a single `rpc_response` frame
   * correlating to `command.request_id`. Returns `null` so the receive loop
   * skips the legacy auto-send (the frame has already been sent here).
   *
   * Errors thrown by the procedure are mapped to `rpc_response.error` using
   * the `apiCode` cause attached by `throwApiError` in the tRPC layer.
   */
  private async runRpc<TResult>(
    command: WebSocketCommandEnvelope,
    fn: () => Promise<TResult>
  ): Promise<Record<string, unknown> | null> {
    const requestId = command.request_id;
    if (!isNonEmptyString(requestId)) {
      return { error: "request_id is required for RPC commands" };
    }
    try {
      const result = await fn();
      await this.sendMessage({
        type: "rpc_response",
        request_id: requestId,
        command: command.command,
        result
      });
    } catch (err) {
      const trpc = err as {
        code?: string;
        message?: string;
        cause?: { apiCode?: string };
      };
      const code = trpc.cause?.apiCode ?? trpc.code ?? "INTERNAL_ERROR";
      const internalMessage = trpc.message ?? String(err);
      const error: RpcErrorPayload = {
        code,
        message: internalMessage,
        retryable: isSdkV1RetryableError(code, internalMessage),
        apiCode: trpc.cause?.apiCode ?? null,
        trpcCode: trpc.code
      };
      await this.sendMessage({
        type: "rpc_response",
        request_id: requestId,
        command: command.command,
        error
      });
    }
    return null;
  }

  async handleCommand(
    command: WebSocketCommandEnvelope
  ): Promise<Record<string, unknown> | null> {
    const data = command.data ?? {};
    const jobId = isString(data.job_id) ? data.job_id : undefined;
    const workflowId = isString(data.workflow_id)
      ? data.workflow_id
      : undefined;
    log.debug("Command", { command: command.command });

    // A deployed app's visitor reaches this runner as the app's owner, so the
    // dispatch below would answer them the way it answers the owner. It is an
    // allowlist rather than a denylist so that a command added later is
    // refused here until someone decides it belongs — the alternative is a
    // stranger reading somebody's assets because a switch case grew.
    if (
      this.appSession &&
      !isAppSessionCommandAllowed(command.command as string)
    ) {
      log.warn("Command refused for an app session", {
        command: command.command,
        applicationId: this.appSession.applicationId
      });
      return { error: "This command is not available for a published app" };
    }

    // Every allowed command except `run_job` and `get_status` addresses a run
    // that already exists, by id, and
    // the runner resolves a run by (user, job id) — where the user is the app's
    // *owner*. Without this, a job id from the owner's editor would replay
    // that run's frames, or cancel it, over a visitor's connection. The
    // ledger is what says which runs belong to this app: an app run reserves
    // its row before the job exists, so a job with no row here was not started
    // by this app. `run_job` is excluded because it *creates* the row — it
    // reserves against the app's budget inside `admitApplicationRun`, and
    // `confineAppSessionRun` above is what confines it.
    if (this.appSession && jobId && command.command !== "run_job") {
      const owned = await invocationBelongsToApplication(
        this.appSession.applicationId,
        jobId
      ).catch((err) => {
        // Fail closed: a ledger read that never completed is not evidence the
        // run belongs to this app.
        this.logError("app-session job ownership check failed", err);
        return false;
      });
      if (!owned) {
        log.warn("Job command refused for an app session", {
          command: command.command,
          jobId,
          applicationId: this.appSession.applicationId
        });
        return { error: "That run does not belong to this app" };
      }
    }

    switch (command.command as UnifiedCommandType) {
      case "clear_models":
        return this.clearModels();
      case "run_job":
        // SAFETY: the wire command's `data` is the run request. Every read
        // is `req.workflow_id ?? …`, so the field the interface declares
        // required is in practice optional — making it so in `@nodetool-ai/
        // protocol` is the truthful fix and reaches every client.
        await this.runJob(data as unknown as RunJobRequest);
        return { message: "Job started", workflow_id: workflowId ?? null };
      case "reconnect_job":
        if (!jobId) return { error: "job_id is required" };
        // Await so an error can't escape as an unhandled rejection; reconnectJob
        // only replays state (it does not run the job), so this stays quick.
        await this.reconnectJob(jobId, workflowId, resumeLastSeq(data)).catch(
          (err) => {
            log.warn("reconnect_job failed", { jobId, error: String(err) });
          }
        );
        return {
          message: `Reconnecting to job ${jobId}`,
          job_id: jobId,
          workflow_id: workflowId ?? null
        };
      case "stream_input":
        if (!jobId) return { error: "job_id is required" };
        {
          const target = this.resolveJobControl(jobId);
          log.info("stream_input command", {
            jobId,
            hasActive: !!target,
            inputName: data.input,
            handle: data.handle,
            hasValue: data.value !== undefined,
            activeJobIds: [...this.activeJobs.keys()]
          });
          if (!target) return { error: "No active job/context" };
          const inputName = isString(data.input) ? data.input : "";
          if (!inputName.trim()) return { error: "Invalid input name" };
          const value = data.value;
          const handle = isString(data.handle) ? data.handle : undefined;
          try {
            await target.hooks.pushInput(inputName, value, handle);
            return {
              message: "Input item streamed",
              job_id: jobId,
              workflow_id: workflowId ?? target.workflowId
            };
          } catch (err) {
            log.error("stream_input failed", {
              error: err instanceof Error ? err.message : String(err)
            });
            return {
              error: err instanceof Error ? err.message : String(err),
              job_id: jobId,
              workflow_id: workflowId ?? target.workflowId
            };
          }
        }
      case "end_input_stream":
        if (!jobId) return { error: "job_id is required" };
        {
          const target = this.resolveJobControl(jobId);
          if (!target) return { error: "No active job/context" };
          const inputName = isString(data.input) ? data.input : "";
          if (!inputName.trim()) return { error: "Invalid input name" };
          const handle = isString(data.handle) ? data.handle : undefined;
          try {
            target.hooks.finishInputStream(inputName, handle);
            return {
              message: "Input stream ended",
              job_id: jobId,
              workflow_id: workflowId ?? target.workflowId
            };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : String(err),
              job_id: jobId,
              workflow_id: workflowId ?? target.workflowId
            };
          }
        }
      case "cancel_job":
        if (!jobId) return { error: "job_id is required" };
        return this.cancelJob(jobId, workflowId);
      case "update_node_properties": {
        // Live parameter path: push property changes into a running job's
        // node executors (e.g. synth knobs while a patch plays). Misses are
        // not errors — the canvas already holds the value for the next run.
        if (!jobId) return { error: "job_id is required" };
        const nodeId = data.node_id;
        const properties = data.properties;
        if (!isNonEmptyString(nodeId)) {
          return { error: "node_id is required" };
        }
        if (!isObjectLike(properties)) {
          return { error: "properties must be an object" };
        }
        const target = this.resolveJobControl(jobId);
        const applied =
          target?.hooks.updateNodeProperties(
            nodeId,
            properties as Record<string, unknown>
          ) ?? false;
        return { applied };
      }
      case "get_status":
        return this.getStatus(jobId);
      case "set_mode": {
        const mode = data.mode;
        if (mode !== "binary" && mode !== "text") {
          return { error: "mode must be binary or text" };
        }
        this.mode = mode;
        return { message: `Mode set to ${mode}` };
      }
      case "set_permission_mode": {
        const threadId = data.thread_id;
        const mode = data.permission_mode;
        if (!isNonEmptyString(threadId)) {
          return { error: "thread_id is required for set_permission_mode" };
        }
        if (mode !== "plan" && mode !== "default" && mode !== "auto") {
          return { error: "permission_mode must be plan, default, or auto" };
        }
        this.chat.setPermissionMode(threadId, mode);
        return { message: `Permission mode set to ${mode}`, thread_id: threadId };
      }
      case "chat_message": {
        const threadId = data.thread_id;
        if (!isNonEmptyString(threadId)) {
          return { error: "thread_id is required for chat_message command" };
        }
        const { seq, signal, controller } = this.beginChatTurn();
        // A resilient session decouples the turn from this socket: frames are
        // seq-stamped and buffered so a client that disconnects mid-turn can
        // replay what it missed. Opening supersedes (aborts) any prior turn
        // still running for this thread — including one detached from a dead
        // connection.
        const session = chatTurnRegistry.open(
          this.userId ?? "1",
          threadId,
          controller,
          this.buildChatTurnHooks()
        );
        session.attach(this.chatDeliveryTarget, session.lastSeq);
        this.adoptedSessions.delete(threadId);
        this.chatTurnSession = session;
        // Error frames must be sent (and buffered) before the session
        // finishes, so the catch runs inside the chain the finally closes.
        this.currentTask = this.chat
          .handleChatMessage(data, seq, signal)
          .catch(async (err) => {
            this.logError("chat_message processing failed", err);
            await this.sendMessage({
              type: "error",
              message: err instanceof Error ? err.message : String(err),
              thread_id: threadId
            });
          })
          .finally(() => {
            this.endChatTurn(controller);
            session.finish();
            if (this.chatTurnSession === session) this.chatTurnSession = null;
          });
        return {
          message: "Chat message processing started",
          thread_id: threadId
        };
      }
      case "list_chat_turns": {
        // Discovery for a client that starts with no local state (a page
        // reload): report every turn of this user still running so the
        // client can reattach each thread with `resume_chat`.
        const sessions = chatTurnRegistry.listRunningForUser(
          this.userId ?? "1"
        );
        for (const s of sessions) {
          await this.sendToSocket({
            type: "chat_turn_active",
            thread_id: s.threadId,
            status: "running",
            last_seq: s.lastSeq
          });
        }
        return { message: "Chat turns listed", count: sessions.length };
      }
      case "resume_chat": {
        const threadId = isString(data.thread_id) ? data.thread_id : "";
        if (!threadId) {
          return { error: "thread_id is required for resume_chat command" };
        }
        const lastSeq = isFiniteNumber(data.last_seq) ? data.last_seq : 0;
        const session = chatTurnRegistry.get(this.userId ?? "1", threadId);
        if (!session) {
          // Nothing to replay: no turn ran here, or retention elapsed. The
          // persisted thread history over REST is the client's fallback.
          await this.sendToSocket({
            type: "chat_resumed",
            thread_id: threadId,
            status: "unknown",
            last_seq: 0,
            replay_count: 0,
            replay_incomplete: false
          });
          return { message: "No chat turn to resume", thread_id: threadId };
        }
        // last_seq <= 0 is a fresh client (page reload): it has no frame
        // state, but the persisted head of the turn is reachable over REST.
        // Replay only what REST cannot provide — frames after the turn's
        // last `message` frame — and flag the replay incomplete so the
        // client reconciles history from REST.
        const fresh = lastSeq <= 0;
        const { replay, incomplete } = session.attach(
          this.chatDeliveryTarget,
          fresh ? session.freshAttachSeq() : lastSeq
        );
        if (session.status === "running" && this.chatTurnSession !== session) {
          this.adoptedSessions.set(threadId, session);
        }
        // Header first, then the missed tail; live frames queue behind them
        // on the session's ordered delivery chain.
        await session.deliverReplay(this.chatDeliveryTarget, [
          {
            type: "chat_resumed",
            thread_id: threadId,
            status: session.status,
            last_seq: session.lastSeq,
            replay_count: replay.length,
            replay_incomplete: fresh || incomplete
          },
          ...replay
        ]);
        return {
          message: "Chat resumed",
          thread_id: threadId,
          replay_count: replay.length
        };
      }
      case "inference": {
        const { seq, signal, controller } = this.beginChatTurn();
        this.currentTask = this.handleInference(data, seq, signal).finally(() =>
          this.endChatTurn(controller)
        );
        void this.currentTask.catch(async (err) => {
          this.logError("inference processing failed", err);
          await this.sendMessage({
            type: "error",
            message: err instanceof Error ? err.message : String(err)
          });
        });
        return { message: "Inference started" };
      }
      case "stop": {
        const threadId = isString(data.thread_id) ? data.thread_id : undefined;
        // Always increment seq to cancel any in-progress chat or inference
        this.chat.bumpRequestSeq();
        // …and abort it for real. The seq bump alone only discards output at
        // yield boundaries; the signal interrupts blocked awaits and stops
        // providers that own a subprocess.
        this.cancelChatTurn();
        this.cancelRpcCalls();
        this.currentTask = null;
        if (jobId) {
          const active = this.activeJobs.get(jobId);
          if (active) {
            active.session.cancel();
            active.status = "cancelled";
          } else {
            // The run may be executing on the connection that started it —
            // this client reconnected to it. Cancel through its hooks, or,
            // when nothing local holds it, through its row.
            const registered = jobRunRegistry.get(this.userId ?? "1", jobId);
            if (registered && registered.status === "running") {
              registered.cancel();
            } else {
              await requestRemoteJobCancel(this.userId ?? "1", jobId);
            }
          }
        }
        const stopScope = threadId ?? jobId;
        if (stopScope) {
          this.toolBridge.cancelScope(stopScope);
          this.approvalBridge.cancelScope(stopScope);
        }
        // The thread's turn may be executing on a previous connection's
        // runner (detached or adopted after a reconnect) — abort it there.
        if (threadId) {
          const registered = chatTurnRegistry.get(this.userId ?? "1", threadId);
          if (registered && registered.status === "running") {
            registered.abort();
          }
        }
        await this.sendMessage({
          type: "generation_stopped",
          message: "Generation stopped by user",
          job_id: jobId ?? null,
          thread_id: threadId ?? null
        });
        return {
          message: "Stop command processed",
          job_id: jobId ?? null,
          thread_id: threadId ?? null
        };
      }
      case "list_workflows": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.workflows.list(
            data as Parameters<typeof caller.workflows.list>[0]
          )
        );
      }
      case "get_workflow": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.workflows.get({ id: String(data.id ?? "") })
        );
      }
      case "list_assets": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.assets.list(data as Parameters<typeof caller.assets.list>[0])
        );
      }
      case "get_asset": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.assets.get({ id: String(data.id ?? "") })
        );
      }
      case "list_nodes": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.nodes.list(data as Parameters<typeof caller.nodes.list>[0])
        );
      }
      case "get_node": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.nodes.get({ node_type: String(data.node_type ?? "") })
        );
      }
      case "generate_text": {
        const provider = String(data.provider ?? this.defaultProvider);
        const model = String(data.model ?? this.defaultModel);
        const rawMessages = Array.isArray(data.messages) ? data.messages : [];
        const messages: Array<{ role: string; content: string }> =
          rawMessages.length > 0
            ? rawMessages.map((m) => {
                const msg = m as Record<string, unknown>;
                return {
                  role: isString(msg.role) ? msg.role : "user",
                  content: isString(msg.content) ? msg.content : ""
                };
              })
            : [];
        if (messages.length === 0) {
          const system = isString(data.system) ? data.system.trim() : "";
          const prompt = isString(data.prompt) ? data.prompt : "";
          if (system) messages.push({ role: "system", content: system });
          if (prompt.trim()) messages.push({ role: "user", content: prompt });
        }
        const schema = isRecord(data.schema)
          ? (data.schema as Record<string, unknown>)
          : undefined;
        return this.runRpc(command, () =>
          this.runDirectTextGeneration({
            provider,
            model,
            messages,
            maxTokens: isNumber(data.max_tokens)
              ? (data.max_tokens as number)
              : undefined,
            schema,
            schemaName: isString(data.schema_name)
              ? (data.schema_name as string)
              : "result",
            schemaDescription: isString(data.schema_description)
              ? (data.schema_description as string)
              : "Answer with the requested structure."
          })
        );
      }
      case "generate_media": {
        const rawMode = data.mode;
        const mode:
          | "image"
          | "image_edit"
          | "inpaint"
          | "video"
          | "video_edit"
          | "audio" =
          rawMode === "image_edit"
            ? "image_edit"
            : rawMode === "inpaint"
              ? "inpaint"
              : rawMode === "video"
                ? "video"
                : rawMode === "video_edit"
                  ? "video_edit"
                  : rawMode === "audio"
                    ? "audio"
                    : "image";
        const provider = String(data.provider ?? this.defaultProvider);
        const model = String(data.model ?? this.defaultModel);
        const prompt = String(data.prompt ?? "");
        const sourceAssetId = isString(data.source_asset_id)
          ? (data.source_asset_id as string)
          : undefined;
        const maskAssetId = isString(data.mask_asset_id)
          ? (data.mask_asset_id as string)
          : undefined;
        const width = isNumber(data.width) ? (data.width as number) : undefined;
        const height = isNumber(data.height)
          ? (data.height as number)
          : undefined;
        const aspectRatio = isString(data.aspect_ratio)
          ? (data.aspect_ratio as string)
          : undefined;
        const resolution = isString(data.resolution)
          ? (data.resolution as string)
          : undefined;
        const strength = isNumber(data.strength)
          ? (data.strength as number)
          : undefined;
        const numInferenceSteps = isNumber(data.num_inference_steps)
          ? (data.num_inference_steps as number)
          : undefined;
        const durationSeconds = isNumber(data.duration)
          ? (data.duration as number)
          : undefined;
        const variations = isNumber(data.variations)
          ? (data.variations as number)
          : undefined;
        const voice = isString(data.voice) ? (data.voice as string) : undefined;
        const speed = isNumber(data.speed) ? (data.speed as number) : undefined;
        const audioFormat = isString(data.audio_format)
          ? (data.audio_format as string)
          : undefined;
        return this.runRpc(command, () =>
          this.runDirectMediaGeneration({
            mode,
            provider,
            model,
            prompt,
            sourceAssetId,
            maskAssetId,
            width,
            height,
            aspectRatio,
            resolution,
            strength,
            numInferenceSteps,
            durationSeconds,
            variations,
            voice,
            speed,
            audioFormat
          })
        );
      }
      case "transcribe_audio": {
        const provider = String(data.provider ?? this.defaultProvider);
        const model = String(data.model ?? this.defaultModel);
        const assetId = isString(data.asset_id)
          ? (data.asset_id as string)
          : "";
        const language = isString(data.language)
          ? (data.language as string)
          : undefined;
        return this.runRpc(command, () =>
          this.runDirectTranscription({ provider, model, assetId, language })
        );
      }
      default:
        return { error: "Unknown command" };
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: "ping", ts: Date.now() / 1000 }).catch((err) => {
        log.warn("Failed to send heartbeat ping", { error: String(err) });
      });
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startStatsBroadcast(): void {
    this.stopStatsBroadcast();
    if (!this.systemStatsEnabled) {
      return;
    }
    const send = () => {
      this.sendMessage({
        type: "system_stats",
        stats: this.getSystemStats()
      }).catch((err) => {
        log.warn("Failed to send system stats", { error: String(err) });
      });
    };
    // Fire an initial sample ~1s after connect so the sampler has a delta to
    // report — then keep emitting on a regular cadence.
    this.statsPrimeTimer = setTimeout(send, 1000);
    this.statsTimer = setInterval(send, 5_000);
  }

  private stopStatsBroadcast(): void {
    if (this.statsPrimeTimer) {
      clearTimeout(this.statsPrimeTimer);
      this.statsPrimeTimer = null;
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private registerObserver(): void {
    if (this.observerRegistered) return;
    // Both feeds are scoped by `this.userId`, which for a deployed app's
    // visitor is the *owner* — so subscribing would stream them the ids,
    // etags and timestamps of every row that user touches, from any tab or
    // agent, for as long as the page is open. The public page has no cache to
    // invalidate anyway: it renders one release and runs it.
    if (this.appSession) return;
    ModelObserver.subscribe(this.onModelChange);
    resourceEvents.on("change", this.onResourceEvent);
    this.observerRegistered = true;
  }

  private unregisterObserver(): void {
    if (!this.observerRegistered) return;
    ModelObserver.unsubscribe(this.onModelChange);
    resourceEvents.off("change", this.onResourceEvent);
    this.observerRegistered = false;
  }

  private onModelChange = (
    instance: DBModel,
    event: ModelChangeEvent,
    meta?: ModelChangeMeta
  ): void => {
    if (!this.websocket) return;
    // Only forward changes for models the connected user owns. Models without
    // a `user_id` (runtime-internal types) are forwarded to every connection.
    const ownerId = (instance as DBModel & { user_id?: string }).user_id;
    if (ownerId && this.userId && ownerId !== this.userId) return;

    const resource: Record<string, unknown> = {
      id: instance.partitionValue(),
      etag: instance.getEtag()
    };
    // Include scope fields for resource types whose cache is keyed on a
    // parent id (Message → thread_id, WorkflowVersion → workflow_id, etc.).
    // Frontend handlers use these to narrow invalidation. `updated_at` rides
    // along as the row's concurrency token: an open editor compares it against
    // the token it last saved with to tell its own write apart from one made
    // outside the browser (agent, CLI, another tab).
    const data = instance as Record<string, unknown>;
    for (const field of [
      "workflow_id",
      "thread_id",
      "parent_id",
      "updated_at"
    ] as const) {
      const value = data[field];
      if (isNonEmptyString(value)) {
        resource[field] = value;
      }
    }

    const message: Record<string, unknown> = {
      type: "resource_change",
      event,
      resource_type: instance.constructor.name.toLowerCase(),
      resource
    };
    if (meta?.ops && meta.ops.length > 0) {
      message.ops = meta.ops;
    }
    this.sendDetached(message);
  };

  private onResourceEvent = (payload: ResourceChangePayload): void => {
    if (!this.websocket) return;
    if (payload.userId && this.userId && payload.userId !== this.userId) return;
    this.sendDetached({
      type: "resource_change",
      event: payload.event,
      resource_type: payload.resource_type,
      resource: payload.resource
    });
  };

  async run(websocket: WebSocketConnection): Promise<void> {
    try {
      await this.connect(
        websocket,
        this.userId ?? undefined,
        this.authToken ?? undefined
      );
      await this.receiveMessages();
    } finally {
      await this.disconnect();
    }
  }

  async receiveMessages(): Promise<void> {
    while (true) {
      let data: Record<string, unknown> | null;
      try {
        data = await this.receiveMessage();
      } catch (err) {
        // A frame that fails to even decode (truncated msgpack, an
        // oversized payload past NODETOOL_WS_MAX_MESSAGE_BYTES, …) must not
        // kill the connection or this loop — it's just one bad frame from a
        // client that may otherwise be mid-job. Reject it and keep reading.
        this.logError("Failed to receive/decode WebSocket frame", err);
        if (
          this.websocket &&
          this.websocket.clientState !== "disconnected" &&
          this.websocket.applicationState !== "disconnected"
        ) {
          await this.sendMessage({
            error: "invalid_frame",
            message: err instanceof Error ? err.message : String(err)
          }).catch((sendErr) => {
            this.logError("Failed to notify client of invalid frame", sendErr);
          });
          continue;
        }
        break;
      }
      if (data === null) break;

      const msgType = isString(data.type) ? data.type : null;
      if (msgType !== null && msgType in controlMessageInSchemas) {
        const schema = controlMessageInSchemas[msgType as ControlMessageInType];
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          await this.sendMessage({
            error: "invalid_message",
            message:
              `Malformed '${msgType}' frame: ` +
              parsed.error.issues
                .map(
                  (issue) =>
                    `${issue.path.join(".") || "<root>"}: ${issue.message}`
                )
                .join("; ")
          });
          continue;
        }
      }

      // Heartbeats show that the connection is alive, not that the user is
      // working in this editor.
      if (this.frontendRendererId && msgType !== "ping" && msgType !== "pong") {
        this.frontendRendererRegistry?.touch(this.frontendRendererId);
      }

      if (msgType === "client_tools_manifest") {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        this.clientToolsManifest = {};
        for (const tool of tools) {
          if (
            isObjectLike(tool) &&
            isString((tool as Record<string, unknown>).name)
          ) {
            const name = (tool as Record<string, unknown>).name as string;
            this.clientToolsManifest[name] = tool as Record<string, unknown>;
          }
        }
        this.clientToolsManifestReady = true;
        if (this.frontendRendererId) {
          this.frontendRendererRegistry?.markReady(this.frontendRendererId);
        }
        continue;
      }

      if (msgType === "renderer_tool_result") {
        const rendererId = isString(data.renderer_id) ? data.renderer_id : null;
        const toolCallId = isString(data.tool_call_id)
          ? data.tool_call_id
          : null;
        if (
          rendererId &&
          toolCallId &&
          rendererId === this.frontendRendererId
        ) {
          this.frontendRendererRegistry?.touch(rendererId);
          this.rendererToolBridge.resolveResult(toolCallId, data);
        }
        continue;
      }

      if (msgType === "tool_result") {
        const toolCallId = isString(data.tool_call_id)
          ? data.tool_call_id
          : null;
        if (toolCallId) {
          this.chat.resolveToolResult(toolCallId, data);
          // The waiter may live on the runner executing an adopted turn.
          // resolveResult no-ops on unknown ids, so forwarding is safe.
          for (const session of this.adoptedSessions.values()) {
            session.hooks.resolveToolResult(toolCallId, data);
          }
        }
        continue;
      }

      if (msgType === "tool_approval_response") {
        const approvalId = isString(data.approval_id) ? data.approval_id : null;
        if (approvalId) {
          this.approvalBridge.resolveResult(approvalId, data);
          for (const session of this.adoptedSessions.values()) {
            session.hooks.resolveApproval(approvalId, data);
          }
        }
        continue;
      }

      if (msgType === "plan_approval_response") {
        const approvalId = isString(data.approval_id) ? data.approval_id : null;
        if (approvalId) {
          this.approvalBridge.resolveResult(approvalId, data);
          for (const session of this.adoptedSessions.values()) {
            session.hooks.resolveApproval(approvalId, data);
          }
        }
        continue;
      }

      if (msgType === "secret_request_response") {
        const approvalId = isString(data.approval_id) ? data.approval_id : null;
        if (approvalId) {
          this.approvalBridge.resolveResult(approvalId, data);
          for (const session of this.adoptedSessions.values()) {
            session.hooks.resolveApproval(approvalId, data);
          }
        }
        continue;
      }

      if (msgType === "ping") {
        await this.sendMessage({ type: "pong", ts: Date.now() / 1000 });
        continue;
      }

      if (msgType === "pong") {
        continue;
      }

      if (isString(data.command)) {
        const envelopeParsed = webSocketCommandEnvelopeSchema.safeParse(data);
        if (!envelopeParsed.success) {
          await this.sendMessage({
            error: "invalid_command",
            details:
              "Malformed command envelope: " +
              envelopeParsed.error.issues
                .map(
                  (issue) =>
                    `${issue.path.join(".") || "<root>"}: ${issue.message}`
                )
                .join("; ")
          });
          continue;
        }
        // Commands this build doesn't recognize fall through to
        // handleCommand's own `{ error: "Unknown command" }` reply below —
        // only known commands get their `data` payload schema-checked here.
        const dataSchema =
          commandDataSchemas[envelopeParsed.data.command as UnifiedCommandType];
        if (dataSchema) {
          const dataParsed = dataSchema.safeParse(
            envelopeParsed.data.data ?? {}
          );
          if (!dataParsed.success) {
            await this.sendMessage({
              error: "invalid_command",
              details:
                `Malformed '${envelopeParsed.data.command}' data: ` +
                dataParsed.error.issues
                  .map(
                    (issue) =>
                      `${issue.path.join(".") || "<root>"}: ${issue.message}`
                  )
                  .join("; ")
            });
            continue;
          }
        }
        try {
          // The envelope Zod-parsed above is the same frame — its schema
          // passes every key through, so nothing was dropped.
          // SAFETY: the schema types `command` as a bare string on purpose;
          // `handleCommand`'s switch answers `{ error: "Unknown command" }`
          // for anything this build does not implement.
          const response = await this.handleCommand({
            ...envelopeParsed.data,
            command: envelopeParsed.data.command as UnifiedCommandType,
            data: envelopeParsed.data.data ?? {},
            // MessagePack clients encode an absent request_id as nil; the
            // envelope declares it optional, not nullable.
            request_id: envelopeParsed.data.request_id ?? undefined
          });
          // RPC commands send their `rpc_response` frame inline (in runRpc)
          // and return null so we don't send a stray legacy reply.
          if (response) await this.sendMessage(response);
        } catch (err) {
          this.logError("invalid_command handling failed", err);
          await this.sendMessage({
            error: "invalid_command",
            details: err instanceof Error ? err.message : String(err)
          });
        }
        continue;
      }

      await this.sendMessage({
        error: "invalid_message",
        message:
          "All messages must include a 'command' field. Use 'chat_message' command for chat."
      });
    }
  }
}
