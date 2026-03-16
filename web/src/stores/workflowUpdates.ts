import {
  WorkflowAttributes,
  JobUpdate,
  Prediction,
  NodeProgress,
  NodeUpdate,
  TaskUpdate,
  ToolCallUpdate,
  ToolResultUpdate,
  PlanningUpdate,
  OutputUpdate,
  PreviewUpdate,
  EdgeUpdate,
  LogUpdate,
  StepResult,
  Message,
  Chunk
} from "./ApiTypes";
import useTraceStore, { traceEventId } from "./TraceStore";
import type { TraceEvent, TraceEventType } from "./TraceStore";
import useResultsStore from "./ResultsStore";
import useStatusStore from "./StatusStore";
import useLogsStore from "./LogStore";
import useErrorStore, { normalizeNodeError } from "./ErrorStore";
import log from "loglevel";
import type { WorkflowRunnerStore } from "./WorkflowRunner";
import { Notification } from "./ApiTypes";
import { useNotificationStore } from "./NotificationStore";
import { NOTIFICATION_TIMEOUT_JOB_COMPLETED, NOTIFICATION_TIMEOUT_WORKFLOW_SUSPENDED } from "../config/constants";
import { queryClient } from "../queryClient";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import useExecutionTimeStore from "./ExecutionTimeStore";
import { useNodeResultHistoryStore } from "./NodeResultHistoryStore";
import { NodeStore } from "./NodeStore";
import { sanitizeDisplayText } from "../utils/sanitizeDisplayText";

export type { NodeStore };

type WorkflowSubscription = {
  workflowId: string;
  unsubscribe: () => void;
};

const workflowSubscriptions = new Map<string, WorkflowSubscription>();

const formatJobDurationSeconds = (
  duration: number | null | undefined
): string | null => {
  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    return null;
  }
  return duration.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Module-level getter for NodeStore, set by WorkflowManagerStore during initialization
let getNodeStoreImpl: (workflowId: string) => NodeStore | undefined = () =>
  undefined;
export const setGetNodeStore = (
  fn: (workflowId: string) => NodeStore | undefined
): void => {
  getNodeStoreImpl = fn;
};

export const getNodeStore = (workflowId: string): NodeStore | undefined => {
  return getNodeStoreImpl(workflowId);
};

export const subscribeToWorkflowUpdates = (
  workflowId: string,
  workflow: WorkflowAttributes,
  runnerStore: WorkflowRunnerStore,
  getNodeStore: (workflowId: string) => NodeStore | undefined
): (() => void) => {
  const existing = workflowSubscriptions.get(workflowId);
  if (existing) {
    existing.unsubscribe();
  }

  const unsubscribeWorkflow = globalWebSocketManager.subscribe(
    workflowId,
    (message: MsgpackData) => {
      handleUpdate(workflow, message, runnerStore, getNodeStore);
    }
  );

  let unsubscribeJob: (() => void) | null = null;

  const updateJobSubscription = (jobId: string | null) => {
    if (unsubscribeJob) {
      unsubscribeJob();
      unsubscribeJob = null;
    }

    if (!jobId) {
      return;
    }

    unsubscribeJob = globalWebSocketManager.subscribe(
      jobId,
      (message: MsgpackData) => {
        // Avoid double-processing when the backend already provides workflow_id.
        // The job_id routing exists as a fallback for updates where workflow_id is
        // missing/null (e.g. terminal job completion updates).
        if ("workflow_id" in message && message.workflow_id) {
          return;
        }

        handleUpdate(workflow, message, runnerStore, getNodeStore);
      }
    );
  };

  // Track runnerStore job_id changes so we can subscribe by job_id as a fallback.
  updateJobSubscription(runnerStore.getState().job_id);
  const unsubscribeRunnerStore = runnerStore.subscribe((state, prevState) => {
    if (state.job_id !== prevState.job_id) {
      updateJobSubscription(state.job_id);
    }
  });

  workflowSubscriptions.set(workflowId, {
    workflowId,
    unsubscribe: () => {
      unsubscribeWorkflow();
      unsubscribeRunnerStore();
      if (unsubscribeJob) {
        unsubscribeJob();
        unsubscribeJob = null;
      }
      workflowSubscriptions.delete(workflowId);
    }
  });

  return workflowSubscriptions.get(workflowId)!.unsubscribe;
};

