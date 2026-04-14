/**
 * Workflow runner WebSocket bridge for Mobile.
 * Ported from web/src/stores/WorkflowRunner.ts
 */
import { create, StoreApi, UseBoundStore } from "zustand";
import { apiService } from "../services/api";
import { webSocketService } from "../services/WebSocketService";
import { useAuthStore } from "./AuthStore";
import {
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  Workflow,
  MsgpackData,
  RunJobRequest,
} from "../types/workflow";

const MAX_LOGS = 500;

export type MessageHandler = (
  workflow: Workflow,
  data: MsgpackData
) => void;

export type WorkflowRunner = {
  workflow: Workflow | null;
  job_id: string | null;
  unsubscribe: (() => void) | null;
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "running"
    | "error"
    | "cancelled"
    | "completed";

  // Accumulated data for the UI
  logs: string[];
  results: Record<string, unknown> | unknown[] | unknown | null;
  nodeProgress: Record<string, number>;
  nodeStatus: Record<string, string>;

  statusMessage: string | null;
  setStatusMessage: (message: string | null) => void;

  messageHandler: MessageHandler;
  setMessageHandler: (handler: MessageHandler) => void;

  run: (
    params: Record<string, unknown>,
    workflow: Workflow,
  ) => Promise<void>;

  ensureConnection: () => Promise<void>;
  cleanup: () => void;
  cancel: () => Promise<void>;
};

export type WorkflowRunnerStore = UseBoundStore<StoreApi<WorkflowRunner>>;

const runnerStores = new Map<string, WorkflowRunnerStore>();

function appendLog(logs: string[], entry: string): string[] {
  const updated = [...logs, entry];
  if (updated.length > MAX_LOGS) {
    return updated.slice(updated.length - MAX_LOGS);
  }
  return updated;
}

export const createWorkflowRunnerStore = (
  workflowId: string
): WorkflowRunnerStore => {
  const store = create<WorkflowRunner>((set, get) => ({
    workflow: null,
    job_id: null,
    unsubscribe: null,
    state: "idle",
    logs: [],
    results: null,
    nodeProgress: {},
    nodeStatus: {},
    statusMessage: null,

    messageHandler: (workflow: Workflow, data: MsgpackData) => {
      const state = get();

      if ('message' in data && typeof data.message === 'string') {
        set({ logs: appendLog(state.logs, `[${data.type}] ${data.message}`) });
      }

      switch (data.type) {
        case "job_update": {
          const jobUpdate = data as unknown as JobUpdate;
          if (jobUpdate.status === "completed") {
            set({ state: "completed", results: jobUpdate.result, statusMessage: "Completed" });
          } else if (jobUpdate.status === "failed") {
            set({ state: "error", statusMessage: `Failed: ${jobUpdate.error}` });
          } else if (jobUpdate.status === "cancelled") {
            set({ state: "cancelled", statusMessage: "Cancelled" });
          } else if (jobUpdate.status === "running") {
            set({ state: "running", statusMessage: "Running..." });
          }
          break;
        }

        case "node_progress": {
          const progress = data as unknown as NodeProgress;
          set({
            nodeProgress: {
              ...state.nodeProgress,
              [progress.node_id]: progress.progress
            }
          });
          break;
        }

        case "node_update": {
          const nodeUpdate = data as unknown as NodeUpdate;
          set({
            nodeStatus: {
              ...state.nodeStatus,
              [nodeUpdate.node_id]: nodeUpdate.status
            },
            logs: appendLog(state.logs, `Node ${nodeUpdate.node_id}: ${nodeUpdate.status}`)
          });
          break;
        }
      }
    },

    setMessageHandler: (handler: MessageHandler) => {
      set({ messageHandler: handler });
    },

    setStatusMessage: (message: string | null) => {
      set({ statusMessage: message });
    },

    ensureConnection: async () => {
      set({ state: "connecting" });
      try {
        await webSocketService.ensureConnection('/ws');
        set({ state: "connected" });

        const currentUnsubscribe = get().unsubscribe;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }

        const unsubscribe = webSocketService.subscribe(
          workflowId,
          (message: Record<string, unknown>) => {
            const workflow = get().workflow;
            if (workflow) {
              if (message.job_id && !get().job_id) {
                set({ job_id: message.job_id as string });
              }
              get().messageHandler(workflow, message as unknown as MsgpackData);
            }
          }
        );

        set({ unsubscribe });
      } catch (error) {
        console.error(`WorkflowRunner[${workflowId}]: Connection failed:`, error);
        set({ state: "error" });
        throw error;
      }
    },

    cleanup: () => {
      const unsubscribe = get().unsubscribe;
      if (unsubscribe) {
        unsubscribe();
        set({ unsubscribe: null });
      }
      // Remove from store map to prevent memory leaks
      runnerStores.delete(workflowId);
    },

    run: async (
      params: Record<string, unknown>,
      workflow: Workflow,
    ) => {
      console.log(`WorkflowRunner[${workflowId}]: Starting workflow run`);

      await get().ensureConnection();

      set({
        workflow,
        state: "running",
        logs: [],
        results: null,
        nodeProgress: {},
        nodeStatus: {},
        statusMessage: "Starting workflow...",
      });

      const session = useAuthStore.getState().session;
      const auth_token = session?.access_token || "local_token";
      const user_id = session?.user?.id || "1";

      const req: RunJobRequest = {
        type: "run_job_request",
        api_url: apiService.getApiHost() + "/ws/predict",
        user_id,
        workflow_id: workflow.id,
        auth_token,
        job_type: "workflow",
        execution_strategy: "threaded",
        params: params || {},
        explicit_types: false,
        graph: {
          nodes: workflow.graph?.nodes || [],
          edges: workflow.graph?.edges || [],
        },
        resource_limits: {},
      };

      await webSocketService.send({
        type: "run_job",
        command: "run_job",
        data: req,
      }, "/ws");
    },

    cancel: async () => {
      const { job_id } = get();
      if (job_id && workflowId) {
        await webSocketService.send({
          type: "cancel_job",
          command: "cancel_job",
          data: {
            job_id,
            workflow_id: workflowId
          }
        }, '/ws');
      }
      set({ state: "cancelled", statusMessage: "Cancelled" });
    }
  }));

  return store;
};

export const getWorkflowRunnerStore = (
  workflowId: string
): WorkflowRunnerStore => {
  let store = runnerStores.get(workflowId);

  if (!store) {
    store = createWorkflowRunnerStore(workflowId);
    runnerStores.set(workflowId, store);
  }

  return store;
};

export const useWorkflowRunner = (workflowId: string) => {
  return getWorkflowRunnerStore(workflowId);
};
