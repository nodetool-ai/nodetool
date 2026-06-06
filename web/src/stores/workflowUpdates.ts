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
  EdgeUpdate,
  LogUpdate,
  StepResult,
  Message,
  Chunk
} from "./ApiTypes";
import useWorkflowRunsStore, { RunState } from "./WorkflowRunsStore";
import useResultsStore from "./ResultsStore";
import useStatusStore from "./StatusStore";
import useLogsStore from "./LogStore";
import useErrorStore, { normalizeNodeError } from "./ErrorStore";
import usePropertyValidationStore from "./PropertyValidationStore";
import type { WorkflowRunnerStore } from "./WorkflowRunner";
import { Notification } from "./ApiTypes";
import { useNotificationStore } from "./NotificationStore";
import { NOTIFICATION_TIMEOUT_JOB_COMPLETED, NOTIFICATION_TIMEOUT_WORKFLOW_SUSPENDED } from "../config/constants";
import { queryClient } from "../queryClient";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";
import useExecutionTimeStore from "./ExecutionTimeStore";
import { NodeStore } from "./NodeStore";
import { DYNAMIC_KIE_NODE_TYPE } from "../components/node/DynamicKieSchemaNode";
import { normalizeOutputUpdateValue } from "./outputUpdateValue";

export type { NodeStore };

/**
 * Map a JobUpdate status string to the RunState enum used by WorkflowRunsStore.
 * Returns undefined for statuses that have no meaningful RunState equivalent.
 */
const mapJobStatusToRunState = (status: string): RunState | undefined => {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
    case "suspended":
    case "paused":
      return "running";
    case "completed":
      return "completed";
    case "failed":
    case "timed_out":
      return "error";
    case "cancelled":
      return "cancelled";
    default:
      return undefined;
  }
};

type WorkflowSubscription = {
  workflowId: string;
  unsubscribe: () => void;
};

const workflowSubscriptions = new Map<string, WorkflowSubscription>();

