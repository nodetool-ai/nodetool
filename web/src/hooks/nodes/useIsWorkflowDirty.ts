import React from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

// Custom hook to get the dirty status of a specific workflow
export const useIsWorkflowDirty = (
  workflowId: string | null | undefined
): boolean => {
  // Hook 1 (always called)
  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);

  // This value might change, but it's not a hook itself, it's the API to a store (or undefined)
  const nodeStoreApiHook = workflowId ? getNodeStore(workflowId) : undefined;

  // Hook 2 (always called)
  const [isDirty, setIsDirty] = React.useState(() => {
    // Initial state based on the store's current value if available
    if (nodeStoreApiHook) {
      return nodeStoreApiHook.getState().workflowIsDirty;
    }
    return false;
  });

  // Hook 3 (always called)
  React.useEffect(() => {
    if (nodeStoreApiHook) {
      // Subscribe to the specific store instance
      const unsubscribe = nodeStoreApiHook.subscribe((state) => {
        // Listener for all changes in the specific nodeStore
        setIsDirty(state.workflowIsDirty);
      });
      // Update state immediately in case it changed between useState init and useEffect run
      // This ensures the most current state is reflected.
      setIsDirty(nodeStoreApiHook.getState().workflowIsDirty);
      return unsubscribe; // Cleanup subscription on unmount or if dependencies change
    } else {
      setIsDirty(false); // No store or invalid ID, so not dirty
    }
  }, [nodeStoreApiHook, workflowId]); // Re-run effect if the store hook or ID changes

  return isDirty;
};
