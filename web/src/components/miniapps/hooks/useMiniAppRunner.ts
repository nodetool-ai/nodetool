import { useCallback, useEffect, useMemo } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { useShallow } from "zustand/react/shallow";

import {
  Workflow,
  WorkflowAttributes
} from "../../../stores/ApiTypes";
import {
  createWorkflowRunnerStore,
  MessageHandler,
  MsgpackData,
  WorkflowRunnerStore
} from "../../../stores/WorkflowRunner";
import { MiniAppResult } from "../types";
import { useMiniAppsStore } from "../../../stores/MiniAppsStore";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

// Stable empty fallbacks — reused across renders so shallow equality can bail
// out instead of always seeing a new array/null reference.
const EMPTY_RESULTS: MiniAppResult[] = [];

type WorkflowRunnerState = ReturnType<WorkflowRunnerStore["getState"]>;
type RunWorkflowFn = WorkflowRunnerState["run"];

export const useMiniAppRunner = (selectedWorkflow?: Workflow) => {
  const workflowKey = selectedWorkflow?.id ?? "mini-app-runner";
  const runnerStore = useMemo(() => {
    return createWorkflowRunnerStore(workflowKey);
  }, [workflowKey]);

  // Combine multiple store subscriptions into one for better performance
  const { run: runWorkflowFromStore, cancel: cancelWorkflowFromStore, state: runnerState, statusMessage, notifications } = useStoreWithEqualityFn(
    runnerStore,
    (state) => ({
      run: state.run,
      cancel: state.cancel,
      state: state.state,
      statusMessage: state.statusMessage,
      notifications: state.notifications
    }),
    shallow
  );
  const workflowId = selectedWorkflow?.id;

  // Combine multiple MiniAppsStore subscriptions into one for better performance.
  // shallow equality prevents re-renders when unrelated workflows update the store.
  const {
    results,
    progress,
    upsertResult,
    setProgress: setProgressState,
    setLastRunDuration,
    lastRunDuration,
    resetWorkflowState
  } = useMiniAppsStore(
    useShallow((state) => ({
      results: workflowId ? state.apps[workflowId]?.results ?? EMPTY_RESULTS : EMPTY_RESULTS,
      progress: workflowId ? state.apps[workflowId]?.progress ?? null : null,
      upsertResult: state.upsertResult,
      setProgress: state.setProgress,
      setLastRunDuration: state.setLastRunDuration,
      lastRunDuration: workflowId ? state.apps[workflowId]?.lastRunDuration ?? null : null,
      resetWorkflowState: state.resetWorkflowState
    }))
  );

  useEffect(() => {
    const store = runnerStore.getState();
    const originalHandler = store.messageHandler;

    const handler: MessageHandler = (workflow: WorkflowAttributes, data) => {
      try {
        originalHandler(workflow, data);
      } catch (error) {
        console.error("MiniAppRunner: originalHandler error:", error);
      }

      if (!selectedWorkflow || workflow.id !== selectedWorkflow.id) {
        return;
      }

      if (data.type === "output_update") {
        try {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 9);
          const result: MiniAppResult = {
            id: `${data.node_id}:${data.output_name}:${timestamp}:${random}`,
            nodeId: data.node_id,
            nodeName: data.node_name,
            outputName: data.output_name,
            outputType: data.output_type,
            value: data.value,
            metadata: (data.metadata || {}) as Record<string, unknown>,
            receivedAt: timestamp
          };

          upsertResult(workflow.id, result);
        } catch (error) {
          console.error("MiniAppRunner: output_update error:", error);
        }
      }

      if (data.type === "node_update") {
        if (data.error) {
          const result: MiniAppResult = {
            id: `${data.node_id}:error`,
            nodeId: data.node_id,
            nodeName: data.node_name || data.node_id,
            outputName: "error",
            outputType: "error",
            value: data.error,
            metadata: {},
            receivedAt: Date.now()
          };
          upsertResult(workflow.id, result);
        }
      }

      if (data.type === "node_progress") {
        if (
          typeof data.total === "number" &&
          data.total > 0 &&
          typeof data.progress === "number"
        ) {
          setProgressState(workflow.id, {
            current: data.progress,
            total: data.total
          });
        } else {
          setProgressState(workflow.id, null);
        }
      }

      if (data.type === "job_update") {
        if (
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "cancelled" ||
          data.status === "timed_out"
        ) {
          setProgressState(workflow.id, null);
        }
        if (data.status === "completed" && data.duration != null) {
          setLastRunDuration(workflow.id, data.duration);
        }
      }
    };

    runnerStore.getState().setMessageHandler(handler);

    // Subscribe to workflow_id for messages that include workflow_id
    const unsubscribeWorkflow = globalWebSocketManager.subscribe(
      workflowKey,
      (message) => {
        const currentWorkflow =
          runnerStore.getState().workflow || selectedWorkflow;
        if (currentWorkflow) {
          handler(currentWorkflow, message as MsgpackData);
        }
      }
    );

    // Track job_id subscription for messages that only include job_id
    // (e.g., terminal job completion updates may not include workflow_id)
    let unsubscribeJob: (() => void) | null = null;

    const updateJobSubscription = (jobId: string | null) => {
      if (unsubscribeJob) {
        unsubscribeJob();
        unsubscribeJob = null;
      }

      if (!jobId) {
        return;
      }

      unsubscribeJob = globalWebSocketManager.subscribe(jobId, (message) => {
        // Avoid double-processing when the backend already provides workflow_id
        if (message?.workflow_id) {
          return;
        }

        const currentWorkflow =
          runnerStore.getState().workflow || selectedWorkflow;
        if (currentWorkflow) {
          handler(currentWorkflow, message as MsgpackData);
        }
      });
    };

    // Subscribe to current job_id if already set
    updateJobSubscription(runnerStore.getState().job_id);

    // Track job_id changes to update subscription
    const unsubscribeRunnerStore = runnerStore.subscribe((state, prevState) => {
      if (state.job_id !== prevState.job_id) {
        updateJobSubscription(state.job_id);
      }
    });

    return () => {
      unsubscribeWorkflow();
      unsubscribeRunnerStore();
      if (unsubscribeJob) {
        unsubscribeJob();
      }
      runnerStore.getState().setMessageHandler(originalHandler);
    };
  }, [
    runnerStore,
    selectedWorkflow,
    setProgressState,
    setLastRunDuration,
    upsertResult,
    workflowKey
  ]);

  const runWorkflow = useCallback<RunWorkflowFn>(
    async (params, workflow, nodes, edges) => {
      if (workflow) {
        resetWorkflowState(workflow.id);
      }
      return runWorkflowFromStore(params, workflow, nodes, edges);
    },
    [runWorkflowFromStore, resetWorkflowState]
  );

  const cancelWorkflow = useCallback(async () => {
    await cancelWorkflowFromStore();
  }, [cancelWorkflowFromStore]);

  return {
    runWorkflow,
    cancelWorkflow,
    runnerState,
    statusMessage,
    notifications,
    results,
    progress,
    lastRunDuration,
    resetWorkflowState
  } as const;
};
