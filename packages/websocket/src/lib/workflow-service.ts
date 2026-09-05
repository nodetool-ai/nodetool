/**
 * The one implementation of workflow create/update/delete.
 *
 * REST (`routes/workflows.ts` -> `http-api.ts`) and tRPC (`trpc/routers/
 * workflows.ts`) both call these; each maps `WorkflowServiceError` onto its own
 * wire shape. The three copies that preceded this had already drifted — REST
 * deleted the row without the collaborator/share cascade, seeded an example's
 * graph but not its `app_doc`, and re-implemented the collaborator role check.
 *
 * Authoring-quality validation (`normalizeWorkflowGraph`, model-selection and
 * leftover-handle checks) deliberately stays in the agent capability: the
 * editor saves in-progress graphs with unset models, so gating persistence on
 * it would reject saves the UI makes today.
 */

import { Workflow, WorkflowCollaborator } from "@nodetool-ai/models";
import type { Workflow as WorkflowModel } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";
import { ApiErrorCode } from "../error-codes.js";
import { syncRegistrations } from "../triggers/registration-sync.js";
import {
  loadExampleGraph,
  defaultExamplePackageName
} from "../example-workflows.js";

type ExampleLoadOptions = NonNullable<Parameters<typeof loadExampleGraph>[2]>;

const log = createLogger("nodetool.websocket.workflow-service");

export const WORKFLOW_CONFLICT_MESSAGE =
  "Workflow was modified since last read (optimistic concurrency conflict)";

/** A failure both wire formats can map: tRPC reads `code`, REST reads `status`. */
export class WorkflowServiceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "WorkflowServiceError";
  }
}

function notFound(): never {
  throw new WorkflowServiceError(
    ApiErrorCode.WORKFLOW_NOT_FOUND,
    "Workflow not found",
    404
  );
}

