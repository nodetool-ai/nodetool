import { z } from "zod";
import { isRecord } from "../predicates.js";

// ── WorkflowRunMode ──────────────────────────────────────────────────────────

/**
 * All recognised run_mode values for a workflow row.
 *
 * Standalone modes (appear in regular workflow listings):
 *   "workflow" | null  — standard workflows (null is legacy, treated as "workflow")
 *   "chat"             — chat-oriented workflows
 *   "app"              — HTML mini-app workflows
 *   "tool"             — workflow exposed as an agent tool
 *
 * Embedded modes (excluded from standalone listings):
 *   "clip"             — timeline clip (cloned from a standalone workflow)
 *   "layer"            — image-editor layer workflow
 *   "image"            — image-editor root workflow
 */
export const workflowRunModes = [
  "workflow",
  "chat",
  "app",
  "tool",
  "clip",
  "layer",
  "image"
] as const;

export type WorkflowRunMode = (typeof workflowRunModes)[number];

export const workflowRunModeSchema = z.enum(workflowRunModes);

/**
 * Run modes that appear in standalone workflow listings.
 * Standalone listings use `run_mode IN ("workflow", null)` by default;
 * explicit filters may include "chat", "app", or "tool".
 */
export const STANDALONE_RUN_MODES = [
  "workflow",
  "chat",
  "app",
  "tool"
] as const satisfies ReadonlyArray<WorkflowRunMode>;

/**
 * Run modes that are embedded/non-standalone — always excluded from
 * regular workflow listings.
 */
export const EMBEDDED_RUN_MODES = [
  "clip",
  "layer",
  "image"
] as const satisfies ReadonlyArray<WorkflowRunMode>;

// ── Graph shapes ─────────────────────────────────────────────────────────────
// Validate the required fields of Node/Edge while allowing extra properties
// to pass through (matches the `[key: string]: unknown` index signatures on
// `Node` and `Edge` in api-types.ts / graph.ts). This rejects malformed input
// (strings, nulls, objects missing `id`/`type`) at the tRPC boundary while
// remaining permissive about unknown fields added by clients or Python.

// A single dynamic output's type metadata. Mirrors PropertyTypeMetadata in
// api-types.ts: it must be an object carrying at least a `type` string, and
// nests recursively through `type_args`. Validating this shape (instead of
// z.unknown()) rejects malformed metadata — primitives, null, or entries
// missing a type — at the tRPC boundary, while .passthrough() tolerates the
// extra transport fields clients/Python may add.
export const dynamicOutputTypeMetadata: z.ZodType = z.lazy(() =>
  z
    .object({
      type: z.string(),
      optional: z.boolean().optional(),
      values: z
        .array(z.union([z.string(), z.number()]))
        .nullable()
        .optional(),
      type_args: z.array(dynamicOutputTypeMetadata).optional(),
      type_name: z.string().nullable().optional()
    })
    .passthrough()
);

export const graphNode = z
  .object({
    id: z.string(),
    type: z.string(),
    parent_id: z.string().nullable().optional(),
    data: z.unknown().optional(),
    ui_properties: z.unknown().optional(),
    dynamic_properties: z.record(z.string(), z.unknown()).optional(),
    dynamic_outputs: z.record(z.string(), dynamicOutputTypeMetadata).optional()
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
  project_id: z.string().default("default"),
  required_providers: z.unknown().nullable(),
  required_models: z.unknown().nullable(),
  html_app: z.string().nullable(),
  app_doc: z.record(z.string(), z.unknown()).nullable().optional(),
  etag: z.string().nullable()
});
export type WorkflowResponse = z.infer<typeof workflowResponse>;

// ── SDK workflow interface v1 ──────────────────────────────────────────────

export const workflowInterfaceType = dynamicOutputTypeMetadata;

export const workflowInterfaceDiagnostic = z.object({
  severity: z.enum(["warning", "error"]),
  code: z.string(),
  message: z.string(),
  node_id: z.string().optional(),
  pin_name: z.string().optional()
});

const workflowInterfacePin = z.object({
  node_id: z.string(),
  name: z.string(),
  description: z.string(),
  type: workflowInterfaceType
});

export const workflowInterfaceInputPin = workflowInterfacePin.extend({
  required: z.boolean(),
  default: z.json(),
  min: z.number().optional(),
  max: z.number().optional()
});

export const workflowInterfaceOutputPin = workflowInterfacePin.extend({
  stream: z.boolean()
});

