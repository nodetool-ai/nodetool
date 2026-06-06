/**
 * Node execution-state accessor hooks.
 *
 * These hooks centralize all reads of per-node execution state (status, errors,
 * progress, results, timing, etc.) behind a single indirection layer so that
 * a future "focused-run" lens can be resolved in exactly one place — the bodies
 * of these hooks — rather than scattered across every consuming component.
 *
 * Status, error, execution-duration, progress, results, edges, and provider
 * cost are all scoped per run: these hooks resolve the workflow's *focused job*
 * (WorkflowRunsStore) and key the underlying store by
 * `(workflowId, focusedJobId, nodeId)`.  For a single run the focused job is
 * that run, so behavior is unchanged.  When there is no focused job they return
 * `undefined`/`false`/empty.
 */

import { useShallow } from "zustand/react/shallow";
import useStatusStore from "../../stores/StatusStore";
import useErrorStore, { hasNodeError } from "../../stores/ErrorStore";
import useResultsStore from "../../stores/ResultsStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import useWorkflowRunsStore, {
  type RunState
} from "../../stores/WorkflowRunsStore";
import { nodeKey } from "../../stores/nodeKey";
import { useNodeGenerations } from "./useNodeGenerations";
import { outputOf } from "../../utils/nodeGenerations";
import type { PlanningUpdate, ProviderCost, Task, ToolCallUpdate } from "../../stores/ApiTypes";

// ── Type re-exports (keep consumers from reaching into individual stores) ────

/** Status value as stored by StatusStore. */
type StatusValue = string | Record<string, unknown> | null | undefined;

interface ErrorObject {
  message?: string;
  [key: string]: unknown;
}
/** Error value as stored by ErrorStore. */
type NodeError = Error | string | null | ErrorObject;

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the current status for the given workflow+node,
 * resolved against the workflow's focused run. Re-renders on focus change AND
 * on status change (both stores are subscribed).
 */
