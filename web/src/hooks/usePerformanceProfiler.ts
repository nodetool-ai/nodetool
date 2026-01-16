import { useCallback } from "react";
import usePerformanceProfilerStore from "../stores/PerformanceProfilerStore";
import { useNodes } from "../contexts/NodeContext";

export const usePerformanceProfiler = (workflowId: string) => {
  const nodes = useNodes((state) => state.nodes);
  const { profile, isAnalyzing, lastAnalyzedAt, analyzeWorkflow, clearProfile, getNodeTiming } =
    usePerformanceProfilerStore();

  const analyze = useCallback(() => {
    if (workflowId && nodes.length > 0) {
      analyzeWorkflow(workflowId, nodes);
    }
  }, [workflowId, nodes, analyzeWorkflow]);

  const refresh = useCallback(() => {
    analyze();
  }, [analyze]);

  return {
    profile,
    isAnalyzing,
    lastAnalyzedAt,
    analyze,
    refresh,
    clearProfile,
    getNodeTiming: (nodeId: string) => getNodeTiming(workflowId, nodeId),
  };
};

export default usePerformanceProfiler;
