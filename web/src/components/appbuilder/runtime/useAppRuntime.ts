/**
 * The reactive engine. Binds the workflow-keyed app runtime store (see
 * appRuntimeStore registry) to the shared per-workflow runner, folds streaming
 * messages into reactive values, and turns widget events into actions.
 *
 * Streaming model: as the (browser- or server-) runner emits messages, output
 * values land in `store.values[<output name>]`. Bound widgets re-render live.
 * Running the workflow is itself an action a widget triggers — UI as the source
 * of events.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Workflow } from "../../../stores/ApiTypes";
import {
  getWorkflowRunnerStore,
  WorkflowRunner,
  MsgpackData
} from "../../../stores/WorkflowRunner";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";
import { runBrowserGraphJob } from "../../../lib/workflow/browserWorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { nodeErrorToDisplayString } from "../../../stores/ErrorStore";
import { AppAction } from "../types";
import { extractWorkflowIO } from "../workflowIO";
import { seedInputValue } from "../inputProperty";
import {
  collectNodePropertyOverlays,
  isNodePropertyBinding,
  withNodeProperties
} from "../nodeBinding";
import { buildTriggerSubgraph } from "./buildTriggerSubgraph";
import {
  createAppRuntimeStore,
  getAppRuntimeStore,
  AppRuntimeStore,
  RuntimeRunnerState
} from "./appRuntimeStore";
import { AppRuntimeContextValue } from "./AppRuntimeContext";

interface OutputUpdateMessage {
  type: "output_update";
  node_id: string;
  node_name?: string;
  output_name: string;
  output_type?: string;
  value: unknown;
  disposition?: "append" | "replace";
}

interface ChunkMessage {
  type: "chunk";
  node_id: string;
  content_type?: string;
  content?: unknown;
  done?: boolean;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

/** Collapse the shared runner's state machine into the app-facing one. */
const toRuntimeRunnerState = (
  state: WorkflowRunner["state"]
): RuntimeRunnerState => {
  switch (state) {
    case "connecting":
      return "connecting";
    case "connected":
    case "running":
    case "paused":
    case "suspended":
      return "running";
    case "error":
      return "error";
    default:
      return "idle";
  }
};

