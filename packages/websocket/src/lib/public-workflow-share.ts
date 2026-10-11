/**
 * Reads behind a workflow's public share link.
 *
 * A `public` share token lets anyone see one workflow and lets a signed-in
 * user copy it into their own workflows. It never becomes a collaborator
 * grant. Unknown, revoked, and non-public tokens all answer the same
 * NOT_FOUND, so a caller cannot tell a view or edit token from a dead one.
 */

import { Workflow, WorkflowShare } from "@nodetool-ai/models";
import type { Workflow as WorkflowModel } from "@nodetool-ai/models";
import {
  graph as graphSchema,
  type PublicSharedWorkflow
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

/** The workflow behind an active public share token, else NOT_FOUND. */
export async function loadPublicShareWorkflow(
  token: string
): Promise<WorkflowModel> {
  const share = await WorkflowShare.findByToken(token);
  if (!share || share.isRevoked || share.role !== "public") {
    throwApiError(ApiErrorCode.NOT_FOUND, "Share link is invalid or revoked");
  }
  const workflow = (await Workflow.get(
    share.workflow_id
  )) as WorkflowModel | null;
  if (!workflow) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Share link is invalid or revoked");
  }
  return workflow;
}

/**
 * Property keys that hold credentials: a bot `token`, a `worker_token`, an
 * `api_key`. Matched on whole name segments, so `max_tokens` and `author`
 * are left alone.
 */
const CREDENTIAL_KEY_RE =
  /(^|_)(api_?key|secret|token|password|passwd|credentials?|bearer|access_?key|private_?key)$/i;

const blankCredentials = (record: unknown): unknown => {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }
  return Object.fromEntries(
    Object.entries(record as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === "string" && value !== "" && CREDENTIAL_KEY_RE.test(key)
        ? ""
        : value
    ])
  );
};

/**
 * A shared graph with credential properties blanked. A public link reaches
 * anyone, and a copy belongs to someone else, so neither may carry the
 * owner's tokens.
 */
export function redactSharedGraph<T extends { nodes: unknown[] }>(graph: T): T {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node === null || typeof node !== "object") return node;
      const record = node as Record<string, unknown>;
      const redacted: Record<string, unknown> = {
        ...record,
        data: blankCredentials(record.data)
      };
      if ("dynamic_properties" in record) {
        redacted.dynamic_properties = blankCredentials(
          record.dynamic_properties
        );
      }
      return redacted;
    })
  } as T;
}

/**
 * The graph a stored row carries, with credentials blanked, or null when it
 * does not parse.
 */
export function parseSharedGraph(
  raw: unknown
): PublicSharedWorkflow["graph"] {
  if (raw == null) return null;
  const parsed = graphSchema.safeParse(raw);
  return parsed.success ? redactSharedGraph(parsed.data) : null;
}

/**
 * What a public link shows: the graph and its label. Nothing about the owner,
 * the row id, or where the workflow lives.
 */
export async function getPublicSharedWorkflow(
  token: string
): Promise<PublicSharedWorkflow> {
  const workflow = await loadPublicShareWorkflow(token);
  return {
    name: workflow.name,
    description: workflow.description ?? null,
    tags: workflow.tags ?? [],
    graph: parseSharedGraph(workflow.graph)
  };
}
