/**
 * Workflow runner WebSocket bridge.
 *
 * Expects the backend runner protocol to accept `run_job` and `reconnect_job`
 * commands via `globalWebSocketManager`, keyed by workflow_id. The
 * server streams JobUpdate/Prediction/NodeProgress/NodeUpdate/TaskUpdate and
 * PlanningUpdate messages in order, and acknowledges a reconnect by replaying
 * in-flight updates for the given job_id.
 *
 * State machine: idle → connecting → connected → running → (cancelled|error).
 * Subscription setup is handled by WorkflowManagerContext when workflows are loaded.
 */
import { create, StoreApi, UseBoundStore } from "zustand";
import { isLocalhost } from "../lib/env";
import { NodeData } from "./NodeData";
import { BASE_URL } from "./BASE_URL";
import useResultsStore from "./ResultsStore";
import { Edge, Node } from "@xyflow/react";
import {
  RunJobRequest,
  WorkflowAttributes
} from "./ApiTypes";
import { uuidv4 } from "./uuidv4";
import { useNotificationStore, Notification } from "./NotificationStore";
import useStatusStore from "./StatusStore";
import useErrorStore from "./ErrorStore";
import useMetadataStore from "./MetadataStore";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { supabase } from "../lib/supabaseClient";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { createRunnerMessageHandler } from "../core/workflow/runnerProtocol";
import { getNodeStore, MsgpackData } from "./workflowUpdates";
import { queryClient } from "../queryClient";

export type MessageHandler = (
  workflow: WorkflowAttributes,
  data: MsgpackData
) => void;

/**
 * Build the `run_job` payload from the current graph. Shared by the active run
 * and queued submissions (clicking Run while busy). Filters out bypassed nodes
 * and their edges.
 */
/**
 * Title for a run: the node's name for a single-node run, otherwise the
 * workflow name. Stored on the job and shown in the queue.
 */
export const deriveJobTitle = (
  workflow: WorkflowAttributes,
  nodes: Node<NodeData>[],
  subgraphNodeIds?: Set<string>
): string => {
  if (subgraphNodeIds && subgraphNodeIds.size > 0) {
    const selected = nodes.filter((n) => subgraphNodeIds.has(n.id));
    if (selected.length === 1) {
      const node = selected[0];
      // Same precedence as NodeHeader: the node's custom title, else the node
      // type's metadata title.
      const custom =
        typeof node.data?.title === "string" ? node.data.title.trim() : "";
      const metadataTitle = node.type
        ? useMetadataStore.getState().getMetadata(node.type)?.title
        : undefined;
      const title = custom || metadataTitle || node.type?.split(".").pop();
      if (title) {
        return title;
      }
    }
  }
  return workflow.name || "Workflow";
};

const buildRunJobData = (opts: {
  jobId: string;
  jobName: string;
  params: Record<string, unknown>;
  workflow: WorkflowAttributes;
  nodes: Node<NodeData>[];
  edges: Edge[];
  resource_limits?: Record<string, unknown>;
  authToken: string;
  userId: string;
}): RunJobRequest & { settings?: Record<string, unknown>; job_id: string } => {
  const activeNodes: Node<NodeData>[] = [];
  const bypassedNodeIds = new Set<string>();
  for (const node of opts.nodes) {
    if (node.data.bypassed) {
      bypassedNodeIds.add(node.id);
    } else {
      activeNodes.push(node);
    }
  }
  const activeEdges = opts.edges.filter(
    (edge) =>
      !bypassedNodeIds.has(edge.source) && !bypassedNodeIds.has(edge.target)
  );
  return {
    type: "run_job_request",
    api_url: BASE_URL,
    user_id: opts.userId,
    workflow_id: opts.workflow.id,
    job_name: opts.jobName,
    auth_token: opts.authToken,
    job_type: "workflow",
    execution_strategy: opts.resource_limits ? "subprocess" : "threaded",
    params: opts.params || {},
    explicit_types: false,
    graph: {
      nodes: activeNodes.map(reactFlowNodeToGraphNode),
      edges: activeEdges.map(reactFlowEdgeToGraphEdge)
    },
    resource_limits: opts.resource_limits,
    settings: { ...(opts.workflow.settings ?? {}) },
    job_id: opts.jobId
  };
};

