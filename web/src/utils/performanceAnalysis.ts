import type { WorkflowPerformanceProfile, NodePerformanceMetrics } from "../stores/ProfilerStore";

export interface PerformanceInsight {
  type: "bottleneck" | "warning" | "info" | "success";
  message: string;
  nodeId?: string;
  suggestion?: string;
}

export interface PerformanceReport {
  summary: string;
  score: number;
  insights: PerformanceInsight[];
  recommendations: string[];
  executionTime: number;
  memoryEstimate: string;
}

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const millis = Math.round(ms % 1000);
    return `${seconds}s ${millis}ms`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
};

export const formatPercentage = (value: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
};

export const getPerformanceGrade = (score: number): { grade: string; color: string } => {
  if (score >= 90) return { grade: "A", color: "success.main" };
  if (score >= 75) return { grade: "B", color: "info.main" };
  if (score >= 60) return { grade: "C", color: "warning.main" };
  if (score >= 40) return { grade: "D", color: "warning.dark" };
  return { grade: "F", color: "error.main" };
};

export const analyzePerformance = (
  profile: WorkflowPerformanceProfile
): PerformanceReport => {
  const insights: PerformanceInsight[] = [];
  const recommendations: string[] = [];
  const nodes = Object.values(profile.nodes);

  const totalDuration = nodes.reduce((sum, n) => sum + n.totalDuration, 0);

  for (const node of nodes) {
    if (node.status === "failed") {
      insights.push({
        type: "warning",
        message: `Node "${node.nodeName}" failed during execution`,
        nodeId: node.nodeId,
        suggestion: "Check node configuration and input data"
      });
      recommendations.push(`Review failed node: ${node.nodeName}`);
    }

    if (node.totalDuration > totalDuration * 0.3) {
      insights.push({
        type: "bottleneck",
        message: `Node "${node.nodeName}" is a significant bottleneck (${formatDuration(node.totalDuration)})`,
        nodeId: node.nodeId,
        suggestion: "Consider optimizing this node or using a faster model"
      });
    }

    if (node.executionCount > 1 && node.averageDuration > 5000) {
      insights.push({
        type: "info",
        message: `Node "${node.nodeName}" executed ${node.executionCount} times with avg ${formatDuration(node.averageDuration)}`,
        nodeId: node.nodeId
      });
    }
  }

  const completedNodes = nodes.filter(n => n.status === "completed");
  const avgNodeDuration = completedNodes.length > 0
    ? completedNodes.reduce((sum, n) => sum + n.averageDuration, 0) / completedNodes.length
    : 0;

  if (completedNodes.length === profile.nodeCount) {
    insights.push({
      type: "success",
      message: "All nodes completed successfully"
    });
  }

  if (avgNodeDuration > 10000) {
    recommendations.push("Consider using smaller models or batching operations");
  }

  if (nodes.length > 20) {
    insights.push({
      type: "info",
      message: `Large workflow with ${nodes.length} nodes`,
      suggestion: "Consider breaking into smaller sub-workflows"
    });
  }

  const summary = profile.failedNodes > 0
    ? `Workflow completed with ${profile.failedNodes} failed node(s)`
    : `Workflow completed successfully in ${formatDuration(profile.totalDuration)}`;

  return {
    summary,
    score: profile.efficiency,
    insights,
    recommendations,
    executionTime: profile.totalDuration,
    memoryEstimate: estimateMemoryUsage(nodes)
  };
};

const estimateMemoryUsage = (nodes: NodePerformanceMetrics[]): string => {
  const totalDuration = nodes.reduce((sum, n) => sum + n.totalDuration, 0);
  if (totalDuration < 5000) return "~50 MB";
  if (totalDuration < 30000) return "~100-200 MB";
  if (totalDuration < 60000) return "~200-500 MB";
  return "~500+ MB";
};

export const getTimelineData = (
  profile: WorkflowPerformanceProfile
): { nodeId: string; nodeName: string; start: number; end: number; duration: number }[] => {
  const nodes = Object.values(profile.nodes);
  const sorted = [...nodes].sort((a, b) => b.lastDuration - a.lastDuration);
  let currentTime = 0;

  return sorted.map(node => {
    const start = currentTime;
    const end = start + node.lastDuration;
    currentTime = end;
    return {
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      start,
      end,
      duration: node.lastDuration
    };
  });
};

export const compareProfiles = (
  profileA: WorkflowPerformanceProfile,
  profileB: WorkflowPerformanceProfile
): { improvement: number; changes: string[] } => {
  const changes: string[] = [];
  const durationA = profileA.totalDuration;
  const durationB = profileB.totalDuration;

  const improvement = durationA > 0
    ? ((durationA - durationB) / durationA) * 100
    : 0;

  if (durationB < durationA) {
    changes.push(`Execution time reduced by ${formatDuration(durationA - durationB)}`);
  } else if (durationB > durationA) {
    changes.push(`Execution time increased by ${formatDuration(durationB - durationA)}`);
  }

  if (profileB.efficiency > profileA.efficiency) {
    changes.push(`Efficiency improved from ${profileA.efficiency}% to ${profileB.efficiency}%`);
  }

  const nodesA = Object.keys(profileA.nodes);
  const nodesB = Object.keys(profileB.nodes);
  const addedNodes = nodesB.filter(n => !nodesA.includes(n));
  const removedNodes = nodesA.filter(n => !nodesB.includes(n));

  if (addedNodes.length > 0) {
    changes.push(`Added ${addedNodes.length} node(s)`);
  }
  if (removedNodes.length > 0) {
    changes.push(`Removed ${removedNodes.length} node(s)`);
  }

  return { improvement, changes };
};
