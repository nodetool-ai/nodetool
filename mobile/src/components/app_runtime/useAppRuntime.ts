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
 * Run identity is the load-bearing part: the job id is minted here, before the
 * run request is sent, and the server honours it. Every invocation this app
 * starts is registered under that id and a streaming message for any other job
 * is dropped, so neither a run started in the chain editor nor a second
 * parallel invocation of this app can fold into the wrong slot.
 *
 * Unlike web there is no reactive subgraph path — mobile has no browser worker
 * — so every `run` action runs the whole workflow on the server. A document may
 * declare several operations over that workflow and each is dispatched by id;
 * an operation bound to a *different* workflow cannot run on a screen that
 * holds only this one, and says so instead of running the wrong graph.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
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
  type AppStateEvent,
  type ApplicationDocument,
  type BindingRef,
  type BindingScope,
  type InvocationState,
  type OperationBinding,
  type ResourceRef
} from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../types/workflow";
import { useWorkflowRunner } from "../../stores/WorkflowRunner";
import { webSocketService } from "../../services/WebSocketService";
import { AppRuntimeContextValue } from "./AppRuntimeContext";
import {
  AppRuntimeStore,
  getAppRuntimeStore,
  appInstanceId
} from "./appRuntimeStore";
import {
  extractVariableNames,
  extractWorkflowIO,
  seedInputValue
} from "./workflowIO";
import { useOpenResource } from "./useOpenResource";
import {
  loadPersistedVariables,
  persistableValues,
  persistableVariableIds,
  savePersistedVariables
} from "./variablePersistence";
import { isString } from "../../utils/typePredicates";

type RawMessage = Record<string, unknown>;

/** Trailing window before a variable change is written to storage. */
const PERSIST_DEBOUNCE_MS = 300;

/** A run this app dispatched, holding the timer that enforces its timeout. */
interface StartedRun {
  operationId: string;
  invocationId: string;
  timeoutMs?: number;
  timer?: ReturnType<typeof setTimeout>;
}

export interface AppRuntimeOptions {
  /**
   * The app document. A document with no operations gets a synthesized one
   * bound to the loaded workflow, so both shapes take one code path.
   */
  document?: ApplicationDocument;
  /**
   * What the instance's state (and its persisted variables) is keyed by —
   * the application id. Defaults to the workflow id.
   */
  instanceKey?: string;
  /**
   * The application these runs belong to. Sent with every run request so the
   * server can check the app's spend budget and file the run in its release
   * ledger; a run without it is unmetered. `version` is the released version,
   * null for a run of the draft.
   */
  application?: { id: string; version?: number | null };
}

