/**
 * usePerformanceTracking Hook
 *
 * Integrates performance tracking with workflow execution.
 * Automatically records performance metrics when workflows run.
 */

import { useCallback } from "react";
import { Node } from "@xyflow/react";
import usePerformanceProfileStore from "../stores/PerformanceProfileStore";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { NodeStoreState } from "../stores/NodeStore";

interface UsePerformanceTrackingProps {
  workflowId: string;
  isRunning: boolean;
}

export const usePerformanceTracking = ({ workflowId, isRunning: _isRunning }: UsePerformanceTrackingProps) => {
  const { startRecording, endRecording, updateNodeTiming, isRecording, currentRunId } =
    usePerformanceProfileStore();
  const nodes = useNodes((state: NodeStoreState) => state.nodes);

  const getNodeInfo = useCallback((nodeId: string): { type: string; name: string } | null => {
    const node = nodes.find((n: Node<NodeData>) => n.id === nodeId);
    if (!node) {
      return null;
    }
    const nodeType = node.type || "unknown";
    const data = node.data as Record<string, unknown>;
    const nodeName =
      (data?.title as string) ||
      (data?.label as string) ||
      nodeType.split(".").pop() ||
      "Node";
    return { type: nodeType, name: nodeName };
  }, [nodes]);

  const startTracking = useCallback(() => {
    const nodeCount = nodes.length;
    const workflow = nodeCount > 0 ? { name: `Workflow (${nodeCount} nodes)` } : undefined;
    const runId = startRecording(workflowId, workflow?.name || "Untitled");
    return runId;
  }, [workflowId, nodes, startRecording]);

  const stopTracking = useCallback(
    (status: "completed" | "error" | "cancelled") => {
      if (currentRunId) {
        endRecording(currentRunId, status);
      }
    },
    [currentRunId, endRecording]
  );

  const recordNodeExecution = useCallback(
    (nodeId: string, duration: number, success: boolean) => {
      if (!currentRunId) {
        return;
      }

      const nodeInfo = getNodeInfo(nodeId);
      if (nodeInfo) {
        updateNodeTiming(currentRunId, nodeId, nodeInfo.type, nodeInfo.name, duration, success);
      }
    },
    [currentRunId, getNodeInfo, updateNodeTiming]
  );

  const getCurrentRunId = useCallback(() => currentRunId, [currentRunId]);

  return {
    isRecording,
    currentRunId,
    startTracking,
    stopTracking,
    recordNodeExecution,
    getCurrentRunId
  };
};

export default usePerformanceTracking;
