/**
 * The reactive engine: turns widget actions into runs on the app's server and
 * folds each run's streamed messages into instance state.
 *
 * Every semantic decision — what a message does to a slot, which invocation
 * owns it, what a run policy means — comes from `@nodetool-ai/app-runtime`,
 * the same module the NodeTool web and mobile runtimes use. This hook only
 * wires those pieces to `fetch`.
 *
 * Run identity: the job id is minted here and sent with the request, and the
 * server stamps it on every message. A message for any other job is dropped,
 * so two overlapping runs never write into each other's slots.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  decideRun,
  implicitOperation,
  initialVariableValues,
  isLiveInvocation,
  mergeVariables,
  messageToEvents,
  operationTarget,
  outputVariableTargets,
  parseInputStateKey,
  resolveOperationParams,
  stateKey,
  type AppAction,
  type ApplicationBundle,
  type BindingRef,
  type BindingScope,
  type InvocationState,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import { createRuntimeStore, type RuntimeStore } from "./store";
import { runOperation, type RunMessage, type RunRequest } from "./server";
import { extractScriptIO, extractWorkflowIO, seedInputValue, type WorkflowIO } from "./workflowIO";
import { loadPersistedVariables, savePersistedVariables } from "./persistence";
import { collectModelRefs, type ModelRef } from "./models";

export interface AppRuntime {
  store: RuntimeStore;
  scope: BindingScope;
  operations: OperationBinding[];
  /** The bindable surface of the workflow an operation runs. */
  ioFor: (operationId: string) => WorkflowIO;
  dispatch: (action: AppAction) => void;
  write: (ref: BindingRef, value: unknown) => void;
  /** Model references a `ModelSelect` can offer, by kind. */
  modelChoices: Record<string, ModelRef[]>;
}

interface StartedRun {
  operationId: string;
  invocationId: string;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}

const PERSIST_DEBOUNCE_MS = 300;

