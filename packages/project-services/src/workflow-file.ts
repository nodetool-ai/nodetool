/**
 * Workflows as files in the project folder (PRD T5):
 * `Workflows/<name>.workflow.json`.
 *
 * ```json
 * {
 *   "format": "nodetool.workflow",
 *   "version": 1,
 *   "id": "<workflow id>",
 *   "description": "",
 *   "tags": [],
 *   "run_mode": null,
 *   "settings": {},
 *   "graph": { "nodes": [], "edges": [] }
 * }
 * ```
 *
 * The file name is the workflow's name and the file holds no `name` field.
 * Owner, access, thumbnails and timestamps stay in the database. The sync
 * itself is `document-file-sync.ts`. This module is the workflow kind: which
 * fields the file carries and how a file's content is checked.
 *
 * Loading this module installs the sync on the `Workflow` model, so every
 * write of a workflow row writes the file: the web editor, REST, tRPC and the
 * agent tools all save through the model.
 *
 * Example and package workflows are templates read from their packages. They
 * are never saved as rows, so they are written to no folder.
 */
import { createLogger } from "@nodetool-ai/config";
import {
  Workflow,
  WorkflowVersion,
  setWorkflowFileSync,
  type WorkflowGraph
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  documentFileSync,
  writeMissingDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileContent
} from "./document-file-sync.js";

const log = createLogger("nodetool.project-services.workflow-file");

/** The directory workflow files are written in. */
export const WORKFLOW_FILE_DIRECTORY = "Workflows";
/** The end of every workflow file name. */
export const WORKFLOW_FILE_SUFFIX = ".workflow.json";
/** The `format` value of a workflow file. */
export const WORKFLOW_FILE_FORMAT = "nodetool.workflow";
/** The name of the version that keeps a workflow as it was before an import. */
export const WORKFLOW_FILE_EDIT_VERSION_NAME = "Before file edit";
/** The name of the version that keeps a file edit a save in NodeTool replaced. */
export const WORKFLOW_FILE_REPLACED_VERSION_NAME = "File edit replaced by a save";

/** The workflow fields a workflow file carries. */
export interface WorkflowFileFields {
  description: string;
  tags: string[];
  run_mode: string | null;
  settings: Record<string, unknown> | null;
  graph: WorkflowGraph;
}

let nodeRegistry: (() => NodeRegistry | undefined) | null = null;

/**
 * Give the import of workflow files the host's node registry, so a file that
 * names an unknown node type is refused as `update_workflow` refuses it.
 * Without one that check is skipped, as it is for a run that has no registry.
 */
export function setWorkflowFileNodeRegistry(
  registry: (() => NodeRegistry | undefined) | null
): void {
  nodeRegistry = registry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The text of a refusal: the error, then one line per issue. */
function refusalText(error: Record<string, unknown>): string {
  const lines = [String(error["error"] ?? "The workflow file was refused")];
  const issues = error["issues"];
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (isRecord(issue) && typeof issue["message"] === "string") {
        lines.push(issue["message"]);
      }
    }
  }
  return lines.join("\n");
}

/**
 * Check the body of a workflow file. The graph passes the checks
 * `update_workflow` runs and is stored in the shape that tool stores, so a
 * file edit cannot store a graph the tool would refuse.
 */
