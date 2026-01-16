import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";
import useStatusStore from "./StatusStore";

export interface PerformanceMetrics {
  totalDuration: number;
  nodeCount: number;
  completedNodeCount: number;
  failedNodeCount: number;
  pendingNodeCount: number;
  averageNodeDuration: number;
  bottleneckNodes: BottleneckNode[];
  parallelizableNodes: ParallelizableGroup[];
  metrics: {
    throughput: number;
    efficiency: number;
    concurrencyScore: number;
  };
}

export interface BottleneckNode {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  percentageOfTotal: number;
  severity: "critical" | "high" | "medium" | "low";
}

export interface ParallelizableGroup {
  nodes: { nodeId: string; nodeLabel: string; duration: number }[];
  potentialSavings: number;
  description: string;
}

interface PerformanceProfilerStore {
  profile: PerformanceMetrics | null;
  isAnalyzing: boolean;
  lastAnalyzedAt: number | null;
  analyzeWorkflow: (workflowId: string, nodes: { id: string; type: string; data: any }[]) => void;
  clearProfile: () => void;
  getNodeTiming: (workflowId: string, nodeId: string) => number | undefined;
}

const BOTTLENECK_THRESHOLDS = {
  critical: 50,
  high: 25,
  medium: 10,
  low: 5,
};

const calculateSeverity = (percentage: number): "critical" | "high" | "medium" | "low" => {
  if (percentage >= BOTTLENECK_THRESHOLDS.critical) return "critical";
  if (percentage >= BOTTLENECK_THRESHOLDS.high) return "high";
  if (percentage >= BOTTLENECK_THRESHOLDS.medium) return "medium";
  return "low";
};

const findParallelizableGroups = (
  nodes: { id: string; type: string; data: any }[],
  timings: Record<string, { startTime: number; endTime?: number }>,
  nodeDurations: Map<string, number>
): ParallelizableGroup[] => {
  const groups: ParallelizableGroup[] = [];
  const processed = new Set<string>();

  for (const node of nodes) {
    if (processed.has(node.id)) continue;

    const duration = nodeDurations.get(node.id) || 0;
    if (duration < 100) continue;

    const sameTypeNodes = nodes.filter(
      (n) =>
        n.type === node.type &&
        !processed.has(n.id) &&
        nodeDurations.get(n.id) &&
        nodeDurations.get(n.id)! > 50
    );

    if (sameTypeNodes.length >= 2) {
      const groupNodes = sameTypeNodes.map((n) => ({
        nodeId: n.id,
        nodeLabel: n.data?.label || n.id,
        duration: nodeDurations.get(n.id) || 0,
      }));

      const maxDuration = Math.max(...groupNodes.map((n) => n.duration));
      const totalDuration = groupNodes.reduce((sum, n) => sum + n.duration, 0);
      const potentialSavings = totalDuration - maxDuration;

      if (potentialSavings > 100) {
        groups.push({
          nodes: groupNodes,
          potentialSavings,
          description: `${sameTypeNodes.length} nodes of type "${node.type}" could potentially run in parallel`,
        });
        sameTypeNodes.forEach((n) => processed.add(n.id));
      }
    }
  }

  return groups.sort((a, b) => b.potentialSavings - a.potentialSavings);
};

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  profile: null,
  isAnalyzing: false,
  lastAnalyzedAt: null,

  analyzeWorkflow: (workflowId: string, nodes: { id: string; type: string; data: any }[]) => {
    set({ isAnalyzing: true });

    const executionTimeStore = useExecutionTimeStore.getState();
    const statusStore = useStatusStore.getState();

    const nodeTimings = new Map<string, number>();
    const nodeDurations = new Map<string, number>();
    const nodeLabels = new Map<string, string>();
    const nodeTypes = new Map<string, string>();

    let totalDuration = 0;
    let completedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const node of nodes) {
      const duration = executionTimeStore.getDuration(workflowId, node.id);
      const status = statusStore.getStatus(workflowId, node.id);

      nodeLabels.set(node.id, node.data?.label || node.id);
      nodeTypes.set(node.id, node.type);

      if (duration !== undefined) {
        nodeTimings.set(node.id, duration);
        nodeDurations.set(node.id, duration);
        totalDuration = Math.max(totalDuration, duration + (duration * 0.1));

        if (status === "completed" || status === "success") {
          completedCount++;
        } else if (status === "error" || status === "failed") {
          failedCount++;
        }
      } else {
        pendingCount++;
      }
    }

    const sortedTimings = Array.from(nodeDurations.entries())
      .sort((a, b) => b[1] - a[1]);

    const bottleneckNodes: BottleneckNode[] = sortedTimings.slice(0, 5).map(([nodeId, duration]) => {
      const percentage = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
      return {
        nodeId,
        nodeType: nodeTypes.get(nodeId) || "unknown",
        nodeLabel: nodeLabels.get(nodeId) || nodeId,
        duration,
        percentageOfTotal: Math.round(percentage * 10) / 10,
        severity: calculateSeverity(percentage),
      };
    });

    const parallelizableGroups = findParallelizableGroups(nodes, {}, nodeDurations);

    const completedNodesWithTiming = Array.from(nodeDurations.values()).filter((d) => d > 0);
    const averageDuration =
      completedNodesWithTiming.length > 0
        ? completedNodesWithTiming.reduce((sum, d) => sum + d, 0) / completedNodesWithTiming.length
        : 0;

    const throughput = completedCount > 0 && totalDuration > 0 ? completedCount / (totalDuration / 1000) : 0;
    const efficiency =
      completedNodesWithTiming.length > 0
        ? Math.min(100, (completedCount / Math.max(completedCount + pendingCount, 1)) * 100)
        : 0;
    const concurrencyScore = parallelizableGroups.length > 0 ? Math.min(100, parallelizableGroups.length * 20) : 0;

    const profile: PerformanceMetrics = {
      totalDuration,
      nodeCount: nodes.length,
      completedNodeCount: completedCount,
      failedNodeCount: failedCount,
      pendingNodeCount: pendingCount,
      averageNodeDuration: Math.round(averageDuration),
      bottleneckNodes,
      parallelizableNodes: parallelizableGroups,
      metrics: {
        throughput: Math.round(throughput * 100) / 100,
        efficiency: Math.round(efficiency),
        concurrencyScore: Math.round(concurrencyScore),
      },
    };

    set({
      profile,
      isAnalyzing: false,
      lastAnalyzedAt: Date.now(),
    });
  },

  clearProfile: () => {
    set({ profile: null, lastAnalyzedAt: null });
  },

  getNodeTiming: (workflowId: string, nodeId: string) => {
    return useExecutionTimeStore.getState().getDuration(workflowId, nodeId);
  },
}));

export default usePerformanceProfilerStore;
