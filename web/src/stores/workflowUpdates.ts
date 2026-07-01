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
  GenerationComplete,
  EdgeUpdate,
  LogUpdate,
  TerminalUpdate,
  LLMCallUpdate,
  StepResult,
  TodoUpdate,
  Message,
  Chunk
} from "./ApiTypes";
import useTraceStore, { traceEventId } from "./TraceStore";
import type { TraceEvent, TraceEventType } from "./TraceStore";
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
import { preloadBrowserRunner } from "../lib/workflow/browserWorkflowRunner";
import useExecutionTimeStore from "./ExecutionTimeStore";
import { isSilentJob } from "./previewJobs";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";
import { NodeStore } from "./NodeStore";
import { DYNAMIC_KIE_NODE_TYPE } from "../components/node/DynamicKieSchemaNode";
import { normalizeOutputUpdateValue } from "./outputUpdateValue";
import { publishRealtimeAudioChunk } from "../lib/audio/realtimeAudioChunkBus";
import { getRunSignature, clearRunSignatures } from "./runSignatures";
import { computeStampSignature } from "../utils/computeRunSignatures";
import { getNodeGenerations } from "./nodeGenerationAccessor";
import useMetadataStore from "./MetadataStore";

/**
 * Pending audio-chunk store appends, coalesced per node and flushed on a
 * timer. Realtime streams append ~50 chunks/s per node; landing each one as
 * its own ResultsStore set means one array copy + full subscriber sweep per
 * chunk. Playback latency is unaffected — the chunk bus above delivers to
 * the worklet immediately; the store buffer only serves mount/replay/restart,
 * which tolerate a flush interval.
 */
const AUDIO_APPEND_FLUSH_MS = 200;
const pendingAudioAppends = new Map<
  string,
  { workflowId: string; jobId: string; nodeId: string; chunks: unknown[] }
>();
let audioAppendFlushTimer: ReturnType<typeof setTimeout> | null = null;

const flushAudioAppends = (): void => {
  if (audioAppendFlushTimer !== null) {
    clearTimeout(audioAppendFlushTimer);
    audioAppendFlushTimer = null;
  }
  if (pendingAudioAppends.size === 0) return;
  const appendOutputResults = useResultsStore.getState().appendOutputResults;
  for (const { workflowId, jobId, nodeId, chunks } of pendingAudioAppends.values()) {
    appendOutputResults(workflowId, jobId, nodeId, chunks);
  }
  pendingAudioAppends.clear();
};

const queueAudioAppend = (
  workflowId: string,
  jobId: string,
  nodeId: string,
  chunk: unknown
): void => {
  const key = `${workflowId}:${jobId}:${nodeId}`;
  const pending = pendingAudioAppends.get(key);
  if (pending) {
    pending.chunks.push(chunk);
  } else {
    pendingAudioAppends.set(key, { workflowId, jobId, nodeId, chunks: [chunk] });
  }
  if (audioAppendFlushTimer === null) {
    audioAppendFlushTimer = setTimeout(flushAudioAppends, AUDIO_APPEND_FLUSH_MS);
  }
};

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

// Per-workflow job_id whose run is currently being recorded into the
// TraceStore. Used to call startRun() exactly once per run (startRun clears
// prior events), so the trace panel shows a fresh timeline per execution
// rather than accumulating. Keyed by workflow id so concurrent runs of
// different workflows don't ping-pong a shared id and repeatedly wipe the
// trace timeline.
const traceRunJobIds = new Map<string, string | null>();

// Per-(jobId, node_id) "a generation_complete landed this run" set. Gates the
// node_update{completed} fallback so a generator (which emits N
// generation_complete) does NOT also synthesize a phantom from its collapsed
// node_update.result, while a non-generator (or an old server, §12) — which
// emits no generation_complete — still gets its single live generation.
// Relies on actor emit order (§5): generation_complete precedes the node's
// terminal node_update{completed}, so the flag is set before the fallback reads it.
const sawGenerationCompleteKeys = new Set<string>();
const genKey = (jobId: string, nodeId: string) => `${jobId}:${nodeId}`;

