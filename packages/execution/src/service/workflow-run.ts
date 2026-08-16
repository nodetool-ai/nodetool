/**
 * Running a saved workflow, as a service every host can call in-process.
 *
 * This is what `POST /api/workflows/:id/run|debug` does minus Request/Response
 * parsing: find the workflow, refuse a graph whose model selections cannot be
 * honoured, create the job row, run it, finalize the row, and shape the payload
 * — plain `/run` or the debug report. The interactive path parks escalations in
 * the {@link debugSessions} registry and hands back the session event.
 *
 * The websocket package keeps the Fastify routes and calls this; the agent
 * tools call it directly, so `run_workflow` no longer needs a server listening
 * on localhost to run a workflow.
 */

import { createLogger } from "@nodetool-ai/config";
import { BoundedHandle, WorkflowRunner } from "@nodetool-ai/kernel";
import { Job, Workflow } from "@nodetool-ai/models";
import {
  collectModelSelectionIssues,
  hydrateGraphNodeFlags,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import type { GraphData } from "@nodetool-ai/protocol";
import {
  listOfflineModelIds,
  listRegisteredProviderIds,
  type NodeExecutor,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { normalizeGraph } from "../normalize-graph.js";
import { collectExecutionSummary } from "../debug/collector.js";
import {
  buildRunVerdict,
  collectInterventionWarnings
} from "../debug/verdict.js";
import {
  debugSessions,
  DebugSession,
  InteractiveEscalationHandle,
  INTERACTIVE_DECISION_TIMEOUT_MS,
  TooManyDebugSessionsError,
  type DebugSessionEvent
} from "./debug-sessions.js";
import {
  buildWorkspaceExecutionContext,
  resolveWorkflowWorkspace
} from "./workflow-workspace.js";

const log = createLogger("nodetool.execution.workflow-run");

type WorkflowRunResult = Awaited<ReturnType<WorkflowRunner["run"]>>;

/**
 * What the host brings to a run: the node registry, and — for a host that also
 * owns a Python worker — how to resolve a Python node and how to wake the
 * bridge. A host with neither (the agent tools, a test) supplies just the
 * registry and gets registry-only resolution.
 */
export interface WorkflowRunEnvironment {
  registry: NodeRegistry;
  resolveExecutor?: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
  ensurePythonBridge?: () => Promise<void>;
  /**
   * Attach host-provided model interfaces (asset persistence, message
   * storage, …) to the run's ProcessingContext before execution. Without it
   * nodes that persist artifacts — every image Output — fail their run.
   */
  configureContext?: (context: ProcessingContext) => void;
}

/** Provider/model catalogs the pre-flight checks a graph's selections against. */
export interface RunModelCatalogs {
  listProviderIds: () => readonly string[];
  listModelIds: (
    provider: string,
    modelType: string
  ) => readonly string[] | undefined;
}

const RUNTIME_CATALOGS: RunModelCatalogs = {
  listProviderIds: () => listRegisteredProviderIds(),
  listModelIds: (provider, modelType) =>
    listOfflineModelIds(provider, modelType)
};

export interface RunWorkflowOptions {
  workflowId: string;
  userId: string;
  /**
   * The run environment, or a lazy resolver for it. Pass the resolver form
   * when constructing the environment is expensive (registry bootstrap,
   * Python bridge): it is awaited only after the cheap not-found and
   * model-selection checks have passed.
   */
  environment: WorkflowRunEnvironment | (() => Promise<WorkflowRunEnvironment>);
  params?: Record<string, unknown>;
  /** Return the full debug report (summary + verdict) instead of the run row. */
  debug?: boolean;
  /** Reported back on the payload; the run itself is identical. */
  background?: boolean;
  /**
   * Bubble node failures up to the caller instead of resolving them here: the
   * call returns as soon as a node invocation escalates and the run stays
   * parked until a verdict arrives via {@link submitEscalationVerdict}.
   */
  interactive?: boolean;
  maxDecisions?: number;
  maxRetriesPerNode?: number;
  decisionTimeoutMs?: number;
  /**
   * Injected so a host that mocks workspace resolution (the websocket tests
   * do) keeps controlling it. Defaults to the workspace stored on the workflow.
   */
  resolveWorkspace?: (
    workflowId: string,
    userId: string
  ) => Promise<string | null>;
  catalogs?: RunModelCatalogs;
}

/**
 * A run's answer. `error` is a refusal the caller turns into its own transport
 * error (an HTTP status, a tool error object); anything genuinely exceptional
 * still throws.
 */
export type RunWorkflowOutcome =
  | { kind: "payload"; payload: Record<string, unknown> }
  | { kind: "error"; status: number; detail: string };

/**
 * Server-side ceilings for the interactive bounds a caller may ask for. A
 * number nobody would type by hand — a decision timeout of a day, ten thousand
 * decisions — is clamped rather than honored.
 */
export const MAX_INTERACTIVE_DECISIONS = 100;
export const MAX_INTERACTIVE_RETRIES_PER_NODE = 20;
export const MAX_INTERACTIVE_DECISION_TIMEOUT_MS = 30 * 60_000;

/**
 * An interactive-run bound: an integer in `[min, max]`, or undefined.
 * Out-of-range highs clamp to `max`; anything that is not a sane integer (NaN,
 * Infinity, negatives, fractions) is undefined so the caller gets the default
 * instead of a bound that fails every decision instantly.
 */
export function boundedRunOption(
  value: unknown,
  min: number,
  max: number
): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    return undefined;
  }
  return Math.min(value, max);
}

