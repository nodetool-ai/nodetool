import { useCallback, useSyncExternalStore } from "react";
import {
  getWorkflowRunnerStore,
  WorkflowRunner
} from "../stores/WorkflowRunner";

export const useWorkflowRunnerState = (
  workflowId: string | undefined
): WorkflowRunner["state"] | null => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!workflowId) return () => {};
      const store = getWorkflowRunnerStore(workflowId);
      return store.subscribe(onStoreChange);
    },
    [workflowId]
  );

  const getSnapshot = useCallback(() => {
    if (!workflowId) return null;
    return getWorkflowRunnerStore(workflowId).getState().state;
  }, [workflowId]);

  return useSyncExternalStore(subscribe, getSnapshot);
};

export const useIsWorkflowRunning = (
  workflowId: string | undefined
): boolean => {
  const state = useWorkflowRunnerState(workflowId);
  return state === "running";
};

export default useWorkflowRunnerState;
