/**
 * Projects router — tRPC.
 *
 * A project is the unit of the workspace: a name over the documents that
 * already carry its `project_id`. It owns no content of its own, so `get`
 * reads the documents back and derives what the overview shows — per-document
 * status, per-document spend, and the project's spend split by category.
 *
 * Procedures:
 *   list           (query)    — ProjectResponse[]
 *   summaries      (query)    — ProjectDetail[] (every project, for the list)
 *   get            (query)    — ProjectDetail (project + documents + spend)
 *   documents      (query)    — ProjectDocumentRef[]
 *   unassigned     (query)    — ProjectDocumentRef[] in the loose bucket
 *   thread         (mutation) — { threadId } (the project's agent thread)
 *   create         (mutation) — ProjectResponse
 *   update         (mutation) — ProjectResponse
 *   delete         (mutation) — { ok: true }
 *   assignDocument (mutation) — { ok: true }
 */

import { z } from "zod";
import {
  LOOSE_PROJECT_ID,
  Project,
  listProjectDocuments,
  moveDocumentToProject,
  summarizeProject
} from "@nodetool-ai/models";
import {
  assignDocumentInput,
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

  /**
   * Every project with the rollup its card shows. The projects list needs
   * status and spend per card, and asking for them one project at a time is
   * the same work over N round trips.
   */
  summaries: protectedProcedure
    .input(listInput)
    .output(z.array(projectDetail))
    .query(async ({ ctx }) => {
      const projects = await Project.listByUser(ctx.userId);
      return Promise.all(
        projects.map(async (project) => {
          const summary = await summarizeProject(ctx.userId, project.id);
          return projectDetail.parse({
            project: project.toResponse(),
            documents: summary.documents,
            documentsPartial: summary.documentsPartial,
            spend: summary.spend
          });
        })
      );
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
        documentsPartial: summary.documentsPartial,
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

  /**
   * The loose bucket: documents belonging to no project. It has no row of its
   * own by design, so it is its own procedure rather than an id `documents`
   * would have to special-case.
   */
  unassigned: protectedProcedure
    .input(listInput)
    .output(z.array(projectDocumentRef))
    .query(({ ctx }) => listProjectDocuments(ctx.userId, LOOSE_PROJECT_ID)),

  /**
   * The project's agent thread, created on first ask. A mutation rather than a
   * query because the first call writes: the overview needs an id to render a
   * composer against before anyone has said anything.
   */
  thread: protectedProcedure
    .input(idInput)
    .output(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await loadOwned(ctx.userId, input.id);
      const threadId = await Project.ensureThread(ctx.userId, input.id);
      if (!threadId) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return { threadId };
    }),

  create: protectedProcedure
    .input(createProjectInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      // The insert never rewrites an existing row: the primary key is
      // install-global, so an upsert here could hand one user's project to
      // another. A conflict is re-read instead — the caller's own id answers
      // idempotently with the row that is already there.
      const project = await Project.insertNew({
        id: input.id,
        user_id: ctx.userId,
        name: input.name,
        kind: input.kind
      });
      if (project) return projectResponse.parse(project.toResponse());

      const existing = input.id ? await Project.findById(input.id) : null;
      if (!existing) {
        // The insert conflicted and the row is already gone — nothing can be
        // read to decide whose it was, so the conflict itself is what is said.
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "A project with that id already exists"
        );
      }
      // An id belonging to someone else answers exactly as a missing one does.
      // Saying "already exists" would make create an oracle for ids this user
      // may not read — the convention every other procedure here holds to.
      if (existing.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      }
      return projectResponse.parse(existing.toResponse());
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
    }),

  /**
   * Move one document into a project — or, with the loose bucket's id, back
   * out of every project. The document's own `updated_at` is left alone, so a
   * move does not conflict with an editor that has it open.
   */
  assignDocument: protectedProcedure
    .input(assignDocumentInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      if (input.projectId !== LOOSE_PROJECT_ID) {
        await loadOwned(ctx.userId, input.projectId);
      }
      const moved = await moveDocumentToProject(
        ctx.userId,
        input.type,
        input.ref,
        input.projectId
      );
      if (!moved) throwApiError(ApiErrorCode.NOT_FOUND, "Document not found");
      return { ok: true as const };
    })
});
