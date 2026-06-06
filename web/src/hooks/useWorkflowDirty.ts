import { useEffect, useState } from "react";

import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import type { NodeStoreState } from "../stores/NodeStore";

/** Subscribe to a workflow tab's unsaved-changes flag. */
export const useWorkflowDirty = (workflowId: string | undefined): boolean => {
  const nodeStore = useWorkflowManager((state) =>
    workflowId ? state.nodeStores[workflowId] : undefined
  );
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!nodeStore) {
      setIsDirty(false);
      return;
    }

    setIsDirty(nodeStore.getState().workflowIsDirty);

    const unsubscribe = nodeStore.subscribe(
      (state: NodeStoreState, prev: NodeStoreState) => {
        if (state.workflowIsDirty !== prev.workflowIsDirty) {
          setIsDirty(state.workflowIsDirty);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [nodeStore]);

  return isDirty;
};
