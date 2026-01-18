import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";

export interface PerformanceMetrics {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  averageNodeDuration: number;
  medianNodeDuration: number;
  p95NodeDuration: number;
  bottleneckNodes: string[];
  parallelizableNodes: string[];
}

export interface NodePerformance {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  duration: number;
  percentage: number;
  status: "completed" | "failed" | "pending" | "running";
  isBottleneck: boolean;
}

export interface PerformanceSnapshot {
  id: string;
  timestamp: number;
  workflowId: string;
  metrics: PerformanceMetrics;
  nodePerformances: NodePerformance[];
}

interface PerformanceStore {
  snapshots: PerformanceSnapshot[];
  currentSnapshot: PerformanceSnapshot | null;
  recordExecution: (workflowId: string, nodeCount: number) => void;
  getLatestSnapshot: (workflowId: string) => PerformanceSnapshot | null;
  getSnapshots: (workflowId: string) => PerformanceSnapshot[];
  clearSnapshots: (workflowId: string) => void;
  getNodePerformance: (workflowId: string, nodeId: string) => NodePerformance | null;
}

const calculatePercentile = (durations: number[], percentile: number): number => {
  if (durations.length === 0) {
    return 0;
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
};

const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  snapshots: [],
  currentSnapshot: null,

  recordExecution: (workflowId: string, nodeCount: number) => {
    const executionTimings = useExecutionTimeStore.getState().timings;
    const workflowTimings: Array<{ nodeId: string; duration: number; startTime: number; endTime?: number }> = [];

    for (const [key, timing] of Object.entries(executionTimings)) {
      if (key.startsWith(`${workflowId}:`)) {
        const [, nodeId] = key.split(":");
        const duration = timing.endTime
          ? timing.endTime - timing.startTime
          : Date.now() - timing.startTime;
        workflowTimings.push({
          nodeId,
          duration,
          startTime: timing.startTime,
          endTime: timing.endTime
        });
      }
    }

    if (workflowTimings.length === 0) {
      return;
    }

    const durations = workflowTimings.map(t => t.duration);
    const totalDuration = Math.max(...workflowTimings.map(t => t.endTime || Date.now())) -
      Math.min(...workflowTimings.map(t => t.startTime));

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const medianDuration = sortedDurations[Math.floor(sortedDurations.length / 2)] || 0;
    const p95Duration = calculatePercentile(durations, 95);

    const maxDuration = Math.max(...durations);
    const bottleneckThreshold = averageDuration * 2;
    const bottleneckNodes = workflowTimings
      .filter(t => t.duration >= bottleneckThreshold && t.duration > 100)
      .map(t => t.nodeId);

    const parallelizableNodes = workflowTimings
      .filter(t => {
        const node = workflowTimings.find(nt => nt.nodeId === t.nodeId);
        if (!node || node.endTime === undefined) {
          return false;
        }
        const nodeEndTime = node.endTime;
        const hasOverlap = workflowTimings.some(other =>
          other.nodeId !== t.nodeId &&
          other.endTime !== undefined &&
          other.startTime < nodeEndTime &&
          other.endTime > node.startTime
        );
        return !hasOverlap;
      })
      .map(t => t.nodeId);

    const metrics: PerformanceMetrics = {
      workflowId,
      totalDuration,
      nodeCount,
      completedNodes: workflowTimings.length,
      failedNodes: 0,
      averageNodeDuration: averageDuration,
      medianNodeDuration: medianDuration,
      p95NodeDuration: p95Duration,
      bottleneckNodes,
      parallelizableNodes
    };

    const nodePerformances: NodePerformance[] = workflowTimings.map(t => ({
      nodeId: t.nodeId,
      nodeType: "node",
      nodeName: t.nodeId.substring(0, 8),
      duration: t.duration,
      percentage: maxDuration > 0 ? (t.duration / maxDuration) * 100 : 0,
      status: t.endTime ? "completed" : "running",
      isBottleneck: bottleneckNodes.includes(t.nodeId)
    }));

    const snapshot: PerformanceSnapshot = {
      id: `${workflowId}-${Date.now()}`,
      timestamp: Date.now(),
      workflowId,
      metrics,
      nodePerformances
    };

    set(state => ({
      snapshots: [...state.snapshots.slice(-49), snapshot],
      currentSnapshot: snapshot
    }));
  },

  getLatestSnapshot: (workflowId: string) => {
    const state = get();
    const workflowSnapshots = state.snapshots.filter(s => s.workflowId === workflowId);
    return workflowSnapshots[workflowSnapshots.length - 1] || null;
  },

  getSnapshots: (workflowId: string) => {
    return get().snapshots.filter(s => s.workflowId === workflowId);
  },

  clearSnapshots: (workflowId: string) => {
    set(state => ({
      snapshots: state.snapshots.filter(s => s.workflowId !== workflowId),
      currentSnapshot: state.currentSnapshot?.workflowId === workflowId ? null : state.currentSnapshot
    }));
  },

  getNodePerformance: (workflowId: string, nodeId: string) => {
    const snapshot = get().getLatestSnapshot(workflowId);
    return snapshot?.nodePerformances.find(np => np.nodeId === nodeId) || null;
  }
}));

export default usePerformanceStore;
