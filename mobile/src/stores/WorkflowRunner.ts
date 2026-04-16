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
  state: RunnerState;

  // Accumulated data for the UI
  logs: string[];
  results: Record<string, unknown> | unknown[] | unknown | null;
  nodeProgress: Record<string, { progress: number; total: number }>;
  nodeStatus: Record<string, string>;
  nodeResults: Record<string, unknown>;
  nodeErrors: Record<string, string>;

  statusMessage: string | null;
  setStatusMessage: (message: string | null) => void;

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
    state: "idle",
    logs: [],
    results: null,
    nodeProgress: {},
    nodeStatus: {},
    nodeResults: {},
    nodeErrors: {},
    statusMessage: null,

    setStatusMessage: (message: string | null) => {
      set({ statusMessage: message });
    },

    ensureConnection: async () => {
      set({ state: "connecting" });
      try {
        await webSocketService.ensureConnection("/ws");
        set({ state: "connected" });

        const currentUnsubscribe = get().unsubscribe;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }

        const handler = (message: Record<string, unknown>) => {
          const workflow = get().workflow;
          if (!workflow) return;

          // Track job_id from first message and subscribe to it too
          if (message.job_id && !get().job_id) {
            const jobId = message.job_id as string;
            set({ job_id: jobId });
            // Also subscribe by job_id so we catch messages routed only by job_id
            webSocketService.subscribe(jobId, handler);
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
      const { unsubscribe, job_id } = get();
      if (unsubscribe) {
        unsubscribe();
        set({ unsubscribe: null });
      }
      // Also unsubscribe from job_id if we had one
      if (job_id) {
        // The job_id subscription is cleaned up via the handler reference
        // but we clear it from state
        set({ job_id: null });
      }
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
        const nodeAny = node as unknown as Record<string, unknown>;
        if (nodeAny.data && (nodeAny.data as Record<string, unknown>).bypassed) {
          bypassedIds.add(nodeAny.id as string);
        }
      }
      const activeNodes = bypassedIds.size > 0
        ? nodes.filter((n) => !bypassedIds.has((n as unknown as Record<string, unknown>).id as string))
        : nodes;
      const activeEdges = bypassedIds.size > 0
        ? edges.filter((e) => {
            const ea = e as unknown as Record<string, unknown>;
            return !bypassedIds.has(ea.source as string) && !bypassedIds.has(ea.target as string);
          })
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
 * Central message handler — mirrors web's workflowUpdates.ts handleUpdate().
 */
function handleMessage(
  set: (partial: Partial<WorkflowRunner>) => void,
  get: () => WorkflowRunner,
  message: Record<string, unknown>
) {
  const state = get();
  const type = message.type as string;

  switch (type) {
    // ── Job-level updates ──────────────────────────────────────────
    case "job_update": {
      const job = message as unknown as JobUpdate;
      // Don't overwrite error state with stale "running"
      if (state.state === "error" && job.status === "running") return;

      switch (job.status) {
        case "completed":
          set({
            state: "completed",
            results: job.result,
            statusMessage: "Completed",
          });
          break;
        case "failed":
        case "timed_out":
          set({
            state: "error",
            statusMessage: `Failed: ${(message as Record<string, unknown>).error_message || job.error || "Unknown error"}`,
          });
          break;
        case "cancelled":
          set({ state: "cancelled", statusMessage: "Cancelled" });
          break;
        case "running":
          set({
            state: "running",
            statusMessage: (message as Record<string, unknown>).message as string || "Running...",
          });
          break;
        case "queued":
          set({
            state: "running",
            statusMessage: "Queued — worker is booting...",
          });
          break;
        case "suspended":
          set({
            state: "suspended",
            statusMessage: `Suspended: ${(message as Record<string, unknown>).suspension_reason || "Waiting for input"}`,
          });
          break;
        case "paused":
          set({ state: "paused", statusMessage: "Paused" });
          break;
      }
      break;
    }

    // ── Node progress (progress/total) ─────────────────────────────
    case "node_progress": {
      const progress = message as unknown as NodeProgress;
      set({
        nodeProgress: {
          ...state.nodeProgress,
          [progress.node_id]: {
            progress: progress.progress,
            total: progress.total,
          },
        },
      });
      break;
    }

    // ── Node status, results, errors ───────────────────────────────
    case "node_update": {
      const update = message as unknown as NodeUpdate;
      // Don't process updates after cancellation
      if (state.state === "cancelled") return;

      const updates: Partial<WorkflowRunner> = {
        nodeStatus: {
          ...state.nodeStatus,
          [update.node_id]: update.status,
        },
        statusMessage: `${update.node_name || update.node_id} ${update.status}`,
      };

      // Store per-node result
      if (update.result) {
        updates.nodeResults = {
          ...state.nodeResults,
          [update.node_id]: update.result,
        };
      }

      // Store per-node error
      if (update.error) {
        updates.nodeErrors = {
          ...state.nodeErrors,
          [update.node_id]: update.error,
        };
        updates.state = "error";
        updates.logs = appendLog(
          state.logs,
          `Error [${update.node_name || update.node_id}]: ${update.error}`
        );
      } else {
        updates.logs = appendLog(
          state.logs,
          `${update.node_name || update.node_id}: ${update.status}`
        );
      }

      set(updates);
      break;
    }

    // ── Streaming output values ────────────────────────────────────
    case "output_update": {
      const nodeId = message.node_id as string;
      const value = message.value;
      if (nodeId && value !== undefined) {
        set({
          nodeResults: {
            ...state.nodeResults,
            [nodeId]: value,
          },
        });
      }
      break;
    }

    // ── Structured log entries ─────────────────────────────────────
    case "log_update": {
      const content = message.message as string || message.content as string;
      if (content) {
        set({ logs: appendLog(state.logs, content) });
      }
      break;
    }

    // ── Notifications ──────────────────────────────────────────────
    case "notification": {
      const content = message.content as string || message.message as string;
      if (content) {
        set({
          logs: appendLog(state.logs, `[notification] ${content}`),
        });
      }
      break;
    }

    // ── Model booting / prediction status ──────────────────────────
    case "prediction": {
      const nodeId = message.node_id as string;
      if (nodeId) {
        set({
          nodeStatus: {
            ...state.nodeStatus,
            [nodeId]: "booting",
          },
          statusMessage: `${message.node_name || nodeId} booting...`,
        });
      }
      break;
    }

    // ── Generic message with text ──────────────────────────────────
    default: {
      if (message.message && typeof message.message === "string") {
        set({ logs: appendLog(state.logs, `[${type}] ${message.message}`) });
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
