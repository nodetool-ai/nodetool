/**
 * useWorkflowProfiler Hook
 *
 * Provides workflow performance analysis functionality:
 * - Analyzes workflow structure to estimate execution time
 * - Identifies bottlenecks and optimization opportunities
 * - Tracks actual execution times for comparison
 *
 * @example
 * ```typescript
 * const {
 *   profile,
 *   analyze,
 *   suggestions,
 *   isAnalyzing
 * } = useWorkflowProfiler(workflowId);
 *
 * // Analyze current workflow
 * analyze(nodes, edges);
 * ```
 */
import { useCallback, useMemo } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useWorkflowProfilerStore, {
  WorkflowProfile,
  OptimizationSuggestion,
  PerformanceMetric,
  LayerAnalysis,
} from "../stores/WorkflowProfilerStore";

export interface UseWorkflowProfilerReturn {
  profile: WorkflowProfile | undefined;
  isAnalyzing: boolean;
  analyze: (nodes: Node<NodeData>[], edges: Edge[]) => WorkflowProfile;
  getSuggestions: () => OptimizationSuggestion[];
  updateNodeTiming: (nodeId: string, actualTime: number) => void;
  clearProfile: () => void;
  formatTime: (ms: number) => string;
  getSeverityColor: (severity: string) => string;
  getTypeIcon: (type: string) => string;
}

export const useWorkflowProfiler = (
  workflowId: string
): UseWorkflowProfilerReturn => {
  const profile = useWorkflowProfilerStore((state) =>
    state.profiles[workflowId]
  );
  const analyzeWorkflow = useWorkflowProfilerStore(
    (state) => state.analyzeWorkflow
  );
  const updateActualTime = useWorkflowProfilerStore(
    (state) => state.updateActualTime
  );
  const clearProfile = useWorkflowProfilerStore((state) => state.clearProfile);
  const getStoreSuggestions = useWorkflowProfilerStore(
    (state) => state.getSuggestions
  );

  const isAnalyzing = useMemo(() => false, []);

  const analyze = useCallback(
    (nodes: Node<NodeData>[], edges: Edge[]) => {
      return analyzeWorkflow(workflowId, nodes, edges);
    },
    [analyzeWorkflow, workflowId]
  );

  const getSuggestions = useCallback(() => {
    return getStoreSuggestions(workflowId);
  }, [getStoreSuggestions, workflowId]);

  const updateNodeTiming = useCallback(
    (nodeId: string, actualTime: number) => {
      updateActualTime(workflowId, nodeId, actualTime);
    },
    [updateActualTime, workflowId]
  );

  const handleClearProfile = useCallback(() => {
    clearProfile(workflowId);
  }, [clearProfile, workflowId]);

  const formatTime = useCallback((ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      const seconds = Math.floor(ms / 1000);
      const milliseconds = ms % 1000;
      return `${seconds}s ${milliseconds}ms`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }, []);

  const getSeverityColor = useCallback((severity: string): string => {
    switch (severity) {
      case "high":
        return "error.main";
      case "medium":
        return "warning.main";
      case "low":
        return "info.main";
      default:
        return "text.secondary";
    }
  }, []);

  const getTypeIcon = useCallback((type: string): string => {
    switch (type) {
      case "bottleneck":
        return "⚠️";
      case "parallelization":
        return "⚡";
      case "memory":
        return "💾";
      case "caching":
        return "📦";
      case "general":
        return "💡";
      default:
        return "📊";
    }
  }, []);

  return {
    profile,
    isAnalyzing,
    analyze,
    getSuggestions,
    updateNodeTiming,
    clearProfile: handleClearProfile,
    formatTime,
    getSeverityColor,
    getTypeIcon,
  };
};

export default useWorkflowProfiler;
