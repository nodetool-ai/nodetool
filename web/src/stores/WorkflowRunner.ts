import { create } from "zustand";
import { NodeData } from "./NodeData";
import { BASE_URL, WORKER_URL } from "./ApiClient";
import useResultsStore from "./ResultsStore";
import { Edge, Node } from "@xyflow/react";
import {
  reactFlowEdgeToGraphEdge,
  reactFlowNodeToGraphNode,
  useNodeStore
} from "./NodeStore";
import { devError, devLog } from "../utils/DevLog";
import {
  Prediction,
  NodeProgress,
  NodeUpdate,
  JobUpdate,
  RunJobRequest,
  WorkflowAttributes
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
  readMessage: (
    workflow: WorkflowAttributes,
    data: JobUpdate | Prediction | NodeProgress | NodeUpdate
  ) => void;
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp">
  ) => void;
  cancel: () => Promise<void>;
  run: (params?: any, groupId?: string) => Promise<void>;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
};

type MsgpackData = JobUpdate | Prediction | NodeProgress | NodeUpdate;

const useWorkflowRunnner = create<WorkflowRunner>((set, get) => ({
  socket: null,
  current_url: "",
  job_id: null,
  state: "idle",
  statusMessage: null,
  setStatusMessage: (message: string | null) => {
    set({ statusMessage: message });
  },
  notifications: [],

  connect: async (url: string) => {
    const user = useAuth.getState().getUser();
    if (!user) {
      throw new Error("User is not logged in");
    }

    if (get().socket) {
      get().disconnect();
    }

    set({ current_url: url, state: "connecting" });

    const socket = new WebSocket(url);

    socket.onopen = () => {
      devLog("WebSocket connected");
      set({ socket });
    };

    socket.onmessage = async (event) => {
      // TODO: this needs to be part of the payload
      const workflow = useNodeStore.getState().workflow;
      const arrayBuffer = await event.data.arrayBuffer();
      const data = decode(new Uint8Array(arrayBuffer)) as MsgpackData;
      get().readMessage(workflow, data);
    };

    socket.onerror = (error) => {
      devError("WebSocket error:", error);
      set({ state: "error" });
    };

    socket.onclose = () => {
      devLog("WebSocket disconnected");
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

  readMessage: (
    workflow: WorkflowAttributes,
    data: JobUpdate | Prediction | NodeProgress | NodeUpdate
  ) => {
    try {
      handleUpdate(workflow, data);
    } catch (error) {
      devError("WorkflowRunner WS error:", error);
    }
  },

  /**
   * Run the current workflow.
   *
   * @param params - The parameters to run the workflow with.
   * @param groupId - Only run the workflow on the specified group.
   *
   * @returns The results of the workflow.
   */
  run: async (params?: any, groupId?: string) => {
    const nodes = groupId
      ? useNodeStore
          .getState()
          .nodes.filter(
            (node) => node.id === groupId || node.parentId === groupId
          )
      : useNodeStore.getState().nodes;
    const edges = groupId
      ? useNodeStore
          .getState()
          .edges.filter(
            (edge) =>
              nodes.find((node) => node.id === edge.source) &&
              nodes.find((node) => node.id === edge.target)
          )
      : useNodeStore.getState().edges;
    const workflow = useNodeStore.getState().workflow;
    const getUser = useAuth.getState().getUser;
    const clearStatuses = useStatusStore.getState().clearStatuses;
    const clearLogs = useLogsStore.getState().clearLogs;
    const clearErrors = useErrorStore.getState().clearErrors;
    const clearResults = useResultsStore.getState().clearResults;
    const clearProgress = useResultsStore.getState().clearProgress;
    const connectUrl = WORKER_URL;

    if (!get().socket || get().current_url !== connectUrl) {
      await get().connect(connectUrl);
    }

    const socket = get().socket;

    if (socket === null) {
      throw new Error("Socket is null");
    }

    const user = getUser();

    if (user === null) {
      throw new Error("User is not logged in");
    }

    clearStatuses(workflow.id);
    clearLogs(workflow.id);
    clearErrors(workflow.id);
    clearResults(workflow.id);
    clearProgress(workflow.id);

    set({
      state: "running",
      notifications: []
    });

    const req: RunJobRequest = {
      type: "run_job_request",
      api_url: BASE_URL,
      user_id: user.id,
      workflow_id: workflow.id,
      auth_token: user.auth_token || "",
      job_type: "workflow",
      params: params || {},
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
   * Run the selected nodes in the workflow.
   *
   * This will run the nodes in topological order.
   */
  runSelected: async () => {
    const { edges, nodes } = useNodeStore.getState().getSelection();
    throw new Error("Not implemented");
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
    const { socket, job_id } = get();
    console.log("Cancelling job", job_id);

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