export const workflowInterfaceV1 = z.object({
  version: z.literal(1),
  workflow_id: z.string(),
  etag: z.string().nullable(),
  source: z.literal("server"),
  inputs: z.array(workflowInterfaceInputPin),
  outputs: z.array(workflowInterfaceOutputPin),
  diagnostics: z.array(workflowInterfaceDiagnostic)
});
export type WorkflowInterfaceV1Response = z.infer<typeof workflowInterfaceV1>;

export const workflowInterfaceInput = z.object({
  id: z.string().min(1),
  version: z.literal(1)
});
export type WorkflowInterfaceInput = z.infer<typeof workflowInterfaceInput>;

export const workflowInterfacesInput = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Workflow ids must be unique"
    }),
  version: z.literal(1)
});
export type WorkflowInterfacesInput = z.infer<typeof workflowInterfacesInput>;

export const workflowInterfaceError = z.object({
  workflow_id: z.string(),
  code: z.enum(["workflow_not_found", "invalid_graph"]),
  message: z.string()
});
export type WorkflowInterfaceError = z.infer<typeof workflowInterfaceError>;

export const workflowInterfacesOutput = z.object({
  interfaces: z.array(workflowInterfaceV1),
  errors: z.array(workflowInterfaceError)
});
export type WorkflowInterfacesOutput = z.infer<typeof workflowInterfacesOutput>;

export const sdkWorkflowSummariesInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional()
});
export type SdkWorkflowSummariesInput = z.infer<
  typeof sdkWorkflowSummariesInput
>;

export const sdkWorkflowSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  revision: z.string(),
  /**
   * Revision of the node registry used to derive workflow interfaces. A
   * client must refresh a cached interface when either this value or the
   * workflow revision changes.
   */
  registry_revision: z.number().int().nonnegative().nullable(),
  run_mode: z.string().nullable()
});
export type SdkWorkflowSummary = z.infer<typeof sdkWorkflowSummary>;

export const sdkWorkflowSummariesOutput = z.object({
  workflows: z.array(sdkWorkflowSummary),
  next: z.string().nullable()
});
export type SdkWorkflowSummariesOutput = z.infer<
  typeof sdkWorkflowSummariesOutput
>;

// ── list (GET /api/workflows) ─────────────────────────────────────────────────

export const listInput = z.object({
  limit: z.number().int().min(1).default(100),
  run_mode: z.string().optional(),
  mediaOutput: z.boolean().optional(),
  tag: z.string().optional(),
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
  project_id: z.string().min(1).optional(),
  html_app: z.string().nullable().optional(),
  app_doc: z.record(z.string(), z.unknown()).nullable().optional()
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
  id: z.string().min(1),
  expected_updated_at: z.string().optional()
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
  max_versions: z.number().int().optional(),
  expected_updated_at: z.string().optional()
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
  skipped: z.boolean(),
  updated_at: z.string().nullable()
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

// ── terminalOutputs (GET /api/workflows/:id/terminal-outputs) ────────────────
// Lists the terminal media-output nodes of a workflow.
// Used by AddClipMenu to prompt the user when a workflow has multiple outputs.

export const terminalOutputsInput = z.object({
  id: z.string().min(1)
});
export type TerminalOutputsInput = z.infer<typeof terminalOutputsInput>;

export const terminalOutputItem = z.object({
  /** Node id in the workflow graph. */
  id: z.string(),
  /** Full node type string, e.g. "nodetool.output.ImageOutput". */
  type: z.string(),
  /** Resolved media type. */
  mediaType: z.enum(["image", "video", "audio"]),
  /** Human-readable node name from its `data.name` property (may be empty). */
  name: z.string()
});
export type TerminalOutputItem = z.infer<typeof terminalOutputItem>;

export const terminalOutputsOutput = z.object({
  outputs: z.array(terminalOutputItem)
});
export type TerminalOutputsOutput = z.infer<typeof terminalOutputsOutput>;

// ── sharing ──────────────────────────────────────────────────────────────────
// Private sharing: the owner mints role-scoped share links; any authenticated
// user who redeems one becomes a collaborator ("viewer" opens and runs,
// "editor" also modifies). See packages/models workflow-collaborator/share.

export const collaboratorRoleSchema = z.enum(["viewer", "editor"]);
export type CollaboratorRoleValue = z.infer<typeof collaboratorRoleSchema>;

export const collaboratorItem = z.object({
  workflow_id: z.string(),
  user_id: z.string(),
  role: collaboratorRoleSchema,
  invited_by: z.string(),
  created_at: z.string().nullable().optional()
});
export type CollaboratorItem = z.infer<typeof collaboratorItem>;

export const shareItem = z.object({
  id: z.string(),
  workflow_id: z.string(),
  token: z.string(),
  role: collaboratorRoleSchema,
  created_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional()
});
export type ShareItem = z.infer<typeof shareItem>;

export const sharingGetInput = z.object({ id: z.string().min(1) });
export type SharingGetInput = z.infer<typeof sharingGetInput>;

export const sharingGetOutput = z.object({
  collaborators: z.array(collaboratorItem),
  shares: z.array(shareItem)
});
export type SharingGetOutput = z.infer<typeof sharingGetOutput>;

export const sharingCreateLinkInput = z.object({
  id: z.string().min(1),
  role: collaboratorRoleSchema
});
export type SharingCreateLinkInput = z.infer<typeof sharingCreateLinkInput>;

export const sharingRevokeLinkInput = z.object({
  id: z.string().min(1),
  share_id: z.string().min(1)
});
export type SharingRevokeLinkInput = z.infer<typeof sharingRevokeLinkInput>;

export const sharingSetRoleInput = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  role: collaboratorRoleSchema
});
export type SharingSetRoleInput = z.infer<typeof sharingSetRoleInput>;

