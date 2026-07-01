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
import { isAuthRequired } from "../lib/runtimeConfig";
import { NodeData } from "./NodeData";
import { BASE_URL } from "./BASE_URL";
import { Edge, Node } from "@xyflow/react";
import {
  RunJobRequest,
  WorkflowAttributes,
  WorkflowGraph
} from "./ApiTypes";
import {
  reportBrowserEligibility,
  runBrowserGraphJob,
  updateBrowserJobNodeProperties
} from "../lib/workflow/browserWorkflowRunner";
import { useNotificationStore, Notification } from "./NotificationStore";
import useOnboardingStore from "./OnboardingStore";
import useMetadataStore from "./MetadataStore";
import { reactFlowEdgeToGraphEdge } from "./reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "./reactFlowNodeToGraphNode";
import { supabase } from "../lib/supabaseClient";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { createRunnerMessageHandler } from "../core/workflow/runnerProtocol";
import { materializeBitmapRefs } from "../lib/workflow/materializeBrowserOutputs";
import { getNodeStore, MsgpackData } from "./workflowUpdates";
import useStatusStore from "./StatusStore";
import useResultsStore from "./ResultsStore";
import { queryClient } from "../queryClient";
import { recordRunSignatures } from "./runSignatures";
import { computeRunSignatures } from "../utils/computeRunSignatures";
import { getNodeGenerations } from "./nodeGenerationAccessor";

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

/** Abort handles for in-flight in-browser runs, keyed by job id. Browser
 * runs have no server-side job, so cancel() aborts these instead of sending
 * `cancel_job` over the websocket. */
const browserRunAbortControllers = new Map<string, AbortController>();

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
  concurrent?: boolean;
}): RunJobRequest & { settings?: Record<string, unknown>; job_id: string; concurrent?: boolean } => {
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
    job_id: opts.jobId,
    concurrent: opts.concurrent
  };
};

