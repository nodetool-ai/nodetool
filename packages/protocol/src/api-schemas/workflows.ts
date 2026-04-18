import { z } from "zod";

// ── Graph shapes ─────────────────────────────────────────────────────────────
// Validate the required fields of Node/Edge while allowing extra properties
// to pass through (matches the `[key: string]: unknown` index signatures on
// `Node` and `Edge` in api-types.ts / graph.ts). This rejects malformed input
// (strings, nulls, objects missing `id`/`type`) at the tRPC boundary while
// remaining permissive about unknown fields added by clients or Python.

export const graphNode = z
  .object({
    id: z.string(),
    type: z.string(),
    parent_id: z.string().nullable().optional(),
    data: z.unknown().optional(),
    ui_properties: z.unknown().optional(),
    dynamic_properties: z.record(z.string(), z.unknown()).optional(),
    dynamic_outputs: z.record(z.string(), z.unknown()).optional(),
    sync_mode: z.string().optional()
  })
  .passthrough();

export const graphEdge = z
  .object({
    id: z.string().nullable().optional(),
    source: z.string(),
    sourceHandle: z.string(),
    target: z.string(),
    targetHandle: z.string(),
    ui_properties: z.record(z.string(), z.string()).nullable().optional(),
    edge_type: z.string().optional()
  })
  .passthrough();

export const graph = z.object({
  nodes: z.array(graphNode),
  edges: z.array(graphEdge)
});
export type Graph = z.infer<typeof graph>;

// ── Workflow response ────────────────────────────────────────────────────────
// Mirrors toWorkflowResponse() in http-api.ts

