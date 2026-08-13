/**
 * The reactive engine.
 *
 * Binds an app-instance store to the workflow runners its operations target,
 * folds each run's streaming messages into namespaced state, and turns widget
 * actions into runs. All the semantics — what a message does to a value, which
 * invocation owns a slot, what a collision with a live run means — live in
 * `@nodetool-ai/app-runtime`; this hook is the web adapter around them.
 *
 * Run identity is the load-bearing part: every invocation this app starts is
 * registered by its `job_id`, and a streaming message for any other job is
 * dropped. Overlapping runs, a second tab, and runs started in the graph editor
 * no longer fold into what the app shows.
 *
 * An app may bind several operations, each over its own workflow. Every
 * operation gets its own runner store, its own IO, and its own invocations, so
 * a `run` action naming an operation runs that operation — never operation 0
 * against the host workflow.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  decideRun,
  implicitOperation,
  initialVariableValues,
  isLiveInvocation,
  liveInvocations,
  mergeVariables,
  messageToEvents,
  operationTarget,
  resolveBinding,
  resolveOperationParams,
  scriptInvocationInput,
  scriptRunMessages,
  stateKey,
  type AppAction,
  type ApplicationDocument,
  type BindingRef,
  type BindingScope,
  type InvocationState,
  type OperationBinding,
  type ResourceRef,
  type ScriptRunResult
} from "@nodetool-ai/app-runtime";
import { usesStreamInputContract } from "@nodetool-ai/node-sdk/code-body";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

import { Workflow } from "../../../stores/ApiTypes";
import {
  getWorkflowRunnerStore,
  MsgpackData,
  WorkflowRunnerStore
} from "../../../stores/WorkflowRunner";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";
import { runBrowserGraphJob } from "../../../lib/workflow/browserWorkflowRunner";
import useMetadataStore from "../../../stores/MetadataStore";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { trpcClient } from "../../../trpc/client";
import { runJsScript } from "../../jsScript/runJsScript";
import { useOperationScripts } from "../useOperationScripts";
import { extractScriptIO, extractWorkflowIO, WorkflowIO } from "../workflowIO";
import { extractVariableNames } from "../workflowState";
import { seedInputValue } from "../inputProperty";
import { collectNodePropertyOverlays, withNodeProperties } from "../nodeBinding";
import { buildTriggerSubgraph } from "./buildTriggerSubgraph";
import {
  appInstanceId,
  createAppRuntimeStore,
  getAppRuntimeStore,
  AppRuntimeStore
} from "./appRuntimeStore";
import {
  appVariableIdentity,
  loadPersistedVariables,
  savePersistedVariables
} from "./variablePersistence";
import { AppRuntimeContextValue } from "./AppRuntimeContext";

const now = (): number => Date.now();

const EMPTY_IO: WorkflowIO = { inputs: [], outputs: [] };

/** Everything one bound operation needs to run: its graph, IO, and runner. */
interface OperationRuntime {
  operation: OperationBinding;
  /** Undefined while the operation's workflow is still loading, or missing. */
  workflow: Workflow | undefined;
  /**
   * The script this operation runs, for a script target. Undefined while it
   * loads, or when the operation runs a workflow — the two are exclusive.
   */
  script: { id: string; document: JsScriptDocument } | undefined;
  io: WorkflowIO;
  runnerStore: WorkflowRunnerStore;
}

/** Per-operation bookkeeping for coalesced reactive (subgraph) runs. */
interface ReactiveRunState {
  jobId: string;
  inFlight: boolean;
  pending: BindingRef | null;
  hasRunFull: boolean;
}

export interface AppRuntimeOptions {
  /**
   * The app document, when the app has one. A legacy app running straight off
   * a workflow gets a synthesized single-operation document instead, so both
   * shapes take one code path.
   */
  document?: ApplicationDocument;
  /**
   * The application record this app belongs to. Sent with every run so the
   * server can check the app's spend budget before creating the job and settle
   * the ledger afterwards. Absent for an app that has no record yet.
   */
  application?: { id: string; version?: number };
  /**
   * Workflow graphs supplied by the caller, by workflow id — the graphs a
   * release pinned. An operation whose workflow is here runs that exact graph
   * instead of fetching the live one.
   */
  workflowOverrides?: Record<string, Workflow>;
  /** Open a resource in its own editor. The runtime only knows which one. */
  onOpenResource?: (resourceBindingId: string, ref: ResourceRef) => void;
  /** Run a provider command (upload, delete, …) against a resource binding. */
  onResourceCommand?: (
    resourceBindingId: string,
    command: string,
    ref: ResourceRef | undefined
  ) => void | Promise<void>;
}

