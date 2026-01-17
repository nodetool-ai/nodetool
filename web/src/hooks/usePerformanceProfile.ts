import { useCallback } from "react";
import usePerformanceStore, { PerformanceMetrics } from "../stores/PerformanceStore";
import { Node } from "@xyflow/react";

interface UsePerformanceProfile {
  metrics: PerformanceMetrics | null;
  isAnalyzing: boolean;
  analyzePerformance: (workflowId: string, nodes: Node[]) => void;
  clearMetrics: () => void;
}

export const usePerformanceProfile = (): UsePerformanceProfile => {
  const metrics = usePerformanceStore((state) => state.metrics);
  const isAnalyzing = usePerformanceStore((state) => state.isAnalyzing);
  const analyzePerformance = usePerformanceStore((state) => state.analyzePerformance);
  const clearMetrics = usePerformanceStore((state) => state.clearMetrics);

  return {
    metrics,
    isAnalyzing,
    analyzePerformance: useCallback(
      (workflowId: string, nodes: Node[]) => {
        analyzePerformance(workflowId, nodes);
      },
      [analyzePerformance]
    ),
    clearMetrics: useCallback(() => {
      clearMetrics();
    }, [clearMetrics]),
  };
};
