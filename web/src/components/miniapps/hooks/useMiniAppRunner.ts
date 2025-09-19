import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";

import {
  JobUpdate,
  NodeProgress,
  OutputUpdate,
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
  const runnerStore = useMemo(() => {
    return createWorkflowRunnerStore();
  }, []);

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
        const result: MiniAppResult = {
          id: `${update.node_id}:${update.output_name}`,
          nodeId: update.node_id,
          nodeName: update.node_name,
          outputName: update.output_name,
          outputType: update.output_type,
          value: update.value,
          metadata: (update.metadata || {}) as Record<string, unknown>,
          receivedAt: Date.now()
        };

        upsertResult(workflow.id, result);
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
      await runWorkflowFromStore(params, workflow, nodes, edges);
    },
    [runWorkflowFromStore]
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