/** Model selections in a graph that no configured provider can honour. */
export function modelSelectionErrors(
  graph: { nodes?: unknown },
  catalogs: RunModelCatalogs = RUNTIME_CATALOGS
): string[] {
  const nodes = graph.nodes;
  if (!Array.isArray(nodes)) return [];
  return collectModelSelectionIssues({ nodes: nodes as never[] }, catalogs)
    .filter((issue) => issue.severity === "error")
    .map(
      (issue) => `Node "${issue.nodeId}" (${issue.nodeType}): ${issue.message}`
    );
}

/** Mark a job failed and persist it, best effort. */
async function markJobFailed(job: Job, message: string): Promise<void> {
  try {
    job.markFailed(message);
    await job.save();
  } catch (saveError) {
    log.warn("failed to persist failed job status", {
      jobId: job.id,
      error: String(saveError)
    });
  }
}

async function finalizeWorkflowRunJob(
  job: Job,
  result: WorkflowRunResult
): Promise<void> {
  if (result.status === "completed") {
    job.markCompleted();
  } else if (result.status === "cancelled") {
    job.markCancelled();
  } else {
    job.markFailed(result.error ?? "Workflow run failed");
  }
  await job.save();
}

export function buildWorkflowRunPayload(
  jobId: string,
  workflowId: string,
  result: WorkflowRunResult,
  debug: boolean,
  extras: { background: boolean }
): Record<string, unknown> {
  if (debug) {
    // The debug surface reports what actually happened — per-node status and
    // errors, logs, edges, LLM calls, outputs — plus the same verdict the CLI
    // harness computes.
    const summary = collectExecutionSummary(result.messages);
    const verdict = buildRunVerdict(summary, {
      ok: result.status === "completed",
      status: result.status,
      error: result.error ?? null
    });
    // Supervisor decisions are warnings, never issues — a rescued run still
    // completed — but without them a supervised run reads as "ran clean".
    const warnings = collectInterventionWarnings("Server", summary);
    return {
      job_id: jobId,
      workflow_id: workflowId,
      status: result.status,
      outputs: result.outputs,
      error: result.error ?? null,
      summary,
      verdict:
        warnings.length > 0
          ? {
              ...verdict,
              headline: verdict.ok
                ? `${verdict.headline} (supervised)`
                : verdict.headline,
              warnings
            }
          : verdict
    };
  }

  return {
    job_id: jobId,
    workflow_id: workflowId,
    status: result.status,
    outputs: result.outputs,
    error: result.error ?? null,
    message_count: result.messages.length,
    background: extras.background
  };
}

/** One escalated/running/done payload shape for every interactive response. */
export function debugSessionEventPayload(
  session: DebugSession,
  event: DebugSessionEvent
): Record<string, unknown> {
  switch (event.kind) {
    case "done":
      return { ...event.report, session_id: session.id };
    case "escalated":
      return {
        status: "escalated",
        session_id: session.id,
        job_id: session.jobId,
        workflow_id: session.workflowId,
        escalation_id: event.escalationId,
        escalation: event.escalation,
        resolve:
          `POST /api/debug/sessions/${session.id}/verdict with ` +
          `{"escalation_id": "${event.escalationId}", "verdict": {"action": ...}} — ` +
          `allowed actions: ${event.escalation.allowedActions.join(", ")}. ` +
          "The run is parked on this node until a verdict arrives; an " +
          "unanswered escalation fails closed on the decision timeout."
      };
    case "running":
      return {
        status: "running",
        session_id: session.id,
        job_id: session.jobId,
        workflow_id: session.workflowId
      };
  }
}

