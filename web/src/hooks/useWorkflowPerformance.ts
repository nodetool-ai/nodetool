/**
 * useWorkflowPerformance Hook
 *
 * Analyzes workflow execution performance, identifies bottlenecks,
 * and provides optimization suggestions.
 */

import { useCallback } from "react";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import useStatusStore from "../stores/StatusStore";
import useResultsStore from "../stores/ResultsStore";
import usePerformanceProfilerStore, {
  PerformanceProfile,
  NodePerformanceMetrics,
  OptimizationSuggestion
} from "../stores/PerformanceProfilerStore";

interface WorkflowNodes {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

interface UseWorkflowPerformanceProps {
  workflowId: string;
  nodes: WorkflowNodes[];
}

interface UseWorkflowPerformanceReturn {
  profile: PerformanceProfile | null;
  isAnalyzing: boolean;
  analyzePerformance: () => void;
  getNodeMetrics: (nodeId: string) => NodePerformanceMetrics | null;
  getSuggestions: () => OptimizationSuggestion[];
  getTimelineData: () => { startTime: number; endTime: number; nodes: NodePerformanceMetrics[] };
}

const BOTTLENECK_THRESHOLD_PERCENT = 20;
const MIN_BOTTLENECK_MS = 100;

const isParallelizableNode = (nodeType: string): boolean => {
  const parallelizableTypes = [
    "nodetool.llm.LLM",
    "nodetool.image.ImageGeneration",
    "nodetool.audio.AudioGeneration",
    "nodetool.video.VideoGeneration",
    "nodetool.embedding.Embedding",
    "nodetool.vectorstore.VectorSearch"
  ];
  return parallelizableTypes.some(t => nodeType.includes(t));
};

const generateSuggestions = (
  nodes: NodePerformanceMetrics[],
  bottlenecks: NodePerformanceMetrics[]
): OptimizationSuggestion[] => {
  const suggestions: OptimizationSuggestion[] = [];

  const parallelizableBottlenecks = bottlenecks.filter(n => n.isParallelizable);
  if (parallelizableBottlenecks.length > 0) {
    const totalParallelTime = parallelizableBottlenecks.reduce((sum, n) => sum + n.duration, 0);
    suggestions.push({
      type: "parallel",
      severity: "warning",
      title: "Parallel Execution Opportunity",
      description: `${parallelizableBottlenecks.length} node(s) could run in parallel. These are independent AI model calls that don't depend on each other's output.`,
      affectedNodes: parallelizableBottlenecks.map(n => n.nodeId),
      potentialSavings: Math.floor(totalParallelTime * 0.7)
    });
  }

  const slowNodes = nodes.filter(n => n.duration > 10000 && !n.isParallelizable);
  if (slowNodes.length > 0) {
    suggestions.push({
      type: "model",
      severity: "info",
      title: "Consider Faster Models",
      description: `${slowNodes.length} node(s) take longer than 10s. Consider using smaller/faster models for non-critical paths.`,
      affectedNodes: slowNodes.map(n => n.nodeId)
    });
  }

  const dependencyChains = analyzeDependencyChains(nodes);
  if (dependencyChains.length > 0) {
    const longestChain = dependencyChains.reduce((max, chain) =>
      (chain.totalDuration > max.totalDuration) ? chain : max
    );
    suggestions.push({
      type: "structure",
      severity: "info",
      title: "Long Dependency Chain",
      description: `Longest execution path has ${longestChain.nodeCount} nodes totaling ${formatDuration(longestChain.totalDuration)}. Consider restructuring to reduce sequential dependencies.`,
      affectedNodes: longestChain.nodeIds
    });
  }

  return suggestions;
};

interface DependencyChain {
  nodeIds: string[];
  totalDuration: number;
  nodeCount: number;
}

const analyzeDependencyChains = (nodes: NodePerformanceMetrics[]): DependencyChain[] => {
  const chains: DependencyChain[] = [];

  const sorted = [...nodes].sort((a, b) => b.duration - a.duration);
  if (sorted.length > 3) {
    const topNodes = sorted.slice(0, 5);
    chains.push({
      nodeIds: topNodes.map(n => n.nodeId),
      totalDuration: topNodes.reduce((sum, n) => sum + n.duration, 0),
      nodeCount: topNodes.length
    });
  }

  return chains;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const formatDurationLong = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)} milliseconds`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)} seconds`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes} minute${minutes !== 1 ? "s" : ""} ${seconds} second${seconds !== 1 ? "s" : ""}`;
};

export const useWorkflowPerformance = ({
  workflowId,
  nodes
}: UseWorkflowPerformanceProps): UseWorkflowPerformanceReturn => {
  const { getDuration } = useExecutionTimeStore();
  const { getStatus } = useStatusStore();
  const { getResult } = useResultsStore();
  const {
    currentProfile,
    isAnalyzing,
    setProfile,
    setAnalyzing
  } = usePerformanceProfilerStore();

  const analyzePerformance = useCallback(() => {
    setAnalyzing(true);

    const nodeMetrics: NodePerformanceMetrics[] = nodes.map(node => {
      const duration = getDuration(workflowId, node.id) || 0;
      const status = (getStatus(workflowId, node.id) as "completed" | "error" | "running" | "pending") || "pending";
      const result = getResult(workflowId, node.id);
      const outputSize = result ? JSON.stringify(result).length : undefined;

      return {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.data?.name as string || node.type.split(".").pop() || "Node",
        duration,
        status,
        isParallelizable: isParallelizableNode(node.type),
        outputSize
      };
    });

    const completedNodes = nodeMetrics.filter(n => n.status === "completed");
    const totalDuration = completedNodes.reduce((sum, n) => sum + n.duration, 0);

    const sortedByDuration = [...nodeMetrics].sort((a, b) => b.duration - a.duration);
    const maxDuration = sortedByDuration[0]?.duration || 1;

    const bottlenecks = sortedByDuration.filter(n => {
      return (n.duration > 0 &&
        (n.duration / maxDuration * 100 >= BOTTLENECK_THRESHOLD_PERCENT || n.duration >= MIN_BOTTLENECK_MS));
    });

    const parallelizableNodes = nodeMetrics.filter(n => n.isParallelizable && n.status === "completed");
    const potentialParallelTime = parallelizableNodes.reduce((sum, n) => sum + n.duration, 0);
    const parallelismScore = totalDuration > 0
      ? Math.min(100, Math.round((1 - (potentialParallelTime - Math.max(...parallelizableNodes.map(n => n.duration))) / Math.max(1, totalDuration)) * 100))
      : 100;

    const profile: PerformanceProfile = {
      workflowId,
      totalDuration,
      nodeCount: nodeMetrics.length,
      completedNodes: completedNodes.length,
      failedNodes: nodeMetrics.filter(n => n.status === "error").length,
      nodes: nodeMetrics,
      bottlenecks,
      parallelismScore,
      timestamp: Date.now()
    };

    setProfile(profile);
    setAnalyzing(false);
  }, [workflowId, nodes, getDuration, getStatus, getResult, setProfile, setAnalyzing]);

  const getNodeMetrics = useCallback((nodeId: string): NodePerformanceMetrics | null => {
    return currentProfile?.nodes.find(n => n.nodeId === nodeId) || null;
  }, [currentProfile]);

  const getSuggestions = useCallback((): OptimizationSuggestion[] => {
    if (!currentProfile) {
      return [];
    }
    return generateSuggestions(currentProfile.nodes, currentProfile.bottlenecks);
  }, [currentProfile]);

  const getTimelineData = useCallback(() => {
    if (!currentProfile) {
      return { startTime: 0, endTime: 0, nodes: [] };
    }

    const sortedNodes = [...currentProfile.nodes]
      .filter(n => n.duration > 0)
      .sort((a, b) => a.duration - b.duration);

    const startTime = 0;
    const endTime = currentProfile.totalDuration;

    return {
      startTime,
      endTime,
      nodes: sortedNodes
    };
  }, [currentProfile]);

  return {
    profile: currentProfile,
    isAnalyzing,
    analyzePerformance,
    getNodeMetrics,
    getSuggestions,
    getTimelineData
  };
};

export { formatDuration, formatDurationLong };
