import { useCallback } from "react";
import type { Node } from "@xyflow/react";
import { useWorkflowActivityStore } from "../stores/WorkflowActivityStore";

/**
 * Hook for tracking workflow execution activity.
 * Provides functions to start, complete, fail, and cancel execution tracking.
 *
 * @example
 * ```typescript
 * const activity = useWorkflowActivity(workflowId, workflowName, nodes);
 *
 * // Workflow starts
 * const executionId = activity.start();
 *
 * // Workflow completes
 * activity.complete(executionId);
 * ```
 */
export const useWorkflowActivity = (
  workflowId: string | null,
  workflowName: string | null,
  nodes: Node[]
) => {
  const startExecution = useWorkflowActivityStore((state) => state.startExecution);
  const completeExecution = useWorkflowActivityStore((state) => state.completeExecution);
  const failExecution = useWorkflowActivityStore((state) => state.failExecution);
  const cancelExecution = useWorkflowActivityStore((state) => state.cancelExecution);

  // Start tracking when workflow runs
  const start = useCallback((): string | null => {
    if (!workflowId || !workflowName) {
      return null;
    }
    return startExecution(workflowId, workflowName, nodes);
  }, [workflowId, workflowName, nodes, startExecution]);

  // Complete execution
  const complete = useCallback(
    (executionId: string) => {
      completeExecution(executionId);
    },
    [completeExecution]
  );

  // Fail execution
  const fail = useCallback(
    (executionId: string, errorMessage: string) => {
      failExecution(executionId, errorMessage);
    },
    [failExecution]
  );

  // Cancel execution
  const cancel = useCallback(
    (executionId: string) => {
      cancelExecution(executionId);
    },
    [cancelExecution]
  );

  return {
    start,
    complete,
    fail,
    cancel
  };
};