export function useNodeStatus(
  workflowId: string,
  nodeId: string
): StatusValue | undefined {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useStatusStore((s) =>
    jobId ? s.getStatus(workflowId, jobId, nodeId) : undefined
  );
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the current error for the given workflow+node,
 * resolved against the workflow's focused run.
 */
export function useNodeError(
  workflowId: string,
  nodeId: string
): NodeError | undefined {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useErrorStore((s) =>
    jobId ? s.getError(workflowId, jobId, nodeId) : undefined
  );
}

/**
 * Reactive hook that returns `true` if the node currently has an error in the
 * workflow's focused run.
 */
export function useNodeHasError(
  workflowId: string,
  nodeId: string
): boolean {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useErrorStore((s) =>
    jobId ? hasNodeError(s.getError(workflowId, jobId, nodeId)) : false
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the current progress for the given workflow+node,
 * resolved against the workflow's focused run.
 */
export function useNodeProgress(
  workflowId: string,
  nodeId: string
): { progress: number; total: number; chunk?: string } | undefined {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useResultsStore((s) =>
    jobId ? s.getProgress(workflowId, jobId, nodeId) : undefined
  );
}

// ── Execution duration ───────────────────────────────────────────────────────

/**
 * Reactive hook that returns the execution duration (ms) for the given
 * workflow+node in the workflow's focused run, or `undefined` if execution has
 * not completed (or there is no focused run).
 */
export function useNodeExecutionDuration(
  workflowId: string,
  nodeId: string
): number | undefined {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useExecutionTimeStore((s) =>
    jobId ? s.getDuration(workflowId, jobId, nodeId) : undefined
  );
}

// ── Edge status ──────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the status of a workflow edge in the workflow's
 * focused run. Note: the second parameter is `edgeId`, not `nodeId`.
 */
export function useEdgeStatus(
  workflowId: string,
  edgeId: string
): { status: string; counter?: number } | undefined {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useResultsStore((s) =>
    jobId ? s.getEdge(workflowId, jobId, edgeId) : undefined
  );
}

// ── Provider cost ────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the LLM provider cost accrued by this node in the
 * workflow's focused run.
 */
export function useNodeProviderCost(
  workflowId: string,
  nodeId: string
): ProviderCost | undefined {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useResultsStore((s) =>
    jobId ? s.getProviderCost(workflowId, jobId, nodeId) : undefined
  );
}

// ── Result value ─────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the node's own latest output value, resolved from
 * its generation timeline (durable assets merged with the live buffer, honoring
 * the node's persisted selection). Returns `undefined` when no generation has
 * been produced yet.
 */
export function useNodeResultValue(
  workflowId: string,
  nodeId: string
): unknown {
  const { current } = useNodeGenerations(workflowId, nodeId);
  return current ? outputOf(current) : undefined;
}

// ── Ambient liveness (other concurrent runs) ─────────────────────────────────

/** Node-level statuses that mean the node is actively executing. */
const ACTIVE_NODE_STATUSES: ReadonlySet<string> = new Set([
  "running",
  "starting",
  "booting"
]);

/**
 * Run-level states that are finished. We skip these purely as a perf bound so
 * we don't scan historical runs; the per-node status check below is the real
 * "is this run executing this node right now" signal. We deliberately do NOT
 * require state === "running": the run-level state can lag behind the per-node
 * updates (a run can be executing nodes while its RunState is still "queued"),
 * and gating on "running" would silently hide the ambient signal.
 */
const TERMINAL_RUN_STATES: ReadonlySet<RunState> = new Set([
  "completed",
  "error",
  "cancelled"
]);

/**
 * Reactive hook that returns how many *other* runs (i.e. not the focused run)
 * are currently executing this node. The focused run is already represented by
 * the node's primary running animation, so it is excluded here.
 *
 * Any non-terminal run is considered — the run-level state can lag behind the
 * per-node updates — and within those only the ones where this node's status is
 * active (running/starting/booting). Drives the ambient-liveness ring + badge so
 * the canvas signals work happening in runs the user is not currently focused on.
 */
export function useNodeActiveRunCount(
  workflowId: string,
  nodeId: string
): number {
  const focusedJob = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const runs = useWorkflowRunsStore((s) => s.runs[workflowId]);
  return useStatusStore((s) => {
    if (!runs) {
      return 0;
    }
    let count = 0;
    for (const jobId in runs) {
      if (jobId === focusedJob) {
        continue;
      }
      if (TERMINAL_RUN_STATES.has(runs[jobId].state)) {
        continue;
      }
      const status = s.getStatus(workflowId, jobId, nodeId);
      if (typeof status === "string" && ACTIVE_NODE_STATUSES.has(status)) {
        count++;
      }
    }
    return count;
  });
}

// ── Node artifacts (multi-value shallow selector) ────────────────────────────

/**
 * Reactive hook that returns all streaming / agent artifacts for a node in a
 * single stable object, resolved against the workflow's focused run.  Uses
 * `useShallow` so that the returned object reference only changes when one of
 * the individual values changes — mirroring exactly the `useShallow` selector
 * that BaseNode.tsx uses to subscribe to these six maps in one subscription.
 *
 * Fields:
 *  - `result`         — the current generation's resolved value (same as `useNodeResultValue`)
 *  - `output`         — the current generation's full `outputs` record
 *  - `chunk`          — accumulated text chunks
 *  - `task`           — latest Task object from the agent planner
 *  - `toolCall`       — latest ToolCallUpdate
 *  - `planningUpdate` — latest PlanningUpdate
 */
export function useNodeArtifacts(
  workflowId: string,
  nodeId: string
): {
  result: unknown;
  output: unknown;
  chunk: string | undefined;
  task: Task | undefined;
  toolCall: ToolCallUpdate | undefined;
  planningUpdate: PlanningUpdate | undefined;
} {
  // `result`/`output` resolve from the node's generation timeline (durable
  // assets merged with the live buffer, honoring its selection) so previews
  // don't blank when focus moves to a per-node run.
  const { current } = useNodeGenerations(workflowId, nodeId);
  // The live signals (chunk/task/toolCall/planning) stay scoped to the focused
  // run — they only mean something for the run in progress.
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const transient = useResultsStore(
    useShallow((s) => {
      const key = jobId ? nodeKey(workflowId, jobId, nodeId) : undefined;
      return {
        chunk: key ? (s.chunks[key] as string | undefined) : undefined,
        task: key ? s.tasks[key] : undefined,
        toolCall: key ? s.toolCalls[key] : undefined,
        planningUpdate: key ? s.planningUpdates[key] : undefined
      };
    })
  );
  return {
    result: current ? outputOf(current) : undefined,
    output: current?.outputs,
    ...transient
  };
}
