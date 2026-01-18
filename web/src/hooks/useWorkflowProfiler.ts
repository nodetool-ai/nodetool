import { useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import useProfilingStore from "../stores/ProfilingStore";
import { WorkflowProfile } from "../stores/ProfilingStore";

interface UseWorkflowProfilerOptions {
  workflowId: string;
  workflowName: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  isRunning: boolean;
  onProfileComplete?: (profile: WorkflowProfile) => void;
}

export const useWorkflowProfiler = ({
  workflowId,
  workflowName,
  nodes,
  edges,
  isRunning,
  onProfileComplete
}: UseWorkflowProfilerOptions) => {
  const { startProfiling, recordNodeStart, recordNodeEnd, finishProfiling, getProfile } = useProfilingStore();

  const startProfilingSession = useCallback(() => {
    startProfiling(workflowId, workflowName, nodes, edges);
  }, [workflowId, workflowName, nodes, edges, startProfiling]);

  const recordExecutionStart = useCallback((nodeId: string, nodeName: string, nodeType: string) => {
    recordNodeStart(workflowId, nodeId, nodeName, nodeType);
  }, [workflowId, recordNodeStart]);

  const recordExecutionEnd = useCallback((nodeId: string, status: "completed" | "error" | "cancelled") => {
    recordNodeEnd(workflowId, nodeId, status);
  }, [workflowId, recordNodeEnd]);

  const completeProfiling = useCallback((jobId: string) => {
    finishProfiling(workflowId, jobId);
    const profile = getProfile(workflowId);
    if (profile && onProfileComplete) {
      onProfileComplete(profile);
    }
  }, [workflowId, finishProfiling, getProfile, onProfileComplete]);

  const getCurrentProfile = useCallback(() => {
    return getProfile(workflowId);
  }, [workflowId, getProfile]);

  return {
    isProfiling: isRunning,
    startProfilingSession,
    recordExecutionStart,
    recordExecutionEnd,
    completeProfiling,
    getCurrentProfile
  };
};

export default useWorkflowProfiler;
