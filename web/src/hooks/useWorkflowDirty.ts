import { useCallback, useSyncExternalStore } from "react";

import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

const NO_SUBSCRIPTION = () => () => {};

/** Subscribe to a workflow tab's unsaved-changes flag. */
export const useWorkflowDirty = (workflowId: string | undefined): boolean => {
  const nodeStore = useWorkflowManager((state) =>
    workflowId ? state.nodeStores[workflowId] : undefined
  );
  const subscribe = useCallback(
    (onChange: () => void) => nodeStore?.subscribe(onChange) ?? NO_SUBSCRIPTION(),
    [nodeStore]
  );
  const getSnapshot = useCallback(
    () => nodeStore?.getState().workflowIsDirty ?? false,
    [nodeStore]
  );

  return useSyncExternalStore(subscribe, getSnapshot);
};