export const workflowResponse = z.object({
  id: z.string(),
  access: z.string(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  name: z.string(),
  tool_name: z.string().nullable(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  thumbnail: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  graph: graph.nullable().optional(),
  input_schema: z.unknown().nullable(),
  output_schema: z.unknown().nullable(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  package_name: z.string().nullable(),
  path: z.string().nullable(),
  run_mode: z.string().nullable(),
  workspace_id: z.string().nullable(),
  required_providers: z.unknown().nullable(),
  required_models: z.unknown().nullable(),
  html_app: z.string().nullable(),
  etag: z.string().nullable()
});
export type WorkflowResponse = z.infer<typeof workflowResponse>;

// ── list (GET /api/workflows) ─────────────────────────────────────────────────

export const listInput = z.object({
  limit: z.number().int().min(1).default(100),
  run_mode: z.string().optional(),
  cursor: z.string().optional()
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  workflows: z.array(workflowResponse),
  next: z.string().nullable()
});
export type ListOutput = z.infer<typeof listOutput>;

// ── names (GET /api/workflows/names) ─────────────────────────────────────────

export const namesOutput = z.record(z.string(), z.string());
export type NamesOutput = z.infer<typeof namesOutput>;

// ── get (GET /api/workflows/:id) ─────────────────────────────────────────────

export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── Workflow body for create/update ──────────────────────────────────────────

export const workflowBody = z.object({
  name: z.string().min(1),
  tool_name: z.string().nullable().optional(),
  package_name: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  description: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  thumbnail_url: z.string().nullable().optional(),
  access: z.string().default("private"),
  graph: z
    .object({
      nodes: z.array(graphNode),
      edges: z.array(graphEdge)
    })
    .nullable()
    .optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  run_mode: z.string().nullable().optional(),
  workspace_id: z.string().nullable().optional(),
  html_app: z.string().nullable().optional()
});
export type WorkflowBody = z.infer<typeof workflowBody>;

// ── create (POST /api/workflows) ─────────────────────────────────────────────

export const createInput = workflowBody.extend({
  // Optional query params for example-seeding
  from_example_package: z.string().optional(),
  from_example_name: z.string().optional()
});
export type CreateInput = z.infer<typeof createInput>;

// ── update (PUT /api/workflows/:id) ──────────────────────────────────────────

export const updateInput = workflowBody.extend({
  id: z.string().min(1)
});
export type UpdateInput = z.infer<typeof updateInput>;

// ── delete (DELETE /api/workflows/:id) ───────────────────────────────────────

export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({ ok: z.literal(true) });
export type DeleteOutput = z.infer<typeof deleteOutput>;

// ── run (POST /api/workflows/:id/run) ────────────────────────────────────────

export const runInput = z.object({
  id: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  background: z.boolean().optional()
});
export type RunInput = z.infer<typeof runInput>;

export const runOutput = z.object({
  job_id: z.string(),
  workflow_id: z.string(),
  status: z.string(),
  outputs: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().nullable(),
  message_count: z.number().int(),
  background: z.boolean()
});
export type RunOutput = z.infer<typeof runOutput>;

// ── autosave (POST/PUT /api/workflows/:id/autosave) ──────────────────────────

export const autosaveInput = z.object({
  id: z.string().min(1),
  graph: z.object({
    nodes: z.array(graphNode),
    edges: z.array(graphEdge)
  }),
  name: z.string().optional(),
  description: z.string().optional(),
  access: z.string().optional(),
  save_type: z.string().optional(),
  client_id: z.string().optional(),
  force: z.boolean().optional(),
  max_versions: z.number().int().optional()
});
export type AutosaveInput = z.infer<typeof autosaveInput>;

const versionInfo = z.object({
  id: z.string(),
  version: z.number().int(),
  workflow_id: z.string(),
  save_type: z.string(),
  created_at: z.string().nullable().optional()
});

export const autosaveOutput = z.object({
  version: versionInfo.nullable(),
  message: z.string(),
  skipped: z.boolean()
});
export type AutosaveOutput = z.infer<typeof autosaveOutput>;

// ── tools (GET /api/workflows/tools) ─────────────────────────────────────────

export const toolsInput = z.object({
  limit: z.number().int().min(1).default(100)
});
export type ToolsInput = z.infer<typeof toolsInput>;

export const toolItem = z.object({
  name: z.string(),
  tool_name: z.string().nullable(),
  description: z.string().nullable()
});

export const toolsOutput = z.object({
  workflows: z.array(toolItem),
  next: z.null()
});
export type ToolsOutput = z.infer<typeof toolsOutput>;

// ── examples (GET /api/workflows/examples) ───────────────────────────────────

export const examplesInput = z.object({
  query: z.string().optional()
});
export type ExamplesInput = z.infer<typeof examplesInput>;

export const examplesOutput = z.object({
  workflows: z.array(z.unknown()),
  next: z.null()
});
export type ExamplesOutput = z.infer<typeof examplesOutput>;

// ── public workflows ─────────────────────────────────────────────────────────

export const publicListInput = z.object({
  limit: z.number().int().min(1).default(100)
});
export type PublicListInput = z.infer<typeof publicListInput>;

export const publicListOutput = z.object({
  workflows: z.array(workflowResponse),
  next: z.null()
});
export type PublicListOutput = z.infer<typeof publicListOutput>;

export const publicGetInput = z.object({
  id: z.string().min(1)
});
export type PublicGetInput = z.infer<typeof publicGetInput>;

// ── app metadata (GET /api/workflows/:id/app) ────────────────────────────────

export const appInput = z.object({
  id: z.string().min(1),
  baseUrl: z.string().optional()
});
export type AppInput = z.infer<typeof appInput>;

export const appOutput = z.object({
  workflow_id: z.string(),
  api_url: z.string()
});
export type AppOutput = z.infer<typeof appOutput>;

// ── generate-name (POST /api/workflows/:id/generate-name) ────────────────────

export const generateNameInput = z.object({
  id: z.string().min(1)
});
export type GenerateNameInput = z.infer<typeof generateNameInput>;

export const generateNameOutput = z.object({
  name: z.string()
});
export type GenerateNameOutput = z.infer<typeof generateNameOutput>;

// ── versions ─────────────────────────────────────────────────────────────────

export const versionResponse = z.object({
  id: z.string(),
  workflow_id: z.string(),
  user_id: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  graph: z.unknown().nullable(),
  version: z.number().int(),
  save_type: z.string(),
  autosave_metadata: z.unknown().nullable(),
  created_at: z.string().nullable().optional()
});
export type VersionResponse = z.infer<typeof versionResponse>;

// versions list
export const versionsListInput = z.object({
  id: z.string().min(1),
  limit: z.number().int().min(1).default(100)
});
export type VersionsListInput = z.infer<typeof versionsListInput>;

export const versionsListOutput = z.object({
  versions: z.array(versionResponse)
});
export type VersionsListOutput = z.infer<typeof versionsListOutput>;

// version create (POST /api/workflows/:id/versions)
export const versionCreateInput = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional()
});
export type VersionCreateInput = z.infer<typeof versionCreateInput>;

// version get by number (GET /api/workflows/:id/versions/:version)
export const versionGetInput = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1)
});
export type VersionGetInput = z.infer<typeof versionGetInput>;

// version restore (POST /api/workflows/:id/versions/:version/restore)
export const versionRestoreInput = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1)
});
export type VersionRestoreInput = z.infer<typeof versionRestoreInput>;

// version delete by id (DELETE /api/workflows/:id/versions/:versionId)
export const versionDeleteInput = z.object({
  id: z.string().min(1),
  version_id: z.string().min(1)
});
export type VersionDeleteInput = z.infer<typeof versionDeleteInput>;

export const versionDeleteOutput = z.object({ ok: z.literal(true) });
export type VersionDeleteOutput = z.infer<typeof versionDeleteOutput>;
