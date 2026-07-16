/**
 * Workflow runner WebSocket bridge for Mobile.
 * Ported from web/src/stores/WorkflowRunner.ts
 *
 * Handles all message types from the unified WebSocket:
 * - job_update: workflow-level state (running, completed, failed, etc.)
 * - node_update: per-node status, results, errors, property updates
 * - node_progress: per-node progress (progress/total)
 * - output_update: streaming output values
 * - log_update: structured execution logs
 * - notification: server-side notifications
 * - prediction: model loading/booting status
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
  RunJobRequest,
} from "../types/workflow";

const MAX_LOGS = 500;

export type RunnerState =
  | "idle"
  | "connecting"
  | "connected"
  | "running"
  | "paused"
  | "suspended"
  | "error"
  | "cancelled"
  | "completed";

export type WorkflowRunner = {
  workflow: Workflow | null;
  job_id: string | null;
  unsubscribe: (() => void) | null;
  jobUnsubscribe: (() => void) | null;
  state: RunnerState;

  // Accumulated data for the UI
  logs: string[];
  results: Record<string, unknown> | unknown[] | unknown | null;
  nodeProgress: Record<string, { progress: number; total: number }>;
  nodeStatus: Record<string, string>;
  nodeResults: Record<string, unknown>;
  nodeErrors: Record<string, string>;

  statusMessage: string | null;

  run: (
    params: Record<string, unknown>,
    workflow: Workflow,
  ) => Promise<void>;

  ensureConnection: () => Promise<void>;
  cleanup: () => void;
  cancel: () => Promise<void>;
  resume: () => Promise<void>;
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
    jobUnsubscribe: null,
    state: "idle",
    logs: [],
    results: null,
    nodeProgress: {},
    nodeStatus: {},
    nodeResults: {},
    nodeErrors: {},
    statusMessage: null,

    ensureConnection: async () => {
      set({ state: "connecting" });
      try {
        await webSocketService.ensureConnection("/ws");
        set({ state: "connected" });

        const currentUnsubscribe = get().unsubscribe;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }
        const currentJobUnsubscribe = get().jobUnsubscribe;
        if (currentJobUnsubscribe) {
          currentJobUnsubscribe();
          set({ jobUnsubscribe: null });
        }

        const handler = (message: Record<string, unknown>) => {
          const workflow = get().workflow;
          if (!workflow) {return;}

          // Track job_id from first message and subscribe to it too
          if (message.job_id && !get().job_id) {
            const jobId = message.job_id as string;
            const jobUnsubscribe = webSocketService.subscribe(jobId, handler);
            set({ job_id: jobId, jobUnsubscribe });
          }

          handleMessage(set, get, message);
        };

        const unsubscribe = webSocketService.subscribe(workflowId, handler);
        set({ unsubscribe });
      } catch (error) {
        console.error(
          `WorkflowRunner[${workflowId}]: Connection failed:`,
          error
        );
        set({ state: "error" });
        throw error;
      }
    },

    cleanup: () => {
      const { unsubscribe, jobUnsubscribe } = get();
      if (unsubscribe) {
        unsubscribe();
      }
      if (jobUnsubscribe) {
        jobUnsubscribe();
      }
      set({ unsubscribe: null, jobUnsubscribe: null, job_id: null });
      runnerStores.delete(workflowId);
    },

    run: async (params: Record<string, unknown>, workflow: Workflow) => {
      console.log(`WorkflowRunner[${workflowId}]: Starting workflow run`);

      await get().ensureConnection();

      set({
        workflow,
        state: "running",
        logs: [],
        results: null,
        nodeProgress: {},
        nodeStatus: {},
        nodeResults: {},
        nodeErrors: {},
        statusMessage: "Starting workflow...",
      });

      const session = useAuthStore.getState().session;
      const auth_token = session?.access_token || "local_token";
      const user_id = session?.user?.id || "1";

      // Filter out bypassed nodes like the web does
      const nodes = workflow.graph?.nodes || [];
      const edges = workflow.graph?.edges || [];
      const bypassedIds = new Set<string>();
      for (const node of nodes) {
        const data = node.data;
        if (data && typeof data === "object" && "bypassed" in data && data.bypassed) {
          bypassedIds.add(node.id);
        }
      }
      const activeNodes = bypassedIds.size > 0
        ? nodes.filter((n) => !bypassedIds.has(n.id))
        : nodes;
      const activeEdges = bypassedIds.size > 0
        ? edges.filter((e) => !bypassedIds.has(e.source) && !bypassedIds.has(e.target))
        : edges;

      const req: RunJobRequest = {
        type: "run_job_request",
        api_url: apiService.getApiHost(),
        user_id,
        workflow_id: workflow.id,
        auth_token,
        job_type: "workflow",
        execution_strategy: "threaded",
        params: params || {},
        explicit_types: false,
        graph: {
          nodes: activeNodes,
          edges: activeEdges,
        },
        resource_limits: {},
      };

      await webSocketService.send(
        {
          type: "run_job",
          command: "run_job",
          data: req,
        },
        "/ws"
      );
    },

    cancel: async () => {
      const { job_id } = get();
      if (job_id && workflowId) {
        await webSocketService.send(
          {
            type: "cancel_job",
            command: "cancel_job",
            data: {
              job_id,
              workflow_id: workflowId,
            },
          },
          "/ws"
        );
      }
      set({ state: "cancelled", statusMessage: "Cancelled" });
    },

    resume: async () => {
      const { job_id } = get();
      if (job_id && workflowId) {
        await webSocketService.send(
          {
            type: "resume_job",
            command: "resume_job",
            data: {
              job_id,
              workflow_id: workflowId,
            },
          },
          "/ws"
        );
        set({ state: "running", statusMessage: "Resuming..." });
      }
    },
  }));

  return store;
};

/**
 * Incoming workflow message — discriminated union of all message types the
 * runner handles. Covers protocol messages (JobUpdate, NodeUpdate,
 * NodeProgress) plus lightweight wire-only shapes that lack dedicated types.
 */