export const sharingRemoveCollaboratorInput = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1)
});
export type SharingRemoveCollaboratorInput = z.infer<
  typeof sharingRemoveCollaboratorInput
>;

export const sharingOkOutput = z.object({ ok: z.literal(true) });
export type SharingOkOutput = z.infer<typeof sharingOkOutput>;

export const sharingAcceptInput = z.object({ token: z.string().min(1) });
export type SharingAcceptInput = z.infer<typeof sharingAcceptInput>;

export const sharingAcceptOutput = z.object({
  workflow: workflowResponse,
  role: collaboratorRoleSchema
});
export type SharingAcceptOutput = z.infer<typeof sharingAcceptOutput>;

export const myRoleInput = z.object({ id: z.string().min(1) });
export type MyRoleInput = z.infer<typeof myRoleInput>;

export const myRoleOutput = z.object({
  role: z.enum(["owner", "editor", "viewer"]).nullable()
});
export type MyRoleOutput = z.infer<typeof myRoleOutput>;

export const sharedWithMeInput = z.object({
  limit: z.number().int().min(1).max(200).default(100)
});
export type SharedWithMeInput = z.infer<typeof sharedWithMeInput>;

export const sharedWorkflowItem = workflowResponse.extend({
  shared_role: collaboratorRoleSchema
});
export type SharedWorkflowItem = z.infer<typeof sharedWorkflowItem>;

export const sharedWithMeOutput = z.object({
  workflows: z.array(sharedWorkflowItem)
});
export type SharedWithMeOutput = z.infer<typeof sharedWithMeOutput>;

// ── Guided setup (PRD § 11.5) ────────────────────────────────────────────────
// The Workflow creation flow keeps its state on the workflow it produces, under
// `settings.setup`. One optional field on an existing bag: a workflow saved
// before the flow existed has no `setup` key, parses fine, and opens as the
// editor it always did.

/** Where a workflow sits in the guided setup. One built before it reads "done". */
export const workflowSetupStage = z.enum([
  "idea",
  "category",
  "review",
  "setup",
  "done"
]);
export type WorkflowSetupStage = z.infer<typeof workflowSetupStage>;

/** How the finished workflow is meant to be run (PRD § 11.3). */
export const workflowSetupRunMode = z.enum(["manual", "app", "trigger"]);
export type WorkflowSetupRunMode = z.infer<typeof workflowSetupRunMode>;

export const workflowPlanInput = z
  .object({
    name: z.string(),
    type: z.string(),
    /** Prefilled sample the test run uses. Editable on the setup step. */
    sample: z.unknown().optional()
  })
  .passthrough();
export type WorkflowPlanInput = z.infer<typeof workflowPlanInput>;

export const workflowPlanStep = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    /**
     * The registry node type this step maps to, or null when the planner could
     * not name one. Null blocks step 3 rather than the build (D23): a step the
     * plan cannot name never reaches `ui_add_node`.
     */
    node_type: z.string().nullable(),
    /** "language" | "image" | "video" | "audio" — the model tile row it needs. */
    model_role: z.string().optional()
  })
  .passthrough();
