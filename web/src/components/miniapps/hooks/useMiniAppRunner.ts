import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";

import {
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  OutputUpdate,
  PreviewUpdate,
  Workflow,
  WorkflowAttributes
} from "../../../stores/ApiTypes";
import {
  createWorkflowRunnerStore,
  MessageHandler,
  WorkflowRunnerStore
} from "../../../stores/WorkflowRunner";
import { MiniAppResult, RunnerMessage } from "../types";
import { useMiniAppsStore } from "../../../stores/MiniAppsStore";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

type WorkflowRunnerState = ReturnType<WorkflowRunnerStore["getState"]>;
type RunWorkflowFn = WorkflowRunnerState["run"];

export const useMiniAppRunner = (selectedWorkflow?: Workflow) => {
  const workflowKey = selectedWorkflow?.id ?? "mini-app-runner";
  const runnerStore = useMemo(() => {
    return createWorkflowRunnerStore(workflowKey);
  }, [workflowKey]);

  // Combine multiple store subscriptions into one for better performance
  const { run: runWorkflowFromStore, cancel: cancelWorkflowFromStore, state: runnerState, statusMessage, notifications } = useStore(
    runnerStore,
    (state) => ({
      run: state.run,
      cancel: state.cancel,
      state: state.state,
      statusMessage: state.statusMessage,
      notifications: state.notifications
    })
  );
  const workflowId = selectedWorkflow?.id;

  // Combine multiple MiniAppsStore subscriptions into one for better performance
  const {
    results,
    progress,
    upsertResult,
    setProgress: setProgressState,
    setLastRunDuration,
    lastRunDuration,
    resetWorkflowState
  } = useMiniAppsStore(
    (state) => ({
      results: workflowId ? state.apps[workflowId]?.results ?? [] : [],
      progress: workflowId ? state.apps[workflowId]?.progress ?? null : null,
      upsertResult: state.upsertResult,
      setProgress: state.setProgress,
      setLastRunDuration: state.setLastRunDuration,
      lastRunDuration: workflowId ? state.apps[workflowId]?.lastRunDuration ?? null : null,
      resetWorkflowState: state.resetWorkflowState
    })
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

      const typedData = data as RunnerMessage;
      const messageType = typedData.type;

      if (messageType === "output_update") {
        try {
          const update = typedData as unknown as OutputUpdate;

          // Keep the value as-is - no base64 conversion needed
          // The OutputRenderer will handle the value appropriately
          const value = update.value;

          // Generate unique ID for each streaming update to allow multiple items
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 9);
          const result: MiniAppResult = {
            id: `${update.node_id}:${update.output_name}:${timestamp}:${random}`,
            nodeId: update.node_id,
            nodeName: update.node_name,
            outputName: update.output_name,
            outputType: update.output_type,
            value: value,
            metadata: (update.metadata || {}) as Record<string, unknown>,
            receivedAt: timestamp
          };

          upsertResult(workflow.id, result);
        } catch (error) {
          console.error("MiniAppRunner: output_update error:", error);
        }
      }

      if (messageType === "preview_update") {
        try {
          const update = typedData as unknown as PreviewUpdate;

          // Keep the value as-is - no base64 conversion needed
          // The OutputRenderer will handle the value appropriately
          const value = update.value;

          // Generate unique ID for each streaming preview update to allow multiple items
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 9);
          const result: MiniAppResult = {
            id: `${update.node_id}:preview:${timestamp}:${random}`,
            nodeId: update.node_id,
            nodeName: "Preview",
            outputName: "preview",
            outputType: "image",
            value: value,
            metadata: {},
            receivedAt: timestamp
          };

          upsertResult(workflow.id, result);
        } catch (error) {
          console.error("MiniAppRunner: preview_update error:", error);
        }
      }

      if (messageType === "node_update") {
        const update = typedData as unknown as NodeUpdate;
        if (update.error) {
          const result: MiniAppResult = {
            id: `${update.node_id}:error`,
            nodeId: update.node_id,
            nodeName: update.node_name || update.node_id,
            outputName: "error",
            outputType: "error",
            value: update.error,
            metadata: {},
            receivedAt: Date.now()
          };
          upsertResult(workflow.id, result);
        }
      }

      if (messageType === "node_progress") {
        const nodeProgress = typedData as unknown as NodeProgress;
        if (
          typeof nodeProgress.total === "number" &&
          nodeProgress.total > 0 &&
          typeof nodeProgress.progress === "number"
        ) {
          setProgressState(workflow.id, {
            current: nodeProgress.progress,
            total: nodeProgress.total
          });
        } else {
          setProgressState(workflow.id, null);
        }
      }

      if (messageType === "job_update") {
        const jobUpdate = typedData as unknown as JobUpdate;
        if (
          jobUpdate.status === "completed" ||
          jobUpdate.status === "failed" ||
          jobUpdate.status === "cancelled" ||
          jobUpdate.status === "timed_out"
        ) {
          setProgressState(workflow.id, null);
        }
        // Store duration when job completes successfully
        if (jobUpdate.status === "completed" && jobUpdate.duration != null) {
          setLastRunDuration(workflow.id, jobUpdate.duration);
        }
      }
    };

    runnerStore.getState().setMessageHandler(handler);

    // Subscribe to workflow_id for messages that include workflow_id
    const unsubscribeWorkflow = globalWebSocketManager.subscribe(
      workflowKey,
      (message: any) => {
        const currentWorkflow =
          runnerStore.getState().workflow || selectedWorkflow;
        if (currentWorkflow) {
          handler(currentWorkflow, message);
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

      unsubscribeJob = globalWebSocketManager.subscribe(jobId, (message: any) => {
        // Avoid double-processing when the backend already provides workflow_id
        if (message?.workflow_id) {
          return;
        }

        const currentWorkflow =
          runnerStore.getState().workflow || selectedWorkflow;
        if (currentWorkflow) {
          handler(currentWorkflow, message);
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
      await runWorkflowFromStore(params, workflow, nodes, edges);
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
