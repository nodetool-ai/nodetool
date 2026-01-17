import { useMemo } from "react";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import useStatusStore from "../stores/StatusStore";
import { useWorkflowManagerStore } from "../stores/WorkflowManagerStore";

export interface NodeExecutionProfile {
  nodeId: string;
  nodeName: string;
  duration: number | undefined;
  status: string | undefined;
  isBottleneck: boolean;
}

export interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  runningNodes: number;
  pendingNodes: number;
  totalDuration: number;
  nodeProfiles: NodeExecutionProfile[];
  bottlenecks: NodeExecutionProfile[];
  averageDuration: number;
  parallelizableNodes: string[];
}

export const useWorkflowProfiler = (workflowId: string): WorkflowProfile | null => {
  const workflow = useWorkflowManagerStore((state) =>
    state.nodeStores[workflowId]?.getState()?.workflow
  );
  const statuses = useStatusStore((state) => state.statuses);

  return useMemo(() => {
    if (!workflow) {
      return null;
    }

    const nodes = workflow.graph?.nodes || [];
    const nodeProfiles: NodeExecutionProfile[] = nodes.map((node) => {
      const nodeId = node.id;
      const nodeName = node.name || nodeId;
      const duration = useExecutionTimeStore.getState().getDuration(workflowId, nodeId);
      const status = statuses[workflowId]?.[nodeId];

      return {
        nodeId,
        nodeName,
        duration,
        status,
        isBottleneck: false,
      };
    });

    const totalDuration = nodeProfiles.reduce((sum, p) => sum + (p.duration || 0), 0);
    const completedProfiles = nodeProfiles.filter((p) => p.status === "completed");
    const averageDuration = completedProfiles.length > 0
      ? totalDuration / completedProfiles.length
      : 0;

    const sortedByDuration = [...nodeProfiles].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const threshold = averageDuration * 2;
    const bottlenecks = sortedByDuration.filter((p) =>
      p.duration !== undefined && p.duration > threshold && p.status === "completed"
    );
    bottlenecks.forEach((b) => {
      b.isBottleneck = true;
    });

    const runningNodes = nodeProfiles.filter(
      (p) => p.status === "running" || p.status === "starting" || p.status === "booting"
    );
    const pendingNodes = nodeProfiles.filter(
      (p) => !p.status || p.status === "pending" || p.status === "queued"
    );
    const failedNodes = nodeProfiles.filter(
      (p) => p.status === "error"
    );
    const completedNodes = nodeProfiles.filter(
      (p) => p.status === "completed"
    );

    const hasMultipleLongRunning = runningNodes.length > 1;
    const parallelizableNodes: string[] = [];
    if (hasMultipleLongRunning) {
      parallelizableNodes.push(...runningNodes.map((n) => n.nodeId));
    }

    return {
      workflowId,
      workflowName: workflow.name || "Untitled Workflow",
      totalNodes: nodes.length,
      completedNodes: completedNodes.length,
      failedNodes: failedNodes.length,
      runningNodes: runningNodes.length,
      pendingNodes: pendingNodes.length,
      totalDuration,
      nodeProfiles,
      bottlenecks: bottlenecks.slice(0, 5),
      averageDuration,
      parallelizableNodes,
    };
  }, [workflow, workflowId, statuses]);
};

export const useLastExecutionProfile = (): WorkflowProfile | null => {
  const activeWorkflowId = useWorkflowManagerStore((state) => state.currentWorkflowId);
  if (!activeWorkflowId) {
    return null;
  }
  return useWorkflowProfiler(activeWorkflowId);
};