export type WorkflowPlanStep = z.infer<typeof workflowPlanStep>;

export const workflowPlanOutput = z
  .object({ name: z.string(), type: z.string() })
  .passthrough();
export type WorkflowPlanOutput = z.infer<typeof workflowPlanOutput>;

export const workflowSetupPlan = z
  .object({
    inputs: z.array(workflowPlanInput).default([]),
    steps: z.array(workflowPlanStep).default([]),
    outputs: z.array(workflowPlanOutput).default([])
  })
  .passthrough();
export type WorkflowSetupPlan = z.infer<typeof workflowSetupPlan>;

/**
 * The model that writes the plan. Kept on the workflow rather than in the
 * flow's own state so a reload plans with the model the creator picked — the
 * default is whichever model the provider list returns first, and that one can
 * be out of quota or retired.
 */
export const workflowSetupPlannerModel = z
  .object({ provider: z.string(), id: z.string() })
  .passthrough();
export type WorkflowSetupPlannerModel = z.infer<
  typeof workflowSetupPlannerModel
>;

export const workflowSetup = z
  .object({
    stage: workflowSetupStage.default("done"),
    brief: z.string().default(""),
    category: z.string().optional(),
    plan: workflowSetupPlan.optional(),
    planner_model: workflowSetupPlannerModel.optional(),
    run_mode: workflowSetupRunMode.optional()
  })
  .passthrough();
export type WorkflowSetup = z.infer<typeof workflowSetup>;

/**
 * A workflow's `settings` bag, with the one field this flow owns. Additive and
 * permissive on purpose: `settings` is a client-owned record shared with
 * `hide_ui` and whatever else a surface put there, so anything but `setup`
 * travels untouched.
 */
export const workflowSettingsWithSetup = z
  .object({ setup: workflowSetup.optional() })
  .passthrough();
export type WorkflowSettingsWithSetup = z.infer<
  typeof workflowSettingsWithSetup
>;

/**
 * Read `settings.setup` off a workflow's settings bag.
 *
 * Returns null both for a workflow that never went through the flow and for one
 * whose `setup` is malformed — the flow then does not open, which is the same
 * thing the creator sees today. Callers get a stage or nothing, never a
 * half-parsed plan.
 */
export function readWorkflowSetup(settings: unknown): WorkflowSetup | null {
  const parsed = workflowSettingsWithSetup.safeParse(settings ?? {});
  return parsed.success ? (parsed.data.setup ?? null) : null;
}

/**
 * Merge a patch into `settings.setup` and hand back the whole settings bag.
 * The flow writes one field at a time (the brief as it is typed, then the
 * category, then the plan), and every write has to leave the rest of the bag —
 * and the rest of `setup` — alone.
 */
export function writeWorkflowSetup(
  settings: unknown,
  patch: Partial<WorkflowSetup>
): Record<string, unknown> {
  const parsed = workflowSettingsWithSetup.safeParse(settings ?? {});
  // Keep the caller's own keys even when `setup` does not parse. A `setup` a
  // newer client or an agent wrote — a stage outside this build's enum, say —
  // fails the parse, and starting from `{}` would drop every sibling setting
  // (`hide_ui` and the rest) on the next write. Only `setup` is replaced.
  const base: Record<string, unknown> = parsed.success
    ? { ...parsed.data }
    : isRecord(settings)
      ? { ...settings }
      : {};
  const current = parsed.success ? (parsed.data.setup ?? null) : null;
  base["setup"] = workflowSetup.parse({
    stage: "idea",
    brief: "",
    ...(current ?? {}),
    ...patch
  });
  return base;
}

// ── Guided game setup (game-prd § 5.1) ───────────────────────────────────────
// The Game flow's document is a workflow too (D25), so its state is a second
// optional bag beside `settings.setup`. A workflow saved before this flow
// existed has no `game` key, parses fine, and opens as the editor it always
// did — and a workflow that went through the Workflow flow keeps its `setup`
// untouched when the Game flow writes.

/** Where a workflow sits in the guided game setup. One built before it reads "done". */
export const gameSetupStage = z.enum([
  "idea",
  "template",
  "review",
  "look",
  "done"
]);
export type GameSetupStage = z.infer<typeof gameSetupStage>;

/** One playable or enemy character, bound to the spritesheet slot it fills. */
export const gameCastMember = z
  .object({
    /** The spritesheet slot this character fills. */
    slot_id: z.string(),
    name: z.string(),
    /** Silhouette, colours, proportions; no pose — the slot prompt sets that. */
    descriptor: z.string()
  })
  .passthrough();
