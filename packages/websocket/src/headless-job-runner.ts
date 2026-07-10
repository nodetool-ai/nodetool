/**
 * Headless job start — run a workflow without a WebSocket connection.
 *
 * The streaming runner (`UnifiedWebSocketRunner`) starts jobs per client
 * connection and streams every processing message back over the socket. The
 * trigger dispatcher (and, later, an HTTP run route) needs to start the same
 * kind of run with no socket attached: an event arrives, a run starts, the
 * trigger node emits the payload, the Job row records the terminal state.
 *
 * This reuses the shared, cached run environment (`getWorkflowRuntimeEnvironment`
 * — the exact registry + executor resolution + Python bridge the REST
 * `handleWorkflowRun` path uses) and the workspace resolution helper. It does
 * NOT reimplement message routing/persistence from the WebSocket runner.
 *
 * What a headless run deliberately lacks compared to the WebSocket runner:
 *   - No per-message streaming to clients (no `sendMessage`, no `job_update`
 *     relay, no edge/node status fan-out). Messages still accumulate in the
 *     ProcessingContext and the RunResult; nothing consumes them live.
 *   - No generation_complete asset auto-save. That lives in the WebSocket
 *     runner's streaming loop; the REST run path omits it too, so headless
 *     matches REST here.
 *   - No concurrency caps / queueing. The dispatcher owns that policy.
 *
 * Two entry points:
 *   - `startHeadlessJob` awaits the whole run and resolves with the terminal
 *     status — used by the trigger router's synchronous "fire now" path and by
 *     tests.
 *   - `startHeadlessJobDetached` returns as soon as the Job row is persisted
 *     (status "running") and finishes the run in the background — used by the
 *     dispatcher, which starts one run per event and moves on.
 */

