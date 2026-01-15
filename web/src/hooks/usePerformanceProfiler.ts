import { useCallback } from "react";
import usePerformanceProfilerStore, {
  WorkflowPerformanceProfile,
  NodePerformanceData
} from "../stores/PerformanceProfilerStore";

export type { WorkflowPerformanceProfile, NodePerformanceData };

interface UsePerformanceProfilerReturn {
  profile: WorkflowPerformanceProfile | null;
  analyzeWorkflow: (
    workflowId: string,
    nodes: { id: string; type: string; data: Record<string, any> }[]
  ) => WorkflowPerformanceProfile | null;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | null;
  clearProfile: (workflowId: string) => void;
  getBottlenecks: (workflowId: string, limit?: number) => NodePerformanceData[];
  getSlowestNodes: (workflowId: string, limit?: number) => NodePerformanceData[];
  getErrorNodes: (workflowId: string) => NodePerformanceData[];
  getFastestNodes: (workflowId: string, limit?: number) => NodePerformanceData[];
  getAverageDuration: (workflowId: string) => number | undefined;
  getTotalDuration: (workflowId: string) => number | undefined;
}

export const usePerformanceProfiler = (): UsePerformanceProfilerReturn => {
  const profile = usePerformanceProfilerStore((state) => state.currentProfile);
  const analyzeWorkflow = usePerformanceProfilerStore((state) => state.analyzeWorkflow);
  const getProfile = usePerformanceProfilerStore((state) => state.getProfile);
  const clearProfile = usePerformanceProfilerStore((state) => state.clearProfile);
  const getBottlenecks = usePerformanceProfilerStore((state) => state.getBottlenecks);

  const getSlowestNodes = useCallback(
    (workflowId: string, limit: number = 5) => {
      const profile = getProfile(workflowId);
      if (!profile) return [];

      return [...profile.nodes]
        .filter((n) => n.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, limit);
    },
    [getProfile]
  );

  const getErrorNodes = useCallback(
    (workflowId: string) => {
      const profile = getProfile(workflowId);
      if (!profile) return [];

      return profile.nodes.filter((n) => n.hasError);
    },
    [getProfile]
  );

  const getFastestNodes = useCallback(
    (workflowId: string, limit: number = 5) => {
      const profile = getProfile(workflowId);
      if (!profile) return [];

      return [...profile.nodes]
        .filter((n) => n.duration !== undefined)
        .sort((a, b) => (a.duration || 0) - (b.duration || 0))
        .slice(0, limit);
    },
    [getProfile]
  );

  const getAverageDuration = useCallback(
    (workflowId: string) => {
      const profile = getProfile(workflowId);
      if (!profile) return undefined;

      const durations = profile.nodes
        .filter((n) => n.duration !== undefined)
        .map((n) => n.duration as number);

      if (durations.length === 0) return undefined;

      return durations.reduce((a, b) => a + b, 0) / durations.length;
    },
    [getProfile]
  );

  const getTotalDuration = useCallback(
    (workflowId: string) => {
      const profile = getProfile(workflowId);
      if (!profile) return undefined;

      return profile.totalDuration;
    },
    [getProfile]
  );

  return {
    profile,
    analyzeWorkflow,
    getProfile,
    clearProfile,
    getBottlenecks,
    getSlowestNodes,
    getErrorNodes,
    getFastestNodes,
    getAverageDuration,
    getTotalDuration
  };
};

export default usePerformanceProfiler;
