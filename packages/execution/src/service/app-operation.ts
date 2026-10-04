import {
  applyEvents,
  createInstanceState,
  messagesToEvents,
  operationTarget,
  parseApplicationDocument,
  outputVariableTargets,
  resolveOperationParams,
  stateKey,
  type ResourceRef,
  type ScriptRunResult
} from "@nodetool-ai/app-runtime";
import {
  AppRunError,
  getAppRun,
  claimAppRun,
  reconcileAppRunCost,
  getAppInstance,
  reserveAppRun,
  setAppRunInputs,
  settleAppRun
} from "@nodetool-ai/models";
import type { AppRunRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { ProcessingContext, inAppRunCostAccount } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  debugGraphOf,
  documentOperations,
  extractAppIO,
  jsScriptRunMessages,
  scriptAppIO,
  scriptOperationInvocation,
  type AppServerRunInput,
  type AppServerRunOutcome,
  type JsScriptOperationRunner
} from "../app-debug/index.js";
import { isRecord } from "../predicates.js";
import { attachRunCostLedger } from "../cost-ledger.js";
import { createFalGenerationLifecycleHooks } from "../generation-lifecycle.js";
import { createAppServerRunner } from "./app-run-server.js";

export interface ExecuteAppOperationOptions {
  readonly userId: string;
  readonly instanceId: string;
  readonly operationId: string;
  readonly invocationId: string;
  readonly origin: AppRunRecord["origin"];
  readonly context: ProcessingContext;
  readonly registry: NodeRegistry;
  /** Already reserved by a trusted host. */
  readonly runId?: string;
  readonly estimatedUsd?: number;
  readonly runnerInstance?: string | null;
  readonly requireFiniteBudget?: boolean;
  readonly inputValues?: Readonly<Record<string, unknown>>;
  readonly resourceRef?: (id: string) => ResourceRef | undefined;
  readonly scriptRunner?: (
    context: ProcessingContext,
    input: Parameters<JsScriptOperationRunner>[0]
  ) => Promise<ScriptRunResult>;
  readonly workflowRunner?: (
    context: ProcessingContext,
    input: AppServerRunInput
  ) => Promise<AppServerRunOutcome>;
}

export interface AppOperationOutcome {
  /** Deleted history returns a content-free terminal snapshot that is not persisted. */
  readonly run: AppRunRecord;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly messages: ReadonlyArray<Record<string, unknown>>;
  readonly reused: boolean;
}

