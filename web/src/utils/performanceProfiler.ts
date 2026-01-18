/**
 * Performance Profiler Utility
 *
 * Analyzes workflow execution performance to identify bottlenecks
 * and provide optimization insights.
 */

export interface NodePerformance {
  nodeId: string;
  nodeType: string;
  duration: number;
  percentage: number;
  status: "completed" | "failed" | "pending";
}

export interface WorkflowPerformance {
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  nodes: NodePerformance[];
  bottlenecks: NodePerformance[];
  parallelizableChains: string[][];
}

export interface PerformanceInsight {
  type: "bottleneck" | "parallel" | "warning" | "info";
  message: string;
  suggestion?: string;
  impact: "high" | "medium" | "low";
}

/**
 * Analyze performance data for a workflow execution
 */
export const analyzeWorkflowPerformance = (
  nodeIds: string[],
  nodeTypes: Map<string, string>,
  durations: Map<string, number>,
  statuses: Map<string, "completed" | "failed" | "pending">
): WorkflowPerformance => {
  const nodes: NodePerformance[] = [];
  let totalDuration = 0;
  let completedCount = 0;
  let failedCount = 0;

  // Calculate individual node performance
  nodeIds.forEach((nodeId) => {
    const duration = durations.get(nodeId) || 0;
    const status = statuses.get(nodeId) || "pending";

    if (status === "completed") {
      totalDuration += duration;
      completedCount++;
    } else if (status === "failed") {
      failedCount++;
    }

    nodes.push({
      nodeId,
      nodeType: nodeTypes.get(nodeId) || "unknown",
      duration,
      percentage: 0, // Will be calculated after total
      status
    });
  });

  // Calculate percentages
  nodes.forEach((node) => {
    node.percentage = totalDuration > 0 ? (node.duration / totalDuration) * 100 : 0;
  });

  // Sort by duration to identify bottlenecks
  const sortedNodes = [...nodes].sort((a, b) => b.duration - a.duration);

  // Identify bottlenecks (nodes taking > 20% of total time)
  const bottlenecks = sortedNodes.filter((node) => node.percentage > 20);

  // Find parallelizable chains (nodes with no dependencies that could run in parallel)
  const parallelizableChains = findParallelizableChains(nodeIds, durations);

  return {
    totalDuration,
    nodeCount: nodeIds.length,
    completedCount,
    failedCount,
    nodes: sortedNodes,
    bottlenecks,
    parallelizableChains
  };
};

/**
 * Find chains of nodes that could potentially run in parallel
 */
const findParallelizableChains = (
  nodeIds: string[],
  durations: Map<string, number>
): string[][] => {
  // Simple heuristic: nodes with similar durations that are independent
  // In a real implementation, this would analyze the graph structure
  const sortedByDuration = [...nodeIds].sort(
    (a, b) => (durations.get(b) || 0) - (durations.get(a) || 0)
  );

  const chains: string[][] = [];
  const processed = new Set<string>();

  // Group nodes by duration similarity (within 10%)
  let currentChain: string[] = [];
  let chainDuration = 0;

  sortedByDuration.forEach((nodeId) => {
    if (processed.has(nodeId)) {
      return;
    }

    const duration = durations.get(nodeId) || 0;

    if (currentChain.length === 0) {
      currentChain = [nodeId];
      chainDuration = duration;
      processed.add(nodeId);
    } else if (Math.abs(duration - chainDuration) / chainDuration < 0.1) {
      currentChain.push(nodeId);
      processed.add(nodeId);
    } else if (currentChain.length > 0) {
      chains.push(currentChain);
      currentChain = [nodeId];
      chainDuration = duration;
      processed.add(nodeId);
    }
  });

  if (currentChain.length > 0) {
    chains.push(currentChain);
  }

  return chains.filter((chain) => chain.length > 1);
};

/**
 * Generate performance insights and suggestions
 */
export const generatePerformanceInsights = (
  performance: WorkflowPerformance
): PerformanceInsight[] => {
  const insights: PerformanceInsight[] = [];

  // Bottleneck insights
  performance.bottlenecks.forEach((bottleneck) => {
    insights.push({
      type: "bottleneck",
      message: `"${bottleneck.nodeType}" node is a performance bottleneck (${bottleneck.percentage.toFixed(1)}% of total time)`,
      suggestion: `Consider optimizing this node or using a faster model/algorithm`,
      impact: "high"
    });
  });

  // Parallel execution insights
  if (performance.parallelizableChains.length > 0) {
    const totalNodes = performance.parallelizableChains.reduce(
      (sum, chain) => sum + chain.length,
      0
    );
    if (totalNodes > 2) {
      insights.push({
        type: "parallel",
        message: `${totalNodes} nodes could potentially run in parallel`,
        suggestion: `NodeTool supports parallel execution. Consider restructuring your workflow to take advantage of this.`,
        impact: "medium"
      });
    }
  }

  // Completion rate insight
  if (performance.nodeCount > 0) {
    const completionRate = (performance.completedCount / performance.nodeCount) * 100;
    if (completionRate < 100) {
      insights.push({
        type: "warning",
        message: `${performance.nodeCount - performance.completedCount} node(s) failed or didn't complete`,
        suggestion: "Check the failed nodes for errors and fix any configuration issues",
        impact: "high"
      });
    } else {
      insights.push({
        type: "info",
        message: `All ${performance.nodeCount} nodes completed successfully`,
        impact: "low"
      });
    }
  }

  // Total time insight
  if (performance.totalDuration > 60000) {
    insights.push({
      type: "info",
      message: `Total execution time: ${(performance.totalDuration / 1000).toFixed(1)}s`,
      impact: "low"
    });
  }

  return insights;
};

/**
 * Format duration for display
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

/**
 * Calculate estimated time savings from optimization
 */
export const calculateTimeSavings = (
  performance: WorkflowPerformance
): { estimated: number; percentage: number } => {
  // Simple estimate: if we parallelize the bottlenecks
  const bottleneckTime = performance.bottlenecks.reduce(
    (sum, node) => sum + node.duration,
    0
  );

  // Estimate 50% improvement from optimization
  const estimated = bottleneckTime * 0.5;
  const percentage =
    performance.totalDuration > 0
      ? (estimated / performance.totalDuration) * 100
      : 0;

  return { estimated, percentage };
};