export type GameCastMember = z.infer<typeof gameCastMember>;

export const gameEnemy = z
  .object({
    slot_id: z.string(),
    name: z.string(),
    behaviour: z.string()
  })
  .passthrough();
export type GameEnemy = z.infer<typeof gameEnemy>;

/**
 * The subject half of one slot's prompt. Style words, pixel size and sheet
 * boilerplate are added by `gameSlotPrompt`, never stored here.
 */
export const gameSlotPrompt = z
  .object({
    slot_id: z.string(),
    prompt: z.string()
  })
  .passthrough();
export type GameSlotPrompt = z.infer<typeof gameSlotPrompt>;

export const gameDesign = z
  .object({
    title: z.string(),
    premise: z.string(),
    core_loop: z.string(),
    player_verbs: z.array(z.string()).default([]),
    enemies: z.array(gameEnemy).default([]),
    level: z.string(),
    win: z.string(),
    lose: z.string(),
    cast: z.array(gameCastMember).default([]),
    slot_prompts: z.array(gameSlotPrompt).default([])
  })
  .passthrough();
export type GameDesign = z.infer<typeof gameDesign>;

/**
 * The model that writes the design. Kept on the workflow for the same reason
 * the Workflow flow keeps its planner model: a reload designs with the model
 * the creator picked, not with whatever the provider list returns first.
 */
export const gameSetupModel = z
  .object({ provider: z.string(), id: z.string() })
  .passthrough();
export type GameSetupModel = z.infer<typeof gameSetupModel>;

export const gameSetup = z
  .object({
    stage: gameSetupStage.default("done"),
    brief: z.string().default(""),
    /** Manifest template id: `platformer`, `topdown`, `shmup`. */
    template: z.string().optional(),
    designer_model: gameSetupModel.optional(),
    design: gameDesign.optional(),
    /**
     * What the stored design was written from, so the template step can tell
     * "keep it" from "re-design". `${template}\n${brief}`, written by
     * `designSourceOf`.
     */
    design_source: z.string().optional(),
    style_entity_id: z.string().optional(),
    /** `${provider}:${id}` tile id of the text-to-image model. */
    image_model: z.string().optional(),
    /** Registry node type of the sound-effect generator, absent for placeholders. */
    sfx_node_type: z.string().optional(),
    /** Tile id of the music model, absent for placeholders. */
    music_model: z.string().optional(),
    project_name: z.string().optional()
  })
  .passthrough();
export type GameSetup = z.infer<typeof gameSetup>;

/**
 * A workflow's `settings` bag with the one field the Game flow owns. Same
 * additive, permissive shape as {@link workflowSettingsWithSetup}: `hide_ui`,
 * `setup` and whatever else a surface put there travel untouched.
 */
export const workflowSettingsWithGame = z
  .object({ game: gameSetup.optional() })
  .passthrough();
export type WorkflowSettingsWithGame = z.infer<typeof workflowSettingsWithGame>;

/**
 * Read `settings.game` off a workflow's settings bag.
 *
 * Null both for a workflow that never went through the flow and for one whose
 * `game` is malformed — the flow then does not open, which is what a creator
 * sees today. Callers get a stage or nothing, never a half-parsed design.
 */
export function readGameSetup(settings: unknown): GameSetup | null {
  const parsed = workflowSettingsWithGame.safeParse(settings ?? {});
  return parsed.success ? (parsed.data.game ?? null) : null;
}

/**
 * Merge a patch into `settings.game` and hand back the whole settings bag.
 *
 * As with `writeWorkflowSetup`, the caller's own keys survive even when `game`
 * does not parse — a `game` a newer client wrote fails this build's parse, and
 * starting from `{}` would drop `hide_ui`, `setup` and every other sibling on
 * the next write. Only `game` is replaced.
 */
export function writeGameSetup(
  settings: unknown,
  patch: Partial<GameSetup>
): Record<string, unknown> {
  const parsed = workflowSettingsWithGame.safeParse(settings ?? {});
  const base: Record<string, unknown> = parsed.success
    ? { ...parsed.data }
    : isRecord(settings)
      ? { ...settings }
      : {};
  const current = parsed.success ? (parsed.data.game ?? null) : null;
  base["game"] = gameSetup.parse({
    stage: "idea",
    brief: "",
    ...(current ?? {}),
    ...patch
  });
  return base;
}
