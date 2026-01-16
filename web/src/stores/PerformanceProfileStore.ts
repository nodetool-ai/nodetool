/**
 * PerformanceProfileStore - Tracks workflow execution performance metrics
 *
 * Responsibilities:
 * - Aggregate performance data across workflow runs
 * - Calculate statistics (min, max, avg, percentiles)
 * - Track bottlenecks and performance trends
 * - Store historical runs for comparison
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  executionTimes: number[];
  lastExecutionTime?: number;
  totalExecutions: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p50Time: number;
  p95Time: number;
  p99Time: number;
  errorCount: number;
}

export interface WorkflowPerformanceMetrics {
  workflowId: string;
  workflowName: string;
  runId: string;
  timestamp: number;
  totalDuration: number;
  nodeCount: number;
  successfulNodes: number;
  failedNodes: number;
  nodeMetrics: Record<string, NodePerformanceMetrics>;
  startTime: number;
  endTime: number;
  status: "completed" | "error" | "cancelled";
}

export interface PerformanceProfileState {
  profiles: WorkflowPerformanceMetrics[];
  currentRunId: string | null;
  currentWorkflowId: string | null;
  isRecording: boolean;

  startRecording: (workflowId: string, workflowName: string) => string;
  endRecording: (runId: string, status: "completed" | "error" | "cancelled") => void;
  updateNodeTiming: (runId: string, nodeId: string, nodeType: string, nodeName: string, duration: number, success: boolean) => void;
  getLatestProfile: (workflowId: string) => WorkflowPerformanceMetrics | null;
  getNodeMetrics: (workflowId: string, nodeId: string) => NodePerformanceMetrics | null;
  getWorkflowBottlenecks: (workflowId: string) => NodePerformanceMetrics[];
  getRecentProfiles: (workflowId: string, limit: number) => WorkflowPerformanceMetrics[];
  clearProfiles: (workflowId?: string) => void;
  getStatistics: (workflowId: string) => {
    totalRuns: number;
    avgDuration: number;
    successRate: number;
    avgNodeCount: number;
    topBottleneck: NodePerformanceMetrics | null;
  };
}

const calculatePercentile = (sortedTimes: number[], percentile: number): number => {
  if (sortedTimes.length === 0) {
    return 0;
  }
  const index = Math.ceil((percentile / 100) * sortedTimes.length) - 1;
  return sortedTimes[Math.max(0, index)];
};

const calculateStats = (times: number[]): { avg: number; min: number; max: number; p50: number; p95: number; p99: number } => {
  if (times.length === 0) {
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    avg: sum / times.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: calculatePercentile(sorted, 50),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99)
  };
};

let runCounter = 0;

export const usePerformanceProfileStore = create<PerformanceProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      currentRunId: null,
      currentWorkflowId: null,
      isRecording: false,

      startRecording: (workflowId: string, workflowName: string): string => {
        const runId = `run_${Date.now()}_${++runCounter}`;
        const newProfile: WorkflowPerformanceMetrics = {
          workflowId,
          workflowName,
          runId,
          timestamp: Date.now(),
          totalDuration: 0,
          nodeCount: 0,
          successfulNodes: 0,
          failedNodes: 0,
          nodeMetrics: {},
          startTime: Date.now(),
          endTime: 0,
          status: "completed"
        };

        set((state) => ({
          profiles: [newProfile, ...state.profiles].slice(0, 100),
          currentRunId: runId,
          currentWorkflowId: workflowId,
          isRecording: true
        }));

        return runId;
      },

      endRecording: (runId: string, status: "completed" | "error" | "cancelled") => {
        set((state) => {
          const profileIndex = state.profiles.findIndex((p) => p.runId === runId);
          if (profileIndex === -1) {
            return state;
          }

          const profile = { ...state.profiles[profileIndex] };
          profile.status = status;
          profile.endTime = Date.now();
          profile.totalDuration = profile.endTime - profile.startTime;

          const profiles = [...state.profiles];
          profiles[profileIndex] = profile;

          return {
            profiles,
            currentRunId: null,
            currentWorkflowId: null,
            isRecording: false
          };
        });
      },

      updateNodeTiming: (runId: string, nodeId: string, nodeType: string, nodeName: string, duration: number, success: boolean) => {
        set((state) => {
          const profileIndex = state.profiles.findIndex((p) => p.runId === runId);
          if (profileIndex === -1) {
            return state;
          }

          const profile = { ...state.profiles[profileIndex] };
          const nodeMetrics = { ...profile.nodeMetrics };

          if (!nodeMetrics[nodeId]) {
            nodeMetrics[nodeId] = {
              nodeId,
              nodeType,
              nodeName,
              executionTimes: [],
              totalExecutions: 0,
              averageTime: 0,
              minTime: 0,
              maxTime: 0,
              p50Time: 0,
              p95Time: 0,
              p99Time: 0,
              errorCount: 0
            };
            profile.nodeCount++;
          }

          const nodeMetric = { ...nodeMetrics[nodeId] };
          nodeMetric.executionTimes.push(duration);
          nodeMetric.totalExecutions++;
          nodeMetric.lastExecutionTime = duration;
          if (!success) {
            nodeMetric.errorCount++;
          }

          const stats = calculateStats(nodeMetric.executionTimes);
          nodeMetric.averageTime = stats.avg;
          nodeMetric.minTime = stats.min;
          nodeMetric.maxTime = stats.max;
          nodeMetric.p50Time = stats.p50;
          nodeMetric.p95Time = stats.p95;
          nodeMetric.p99Time = stats.p99;

          nodeMetrics[nodeId] = nodeMetric;

          if (success) {
            profile.successfulNodes++;
          } else {
            profile.failedNodes++;
          }

          const profiles = [...state.profiles];
          profiles[profileIndex] = { ...profile, nodeMetrics };

          return { profiles };
        });
      },

      getLatestProfile: (workflowId: string) => {
        const state = get();
        return state.profiles.find((p) => p.workflowId === workflowId) || null;
      },

      getNodeMetrics: (workflowId: string, nodeId: string) => {
        const profile = get().getLatestProfile(workflowId);
        return profile?.nodeMetrics[nodeId] || null;
      },

      getWorkflowBottlenecks: (workflowId: string) => {
        const profile = get().getLatestProfile(workflowId);
        if (!profile) {
          return [];
        }

        return Object.values(profile.nodeMetrics)
          .filter((m) => m.totalExecutions > 0)
          .sort((a, b) => b.averageTime - a.averageTime);
      },

      getRecentProfiles: (workflowId: string, limit: number) => {
        const state = get();
        return state.profiles.filter((p) => p.workflowId === workflowId).slice(0, limit);
      },

      clearProfiles: (workflowId?: string) => {
        set((state) => {
          if (workflowId) {
            return {
              profiles: state.profiles.filter((p) => p.workflowId !== workflowId)
            };
          }
          return { profiles: [] };
        });
      },

      getStatistics: (workflowId: string) => {
        const profiles = get().profiles.filter((p) => p.workflowId === workflowId);
        if (profiles.length === 0) {
          return {
            totalRuns: 0,
            avgDuration: 0,
            successRate: 0,
            avgNodeCount: 0,
            topBottleneck: null
          };
        }

        const completedProfiles = profiles.filter((p) => p.status === "completed");
        const totalDuration = completedProfiles.reduce((sum, p) => sum + p.totalDuration, 0);
        const totalNodes = profiles.reduce((sum, p) => sum + p.nodeCount, 0);
        const totalSuccessful = profiles.reduce((sum, p) => sum + p.successfulNodes, 0);
        const totalFailed = profiles.reduce((sum, p) => sum + p.failedNodes, 0);

        const allNodeMetrics: NodePerformanceMetrics[] = [];
        profiles.forEach((p) => {
          Object.values(p.nodeMetrics).forEach((m) => allNodeMetrics.push(m));
        });

        const avgNodeTimes: Record<string, number[]> = {};
        allNodeMetrics.forEach((m) => {
          if (!avgNodeTimes[m.nodeType]) {
            avgNodeTimes[m.nodeType] = [];
          }
          avgNodeTimes[m.nodeType].push(m.averageTime);
        });

        const bottleneckAverages: Array<{ type: string; avg: number }> = [];
        Object.entries(avgNodeTimes).forEach(([type, times]) => {
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          bottleneckAverages.push({ type, avg });
        });
        bottleneckAverages.sort((a, b) => b.avg - a.avg);

        return {
          totalRuns: profiles.length,
          avgDuration: completedProfiles.length > 0 ? totalDuration / completedProfiles.length : 0,
          successRate: totalNodes > 0 ? (totalSuccessful / (totalSuccessful + totalFailed)) * 100 : 100,
          avgNodeCount: profiles.length > 0 ? totalNodes / profiles.length : 0,
          topBottleneck: bottleneckAverages.length > 0
            ? {
                nodeId: bottleneckAverages[0].type,
                nodeType: bottleneckAverages[0].type,
                nodeName: bottleneckAverages[0].type.split(".").pop() || "Node",
                executionTimes: [],
                totalExecutions: 0,
                averageTime: bottleneckAverages[0].avg,
                minTime: 0,
                maxTime: 0,
                p50Time: 0,
                p95Time: 0,
                p99Time: 0,
                errorCount: 0
              }
            : null
        };
      }
    }),
    {
      name: "performance-profile-storage",
      partialize: (state) => ({ profiles: state.profiles })
    }
  )
);

export default usePerformanceProfileStore;