/** Reserve before resolving bindings, secrets, or executable targets. */
export async function executeAppOperation(
  options: ExecuteAppOperationOptions
): Promise<AppOperationOutcome> {
  let run: AppRunRecord;
  if (options.runId) {
    const existing = await getAppRun(options.userId, options.runId);
    if (
      !existing ||
      existing.instance_id !== options.instanceId ||
      existing.operation_id !== options.operationId
    ) {
      throw new Error("App run does not match the requested operation");
    }
    run = existing;
  } else {
    const reservation = await reserveAppRun({
      userId: options.userId,
      instanceId: options.instanceId,
      operationId: options.operationId,
      invocationId: options.invocationId,
      origin: options.origin,
      estimatedUsd: options.estimatedUsd,
      requireFiniteBudget: options.requireFiniteBudget
    });
    if (!reservation.allowed) {
      throw new Error(reservation.reason);
    }
    run = reservation.run;
    if (!reservation.created) {
      return { run, variables: {}, messages: [], reused: true };
    }
  }
  if (
    run.status !== "running" ||
    !(await claimAppRun(options.userId, run.id, options.runnerInstance))
  ) {
    return { run, variables: {}, messages: [], reused: true };
  }
  const identity = {
    userId: options.userId,
    instanceId: run.instance_id,
    appRunId: run.id,
    traceId: run.trace_id,
    origin: run.origin
  };
  const context = options.context.copy({
    jobId: run.id,
    appRunContext: identity,
    generationLifecycle: createFalGenerationLifecycleHooks({
      userId: options.userId,
      jobId: run.id,
      appRunContext: identity,
      publicUrl: process.env["NODETOOL_PUBLIC_URL"] ?? null
    })
  });
  const messages: Array<Record<string, unknown>> = [];
  let variableChanges: Record<string, unknown> = {};
  try {
    context.signal.throwIfAborted();
    const instance = await getAppInstance(options.userId, run.instance_id);
    if (!instance) {
      throw new Error("App instance was deleted before execution");
    }
    const snapshot = run.snapshot ?? instance.snapshot;
    const document = parseApplicationDocument(snapshot.document);
    if (!document) {
      throw new Error("Pinned application document is invalid");
    }
    const operation = documentOperations(document).find(
      (candidate) => candidate.id === run.operation_id
    );
    if (!operation) {
      throw new Error("Operation is missing from the pinned application");
    }
    const target = operationTarget(operation);
    const carriedScript =
      target.kind === "script"
        ? snapshot.script_documents[target.scriptId]
        : undefined;
    const graph =
      target.kind === "workflow"
        ? debugGraphOf(snapshot.workflow_graphs[target.workflowId])
        : null;
    const io = carriedScript
      ? scriptAppIO(carriedScript)
      : graph
        ? extractAppIO(graph)
        : null;
    if (!io) {
      throw new Error(
        "Execution target is missing from the pinned application"
      );
    }
    let state = createInstanceState();
    state.variables = run.origin === "public" ? {} : { ...instance.variables };
    const cachedInputs = state.variables["__app_inputs"];
    const inputValues =
      options.inputValues ?? (isRecord(cachedInputs) ? cachedInputs : {});
    for (const input of io.inputs) {
      const key = stateKey({
        kind: "input",
        operationId: operation.id,
        nodeId: input.nodeId
      });
      const stored = inputValues[key];
      const value =
        stored && typeof stored === "object" && "value" in stored
          ? stored.value
          : (stored ?? input.defaultValue);
      state.inputs[key] = { value, dirty: stored !== undefined, revision: 0 };
    }
    const params = resolveOperationParams({
      operation,
      state,
      inputNodeIds: io.inputs.map((input) => input.nodeId),
      inputName: (id) => io.inputs.find((input) => input.nodeId === id)?.name,
      resourceRef: options.resourceRef
    });
    await setAppRunInputs(options.userId, run.id, params, [
      ...context.getResolvedSecretValues()
    ]);
    const variableTargets = new Map(
      outputVariableTargets(operation).map((target) => [
        target.nodeId,
        target.variableId
      ])
    );
    state = applyEvents(state, [
      {
        type: "runStarted",
        invocation: {
          id: run.id,
          operationId: operation.id,
          status: "running",
          startedAt: Date.parse(run.created_at)
        },
        outputKeys: io.outputs.map(
          (output) => `${operation.id}:${output.nodeId}`
        ),
        variableKeys: [...variableTargets.values()]
      }
    ]);
    let status: "completed" | "failed" | "cancelled" = "completed";
    let error: string | null = null;
    if (target.kind === "script" && carriedScript) {
      if (!options.scriptRunner) {
        throw new Error("Host does not provide script execution");
      }
      const ledger = attachRunCostLedger(context, {
        userId: options.userId,
        workflowId: null,
        appRunContext: identity
      });
      try {
        const scriptRunner = options.scriptRunner;
        const result = await inAppRunCostAccount(
          context.appRunCostAccount,
          () =>
            scriptRunner(context, {
              scriptId: target.scriptId,
              scriptVersion: target.scriptVersion,
              name: operation.name,
              document: carriedScript,
              ...scriptOperationInvocation(carriedScript, params),
              timeoutMs: operation.timeoutMs
            })
        );
        messages.push(...jsScriptRunMessages(result));
        if (!result.ok) {
          status = context.signal.aborted ? "cancelled" : "failed";
          error = result.error ?? "Script operation failed";
        }
      } finally {
        await ledger.settled();
        ledger();
      }
    } else if (target.kind === "workflow" && graph) {
      const runner =
        options.workflowRunner ??
        ((parent, input) =>
          createAppServerRunner(options.userId, options.registry, {
            context: parent
          })(input));
      const outcome = await runner(context, {
        graph,
        workflowId: target.workflowId,
        params,
        timeoutMs: operation.timeoutMs
      });
      messages.push(...outcome.rawMessages);
      status = outcome.report.ok
        ? "completed"
        : outcome.report.status === "cancelled"
          ? "cancelled"
          : "failed";
      error = outcome.report.error;
    }
    state = applyEvents(
      state,
      messagesToEvents(messages, {
        resolveInvocation: () => state.invocations[run.id] ?? null,
        outputKey: (_, nodeId) => `${operation.id}:${nodeId}`,
        outputVariable: (_, nodeId) => variableTargets.get(nodeId) ?? null
      })
    );
    variableChanges = Object.fromEntries(
      [...variableTargets.values()]
        .filter((id) => id in state.variables)
        .map((id) => [id, state.variables[id]])
    );
    variableChanges["__app_outputs"] = Object.fromEntries(
      Object.entries(state.outputs).map(([key, slot]) => [key, slot.value])
    );
    const settlement: Parameters<typeof settleAppRun>[2] = {
      status,
      error,
      outputs: variableChanges,
      documents: context.getAppRunDocuments(),
      expectedRevision: run.instance_revision,
      secretValues: [...context.getResolvedSecretValues()]
    };
    const knownLlmUsd = context.getAppRunLlmCost();
    if (knownLlmUsd !== null) {
      settlement.knownLlmUsd = knownLlmUsd;
    }
    run = await settleOperationRun(options.userId, run, settlement);
  } catch (error) {
    const settlement: Parameters<typeof settleAppRun>[2] = {
      status: context.signal.aborted ? "cancelled" : "failed",
      error: error instanceof Error ? error.message : String(error),
      secretValues: [...context.getResolvedSecretValues()],
      documents: context.getAppRunDocuments()
    };
    const knownLlmUsd = context.getAppRunLlmCost();
    if (knownLlmUsd !== null) {
      settlement.knownLlmUsd = knownLlmUsd;
    }
    run = await settleOperationRun(options.userId, run, settlement);
  }
  await reconcileAppRunCost(options.userId, run.id);
  run = (await getAppRun(options.userId, run.id)) ?? run;
  return { run, variables: variableChanges, messages, reused: false };
}

async function settleOperationRun(
  userId: string,
  run: AppRunRecord,
  settlement: Parameters<typeof settleAppRun>[2]
): Promise<AppRunRecord> {
  try {
    return await settleAppRun(userId, run.id, settlement);
  } catch (error) {
    if (!(error instanceof AppRunError) || error.code !== "not_found") {
      throw error;
    }
    return {
      ...run,
      status: settlement.status,
      snapshot: null,
      inputs: null,
      outputs: null,
      documents: null,
      error: null,
      content_expired: 1,
      settled_at: new Date().toISOString()
    };
  }
}