export const unsubscribeFromWorkflowUpdates = (workflowId: string): void => {
  const sub = workflowSubscriptions.get(workflowId);
  if (sub) {
    sub.unsubscribe();
    workflowSubscriptions.delete(workflowId);
  }
};

/**
 * Central reducer for WorkflowRunner WebSocket updates.
 *
 * Expected messages: job/node/progress/output/log/tool/task/planning/preview/edge
 * updates, notifications, predictions, chunks, and plain messages. This module
 * fans updates out to Status/Results/Log/Error/Notification stores and adjusts
 * the runner store state (job_id/state, notifications). Callers supply the
 * runner store so the protocol logic stays decoupled from Zustand wiring.
 */

export type MsgpackData =
  | JobUpdate
  | Chunk
  | Prediction
  | NodeProgress
  | NodeUpdate
  | Message
  | LogUpdate
  | ToolCallUpdate
  | ToolResultUpdate
  | TaskUpdate
  | PlanningUpdate
  | OutputUpdate
  | StepResult
  | PreviewUpdate
  | EdgeUpdate
  | Notification;

interface JobRunState {
  status: string;
  suspended_node_id?: string;
  suspension_reason?: string;
  error_message?: string;
  execution_strategy?: string;
  is_resumable?: boolean;
}

export const handleUpdate = (
  workflow: WorkflowAttributes,
  data: MsgpackData,
  runnerStore: WorkflowRunnerStore,
  getNodeStore: (workflowId: string) => NodeStore | undefined
) => {
  const runner = runnerStore.getState();
  const setResult = useResultsStore.getState().setResult;
  const setOutputResult = useResultsStore.getState().setOutputResult;
  const clearOutputResults = useResultsStore.getState().clearOutputResults;
  const setStatus = useStatusStore.getState().setStatus;
  const getStatus = useStatusStore.getState().getStatus;
  const clearStatuses = useStatusStore.getState().clearStatuses;
  const appendLog = useLogsStore.getState().appendLog;
  const setError = useErrorStore.getState().setError;
  const setProgress = useResultsStore.getState().setProgress;
  const clearProgress = useResultsStore.getState().clearProgress;
  const setPreview = useResultsStore.getState().setPreview;
  const setTask = useResultsStore.getState().setTask;
  const setToolCall = useResultsStore.getState().setToolCall;
  const setPlanningUpdate = useResultsStore.getState().setPlanningUpdate;
  const setEdge = useResultsStore.getState().setEdge;
  const clearEdges = useResultsStore.getState().clearEdges;
  const addNotification = useNotificationStore.getState().addNotification;
  const startExecution = useExecutionTimeStore.getState().startExecution;
  const endExecution = useExecutionTimeStore.getState().endExecution;
  const clearTimings = useExecutionTimeStore.getState().clearTimings;
  const addToHistory = useNodeResultHistoryStore.getState().addToHistory;

  const traceAppend = useTraceStore.getState().append;
  const traceStart = useTraceStore.getState().startRun;
  const traceRunStart = useTraceStore.getState().runStartTime;

  const relativeMs = (ts?: string): number => {
    if (!traceRunStart) return 0;
    const start = new Date(traceRunStart).getTime();
    const now = ts ? new Date(ts).getTime() : Date.now();
    return Math.max(0, now - start);
  };

  const now = new Date().toISOString();

  if (window.__UPDATES__ === undefined) {
    window.__UPDATES__ = [];
  }

  window.__UPDATES__.push(data);

  // console.log("Received update", data);

  if (data.type === "log_update") {
    const logUpdate = data as LogUpdate;
    appendLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: logUpdate.node_id,
      nodeName: logUpdate.node_name,
      content: logUpdate.content,
      severity: logUpdate.severity,
      timestamp: Date.now()
    });
  }

  if (data.type === "notification") {
    const notification = data as Notification;
    addNotification({
      type: notification.severity,
      content: notification.content
    });
  }

  if (data.type === "edge_update") {
    const edgeUpdate = data as EdgeUpdate;
    // Don't update edges if workflow is cancelled or in error state
    const currentState = runnerStore.getState().state;
    if (currentState !== "cancelled" && currentState !== "error") {
      setEdge(
        workflow.id,
        edgeUpdate.edge_id,
        edgeUpdate.status,
        edgeUpdate.counter ?? undefined
      );
    }
  }

  if (data.type === "planning_update") {
    const planningUpdate = data as PlanningUpdate;
    if (planningUpdate.node_id) {
      setPlanningUpdate(workflow.id, planningUpdate.node_id, planningUpdate);
    } else {
      log.error("PlanningUpdate has no node_id");
    }
  }
  if (data.type === "tool_call_update") {
    const toolCall = data as ToolCallUpdate;
    if (toolCall.node_id) {
      setToolCall(workflow.id, toolCall.node_id, toolCall);
    }
    // Note: Chat-related ToolCallUpdates don't have node_id - this is expected.
    // They are handled separately in chatProtocol.ts.
  }

  if (data.type === "tool_result_update") {
    const toolResult = data as ToolResultUpdate;
    if (toolResult.node_id) {
      setOutputResult(workflow.id, toolResult.node_id, toolResult.result, true);

      // Add to history for display in ResultOverlay
      addToHistory(workflow.id, toolResult.node_id, {
        result: toolResult.result,
        timestamp: Date.now(),
        jobId: runner.job_id,
        status: "completed"
      });
    }
  }

  if (data.type === "task_update") {
    const task = data as TaskUpdate;
    if (task.node_id) {
      setTask(workflow.id, task.node_id, task.task);
    } else {
      log.error("TaskUpdate has no node_id");
    }
  }

  if (data.type === "output_update") {
    const update = data as OutputUpdate;
    setOutputResult(workflow.id, update.node_id, update.value, true);

    // Add each streaming output to history for display in ResultOverlay
    addToHistory(workflow.id, update.node_id, {
      result: update.value,
      timestamp: Date.now(),
      jobId: runner.job_id,
      status: "completed"
    });

    appendLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: update.node_id,
      nodeName: update.node_name,
      content: `Output: ${
        typeof update.value === "string"
          ? update.value
          : JSON.stringify(update.value)
      }`,
      severity: "info",
      timestamp: Date.now()
    });
  }
  if (data.type === "job_update") {
    const job = data as JobUpdate;
    const runState = (job as JobUpdate & { run_state?: JobRunState }).run_state;

    // Consolidate state mapping
    let newState:
      | "idle"
      | "running"
      | "paused"
      | "suspended"
      | "error"
      | "cancelled"
      | undefined;

    if (job.status === "running" || job.status === "queued") {
      newState = "running";
    } else if (job.status === "suspended") {
      newState = "suspended";
    } else if (job.status === "paused") {
      newState = "paused";
    } else if (job.status === "completed") {
      newState = "idle";
    } else if (job.status === "cancelled") {
      newState = "cancelled";
    } else if (job.status === "failed" || job.status === "timed_out") {
      newState = "error";
    }

    if (newState) {
      runnerStore.setState({ state: newState });
    }

    if (job.job_id) {
      runnerStore.setState({ job_id: job.job_id });
    }

    // Use suspension reason from run_state if available
    if (runState?.suspension_reason && newState === "suspended") {
      runnerStore.setState({ statusMessage: runState.suspension_reason });
    }

    // Invalidate jobs query to refresh the job panel when job state changes
    // TEMPORARILY DISABLED "running" - testing performance impact of polling
    if (
      // job.status === "running" ||
      job.status === "completed" ||
      job.status === "cancelled" ||
      job.status === "failed" ||
      job.status === "suspended" ||
      job.status === "paused"
    ) {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }

    switch (job.status) {
      case "completed": {
        const formattedDuration = formatJobDurationSeconds(job.duration);
        runner.addNotification({
          type: "info",
          alert: true,
          content: formattedDuration
            ? `Job completed in ${formattedDuration} seconds`
            : "Job completed"
        });
        // Note: Don't clear edges on completion - keep the stream item counts visible
        // Edges are cleared when a new run starts (in WorkflowRunner.ts)
        clearProgress(workflow.id);
        clearTimings(workflow.id);
        break;
      }
      case "cancelled":
        runner.addNotification({
          type: "info",
          alert: true,
          content: "Job cancelled"
        });
        clearStatuses(workflow.id);
        clearEdges(workflow.id);
        clearProgress(workflow.id);
        clearOutputResults(workflow.id);
        clearTimings(workflow.id);
        break;
      case "failed":
      case "timed_out": {
        const sanitizedJobError =
          typeof job.error === "string" ? sanitizeDisplayText(job.error) : "";
        runner.addNotification({
          type: "error",
          alert: true,
          content: `Job ${job.status}${sanitizedJobError ? ` ${sanitizedJobError}` : ""}`,
          timeout: NOTIFICATION_TIMEOUT_JOB_COMPLETED
        });
        clearStatuses(workflow.id);
        clearEdges(workflow.id);
        clearProgress(workflow.id);
        clearOutputResults(workflow.id);
        clearTimings(workflow.id);
        break;
      }
      case "queued":
        runnerStore.setState({
          statusMessage: "Worker is booting (may take a 15 seconds)..."
        });
        break;
      case "running":
        if (job.message) {
          runner.addNotification({
            type: "info",
            alert: true,
            content: job.message
          });
        }
        break;
      case "suspended":
        runner.addNotification({
          type: "info",
          alert: true,
          content:
            job.message || "Workflow suspended - waiting for external input",
          timeout: NOTIFICATION_TIMEOUT_WORKFLOW_SUSPENDED
        });
        break;
    }
  }

  if (data.type === "prediction") {
    const pred = data as Prediction;
    appendLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: pred.node_id,
      nodeName: "",
      content: pred.logs || "",
      severity: "info",
      timestamp: Date.now()
    });
    if (pred.status === "booting") {
      setStatus(workflow.id, pred.node_id, "booting");
    }
  }

  if (data.type === "node_progress") {
    const progress = data as NodeProgress;
    const currentState = runnerStore.getState().state;
    // Don't update progress if workflow is cancelled
    if (currentState !== "cancelled") {
      setProgress(
        workflow.id,
        progress.node_id,
        progress.progress,
        progress.total
      );
    }
  }

  if (data.type === "preview_update") {
    const preview = data as PreviewUpdate;
    setPreview(workflow.id, preview.node_id, preview.value, true);
  }

  if (data.type === "node_update") {
    const update = data as NodeUpdate;
    const currentState = runnerStore.getState().state;
    const normalizedNodeError = normalizeNodeError(update.error);

    // Don't update node status if workflow is cancelled
    if (currentState === "cancelled") {
      return;
    }

    if (normalizedNodeError) {
      const sanitizedError = sanitizeDisplayText(
        typeof normalizedNodeError === "string"
          ? normalizedNodeError
          : String(normalizedNodeError)
      );
      log.error("WorkflowRunner update error", sanitizedError);
      runner.addNotification({
        type: "error",
        alert: true,
        content: sanitizedError
      });
      runnerStore.setState({ state: "error" });
      endExecution(workflow.id, update.node_id);
      setStatus(workflow.id, update.node_id, update.status);
      setError(workflow.id, update.node_id, sanitizedError);
      appendLog({
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodeId: update.node_id,
        nodeName: update.node_name || update.node_id,
        content: `${update.node_name || update.node_id} error: ${sanitizedError}`,
        severity: "error",
        timestamp: Date.now()
      });
    } else {
      setError(workflow.id, update.node_id, null);
      runnerStore.setState({
        statusMessage: `${update.node_name} ${update.status}`
      });

      // Track execution timing
      const previousStatus = getStatus(workflow.id, update.node_id);
      const isStarting =
        update.status === "running" ||
        update.status === "starting" ||
        update.status === "booting";
      const isFinishing =
        update.status === "completed" || update.status === "error";

      if (
        isStarting &&
        previousStatus !== "running" &&
        previousStatus !== "starting" &&
        previousStatus !== "booting"
      ) {
        startExecution(workflow.id, update.node_id);
      } else if (isFinishing) {
        endExecution(workflow.id, update.node_id);
      }

      setStatus(workflow.id, update.node_id, update.status);

      // Store result if present
      if (update.result) {
        setResult(workflow.id, update.node_id, update.result);

        // Add to history (persists across runs)
        // Skip if we've already received streaming outputs via output_update
        // (those are already added to history individually)
        const existingOutputResult = useResultsStore
          .getState()
          .getOutputResult(workflow.id, update.node_id);
        if (!existingOutputResult) {
          addToHistory(workflow.id, update.node_id, {
            result: update.result,
            timestamp: Date.now(),
            jobId: runner.job_id,
            status: update.status
          });
        }
      }
    }

    // Update node properties if provided in the NodeUpdate.
    // Dynamic-node runtime values (e.g. FalAI prompt) must be stored under
    // `dynamic_properties`; writing them into `properties` can desync editor state.
    if (update.properties && Object.keys(update.properties).length > 0) {
      const nodeStore = getNodeStore(workflow.id);
      if (nodeStore) {
        const state = nodeStore.getState();
        const node = state.findNode(update.node_id);
        const existingDynamic = node?.data?.dynamic_properties || {};
        const nextDynamic = { ...existingDynamic };
        const nextStatic: Record<string, unknown> = {};

        const isDynamicSchemaNode =
          update.node_type === "fal.DynamicFal" ||
          update.node_type === "kie.DynamicKie";

        Object.entries(update.properties).forEach(([key, value]) => {
          if (Object.prototype.hasOwnProperty.call(existingDynamic, key)) {
            // Dynamic schema node inputs are user-editable between runs;
            // backend echoes execution-time values that can be stale.
            if (isDynamicSchemaNode) {
              return;
            }
            nextDynamic[key] = value;
          } else {
            nextStatic[key] = value;
          }
        });

        state.updateNodeData(update.node_id, {
          properties: nextStatic,
          dynamic_properties: nextDynamic
        });
      }
    }
  }

  // --- Trace event capture ---
  if (data.type === "job_update") {
    const ju = data as JobUpdate;
    if (ju.status === "running") {
      traceStart(now);
    } else if (["completed", "failed", "cancelled", "error"].includes(ju.status)) {
      useTraceStore.setState({ isRecording: false });
    }
  }

  if (data.type === "node_update") {
    const nu = data as NodeUpdate;
    let traceType: TraceEventType | null = null;
    let summary = "";
    if (nu.status === "running") {
      traceType = "node_start";
      summary = `${nu.node_name || nu.node_id} started`;
    } else if (nu.status === "completed") {
      traceType = "node_complete";
      summary = `${nu.node_name || nu.node_id} completed`;
    } else if (nu.status === "error" || nu.status === "failed") {
      traceType = "node_error";
      summary = `${nu.node_name || nu.node_id} error: ${nu.error || "unknown"}`;
    }
    if (traceType) {
      traceAppend({
        id: traceEventId(),
        timestamp: now,
        relativeMs: relativeMs(),
        type: traceType,
        nodeId: nu.node_id,
        nodeName: nu.node_name ?? undefined,
        nodeType: nu.node_type ?? undefined,
        summary,
        detail: nu,
      });
    }
  }

  if ((data as any).type === "llm_call") {
    const lc = data as any;
    const tokens = lc.tokens_output ? `${lc.tokens_output} tokens` : "";
    const dur = lc.duration_ms ? `${lc.duration_ms}ms` : "";
    const cost = lc.cost ? `$${lc.cost.toFixed(4)}` : "";
    const parts = [tokens, dur, cost].filter(Boolean).join(", ");
    traceAppend({
      id: traceEventId(),
      timestamp: lc.timestamp || now,
      relativeMs: relativeMs(lc.timestamp),
      type: "llm_call",
      nodeId: lc.node_id ?? undefined,
      nodeName: lc.node_name ?? undefined,
      summary: `${lc.provider}/${lc.model}${parts ? ` → ${parts}` : ""}`,
      detail: lc,
    });
  }

  if (data.type === "tool_call_update") {
    const tc = data as ToolCallUpdate;
    traceAppend({
      id: traceEventId(),
      timestamp: now,
      relativeMs: relativeMs(),
      type: "tool_call",
      nodeId: tc.node_id ?? undefined,
      summary: `Tool call: ${tc.name}`,
      detail: tc,
    });
  }

  if (data.type === "tool_result_update") {
    const tr = data as ToolResultUpdate;
    traceAppend({
      id: traceEventId(),
      timestamp: now,
      relativeMs: relativeMs(),
      type: "tool_result",
      nodeId: tr.node_id,
      summary: `Tool result`,
      detail: tr,
    });
  }

  if (data.type === "output_update") {
    const ou = data as OutputUpdate;
    traceAppend({
      id: traceEventId(),
      timestamp: now,
      relativeMs: relativeMs(),
      type: "output",
      nodeId: ou.node_id,
      summary: `Output: ${ou.output_name}`,
      detail: ou,
    });
  }

  if (data.type === "edge_update") {
    const eu = data as EdgeUpdate;
    if (eu.status === "active") {
      traceAppend({
        id: traceEventId(),
        timestamp: now,
        relativeMs: relativeMs(),
        type: "edge_active",
        summary: `Edge active: ${eu.edge_id}`,
        detail: eu,
      });
    }
  }
};
