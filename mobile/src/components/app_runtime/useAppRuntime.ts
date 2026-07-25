/**
 * The reactive engine.
 *
 * Binds an app-instance store to the shared per-workflow runner, folds the
 * run's streaming messages into namespaced state, and turns widget actions into
 * runs. All the semantics — what a message does to a value, which invocation
 * owns a slot, how an action reads — live in `@nodetool-ai/app-runtime`; this
 * hook is the React Native adapter around them.
 *
 * Run identity is the load-bearing part: every invocation this app starts is
 * registered by its `job_id`, and a streaming message for any other job is
 * dropped, so a run started in the chain editor never folds into what the app
 * shows.
 *
 * Unlike web there is no reactive subgraph path — mobile has no browser worker
 * — so every `run` action runs the whole workflow on the server.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  implicitOperation,
  mergeVariables,
  messageToEvents,
  resolveOperationParams,
  stateKey,
  type AppAction,
  type ApplicationDocument,
  type BindingRef,
  type BindingScope,
  type InvocationState,
  type OperationBinding,
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

type RawMessage = Record<string, unknown>;

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

  // The operation a widget's run targets. Multi-operation apps arrive with the
  // application entity; until then every app has exactly one.
  const operation: OperationBinding = useMemo(
    () => document?.operations[0] ?? implicitOperation(workflowId ?? ""),
    [document, workflowId]
  );

  // Everything a stored binding string can resolve against. Legacy documents
  // bind by name; the scope turns those names into node IDs here, so a later
  // rename in the graph editor is invisible to the app.
  const scope: BindingScope = useMemo(
    () => ({
      defaultOperationId: operation.id,
      operations: [
        {
          operationId: operation.id,
          inputs: io.inputs.map(({ nodeId, name }) => ({ nodeId, name })),
          outputs: io.outputs.map(({ nodeId, name }) => ({ nodeId, name })),
          nodeIds: (workflow?.graph?.nodes ?? []).map(
            (node: { id: string }) => node.id
          ),
          variableNames: extractVariableNames(workflow),
        },
      ],
      variables: mergeVariables(
        document?.variables ?? [],
        extractVariableNames(workflow)
      ),
    }),
    [document, io, operation.id, workflow]
  );

  const inputKey = useCallback(
    (nodeId: string) =>
      stateKey({ kind: "input", operationId: operation.id, nodeId }),
    [operation.id]
  );
  const outputKey = useCallback(
    (nodeId: string) =>
      stateKey({ kind: "output", operationId: operation.id, nodeId }),
    [operation.id]
  );

  // Kept in the instance registry so values survive an editor↔app toggle.
  const store: AppRuntimeStore = useMemo(() => {
    const target = getAppRuntimeStore(
      workflowInstanceId(workflowId ?? "__app_runtime__")
    );
    const values: Record<string, unknown> = {};
    for (const input of io.inputs) {
      const seed = seedInputValue(input);
      if (seed !== undefined) {values[inputKey(input.nodeId)] = seed;}
    }
    target.getState().dispatchEvent({ type: "seedInputs", values });
    return target;
  }, [inputKey, io.inputs, workflowId]);

  const runnerStore = useWorkflowRunner(workflowId ?? "__app_runtime__");

  const outputNodeIdsRef = useRef<Set<string>>(new Set());
  outputNodeIdsRef.current = useMemo(
    () => new Set(io.outputs.map((o) => o.nodeId)),
    [io.outputs]
  );

  // Invocations this app started, by job id. A streaming message for anything
  // else is not ours — that is the cross-run contamination fix.
  const ownedRef = useRef(new Map<string, InvocationState>());
  // Messages that arrived between dispatching a run and learning its job id.
  const pendingRef = useRef<RawMessage[]>([]);
  // True from the moment a run is dispatched until its job id comes back. The
  // runner resolves as soon as the request is sent, well before the server
  // answers, so this cannot be tied to the run promise.
  const expectingJobRef = useRef(false);

  const fold = useCallback(
    (message: RawMessage) => {
      const events = messageToEvents(message, {
        resolveInvocation: (jobId) =>
          jobId ? ownedRef.current.get(jobId) ?? null : null,
        outputKey: (_operationId, nodeId) =>
          outputNodeIdsRef.current.has(nodeId) ? outputKey(nodeId) : null,
      });
      for (const event of events) {
        store.getState().dispatchEvent(event);
        if (event.type === "invocationStatus") {
          const invocation = ownedRef.current.get(event.invocationId);
          if (invocation) {invocation.status = event.status;}
        }
      }
    },
    [outputKey, store]
  );
  const foldRef = useRef(fold);
  foldRef.current = fold;

  const outputsRef = useRef(io.outputs);
  outputsRef.current = io.outputs;

  /** Register a run this app started and flush anything buffered for it. */
  const claimInvocation = useCallback(
    (jobId: string) => {
      const invocation: InvocationState = {
        id: jobId,
        operationId: operation.id,
        status: "running",
        startedAt: Date.now(),
      };
      ownedRef.current.set(jobId, invocation);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation,
        outputKeys: outputsRef.current.map((output) =>
          outputKey(output.nodeId)
        ),
      });
      const buffered = pendingRef.current;
      pendingRef.current = [];
      for (const message of buffered) {foldRef.current(message);}
    },
    [operation.id, outputKey, store]
  );
  const claimRef = useRef(claimInvocation);
  claimRef.current = claimInvocation;

  useEffect(() => {
    if (!workflowId) {return undefined;}

    const handler = (message: RawMessage) => {
      const jobId = message.job_id;
      if (typeof jobId === "string") {
        // The first job id to arrive after we dispatched a run is that run.
        if (!ownedRef.current.has(jobId)) {
          if (!expectingJobRef.current) {return;}
          expectingJobRef.current = false;
          claimRef.current(jobId);
        }
        foldRef.current(message);
        return;
      }
      // A run we started whose job id has not come back yet: buffer rather than
      // drop, then replay once the id is known.
      if (expectingJobRef.current) {pendingRef.current.push(message);}
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

  const run = useCallback(async () => {
    if (!workflow) {return;}
    // Bindings key on node IDs; the run protocol wants names. That translation
    // happens here, at the execution boundary, which is why a graph rename
    // never touches the app document.
    const params = resolveOperationParams({
      operation,
      state: store.getState(),
      inputNodeIds: io.inputs.map((input) => input.nodeId),
      inputName: (nodeId) =>
        io.inputs.find((input) => input.nodeId === nodeId)?.name,
    });

    expectingJobRef.current = true;
    pendingRef.current = [];
    try {
      await runnerStore.getState().run(params, workflow);
    } catch (error) {
      expectingJobRef.current = false;
      pendingRef.current = [];
      const failed: InvocationState = {
        id: `failed-${Date.now()}`,
        operationId: operation.id,
        status: "failed",
        error: error instanceof Error ? error.message : "Run failed",
        startedAt: Date.now(),
      };
      ownedRef.current.set(failed.id, failed);
      store.getState().dispatchEvent({
        type: "runStarted",
        invocation: failed,
        outputKeys: [],
      });
    }
  }, [io.inputs, operation, runnerStore, store, workflow]);

  const cancel = useCallback(async () => {
    await runnerStore.getState().cancel();
    for (const [id, invocation] of ownedRef.current) {
      if (invocation.status !== "running" && invocation.status !== "pending") {
        continue;
      }
      invocation.status = "cancelled";
      store.getState().dispatchEvent({
        type: "invocationStatus",
        invocationId: id,
        status: "cancelled",
      });
    }
  }, [runnerStore, store]);

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
          void run();
          break;
        case "cancel":
          void cancel();
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
        default:
          // Resource actions need a provider router the mobile app has no
          // surface for yet; they are inert rather than an error.
          break;
      }
    },
    [cancel, run, store]
  );

  return useMemo(
    () => ({ store, io, scope, operation, dispatch, write }),
    [dispatch, io, operation, scope, store, write]
  );
};
