import { getSetting } from "./settings-registry.js";
import { ConfiguredProviderCache } from "./configured-providers.js";
import { JobConcurrencyQueue } from "./job-queue.js";
import { packWebSocketMessage, unpackWebSocketMessage } from "./messagepack.js";
import { createLogger, getByteLimitEnv } from "@nodetool-ai/config";
import { getAssetAdapter } from "./lib/storage.js";
import {
  isNonEmptyString,
  isObjectLike,
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
import { resolveContentUrls } from "./resolve-media-urls.js";
import {
  type NodeExecutor,
  type NodeTypeResolver,
  type NodeValidator
} from "@nodetool-ai/kernel";
import type {
  ChatTurnExecutionHooks,
  ChatTurnSession
} from "./chat-turn-registry.js";
import type { JobRunSession } from "./job-run-registry.js";
import {
  Asset,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  type DBModel
} from "@nodetool-ai/models";
import type {
  MessageContent,
  BaseProvider,
  ProcessingContext,
  PromptAssetRef
} from "@nodetool-ai/runtime";
import {
  ProcessingContext as RuntimeProcessingContext,
  fetchExternalMedia,
  type Workspace
} from "@nodetool-ai/runtime";
import type {
  HydratedGraphData,
  NodeDescriptor
} from "@nodetool-ai/protocol";
import type {
  UnifiedCommandType,
  WebSocketCommandEnvelope,
  WebSocketMode
} from "@nodetool-ai/protocol";
import {
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
import type { HttpApiOptions } from "./http-api.js";
import { retrieveAssetBytes } from "./lib/asset-paths.js";
import type { AppSessionScope } from "./lib/app-session-scope.js";
import type {
  FrontendRendererRegistry,
  FrontendRendererToolCall,
  FrontendRendererToolResult
} from "./frontend-renderer-registry.js";
import {
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
import { serverModelInterfaces } from "./session/model-interfaces.js";
import {
  formatSanitizedError,
  type JsonSafeValue
} from "./session/sanitize.js";
import {
  DirectInferenceHandler,
  entityRefResolver,
  estimateDirectTextSpend,
  resolveEntityReferenceImages,
  type DirectMediaGenerationRequest
} from "./session/inference.js";
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
  estimateDirectTextSpend,
  focusedUiToolNames,
  normalizeToolCallName,
  primaryTextOutputName,
  serverModelInterfaces,
  unroutableToolMessage
};
import {
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
import { ChatTurnHandler } from "./session/chat-turn.js";
import { CommandRouter } from "./session/commands.js";

const log = createLogger("nodetool.websocket.runner");

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

export interface WebSocketClientSessionOptions {
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


export class WebSocketClientSession implements ClientSession {
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

  /**
   * Assigned once, in the constructor. `readonly` because JobExecutionManager
   * snapshots both by value into its `defaults`, and a later reassignment here
   * would silently leave the manager on the old pair.
   */
  private readonly defaultModel: string;
  private readonly defaultProvider: string;
  readonly resolveExecutor: WebSocketClientSessionOptions["resolveExecutor"];
  readonly resolveNodeType?: WebSocketClientSessionOptions["resolveNodeType"];
  readonly resolveProvider?: WebSocketClientSessionOptions["resolveProvider"];
  private getSystemStats: () => Record<string, unknown>;
  private systemStatsEnabled: boolean;
  readonly workspaceResolver?: WebSocketClientSessionOptions["workspaceResolver"];
  readonly getNodeMetadata?: WebSocketClientSessionOptions["getNodeMetadata"];
  readonly validateNode?: WebSocketClientSessionOptions["validateNode"];
  readonly nodeRegistry?: NodeRegistry;
  readonly pythonBridge?: PythonBridge;
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
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private statsPrimeTimer: NodeJS.Timeout | null = null;
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
  /** This connection's chat turns: state, permissions, and the turn loop. */
  private readonly chat: ChatTurnHandler;
  /** The client's command surface: one dispatch table over the wire commands. */
  private readonly commands: CommandRouter;
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

  /** Abort the in-flight turn, if any. Idempotent. */
  private cancelChatTurn(): void {
    this.chat.cancel();
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

  sendDetached(message: Record<string, unknown>): void {
    void this.sendMessage(message).catch((err) => {
      this.logError("detached websocket send failed", err);
    });
  }

  constructor(options: WebSocketClientSessionOptions) {
    this.userId = options.userId ?? null;
    this.authToken = options.authToken ?? null;
    this.appSession = options.appSession ?? null;
    this.defaultModel = options.defaultModel ?? "gpt-oss:20b";
    this.defaultProvider = options.defaultProvider ?? "ollama";
    this.resolveExecutor = options.resolveExecutor;
    this.resolveNodeType = options.resolveNodeType;
    this.resolveProvider = options.resolveProvider;
    this.workspaceResolver = options.workspaceResolver;
    this.getNodeMetadata = options.getNodeMetadata;
    this.validateNode = options.validateNode;
    this.nodeRegistry = options.nodeRegistry;
    this.pythonBridge = options.pythonBridge;
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
        WebSocketClientSession.DEFAULT_MAX_CONCURRENT_JOBS,
      defaultMaxConcurrentRunsPerWorkflow:
        WebSocketClientSession.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW,
      sendToSocket: (message) => this.sendToSocket(message),
      isSocketConnected: () => this.isRendererConnected(),
      attachPlanApproval: (context, jobId) =>
        this.attachPlanApproval(context, jobId),
      defaults: {
        provider: this.defaultProvider,
        model: this.defaultModel
      }
    });
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
    this.commands = new CommandRouter({
      session: this,
      // The job region as this connection exposes it: the four commands the
      // job suites drive through the runner keep going through it, so a spy
      // on `runner.runJob` still intercepts a `run_job` command.
      jobs: {
        runJob: (req) => this.runJob(req),
        reconnectJob: (jobId, workflowId, lastSeq) =>
          this.reconnectJob(jobId, workflowId, lastSeq),
        cancelJob: (jobId, workflowId) => this.cancelJob(jobId, workflowId),
        getStatus: (jobId) => this.getStatus(jobId),
        resolveJobControl: (jobId) => this.jobs.resolveJobControl(jobId),
        stopJob: (jobId) => this.jobs.stopJob(jobId),
        activeJobIds: () => this.jobs.activeJobIds()
      },
      chat: this.chat,
      inference: this.inference,
      // What a command does to the connection itself: the socket, the wire
      // mode, the RPC abort set, the tool bridges, and the chat-turn session
      // bookkeeping the frame router reads. All host state, reached through
      // this adapter rather than owned by the router.
      host: {
        sendToSocket: (message) => this.sendToSocket(message),
        setMode: (mode) => {
          this.mode = mode;
        },
        clearModels: () => this.clearModels(),
        cancelRpcCalls: () => this.cancelRpcCalls(),
        cancelToolScope: (scope) => {
          this.toolBridge.cancelScope(scope);
          this.approvalBridge.cancelScope(scope);
        },
        chatTurnHooks: () => this.buildChatTurnHooks(),
        chatDeliveryTarget: this.chatDeliveryTarget,
        getChatTurnSession: () => this.chatTurnSession,
        setChatTurnSession: (session) => {
          this.chatTurnSession = session;
        },
        adoptSession: (threadId, session) => {
          this.adoptedSessions.set(threadId, session);
        },
        forgetAdoptedSession: (threadId) => {
          this.adoptedSessions.delete(threadId);
        }
      },
      defaults: {
        provider: this.defaultProvider,
        model: this.defaultModel
      },
      apiOptions: options.apiOptions,
      getPythonBridgeReady: options.getPythonBridgeReady
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
      WebSocketClientSession.DEFAULT_MAX_CONCURRENT_JOBS,
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
      WebSocketClientSession.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW,
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
      now - cached.at < WebSocketClientSession.MAX_CONCURRENT_JOBS_TTL_MS
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

  /**
   * The direct-generation entry point the cost-row suite drives directly.
   * Transitional: the implementation lives on {@link DirectInferenceHandler},
   * and the RPC commands call it there through {@link CommandRouter}.
   */
  runDirectMediaGeneration(
    req: DirectMediaGenerationRequest
  ): Promise<{ asset_ids: string[] }> {
    return this.inference.runDirectMediaGeneration(req);
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
   * Transitional: the lifecycle suite drives the RPC frame through the runner.
   * The implementation is {@link CommandRouter.runRpc}; this adapts the wire
   * envelope to it and goes when the suite moves onto the router.
   */
  runRpc<TResult>(
    command: WebSocketCommandEnvelope,
    fn: () => Promise<TResult>
  ): Promise<Record<string, unknown> | null> {
    return this.commands.runRpc(command.command, command.request_id, fn);
  }

  async handleCommand(
    command: WebSocketCommandEnvelope
  ): Promise<Record<string, unknown> | null> {
    return this.commands.handle(
      command.command,
      command.data ?? {},
      command.request_id
    );
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
