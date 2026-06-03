/**
 * Node execution-state accessor hooks.
 *
 * These hooks centralize all reads of per-node execution state (status, errors,
 * progress, results, timing, etc.) behind a single indirection layer so that
 * a future "focused-run" lens can be resolved in exactly one place — the bodies
 * of these hooks — rather than scattered across every consuming component.
 *
 * TODAY (behavior-neutral): each hook simply delegates to the underlying store
 * getter, keyed by (workflowId, nodeId).  In a later task the hook bodies will
 * be changed to resolve the *focused job* for concurrent same-workflow runs;
 * consumers will not need to change.
 */

import { useShallow } from "zustand/react/shallow";
import useStatusStore from "../../stores/StatusStore";
import useErrorStore, { hasNodeError } from "../../stores/ErrorStore";
import useResultsStore from "../../stores/ResultsStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
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
 * Reactive hook that returns the current status for the given workflow+node.
 * Equivalent to `useStatusStore(s => s.getStatus(workflowId, nodeId))`.
 */
export function useNodeStatus(
  workflowId: string,
  nodeId: string
): StatusValue | undefined {
  return useStatusStore((s) => s.getStatus(workflowId, nodeId));
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the current error for the given workflow+node.
 * Equivalent to `useErrorStore(s => s.getError(workflowId, nodeId))`.
 */
export function useNodeError(
  workflowId: string,
  nodeId: string
): NodeError {
  return useErrorStore((s) => s.getError(workflowId, nodeId));
}

/**
 * Reactive hook that returns `true` if the node currently has an error.
 * Equivalent to `useErrorStore(s => hasNodeError(s.getError(workflowId, nodeId)))`.
 */
export function useNodeHasError(
  workflowId: string,
  nodeId: string
): boolean {
  return useErrorStore((s) => hasNodeError(s.getError(workflowId, nodeId)));
}

// ── Progress ─────────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the current progress for the given workflow+node.
 * Equivalent to `useResultsStore(s => s.getProgress(workflowId, nodeId))`.
 */
export function useNodeProgress(
  workflowId: string,
  nodeId: string
): { progress: number; total: number; chunk?: string } | undefined {
  return useResultsStore((s) => s.getProgress(workflowId, nodeId));
}

// ── Execution duration ───────────────────────────────────────────────────────

/**
 * Reactive hook that returns the execution duration (ms) for the given
 * workflow+node, or `undefined` if execution has not completed.
 * Equivalent to `useExecutionTimeStore(s => s.getDuration(workflowId, nodeId))`.
 */
export function useNodeExecutionDuration(
  workflowId: string,
  nodeId: string
): number | undefined {
  return useExecutionTimeStore((s) => s.getDuration(workflowId, nodeId));
}

// ── Edge status ──────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the status of a workflow edge.
 * Note: the second parameter is `edgeId`, not `nodeId`.
 * Equivalent to `useResultsStore(s => s.getEdge(workflowId, edgeId))`.
 */
export function useEdgeStatus(
  workflowId: string,
  edgeId: string
): { status: string; counter?: number } | undefined {
  return useResultsStore((s) => s.getEdge(workflowId, edgeId));
}

// ── Provider cost ────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the LLM provider cost accrued by this node.
 * Equivalent to `useResultsStore(s => s.getProviderCost(workflowId, nodeId))`.
 */
export function useNodeProviderCost(
  workflowId: string,
  nodeId: string
): ProviderCost | undefined {
  return useResultsStore((s) => s.getProviderCost(workflowId, nodeId));
}

// ── Result value ─────────────────────────────────────────────────────────────

/**
 * Reactive hook that returns the node result, preferring the output result
 * (from OutputUpdate messages) and falling back to the generic result.
 * This mirrors the `outputResults[key] ?? results[key]` pattern used in
 * BaseNode.tsx.
 * Equivalent to:
 *   `useResultsStore(s => s.getOutputResult(workflowId, nodeId) ?? s.getResult(workflowId, nodeId))`
 */
export function useNodeResultValue(
  workflowId: string,
  nodeId: string
): unknown {
  return useResultsStore(
    (s) => s.getOutputResult(workflowId, nodeId) ?? s.getResult(workflowId, nodeId)
  );
}

// ── Node artifacts (multi-value shallow selector) ────────────────────────────

/**
 * Reactive hook that returns all streaming / agent artifacts for a node in a
 * single stable object.  Uses `useShallow` so that the returned object
 * reference only changes when one of the individual values changes — mirroring
 * exactly the `useShallow` selector that BaseNode.tsx uses to subscribe to
 * these six maps in one subscription.
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
  return useResultsStore(
    useShallow((s) => {
      const key = `${workflowId}:${nodeId}`;
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
