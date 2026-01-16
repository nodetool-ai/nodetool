import { create } from "zustand";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useExecutionTimeStore from "./ExecutionTimeStore";
import { topologicalSort } from "../core/graph";

export interface NodePerformanceMetrics {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration?: number;
  percentageOfTotal: number;
  isBottleneck: boolean;
}

export interface WorkflowPerformanceReport {
  workflowId: string;
  totalNodes: number;
  executedNodes: number;
  totalDuration: number;
  estimatedParallelTime: number;
  efficiency: number;
  nodeMetrics: NodePerformanceMetrics[];
  bottlenecks: NodePerformanceMetrics[];
  suggestions: string[];
  graphDepth: number;
  parallelizablePaths: number;
}

export interface WorkflowProfilerState {
  reports: Record<string, WorkflowPerformanceReport>;
  setReport: (workflowId: string, report: WorkflowPerformanceReport) => void;
  getReport: (workflowId: string) => WorkflowPerformanceReport | undefined;
  clearReport: (workflowId: string) => void;
}

const useWorkflowProfilerStore = create<WorkflowProfilerState>((set, get) => ({
  reports: {},

  setReport: (workflowId: string, report: WorkflowPerformanceReport) => {
    set({
      reports: {
        ...get().reports,
        [workflowId]: report
      }
    });
  },

  getReport: (workflowId: string) => {
    return get().reports[workflowId];
  },

  clearReport: (workflowId: string) => {
    const reports = { ...get().reports };
    delete reports[workflowId];
    set({ reports });
  }
}));

export const analyzeWorkflowPerformance = (
  workflowId: string,
  nodes: Node<NodeData>[],
  edges: Edge[]
): WorkflowPerformanceReport => {
  const getDuration = useExecutionTimeStore.getState().getDuration;
  const nodeTimings: NodePerformanceMetrics[] = [];
  let totalDuration = 0;
  let executedNodes = 0;

  for (const node of nodes) {
    if (node.type === "nodetool.workflows.base_node.Comment") {
      continue;
    }

    const duration = getDuration(workflowId, node.id);
    if (duration !== undefined) {
      totalDuration += duration;
      executedNodes++;
    }

    const label =
      (node.data as NodeData)?.title ||
      node.id ||
      node.type?.split(".").pop() ||
      "Unknown";

    nodeTimings.push({
      nodeId: node.id,
      nodeType: node.type || "unknown",
      nodeLabel: label,
      duration,
      percentageOfTotal: 0,
      isBottleneck: false
    });
  }

  if (totalDuration > 0) {
    for (const metric of nodeTimings) {
      if (metric.duration !== undefined) {
        metric.percentageOfTotal = (metric.duration / totalDuration) * 100;
      }
    }
  }

  const sortedByDuration = [...nodeTimings].sort(
    (a, b) => (b.duration || 0) - (a.duration || 0)
  );

  const bottleneckThreshold = totalDuration * 0.1;
  const bottlenecks: NodePerformanceMetrics[] = [];
  for (const metric of sortedByDuration) {
    if ((metric.duration || 0) >= bottleneckThreshold && metric.duration) {
      metric.isBottleneck = true;
      bottlenecks.push(metric);
    }
  }

  const layers = topologicalSort(edges, nodes);
  const graphDepth = layers.length;

  let parallelizablePaths = 0;
  for (let i = 0; i < layers.length - 1; i++) {
    if (layers[i].length > 1) {
      parallelizablePaths += layers[i].length - 1;
    }
  }

  const estimatedParallelTime = totalDuration > 0
    ? Math.max(
        ...sortedByDuration.slice(0, Math.ceil(nodes.length / 2)).map(
          (m) => m.duration || 0
        )
      )
    : 0;

  const efficiency =
    totalDuration > 0 && estimatedParallelTime > 0
      ? (estimatedParallelTime / totalDuration) * 100
      : 100;

  const suggestions: string[] = [];

  if (bottlenecks.length > 0) {
    suggestions.push(
      `Found ${bottlenecks.length} bottleneck node(s) taking >10% of total time`
    );
  }

  if (efficiency < 50) {
    suggestions.push(
      "Low parallelization efficiency. Consider restructuring nodes for better parallel execution."
    );
  }

  if (graphDepth > 10 && parallelizablePaths < graphDepth / 2) {
    suggestions.push(
      "Deep sequential chain detected. Consider breaking into parallel branches where possible."
    );
  }

  if (executedNodes < nodes.length) {
    suggestions.push(
      `${nodes.length - executedNodes} node(s) have no execution data. Run the workflow to get complete analysis.`
    );
  }

  for (const bottleneck of bottlenecks.slice(0, 3)) {
    if (bottleneck.nodeType.includes("Model") || bottleneck.nodeType.includes("LLM")) {
      suggestions.push(
        `Consider using a faster model for "${bottleneck.nodeLabel}" to improve overall performance.`
      );
    }
    if (bottleneck.nodeType.includes("Image") || bottleneck.nodeType.includes("Audio")) {
      suggestions.push(
        `Consider reducing input size for "${bottleneck.nodeLabel}" to speed up processing.`
      );
    }
  }

  return {
    workflowId,
    totalNodes: nodes.length,
    executedNodes,
    totalDuration,
    estimatedParallelTime,
    efficiency,
    nodeMetrics: sortedByDuration,
    bottlenecks,
    suggestions,
    graphDepth,
    parallelizablePaths
  };
};

export const generateAndStoreReport = (
  workflowId: string,
  nodes: Node<NodeData>[],
  edges: Edge[]
) => {
  const report = analyzeWorkflowPerformance(workflowId, nodes, edges);
  useWorkflowProfilerStore.getState().setReport(workflowId, report);
  return report;
};

export default useWorkflowProfilerStore;
