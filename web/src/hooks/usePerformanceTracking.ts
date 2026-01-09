import { useEffect, useCallback, useRef } from "react";
import usePerformanceStore from "../stores/PerformanceStore";
import { getWorkflowRunnerStore } from "../stores/WorkflowRunner";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { shallow } from "zustand/shallow";
import type { WorkflowRunnerStore } from "../stores/WorkflowRunner";

const isNodeStatusRunning = (status: string): boolean => {
  return (
    status === "running" ||
    status === "booting" ||
    status === "processing" ||
    status === "executing"
  );
};

const isNodeStatusCompleted = (status: string): boolean => {
  return status === "completed" || status === "success" || status === "done";
};

const isNodeStatusError = (status: string): boolean => {
  return status === "error" || status === "failed" || status === "failure";
};

export const usePerformanceTracking = (): void => {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const workflowId = currentWorkflowId;

  const runnerStoreRef = useRef<WorkflowRunnerStore | null>(null);

  const {
    startRecording,
    stopRecording,
    recordNodeStart,
    recordNodeEnd,
    clearWorkflowPerformance,
  } = usePerformanceStore();

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    const store = getWorkflowRunnerStore(workflowId);
    runnerStoreRef.current = store;

    const unsubscribe = store.subscribe((state) => {
      if (state.state === "running" && !usePerformanceStore.getState().isRecording) {
        startRecording(
          workflowId,
          "Workflow",
          [],
          {},
          {}
        );
      }

      if (
        state.state === "idle" &&
        usePerformanceStore.getState().isRecording
      ) {
        stopRecording();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [workflowId, startRecording, stopRecording]);

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    const handleMessage = (data: any) => {
      if (!workflowId) {
        return;
      }

      if (data.type === "node_update") {
        const { node_id, status, error } = data;

        if (isNodeStatusRunning(status)) {
          recordNodeStart(workflowId, node_id);
        } else if (isNodeStatusCompleted(status) || isNodeStatusError(status)) {
          recordNodeEnd(workflowId, node_id, !isNodeStatusError(status), error);
        }
      }

      if (data.type === "job_update") {
        const { status } = data;

        if (
          status === "completed" ||
          status === "cancelled" ||
          status === "failed"
        ) {
          if (usePerformanceStore.getState().isRecording) {
            stopRecording();
          }
        }
      }
    };

    const unsubscribe = globalWebSocketManager.subscribe(workflowId, handleMessage);

    return () => {
      unsubscribe();
    };
  }, [workflowId, recordNodeStart, recordNodeEnd, stopRecording]);

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    return () => {
      clearWorkflowPerformance(workflowId);
    };
  }, [workflowId, clearWorkflowPerformance]);
};

export default usePerformanceTracking;
