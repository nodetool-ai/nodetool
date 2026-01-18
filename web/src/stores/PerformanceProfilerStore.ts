/**
 * Performance Profiler Store
 *
 * Tracks workflow execution performance metrics and provides
 * analysis capabilities for identifying bottlenecks and optimization opportunities.
 */

import { create } from "zustand";
import { Node } from "./ApiTypes";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  executionCount: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  lastDuration: number;
  status: "pending" | "running" | "completed" | "failed";
}

export interface WorkflowPerformanceMetrics {
  workflowId: string;
  workflowName: string;
  totalExecutions: number;
  totalDuration: number;
  averageDuration: number;
  nodeMetrics: Record<string, NodePerformanceMetrics>;
  bottlenecks: string[];
  startTime: number;
  endTime?: number;
}

export interface BottleneckInfo {
  nodeId: string;
  nodeType: string;
  averageDuration: number;
  impact: "high" | "medium" | "low";
  suggestion: string;
}

export interface PerformanceReport {
  summary: {
    totalExecutions: number;
    averageDuration: number;
    fastestExecution: number;
    slowestExecution: number;
    successRate: number;
  };
  nodes: NodePerformanceMetrics[];
  bottlenecks: BottleneckInfo[];
  recommendations: string[];
}

interface PerformanceProfilerStore {
  currentMetrics: WorkflowPerformanceMetrics | null;
  historicalMetrics: WorkflowPerformanceMetrics[];
  isProfiling: boolean;

  startProfiling: (workflowId: string, workflowName: string, nodes: Node[]) => void;
  endProfiling: () => void;
  recordNodeStart: (nodeId: string) => void;
  recordNodeEnd: (nodeId: string, success: boolean) => void;
  recordNodeDuration: (nodeId: string, duration: number) => void;
  updateNodeStatus: (nodeId: string, status: NodePerformanceMetrics["status"]) => void;

  getNodeMetrics: (nodeId: string) => NodePerformanceMetrics | undefined;
  getBottlenecks: () => BottleneckInfo[];
  generateReport: () => PerformanceReport;
  clearCurrentSession: () => void;
  getHistoricalAverages: () => Record<string, number>;
}

const calculateImpact = (duration: number, averageNodeDuration: number): "high" | "medium" | "low" => {
  if (duration > averageNodeDuration * 3) {
    return "high";
  }
  if (duration > averageNodeDuration * 1.5) {
    return "medium";
  }
  return "low";
};

