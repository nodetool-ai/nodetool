import { useCallback } from "react";
import usePerformanceProfileStore, {
  WorkflowProfile,
  PerformanceInsights
} from "../stores/PerformanceProfileStore";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

interface UsePerformanceProfilerReturn {
  startProfiling: () => void;
  stopProfiling: () => void;
  recordNodeExecution: (nodeId: string, nodeType: string, nodeName: string, status: string) => void;
  getProfile: () => WorkflowProfile | undefined;
  getInsights: () => PerformanceInsights;
  clearProfile: () => void;
}

export const usePerformanceProfiler = (): UsePerformanceProfilerReturn => {
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const currentWorkflow = openWorkflows[0];
  const workflowId = currentWorkflow?.id || "";
  const workflowName = currentWorkflow?.name || "Untitled";

  const startProfile = usePerformanceProfileStore((state) => state.startProfile);
  const endProfile = usePerformanceProfileStore((state) => state.endProfile);
  const updateNodeProfile = usePerformanceProfileStore((state) => state.updateNodeProfile);
  const getProfileStore = usePerformanceProfileStore((state) => state.getProfile);
  const getInsightsStore = usePerformanceProfileStore((state) => state.getInsights);
  const clearProfileStore = usePerformanceProfileStore((state) => state.clearProfile);

  const getDuration = useExecutionTimeStore((state) => state.getDuration);

  const startProfiling = useCallback(() => {
    if (workflowId) {
      startProfile(workflowId, workflowName);
    }
  }, [workflowId, workflowName, startProfile]);

  const stopProfiling = useCallback(() => {
    if (workflowId) {
      endProfile(workflowId);
    }
  }, [workflowId, endProfile]);

  const recordNodeExecution = useCallback(
    (nodeId: string, nodeType: string, nodeName: string, status: string) => {
      if (!workflowId) {return;}

      const duration = getDuration(workflowId, nodeId);
      if (duration !== undefined) {
        updateNodeProfile(workflowId, nodeId, nodeType, nodeName, duration, status);
      }
    },
    [workflowId, getDuration, updateNodeProfile]
  );

  const getProfile = useCallback(() => {
    if (!workflowId) {return undefined;}
    return getProfileStore(workflowId);
  }, [workflowId, getProfileStore]);

  const getInsights = useCallback(() => {
    if (!workflowId) {
      return {
        totalDuration: 0,
        averageNodeDuration: 0,
        slowestNode: null,
        fastestNode: null,
        parallelizableNodes: [],
        recommendations: ["Run a workflow to see performance insights."]
      };
    }
    return getInsightsStore(workflowId);
  }, [workflowId, getInsightsStore]);

  const clearProfile = useCallback(() => {
    if (workflowId) {
      clearProfileStore(workflowId);
    }
  }, [workflowId, clearProfileStore]);

  return {
    startProfiling,
    stopProfiling,
    recordNodeExecution,
    getProfile,
    getInsights,
    clearProfile
  };
};

export default usePerformanceProfiler;