export type WorkflowRunner = {
  workflow: WorkflowAttributes | null;
  nodes: Node<NodeData>[];
  edges: Edge[];
  job_id: string | null;
  /**
   * 1-based position in the backend's run queue while a run waits for a
   * concurrency slot, or null when not queued. Queued runs reuse the "running"
   * state (so existing busy/disabled logic applies); this field lets the UI
   * show "Queued — N ahead" instead of a misleading "Running".
   */
  queuePosition: number | null;
  unsubscribe: (() => void) | null;
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "running"
    | "paused"
    | "suspended"
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
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  run: (
    params: Record<string, unknown>,
    workflow: WorkflowAttributes,
    nodes: Node<NodeData>[],
    edges: Edge[],
    resource_limits?: Record<string, unknown>,
    subgraphNodeIds?: Set<string>
  ) => Promise<void>;
  reconnect: (jobId: string) => Promise<void>;
  reconnectWithWorkflow: (
    jobId: string,
    workflow: WorkflowAttributes
  ) => Promise<void>;
  ensureConnection: () => Promise<void>;
  cleanup: () => void;
  // Streaming inputs
  streamInput: (inputName: string, value: unknown, handle?: string) => void;
  endInputStream: (inputName: string, handle?: string) => void;
};

export type { MsgpackData };

export type WorkflowRunnerStore = UseBoundStore<StoreApi<WorkflowRunner>>;

