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
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { nodeKey } from "../../stores/nodeKey";
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
 * Reactive hook that returns the node result, preferring the output result
 * (from OutputUpdate messages) and falling back to the generic result, resolved
 * against the workflow's focused run.
 * This mirrors the `outputResults[key] ?? results[key]` pattern used in
 * BaseNode.tsx.
 */
export function useNodeResultValue(
  workflowId: string,
  nodeId: string
): unknown {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useResultsStore((s) =>
    jobId
      ? s.getOutputResult(workflowId, jobId, nodeId) ??
        s.getResult(workflowId, jobId, nodeId)
      : undefined
  );
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
 *  - `result`         — `outputResults[key] ?? results[key]` (same as `useNodeResultValue`)
 *  - `output`         — raw `outputResults[key]`
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
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  return useResultsStore(
    useShallow((s) => {
      if (!jobId) {
        return {
          result: undefined,
          output: undefined,
          chunk: undefined,
          task: undefined,
          toolCall: undefined,
          planningUpdate: undefined
        };
      }
      const key = nodeKey(workflowId, jobId, nodeId);
      return {
        result: s.outputResults[key] ?? s.results[key],
        output: s.outputResults[key],
        chunk: s.chunks[key] as string | undefined,
        task: s.tasks[key],
        toolCall: s.toolCalls[key],
        planningUpdate: s.planningUpdates[key]
      };
    })
  );
}
