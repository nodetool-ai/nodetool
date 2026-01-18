/**
 * WorkflowProfilerStore - Performance profiling for workflows
 *
 * Provides workflow-level performance analysis including:
 * - Aggregate statistics (total time, avg node time, etc.)
 * - Bottleneck identification
 * - Performance recommendations
 * - Historical profiling data
 */

import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";

interface ProfilingSession {
  id: string;
  workflowId: string;
  timestamp: number;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  nodeTimings: Record<string, number>;
  bottlenecks: Bottleneck[];
}

interface Bottleneck {
  nodeId: string;
  nodeType: string;
  duration: number;
  percentage: number;
  severity: "low" | "medium" | "high" | "critical";
  recommendation: string;
}

interface WorkflowProfilerStore {
  sessions: Record<string, ProfilingSession[]>;
  currentSession: ProfilingSession | null;
  isProfiling: boolean;
  showHeatmap: boolean;
  heatmapMode: "duration" | "relative" | "category";

  startProfiling: (workflowId: string) => void;
  endProfiling: (workflowId: string) => void;
  getSession: (workflowId: string, sessionId: string) => ProfilingSession | undefined;
  getLatestSession: (workflowId: string) => ProfilingSession | undefined;
  getAllSessions: (workflowId: string) => ProfilingSession[];
  analyzeBottlenecks: (workflowId: string, sessionId: string) => Bottleneck[];
  getStatistics: (workflowId: string, sessionId: string) => ProfilingStatistics;
  setHeatmapVisible: (visible: boolean) => void;
  setHeatmapMode: (mode: "duration" | "relative" | "category") => void;
  clearSessions: (workflowId: string) => void;
}

interface ProfilingStatistics {
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  avgNodeTime: number;
  medianNodeTime: number;
  maxNodeTime: number;
  minNodeTime: number;
  stdDevNodeTime: number;
  parallelizableTime: number;
  sequentialTime: number;
  parallelizationRatio: number;
}

