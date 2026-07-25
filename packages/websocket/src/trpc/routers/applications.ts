/**
 * Applications router — tRPC.
 *
 * An application is a mini app's own record: a UI document plus typed bindings
 * to workflow operations, resources, and variables. Legacy apps live on
 * `workflow.app_doc`; `create({ fromWorkflowId })` imports one, binding the
 * host workflow as the app's first operation.
 *
 * Procedures:
 *   list     (query)    — ApplicationListItem[]
 *   get      (query)    — ApplicationResponse
 *   create   (mutation) — ApplicationResponse
 *   update   (mutation) — ApplicationResponse (CAS via baseUpdatedAt)
 *   delete   (mutation) — { ok: true }
 *   publish  (mutation) — ApplicationVersionResponse
 *   versions (query)    — ApplicationVersionResponse[]
 *   release  (mutation) — ApplicationVersionResponse (publish or rollback)
 *   released (query)    — ApplicationVersionResponse | null
 */

import { z } from "zod";
import {
  createEmptyDocument,
  parseApplicationDocument,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import {
  Application,
  listApplicationVersions,
  publishApplication,
  releaseApplicationVersion,
  releasedApplicationVersion
} from "@nodetool-ai/models";
import { Workflow } from "@nodetool-ai/models";
import {
  applicationListItem,
  applicationResponse,
  applicationVersionResponse,
  createApplicationInput,
  patchApplicationInput
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const listInput = z.object({ projectId: z.string().optional() });
const idInput = z.object({ id: z.string() });
const okOutput = z.object({ ok: z.literal(true) });

const updateInput = patchApplicationInput.and(
  z.object({ id: z.string(), baseUpdatedAt: z.string().optional() })
);

function toListItem(app: Application) {
  return {
    id: app.id,
    projectId: app.project_id,
    name: app.name,
    description: app.description,
    operationCount: app.toDocument().operations.length,
    updatedAt: app.updated_at
  };
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<Application> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const app = await Application.findById(id);
  if (!app || app.user_id !== ctxUserId) {
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

export const applicationsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(applicationListItem))
    .query(async ({ ctx, input }) => {
      const apps = input.projectId
        ? await Application.listByProject(input.projectId, ctx.userId)
        : await Application.listByUser(ctx.userId);
      return apps.map(toListItem);
    }),

  get: protectedProcedure
    .input(idInput)
    .output(applicationResponse)
    .query(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);
      return applicationResponse.parse(app.toResponse());
    }),

  create: protectedProcedure
    .input(createApplicationInput)
    .output(applicationResponse)
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await Application.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Application not found");
          }
          return applicationResponse.parse(existing.toResponse());
        }
      }
      const document =
        input.document ??
        (input.fromWorkflowId
          ? await documentFromWorkflow(input.fromWorkflowId, ctx.userId)
          : createEmptyDocument());
      const app = new Application({
        id: input.id,
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        description: input.description,
        document: JSON.stringify(document)
      });
      await app.save();
      return applicationResponse.parse(app.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(applicationResponse)
    .mutation(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);

      // CAS on updated_at so the conflict check and the write are atomic.
      const expectedUpdatedAt = input.baseUpdatedAt ?? app.updated_at;
      if (input.baseUpdatedAt && app.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "Application was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Parameters<
        typeof Application.updateFieldsIfUnchanged
      >[2] = {};
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
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);
      await app.delete();
      return { ok: true as const };
    }),

  publish: protectedProcedure
    .input(idInput)
    .output(applicationVersionResponse)
    .mutation(async ({ ctx, input }) => {
      const app = await loadOwned(ctx.userId, input.id);
      return applicationVersionResponse.parse(await publishApplication(app));
    }),

  versions: protectedProcedure
    .input(idInput)
    .output(z.array(applicationVersionResponse))
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const versions = await listApplicationVersions(input.id);
      return versions.map((v) => applicationVersionResponse.parse(v));
    }),

  released: protectedProcedure
    .input(idInput)
    .output(applicationVersionResponse.nullable())
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const version = await releasedApplicationVersion(input.id);
      return version ? applicationVersionResponse.parse(version) : null;
    }),

  release: protectedProcedure
    .input(z.object({ id: z.string(), version: z.number() }))
    .output(applicationVersionResponse)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const released = await releaseApplicationVersion(input.id, input.version);
      if (!released) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Application version not found");
      }
      return applicationVersionResponse.parse(released);
    })
});
