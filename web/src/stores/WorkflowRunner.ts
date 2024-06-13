import { create } from "zustand";
import { NodeData } from "./NodeData";
import { WORKER_URL } from "./ApiClient";
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
  WorkflowUpdate,
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
  cancel: () => void;
  run: (params?: any, noCache?: boolean) => Promise<void>;
};

async function* lineIterator(reader: ReadableStreamDefaultReader) {
  const utf8Decoder = new TextDecoder("utf-8");
  let { value: chunk, done: readerDone } = await reader.read();
  chunk = chunk ? utf8Decoder.decode(chunk, { stream: true }) : "";

  const re = /\r\n|\n|\r/gm;
  let startIndex = 0;

  for (;;) {
    const result = re.exec(chunk);
    if (!result) {
      if (readerDone) {
        break;
      }
      const remainder = chunk.substr(startIndex);
      ({ value: chunk, done: readerDone } = await reader.read());
      chunk =
        remainder + (chunk ? utf8Decoder.decode(chunk, { stream: true }) : "");
      startIndex = re.lastIndex = 0;
      continue;
    }
    yield chunk.substring(startIndex, result.index);
    startIndex = re.lastIndex;
  }
  if (startIndex < chunk.length) {
    // last line didn't end in a newline char
    yield chunk.substr(startIndex);
  }
}

const useWorkflowRunnner = create<WorkflowRunner>((set, get) => ({
  state: "idle",
  statusMessage: null,
  setStatusMessage: (message: string | null) => {
    set({ statusMessage: message });
  },
  notifications: [],
  readMessage: (
    workflow: WorkflowAttributes,
    data: JobUpdate | Prediction | NodeProgress | NodeUpdate | WorkflowUpdate
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
      devLog("WofkflowRunner data:", data);

      if (data.type === "workflow_update") {
        set({ state: "idle" });
        addNotification({
          type: "info",
          alert: true,
          content: "Workflow finished"
        });
      }

      if (data.type === "job_update") {
        const job = data as JobUpdate;
        switch (job.status) {
          case "running":
            set({ state: "running" });
            break;
          case "failed":
            set({ state: "error" });
            addNotification({
              type: "error",
              alert: true,
              content: job.error || "",
              timeout: 30000
            });
            break;
        }
      }

      if (data.type === "prediction") {
        const pred = data as Prediction;
        setLogs(workflow.id, pred.node_id, pred.logs || "");
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
          devError("error", update.error);
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
              if (typeof ref === "object" && "asset_id" in ref) {
                const asset_id = ref.asset_id;
                if (asset_id) {
                  getAsset(asset_id).then((res) => {
                    if (res?.get_url) {
                      ref.uri = res.get_url;
                    }
                    setResult(workflow.id, data.node_id, { [key]: ref });
                  });
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
      console.error("WorkflowRunner WS error:", error);
    }
  },

  /**
   * Run the current workflow.
   *
   * @returns The results of the workflow.
   */
  run: async (params?: any, noCache?: boolean) => {
    const edges = useNodeStore.getState().edges;
    const nodes = useNodeStore.getState().nodes;
    const workflow = useNodeStore.getState().workflow;
    const readFromStorage = useAuth.getState().readFromStorage;
    const readMessage = get().readMessage;
    const getInputEdges = useNodeStore.getState().getInputEdges;
    const getResult = useResultsStore.getState().getResult;
    const setStatus = useStatusStore.getState().setStatus;
    const clearStatuses = useStatusStore.getState().clearStatuses;
    const clearLogs = useLogsStore.getState().clearLogs;
    const clearErrors = useErrorStore.getState().clearErrors;

    // make a deep copy of nodes
    const nodesCopy = JSON.parse(JSON.stringify(nodes)) as Node<NodeData>[];
    const user = readFromStorage();

    // ****** caching is still buggy ******
    noCache = true;

    if (user === null) {
      throw new Error("User is not logged in");
    }

    // filter nodes to dirty nodes
    const dirtyNodes = noCache
      ? nodesCopy
      : nodesCopy.filter(
          (node) => node.data.dirty || node.type?.startsWith("comfy.")
        );

    // update properties from results of connected nodes
    dirtyNodes.forEach((node) => {
      // assign edge values to node properties
      getInputEdges(node.id).forEach((edge) => {
        if (!edge.sourceHandle || !edge.targetHandle) {
          return;
        }
        const res = getResult(workflow.id, edge.source);
        if (res) {
          node.data.properties[edge.targetHandle] = res[edge.sourceHandle];
        }
      });
    });

    // remove edges that do not connect dirty nodes
    const dirtyEdges = noCache
      ? edges
      : edges.filter((edge) => {
          return (
            dirtyNodes.some((node) => node.id === edge.source) &&
            dirtyNodes.some((node) => node.id === edge.target)
          );
        });

    clearStatuses(workflow.id);
    clearLogs(workflow.id);
    clearErrors(workflow.id);

    set({
      state: "running",
      notifications: []
    });

    const req: RunJobRequest = {
      type: "run_job_request",
      workflow_id: workflow.id,
      auth_token: user.auth_token || "",
      job_type: "workflow",
      params: params || {},
      graph: {
        nodes: dirtyNodes.map(reactFlowNodeToGraphNode),
        edges: dirtyEdges.map(reactFlowEdgeToGraphEdge)
      }
    };

    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + user.auth_token
      },
      body: JSON.stringify(req)
    });

    if (!response.ok) {
      const message = `An error has occured: ${response.status}`;
      throw new Error(message);
    }

    if (response.body === null) {
      throw new Error("response body is null");
    }

    async function pump(reader: ReadableStreamDefaultReader): Promise<void> {
      for await (const line of lineIterator(reader)) {
        try {
          readMessage(workflow, JSON.parse(line));
        } catch (error) {
          console.log(line);
          console.error("error parsing json", error);
        }
      }

      console.log("Stream complete");
      clearStatuses(workflow.id);
    }

    await pump(response.body.getReader());
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
  cancel: () => {
    set({ state: "cancelled" });
  }
}));

export default useWorkflowRunnner;
