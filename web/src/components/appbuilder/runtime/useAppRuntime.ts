/**
 * The reactive engine.
 *
 * Binds an app-instance store to the shared per-workflow runner, folds the
 * run's streaming messages into namespaced state, and turns widget actions into
 * runs. All the semantics — what a message does to a value, which invocation
 * owns a slot, how an action reads — live in `@nodetool-ai/app-runtime`; this
 * hook is the web adapter around them.
 *
 * Run identity is the load-bearing part: every invocation this app starts is
 * registered by its `job_id`, and a streaming message for any other job is
 * dropped. Overlapping runs, a second tab, and runs started in the graph editor
 * no longer fold into what the app shows.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  DEFAULT_OPERATION_ID,
  messageToEvents,
  parseInputStateKey,
  resolveBinding,
  stateKey,
  type AppAction,
  type BindingRef,
  type BindingScope,
  type InvocationState
} from "@nodetool-ai/app-runtime";

import { Workflow } from "../../../stores/ApiTypes";
import {
  getWorkflowRunnerStore,
  MsgpackData
} from "../../../stores/WorkflowRunner";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";
import { runBrowserGraphJob } from "../../../lib/workflow/browserWorkflowRunner";
import useMetadataStore from "../../../stores/MetadataStore";
import { extractWorkflowIO } from "../workflowIO";
import { extractVariableNames } from "../workflowState";
import { seedInputValue } from "../inputProperty";
import { collectNodePropertyOverlays, withNodeProperties } from "../nodeBinding";
import { buildTriggerSubgraph } from "./buildTriggerSubgraph";
import {
  createAppRuntimeStore,
  getAppRuntimeStore,
  workflowInstanceId,
  AppRuntimeStore
} from "./appRuntimeStore";
import { AppRuntimeContextValue } from "./AppRuntimeContext";

const now = (): number => Date.now();

export const useAppRuntime = (
  workflow: Workflow | undefined,
  designMode: boolean
): AppRuntimeContextValue => {
  const io = useMemo(() => extractWorkflowIO(workflow), [workflow]);
  const workflowId = workflow?.id;

  // Everything a stored binding string can resolve against. Legacy documents
  // bind by name; the scope turns those names into node IDs once, here, so a
  // later rename in the graph editor is invisible to the app.
  const scope: BindingScope = useMemo(
    () => ({
      defaultOperationId: DEFAULT_OPERATION_ID,
      operations: [
        {
          operationId: DEFAULT_OPERATION_ID,
          inputs: io.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
          outputs: io.outputs.map(({ nodeId, name }) => ({ nodeId, name })),
          nodeIds: (workflow?.graph?.nodes ?? []).map((n) => n.id),
          variableNames: extractVariableNames(workflow)
        }
      ],
      variables: []
    }),
    [io, workflow]
  );

  const inputKey = useCallback(
    (nodeId: string) =>
      stateKey({ kind: "input", operationId: DEFAULT_OPERATION_ID, nodeId }),
    []
  );
  const outputKey = useCallback(
    (nodeId: string) =>
      stateKey({ kind: "output", operationId: DEFAULT_OPERATION_ID, nodeId }),
    []
  );

  // A design canvas gets an ephemeral store: widget writes there must not leak
  // into the published app's state. A live app keeps its store in the instance
  // registry so values survive View↔Edit tab switches and refetches.
  const store: AppRuntimeStore = useMemo(() => {
    const target =
      designMode || !workflowId
        ? createAppRuntimeStore()
        : getAppRuntimeStore(workflowInstanceId(workflowId));
    // Seeding fills only slots that have no value: workflow input defaults plus
    // the select/boolean fallbacks the controls display, so an untouched form
    // runs with what it shows.
    const values: Record<string, unknown> = {};
    for (const input of io.inputs) {
      const seed = seedInputValue(input);
      if (seed !== undefined) values[inputKey(input.nodeId)] = seed;
    }
    target.getState().dispatchEvent({ type: "seedInputs", values });
    return target;
  }, [designMode, workflowId, io, inputKey]);

  // The shared per-workflow runner (same instance the graph editor, jobs panel
  // and frontend tools use), so busy/queue/cancel state is consistent across
  // views.
  const runnerStore = useMemo(
    () => getWorkflowRunnerStore(workflowId ?? "__app_runtime__"),
    [workflowId]
  );

  const outputNodeIds = useMemo(
    () => new Set(io.outputs.map((o) => o.nodeId)),
    [io.outputs]
  );
  const outputNodeIdsRef = useRef(outputNodeIds);
  outputNodeIdsRef.current = outputNodeIds;

  // Invocations this app started, by job id. A streaming message for anything
  // else is not ours — that is the whole cross-run contamination fix.
  const ownedRef = useRef(new Map<string, InvocationState>());
  // Messages that arrived between dispatching a run and learning its job id.
  const pendingRef = useRef<MsgpackData[]>([]);
  const awaitingJobRef = useRef(0);

  const foldRef = useRef<(message: MsgpackData) => void>(() => {});

  const fold = useCallback(
    (message: MsgpackData) => {
      const events = messageToEvents(message as Record<string, unknown>, {
        resolveInvocation: (jobId) =>
          jobId ? ownedRef.current.get(jobId) ?? null : null,
        outputKey: (_operationId, nodeId) =>
          outputNodeIdsRef.current.has(nodeId) ? outputKey(nodeId) : null
      });
      for (const event of events) {
        store.getState().dispatchEvent(event);
        if (event.type === "invocationStatus") {
          const invocation = ownedRef.current.get(event.invocationId);
          if (invocation) invocation.status = event.status;
        }
      }
    },
    [outputKey, store]
  );
  foldRef.current = fold;

  /** Register a run this app started and flush anything buffered for it. */
  const claimInvocation = useCallback(
    (jobId: string, clearOutputs: boolean) => {
      const invocation: InvocationState = {
        id: jobId,
        operationId: DEFAULT_OPERATION_ID,
        status: "running",
        startedAt: now()
      };
      ownedRef.current.set(jobId, invocation);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation,
        outputKeys: clearOutputs
          ? io.outputs.map((output) => outputKey(output.nodeId))
          : []
      });
      const buffered = pendingRef.current;
      pendingRef.current = [];
      for (const message of buffered) foldRef.current(message);
    },
    [io.outputs, outputKey, store]
  );

  useEffect(() => {
    if (!workflowId || designMode) return;

    // Protocol-level handling (runner state machine, ResultsStore, node stores)
    // already runs via the workflow-manager subscription installed when the
    // workflow was opened — calling into it here would double-append.
    const handler = (message: MsgpackData) => {
      const jobId = (message as Record<string, unknown>).job_id;
      if (typeof jobId === "string" && ownedRef.current.has(jobId)) {
        foldRef.current(message);
        return;
      }
      // A run we started but whose job id has not come back yet. Buffer rather
      // than drop, then replay once the id is known.
      if (awaitingJobRef.current > 0) pendingRef.current.push(message);
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

    const unsubscribeRunner = runnerStore.subscribe((state, prev) => {
      if (state.job_id !== prev.job_id) updateJobSubscription(state.job_id);
    });

    return () => {
      unsubscribeWorkflow();
      unsubscribeRunner();
      unsubscribeJob?.();
    };
  }, [designMode, runnerStore, workflowId]);

  const run = useCallback(async () => {
    if (!workflow || designMode) return;
    const state = store.getState();
    const params: Record<string, unknown> = {};
    for (const input of io.inputs) {
      const value = state.inputs[inputKey(input.nodeId)]?.value;
      if (value !== undefined) params[input.name] = value;
    }

    // Node-property bindings overlay their live widget values onto the graph
    // before the run, so a slider bound to e.g. a model's `strength` drives the
    // actual node property.
    const overlays = collectNodePropertyOverlays(state.inputs);
    const nodes = (workflow.graph?.nodes ?? []).map((node) => {
      const rf = graphNodeToReactFlowNode(workflow, node);
      const overlay = overlays.get(rf.id);
      return overlay ? withNodeProperties(rf, overlay) : rf;
    });
    const edges = (workflow.graph?.edges ?? []).map((edge) =>
      graphEdgeToReactFlowEdge(edge)
    );

    awaitingJobRef.current += 1;
    try {
      const jobId = await runnerStore
        .getState()
        .run(params, workflow, nodes, edges);
      claimInvocation(jobId, true);
    } catch (error) {
      pendingRef.current = [];
      const message = error instanceof Error ? error.message : "Run failed";
      const failed: InvocationState = {
        id: `failed-${now()}`,
        operationId: DEFAULT_OPERATION_ID,
        status: "failed",
        error: message,
        startedAt: now()
      };
      ownedRef.current.set(failed.id, failed);
      store
        .getState()
        .dispatchEvent({ type: "runStarted", invocation: failed, outputKeys: [] });
    } finally {
      awaitingJobRef.current -= 1;
    }
  }, [claimInvocation, designMode, inputKey, io.inputs, runnerStore, store, workflow]);

  const cancel = useCallback(async () => {
    await runnerStore.getState().cancel();
    for (const [id, invocation] of ownedRef.current) {
      if (invocation.status !== "running" && invocation.status !== "pending") {
        continue;
      }
      invocation.status = "cancelled";
      store
        .getState()
        .dispatchEvent({ type: "invocationStatus", invocationId: id, status: "cancelled" });
    }
  }, [runnerStore, store]);

  // Reactive trigger: recompute only the subgraph downstream of a bound input.
  // Runs are coalesced — one in flight, latest value wins — and reuse a single
  // job id so a scrub upserts one live result instead of flooding new ones. No
  // runner-state toggling: a slider scrub is a live update, not a "run", so the
  // UI never flashes "Running…".
  const reactiveJobIdRef = useRef<string>("");
  if (reactiveJobIdRef.current === "") {
    reactiveJobIdRef.current = crypto.randomUUID();
  }
  const reactiveInFlightRef = useRef(false);
  const reactivePendingRef = useRef<BindingRef | null>(null);
  const reactiveRunRef = useRef<(trigger: BindingRef) => void>(() => {});
  // The first trigger runs the whole graph, so computed upstreams (a generated
  // image, a constant) populate their caches. Later triggers reuse those caches
  // and only recompute the downstream subgraph.
  const hasRunFullRef = useRef(false);
  useEffect(() => {
    hasRunFullRef.current = false;
  }, [workflowId]);

  const reactiveRun = useCallback(
    (trigger: BindingRef) => {
      if (!workflow || designMode) return;

      // A graph is already running (a long-lived / streaming workflow): feed the
      // new value into the live job instead of starting a fresh subgraph run.
      // Its streaming input re-propagates downstream without a restart. Only
      // input-node bindings can stream — a node-property change falls through to
      // a subgraph run.
      const runner = runnerStore.getState();
      if (
        trigger.kind === "input" &&
        runner.job_id &&
        ownedRef.current.has(runner.job_id) &&
        (runner.state === "running" ||
          runner.state === "connecting" ||
          runner.state === "connected")
      ) {
        const input = io.inputs.find((i) => i.nodeId === trigger.nodeId);
        if (input) {
          void runner.streamInput(
            input.name,
            store.getState().inputs[inputKey(trigger.nodeId)]?.value
          );
          return;
        }
      }

      if (!hasRunFullRef.current) {
        hasRunFullRef.current = true;
        void run();
        return;
      }

      if (reactiveInFlightRef.current) {
        reactivePendingRef.current = trigger;
        return;
      }
      const sub = buildTriggerSubgraph(
        workflow,
        io,
        store.getState(),
        trigger,
        (type) => useMetadataStore.getState().getMetadata(type)?.effect
      );
      // No browser-runnable subgraph that reaches an output (unknown input, a
      // server-only compute tail, an effectful node the reactive gate refuses)
      // — fall back to a full authoritative run.
      if (!sub) {
        void run();
        return;
      }
      reactiveInFlightRef.current = true;
      if (!ownedRef.current.has(reactiveJobIdRef.current)) {
        claimInvocation(reactiveJobIdRef.current, false);
      }
      void runBrowserGraphJob({
        graph: sub.graph,
        workflowId: workflow.id,
        jobId: reactiveJobIdRef.current
      })
        .catch((error) => {
          store.getState().dispatchEvent({
            type: "invocationError",
            invocationId: reactiveJobIdRef.current,
            error: error instanceof Error ? error.message : "Run failed"
          });
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
    [claimInvocation, designMode, inputKey, io, run, runnerStore, store, workflow]
  );
  reactiveRunRef.current = reactiveRun;

  const write = useCallback(
    (ref: BindingRef, value: unknown) => {
      const key = stateKey(ref);
      const dispatchEvent = store.getState().dispatchEvent;
      switch (ref.kind) {
        case "variable":
          dispatchEvent({ type: "setVariable", variableId: ref.variableId, value });
          break;
        case "view":
          dispatchEvent({ type: "setView", key, value });
          break;
        default:
          dispatchEvent({ type: "setInput", key, value });
      }
    },
    [store]
  );

  const dispatch = useCallback(
    (action: AppAction) => {
      if (designMode) return;
      switch (action.kind) {
        case "run": {
          // A run triggered from a bound input recomputes just its downstream
          // subgraph; an unbound run (a button) runs the whole workflow.
          const trigger = resolveBinding(action.from, scope, "write");
          if (trigger) reactiveRun(trigger);
          else void run();
          break;
        }
        case "cancel":
          void cancel();
          break;
        case "setVariable":
          store.getState().dispatchEvent({
            type: "setVariable",
            variableId: action.variableId,
            value: action.value
          });
          break;
        case "toggleVariable":
          store
            .getState()
            .dispatchEvent({ type: "toggleVariable", variableId: action.variableId });
          break;
        default:
          // Resource actions arrive with P4; nothing to dispatch yet.
          break;
      }
    },
    [cancel, designMode, reactiveRun, run, scope, store]
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
    () => ({ store, io, scope, designMode, dispatch, write, getNodeProperty }),
    [store, io, scope, designMode, dispatch, write, getNodeProperty]
  );
};