// Drop every saw-flag belonging to a finished run. The flags are only needed
// during the run (between the gen_completes and the terminal
// node_update{completed} fallback read), so clearing them on the job terminal
// AND on a reused-jobId fresh-run start keeps the set from growing unbounded
// across a long session (real runs use fresh UUID jobIds, so the fresh-run
// clear alone never matches a prior run's keys).
const clearSawGenerationCompleteFor = (jobId: string): void => {
  const prefix = `${jobId}:`;
  for (const k of sawGenerationCompleteKeys) {
    if (k.startsWith(prefix)) sawGenerationCompleteKeys.delete(k);
  }
};

/**
 * Append one event to the global TraceStore (the LLM/agent debug timeline shown
 * in the bottom "Debug" → Trace panel). No-ops unless a run is being recorded.
 * relativeMs is measured from the run's start so events line up on a shared axis.
 */
const appendTrace = (
  type: TraceEventType,
  summary: string,
  detail: unknown,
  meta?: Pick<TraceEvent, "nodeId" | "nodeName" | "nodeType">
): void => {
  const store = useTraceStore.getState();
  if (!store.isRecording || !store.runStartTime) {
    return;
  }
  const now = Date.now();
  store.append({
    id: traceEventId(),
    timestamp: new Date(now).toISOString(),
    relativeMs: now - new Date(store.runStartTime).getTime(),
    type,
    summary,
    detail,
    ...meta
  });
};

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

/**
 * The `inputSignature` to stamp on a node's completed generation. Recomputes the
 * signature against the LIVE graph at completion so a computed descendant of a
 * generative that ran THIS job is keyed to the generation it actually consumed —
 * the dispatch-time stamp predates that generation (see `computeStampSignature`).
 * Preserves the dispatch gate: a node the run didn't stamp stays uncached
 * (returns undefined). Falls back to the dispatch value when the live graph is
 * unavailable (e.g. unit tests with no NodeStore), and never throws into the
 * completion path.
 */
