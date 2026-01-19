/**
 * Workflow Performance Profiler Store
 *
 * Aggregates execution timing data from ExecutionTimeStore to provide
 * comprehensive performance analysis for workflows. Identifies bottlenecks,
 * calculates statistics, and provides optimization recommendations.
 *
 * Features:
 * - Aggregates timing across all executed nodes
 * - Identifies slowest nodes (bottlenecks)
 * - Calculates total workflow execution time
 * - Provides performance scores and recommendations
 * - Tracks historical performance data
 *
 * Used by:
 * - WorkflowProfilerPanel to display performance analysis
 * - Performance visualization components
 *
 * @example
 * ```typescript
 * import useProfilerStore from './ProfilerStore';
 *
 * const store = useProfilerStore();
 * store.analyzePerformance('workflow-1', nodes);
 * const analysis = store.getAnalysis('workflow-1');
 * console.log(`Bottleneck: ${analysis.slowestNode?.nodeId}`);
 * ```
 */
import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";

export interface NodeTiming {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  duration: number;
  percentage: number;
  status: "completed" | "error" | "pending" | "running";
}

export interface PerformanceAnalysis {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  errorCount: number;
  averageNodeTime: number;
  slowestNode: NodeTiming | null;
  fastestNode: NodeTiming | null;
  bottlenecks: NodeTiming[];
  nodeTimings: NodeTiming[];
  performanceScore: number; // 0-100
  recommendations: string[];
  timestamp: number;
}

export interface PerformanceHistoryEntry {
  workflowId: string;
  timestamp: number;
  totalDuration: number;
  nodeCount: number;
  performanceScore: number;
}

interface ProfilerStore {
  analyses: Record<string, PerformanceAnalysis>;
  history: PerformanceHistoryEntry[];
  analyzePerformance: (workflowId: string, nodes: Array<{ id: string; data: { label?: string; nodeType?: string; [key: string]: unknown } }>) => PerformanceAnalysis;
  getAnalysis: (workflowId: string) => PerformanceAnalysis | undefined;
  clearAnalysis: (workflowId: string) => void;
  addToHistory: (entry: PerformanceHistoryEntry) => void;
  getHistory: (workflowId: string) => PerformanceHistoryEntry[];
}

const calculatePerformanceScore = (
  totalDuration: number,
  nodeCount: number,
  errorCount: number
): number => {
  if (nodeCount === 0) {return 100;}

  // Base score
  let score = 100;

  // Penalty for errors
  score -= errorCount * 15;

  // Penalty for slow execution (based on rough heuristic: 1s per node is good)
  const expectedDuration = nodeCount * 1000;
  if (totalDuration > expectedDuration) {
    const slowdownFactor = totalDuration / expectedDuration;
    score -= Math.min(30, (slowdownFactor - 1) * 10);
  }

  // Bonus for fast execution
  if (totalDuration < expectedDuration * 0.5) {
    score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
};

const generateRecommendations = (
  totalDuration: number,
  slowestNode: NodeTiming | null,
  errorCount: number
): string[] => {
  const recommendations: string[] = [];

  if (errorCount > 0) {
    recommendations.push(`Fix ${errorCount} error(s) in the workflow`);
  }

  if (slowestNode) {
    if (slowestNode.duration > 30000) {
      recommendations.push(`Consider optimizing "${slowestNode.nodeName}" - it takes over 30s`);
    } else if (slowestNode.duration > 10000) {
      recommendations.push(`Review "${slowestNode.nodeName}" for potential optimization`);
    }

    if (slowestNode.nodeType?.includes("model")) {
      recommendations.push(`Try a faster model or reduce max tokens/temperature`);
    }
    if (slowestNode.nodeType?.includes("image")) {
      recommendations.push(`Consider reducing image resolution or using smaller models`);
    }
  }

  if (totalDuration > 60000) {
    recommendations.push(`Total execution time exceeds 1 minute - consider parallel execution`);
  }

  if (recommendations.length === 0) {
    recommendations.push(`Workflow is running efficiently!`);
  }

  return recommendations;
};

const useProfilerStore = create<ProfilerStore>((set, get) => ({
  analyses: {},
  history: [],

  analyzePerformance: (workflowId, nodes) => {
    const executionStore = useExecutionTimeStore.getState();

    const nodeTimings: NodeTiming[] = [];
    let totalDuration = 0;
    let completedCount = 0;
    const errorCount = 0;

    for (const node of nodes) {
      const duration = executionStore.getDuration(workflowId, node.id);

      if (duration !== undefined) {
        totalDuration += duration;
        const timing: NodeTiming = {
          nodeId: node.id,
          nodeName: node.data?.label || node.id,
          nodeType: node.data?.nodeType || "unknown",
          duration,
          percentage: 0,
          status: "completed"
        };
        nodeTimings.push(timing);
        completedCount++;
      } else {
        // Include pending/running nodes with 0 duration
        nodeTimings.push({
          nodeId: node.id,
          nodeName: node.data?.label || node.id,
          nodeType: node.data?.nodeType || "unknown",
          duration: 0,
          percentage: 0,
          status: "pending"
        });
      }
    }

    // Calculate percentages
    for (const timing of nodeTimings) {
      timing.percentage = totalDuration > 0
        ? Math.round((timing.duration / totalDuration) * 100)
        : 0;
    }

    // Sort by duration (descending)
    nodeTimings.sort((a, b) => b.duration - a.duration);

    const slowestNode = nodeTimings.length > 0 ? nodeTimings[0] : null;
    const fastestNode = nodeTimings.length > 0
      ? nodeTimings[nodeTimings.length - 1]
      : null;

    // Get top 3 bottlenecks (slowest nodes that actually executed)
    const bottlenecks = nodeTimings
      .filter((t) => t.duration > 0)
      .slice(0, 3);

    const averageNodeTime = completedCount > 0
      ? Math.round(totalDuration / completedCount)
      : 0;

    const performanceScore = calculatePerformanceScore(
      totalDuration,
      nodeTimings.length,
      errorCount
    );

    const recommendations = generateRecommendations(
      totalDuration,
      slowestNode,
      errorCount
    );

    const analysis: PerformanceAnalysis = {
      workflowId,
      totalDuration,
      nodeCount: nodeTimings.length,
      completedCount,
      errorCount,
      averageNodeTime,
      slowestNode,
      fastestNode,
      bottlenecks,
      nodeTimings,
      performanceScore,
      recommendations,
      timestamp: Date.now()
    };

    // Store the analysis
    set({
      analyses: {
        ...get().analyses,
        [workflowId]: analysis
      }
    });

    // Add to history
    get().addToHistory({
      workflowId,
      timestamp: Date.now(),
      totalDuration,
      nodeCount: nodeTimings.length,
      performanceScore
    });

    return analysis;
  },

  getAnalysis: (workflowId: string) => {
    return get().analyses[workflowId];
  },

  clearAnalysis: (workflowId: string) => {
    const analyses = { ...get().analyses };
    delete analyses[workflowId];
    set({ analyses });
  },

  addToHistory: (entry: PerformanceHistoryEntry) => {
    const history = [...get().history, entry];

    // Keep only last 50 entries per workflow
    const workflowHistory = history.filter((e) => e.workflowId === entry.workflowId);
    const otherHistory = history.filter((e) => e.workflowId !== entry.workflowId);
    const trimmedHistory = workflowHistory.slice(-50);

    set({ history: [...otherHistory, ...trimmedHistory] });
  },

  getHistory: (workflowId: string) => {
    return get().history.filter((e) => e.workflowId === workflowId);
  }
}));

export default useProfilerStore;
