import { z } from "zod";
import { operationTarget } from "@nodetool-ai/app-runtime";
import {
  applicationReleaseVersion,
  AppRunError,
  createAppInstance,
  createJsScriptResolver,
  deleteAppInstance,
  deleteAppRun,
  duplicateAppInstance,
  ensureDefaultAppInstance,
  getAppInstance,
  getDefaultAppInstance,
  getAppRun,
  Job,
  listAppInstances,
  listAppRuns,
  reserveAppRun,
  registerRunTrace,
  resolveAppInstanceApplicationId,
  setAppRunInputs,
  settleAppRun,
  updateAppInstance,
  Workflow,
  WorkflowVersion
} from "@nodetool-ai/models";
import {
  appRunSnapshot,
  createInstanceInput,
  reserveRunInput,
  updateInstanceInput,
  type AppRunRecord,
  type AppRunSnapshot
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { jsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { graph } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import { loadOwnedApplication } from "./applications-service.js";
import { cancelAppRun } from "./app-run-cancellation.js";
import { jobRunRegistry } from "../job-run-registry.js";
import { getBrowserAppRunRoot, finishBrowserAppRunTrace } from "@nodetool-ai/execution";

export const patchAppRunInput = z
  .object({
    id: z.string().min(1),
    status: z.enum(["running", "completed", "failed", "cancelled"]).optional(),
    inputs: z.record(z.string(), z.unknown()).optional(),
    outputs: z.record(z.string(), z.unknown()).optional(),
    documents: z
      .array(z.object({ kind: z.string(), id: z.string() }))
      .optional(),
    error: z.string().nullable().optional()
  })
  .strict();

type CreateInput = z.infer<typeof createInstanceInput>;

async function freezeSnapshot(
  userId: string,
  input: CreateInput
): Promise<AppRunSnapshot> {
  let snapshot = appRunSnapshot.parse(input.snapshot);
  if (input.application_id) {
    const app = await loadOwnedApplication(userId, input.application_id);
    if (input.version != null) {
      const version = await applicationReleaseVersion(
        app.id,
        input.version,
        userId
      );
      if (!version) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Application version not found");
      }
      snapshot = {
        document: appRunSnapshot.shape.document.parse(version.document),
        workflow_graphs: Object.fromEntries(
          version.workflows.flatMap((item) =>
            item.graph ? [[item.workflowId, graph.parse(item.graph)]] : []
          )
        ),
        script_documents: {}
      };
    }
  }
  const frozen = structuredClone(snapshot);
  for (const operation of frozen.document.operations) {
    const target = operationTarget(operation);
    if (target.kind === "script") {
      // Inline bundles carry their own script documents. A stored release
      // always resolves the declared immutable version through its owner.
      if (input.version == null && frozen.script_documents[target.scriptId]) {
        continue;
      }
      const resolved = await createJsScriptResolver().resolve(
        { id: target.scriptId, version: target.scriptVersion },
        userId
      );
      if (!resolved) {
        throwApiError(
          ApiErrorCode.NOT_FOUND,
          "Operation script version not found"
        );
      }
      frozen.script_documents[target.scriptId] = jsScriptDocument.parse(
        resolved.document
      );
    } else if (
      target.workflowId &&
      !frozen.workflow_graphs[target.workflowId]
    ) {
      const workflow = await Workflow.find(userId, target.workflowId);
      if (!workflow) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Operation workflow not found");
      }
      const pinnedVersion =
        operation.workflowVersion ??
        (operation.target?.kind === "workflow"
          ? operation.target.workflowVersion
          : undefined);
      if (pinnedVersion !== undefined) {
        const version = await WorkflowVersion.findByVersion(
          workflow.id,
          pinnedVersion
        );
        if (!version || version.user_id !== workflow.user_id) {
          throwApiError(
            ApiErrorCode.NOT_FOUND,
            "Operation workflow version not found"
          );
        }
        frozen.workflow_graphs[target.workflowId] = graph.parse(version.graph);
      } else {
        frozen.workflow_graphs[target.workflowId] = graph.parse(
          workflow.getGraph()
        );
      }
    }
  }
  return appRunSnapshot.parse(frozen);
}

/** Freeze a working copy without publishing an app or importing its bundle. */
export async function createOwnedAppInstance(
  userId: string,
  input: CreateInput,
  useDefault = false
) {
  if (input.application_id) {
    input = {
      ...input,
      application_id: await resolveAppInstanceApplicationId(
        userId,
        input.application_id
      )
    };
  }
  if (useDefault) {
    const existing = await getDefaultAppInstance(
      userId,
      input.source_id,
      input.application_id
    );
    if (existing) {
      return existing;
    }
  }
  const snapshot = await freezeSnapshot(userId, input);
  const fields = {
    userId,
    applicationId: input.application_id ?? null,
    sourceId: input.source_id,
    snapshot,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.version !== undefined && { version: input.version }),
    ...(input.variables !== undefined && { variables: input.variables })
  };
  return useDefault
    ? ensureDefaultAppInstance(fields)
    : createAppInstance(fields);
}

