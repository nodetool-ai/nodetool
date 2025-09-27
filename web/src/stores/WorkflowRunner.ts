import { create, StoreApi, UseBoundStore } from "zustand";
import { NodeData } from "./NodeData";
import { isLocalhost } from "./ApiClient";
import { WORKER_URL } from "./BASE_URL";
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
import {
  WebSocketManager,
  ConnectionState
} from "../lib/websocket/WebSocketManager";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useStoreWithEqualityFn } from "zustand/traditional";

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
  wsManager: WebSocketManager | null;
  job_id: string | null;
  current_url: string;
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
    edges: Edge[]
  ) => Promise<void>;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
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

export const createWorkflowRunnerStore = (): WorkflowRunnerStore => {
  const store = create<WorkflowRunner>((set, get) => ({
    wsManager: null,
    workflow: null,
    nodes: [],
    edges: [],
    current_url: "",
    job_id: null,
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

    connect: async (url: string) => {
      if (get().wsManager) {
        get().disconnect();
      }

      set({ current_url: url, state: "connecting" });

      const wsManager = new WebSocketManager({
        url,
        binaryType: "arraybuffer",
        reconnect: true,
        reconnectInterval: 1000,
        reconnectAttempts: 5
      });

      wsManager.on("open", () => {
        log.info("WebSocket connected");
        set({ state: "connected" });
      });

      wsManager.on("message", (data: any) => {
        const workflow = get().workflow;
        if (workflow) {
          get().messageHandler(workflow, data);
        }
      });

      wsManager.on("error", (error: Error) => {
        log.error("WebSocket error:", error);
        set({ state: "error" });
      });

      wsManager.on("close", () => {
        log.info("WebSocket disconnected");
        set({ wsManager: null, state: "idle" });
      });

      wsManager.on("reconnecting", (attempt: number, maxAttempts: number) => {
        log.info(`Reconnecting attempt ${attempt}/${maxAttempts}`);
        set({ state: "connecting" });
      });

      wsManager.on("stateChange", (newState: ConnectionState) => {
        switch (newState) {
          case "connecting":
          case "reconnecting":
            set({ state: "connecting" });
            break;
          case "connected":
            set({ state: "connected" });
            break;
          case "disconnected":
            set({ state: "idle" });
            break;
          case "failed":
            set({ state: "error" });
            break;
        }
      });

      set({ wsManager });

      try {
        await wsManager.connect();
      } catch (error) {
        log.error("Failed to connect WebSocket:", error);
        set({ state: "error" });
        throw error;
      }
    },

    disconnect: () => {
      console.log("Disconnecting WebSocket");
      const { wsManager } = get();
      if (wsManager) {
        wsManager.disconnect();
        set({ wsManager: null, current_url: "", state: "idle" });
      }
    },

    // Push a streaming item to a streaming InputNode by name
    streamInput: (inputName: string, value: any, handle?: string) => {
      const { wsManager } = get();
      if (!wsManager) {
        log.warn("streamInput called without an active WebSocket connection");
        return;
      }
      wsManager.send({
        type: "stream_input",
        command: "stream_input",
        data: { input: inputName, value, handle }
      });
    },

    // End a streaming input by name
    endInputStream: (inputName: string, handle?: string) => {
      const { wsManager } = get();
      if (!wsManager) {
        log.warn(
          "endInputStream called without an active WebSocket connection"
        );
        return;
      }
      wsManager.send({
        type: "end_input_stream",
        command: "end_input_stream",
        data: { input: inputName, handle }
      });
    },

    /**
     * Run the current workflow.
     *
     * @param params - The parameters to run the workflow with.
     *
     * @returns The results of the workflow.
     */
    run: async (
      params: any,
      workflow: WorkflowAttributes,
      nodes: Node<NodeData>[],
      edges: Edge[]
    ) => {
      if (!get().wsManager) {
        await get().connect(WORKER_URL);
      }

      console.log("run", params, workflow, nodes, edges);

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
      const connectUrl = WORKER_URL;
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

      if (!get().wsManager || get().current_url !== connectUrl) {
        await get().connect(connectUrl);
      }

      const wsManager = get().wsManager;

      if (wsManager === null) {
        throw new Error("WebSocketManager is null");
      }

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
        params: params || {},
        explicit_types: false,
        graph: {
          nodes: nodes.map(reactFlowNodeToGraphNode),
          edges: edges.map(reactFlowEdgeToGraphEdge)
        }
      };

      log.info("Running job", req);

      wsManager.send({
        type: "run_job",
        command: "run_job",
        data: req
      });

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
      const { wsManager, job_id, workflow } = get();
      console.log("Cancelling job", job_id);

      const clearStatuses = useStatusStore.getState().clearStatuses;
      const clearEdges = useResultsStore.getState().clearEdges;

      if (workflow) {
        clearStatuses(workflow.id);
        clearEdges(workflow.id);
      }

      if (!wsManager || !job_id) {
        return;
      }

      wsManager.send({
        type: "cancel_job",
        command: "cancel_job",
        data: { job_id }
      });
      set({ state: "cancelled" });
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
  const key = workflowId;
  let store = runnerStores.get(key);

  if (!store) {
    store = createWorkflowRunnerStore();
    runnerStores.set(key, store);
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
