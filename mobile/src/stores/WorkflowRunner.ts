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
import { notifyRunFinished } from "../services/notifications";
import { useAuthStore } from "./AuthStore";
import {
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  Workflow,
  RunJobRequest
} from "../types/workflow";
import { isRecord, isString } from "../utils/typePredicates";

const MAX_LOGS = 500;

export type RunnerState =
  | "idle"
  | "connecting"
  | "connected"
  | "running"
  | "error"
  | "cancelled"
  | "completed";

/** Extra, rarely-set run options. An object so the arity stops growing. */
export type RunOptions = {
  /**
   * Client-minted job id. The server honours it (`req.job_id ?? randomUUID()`),
   * which is what lets a caller match a run's messages to the run it started
   * instead of guessing from arrival order.
   */
  jobId?: string;
  /**
   * The mini app this run belongs to. Drives the server-side budget check, the
   * spend cap, and the release ledger; a run that omits it is not metered.
   * `version` is the released version, absent for a draft run.
   */
  application?: { id: string; version?: number | null };
  /**
   * The app operation this run executes. Recorded on the ledger row so
   * per-operation spend reports reflect which operation actually ran.
   */
  operationId?: string;
};

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
    options?: RunOptions
  ) => Promise<void>;

  ensureConnection: () => Promise<void>;
  cleanup: () => void;
  /**
   * Cancel a run. Defaults to the runner's current job; an app that keeps
   * several invocations of one workflow in flight passes the job it means.
   */
  cancel: (jobId?: string) => Promise<void>;
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
          if (!workflow) {
            return;
          }

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

    run: async (
      params: Record<string, unknown>,
      workflow: Workflow,
      options?: RunOptions
    ) => {
      console.log(`WorkflowRunner[${workflowId}]: Starting workflow run`);

      await get().ensureConnection();

      set({
        workflow,
        // A caller that minted the job id owns the run identity; without one
        // the store adopts the id of the first message that arrives.
        job_id: options?.jobId ?? null,
        state: "running",
        logs: [],
        results: null,
        nodeProgress: {},
        nodeStatus: {},
        nodeResults: {},
        nodeErrors: {},
        statusMessage: "Starting workflow..."
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
        if (
          isRecord(data) &&
          "bypassed" in data &&
          data.bypassed
        ) {
          bypassedIds.add(node.id);
        }
      }
      const activeNodes =
        bypassedIds.size > 0
          ? nodes.filter((n) => !bypassedIds.has(n.id))
          : nodes;
      const activeEdges =
        bypassedIds.size > 0
          ? edges.filter(
              (e) => !bypassedIds.has(e.source) && !bypassedIds.has(e.target)
            )
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
          edges: activeEdges
        },
        resource_limits: {},
        // Present only for app runs: the server gates them on the app's budget
        // and files them in the release ledger.
        application_id: options?.application?.id ?? null,
        application_version: options?.application?.version ?? null,
        operation_id: options?.operationId ?? null
      };
      if (options?.jobId) {
        req.job_id = options.jobId;
      }

      await webSocketService.send(
        {
          type: "run_job",
          command: "run_job",
          data: req
        },
        "/ws"
      );
    },

    cancel: async (jobId?: string) => {
      const target = jobId ?? get().job_id;
      if (target && workflowId) {
        await webSocketService.send(
          {
            type: "cancel_job",
            command: "cancel_job",
            data: {
              job_id: target,
              workflow_id: workflowId
            }
          },
          "/ws"
        );
      }
      // Only the run the store is tracking changes its state; cancelling one of
      // several app invocations must not report the whole runner as cancelled.
      if (!jobId || jobId === get().job_id) {
        set({ state: "cancelled", statusMessage: "Cancelled" });
      }
    }
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
  | {
      type: "output_update";
      node_id: string;
      value?: unknown;
      [key: string]: unknown;
    }
  | {
      type: "log_update";
      message?: string;
      content?: string;
      [key: string]: unknown;
    }
  | {
      type: "notification";
      message?: string;
      content?: string;
      [key: string]: unknown;
    }
  | {
      type: "prediction";
      node_id: string;
      node_name?: string;
      [key: string]: unknown;
    };

function isWorkflowMessage(
  msg: Record<string, unknown>
): msg is WorkflowMessage {
  return typeof msg.type === "string";
}

/**
 * Post a local notification for a run that just reached a terminal state, so a
 * user who put the phone down still learns the job is done. Fire-and-forget —
 * `notifyRunFinished` swallows its own failures.
 */
function notifyTerminal(
  get: () => WorkflowRunner,
  msg: Record<string, unknown>,
  outcome: "completed" | "failed" | "cancelled",
  error?: string
) {
  const state = get();
  const jobId = state.job_id || (msg.job_id as string | undefined);
  if (!jobId) {
    return;
  }
  void notifyRunFinished({
    jobId,
    workflowName: state.workflow?.name,
    outcome,
    error
  });
}

/**
 * Central message handler — mirrors web's workflowUpdates.ts handleUpdate().
 */
function handleMessage(
  set: (partial: Partial<WorkflowRunner>) => void,
  get: () => WorkflowRunner,
  message: Record<string, unknown>
) {
  if (!isWorkflowMessage(message)) {
    return;
  }

  const state = get();
  const msg = message;

  switch (msg.type) {
    // ── Job-level updates ──────────────────────────────────────────
    case "job_update": {
      if (state.state === "error" && msg.status === "running") {
        return;
      }

      const errorText =
        msg.error ||
        (msg.error_message as string | undefined) ||
        "Unknown error";

      switch (msg.status) {
        case "completed":
          set({
            state: "completed",
            results: msg.result,
            statusMessage: "Completed"
          });
          notifyTerminal(get, msg, "completed");
          break;
        case "failed":
        case "timed_out":
          set({
            state: "error",
            statusMessage: `Failed: ${errorText}`
          });
          notifyTerminal(get, msg, "failed", errorText);
          break;
        case "cancelled":
          set({ state: "cancelled", statusMessage: "Cancelled" });
          notifyTerminal(get, msg, "cancelled");
          break;
        case "running":
          set({
            state: "running",
            statusMessage: msg.message || "Running..."
          });
          break;
        case "queued":
          set({
            state: "running",
            statusMessage: "Queued — worker is booting..."
          });
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
            total: msg.total
          }
        }
      });
      break;
    }

    // ── Node status, results, errors ───────────────────────────────
    case "node_update": {
      if (state.state === "cancelled") {
        return;
      }

      const updates: Partial<WorkflowRunner> = {
        nodeStatus: {
          ...state.nodeStatus,
          [msg.node_id]: msg.status
        },
        statusMessage: `${msg.node_name || msg.node_id} ${msg.status}`
      };

      if (msg.result !== undefined) {
        updates.nodeResults = {
          ...state.nodeResults,
          [msg.node_id]: msg.result
        };
      }

      if (msg.error) {
        updates.nodeErrors = {
          ...state.nodeErrors,
          [msg.node_id]: msg.error
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
            [msg.node_id]: msg.value
          }
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
          logs: appendLog(state.logs, `[notification] ${content}`)
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
            [msg.node_id]: "booting"
          },
          statusMessage: `${msg.node_name || msg.node_id} booting...`
        });
      }
      break;
    }

    // ── Generic message with text ──────────────────────────────────
    default: {
      const generic = msg as { type: string; message?: string };
      if (generic.message && isString(generic.message)) {
        set({
          logs: appendLog(state.logs, `[${generic.type}] ${generic.message}`)
        });
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
