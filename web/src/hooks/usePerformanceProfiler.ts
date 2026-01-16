import { useCallback, useEffect, useState } from "react";
import usePerformanceProfilerStore, {
  type PerformanceProfile,
  type NodePerformanceData
} from "../stores/PerformanceProfilerStore";

interface UsePerformanceProfilerOptions {
  workflowId: string;
  nodeIds: string[];
  nodeData: Record<string, { name: string; type: string }>;
  enabled?: boolean;
}

interface UsePerformanceProfilerReturn {
  profile: PerformanceProfile | null;
  isLoading: boolean;
  refresh: () => void;
  getBottlenecks: (thresholdPercent?: number) => NodePerformanceData[];
  clear: () => void;
}

export const usePerformanceProfiler = ({
  workflowId,
  nodeIds,
  nodeData,
  enabled = true
}: UsePerformanceProfilerOptions): UsePerformanceProfilerReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const profile = usePerformanceProfilerStore((state) => state.profiles[workflowId]);
  const getProfile = usePerformanceProfilerStore((state) => state.getProfile);
  const clearProfile = usePerformanceProfilerStore((state) => state.clearProfile);
  const getBottlenecksStore = usePerformanceProfilerStore((state) => state.getBottlenecks);

  const refresh = useCallback(() => {
    setIsLoading(true);
    try {
      getProfile(workflowId, nodeIds, nodeData);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, nodeIds, nodeData, getProfile]);

  const clear = useCallback(() => {
    clearProfile(workflowId);
  }, [workflowId, clearProfile]);

  const getBottlenecks = useCallback(
    (thresholdPercent: number = 50) => {
      return getBottlenecksStore(workflowId, thresholdPercent);
    },
    [workflowId, getBottlenecksStore]
  );

  useEffect(() => {
    if (enabled && nodeIds.length > 0) {
      refresh();
    }
  }, [enabled, nodeIds.length, refresh]);

  return {
    profile,
    isLoading,
    refresh,
    getBottlenecks,
    clear
  };
};

export default usePerformanceProfiler;