export const useAppRuntime = (
  workflow: Workflow | undefined,
  options: AppRuntimeOptions = {}
): AppRuntimeContextValue => {
  const { document, instanceKey, application } = options;
  const workflowId = workflow?.id;
  const io = useMemo(() => extractWorkflowIO(workflow), [workflow]);

  // Every operation a widget's run/cancel can name. A document that declares
  // none gets the one implicit operation over the loaded workflow.
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
   * A document whose operations all name one workflow is running that one, so
   * it runs the loaded graph even when the id it carries is stale (a copied
   * workflow keeps the original id). Only a document that mixes several
   * workflows can name one this screen does not hold, and that operation
   * refuses to run rather than running the loaded graph under another
   * operation's name.
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
      mergeVariables(document?.variables ?? [], extractVariableNames(workflow)),
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
        variableNames: extractVariableNames(workflow)
      })),
      variables
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

  const instanceId = appInstanceId(
    instanceKey ?? workflowId ?? "__app_runtime__"
  );

  // Kept in the instance registry so values survive an editor↔app toggle.
  const store: AppRuntimeStore = useMemo(() => {
    const target = getAppRuntimeStore(instanceId);
    const values: Record<string, unknown> = {};
    for (const op of operations) {
      for (const input of io.inputs) {
        const seed = seedInputValue(input);
        if (seed !== undefined) {
          values[
            stateKey({
              kind: "input",
              operationId: op.id,
              nodeId: input.nodeId
            })
          ] = seed;
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
      if (cancelled) {
        return;
      }
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
    if (ids.size === 0) {
      return undefined;
    }
    let last = JSON.stringify(
      persistableValues(store.getState().variables, ids)
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe((state) => {
      const values = persistableValues(state.variables, ids);
      const encoded = JSON.stringify(values);
      if (encoded === last) {
        return;
      }
      last = encoded;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void savePersistedVariables(instanceId, values);
      }, PERSIST_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
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
      if (targets.length === 0) {
        continue;
      }
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
  // Dispatched runs that still hold a timeout timer, by invocation id.
  const startsByInvocationRef = useRef(new Map<string, StartedRun>());

  const clearTimer = useCallback((start: StartedRun | undefined) => {
    if (start?.timer) {
      clearTimeout(start.timer);
      start.timer = undefined;
    }
  }, []);

  const fold = useCallback(
    (message: RawMessage) => {
      const events = messageToEvents(message, {
        resolveInvocation: (jobId) =>
          jobId ? (ownedRef.current.get(jobId) ?? null) : null,
        outputKey: (operationId, nodeId) =>
          outputNodeIdsRef.current.has(nodeId)
            ? outputKey(operationId, nodeId)
            : null,
        outputVariable: (operationId, nodeId) =>
          outputVariablesRef.current.get(operationId)?.get(nodeId) ?? null
      });
      for (const event of events) {
        store.getState().dispatchEvent(event);
        if (event.type === "invocationStatus") {
          const invocation = ownedRef.current.get(event.invocationId);
          if (invocation) {
            invocation.status = event.status;
          }
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
        startedAt: Date.now()
      };
      ownedRef.current.set(failed.id, failed);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation: failed,
        outputKeys: []
      });
    },
    [store]
  );

  /** Register a run under the job id it was dispatched with. */
  const registerInvocation = useCallback(
    (start: StartedRun) => {
      startsByInvocationRef.current.set(start.invocationId, start);
      const invocation: InvocationState = {
        id: start.invocationId,
        operationId: start.operationId,
        status: "running",
        startedAt: Date.now()
      };
      ownedRef.current.set(start.invocationId, invocation);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation,
        outputKeys: outputsRef.current.map((output) =>
          outputKey(start.operationId, output.nodeId)
        )
      });
    },
    [outputKey, store]
  );

  useEffect(() => {
    if (!workflowId) {
      return undefined;
    }

    const handler = (message: RawMessage) => {
      const jobId = message.job_id;
      // Only jobs this app minted an id for are folded. A message with no job
      // id, or one naming a run started elsewhere (the chain editor, another
      // app instance), belongs to nobody here.
      if (!isString(jobId)) {
        return;
      }
      if (!ownedRef.current.has(jobId)) {
        return;
      }
      foldRef.current(message);
    };

    const unsubscribeWorkflow = webSocketService.subscribe(workflowId, handler);

    let unsubscribeJob: (() => void) | null = null;
    const updateJobSubscription = (jobId: string | null) => {
      unsubscribeJob?.();
      unsubscribeJob = jobId
        ? webSocketService.subscribe(jobId, handler)
        : null;
    };
    updateJobSubscription(runnerStore.getState().job_id);
    const unsubscribeRunner = runnerStore.subscribe((state, prev) => {
      if (state.job_id !== prev.job_id) {
        updateJobSubscription(state.job_id);
      }
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
        if (invocation && !isLiveInvocation(invocation)) {
          continue;
        }
        clearTimer(startsByInvocationRef.current.get(id));
        startsByInvocationRef.current.delete(id);
        await runnerStore.getState().cancel(id);
        if (invocation) {
          invocation.status = error ? "failed" : "cancelled";
        }
        const event: Extract<AppStateEvent, { type: "invocationStatus" }> = {
          type: "invocationStatus",
          invocationId: id,
          status: error ? "failed" : "cancelled"
        };
        if (error) {
          event.error = error;
        }
        store.getState().dispatchEvent(event);
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
          if (!settled()) {
            return;
          }
          unsubscribe();
          resolve();
        });
      }),
    [store]
  );

  const startTimeout = useCallback(
    (start: StartedRun) => {
      if (!start.timeoutMs || start.timeoutMs <= 0) {
        return;
      }
      const limit = start.timeoutMs;
      start.timer = setTimeout(() => {
        start.timer = undefined;
        void cancelInvocations(
          [start.invocationId],
          `Run timed out after ${limit}ms`
        );
      }, limit);
    },
    [cancelInvocations]
  );

  const run = useCallback(
    async (operationId: string) => {
      const target = operations.find((op) => op.id === operationId);
      if (!target) {
        failRun(operation.id, `This app has no operation "${operationId}".`);
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
          resourceRefsRef.current.get(resourceBindingId)
      });

      // The job id is minted before the request goes out and sent as the
      // request's `job_id`, which the server honours. That is what makes the
      // invocation identifiable: two runs in flight at once each own their id
      // rather than racing for whichever job id arrives first.
      const start: StartedRun = {
        operationId: target.id,
        invocationId: uuidv4(),
        timeoutMs: target.timeoutMs
      };
      registerInvocation(start);
      startTimeout(start);
      try {
        type RunOptionsFields = {
          jobId: string;
          operationId: string;
          application?: typeof application;
        };
        const runOptions: RunOptionsFields = {
          jobId: start.invocationId,
          operationId: target.id
        };
        if (application) {
          runOptions.application = application;
        }
        await runnerStore.getState().run(params, workflow, runOptions);
      } catch (error) {
        clearTimer(start);
        startsByInvocationRef.current.delete(start.invocationId);
        const message = error instanceof Error ? error.message : "Run failed";
        const invocation = ownedRef.current.get(start.invocationId);
        if (invocation) {
          invocation.status = "failed";
        }
        store.getState().dispatchEvent({
          type: "invocationStatus",
          invocationId: start.invocationId,
          status: "failed",
          error: message
        });
      }
    },
    [
      application,
      cancelInvocations,
      clearTimer,
      failRun,
      io.inputs,
      isRunnable,
      operation.id,
      operations,
      registerInvocation,
      runnerStore,
      startTimeout,
      store,
      waitForSettled,
      workflow
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
      await cancelInvocations(live);
    },
    [cancelInvocations, store]
  );

  // A screen that goes away leaves no timer behind to fail a run nobody sees.
  useEffect(
    () => () => {
      for (const start of startsByInvocationRef.current.values()) {
        if (start.timer) {
          clearTimeout(start.timer);
        }
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
            value
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
          void cancel(action.operationId ?? operation.id, action.invocationId);
          break;
        case "setVariable":
          store.getState().dispatchEvent({
            type: "setVariable",
            variableId: action.variableId,
            value: action.value
          });
          break;
        case "toggleVariable":
          store.getState().dispatchEvent({
            type: "toggleVariable",
            variableId: action.variableId
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
      selectResource
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
      write
    ]
  );
};