export const createWorkflowRunnerStore = (
  workflowId: string
): WorkflowRunnerStore => {
  const store = create<WorkflowRunner>((set, get) => ({
    workflow: null,
    nodes: [],
    edges: [],
    job_id: null,
    queuePosition: null,
    unsubscribe: null,
    state: "idle",
    statusMessage: null,
    messageHandler: (_workflow: WorkflowAttributes, _data: MsgpackData) => {
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
      }
      // Reset job/runtime state so a reused store can't surface a previous
      // workflow's job_id or status, and late WS messages routed by job_id
      // won't apply to a resurrected store.
      set({
        unsubscribe: null,
        state: "idle",
        job_id: null,
        queuePosition: null,
        statusMessage: null,
        notifications: [],
        workflow: null,
        nodes: [],
        edges: []
      });
    },

    /**
     * Reconnect to an existing job by job_id.
     */
    reconnect: async (jobId: string) => {
      console.info(`WorkflowRunner[${workflowId}]: Reconnecting to job`, {
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
    },

    /**
     * Reconnect to an existing job with workflow context.
     */
    reconnectWithWorkflow: async (
      jobId: string,
      workflow: WorkflowAttributes
    ) => {
      console.info(`WorkflowRunner[${workflowId}]: Reconnecting with workflow`, {
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
    },

    // Push a streaming item to a streaming InputNode by name
    streamInput: async (inputName: string, value: unknown, handle?: string) => {
      const { job_id } = get();
      if (!job_id) {
        console.warn("streamInput called without an active job");
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
        console.warn("endInputStream called without an active job");
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
     * If subgraphNodeIds is provided, only clears results/previews/outputs for those specific nodes,
     * preserving state for nodes outside the subgraph.
     */
    run: async (
      params: Record<string, unknown>,
      workflow: WorkflowAttributes,
      nodes: Node<NodeData>[],
      edges: Edge[],
      resource_limits?: Record<string, unknown>,
      subgraphNodeIds?: Set<string>
    ) => {
      const currentState = get().state;
      const currentJobId = get().job_id;
      const wsConnected = globalWebSocketManager.isConnectionOpen();
      const busy =
        currentState === "connecting" ||
        currentState === "running" ||
        currentState === "paused" ||
        currentState === "suspended";
      // A stuck "running" state with no active job_id or no live WS means we
      // never received a terminal job_update (e.g. WS dropped, worker crashed).
      // Reset so the user can retry instead of getting permanently blocked.
      // "connecting" is mid-handshake, not stuck — only treat the
      // post-handshake states as stuck candidates.
      const stuck =
        busy &&
        currentState !== "connecting" &&
        (!currentJobId || !wsConnected);

      // Resolve auth once; both the active run and a queued submission need it.
      let auth_token = "local_token";
      let user = "1";
      if (!isLocalhost) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        auth_token = session?.access_token || "";
        user = session?.user?.id || "";
      }

      const jobId = uuidv4();
      const req = buildRunJobData({
        jobId,
        jobName: deriveJobTitle(workflow, nodes, subgraphNodeIds),
        params,
        workflow,
        nodes,
        edges,
        resource_limits,
        authToken: auth_token,
        userId: user
      });

      if (busy && !stuck) {
        // A run is already in progress for this workflow. Submit this one to
        // the backend, which persists it as a "queued" job and starts it when
        // the current run finishes (one run per workflow). Leave the active
        // run's display state untouched; the queued job shows in the Queue
        // panel via jobs.list.
        console.info(`WorkflowRunner[${workflowId}]: Submitting queued run`, {
          jobId
        });
        try {
          await globalWebSocketManager.send({
            type: "run_job",
            command: "run_job",
            data: req
          });
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
        } catch (error) {
          console.error(
            `WorkflowRunner[${workflowId}]: Failed to submit queued run`,
            error
          );
        }
        return;
      }
      if (stuck) {
        console.warn(
          `WorkflowRunner[${workflowId}]: Recovering from stuck state`,
          { currentState, currentJobId, wsConnected }
        );
        set({ state: "idle", job_id: null });
      }

      console.info(`WorkflowRunner[${workflowId}]: Starting workflow run`);

      await get().ensureConnection();

      set({ workflow, nodes, edges, job_id: jobId, queuePosition: null });

      const clearStatuses = useStatusStore.getState().clearStatuses;
      const clearErrors = useErrorStore.getState().clearErrors;
      const clearEdges = useResultsStore.getState().clearEdges;
      const clearResults = useResultsStore.getState().clearResults;
      const clearProgress = useResultsStore.getState().clearProgress;
      const clearToolCalls = useResultsStore.getState().clearToolCalls;
      const clearTasks = useResultsStore.getState().clearTasks;
      const clearChunks = useResultsStore.getState().clearChunks;
      const clearPlanningUpdates =
        useResultsStore.getState().clearPlanningUpdates;
      const clearOutputResults = useResultsStore.getState().clearOutputResults;

      set({
        statusMessage: "Workflow starting..."
      });

      // When running a subgraph, only clear state for the subgraph nodes.
      // Derive edge IDs from edges that belong to the subgraph.
      const subgraphEdgeIds = subgraphNodeIds
        ? new Set(edges.map((e) => e.id))
        : undefined;

      clearStatuses(workflow.id, subgraphNodeIds);
      clearEdges(workflow.id, subgraphEdgeIds);
      clearErrors(workflow.id, subgraphNodeIds);
      clearResults(workflow.id, subgraphNodeIds);
      clearOutputResults(workflow.id, subgraphNodeIds);
      clearProgress(workflow.id, subgraphNodeIds);
      clearToolCalls(workflow.id, subgraphNodeIds);
      clearTasks(workflow.id, subgraphNodeIds);
      clearPlanningUpdates(workflow.id, subgraphNodeIds);
      clearChunks(workflow.id, subgraphNodeIds);

      set({
        state: "running",
        notifications: []
      });

      console.info(`WorkflowRunner[${workflowId}]: Sending run_job command`, req);

      try {
        await globalWebSocketManager.send({
          type: "run_job",
          command: "run_job",
          data: req
        });
      } catch (error) {
        // Rollback so the store doesn't get stuck in "running" with a phantom
        // job_id that cancel() would later try to address.
        set({
          state: "error",
          job_id: null,
          statusMessage:
            error instanceof Error ? error.message : "Failed to start job"
        });
        throw error;
      }
    },

    /**
     * Add a notification to the notification store
     */
    addNotification: (notification: Omit<Notification, "id" | "timestamp">) => {
      useNotificationStore.getState().addNotification(notification);
      const nextNotifications = [
        ...get().notifications,
        { ...notification, id: uuidv4(), timestamp: new Date() }
      ];
      set({
        notifications:
          nextNotifications.length > 50
            ? nextNotifications.slice(-50)
            : nextNotifications
      });
    },

    /**
     * Cancel the current workflow run.
     */
    cancel: async () => {
      const { job_id, workflow, state } = get();
      console.info(`WorkflowRunner[${workflowId}]: Cancelling job`, { job_id });

      if (state === "cancelled" || state === "idle" || state === "error") {
        return;
      }

      // Immediately stop all animations and clear state.
      set({ state: "cancelled", queuePosition: null });

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
    },

    /**
     * Pause the current workflow run.
     */
    pause: async () => {
      const { job_id, state } = get();
      console.info(`WorkflowRunner[${workflowId}]: Pausing job`, { job_id });

      if (state !== "running") {
        console.warn(`WorkflowRunner[${workflowId}]: Cannot pause - not running`);
        return;
      }

      if (!job_id) {
        console.warn(`WorkflowRunner[${workflowId}]: Cannot pause - no job_id`);
        return;
      }

      // Send pause command to backend
      await globalWebSocketManager.send({
        type: "pause_job",
        command: "pause_job",
        data: {
          job_id,
          workflow_id: workflowId
        }
      });

      set({ state: "paused", statusMessage: "Workflow paused" });
    },

    /**
     * Resume a paused workflow run.
     */
    resume: async () => {
      const { job_id, state } = get();
      console.info(`WorkflowRunner[${workflowId}]: Resuming job`, { job_id });

      if (state !== "paused" && state !== "suspended") {
        console.warn(
          `WorkflowRunner[${workflowId}]: Cannot resume - not paused or suspended (state: ${state})`
        );
        return;
      }

      if (!job_id) {
        console.warn(`WorkflowRunner[${workflowId}]: Cannot resume - no job_id`);
        return;
      }

      // Send resume command to backend
      await globalWebSocketManager.send({
        type: "resume_job",
        command: "resume_job",
        data: {
          job_id,
          workflow_id: workflowId
        }
      });

      set({ state: "running", statusMessage: "Workflow resumed" });
    }
  }));

  store.setState({
    messageHandler: createRunnerMessageHandler(store, getNodeStore)
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

/**
 * Dispose the runner store for a workflow. Call when a workflow is closed/
 * deleted so we don't leak per-workflow state forever.
 */
export const disposeWorkflowRunnerStore = (workflowId: string): void => {
  const store = runnerStores.get(workflowId);
  if (store) {
    try {
      store.getState().cleanup();
    } catch (error) {
      console.warn(
        `[WorkflowRunner] cleanup failed for ${workflowId}`,
        error
      );
    }
    runnerStores.delete(workflowId);
  }
};

const defaultWorkflowRunner: WorkflowRunner = {
  workflow: null,
  nodes: [],
  edges: [],
  job_id: null,
  queuePosition: null,
  unsubscribe: null,
  state: "idle",
  statusMessage: null,
  setStatusMessage: () => {},
  notifications: [],
  messageHandler: () => {},
  setMessageHandler: () => {},
  addNotification: () => {},
  cancel: async () => {},
  pause: async () => {},
  resume: async () => {},
  run: async () => {},
  reconnect: async () => {},
  reconnectWithWorkflow: async () => {},
  ensureConnection: async () => {},
  cleanup: () => {},
  streamInput: () => {},
  endInputStream: () => {}
};

export function useWebsocketRunner<T>(
  selector: (state: WorkflowRunner) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  // Always create/get a store to maintain hook order
  // Use a placeholder ID when no workflow is selected
  const store = getWorkflowRunnerStore(currentWorkflowId || "__no_workflow__");

  // Use the selector with the store, but return default values if no workflow
  const selectedValue = useStoreWithEqualityFn(
    store,
    selector,
    equalityFn ?? shallow
  );

  // Return default values when there's no current workflow to prevent errors
  // while maintaining proper hook call order
  if (!currentWorkflowId) {
    return selector(defaultWorkflowRunner);
  }

  return selectedValue;
}

export default useWebsocketRunner;
