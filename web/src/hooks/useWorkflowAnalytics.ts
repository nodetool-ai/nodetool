import { useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import useStatusStore from "../stores/StatusStore";

export interface WorkflowAnalytics {
  nodeCount: number;
  edgeCount: number;
  executedNodes: number;
  totalDuration: number | undefined;
  averageNodeDuration: number | undefined;
  slowestNode: { id: string; label: string; duration: number } | undefined;
  fastestNode: { id: string; label: string; duration: number } | undefined;
  nodesByDuration: Array<{ id: string; label: string; duration: number }>;
  completionPercentage: number;
  hasErrors: boolean;
}

export interface UseWorkflowAnalyticsOptions {
  workflowId: string;
}

export const useWorkflowAnalytics = (
  options: UseWorkflowAnalyticsOptions
): WorkflowAnalytics => {
  const { workflowId } = options;

  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const getDuration = useExecutionTimeStore((state) => state.getDuration);
  const getStatus = useStatusStore((state) => state.getStatus);

  return useMemo(() => {
    const nodeDurations: Array<{ id: string; label: string; duration: number }> =
      [];
    let totalDuration = 0;
    let executedNodes = 0;
    let hasErrors = false;
    let maxDuration = 0;
    let minDuration = Infinity;
    let slowestNode: { id: string; label: string; duration: number } | undefined;
    let fastestNode: { id: string; label: string; duration: number } | undefined;

    for (const node of nodes) {
      const duration = getDuration(workflowId, node.id);
      const status = getStatus(workflowId, node.id);

      const nodeLabel =
        (node.data as { label?: string }).label || node.type || node.id;

      if (duration !== undefined && duration > 0) {
        nodeDurations.push({
          id: node.id,
          label: nodeLabel,
          duration,
        });
        totalDuration += duration;
        executedNodes++;

        if (duration > maxDuration) {
          maxDuration = duration;
          slowestNode = { id: node.id, label: nodeLabel, duration };
        }
        if (duration < minDuration) {
          minDuration = duration;
          fastestNode = { id: node.id, label: nodeLabel, duration };
        }
      }

      if (status === "error") {
        hasErrors = true;
      }
    }

    const sortedNodes = [...nodeDurations].sort((a, b) => b.duration - a.duration);

    const averageNodeDuration =
      executedNodes > 0 ? Math.round(totalDuration / executedNodes) : undefined;

    const completionPercentage =
      nodes.length > 0 ? Math.round((executedNodes / nodes.length) * 100) : 0;

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      executedNodes,
      totalDuration: totalDuration > 0 ? totalDuration : undefined,
      averageNodeDuration,
      slowestNode,
      fastestNode,
      nodesByDuration: sortedNodes,
      completionPercentage,
      hasErrors,
    };
  }, [
    workflowId,
    nodes,
    edges,
    getDuration,
    getStatus,
  ]);
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  if (seconds < 60) {
    return milliseconds > 0
      ? `${seconds}s ${milliseconds}ms`
      : `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${hours}h`;
}
