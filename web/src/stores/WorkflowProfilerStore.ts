/**
 * WorkflowProfilerStore - Performance profiling for workflow execution
 *
 * Tracks execution metrics across multiple workflow runs to identify
 * bottlenecks, compare performance, and provide optimization insights.
 *
 * Features:
 * - Track execution duration per node and total workflow time
 * - Store historical runs for comparison
 * - Identify bottlenecks (nodes with longest execution time)
 * - Calculate parallelization efficiency
 * - Detect performance regressions between runs
 */

import { create } from "zustand";
import { Graph } from "./ApiTypes";

export interface NodeExecutionMetric {
  nodeId: string;
  nodeType: string;
  nodeLabel?: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: "completed" | "failed" | "cancelled" | "pending";
  inputSize?: number;
  outputSize?: number;
}

export interface WorkflowRunProfile {
  runId: string;
  workflowId: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  status: "completed" | "failed" | "cancelled" | "running";
  nodeMetrics: NodeExecutionMetric[];
  graphHash: string;
  nodeCount: number;
  edgeCount: number;
}

export interface BottleneckAnalysis {
  nodeId: string;
  nodeType: string;
  duration: number;
  percentageOfTotal: number;
  isCriticalPath: boolean;
}

export interface ParallelizationAnalysis {
  totalDuration: number;
  theoreticalMinimumDuration: number;
  parallelizationEfficiency: number;
  parallelNodes: number;
  sequentialNodes: number;
}

export interface PerformanceInsight {
  type: "bottleneck" | "regression" | "improvement" | "info";
  severity: "high" | "medium" | "low";
  message: string;
  nodeId?: string;
  suggestion?: string;
}

export interface WorkflowProfilerState {
  profiles: Record<string, WorkflowRunProfile[]>;
  currentRunId: string | null;
  isRecording: boolean;

  startRecording: (workflowId: string) => string;
  endRecording: (workflowId: string, status: "completed" | "failed" | "cancelled") => void;
  recordNodeExecution: (workflowId: string, nodeId: string, nodeType: string, duration: number, status: NodeExecutionMetric["status"]) => void;
  updateNodeMetrics: (workflowId: string, nodeId: string, updates: Partial<NodeExecutionMetric>) => void;
  getLatestProfile: (workflowId: string) => WorkflowRunProfile | null;
  getProfiles: (workflowId: string) => WorkflowRunProfile[];
  getBottlenecks: (workflowId: string, limit?: number) => BottleneckAnalysis[];
  getParallelizationAnalysis: (workflowId: string, graph: Graph) => ParallelizationAnalysis;
  getPerformanceInsights: (workflowId: string, graph: Graph) => PerformanceInsight[];
  clearProfiles: (workflowId: string) => void;
  clearAllProfiles: () => void;
}

