/**
 * Performance profiling store for workflow analysis.
 *
 * Tracks performance metrics across workflow executions including:
 * - Node execution times and durations
 * - Memory usage estimates
 * - Bottleneck identification
 * - Optimization suggestions
 *
 * @example
 * ```typescript
 * import usePerformanceStore from './PerformanceStore';
 *
 * const store = usePerformanceStore();
 * store.recordExecution('workflow-1', 'node-1', { duration: 1500, memory: 256 });
 * const metrics = store.getMetrics('workflow-1');
 * ```
 */
import { create } from "zustand";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number;
  memoryEstimate: number;
  startTime: number;
  endTime: number;
  status: "pending" | "running" | "completed" | "failed";
}

export interface WorkflowPerformanceMetrics {
  workflowId: string;
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  averageNodeDuration: number;
  maxNodeDuration: number;
  bottleneckNodes: NodePerformanceMetrics[];
  estimatedMemoryPeak: number;
  parallelizableNodes: string[];
  optimizationSuggestions: string[];
  timestamp: number;
}

interface PerformanceStore {
  profiles: Record<string, WorkflowPerformanceMetrics>;
  currentExecutionNodes: Record<string, NodePerformanceMetrics>;

  recordExecutionStart: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeLabel: string
  ) => void;
  recordExecutionEnd: (
    workflowId: string,
    nodeId: string,
    duration: number,
    memoryEstimate: number
  ) => void;
  recordExecutionFailed: (
    workflowId: string,
    nodeId: string,
    duration: number
  ) => void;
  getMetrics: (workflowId: string) => WorkflowPerformanceMetrics | undefined;
  analyzeBottlenecks: (
    workflowId: string,
    nodes: { id: string; type: string; data: { label?: string } }[]
  ) => void;
  clearProfile: (workflowId: string) => void;
  getNodeMetrics: (
    workflowId: string,
    nodeId: string
  ) => NodePerformanceMetrics | undefined;
}

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const usePerformanceStore = create<PerformanceStore>((set, get) => ({
  profiles: {},
  currentExecutionNodes: {},

  recordExecutionStart: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    nodeLabel: string
  ) => {
    const key = hashKey(workflowId, nodeId);
    const metrics: NodePerformanceMetrics = {
      nodeId,
      nodeType,
      nodeLabel: nodeLabel || nodeId,
      duration: 0,
      memoryEstimate: 0,
      startTime: Date.now(),
      endTime: 0,
      status: "running"
    };
    set({
      currentExecutionNodes: { ...get().currentExecutionNodes, [key]: metrics }
    });
  },

  recordExecutionEnd: (
    workflowId: string,
    nodeId: string,
    duration: number,
    memoryEstimate: number
  ) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().currentExecutionNodes[key];
    if (existing) {
      const updated: NodePerformanceMetrics = {
        ...existing,
        duration,
        memoryEstimate,
        endTime: Date.now(),
        status: "completed"
      };
      set({
        currentExecutionNodes: { ...get().currentExecutionNodes, [key]: updated }
      });
    }
  },

  recordExecutionFailed: (
    workflowId: string,
    nodeId: string,
    duration: number
  ) => {
    const key = hashKey(workflowId, nodeId);
    const existing = get().currentExecutionNodes[key];
    if (existing) {
      const updated: NodePerformanceMetrics = {
        ...existing,
        duration,
        endTime: Date.now(),
        status: "failed"
      };
      set({
        currentExecutionNodes: { ...get().currentExecutionNodes, [key]: updated }
      });
    }
  },

  getMetrics: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  analyzeBottlenecks: (
    workflowId: string,
    nodes: { id: string; type: string; data: { label?: string } }[]
  ) => {
    const executionNodes = get().currentExecutionNodes;
    const nodeMetrics: NodePerformanceMetrics[] = [];

    for (const node of nodes) {
      const key = hashKey(workflowId, node.id);
      const metrics = executionNodes[key];
      if (metrics) {
        nodeMetrics.push(metrics);
      }
    }

    if (nodeMetrics.length === 0) {
      return;
    }

    const totalDuration = nodeMetrics.reduce(
      (sum, m) => sum + m.duration,
      0
    );
    const completedNodes = nodeMetrics.filter((m) => m.status === "completed");
    const failedNodes = nodeMetrics.filter((m) => m.status === "failed");
    const averageDuration =
      completedNodes.length > 0
        ? completedNodes.reduce((sum, m) => sum + m.duration, 0) /
          completedNodes.length
        : 0;
    const maxDuration = Math.max(
      ...completedNodes.map((m) => m.duration),
      0
    );
    const bottleneckThreshold = averageDuration * 2;
    const bottleneckNodes = completedNodes
      .filter((m) => m.duration >= bottleneckThreshold)
      .sort((a, b) => b.duration - a.duration);
    const estimatedMemoryPeak = nodeMetrics.reduce(
      (sum, m) => sum + m.memoryEstimate,
      0
    );
    const parallelizableNodes = nodeMetrics
      .filter((m) => m.status === "completed" && m.duration < bottleneckThreshold)
      .map((m) => m.nodeId);

    const optimizationSuggestions: string[] = [];

    if (bottleneckNodes.length > 0) {
      optimizationSuggestions.push(
        `Consider optimizing ${bottleneckNodes.length} bottleneck node(s): ${bottleneckNodes
          .slice(0, 3)
          .map((n) => n.nodeLabel)
          .join(", ")}`
      );
    }

    if (totalDuration > 10000) {
      optimizationSuggestions.push(
        "Consider breaking down long-running operations into parallel tasks"
      );
    }

    const heavyNodes = completedNodes.filter(
      (m) => m.memoryEstimate > 100 && m.duration > 5000
    );
    if (heavyNodes.length > 0) {
      optimizationSuggestions.push(
        `${heavyNodes.length} node(s) have high memory usage - consider batching or streaming`
      );
    }

    const profile: WorkflowPerformanceMetrics = {
      workflowId,
      totalDuration,
      nodeCount: nodeMetrics.length,
      completedCount: completedNodes.length,
      failedCount: failedNodes.length,
      averageNodeDuration: averageDuration,
      maxNodeDuration: maxDuration,
      bottleneckNodes,
      estimatedMemoryPeak,
      parallelizableNodes,
      optimizationSuggestions,
      timestamp: Date.now()
    };

    set({
      profiles: { ...get().profiles, [workflowId]: profile }
    });
  },

  clearProfile: (workflowId: string) => {
    const profiles = get().profiles;
    const executionNodes = get().currentExecutionNodes;
    const newProfiles = { ...profiles };
    delete newProfiles[workflowId];

    const newExecutionNodes: Record<string, NodePerformanceMetrics> = {};
    for (const key in executionNodes) {
      if (!key.startsWith(workflowId)) {
        newExecutionNodes[key] = executionNodes[key];
      }
    }

    set({ profiles: newProfiles, currentExecutionNodes: newExecutionNodes });
  },

  getNodeMetrics: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().currentExecutionNodes[key];
  }
}));

export default usePerformanceStore;
