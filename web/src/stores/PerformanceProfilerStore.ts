/**
 * PerformanceProfilerStore
 *
 * Aggregates and analyzes workflow performance metrics.
 * Tracks node execution times, identifies bottlenecks, and provides
 * optimization suggestions.
 *
 * Features:
 * - Aggregates timing data from ExecutionTimeStore
 * - Identifies slow nodes (bottlenecks)
 * - Calculates workflow-level statistics
 * - Generates optimization suggestions
 * - Maintains historical profiling sessions
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import useExecutionTimeStore from "./ExecutionTimeStore";

export interface NodeProfile {
  nodeId: string;
  nodeType: string;
  duration: number;
  startTime: number;
  endTime: number;
  status: "completed" | "failed" | "running";
}

export interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  failedNodes: number;
  nodes: NodeProfile[];
  timestamp: number;
}

export interface BottleneckInfo {
  nodeId: string;
  nodeType: string;
  duration: number;
  percentageOfTotal: number;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

export interface ProfilerStats {
  totalExecutions: number;
  averageDuration: number;
  slowestNodeType: string;
  mostCommonBottleneck: string;
}

interface PerformanceProfilerState {
  profiles: Record<string, WorkflowProfile[]>;
  currentProfile: WorkflowProfile | null;
  isProfiling: boolean;

  startProfiling: (workflowId: string, workflowName: string) => void;
  endProfiling: (workflowId: string) => WorkflowProfile | null;
  recordNodeExecution: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    status: "completed" | "failed" | "running"
  ) => void;
  getLatestProfile: (workflowId: string) => WorkflowProfile | null;
  getBottlenecks: (workflowId: string) => BottleneckInfo[];
  getProfilerStats: () => ProfilerStats;
  clearProfiles: (workflowId?: string) => void;
  getNodeRankings: (workflowId: string) => NodeProfile[];
}

const SLOW_NODE_THRESHOLD_MS = 5000;
const CRITICAL_BOTTLENECK_THRESHOLD = 0.3;

export const usePerformanceProfilerStore = create<PerformanceProfilerState>()(
  persist(
    (set, get) => ({
      profiles: {},
      currentProfile: null,
      isProfiling: false,

      startProfiling: (workflowId: string, workflowName: string) => {
        const newProfile: WorkflowProfile = {
          workflowId,
          workflowName,
          totalDuration: 0,
          nodeCount: 0,
          completedNodes: 0,
          failedNodes: 0,
          nodes: [],
          timestamp: Date.now()
        };
        set({
          currentProfile: newProfile,
          isProfiling: true
        });
      },

      endProfiling: (workflowId: string) => {
        const { currentProfile, profiles } = get();
        if (!currentProfile || currentProfile.workflowId !== workflowId) {
          return null;
        }

        const executionStore = useExecutionTimeStore.getState();
        let totalDuration = 0;
        let nodeCount = 0;
        let completedNodes = 0;
        let failedNodes = 0;

        const nodes: NodeProfile[] = currentProfile.nodes.map(nodeProfile => {
          const timing = executionStore.getTiming(workflowId, nodeProfile.nodeId);
          const duration = executionStore.getDuration(workflowId, nodeProfile.nodeId);

          if (duration !== undefined) {
            const endTime = timing?.endTime ?? 0;
            const startTime = timing?.startTime ?? totalDuration;
            totalDuration = Math.max(totalDuration, endTime) - Math.min(totalDuration, startTime);
            nodeCount++;
            if (nodeProfile.status === "completed") {
              completedNodes++;
            } else if (nodeProfile.status === "failed") {
              failedNodes++;
            }
          }

          return {
            ...nodeProfile,
            duration: duration || nodeProfile.duration,
            endTime: timing?.endTime || nodeProfile.endTime
          };
        });

        const finalizedProfile: WorkflowProfile = {
          ...currentProfile,
          totalDuration: nodes.reduce((sum, n) => sum + (n.duration || 0), 0),
          nodeCount,
          completedNodes,
          failedNodes,
          nodes
        };

        const workflowProfiles = profiles[workflowId] || [];
        const updatedProfiles = {
          ...profiles,
          [workflowId]: [...workflowProfiles, finalizedProfile].slice(-50)
        };

        set({
          currentProfile: null,
          isProfiling: false,
          profiles: updatedProfiles
        });

        return finalizedProfile;
      },

      recordNodeExecution: (
        workflowId: string,
        nodeId: string,
        nodeType: string,
        status: "completed" | "failed" | "running"
      ) => {
        const { currentProfile } = get();
        if (!currentProfile || currentProfile.workflowId !== workflowId) {
          return;
        }

        const executionStore = useExecutionTimeStore.getState();
        const timing = executionStore.getTiming(workflowId, nodeId);
        const duration = executionStore.getDuration(workflowId, nodeId);

        const nodeProfile: NodeProfile = {
          nodeId,
          nodeType,
          duration: duration || 0,
          startTime: timing?.startTime || Date.now(),
          endTime: timing?.endTime || Date.now(),
          status
        };

        set({
          currentProfile: {
            ...currentProfile,
            nodes: [...currentProfile.nodes, nodeProfile]
          }
        });
      },

      getLatestProfile: (workflowId: string) => {
        const { profiles, currentProfile } = get();
        if (currentProfile && currentProfile.workflowId === workflowId) {
          return currentProfile;
        }
        const workflowProfiles = profiles[workflowId];
        if (!workflowProfiles || workflowProfiles.length === 0) {
          return null;
        }
        return workflowProfiles[workflowProfiles.length - 1];
      },

      getBottlenecks: (workflowId: string) => {
        const profile = get().getLatestProfile(workflowId);
        if (!profile) {
          return [];
        }

        const bottlenecks: BottleneckInfo[] = [];
        const totalDuration = profile.nodes.reduce((sum, n) => sum + (n.duration || 0), 0);

        if (totalDuration === 0) {
          return bottlenecks;
        }

        const sortedNodes = [...profile.nodes].sort((a, b) => (b.duration || 0) - (a.duration || 0));

        for (const node of sortedNodes) {
          const duration = node.duration || 0;
          const percentageOfTotal = duration / totalDuration;

          if (duration < SLOW_NODE_THRESHOLD_MS && percentageOfTotal < CRITICAL_BOTTLENECK_THRESHOLD) {
            continue;
          }

          const severity: "high" | "medium" | "low" = percentageOfTotal >= CRITICAL_BOTTLENECK_THRESHOLD
            ? "high"
            : duration >= SLOW_NODE_THRESHOLD_MS * 2
            ? "high"
            : duration >= SLOW_NODE_THRESHOLD_MS
            ? "medium"
            : "low";

          let suggestion = "";
          if (node.nodeType.includes("LLM") || node.nodeType.includes("Model")) {
            suggestion = "Consider using a faster model or enable caching for repeated requests";
          } else if (node.nodeType.includes("Image") || node.nodeType.includes("Video")) {
            suggestion = "Consider reducing image/video resolution or using batch processing";
          } else if (node.nodeType.includes("Audio")) {
            suggestion = "Consider reducing audio quality or chunk size for streaming";
          } else if (duration > 10000) {
            suggestion = "Review node configuration and input data size";
          } else {
            suggestion = "Monitor for future executions to establish baseline";
          }

          bottlenecks.push({
            nodeId: node.nodeId,
            nodeType: node.nodeType,
            duration,
            percentageOfTotal,
            severity,
            suggestion
          });
        }

        return bottlenecks;
      },

      getProfilerStats: () => {
        const { profiles } = get();
        let totalExecutions = 0;
        let totalDuration = 0;
        const nodeTypeDurations: Record<string, number[]> = {};

        for (const workflowId in profiles) {
          const workflowProfiles = profiles[workflowId];
          totalExecutions += workflowProfiles.length;

          for (const profile of workflowProfiles) {
            totalDuration += profile.totalDuration;

            for (const node of profile.nodes) {
              if (!nodeTypeDurations[node.nodeType]) {
                nodeTypeDurations[node.nodeType] = [];
              }
              nodeTypeDurations[node.nodeType].push(node.duration);
            }
          }
        }

        let slowestNodeType = "N/A";
        let maxAvgDuration = 0;

        for (const nodeType in nodeTypeDurations) {
          const durations = nodeTypeDurations[nodeType];
          const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
          if (avgDuration > maxAvgDuration) {
            maxAvgDuration = avgDuration;
            slowestNodeType = nodeType;
          }
        }

        let mostCommonBottleneck = "N/A";
        let maxBottleneckCount = 0;

        for (const nodeType in nodeTypeDurations) {
          const slowNodes = nodeTypeDurations[nodeType].filter(d => d >= SLOW_NODE_THRESHOLD_MS);
          if (slowNodes.length > maxBottleneckCount) {
            maxBottleneckCount = slowNodes.length;
            mostCommonBottleneck = nodeType;
          }
        }

        return {
          totalExecutions,
          averageDuration: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
          slowestNodeType,
          mostCommonBottleneck
        };
      },

      clearProfiles: (workflowId?: string) => {
        const { profiles } = get();
        if (workflowId) {
          set({ profiles: { ...profiles, [workflowId]: [] } });
        } else {
          set({ profiles: {}, currentProfile: null });
        }
      },

      getNodeRankings: (workflowId: string) => {
        const profile = get().getLatestProfile(workflowId);
        if (!profile) {
          return [];
        }
        return [...profile.nodes].sort((a, b) => (b.duration || 0) - (a.duration || 0));
      }
    }),
    {
      name: "performance-profiler-storage",
      partialize: (state) => ({
        profiles: state.profiles
      })
    }
  )
);

export default usePerformanceProfilerStore;
