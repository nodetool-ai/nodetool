/**
 * Application service — the business logic behind both transports.
 *
 * The tRPC `applications` router and the `/api/applications` REST routes are
 * two doors onto these functions, so an app looks the same whichever one a
 * client comes through. Errors are raised with `throwApiError`, which the REST
 * layer maps back to a status code.
 */

import { z } from "zod";
import {
  createEmptyDocument,
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  releasedApplicationRelease
} from "@nodetool-ai/models";
import {
  applicationReleaseResponse,
  applicationResponse,
  patchApplicationInput,
  type ApplicationListItem,
  type ApplicationReleaseResponse,
  type ApplicationResponse,
  type CreateApplicationInput
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";

export const listApplicationsInput = z.object({
  projectId: z.string().optional()
});

export const applicationIdInput = z.object({ id: z.string() });

export const updateApplicationInput = patchApplicationInput.and(
  z.object({ id: z.string(), baseUpdatedAt: z.string().optional() })
);
export type UpdateApplicationInput = z.infer<typeof updateApplicationInput>;

export function toListItem(app: Application): ApplicationListItem {
  return {
    id: app.id,
    projectId: app.project_id,
    name: app.name,
    description: app.description,
    operationCount: app.toDocument().operations.length,
    updatedAt: app.updated_at
  };
}

export async function loadOwnedApplication(
  userId: string | null,
  id: string
): Promise<Application> {
  if (!userId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const app = await Application.findById(id);
  if (!app || app.user_id !== userId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
  }
  return app;
}

/**
 * Import a legacy `workflow.app_doc` as an application document. The parser
 * lifts a `{ version, data }` payload into one operation bound to the host
 * workflow; widget bindings inside the UI keep their stored form and resolve
 * against the live graph at runtime.
 */
async function documentFromWorkflow(
  workflowId: string,
  userId: string
): Promise<ApplicationDocument> {
  const workflow = await Workflow.find(userId, workflowId);
  if (!workflow) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Workflow not found");
  }
  const raw = (workflow as unknown as { app_doc?: unknown }).app_doc;
  const parsed = raw
    ? parseApplicationDocument(
        typeof raw === "string" ? JSON.parse(raw) : raw,
        { hostWorkflowId: workflowId }
      )
    : null;
  if (parsed) return parsed;
  // No app document yet: start empty but still bound to the workflow, so the
  // app has something to run the moment a widget is placed.
  const empty = createEmptyDocument();
  empty.operations = [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return empty;
}

export async function listApplications(
  userId: string,
  projectId?: string
): Promise<ApplicationListItem[]> {
  const apps = projectId
    ? await Application.listByProject(projectId, userId)
    : await Application.listByUser(userId);
  return apps.map(toListItem);
}

export async function getApplication(
  userId: string,
  id: string
): Promise<ApplicationResponse> {
  const app = await loadOwnedApplication(userId, id);
  return applicationResponse.parse(app.toResponse());
}

export async function createApplication(
  userId: string,
  input: CreateApplicationInput
): Promise<ApplicationResponse> {
  if (input.id) {
    const existing = await Application.findById(input.id);
    if (existing) {
      if (existing.user_id !== userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
      }
      return applicationResponse.parse(existing.toResponse());
    }
  }
  const document =
    input.document ??
    (input.fromWorkflowId
      ? await documentFromWorkflow(input.fromWorkflowId, userId)
      : createEmptyDocument());
  const app = new Application({
    id: input.id,
    user_id: userId,
    project_id: input.projectId,
    name: input.name,
    description: input.description,
    document: JSON.stringify(document)
  });
  await app.save();
  return applicationResponse.parse(app.toResponse());
}

export async function updateApplication(
  userId: string,
  input: UpdateApplicationInput
): Promise<ApplicationResponse> {
  const app = await loadOwnedApplication(userId, input.id);

  // CAS on updated_at so the conflict check and the write are atomic.
  const expectedUpdatedAt = input.baseUpdatedAt ?? app.updated_at;
  if (input.baseUpdatedAt && app.updated_at !== input.baseUpdatedAt) {
    throwApiError(
      ApiErrorCode.ALREADY_EXISTS,
      "Application was modified since last read (optimistic concurrency conflict)"
    );
  }

  const fields: Parameters<typeof Application.updateFieldsIfUnchanged>[2] = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.description !== undefined) fields.description = input.description;
  if (input.document !== undefined) {
    fields.document = JSON.stringify(input.document);
  }

  const updated = await Application.updateFieldsIfUnchanged(
    input.id,
    expectedUpdatedAt,
    fields
  );
  if (!updated) {
    throwApiError(
      ApiErrorCode.ALREADY_EXISTS,
      "Application was modified since last read (optimistic concurrency conflict)"
    );
  }
  return applicationResponse.parse(updated.toResponse());
}

export async function deleteApplication(
  userId: string,
  id: string
): Promise<{ ok: true }> {
  const app = await loadOwnedApplication(userId, id);
  await app.delete();
  return { ok: true as const };
}

/**
 * What a published app should run: the released snapshot's document, its
 * version number and capabilities, plus the graph each operation is pinned to.
 */
export async function releasedApplicationDocument(
  userId: string,
  id: string
): Promise<ApplicationReleaseResponse | null> {
  await loadOwnedApplication(userId, id);
  const release = await releasedApplicationRelease(id);
  return release ? applicationReleaseResponse.parse(release) : null;
}