import { createLogger, getDefaultAssetsPath } from "@nodetool-ai/config";
import { Job, Workflow, getSecret } from "@nodetool-ai/models";
import { WorkflowRunner, type RunResult } from "@nodetool-ai/kernel";
import { hydrateGraphNodeFlags, type NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  ProcessingContext,
  FileStorageAdapter,
  type NodeExecutor
} from "@nodetool-ai/runtime";
import type { GraphData } from "@nodetool-ai/protocol";
import {
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "./http-api.js";
import { resolveWorkflowWorkspace } from "./lib/workflow-workspace.js";

const log = createLogger("nodetool.websocket.headless-job");

/** The trigger-firing payload threaded into the run for the target node. */
export interface HeadlessTriggerEvent {
  node_id: string;
  payload: unknown;
  input_id: string;
}

export interface StartHeadlessJobOptions {
  workflowId: string;
  userId: string;
  params?: Record<string, unknown>;
  triggerEvent?: HeadlessTriggerEvent;
}

/**
 * The pieces a headless run needs to resolve node types to executors. Satisfied
 * by {@link getWorkflowRuntimeEnvironment}'s return value; tests inject a
 * lightweight one so they don't bootstrap the full node registry / Python
 * bridge.
 */
export interface HeadlessJobRuntime {
  registry: NodeRegistry;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
  ensurePythonBridge: () => Promise<void>;
}

export interface HeadlessJobDeps {
  /** Injectable run environment. Defaults to the shared REST-run environment. */
  runtime?: HeadlessJobRuntime;
  /** Options forwarded to {@link getWorkflowRuntimeEnvironment} when no runtime is given. */
  runtimeOptions?: HttpApiOptions;
}

export interface HeadlessJobHandle {
  jobId: string;
  /** Terminal status for `startHeadlessJob`; "running" for the detached start. */
  status: string;
}

interface PreparedHeadlessJob {
  job: Job;
  /** Runs the graph to completion and persists the terminal Job status. */
  execute: () => Promise<string>;
}

/**
 * Load the workflow (ownership-checked), create a running Job row, and build a
 * runner bound to it. The Job row is persisted before `execute()` runs, so the
 * job is visible via `Job.find` for the whole run.
 */
async function prepareHeadlessJob(
  opts: StartHeadlessJobOptions,
  deps: HeadlessJobDeps
): Promise<PreparedHeadlessJob> {
  const { workflowId, userId } = opts;

  // Ownership is enforced by Workflow.find (owner or public). A missing/foreign
  // workflow throws BEFORE any Job row is created — no orphaned running row.
  const workflow = await Workflow.find(userId, workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const runtime =
    deps.runtime ??
    (await getWorkflowRuntimeEnvironment(deps.runtimeOptions ?? {}));

  const graph = hydrateGraphNodeFlags(
    workflow.getGraph() as unknown as GraphData,
    runtime.registry
  );

  // A node the registry knows only from metadata (no local class) is a Python
  // node — connect the bridge before running, mirroring handleWorkflowRun.
  const hasPythonNode = graph.nodes.some((node) => {
    const nodeType = typeof node.type === "string" ? node.type : "";
    return (
      nodeType !== "" &&
      Boolean(runtime.registry.getMetadata(nodeType)) &&
      !runtime.registry.has(nodeType)
    );
  });
  if (hasPythonNode) {
    await runtime.ensurePythonBridge();
  }

  // Persist the row as running before execution starts so Job.find sees it in
  // flight (the jobs list / UI picks it up immediately).
  const job = await Job.create<Job>({
    workflow_id: workflowId,
    user_id: userId,
    status: "running",
    started_at: new Date().toISOString(),
    params: opts.params ?? {},
    graph
  });

  const workspaceDir = await resolveWorkflowWorkspace(workflowId, userId);
  // Unlike buildWorkspaceExecutionContext (used by the REST path), wire the
  // secret resolver and asset storage: trigger-started runs execute unattended
  // and their nodes (LLM providers, generators) need API keys and a place to
  // materialize assets.
  const context = new ProcessingContext({
    jobId: job.id,
    workflowId,
    userId,
    secretResolver: getSecret,
    storage: new FileStorageAdapter(getDefaultAssetsPath()),
    workspaceDir,
    workspaceStorage: workspaceDir ? new FileStorageAdapter(workspaceDir) : null
  });

  const runner = new WorkflowRunner(job.id, {
    resolveExecutor: (node) =>
      runtime.resolveExecutor(
        node as { id: string; type: string; [key: string]: unknown }
      ),
    executionContext: context
  });

  const execute = async (): Promise<string> => {
    try {
      const result = await runner.run(
        {
          job_id: job.id,
          workflow_id: workflowId,
          params: opts.params ?? {},
          ...(opts.triggerEvent ? { trigger_event: opts.triggerEvent } : {})
        },
        graph
      );
      await persistTerminalStatus(job.id, result);
      return result.status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("headless job execution threw", { jobId: job.id, message });
      await failJob(job.id, message);
      return "failed";
    }
  };

  return { job, execute };
}

/** Write the RunResult's terminal state onto the Job row. */
async function persistTerminalStatus(
  jobId: string,
  result: RunResult
): Promise<void> {
  const job = await Job.get<Job>(jobId);
  if (!job) return;
  // A DB-only cancel may have finalized the row while the run was executing;
  // don't overwrite it.
  if (job.status === "cancelled") return;
  switch (result.status) {
    case "completed":
      job.markCompleted();
      break;
    case "failed":
      job.markFailed(result.error ?? "Workflow run failed");
      break;
    case "cancelled":
      job.markCancelled();
      break;
    case "suspended":
      job.markSuspended(
        result.suspend?.node_id ?? "",
        result.suspend?.reason ?? "",
        result.suspend?.state,
        result.suspend?.metadata
      );
      break;
  }
  await job.save();
}

/** Mark a Job failed after a thrown run (e.g. graph validation). */
async function failJob(jobId: string, message: string): Promise<void> {
  const job = await Job.get<Job>(jobId);
  if (!job || job.status === "cancelled") return;
  job.markFailed(message);
  await job.save();
}

/**
 * Start a headless job and await its completion. Resolves with the Job id and
 * terminal status ("completed" | "failed" | "cancelled" | "suspended").
 * Rejects (leaving no Job row) if the workflow is missing or not owned by
 * `userId`.
 */
export async function startHeadlessJob(
  opts: StartHeadlessJobOptions,
  deps: HeadlessJobDeps = {}
): Promise<HeadlessJobHandle> {
  const { job, execute } = await prepareHeadlessJob(opts, deps);
  const status = await execute();
  return { jobId: job.id, status };
}

/**
 * Start a headless job and return once the Job row is persisted (status
 * "running"), running the graph in the background. The terminal status is
 * persisted on the Job row when the run settles. Rejects the same way as
 * {@link startHeadlessJob} if preparation fails, so the caller learns about a
 * missing/foreign workflow synchronously.
 */
export async function startHeadlessJobDetached(
  opts: StartHeadlessJobOptions,
  deps: HeadlessJobDeps = {}
): Promise<HeadlessJobHandle> {
  const { job, execute } = await prepareHeadlessJob(opts, deps);
  // execute() persists terminal state and never rejects (it catches internally).
  void execute();
  return { jobId: job.id, status: job.status };
}
