import { useCallback } from "react";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import usePerformanceProfileStore, {
  NodePerformanceData,
  WorkflowPerformanceProfile
} from "../stores/PerformanceProfileStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

interface PerformanceProfilerResult {
  profile: WorkflowPerformanceProfile | null;
  isLoading: boolean;
  recordCurrentExecution: (
    workflowId: string,
    workflowName: string,
    nodes: Node<NodeData>[]
  ) => void;
  getNodePerformance: (workflowId: string, nodeId: string) => NodePerformanceData | undefined;
  getBottlenecks: (workflowId: string) => NodePerformanceData[];
  getPerformanceTrend: (workflowId: string) => number[];
  getTotalDuration: (workflowId: string) => number;
  clearProfile: (workflowId: string) => void;
}

export const usePerformanceProfiler = (): PerformanceProfilerResult => {
  const getDuration = useExecutionTimeStore((state) => state.getDuration);
  const recordExecution = usePerformanceProfileStore((state) => state.recordExecution);
  const getProfile = usePerformanceProfileStore((state) => state.getProfile);
  const setCurrentProfile = usePerformanceProfileStore((state) => state.setCurrentProfile);
  const clearProfile = usePerformanceProfileStore((state) => state.clearProfile);

  const recordCurrentExecution = useCallback(
    (
      workflowId: string,
      workflowName: string,
      nodes: Node<NodeData>[]
    ) => {
      const nodeTimings: Record<
        string,
        { nodeName: string; nodeType: string; duration: number }
      > = {};

      for (const node of nodes) {
        const nodeId = node.id;
        if (!nodeId) continue;
        const duration = getDuration(workflowId, nodeId);
        if (duration !== undefined) {
          nodeTimings[nodeId] = {
            nodeName: node.data?.title || nodeId,
            nodeType: node.type || "unknown",
            duration
          };
        }
      }

      if (Object.keys(nodeTimings).length > 0) {
        recordExecution(workflowId, workflowName, nodeTimings);
        setCurrentProfile(workflowId);
      }
    },
    [getDuration, recordExecution, setCurrentProfile]
  );

  const getNodePerformance = useCallback(
    (workflowId: string, nodeId: string) => {
      const profile = getProfile(workflowId);
      if (profile) {
        return profile.nodeData[nodeId];
      }
      return undefined;
    },
    [getProfile]
  );

  const getBottlenecks = useCallback(
    (workflowId: string): NodePerformanceData[] => {
      const profile = getProfile(workflowId);
      if (profile) {
        return profile.bottlenecks;
      }
      return [];
    },
    [getProfile]
  );

  const getPerformanceTrend = useCallback(
    (workflowId: string): number[] => {
      const profile = getProfile(workflowId);
      if (!profile) return [];

      const nodeDurations = Object.values(profile.nodeData);
      if (nodeDurations.length === 0) return [];

      const trends: number[] = [];
      for (const node of nodeDurations) {
        if (node.durations.length > 1) {
          const recent = node.durations.slice(-5);
          const older = node.durations.slice(-10, -5);
          if (older.length > 0) {
            const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
            trends.push(((recentAvg - olderAvg) / olderAvg) * 100);
          }
        }
      }
      return trends;
    },
    [getProfile]
  );

  const getTotalDuration = useCallback(
    (workflowId: string): number => {
      const profile = getProfile(workflowId);
      if (profile) {
        return profile.totalDuration;
      }
      return 0;
    },
    [getProfile]
  );

  return {
    profile: null,
    isLoading: false,
    recordCurrentExecution,
    getNodePerformance,
    getBottlenecks,
    getPerformanceTrend,
    getTotalDuration,
    clearProfile
  };
};

export default usePerformanceProfiler;
