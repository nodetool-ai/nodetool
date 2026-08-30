import { randomUUID } from "node:crypto";
import { getSetting } from "./settings-registry.js";
import {
  SUPERSEDED_TOOL_RESULT,
  repairOrphanedToolCalls
} from "./chat-tool-call-repair.js";
import { attachChatPredictionForwarder } from "./chat-prediction-forwarder.js";
import { ConfiguredProviderCache } from "./configured-providers.js";
import { JobConcurrencyQueue } from "./job-queue.js";
import { packWebSocketMessage, unpackWebSocketMessage } from "./messagepack.js";
import {
  createLogger,
  getByteLimitEnv,
  isGoogleWorkspaceEnabled
} from "@nodetool-ai/config";
import { getAssetAdapter } from "./lib/storage.js";
import {
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
import {
  resolveContentUrls,
  resolveContentForProvider
} from "./resolve-media-urls.js";
import {
  type NodeExecutor,
  type NodeTypeResolver,
  type NodeValidator
} from "@nodetool-ai/kernel";
import {
  attachRunCostLedger,
  ExecutionSession,
  isExecutionPreflightError,
  toRawGraphInput
} from "@nodetool-ai/execution";
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
  Asset,
  Job,
  invocationBelongsToApplication,
  Message,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  Prediction,
  Project,
  Skill,
  Thread,
  Memory,
  Workflow,
  type DBModel,
  type MemoryResource
} from "@nodetool-ai/models";
import { requestRemoteJobCancel } from "./job-control.js";
import { WORKFLOW_DOCUMENT_TOOL_NAMES } from "@nodetool-ai/node-sdk";
import type {
  ProviderTool,
  Message as ProviderMessage,
  MessageContent,
  BaseProvider,
  ProcessingContext,
  ProviderSession,
  ToolCall as ProviderToolCall,
  ImageModel as ProviderImageModel,
  VideoModel as ProviderVideoModel,
  TextToImageParams,
  TextToVideoParams,
  ImageToImageParams,
  ImageToVideoParams,
  PromptAssetRef
} from "@nodetool-ai/runtime";
import {
  ProcessingContext as RuntimeProcessingContext,
  ACTIVE_MODEL_CONTEXT_KEY,
  DIRECT_TOOL_NAMES,
  detectImageMime,
  IMAGE_MIME_TO_EXT,
  expandEntitiesForGeneration,
  fetchExternalMedia,
  getProcessSandboxModuleCatalog,
  isProviderSessionUpdate,
  isProviderMessageEvent,
  type ActiveModelSelection,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  isModelSelection,
  PROVIDER_IDS,
  NO_MODEL_SELECTED_MESSAGE,
  noMediaModelSelectedMessage
} from "@nodetool-ai/protocol";
import type {
  Chunk,
  HydratedGraphData,
  NodeDescriptor,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import {
  isSdkV1RetryableError
} from "@nodetool-ai/protocol/api-schemas/sdk-v1.js";
import type {
  UnifiedCommandType,
  WebSocketCommandEnvelope,
  WebSocketMode,
  RpcErrorPayload,
  UiContext
} from "@nodetool-ai/protocol";
import {
  webSocketCommandEnvelopeSchema,
  commandDataSchemas,
  controlMessageInSchemas,
  outboundControlMessageSchemas,
  processingMessageSchemas,
  type ControlMessageInType
} from "@nodetool-ai/protocol";
import { Tool } from "@nodetool-ai/agents";
import {
  createChatCodeActSession,
  createSandboxClock,
  sandboxPackagesForChat,
  type SandboxClock,
  CODEACT_RESIDENT_TOOL_NAMES,
  EXECUTE_CODE_TOOL_NAME,
  type ChatCodeActSession,
  type ChatCodeActToolCall
} from "@nodetool-ai/agents";
import {
  getAgentToolbelt,
  getAllMcpTools,
  registerBuiltinTools,
  getGoogleWorkspaceTools,
  registerGoogleWorkspaceTools,
  getApifyTools,
  getSerpApiTools,
  toolForCapabilityName,
  gateTools,
  capabilityFromTool,
  createCapabilityRun,
  contextSecretAvailability,
  BackgroundSubtaskRegistry,
  UNGATED,
  extractInjectableImages,
  PLAN_APPROVAL_CONTEXT_KEY,
  type CapabilityRun,
  type PermissionGateOptions,
  type SubAgentRuntime,
  type PermissionMode,
  type ApprovalDecision,
  type ApprovalRequest,
  type PlanApprovalDecision,
  type RequestPlanApproval,
  type SecretPromptRequest,
  type SecretPromptStatus,
  type TaskPlan
} from "@nodetool-ai/agents";
import { mcpToolHostDeps } from "./mcp-tool-deps.js";
import {
  findInvokedSkillNames,
  formatInvokedSkillsForPrompt,
  formatSkillCatalogForPrompt,
  mergeSystemSkills,
  formatMemoriesForPrompt
} from "@nodetool-ai/agents";
import { RunNodeTool } from "./agent/run-node-tool.js";
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import { appRouter } from "./trpc/router.js";
import { createCallerFactory } from "./trpc/index.js";
import type { HttpApiOptions } from "./http-api.js";
import { retrieveAssetBytes } from "./lib/asset-paths.js";
import {
  isAppSessionCommandAllowed,
  type AppSessionScope
} from "./lib/app-session-scope.js";
import type {
  FrontendRendererRegistry,
  FrontendRendererToolCall,
  FrontendRendererToolResult
} from "./frontend-renderer-registry.js";
import {
  encodeNativeAudioChunks,
  extractEmbeddedImage,
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
  type JsonSafeValue
} from "./session/sanitize.js";
import {
  DirectInferenceHandler,
  entityRefResolver,
  estimateDirectTextSpend,
  resolveEntityReferenceImages,
  type DirectMediaGenerationRequest,
  type DirectTextGenerationRequest
} from "./session/inference.js";

// The pure helpers moved to ./session/*; re-exported here so every existing
// import path keeps working.
export {
  CHAT_AGENT_SYSTEM_PROMPT,
  RESIDENT_TOOL_NAMES,
  buildChatAgentSystemPrompt,
  estimateDirectTextSpend,
  focusedUiToolNames,
  normalizeToolCallName,
  primaryTextOutputName,
  serverModelInterfaces,
  unroutableToolMessage
};
import {
  createRelayActivityWaiter,
  DEFAULT_RUN_JOB_EXECUTION_OPTIONS,
  JobExecutionManager,
  resolveRunJobExecutionOptions,
  resolveRunJobUserId,
  type ActiveJob,
  type RawGraphData,
  type RunJobExecutionOptions,
  type RunJobRequest,
  type SdkExecutionCapacitySnapshot
} from "./session/job-execution.js";
// The job region moved to ./session/job-execution.ts; its wire types are
// re-exported here so every existing import path keeps working.
export {
  DEFAULT_RUN_JOB_EXECUTION_OPTIONS,
  resolveRunJobExecutionOptions,
  resolveRunJobUserId
};
export type {
  RunJobExecutionOptions,
  RunJobRequest,
  SdkExecutionCapacitySnapshot
};
import type { ClientSession } from "./session/client-session.js";

const log = createLogger("nodetool.websocket.runner");
/**
 * How many of a user's newest memories the turn reads to build its block. The
 * read doubles as the "how many live in other threads" count, so it is capped:
 * the number is a nudge toward `memory_search`, not an audit.
 */
const MEMORY_SCAN_LIMIT = 400;
/** How many of this thread's memories are pasted into the block. */
const MEMORY_BLOCK_LIMIT = 100;

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

/**
 * How many recent messages to scan when probing for a resumable session before
 * deciding whether the full thread needs loading. Large enough to clear the
 * occasional errored turn between sessioned assistant replies, tiny next to a
 * full thread load.
 */
const SESSION_PROBE_WINDOW = 50;

/**
 * Find the continuation token to resume this thread with: the `provider_session`
 * of the most recent assistant message, but only if it was produced by the same
 * `provider` and `model` as the incoming request (a session is bound to both).
 * Returns null when there is nothing to resume, so the provider starts fresh.
 */
function lastMatchingProviderSession(
  dbMessages: Message[],
  providerId: string,
  model: string
): ProviderSession | null {
  for (let i = dbMessages.length - 1; i >= 0; i--) {
    const m = dbMessages[i];
    if (m.role !== "assistant") continue;
    const session = m.provider_session;
    if (!session) continue;
    return session.providerId === providerId && session.model === model
      ? session
      : null;
  }
  return null;
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


/** Highest `job_seq` a resubscribing client claims to already hold. */
function resumeLastSeq(data: Record<string, unknown>): number {
  const raw = data["last_seq"];
  return isFiniteNumber(raw) && raw > 0 ? raw : 0;
}

class ToolBridge {
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

/** What the prompt needs from a skill, whichever tier it came from. */
interface SkillEntry {
  name: string;
  description: string;
  content: string;
}

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
  /**
   * The job region — run_job through terminal status. It owns `activeJobs`,
   * the concurrency queue and the slot counters; nothing outside it holds a
   * reference to them.
   */
  private readonly jobs: JobExecutionManager;
  private currentTask: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private statsPrimeTimer: NodeJS.Timeout | null = null;
  private chatRequestSeq = 0;
  /**
   * Aborts the in-flight chat/inference turn. The seq counter above only filters
   * stale output at yield boundaries — it cannot interrupt a provider that is
   * blocked awaiting a response, nor tell one that owns a subprocess (the Claude
   * Agent provider) to stop working. This signal does, and is threaded into
   * every provider call the turn makes.
   */
  private chatAbort: AbortController | null = null;
  /**
   * Abort controllers for RPC calls that are still waiting on a provider.
   * An RPC has no chat turn to hang off, so a `stop` command and a dropped
   * socket reach an in-flight model call through this set.
   */
  private readonly rpcAborts = new Set<AbortController>();
  /** One-shot model calls: the `inference` stream and the direct-generation RPCs. */
  private readonly inference: DirectInferenceHandler;
  private clientToolsManifest: Record<string, Record<string, unknown>> = {};
  private clientToolsManifestReady = false;
  private toolBridge = new ToolBridge();
  /** Separate bridge for connection-level renderer calls; never resolves chat tool_result waiters. */
  private rendererToolBridge = new ToolBridge();
  /** Round-trips permission approvals for gated tool calls. */
  private approvalBridge = new ToolBridge();
  /**
   * Per-thread set of tool names the user approved for the rest of the chat
   * via "Allow for this chat". Persists across messages within a thread.
   */
  private chatSessionAllow = new Map<string, Set<string>>();
  /**
   * Live permission mode for an in-flight turn. `set_permission_mode` writes
   * here so switching to Auto mid-turn applies to the next gated call.
   */
  private chatTurnPermissionMode = new Map<string, { value: PermissionMode }>();
  /**
   * The capability run for the chat turn this connection is executing — the
   * gate, the context, and everything a capability needs that only exists per
   * turn. Built beside the toolbelt; the sandbox still calls the belt, and PR
   * 11 is what switches the guest onto `run.invoke`.
   */
  private chatCapabilityRun: CapabilityRun | null = null;

  /** The run built for the last chat turn — what PR 11 hands to the sandbox. */
  getChatCapabilityRun(): CapabilityRun | null {
    return this.chatCapabilityRun;
  }
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
  logError(context: string, error: unknown): void {
    log.error(context, formatSanitizedError(error));
  }

  /**
   * Open a chat/inference turn: cancel whatever was running and hand back the
   * seq + signal the new turn runs under. A superseding message cancels the
   * previous turn exactly as an explicit Stop does.
   */
  private beginChatTurn() {
    this.cancelChatTurn();
    this.chatRequestSeq += 1;
    this.chatAbort = new AbortController();
    return {
      seq: this.chatRequestSeq,
      signal: this.chatAbort.signal,
      controller: this.chatAbort
    };
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

  /** Abort the in-flight turn, if any. Idempotent. */
  private cancelChatTurn(): void {
    this.chatAbort?.abort();
    this.chatAbort = null;
  }

  /** Abort every RPC still waiting on a provider. Idempotent. */
  private cancelRpcCalls(): void {
    for (const abort of this.rpcAborts) abort.abort();
    this.rpcAborts.clear();
  }

  /**
   * Put a controller in {@link rpcAborts} so {@link cancelRpcCalls} — a `stop`
   * command or a dropped socket — reaches the call it belongs to, and hand
   * back the deregistration the caller runs when the call settles.
   */
  private registerAbort(controller: AbortController): () => void {
    this.rpcAborts.add(controller);
    return () => {
      this.rpcAborts.delete(controller);
    };
  }

  /**
   * Retire a turn that finished on its own. Clears the controller only when it
   * is still the current one — a superseding turn has already installed its
   * own, and clearing that would make a later Stop a no-op.
   */
  private endChatTurn(controller: AbortController | null): void {
    if (controller && this.chatAbort === controller) this.chatAbort = null;
  }

  sendDetached(message: Record<string, unknown>): void {
    void this.sendMessage(message).catch((err) => {
      this.logError("detached websocket send failed", err);
    });
  }

  /**
   * Extract text from message content that may be a string or array of content items.
   * Mirrors Python's _extract_query_text / _extract_objective / _extract_text_content.
   */
  private extractTextContent(content: unknown, fallback = ""): string {
    if (isString(content)) return content;
    if (Array.isArray(content)) {
      const texts = (content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && isString(c.text))
        .map((c) => c.text as string);
      return texts.length > 0 ? texts.join(" ") : fallback;
    }
    return fallback;
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
    this.inference = new DirectInferenceHandler(this, {
      defaults: { provider: this.defaultProvider, model: this.defaultModel },
      currentRequestSeq: () => this.chatRequestSeq,
      registerAbort: (controller) => this.registerAbort(controller)
    });
    this.jobs = new JobExecutionManager(this, {
      beforeRunJob: options.beforeRunJob,
      getMaxConcurrentJobs: () => this.getMaxConcurrentJobs(),
      getMaxConcurrentRunsPerWorkflow: () =>
        this.getMaxConcurrentRunsPerWorkflow(),
      defaultMaxConcurrentJobs:
        UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_JOBS,
      defaultMaxConcurrentRunsPerWorkflow:
        UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW,
      sendToSocket: (message) => this.sendToSocket(message),
      isSocketConnected: () => this.isRendererConnected(),
      attachPlanApproval: (context, jobId) =>
        this.attachPlanApproval(context, jobId),
      defaults: {
        provider: this.defaultProvider,
        model: this.defaultModel
      }
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
    await this.jobs.cancelAll();

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
   * If `event` is a tool_call_update, also emit a synthetic assistant message
   * whose `tool_calls` array contains this call. The chat UI renders a
   * persistent ToolCallCard from messages with tool_calls; tool_call_update
   * by itself only drives transient "now running" state. We skip events that
   * already carry `agent_execution_id` because those are routed to
   * ExecutionTree via the agent_execution path.
   */
  private async emitSyntheticToolCallCard(
    event: Record<string, unknown>
  ): Promise<void> {
    if (event["type"] !== "tool_call_update") return;
    const toolCallId = event["tool_call_id"];
    const name = event["name"];
    if (!isString(toolCallId) || !isString(name)) return;
    if (!toolCallId || !name) return;
    const args = isObjectLike(event["args"])
      ? (event["args"] as Record<string, unknown>)
      : {};
    const message = isString(event["message"]) ? event["message"] : null;
    await this.sendMessage({
      type: "message",
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCallId,
          name,
          args,
          message,
          result: null
        }
      ],
      parent_tool_call_id: event["parent_tool_call_id"] ?? null,
      subtask_depth: event["subtask_depth"] ?? null,
      thread_id: event["thread_id"] ?? null,
      workflow_id: event["workflow_id"] ?? null
    });
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

  // ---------------------------------------------------------------------
  // Job region — delegators onto JobExecutionManager.
  //
  // The job code moved out in T3 (docs/websocket-runner-refactor-plan.md).
  // The chat, RPC and command regions still call these members on the runner;
  // they move onto the manager's own surface in T7/T8, and every method below
  // goes with them. Each one forwards and does nothing else.
  // ---------------------------------------------------------------------

  /** Transitional: `handleCommand`'s `run_job` — removed in T7/T8. */
  async runJob(incoming: RunJobRequest): Promise<void> {
    return this.jobs.runJob(incoming);
  }

  /** Transitional: `handleCommand`'s `reconnect_job` — removed in T7/T8. */
  async reconnectJob(
    jobId: string,
    workflowId?: string,
    lastSeq = 0
  ): Promise<void> {
    return this.jobs.reconnectJob(jobId, workflowId, lastSeq);
  }

  /** Transitional: `handleCommand`'s `cancel_job` — removed in T7/T8. */
  async cancelJob(
    jobId: string,
    workflowId?: string
  ): Promise<Record<string, unknown>> {
    return this.jobs.cancelJob(jobId, workflowId);
  }

  /** Transitional: `handleCommand`'s `get_status` — removed in T7/T8. */
  getStatus(jobId?: string) {
    return this.jobs.getStatus(jobId);
  }

  /** Transitional: the SDK live-runner registry reads it — removed in T7/T8. */
  async getSdkExecutionCapacitySnapshot(input: {
    workflowId: string;
    concurrent?: boolean;
  }): Promise<SdkExecutionCapacitySnapshot> {
    return this.jobs.getSdkExecutionCapacitySnapshot(input);
  }

  /** Transitional: the reliability harness reads it — removed in T7/T8. */
  get slotCounters(): { activeJobs: number; startingJobs: number } {
    return this.jobs.slotCounters;
  }

  /** Transitional: `sendMessage` routes a run's frames — removed in T7/T8. */
  private resolveJobSession(jobId: unknown): JobRunSession | null {
    return this.jobs.resolveJobSession(jobId);
  }

  /** Transitional: `handleCommand`'s per-job commands — removed in T7/T8. */
  private resolveJobControl(
    jobId: string
  ): { hooks: JobRunExecutionHooks; workflowId: string | null } | null {
    return this.jobs.resolveJobControl(jobId);
  }

  /** Transitional: chat's workflow runs register here — removed in T7/T8. */
  private get activeJobs(): Map<string, ActiveJob> {
    return this.jobs.activeJobs;
  }

  /** Transitional: read by the runner's own suites — removed in T7/T8. */
  get jobQueue(): JobConcurrencyQueue<RunJobRequest> {
    return this.jobs.jobQueue;
  }

  /** Transitional: read by the job-resilience suite — removed in T7/T8. */
  get jobDeliveryTarget(): {
    deliver(message: Record<string, unknown>): Promise<void>;
  } {
    return this.jobs.jobDeliveryTarget;
  }

  /** Transitional: read by the job-resilience suite — removed in T7/T8. */
  get inFlightJobCount(): number {
    return this.jobs.inFlightJobCount;
  }

  /** Transitional: read by the job-resilience suite — removed in T7/T8. */
  countActiveJobsForWorkflow(workflowId: string | null | undefined): number {
    return this.jobs.countActiveJobsForWorkflow(workflowId);
  }

  /** Transitional: a chat-triggered run frees its slot — removed in T7/T8. */
  private drainQueue(): void {
    this.jobs.drainQueue();
  }

  /** Transitional: driven directly by the run_job suite — removed in T7/T8. */
  startJob(req: RunJobRequest): Promise<void> {
    return this.jobs.startJob(req);
  }

  /** Transitional: driven directly by the job suites — removed in T7/T8. */
  streamJobMessages(
    active: ActiveJob,
    executePromise: Promise<{
      status: "completed" | "failed" | "cancelled";
      error?: string;
      outputs?: Record<string, unknown[]>;
    }>
  ): Promise<void> {
    return this.jobs.streamJobMessages(active, executePromise);
  }

  /** Transitional: driven directly by the run_job suite — removed in T7/T8. */
  emitBeforeRunFailure(
    jobId: string,
    workflowId: string | null,
    err: unknown,
    persistJob: boolean
  ): Promise<void> {
    return this.jobs.emitBeforeRunFailure(jobId, workflowId, err, persistJob);
  }

  /** Transitional: driven directly by the lifecycle suite — removed in T7/T8. */
  getRawGraph(req: RunJobRequest): Promise<RawGraphData> | RawGraphData {
    return this.jobs.getRawGraph(req);
  }

  /** Transitional: driven directly by the lifecycle suite — removed in T7/T8. */
  normalizeGraph(graph: RawGraphData): RawGraphData {
    return this.jobs.normalizeGraph(graph);
  }

  /** Transitional: chat hydrates a graph the same way — removed in T7/T8. */
  private hydrateGraph(graph: RawGraphData): Promise<HydratedGraphData> {
    return this.jobs.hydrateGraph(graph);
  }

  /** Transitional: driven directly by the lifecycle suite — removed in T7/T8. */
  inferOutputType(value: unknown): string {
    return this.jobs.inferOutputType(value);
  }

  /** Transitional: chat's workflow runs accumulate cost — removed in T7/T8. */
  private _handleNodeProviderCost(
    active: ActiveJob,
    outbound: Record<string, unknown>
  ): void {
    this.jobs._handleNodeProviderCost(active, outbound);
  }

  /** Transitional: chat's workflow runs settle cost — removed in T7/T8. */
  private runMeasuredCost(active: ActiveJob): number | null {
    return this.jobs.runMeasuredCost(active);
  }

  async clearModels(): Promise<Record<string, unknown>> {
    return {
      message:
        "Model clearing is managed by provider implementations in TS runtime"
    };
  }

  /**
   * Which workflow decides where this conversation's files go.
   *
   * The workspace must not move between turns of one conversation: a file
   * written in the previous message has to still be there in the next. The
   * message's own `workflow_id` is not stable enough to key it on — the client
   * attaches the id it has when it sends, so a turn sent before the thread list
   * loaded carries none, resolves the default workspace instead of the
   * workflow's, and the files the agent wrote a moment ago read as wiped. The
   * thread's binding is the durable one, so it fills in whenever the message
   * omits it.
   */
  private async threadWorkspaceWorkflowId(
    userId: string,
    threadId: string,
    messageWorkflowId: string | null
  ): Promise<string | null> {
    if (messageWorkflowId) return messageWorkflowId;
    if (!threadId) return null;
    try {
      const thread = await Thread.find(userId, threadId);
      return isNonEmptyString(thread?.workflow_id) ? thread.workflow_id : null;
    } catch (err) {
      this.logError("thread workspace lookup failed", err);
      return null;
    }
  }

  private async ensureThreadExists(
    threadId?: string,
    workflowId?: string | null
  ): Promise<string> {
    const userId = this.userId ?? "1";
    if (!threadId) {
      const thread = await Thread.create({
        user_id: userId,
        workflow_id: workflowId ?? null,
        title: ""
      });
      return thread.id;
    }
    const existing = await Thread.find(userId, threadId);
    if (existing) return existing.id;
    const thread = await Thread.create({
      id: threadId,
      user_id: userId,
      workflow_id: workflowId ?? null,
      title: ""
    });
    return thread.id;
  }

  private dbMessageToProviderMessage(m: Message): ProviderMessage | null {
    const role = m.role as ProviderMessage["role"];
    // Filter out non-standard roles (e.g. "agent_execution") that providers can't handle
    if (!role || !["user", "assistant", "system", "tool"].includes(role)) {
      return null;
    }
    const rawContent = Array.isArray(m.content)
      ? (resolveContentForProvider(
          m.content as unknown[],
          (m.user_id as string | undefined) ?? this.userId ?? undefined
        ) as MessageContent[])
      : (m.content as string | null);
    return {
      role,
      content: rawContent ?? "",
      toolCallId: isString(m.tool_call_id) ? m.tool_call_id : null,
      toolCalls: Array.isArray(m.tool_calls)
        ? (m.tool_calls as Array<ProviderToolCall>).map((tc) => {
            const call: ProviderToolCall = {
              id: tc.id,
              name: tc.name,
              args: tc.args
            };
            if (isString(tc.thought_signature)) {
              call.thought_signature = tc.thought_signature;
            }
            return call;
          })
        : null,
      threadId: m.thread_id
    };
  }

  /**
   * Save a message dict to the database.
   * Mirrors Python's _save_message_to_db_async: pops id, type, user_id before create.
   */
  private async saveMessageToDb(
    messageData: Record<string, unknown>
  ): Promise<void> {
    const data = { ...messageData };
    delete data.id;
    delete data.type;
    const threadId = isString(data.thread_id) ? data.thread_id : "";
    delete data.thread_id;
    const userId = this.userId ?? "1";
    delete data.user_id;

    await Message.create({
      thread_id: threadId,
      user_id: userId,
      ...data
    });
  }

  /**
   * Persist raw image bytes carried on an assistant message (native providers
   * that run a server-side image tool emit them inline) as real assets, and
   * rewrite each such block to the wire shape `{ type: "image_url", image: {
   * type: "image", asset_id, mimeType } }`. Blocks that already reference an
   * asset (uri / asset_id, no raw data) and non-image blocks pass through
   * untouched. Raw base64 is never persisted or sent.
   */
  private async materializeAssistantImageContent(
    content: MessageContent[],
    userId: string,
    workflowId: string | null
  ): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (const block of content) {
      if (block.type !== "image_url") {
        out.push({ ...block });
        continue;
      }
      const image = block.image;
      const rawData = image.data;
      let bytes: Uint8Array | null = null;
      if (rawData instanceof Uint8Array) {
        bytes = rawData;
      } else if (isString(rawData) && rawData) {
        bytes = new Uint8Array(Buffer.from(rawData, "base64"));
      }
      if (!bytes) {
        // Already an asset/uri reference (or empty) — leave as-is.
        out.push({ ...block });
        continue;
      }
      const mimeType = isString(image.mimeType) ? image.mimeType : "image/png";
      const ext = IMAGE_MIME_TO_EXT[mimeType] ?? "png";
      // Per-block isolation: a storage failure must not abort the whole turn —
      // the image is already generated (and billed), and the assistant text
      // plus any sibling images should still reach the user. Degrade the
      // failed block to a text notice; never fall back to raw base64.
      try {
        const asset = new Asset({
          user_id: userId,
          workflow_id: workflowId ?? null,
          name: `image_${Date.now()}`,
          content_type: mimeType,
          // Home — see the chat media generation path.
          parent_id: userId
        });
        const fileName = `${asset.id}.${ext}`;
        await storeAssetWithThumbnail(
          asset.user_id,
          asset.id,
          fileName,
          bytes,
          mimeType
        );
        asset.size = bytes.length;
        await asset.save();
        // The DB / wire shape mirrors handleMediaGenerationMessage: an asset_id
        // reference (never raw bytes). resolveContentUrls / resolveContentForProvider
        // dereference asset_id on the way out and on the next turn.
        out.push({
          type: "image_url",
          image: { type: "image", asset_id: asset.id, mimeType }
        });
      } catch (err) {
        log.error("Failed to store generated image as asset", {
          error: err instanceof Error ? err.message : String(err)
        });
        out.push({
          type: "text",
          text: "[a generated image could not be saved]"
        });
      }
    }
    return out;
  }

  /**
   * Recursively process tool results, handling asset-like objects.
   * Mirrors Python's RegularChatProcessor._process_tool_result().
   *
   * - Asset-like objects (have type + uri/data): materialized via storage
   * - Date/datetime: converted to ISO string
   * - Arrays/objects: recursed into
   * - Primitives: returned as-is
   */
  // HOLDOUT (anti-slop/no-unknown-returns): a tool result is an arbitrary
  // value — the same open domain `ProcessingContext.normalizeOutputValue`
  // rewrites — and this walk answers in that domain.
  private async processToolResult(
    obj: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (obj === null || obj === undefined) return obj;

    // Asset-like objects: { type: "image"|"audio"|"video"|..., uri?: string, data?: ... }
    if (isRecord(obj)) {
      const record = obj as Record<string, unknown>;

      // Check if it's an asset-like object (has type + uri or data)
      if (
        "type" in record &&
        ("uri" in record || "data" in record || "asset_id" in record)
      ) {
        // Use ProcessingContext's normalizeOutputValue to handle asset materialization
        return ctx.normalizeOutputValue(record, "storage_url");
      }

      // Date objects
      if (obj instanceof Date) {
        return obj.toISOString();
      }

      // Regular objects — recurse into values
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        result[key] = await this.processToolResult(value, ctx);
      }
      return result;
    }

    // Arrays — recurse into items
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.processToolResult(item, ctx)));
    }

    // Uint8Array/Buffer — store as asset
    if (obj instanceof Uint8Array) {
      if (!ctx.storage) return obj;
      const key = `assets/${randomUUID()}.bin`;
      const uri = await ctx.storage.store(key, obj);
      return { type: "asset", uri };
    }

    // Primitives
    return obj;
  }

  /**
   * Persist image bytes to temp storage and return a handle `view_image` can
   * resolve — a bare `<uuid>.<ext>` storage key. No DB asset row is created, so
   * these captures never clutter the user's asset library; the bytes live only
   * in the request's temp storage. Returns null if there is no storage adapter
   * or the write fails.
   */
  private async storeTempImageAsset(
    ctx: ProcessingContext,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<string | null> {
    if (!ctx.storage) return null;
    const ext = IMAGE_MIME_TO_EXT[mimeType] ?? "png";
    const key = `${randomUUID()}.${ext}`;
    try {
      await ctx.storage.store(key, bytes, mimeType);
      return key;
    } catch (err) {
      log.error("Failed to store temp image asset", {
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  }

  /**
   * Replace embedded image pixels in a tool result — timeline `frames[]` or an
   * `image_content` blob (e.g. `ui_3d_capture_view`) — with temp-asset handles.
   * The model receives a handle and an instruction to call `view_image`, which
   * is the single mechanism that pulls pixels into context. Keeps image bytes
   * out of the standing chat history. Non-image results pass through untouched.
   */
  // HOLDOUT (anti-slop/no-unknown-returns): same open tool-result domain as
  // `processToolResult`; non-image results pass through untouched.
  private async materializeToolResultImages(
    toolResult: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (!isRecord(toolResult)) {
      return toolResult;
    }
    const record = toolResult as Record<string, unknown>;

    const handleFor = async (
      payload: { bytes: Uint8Array; mimeType: string } | { uri: string } | null
    ): Promise<string | null> => {
      if (!payload) return null;
      if ("uri" in payload) return payload.uri;
      return this.storeTempImageAsset(ctx, payload.bytes, payload.mimeType);
    };

    // Timeline frames → one image handle per frame.
    if (Array.isArray(record.frames)) {
      const handles: unknown[] = [];
      let stored = 0;
      for (const frame of record.frames) {
        if (!isObjectLike(frame)) {
          handles.push(frame);
          continue;
        }
        const f = { ...(frame as Record<string, unknown>) };
        const payload = extractEmbeddedImage({
          uri: f.dataUrl,
          mimeType: "image/jpeg"
        });
        delete f.dataUrl;
        const id = await handleFor(payload);
        if (id) {
          f.image_id = id;
          stored++;
        }
        handles.push(f);
      }
      const out: Record<string, unknown> = { ...record, frames: handles };
      if (stored > 0) {
        out.note = `Captured ${stored} timeline frame(s) as image assets. Call view_image({ image_id }) to inspect a frame.`;
      }
      return out;
    }

    // Single image_content blob → one image handle.
    if (isObjectLike(record.image_content)) {
      const payload = extractEmbeddedImage(
        record.image_content as Record<string, unknown>
      );
      const id = await handleFor(payload);
      const out: Record<string, unknown> = { ...record };
      delete out.image_content;
      if (id) {
        out.image_id = id;
        const base = isString(record.note) ? record.note : "Captured an image.";
        out.note = `${base} Saved as image asset "${id}". Call view_image({ image_id: "${id}" }) to inspect it.`;
      }
      return out;
    }

    return toolResult;
  }

  /**
   * The displayable text for a tool result that may be image content. Used for
   * the persisted/echoed tool message so chat history stays a light note
   * instead of a base64 blob (the image only rides the in-flight provider
   * message for the turn that captured it).
   */
  private toolResultDisplayText(content: MessageContent[]): string {
    const text = content
      .filter(
        (c): c is MessageContent & { type: "text"; text: string } =>
          c.type === "text"
      )
      .map((c) => c.text)
      .join("\n");
    return text || "[image result]";
  }

  /**
   * Append ephemeral context to the last user message.
   *
   * Every turn-scoped block (RAG context, memory, an invoked skill's
   * body) rides here, and the position is the point. Providers cache the
   * longest stable prefix on their own, and Anthropic and the OpenAI Responses
   * API hoist *every* system-role message into one system string — so a block
   * that changes per turn, injected as a system message, rewrote the tail of
   * that string and invalidated the whole prefix ahead of the conversation,
   * tool catalog included. Folded into the last user message instead, the
   * volatile bytes sit after everything a later turn will reuse.
   *
   * Call it after media resolution: the text is appended as-is, so an
   * `asset://` uri a memory carries stays a reference instead of being
   * inlined as a data URI.
   */
  private appendContextToLastUser(
    messages: ProviderMessage[],
    context: string
  ): ProviderMessage[] {
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex < 0) return messages;
    const target = messages[lastUserIndex];
    const appended: ProviderMessage = Array.isArray(target.content)
      ? {
          ...target,
          content: [...target.content, { type: "text", text: context }]
        }
      : {
          ...target,
          content: `${isString(target.content) ? target.content : ""}\n\n${context}`
        };
    return [
      ...messages.slice(0, lastUserIndex),
      appended,
      ...messages.slice(lastUserIndex + 1)
    ];
  }

  /**
   * Render the turn's memory block.
   *
   * Memory is user-scoped, but only **this thread's** memories are pasted in:
   * the store grows for the life of the account, and a block that grew with it
   * would eventually cost more than the turn. What the agent gets instead is
   * this thread's notes in full plus a count of the ones saved elsewhere, so
   * it knows to reach them with `memory_search` rather than assume the block
   * is everything.
   *
   * Resource refs are used as stored (asset refs already carry the `asset://`
   * uri captured at save time) — one indexed query, no per-asset lookups on
   * the hot path. Best-effort: a DB hiccup returns an empty block rather than
   * breaking the turn.
   */
  private async buildMemoryBlock(
    userId: string,
    threadId: string
  ): Promise<string> {
    try {
      // One read over the user's newest memories, split by thread here rather
      // than issuing a second count query.
      const recent = await Memory.list(userId, { limit: MEMORY_SCAN_LIMIT });
      const mine = recent.filter((memory) => memory.thread_id === threadId);
      const elsewhere = recent.length - mine.length;
      if (mine.length === 0 && elsewhere === 0) return "";
      const rendered = mine.slice(0, MEMORY_BLOCK_LIMIT).map((memory) => ({
        kind: memory.kind,
        title: memory.title,
        content: memory.content,
        resources: (Array.isArray(memory.resources)
          ? memory.resources
          : []) as MemoryResource[]
      }));
      return formatMemoriesForPrompt(rendered, elsewhere);
    } catch (err) {
      log.warn("Failed to build memory block", {
        threadId,
        error: err instanceof Error ? err.message : String(err)
      });
      return "";
    }
  }

  /**
   * The user's skills, read once per turn.
   *
   * Two halves with different lifetimes, which is why the caller splits them.
   * The catalog (name + description) changes only when the skills table does,
   * so it belongs in the system prompt where a provider's automatic prefix
   * cache can keep it. The body of a skill the message invoked with `/<name>`
   * changes per turn, so it rides at the tail with the other volatile context.
   *
   * Best-effort like the memory block: a DB hiccup costs the skills, not the
   * turn.
   */
  private async loadUserSkills(userId: string): Promise<SkillEntry[]> {
    let rows: Skill[] = [];
    try {
      rows = await Skill.listByUser(userId);
    } catch (err) {
      log.warn("Failed to load user skills", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
    // The shipped skills ride in the same catalog. They come off disk rather
    // than the table, so a DB hiccup costs the user's own rows and not these.
    return mergeSystemSkills(
      rows.map((row) => ({
        name: row.name,
        description: row.description,
        content: row.content
      }))
    );
  }

  /** The bodies of the skills this turn's message named with `/<name>`. */
  private invokedSkillsSection(
    skills: readonly SkillEntry[],
    userText: string
  ): string {
    const invoked = findInvokedSkillNames(
      userText,
      skills.map((skill) => skill.name)
    );
    if (invoked.length === 0) return "";
    return formatInvokedSkillsForPrompt(
      skills
        .filter((skill) => invoked.includes(skill.name.toLowerCase()))
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          content: skill.content
        }))
    );
  }

  /**
   * Round-trip a permission approval to the client and resolve with the
   * user's decision. Emits a `tool_approval_request`, then waits for the
   * matching `tool_approval_response` (resolved via {@link approvalBridge}).
   * A cancelled wait (stop) is treated as a denial.
   */
  private async requestToolApproval(
    threadId: string,
    request: ApprovalRequest
  ): Promise<ApprovalDecision> {
    const approvalId = `appr_${randomUUID()}`;
    await this.sendMessage({
      type: "tool_approval_request",
      thread_id: threadId,
      approval_id: approvalId,
      tool_name: request.toolName,
      category: request.category,
      message: request.message,
      description: request.description ?? "",
      args: request.args
    });
    try {
      // No timeout — the user may take a while; `stop` cancels this thread.
      const response = await this.approvalBridge.createWaiter(
        approvalId,
        0,
        threadId
      );
      const decision = response.decision;
      if (
        decision === "allow" ||
        decision === "allow_for_chat" ||
        decision === "deny"
      ) {
        return decision;
      }
      return "deny";
    } catch {
      // Cancelled (generation stopped) — treat as a denial.
      return "deny";
    }
  }

  /**
   * Open the bespoke secret dialog on the client and resolve with what the
   * user did — never with what they typed.
   *
   * The value does not travel over this socket in either direction. The
   * dialog writes it with the client's own `settings.secrets.upsert` call, so
   * the credential never enters the chat transcript, the run's message log, or
   * the model's context; this frame only asks, and the response only reports.
   *
   * A cancelled wait (the user pressed Stop) is a decline, which is the same
   * fail-closed reading the approval prompts take.
   */
  private async requestSecretEntry(
    threadId: string,
    request: SecretPromptRequest
  ): Promise<SecretPromptStatus> {
    const approvalId = `secret_${randomUUID()}`;
    await this.sendMessage({
      type: "secret_request",
      thread_id: threadId,
      approval_id: approvalId,
      key: request.key,
      description: request.description ?? null,
      reason: request.reason ?? null,
      help_url: request.helpUrl ?? null
    });
    try {
      // No timeout — finding an API key takes as long as it takes; `stop`
      // cancels this thread.
      const response = await this.approvalBridge.createWaiter(
        approvalId,
        0,
        threadId
      );
      return response.status === "saved" ? "saved" : "declined";
    } catch {
      return "declined";
    }
  }

  /**
   * Round-trip a plan approval to the client and resolve with the user's
   * decision. Emits a `plan_approval_request` carrying the serialized plan,
   * then waits for the matching `plan_approval_response` (resolved via
   * {@link approvalBridge}). A cancelled wait (stop) is treated as a
   * rejection without feedback, which aborts the agent run.
   */
  private async requestPlanApproval(
    threadId: string | null,
    plan: TaskPlan
  ): Promise<PlanApprovalDecision> {
    const approvalId = `plan_${randomUUID()}`;
    await this.sendMessage({
      type: "plan_approval_request",
      thread_id: threadId,
      approval_id: approvalId,
      plan: {
        title: plan.title,
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          depends_on: t.dependsOn ?? [],
          steps: t.steps.map((s) => ({
            id: s.id,
            instructions: s.instructions
          }))
        }))
      }
    });
    try {
      // No timeout — the user may take a while; `stop` cancels this run.
      const response = await this.approvalBridge.createWaiter(
        approvalId,
        0,
        threadId ?? undefined
      );
      if (response.decision === "approve") {
        return { decision: "approve" };
      }
      const feedback =
        isString(response.feedback) && response.feedback.trim()
          ? response.feedback.trim()
          : undefined;
      return { decision: "reject", feedback };
    } catch {
      // Cancelled (generation stopped) — treat as a rejection.
      return { decision: "reject" };
    }
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
    // Same reasoning as the tool-approval gate: a plan presented from inside a
    // code action parks the guest program, and the wait belongs to the user.
    const request: RequestPlanApproval = async (plan) => {
      const resume = clock?.suspend();
      try {
        return await this.requestPlanApproval(threadId, plan);
      } finally {
        resume?.();
      }
    };
    context.set(PLAN_APPROVAL_CONTEXT_KEY, request);
  }

  /**
   * Execute a single node by type and return its output. Builds a one-node
   * graph and runs it through a fresh `ExecutionSession` (@nodetool-ai/execution),
   * then returns the
   * node's completed result. Backs the `run_node` chat tool.
   */
  // HOLDOUT (anti-slop/no-unknown-returns): answers with the node's own output
  // — an arbitrary workflow value — or an `{ error }` bag when the run failed.
  private async runSingleNode(
    nodeType: string,
    inputs: Record<string, unknown>,
    userId: string,
    threadId: string | null = null,
    projectId: string | null = null
  ): Promise<unknown> {
    const jobId = randomUUID();
    const nodeId = "node_0";
    const rawGraph = {
      nodes: [{ id: nodeId, type: nodeType, data: inputs ?? {} }],
      edges: [] as Array<Record<string, unknown>>
    };

    let graph: HydratedGraphData;
    try {
      graph = await this.hydrateGraph(rawGraph);
    } catch (err) {
      return {
        error: `Failed to prepare node '${nodeType}': ${
          err instanceof Error ? err.message : String(err)
        }`
      };
    }

    if (this.beforeRunJob) {
      try {
        await this.beforeRunJob(graph);
      } catch (err) {
        return {
          error: `Node prerequisites failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        };
      }
    }

    const context = createRuntimeContext({
      jobId,
      workflowId: null,
      userId,
      workspace: this.workspaceResolver
        ? await this.workspaceResolver(null, userId)
        : null,
      assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
    });
    this.attachPlanApproval(context, threadId);
    context.setResolveExecutor((node) => this.resolveExecutor(node));
    if (this.resolveNodeType) {
      const resolverObj = isFunctionValue(this.resolveNodeType)
        ? { resolveNodeType: this.resolveNodeType }
        : this.resolveNodeType;
      context.setResolveNodeType(
        (type) =>
          resolverObj.resolveNodeType(type) as Promise<{
            nodeType: string;
            propertyTypes?: Record<string, string>;
            outputs?: Record<string, string>;
            isDynamic?: boolean;
            descriptorDefaults?: Record<string, unknown>;
          } | null>
      );
    }

    // A node selecting a model this runtime cannot honour is refused before
    // the kernel starts; the tool answers with the reason, like every other
    // preparation failure here.
    let session: ExecutionSession;
    try {
      session = await ExecutionSession.create({
        graph: toRawGraphInput(graph),
        resolveExecutor: (node) =>
          this.resolveExecutor(
            node as { id: string; type: string; [key: string]: unknown }
          ),
        bridgeFactory: async () => null,
        jobLifecycleBridge: this.pythonBridge ?? null,
        jobId,
        context,
        params: {},
        // A node run from a project's agent thread is that project's spend;
        // the ledger this session attaches writes it. Null outside a project.
        projectId: projectId ?? null,
        validateNode: this.validateNode
      });
    } catch (err) {
      if (!isExecutionPreflightError(err)) throw err;
      return { error: err.message };
    }
    const result = await session.result;

    // Capture the node's completed result from the streamed updates.
    let nodeResult: unknown;
    while (context.hasMessages()) {
      const msg = context.popMessage() as Record<string, unknown> | undefined;
      if (
        msg &&
        msg.type === "node_update" &&
        msg.node_id === nodeId &&
        msg.status === "completed" &&
        msg.result != null
      ) {
        nodeResult = msg.result;
      }
    }

    if (result.status === "failed") {
      return { error: result.error ?? `Node '${nodeType}' failed` };
    }
    if (nodeResult === undefined) {
      // Fall back to the runner's collected outputs (e.g. Output nodes).
      return result.outputs ?? { status: result.status };
    }
    return this.processToolResult(nodeResult, context);
  }

  /**
   * Handle an incoming chat message.
   *
   * Mirrors Python's full 3-layer flow:
   *   handle_chat_message → handle_message_impl → process_messages
   *     → _run_processor + RegularChatProcessor.process()
   *
   * The processor sends messages to a queue. _run_processor reads them:
   *   - type === "message" → persist to DB AND forward to client
   *   - anything else → forward to client only
   *
   * RegularChatProcessor.process():
   *   1. Prepend system prompt if first message isn't system role
   *   2. while True: messages_to_send = chat_history + unprocessed_messages
   *   3. Stream chunks (type: "chunk") — forwarded to client (not persisted)
   *   4. On tool call: build assistant Message + tool result Message (type: "message")
   *      → persisted to DB AND forwarded to client
   *   5. If unprocessed_messages empty, break
   *   6. Send done chunk + final assistant Message
   */
  async handleChatMessage(
    data: Record<string, unknown>,
    requestSeq?: number,
    signal?: AbortSignal
  ): Promise<void> {
    const messageWorkflowId = isString(data.workflow_id)
      ? data.workflow_id
      : null;
    const threadId = await this.ensureThreadExists(
      isString(data.thread_id) ? data.thread_id : undefined,
      messageWorkflowId
    );
    data.thread_id = threadId;

    // Route this turn takes: a workflow chatbot and a media generation carry
    // their own model selection (checked in their handlers), a plain chat turn
    // is served by the language model the composer picked.
    const workflowTargetHint = isString(data.workflow_target)
      ? data.workflow_target
      : null;
    const mediaModeHint = isObjectLike(data.media_generation)
      ? (data.media_generation as Record<string, unknown>).mode
      : null;
    const isPlainChatTurn =
      workflowTargetHint !== "workflow" &&
      (!isString(mediaModeHint) || mediaModeHint === "chat");

    // A plain chat turn without a chosen model used to fall through to the
    // built-in default and die deep in provider resolution ("No provider
    // registered for \"empty\"") — after the user's message had been
    // persisted. Reject it up front and say what to do instead.
    if (isPlainChatTurn && !isModelSelection(data.provider, data.model)) {
      await this.sendMessage({
        type: "error",
        message: NO_MODEL_SELECTED_MESSAGE,
        thread_id: threadId
      });
      return;
    }

    // Apply defaults — matches Python's handle_chat_message
    if (!data.model) data.model = this.defaultModel;
    if (!data.provider) data.provider = this.defaultProvider;

    const providerId = data.provider as string;
    const model = data.model as string;
    const workflowId = messageWorkflowId;
    const userId = this.userId ?? "1";
    log.debug("Chat message", { threadId, model, provider: providerId });

    // Save user message to DB — matches Python's _save_message_to_db_async(data)
    await this.saveMessageToDb(data);

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    // Route to the workflow processor ONLY when the client explicitly opts in
    // via `workflow_target: "workflow"`. A bare `workflow_id` is context, not a
    // routing signal: the editor binds the open workflow so `ui_*` tools target
    // it, and that ambient id must not hijack the turn into running the
    // workflow as a chatbot. Genuine workflow-chatbot runs set `workflow_target`
    // (and carry `workflow_id`/`graph` for the processor to load/execute).
    const workflowTarget = isString(data.workflow_target)
      ? data.workflow_target
      : null;
    if (workflowTarget === "workflow") {
      await this.handleWorkflowMessage(data, requestSeq, signal);
      return;
    }

    // Route to media generation when the client requests a text-to-image or
    // text-to-video turn. The composer attaches a `media_generation` field
    // with mode + params; when mode is a media mode we invoke the provider's
    // textToImage / textToVideo instead of a regular LLM round and return an
    // assistant message containing MessageImageContent / MessageVideoContent.
    const mediaGeneration = isObjectLike(data.media_generation)
      ? (data.media_generation as Record<string, unknown>)
      : null;
    if (
      mediaGeneration &&
      isString(mediaGeneration.mode) &&
      mediaGeneration.mode !== "chat"
    ) {
      await this.handleMediaGenerationMessage(
        data,
        mediaGeneration,
        requestSeq,
        signal
      );
      return;
    }

    const provider = await this.resolveProvider(providerId, userId);

    // Permission mode for this turn. Governs whether gated tool calls run,
    // ask for approval, or are blocked. Defaults to "default".
    const permissionMode: PermissionMode =
      data.permission_mode === "plan" ||
      data.permission_mode === "auto" ||
      data.permission_mode === "default"
        ? data.permission_mode
        : "default";

    // A surface can send a context-specific system-prompt addendum (e.g. the
    // App Builder's build-an-app-UI guidance), layered after the base prompt.
    const extraSystemPrompt = isString(data.system_prompt)
      ? data.system_prompt
      : null;

    // Which documents the user has open, and which one has focus. The `ui_*`
    // tools all require an explicit document id, so this is what makes them
    // usable — see `formatUiContext`.
    const uiContext = isObjectLike(data.ui_context)
      ? (data.ui_context as UiContext)
      : null;

    // History load. Session-based providers (e.g. claude_agent) keep the
    // conversation upstream, so when a resumable session exists for this
    // provider+model we do NOT reload the whole thread: we probe a bounded
    // recent window, send only the turns since the session, and hand the
    // provider a `loadFullHistory` thunk it calls only if it must prime context
    // (resume failed / system prompt changed). Otherwise we load the full
    // history and use the standard slice-based resume. The DB column is the
    // source of truth; the provider also keeps an in-process cache.
    // The action contract + tool catalog section, assigned once the codeact
    // session exists (before the system message is materialized). Read lazily
    // here because the resume `loadFullHistory` thunk and the prepend both run
    // after tool resolution.
    let codeactPromptSection = "";
    // The user's skills, read once. The catalog goes into the system prompt
    // below because it is stable — it changes only when the skills table does,
    // so a provider's prefix cache keeps it across turns. The body of an
    // invoked skill is volatile and rides at the tail instead.
    const userSkills = await this.loadUserSkills(userId);
    const skillCatalogSection = formatSkillCatalogForPrompt(userSkills);
    const buildSystemContent = (): string => {
      const base = buildChatAgentSystemPrompt(
        permissionMode,
        extraSystemPrompt,
        uiContext,
        workflowId
      );
      const sections = [base];
      if (codeactPromptSection) sections.push(codeactPromptSection);
      if (skillCatalogSection) sections.push(skillCatalogSection);
      return sections.join("\n\n");
    };
    const systemChatMessage = (): ProviderMessage => ({
      role: "system",
      content: buildSystemContent(),
      toolCallId: null,
      toolCalls: null,
      threadId: null
    });
    const convertDbMessages = (rows: Message[]): ProviderMessage[] => {
      const out: ProviderMessage[] = [];
      for (const m of rows) {
        const pm = this.dbMessageToProviderMessage(m);
        if (pm) out.push(pm);
      }
      // A thread that took an interleave before this was fixed still holds a
      // tool call with no result. Anthropic 400s on one, so loading such a
      // thread under a different provider or model would fail every turn from
      // here on. Patch the history we send; the stored rows are left alone.
      return repairOrphanedToolCalls(out);
    };

    let chatHistory: ProviderMessage[];
    let priorSession: ProviderSession | null = null;
    // The provider calls this only on a priming fallback; null on the full path.
    let loadFullHistory: (() => Promise<ProviderMessage[]>) | null = null;
    // Absolute checkpoint to persist on the assistant message when the fast path
    // sent only a delta (so the stored value matches the full-load path); null
    // when the provider's own checkpoint is already absolute.
    let sessionCheckpointOverride: number | null = null;
    {
      const [recent] = await Message.paginate(threadId, {
        reverse: true,
        limit: SESSION_PROBE_WINDOW
      });
      const probeHasWholeThread = recent.length < SESSION_PROBE_WINDOW;
      // `recent` is newest-first. Walk to the most recent assistant carrying a
      // session token — that message is the resume boundary.
      let probeSession: ProviderSession | null = null;
      const sinceSessionNewestFirst: Message[] = [];
      for (const m of recent) {
        if (m.role === "assistant" && m.provider_session) {
          const s = m.provider_session;
          if (s.providerId === providerId && s.model === model)
            probeSession = s;
          break;
        }
        sinceSessionNewestFirst.push(m);
      }

      if (probeSession) {
        // RESUME fast path: the SDK already holds the prior turns, so send only
        // the messages since the session — no full-thread load.
        const newTurns = convertDbMessages(sinceSessionNewestFirst.reverse());
        chatHistory = newTurns;
        // The single system message prepended below sits at index 0, so the new
        // turns begin at index 1 (the provider's relative resume checkpoint).
        priorSession = {
          providerId,
          model,
          token: probeSession.token,
          systemHash: probeSession.systemHash,
          checkpoint: 1
        };
        // Absolute position to persist: prior prefix + the prior assistant + the
        // new turns — identical to what the full-load path would store.
        sessionCheckpointOverride =
          probeSession.checkpoint + 1 + newTurns.length;
        loadFullHistory = async () => {
          const [rows] = await Message.paginate(threadId, { limit: 1000 });
          const full = convertDbMessages(rows);
          full.unshift(systemChatMessage());
          return full;
        };
      } else if (probeHasWholeThread) {
        // The whole thread fit in the probe window — reuse it, no second query.
        const rows = [...recent].reverse();
        chatHistory = convertDbMessages(rows);
        priorSession = lastMatchingProviderSession(rows, providerId, model);
      } else {
        // Long thread without a resumable session in the recent window: load it
        // all (a far-back session still resumes via the slice path).
        const [rows] = await Message.paginate(threadId, { limit: 1000 });
        chatHistory = convertDbMessages(rows);
        priorSession = lastMatchingProviderSession(rows, providerId, model);
      }
    }

    // Expose the read-only `run_search` fan-out primitive by default. A client
    // can opt out by sending `enable_read_only_search: false`.
    const enableReadOnlySearch = data.enable_read_only_search !== false;

    // Assemble the fixed, always-on toolbelt. There is no per-message tool
    // selection anymore — the agent reasons over the full toolbelt and the
    // permission gate (below) governs execution.
    registerBuiltinTools();
    // Google Workspace runs on the token from the user's Google sign-in, so it
    // only exists on deployments that have a login. Local mode never sees it.
    const googleWorkspace = isGoogleWorkspaceEnabled();
    if (googleWorkspace) registerGoogleWorkspaceTools();
    const chatProviders = await this.configuredProvidersCache.get(userId);
    // The project this conversation belongs to, when it is a project's own
    // agent thread. Documents the turn creates land in it rather than in the
    // loose bucket, without the model having to pass `project_id` every time,
    // and everything the turn spends is billed to it.
    const chatProjectId =
      (await Project.findByThread(userId, threadId))?.id ?? undefined;
    // The single-node runner is a closure only this package can build, so
    // `run_node` reaches a capability run as a host-supplied capability rather
    // than out of the registry.
    const runNodeTool = new RunNodeTool((nodeType, inputs) =>
      this.runSingleNode(nodeType, inputs, userId, threadId, chatProjectId)
    );
    // The permission gate the belt is wrapped in below. Built before the belt
    // because the Apify tools carry it into their own run: in discovery mode
    // the actor policy asks this gate to approve an actor the install has not
    // allowlisted, so the user sees that question in the same place as every
    // other permission prompt. The session allow-set is shared per thread so
    // "Allow for this chat" sticks.
    const sessionAllow =
      this.chatSessionAllow.get(threadId) ?? new Set<string>();
    this.chatSessionAllow.set(threadId, sessionAllow);
    // A gated call inside a code action parks the guest program until the user
    // answers, and the gate stops the clock for exactly that long — the wait is
    // the user's, not the program's, and charged to the action's wall clock it
    // would kill the very program that asked.
    const codeactClock = createSandboxClock();
    const liveMode = { value: permissionMode };
    this.chatTurnPermissionMode.set(threadId, liveMode);
    const chatGate: PermissionGateOptions = {
      get mode() {
        return liveMode.value;
      },
      sessionAllow,
      requestApproval: async (
        request: ApprovalRequest
      ): Promise<ApprovalDecision> =>
        this.requestToolApproval(threadId, request),
      clock: codeactClock
    };
    const gatedRun = (context: ProcessingContext): CapabilityRun =>
      createCapabilityRun({
        context,
        gate: chatGate,
        projectId: chatProjectId,
        availableSecrets: contextSecretAvailability(context)
      });
    const rawToolbelt: Tool[] = [
      ...getAgentToolbelt(),
      ...(googleWorkspace ? getGoogleWorkspaceTools() : []),
      // Apify and SerpAPI have no `nodetool.*` namespace, so the belt is how
      // a chat discovers them (`nodetool.searchTools("apify")`) at all.
      ...getApifyTools(gatedRun),
      ...getSerpApiTools(gatedRun),
      ...getAllMcpTools({
        registry: this.nodeRegistry,
        providers: chatProviders,
        ...mcpToolHostDeps()
      }),
      toolForCapabilityName("list_collections"),
      toolForCapabilityName("query_collection"),
      runNodeTool
    ];
    // De-duplicate by name (builtins / mcp / extras may overlap); first wins.
    const dedupedToolbelt: Tool[] = [];
    const seenToolNames = new Set<string>();
    for (const tool of rawToolbelt) {
      if (seenToolNames.has(tool.name)) continue;
      seenToolNames.add(tool.name);
      dedupedToolbelt.push(tool);
    }

    // Wrap the toolbelt in the permission gate. The wrapper is transparent
    // except for `process()`, so the chat loop AND any `run_subtask` child
    // loop inherit gating by simply calling `tool.process()`.
    const baseTools = gateTools(dedupedToolbelt, chatGate);

    // Inject the recursive-decomposition primitive (ungated — it spawns a
    // child loop whose own tools are the gated `baseTools`). Child events
    // stream back tagged with `parent_tool_call_id` so the UI can nest cards.
    const serverTools: Tool[] = baseTools.slice();
    // The same runtime the delegation tools take, kept for the capability run
    // below: provider, model, the parent belt, and the event forwarder.
    let subAgentRuntime: SubAgentRuntime | undefined;
    {
      const subtaskThreadId = threadId;
      const subtaskWorkflowId = workflowId;
      const forwardSubtaskMessage = async (msg: ProcessingMessage) => {
        const enriched: Record<string, unknown> = { ...msg };
        if (enriched.thread_id == null) enriched.thread_id = subtaskThreadId;
        if (enriched.workflow_id == null)
          enriched.workflow_id = subtaskWorkflowId;
        try {
          await this.sendMessage(enriched);
          // Tool calls inside a subtask only arrive here as transient
          // tool_call_update events; the chat UI needs a persistent assistant
          // message with tool_calls to render a ToolCallCard. Emit a synthetic
          // one so child tool calls show up as cards nested below the parent
          // run_subtask card.
          await this.emitSyntheticToolCallCard(enriched);
        } catch (err) {
          log.warn("Failed to forward subtask event", {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      };
      subAgentRuntime = {
        provider,
        model,
        parentTools: () => baseTools,
        forwardMessage: forwardSubtaskMessage,
        background: new BackgroundSubtaskRegistry()
      };
      // All four delegation tools reach the belt as capabilities over this
      // runtime. The class is still what runs — the `agents` module builds one
      // per call — so the depth gate, the child's inherited belt (with a
      // `run_subtask` of its own stitched in by `buildChildToolset`, since this
      // snapshot deliberately predates the unshift), and the
      // `parent_tool_call_id` / `subtask_depth` tagging are unchanged.
      // `start_subtask` / `wait_subtasks` share the per-turn registry above:
      // spawn returns immediately, and the parent collects on its own terms.
      const delegationRun = (context: ProcessingContext) =>
        createCapabilityRun({
          context,
          // Ungated on purpose, as before: spawning a child loop has no side
          // effect of its own, and the child's tools are the gated `baseTools`.
          gate: UNGATED,
          availableSecrets: contextSecretAvailability(context),
          subAgent: subAgentRuntime
        });
      serverTools.unshift(toolForCapabilityName("run_subtask", delegationRun));
      serverTools.unshift(
        toolForCapabilityName("start_subtask", delegationRun)
      );
      serverTools.unshift(
        toolForCapabilityName("wait_subtasks", delegationRun)
      );

      // Read-only fan-out search (opt-in). Reuses the same runtime — the
      // capability filters the parent belt to its read-only allowlist
      // internally, so passing the full snapshot is correct.
      if (enableReadOnlySearch) {
        serverTools.unshift(toolForCapabilityName("run_search", delegationRun));
      }
    }

    const serverToolMap = new Map(serverTools.map((t) => [t.name, t]));
    const workflowDocumentToolNames = new Set<string>(
      WORKFLOW_DOCUMENT_TOOL_NAMES
    );
    log.info("Resolved server tools", {
      permissionMode,
      resolved: serverTools.map((t) => t.name)
    });

    const serverSchemas: ProviderTool[] = serverTools.map((t) =>
      t.toProviderTool()
    );
    // Every client tool the connected UI registered is exposed. They used to be
    // gated on an active workflow, which made the editor tools unreachable from
    // plain chat; they are deferred behind `nodetool.searchTools()` anyway, and each one now
    // takes an explicit document id, so the gate cost reach without buying
    // safety. Which ids are valid comes from `ui_context` in the system prompt.
    const clientToolNames = Object.keys(this.clientToolsManifest);
    const clientSchemas: ProviderTool[] = [];
    for (const [name, manifest] of Object.entries(this.clientToolsManifest)) {
      if (serverToolMap.has(name)) continue;
      // The frontend manifest carries the JSON schema under `parameters`
      // (FrontendToolRegistry.getManifest); accept `inputSchema` too for any
      // client that uses the provider-tool field name.
      const schema =
        typeof manifest.parameters === "object"
          ? (manifest.parameters as Record<string, unknown>)
          : typeof manifest.inputSchema === "object"
            ? (manifest.inputSchema as Record<string, unknown>)
            : undefined;
      clientSchemas.push({
        name,
        description: isString(manifest.description)
          ? manifest.description
          : undefined,
        inputSchema: schema
      });
    }
    const allSchemas: ProviderTool[] = [...serverSchemas, ...clientSchemas];

    // A chat turn with tools always runs in CodeAct: the model acts by writing
    // sandboxed JavaScript over the toolbelt (docs/codeact-design.md), and the
    // session's in-sandbox `nodetool.searchTools()` is the discovery path. The session
    // is created below, once the tool router and processing context exist.
    const useCodeAct = allSchemas.length > 0;

    // The tool list handed to the provider: `execute_code`, the direct tools
    // (DIRECT_TOOL_NAMES) and `view_image`, pushed once the session exists.
    const providerToolSchemas: ProviderTool[] = [];
    log.info("Provider tool schemas", {
      permissionMode,
      serverToolCount: serverTools.length,
      clientToolCount: clientToolNames.length,
      codeact: useCodeAct
    });

    // Create a processing context for tool execution
    // A chat turn without a workflow still resolves a workspace — the user's
    // default one. It used to fall back to the whole OS temp dir, which is
    // neither bounded nor anywhere the user would look for what an agent wrote.
    const chatWorkspace = this.workspaceResolver
      ? await this.workspaceResolver(
          await this.threadWorkspaceWorkflowId(userId, threadId, workflowId),
          userId
        )
      : null;
    const ctx = createRuntimeContext({
      jobId: randomUUID(),
      workflowId,
      threadId: threadId || null,
      userId,
      workspace: chatWorkspace,
      authToken: this.authToken
    });
    const detachPredictions = attachChatPredictionForwarder(
      (listener) => ctx.addMessageListener(listener),
      (msg) => this.sendDetached(msg),
      { threadId: threadId || null, workflowId }
    );
    // A chat turn that generates an image or a video spends real money without
    // ever constructing an ExecutionSession, so the ledger is attached here
    // too — otherwise the turn is invisible to `nodetool costs`.
    const detachCostLedger = attachRunCostLedger(ctx, {
      userId,
      workflowId: workflowId ?? null,
      // A project's own thread attributes its spend to that project, so
      // `nodetool costs` can answer what a project cost.
      projectId: chatProjectId ?? null,
      resolveSecret: (key) => ctx.getSecret(key)
    });
    // Any agent planning inside this turn (e.g. via run_node spawning an
    // Agent node in plan mode) pauses for user plan approval.
    this.attachPlanApproval(ctx, threadId || null, codeactClock);
    // Stamp the turn's own selection so a tool that launches another harness
    // inherits this chat's provider/model when the call doesn't name one.
    ctx.set(ACTIVE_MODEL_CONTEXT_KEY, {
      provider: providerId,
      model
    } satisfies ActiveModelSelection);

    // The capability run for this turn: the same gate the belt is wrapped in,
    // this context, and the singletons the tool constructors take today. Every
    // capability a host must supply itself goes in `capabilities` — `run_node`
    // carries a closure only this package can build. The codeact session below
    // mounts it, so an action can import
    // `@nodetool-ai/sandbox-nodetool/<namespace>` and land on `run.invoke`.
    this.chatCapabilityRun = createCapabilityRun({
      context: ctx,
      gate: chatGate,
      projectId: chatProjectId,
      availableSecrets: contextSecretAvailability(ctx),
      nodeRegistry: this.nodeRegistry,
      providers: chatProviders,
      subAgent: subAgentRuntime,
      secretPrompt: (request) => this.requestSecretEntry(threadId, request),
      ...mcpToolHostDeps(),
      capabilities: [capabilityFromTool(runNodeTool)]
    });

    // CodeAct session for this turn. Created here so its prompt section is in
    // place before the system message is materialized below. The tool router
    // (`executeTool`, defined further down) is late-bound through a ref; it is
    // assigned before the provider loop can run any action.
    let codeactExecuteToolRef:
      | ((toolCall: ProviderToolCall) => Promise<string | MessageContent[]>)
      | null = null;
    let codeactSession: ChatCodeActSession | null = null;
    if (useCodeAct) {
      // The core set (file, search, fetch, todo, delegation) and discovery
      // (which providers, models and node types this install has) are also
      // plain tool calls: one question with one answer, which routing through
      // a sandbox action only delays. They stay on the belt so code can still
      // compose them; the prompt documents the direct call.
      const directSchemas = allSchemas.filter(
        (s) => s.name !== "view_image" && DIRECT_TOOL_NAMES.has(s.name)
      );
      codeactSession = createChatCodeActSession({
        tools: allSchemas
          .filter((s) => s.name !== "view_image")
          .map((s) => ({
            name: s.name,
            description: s.description,
            inputSchema: s.inputSchema
          })),
        sandboxPackages: sandboxPackagesForChat({
          source: uiContext?.source,
          focusedType: uiContext?.focused?.type,
          catalog: getProcessSandboxModuleCatalog()
        }),
        directToolNames: directSchemas.map((s) => s.name),
        executeTool: async (call: ChatCodeActToolCall) => {
          if (!codeactExecuteToolRef) {
            throw new Error("Tool router not ready");
          }
          return codeactExecuteToolRef({
            id: call.id,
            name: call.name,
            args: call.args
          });
        },
        residentToolNames: [
          ...CODEACT_RESIDENT_TOOL_NAMES,
          ...RESIDENT_TOOL_NAMES,
          ...focusedUiToolNames(
            uiContext,
            allSchemas.map((schema) => schema.name)
          )
        ],
        context: ctx,
        signal,
        clock: codeactClock,
        capabilityRun: this.chatCapabilityRun ?? undefined
      });
      providerToolSchemas.push(codeactSession.providerTool);
      providerToolSchemas.push(...directSchemas);
      // `view_image` stays a direct provider tool: it is the one channel that
      // puts pixels into the model's context, and pixels cannot ride the
      // sandbox's JSON observation envelope.
      const viewImage = allSchemas.find((s) => s.name === "view_image");
      if (viewImage) providerToolSchemas.push(viewImage);
      codeactPromptSection = codeactSession.systemPromptSection;
      log.info("Chat turn running in codeact mode", {
        threadId,
        toolCount: allSchemas.length,
        directToolCount: directSchemas.length
      });
    }

    // Prepend system prompt if first message isn't system role — matches Python
    if (chatHistory.length === 0 || chatHistory[0].role !== "system") {
      chatHistory.unshift({
        role: "system",
        content: buildSystemContent(),
        toolCallId: null,
        toolCalls: null,
        threadId: null
      });
    }

    // The agent now discovers and queries collections itself via the
    // list_collections / query_collection tools, so there is no client-driven
    // RAG pre-query here.
    const userContent = this.extractTextContent(data.content);

    // Final assistant text. Updated as the provider emits assistant
    // messages; the last one wins.
    let content = "";
    // The session token to persist onto the assistant message. Seeds from the
    // prior turn's token (so a session-based provider resumes) and is refreshed
    // whenever the provider emits a new ProviderSessionUpdate this turn.
    let capturedSession: ProviderSession | null = priorSession;
    // What to persist onto the assistant message: the provider's token, but with
    // the absolute checkpoint when the fast path sent only a delta (the
    // provider's emitted checkpoint is relative to the trimmed view).
    const sessionForPersist = (): ProviderSession | null =>
      sessionCheckpointOverride != null && capturedSession
        ? { ...capturedSession, checkpoint: sessionCheckpointOverride }
        : capturedSession;

    // Cap on tool-calling rounds before the loop stops. Generous enough to
    // build a multi-component app UI or run a long edit session in one turn —
    // 10 was too low and cut off the app builder mid-build.
    const MAX_TOOL_ROUNDS = 50;
    // Items still read from a superseded turn, purely to catch tool results
    // already in flight. A provider that honors the abort ends well inside it.
    const MAX_SUPERSEDED_DRAIN_ITEMS = 200;
    const useTools = providerToolSchemas.length > 0;

    // The wire messages. The provider's generateLoop owns the tool-calling
    // rounds and message assembly from here.
    let messagesToSend = [...chatHistory];

    // Everything turn-scoped, gathered in one place and appended once, after
    // media resolution, to the last user message. None of it is persisted, so
    // whatever is injected here is absent from the history a later turn sends
    // — which is exactly why it must sit behind every byte a later turn will
    // reuse. See `appendContextToLastUser`.
    const volatileContext: string[] = [];
    // Durable memories (memory_* tools), so the agent starts each turn aware
    // of what it recorded — project facts, decisions, and the assets it
    // generated for reuse. This thread's in full, the rest as a count it can
    // search. Deterministic and always-on.
    if (threadId) {
      const memoryBlock = await this.buildMemoryBlock(
        userId,
        threadId
      );
      if (memoryBlock) volatileContext.push(memoryBlock);
    }

    // The bodies of any skills the message invoked with `/<name>`. The catalog
    // half is stable and already sits in the system prompt.
    const invokedSkills = this.invokedSkillsSection(userSkills, userContent);
    if (invokedSkills) volatileContext.push(invokedSkills);

    // Expand any `asset://<id>.<ext>` references the composer or a prior turn
    // attached and dereference the URIs to data the provider can consume.
    // Image / audio mentions typed inline in a text part get split into proper
    // blocks first (mirroring what the workflow agent node does in
    // `buildUserMessage`), then every block with an `asset://` / storage URI is
    // resolved to a data URI. Text-document mentions are inlined as their
    // decoded contents. Without this step the provider would see literal
    // `asset://…` text and never look at the referenced media.
    messagesToSend = await ctx.resolveMessageMediaUris(messagesToSend);

    // After resolution, so a memory's `asset://` reference stays a reference
    // instead of being inlined as a data URI.
    if (volatileContext.length > 0) {
      messagesToSend = this.appendContextToLastUser(
        messagesToSend,
        volatileContext.join("\n\n")
      );
    }

    // Run one tool call and return the result to feed back to the model. Owns
    // server/client tool routing, side effects (client round-trips via the
    // ToolBridge), and asset materialization; the provider's loop orchestrates.
    // Image results (e.g. ui_3d_capture_view) return MessageContent blocks so
    // vision providers can see them; everything else returns result text.
    const executeTool = async (
      toolCall: ProviderToolCall
    ): Promise<string | MessageContent[]> => {
      let toolResult: unknown;
      const serverTool = serverToolMap.get(toolCall.name);
      const preferClientDocumentTool =
        workflowDocumentToolNames.has(toolCall.name) &&
        this.clientToolsManifest[toolCall.name] !== undefined;
      if (preferClientDocumentTool) {
        // The renderer owns live, potentially unsaved state. Use it when it is
        // present; the server implementation remains the headless fallback.
        await this.sendMessage({
          type: "tool_call",
          thread_id: threadId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        });
        const clientResult = await this.toolBridge.createWaiter(
          toolCall.id,
          300_000,
          threadId
        );
        toolResult =
          clientResult.result ?? clientResult.content ?? clientResult;
      } else if (serverTool) {
        try {
          toolResult = await Tool.executeTool(serverTool, ctx, toolCall.args, {
            toolCallId: toolCall.id
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log.error("Tool execution failed", {
            tool: toolCall.name,
            error: errMsg
          });
          toolResult = { error: errMsg };
        }
      } else if (this.clientToolsManifest[toolCall.name]) {
        // Client-side tool — round-trip through the UI via the ToolBridge.
        await this.sendMessage({
          type: "tool_call",
          thread_id: threadId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        });
        const clientResult = await this.toolBridge.createWaiter(
          toolCall.id,
          300_000,
          threadId
        );
        toolResult =
          clientResult.result ?? clientResult.content ?? clientResult;
      } else {
        toolResult = { error: `Tool "${toolCall.name}" not available` };
      }

      // view_image is the ONE mechanism that puts pixels into the model's
      // context: its image_content rides the tool message so the model sees the
      // image this turn. (The chat loop builds tool messages inside
      // provider.generateLoop, so the tool return value is the only hook.)
      if (toolCall.name === "view_image") {
        const injected = extractInjectableImages(toolResult);
        if (injected) {
          return [{ type: "text", text: injected.text }, ...injected.images];
        }
      }

      // Every other tool that produced pixels (timeline frames, 3D capture, …)
      // gets them persisted as temp image assets; the model receives only a
      // handle and calls view_image when it wants to look.
      toolResult = await this.materializeToolResultImages(toolResult, ctx);

      const processed = await this.processToolResult(toolResult, ctx);
      return isString(processed) ? processed : JSON.stringify(processed);
    };

    // Late-bind the codeact bridge to the router above, and route
    // `execute_code` calls into the sandbox session; everything else (only
    // `view_image` is offered in codeact mode) keeps the normal path.
    codeactExecuteToolRef = executeTool;
    const session = codeactSession;
    const beltToolNames = new Set(allSchemas.map((s) => s.name));
    const effectiveExecuteTool = async (
      rawCall: ProviderToolCall
    ): Promise<string | MessageContent[]> => {
      // A model that read the CodeAct prompt sometimes calls
      // `tools.<name>` at the top level. Recover the plain name first, so the
      // call reaches the tool instead of dying as "no such tool".
      const name = normalizeToolCallName(rawCall.name);
      const toolCall = name === rawCall.name ? rawCall : { ...rawCall, name };
      if (!session) return executeTool(toolCall);
      if (name === EXECUTE_CODE_TOOL_NAME) {
        return session.executeAction(toolCall.args);
      }
      // A belt tool named directly still runs: the router is the same gate the
      // sandbox bridge goes through, so answering the call is strictly better
      // than refusing it and spending a round on the correction.
      if (beltToolNames.has(name)) return executeTool(toolCall);
      // Answer, do not throw: the model can only correct course if the
      // recovery instructions arrive as this call's tool result.
      return JSON.stringify({ error: unroutableToolMessage(name) });
    };

    // Tool name by call id, so persisted tool messages keep their name (the
    // provider Message carries only the id).
    const toolNames = new Map<string, string>();
    // Calls announced by an assistant message that have not been answered by a
    // tool message yet. Whatever is still here when the turn tears down never
    // got its result row, and the `finally` below writes a stand-in so the
    // transcript stays well-formed.
    const openToolCalls = new Set<string>();
    // Set when a newer turn supersedes this one. The loop then stops feeding
    // the client and only rescues the results still coming.
    let superseded = false;
    let drainedItems = 0;

    /**
     * Write one message this turn produced. `echo` is false for a superseded
     * turn: the row still belongs in the thread, but the client has moved on
     * and replaying it there would interleave a dead turn into a live one.
     */
    const persistTurnMessage = async (
      m: ProviderMessage,
      echo: boolean
    ): Promise<void> => {
      if (m.role === "assistant") {
        // Content may be a plain string or a MessageContent[] carrying
        // native-image blocks. Raw image bytes are turned into real assets
        // here so base64 never lands in the DB or on the wire.
        let persistedContent: unknown = m.content ?? null;
        if (isString(m.content)) {
          if (echo) content = m.content;
        } else if (Array.isArray(m.content)) {
          const materialized = await this.materializeAssistantImageContent(
            m.content,
            userId,
            workflowId
          );
          persistedContent = materialized;
          if (echo) {
            content = materialized
              .filter((c) => c.type === "text" && isString(c.text))
              .map((c) => c.text as string)
              .join("");
          }
        }
        const toolCalls = Array.isArray(m.toolCalls)
          ? m.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
              result: null,
              // Gemini 3 rejects a history that replays a function call
              // without the signature it issued, so it rides into the DB.
              thought_signature: tc.thought_signature ?? null
            }))
          : null;
        for (const tc of toolCalls ?? []) {
          if (!isString(tc.id)) continue;
          openToolCalls.add(tc.id);
          toolNames.set(tc.id, tc.name);
        }
        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: persistedContent
        };
        if (toolCalls) {
          assistantMsgData.tool_calls = toolCalls;
        }
        assistantMsgData.thread_id = threadId;
        assistantMsgData.workflow_id = workflowId;
        assistantMsgData.provider = providerId;
        assistantMsgData.model = model;
        assistantMsgData.provider_session = sessionForPersist();
        await this.saveMessageToDb(assistantMsgData);
        if (echo) await this.sendMessage(assistantMsgData);
        return;
      }
      if (m.role !== "tool") return;
      // Image tool results carry MessageContent blocks; persist/echo only
      // their note text so chat history stays light (the base64 rode the
      // in-flight provider message, never the DB).
      const toolContent = Array.isArray(m.content)
        ? this.toolResultDisplayText(m.content)
        : isString(m.content)
          ? m.content
          : "";
      if (isString(m.toolCallId)) openToolCalls.delete(m.toolCallId);
      const toolMsgData = {
        type: "message",
        role: "tool",
        tool_call_id: m.toolCallId ?? null,
        name: m.toolCallId ? (toolNames.get(m.toolCallId) ?? null) : null,
        content: toolContent,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      } satisfies Record<string, unknown>;
      await this.saveMessageToDb(toolMsgData);
      if (echo) await this.sendMessage(toolMsgData);
    };

    // The Claude Agent provider runs the SDK's own loop, which resolves skills
    // through its native `Skill` tool (progressive disclosure) rather than the
    // always-on catalog every other provider reads from the system prompt. Hand
    // it the user's DB skills so that loop can list and load them; it
    // materializes them into an isolated local plugin (no `settingSources`
    // leakage). Other providers get skills via the system-prompt catalog above
    // and ignore this field.
    const skillsForProvider =
      provider.provider === PROVIDER_IDS.CLAUDE_AGENT_SDK
        ? userSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            content: skill.content
          }))
        : undefined;

    try {
      for await (const item of provider.generateLoop({
        messages: messagesToSend,
        model,
        tools: useTools ? providerToolSchemas : undefined,
        threadId,
        providerSession: capturedSession,
        loadFullHistory: loadFullHistory ?? undefined,
        executeTool: useTools ? effectiveExecuteTool : undefined,
        maxIterations: MAX_TOOL_ROUNDS,
        sequentialTools: session ? true : undefined,
        workspaceDir: chatWorkspace?.localDir ?? undefined,
        skills: skillsForProvider,
        signal
      })) {
        // A newer turn has taken over. Stop driving the client, but do NOT
        // drop what this turn already produced: the provider checks its abort
        // signal before dispatching a tool, never during one, so a call in
        // flight runs to completion and its result is arriving right now.
        // Discarding it left the model blind to a side effect it had already
        // caused, and it silently redid the work.
        if (
          !superseded &&
          requestSeq !== undefined &&
          requestSeq !== this.chatRequestSeq
        ) {
          superseded = true;
        }
        if (superseded) {
          if (isProviderMessageEvent(item)) {
            await persistTurnMessage(item.message, false);
          }
          // Nothing left outstanding: the rest of this turn is work the user
          // has already moved on from.
          if (openToolCalls.size === 0) break;
          // The turn's signal is already aborted, so a provider that honors it
          // ends within a few items. One that does not must never hold this
          // handler open — stop reading and let the `finally` stand in for
          // whatever is still missing.
          if (++drainedItems > MAX_SUPERSEDED_DRAIN_ITEMS) {
            log.warn("Superseded turn kept producing; stopped draining", {
              threadId,
              openToolCalls: openToolCalls.size
            });
            break;
          }
          continue;
        }

        if (isProviderSessionUpdate(item)) {
          // Internal continuity token — capture for persistence, never wired.
          capturedSession = item.session;
          continue;
        }

        if (isProviderMessageEvent(item)) {
          await persistTurnMessage(item.message, true);
          continue;
        }

        if ("type" in item && (item as Chunk).type === "chunk") {
          // --- Text chunk --- forward to client (not persisted)
          const chunk = item as Chunk;
          if (!chunk.thread_id) chunk.thread_id = threadId;
          await this.sendMessage({ ...chunk });
        } else if ("name" in item && "id" in item) {
          // --- Tool call from the provider (informational; executed by the
          // loop via executeTool) ---
          const tc = item as ProviderToolCall;
          toolNames.set(tc.id, tc.name);
          log.info("Tool call", { tool: tc.name, args: tc.args });
        }
      }

      // A superseded turn is done once its outstanding results are saved. The
      // completion chunk and the memory pass belong to the turn the user is
      // actually watching, which has its own.
      if (superseded) return;

      // Log provider call for cost tracking — matches Python's _log_provider_call()
      await this._logProviderCall(
        userId,
        provider,
        providerId,
        model,
        workflowId,
        chatProjectId ?? null
      );

      // Signal completion — matches Python's done chunk.
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });

      log.debug("Chat complete", { threadId, chars: content.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Chat processing error", { threadId, error: errMsg });

      // Detect error type — matches Python's separate ConnectError / HTTPStatusError handlers
      let errorType = "error";
      let statusCode: number | undefined;
      let formattedMsg = errMsg;

      // Connection errors (ECONNREFUSED, ENOTFOUND, etc.)
      if (
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("ENOTFOUND") ||
        errMsg.includes("fetch failed") ||
        errMsg.includes("nodename nor servname")
      ) {
        errorType = "connection_error";
        if (
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("nodename nor servname")
        ) {
          formattedMsg =
            "Connection error: Unable to resolve hostname. Please check your network connection and API endpoint configuration.";
        } else {
          formattedMsg = `Connection error: ${errMsg}`;
        }
      }
      // HTTP status errors — check for status code in error
      else if (isObjectLike(err) && "status" in err) {
        const status = (err as { status: number }).status;
        errorType = "http_status_error";
        statusCode = status;

        // Try to extract error message from response body
        let bodyMsg: string | null = null;
        try {
          if ("body" in err || "response" in err) {
            const errObj = err as Record<string, unknown>;
            const body = errObj.body ?? errObj.response;
            if (isObjectLike(body) && "error" in body) {
              const errorDetail = body.error;
              if (isObjectLike(errorDetail) && "message" in errorDetail) {
                bodyMsg = String(errorDetail.message);
              }
            }
          }
        } catch {
          // Intentional: best-effort extraction of error message from response body
        }

        if (bodyMsg) {
          formattedMsg = bodyMsg;
        } else if (status === 400) {
          formattedMsg = `Bad request: ${errMsg}`;
        } else if (status === 401) {
          formattedMsg = "Authentication failed: Invalid API key or token";
        } else if (status === 403) {
          formattedMsg =
            "Access forbidden: You don't have permission for this resource";
        } else if (status === 404) {
          formattedMsg = "Not found: The requested resource was not found";
        } else if (status === 429) {
          formattedMsg = "Rate limited: Too many requests, please slow down";
        } else if (status >= 500) {
          formattedMsg = `Server error (${status}): The service is temporarily unavailable`;
        } else {
          formattedMsg = `HTTP error (${status}): ${errMsg}`;
        }
      }

      type ErrorMessageFields = {
        type: "error";
        message: string;
        error_type: string;
        status_code?: number;
        thread_id?: string | null;
        workflow_id?: string | null;
      };
      const errorMessage: ErrorMessageFields = {
        type: "error",
        message: formattedMsg,
        error_type: errorType
      };
      if (statusCode !== undefined) {
        errorMessage.status_code = statusCode;
      }
      errorMessage.thread_id = threadId;
      errorMessage.workflow_id = workflowId;
      await this.sendMessage(errorMessage);
      // Signal completion even on error — matches Python
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });
      const errorMsgData = {
        type: "message",
        role: "assistant",
        content:
          errorType === "connection_error"
            ? `I encountered a connection error: ${formattedMsg}. Please check your network connection and try again.`
            : errorType === "http_status_error"
              ? `I encountered an API error (HTTP ${statusCode}): ${formattedMsg}`
              : `I encountered an error: ${formattedMsg}`,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      } satisfies Record<string, unknown>;
      await this.saveMessageToDb(errorMsgData);
      await this.sendMessage(errorMsgData);
    } finally {
      detachPredictions();
      detachCostLedger();
      // Whatever is still outstanding never got a result row. Leaving the gap
      // makes the thread malformed — Anthropic rejects a `tool_use` with no
      // `tool_result` — and leaves the model unaware the call was abandoned,
      // which is what made it silently redo the work.
      for (const toolCallId of openToolCalls) {
        try {
          await this.saveMessageToDb({
            type: "message",
            role: "tool",
            tool_call_id: toolCallId,
            name: toolNames.get(toolCallId) ?? null,
            content: SUPERSEDED_TOOL_RESULT,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model
          });
        } catch (err) {
          // Best effort: a turn that already failed must not fail again here.
          this.logError("superseded tool result save failed", err);
        }
      }
      openToolCalls.clear();
    }
  }

  /**
   * Log a provider call for cost tracking — mirrors Python's _log_provider_call().
   * Best-effort: never throws, logs warnings on failure.
   */
  private async _logProviderCall(
    userId: string,
    provider: BaseProvider,
    providerId: string,
    model: string,
    workflowId: string | null,
    projectId: string | null
  ): Promise<void> {
    if (!providerId || !model) {
      log.warn("Cannot log provider call: missing provider or model");
      return;
    }
    try {
      // A provider that could not price a call reports why. Its running total
      // is then missing that spend, so a zero is written as null — the row
      // reads unpriced in `nodetool costs` instead of summing as free, the
      // same posture the cost ledger takes.
      const unpricedReason = provider.unpricedReason;
      const cost = provider.cost;
      const unpriced = cost === 0 && unpricedReason != null;
      await Prediction.create({
        user_id: userId,
        provider: providerId,
        model,
        cost: unpriced ? null : cost,
        metadata: unpricedReason ? { unpriced_reason: unpricedReason } : null,
        workflow_id: workflowId,
        // Token spend from a project's agent thread is the project's; a turn
        // outside a project records a null rather than a bucket name.
        project_id: projectId,
        status: "completed",
        node_id: ""
      });
      log.debug("Logged provider call", { provider: providerId, model, cost });
    } catch (err) {
      if (err instanceof TypeError || err instanceof ReferenceError) {
        log.warn("Failed to log provider call due to invalid data", {
          error: err instanceof Error ? err.message : String(err)
        });
      } else {
        log.error("Unexpected error logging provider call", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /**
   * Detect message input node names from a workflow graph.
   * Mirrors Python's WorkflowMessageProcessor._detect_message_input_names().
   *
   * Scans graph nodes for types ending in .MessageInput / .MessageListInput
   * and returns their data.name values.
   */
  private detectMessageInputNames(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: unknown[];
  }) {
    let messageName: string | null = null;
    let messagesName: string | null = null;

    for (const node of graph.nodes) {
      const nodeType = isString(node.type) ? node.type : "";
      const data = isObjectLike(node.data)
        ? (node.data as Record<string, unknown>)
        : {};
      const nodeName = isString(data.name) ? data.name.trim() : "";
      if (!nodeName) continue;

      if (
        messageName === null &&
        (nodeType === "nodetool.input.MessageInput" ||
          nodeType.endsWith(".MessageInput"))
      ) {
        messageName = nodeName;
      }
      if (
        messagesName === null &&
        (nodeType === "nodetool.input.MessageListInput" ||
          nodeType.endsWith(".MessageListInput"))
      ) {
        messagesName = nodeName;
      }
    }

    return { messageName, messagesName };
  }

  /**
   * Convert workflow result dict into a response message with typed content.
   * Mirrors Python's WorkflowMessageProcessor._create_response_message().
   *
   * Converts outputs to MessageContent items:
   *  - string → { type: "text", text }
   *  - list → { type: "text", text: joined }
   *  - dict with type "image"/"video"/"audio" → media content
   *  - other → { type: "text", text: stringified }
   */
  private createWorkflowResponseContent(
    result: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    const content: Array<Record<string, unknown>> = [];

    for (const [, value] of Object.entries(result)) {
      if (value === null || value === undefined) continue;

      if (isString(value)) {
        content.push({ type: "text", text: value });
      } else if (Array.isArray(value)) {
        content.push({ type: "text", text: value.map(String).join(" ") });
      } else if (isRecord(value)) {
        const obj = value as Record<string, unknown>;
        const assetType = isString(obj.type) ? obj.type : "";
        if (assetType === "image") {
          content.push({
            type: "image",
            image: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else if (assetType === "video") {
          content.push({
            type: "video",
            video: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else if (assetType === "audio") {
          content.push({
            type: "audio",
            audio: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else {
          content.push({ type: "text", text: JSON.stringify(obj) });
        }
      } else {
        content.push({ type: "text", text: String(value) });
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "Workflow completed successfully." });
    }

    return content;
  }

  /**
   * Handle a chat message that targets a workflow.
   *
   * Mirrors Python's process_messages_for_workflow → WorkflowMessageProcessor/
   * ChatWorkflowMessageProcessor flow:
   *   1. Load workflow from DB
   *   2. Detect message input node names from graph
   *   3. Prepare params (serialized message + history)
   *   4. Run workflow via ExecutionSession (@nodetool-ai/execution)
   *   5. Stream events (job_update, node_update, output_update)
   *   6. Collect output_update results
   *   7. Send done chunk + response message with typed content
   */
  /**
   * Handle a chat_message with a `media_generation` payload by invoking the
   * selected provider's textToImage / textToVideo API, storing the resulting
   * asset(s), and returning them to the client as an assistant `Message`
   * whose `content` is an array of `MessageImageContent` / `MessageVideoContent`
   * blocks.
   *
   * The generated bytes are persisted via `ctx.storage.store()` so each
   * output receives a stable URI the client can resolve as a server asset.
   * The `media_generation` echo on the assistant message lets the UI render
   * the generation header (model, variation count, resolution, etc.) in the
   * conversation stream.
   */
  private async handleMediaGenerationMessage(
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    requestSeq?: number,
    signal?: AbortSignal
  ): Promise<void> {
    const threadId = isString(data.thread_id) ? data.thread_id : "";
    const workflowId = isString(data.workflow_id) ? data.workflow_id : null;
    const userId = this.userId ?? "1";
    const mode = String(mediaGeneration.mode ?? "");
    // The media composer's own selection first; a client without a separate
    // media picker (mobile) sends only the message-level one. The built-in
    // chat default is not in the chain — a text model can never serve a
    // generation, so falling back to it only buys an obscure provider error.
    const providerId = String(mediaGeneration.provider ?? data.provider ?? "");
    const modelId = String(mediaGeneration.model ?? data.model ?? "");
    const prompt = this.extractTextContent(data.content);

    /**
     * Whether this turn has been cancelled. The media provider APIs take no
     * AbortSignal, so an in-flight generation runs to completion regardless —
     * but its result must not be stored as an asset or delivered to a user who
     * pressed Stop. Checked after every provider call, before any write.
     */
    const cancelled = (): boolean =>
      signal?.aborted === true ||
      (requestSeq !== undefined && requestSeq !== this.chatRequestSeq);

    log.info("Media generation", {
      threadId,
      mode,
      provider: providerId,
      model: modelId,
      promptLen: prompt.length
    });

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    if (!isModelSelection(providerId, modelId)) {
      await this.sendMessage({
        type: "error",
        message: noMediaModelSelectedMessage(mode),
        thread_id: threadId
      });
      return;
    }

    if (!prompt) {
      await this.sendMessage({
        type: "error",
        message: "Please enter a prompt",
        thread_id: threadId
      });
      return;
    }

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    // Entity mentions in the prompt (`entity://<id>`, written by @-mention
    // pickers) expand against the library here, exactly as the generate_media
    // RPC expands them: name inline, descriptor into a Consistency references
    // block, reference image routed into the generation inputs below. A
    // mention that resolves to no entity drops.
    const { prompt: expandedPrompt, referenceImages } =
      await expandEntitiesForGeneration(prompt, this.entityRefResolver(userId));
    const entityImageBytes = await this.resolveEntityReferenceImages(
      userId,
      referenceImages
    );

    const provider = await this.resolveProvider(providerId, userId);
    // Wire up progress forwarding so provider.emitMessage() reaches the client.
    provider.setMessageEmitter((msg) => {
      this.sendDetached(msg as Record<string, unknown>);
    });

    // Store generated media as a proper Asset record and return the
    // asset ID.  The DB message stores only `asset_id` — URLs are
    // resolved at serve time by resolveContentUrls / sendMessage.
    const storeMediaAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const asset = new Asset({
        user_id: userId,
        workflow_id: workflowId ?? null,
        name: `${mode}_${Date.now()}`,
        content_type: contentType,
        // Home, the same folder an upload lands in. A null parent is
        // unreachable from the folder the asset browser opens on.
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

    try {
      if (mode === "image") {
        const variations = Math.max(
          1,
          Math.min(Number(mediaGeneration.variations ?? 1), 8)
        );
        const width = isNumber(mediaGeneration.width)
          ? mediaGeneration.width
          : undefined;
        const height = isNumber(mediaGeneration.height)
          ? mediaGeneration.height
          : undefined;
        const imageModel: ProviderImageModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: TextToImageParams = {
          model: imageModel,
          prompt: expandedPrompt,
          width,
          height,
          signal
        };

        // Surface a progress chunk so the UI can show the request flight
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
          return;
        // A mentioned entity carries a reference image: the generation becomes
        // an edit against those images, mirroring the generate_media RPC.
        const imageBytesList =
          entityImageBytes.length > 0
            ? await provider.imageToImages(
                entityImageBytes,
                {
                  model: imageModel,
                  prompt: expandedPrompt,
                  targetWidth: width ?? null,
                  targetHeight: height ?? null,
                  signal
                },
                variations
              )
            : await provider.textToImages(params, variations);
        if (cancelled()) return;
        const imageContents: Array<Record<string, unknown>> = [];
        for (const bytes of imageBytesList) {
          // Per-variation: a cancel partway through must not keep persisting.
          if (cancelled()) return;
          const mimeType = detectImageMime(bytes);
          const assetId = await storeMediaAsset(
            bytes,
            mimeType,
            IMAGE_MIME_TO_EXT[mimeType] ?? "png"
          );
          imageContents.push({
            type: "image_url",
            image: { type: "image", asset_id: assetId, mimeType }
          });
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: imageContents,
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "video") {
        const aspectRatio = isString(mediaGeneration.aspect_ratio)
          ? (mediaGeneration.aspect_ratio as string)
          : null;
        const resolution = isString(mediaGeneration.resolution)
          ? (mediaGeneration.resolution as string)
          : null;
        const duration = isNumber(mediaGeneration.duration)
          ? (mediaGeneration.duration as number)
          : null;
        const videoModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        // If the user referenced/attached an image, they want it animated:
        // route to image-to-video so the image actually reaches the provider.
        // Many "video" models (e.g. fal-ai/stable-video) in fact require an
        // image and reject a text-only request with an opaque 422.
        const sourceBytes = await this.resolveSourceImageBytes(
          data,
          mediaGeneration,
          userId
        );
        let bytes: Uint8Array;
        if (sourceBytes && sourceBytes.length > 0) {
          const i2vParams: ImageToVideoParams = {
            model: videoModel,
            prompt: expandedPrompt,
            aspectRatio,
            resolution,
            durationSeconds: duration,
            numInferenceSteps: null,
            signal
          };
          bytes = await provider.imageToVideo([sourceBytes], i2vParams);
        } else {
          const params: TextToVideoParams = {
            model: videoModel,
            prompt: expandedPrompt,
            aspectRatio,
            resolution,
            durationSeconds: duration,
            signal
          };
          bytes = await provider.textToVideo(params);
        }
        if (cancelled()) return;
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration: duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "audio") {
        const voice = isString(mediaGeneration.voice)
          ? (mediaGeneration.voice as string)
          : undefined;
        const speed = isNumber(mediaGeneration.speed)
          ? (mediaGeneration.speed as number)
          : 1.0;
        const requestedFormatRaw = isString(mediaGeneration.audio_format)
          ? (mediaGeneration.audio_format as string).toLowerCase()
          : null;
        const supportedFormats = new Set([
          "mp3",
          "wav",
          "pcm",
          "opus",
          "flac",
          "aac"
        ]);
        const requestedFormat =
          requestedFormatRaw && supportedFormats.has(requestedFormatRaw)
            ? requestedFormatRaw
            : null;
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        let assetId: string;
        let audioMimeType: string;

        // Some providers (e.g. HuggingFace, OpenAI) can return fully-encoded
        // audio. Prefer that path when available and honor the requested
        // container when the provider supports it.
        const encoded = await provider.textToSpeechEncoded({
          text: expandedPrompt,
          model: modelId,
          voice,
          speed,
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
          if (
            requestedFormat &&
            requestedFormat !== ext &&
            requestedFormat !== "pcm"
          ) {
            log.warn(
              "Requested audio_format not supported by provider; returning native format",
              {
                providerId,
                modelId,
                requestedFormat,
                returnedMime: encoded.mimeType
              }
            );
          }
          if (cancelled()) return;
          assetId = await storeMediaAsset(encoded.data, encoded.mimeType, ext);
          audioMimeType = encoded.mimeType;
        } else {
          // Streaming PCM path (OpenAI, Gemini, etc.)
          const pcmChunks: Uint8Array[] = [];
          let totalBytes = 0;
          let chunkSampleRate = 24000;
          for await (const chunk of provider.textToSpeech({
            text: expandedPrompt,
            model: modelId,
            voice,
            speed,
            audioFormat: requestedFormat ?? undefined
          })) {
            if (cancelled()) return;
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
            // Return raw PCM Int16 bytes (no container).
            if (cancelled()) return;
            assetId = await storeMediaAsset(merged, "audio/pcm", "pcm");
            audioMimeType = "audio/pcm";
          } else {
            if (
              requestedFormat &&
              requestedFormat !== "wav" &&
              requestedFormat !== "pcm"
            ) {
              log.warn(
                "Requested audio_format cannot be produced from streaming PCM; falling back to WAV",
                { providerId, modelId, requestedFormat }
              );
            }
            // Wrap raw PCM Int16 in a WAV container so browsers can play it.
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

            if (cancelled()) return;
            assetId = await storeMediaAsset(wav, "audio/wav", "wav");
            audioMimeType = "audio/wav";
          }
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "audio",
              audio: {
                type: "audio",
                asset_id: assetId,
                mimeType: audioMimeType
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "image_edit" || mode === "image_to_video") {
        // Resolve the source image from either the message content (most
        // common path: user dropped an image into the composer) or from the
        // explicit `source_asset_id` echo on the media_generation payload.
        const sourceBytes = await this.resolveSourceImageBytes(
          data,
          mediaGeneration,
          userId
        );
        // A zero-length buffer (e.g. a storage read that resolved but came
        // back empty) is truthy — without the length check it sails past this
        // guard, then silently drops out of `attachAssets`'s image field
        // downstream, so fal gets a request with no image at all and rejects
        // it with an opaque 422 instead of the friendly error below.
        if (!sourceBytes || sourceBytes.length === 0) {
          await this.sendMessage({
            type: "error",
            message:
              "A source image is required — drop or attach an image first",
            thread_id: threadId
          });
          return;
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        if (mode === "image_edit") {
          const variations = Math.max(
            1,
            Math.min(Number(mediaGeneration.variations ?? 1), 8)
          );
          const targetWidth = isNumber(mediaGeneration.width)
            ? (mediaGeneration.width as number)
            : undefined;
          const targetHeight = isNumber(mediaGeneration.height)
            ? (mediaGeneration.height as number)
            : undefined;
          const strength = isNumber(mediaGeneration.strength)
            ? (mediaGeneration.strength as number)
            : undefined;
          const numInferenceSteps = isNumber(
            mediaGeneration.num_inference_steps
          )
            ? (mediaGeneration.num_inference_steps as number)
            : undefined;
          const editModel: ProviderImageModel = {
            id: modelId,
            name: modelId,
            provider: providerId
          };
          const params: ImageToImageParams = {
            model: editModel,
            prompt: expandedPrompt,
            targetWidth: targetWidth ?? null,
            targetHeight: targetHeight ?? null,
            strength: strength ?? null,
            numInferenceSteps: numInferenceSteps ?? null,
            signal
          };
          if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
            return;
          const imageBytesList = await provider.imageToImages(
            [sourceBytes, ...entityImageBytes],
            params,
            variations
          );
          if (cancelled()) return;
          const imageContents: Array<Record<string, unknown>> = [];
          for (const bytes of imageBytesList) {
            // Per-variation: a cancel partway through must not keep persisting.
            if (cancelled()) return;
            const mimeType = detectImageMime(bytes);
            const assetId = await storeMediaAsset(
              bytes,
              mimeType,
              IMAGE_MIME_TO_EXT[mimeType] ?? "png"
            );
            imageContents.push({
              type: "image_url",
              image: {
                type: "image",
                asset_id: assetId,
                mimeType
              }
            });
          }
          await this.sendMessage({
            type: "chunk",
            thread_id: threadId,
            content: "",
            done: true
          });
          const assistantMsgData: Record<string, unknown> = {
            type: "message",
            role: "assistant",
            content: imageContents,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model: modelId,
            media_generation: mediaGeneration
          };
          // Re-check: cancellation may have landed while the asset was persisting.
          if (cancelled()) return;
          await this.saveMessageToDb(assistantMsgData);
          await this.sendMessage(assistantMsgData);
          return;
        }

        // image_to_video
        const aspectRatio = isString(mediaGeneration.aspect_ratio)
          ? (mediaGeneration.aspect_ratio as string)
          : null;
        const resolution = isString(mediaGeneration.resolution)
          ? (mediaGeneration.resolution as string)
          : null;
        const duration = isNumber(mediaGeneration.duration)
          ? (mediaGeneration.duration as number)
          : null;
        const numInferenceSteps = isNumber(mediaGeneration.num_inference_steps)
          ? (mediaGeneration.num_inference_steps as number)
          : null;
        const i2vModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: ImageToVideoParams = {
          model: i2vModel,
          prompt: expandedPrompt,
          aspectRatio,
          resolution,
          durationSeconds: duration,
          numInferenceSteps,
          signal
        };
        const bytes = await provider.imageToVideo([sourceBytes], params);
        if (cancelled()) return;
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });
        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      // Modes not yet implemented on the backend — fall back to an informative
      // error so the client can render the unsupported state cleanly.
      await this.sendMessage({
        type: "error",
        message: `Media generation mode "${mode}" is not yet supported`,
        thread_id: threadId
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Media generation error", { threadId, mode, error: errMsg });
      await this.sendMessage({
        type: "error",
        message: `Generation failed: ${errMsg}`,
        thread_id: threadId
      });
    }
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

  private async handleWorkflowMessage(
    data: Record<string, unknown>,
    requestSeq?: number,
    signal?: AbortSignal
  ): Promise<void> {
    const threadId = isString(data.thread_id) ? data.thread_id : "";
    const workflowId = isString(data.workflow_id) ? data.workflow_id : null;
    const providerId = isString(data.provider)
      ? data.provider
      : this.defaultProvider;
    const model = isString(data.model) ? data.model : this.defaultModel;
    const userId = this.userId ?? "1";
    const jobId = randomUUID();

    log.info("Workflow message", { threadId, workflowId, jobId });

    // Assigned once the run's abort listener is registered; released in the
    // finally so a completed workflow's listener can't cancel() a runner that
    // already finished when a later Stop/disconnect fires the same signal.
    let releaseAbortListener: (() => void) | null = null;

    try {
      if (!workflowId) {
        throw new Error("workflow_id is required for workflow processing");
      }

      // Load workflow from DB
      const workflow = await Workflow.find(userId, workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const rawGraph = workflow.graph as {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      };

      // Detect message input names from raw graph (reads node.data) — matches Python
      const { messageName, messagesName } =
        this.detectMessageInputNames(rawGraph);
      const graph = await this.hydrateGraph(rawGraph);

      if (this.beforeRunJob) {
        await this.beforeRunJob(graph);
      }
      const messageInputName =
        (isString(data.workflow_message_input_name)
          ? data.workflow_message_input_name
          : null) ??
        messageName ??
        "message";
      const messagesInputName =
        (isString(data.workflow_messages_input_name)
          ? data.workflow_messages_input_name
          : null) ??
        messagesName ??
        "messages";

      // Build chat history for params — matches Python
      const [dbMessages] = await Message.paginate(threadId, { limit: 1000 });
      const chatHistorySerialized = dbMessages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        thread_id: m.thread_id
      }));

      // Serialize current message
      const currentMessage = {
        role: isString(data.role) ? data.role : "user",
        content: data.content,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };

      // Prepare params — matches Python's WorkflowMessageProcessor
      const params: Record<string, unknown> = {
        [messageInputName]: currentMessage,
        [messagesInputName]: [...chatHistorySerialized, currentMessage]
      };
      if (isObjectLike(data.params)) {
        Object.assign(params, data.params as Record<string, unknown>);
      }

      // If chat workflow, add legacy params — matches Python's ChatWorkflowMessageProcessor
      if (workflow.run_mode === "chat") {
        const legacyChatInput = chatHistorySerialized.map((m) => ({
          role: m.role,
          content: this.extractTextContent(m.content),
          created_at: m.created_at
        }));
        params["chat_input"] = legacyChatInput;
        if (messagesInputName !== "messages") {
          params["messages"] = legacyChatInput;
        }
      }

      // Create processing context
      const workspace = this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : null;
      const context = createRuntimeContext({
        jobId,
        workflowId,
        userId,
        workspace,
        assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
      });

      // Expose executor/node-type resolution for sub-workflow nodes
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

      // Create and run workflow (A5: via the ExecutionSession facade — see
      // the identical note in `startJobInner`).
      const session = await ExecutionSession.create({
        graph: toRawGraphInput(graph),
        resolveExecutor: (node) =>
          this.resolveExecutor(
            node as { id: string; type: string; [key: string]: unknown }
          ),
        bridgeFactory: async () => null,
        jobLifecycleBridge: this.pythonBridge ?? null,
        jobId,
        workflowId,
        context,
        params,
        validateNode: this.validateNode
      });

      const active: ActiveJob = {
        jobId,
        workflowId,
        context,
        session,
        graph,
        finished: false,
        status: "running",
        requireTerminalResult: false,
        executionOptions: { ...DEFAULT_RUN_JOB_EXECUTION_OPTIONS },
        timings: {
          acceptedAt: performance.now(),
          queueMs: 0,
          graphLoadedMs: 0,
          graphHydratedMs: 0,
          preRunMs: 0,
          persistenceMs: 0,
          kernelStartedAt: performance.now()
        }
      };
      this.activeJobs.set(jobId, active);

      // Persist job to DB (best-effort)
      try {
        await Job.create({
          id: jobId,
          workflow_id: workflowId,
          user_id: userId,
          status: "running",
          params,
          graph
        });
      } catch (error) {
        this.logError("workflow job persistence failed", error);
      }

      // The run already started inside `ExecutionSession.create()` above.
      const executePromise = session.result;

      // Stream events, collect output_update results
      const result: Record<string, unknown> = {};
      await this.sendMessage({
        type: "job_update",
        status: "running",
        job_id: jobId,
        workflow_id: workflowId
      });

      let finalOutputs: Record<string, unknown[]> = {};
      const executionSettled = executePromise
        .then((r) => {
          active.status = r.status;
          active.error = r.error;
          finalOutputs = r.outputs ?? {};
        })
        .catch((err) => {
          active.status = "failed";
          active.error = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          active.finished = true;
        });
      const waitForActivity = createRelayActivityWaiter(
        active.context,
        executionSettled,
        signal
      );

      const nodeTypes = new Map<string, string>();
      const graphNodes = graph.nodes ?? [];
      for (const n of graphNodes) {
        if (n.id) {
          nodeTypes.set(String(n.id), isString(n.type) ? n.type : "");
        }
      }

      // A chat Stop / superseding message bumps chatRequestSeq. Unlike the
      // other chat handlers this one owns a workflow runner, so cancel it and
      // stop streaming when our turn is no longer current — otherwise the run
      // completes and delivers an assistant message after the user stopped.
      const superseded = (): boolean =>
        requestSeq !== undefined && requestSeq !== this.chatRequestSeq;

      // Cancel the moment Stop fires rather than waiting for the streaming loop
      // below to come back around — the run may be parked inside a long node.
      const onAbort = (): void => {
        try {
          active.session.cancel();
        } catch {
          // best-effort cancel
        }
      };
      if (signal?.aborted) {
        onAbort();
      } else if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
        releaseAbortListener = () =>
          signal.removeEventListener("abort", onAbort);
      }

      while (!active.finished || active.context.hasMessages()) {
        if (superseded()) {
          try {
            active.session.cancel();
          } catch {
            // best-effort cancel
          }
          active.status = "cancelled";
          try {
            const job = await Job.get(jobId);
            if (job && job.status !== "cancelled") {
              job.markCancelled();
              await job.save();
            }
          } catch (err) {
            this.logError("workflow chat cancellation persistence failed", err);
          }
          this.activeJobs.delete(jobId);
          return;
        }
        while (active.context.hasMessages()) {
          const msg = active.context.popMessage();
          if (!msg) break;
          const outbound: Record<string, unknown> = { ...msg };
          outbound.job_id ??= jobId;
          outbound.workflow_id ??= workflowId;

          // Every message, not just node updates: a `prediction` is where
          // ledger-priced generation spend (Replicate, Gemini, OpenAI, …)
          // reports itself.
          this._handleNodeProviderCost(active, outbound);

          if (
            outbound.type === "node_update" ||
            outbound.type === "output_update"
          ) {
            const nodeId = String(outbound.node_id ?? "");
            const nodeType = nodeTypes.get(nodeId) ?? "";

            // Capture output_update values for the response message
            if (outbound.type === "output_update") {
              if (nodeType.includes("Output")) {
                const nodeName = isString(outbound.node_name)
                  ? outbound.node_name
                  : nodeType;
                result[nodeName] = outbound.value;
              } else {
                continue; // Skip non-output node output_updates
              }
            }
          }

          await this.sendMessage(outbound);
        }
        if (!active.finished) {
          await waitForActivity();
        }
      }

      // Collect any outputs from the runner result — only Output-type nodes
      // The kernel considers all leaf nodes as "output nodes", but for the
      // response message we only want nodes whose type includes "Output"
      // (matching Python's WorkflowMessageProcessor behavior).
      for (const [nodeType, values] of Object.entries(finalOutputs)) {
        if (!nodeType.includes("Output")) continue;
        if (!result[nodeType] && Array.isArray(values) && values.length > 0) {
          result[nodeType] = values.length === 1 ? values[0] : values;
        }
      }

      // Send terminal job_update if not already sent
      await this.sendMessage({
        type: "job_update",
        status: active.status,
        job_id: jobId,
        workflow_id: workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });

      // Persist final job status
      try {
        const job = (await Job.get(jobId)) as Job | null;
        // Don't overwrite a cancelled row (DB-only tRPC cancel) when the
        // in-flight run finishes — keep the cancellation authoritative.
        if (job) {
          if (job.status !== "cancelled") {
            if (active.status === "completed") job.markCompleted();
            else if (active.status === "failed")
              job.markFailed(active.error ?? "Unknown error");
            else if (active.status === "cancelled") job.markCancelled();
          }
          job.cost = this.runMeasuredCost(active);
          await job.save();
        }
      } catch (error) {
        this.logError("workflow job persistence (final) failed", error);
      }

      // Signal completion — done chunk with job_id + workflow_id
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Create response message from workflow outputs — matches Python's _create_response_message
      const responseContent = this.createWorkflowResponseContent(result);
      const responseMsg = {
        type: "message",
        role: "assistant",
        content: responseContent,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model,
        job_id: jobId
      } satisfies Record<string, unknown>;
      await this.saveMessageToDb(responseMsg);
      await this.sendMessage(responseMsg);

      log.debug("Workflow message complete", { threadId, workflowId, jobId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Workflow message error", {
        threadId,
        workflowId,
        error: errMsg
      });

      await this.sendMessage({
        type: "error",
        message: `Error processing workflow: ${errMsg}`,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Send done chunk even on error — matches Python
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });
    } finally {
      releaseAbortListener?.();
      // Always release the concurrency slot and drain the queue, even if
      // streaming/persist/sendMessage threw above. Otherwise a mid-stream
      // socket-write failure would orphan the ActiveJob and permanently shrink
      // the MAX_CONCURRENT_JOBS cap (run_job then queues forever).
      this.activeJobs.delete(jobId);
      this.drainQueue();
    }
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

  /**
   * The direct-generation entry points the RPC commands call. Thin delegations
   * while `handleCommand` still lives here; they go away with the switch.
   */
  private runDirectTextGeneration(
    req: DirectTextGenerationRequest
  ): Promise<{ text: string; data: Record<string, unknown> | null }> {
    return this.inference.runDirectTextGeneration(req);
  }

  private runDirectMediaGeneration(
    req: DirectMediaGenerationRequest
  ): Promise<{ asset_ids: string[] }> {
    return this.inference.runDirectMediaGeneration(req);
  }

  private runDirectTranscription(req: {
    provider: string;
    model: string;
    assetId: string;
    language?: string;
  }): Promise<{
    text: string;
    words: Array<{ word: string; startMs: number; endMs: number }>;
  }> {
    return this.inference.runDirectTranscription(req);
  }

  /**
   * Entity-mention resolution for the chat media-generation path. The
   * direct-generation surfaces call the same functions in `session/inference`
   * directly; these stay as methods until the chat region moves too.
   */
  private entityRefResolver(userId: string): ReturnType<
    typeof entityRefResolver
  > {
    return entityRefResolver(userId);
  }

  private resolveEntityReferenceImages(
    userId: string,
    refs: PromptAssetRef[]
  ): Promise<Uint8Array[]> {
    return resolveEntityReferenceImages(userId, refs);
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
        const liveMode = this.chatTurnPermissionMode.get(threadId);
        if (liveMode) {
          liveMode.value = mode;
        }
        if (mode === "auto") {
          this.approvalBridge.resolveScope(threadId, { decision: "allow" });
        }
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
        this.currentTask = this.handleChatMessage(data, seq, signal)
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
        this.currentTask = this.inference
          .handleInference(data, seq, signal)
          .finally(() => this.endChatTurn(controller));
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
        this.chatRequestSeq += 1;
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
          this.toolBridge.resolveResult(toolCallId, data);
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
