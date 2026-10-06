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

/** The graph a stored row carries, or null when it does not parse. */
export function parseSharedGraph(
  raw: unknown
): PublicSharedWorkflow["graph"] {
  if (raw == null) return null;
  const parsed = graphSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
