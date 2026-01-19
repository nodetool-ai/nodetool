/**
 * useWorkflowProfiler Hook
 *
 * Provides performance analysis and profiling utilities for workflows.
 * Analyzes execution timing, identifies bottlenecks, and generates
 * optimization suggestions.
 *
 * @example
 * ```typescript
 * const {
 *   isProfiling,
 *   startProfiling,
 *   endProfiling,
 *   bottlenecks,
 *   nodeRankings
 * } = useWorkflowProfiler(workflowId);
 * ```
 */

import { useCallback, useMemo } from "react";
import usePerformanceProfilerStore, {
  WorkflowProfile,
  BottleneckInfo,
  NodeProfile
} from "../stores/PerformanceProfilerStore";

interface UseWorkflowProfilerReturn {
  isProfiling: boolean;
  currentProfile: WorkflowProfile | null;
  latestProfile: WorkflowProfile | null;
  bottlenecks: BottleneckInfo[];
  nodeRankings: NodeProfile[];
  stats: ReturnType<typeof usePerformanceProfilerStore.getState> extends infer T
    ? T extends { getProfilerStats: () => infer R }
      ? R
      : never
    : never;
  startProfiling: () => void;
  endProfiling: () => WorkflowProfile | null;
  recordNodeExecution: (nodeId: string, nodeType: string, status: "completed" | "failed" | "running") => void;
  clearProfiles: () => void;
  formatDuration: (ms: number) => string;
  getTimelineData: () => TimelineEvent[];
  getExecutionSummary: () => ExecutionSummary;
}

interface TimelineEvent {
  nodeId: string;
  nodeType: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: "completed" | "failed" | "running";
}

interface ExecutionSummary {
  totalDuration: string;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  averageNodeDuration: string;
  slowestNode: { id: string; type: string; duration: string } | null;
  efficiency: "excellent" | "good" | "needs-improvement" | "poor";
}

export const useWorkflowProfiler = (workflowId: string): UseWorkflowProfilerReturn => {
  const {
    isProfiling,
    currentProfile,
    startProfiling: startProfilingStore,
    endProfiling: endProfilingStore,
    recordNodeExecution: recordNodeExecutionStore,
    getLatestProfile,
    getBottlenecks,
    getNodeRankings,
    getProfilerStats,
    clearProfiles: clearProfilesStore
  } = usePerformanceProfilerStore();

  const startProfiling = useCallback(() => {
    startProfilingStore(workflowId, "Workflow");
  }, [workflowId, startProfilingStore]);

  const endProfiling = useCallback(() => {
    return endProfilingStore(workflowId);
  }, [workflowId, endProfilingStore]);

  const recordNodeExecution = useCallback(
    (nodeId: string, nodeType: string, status: "completed" | "failed" | "running") => {
      recordNodeExecutionStore(workflowId, nodeId, nodeType, status);
    },
    [workflowId, recordNodeExecutionStore]
  );

  const clearProfiles = useCallback(() => {
    clearProfilesStore(workflowId);
  }, [workflowId, clearProfilesStore]);

  const latestProfile = useMemo(
    () => getLatestProfile(workflowId),
    [workflowId, getLatestProfile]
  );

  const bottlenecks = useMemo(
    () => getBottlenecks(workflowId),
    [workflowId, getBottlenecks]
  );

  const nodeRankings = useMemo(
    () => getNodeRankings(workflowId),
    [workflowId, getNodeRankings]
  );

  const stats = useMemo(
    () => getProfilerStats(),
    [getProfilerStats]
  );

  const formatDuration = useCallback((ms: number): string => {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    if (ms < 60000) {
      const seconds = ms / 1000;
      return `${seconds.toFixed(2)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }, []);

  const getTimelineData = useCallback((): TimelineEvent[] => {
    const profile = latestProfile;
    if (!profile) {
      return [];
    }

    return profile.nodes.map(node => ({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      startTime: node.startTime,
      endTime: node.endTime,
      duration: node.duration,
      status: node.status
    }));
  }, [latestProfile]);

  const getExecutionSummary = useCallback((): ExecutionSummary => {
    const profile = latestProfile;
    if (!profile) {
      return {
        totalDuration: "N/A",
        nodeCount: 0,
        completedCount: 0,
        failedCount: 0,
        averageNodeDuration: "N/A",
        slowestNode: null,
        efficiency: "good"
      };
    }

    const totalDuration = profile.totalDuration;
    const nodeCount = profile.nodes.length;
    const completedCount = profile.completedNodes;
    const failedCount = profile.failedNodes;
    const averageNodeDuration = nodeCount > 0 ? totalDuration / nodeCount : 0;

    const sortedNodes = [...profile.nodes].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const slowestNode = sortedNodes[0]
      ? {
          id: sortedNodes[0].nodeId,
          type: sortedNodes[0].nodeType,
          duration: formatDuration(sortedNodes[0].duration || 0)
        }
      : null;

    let efficiency: ExecutionSummary["efficiency"] = "good";
    if (averageNodeDuration < 1000) {
      efficiency = "excellent";
    } else if (averageNodeDuration < 5000) {
      efficiency = "good";
    } else if (averageNodeDuration < 15000) {
      efficiency = "needs-improvement";
    } else {
      efficiency = "poor";
    }

    return {
      totalDuration: formatDuration(totalDuration),
      nodeCount,
      completedCount,
      failedCount,
      averageNodeDuration: formatDuration(averageNodeDuration),
      slowestNode,
      efficiency
    };
  }, [latestProfile, formatDuration]);

  return {
    isProfiling,
    currentProfile,
    latestProfile,
    bottlenecks,
    nodeRankings,
    stats,
    startProfiling,
    endProfiling,
    recordNodeExecution,
    clearProfiles,
    formatDuration,
    getTimelineData,
    getExecutionSummary
  };
};

export default useWorkflowProfiler;
