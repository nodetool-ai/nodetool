/**
 * Request-body schemas for the REST routes in `http-api.ts`.
 *
 * The routes used to read their body through `parseJsonBody<T>`, which was a
 * cast: it handed back an unchecked `T`, so every read site re-asked what the
 * field really was (`typeof body.name === "string" ? … : …`). The schemas here
 * ask those questions once, at the boundary, and the read sites use the answer.
 *
 * They are deliberately **lenient**, field by field, because the routes were:
 *
 * - A field the route checked (`typeof x === "string"`) uses `lenientString` /
 *   `lenientNumber`, so a wrong-typed value reads as *absent* — the same thing
 *   the inline check did. It is not `z.string().optional()`, which would turn
 *   a wrong-typed field into a 400 the route never used to send.
 * - A field the route never checked keeps flowing through untouched
 *   (`unchecked`), because that is what the whole-body cast did for it.
 * - Unknown keys are dropped rather than rejected. No route forwards the raw
 *   body; each one reads named fields and hands those to the model layer.
 *
 * Every schema accepts any JSON object, so parsing cannot fail and cannot turn
 * a route's own 400 into a different one.
 */

import { z } from "zod";

import { isNumber, isString } from "./lib/wire-values.js";

/**
 * A field the route forwards without checking it. The cast that
 * `parseJsonBody<T>` applied to the whole body lives here instead, one field
 * at a time, so the leniency is visible where it is taken.
 */
function unchecked<T>() {
  // SAFETY: the value reaches the handler exactly as the client sent it, which
  // is what the route did before the body was parsed. Nothing narrows it later.
  return z
    .unknown()
    .transform((value) => value as T | undefined)
    .optional();
}

/** A field read as a string; a wrong-typed value reads as absent. */
function lenientString() {
  return z
    .unknown()
    .transform((value) => (isString(value) ? value : undefined))
    .optional();
}

/** A field read as a number; a wrong-typed value reads as absent. */
function lenientNumber() {
  return z
    .unknown()
    .transform((value) => (isNumber(value) ? value : undefined))
    .optional();
}

/** A list of ids: the strings are kept, anything else is dropped. */
function stringList() {
  return z
    .unknown()
    .transform((value) => (Array.isArray(value) ? value.filter(isString) : []))
    .optional();
}

/** The `{nodes, edges}` bag a client sends as a workflow graph. */
export interface WorkflowGraphBody {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

/** `POST /api/workflows/:id/run|debug` */
export const workflowRunBodySchema = z.object({
  params: unchecked<Record<string, unknown>>(),
  background: unchecked<boolean>(),
  /**
   * Bubble node failures up to the caller instead of resolving them
   * server-side: the response returns as soon as a node invocation escalates,
   * and the run stays parked until a verdict arrives on
   * `POST /api/debug/sessions/:id/verdict`.
   */
  interactive: unchecked<boolean>(),
  max_decisions: lenientNumber(),
  max_retries_per_node: lenientNumber(),
  decision_timeout_ms: lenientNumber()
});

/** `POST /api/debug/sessions/:id/verdict` */
export const escalationVerdictBodySchema = z.object({
  escalation_id: lenientString(),
  /** Checked separately against `verdictSchema`, which owns its own 400. */
  verdict: z.unknown()
});

/** `POST|PUT /api/workflows/:id/autosave` */
export const workflowAutosaveBodySchema = z.object({
  name: unchecked<string>(),
  access: lenientString(),
  description: unchecked<string>(),
  graph: unchecked<WorkflowGraphBody>(),
  force: unchecked<boolean>(),
  max_versions: lenientNumber()
});

/** `POST /api/workflows/:id/versions` */
export const workflowVersionCreateBodySchema = z.object({
  name: unchecked<string>(),
  description: unchecked<string>()
});

/** `POST /api/workflows/export-bundle` */
export const workflowsExportBundleBodySchema = z.object({
  workflow_ids: stringList()
});

/** `POST /api/workflows` and `PUT /api/workflows/:id` */
export const workflowRequestBodySchema = z.object({
  name: lenientString(),
  tool_name: unchecked<string | null>(),
  package_name: unchecked<string | null>(),
  path: unchecked<string | null>(),
  tags: unchecked<string[] | null>(),
  description: unchecked<string | null>(),
  thumbnail: unchecked<string | null>(),
  thumbnail_url: unchecked<string | null>(),
  access: unchecked<string | null>(),
  graph: unchecked<WorkflowGraphBody | null>(),
  settings: unchecked<Record<string, unknown> | null>(),
  run_mode: unchecked<string | null>(),
  workspace_id: unchecked<string | null>(),
  html_app: unchecked<string | null>(),
  app_doc: unchecked<Record<string, unknown> | null>(),
  expected_updated_at: unchecked<string>()
});

/** The workflow body as the routes read it: every field may be absent. */
export type ParsedWorkflowRequestBody = z.output<
  typeof workflowRequestBodySchema
>;

/** `POST /api/assets` — the JSON body, or the multipart `json`/`asset` field. */
export const assetCreateBodySchema = z.object({
  name: lenientString(),
  content_type: lenientString(),
  parent_id: lenientString(),
  workflow_id: unchecked<string | null>(),
  node_id: unchecked<string | null>(),
  job_id: unchecked<string | null>(),
  metadata: unchecked<Record<string, unknown> | null>(),
  size: unchecked<number | null>()
});

/** The asset body as the route reads it: every field may be absent. */
export type ParsedAssetCreateBody = z.output<typeof assetCreateBodySchema>;