export interface WorkflowGraphInput {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

/** The fields both writers accept. Absent means "leave alone" on update. */
export interface WorkflowWriteInput {
  name?: string;
  tool_name?: string | null;
  package_name?: string | null;
  path?: string | null;
  tags?: string[] | null;
  description?: string | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  access?: string | null;
  graph?: WorkflowGraphInput | null;
  settings?: Record<string, unknown> | null;
  run_mode?: string | null;
  workspace_id?: string | null;
  html_app?: string | null;
  app_doc?: Record<string, unknown> | null;
  expected_updated_at?: string;
}

/** Seed a new workflow from a shipped example when the caller sent no graph. */
export interface ExampleSeed {
  packageName?: string;
  exampleName: string;
  apiOptions: ExampleLoadOptions;
}

/**
 * Reconcile `trigger_registrations` against the workflow's current graph.
 * Non-fatal by design — a broken trigger sync must not stop a graph from
 * saving, so failures are logged and swallowed.
 */
export async function syncTriggerRegistrations(
  workflow: WorkflowModel
): Promise<void> {
  try {
    await syncRegistrations(workflow, {});
  } catch (error) {
    log.error("Trigger registration sync failed", {
      workflowId: workflow.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function requireGraph(input: WorkflowWriteInput): WorkflowGraphInput {
  if (input.name === undefined) {
    throw new WorkflowServiceError(
      ApiErrorCode.INVALID_INPUT,
      "Invalid workflow",
      400
    );
  }
  const graph = input.graph;
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new WorkflowServiceError(
      ApiErrorCode.INVALID_INPUT,
      "graph is required and must have nodes and edges arrays",
      400
    );
  }
  return graph;
}

function createRow(
  userId: string,
  input: WorkflowWriteInput,
  graph: WorkflowGraphInput,
  appDoc: Record<string, unknown> | null,
  id?: string
): Promise<unknown> {
  return Workflow.create({
    ...(id ? { id } : {}),
    user_id: userId,
    name: input.name,
    tool_name: input.tool_name ?? null,
    package_name: input.package_name ?? null,
    path: input.path ?? null,
    tags: input.tags ?? [],
    description: input.description ?? "",
    thumbnail: input.thumbnail ?? null,
    thumbnail_url: input.thumbnail_url ?? null,
    access: input.access === "public" ? "public" : "private",
    graph,
    settings: input.settings ?? null,
    run_mode: input.run_mode ?? "workflow",
    workspace_id: input.workspace_id ?? null,
    html_app: input.html_app ?? null,
    app_doc: appDoc
  });
}

/**
 * Create a workflow, optionally seeding graph and app UI from a shipped
 * example. Both the graph and the example's `app_doc` are carried over; only
 * one of the two former copies did the latter.
 */
export async function createWorkflow(
  userId: string,
  input: WorkflowWriteInput,
  seed?: ExampleSeed
): Promise<WorkflowModel> {
  let graph = input.graph ?? null;
  let appDoc = input.app_doc ?? null;

  if (seed && (!graph || graph.nodes?.length === 0)) {
    const packageName =
      seed.packageName ?? defaultExamplePackageName(seed.apiOptions) ?? "nodetool-base";
    const example = loadExampleGraph(packageName, seed.exampleName, seed.apiOptions);
    if (example?.graph) {
      graph = example.graph as WorkflowGraphInput;
    }
    if (appDoc == null && example?.app_doc) {
      appDoc = example.app_doc as Record<string, unknown>;
    }
  }

  const resolved = requireGraph({ ...input, graph });
  const workflow = (await createRow(
    userId,
    input,
    resolved,
    appDoc
  )) as WorkflowModel;
  await syncTriggerRegistrations(workflow);
  return workflow;
}

/**
 * Update a workflow, or create it under `id` when it does not exist (the
 * upsert-on-PUT both wire formats rely on). Optional columns are written only
 * when the caller sent them, so a partial save does not wipe stored values.
 */
export async function updateWorkflow(
  userId: string,
  id: string,
  input: WorkflowWriteInput
): Promise<WorkflowModel> {
  const graph = requireGraph(input);
  const existing = (await Workflow.get(id)) as WorkflowModel | null;

  if (existing) {
    const isOwner = existing.user_id === userId;
    if (!isOwner) {
      const grant = await WorkflowCollaborator.findFor(id, userId);
      if (grant?.role !== "editor") notFound();
    }

    const fields: Parameters<typeof Workflow.updateFieldsIfUnchanged>[2] = {
      name: input.name,
      tool_name: input.tool_name ?? null,
      description: input.description ?? "",
      tags: input.tags ?? [],
      package_name: input.package_name ?? null,
      graph
    };
    // Only the owner can change visibility; editors keep it as-is.
    if (isOwner) {
      fields.access = input.access === "public" ? "public" : "private";
    }
    if (input.thumbnail !== undefined) fields.thumbnail = input.thumbnail;
    if (input.settings !== undefined) fields.settings = input.settings ?? null;
    if (input.run_mode !== undefined && input.run_mode !== null) {
      fields.run_mode = input.run_mode;
    }
    if (input.workspace_id !== undefined) {
      fields.workspace_id = input.workspace_id ?? null;
    }
    if (input.html_app !== undefined) fields.html_app = input.html_app ?? null;
    if (input.app_doc !== undefined) fields.app_doc = input.app_doc;

    const updated = await Workflow.updateFieldsIfUnchanged(
      id,
      input.expected_updated_at ?? existing.updated_at,
      fields
    );
    if (!updated) {
      throw new WorkflowServiceError(
        ApiErrorCode.ALREADY_EXISTS,
        WORKFLOW_CONFLICT_MESSAGE,
        409
      );
    }
    await syncTriggerRegistrations(updated);
    return updated;
  }

  // An `expected_updated_at` names a row the caller believes it read, so a
  // missing row is a conflict, not an upsert.
  if (input.expected_updated_at) notFound();

  const workflow = (await createRow(
    userId,
    input,
    graph,
    input.app_doc ?? null,
    id
  )) as WorkflowModel;
  await syncTriggerRegistrations(workflow);
  return workflow;
}

/**
 * Delete a workflow the caller owns. `deleteOwned` carries the collaborator
 * and share rows with it: a workflow row can be recreated under the same id,
 * and a grant left behind would then apply to a workflow its holder was never
 * given.
 */
export async function deleteWorkflow(
  userId: string,
  id: string
): Promise<void> {
  const deleted = await Workflow.deleteOwned(userId, id);
  if (!deleted) notFound();
}
