/**
 * The reactive engine.
 *
 * Binds an app-instance store to the shared per-workflow runner, folds the
 * run's streaming messages into namespaced state, and turns widget actions into
 * runs. All the semantics — what a message does to a value, which invocation
 * owns a slot, how an action reads, what a policy means when a run collides
 * with a live one — live in `@nodetool-ai/app-runtime`; this hook is the React
 * Native adapter around them.
 *
 * Run identity is the load-bearing part: every invocation this app starts is
 * registered by its `job_id`, and a streaming message for any other job is
 * dropped, so a run started in the chain editor never folds into what the app
 * shows.
 *
 * Unlike web there is no reactive subgraph path — mobile has no browser worker
 * — so every `run` action runs the whole workflow on the server. A document may
 * declare several operations over that workflow and each is dispatched by id;
 * an operation bound to a *different* workflow cannot run on a screen that
 * holds only this one, and says so instead of running the wrong graph.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  decideRun,
  implicitOperation,
  initialVariableValues,
  isLiveInvocation,
  mergeVariables,
  messageToEvents,
  outputVariableTargets,
  resolveOperationParams,
  stateKey,
  type AppAction,
  type ApplicationDocument,
  type BindingRef,
  type BindingScope,
  type InvocationState,
  type OperationBinding,
  type ResourceRef,
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../types/workflow";
import { useWorkflowRunner } from "../../stores/WorkflowRunner";
import { webSocketService } from "../../services/WebSocketService";
import { AppRuntimeContextValue } from "./AppRuntimeContext";
import {
  AppRuntimeStore,
  getAppRuntimeStore,
  workflowInstanceId,
} from "./appRuntimeStore";
import {
  extractVariableNames,
  extractWorkflowIO,
  seedInputValue,
} from "./workflowIO";
import { useOpenResource } from "./useOpenResource";
import {
  loadPersistedVariables,
  persistableValues,
  persistableVariableIds,
  savePersistedVariables,
} from "./variablePersistence";

type RawMessage = Record<string, unknown>;

/** Trailing window before a variable change is written to storage. */
const PERSIST_DEBOUNCE_MS = 300;

/**
 * A run that has been dispatched but whose `job_id` has not come back yet.
 * Starts are claimed in dispatch order, which is what lets two parallel
 * invocations of one operation each find their own job.
 */
interface PendingStart {
  operationId: string;
  timeoutMs?: number;
  /** Set once the run's job id arrives. */
  invocationId?: string;
  timer?: ReturnType<typeof setTimeout>;
}

export interface AppRuntimeOptions {
  /**
   * The app document, when the app has one. A legacy app running straight off
   * a workflow gets a synthesized single-operation document instead, so both
   * shapes take one code path.
   */
  document?: ApplicationDocument;
}