/**
 * Run a saved workflow end to end. Everything the HTTP route did except read
 * the request and write the response.
 */
export async function runWorkflow(
  options: RunWorkflowOptions
): Promise<RunWorkflowOutcome> {
  const { workflowId, userId } = options;
  const params = options.params ?? {};
  const debug = options.debug === true;
  const interactive = options.interactive === true;

  const workflow = await Workflow.find(userId, workflowId);
  if (!workflow) {
    return { kind: "error", status: 404, detail: "Workflow not found" };
  }

  const runMode = workflow.run_mode ?? "workflow";
  if (runMode !== "workflow") {
    return {
      kind: "error",
      status: 400,
      detail: `Workflow run mode "${runMode}" is not supported by the standalone backend`
    };
  }

  // One normalization for every host: `data` → `properties`, editor-only nodes
  // (Comment/Group/Reroute) pruned, and edges typed from `edge_type` or the
  // legacy `type`.
  const runnableGraph = normalizeGraph(workflow.getGraph());

  const badModels = modelSelectionErrors(runnableGraph, options.catalogs);
  if (badModels.length > 0) {
    return {
      kind: "error",
      status: 400,
      detail: `Workflow selects providers or models this runtime cannot honour:\n${badModels.join("\n")}`
    };
  }

  // Resolve the environment only after the cheap checks: a 404 on a missing
  // workflow or a 400 on a bad model selection must not depend on (or be
  // masked by) a cold runtime bootstrap.
  const environment =
    typeof options.environment === "function"
      ? await options.environment()
      : options.environment;

  const registry = environment.registry;
  const hasPythonNode = runnableGraph.nodes.some((node) => {
    const nodeType = typeof node.type === "string" ? node.type : "";
    return (
      nodeType !== "" &&
      Boolean(registry.getMetadata(nodeType)) &&
      !registry.has(nodeType)
    );
  });
  if (hasPythonNode && environment.ensurePythonBridge) {
    await environment.ensurePythonBridge();
  }

  const job = (await Job.create({
    workflow_id: workflowId,
    user_id: userId,
    status: "running",
    params,
    graph: runnableGraph
  })) as Job;

  // Everything after the row exists must finalize it. Workspace resolution,
  // node-flag hydration and the run itself can all throw (fs, registry) — a
  // bare throw here stranded the row at "running" forever.
  let runner: WorkflowRunner;
  let hydratedGraph: ReturnType<typeof hydrateGraphNodeFlags>;
  let interactiveHandle: InteractiveEscalationHandle | null = null;
  let supervisorHandle: BoundedHandle | null = null;
  try {
    const workspaceDir = await (
      options.resolveWorkspace ?? resolveWorkflowWorkspace
    )(workflowId, userId);
    if (interactive) {
      // `BoundedHandle` keeps the same guarantees an LLM supervisor gets —
      // decision/retry caps, a per-decision timeout that fails closed, sticky
      // verdicts — just with a timeout sized for an agent's tool round trip.
      const maxDecisions = boundedRunOption(
        options.maxDecisions,
        1,
        MAX_INTERACTIVE_DECISIONS
      );
      const maxRetriesPerNode = boundedRunOption(
        options.maxRetriesPerNode,
        0,
        MAX_INTERACTIVE_RETRIES_PER_NODE
      );
      interactiveHandle = new InteractiveEscalationHandle();
      const bounds: ConstructorParameters<typeof BoundedHandle>[1] = {
        decisionTimeoutMs:
          boundedRunOption(
            options.decisionTimeoutMs,
            1,
            MAX_INTERACTIVE_DECISION_TIMEOUT_MS
          ) ?? INTERACTIVE_DECISION_TIMEOUT_MS
      };
      if (maxDecisions !== undefined) {
        bounds.maxDecisions = maxDecisions;
      }
      if (maxRetriesPerNode !== undefined) {
        bounds.maxRetriesPerNode = maxRetriesPerNode;
      }
      supervisorHandle = new BoundedHandle(interactiveHandle, bounds);
    }
    const resolveExecutor =
      environment.resolveExecutor ??
      ((node: { id: string; type: string; [key: string]: unknown }) =>
        registry.resolve(node));
    const runnerOptions: ConstructorParameters<typeof WorkflowRunner>[1] = {
      resolveExecutor: (node) =>
        resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      executionContext: (() => {
        const executionContext = buildWorkspaceExecutionContext({
          jobId: job.id,
          workflowId,
          userId,
          workspaceDir
        });
        // The host attaches its model interfaces (asset persistence, …) —
        // without them an Output node that stores an image fails the run.
        environment.configureContext?.(executionContext);
        return executionContext;
      })()
    };
    if (supervisorHandle) {
      runnerOptions.supervisor = supervisorHandle;
    }
    runner = new WorkflowRunner(job.id, runnerOptions);
    hydratedGraph = hydrateGraphNodeFlags(
      runnableGraph as unknown as GraphData,
      registry
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markJobFailed(job, message);
    throw error instanceof Error ? error : new Error(message);
  }

  if (!interactive) {
    let result: WorkflowRunResult;
    try {
      result = await runner.run(
        { job_id: job.id, workflow_id: workflowId, params },
        hydratedGraph
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markJobFailed(job, message);
      throw error instanceof Error ? error : new Error(message);
    }

    await finalizeWorkflowRunJob(job, result);
    return {
      kind: "payload",
      payload: buildWorkflowRunPayload(job.id, workflowId, result, debug, {
        background: options.background ?? false
      })
    };
  }

  // Interactive: the run keeps going between round trips, so a failure
  // finalizes the job inside the run promise and becomes the final report.
  // The promise never rejects; the session depends on that.
  const runPromise = (async (): Promise<Record<string, unknown>> => {
    try {
      const result = await runner.run(
        { job_id: job.id, workflow_id: workflowId, params },
        hydratedGraph
      );
      await finalizeWorkflowRunJob(job, result);
      return buildWorkflowRunPayload(job.id, workflowId, result, debug, {
        background: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markJobFailed(job, message);
      // Keep the payload shape of a failed run — the debug surface still gets
      // a summary and verdict — instead of a bare {status, error} object.
      const failed: WorkflowRunResult = {
        status: "failed",
        error: message,
        messages: [],
        outputs: {}
      };
      return buildWorkflowRunPayload(job.id, workflowId, failed, debug, {
        background: false
      });
    } finally {
      supervisorHandle?.close();
    }
  })();

  let session: DebugSession;
  try {
    session = debugSessions.create({
      userId,
      workflowId,
      jobId: job.id,
      handle: interactiveHandle!,
      done: runPromise,
      cancel: () => runner.cancel()
    });
  } catch (error) {
    // The run is already going; without a session nobody can answer it, so
    // cancel it rather than leave an unreachable run behind.
    runner.cancel();
    if (error instanceof TooManyDebugSessionsError) {
      return { kind: "error", status: 429, detail: error.message };
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
  const event = await session.waitForEvent();
  return {
    kind: "payload",
    payload: debugSessionEventPayload(session, event)
  };
}

/** Read a session's current state without waiting. */
export function peekDebugSession(
  sessionId: string,
  userId: string
): RunWorkflowOutcome {
  const session = debugSessions.get(sessionId, userId);
  if (!session) {
    return { kind: "error", status: 404, detail: "Debug session not found" };
  }
  return {
    kind: "payload",
    payload: debugSessionEventPayload(session, session.peek())
  };
}

/**
 * Answer the escalation a run is parked on, then wait for whatever comes next
 * — the following escalation, or the run's final report.
 */
export async function submitEscalationVerdict(
  sessionId: string,
  userId: string,
  escalationId: string,
  verdict: Parameters<DebugSession["submitVerdict"]>[1]
): Promise<RunWorkflowOutcome> {
  const session = debugSessions.get(sessionId, userId);
  if (!session) {
    return { kind: "error", status: 404, detail: "Debug session not found" };
  }
  const rejected = await session.submitVerdict(escalationId, verdict);
  if (rejected) {
    return { kind: "error", status: 400, detail: rejected.error };
  }
  const event = await session.waitForEvent();
  return {
    kind: "payload",
    payload: debugSessionEventPayload(session, event)
  };
}

/** Cancel a session's run and return its final report. */
export async function cancelDebugSession(
  sessionId: string,
  userId: string
): Promise<RunWorkflowOutcome> {
  const session = debugSessions.get(sessionId, userId);
  if (!session) {
    return { kind: "error", status: 404, detail: "Debug session not found" };
  }
  const report = await session.cancel();
  return { kind: "payload", payload: { ...report, session_id: session.id } };
}
