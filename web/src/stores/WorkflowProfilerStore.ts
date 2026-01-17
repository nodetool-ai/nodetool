import { create } from "zustand";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeMetrics {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  duration: number;
  status: string;
  layer: number;
  position: { x: number; y: number };
}

export interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  totalDuration: number;
  nodeCount: number;
  maxLayer: number;
  metrics: NodeMetrics[];
  bottlenecks: NodeMetrics[];
  suggestions: string[];
  timestamp: number;
}

interface WorkflowProfilerStore {
  isOpen: boolean;
  profile: WorkflowProfile | null;
  openProfiler: () => void;
  closeProfiler: () => void;
  setProfile: (profile: WorkflowProfile | null) => void;
  clearProfile: () => void;
}

const calculateWorkflowProfile = (
  workflowId: string,
  workflowName: string,
  nodes: Node<NodeData>[],
  edges: Edge[],
  executionTimings: Record<string, { startTime: number; endTime?: number }>
): WorkflowProfile => {
  const nodeMetrics: NodeMetrics[] = nodes.map((node) => {
    const timingKey = `${workflowId}:${node.id}`;
    const timing = executionTimings[timingKey];
    const duration = timing?.endTime
      ? timing.endTime - timing.startTime
      : 0;

    return {
      nodeId: node.id,
      nodeName: (node.type || "unknown").split(".").pop() || node.id,
      nodeType: node.type || "unknown",
      duration,
      status: timing?.endTime ? "completed" : "pending",
      layer: 0,
      position: node.position,
    };
  });

  const totalDuration = Math.max(...nodeMetrics.map((m) => m.duration), 0);
  const bottlenecks = nodeMetrics
    .filter((m) => m.duration > 0)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  const suggestions: string[] = [];
  if (totalDuration > 10000) {
    suggestions.push("Consider breaking this workflow into smaller parts");
  }
  const slowNodes = bottlenecks.filter((b) => b.duration > 3000);
  if (slowNodes.length > 0) {
    suggestions.push(
      `Found ${slowNodes.length} slow node(s): ${slowNodes.map((n) => n.nodeName).join(", ")}`
    );
  }

  const parallelizable = nodeMetrics.filter((m) => m.duration < 100);
  if (parallelizable.length > 5) {
    suggestions.push(
      "Several quick nodes detected - consider running them in parallel"
    );
  }

  return {
    workflowId,
    workflowName,
    totalDuration,
    nodeCount: nodes.length,
    maxLayer: 1,
    metrics: nodeMetrics,
    bottlenecks,
    suggestions,
    timestamp: Date.now(),
  };
};

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set) => ({
  isOpen: false,
  profile: null,

  openProfiler: () => set({ isOpen: true }),
  closeProfiler: () => set({ isOpen: false }),
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
}));

export const analyzeWorkflowPerformance = (
  workflowId: string,
  workflowName: string,
  nodes: Node<NodeData>[],
  edges: Edge[],
  executionTimings: Record<string, { startTime: number; endTime?: number }>
): WorkflowProfile => {
  const profile = calculateWorkflowProfile(
    workflowId,
    workflowName,
    nodes,
    edges,
    executionTimings
  );
  useWorkflowProfilerStore.getState().setProfile(profile);
  return profile;
};

export default useWorkflowProfilerStore;