export const useAppRuntime = (
  workflow: Workflow | undefined,
  options: AppRuntimeOptions = {}
): AppRuntimeContextValue => {
  const { document } = options;
  const workflowId = workflow?.id;
  const io = useMemo(() => extractWorkflowIO(workflow), [workflow]);

  // Every operation a widget's run/cancel can name. A legacy app running
  // straight off a workflow gets the one implicit operation.
  const operations: OperationBinding[] = useMemo(
    () =>
      document?.operations.length
        ? document.operations
        : [implicitOperation(workflowId ?? "")],
    [document, workflowId]
  );
  const operation = operations[0];

  /**
   * Mobile holds exactly one workflow per app screen.
   *
   * A document whose operations all name one workflow *is* this screen's app —
   * it is stored on the workflow it was opened from — so it runs the loaded
   * graph even when the id it carries is stale (a copied workflow keeps the
   * original's app document). Only a document that mixes several workflows can
   * name one this screen does not hold, and that operation refuses to run
   * rather than running the loaded graph under another operation's name.
   */
  const isRunnable = useMemo(() => {
    const workflowIds = new Set(
      operations.map((op) => op.workflowId).filter((id) => id !== "")
    );
    return (candidate: OperationBinding) =>
      workflowIds.size <= 1 ||
      candidate.workflowId === "" ||
      candidate.workflowId === workflowId;
  }, [operations, workflowId]);

  const variables = useMemo(
    () =>
      mergeVariables(
        document?.variables ?? [],
        extractVariableNames(workflow)
      ),
    [document, workflow]
  );

  // Everything a stored binding string can resolve against. Legacy documents
  // bind by name; the scope turns those names into node IDs here, so a later
  // rename in the graph editor is invisible to the app.
  const scope: BindingScope = useMemo(
    () => ({
      defaultOperationId: operation.id,
      operations: operations.map((op) => ({
        operationId: op.id,
        inputs: isRunnable(op)
          ? io.inputs.map(({ nodeId, name }) => ({ nodeId, name }))
          : [],
        outputs: isRunnable(op)
          ? io.outputs.map(({ nodeId, name }) => ({ nodeId, name }))
          : [],
        nodeIds: isRunnable(op)
          ? (workflow?.graph?.nodes ?? []).map(
              (node: { id: string }) => node.id
            )
          : [],
        variableNames: extractVariableNames(workflow),
      })),
      variables,
    }),
    [io, isRunnable, operation.id, operations, variables, workflow]
  );

  const resources = useMemo(() => document?.resources ?? [], [document]);

  // Which document each resource binding currently points at. A ref, never the
  // entity — resource data belongs to the query cache, not the app store.
  const resourceRefsRef = useRef(new Map<string, ResourceRef>());
  const selectResource = useCallback(
    (resourceBindingId: string, ref: ResourceRef | null) => {
      if (ref) {
        resourceRefsRef.current.set(resourceBindingId, ref);
      } else {
        resourceRefsRef.current.delete(resourceBindingId);
      }
    },
    []
  );

  const openResource = useOpenResource();

  const outputKey = useCallback(
    (operationId: string, nodeId: string) =>
      stateKey({ kind: "output", operationId, nodeId }),
    []
  );

  const instanceId = workflowInstanceId(workflowId ?? "__app_runtime__");

  // Kept in the instance registry so values survive an editor↔app toggle.
  const store: AppRuntimeStore = useMemo(() => {
    const target = getAppRuntimeStore(instanceId);
    const values: Record<string, unknown> = {};
    for (const op of operations) {
      for (const input of io.inputs) {
        const seed = seedInputValue(input);
        if (seed !== undefined) {
          values[stateKey({ kind: "input", operationId: op.id, nodeId: input.nodeId })] =
            seed;
        }
      }
    }
    target.getState().dispatchEvent({ type: "seedInputs", values });
    return target;
  }, [instanceId, io.inputs, operations]);

  // Restore first, then seed the declared defaults: `seedVariables` never
  // clobbers, so a value the user set last session outranks the default.
  useEffect(() => {
    let cancelled = false;
    const defaults = initialVariableValues(variables);
    void loadPersistedVariables(instanceId, variables).then((restored) => {
      if (cancelled) {return;}
      const { dispatchEvent } = store.getState();
      dispatchEvent({ type: "seedVariables", values: restored });
      dispatchEvent({ type: "seedVariables", values: defaults });
    });
    return () => {
      cancelled = true;
    };
  }, [instanceId, store, variables]);

  // Write back whatever the document declared persistent. Instance-scoped and
  // view values never reach storage — that is what their scope means.
  useEffect(() => {
    const ids = persistableVariableIds(variables);
    if (ids.size === 0) {return undefined;}
    let last = JSON.stringify(persistableValues(store.getState().variables, ids));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe((state) => {
      const values = persistableValues(state.variables, ids);
      const encoded = JSON.stringify(values);
      if (encoded === last) {return;}
      last = encoded;
      if (timer) {clearTimeout(timer);}
      timer = setTimeout(() => {
        timer = null;
        void savePersistedVariables(instanceId, values);
      }, PERSIST_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) {clearTimeout(timer);}
    };
  }, [instanceId, store, variables]);

  const runnerStore = useWorkflowRunner(workflowId ?? "__app_runtime__");

  const outputNodeIdsRef = useRef<Set<string>>(new Set());
  outputNodeIdsRef.current = useMemo(
    () => new Set(io.outputs.map((o) => o.nodeId)),
    [io.outputs]
  );

  // Operation id → (output node id → the variable that output writes).
  const outputVariablesRef = useRef(new Map<string, Map<string, string>>());
  outputVariablesRef.current = useMemo(() => {
    const byOperation = new Map<string, Map<string, string>>();
    for (const op of operations) {
      const targets = outputVariableTargets(op);
      if (targets.length === 0) {continue;}
      byOperation.set(
        op.id,
        new Map(targets.map(({ nodeId, variableId }) => [nodeId, variableId]))
      );
    }
    return byOperation;
  }, [operations]);

  // Invocations this app started, by job id. A streaming message for anything
  // else is not ours — that is the cross-run contamination fix.
  const ownedRef = useRef(new Map<string, InvocationState>());
  // Runs dispatched but not yet matched to a job id, oldest first.
  const pendingStartsRef = useRef<PendingStart[]>([]);
  // Claimed runs that still hold a timeout timer, by invocation id.
  const startsByInvocationRef = useRef(new Map<string, PendingStart>());

  const clearTimer = useCallback((start: PendingStart | undefined) => {
    if (start?.timer) {
      clearTimeout(start.timer);
      start.timer = undefined;
    }
  }, []);

  const fold = useCallback(
    (message: RawMessage) => {
      const events = messageToEvents(message, {
        resolveInvocation: (jobId) =>
          jobId ? ownedRef.current.get(jobId) ?? null : null,
        outputKey: (operationId, nodeId) =>
          outputNodeIdsRef.current.has(nodeId)
            ? outputKey(operationId, nodeId)
            : null,
        outputVariable: (operationId, nodeId) =>
          outputVariablesRef.current.get(operationId)?.get(nodeId) ?? null,
      });
      for (const event of events) {
        store.getState().dispatchEvent(event);
        if (event.type === "invocationStatus") {
          const invocation = ownedRef.current.get(event.invocationId);
          if (invocation) {invocation.status = event.status;}
          if (event.status !== "pending" && event.status !== "running") {
            const start = startsByInvocationRef.current.get(event.invocationId);
            clearTimer(start);
            startsByInvocationRef.current.delete(event.invocationId);
          }
        }
      }
    },
    [clearTimer, outputKey, store]
  );
  const foldRef = useRef(fold);
  foldRef.current = fold;

  const outputsRef = useRef(io.outputs);
  outputsRef.current = io.outputs;

  /** Report a run that could not start, so the failure is visible in the app. */
  const failRun = useCallback(
    (operationId: string, error: string) => {
      const failed: InvocationState = {
        id: `failed-${operationId}-${Date.now()}`,
        operationId,
        status: "failed",
        error,
        startedAt: Date.now(),
      };
      ownedRef.current.set(failed.id, failed);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation: failed,
        outputKeys: [],
      });
    },
    [store]
  );
  const failRunRef = useRef(failRun);
  failRunRef.current = failRun;

  /** Register a run this app started against the start that is waiting for it. */
  const claimInvocation = useCallback(
    (jobId: string) => {
      const start = pendingStartsRef.current.shift();
      if (!start) {return;}
      start.invocationId = jobId;
      startsByInvocationRef.current.set(jobId, start);
      const invocation: InvocationState = {
        id: jobId,
        operationId: start.operationId,
        status: "running",
        startedAt: Date.now(),
      };
      ownedRef.current.set(jobId, invocation);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation,
        outputKeys: outputsRef.current.map((output) =>
          outputKey(start.operationId, output.nodeId)
        ),
      });
    },
    [outputKey, store]
  );
  const claimRef = useRef(claimInvocation);
  claimRef.current = claimInvocation;

  useEffect(() => {
    if (!workflowId) {return undefined;}

    const handler = (message: RawMessage) => {
      const jobId = message.job_id;
      // A message with no job id cannot be attributed to one of this app's
      // invocations, so it is not folded.
      if (typeof jobId !== "string") {return;}
      if (!ownedRef.current.has(jobId)) {
        // The first job id to arrive after we dispatched a run is that run.
        if (pendingStartsRef.current.length === 0) {return;}
        claimRef.current(jobId);
      }
      foldRef.current(message);
    };

    const unsubscribeWorkflow = webSocketService.subscribe(
      workflowId,
      handler
    );

    let unsubscribeJob: (() => void) | null = null;
    const updateJobSubscription = (jobId: string | null) => {
      unsubscribeJob?.();
      unsubscribeJob = jobId
        ? webSocketService.subscribe(jobId, handler)
        : null;
    };
    updateJobSubscription(runnerStore.getState().job_id);
    const unsubscribeRunner = runnerStore.subscribe((state, prev) => {
      if (state.job_id !== prev.job_id) {updateJobSubscription(state.job_id);}
    });

    return () => {
      unsubscribeWorkflow();
      unsubscribeRunner();
      unsubscribeJob?.();
    };
  }, [runnerStore, workflowId]);

  /**
   * Cancel invocations this app owns. `error` turns the cancellation into a
   * failure, which is what a timeout is: the run stops and the app says why.
   */
  const cancelInvocations = useCallback(
    async (invocationIds: ReadonlyArray<string>, error?: string) => {
      for (const id of invocationIds) {
        const invocation = ownedRef.current.get(id);
        if (invocation && !isLiveInvocation(invocation)) {continue;}
        clearTimer(startsByInvocationRef.current.get(id));
        startsByInvocationRef.current.delete(id);
        await runnerStore.getState().cancel(id);
        if (invocation) {invocation.status = error ? "failed" : "cancelled";}
        store.getState().dispatchEvent({
          type: "invocationStatus",
          invocationId: id,
          status: error ? "failed" : "cancelled",
          ...(error ? { error } : {}),
        });
      }
    },
    [clearTimer, runnerStore, store]
  );

  /** Resolve once none of the given invocations is live any more. */
  const waitForSettled = useCallback(
    (invocationIds: ReadonlyArray<string>) =>
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
        const unsubscribe = store.subscribe(() => {
          if (!settled()) {return;}
          unsubscribe();
          resolve();
        });
      }),
    [store]
  );

  const startTimeout = useCallback(
    (start: PendingStart) => {
      if (!start.timeoutMs || start.timeoutMs <= 0) {return;}
      const limit = start.timeoutMs;
      start.timer = setTimeout(() => {
        start.timer = undefined;
        const message = `Run timed out after ${limit}ms`;
        if (start.invocationId) {
          void cancelInvocations([start.invocationId], message);
          return;
        }
        // The run never reported a job id, so there is nothing to cancel — the
        // failure is all the app can show.
        pendingStartsRef.current = pendingStartsRef.current.filter(
          (pending) => pending !== start
        );
        failRunRef.current(start.operationId, message);
      }, limit);
    },
    [cancelInvocations]
  );

  const run = useCallback(
    async (operationId: string) => {
      const target = operations.find((op) => op.id === operationId);
      if (!target) {
        failRun(
          operation.id,
          `This app has no operation "${operationId}".`
        );
        return;
      }
      if (!workflow || !isRunnable(target)) {
        failRun(
          target.id,
          `"${target.name}" runs workflow ${target.workflowId}, which this screen does not have open.`
        );
        return;
      }

      const decision = decideRun(store.getState(), target);
      if (decision.kind === "replace") {
        await cancelInvocations(decision.cancel);
      } else if (decision.kind === "queue") {
        await waitForSettled(decision.after);
      }

      // Bindings key on node IDs; the run protocol wants names. That
      // translation happens here, at the execution boundary, which is why a
      // graph rename never touches the app document.
      const params = resolveOperationParams({
        operation: target,
        state: store.getState(),
        inputNodeIds: io.inputs.map((input) => input.nodeId),
        inputName: (nodeId) =>
          io.inputs.find((input) => input.nodeId === nodeId)?.name,
        resourceRef: (resourceBindingId) =>
          resourceRefsRef.current.get(resourceBindingId),
      });

      const start: PendingStart = {
        operationId: target.id,
        timeoutMs: target.timeoutMs,
      };
      pendingStartsRef.current.push(start);
      startTimeout(start);
      try {
        await runnerStore.getState().run(params, workflow);
      } catch (error) {
        pendingStartsRef.current = pendingStartsRef.current.filter(
          (pending) => pending !== start
        );
        clearTimer(start);
        failRun(
          target.id,
          error instanceof Error ? error.message : "Run failed"
        );
      }
    },
    [
      cancelInvocations,
      clearTimer,
      failRun,
      io.inputs,
      isRunnable,
      operation.id,
      operations,
      runnerStore,
      startTimeout,
      store,
      waitForSettled,
      workflow,
    ]
  );

  const cancel = useCallback(
    async (operationId: string, invocationId?: string) => {
      if (invocationId) {
        await cancelInvocations([invocationId]);
        return;
      }
      const live = Object.values(store.getState().invocations)
        .filter((i) => i.operationId === operationId && isLiveInvocation(i))
        .map((i) => i.id);
      // A run dispatched but not yet claimed has no job to cancel; dropping its
      // start keeps a late job id from being adopted as a live run.
      pendingStartsRef.current = pendingStartsRef.current.filter((start) => {
        if (start.operationId !== operationId) {return true;}
        clearTimer(start);
        return false;
      });
      await cancelInvocations(live);
    },
    [cancelInvocations, clearTimer, store]
  );

  // A screen that goes away leaves no timer behind to fail a run nobody sees.
  useEffect(
    () => () => {
      for (const start of pendingStartsRef.current) {
        if (start.timer) {clearTimeout(start.timer);}
      }
      for (const start of startsByInvocationRef.current.values()) {
        if (start.timer) {clearTimeout(start.timer);}
      }
    },
    []
  );

  const write = useCallback(
    (ref: BindingRef, value: unknown) => {
      const key = stateKey(ref);
      const { dispatchEvent } = store.getState();
      switch (ref.kind) {
        case "variable":
          dispatchEvent({
            type: "setVariable",
            variableId: ref.variableId,
            value,
          });
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
      switch (action.kind) {
        case "run":
          void run(action.operationId);
          break;
        case "cancel":
          void cancel(
            action.operationId ?? operation.id,
            action.invocationId
          );
          break;
        case "setVariable":
          store.getState().dispatchEvent({
            type: "setVariable",
            variableId: action.variableId,
            value: action.value,
          });
          break;
        case "toggleVariable":
          store.getState().dispatchEvent({
            type: "toggleVariable",
            variableId: action.variableId,
          });
          break;
        case "openResource": {
          // Which screen opens a document is the host's business; the runtime
          // only knows which binding was asked for.
          const ref =
            action.ref ?? resourceRefsRef.current.get(action.resourceBindingId);
          if (ref) {
            openResource(ref);
          }
          break;
        }
        default:
          // `resourceCommand` writes a document through a provider router that
          // mobile does not have; it stays inert rather than half-applied.
          break;
      }
    },
    [cancel, openResource, operation.id, run, store]
  );

  return useMemo(
    () => ({
      store,
      io,
      scope,
      operation,
      operations,
      resources,
      dispatch,
      write,
      selectResource,
    }),
    [
      dispatch,
      io,
      operation,
      operations,
      resources,
      scope,
      selectResource,
      store,
      write,
    ]
  );
};
