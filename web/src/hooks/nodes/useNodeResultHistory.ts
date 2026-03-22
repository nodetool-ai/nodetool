/**
 * useNodeResultHistory hook for accessing node execution history.
 *
 * Provides:
 * - Session history from NodeResultHistoryStore (in-memory, across runs)
 * - Asset-based history from API (persistent, loaded on demand)
 */

import { useCallback } from "react";
import { useMemo } from "react";
import { useNodeResultHistoryStore } from "../../stores/NodeResultHistoryStore";
import { HistoricalResult } from "../../stores/NodeResultHistoryStore";
import { useNodeAssets } from "../../serverState/useNodeAssets";

const resolveHistoryUri = (uri: string): string | null => {
  if (uri.startsWith("asset://")) {
    const assetId = uri.slice("asset://".length);
    return `/api/storage/${assetId}`;
  }

  if (uri.startsWith("memory://")) {
    return null;
  }

  return uri;
};

const normalizeHistoryResultUris = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHistoryResultUris(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(record)) {
    if (key === "uri" && typeof raw === "string") {
      const resolved = resolveHistoryUri(raw);
      if (resolved === null) {
        continue;
      }
      normalized[key] = resolved;
      continue;
    }

    normalized[key] = normalizeHistoryResultUris(raw);
  }

  return normalized;
};

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

  const normalizedSessionHistory = useMemo<HistoricalResult[]>(
    () =>
      sessionHistory.map((item) => ({
        ...item,
        result: normalizeHistoryResultUris(item.result)
      })),
    [sessionHistory]
  );

  return {
    // Session history (in-memory)
    sessionHistory: normalizedSessionHistory,
    historyCount,
    clearHistory,

    // Asset-based history (persistent)
    assetHistory,
    isLoadingAssets,
    loadAssetHistory
  };
};

export default useNodeResultHistory;
