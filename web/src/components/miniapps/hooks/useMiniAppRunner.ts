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

type WorkflowRunnerState = ReturnType<WorkflowRunnerStore["getState"]>;
type RunWorkflowFn = WorkflowRunnerState["run"];

export const useMiniAppRunner = (selectedWorkflow?: Workflow) => {
  const workflowKey = selectedWorkflow?.id ?? "mini-app-runner";
  const runnerStore = useMemo(() => {
    return createWorkflowRunnerStore(workflowKey);
  }, [workflowKey]);

  const runWorkflowFromStore = useStore(runnerStore, (state) => state.run);
  const runnerState = useStore(runnerStore, (state) => state.state);
  const statusMessage = useStore(runnerStore, (state) => state.statusMessage);
  const notifications = useStore(runnerStore, (state) => state.notifications);
  const workflowId = selectedWorkflow?.id;
  const results = useMiniAppsStore((state) =>
    workflowId ? state.apps[workflowId]?.results ?? [] : []
  );
  const progress = useMiniAppsStore((state) =>
    workflowId ? state.apps[workflowId]?.progress ?? null : null
  );
  const upsertResult = useMiniAppsStore((state) => state.upsertResult);
  const setProgressState = useMiniAppsStore((state) => state.setProgress);
  const resetWorkflowState = useMiniAppsStore(
    (state) => state.resetWorkflowState
  );

  useEffect(() => {
    const store = runnerStore.getState();
    const originalHandler = store.messageHandler;

    const handler: MessageHandler = (workflow: WorkflowAttributes, data) => {
      originalHandler(workflow, data);

      if (!selectedWorkflow || workflow.id !== selectedWorkflow.id) {
        return;
      }

      const typedData = data as RunnerMessage;
      const messageType = typedData.type;

      if (messageType === "output_update") {
        const update = typedData as unknown as OutputUpdate;
        const assetTypes = ["image", "audio", "video", "document"];
        
        let value: unknown = update.value;
        
        // Handle asset types with binary data conversion
        if (assetTypes.includes(update.output_type)) {
          if (typeof update.value === "string") {
            // Convert base64 string to Uint8Array
            const binary = atob(update.value);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            value = bytes;
          } else if (
            update.value &&
            typeof update.value === "object" &&
            "data" in (update.value as any)
          ) {
            // Extract Uint8Array from object with data property
            value = (update.value as { data: Uint8Array }).data;
          }
        }
        
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
      }

      if (messageType === "preview_update") {
        const update = typedData as unknown as PreviewUpdate;
        
        let value: unknown = update.value;
        
        // Handle binary data conversion for preview images
        if (typeof update.value === "string") {
          // Convert base64 string to Uint8Array
          const binary = atob(update.value);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          value = bytes;
        } else if (
          update.value &&
          typeof update.value === "object" &&
          "data" in (update.value as any)
        ) {
          // Extract Uint8Array from object with data property
          value = (update.value as { data: Uint8Array }).data;
        }
        
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
      }
    };

    runnerStore.getState().setMessageHandler(handler);

    return () => {
      runnerStore.getState().setMessageHandler(originalHandler);
    };
  }, [runnerStore, selectedWorkflow, setProgressState, upsertResult]);

  const runWorkflow = useCallback<RunWorkflowFn>(
    async (params, workflow, nodes, edges) => {
      if (workflow) {
        resetWorkflowState(workflow.id);
      }
      await runWorkflowFromStore(params, workflow, nodes, edges);
    },
    [runWorkflowFromStore, resetWorkflowState]
  );

  return {
    runWorkflow,
    runnerState,
    statusMessage,
    notifications,
    results,
    progress,
    resetWorkflowState
  } as const;
};
