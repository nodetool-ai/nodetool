/**
 * Headless job start — run a workflow through the kernel `WorkflowRunner`
 * without a WebSocket connection.
 *
 * This is the minimal load-graph → `Job.create` → `WorkflowRunner` →
 * persist-terminal-status path, shared by the trigger dispatcher (which wakes
 * a workflow up for a stored trigger event) and, later, an HTTP run route.
 * Graph hydration follows the CLI's headless run (`nodetool workflows run`):
 * normalize the saved graph into the kernel's descriptor shape, stamp behavior
 * flags from the registry, and resolve Python nodes through a lazily-connected
 * worker bridge.
 *
 * The `Job` row is created with status `running` *before* the run starts, so
 * the job is visible in the jobs UI / tRPC list while it executes; the
 * terminal status (`completed` / `failed` / `cancelled` / `suspended`) is
 * persisted when the runner settles. A job cancelled externally via the
 * DB-only cancel path (tRPC `jobs.cancel`) keeps its `cancelled` status.
 */

import { createLogger, getDefaultAssetsPath } from "@nodetool-ai/config";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { Job, Workflow, getSecret } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { hydrateGraphNodeFlags, isEditorOnlyType } from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import {
  FileStorageAdapter,
  ProcessingContext,
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "@nodetool-ai/runtime";
import { resolveWorkflowWorkspace } from "./lib/workflow-workspace.js";

const log = createLogger("nodetool.websocket.headless-job");

/** Wake-up payload for a trigger-driven run (protocol `trigger_event` shape). */
export interface HeadlessTriggerEvent {
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

export interface HeadlessJobResult {
  jobId: string;
  status: HeadlessJobStatus;
  error: string | null;
  outputs: Record<string, unknown[]>;
}

type RunnableGraph = {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

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

/**
 * Normalize a saved graph into the kernel's descriptor contract: node
 * properties under `properties` (the editor stores them under `data`), edges
 * carrying `edge_type`, and editor-only nodes (Comment/Group/Reroute) pruned
 * the way the web editor prunes them at serialize time.
 */
function normalizeRunnableGraph(graph: {
  nodes: unknown[];
  edges: unknown[];
}): RunnableGraph {
  const executable = (graph.nodes as Array<Record<string, unknown>>).filter(
    (n) => !isEditorOnlyType(String(n.type ?? ""))
  );
  const keep = new Set(executable.map((n) => String(n.id ?? "")));
  const nodes = executable.map((n) => {
    if (n.properties === undefined && n.data !== undefined) {
      const { data, ...rest } = n;
      return { ...rest, properties: data };
    }
    return n;
  });
  const edges = (graph.edges as Array<Record<string, unknown>>)
    .filter(
      (e) =>
        keep.has(String(e.source ?? "")) && keep.has(String(e.target ?? ""))
    )
    .map((edge) => {
      const rawEdgeType = edge.edge_type ?? edge.type;
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type: _type, ...rest } = edge;
      return { ...rest, edge_type };
    });
  return { nodes, edges };
}

/** Persist the runner's terminal status onto the Job row. */
async function persistTerminalStatus(
  jobId: string,
  result: Awaited<ReturnType<WorkflowRunner["run"]>>
): Promise<void> {
  try {
    const job = (await Job.get(jobId)) as Job | null;
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

  const graph = normalizeRunnableGraph(workflow.getGraph());
  const registry = options.registry ?? (await getDefaultRegistry());
  const params = options.params ?? {};

  // Create the Job row before running so the run is visible in the jobs list
  // (UI, tRPC `jobs.list`) while it's in flight.
  const job = (await Job.create({
    ...(options.jobId !== undefined ? { id: options.jobId } : {}),
    workflow_id: workflowId,
    user_id: userId,
    status: "running",
    name: options.jobName ?? workflow.name ?? "",
    started_at: new Date().toISOString(),
    params,
    graph
  })) as Job;

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

  const workspaceDir = await resolveWorkflowWorkspace(workflowId, userId);
  const context = new ProcessingContext({
    jobId: job.id,
    workflowId,
    userId,
    secretResolver: getSecret,
    storage: new FileStorageAdapter(getDefaultAssetsPath()),
    workspaceDir,
    workspaceStorage: workspaceDir ? new FileStorageAdapter(workspaceDir) : null
  });

  // Python nodes go through a lazily-connected worker bridge, exactly like the
  // CLI's `workflows run`. Pure-TS graphs get no bridge at all.
  const pythonBridge = await connectPythonBridgeForGraph(graph.nodes, (t) =>
    registry.has(t)
  );

  const runner = new WorkflowRunner(job.id, {
    resolveExecutor: (node) => {
      if (registry.has(node.type)) {
        return registry.resolve(
          node as { id: string; type: string; [key: string]: unknown }
        );
      }
      const py = resolvePythonNodeExecutor(pythonBridge, node);
      if (py) return py;
      throw new Error(`Unknown node type: ${node.type}`);
    },
    executionContext: context
  });

  log.info("Headless job started", {
    jobId: job.id,
    workflowId,
    triggered: Boolean(options.triggerEvent)
  });

  let result: Awaited<ReturnType<WorkflowRunner["run"]>>;
  try {
    result = await runner.run(
      {
        job_id: job.id,
        workflow_id: workflowId,
        params,
        ...(options.triggerEvent ? { trigger_event: options.triggerEvent } : {})
      },
      hydrateGraphNodeFlags(graph as unknown as GraphData, registry)
    );
  } catch (err) {
    // A thrown run (unknown node type, pre-flight failure) still settles the
    // job as failed rather than leaving a phantom "running" row behind.
    result = {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      outputs: {},
      messages: []
    };
  } finally {
    pythonBridge?.close();
  }

  await persistTerminalStatus(job.id, result);
  log.info("Headless job finished", { jobId: job.id, status: result.status });

  return {
    jobId: job.id,
    status: result.status,
    error: result.error ?? null,
    outputs: result.outputs ?? {}
  };
}