export const useAppRuntime = (
  workflow: Workflow | undefined,
  designMode: boolean
): AppRuntimeContextValue => {
  const io = useMemo(() => extractWorkflowIO(workflow), [workflow]);
  const workflowId = workflow?.id;

  // The live runtime store comes from the workflow-keyed registry so values
  // survive unmounts (View↔Edit tab switches, refetches yielding a new
  // workflow object). Seeding fills only missing keys: workflow input defaults
  // plus the select/boolean fallbacks the controls display, so an untouched
  // form runs with what it shows — without clobbering values the user typed or
  // a previous run streamed. Design canvases get an ephemeral store: widget
  // writes there must not leak into the published app's state.
  const store: AppRuntimeStore = useMemo(() => {
    const target =
      designMode || !workflowId
        ? createAppRuntimeStore()
        : getAppRuntimeStore(workflowId);
    const values = target.getState().values;
    const missing: Record<string, unknown> = {};
    for (const input of io.inputs) {
      if (values[input.name] !== undefined) continue;
      const seed = seedInputValue(input);
      if (seed !== undefined) {
        missing[input.name] = seed;
      }
    }
    if (Object.keys(missing).length > 0) {
      target.getState().setValues(missing);
    }
    return target;
  }, [designMode, workflowId, io]);

  // The shared per-workflow runner (same instance the graph editor, jobs panel
  // and frontend tools use), so busy/queue/cancel state is consistent across
  // views and a run started in one surface is visible in the other.
  const runnerStore = useMemo(
    () => getWorkflowRunnerStore(workflowId ?? "__app_runtime__"),
    [workflowId]
  );

  // Map output node id -> reactive state key (the node name).
  const outputKeyByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const output of io.outputs) {
      map.set(output.nodeId, output.name);
    }
    return map;
  }, [io.outputs]);

  // Stable refs so the subscription effect doesn't re-run on every value change.
  const outputKeysRef = useRef<string[]>([]);
  outputKeysRef.current = io.outputs.map((o) => o.name);
  const outputMapRef = useRef(outputKeyByNodeId);
  outputMapRef.current = outputKeyByNodeId;

  useEffect(() => {
    if (!workflowId || designMode) return;

    // Fold processing messages into the app's reactive values. Protocol-level
    // handling (runner state machine, ResultsStore, node stores) already runs
    // via the workflow-manager subscription installed when the workflow was
    // opened — calling into it here would double-append streamed output.
    const handler = (data: MsgpackData) => {
      switch (data.type) {
        case "output_update": {
          const msg = data as OutputUpdateMessage;
          const key =
            outputMapRef.current.get(msg.node_id) ??
            msg.node_name ??
            msg.output_name;
          if (!key) break;
          // Appended text concatenates (protocol semantics — same as the "chunk"
          // path below and the CLI app runtime); splitting it into a list would
          // render one streamed string as separate Markdown blocks. Structured
          // items still collect into a list (one part per emitted item, like
          // ResultsStore and the old mini-app result cards); a single item stays
          // bare. Replace stays replace. Per the protocol, an ABSENT
          // disposition appends — only an explicit "replace" replaces (older
          // servers omit the field on streamed chunks).
          if (msg.disposition !== "replace") {
            const prev = store.getState().values[key];
            if (typeof msg.value === "string") {
              store.getState().setValue(key, asString(prev) + msg.value);
            } else if (prev === undefined) {
              store.getState().setValue(key, msg.value);
            } else if (Array.isArray(prev)) {
              store.getState().setValue(key, [...prev, msg.value]);
            } else {
              store.getState().setValue(key, [prev, msg.value]);
            }
          } else {
            store.getState().setValue(key, msg.value);
          }
          break;
        }
        case "chunk": {
          const msg = data as ChunkMessage;
          if (msg.content_type && msg.content_type !== "text") break;
          const key = outputMapRef.current.get(msg.node_id);
          if (!key) break;
          const prev = store.getState().values[key];
          store.getState().setValue(key, asString(prev) + asString(msg.content));
          break;
        }
        case "node_progress": {
          const msg = data as {
            progress?: number;
            total?: number;
          };
          if (
            typeof msg.total === "number" &&
            msg.total > 0 &&
            typeof msg.progress === "number"
          ) {
            store.getState().setProgress({
              current: msg.progress,
              total: msg.total
            });
          } else {
            store.getState().setProgress(null);
          }
          break;
        }
        case "node_update": {
          const msg = data as { error?: string };
          const nodeError = nodeErrorToDisplayString(msg.error);
          if (nodeError) {
            store.getState().setError(nodeError);
          }
          break;
        }
        case "job_update": {
          const msg = data as {
            status?: string;
            error?: string;
            duration?: number;
          };
          if (
            msg.status === "completed" ||
            msg.status === "failed" ||
            msg.status === "cancelled" ||
            msg.status === "timed_out"
          ) {
            store.getState().setProgress(null);
          }
          if (msg.status === "failed") {
            const jobError = nodeErrorToDisplayString(msg.error);
            if (jobError) store.getState().setError(jobError);
          }
          if (msg.status === "completed" && msg.duration != null) {
            store.getState().setLastRunDuration(msg.duration);
          }
          break;
        }
        default:
          break;
      }
    };

    const unsubscribeWorkflow = globalWebSocketManager.subscribe(
      workflowId,
      (message) => handler(message as MsgpackData)
    );

    let unsubscribeJob: (() => void) | null = null;
    const updateJobSubscription = (jobId: string | null) => {
      unsubscribeJob?.();
      unsubscribeJob = null;
      if (!jobId) return;
      unsubscribeJob = globalWebSocketManager.subscribe(jobId, (message) => {
        if (message?.workflow_id) return;
        handler(message as MsgpackData);
      });
    };
    updateJobSubscription(runnerStore.getState().job_id);

    // Mirror the shared runner's state (mapped to the app vocabulary) so
    // widgets reflect a run regardless of which surface started it — and,
    // because the shared runner outlives this component, a remount mid-run
    // shows "running" again instead of resetting to idle.
    store.getState().setRunnerState(
      toRuntimeRunnerState(runnerStore.getState().state)
    );

    // Backfill outputs the app hasn't seen from the runner's current/last job
    // (a run started in the graph editor, or finished while this view was
    // closed). Only empty keys: values the app already holds — a live fold or
    // a fresher reactive scrub — win over the job-keyed result buffer.
    const lastJobId = runnerStore.getState().job_id;
    if (lastJobId) {
      const results = useResultsStore.getState();
      for (const output of io.outputs) {
        if (store.getState().values[output.name] !== undefined) continue;
        const result = results.getOutputResult(
          workflowId,
          lastJobId,
          output.nodeId
        );
        if (result === undefined) continue;
        // ResultsStore accumulates appended items into arrays; the live fold
        // concatenates streamed text instead, so collapse an all-string buffer
        // back to one string to hydrate the same value either path produced.
        // Structured item lists pass through untouched.
        const hydrated =
          Array.isArray(result) && result.every((r) => typeof r === "string")
            ? result.join("")
            : result;
        store.getState().setValue(output.name, hydrated);
      }
    }
    const unsubscribeRunner = runnerStore.subscribe((state, prev) => {
      if (state.job_id !== prev.job_id) updateJobSubscription(state.job_id);
      if (state.state !== prev.state) {
        store.getState().setRunnerState(toRuntimeRunnerState(state.state));
      }
    });

    return () => {
      unsubscribeWorkflow();
      unsubscribeRunner();
      unsubscribeJob?.();
    };
  }, [designMode, io, runnerStore, store, workflowId]);

  const run = useCallback(async () => {
    if (!workflow || designMode) return;
    const values = store.getState().values;
    const params: Record<string, unknown> = {};
    for (const input of io.inputs) {
      const value = values[input.name];
      if (value !== undefined) params[input.name] = value;
    }

    store.getState().clearOutputs(outputKeysRef.current);
    store.getState().setError(null);

    // Node-property bindings overlay their live widget values onto the graph
    // before the run, so a slider bound to e.g. a model's `strength` drives
    // the actual node property.
    const overlays = collectNodePropertyOverlays(values);
    const nodes = (workflow.graph?.nodes ?? []).map((node) => {
      const rf = graphNodeToReactFlowNode(workflow, node);
      const overlay = overlays.get(rf.id);
      return overlay ? withNodeProperties(rf, overlay) : rf;
    });
    const edges = (workflow.graph?.edges ?? []).map((edge) =>
      graphEdgeToReactFlowEdge(edge)
    );

    // Runner state is mirrored from the shared store's transitions
    // (connecting → running → terminal), so no manual toggling here.
    try {
      await runnerStore.getState().run(params, workflow, nodes, edges);
    } catch (error) {
      store
        .getState()
        .setError(error instanceof Error ? error.message : "Run failed");
    }
  }, [designMode, io.inputs, runnerStore, store, workflow]);

  const cancel = useCallback(async () => {
    await runnerStore.getState().cancel();
    store.getState().setProgress(null);
  }, [runnerStore, store]);

  // Reactive trigger: recompute only the subgraph downstream of a bound input.
  // Runs are coalesced — one in flight, latest value wins — and reuse a single
  // job id so a scrub upserts one live result instead of flooding new ones. The
  // run streams through the same deliverLocal pipeline as a full run, so bound
  // display widgets update identically. No runner-state toggling: a slider
  // scrub is a live update, not a "run", so the UI never flashes "Running…".
  const reactiveJobIdRef = useRef<string>("");
  if (reactiveJobIdRef.current === "") {
    reactiveJobIdRef.current = crypto.randomUUID();
  }
  const reactiveInFlightRef = useRef(false);
  const reactivePendingRef = useRef<string | null>(null);
  const reactiveRunRef = useRef<(triggerInput: string) => void>(() => {});
  // The first trigger runs the whole graph, so computed upstreams (a generated
  // image, a constant) populate their caches. Later triggers reuse those caches
  // and only recompute the downstream subgraph.
  const hasRunFullRef = useRef(false);
  useEffect(() => {
    hasRunFullRef.current = false;
  }, [workflowId]);

  const reactiveRun = useCallback(
    (triggerInput: string) => {
      if (!workflow || designMode) return;

      // A graph is already running (a long-lived / streaming workflow): feed the
      // new value into the live job instead of starting a fresh subgraph run.
      // Its streaming input re-propagates downstream without a restart. Only
      // input-name bindings can stream — a node-property change falls through
      // to a subgraph run.
      const runner = runnerStore.getState();
      if (
        !isNodePropertyBinding(triggerInput) &&
        runner.job_id &&
        (runner.state === "running" ||
          runner.state === "connecting" ||
          runner.state === "connected")
      ) {
        void runner.streamInput(
          triggerInput,
          store.getState().values[triggerInput]
        );
        return;
      }

      // First interaction: run the whole graph so every output renders and
      // computed upstreams cache their results for later subgraph runs.
      if (!hasRunFullRef.current) {
        hasRunFullRef.current = true;
        void run();
        return;
      }

      if (reactiveInFlightRef.current) {
        reactivePendingRef.current = triggerInput;
        return;
      }
      const sub = buildTriggerSubgraph(
        workflow,
        io,
        store.getState().values,
        triggerInput
      );
      // No browser-runnable subgraph that reaches an output (unknown input, a
      // server-only compute tail) — fall back to a full authoritative run.
      if (!sub) {
        void run();
        return;
      }
      reactiveInFlightRef.current = true;
      store.getState().setError(null);
      void runBrowserGraphJob({
        graph: sub.graph,
        workflowId: workflow.id,
        jobId: reactiveJobIdRef.current
      })
        .catch((error) => {
          store
            .getState()
            .setError(error instanceof Error ? error.message : "Run failed");
        })
        .finally(() => {
          reactiveInFlightRef.current = false;
          const pending = reactivePendingRef.current;
          if (pending !== null) {
            reactivePendingRef.current = null;
            // Re-run from fresh store values — the slider has moved on.
            reactiveRunRef.current(pending);
          }
        });
    },
    [designMode, io, run, runnerStore, store, workflow]
  );
  reactiveRunRef.current = reactiveRun;

  const dispatch = useCallback(
    (action: AppAction) => {
      if (designMode) return;
      switch (action.kind) {
        case "run":
          // A run triggered from a bound input recomputes just its downstream
          // subgraph; an unbound run (a button) runs the whole workflow.
          if (action.from) reactiveRun(action.from);
          else void run();
          break;
        case "cancel":
          void cancel();
          break;
        case "setState":
          store.getState().setValue(action.key, action.value);
          break;
        case "toggleState":
          store.getState().toggleValue(action.key);
          break;
        default:
          break;
      }
    },
    [cancel, designMode, reactiveRun, run, store]
  );

  const setValue = useCallback(
    (key: string, value: unknown) => store.getState().setValue(key, value),
    [store]
  );

  const getNodeProperty = useCallback(
    (nodeId: string, property: string): unknown => {
      const node = workflow?.graph?.nodes?.find((n) => n.id === nodeId);
      if (!node) return undefined;
      const data = (node.data ?? {}) as Record<string, unknown>;
      if (data[property] !== undefined) return data[property];
      const meta = useMetadataStore.getState().getMetadata(node.type);
      return meta?.properties.find((p) => p.name === property)?.default;
    },
    [workflow]
  );

  return useMemo(
    () => ({ store, io, designMode, dispatch, setValue, getNodeProperty }),
    [store, io, designMode, dispatch, setValue, getNodeProperty]
  );
};