async function parseWorkflowFile(
  body: Record<string, unknown>
): Promise<DocumentFileContent<WorkflowFileFields>> {
  // A workflow with no run mode is a workflow, as the model reads it.
  const { description = "", tags = [], settings = null } = body;
  const run_mode = body["run_mode"] ?? "workflow";
  if (typeof description !== "string") {
    return { ok: false, error: '"description" must be a string' };
  }
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
    return { ok: false, error: '"tags" must be a list of strings' };
  }
  if (typeof run_mode !== "string") {
    return { ok: false, error: '"run_mode" must be a string or null' };
  }
  if (settings !== null && !isRecord(settings)) {
    return { ok: false, error: '"settings" must be an object or null' };
  }
  const graph = body["graph"];
  if (
    !isRecord(graph) ||
    !Array.isArray(graph["nodes"]) ||
    !Array.isArray(graph["edges"])
  ) {
    return {
      ok: false,
      error: '"graph" must be an object with "nodes" and "edges" lists'
    };
  }
  // Loaded on the first import of a file, so that loading this module does
  // not load the agent package.
  const { prepareWorkflowGraphForSave } = await import(
    "@nodetool-ai/agents/workflow-graph-save"
  );
  // The file is the whole document: links it does not name are gone.
  const prepared = await prepareWorkflowGraphForSave(graph, {
    nodeRegistry: nodeRegistry?.(),
    stored: undefined,
    // The file carries the layout. Only a node it gives no position is placed.
    keepLayout: true
  });
  if (!prepared.ok) return { ok: false, error: refusalText(prepared.error) };
  return {
    ok: true,
    fields: {
      description,
      tags: tags as string[],
      run_mode,
      settings,
      // SAFETY: the checks above and the normalization keep `nodes` and
      // `edges` as lists.
      graph: prepared.graph as WorkflowGraph
    }
  };
}

/** The workflow kind of {@link DocumentFileAdapter}. */
export const workflowFileAdapter: DocumentFileAdapter<
  Workflow,
  WorkflowFileFields
> = {
  kind: "workflow",
  directory: WORKFLOW_FILE_DIRECTORY,
  suffix: WORKFLOW_FILE_SUFFIX,
  format: WORKFLOW_FILE_FORMAT,
  untitled: "Untitled workflow",

  fieldsOf: (row) => ({
    description: row.description ?? "",
    tags: row.tags ?? [],
    run_mode: row.run_mode ?? null,
    settings: row.settings ?? null,
    graph: row.graph
  }),

  body: (fields) => ({
    description: fields.description,
    tags: fields.tags,
    run_mode: fields.run_mode,
    settings: fields.settings ?? {},
    graph: fields.graph
  }),

  parse: (body) => parseWorkflowFile(body),

  list: (userId, projectIds) => Workflow.listForProjects(userId, projectIds),

  // `Workflow.get` also answers for a 12-character prefix. This asks for the
  // exact ID only.
  exists: async (id) => (await Workflow.getManyByIds([id])).has(id),

  async snapshot(row, reason = "before-import") {
    const replaced = reason === "replaced-file";
    await WorkflowVersion.create({
      workflow_id: row.id,
      user_id: row.user_id,
      name: replaced
        ? WORKFLOW_FILE_REPLACED_VERSION_NAME
        : WORKFLOW_FILE_EDIT_VERSION_NAME,
      description: replaced
        ? "The graph of the workflow file that a save in NodeTool replaced"
        : "The workflow as it was before its file was edited",
      graph: row.graph,
      version: await WorkflowVersion.nextVersion(row.id),
      save_type: "checkpoint"
    });
  },

  update(row, fields, name) {
    const changes: Parameters<typeof Workflow.updateFieldsIfUnchanged>[2] = {
      ...fields
    };
    if (name !== undefined) changes.name = name;
    return Workflow.updateFieldsIfUnchanged(
      row.id,
      row.updated_at,
      changes,
      // A whole-graph write names no units, so an open editor falls back to
      // comparing graphs instead of treating its own as replaced.
      "graph" in fields
        ? { ops: [{ tool: "update_graph", input: {} }] }
        : undefined
    );
  },

  create: ({ id, userId, projectId, name, fields }) =>
    Workflow.create<Workflow>({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      ...fields
    }),

  setFileState: (id, state) => Workflow.setFileState(id, state)
};

setWorkflowFileSync(documentFileSync(workflowFileAdapter));

/**
 * Write a file for every workflow that has none yet: the workflows from
 * before project folders (PRD T9 step 3). Safe to interrupt and to run again,
 * and a second run writes nothing. A project whose folder cannot be reached
 * is skipped and tried again by the next run. Returns how many files were
 * written.
 */
export async function migrateWorkflowFiles(): Promise<number> {
  let written = 0;
  for (const { user_id, project_id } of await Workflow.projectsWithUnwrittenFiles()) {
    try {
      written += await writeMissingDocumentFiles(
        [workflowFileAdapter],
        project_id,
        user_id
      );
    } catch (error) {
      log.debug("Skipped writing the workflow files of a project", {
        projectId: project_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return written;
}
