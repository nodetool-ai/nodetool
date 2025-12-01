import { create, StoreApi, UseBoundStore } from "zustand";
import { NodeData } from "./NodeData";
import { isLocalhost } from "./ApiClient";
import { BASE_URL } from "./BASE_URL";
import useResultsStore from "./ResultsStore";
import { Edge, Node } from "@xyflow/react";
import log from "loglevel";
import {
  Prediction,
  NodeProgress,
  NodeUpdate,
  JobUpdate,
  RunJobRequest,
  WorkflowAttributes,
  TaskUpdate,
  PlanningUpdate
} from "./ApiTypes";
import { uuidv4 } from "./uuidv4";
import { useNotificationStore, Notification } from "./NotificationStore";
import useStatusStore from "./StatusStore";
import useErrorStore from "./ErrorStore";
import { handleUpdate } from "./workflowUpdates";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { supabase } from "../lib/supabaseClient";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { queryClient } from "../queryClient";

export type ProcessingContext = {
  edges: Edge[];
  nodes: Node<NodeData>[];
  processed: Record<string, boolean>;
};

export type NodeState = {
  id: string;
  error: string | null;
};

export type MessageHandler = (
  workflow: WorkflowAttributes,
  data: MsgpackData
) => void;

export type WorkflowRunner = {
  workflow: WorkflowAttributes | null;
  nodes: Node<NodeData>[];
  edges: Edge[];
  job_id: string | null;
  unsubscribe: (() => void) | null;
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "running"
    | "error"
    | "cancelled";
  statusMessage: string | null;
  setStatusMessage: (message: string | null) => void;
  notifications: Notification[];
  messageHandler: MessageHandler;
  setMessageHandler: (handler: MessageHandler) => void;
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp">
  ) => void;
  cancel: () => Promise<void>;
  run: (
    params: any,
    workflow: WorkflowAttributes,
    nodes: Node<NodeData>[],
    edges: Edge[],
    resource_limits?: any
  ) => Promise<void>;
  reconnect: (jobId: string) => Promise<void>;
  reconnectWithWorkflow: (
    jobId: string,
    workflow: WorkflowAttributes
  ) => Promise<void>;
  ensureConnection: () => Promise<void>;
  cleanup: () => void;
  // Streaming inputs
  streamInput: (inputName: string, value: any, handle?: string) => void;
  endInputStream: (inputName: string, handle?: string) => void;
};

type MsgpackData =
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | TaskUpdate
  | PlanningUpdate;

export type WorkflowRunnerStore = UseBoundStore<StoreApi<WorkflowRunner>>;