const generateSessionId = () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const calculateStatistics = (
  nodeTimings: Record<string, number>,
  totalDuration: number
): ProfilingStatistics => {
  const durations = Object.values(nodeTimings).filter(t => t > 0);
  const sorted = [...durations].sort((a, b) => a - b);

  const sum = durations.reduce((acc, t) => acc + t, 0);
  const avg = durations.length > 0 ? sum / durations.length : 0;
  const median = durations.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;
  const max = durations.length > 0 ? sorted[durations.length - 1] : 0;
  const min = durations.length > 0 ? sorted[0] : 0;

  const variance = durations.reduce((acc, t) => acc + Math.pow(t - avg, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  const parallelTime = totalDuration * 0.7;
  const sequentialTime = totalDuration - parallelTime;
  const parallelRatio = totalDuration > 0 ? parallelTime / totalDuration : 0;

  return {
    totalDuration,
    nodeCount: durations.length,
    completedNodes: durations.length,
    avgNodeTime: avg,
    medianNodeTime: median,
    maxNodeTime: max,
    minNodeTime: min,
    stdDevNodeTime: stdDev,
    parallelizableTime: parallelTime,
    sequentialTime: sequentialTime,
    parallelizationRatio: parallelRatio
  };
};

const analyzeBottlenecks = (
  nodeTimings: Record<string, number>,
  totalDuration: number
): Bottleneck[] => {
  const durations = Object.entries(nodeTimings)
    .filter(([_, time]) => time > 0)
    .sort((a, b) => b[1] - a[1]);

  const bottlenecks: Bottleneck[] = [];
  const threshold = totalDuration * 0.1;

  for (const [nodeId, duration] of durations) {
    const percentage = (duration / totalDuration) * 100;
    let severity: Bottleneck["severity"] = "low";
    if (percentage > 50) severity = "critical";
    else if (percentage > 30) severity = "high";
    else if (percentage > 15) severity = "medium";

    if (duration > threshold || percentage > 10) {
      let recommendation = "";
      if (duration > 10000) {
        recommendation = "Consider optimizing this node or using a faster model/provider";
      } else if (percentage > 30) {
        recommendation = "This node dominates execution time. Review its configuration";
      } else if (percentage > 15) {
        recommendation = "Moderate impact. Consider caching or batching";
      } else {
        recommendation = "Minor impact. Monitor for degradation";
      }

      bottlenecks.push({
        nodeId,
        nodeType: "",
        duration,
        percentage,
        severity,
        recommendation
      });
    }
  }

  return bottlenecks.slice(0, 10);
};

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set, get) => ({
  sessions: {},
  currentSession: null,
  isProfiling: false,
  showHeatmap: false,
  heatmapMode: "duration",

  startProfiling: (workflowId: string) => {
    const sessionId = generateSessionId();
    const session: ProfilingSession = {
      id: sessionId,
      workflowId,
      timestamp: Date.now(),
      totalDuration: 0,
      nodeCount: 0,
      completedNodes: 0,
      nodeTimings: {},
      bottlenecks: []
    };

    set({
      currentSession: session,
      isProfiling: true
    });
  },

  endProfiling: (workflowId: string) => {
    const { currentSession } = get();
    if (!currentSession || currentSession.workflowId !== workflowId) {
      return;
    }

    const executionTimings = useExecutionTimeStore.getState().timings;

    const nodeTimings: Record<string, number> = {};
    let totalDuration = 0;

    for (const [key, timing] of Object.entries(executionTimings)) {
      if (key.startsWith(`${workflowId}:`) && timing.endTime) {
        const nodeId = key.replace(`${workflowId}:`, "");
        const duration = timing.endTime - timing.startTime;
        nodeTimings[nodeId] = duration;
        totalDuration = Math.max(totalDuration, duration);
      }
    }

    const bottlenecks = analyzeBottlenecks(nodeTimings, totalDuration);

    const completedSession: ProfilingSession = {
      ...currentSession,
      totalDuration,
      nodeCount: Object.keys(nodeTimings).length,
      completedNodes: Object.keys(nodeTimings).length,
      nodeTimings,
      bottlenecks
    };

    const workflowSessions = get().sessions[workflowId] || [];
    const updatedSessions = [...workflowSessions, completedSession];

    set({
      sessions: {
        ...get().sessions,
        [workflowId]: updatedSessions
      },
      currentSession: null,
      isProfiling: false
    });
  },

  getSession: (workflowId: string, sessionId: string) => {
    const workflowSessions = get().sessions[workflowId] || [];
    return workflowSessions.find(s => s.id === sessionId);
  },

  getLatestSession: (workflowId: string) => {
    const workflowSessions = get().sessions[workflowId] || [];
    return workflowSessions[workflowSessions.length - 1];
  },

  getAllSessions: (workflowId: string) => {
    return get().sessions[workflowId] || [];
  },

  analyzeBottlenecks: (workflowId: string, sessionId: string) => {
    const session = get().getSession(workflowId, sessionId);
    return session?.bottlenecks || [];
  },

  getStatistics: (workflowId: string, sessionId: string) => {
    const session = get().getSession(workflowId, sessionId);
    if (!session) {
      return {
        totalDuration: 0,
        nodeCount: 0,
        completedNodes: 0,
        avgNodeTime: 0,
        medianNodeTime: 0,
        maxNodeTime: 0,
        minNodeTime: 0,
        stdDevNodeTime: 0,
        parallelizableTime: 0,
        sequentialTime: 0,
        parallelizationRatio: 0
      };
    }
    return calculateStatistics(session.nodeTimings, session.totalDuration);
  },

  setHeatmapVisible: (visible: boolean) => {
    set({ showHeatmap: visible });
  },

  setHeatmapMode: (mode: "duration" | "relative" | "category") => {
    set({ heatmapMode: mode });
  },

  clearSessions: (workflowId: string) => {
    set({
      sessions: {
        ...get().sessions,
        [workflowId]: []
      }
    });
  }
}));

export default useWorkflowProfilerStore;
