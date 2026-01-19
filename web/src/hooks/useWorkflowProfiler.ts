/**
 * Workflow performance profiling hook.
 *
 * Provides utilities for analyzing workflow performance including:
 * - Starting performance tracking for a workflow execution
 * - Recording node execution metrics
 * - Generating performance analysis and suggestions
 *
 * @example
 * ```typescript
 * const { startTracking, recordNodeStart, recordNodeEnd, analyzePerformance } = useWorkflowProfiler();
 *
 * // At workflow start
 * startTracking(workflowId, nodes);
 *
 * // For each node execution
 * recordNodeStart(nodeId, nodeType, nodeLabel);
 * // ... node executes ...
 * recordNodeEnd(nodeId, duration, memoryEstimate);
 *
 * // After workflow completes
 * const metrics = analyzePerformance();
 * ```
 */
import { useCallback } from "react";
import usePerformanceStore, {
  NodePerformanceMetrics,
  WorkflowPerformanceMetrics
} from "../stores/PerformanceStore";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";

interface SimpleNode {
  id: string;
  type: string;
  data: { label?: string; bypassed?: boolean };
}

interface UseWorkflowProfilerReturn {
  startTracking: (
    workflowId: string,
    nodes: SimpleNode[]
  ) => void;
  recordNodeStart: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeLabel: string
  ) => void;
  recordNodeEnd: (
    workflowId: string,
    nodeId: string,
    memoryEstimate?: number
  ) => void;
  recordNodeFailed: (
    workflowId: string,
    nodeId: string
  ) => void;
  analyzePerformance: (
    workflowId: string
  ) => WorkflowPerformanceMetrics | undefined;
  getNodeMetrics: (
    workflowId: string,
    nodeId: string
  ) => NodePerformanceMetrics | undefined;
  clearProfile: (workflowId: string) => void;
  getSummary: (workflowId: string) => string;
}

export const useWorkflowProfiler = (): UseWorkflowProfilerReturn => {
  const recordExecutionStart = usePerformanceStore(
    (state: ReturnType<typeof usePerformanceStore.getState>) =>
      state.recordExecutionStart
  );
  const recordExecutionEnd = usePerformanceStore(
    (state: ReturnType<typeof usePerformanceStore.getState>) =>
      state.recordExecutionEnd
  );
  const recordExecutionFailed = usePerformanceStore(
    (state: ReturnType<typeof usePerformanceStore.getState>) =>
      state.recordExecutionFailed
  );
  const _analyzeBottlenecks = usePerformanceStore(
    (state: ReturnType<typeof usePerformanceStore.getState>) =>
      state.analyzeBottlenecks
  );
  const clearProfileStore = usePerformanceStore(
    (state: ReturnType<typeof usePerformanceStore.getState>) =>
      state.clearProfile
  );
  const getNodeMetricsStore = usePerformanceStore(
    (state: ReturnType<typeof usePerformanceStore.getState>) =>
      state.getNodeMetrics
  );
  const getDuration = useExecutionTimeStore(
    (state: ReturnType<typeof useExecutionTimeStore.getState>) =>
      state.getDuration
  );

  const startTracking = useCallback(
    (workflowId: string, nodes: SimpleNode[]) => {
      clearProfileStore(workflowId);
      for (const node of nodes) {
        if (!node.data.bypassed) {
          recordExecutionStart(
            workflowId,
            node.id,
            node.type || "unknown",
            node.data.label || node.id
          );
        }
      }
    },
    [recordExecutionStart, clearProfileStore]
  );

  const recordNodeStart = useCallback(
    (
      workflowId: string,
      nodeId: string,
      nodeType: string,
      nodeLabel: string
    ) => {
      recordExecutionStart(workflowId, nodeId, nodeType, nodeLabel);
    },
    [recordExecutionStart]
  );

  const recordNodeEnd = useCallback(
    (workflowId: string, nodeId: string, memoryEstimate?: number) => {
      const duration = getDuration(workflowId, nodeId) || 0;
      recordExecutionEnd(workflowId, nodeId, duration, memoryEstimate || 0);
    },
    [recordExecutionEnd, getDuration]
  );

  const recordNodeFailed = useCallback(
    (workflowId: string, nodeId: string) => {
      const duration = getDuration(workflowId, nodeId) || 0;
      recordExecutionFailed(workflowId, nodeId, duration);
    },
    [recordExecutionFailed, getDuration]
  );

  const analyzePerformance = useCallback(
    (workflowId: string) => {
      const metrics = usePerformanceStore.getState().profiles[workflowId];
      if (!metrics) {
        return undefined;
      }
      return metrics;
    },
    []
  );

  const getNodeMetrics = useCallback(
    (workflowId: string, nodeId: string) => {
      return getNodeMetricsStore(workflowId, nodeId);
    },
    [getNodeMetricsStore]
  );

  const clearProfile = useCallback(
    (workflowId: string) => {
      clearProfileStore(workflowId);
    },
    [clearProfileStore]
  );

  const getSummary = useCallback(
    (workflowId: string) => {
      const metrics = usePerformanceStore.getState().profiles[workflowId];
      if (!metrics) {
        return "No profiling data available";
      }

      const { totalDuration, nodeCount, bottleneckNodes } = metrics;
      const durationMs = totalDuration;
      const durationSec = (durationMs / 1000).toFixed(2);

      let summary = `Executed ${nodeCount} nodes in ${durationSec}s`;

      if (bottleneckNodes.length > 0) {
        summary += ` | ${bottleneckNodes.length} bottleneck(s) detected`;
      }

      return summary;
    },
    []
  );

  return {
    startTracking,
    recordNodeStart,
    recordNodeEnd,
    recordNodeFailed,
    analyzePerformance,
    getNodeMetrics,
    clearProfile,
    getSummary
  };
};

export default useWorkflowProfiler;
