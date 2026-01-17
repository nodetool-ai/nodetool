/**
 * useWorkflowProfiling Hook
 *
 * Integrates workflow profiling with the workflow execution lifecycle.
 * Automatically starts and stops profiling based on workflow state changes.
 */

import { useEffect, useCallback } from "react";
import { useWorkflowProfilerStore } from "../stores/WorkflowProfilerStore";
import { useWebsocketRunner } from "../stores/WorkflowRunner";

export const useWorkflowProfiling = () => {
  const { startProfiling, finishProfiling, cancelProfiling, clearCurrentProfile } = useWorkflowProfilerStore();
  const runnerState = useWebsocketRunner(s => s.state);
  const workflow = useWebsocketRunner(s => s.workflow);

  useEffect(() => {
    if (runnerState === "running" && !useWorkflowProfilerStore.getState().currentProfile) {
      const workflowName = workflow?.name || "Unknown Workflow";
      const workflowId = workflow?.id || "unknown";
      startProfiling(workflowId, workflowName, []);
    } else if (runnerState === "idle" && useWorkflowProfilerStore.getState().currentProfile) {
      finishProfiling();
    } else if ((runnerState === "cancelled" || runnerState === "error") && useWorkflowProfilerStore.getState().currentProfile) {
      cancelProfiling();
    }
  }, [runnerState, workflow, startProfiling, finishProfiling, cancelProfiling]);

  const refreshProfile = useCallback(() => {
    clearCurrentProfile();
    const workflowName = workflow?.name || "Unknown Workflow";
    const workflowId = workflow?.id || "unknown";
    startProfiling(workflowId, workflowName, []);
  }, [workflow, startProfiling, clearCurrentProfile]);

  return {
    refreshProfile
  };
};

export default useWorkflowProfiling;
