import { create } from "zustand";
import { NodeData } from "./NodeData";
import { BASE_URL, isLocalhost, WORKER_URL } from "./ApiClient";
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
  Chunk,
  PlanningUpdate
} from "./ApiTypes";
import { Omit } from "lodash";
import { uuidv4 } from "./uuidv4";
import { useAuth } from "./useAuth";
import { useNotificationStore, Notification } from "./NotificationStore";
import useStatusStore from "./StatusStore";
import useLogsStore from "./LogStore";
import useErrorStore from "./ErrorStore";
import { decode, encode } from "@msgpack/msgpack";
import { handleUpdate } from "./workflowUpdates";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { supabase } from "../lib/supabaseClient";

export type ProcessingContext = {
  edges: Edge[];
  nodes: Node<NodeData>[];
  processed: Record<string, boolean>;
};

export type NodeState = {
  id: string;
  error: string | null;
};

export type WorkflowRunner = {
  workflow: WorkflowAttributes | null;
  nodes: Node<NodeData>[];
  edges: Edge[];
  socket: WebSocket | null;
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
  readMessage: (workflow: WorkflowAttributes, data: MsgpackData) => void;
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
};

type MsgpackData =
  | Chunk
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | TaskUpdate
  | PlanningUpdate;

const useWorkflowRunnner = create<WorkflowRunner>((set, get) => ({
  socket: null,
  workflow: null,
  nodes: [],
  edges: [],
  current_url: "",
  job_id: null,
  state: "idle",
  statusMessage: null,
  setStatusMessage: (message: string | null) => {
    set({ statusMessage: message });
  },
  notifications: [],

  connect: async (url: string) => {
    if (get().socket) {
      get().disconnect();
    }

    set({ current_url: url, state: "connecting" });

    const socket = new WebSocket(url);

    socket.onopen = () => {
      log.info("WebSocket connected");
      set({ socket });
    };

    socket.onmessage = async (event) => {
      // TODO: this needs to be part of the payload
      const workflow = get().workflow;
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;
      if (data.type !== "chunk") {
        console.log("data", data);
      }

      if (workflow) {
        get().readMessage(workflow, data);
      }
    };

    socket.onerror = (error) => {
      log.error("WebSocket error:", error);
      set({ state: "error" });
    };

    socket.onclose = () => {
      log.info("WebSocket disconnected");
      set({ socket: null, state: "idle" });
    };

    set({ socket });

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          set({ state: "connected" });
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, current_url: "", state: "idle" });
    }
  },

  readMessage: (workflow: WorkflowAttributes, data: MsgpackData) => {
    try {
      handleUpdate(workflow, data);
    } catch (error) {
      log.error("WorkflowRunner WS error:", error);
    }
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
    set({ workflow, nodes, edges });
    const clearStatuses = useStatusStore.getState().clearStatuses;
    const clearLogs = useLogsStore.getState().clearLogs;
    const clearErrors = useErrorStore.getState().clearErrors;
    const clearResults = useResultsStore.getState().clearResults;
    const clearProgress = useResultsStore.getState().clearProgress;
    const clearToolCalls = useResultsStore.getState().clearToolCalls;
    const clearTasks = useResultsStore.getState().clearTasks;
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

    if (!get().socket || get().current_url !== connectUrl) {
      await get().connect(connectUrl);
    }

    const socket = get().socket;

    if (socket === null) {
      throw new Error("Socket is null");
    }

    clearStatuses(workflow.id);
    clearLogs(workflow.id);
    clearErrors(workflow.id);
    clearResults(workflow.id);
    clearProgress(workflow.id);
    clearToolCalls(workflow.id);
    clearTasks(workflow.id);
    clearPlanningUpdates(workflow.id);

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

    console.log(req);

    socket.send(
      encode({
        command: "run_job",
        data: req
      })
    );

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
    const { socket, job_id, workflow } = get();
    console.log("Cancelling job", job_id);

    const clearStatuses = useStatusStore.getState().clearStatuses;

    if (workflow) {
      clearStatuses(workflow.id);
    }

    if (!socket || !job_id) {
      return;
    }

    socket.send(
      encode({
        command: "cancel_job",
        data: { job_id }
      })
    );
    set({ state: "cancelled" });
  }
}));

export default useWorkflowRunnner;
