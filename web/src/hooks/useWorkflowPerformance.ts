import { useCallback, useMemo } from "react";
import usePerformanceStore, { PerformanceSnapshot, PerformanceMetrics, NodePerformance } from "../stores/PerformanceStore";

export interface WorkflowPerformanceAnalysis {
  metrics: PerformanceMetrics | null;
  nodePerformances: NodePerformance[];
  bottleneckNodes: NodePerformance[];
  fastNodes: NodePerformance[];
  recommendations: string[];
  performanceScore: number;
  isSlow: boolean;
}

export interface UseWorkflowPerformanceReturn {
  analysis: WorkflowPerformanceAnalysis;
  snapshots: PerformanceSnapshot[];
  latestSnapshot: PerformanceSnapshot | null;
  recordExecution: (nodeCount: number) => void;
  clearSnapshots: () => void;
  getNodePerformance: (nodeId: string) => NodePerformance | null;
}

export const useWorkflowPerformance = (workflowId: string): UseWorkflowPerformanceReturn => {
  const recordExecution = useCallback((nodeCount: number) => {
    usePerformanceStore.getState().recordExecution(workflowId, nodeCount);
  }, [workflowId]);

  const clearSnapshots = useCallback(() => {
    usePerformanceStore.getState().clearSnapshots(workflowId);
  }, [workflowId]);

  const getNodePerformance = useCallback((nodeId: string) => {
    return usePerformanceStore.getState().getNodePerformance(workflowId, nodeId);
  }, [workflowId]);

  const snapshots = useMemo(() =>
    usePerformanceStore.getState().getSnapshots(workflowId),
    [workflowId]
  );

  const latestSnapshot = useMemo(() =>
    usePerformanceStore.getState().getLatestSnapshot(workflowId),
    [workflowId]
  );

  const analysis = useMemo((): WorkflowPerformanceAnalysis => {
    if (!latestSnapshot) {
      return {
        metrics: null,
        nodePerformances: [],
        bottleneckNodes: [],
        fastNodes: [],
        recommendations: [],
        performanceScore: 100,
        isSlow: false
      };
    }

    const { metrics, nodePerformances } = latestSnapshot;

    const bottleneckNodes = nodePerformances
      .filter(n => n.isBottleneck)
      .sort((a, b) => b.duration - a.duration);

    const fastNodes = nodePerformances
      .filter(n => !n.isBottleneck)
      .sort((a, b) => a.duration - b.duration)
      .slice(0, 5);

    const recommendations: string[] = [];

    if (bottleneckNodes.length > 0) {
      recommendations.push(`Consider optimizing ${bottleneckNodes.length} bottleneck node(s) that take significantly longer than average.`);
    }

    if (metrics.averageNodeDuration > 5000) {
      recommendations.push("Average node execution time is over 5 seconds. Consider caching or parallelizing operations.");
    }

    if (metrics.p95NodeDuration > metrics.averageNodeDuration * 3) {
      recommendations.push("High variance in execution times suggests inconsistent node performance. Review resource allocation.");
    }

    if (metrics.nodeCount > 20 && metrics.parallelizableNodes.length > 5) {
      recommendations.push("Several nodes could potentially run in parallel. Consider restructuring dependencies.");
    }

    const _maxDuration = Math.max(...nodePerformances.map(n => n.duration), 1);
    const performanceScore = Math.max(0, Math.min(100,
      100 - (bottleneckNodes.length * 15) - (metrics.totalDuration > 60000 ? 10 : 0)
    ));

    return {
      metrics,
      nodePerformances,
      bottleneckNodes,
      fastNodes,
      recommendations,
      performanceScore,
      isSlow: metrics.totalDuration > 30000 || bottleneckNodes.length > 2
    };
  }, [latestSnapshot]);

  return {
    analysis,
    snapshots,
    latestSnapshot,
    recordExecution,
    clearSnapshots,
    getNodePerformance
  };
};

export default useWorkflowPerformance;
