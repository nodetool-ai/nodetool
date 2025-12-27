/**
 * Workflow runner WebSocket bridge for Mobile.
 * Ported from web/src/stores/WorkflowRunner.ts
 */
import { create, StoreApi, UseBoundStore } from "zustand";
import { apiService } from "../services/api";
import { webSocketService } from "../services/WebSocketService";
import {
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  TaskUpdate,
  PlanningUpdate,
  Workflow,
  MsgpackData,
  RunJobRequest,
  GraphNode,
  GraphEdge,
} from "../types/workflow";

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
  results: any | null;
  nodeProgress: Record<string, number>;
  nodeStatus: Record<string, string>;

  statusMessage: string | null;
  setStatusMessage: (message: string | null) => void;

  messageHandler: MessageHandler;
  setMessageHandler: (handler: MessageHandler) => void;

  run: (
    params: any,
    workflow: Workflow,
  ) => Promise<void>;

  ensureConnection: () => Promise<void>;
  cleanup: () => void;
  cancel: () => Promise<void>;
};

export type WorkflowRunnerStore = UseBoundStore<StoreApi<WorkflowRunner>>;

const runnerStores = new Map<string, WorkflowRunnerStore>();

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
      // Default handler updates internal state
      const state = get();

      // Log extraction (simplified)
      if ((data as any).message) {
         set({ logs: [...state.logs, `[${data.type}] ${(data as any).message}`] });
      }

      switch (data.type) {
        case "job_update":
          // @ts-ignore
          const jobUpdate = data as JobUpdate;
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
          
        case "node_progress":
          // @ts-ignore
          const progress = data as NodeProgress;
          set({ 
            nodeProgress: { 
              ...state.nodeProgress, 
              [progress.node_id]: progress.progress 
            } 
          });
          break;

        case "node_update":
           // @ts-ignore
           const nodeUpdate = data as NodeUpdate;
           set({
             nodeStatus: {
               ...state.nodeStatus,
               [nodeUpdate.node_id]: nodeUpdate.status
             },
             // If we want logs from node updates
             logs: [...state.logs, `Node ${nodeUpdate.node_id}: ${nodeUpdate.status}`]
           });
           break;
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
        await webSocketService.ensureConnection('/ws/predict');
        set({ state: "connected" });

        // Subscribe to messages for this workflow
        const currentUnsubscribe = get().unsubscribe;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }

        const unsubscribe = webSocketService.subscribe(
          workflowId,
          (message: any) => {
            const workflow = get().workflow;
            if (workflow) {
              // Capture job_id from responses if present
              if (message.job_id && !get().job_id) {
                set({ job_id: message.job_id });
              }
              get().messageHandler(workflow, message);
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
    },

    run: async (
      params: any,
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

      const req: RunJobRequest = {
        type: "run_job_request",
        api_url: apiService.getApiHost() + "/ws/predict",
        user_id: "mobile_user",
        workflow_id: workflow.id,
        auth_token: "mobile_token",
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
      }, "/ws/predict");
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
          }, '/ws/predict');
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
}
