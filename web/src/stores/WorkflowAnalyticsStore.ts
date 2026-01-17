import { create } from "zustand";
import useExecutionTimeStore from "./ExecutionTimeStore";
import useStatusStore from "./StatusStore";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeAnalytics {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number | undefined;
  status: string | undefined;
  isBottleneck: boolean;
  percentage: number;
}

export interface WorkflowAnalytics {
  workflowId: string;
  totalNodes: number;
  executedNodes: number;
  totalDuration: number | undefined;
  averageDuration: number | undefined;
  slowestNode: NodeAnalytics | undefined;
  fastestNode: NodeAnalytics | undefined;
  bottlenecks: NodeAnalytics[];
  nodes: NodeAnalytics[];
}

interface WorkflowAnalyticsStore {
  getAnalytics: (workflowId: string, nodes: Node<NodeData>[]) => WorkflowAnalytics;
}

const BOTTLENECK_THRESHOLD_PERCENT = 50;

export const useWorkflowAnalyticsStore = create<WorkflowAnalyticsStore>(() => ({
  getAnalytics: (workflowId: string, nodes: Node<NodeData>[]) => {
    const timings = useExecutionTimeStore.getState().timings;
    const statuses = useStatusStore.getState().statuses;

    const nodeAnalyticsList: NodeAnalytics[] = nodes.map((node) => {
      const duration = useExecutionTimeStore.getState().getDuration(workflowId, node.id);
      const key = `${workflowId}:${node.id}`;
      const status = statuses[key];
      return {
        nodeId: node.id,
        nodeType: node.type || "unknown",
        nodeLabel: node.id,
        duration,
        status,
        isBottleneck: false,
        percentage: 0
      };
    });

    const completedNodes = nodeAnalyticsList.filter((n) => n.duration !== undefined);
    const totalDuration = completedNodes.reduce((sum, n) => sum + (n.duration || 0), 0);
    const averageDuration = completedNodes.length > 0 ? totalDuration / completedNodes.length : undefined;

    const sortedByDuration = [...completedNodes].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const slowestNode = sortedByDuration[0];
    const fastestNode = sortedByDuration[sortedByDuration.length - 1];

    const bottlenecks: NodeAnalytics[] = [];
    if (averageDuration !== undefined && averageDuration > 0) {
      nodeAnalyticsList.forEach((node) => {
        if (node.duration !== undefined && node.duration > 0) {
          const percentage = (node.duration / totalDuration) * 100;
          node.percentage = percentage;
          if (percentage >= BOTTLENECK_THRESHOLD_PERCENT) {
            node.isBottleneck = true;
            bottlenecks.push(node);
          }
        }
      });
    }

    bottlenecks.sort((a, b) => b.duration! - a.duration!);

    return {
      workflowId,
      totalNodes: nodes.length,
      executedNodes: completedNodes.length,
      totalDuration,
      averageDuration,
      slowestNode,
      fastestNode,
      bottlenecks,
      nodes: nodeAnalyticsList
    };
  }
}));
