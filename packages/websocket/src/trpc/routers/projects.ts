/**
 * Projects router — tRPC.
 *
 * A project is the unit of the workspace: a name over the documents that
 * already carry its `project_id`. It owns no content of its own, so `get`
 * reads the documents back and derives what the overview shows — per-document
 * status, per-document spend, and the project's spend split by category.
 *
 * Procedures:
 *   list      (query)    — ProjectResponse[]
 *   get       (query)    — ProjectDetail (project + documents + spend)
 *   documents (query)    — ProjectDocumentRef[]
 *   create    (mutation) — ProjectResponse
 *   update    (mutation) — ProjectResponse
 *   delete    (mutation) — { ok: true }
 */

import { z } from "zod";
import { Project, listProjectDocuments, summarizeProject } from "@nodetool-ai/models";
import {
  createProjectInput,
  patchProjectInput,
  projectDetail,
  projectDocumentRef,
  projectResponse
} from "@nodetool-ai/protocol/api-schemas/projects.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

const listInput = z.object({});
const idInput = z.object({ id: z.string() });
const updateInput = patchProjectInput.and(z.object({ id: z.string() }));
const okOutput = z.object({ ok: z.literal(true) });

async function loadOwned(userId: string, id: string): Promise<Project> {
  const project = await Project.findOwned(userId, id);
  if (!project) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
  return project;
}

export const projectsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(projectResponse))
    .query(async ({ ctx }) => {
      const items = await Project.listByUser(ctx.userId);
      return items.map((item) => item.toResponse());
    }),

  get: protectedProcedure
    .input(idInput)
    .output(projectDetail)
    .query(async ({ ctx, input }) => {
      const project = await loadOwned(ctx.userId, input.id);
      const summary = await summarizeProject(ctx.userId, project.id);
      return projectDetail.parse({
        project: project.toResponse(),
        documents: summary.documents,
        spend: summary.spend
      });
    }),

  documents: protectedProcedure
    .input(idInput)
    .output(z.array(projectDocumentRef))
    .query(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      return listProjectDocuments(ctx.userId, input.id);
    }),

  create: protectedProcedure
    .input(createProjectInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await Project.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
          }
          return projectResponse.parse(existing.toResponse());
        }
      }
      const project = await Project.create<Project>({
        id: input.id,
        user_id: ctx.userId,
        name: input.name,
        kind: input.kind
      });
      return projectResponse.parse(project.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const fields: { name?: string; kind?: string } = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.kind !== undefined) fields.kind = input.kind;
      const updated = await Project.updateOwned(ctx.userId, input.id, fields);
      if (!updated) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return projectResponse.parse(updated.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      await Project.deleteOwned(ctx.userId, input.id);
      return { ok: true as const };
    })
});
