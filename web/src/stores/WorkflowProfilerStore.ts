/**
 * Workflow Performance Profiler Store
 *
 * Analyzes workflow execution timing data to identify performance bottlenecks,
 * provide statistics, and offer optimization suggestions.
 */
import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";

interface NodeProfile {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  percentage: number;
  isBottleneck: boolean;
}

interface WorkflowProfile {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedNodes: number;
  averageNodeDuration: number;
  slowestNode: NodeProfile | null;
  bottlenecks: NodeProfile[];
  parallelizableNodes: string[];
  startTime: number;
  endTime: number;
}

interface PerformanceSuggestion {
  type: "warning" | "info" | "success";
  message: string;
  impact: "high" | "medium" | "low";
  nodeIds?: string[];
}

interface WorkflowProfilerStore {
  profiles: Record<string, WorkflowProfile>;
  suggestions: Record<string, PerformanceSuggestion[]>;
  nodeLabels: Record<string, Record<string, string>>;

  getProfile: (workflowId: string) => WorkflowProfile | null;
  getSuggestions: (workflowId: string) => PerformanceSuggestion[];
  setNodeLabel: (workflowId: string, nodeId: string, label: string) => void;
  analyzeWorkflow: (
    workflowId: string,
    nodes: ReadonlyArray<{ id: string; type?: string | undefined; data: Record<string, unknown> }>
  ) => WorkflowProfile | null;
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
}

const SLOW_NODE_THRESHOLD = 0.3;
const BOTTLENECK_COUNT = 3;

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set, get) => ({
  profiles: {},
  suggestions: {},
  nodeLabels: {},

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId] || null;
  },

  getSuggestions: (workflowId: string) => {
    return get().suggestions[workflowId] || [];
  },

  setNodeLabel: (workflowId: string, nodeId: string, label: string) => {
    set({
      nodeLabels: {
        ...get().nodeLabels,
        [workflowId]: {
          ...(get().nodeLabels[workflowId] || {}),
          [nodeId]: label
        }
      }
    });
  },

  analyzeWorkflow: (
    workflowId: string,
    nodes: ReadonlyArray<{ id: string; type?: string | undefined; data: Record<string, unknown> }>
  ): WorkflowProfile | null => {
    const executionTimeStore = useExecutionTimeStore.getState();
    const nodeLabels = get().nodeLabels[workflowId] || {};

    const timings: { nodeId: string; duration: number }[] = [];
    let totalDuration = 0;
    let startTime = Infinity;
    let endTime = 0;

    for (const node of nodes) {
      const duration = executionTimeStore.getDuration(workflowId, node.id);
      if (duration !== undefined) {
        timings.push({
          nodeId: node.id,
          duration
        });
        totalDuration += duration;
        const timing = executionTimeStore.getTiming(workflowId, node.id);
        if (timing?.startTime) {
          startTime = Math.min(startTime, timing.startTime);
        }
        if (timing?.endTime) {
          endTime = Math.max(endTime, timing.endTime);
        }
      }
    }

    if (timings.length === 0) {
      return null;
    }

    const sortedByDuration = [...timings].sort((a, b) => b.duration - a.duration);
    const slowestNodeDuration = sortedByDuration[0]?.duration || 1;

    const nodeProfiles: NodeProfile[] = timings.map((timing) => {
      const node = nodes.find((n) => n.id === timing.nodeId);
      const label = nodeLabels[timing.nodeId] || (node?.data?.title as string) || node?.id || timing.nodeId;
      return {
        nodeId: timing.nodeId,
        nodeType: node?.type || "unknown",
        nodeLabel: label,
        duration: timing.duration,
        percentage: (timing.duration / slowestNodeDuration) * 100,
        isBottleneck: timing.duration >= slowestNodeDuration * SLOW_NODE_THRESHOLD
      };
    });

    const bottlenecks = nodeProfiles
      .filter((n) => n.isBottleneck)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, BOTTLENECK_COUNT);

    const parallelizableNodes = nodeProfiles
      .filter((n) => n.percentage < SLOW_NODE_THRESHOLD * 100)
      .map((n) => n.nodeId);

    const profile: WorkflowProfile = {
      workflowId,
      totalDuration,
      nodeCount: nodes.length,
      completedNodes: timings.length,
      averageNodeDuration: totalDuration / timings.length,
      slowestNode: bottlenecks[0] || null,
      bottlenecks,
      parallelizableNodes,
      startTime: startTime === Infinity ? 0 : startTime,
      endTime
    };

    const suggestions = generateSuggestions(profile, nodeProfiles);

    set({
      profiles: {
        ...get().profiles,
        [workflowId]: profile
      },
      suggestions: {
        ...get().suggestions,
        [workflowId]: suggestions
      }
    });

    return profile;
  },

  clearProfile: (workflowId: string) => {
    const profiles = { ...get().profiles };
    const suggestions = { ...get().suggestions };
    const nodeLabels = { ...get().nodeLabels };
    delete profiles[workflowId];
    delete suggestions[workflowId];
    delete nodeLabels[workflowId];
    set({ profiles, suggestions, nodeLabels });
  },

  clearAllProfiles: () => {
    set({ profiles: {}, suggestions: {}, nodeLabels: {} });
  }
}));

function generateSuggestions(_profile: WorkflowProfile, _nodeProfiles: NodeProfile[]): PerformanceSuggestion[] {
  const suggestions: PerformanceSuggestion[] = [];

  if (_profile.slowestNode && _profile.slowestNode.duration > 10000) {
    suggestions.push({
      type: "warning",
      message: `Node "${_profile.slowestNode.nodeLabel}" is taking ${formatDuration(_profile.slowestNode.duration)}. Consider optimizing or using a faster model.`,
      impact: "high",
      nodeIds: [_profile.slowestNode.nodeId]
    });
  }

  if (_profile.bottlenecks.length > 0) {
    const bottleneckIds = _profile.bottlenecks.map((b) => b.nodeId);
    const totalBottleneckTime = _profile.bottlenecks.reduce((sum, b) => sum + b.duration, 0);
    const bottleneckPercentage = Math.round((totalBottleneckTime / _profile.totalDuration) * 100);

    if (bottleneckPercentage > 80) {
      suggestions.push({
        type: "warning",
        message: `${_profile.bottlenecks.length} node(s) account for ${bottleneckPercentage}% of total execution time. Focus optimization efforts here.`,
        impact: "high",
        nodeIds: bottleneckIds
      });
    }
  }

  if (_profile.parallelizableNodes.length > 2) {
    suggestions.push({
      type: "info",
      message: `${_profile.parallelizableNodes.length} nodes could potentially run in parallel. Consider restructuring your workflow.`,
      impact: "medium",
      nodeIds: _profile.parallelizableNodes
    });
  }

  if (_profile.completedNodes < _profile.nodeCount) {
    suggestions.push({
      type: "info",
      message: `Only ${_profile.completedNodes}/${_profile.nodeCount} nodes have completed execution.`,
      impact: "low"
    });
  }

  if (_profile.averageNodeDuration < 1000 && _profile.nodeCount > 5) {
    suggestions.push({
      type: "success",
      message: "Good performance! Most nodes are executing quickly.",
      impact: "low"
    });
  }

  return suggestions;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const remainingMs = Math.round(ms % 1000);
    return `${seconds}s ${remainingMs}ms`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const remainingSeconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${remainingSeconds}s`;
  }
}

export default useWorkflowProfilerStore;

export type { WorkflowProfile, NodeProfile, PerformanceSuggestion };