export function useAppRuntime(bundle: ApplicationBundle, instanceKey: string): AppRuntime {
  const document = bundle.app;

  const ioByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowIO>();
    for (const workflow of bundle.workflows) {
      map.set(workflow.key, extractWorkflowIO(workflow.graph));
    }
    return map;
  }, [bundle.workflows]);

  const ioByScript = useMemo(() => {
    const map = new Map<string, WorkflowIO>();
    for (const script of bundle.scripts) {
      map.set(script.key, extractScriptIO(script.document));
    }
    return map;
  }, [bundle.scripts]);

  const operations = useMemo<OperationBinding[]>(
    () =>
      document.operations.length > 0
        ? document.operations
        : [implicitOperation(bundle.workflows[0]?.key ?? "")],
    [bundle.workflows, document.operations]
  );

  const ioFor = useCallback(
    (operationId: string): WorkflowIO => {
      const operation = operations.find((op) => op.id === operationId);
      const target = operation ? operationTarget(operation) : null;
      const io =
        target?.kind === "script"
          ? ioByScript.get(target.scriptId)
          : target
            ? ioByWorkflow.get(target.workflowId)
            : undefined;
      return io ?? { inputs: [], outputs: [], nodeIds: [], variableNames: [] };
    },
    [ioByScript, ioByWorkflow, operations]
  );

  const variables = useMemo(
    () =>
      mergeVariables(
        document.variables,
        [...ioByWorkflow.values()].flatMap((io) => io.variableNames)
      ),
    [document.variables, ioByWorkflow]
  );

  const scope = useMemo<BindingScope>(
    () => ({
      defaultOperationId: operations[0]?.id ?? "main",
      operations: operations.map((op) => {
        const io = ioFor(op.id);
        return {
          operationId: op.id,
          inputs: io.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
          outputs: io.outputs.map(({ nodeId, name }) => ({ nodeId, name })),
          nodeIds: io.nodeIds,
          variableNames: io.variableNames
        };
      }),
      variables
    }),
    [ioFor, operations, variables]
  );

  const store = useMemo(() => createRuntimeStore(), []);
  const modelChoices = useMemo(() => collectModelRefs(bundle), [bundle]);

  // Seed every input slot with the value its control shows, so a form the user
  // never touched runs with exactly what is on screen.
  useEffect(() => {
    const values: Record<string, unknown> = {};
    for (const op of operations) {
      for (const input of ioFor(op.id).inputs) {
        const seed = seedInputValue(input);
        if (seed !== undefined) {
          values[stateKey({ kind: "input", operationId: op.id, nodeId: input.nodeId })] = seed;
        }
      }
    }
    store.dispatch({ type: "seedInputs", values });
  }, [ioFor, operations, store]);

  // Restore persisted variables first: seeding never clobbers, so last
  // session's value outranks the declared default.
  useEffect(() => {
    store.dispatch({ type: "seedVariables", values: loadPersistedVariables(instanceKey, variables) });
    store.dispatch({ type: "seedVariables", values: initialVariableValues(variables) });
  }, [instanceKey, store, variables]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        savePersistedVariables(instanceKey, variables, store.getState().variables);
      }, PERSIST_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [instanceKey, store, variables]);

  const owned = useRef(new Map<string, InvocationState>());
  const started = useRef(new Map<string, StartedRun>());

  const outputVariables = useMemo(() => {
    const byOperation = new Map<string, Map<string, string>>();
    for (const op of operations) {
      byOperation.set(
        op.id,
        new Map(outputVariableTargets(op).map(({ nodeId, variableId }) => [nodeId, variableId]))
      );
    }
    return byOperation;
  }, [operations]);

  const fold = useCallback(
    (message: RunMessage) => {
      const events = messageToEvents(message, {
        resolveInvocation: (jobId) => (jobId ? (owned.current.get(jobId) ?? null) : null),
        outputKey: (operationId, nodeId) =>
          ioFor(operationId).outputs.some((output) => output.nodeId === nodeId)
            ? stateKey({ kind: "output", operationId, nodeId })
            : null,
        outputVariable: (operationId, nodeId) =>
          outputVariables.get(operationId)?.get(nodeId) ?? null
      });
      for (const event of events) {
        store.dispatch(event);
        if (event.type === "invocationStatus") {
          const invocation = owned.current.get(event.invocationId);
          if (invocation) invocation.status = event.status;
          if (event.status !== "pending" && event.status !== "running") {
            const run = started.current.get(event.invocationId);
            if (run?.timer) clearTimeout(run.timer);
            started.current.delete(event.invocationId);
          }
        }
      }
    },
    [ioFor, outputVariables, store]
  );

  const settle = useCallback(
    (invocationId: string, status: "failed" | "cancelled" | "completed", error?: string) => {
      const invocation = owned.current.get(invocationId);
      if (!invocation || !isLiveInvocation(invocation)) return;
      invocation.status = status;
      const run = started.current.get(invocationId);
      if (run?.timer) clearTimeout(run.timer);
      started.current.delete(invocationId);
      store.dispatch({
        type: "invocationStatus",
        invocationId,
        status,
        ...(error ? { error } : {})
      });
    },
    [store]
  );

  const failToStart = useCallback(
    (operationId: string, error: string) => {
      const invocation: InvocationState = {
        id: `failed-${operationId}-${Date.now()}`,
        operationId,
        status: "failed",
        error,
        startedAt: Date.now()
      };
      owned.current.set(invocation.id, invocation);
      store.dispatch({ type: "runStarted", invocation, outputKeys: [] });
    },
    [store]
  );

  const cancelInvocations = useCallback(
    (ids: ReadonlyArray<string>, error?: string) => {
      for (const id of ids) {
        started.current.get(id)?.controller.abort();
        settle(id, error ? "failed" : "cancelled", error);
      }
    },
    [settle]
  );

  const waitForSettled = useCallback(
    (ids: ReadonlyArray<string>) =>
      new Promise<void>((resolve) => {
        const done = () =>
          ids.every((id) => {
            const invocation = store.getState().invocations[id];
            return !invocation || !isLiveInvocation(invocation);
          });
        if (done()) {
          resolve();
          return;
        }
        const unsubscribe = store.subscribe(() => {
          if (!done()) return;
          unsubscribe();
          resolve();
        });
      }),
    [store]
  );

  const run = useCallback(
    async (operationId: string) => {
      const operation = operations.find((op) => op.id === operationId);
      if (!operation) {
        failToStart(operations[0]?.id ?? "main", `This app has no operation "${operationId}".`);
        return;
      }
      const decision = decideRun(store.getState(), operation);
      if (decision.kind === "replace") cancelInvocations(decision.cancel);
      else if (decision.kind === "queue") await waitForSettled(decision.after);

      const io = ioFor(operation.id);
      const params = resolveOperationParams({
        operation,
        state: store.getState(),
        inputNodeIds: io.inputs.map((input) => input.nodeId),
        inputName: (nodeId) => io.inputs.find((input) => input.nodeId === nodeId)?.name
      });
      const propertyOverrides: Record<string, { value: unknown }> = {};
      for (const [key, value] of Object.entries(store.getState().inputs)) {
        const ref = parseInputStateKey(key);
        if (ref?.operationId === operation.id && ref.property !== undefined) {
          propertyOverrides[`${ref.nodeId}#${ref.property}`] = { value };
        }
      }

      const invocationId = crypto.randomUUID();
      const runState: StartedRun = {
        operationId: operation.id,
        invocationId,
        controller: new AbortController()
      };
      const invocation: InvocationState = {
        id: invocationId,
        operationId: operation.id,
        status: "running",
        startedAt: Date.now()
      };
      owned.current.set(invocationId, invocation);
      started.current.set(invocationId, runState);
      store.dispatch({
        type: "runStarted",
        invocation,
        outputKeys: io.outputs.map((output) =>
          stateKey({ kind: "output", operationId: operation.id, nodeId: output.nodeId })
        )
      });
      if (operation.timeoutMs && operation.timeoutMs > 0) {
        const limit = operation.timeoutMs;
        runState.timer = setTimeout(
          () => cancelInvocations([invocationId], `Run timed out after ${limit}ms`),
          limit
        );
      }

      try {
        const target = operationTarget(operation);
        const runTarget: RunRequest["target"] =
          target.kind === "script" ? { script: target.scriptId } : { workflow: target.workflowId };
        await runOperation({
          target: runTarget,
          params,
          operationId: operation.id,
          propertyOverrides,
          jobId: invocationId,
          signal: runState.controller.signal,
          onMessage: fold
        });
        // A stream that closed without a terminal status still has to end.
        settle(invocationId, "failed", "The server closed the run without a result.");
      } catch (error) {
        if (runState.controller.signal.aborted) return;
        settle(invocationId, "failed", error instanceof Error ? error.message : "Run failed");
      }
    },
    [cancelInvocations, failToStart, fold, ioFor, operations, settle, store, waitForSettled]
  );

  const cancel = useCallback(
    (operationId: string, invocationId?: string) => {
      if (invocationId) {
        cancelInvocations([invocationId]);
        return;
      }
      cancelInvocations(
        Object.values(store.getState().invocations)
          .filter((i) => i.operationId === operationId && isLiveInvocation(i))
          .map((i) => i.id)
      );
    },
    [cancelInvocations, store]
  );

  useEffect(
    () => () => {
      for (const runState of started.current.values()) {
        runState.controller.abort();
        if (runState.timer) clearTimeout(runState.timer);
      }
    },
    []
  );

  const write = useCallback(
    (ref: BindingRef, value: unknown) => {
      const key = stateKey(ref);
      switch (ref.kind) {
        case "variable":
          store.dispatch({ type: "setVariable", variableId: ref.variableId, value });
          break;
        case "view":
          store.dispatch({ type: "setView", key, value });
          break;
        default:
          store.dispatch({ type: "setInput", key, value });
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
          cancel(action.operationId ?? scope.defaultOperationId, action.invocationId);
          break;
        case "setVariable":
          store.dispatch({ type: "setVariable", variableId: action.variableId, value: action.value });
          break;
        case "toggleVariable":
          store.dispatch({ type: "toggleVariable", variableId: action.variableId });
          break;
        default:
          // Resource commands read and write NodeTool documents, which an
          // exported app has no database for.
          console.warn(`"${action.kind}" needs a NodeTool server and is ignored here.`);
      }
    },
    [cancel, run, scope.defaultOperationId, store]
  );

  return useMemo(
    () => ({ store, scope, operations, ioFor, dispatch, write, modelChoices }),
    [dispatch, ioFor, modelChoices, operations, scope, store, write]
  );
}