export const mergeNodeUpdateProperties = ({
  updateProperties,
  existingStatic,
  existingDynamic,
  isDynamicSchemaNode
}: {
  updateProperties: Record<string, unknown>;
  existingStatic: Record<string, unknown>;
  existingDynamic: Record<string, unknown>;
  isDynamicSchemaNode: boolean;
}): {
  staticProperties: Record<string, unknown>;
  dynamicProperties: Record<string, unknown>;
} => {
  const nextDynamic = { ...existingDynamic };
  const nextStatic = { ...existingStatic };

  for (const key in updateProperties) {
    if (!Object.prototype.hasOwnProperty.call(updateProperties, key)) {
      continue;
    }
    const value = updateProperties[key];
    if (Object.prototype.hasOwnProperty.call(existingDynamic, key)) {
      // Dynamic schema node inputs are user-editable between runs;
      // backend echoes execution-time values that can be stale.
      if (isDynamicSchemaNode) {
        continue;
      }
      nextDynamic[key] = value;
      continue;
    }

    // Preserve existing static values so user edits made while a run is in
    // progress are not overwritten by stale execution-time echoes.
    if (!Object.prototype.hasOwnProperty.call(existingStatic, key)) {
      nextStatic[key] = value;
    }
  }

  return {
    staticProperties: nextStatic,
    dynamicProperties: nextDynamic
  };
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
    (message) => {
      handleUpdate(workflow, message as MsgpackData, runnerStore, getNodeStore);
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
      (message) => {
        // Avoid double-processing when the backend already provides workflow_id.
        // The job_id routing exists as a fallback for updates where workflow_id is
        // missing/null (e.g. terminal job completion updates).
        if ("workflow_id" in message && message.workflow_id) {
          return;
        }

        handleUpdate(workflow, message as MsgpackData, runnerStore, getNodeStore);
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
  | EdgeUpdate
  | Notification;

export const handleUpdate = (
  workflow: WorkflowAttributes,
  data: MsgpackData,
  runnerStore: WorkflowRunnerStore,
  getNodeStore: (workflowId: string) => NodeStore | undefined
) => {
  const runner = runnerStore.getState();
  const setProviderCost = useResultsStore.getState().setProviderCost;
  const upsertLiveGeneration = useResultsStore.getState().upsertLiveGeneration;
  const setOutputResult = useResultsStore.getState().setOutputResult;
  const setStatus = useStatusStore.getState().setStatus;
  const getStatus = useStatusStore.getState().getStatus;
  const appendLog = useLogsStore.getState().appendLog;
  const setError = useErrorStore.getState().setError;
  const setProgress = useResultsStore.getState().setProgress;
  const addChunk = useResultsStore.getState().addChunk;
  const setTask = useResultsStore.getState().setTask;
  const setToolCall = useResultsStore.getState().setToolCall;
  const appendToolResult = useResultsStore.getState().appendToolResult;
  const setPlanningUpdate = useResultsStore.getState().setPlanningUpdate;
  const setEdge = useResultsStore.getState().setEdge;
  const addNotification = useNotificationStore.getState().addNotification;
  const startExecution = useExecutionTimeStore.getState().startExecution;
  const endExecution = useExecutionTimeStore.getState().endExecution;


  if (data.type === "log_update") {
    appendLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: data.node_id,
      nodeName: data.node_name,
      content: data.content,
      severity: data.severity,
      timestamp: Date.now()
    });
  }

  if (data.type === "notification") {
    addNotification({
      type: data.severity,
      content: data.content
    });
  }

  // Per-node results/progress/edges are scoped by the run (job) that produced
  // them so concurrent same-workflow runs stay isolated. The backend stamps
  // job_id on every data message; if it's absent, skip the per-job write rather
  // than writing a malformed key.
  const messageJobId =
    (data as { job_id?: string | null }).job_id ?? undefined;

  if (data.type === "edge_update") {
    const currentState = runnerStore.getState().state;
    if (
      currentState !== "cancelled" &&
      currentState !== "error" &&
      messageJobId
    ) {
      setEdge(
        workflow.id,
        messageJobId,
        data.edge_id,
        data.status,
        data.counter ?? undefined
      );
    }
  }

  if (data.type === "planning_update") {
    if (data.node_id && messageJobId) {
      setPlanningUpdate(workflow.id, messageJobId, data.node_id, data);
    } else if (!data.node_id) {
      console.error("PlanningUpdate has no node_id");
    }
  }
  if (data.type === "tool_call_update") {
    if (data.node_id && messageJobId) {
      setToolCall(workflow.id, messageJobId, data.node_id, data);
    }
  }

  if (data.type === "tool_result_update") {
    // A tool result is an artifact of an agent's run, not its output value.
    // It accumulates in the toolResults channel (read by the agent tool log),
    // never in the output/value paths.
    if (data.node_id && messageJobId) {
      appendToolResult(workflow.id, messageJobId, data.node_id, data.result);
    }
  }

  if (data.type === "task_update") {
    if (data.node_id && messageJobId) {
      setTask(workflow.id, messageJobId, data.node_id, data.task);
    } else if (!data.node_id) {
      console.error("TaskUpdate has no node_id");
    }
  }

  if (data.type === "output_update") {
    const normalizedValue = normalizeOutputUpdateValue(data);
    // output_update feeds the output-node stream buffer only. It does NOT
    // create or modify a live generation — generations are driven solely by
    // node_update (see the live-generations branch below).
    if (messageJobId) {
      setOutputResult(workflow.id, messageJobId, data.node_id, normalizedValue, true);
    }

    appendLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: data.node_id,
      nodeName: data.node_name,
      content: `Output: ${typeof normalizedValue === "string"
          ? normalizedValue
          : JSON.stringify(normalizedValue)
        }`,
      severity: "info",
      timestamp: Date.now()
    });
  }

  if (data.type === "chunk") {
    if (data.node_id && data.content && messageJobId) {
      addChunk(workflow.id, messageJobId, data.node_id, data.content);
    }
  }
  if (data.type === "job_update") {
    const job = data;
    const runnerJobId = runnerStore.getState().job_id;
    // The per-workflow runner represents the single full run. Concurrent
    // inline/per-node jobs share this workflow_id but have their own job_id, so
    // only updates for the runner's OWN job (or a fresh run when the runner is
    // idle and hasn't claimed a job yet) may drive its state/job_id/queue.
    // Otherwise an inline job's update could hijack the Stop button's target or
    // clear the full run's queued position. The running-job COUNT below still
    // tracks every job.
    const runnerState = runnerStore.getState().state;
    const isRunnerJob =
      !job.job_id ||
      job.job_id === runnerJobId ||
      (runnerJobId === null &&
        (runnerState === "idle" || runnerState === "connecting"));

    // Whether this run was sitting in the backend's concurrency queue, so we
    // can clear the "Queued…" status once it actually starts running.
    const wasQueued = runnerStore.getState().queuePosition !== null;

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
      // Don't overwrite an error state from a node_update with a stale "running" job_update
      const currentState = runnerStore.getState().state;
      if (currentState !== "error") {
        newState = "running";
      }
      // A new run starts: clear any prior pre-flight validation highlights
      // so stale red outlines don't linger after the user fixes them.
      usePropertyValidationStore.getState().clearWorkflow(workflow.id);
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

    // Populate the WorkflowRunsStore registry so concurrent runs can be tracked.
    if (job.job_id) {
      const runState = mapJobStatusToRunState(job.status);
      if (runState) {
        const runsStore = useWorkflowRunsStore.getState();
        const known = runsStore
          .getRuns(workflow.id)
          .some((r) => r.jobId === job.job_id);
        if (!known) {
          runsStore.recordRun({
            jobId: job.job_id,
            workflowId: workflow.id,
            state: runState,
            startedAt: Date.now(),
            label: job.job_id
          });
        } else {
          runsStore.updateRunState(workflow.id, job.job_id, runState);
        }
      }
    }

    if (isRunnerJob) {
      if (newState) {
        runnerStore.setState({ state: newState });
      }

      if (job.job_id) {
        runnerStore.setState({ job_id: job.job_id });
      }

      // Track queue position so the UI can show "Queued (#N)". Any
      // non-queued update (running, completed, …) clears it.
      runnerStore.setState({
        queuePosition:
          job.status === "queued" ? job.queue_position ?? null : null
      });
    }

    if (
      isRunnerJob &&
      job.run_state?.suspension_reason &&
      newState === "suspended"
    ) {
      runnerStore.setState({ statusMessage: job.run_state.suspension_reason });
    }

    // Refresh the Queue panel when a job moves between lifecycle columns.
    // These are per-job (not per-node) updates, so the frequency is low.
    if (
      job.status === "queued" ||
      job.status === "running" ||
      job.status === "completed" ||
      job.status === "cancelled" ||
      job.status === "failed" ||
      job.status === "suspended" ||
      job.status === "paused"
    ) {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }

    // Generative nodes auto-save outputs to assets on completion; refresh
    // the per-node asset cache so history badges/panels update without
    // waiting for staleTime to elapse.
    if (job.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    }

    switch (job.status) {
      case "completed": {
        // No toast — completion is reflected in the Queue panel/overlay.
        // Don't clear this run's per-job state (progress/timings/edges): with
        // per-job keys those clears span the whole workflow and would wipe a
        // concurrently running sibling. The finished run's slice persists so it
        // can be focused; a new run auto-focuses its own empty slice.
        break;
      }
      case "cancelled":
        runner.addNotification({
          type: "info",
          alert: true,
          content: "Job cancelled"
        });
        // Keep this run's per-job slice (see "completed"): broad clears here
        // would erase a concurrent sibling.
        break;
      case "failed":
      case "timed_out": {
        const validationIssues = job.validation_issues;
        if (validationIssues && validationIssues.length > 0) {
          usePropertyValidationStore
            .getState()
            .setIssues(workflow.id, validationIssues);
          const firstIssue = validationIssues[0];
          const nodeStore = getNodeStore(workflow.id);
          const firstNode = nodeStore
            ?.getState()
            .findNode(firstIssue.node_id);
          const nodeLabel =
            firstNode?.data?.title?.trim() ||
            firstNode?.type?.split(".").pop() ||
            firstIssue.node_id;
          const noun = validationIssues.length === 1 ? "field" : "fields";
          const content =
            validationIssues.length === 1
              ? firstIssue.property
                ? `Fix “${firstIssue.property}” on ${nodeLabel} before running.`
                : `Fix “${nodeLabel}” before running: ${firstIssue.message}`
              : `Fix ${validationIssues.length} ${noun} before running (starting at ${nodeLabel}).`;
          runner.addNotification({
            type: "error",
            alert: true,
            content,
            timeout: NOTIFICATION_TIMEOUT_JOB_COMPLETED,
            action: {
              label: "Show",
              onClick: () => {
                const store = getNodeStore(workflow.id);
                if (!store) return;
                const { findNode, setSelectedNodes, setShouldFitToScreen } =
                  store.getState();
                const target = findNode(firstIssue.node_id);
                if (!target) return;
                setSelectedNodes([target]);
                setShouldFitToScreen(true, [firstIssue.node_id]);
              }
            }
          });
        } else {
          runner.addNotification({
            type: "error",
            alert: true,
            content: `Job ${job.status}${job.error ? ` ${job.error}` : ""}`,
            timeout: NOTIFICATION_TIMEOUT_JOB_COMPLETED
          });
        }
        // Keep this run's per-job slice (see "completed"): broad clears here
        // would erase a concurrent sibling.
        break;
      }
      case "queued":
        if (isRunnerJob) {
          runnerStore.setState({
            statusMessage:
              job.message || "Worker is booting (may take a few seconds)..."
          });
        }
        break;
      case "running":
        // Clear the "Queued…" status carried over once the run actually starts.
        // No "started" toast — the Queue panel/overlay shows the running job.
        if (isRunnerJob && wasQueued) {
          runnerStore.setState({ statusMessage: null });
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
    appendLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      nodeId: data.node_id,
      nodeName: "",
      content: data.logs || "",
      severity: "info",
      timestamp: Date.now()
    });
    if (data.status === "booting") {
      const predictionJobId =
        (data as { job_id?: string | null }).job_id ?? undefined;
      if (predictionJobId) {
        setStatus(workflow.id, predictionJobId, data.node_id, "booting");
      }
    }
  }

  if (data.type === "node_progress") {
    const currentState = runnerStore.getState().state;
    if (currentState !== "cancelled" && messageJobId) {
      setProgress(
        workflow.id,
        messageJobId,
        data.node_id,
        data.progress,
        data.total
      );
    }
  }

  if (data.type === "node_update") {
    const update = data;
    const currentState = runnerStore.getState().state;

    // Don't update node status if workflow is cancelled
    if (currentState === "cancelled") {
      return;
    }

    // Per-node status/error/timing are scoped by the run that produced them so
    // concurrent same-workflow runs stay isolated. The backend stamps job_id on
    // every data message; if it's somehow absent, skip the per-job writes rather
    // than writing a malformed key.
    const jobId = (update as { job_id?: string | null }).job_id ?? undefined;

    const normalizedNodeError = normalizeNodeError(update.error);
    if (normalizedNodeError) {
      console.error("WorkflowRunner update error", normalizedNodeError);
      runner.addNotification({
        type: "error",
        alert: true,
        content: String(normalizedNodeError)
      });
      runnerStore.setState({ state: "error" });
      if (jobId) {
        endExecution(workflow.id, jobId, update.node_id);
        setStatus(workflow.id, jobId, update.node_id, update.status);
        setError(workflow.id, jobId, update.node_id, normalizedNodeError);
        upsertLiveGeneration(workflow.id, update.node_id, jobId, {
          status: "error",
          error:
            typeof update.error === "string"
              ? update.error
              : String(normalizedNodeError)
        });
      }
      appendLog({
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodeId: update.node_id,
        nodeName: update.node_name || update.node_id,
        content: `${update.node_name || update.node_id} error: ${update.error}`,
        severity: "error",
        timestamp: Date.now()
      });
    } else {
      runnerStore.setState({
        statusMessage: `${update.node_name} ${update.status}`
      });

      // Track execution timing (per job)
      if (jobId) {
        const previousStatus = getStatus(workflow.id, jobId, update.node_id);
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
          startExecution(workflow.id, jobId, update.node_id);
        } else if (isFinishing) {
          endExecution(workflow.id, jobId, update.node_id);
        }

        setStatus(workflow.id, jobId, update.node_id, update.status);
      }

      if (update.provider_cost && jobId) {
        setProviderCost(
          workflow.id,
          jobId,
          update.node_id,
          update.provider_cost
        );
      }

      if (jobId) {
        if (
          update.status === "running" ||
          update.status === "starting" ||
          update.status === "booting"
        ) {
          upsertLiveGeneration(workflow.id, update.node_id, jobId, {
            createdAt: Date.now(),
            status: "running"
          });
        } else if (update.status === "completed") {
          upsertLiveGeneration(workflow.id, update.node_id, jobId, {
            status: "completed",
            outputs: (update.result as Record<string, unknown>) ?? {},
            cost: update.provider_cost ?? undefined
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
        const existingStatic = node?.data?.properties || {};
        const existingDynamic = node?.data?.dynamic_properties || {};

        const isDynamicSchemaNode =
          update.node_type === "fal.DynamicFal" ||
          update.node_type === DYNAMIC_KIE_NODE_TYPE ||
          update.node_type === "kie.DynamicKie";

        const { staticProperties, dynamicProperties } = mergeNodeUpdateProperties(
          {
            updateProperties: update.properties,
            existingStatic,
            existingDynamic,
            isDynamicSchemaNode
          }
        );

        state.updateNodeData(update.node_id, {
          properties: staticProperties,
          dynamic_properties: dynamicProperties
        });
      }
    }
  }
};
