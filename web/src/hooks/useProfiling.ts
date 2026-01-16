import useProfilingStore, { NodeProfile, WorkflowProfile } from "../stores/ProfilingStore";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import { useCallback } from "react";

export interface ProfilingHookReturn {
  isProfiling: boolean;
  currentWorkflowId: string | null;
  startProfiling: (workflowId: string) => void;
  endProfiling: (workflowId: string) => void;
  recordNodeExecution: (
    workflowId: string,
    nodeId: string,
    nodeType: string,
    title: string,
    status: string
  ) => void;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  clearProfile: (workflowId: string) => void;
  getNodeDuration: (workflowId: string, nodeId: string) => number | undefined;
  getSlowestNodes: (workflowId: string, limit?: number) => NodeProfile[];
  getStatistics: (workflowId: string) => {
    totalDuration: number;
    nodeCount: number;
    averageDuration: number;
    slowestNode: NodeProfile | null;
    fastestNode: NodeProfile | null;
  } | null;
}

export const useProfiling = (): ProfilingHookReturn => {
  const {
    isProfiling,
    currentWorkflowId,
    startProfiling,
    endProfiling,
    addNodeProfile,
    getProfile,
    clearProfile,
    getNodeDuration,
    getSlowestNodes,
    getStatistics,
  } = useProfilingStore();

  const { getDuration } = useExecutionTimeStore();

  const recordNodeExecution = useCallback(
    (workflowId: string, nodeId: string, nodeType: string, title: string, status: string) => {
      const duration = getDuration(workflowId, nodeId);
      if (duration !== undefined) {
        addNodeProfile(workflowId, {
          nodeId,
          nodeType,
          title,
          duration,
          startTime: Date.now() - duration,
          endTime: Date.now(),
          status,
        });
      }
    },
    [addNodeProfile, getDuration]
  );

  return {
    isProfiling,
    currentWorkflowId,
    startProfiling,
    endProfiling,
    recordNodeExecution,
    getProfile,
    clearProfile,
    getNodeDuration,
    getSlowestNodes,
    getStatistics,
  };
};

export default useProfiling;
