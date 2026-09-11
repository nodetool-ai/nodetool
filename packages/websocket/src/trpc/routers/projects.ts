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
  PERSONAL_PROJECT_KIND,
  Project,
  Asset,
  Job,
  Thread,
  Workspace,
  Workflow,
  Storyboard,
  Script,
  TimelineSequence,
  ImageDocument,
  Application,
  JsScript,
  hasProjectDocumentDependents,
  listProjectDocuments,
  moveDocumentToProject,
  summarizeProject
} from "@nodetool-ai/models";
import {
  assignDocumentInput,
  copyProjectDocumentInput,
  copyProjectDocumentOutput,
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
import { getAssetAdapter } from "../../lib/storage.js";
import {
  copyProjectDocument,
  ProjectCopyError
} from "../../lib/project-document-copy.js";
import { assetKeyCandidates } from "@nodetool-ai/storage";
import { assetFileNameCandidates } from "../../lib/asset-paths.js";
import { thumbnailKey } from "../../lib/thumbnail.js";
import { jobRunRegistry } from "../../job-run-registry.js";
import { chatTurnRegistry } from "../../chat-turn-registry.js";
import { workspaceFromRow } from "../../lib/workflow-workspace.js";

const listInput = z.object({});
const idInput = z.object({ id: z.string() });
const updateInput = patchProjectInput.and(z.object({ id: z.string() }));
const okOutput = z.object({ ok: z.literal(true) });
const restorableTab = z.object({
  type: z.enum([
    "workflow",
    "image",
    "svg",
    "sketch",
    "timeline",
    "storyboard",
    "script",
    "jsscript",
    "audio",
    "text",
    "model3d",
    "application",
    "chat",
    "workspace-file"
  ]),
  ref: z.string(),
  title: z.string()
});

async function isOwnedRestorableTab(
  userId: string,
  projectId: string,
  tab: z.infer<typeof restorableTab>
): Promise<boolean> {
  let row: { user_id: string; project_id: string } | null = null;
  switch (tab.type) {
    case "workflow":
      row = await Workflow.find(userId, tab.ref);
      break;
    case "image":
    case "svg":
    case "audio":
    case "text":
    case "model3d":
      row = await Asset.find(userId, tab.ref);
      break;
    case "sketch":
      row = await ImageDocument.findById(tab.ref);
      break;
    case "timeline":
      row = await TimelineSequence.findById(tab.ref);
      break;
    case "storyboard":
      row = await Storyboard.findById(tab.ref);
      break;
    case "script":
      row = await Script.findById(tab.ref);
      break;
    case "jsscript":
      row = await JsScript.findById(tab.ref);
      break;
    case "application":
      row = await Application.findById(tab.ref);
      break;
    case "chat":
      row = await Thread.find(userId, tab.ref);
      break;
    case "workspace-file": {
      const separator = tab.ref.indexOf("::");
      const workspaceId = separator === -1 ? "" : tab.ref.slice(0, separator);
      const path = separator === -1 ? "" : tab.ref.slice(separator + 2);
      const workspace = workspaceId
        ? await Workspace.find(userId, workspaceId)
        : null;
      if (
        !workspace ||
        workspace.project_id !== projectId ||
        path.length === 0
      ) {
        return false;
      }
      try {
        return (await workspaceFromRow(workspace)?.stat(path)) != null;
      } catch {
        return false;
      }
    }
  }
  return row?.user_id === userId && row.project_id === projectId;
}

/** Stored asset bytes are project content too; database deletion alone leaks them. */
async function deleteProjectAssetObjects(
  assets: readonly Asset[]
): Promise<void> {
  const storage = getAssetAdapter();
  await Promise.all(
    assets
      .filter((asset) => asset.content_type !== "folder")
      .flatMap((asset) =>
        [
          ...assetFileNameCandidates(asset.id, asset.content_type),
          thumbnailKey(asset.id)
        ].flatMap((fileName) =>
          assetKeyCandidates(asset.user_id, fileName).map(async (key) => {
            const uri = storage.uriForKey(key);
            if (await storage.exists(uri)) await storage.delete(uri);
          })
        )
      )
  );
}

async function deleteProjectWorkspaceFiles(
  workspaces: readonly Workspace[]
): Promise<void> {
  await Promise.all(
    workspaces.map(async (row) => workspaceFromRow(row)?.deleteAll(""))
  );
}

async function prepareUser(userId: string): Promise<void> {
  await Project.migrateToPersonal(userId);
}

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
      await prepareUser(ctx.userId);
      const items = await Project.listByUser(ctx.userId);
      return items.map((item) => item.toResponse());
    }),

  /** Archived projects stay discoverable in project management, not the selector. */
  archived: protectedProcedure
    .input(listInput)
    .output(z.array(projectResponse))
    .query(async ({ ctx }) => {
      await prepareUser(ctx.userId);
      const items = await Project.listByUser(ctx.userId, 100, true);
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
      await prepareUser(ctx.userId);
      const projects = await Project.listByUser(ctx.userId);
      return Promise.all(
        projects.map(async (project) => {
          const summary = await summarizeProject(ctx.userId, project.id);
          return projectDetail.parse({
            project: project.toResponse(),
            documents: summary.documents,
            documentsPartial: summary.documentsPartial,
            entities: summary.entities,
            spend: summary.spend
          });
        })
      );
    }),

  get: protectedProcedure
    .input(idInput)
    .output(projectDetail)
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const project = await loadOwned(ctx.userId, input.id);
      const summary = await summarizeProject(ctx.userId, project.id);
      return projectDetail.parse({
        project: project.toResponse(),
        documents: summary.documents,
        documentsPartial: summary.documentsPartial,
        entities: summary.entities,
        spend: summary.spend
      });
    }),

  documents: protectedProcedure
    .input(idInput)
    .output(z.array(projectDocumentRef))
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      await loadOwned(ctx.userId, input.id);
      return listProjectDocuments(ctx.userId, input.id);
    }),

  restoreTabs: protectedProcedure
    .input(z.object({ id: z.string(), tabs: z.array(restorableTab) }))
    .output(z.array(restorableTab))
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      await loadOwned(ctx.userId, input.id);
      const valid = await Promise.all(
        input.tabs.map(async (tab) => ({
          tab,
          owned: await isOwnedRestorableTab(ctx.userId, input.id, tab)
        }))
      );
      return valid.filter((item) => item.owned).map((item) => item.tab);
    }),

  /**
   * The loose bucket: documents belonging to no project. It has no row of its
   * own by design, so it is its own procedure rather than an id `documents`
   * would have to special-case.
   */
  unassigned: protectedProcedure
    .input(listInput)
    .output(z.array(projectDocumentRef))
    .query(async ({ ctx }) => {
      await prepareUser(ctx.userId);
      return listProjectDocuments(ctx.userId, LOOSE_PROJECT_ID);
    }),

  /**
   * The project's agent thread, created on first ask. A mutation rather than a
   * query because the first call writes: the overview needs an id to render a
   * composer against before anyone has said anything.
   */
  thread: protectedProcedure
    .input(idInput)
    .output(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      await loadOwned(ctx.userId, input.id);
      const threadId = await Project.ensureThread(ctx.userId, input.id);
      if (!threadId) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return { threadId };
    }),

  create: protectedProcedure
    .input(createProjectInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
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
      await prepareUser(ctx.userId);
      await loadOwned(ctx.userId, input.id);
      const fields: { name?: string; kind?: string } = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.kind !== undefined) fields.kind = input.kind;
      const updated = await Project.updateOwned(ctx.userId, input.id, fields);
      if (!updated) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return projectResponse.parse(updated.toResponse());
    }),

  archive: protectedProcedure
    .input(idInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const archived = await Project.archiveOwned(ctx.userId, input.id);
      if (!archived) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return projectResponse.parse(archived.toResponse());
    }),

  restore: protectedProcedure
    .input(idInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const restored = await Project.restoreOwned(ctx.userId, input.id);
      if (!restored) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return projectResponse.parse(restored.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const target = await Project.findOwnedIncludingDeleted(
        ctx.userId,
        input.id
      );
      if (!target) await loadOwned(ctx.userId, input.id);
      if (target?.kind === PERSONAL_PROJECT_KIND) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Personal cannot be deleted");
      }
      await Project.tombstoneOwned(ctx.userId, input.id);
      const [jobs, threads, assets, workspaces] = await Promise.all([
        Job.listByProject(ctx.userId, input.id),
        Thread.listByProject(ctx.userId, input.id),
        Asset.listByProject(ctx.userId, input.id),
        Workspace.listByProject(ctx.userId, input.id)
      ]);
      jobRunRegistry.cancelJobs(ctx.userId, new Set(jobs.map((job) => job.id)));
      chatTurnRegistry.abortThreads(
        ctx.userId,
        new Set(threads.map((thread) => thread.id))
      );
      // Keep the rows behind the tombstone until external cleanup succeeds.
      // A failed request can then be retried with every object identifier intact.
      await Promise.all([
        deleteProjectAssetObjects(assets),
        deleteProjectWorkspaceFiles(workspaces)
      ]);
      const deleted = await Project.deleteOwned(ctx.userId, input.id);
      if (!deleted) await loadOwned(ctx.userId, input.id);
      return { ok: true as const };
    }),

  /**
   * Move one document or entity into a project — or, with the loose bucket's
   * id, back out of every project. A document's own `updated_at` is left
   * alone, so a move does not conflict with an editor that has it open.
   */
  assignDocument: protectedProcedure
    .input(assignDocumentInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      if (input.projectId !== LOOSE_PROJECT_ID) {
        await loadOwned(ctx.userId, input.projectId);
      }
      if (
        await hasProjectDocumentDependents(ctx.userId, input.type, input.ref)
      ) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Cannot move a referenced document or entity. Copy it into the destination project instead."
        );
      }
      const moved = await moveDocumentToProject(
        ctx.userId,
        input.type,
        input.ref,
        input.projectId
      );
      if (!moved) {
        throwApiError(
          ApiErrorCode.NOT_FOUND,
          input.type === "entity" ? "Entity not found" : "Document not found"
        );
      }
      return { ok: true as const };
    }),

  /**
   * Make an independent copy in another project. The copier first verifies the
   * complete resource closure and only publishes database rows after every
   * required asset is available, so a caller never receives a broken copy.
   */
  copyDocument: protectedProcedure
    .input(copyProjectDocumentInput)
    .output(copyProjectDocumentOutput)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      await loadOwned(ctx.userId, input.destinationProjectId);
      try {
        const copied = await copyProjectDocument({
          userId: ctx.userId,
          type: input.type,
          id: input.ref,
          destinationProjectId: input.destinationProjectId,
          storage: getAssetAdapter()
        });
        return {
          type: input.type,
          ref: copied.id,
          name: copied.name,
          updatedAt: new Date().toISOString(),
          copiedAssets: copied.copiedAssets,
          copiedDocuments: copied.copiedDocuments
        };
      } catch (error) {
        if (error instanceof ProjectCopyError) {
          throwApiError(ApiErrorCode.INVALID_INPUT, error.message);
        }
        throw error;
      }
    })
});
