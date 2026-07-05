/**
 * The reactive engine. Owns the per-app runtime store, wires the streaming
 * workflow runner into it, and turns widget events into actions.
 *
 * Streaming model: as the (browser- or server-) runner emits messages, output
 * values land in `store.values[<output name>]`. Bound widgets re-render live.
 * Running the workflow is itself an action a widget triggers — UI as the source
 * of events.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Workflow, WorkflowAttributes } from "../../../stores/ApiTypes";
import {
  createWorkflowRunnerStore,
  MessageHandler,
  MsgpackData
} from "../../../stores/WorkflowRunner";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";
import { runBrowserGraphJob } from "../../../lib/workflow/browserWorkflowRunner";
import { AppAction } from "../types";
import { extractWorkflowIO } from "../workflowIO";
import { buildTriggerSubgraph } from "./buildTriggerSubgraph";
import { createAppRuntimeStore, AppRuntimeStore } from "./appRuntimeStore";
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

export const useAppRuntime = (
  workflow: Workflow | undefined,
  designMode: boolean
): AppRuntimeContextValue => {
  const io = useMemo(() => extractWorkflowIO(workflow), [workflow]);
  const workflowId = workflow?.id;
  const runnerKey = workflowId ?? "app-runtime";

  // Initial reactive values: workflow input defaults.
  const store: AppRuntimeStore = useMemo(() => {
    const initial: Record<string, unknown> = {};
    for (const input of io.inputs) {
      if (input.defaultValue !== undefined) {
        initial[input.name] = input.defaultValue;
      }
    }
    return createAppRuntimeStore(initial);
    // Keyed on workflowId so reactive state survives query refetches; input
    // defaults are read fresh from `io` inside the factory.
  }, [workflowId, io]);

  const runnerStore = useMemo(
    () => createWorkflowRunnerStore(runnerKey),
    [runnerKey]
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
    if (!workflowId) return;

    const runtime = store.getState();
    const baseHandler = runnerStore.getState().messageHandler;

    const handler: MessageHandler = (wf: WorkflowAttributes, data) => {
      try {
        baseHandler(wf, data);
      } catch (error) {
        console.error("AppRuntime base handler error:", error);
      }
      if (wf.id !== workflowId) return;

      switch (data.type) {
        case "output_update": {
          const msg = data as OutputUpdateMessage;
          const key =
            outputMapRef.current.get(msg.node_id) ??
            msg.node_name ??
            msg.output_name;
          if (!key) break;
          // Only string outputs accumulate (streamed text); structured values
          // like an ImageRef replace, so they aren't coerced to "[object Object]".
          if (msg.disposition === "append" && typeof msg.value === "string") {
            const prev = store.getState().values[key];
            store.getState().setValue(key, asString(prev) + msg.value);
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
          if (msg.error) {
            store.getState().setError(msg.error);
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
            store
              .getState()
              .setRunnerState(msg.status === "failed" ? "error" : "idle");
          }
          if (msg.status === "failed" && msg.error) {
            store.getState().setError(msg.error);
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

    runnerStore.getState().setMessageHandler(handler);

    const unsubscribeWorkflow = globalWebSocketManager.subscribe(
      runnerKey,
      (message) => {
        const wf = runnerStore.getState().workflow || workflow;
        if (wf) handler(wf, message as MsgpackData);
      }
    );

    let unsubscribeJob: (() => void) | null = null;
    const updateJobSubscription = (jobId: string | null) => {
      unsubscribeJob?.();
      unsubscribeJob = null;
      if (!jobId) return;
      unsubscribeJob = globalWebSocketManager.subscribe(jobId, (message) => {
        if (message?.workflow_id) return;
        const wf = runnerStore.getState().workflow || workflow;
        if (wf) handler(wf, message as MsgpackData);
      });
    };
    updateJobSubscription(runnerStore.getState().job_id);
    const unsubscribeRunner = runnerStore.subscribe((state, prev) => {
      if (state.job_id !== prev.job_id) updateJobSubscription(state.job_id);
    });

    return () => {
      unsubscribeWorkflow();
      unsubscribeRunner();
      unsubscribeJob?.();
      runtime.setRunnerState("idle");
      runnerStore.getState().setMessageHandler(baseHandler);
    };
  }, [runnerKey, runnerStore, store, workflow, workflowId]);

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
    store.getState().setRunnerState("connecting");

    const nodes = (workflow.graph?.nodes ?? []).map((node) =>
      graphNodeToReactFlowNode(workflow, node)
    );
    const edges = (workflow.graph?.edges ?? []).map((edge) =>
      graphEdgeToReactFlowEdge(edge)
    );

    try {
      store.getState().setRunnerState("running");
      await runnerStore.getState().run(params, workflow, nodes, edges);
    } catch (error) {
      store.getState().setRunnerState("error");
      store
        .getState()
        .setError(error instanceof Error ? error.message : "Run failed");
    }
  }, [designMode, io.inputs, runnerStore, store, workflow]);

  const cancel = useCallback(async () => {
    await runnerStore.getState().cancel();
    store.getState().setRunnerState("idle");
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
      // Its streaming input re-propagates downstream without a restart.
      const runner = runnerStore.getState();
      if (
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

  return useMemo(
    () => ({ store, io, designMode, dispatch, setValue }),
    [store, io, designMode, dispatch, setValue]
  );
};