export type WorkflowRunner = {
  workflow: WorkflowAttributes | null;
  nodes: Node<NodeData>[];
  edges: Edge[];
  job_id: string | null;
  /**
   * True while the active run executes in-browser (kernel runner) rather than
   * on the server. Browser runs don't hold a WebSocket connection, so the
   * stuck-state recovery heuristic must not treat a closed socket as a sign
   * the run died.
   */
  isBrowserRun: boolean;
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
  /**
   * Push property updates into the running job's node executors (live
   * parameters — e.g. synth knobs while a patch plays). No-op when nothing
   * is running; the canvas state already holds the value for the next run.
   */
  updateRunningNodeProperties: (
    nodeId: string,
    properties: Record<string, unknown>
  ) => void;
  /**
   * Start (or queue) a run and resolve with the `job_id` of the run that was
   * initiated. Callers must use this id — when the runner is already busy the
   * run is queued under a fresh id while `runnerStore.job_id` keeps pointing at
   * the active run, so reading the store after `run()` returns the wrong job.
   * Rejects if the run could not be submitted to the backend.
   */
  run: (
    params: Record<string, unknown>,
    workflow: WorkflowAttributes,
    nodes: Node<NodeData>[],
    edges: Edge[],
    resource_limits?: Record<string, unknown>,
    subgraphNodeIds?: Set<string>,
    concurrent?: boolean,
    inputSignatures?: Record<string, string>
  ) => Promise<string>;
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
    isBrowserRun: false,
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
        isBrowserRun: false,
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
     * `subgraphNodeIds` is used to derive the job title for single-node runs;
     * it no longer clears per-node state (each run gets its own job-keyed slice).
     * Pass `concurrent: true` to let this run execute alongside other runs of
     * the same workflow instead of queueing behind them.
     */
    run: async (
      params: Record<string, unknown>,
      workflow: WorkflowAttributes,
      nodes: Node<NodeData>[],
      edges: Edge[],
      resource_limits?: Record<string, unknown>,
      subgraphNodeIds?: Set<string>,
      concurrent?: boolean,
      inputSignatures?: Record<string, string>
    ) => {
      useOnboardingStore.getState().markStep("run-workflow");
      const activeNodeTypes = nodes
        .filter((node) => !node.data?.bypassed)
        .map((node) => node.type)
        .filter((type): type is string => typeof type === "string");
      console.info(
        `WorkflowRunner[${workflowId}]: run() called — ${activeNodeTypes.length} active node(s)`,
        {
          nodeTypes: activeNodeTypes,
          resourceLimited: !!resource_limits,
          concurrent: !!concurrent
        }
      );

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
      // post-handshake states as stuck candidates. Pure in-browser runs never
      // hold a WS connection, so a closed socket is only a stuck signal for
      // server runs.
      const stuck =
        busy &&
        currentState !== "connecting" &&
        (!currentJobId || (!wsConnected && !get().isBrowserRun));

      const jobId = crypto.randomUUID();
      const queueRun = busy && !stuck;

      // Stamp registry (spec §3.4): record each active node's input signature —
      // computed against the FULL live graph — under this run's jobId so
      // handleUpdate can stamp the generations it produces. Single-node callers
      // (useRunSingleNode) pass a full-graph map explicitly because their
      // `nodes`/`edges` are a pruned subgraph; full-workflow runs receive the
      // full graph here, so compute it. handleUpdate clears the map on the job's
      // terminal update, so the full-run path records but never clears. Computed
      // synchronously, before any await, so a produced generation can always
      // find its stamp.
      recordRunSignatures(
        jobId,
        inputSignatures ??
          computeRunSignatures(
            nodes.filter((n) => !n.data?.bypassed).map((n) => n.id),
            {
              nodes,
              edges,
              workflowId: workflow.id,
              getMetadata: useMetadataStore.getState().getMetadata,
              getGenerations: getNodeGenerations
            }
          )
      );

      if (!queueRun) {
        if (stuck) {
          console.warn(
            `WorkflowRunner[${workflowId}]: Recovering from stuck state`,
            { currentState, currentJobId, wsConnected }
          );
        }

        console.info(`WorkflowRunner[${workflowId}]: Starting workflow run`);

        // Claim the run synchronously — before any `await` (auth/session
        // resolution included) — so a concurrent run() sees us as busy (and
        // queues), and the UI reflects the start immediately. Per-run state is
        // keyed by jobId, so a fresh run starts on an empty slice; don't clear
        // prior runs' node state (per-job keys mean a clear would erase a
        // concurrently running sibling of this workflow).
        set({
          workflow,
          nodes,
          edges,
          job_id: jobId,
          isBrowserRun: false,
          queuePosition: null,
          statusMessage: "Workflow starting...",
          notifications: [],
          state: "connecting"
        });
      }

      // Resolve auth after the claim; both the active run and a queued
      // submission need it. On failure, release the claim so the runner
      // doesn't stay stuck in "connecting" with a phantom job_id.
      let auth_token = "local_token";
      let user = "1";
      if (isAuthRequired()) {
        try {
          const {
            data: { session }
          } = await supabase.auth.getSession();
          auth_token = session?.access_token || "";
          user = session?.user?.id || "";
        } catch (error) {
          if (!queueRun) {
            set({
              state: "error",
              job_id: null,
              statusMessage:
                error instanceof Error
                  ? error.message
                  : "Failed to resolve auth session"
            });
          }
          throw error instanceof Error ? error : new Error(String(error));
        }
      }

      const req = buildRunJobData({
        jobId,
        jobName: deriveJobTitle(workflow, nodes, subgraphNodeIds),
        params,
        workflow,
        nodes,
        edges,
        resource_limits,
        authToken: auth_token,
        userId: user,
        concurrent
      });

      if (queueRun) {
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
            data: materializeBitmapRefs(req) as Record<string, unknown>
          });
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
        } catch (error) {
          console.error(
            `WorkflowRunner[${workflowId}]: Failed to submit queued run`,
            error
          );
          // Surface the failure: the caller must not subscribe to / track a
          // job that never reached the backend's queue.
          throw error instanceof Error ? error : new Error(String(error));
        }
        return jobId;
      }

      // Pure-browser graphs (every node declares browser-platform support) run
      // client-side with the kernel runner — no server round-trip. Their
      // ProcessingMessages flow through the same subscriber pipeline
      // (`deliverLocal`) so the canvas/results/status stores update identically
      // to a server run. Explicitly resource-limited (subprocess) runs stay on
      // the server.
      let runsInBrowser = false;
      if (resource_limits) {
        console.info(
          `WorkflowRunner[${workflowId}]: ↪ server run (resource limits requested)`
        );
      } else {
        try {
          const report = await reportBrowserEligibility(
            req.graph as unknown as WorkflowGraph
          );
          runsInBrowser = report.eligible;
          if (report.eligible) {
            console.info(
              `WorkflowRunner[${workflowId}]: ▶ in-browser run — all ${report.total} node type(s) browser-capable`,
              report.browserNodeTypes
            );
          } else if (!report.runnerAvailable) {
            console.info(
              `WorkflowRunner[${workflowId}]: ↪ server run — browser runner unavailable (not loaded / load failed)`
            );
          } else {
            console.info(
              `WorkflowRunner[${workflowId}]: ↪ server run — ${report.serverNodeTypes.length}/${report.total} node type(s) not browser-capable`,
              { serverOnly: report.serverNodeTypes, browser: report.browserNodeTypes }
            );
          }
        } catch (error) {
          runsInBrowser = false;
          console.warn(
            `WorkflowRunner[${workflowId}]: browser-eligibility check failed; using server`,
            error
          );
        }
      }

      if (runsInBrowser) {
        set({ state: "running", isBrowserRun: true });
        console.info(
          `WorkflowRunner[${workflowId}]: Running graph in-browser`,
          { jobId }
        );
        // Browser runs have no server job to cancel; cancel() aborts this
        // controller instead, which both run paths (worker + main thread)
        // honor.
        const abortController = new AbortController();
        browserRunAbortControllers.set(jobId, abortController);
        void runBrowserGraphJob({
          graph: req.graph as unknown as WorkflowGraph,
          params,
          workflowId,
          jobId,
          signal: abortController.signal
        })
          .catch((error) => {
            set({
              state: "error",
              statusMessage:
                error instanceof Error
                  ? error.message
                  : "Browser execution failed"
            });
          })
          .finally(() => {
            browserRunAbortControllers.delete(jobId);
          });
        return jobId;
      }

      await get().ensureConnection();

      set({ state: "running" });

      console.info(`WorkflowRunner[${workflowId}]: Sending run_job command`, req);

      try {
        // Preview-bitmap refs (cached browser-run outputs seeded into single-
        // node / run-from-here subgraph properties) can't cross msgpack —
        // encode them to portable data-URL refs for the server.
        await globalWebSocketManager.send({
          type: "run_job",
          command: "run_job",
          data: materializeBitmapRefs(req) as Record<string, unknown>
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

      return jobId;
    },

    /**
     * Add a notification to the notification store
     */
    addNotification: (notification: Omit<Notification, "id" | "timestamp">) => {
      useNotificationStore.getState().addNotification(notification);
      const nextNotifications = [
        ...get().notifications,
        { ...notification, id: crypto.randomUUID(), timestamp: new Date() }
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
    updateRunningNodeProperties: (nodeId, properties) => {
      const { job_id, state, isBrowserRun } = get();
      if (state !== "running" || !job_id) {
        return;
      }
      if (isBrowserRun) {
        updateBrowserJobNodeProperties(job_id, nodeId, properties);
        return;
      }
      void globalWebSocketManager.send({
        type: "update_node_properties",
        command: "update_node_properties",
        data: {
          job_id,
          workflow_id: workflowId,
          node_id: nodeId,
          properties
        }
      });
    },

    cancel: async () => {
      const { job_id, state, isBrowserRun } = get();
      console.info(`WorkflowRunner[${workflowId}]: Cancelling job`, { job_id });

      if (state === "cancelled" || state === "idle" || state === "error") {
        return;
      }

      // Mark this run cancelled. Don't clear per-node state for the whole
      // workflow: with per-job keys that would wipe a concurrently running
      // sibling. The cancelled run's own slice persists so it can be focused.
      set({ state: "cancelled", queuePosition: null });

      if (!job_id) {
        return;
      }

      // Stop this run's visuals (node "running" borders, edge animations,
      // progress) right away: once state is "cancelled" the message handler
      // drops all further node/edge updates, so the backend's own cleanup
      // messages would never land. Job-scoped — sibling runs keep theirs.
      useStatusStore.getState().clearJobStatuses(workflowId, job_id);
      useResultsStore.getState().clearJobRunVisuals(workflowId, job_id);

      // In-browser runs have no server-side job — abort the local run; the
      // kernel then emits the cancelled job_update / node statuses through
      // the same message pipeline as a server cancel.
      if (isBrowserRun) {
        browserRunAbortControllers.get(job_id)?.abort();
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
  isBrowserRun: false,
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
  updateRunningNodeProperties: () => {},
  run: async () => "",
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
