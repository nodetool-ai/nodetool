/**
 * Workflow Performance Profiler
 * 
 * Analyzes workflow execution data to identify performance bottlenecks,
 * parallelization opportunities, and optimization suggestions.
 * 
 * This is an EXPERIMENTAL feature for research purposes.
 */

import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import useStatusStore from "../../stores/StatusStore";
import { Node } from "@xyflow/react";

/**
 * Represents timing data for a single node execution
 */
export interface NodeTiming {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number | undefined;
  status: string;
  isParallelizable: boolean;
}

/**
 * Performance profile for an entire workflow
 */
export interface WorkflowProfile {
  workflowId: string;
  totalNodes: number;
  executedNodes: number;
  totalWallTime: number;
  estimatedParallelTime: number;
  bottleneckNodes: NodeTiming[];
  parallelizableNodes: NodeTiming[];
  efficiencyScore: number;
  recommendations: string[];
}

/**
 * Analyzes a workflow's execution performance
 * 
 * @param workflowId - The workflow to analyze
 * @param nodes - Array of nodes in the workflow
 * @returns Performance profile with statistics and recommendations
 */
export const analyzeWorkflowPerformance = (
  workflowId: string,
  nodes: Node[]
): WorkflowProfile => {
  const nodeTimings: NodeTiming[] = nodes.map((node) => {
    const duration = useExecutionTimeStore.getState().getDuration(workflowId, node.id);
    const status = useStatusStore.getState().getStatus(workflowId, node.id);
    const isParallelizable = checkIfNodeParallelizable(node, nodes);
    
    const nodeLabel = node.data?.label;
    const labelText = typeof nodeLabel === 'string' ? nodeLabel : node.id;
    
    return {
      nodeId: node.id,
      nodeType: node.type || "unknown",
      nodeLabel: labelText,
      duration,
      status: typeof status === "string" ? status : "unknown",
      isParallelizable,
    };
  });

  const executedNodes = nodeTimings.filter((n) => n.duration !== undefined);
  const durations = executedNodes.map((n) => n.duration as number);
  const totalWallTime = Math.max(...durations, 0);
  const sumDuration = durations.reduce((sum, d) => sum + d, 0);
  
  const bottleneckNodes = [...executedNodes]
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 5);
  
  const parallelizableNodes = nodeTimings
    .filter((n) => n.isParallelizable && n.duration !== undefined)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0));

  const estimatedParallelTime = calculateEstimatedParallelTime(nodeTimings, nodes);
  
  const efficiencyScore = totalWallTime > 0 
    ? Math.round((sumDuration / totalWallTime) * 100) / 100
    : 0;

  const recommendations = generateRecommendations(nodeTimings, nodes, {
    totalWallTime,
    estimatedParallelTime,
    efficiencyScore,
  });

  return {
    workflowId,
    totalNodes: nodes.length,
    executedNodes: executedNodes.length,
    totalWallTime,
    estimatedParallelTime,
    bottleneckNodes,
    parallelizableNodes,
    efficiencyScore,
    recommendations,
  };
};

/**
 * Checks if a node can potentially execute in parallel with others
 */
const checkIfNodeParallelizable = (
  node: Node,
  _allNodes: Node[]
): boolean => {
  const nodeType = node.type || "";
  
  const parallelizableTypes = [
    "nodetool.process.ImageGenerate",
    "nodetool.process.AudioGenerate",
    "nodetool.process.VideoGenerate",
    "nodetool.process.TextGenerate",
    "nodetool.process.llm",
  ];

  if (parallelizableTypes.some((type) => nodeType.includes(type))) {
    return true;
  }

  const independentNodes = ["nodetool.input.StringInput", "nodetool.input.IntegerInput"];
  if (independentNodes.some((type) => nodeType.includes(type))) {
    return true;
  }

  return false;
};

/**
 * Estimates parallel execution time based on node dependencies
 */
const calculateEstimatedParallelTime = (
  nodeTimings: NodeTiming[],
  allNodes: Node[]
): number => {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  
  const getDependencies = (nodeId: string): string[] => {
    const node = nodeMap.get(nodeId);
    if (!node) { return []; }
    
    const incomingEdges = (node.data?.incomingEdges || []) as Array<{ source: string }>;
    return incomingEdges.map((edge) => edge.source);
  };

  const calculateLevel = (nodeId: string, visited: Set<string> = new Set()): number => {
    if (visited.has(nodeId)) { return 0; }
    visited.add(nodeId);
    
    const deps = getDependencies(nodeId);
    if (deps.length === 0) { return 1; }
    
    return 1 + Math.max(...deps.map((d) => calculateLevel(d, new Set(visited))));
  };

  const levels = nodeTimings.map((n) => {
    const node = nodeMap.get(n.nodeId);
    if (!node) { return 0; }
    
    const incomingEdges = node.data?.incomingEdges as Array<unknown> | undefined;
    const hasIncomingEdges = incomingEdges && incomingEdges.length > 0;
    if (!hasIncomingEdges) { return 1; }
    
    return calculateLevel(n.nodeId);
  });

  const maxLevel = Math.max(...levels, 1);
  const avgNodeTime = nodeTimings.reduce((sum, n) => sum + (n.duration || 100), 0) / nodeTimings.length;
  
  return Math.round(maxLevel * avgNodeTime);
};

/**
 * Generates optimization recommendations based on profile data
 */
const generateRecommendations = (
  nodeTimings: NodeTiming[],
  allNodes: Node[],
  stats: { totalWallTime: number; estimatedParallelTime: number; efficiencyScore: number }
): string[] => {
  const recommendations: string[] = [];
  
  if (stats.efficiencyScore > 10) {
    recommendations.push(
      "Consider parallelizing independent nodes to reduce total execution time"
    );
  }

  const slowNodes = nodeTimings
    .filter((n) => n.duration !== undefined && n.duration > 5000)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0));

  if (slowNodes.length > 0) {
    const topSlow = slowNodes.slice(0, 3);
    recommendations.push(
      `Optimize slow nodes: ${topSlow.map((n) => n.nodeLabel).join(", ")}`
    );
  }

  const blockedNodes = nodeTimings.filter((n) => {
    const node = allNodes.find((an) => an.id === n.nodeId);
    const incomingEdges = node?.data?.incomingEdges as Array<unknown> | undefined;
    const hasIncoming = incomingEdges && incomingEdges.length > 0;
    return !hasIncoming && n.status !== "completed";
  });

  if (blockedNodes.length > 0) {
    recommendations.push(
      "Some nodes are blocked - ensure input nodes are connected properly"
    );
  }

  if (stats.totalWallTime > 30000) {
    recommendations.push(
      "Total execution time exceeds 30s - consider caching results or using faster models"
    );
  }

  return recommendations;
};

/**
 * Formats duration in human-readable format
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) { return `${ms}ms`; }
  if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return milliseconds > 0 ? `${seconds}s ${milliseconds}ms` : `${seconds}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Calculates efficiency score (0-1) based on parallelization potential
 */
export const calculateEfficiencyScore = (
  sequentialTime: number,
  parallelTime: number
): number => {
  if (sequentialTime === 0) { return 1; }
  return Math.round((parallelTime / sequentialTime) * 100) / 100;
};