export async function getOwnedAppInstance(userId: string, id: string) {
  const instance = await getAppInstance(userId, id);
  if (!instance) {
    throwApiError(ApiErrorCode.NOT_FOUND, "App instance not found");
  }
  return instance;
}

export async function updateOwnedAppInstance(
  userId: string,
  input: z.infer<typeof updateInstanceInput>
) {
  await getOwnedAppInstance(userId, input.id);
  return updateAppInstance(userId, input.id, {
    expectedRevision: input.expected_revision,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.variables !== undefined && { variables: input.variables })
  });
}

export async function getOwnedAppRun(
  userId: string,
  id: string
): Promise<AppRunRecord> {
  const run = await getAppRun(userId, id);
  if (!run) {
    throwApiError(ApiErrorCode.NOT_FOUND, "App run not found");
  }
  return run;
}

export async function reserveOwnedAppRun(
  userId: string,
  input: z.infer<typeof reserveRunInput>
) {
  const instance = await getOwnedAppInstance(userId, input.instance_id);
  const decision = await reserveAppRun({
    userId,
    instanceId: instance.id,
    operationId: input.operation_id,
    invocationId: input.invocation_id,
    origin: "ui"
  });
  if (!decision.allowed) {
    throwApiError(ApiErrorCode.BUDGET_EXCEEDED, decision.reason);
  }
  await registerRunTrace(userId, {
    id: decision.run.id,
    kind: "app",
    sourceId: decision.run.id,
    traceId: decision.run.trace_id,
    origin: decision.run.origin,
    parents: [
      { kind: "app_run", id: decision.run.id },
      { kind: "instance", id: instance.id },
      ...(decision.run.application_id ? [{ kind: "app" as const, id: decision.run.application_id }] : [])
    ]
  });
  return decision.run;
}

export async function appRunApi<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppRunError) {
      const codes = {
        not_found: ApiErrorCode.NOT_FOUND,
        conflict: ApiErrorCode.ALREADY_EXISTS,
        invalid_input: ApiErrorCode.INVALID_INPUT,
        budget_exceeded: ApiErrorCode.BUDGET_EXCEEDED
      };
      throwApiError(codes[error.code], error.message);
    }
    throw error;
  }
}

/** Browser state cannot report provider cost or settle server-owned execution. */
export async function patchOwnedAppRun(
  userId: string,
  input: z.infer<typeof patchAppRunInput>
) {
  const run = await getOwnedAppRun(userId, input.id);
  const browserRoot = await getBrowserAppRunRoot(userId, run.id);
  if (
    run.execution_started_at &&
    run.status === "running" &&
    input.inputs !== undefined
  ) {
    throwApiError(
      ApiErrorCode.ALREADY_EXISTS,
      "The execution host owns this run's inputs"
    );
  }
  if (input.inputs !== undefined && run.status === "running") {
    await setAppRunInputs(userId, run.id, input.inputs);
  }
  if (input.status && input.status !== "running") {
    if (run.execution_started_at && run.status === "running" && !browserRoot) {
      if (input.status === "cancelled") {
        if (cancelAppRun(userId, run.id)) {
          return getOwnedAppRun(userId, run.id);
        }
        const execution = jobRunRegistry.get(userId, run.invocation_id);
        if (execution?.status === "running") {
          execution.cancel();
          return getOwnedAppRun(userId, run.id);
        }
        const job = await Job.find(userId, run.invocation_id);
        if (job?.status === "queued") {
          job.markCancelled();
          await job.save();
          return settleAppRun(userId, run.id, {
            status: "cancelled",
            actualUsd: 0,
            updateInstance: false
          });
        }
      }
      throwApiError(
        ApiErrorCode.ALREADY_EXISTS,
        "The execution host owns this run's outcome"
      );
    }
    // Server workflow/script paths settle their measured charges. Browser
    // completion only closes a reservation with an unresolved cost estimate.
    const settled = await settleAppRun(userId, run.id, {
      status: input.status,
      updateInstance: !run.execution_started_at || Boolean(browserRoot),
      ...(input.outputs !== undefined && { outputs: input.outputs }),
      ...(input.documents !== undefined && { documents: input.documents }),
      ...(input.error !== undefined && { error: input.error })
    });
    if (browserRoot && settled && settled.status !== "running") {
      await finishBrowserAppRunTrace(userId, run.id, settled.status);
    }
    return settled;
  }
  return getOwnedAppRun(userId, run.id);
}

export {
  deleteAppInstance,
  deleteAppRun,
  duplicateAppInstance,
  listAppInstances,
  listAppRuns
};
