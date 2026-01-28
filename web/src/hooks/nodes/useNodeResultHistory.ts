/**
 * useNodeResultHistory hook for accessing node execution history.
 *
 * Provides:
 * - Session history from NodeResultHistoryStore (in-memory, across runs)
 * - Asset-based history from API (persistent, loaded on demand)
 */

import { useCallback } from "react";
import { useNodeResultHistoryStore } from "../../stores/NodeResultHistoryStore";
import { useNodeAssets } from "../../serverState/useNodeAssets";

export const useNodeResultHistory = (
  workflowId: string | null,
  nodeId: string | null
) => {
  const sessionHistory = useNodeResultHistoryStore((state) =>
    workflowId && nodeId ? state.getHistory(workflowId, nodeId) : []
  );

  const historyCount = useNodeResultHistoryStore((state) =>
    workflowId && nodeId ? state.getHistoryCount(workflowId, nodeId) : 0
  );

  const clearNodeHistory = useNodeResultHistoryStore(
    (state) => state.clearNodeHistory
  );

  // Asset-based history (loaded on demand)
  const {
    data: assetHistory,
    isLoading: isLoadingAssets,
    refetch: loadAssetHistory
  } = useNodeAssets(nodeId, false);

  const clearHistory = useCallback(() => {
    if (workflowId && nodeId) {
      clearNodeHistory(workflowId, nodeId);
    }
  }, [workflowId, nodeId, clearNodeHistory]);

  return {
    // Session history (in-memory)
    sessionHistory,
    historyCount,
    clearHistory,

    // Asset-based history (persistent)
    assetHistory,
    isLoadingAssets,
    loadAssetHistory
  };
};

export default useNodeResultHistory;
