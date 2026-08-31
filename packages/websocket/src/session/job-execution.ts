/**
 * Everything between "run_job arrived" and "terminal status persisted": the
 * admission gates, the concurrency queue, run start-up, the message stream,
 * reconnect, cancel, and terminal-status persistence.
 *
 * Extracted from `WebSocketClientSession` (T3 of
 * docs/websocket-runner-refactor-plan.md). It knows the connection only
 * through {@link ClientSession}; what the seam does not carry arrives as
 * {@link JobExecutionDeps}.
 */
import { randomUUID } from "node:crypto";
import { ApiErrorCode } from "../error-codes.js";
import { admitSpend, releaseSpend, reserveSpend } from "../credit-gate.js";
import { JobConcurrencyQueue } from "../job-queue.js";
import {
  isBoolean,
  isFiniteNumber,
  isFunctionValue,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../lib/wire-values.js";
import { Graph, withExplicitNodeFlags } from "@nodetool-ai/kernel";
import {
  ExecutionSession,
  isExecutionPreflightError,
  isUnitBilledCapability,
  priceGeneration,
  toRawGraphInput
} from "@nodetool-ai/execution";
import { createRunSupervisor } from "../run-supervisor.js";
import {
  jobRunRegistry,
  type JobRunExecutionHooks,
  type JobRunSession
} from "../job-run-registry.js";
import {
  Application,
  Asset,
  Job,
  listApplicationVersions,
  invocationIdInUse,
  releasedApplicationRelease,
  releasedApplicationVersion,
  reserveInvocation,
  settleInvocation,
  Workflow
} from "@nodetool-ai/models";
import { getInstanceId } from "../lib/instance-id.js";
import { requestRemoteJobCancel } from "../job-control.js";
import {
  estimateWorkflowCost,
  nodeExpectedQuantity,
  type WorkflowCostEstimateDetail
} from "@nodetool-ai/node-sdk/cost-estimate";
import { extractPricingParams } from "@nodetool-ai/node-sdk/pricing-params";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { applicationReleaseResponse } from "@nodetool-ai/protocol/api-schemas/applications.js";
import type {
  GraphData,
  HydratedGraphData,
  NodeDescriptor,
  ProviderCost,
  SupervisorRunOptions
} from "@nodetool-ai/protocol";
import { confineRunRequest, isRunRefusal } from "../lib/app-session-scope.js";
import { releaseBlockedReason } from "../lib/app-deployment-service.js";
import { autoSaveAssets, primaryTextOutputName } from "./asset-autosave.js";
import { createRuntimeContext } from "./model-interfaces.js";
import { formatSanitizedError, sanitizeLargeText } from "./sanitize.js";
import { createLogger } from "@nodetool-ai/config";
import type { ClientSession } from "./client-session.js";

const log = createLogger("nodetool.websocket.runner");

const TERMINAL_JOB_STATUSES = ["completed", "failed", "cancelled", "error"];

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

export interface SdkExecutionCapacitySnapshot {
  inFlightJobs: number;
  maxConcurrentJobs: number;
  queuedJobs: number;
  workflowInFlightJobs: number;
  maxConcurrentRunsForWorkflow: number;
  likelyQueued: boolean;
}

/** A workflow graph as it arrives on the wire, before hydration. */
export type RawGraphData = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

/** The shape `crypto.randomUUID()` produces, on either side of the wire. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** What {@link JobExecutionManager} needs from the host beyond {@link ClientSession}. */
export interface JobExecutionDeps {
  /** Host hook run against the hydrated graph before the kernel starts. */
  beforeRunJob?: (graph: {
    nodes: ReadonlyArray<NodeDescriptor>;
  }) => Promise<void>;
  /** The per-client concurrency cap, resolved from settings by the host. */
  getMaxConcurrentJobs: () => Promise<number>;
  /** The per-workflow cap for runs that opt into concurrency. */
  getMaxConcurrentRunsPerWorkflow: () => Promise<number>;
  /** Cap used when the settings read fails; `drainQueue` must not block on it. */
  defaultMaxConcurrentJobs: number;
  /** Per-workflow cap used when the settings read fails. */
  defaultMaxConcurrentRunsPerWorkflow: number;
  /**
   * Raw socket delivery, bypassing the run-session interception `send` does.
   * A run session delivers into it, so routing back through `send` would loop.
   */
  sendToSocket: (message: Record<string, unknown>) => Promise<void>;
  /** Whether the socket is still usable — a dropped one settles the run instead. */
  isSocketConnected: () => boolean;
  /** Chat's plan-approval hook, attached to a run's context. */
  attachPlanApproval: (context: ProcessingContext, jobId: string) => void;
  /** Provider/model this connection falls back to. */
  defaults: { provider: string; model: string };
}

export class JobExecutionManager {
  constructor(
    private readonly session: ClientSession,
    private readonly deps: JobExecutionDeps
  ) {}

  /**
   * The runs in flight on this connection. Private since T8's D2: chat's runs
   * and the suites that stage one go through the methods below, so every
   * mutation of the connection's slot accounting happens in this file.
   */
  private activeJobs = new Map<string, ActiveJob>();
  /**
   * Runs that arrived while {@link MAX_CONCURRENT_JOBS} runs were already in
   * flight. They start automatically (FIFO) as active jobs finish.
   */
  jobQueue = new JobConcurrencyQueue<RunJobRequest>();
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

  /** Ids of the runs in flight on this connection. Read for diagnostics. */
  activeJobIds(): string[] {
    return [...this.activeJobs.keys()];
  }

  /**
   * Register a run against this connection's slots. A chat turn that starts a
   * workflow shares the connection's concurrency accounting, so its run is
   * registered here rather than in a map of chat's own.
   */
  registerJob(jobId: string, active: ActiveJob): void {
    this.activeJobs.set(jobId, active);
  }

  /** Drop a run without draining the queue — the caller's `finally` does that. */
  dropJob(jobId: string): void {
    this.activeJobs.delete(jobId);
  }

  /** Drop a run and start whatever was queued behind it. */
  releaseJob(jobId: string): void {
    this.activeJobs.delete(jobId);
    this.drainQueue();
  }

  /** The run registered under `jobId`, if it is still in flight. */
  getActiveJob(jobId: string): ActiveJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /** Whether a run is registered under `jobId`. */
  hasActiveJob(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }

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
   * from the host's chat delivery target so a job session's `detach(target)`
   * can never be confused with a chat session's — both guard on identity.
   */
  readonly jobDeliveryTarget = {
    deliver: (message: Record<string, unknown>): Promise<void> =>
      this.deps.sendToSocket(message)
  };

  inferOutputType(value: unknown): string {
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
        await this.session.send({
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

  /**
   * The resilient session a frame's `job_id` belongs to: one this connection
   * started, or one it adopted via `reconnect_job`.
   */
  resolveJobSession(jobId: unknown): JobRunSession | null {
    if (!isNonEmptyString(jobId)) return null;
    const active = this.activeJobs.get(jobId);
    if (active?.runSession) return active.runSession;
    if (!this.adoptedJobIds.has(jobId)) return null;
    return jobRunRegistry.get(this.session.userId ?? "1", jobId);
  }

  /**
   * Where a client command for `jobId` should act: this connection's own
   * ExecutionSession, or — for a run this client reconnected to — the hooks
   * of the session whose runner still owns it. Null when nothing is running.
   */
  resolveJobControl(
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
    const registered = jobRunRegistry.get(this.session.userId ?? "1", jobId);
    if (registered && registered.status === "running") {
      return { hooks: registered.hooks, workflowId: registered.workflowId };
    }
    return null;
  }

  /**
   * Normalize a raw graph so that the kernel's NodeDescriptor contract is met.
   * The web-UI / Python serialisation stores node properties under `data`;
   * the kernel expects them under `properties`.
   */
  normalizeGraph(graph: RawGraphData): RawGraphData {
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

  async hydrateGraph(graph: RawGraphData): Promise<HydratedGraphData> {
    const normalized = this.normalizeGraph(graph);
    if (!this.session.resolveNodeType) {
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
      resolver: this.session.resolveNodeType
    });
    return {
      nodes: [...hydrated.nodes],
      edges: [...hydrated.edges]
    };
  }

  getRawGraph(req: RunJobRequest):
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
    if (req.workflow_id && this.session.userId) {
      const userId = this.session.userId;
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
  async emitBeforeRunFailure(
    jobId: string,
    workflowId: string | null,
    err: unknown,
    persistJob: boolean
  ): Promise<void> {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.session.logError("beforeRunJob failed", err);
    await this.session.send({
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
      this.session.logError(
        "beforeRunJob failure persistence failed",
        persistErr
      );
    }
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
  get inFlightJobCount(): number {
    let sessionless = 0;
    for (const job of this.activeJobs.values()) {
      if (!job.runSession) sessionless += 1;
    }
    return (
      this.startingJobs +
      jobRunRegistry.countRunning(this.session.userId ?? "1") +
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
  countActiveJobsForWorkflow(workflowId: string | null | undefined): number {
    if (!workflowId) {
      return 0;
    }
    let count = jobRunRegistry.countRunningForWorkflow(
      this.session.userId ?? "1",
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
      ? this.deps.getMaxConcurrentRunsPerWorkflow()
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
        this.deps.getMaxConcurrentJobs(),
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
      this.session.logError("run cost estimate failed", err);
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
    if (!nodes || !this.session.getNodeMetadata) return null;
    const priced = nodes.map((node) => ({
      id: String(node.id),
      type: String(node.type),
      data: (node.data ?? {}) as Record<string, unknown>
    }));
    return estimateWorkflowCost({
      nodes: priced,
      getMetadata: (nodeType: string) =>
        this.session.getNodeMetadata?.(nodeType),
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
      this.session.logError("nodetool spend estimate failed", err);
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
    this.session.sendDetached({
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
    const userId = this.session.userId ?? "1";
    // Authorization sits outside the try below, which swallows a ledger outage
    // on purpose. Metering fails open; ownership fails closed — a lookup this
    // never completed is not permission to bill the app it names.
    let owned = false;
    try {
      const application = await Application.findById(applicationId);
      owned = application?.user_id === userId;
    } catch (err) {
      this.session.logError("application ownership check failed", err);
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
        this.session.sendDetached({
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
          requireFiniteBudget: this.session.appSession !== null
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
      this.session.logError("application budget check failed", err);
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
    const decision = await admitSpend(this.session.userId, estimatedUsd);
    if (!decision.allowed) {
      return this.refuseRun(
        req,
        req.job_id,
        ApiErrorCode.BUDGET_EXCEEDED,
        decision.reason
      );
    }
    reserveSpend(this.session.userId ?? "1", req.job_id, estimatedUsd);
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
    const scope = this.session.appSession;
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
      ((await Job.get(requested)) !== null ||
        (await invocationIdInUse(requested)))
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
      this.session.userId ?? ""
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

  /**
   * Entry point for the "run_job" command. Starts the run immediately when the
   * client is under its concurrency cap, otherwise queues it (FIFO) and emits a
   * `queued` job update. Queued runs start automatically as active jobs finish.
   */
  async runJob(incoming: RunJobRequest): Promise<void> {
    const req = await this.confineAppSessionRun(incoming);
    if (!req) return;
    req._accepted_at_ms ??= performance.now();
    if (!(await this.admitApplicationRun(req))) return;
    if (!(await this.admitCreditRun(req))) return;
    const max = await this.deps.getMaxConcurrentJobs();
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
            user_id: resolveRunJobUserId(req.user_id, this.session.userId),
            status: "queued",
            name: req.job_name ?? "",
            params: req.params ?? {},
            graph: req.graph ?? { nodes: [], edges: [] }
          });
        }
      } catch (err) {
        this.session.logError("enqueue persistence failed", err);
      }
    }
    this.session.sendDetached({
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
  drainQueue(): void {
    void (async () => {
      const max = await this.deps
        .getMaxConcurrentJobs()
        .catch(() => this.deps.defaultMaxConcurrentJobs);
      const perWorkflowMax = await this.deps
        .getMaxConcurrentRunsPerWorkflow()
        .catch(() => this.deps.defaultMaxConcurrentRunsPerWorkflow);
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
          this.session.logError("startJob (from queue) failed", err);
          await this.session.send({
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
      this.session.sendDetached({
        type: "job_update",
        status: "queued",
        job_id: jobId,
        workflow_id: workflowId,
        queue_position: position,
        message: `Queued (#${position})`
      });
    }
  }

  async startJob(req: RunJobRequest): Promise<void> {
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
    const userId = resolveRunJobUserId(req.user_id, this.session.userId);
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
    if (this.deps.beforeRunJob) {
      try {
        await this.deps.beforeRunJob(graph);
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

    const workspace = this.session.workspaceResolver
      ? await this.session.workspaceResolver(workflowId ?? null, userId)
      : null;

    const context = createRuntimeContext({
      jobId,
      workflowId,
      userId,
      workspace,
      assetOutputMode: this.session.mode === "text" ? "data_uri" : "temp_url",
      persistOutputAssets: executionOptions.assetPersistence === "auto"
    });
    // Agents planning inside this run pause for user approval over this
    // socket before executing their plan.
    this.deps.attachPlanApproval(context, jobId);

    // Expose executor/node-type resolution on the context so that
    // sub-workflow nodes (WorkflowNode) can create child runners.
    context.setResolveExecutor((node) => this.session.resolveExecutor(node));
    if (this.session.resolveNodeType) {
      const resolverObj = isFunctionValue(this.session.resolveNodeType)
        ? { resolveNodeType: this.session.resolveNodeType }
        : this.session.resolveNodeType;
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
            this.session.sendDetached({
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
        this.session.logError("runJob persistence failed", error);
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
      defaultProvider: this.deps.defaults.provider,
      defaultModel: this.deps.defaults.model
    });

    const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
      graph: toRawGraphInput(graph),
      resolveExecutor: (node) =>
        this.session.resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      bridgeFactory: async () => null,
      // This runner owns a long-lived shared bridge, so `bridgeFactory` hands
      // the session nothing to close. The run boundary still has to reach that
      // bridge — pass it explicitly.
      jobLifecycleBridge: this.session.pythonBridge ?? null,
      jobId,
      workflowId,
      context,
      params: req.params ?? {},
      validateNode: this.session.validateNode
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
    // `this.session.userId ?? "1"`, and a run opened under an explicit differing
    // `req.user_id` would be unreachable — no replay, and a cancel that
    // reports the job as not found.
    const runSession = jobRunRegistry.open(
      this.session.userId ?? "1",
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
        this.session.logError("job stream task failed", error);
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
    const socketGone = !this.deps.isSocketConnected();
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
      this.session.logError("post-start cancellation check failed", error);
    }
  }

  async streamJobMessages(
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
      this.session.logError("job message streaming failed", error);
      active.finished = true;
      active.status = "failed";
      active.error = message;
      try {
        await this.session.send({
          type: "job_update",
          status: "failed",
          job_id: active.jobId,
          workflow_id: active.workflowId,
          error: message
        });
      } catch (sendError) {
        this.session.logError("terminal job_update send failed", sendError);
      }
      await this.persistTerminalJobStatus(active);
      await this.settleApplicationInvocation(active);
      releaseSpend(this.session.userId ?? "1", active.jobId);
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
      this.session.logError("job persistence (final status) failed", error);
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
      this.session.logError("application invocation settlement failed", error);
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
      await this.session.send({
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
      await this.session.send({
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
        this.session.logError("job execution failed", err);
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

          const meta = this.session.getNodeMetadata?.(nodeType);

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
              const userId = this.session.userId ?? "1";
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
          await this.session.send(outbound);
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
      await this.session.send({
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
    releaseSpend(this.session.userId ?? "1", active.jobId);
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
    const registered = jobRunRegistry.get(this.session.userId ?? "1", jobId);
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
      const job =
        row && row.user_id === (this.session.userId ?? "1") ? row : null;
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
            this.session.logError("stale job row cleanup failed", error);
          }
        }
      }
      await this.session.send({
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

    await this.session.send({
      type: "job_update",
      status: active.status,
      job_id: jobId,
      workflow_id: workflowId ?? active.workflowId
    });

    for (const status of Object.values(active.context.getNodeStatuses())) {
      await this.session.send({
        ...status,
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
    for (const status of Object.values(active.context.getEdgeStatuses())) {
      await this.session.send({
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
      releaseSpend(this.session.userId ?? "1", jobId);
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
          this.session.logError("cancel persistence failed", err);
        }
      }
      await this.session.send({
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
      const registered = jobRunRegistry.get(this.session.userId ?? "1", jobId);
      if (registered && registered.status === "running") {
        registered.cancel();
        try {
          const job = await Job.get(jobId);
          if (job && job.status !== "cancelled") {
            job.markCancelled();
            await job.save();
          }
        } catch (err) {
          this.session.logError("cancel persistence failed", err);
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
      const remote = await requestRemoteJobCancel(
        this.session.userId ?? "1",
        jobId
      );
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
        this.session.logError("cancel persistence failed", err);
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

  /**
   * `stop` for one run. The run is cancelled here when this connection owns
   * it; otherwise it is executing on the connection that started it — this
   * client only reconnected to it — so it is cancelled through its registered
   * session, or, when nothing local holds it, through its row.
   */
  async stopJob(jobId: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (active) {
      active.session.cancel();
      active.status = "cancelled";
      return;
    }
    const registered = jobRunRegistry.get(this.session.userId ?? "1", jobId);
    if (registered && registered.status === "running") {
      registered.cancel();
      return;
    }
    await requestRemoteJobCancel(this.session.userId ?? "1", jobId);
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

  /**
   * Accumulate provider cost from a completed node_update into the job total.
   *
   * The ledger row is *not* written here. `ExecutionSession` attaches
   * `attachRunCostLedger` to the same context, so every surface — this server,
   * the CLI, the debug harness — records the charge once, from one
   * implementation. Writing it again here would double-count every FAL and kie
   * generation.
   */
  _handleNodeProviderCost(
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
    const capability = isString(outbound.capability)
      ? outbound.capability
      : null;
    if (!isUnitBilledCapability(capability)) return;
    const provider = isString(outbound.provider) ? outbound.provider : "";
    const model = isString(outbound.model) ? outbound.model : "";
    if (!provider || !model) return;
    const priced = priceGeneration({
      userId: this.session.userId ?? "1",
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
  runMeasuredCost(active: ActiveJob): number | null {
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
   * Release everything this connection still holds on the job side: detach the
   * resilient runs (they keep executing and buffering), cancel the ones nobody
   * is left to receive, and mark the queued rows cancelled. Called from the
   * host's `disconnect`.
   */
  async cancelAll(): Promise<void> {
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
        .get(this.session.userId ?? "1", adoptedId)
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
        this.session.logError("disconnect queue cancellation failed", err);
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
        this.session.logError(
          "disconnect dequeued-job cancellation failed",
          err
        );
      }
    }
  }
}
