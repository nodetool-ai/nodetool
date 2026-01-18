/**
 * Performance Profiler Store
 *
 * Tracks workflow execution performance metrics across runs and versions.
 * Provides insights into execution time, resource usage, and bottlenecks.
 */

import { create } from "zustand";

interface NodePerformance {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  executionTimeMs: number;
  memoryUsageMb?: number;
  status: "completed" | "failed" | "skipped";
  errorMessage?: string;
}

interface WorkflowPerformance {
  workflowId: string;
  versionId?: string;
  runId: string;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  nodePerformances: NodePerformance[];
}

interface PerformanceSnapshot {
  id: string;
  workflowId: string;
  workflowName: string;
  version: number;
  timestamp: number;
  durationMs: number;
  nodeCount: number;
  status: "success" | "partial" | "failed";
  topBottlenecks: Array<{ nodeId: string; nodeType: string; durationMs: number }>;
}

interface PerformanceProfilerStore {
  snapshots: PerformanceSnapshot[];
  currentRun: WorkflowPerformance | null;
  isRecording: boolean;

  startRecording: (workflowId: string, versionId?: string) => void;
  recordNodeStart: (nodeId: string, nodeType: string, nodeName: string) => void;
  recordNodeComplete: (
    nodeId: string,
    durationMs: number,
    memoryUsageMb?: number,
    status?: "completed" | "failed" | "skipped",
    errorMessage?: string
  ) => void;
  recordNodeFailure: (nodeId: string, errorMessage: string) => void;
  finishRecording: () => void;
  cancelRecording: () => void;
  getSnapshots: (workflowId: string) => PerformanceSnapshot[];
  getBottlenecks: (workflowId: string, limit?: number) => PerformanceSnapshot[];
  clearSnapshots: (workflowId?: string) => void;
}

const generateRunId = () => `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const usePerformanceProfilerStore = create<PerformanceProfilerStore>((set, get) => ({
  snapshots: [],
  currentRun: null,
  isRecording: false,

  startRecording: (workflowId: string, versionId?: string) => {
    const runId = generateRunId();
    set({
      isRecording: true,
      currentRun: {
        workflowId,
        versionId,
        runId,
        startTime: Date.now(),
        nodeCount: 0,
        completedNodes: 0,
        failedNodes: 0,
        nodePerformances: []
      }
    });
  },

  recordNodeStart: (nodeId: string, nodeType: string, nodeName: string) => {
    const currentRun = get().currentRun;
    if (!currentRun) {
      return;
    }

    const existingNode = currentRun.nodePerformances.find((n) => n.nodeId === nodeId);
    if (existingNode) {
      return;
    }

    set({
      currentRun: {
        ...currentRun,
        nodeCount: currentRun.nodeCount + 1,
        nodePerformances: [
          ...currentRun.nodePerformances,
          {
            nodeId,
            nodeType,
            nodeName,
            executionTimeMs: 0,
            status: "skipped"
          }
        ]
      }
    });
  },

  recordNodeComplete: (
    nodeId: string,
    durationMs: number,
    memoryUsageMb?: number,
    status: "completed" | "failed" | "skipped" = "completed",
    errorMessage?: string
  ) => {
    const currentRun = get().currentRun;
    if (!currentRun) {
      return;
    }

    const nodeIndex = currentRun.nodePerformances.findIndex((n) => n.nodeId === nodeId);
    if (nodeIndex === -1) {
      return;
    }

    const updatedNodePerformances = [...currentRun.nodePerformances];
    updatedNodePerformances[nodeIndex] = {
      ...updatedNodePerformances[nodeIndex],
      executionTimeMs: durationMs,
      memoryUsageMb,
      status,
      errorMessage
    };

    const completedNodes = updatedNodePerformances.filter(
      (n) => n.status === "completed"
    ).length;
    const failedNodes = updatedNodePerformances.filter(
      (n) => n.status === "failed"
    ).length;

    set({
      currentRun: {
        ...currentRun,
        nodePerformances: updatedNodePerformances,
        completedNodes,
        failedNodes
      }
    });
  },

  recordNodeFailure: (nodeId: string, errorMessage: string) => {
    get().recordNodeComplete(nodeId, 0, undefined, "failed", errorMessage);
  },

  finishRecording: () => {
    const currentRun = get().currentRun;
    if (!currentRun) {
      return;
    }

    const endTime = Date.now();
    const totalDurationMs = endTime - currentRun.startTime;

    const sortedByDuration = [...currentRun.nodePerformances].sort(
      (a, b) => b.executionTimeMs - a.executionTimeMs
    );

    const topBottlenecks = sortedByDuration
      .filter((n) => n.executionTimeMs > 0)
      .slice(0, 5)
      .map((n) => ({
        nodeId: n.nodeId,
        nodeType: n.nodeType,
        durationMs: n.executionTimeMs
      }));

    const snapshot: PerformanceSnapshot = {
      id: currentRun.runId,
      workflowId: currentRun.workflowId,
      workflowName: currentRun.nodePerformances[0]?.nodeName.split("/")[0] || "Unknown",
      version: 1,
      timestamp: endTime,
      durationMs: totalDurationMs,
      nodeCount: currentRun.nodeCount,
      status: currentRun.failedNodes > 0 ? "failed" : currentRun.completedNodes === currentRun.nodeCount ? "success" : "partial",
      topBottlenecks
    };

    set((state) => ({
      snapshots: [...state.snapshots, snapshot],
      currentRun: null,
      isRecording: false
    }));
  },

  cancelRecording: () => {
    set({
      currentRun: null,
      isRecording: false
    });
  },

  getSnapshots: (workflowId: string) => {
    return get().snapshots.filter((s) => s.workflowId === workflowId);
  },

  getBottlenecks: (workflowId: string, limit: number = 10) => {
    const snapshots = get().snapshots.filter((s) => s.workflowId === workflowId);
    return snapshots.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  },

  clearSnapshots: (workflowId?: string) => {
    if (workflowId) {
      set((state) => ({
        snapshots: state.snapshots.filter((s) => s.workflowId !== workflowId)
      }));
    } else {
      set({ snapshots: [] });
    }
  }
}));

export default usePerformanceProfilerStore;
export type { PerformanceSnapshot, NodePerformance, WorkflowPerformance };
