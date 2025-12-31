import { useState, useEffect } from "react";
import {
  getWorkflowRunnerStore,
  WorkflowRunner
} from "../stores/WorkflowRunner";

/**
 * Hook to subscribe to a specific workflow's runner state.
 * Returns the current runner state for the given workflow ID.
 *
 * @param workflowId - The ID of the workflow to watch
 * @returns The current runner state ("idle", "connecting", "connected", "running", "error", "cancelled") or null if no store exists
 */
export const useWorkflowRunnerState = (
  workflowId: string | undefined
): WorkflowRunner["state"] | null => {
  const [runnerState, setRunnerState] = useState<WorkflowRunner["state"] | null>(
    null
  );

  useEffect(() => {
    if (!workflowId) {
      setRunnerState(null);
      return;
    }

    const store = getWorkflowRunnerStore(workflowId);

    // Initialize from current state
    setRunnerState(store.getState().state);

    // Subscribe to state changes
    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.state !== prevState.state) {
        setRunnerState(state.state);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [workflowId]);

  return runnerState;
};

/**
 * Hook to check if a workflow is currently running.
 *
 * @param workflowId - The ID of the workflow to check
 * @returns true if the workflow is in "running" state, false otherwise
 */
export const useIsWorkflowRunning = (
  workflowId: string | undefined
): boolean => {
  const state = useWorkflowRunnerState(workflowId);
  return state === "running";
};

export default useWorkflowRunnerState;