const stampSignatureForCompletion = (
  getStore: (workflowId: string) => NodeStore | undefined,
  workflowId: string,
  jobId: string,
  nodeId: string
): string | undefined => {
  const dispatched = getRunSignature(jobId, nodeId);
  if (dispatched === undefined) return undefined;
  const state = getStore(workflowId)?.getState();
  if (!state) return dispatched;
  try {
    return computeStampSignature(jobId, nodeId, {
      nodes: state.nodes,
      edges: state.edges,
      workflowId,
      getMetadata: useMetadataStore.getState().getMetadata,
      getGenerations: getNodeGenerations
    });
  } catch {
    return dispatched;
  }
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

  // Warm the in-browser workflow runner so pure-browser sub-graphs execute
  // client-side from the first run instead of falling back to the server while
  // the chunk loads. No-op until a browser sub-graph is actually run.
  preloadBrowserRunner();

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
      traceRunJobIds.delete(workflowId);
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
  | GenerationComplete
  | StepResult
  | TodoUpdate
  | EdgeUpdate
  | LLMCallUpdate
  | TerminalUpdate
  | Notification;

function extractJobId(data: MsgpackData): string | undefined {
  if ("job_id" in data) {
    const id = data.job_id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function isAudioChunkValue(value: unknown): value is Chunk {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "chunk" &&
    "content_type" in value &&
    value.content_type === "audio"
  );
}

export const handleUpdate = (
  workflow: WorkflowAttributes,
  data: MsgpackData,
  runnerStore: WorkflowRunnerStore,
  getNodeStore: (workflowId: string) => NodeStore | undefined
): void => {
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
  const addTerminal = useResultsStore.getState().addTerminal;
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
  const messageJobId = extractJobId(data);

  if (data.type === "edge_update") {
    const currentState = runnerStore.getState().state;
    if (
      currentState !== "cancelled" &&
      currentState !== "error" &&
      messageJobId &&
      // Silent preview jobs don't animate edges (scrub-frame noise).
      !isSilentJob(messageJobId)
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
    appendTrace("tool_call", data.message || `Tool: ${data.name}`, data, {
      nodeId: data.node_id ?? undefined
    });
  }

  if (data.type === "tool_result_update") {
    // A tool result is an artifact of an agent's run, not its output value.
    // It accumulates in the toolResults channel (read by the agent tool log),
    // never in the output/value paths.
    if (data.node_id && messageJobId) {
      appendToolResult(workflow.id, messageJobId, data.node_id, data.result);
    }
    appendTrace(
      "tool_result",
      `${data.name ?? "Tool"} result${data.is_error ? " (error)" : ""}`,
      data,
      { nodeId: data.node_id ?? undefined }
    );
  }

  if (data.type === "task_update") {
    if (data.node_id && messageJobId) {
      setTask(workflow.id, messageJobId, data.node_id, data.task);
    } else if (!data.node_id) {
      console.error("TaskUpdate has no node_id");
    }
  }

  // Agent nodes emit step_result / todo_update during a run. The chat path
  // handles these separately; in the workflow path they were previously
  // dropped (step_result was even in the union with no branch). Record them on
  // the trace timeline alongside tool_call/tool_result so an agent node's
  // progress is observable in the editor.
  if (data.type === "step_result") {
    const stepName = data.step?.name ?? data.step?.id ?? "";
    appendTrace(
      "step_result",
      `Step ${stepName}${data.is_task_result ? " (task result)" : ""}${
        data.error ? " — error" : ""
      }`,
      data
    );
  }

  if (data.type === "todo_update") {
    const todos = data.todos ?? [];
    const done = todos.filter((t) => t.status === "completed").length;
    appendTrace("todo_update", `Todos ${done}/${todos.length}`, data, {
      nodeId: data.node_id ?? undefined
    });
  }

  if (data.type === "llm_call") {
    const tokensIn = data.tokens_input ?? 0;
    const tokensOut = data.tokens_output ?? 0;
    const duration =
      data.duration_ms != null ? ` (${data.duration_ms}ms)` : "";
    appendTrace(
      "llm_call",
      `${data.provider}/${data.model}: ${tokensIn}→${tokensOut} tok${duration}${
        data.error ? " — error" : ""
      }`,
      data,
      { nodeId: data.node_id, nodeName: data.node_name ?? undefined }
    );
  }

  if (data.type === "output_update") {
    const normalizedValue = normalizeOutputUpdateValue(data);

    // Realtime audio streams emit ~50 chunks/s per node; logging/tracing each
    // one would copy the (capped) log array per chunk for entries nobody
    // reads. Skip audio chunks entirely.
    const isAudioChunk = isAudioChunkValue(normalizedValue);

    // output_update feeds the output-node stream buffer only. It does NOT
    // create or modify a live generation — generations are driven solely by
    // node_update (see the live-generations branch below). Audio chunks are
    // coalesced and flushed on a timer; everything else lands immediately.
    if (messageJobId) {
      if (isAudioChunk) {
        queueAudioAppend(workflow.id, messageJobId, data.node_id, normalizedValue);
      } else {
        setOutputResult(workflow.id, messageJobId, data.node_id, normalizedValue, true);
      }
    }

    if (isAudioChunk && data.node_id) {
      // React-free fast path to the playback worklet: deliver in this task,
      // not after the store→render→effect round trip. Same object identity
      // as the store append above, so playback dedupes the two paths.
      publishRealtimeAudioChunk(data.node_id, normalizedValue);
    }

    if (!isAudioChunk) {
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

      appendTrace(
        "output",
        `${data.node_name || data.node_id} → ${data.output_name}`,
        data,
        { nodeId: data.node_id, nodeName: data.node_name }
      );
    }
  }

  if (data.type === "generation_complete") {
    // The sole generation driver: a generator committed one complete artifact.
    const jobId = extractJobId(data);
    if (jobId) {
      sawGenerationCompleteKeys.add(genKey(jobId, data.node_id));
      // Silent jobs (slider scrubs) reuse one jobId across frames — pin slot 0
      // (replace) so a scrub stays ONE preview (D2/§9). Otherwise use the
      // relay-stamped index. outputs are already normalized at the relay — pass
      // through, do NOT re-coerce.
      const slot = isSilentJob(jobId) ? 0 : data.index ?? 0;
      upsertLiveGeneration(workflow.id, data.node_id, jobId, {
        index: slot,
        status: "completed",
        outputs: data.outputs,
        // Stamp the signature so a later resolve/buildRunSubgraph can reuse this
        // cached output (Computed cache key, spec §3.4). Recomputed at completion
        // so a descendant of a generative that ran this job is keyed to the
        // generation it consumed, not the dispatch-time pin. Absent for partial
        // runs of computed nodes → simply not cached.
        inputSignature: stampSignatureForCompletion(
          getNodeStore,
          workflow.id,
          jobId,
          data.node_id
        )
      });
    }
  }

  if (data.type === "chunk") {
    // Binary (audio) chunk payloads don't belong in the text-chunk channel.
    if (
      data.node_id &&
      typeof data.content === "string" &&
      data.content &&
      messageJobId
    ) {
      addChunk(workflow.id, messageJobId, data.node_id, data.content);
    }
  }
  if (data.type === "terminal_update") {
    // Raw ANSI pane stream for the node-body terminal emulator. Routed to its
    // own buffer (never the chunk buffer) so text consumers don't see escapes.
    if (data.node_id && messageJobId) {
      addTerminal(workflow.id, messageJobId, data.node_id, data);
    }
  }
  if (data.type === "job_update") {
    const job = data;
    // Live-preview scrub jobs must never touch the runner state, queue or job
    // list — they'd hijack the Stop button (the runner is idle during a scrub,
    // so they'd otherwise match the "fresh run" branch below) and refetch the
    // job list on every frame.
    const silentJob = isSilentJob(job.job_id);
    const runnerJobId = runnerStore.getState().job_id;
    // Land any coalesced audio-chunk appends before the run's terminal state
    // is processed, so the buffer holds the complete stream (incl. the done
    // marker) the moment the job ends.
    if (
      ["completed", "failed", "cancelled", "error", "timed_out"].includes(
        String(job.status)
      )
    ) {
      flushAudioAppends();
      // The run is over: its saw-generation_complete flags are no longer read
      // (the terminal node_update fallback already ran). Drop them so the set
      // doesn't accumulate one dead entry per generator node per run for the
      // life of the session. Skip silent scrub jobs — they reuse one jobId and
      // never finalize between frames.
      if (job.job_id && !silentJob) {
        clearSawGenerationCompleteFor(job.job_id);
        // The run is finished: drop its dispatch-time signature map so the
        // registry doesn't leak entries across runs (spec §3.4).
        clearRunSignatures(job.job_id);
      }
    }
    // The per-workflow runner represents the single full run. Concurrent
    // inline/per-node jobs share this workflow_id but have their own job_id, so
    // only updates for the runner's OWN job (or a fresh run when the runner is
    // idle and hasn't claimed a job yet) may drive its state/job_id/queue.
    // Otherwise an inline job's update could hijack the Stop button's target or
    // clear the full run's queued position. The running-job COUNT below still
    // tracks every job.
    const runnerState = runnerStore.getState().state;
    const isRunnerJob =
      !silentJob &&
      (!job.job_id ||
        job.job_id === runnerJobId ||
        (runnerJobId === null &&
          (runnerState === "idle" || runnerState === "connecting")));

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
      // Begin a fresh LLM/agent trace timeline for the runner's own run. Guarded
      // by job_id so startRun (which clears prior events) fires once per run, not
      // on every running/queued heartbeat.
      const incomingTraceJobId = job.job_id ?? null;
      if (
        isRunnerJob &&
        incomingTraceJobId !== traceRunJobIds.get(workflow.id)
      ) {
        traceRunJobIds.set(workflow.id, incomingTraceJobId);
        useTraceStore.getState().startRun(new Date().toISOString());
        // Clear the saw-generation_complete flags for this incoming job so a
        // reused jobId can't poison the next run's node_update{completed}
        // fallback (a stale flag would suppress a legitimate synthesis).
        if (job.job_id) {
          clearSawGenerationCompleteFor(job.job_id);
        }
      }
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
        const known = runsStore.hasRun(workflow.id, job.job_id);
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
    // Silent preview jobs are skipped — they'd refetch on every scrub frame.
    if (
      !silentJob &&
      (job.status === "queued" ||
        job.status === "running" ||
        job.status === "completed" ||
        job.status === "cancelled" ||
        job.status === "failed" ||
        job.status === "suspended" ||
        job.status === "paused")
    ) {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }

    // Generative nodes auto-save outputs to assets on completion; refresh
    // the per-node asset cache so history badges/panels update without
    // waiting for staleTime to elapse. (Preview runs persist nothing.)
    if (job.status === "completed" && !silentJob) {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      // The generation timeline (useNodeGenerations) reads persisted assets
      // from WorkflowAssetStore, which is otherwise only loaded when the
      // workflow is fetched. Reload it so the finished run's live generation
      // is superseded by its persisted asset — download / open-in-viewer in
      // NodeHistoryViewer need the full Asset to enable.
      useWorkflowAssetStore
        .getState()
        .loadWorkflowAssets(workflow.id)
        .catch(() => {
          // already logged inside loadWorkflowAssets
        });
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
        // Keep this run's per-job results slice (see "completed"): broad
        // clears here would erase a concurrent sibling. But do stop the
        // run's transient visuals — node/edge updates are dropped once the
        // runner state is "cancelled", so without this job-scoped clear the
        // "running" borders and edge animations would persist forever.
        if (job.job_id) {
          useStatusStore.getState().clearJobStatuses(workflow.id, job.job_id);
          useResultsStore
            .getState()
            .clearJobRunVisuals(workflow.id, job.job_id);
        }
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
        // Clear the carried-over status ("Workflow starting…" from run(), or
        // "Queued…" if it sat in the queue) once the run actually starts. Node
        // updates set no per-node status text, so without this the "starting"
        // message would linger top-right for the whole run. No "started" toast —
        // the Queue panel/overlay shows the running job.
        if (isRunnerJob) {
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
      const predictionJobId = extractJobId(data);
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
    const jobId = extractJobId(data);

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
      appendTrace(
        "node_error",
        `${update.node_name || update.node_id} error`,
        update,
        {
          nodeId: update.node_id,
          nodeName: update.node_name,
          nodeType: update.node_type
        }
      );
    } else {
      // Intentionally no per-node status text: a "<node> running/completed"
      // line on every node_update is pure churn (and a constant flicker during
      // live slider scrubs). Job-level statusMessages (starting / queued /
      // suspended) still drive the canvas StatusMessage.

      // Silent live-preview jobs (slider scrubs) only refresh the picture —
      // recording per-node status / timing / cost would flash the running
      // ring, "Completed in …" badge and ambient-liveness ring on every frame.
      // The live-generation upsert below still runs, so the image updates.
      const silent = isSilentJob(jobId);

      // Track execution timing (per job)
      if (jobId && !silent) {
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
          appendTrace(
            "node_start",
            `${update.node_name || update.node_id}`,
            update,
            {
              nodeId: update.node_id,
              nodeName: update.node_name,
              nodeType: update.node_type
            }
          );
        } else if (isFinishing) {
          endExecution(workflow.id, jobId, update.node_id);
        }

        setStatus(workflow.id, jobId, update.node_id, update.status);
      }

      if (update.provider_cost && jobId && !silent) {
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
          // Placeholder so a node shows a spinner before its first artifact
          // (generation_complete only fires at commit). A silent scrub reuses
          // one jobId per frame → pin slot 0 (replace), else go index-less so
          // the first generation_complete{index:0} settles this slot in place.
          upsertLiveGeneration(
            workflow.id,
            update.node_id,
            jobId,
            silent
              ? { index: 0, createdAt: Date.now(), status: "running" }
              : { createdAt: Date.now(), status: "running" }
          );
        } else if (update.status === "completed") {
          // Fallback only: non-generator nodes never emit generation_complete,
          // and an old server (§12 version skew) emits none either. Synthesize
          // ONE live generation from node_update.result ONLY if no
          // generation_complete landed for this (jobId, node_id) this run.
          // Index-less → settles the running placeholder in place (newest slot).
          if (!sawGenerationCompleteKeys.has(genKey(jobId, update.node_id))) {
            const raw = update.result;
            const outputs: Record<string, unknown> =
              typeof raw === "object" && raw !== null && !Array.isArray(raw)
                ? (raw as Record<string, unknown>)
                : raw !== undefined && raw !== null
                  ? { output: raw }
                  : {};
            upsertLiveGeneration(workflow.id, update.node_id, jobId, {
              status: "completed",
              outputs,
              cost: update.provider_cost ?? undefined,
              // Stamp the signature so this synthesized output can serve a later
              // Computed cache hit (spec §3.4). Recomputed at completion so a
              // descendant of a generative that ran this job is keyed to the
              // generation it consumed. Undefined when the run didn't record one
              // → not cached, which is fine.
              inputSignature: stampSignatureForCompletion(
                getNodeStore,
                workflow.id,
                jobId,
                update.node_id
              )
            });
          }
          appendTrace(
            "node_complete",
            `${update.node_name || update.node_id}`,
            update,
            {
              nodeId: update.node_id,
              nodeName: update.node_name,
              nodeType: update.node_type
            }
          );
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
