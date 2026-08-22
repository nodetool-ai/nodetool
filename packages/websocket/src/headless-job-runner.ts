/**
 * Headless job start — run a workflow through `@nodetool-ai/execution`'s
 * `ExecutionSession` without a WebSocket connection.
 *
 * This is the minimal load-graph → `Job.create` → `ExecutionSession` →
 * persist-terminal-status path, shared by the trigger dispatcher (which wakes
 * a workflow up for a stored trigger event) and, later, an HTTP run route.
 * Graph hydration, executor resolution, and the Python-bridge connection are
 * owned by the facade, same as the CLI's headless run
 * (`nodetool workflows run`).
 *
 * The `Job` row is created with status `running` *before* the run starts, so
 * the job is visible in the jobs UI / tRPC list while it executes; the
 * terminal status (`completed` / `failed` / `cancelled` / `suspended`) is
 * persisted when the runner settles. A job cancelled externally via the
 * DB-only cancel path (tRPC `jobs.cancel`) keeps its `cancelled` status.
 */

import { createLogger, getDefaultAssetsPath } from "@nodetool-ai/config";
import {
  ExecutionSession,
  isExecutionPreflightError,
  normalizeGraph,
  toRawGraphInput,
  type RunResult
} from "@nodetool-ai/execution";
import { Job, Workflow, getSecret } from "@nodetool-ai/models";
import {
  createGraphNodeTypeResolver,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import type { SupervisorRunOptions } from "@nodetool-ai/protocol";
import { FileStorageAdapter, ProcessingContext } from "@nodetool-ai/runtime";
import { createRunSupervisor } from "./run-supervisor.js";
import { resolveWorkflowWorkspace } from "./lib/workflow-workspace.js";
import { getAssetAdapter } from "./lib/storage.js";

const log = createLogger("nodetool.websocket.headless-job");

/** Wake-up payload for a trigger-driven run (protocol `trigger_event` shape). */
interface HeadlessTriggerEvent {
  node_id: string;
  payload: unknown;
  input_id: string;
}

export interface StartHeadlessJobOptions {
  workflowId: string;
  userId: string;
  /** Stamped onto the run request as `trigger_event`; the kernel propagates it to `ProcessingContext.triggerEvent`. */
  triggerEvent?: HeadlessTriggerEvent | null;
  params?: Record<string, unknown>;
  /** Fixed job id (e.g. for idempotent dispatch); defaults to a generated one. */
  jobId?: string;
  jobName?: string;
  /** Node registry to resolve executors from. Defaults to the bootstrapped server registry. */
  registry?: NodeRegistry;
  /**
   * Supervise this run (docs/workflow-supervisor-design.md). Off unless the
   * caller asks — the trigger dispatcher passes the registration's own flag,
   * which defaults to off. Without a configured supervisor model
   * (`NODETOOL_SUPERVISOR_PROVIDER` / `NODETOOL_SUPERVISOR_MODEL`) the run
   * proceeds unsupervised rather than failing.
   */
  supervise?: boolean;
  /** Supervisor configuration. Ignored unless `supervise` is true. */
  supervisor?: SupervisorRunOptions | null;
  /**
   * Called once the run is *accepted* — the workflow resolved and the `Job` row
   * exists — which is long before this function's promise settles on terminal
   * status. Callers that must not block for the run's whole duration (the
   * trigger dispatcher) use it as their handoff point. A throwing callback is
   * swallowed: acceptance reporting must never fail the run.
   */
  onAccepted?: (jobId: string) => void;
}

export type HeadlessJobStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "suspended";

interface HeadlessJobResult {
  jobId: string;
  status: HeadlessJobStatus;
  error: string | null;
  outputs: Record<string, unknown[]>;
}

// Lazily bootstrap the full registry only when no registry is injected, so
// callers that already hold the server's registry (dispatcher, tests) never
// pay for pack loading.
let defaultRegistryPromise: Promise<NodeRegistry> | null = null;

async function getDefaultRegistry(): Promise<NodeRegistry> {
  if (!defaultRegistryPromise) {
    defaultRegistryPromise = import("./node-registry-setup.js").then((m) =>
      m.bootstrapNodeRegistry({ log })
    );
  }
  return defaultRegistryPromise;
}

/** Persist the runner's terminal status onto the Job row. */
async function persistTerminalStatus(
  jobId: string,
  result: RunResult
): Promise<void> {
  try {
    const job = await Job.get(jobId);
    if (!job) return;
    // A DB-only cancel (tRPC `jobs.cancel`) can finalize the row as cancelled
    // while the run is still executing. Don't overwrite that.
    if (job.status === "cancelled") return;
    if (result.status === "completed") {
      job.markCompleted();
    } else if (result.status === "cancelled") {
      job.markCancelled();
    } else if (result.status === "suspended") {
      job.markSuspended(
        result.suspend?.node_id ?? "",
        result.suspend?.reason ?? "",
        result.suspend?.state,
        result.suspend?.metadata
      );
    } else {
      job.markFailed(result.error ?? "Workflow run failed");
    }
    await job.save();
  } catch (err) {
    log.error("headless job terminal-status persistence failed", {
      jobId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Start a workflow run without a WebSocket connection and resolve with its
 * terminal status. Throws when the workflow doesn't exist for the user;
 * run-time failures resolve with `status: "failed"` (and a failed Job row)
 * instead of rejecting, so dispatch loops can treat every settled run alike.
 */
export async function startHeadlessJob(
  options: StartHeadlessJobOptions
): Promise<HeadlessJobResult> {
  const { workflowId, userId } = options;
  const workflow = await Workflow.find(userId, workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const graph = normalizeGraph(workflow.getGraph());
  const registry = options.registry ?? (await getDefaultRegistry());
  const params = options.params ?? {};

  // Create the Job row before running so the run is visible in the jobs list
  // (UI, tRPC `jobs.list`) while it's in flight.
  const jobFields: Parameters<typeof Job.create>[0] = {
    workflow_id: workflowId,
    user_id: userId,
    status: "running",
    name: options.jobName ?? workflow.name ?? "",
    started_at: new Date().toISOString(),
    params,
    graph: { ...graph }
  };
  if (options.jobId !== undefined) {
    jobFields.id = options.jobId;
  }
  const job = await Job.create(jobFields);

  // The run is accepted from here on: everything above could still reject and
  // leave the caller free to redeliver, everything below is an executing run.
  try {
    options.onAccepted?.(job.id);
  } catch (err) {
    log.warn("headless job onAccepted callback threw", {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  const workspace = await resolveWorkflowWorkspace(workflowId, userId);
  const context = new ProcessingContext({
    jobId: job.id,
    workflowId,
    userId,
    secretResolver: getSecret,
    storage: new FileStorageAdapter(getDefaultAssetsPath()),
    // `asset://<id>` inputs resolve through the configured asset store, which
    // is only the local assets dir on a `file` backend. Without it a triggered
    // run on an S3/Supabase deployment reads every uploaded input as empty.
    assetStorage: getAssetAdapter(),
    workspace
  });

  log.info("Headless job started", {
    jobId: job.id,
    workflowId,
    triggered: Boolean(options.triggerEvent)
  });

  // ExecutionSession owns graph hydration, the Python-bridge connection
  // (lazily connected, exactly like the CLI's `workflows run`; pure-TS graphs
  // get no bridge at all), and executor resolution (registry → Python bridge
  // → throw). `session.result` never rejects — kernel failures (including an
  // unknown node type) resolve as `status: "failed"` instead of throwing, so
  // the job still settles instead of leaving a phantom "running" row behind.
  const supervisor = await createRunSupervisor({
    supervise: options.supervise,
    supervisor: options.supervisor,
    context
  });

  const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
    graph: toRawGraphInput(graph),
    registry,
    // `normalizeGraph` fixes shape, not types: it never fills `propertyTypes`,
    // and correlation analysis reads list-ness only from that map. Without the
    // resolver every `list[...]` handle reads as non-list, so a stream
    // arriving on one collapses to empty scope and the node runs once on the
    // last value — the same job producing less than it does under
    // `workflows run`.
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: job.id,
    workflowId,
    params,
    triggerEvent: options.triggerEvent ?? null,
    context
  };
  if (supervisor) {
    sessionOptions.supervisor = supervisor;
  }
  // The job row already exists, so a refusal must finalize it — a bare throw
  // stranded it at "running" forever. `create()` refuses a graph this runtime
  // cannot honour (unknown model, unregistered provider, missing credential)
  // before the kernel starts.
  let session: ExecutionSession;
  try {
    session = await ExecutionSession.create(sessionOptions);
  } catch (err) {
    if (!isExecutionPreflightError(err)) throw err;
    await persistTerminalStatus(job.id, {
      status: "failed",
      error: err.message,
      outputs: {},
      messages: []
    } as RunResult);
    log.info("Headless job refused", { jobId: job.id, error: err.message });
    return {
      jobId: job.id,
      status: "failed",
      error: err.message,
      outputs: {}
    };
  }

  const result = await session.result;

  await persistTerminalStatus(job.id, result);
  log.info("Headless job finished", { jobId: job.id, status: result.status });

  return {
    jobId: job.id,
    status: result.status,
    error: result.error ?? null,
    outputs: result.outputs ?? {}
  };
}