export const useAppRuntime = (
  workflow: Workflow | undefined,
  designMode: boolean,
  options: AppRuntimeOptions = {}
): AppRuntimeContextValue => {
  const {
    application,
    document,
    workflowOverrides,
    onOpenResource,
    onResourceCommand
  } = options;
  const workflowId = workflow?.id;
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);

  // Every operation the app binds. A legacy app running straight off a
  // workflow has none declared, so it gets the implicit one.
  const operations = useMemo<OperationBinding[]>(() => {
    const declared = document?.operations ?? [];
    return declared.length > 0 ? declared : [implicitOperation(workflowId ?? "")];
  }, [document, workflowId]);

  // Operations over a workflow this view did not already load. Fetched once
  // each, so a two-operation app addresses two different graphs.
  const extraWorkflowIds = useMemo(() => {
    const ids = new Set<string>();
    for (const operation of operations) {
      const id = operation.workflowId;
      if (!id || id === workflowId || workflowOverrides?.[id]) continue;
      ids.add(id);
    }
    return [...ids].sort();
  }, [operations, workflowId, workflowOverrides]);

  // Scripts the app's operations run. The run endpoint executes the *saved*
  // document, so the draft always runs the latest — the pinned version in the
  // target says which one the app was authored against, not which one runs.
  const fetchedScripts = useOperationScripts(operations);
  const fetchedScriptsRef = useRef(fetchedScripts);
  fetchedScriptsRef.current = fetchedScripts;
  const fetchedScriptsKey = [...fetchedScripts.keys()].join("|");

  const extraWorkflows = useQueries({
    queries: extraWorkflowIds.map((id) => ({
      queryKey: ["app-operation-workflow", id],
      queryFn: async () => await fetchWorkflow(id),
      enabled: !designMode,
      staleTime: 60_000,
      retry: false
    }))
  });

  const fetched = new Map<string, Workflow>();
  extraWorkflowIds.forEach((id, index) => {
    const data = extraWorkflows[index]?.data;
    if (data) fetched.set(id, data);
  });
  const fetchedRef = useRef(fetched);
  fetchedRef.current = fetched;
  const fetchedKey = [...fetched.keys()].join("|");

  const operationRuntimes = useMemo(() => {
    const map = new Map<string, OperationRuntime>();
    for (const operation of operations) {
      const target = operationTarget(operation);
      if (target.kind === "script") {
        const script = fetchedScriptsRef.current.get(target.scriptId);
        map.set(operation.id, {
          operation,
          workflow: undefined,
          script: script ? { id: target.scriptId, document: script } : undefined,
          // A script's ports are its bindable surface; its name-keyed mappings
          // resolve against them the way a graph's resolve against node ids.
          io: extractScriptIO(script),
          // Never used for a script run, but every entry carries one so the
          // rest of the hook needs no null check.
          runnerStore: getWorkflowRunnerStore(
            workflowId || "__app_runtime__"
          )
        });
        continue;
      }
      const targetId = target.workflowId;
      const graph =
        !targetId || targetId === workflowId
          ? workflow
          : workflowOverrides?.[targetId] ?? fetchedRef.current.get(targetId);
      map.set(operation.id, {
        operation,
        workflow: graph,
        script: undefined,
        io: extractWorkflowIO(graph),
        runnerStore: getWorkflowRunnerStore(
          targetId || workflowId || "__app_runtime__"
        )
      });
    }
    return map;
    // `fetchedKey`/`fetchedScriptsKey` track which operation workflows and
    // scripts have arrived; the documents themselves are read from the refs so
    // the dep list stays fixed-length.
  }, [
    fetchedKey,
    fetchedScriptsKey,
    operations,
    workflow,
    workflowId,
    workflowOverrides
  ]);

  const operationRuntimesRef = useRef(operationRuntimes);
  operationRuntimesRef.current = operationRuntimes;

  const defaultOperation = operations[0];
  // The host workflow's own surface, which the legacy single-operation
  // contract (and every widget that does not name an operation) reads.
  const io = operationRuntimes.get(defaultOperation.id)?.io ?? EMPTY_IO;

  // Everything a stored binding string can resolve against. Legacy documents
  // bind by name; the scope turns those names into node IDs once, here, so a
  // later rename in the graph editor is invisible to the app.
  const scope: BindingScope = useMemo(
    () => ({
      defaultOperationId: defaultOperation.id,
      operations: [...operationRuntimes.values()].map((entry) => ({
        operationId: entry.operation.id,
        inputs: entry.io.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
        outputs: entry.io.outputs.map(({ nodeId, name }) => ({ nodeId, name })),
        nodeIds: (entry.workflow?.graph?.nodes ?? []).map((node) => node.id),
        variableNames: extractVariableNames(entry.workflow)
      })),
      variables: mergeVariables(
        document?.variables ?? [],
        [...operationRuntimes.values()].flatMap((entry) =>
          extractVariableNames(entry.workflow)
        )
      )
    }),
    [defaultOperation.id, document, operationRuntimes]
  );

  const outputKey = useCallback(
    (operationId: string, nodeId: string) =>
      stateKey({ kind: "output", operationId, nodeId }),
    []
  );

  // The app's identity — its application record when it has one, otherwise the
  // host workflow — keys both its state and its persisted variables, so two
  // applications over one workflow never share either.
  const identity = appVariableIdentity(application?.id, workflowId);

  // A design canvas gets an ephemeral store: widget writes there must not leak
  // into the published app's state. It is created once per mount rather than
  // per identity, so the canvas keeps its widget values when `document` or the
  // operation runtimes are rebuilt. A live app keeps its store in the instance
  // registry so values survive View↔Edit tab switches and refetches.
  const designStoreRef = useRef<AppRuntimeStore | null>(null);
  const store: AppRuntimeStore =
    designMode || !identity
      ? (designStoreRef.current ??= createAppRuntimeStore())
      : getAppRuntimeStore(appInstanceId(identity));

  // Seeding fills only slots that have no value: workflow input defaults plus
  // the select/boolean fallbacks the controls display, so an untouched form
  // runs with what it shows. Idempotent, so re-running it on any identity churn
  // costs nothing and clobbers nothing.
  useEffect(() => {
    const dispatchEvent = store.getState().dispatchEvent;
    const values: Record<string, unknown> = {};
    for (const entry of operationRuntimes.values()) {
      for (const input of entry.io.inputs) {
        const seed = seedInputValue(input);
        if (seed === undefined) continue;
        values[
          stateKey({
            kind: "input",
            operationId: entry.operation.id,
            nodeId: input.nodeId
          })
        ] = seed;
      }
    }
    dispatchEvent({ type: "seedInputs", values });

    // Restored user-scoped values first, declared defaults second: seeding
    // never clobbers, so what the user left behind wins over the default.
    const variables = document?.variables ?? [];
    if (!designMode) {
      dispatchEvent({
        type: "seedVariables",
        values: loadPersistedVariables(identity, variables)
      });
    }
    dispatchEvent({
      type: "seedVariables",
      values: initialVariableValues(variables)
    });
  }, [designMode, document, identity, operationRuntimes, store]);

  // Write persisting user-scoped variables back whenever they change. Instance
  // variables and widget-local view state are deliberately not persisted.
  useEffect(() => {
    const variables = document?.variables ?? [];
    if (designMode || !identity) return;
    if (!variables.some((v) => v.scope === "user" && v.persist)) return;
    let previous = store.getState().variables;
    savePersistedVariables(identity, variables, previous);
    return store.subscribe((state) => {
      if (state.variables === previous) return;
      previous = state.variables;
      savePersistedVariables(identity, variables, previous);
    });
  }, [designMode, document, identity, store]);

  // Invocations this app started, by job id. A streaming message for anything
  // else is not ours — that is the whole cross-run contamination fix.
  const ownedRef = useRef(new Map<string, InvocationState>());
  // The resource each binding currently points at. A picker widget sets one;
  // an operation input mapped `from: "resource"` passes it to the run.
  const resourceRefsRef = useRef(new Map<string, ResourceRef>());
  // Messages that arrived between dispatching a run and learning its job id,
  // buffered per job id. Two starts in flight — a `parallel` operation, or two
  // operations dispatched at once — each replay only their own stream.
  const pendingRef = useRef(new Map<string, MsgpackData[]>());
  const awaitingJobRef = useRef(0);
  // Timeout timers by invocation id, for operations that declare `timeoutMs`.
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Teardowns for the waits `awaitSettled` has open, so an unmount drops them.
  const settleWaitsRef = useRef(new Set<() => void>());

  const clearTimeoutTimer = useCallback((invocationId: string) => {
    const timer = timersRef.current.get(invocationId);
    if (!timer) return;
    clearTimeout(timer);
    timersRef.current.delete(invocationId);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    const waits = settleWaitsRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const stopWaiting of [...waits]) stopWaiting();
      waits.clear();
    };
  }, []);

  const foldRef = useRef<(message: MsgpackData) => void>(() => {});

  const fold = useCallback(
    (message: MsgpackData) => {
      const events = messageToEvents(message as Record<string, unknown>, {
        resolveInvocation: (jobId) =>
          jobId ? ownedRef.current.get(jobId) ?? null : null,
        outputKey: (operationId, nodeId) => {
          const entry = operationRuntimesRef.current.get(operationId);
          return entry?.io.outputs.some((output) => output.nodeId === nodeId)
            ? outputKey(operationId, nodeId)
            : null;
        },
        // An output mapped `to: "variable"` writes app state as well as its
        // display slot — that is how one operation hands a value to the next.
        outputVariable: (operationId, nodeId) => {
          const entry = operationRuntimesRef.current.get(operationId);
          if (!entry) return null;
          const mapping = entry.operation.outputs[nodeId];
          return mapping?.to === "variable" ? mapping.variableId : null;
        }
      });
      for (const event of events) {
        store.getState().dispatchEvent(event);
        if (event.type !== "invocationStatus") continue;
        const invocation = ownedRef.current.get(event.invocationId);
        if (invocation) invocation.status = event.status;
        const settled = event.status !== "pending" && event.status !== "running";
        if (settled) clearTimeoutTimer(event.invocationId);
      }
    },
    [clearTimeoutTimer, outputKey, store]
  );
  foldRef.current = fold;

  /** Stop one run on the server (or in the browser, when it runs there). */
  const stopJob = useCallback(async (invocationId: string) => {
    const invocation = ownedRef.current.get(invocationId);
    const entry = invocation
      ? operationRuntimesRef.current.get(invocation.operationId)
      : undefined;
    // A script run is one HTTP request with no job row behind it. It is marked
    // cancelled in the app's own state; there is nothing on the server to stop.
    if (entry?.script) return;
    const runner = entry?.runnerStore;
    // The runner only knows how to cancel the run it currently displays;
    // anything else (a queued or parallel sibling) is cancelled by job id.
    if (runner && runner.getState().job_id === invocationId) {
      await runner.getState().cancel();
      return;
    }
    try {
      await trpcClient.jobs.cancel.mutate({ id: invocationId });
    } catch {
      // The job may already be gone; the app still marks it cancelled.
    }
  }, []);

  const cancelInvocations = useCallback(
    async (invocationIds: ReadonlyArray<string>) => {
      for (const invocationId of invocationIds) {
        clearTimeoutTimer(invocationId);
        const invocation = ownedRef.current.get(invocationId);
        if (invocation) invocation.status = "cancelled";
        await stopJob(invocationId);
        store.getState().dispatchEvent({
          type: "invocationStatus",
          invocationId,
          status: "cancelled"
        });
      }
    },
    [clearTimeoutTimer, stopJob, store]
  );

  /**
   * Resolve once every listed invocation has settled. A predecessor that never
   * reports would otherwise wedge the queue forever, so the waiting operation's
   * own declared timeout is also the ceiling on the wait; an unmount drops the
   * subscription and leaves the queued run unstarted.
   */
  const awaitSettled = useCallback(
    (invocationIds: ReadonlyArray<string>, timeoutMs?: number) =>
      new Promise<void>((resolve) => {
        const settled = () =>
          invocationIds.every((id) => {
            const invocation = store.getState().invocations[id];
            return !invocation || !isLiveInvocation(invocation);
          });
        if (settled()) {
          resolve();
          return;
        }
        const wait: {
          timer?: ReturnType<typeof setTimeout>;
          unsubscribe?: () => void;
        } = {};
        const stopWaiting = () => {
          if (wait.timer) clearTimeout(wait.timer);
          wait.unsubscribe?.();
          settleWaitsRef.current.delete(stopWaiting);
        };
        settleWaitsRef.current.add(stopWaiting);
        wait.unsubscribe = store.subscribe(() => {
          if (!settled()) return;
          stopWaiting();
          resolve();
        });
        if (timeoutMs && timeoutMs > 0) {
          wait.timer = setTimeout(() => {
            stopWaiting();
            resolve();
          }, timeoutMs);
        }
      }),
    [store]
  );

  /** Register a run this app started and flush anything buffered for it. */
  const claimInvocation = useCallback(
    (operationId: string, jobId: string, clearOutputs: boolean) => {
      const entry = operationRuntimesRef.current.get(operationId);
      const invocation: InvocationState = {
        id: jobId,
        operationId,
        status: "running",
        startedAt: now()
      };
      ownedRef.current.set(jobId, invocation);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation,
        outputKeys:
          clearOutputs && entry
            ? entry.io.outputs.map((output) =>
                outputKey(operationId, output.nodeId)
              )
            : []
      });

      // A declared timeout is a promise to the user that the app stops waiting.
      const timeoutMs = entry?.operation.timeoutMs;
      if (timeoutMs && timeoutMs > 0) {
        timersRef.current.set(
          jobId,
          setTimeout(() => {
            timersRef.current.delete(jobId);
            const live = ownedRef.current.get(jobId);
            if (!live || !isLiveInvocation(live)) return;
            live.status = "failed";
            void stopJob(jobId);
            store.getState().dispatchEvent({
              type: "invocationStatus",
              invocationId: jobId,
              status: "failed",
              error: `"${entry.operation.name}" timed out after ${timeoutMs} ms`
            });
          }, timeoutMs)
        );
      }

      const buffered = pendingRef.current.get(jobId);
      if (!buffered) return;
      pendingRef.current.delete(jobId);
      for (const message of buffered) foldRef.current(message);
    },
    [outputKey, stopJob, store]
  );

  /** Record a run that never started as a failed invocation the app can show. */
  const failInvocation = useCallback(
    (operationId: string, error: string) => {
      const failed: InvocationState = {
        id: `failed-${now()}`,
        operationId,
        status: "failed",
        error,
        startedAt: now()
      };
      ownedRef.current.set(failed.id, failed);
      store
        .getState()
        .dispatchEvent({ type: "runStarted", invocation: failed, outputKeys: [] });
    },
    [store]
  );

  const workflowIds = useMemo(
    () =>
      [
        ...new Set(
          [...operationRuntimes.values()]
            .map((entry) => entry.workflow?.id)
            .filter((id): id is string => Boolean(id))
        )
      ].sort(),
    [operationRuntimes]
  );
  const workflowIdsKey = workflowIds.join("|");

  useEffect(() => {
    if (designMode || workflowIds.length === 0) return;

    // Protocol-level handling (runner state machine, ResultsStore, node stores)
    // already runs via the workflow-manager subscription installed when the
    // workflow was opened — calling into it here would double-append.
    const handler = (message: MsgpackData) => {
      const jobId = (message as Record<string, unknown>).job_id;
      // A message carrying no job id cannot be attributed to an invocation, so
      // folding it produces nothing either now or after a replay.
      if (typeof jobId !== "string") return;
      if (ownedRef.current.has(jobId)) {
        foldRef.current(message);
        return;
      }
      // A run we started but whose job id has not come back yet. Buffer under
      // that id rather than drop, then replay once the run claims it.
      if (awaitingJobRef.current === 0) return;
      const buffered = pendingRef.current.get(jobId);
      if (buffered) buffered.push(message);
      else pendingRef.current.set(jobId, [message]);
    };

    const unsubscribes = workflowIds.map((id) =>
      globalWebSocketManager.subscribe(id, (message) =>
        handler(message as MsgpackData)
      )
    );

    const jobUnsubscribes = new Map<string, () => void>();
    const updateJobSubscription = (runnerKey: string, jobId: string | null) => {
      jobUnsubscribes.get(runnerKey)?.();
      jobUnsubscribes.delete(runnerKey);
      if (!jobId) return;
      jobUnsubscribes.set(
        runnerKey,
        globalWebSocketManager.subscribe(jobId, (message) => {
          if (message?.workflow_id) return;
          handler(message as MsgpackData);
        })
      );
    };

    const runners = new Map<string, WorkflowRunnerStore>();
    for (const entry of operationRuntimesRef.current.values()) {
      const key = entry.workflow?.id;
      if (key) runners.set(key, entry.runnerStore);
    }
    const runnerUnsubscribes = [...runners.entries()].map(([key, runner]) => {
      updateJobSubscription(key, runner.getState().job_id);
      return runner.subscribe((state, prev) => {
        if (state.job_id !== prev.job_id) updateJobSubscription(key, state.job_id);
      });
    });

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const unsubscribe of runnerUnsubscribes) unsubscribe();
      for (const unsubscribe of jobUnsubscribes.values()) unsubscribe();
    };
    // `workflowIdsKey` stands in for the workflow id list; the runner stores
    // themselves are read from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designMode, workflowIdsKey]);

  const run = useCallback(
    async (operationId: string) => {
      if (designMode) return;
      const entry = operationRuntimesRef.current.get(operationId);
      if (!entry) {
        failInvocation(
          operationId,
          `This app has no operation "${operationId}".`
        );
        return;
      }
      const binding = operationTarget(entry.operation);
      const target = entry.workflow;
      if (binding.kind === "workflow" && !target) {
        failInvocation(
          operationId,
          `"${entry.operation.name}" runs workflow ${binding.workflowId}, which could not be loaded.`
        );
        return;
      }
      if (binding.kind === "script" && !entry.script) {
        failInvocation(
          operationId,
          `"${entry.operation.name}" runs script ${binding.scriptId}, which could not be loaded.`
        );
        return;
      }

      // What a collision with a live run of this operation means: replace it,
      // queue behind it, or start alongside it.
      const decision = decideRun(store.getState(), entry.operation);
      if (decision.kind === "replace") {
        await cancelInvocations(decision.cancel);
      } else if (decision.kind === "queue") {
        await awaitSettled(decision.after, entry.operation.timeoutMs);
      }

      const state = store.getState();
      // Bindings key on node IDs; the run protocol wants names. That translation
      // happens here, at the execution boundary, which is why a graph rename
      // never touches the app document.
      const params = resolveOperationParams({
        operation: entry.operation,
        state,
        inputNodeIds: entry.io.inputs.map((input) => input.nodeId),
        inputName: (nodeId) =>
          entry.io.inputs.find((input) => input.nodeId === nodeId)?.name,
        resourceRef: (resourceBindingId) =>
          resourceRefsRef.current.get(resourceBindingId)
      });

      // A script has no graph to submit and no job to subscribe to: it runs
      // over one request and answers with a result, which the shared adapter
      // turns into the message stream the fold already consumes.
      const script = entry.script;
      if (script) {
        const jobId = `jsscript-${script.id}-${now()}`;
        claimInvocation(operationId, jobId, true);
        let result: ScriptRunResult;
        try {
          const { inputs, inputStreams } = scriptInvocationInput(
            params,
            usesStreamInputContract(script.document.code)
          );
          result = await runJsScript(script.id, inputs, inputStreams);
        } catch (error) {
          result = {
            ok: false,
            logs: [],
            error: error instanceof Error ? error.message : "Script run failed",
            duration_ms: 0
          };
        }
        for (const message of scriptRunMessages(result, jobId)) {
          foldRef.current(message as MsgpackData);
        }
        return;
      }
      // The guard above already failed a workflow operation with no graph.
      if (!target) return;

      // Node-property bindings overlay their live widget values onto the graph
      // before the run, so a slider bound to e.g. a model's `strength` drives the
      // actual node property.
      const overlays = collectNodePropertyOverlays(state.inputs);
      const nodes = (target.graph?.nodes ?? []).map((node) => {
        const rf = graphNodeToReactFlowNode(target, node);
        const overlay = overlays.get(rf.id);
        return overlay ? withNodeProperties(rf, overlay) : rf;
      });
      const edges = (target.graph?.edges ?? []).map((edge) =>
        graphEdgeToReactFlowEdge(edge)
      );

      awaitingJobRef.current += 1;
      try {
        const jobId = await entry.runnerStore
          .getState()
          .run(
            params,
            target,
            nodes,
            edges,
            undefined,
            undefined,
            // A parallel operation asks the server to lift the one-run-per-
            // workflow limit rather than queue behind the run in flight.
            entry.operation.policy === "parallel",
            undefined,
            { application, operationId }
          );
        claimInvocation(operationId, jobId, true);
      } catch (error) {
        failInvocation(
          operationId,
          error instanceof Error ? error.message : "Run failed"
        );
      } finally {
        awaitingJobRef.current -= 1;
        // Nothing is waiting for a job id any more, so whatever is still
        // buffered belongs to a run this app never claimed.
        if (awaitingJobRef.current === 0) pendingRef.current.clear();
      }
    },
    [
      application,
      awaitSettled,
      cancelInvocations,
      claimInvocation,
      designMode,
      failInvocation,
      store
    ]
  );

  const cancel = useCallback(
    async (operationId: string, invocationId?: string) => {
      const ids = invocationId
        ? [invocationId]
        : liveInvocations(store.getState(), operationId).map((i) => i.id);
      await cancelInvocations(ids);
    },
    [cancelInvocations, store]
  );

  // Reactive trigger: recompute only the subgraph downstream of a bound input.
  // Runs are coalesced per operation — one in flight, latest value wins — and
  // reuse a single job id so a scrub upserts one live result instead of
  // flooding new ones. No runner-state toggling: a slider scrub is a live
  // update, not a "run", so the UI never flashes "Running…".
  const reactiveRef = useRef(new Map<string, ReactiveRunState>());
  const reactiveRunRef = useRef<
    (operationId: string, trigger: BindingRef) => void
  >(() => {});
  useEffect(() => {
    reactiveRef.current.clear();
  }, [workflowIdsKey]);

  const reactiveRun = useCallback(
    (operationId: string, trigger: BindingRef) => {
      if (designMode) return;
      const entry = operationRuntimesRef.current.get(operationId);
      const target = entry?.workflow;
      if (!entry || !target) {
        void run(operationId);
        return;
      }
      let reactive = reactiveRef.current.get(operationId);
      if (!reactive) {
        reactive = {
          jobId: crypto.randomUUID(),
          inFlight: false,
          pending: null,
          hasRunFull: false
        };
        reactiveRef.current.set(operationId, reactive);
      }

      // A graph is already running (a long-lived / streaming workflow): feed the
      // new value into the live job instead of starting a fresh subgraph run.
      // Its streaming input re-propagates downstream without a restart. Only
      // input-node bindings can stream — a node-property change falls through to
      // a subgraph run.
      const runner = entry.runnerStore.getState();
      if (
        trigger.kind === "input" &&
        runner.job_id &&
        ownedRef.current.has(runner.job_id) &&
        (runner.state === "running" ||
          runner.state === "connecting" ||
          runner.state === "connected")
      ) {
        const input = entry.io.inputs.find((i) => i.nodeId === trigger.nodeId);
        if (input) {
          void runner.streamInput(
            input.name,
            store.getState().inputs[
              stateKey({ kind: "input", operationId, nodeId: trigger.nodeId })
            ]?.value
          );
          return;
        }
      }

      // The first trigger runs the whole graph, so computed upstreams (a
      // generated image, a constant) populate their caches. Later triggers
      // reuse those caches and only recompute the downstream subgraph.
      if (!reactive.hasRunFull) {
        reactive.hasRunFull = true;
        void run(operationId);
        return;
      }

      if (reactive.inFlight) {
        reactive.pending = trigger;
        return;
      }
      const sub = buildTriggerSubgraph(
        target,
        entry.io,
        store.getState(),
        trigger,
        (type) => useMetadataStore.getState().getMetadata(type)?.effect
      );
      // No browser-runnable subgraph that reaches an output (unknown input, a
      // server-only compute tail, an effectful node the reactive gate refuses)
      // — fall back to a full authoritative run.
      if (!sub) {
        void run(operationId);
        return;
      }
      reactive.inFlight = true;
      if (!ownedRef.current.has(reactive.jobId)) {
        claimInvocation(operationId, reactive.jobId, false);
      }
      const jobId = reactive.jobId;
      void runBrowserGraphJob({
        graph: sub.graph,
        workflowId: target.id,
        jobId
      })
        .catch((error) => {
          store.getState().dispatchEvent({
            type: "invocationError",
            invocationId: jobId,
            error: error instanceof Error ? error.message : "Run failed"
          });
        })
        .finally(() => {
          const current = reactiveRef.current.get(operationId);
          if (!current) return;
          current.inFlight = false;
          const pending = current.pending;
          if (pending !== null) {
            current.pending = null;
            // Re-run from fresh store values — the slider has moved on.
            reactiveRunRef.current(operationId, pending);
          }
        });
    },
    [claimInvocation, designMode, run, store]
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
          // subgraph; an unbound run (a button) runs the whole workflow. A
          // trigger belonging to another operation is not a subgraph of this
          // one, so it runs whole.
          const trigger = resolveBinding(action.from, scope, "write");
          if (trigger && "operationId" in trigger && trigger.operationId === action.operationId) {
            reactiveRun(action.operationId, trigger);
          } else {
            void run(action.operationId);
          }
          break;
        }
        case "cancel":
          void cancel(
            action.operationId ?? defaultOperation.id,
            action.invocationId
          );
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
        case "openResource": {
          // Opening a resource in its own editor is the host app's job — the
          // runtime only knows which binding was asked for.
          const ref =
            action.ref ?? resourceRefsRef.current.get(action.resourceBindingId);
          if (ref) onOpenResource?.(action.resourceBindingId, ref);
          break;
        }
        case "resourceCommand":
          void onResourceCommand?.(
            action.resourceBindingId,
            action.command,
            resourceRefsRef.current.get(action.resourceBindingId)
          );
          break;
      }
    },
    [
      cancel,
      defaultOperation.id,
      designMode,
      onOpenResource,
      onResourceCommand,
      reactiveRun,
      run,
      scope,
      store
    ]
  );

  const getNodeProperty = useCallback(
    (nodeId: string, property: string): unknown => {
      for (const entry of operationRuntimesRef.current.values()) {
        const node = entry.workflow?.graph?.nodes?.find((n) => n.id === nodeId);
        if (!node) continue;
        const data = (node.data ?? {}) as Record<string, unknown>;
        if (data[property] !== undefined) return data[property];
        const meta = useMetadataStore.getState().getMetadata(node.type);
        return meta?.properties.find((p) => p.name === property)?.default;
      }
      return undefined;
    },
    []
  );

  const selectResource = useCallback(
    (resourceBindingId: string, ref: ResourceRef | null) => {
      if (ref) resourceRefsRef.current.set(resourceBindingId, ref);
      else resourceRefsRef.current.delete(resourceBindingId);
    },
    []
  );

  // Widgets bound to a non-default operation need that operation's graph
  // surface, not the host workflow's.
  const ioFor = useCallback(
    (operationId?: string) =>
      operationRuntimesRef.current.get(operationId ?? defaultOperation.id)?.io ??
      EMPTY_IO,
    [defaultOperation.id]
  );

  return useMemo(
    () => ({
      store,
      io,
      ioFor,
      scope,
      operation: defaultOperation,
      operations,
      theme: document?.theme?.id,
      resources: document?.resources ?? [],
      designMode,
      dispatch,
      write,
      selectResource,
      getNodeProperty
    }),
    [
      store,
      io,
      ioFor,
      scope,
      defaultOperation,
      operations,
      document,
      designMode,
      dispatch,
      write,
      selectResource,
      getNodeProperty
    ]
  );
};