type WorkflowMessage =
  | (JobUpdate & Record<string, unknown>)
  | (NodeUpdate & Record<string, unknown>)
  | (NodeProgress & Record<string, unknown>)
  | { type: "output_update"; node_id: string; value?: unknown; [key: string]: unknown }
  | { type: "log_update"; message?: string; content?: string; [key: string]: unknown }
  | { type: "notification"; message?: string; content?: string; [key: string]: unknown }
  | { type: "prediction"; node_id: string; node_name?: string; [key: string]: unknown };

function isWorkflowMessage(msg: Record<string, unknown>): msg is WorkflowMessage {
  return typeof msg.type === "string";
}

/**
 * Central message handler — mirrors web's workflowUpdates.ts handleUpdate().
 */
function handleMessage(
  set: (partial: Partial<WorkflowRunner>) => void,
  get: () => WorkflowRunner,
  message: Record<string, unknown>
) {
  if (!isWorkflowMessage(message)) {return;}

  const state = get();
  const msg = message;

  switch (msg.type) {
    // ── Job-level updates ──────────────────────────────────────────
    case "job_update": {
      if (state.state === "error" && msg.status === "running") {return;}

      const errorText =
        msg.error ||
        (msg.error_message as string | undefined) ||
        "Unknown error";

      switch (msg.status) {
        case "completed":
          set({
            state: "completed",
            results: msg.result,
            statusMessage: "Completed",
          });
          break;
        case "failed":
        case "timed_out":
          set({
            state: "error",
            statusMessage: `Failed: ${errorText}`,
          });
          break;
        case "cancelled":
          set({ state: "cancelled", statusMessage: "Cancelled" });
          break;
        case "running":
          set({
            state: "running",
            statusMessage: msg.message || "Running...",
          });
          break;
        case "queued":
          set({
            state: "running",
            statusMessage: "Queued — worker is booting...",
          });
          break;
        case "suspended": {
          const reason =
            (msg.suspension_reason as string | undefined) ||
            "Waiting for input";
          set({
            state: "suspended",
            statusMessage: `Suspended: ${reason}`,
          });
          break;
        }
        case "paused":
          set({ state: "paused", statusMessage: "Paused" });
          break;
      }
      break;
    }

    // ── Node progress (progress/total) ─────────────────────────────
    case "node_progress": {
      set({
        nodeProgress: {
          ...state.nodeProgress,
          [msg.node_id]: {
            progress: msg.progress,
            total: msg.total,
          },
        },
      });
      break;
    }

    // ── Node status, results, errors ───────────────────────────────
    case "node_update": {
      if (state.state === "cancelled") {return;}

      const updates: Partial<WorkflowRunner> = {
        nodeStatus: {
          ...state.nodeStatus,
          [msg.node_id]: msg.status,
        },
        statusMessage: `${msg.node_name || msg.node_id} ${msg.status}`,
      };

      if (msg.result) {
        updates.nodeResults = {
          ...state.nodeResults,
          [msg.node_id]: msg.result,
        };
      }

      if (msg.error) {
        updates.nodeErrors = {
          ...state.nodeErrors,
          [msg.node_id]: msg.error,
        };
        updates.state = "error";
        updates.logs = appendLog(
          state.logs,
          `Error [${msg.node_name || msg.node_id}]: ${msg.error}`
        );
      } else {
        updates.logs = appendLog(
          state.logs,
          `${msg.node_name || msg.node_id}: ${msg.status}`
        );
      }

      set(updates);
      break;
    }

    // ── Streaming output values ────────────────────────────────────
    case "output_update": {
      if (msg.node_id && msg.value !== undefined) {
        set({
          nodeResults: {
            ...state.nodeResults,
            [msg.node_id]: msg.value,
          },
        });
      }
      break;
    }

    // ── Structured log entries ─────────────────────────────────────
    case "log_update": {
      const content = msg.message || msg.content;
      if (content) {
        set({ logs: appendLog(state.logs, content) });
      }
      break;
    }

    // ── Notifications ──────────────────────────────────────────────
    case "notification": {
      const content = msg.content || msg.message;
      if (content) {
        set({
          logs: appendLog(state.logs, `[notification] ${content}`),
        });
      }
      break;
    }

    // ── Model booting / prediction status ──────────────────────────
    case "prediction": {
      if (msg.node_id) {
        set({
          nodeStatus: {
            ...state.nodeStatus,
            [msg.node_id]: "booting",
          },
          statusMessage: `${msg.node_name || msg.node_id} booting...`,
        });
      }
      break;
    }

    // ── Generic message with text ──────────────────────────────────
    default: {
      const generic = msg as { type: string; message?: string };
      if (generic.message && typeof generic.message === "string") {
        set({ logs: appendLog(state.logs, `[${generic.type}] ${generic.message}`) });
      }
      break;
    }
  }
}

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