const generateFirstSuggestion = (metrics: NodePerformanceMetrics, averageNodeDuration: number): string => {
  if (metrics.averageDuration > averageNodeDuration * 2) {
    return `Consider optimizing "${metrics.nodeName}" - it takes ${(metrics.averageDuration / 1000).toFixed(2)}s on average`;
  }

  if (metrics.executionCount > 10 && metrics.averageDuration > 1000) {
    return `Node "${metrics.nodeName}" executes frequently - consider caching results if possible`;
  }

  if (metrics.maxDuration > metrics.averageDuration * 3) {
    return `"${metrics.nodeName}" has high variance - ${(metrics.maxDuration / 1000).toFixed(2)}s max vs ${(metrics.averageDuration / 1000).toFixed(2)}s avg`;
  }

  return `Consider optimizing "${metrics.nodeName}"`;
};

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  currentMetrics: null,
  historicalMetrics: [],
  isProfiling: false,

  startProfiling: (workflowId: string, workflowName: string, nodes: Node[]) => {
    const nodeMetrics: Record<string, NodePerformanceMetrics> = {};

    nodes.forEach(node => {
      const nodeData = node.data as Record<string, unknown> | undefined;
      nodeMetrics[node.id] = {
        nodeId: node.id,
        nodeType: node.type || "unknown",
        nodeName: (nodeData?.label as string) || node.type?.split(".").pop() || "Unknown",
        executionCount: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        lastDuration: 0,
        status: "pending"
      };
    });

    set({
      currentMetrics: {
        workflowId,
        workflowName,
        totalExecutions: 0,
        totalDuration: 0,
        averageDuration: 0,
        nodeMetrics,
        bottlenecks: [],
        startTime: Date.now()
      },
      isProfiling: true
    });
  },

  endProfiling: () => {
    const current = get().currentMetrics;
    if (current) {
      set({
        currentMetrics: {
          ...current,
          endTime: Date.now(),
          totalDuration: Date.now() - current.startTime
        },
        isProfiling: false
      });
    }
  },

  recordNodeStart: (nodeId: string) => {
    const current = get().currentMetrics;
    if (current && current.nodeMetrics[nodeId]) {
      set({
        currentMetrics: {
          ...current,
          nodeMetrics: {
            ...current.nodeMetrics,
            [nodeId]: {
              ...current.nodeMetrics[nodeId],
              status: "running"
            }
          }
        }
      });
    }
  },

  recordNodeEnd: (nodeId: string, success: boolean) => {
    const current = get().currentMetrics;
    if (current && current.nodeMetrics[nodeId]) {
      set({
        currentMetrics: {
          ...current,
          nodeMetrics: {
            ...current.nodeMetrics,
            [nodeId]: {
              ...current.nodeMetrics[nodeId],
              status: success ? "completed" : "failed"
            }
          }
        }
      });
    }
  },

  recordNodeDuration: (nodeId: string, duration: number) => {
    const current = get().currentMetrics;
    if (current && current.nodeMetrics[nodeId]) {
      const metrics = current.nodeMetrics[nodeId];
      const newMetrics: NodePerformanceMetrics = {
        ...metrics,
        executionCount: metrics.executionCount + 1,
        totalDuration: metrics.totalDuration + duration,
        averageDuration: (metrics.totalDuration + duration) / (metrics.executionCount + 1),
        minDuration: Math.min(metrics.minDuration, duration),
        maxDuration: Math.max(metrics.maxDuration, duration),
        lastDuration: duration,
        status: "completed"
      };

      set({
        currentMetrics: {
          ...current,
          totalExecutions: current.totalExecutions + 1,
          totalDuration: current.totalDuration + duration,
          averageDuration: (current.totalDuration + duration) / (current.totalExecutions + 1),
          nodeMetrics: {
            ...current.nodeMetrics,
            [nodeId]: newMetrics
          }
        }
      });
    }
  },

  updateNodeStatus: (nodeId: string, status: NodePerformanceMetrics["status"]) => {
    const current = get().currentMetrics;
    if (current && current.nodeMetrics[nodeId]) {
      set({
        currentMetrics: {
          ...current,
          nodeMetrics: {
            ...current.nodeMetrics,
            [nodeId]: {
              ...current.nodeMetrics[nodeId],
              status
            }
          }
        }
      });
    }
  },

  getNodeMetrics: (nodeId: string) => {
    return get().currentMetrics?.nodeMetrics[nodeId];
  },

  getBottlenecks: (): BottleneckInfo[] => {
    const current = get().currentMetrics;
    if (!current) {
      return [];
    }

    const nodeMetrics = Object.values(current.nodeMetrics);
    if (nodeMetrics.length === 0) {
      return [];
    }

    const averageNodeDuration = nodeMetrics.reduce((sum, m) => sum + m.averageDuration, 0) / nodeMetrics.length;

    return nodeMetrics
      .filter(m => m.executionCount > 0 && m.averageDuration > averageNodeDuration)
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 5)
      .map(m => ({
        nodeId: m.nodeId,
        nodeType: m.nodeType,
        averageDuration: m.averageDuration,
        impact: calculateImpact(m.averageDuration, averageNodeDuration),
        suggestion: generateFirstSuggestion(m, averageNodeDuration)
      }));
  },

  generateReport: (): PerformanceReport => {
    const current = get().currentMetrics;
    const bottlenecks = get().getBottlenecks();

    if (!current) {
      return {
        summary: {
          totalExecutions: 0,
          averageDuration: 0,
          fastestExecution: 0,
          slowestExecution: 0,
          successRate: 100
        },
        nodes: [],
        bottlenecks: [],
        recommendations: ["No profiling data available. Run a workflow execution to generate metrics."]
      };
    }

    const nodeList = Object.values(current.nodeMetrics).filter(m => m.executionCount > 0);
    const completedNodes = nodeList.filter(m => m.status === "completed");

    const recommendations: string[] = [];

    if (bottlenecks.length > 0) {
      recommendations.push(`Focus on optimizing ${bottlenecks.length} bottleneck(s) identified above`);
    }

    if (nodeList.length > 10) {
      recommendations.push("Consider breaking down complex workflows into smaller sub-workflows");
    }

    const hasHighVariance = nodeList.some(m => m.maxDuration > m.averageDuration * 3);
    if (hasHighVariance) {
      recommendations.push("Some nodes have high execution time variance - check for external factors like network latency");
    }

    const sequentialNodes = nodeList.filter(m => m.averageDuration > 1000);
    if (sequentialNodes.length > 3) {
      recommendations.push("Multiple sequential nodes are slow - consider parallel execution where possible");
    }

    return {
      summary: {
        totalExecutions: current.totalExecutions,
        averageDuration: current.averageDuration,
        fastestExecution: nodeList.length > 0 ? Math.min(...nodeList.map(m => m.minDuration)) : 0,
        slowestExecution: nodeList.length > 0 ? Math.max(...nodeList.map(m => m.maxDuration)) : 0,
        successRate: nodeList.length > 0
          ? (completedNodes.length / nodeList.length) * 100
          : 100
      },
      nodes: nodeList.sort((a, b) => b.averageDuration - a.averageDuration),
      bottlenecks,
      recommendations
    };
  },

  clearCurrentSession: () => {
    set({ currentMetrics: null, isProfiling: false });
  },

  getHistoricalAverages: () => {
    const historical = get().historicalMetrics;
    if (historical.length === 0) return {};

    const averages: Record<string, { total: number; count: number }> = {};

    historical.forEach(session => {
      Object.values(session.nodeMetrics).forEach(metrics => {
        if (!averages[metrics.nodeType]) {
          averages[metrics.nodeType] = { total: 0, count: 0 };
        }
        averages[metrics.nodeType].total += metrics.averageDuration;
        averages[metrics.nodeType].count += 1;
      });
    });

    const result: Record<string, number> = {};
    Object.entries(averages).forEach(([type, data]) => {
      result[type] = data.total / data.count;
    });

    return result;
  }
}));

export default usePerformanceProfilerStore;