const generateRunId = () => `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const useWorkflowProfilerStore = create<WorkflowProfilerState>((set, get) => ({
  profiles: {},
  currentRunId: null,
  isRecording: false,

  startRecording: (workflowId: string) => {
    const runId = generateRunId();
    const startTime = Date.now();

    set((state) => ({
      currentRunId: runId,
      isRecording: true,
      profiles: {
        ...state.profiles,
        [workflowId]: [
          ...(state.profiles[workflowId] || []),
          {
            runId,
            workflowId,
            startTime,
            endTime: 0,
            totalDuration: 0,
            status: "running",
            nodeMetrics: [],
            graphHash: "",
            nodeCount: 0,
            edgeCount: 0
          }
        ]
      }
    }));

    return runId;
  },

  endRecording: (workflowId: string, status: "completed" | "failed" | "cancelled") => {
    const { currentRunId, profiles } = get();
    if (!currentRunId) return;

    const endTime = Date.now();
    const workflowProfiles = profiles[workflowId];
    if (!workflowProfiles) return;

    const currentRunIndex = workflowProfiles.findIndex((p) => p.runId === currentRunId);
    if (currentRunIndex === -1) return;

    const currentRun = workflowProfiles[currentRunIndex];
    const totalDuration = endTime - currentRun.startTime;

    const updatedRun: WorkflowRunProfile = {
      ...currentRun,
      endTime,
      totalDuration,
      status
    };

    const updatedProfiles = {
      ...profiles,
      [workflowId]: [
        ...workflowProfiles.slice(0, currentRunIndex),
        updatedRun,
        ...workflowProfiles.slice(currentRunIndex + 1)
      ]
    };

    set({
      profiles: updatedProfiles,
      currentRunId: null,
      isRecording: false
    });
  },

  recordNodeExecution: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    duration: number,
    status: NodeExecutionMetric["status"]
  ) => {
    const { currentRunId, profiles } = get();
    if (!currentRunId) return;

    const workflowProfiles = profiles[workflowId];
    if (!workflowProfiles) return;

    const currentRunIndex = workflowProfiles.findIndex((p) => p.runId === currentRunId);
    if (currentRunIndex === -1) return;

    const currentRun = workflowProfiles[currentRunIndex];
    const endTime = Date.now();

    const newMetric: NodeExecutionMetric = {
      nodeId,
      nodeType,
      duration,
      startTime: endTime - duration,
      endTime,
      status
    };

    const updatedRun = {
      ...currentRun,
      nodeMetrics: [...currentRun.nodeMetrics, newMetric]
    };

    const updatedProfiles = {
      ...profiles,
      [workflowId]: [
        ...workflowProfiles.slice(0, currentRunIndex),
        updatedRun,
        ...workflowProfiles.slice(currentRunIndex + 1)
      ]
    };

    set({ profiles: updatedProfiles });
  },

  updateNodeMetrics: (workflowId: string, nodeId: string, updates: Partial<NodeExecutionMetric>) => {
    const { currentRunId, profiles } = get();
    if (!currentRunId) return;

    const workflowProfiles = profiles[workflowId];
    if (!workflowProfiles) return;

    const currentRunIndex = workflowProfiles.findIndex((p) => p.runId === currentRunId);
    if (currentRunIndex === -1) return;

    const currentRun = workflowProfiles[currentRunIndex];
    const metricIndex = currentRun.nodeMetrics.findIndex((m) => m.nodeId === nodeId);
    if (metricIndex === -1) return;

    const updatedMetrics = [...currentRun.nodeMetrics];
    updatedMetrics[metricIndex] = { ...updatedMetrics[metricIndex], ...updates };

    const updatedRun = { ...currentRun, nodeMetrics: updatedMetrics };
    const updatedProfiles = {
      ...profiles,
      [workflowId]: [
        ...workflowProfiles.slice(0, currentRunIndex),
        updatedRun,
        ...workflowProfiles.slice(currentRunIndex + 1)
      ]
    };

    set({ profiles: updatedProfiles });
  },

  getLatestProfile: (workflowId: string) => {
    const { profiles } = get();
    const workflowProfiles = profiles[workflowId];
    if (!workflowProfiles || workflowProfiles.length === 0) return null;
    return workflowProfiles[workflowProfiles.length - 1];
  },

  getProfiles: (workflowId: string) => {
    const { profiles } = get();
    return profiles[workflowId] || [];
  },

  getBottlenecks: (workflowId: string, limit: number = 3) => {
    const latestProfile = get().getLatestProfile(workflowId);
    if (!latestProfile) return [];

    const totalDuration = latestProfile.totalDuration || 1;
    const sortedMetrics = [...latestProfile.nodeMetrics].sort((a, b) => b.duration - a.duration);

    return sortedMetrics.slice(0, limit).map((metric) => ({
      nodeId: metric.nodeId,
      nodeType: metric.nodeType,
      duration: metric.duration,
      percentageOfTotal: (metric.duration / totalDuration) * 100,
      isCriticalPath: false
    }));
  },

  getParallelizationAnalysis: (workflowId: string, graph: Graph) => {
    const latestProfile = get().getLatestProfile(workflowId);
    if (!latestProfile) {
      return {
        totalDuration: 0,
        theoreticalMinimumDuration: 0,
        parallelizationEfficiency: 0,
        parallelNodes: 0,
        sequentialNodes: 0
      };
    }

    const metrics = latestProfile.nodeMetrics;
    const nodeDurations = new Map<string, number>();
    metrics.forEach((m) => nodeDurations.set(m.nodeId, m.duration));

    const theoreticalMinimum = 0;
    const visited = new Set<string>();
    const calculateMinDuration = (nodeId: string): number => {
      if (visited.has(nodeId)) {
        return 0;
      }
      visited.add(nodeId);

      const nodeDuration = nodeDurations.get(nodeId) || 0;
      const outgoingEdges = graph.edges.filter((e) => e.source === nodeId);

      if (outgoingEdges.length === 0) {
        return nodeDuration;
      }

      const childDurations = outgoingEdges.map((e) => calculateMinDuration(e.target));
      return Math.max(nodeDuration, ...childDurations);
    };

    const entryNodes = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.target === n.id)
    );

    entryNodes.forEach((n) => calculateMinDuration(n.id));

    const totalDuration = latestProfile.totalDuration;
    const efficiency = theoreticalMinimum > 0 ? (theoreticalMinimum / totalDuration) * 100 : 0;

    return {
      totalDuration,
      theoreticalMinimumDuration: theoreticalMinimum,
      parallelizationEfficiency: efficiency,
      parallelNodes: graph.nodes.length,
      sequentialNodes: 0
    };
  },

  getPerformanceInsights: (workflowId: string, _graph: Graph) => {
    const insights: PerformanceInsight[] = [];
    const latestProfile = get().getLatestProfile(workflowId);
    const profiles = get().getProfiles(workflowId);

    if (!latestProfile) return insights;

    const bottlenecks = get().getBottlenecks(workflowId, 2);
    bottlenecks.forEach((b) => {
      if (b.percentageOfTotal > 50) {
        insights.push({
          type: "bottleneck",
          severity: "high",
          message: `Node "${b.nodeType}" takes ${b.percentageOfTotal.toFixed(1)}% of total execution time`,
          nodeId: b.nodeId,
          suggestion: "Consider optimizing this node or using a faster model"
        });
      } else if (b.percentageOfTotal > 25) {
        insights.push({
          type: "bottleneck",
          severity: "medium",
          message: `Node "${b.nodeType}" is taking ${b.percentageOfTotal.toFixed(1)}% of total execution time`,
          nodeId: b.nodeId
        });
      }
    });

    if (profiles.length >= 2) {
      const [previousRun, currentRun] = profiles.slice(-2);
      if (previousRun.status === "completed" && currentRun.status === "completed") {
        const durationChange = ((currentRun.totalDuration - previousRun.totalDuration) / previousRun.totalDuration) * 100;
        if (durationChange > 20) {
          insights.push({
            type: "regression",
            severity: "high",
            message: `Performance regression detected: execution time increased by ${durationChange.toFixed(1)}%`,
            suggestion: "Check if workflow graph or inputs have changed"
          });
        } else if (durationChange < -20) {
          insights.push({
            type: "improvement",
            severity: "low",
            message: `Performance improved: execution time decreased by ${Math.abs(durationChange).toFixed(1)}%`
          });
        }
      }
    }

    if (latestProfile.nodeCount > 10 && insights.length === 0) {
      insights.push({
        type: "info",
        severity: "low",
        message: "Workflow has multiple nodes. Consider grouping related operations for better organization."
      });
    }

    return insights;
  },

  clearProfiles: (workflowId: string) => {
    set((state) => ({
      profiles: {
        ...state.profiles,
        [workflowId]: []
      }
    }));
  },

  clearAllProfiles: () => {
    set({ profiles: {}, currentRunId: null, isRecording: false });
  }
}));

export default useWorkflowProfilerStore;