export const createWorkflowRunnerStore = (
  workflowId: string
): WorkflowRunnerStore => {
  const store = create<WorkflowRunner>((set, get) => ({
    workflow: null,
    nodes: [],
    edges: [],
    job_id: null,
    unsubscribe: null,
    state: "idle",
    statusMessage: null,
    messageHandler: (workflow: WorkflowAttributes, data: MsgpackData) => {
      console.warn("No message handler set");
    },
    setMessageHandler: (handler: MessageHandler) => {
      set({ messageHandler: handler });
    },
    setStatusMessage: (message: string | null) => {
      set({ statusMessage: message });
    },
    notifications: [],

    ensureConnection: async () => {
      set({ state: "connecting" });
      try {
        await globalWebSocketManager.ensureConnection();
        set({ state: "connected" });

        // Subscribe to messages for this workflow
        const currentUnsubscribe = get().unsubscribe;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }

        const unsubscribe = globalWebSocketManager.subscribe(
          workflowId,
          (message: any) => {
            log.debug(
              `WorkflowRunner[${workflowId}]: Received message`,
              message
            );
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
        log.error(`WorkflowRunner[${workflowId}]: Connection failed:`, error);
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

    /**
     * Reconnect to an existing job by job_id.
     */
    reconnect: async (jobId: string) => {
      log.info(`WorkflowRunner[${workflowId}]: Reconnecting to job`, {
        jobId
      });

      await get().ensureConnection();

      set({ job_id: jobId, state: "running" });

      await globalWebSocketManager.send({
        type: "reconnect_job",
        command: "reconnect_job",
        data: {
          job_id: jobId,
          workflow_id: workflowId
        }
      });

      // Also subscribe to job_id for messages
      const jobUnsubscribe = globalWebSocketManager.subscribe(
        jobId,
        (message: any) => {
          const workflow = get().workflow;
          if (workflow) {
            get().messageHandler(workflow, message);
          }
        }
      );

      // Combine unsubscribers
      const existingUnsubscribe = get().unsubscribe;
      set({
        unsubscribe: () => {
          existingUnsubscribe?.();
          jobUnsubscribe();
        }
      });
    },

    /**
     * Reconnect to an existing job with workflow context.
     */
    reconnectWithWorkflow: async (
      jobId: string,
      workflow: WorkflowAttributes
    ) => {
      log.info(`WorkflowRunner[${workflowId}]: Reconnecting with workflow`, {
        jobId,
        workflowId: workflow.id
      });

      await get().ensureConnection();

      set({
        workflow,
        job_id: jobId,
        state: "connecting",
        statusMessage: "Reconnecting to running job..."
      });

      await globalWebSocketManager.send({
        type: "reconnect_job",
        command: "reconnect_job",
        data: {
          job_id: jobId,
          workflow_id: workflow.id
        }
      });

      // Also subscribe to job_id for messages
      const jobUnsubscribe = globalWebSocketManager.subscribe(
        jobId,
        (message: any) => {
          const workflow = get().workflow;
          if (workflow) {
            get().messageHandler(workflow, message);
          }
        }
      );

      // Combine unsubscribers
      const existingUnsubscribe = get().unsubscribe;
      set({
        unsubscribe: () => {
          existingUnsubscribe?.();
          jobUnsubscribe();
        }
      });
    },

    // Push a streaming item to a streaming InputNode by name
    streamInput: async (inputName: string, value: any, handle?: string) => {
      const { job_id } = get();
      if (!job_id) {
        log.warn("streamInput called without an active job");
        return;
      }

      await globalWebSocketManager.send({
        type: "stream_input",
        command: "stream_input",
        data: {
          input: inputName,
          value,
          handle,
          job_id,
          workflow_id: workflowId
        }
      });
    },

    // End a streaming input by name
    endInputStream: async (inputName: string, handle?: string) => {
      const { job_id } = get();
      if (!job_id) {
        log.warn("endInputStream called without an active job");
        return;
      }

      await globalWebSocketManager.send({
        type: "end_input_stream",
        command: "end_input_stream",
        data: {
          input: inputName,
          handle,
          job_id,
          workflow_id: workflowId
        }
      });
    },

    /**
     * Run the current workflow.
     */
    run: async (
      params: any,
      workflow: WorkflowAttributes,
      nodes: Node<NodeData>[],
      edges: Edge[],
      resource_limits?: any
    ) => {
      log.info(`WorkflowRunner[${workflowId}]: Starting workflow run`);

      await get().ensureConnection();

      set({ workflow, nodes, edges });

      const clearStatuses = useStatusStore.getState().clearStatuses;
      const clearErrors = useErrorStore.getState().clearErrors;
      const clearEdges = useResultsStore.getState().clearEdges;
      const clearResults = useResultsStore.getState().clearResults;
      const clearPreviews = useResultsStore.getState().clearPreviews;
      const clearProgress = useResultsStore.getState().clearProgress;
      const clearToolCalls = useResultsStore.getState().clearToolCalls;
      const clearTasks = useResultsStore.getState().clearTasks;
      const clearChunks = useResultsStore.getState().clearChunks;
      const clearPlanningUpdates =
        useResultsStore.getState().clearPlanningUpdates;

      let auth_token = "local_token";
      let user = "1";

      if (!isLocalhost) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        auth_token = session?.access_token || "";
        user = session?.user?.id || "";
      }

      set({
        statusMessage: "Workflow starting..."
      });

      clearStatuses(workflow.id);
      clearEdges(workflow.id);
      clearErrors(workflow.id);
      clearResults(workflow.id);
      clearPreviews(workflow.id);
      clearProgress(workflow.id);
      clearToolCalls(workflow.id);
      clearTasks(workflow.id);
      clearPlanningUpdates(workflow.id);
      clearChunks(workflow.id);

      set({
        state: "running",
        notifications: []
      });

      const req: RunJobRequest = {
        type: "run_job_request",
        api_url: BASE_URL,
        user_id: user,
        workflow_id: workflow.id,
        auth_token: auth_token,
        job_type: "workflow",
        execution_strategy: resource_limits ? "subprocess" : "threaded",
        params: params || {},
        explicit_types: false,
        graph: {
          nodes: nodes.map(reactFlowNodeToGraphNode),
          edges: edges.map(reactFlowEdgeToGraphEdge)
        },
        resource_limits: resource_limits
      };

      log.info(`WorkflowRunner[${workflowId}]: Sending run_job command`, req);

      await globalWebSocketManager.send({
        type: "run_job",
        command: "run_job",
        data: req
      });

      // Invalidate running jobs query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["jobs"] });

      set({
        state: "running",
        notifications: []
      });
    },

    /**
     * Add a notification to the notification store
     */
    addNotification: (notification: Omit<Notification, "id" | "timestamp">) => {
      useNotificationStore.getState().addNotification(notification);
      set({
        notifications: [
          ...get().notifications,
          { ...notification, id: uuidv4(), timestamp: new Date() }
        ]
      });
    },

    /**
     * Cancel the current workflow run.
     */
    cancel: async () => {
      const { job_id, workflow } = get();
      log.info(`WorkflowRunner[${workflowId}]: Cancelling job`, { job_id });

      // Immediately stop all animations and clear state
      set({ state: "cancelled" });

      const clearStatuses = useStatusStore.getState().clearStatuses;
      const clearEdges = useResultsStore.getState().clearEdges;
      const clearProgress = useResultsStore.getState().clearProgress;

      if (workflow) {
        clearStatuses(workflow.id);
        clearEdges(workflow.id);
        clearProgress(workflow.id);
      }

      if (!job_id) {
        return;
      }

      // Send cancel command to backend
      await globalWebSocketManager.send({
        type: "cancel_job",
        command: "cancel_job",
        data: {
          job_id,
          workflow_id: workflowId
        }
      });
    }
  }));

  store.setState({
    messageHandler: (workflow: WorkflowAttributes, data: MsgpackData) => {
      handleUpdate(workflow, data, store);
    }
  });

  return store;
};

const runnerStores = new Map<string, WorkflowRunnerStore>();

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

export function useWebsocketRunner<T>(
  selector: (state: WorkflowRunner) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  if (!currentWorkflowId) {
    throw new Error("No current workflow id");
  }

  const store = getWorkflowRunnerStore(currentWorkflowId);

  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export default useWebsocketRunner;
