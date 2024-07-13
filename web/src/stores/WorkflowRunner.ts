import { create } from "zustand";
import { NodeData } from "./NodeData";
import { BASE_URL, COMFY_WORKER_URL, WORKER_URL } from "./ApiClient";
import useResultsStore from "./ResultsStore";
import { Edge, Node } from "reactflow";
import { useAssetStore } from "../hooks/AssetStore";
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
  AssetRef,
  WorkflowAttributes
} from "./ApiTypes";
import { Omit } from "lodash";
import { uuidv4 } from "./uuidv4";
import { useAuth } from "./useAuth";
import { useNotificationStore, Notification } from "./NotificationStore";
import useStatusStore from "./StatusStore";
import useLogsStore from "./LogStore";
import useErrorStore from "./ErrorStore";

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
  state: "idle" | "running" | "error" | "cancelled";
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
  run: (params?: any, noCache?: boolean) => Promise<void>;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
};

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
    
    set({ current_url: url });

    const socket = new WebSocket(url);
    
    socket.onopen = () => {
      devLog("WebSocket connected");
      set({ socket });
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // TODO: this needs to be part of the payload
      const workflow = useNodeStore.getState().workflow;
      get().readMessage(workflow, data);
    };

    socket.onerror = (error) => {
      devError("WebSocket error:",error);
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
      set({ socket: null, current_url: "" });
    }
  },

  readMessage: (
    workflow: WorkflowAttributes,
    data: JobUpdate | Prediction | NodeProgress | NodeUpdate
  ) => {
    const getAsset = useAssetStore.getState().get;
    const setResult = useResultsStore.getState().setResult;
    const findNode = useNodeStore.getState().findNode;
    const updateNode = useNodeStore.getState().updateNodeData;
    const addNotification = get().addNotification;
    const setStatus = useStatusStore.getState().setStatus;
    const setLogs = useLogsStore.getState().setLogs;
    const setError = useErrorStore.getState().setError;
    const setProgress = useResultsStore.getState().setProgress;

    try {
      devLog(`WofkflowRunner ${data.type}`, data);

      if (data.type === "job_update") {
        const job = data as JobUpdate;
        set({ job_id: job.job_id });
        switch (job.status) {
          case "completed":
            set({ state: "idle" });
            addNotification({
              type: "info",
              alert: true,
              content: "Job completed"
            });
            break;
          case "running":
            set({ state: "running" });
            break;
          case "cancelled":
            set({ state: "idle" });
            addNotification({
              type: "info",
              alert: true,
              content: "Job cancelled"
            });
            break;
          case "failed":
            set({ state: "idle" });
            addNotification({
              type: "error",
              alert: true,
              content: "Job failed " + job.error || "",
              timeout: 30000
            });
            break;
        }
      }

      if (data.type === "prediction") {
        const pred = data as Prediction;
        setLogs(workflow.id, pred.node_id, pred.logs || "");
        if (pred.status === "booting") {
          setStatus(workflow.id, pred.node_id, "booting");
        }
      }

      if (data.type === "node_progress") {
        const progress = data as NodeProgress;
        setProgress(
          workflow.id,
          progress.node_id,
          progress.progress,
          progress.total
        );
      }

      if (data.type === "node_update") {
        const update = data as NodeUpdate;
        const node = findNode(data.node_id);
        if (!node) {
          devError("received message for deleted node", data.node_id);
          return;
        }

        if (update.error) {
          devError("WorkflowRunner update error", update.error);
          addNotification({
            type: "error",
            alert: true,
            content: update.error
          });
          set({ state: "error" });
          setStatus(workflow.id, update.node_id, update.status);
          setError(workflow.id, update.node_id, update.error);
        } else {
          set({ statusMessage: `${node.type} ${update.status}` });
          setLogs(workflow.id, update.node_id, update.logs || "");
          setStatus(workflow.id, update.node_id, update.status);
        }

        if (update.status === "completed") {
          setResult(workflow.id, data.node_id, update.result);

          if (update.result) {
            Object.entries(update.result).forEach(([key, value]) => {
              const ref = value as AssetRef;
              if (
                typeof ref === "object" &&
                ref !== null &&
                "asset_id" in ref
              ) {
                const asset_id = ref.asset_id;
                if (asset_id) {
                  getAsset(asset_id).then((res) => {
                    if (res?.get_url) {
                      ref.uri = res.get_url;
                    }
                    setResult(workflow.id, data.node_id, { [key]: ref });
                  });
                } else {
                  devError(
                    `WorkflowRunner: Asset id is null or undefined for key: ${key}`
                  );
                }
              }
            });
          }
        }

        if (update.properties) {
          const nodeData = findNode(data.node_id)?.data;
          if (nodeData) {
            updateNode(data.node_id, {
              ...nodeData,
              properties: { ...nodeData.properties, ...update.properties }
            });
          }
        }
      }
    } catch (error) {
      devError("WorkflowRunner WS error:", error);
    }
  },

  /**
   * Run the current workflow.
   *
   * @returns The results of the workflow.
   */
  run: async (params?: any) => {
    const edges = useNodeStore.getState().edges;
    const nodes = useNodeStore.getState().nodes;
    const workflow = useNodeStore.getState().workflow;
    const getUser = useAuth.getState().getUser;
    const clearStatuses = useStatusStore.getState().clearStatuses;
    const clearLogs = useLogsStore.getState().clearLogs;
    const clearErrors = useErrorStore.getState().clearErrors;
    const containsComfyNode = nodes.some((node) => node.type?.match(/^comfy/i));
    const connectUrl = containsComfyNode ? COMFY_WORKER_URL : WORKER_URL;
    
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
    
    socket.send(JSON.stringify({
      command: "run_job",
      data: req
    }));

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
    if (!socket || !job_id) {
      return;
    }

    socket.send(JSON.stringify({
      command: "cancel_job",
      data: { job_id }
    }));
  },
}));

export default useWorkflowRunnner;
