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
 *   documentPage   (query)    — ProjectDocumentPage (one page of cards)
 *   documents      (query)    — ProjectDocumentListEntry[] (with file state)
 *   documentByFile (query)    — ProjectFileDocument | null (by file path)
 *   restoreDocumentFile (mutation) — ProjectFileDocument (rewrites the file)
 *   unassigned     (query)    — ProjectDocumentRef[] in the loose bucket
 *   thread         (mutation) — { threadId } (the project's agent thread)
 *   create         (mutation) — ProjectResponse (creates the project folder)
 *   openFolder     (mutation) — ProjectResponse (adopts an existing folder)
 *   relocate       (mutation) — ProjectResponse (points at a moved folder)
 *   update         (mutation) — ProjectResponse
 *   delete         (mutation) — { ok: true }
 *   assignDocument (mutation) — { ok: true }
 */

import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import {
  ProjectFolderError,
  describeProjectFolder,
  ensureProjectFolder,
  isLocalDeployment
} from "@nodetool-ai/execution/service";
import {
  LOOSE_PROJECT_ID,
  Project,
  Asset,
  Thread,
  Workspace,
  Workflow,
  Storyboard,
  Script,
  TimelineSequence,
  ImageDocument,
  Application,
  JsScript,
  Game,
  documentFileOf,
  findDocumentByFile,
  hasProjectDocumentDependents,
  listProjectDocuments,
  moveDocumentToProject,
  summarizeProject,
  summarizeProjectDocumentPage
} from "@nodetool-ai/models";
import {
  assignDocumentInput,
  copyProjectDocumentInput,
  copyProjectDocumentOutput,
  createProjectInput,
  openProjectFolderInput,
  patchProjectInput,
  projectDetail,
  projectDocumentPage,
  projectDocumentByFileInput,
  projectDocumentListEntry,
  projectDocumentPageInput,
  projectFileDocument,
  projectResponse,
  relocateProjectInput,
  restoreDocumentFileInput,
  type ProjectResponse
} from "@nodetool-ai/protocol/api-schemas/projects.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { getAssetAdapter } from "../../lib/storage.js";
import { ProjectFolderUnavailableError } from "@nodetool-ai/asset-services/project-asset-file";
import {
  copyProjectDocument,
  ProjectCopyError
} from "../../lib/project-document-copy.js";
import { deleteProjectForUser } from "../../lib/project-delete.js";
import { reconcileProjectOnOpen } from "@nodetool-ai/project-services/project-index";
import {
  DocumentFileRestoreError,
  restoreDocumentFile
} from "@nodetool-ai/project-services/document-file-sync";
import { workflowFileAdapter } from "@nodetool-ai/project-services/workflow-file";
import { timelineFileAdapter } from "@nodetool-ai/project-services/timeline-file";
import {
  ProjectFolderOpenError,
  openProjectFolder,
  relocateProjectFolder
} from "../../lib/project-folder-open.js";
import { workspaceFromRow } from "../../lib/workflow-workspace.js";

const log = createLogger("nodetool.websocket.projects");

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
    "document",
    "model3d",
    "application",
    "game",
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
    case "document":
      row = tab.ref.startsWith("asset://")
        ? await Asset.find(userId, tab.ref.slice("asset://".length))
        : null;
      break;
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
    case "game":
      row = await Game.findOwned(userId, tab.ref);
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

async function prepareUser(userId: string): Promise<void> {
  const { project: personal } = await Project.migrateToPersonal(userId);
  if (personal.workspace_id) return;
  // Personal is created lazily, after the startup migration has run, so its
  // folder is assigned the first time it is seen without one.
  try {
    await ensureProjectFolder(personal);
  } catch (error) {
    log.warn("Could not give the Personal project a folder", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Why a project folder could not be made, in words safe for this caller. A
 * file-system error names server paths, which only a local caller may see.
 */
function projectFolderFailure(error: unknown): string {
  const prefix = "Could not create the project folder";
  if (error instanceof ProjectFolderError) return `${prefix}: ${error.message}`;
  log.warn("Project folder creation failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  if (!isLocalDeployment()) return prefix;
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}

/** The project as the API returns it, with its folder. */
async function toResponse(project: Project): Promise<ProjectResponse> {
  const row = project.workspace_id
    ? await Workspace.find(project.user_id, project.workspace_id)
    : null;
  return projectResponse.parse({
    ...project.toResponse(),
    folder: row ? describeProjectFolder(row) : null
  });
}

const FOLDER_OPEN_ERROR_CODES = {
  forbidden: ApiErrorCode.FORBIDDEN,
  invalid: ApiErrorCode.INVALID_INPUT,
  conflict: ApiErrorCode.ALREADY_EXISTS,
  not_found: ApiErrorCode.NOT_FOUND
} as const;

/** Run a folder open or relocate, answering its refusals as API errors. */
async function withFolderErrors(
  action: () => Promise<Project>
): Promise<ProjectResponse> {
  try {
    return await toResponse(await action());
  } catch (error) {
    if (error instanceof ProjectFolderOpenError) {
      throwApiError(FOLDER_OPEN_ERROR_CODES[error.code], error.message);
    }
    throw error;
  }
}

async function loadOwned(userId: string, id: string): Promise<Project> {
  const project = await Project.findOwned(userId, id);
  if (!project) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
  return project;
}

/**
 * Load a project a client is opening and reconcile its asset index with its
 * folder in the background, so changes made to the folder while the project
 * was closed show up. The reads a client makes when it opens a project call
 * this: `get`, `documentPage` and `restoreTabs`.
 */
async function loadOpened(userId: string, id: string): Promise<Project> {
  const project = await loadOwned(userId, id);
  reconcileProjectOnOpen(project.id, userId);
  return project;
}

export const projectsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(projectResponse))
    .query(async ({ ctx }) => {
      await prepareUser(ctx.userId);
      const items = await Project.listByUser(ctx.userId);
      return Promise.all(items.map(toResponse));
    }),

  /** Archived projects stay discoverable in project management, not the selector. */
  archived: protectedProcedure
    .input(listInput)
    .output(z.array(projectResponse))
    .query(async ({ ctx }) => {
      await prepareUser(ctx.userId);
      const items = await Project.listByUser(ctx.userId, 100, true);
      return Promise.all(items.map(toResponse));
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
            project: await toResponse(project),
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
      const project = await loadOpened(ctx.userId, input.id);
      const summary = await summarizeProject(ctx.userId, project.id);
      return projectDetail.parse({
        project: await toResponse(project),
        documents: summary.documents,
        documentsPartial: summary.documentsPartial,
        entities: summary.entities,
        spend: summary.spend
      });
    }),

  /**
   * The cards on one page of a project's documents. `get` reads every
   * document whole plus the ledger and entities, which a strip of a few cards
   * does not draw; this reads whole only the documents on the page.
   */
  documentPage: protectedProcedure
    .input(projectDocumentPageInput)
    .output(projectDocumentPage)
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const project = await loadOpened(ctx.userId, input.id);
      return summarizeProjectDocumentPage(ctx.userId, project.id, {
        offset: input.offset,
        limit: input.limit
      });
    }),

  documents: protectedProcedure
    .input(idInput)
    .output(z.array(projectDocumentListEntry))
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      await loadOwned(ctx.userId, input.id);
      return listProjectDocuments(ctx.userId, input.id);
    }),

  /**
   * The workflow or timeline whose file in the project's folder is `path`,
   * or null. Opening a document file from Files opens its editor through
   * this. The folder of Personal also holds the files of documents in no
   * project.
   */
  documentByFile: protectedProcedure
    .input(projectDocumentByFileInput)
    .output(projectFileDocument.nullable())
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const project = await loadOwned(ctx.userId, input.id);
      const projectIds =
        project.id === `personal:${ctx.userId}`
          ? [project.id, LOOSE_PROJECT_ID]
          : [project.id];
      const found = await findDocumentByFile(ctx.userId, projectIds, input.path);
      if (!found) return null;
      return {
        type: found.type,
        ref: found.id,
        name: found.name,
        updatedAt: found.updated_at,
        file: found.file
      };
    }),

  /**
   * Write the file of a workflow or timeline again from the document, for a
   * document whose file is missing. A file edit at the path that NodeTool has
   * not seen is kept as a version first, and an invalid one is not replaced.
   */
  restoreDocumentFile: protectedProcedure
    .input(restoreDocumentFileInput)
    .output(projectFileDocument)
    .mutation(async ({ ctx, input }) => {
      const row =
        input.type === "workflow"
          ? await Workflow.get<Workflow>(input.ref)
          : await TimelineSequence.findById(input.ref);
      if (!row || row.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Document not found");
      }
      try {
        if (row instanceof Workflow) {
          await restoreDocumentFile(workflowFileAdapter, row);
        } else {
          await restoreDocumentFile(timelineFileAdapter, row);
        }
      } catch (error) {
        if (error instanceof ProjectFolderUnavailableError) {
          throwApiError(
            ApiErrorCode.SERVICE_UNAVAILABLE,
            error.message,
            "PRECONDITION_FAILED"
          );
        }
        if (error instanceof DocumentFileRestoreError) {
          throwApiError(ApiErrorCode.INVALID_INPUT, error.message, "CONFLICT");
        }
        throw error;
      }
      const file = documentFileOf(row);
      if (!file) {
        throwApiError(
          ApiErrorCode.INTERNAL_ERROR,
          "The file could not be written"
        );
      }
      return {
        type: input.type,
        ref: row.id,
        name: row.name,
        updatedAt: row.updated_at,
        file
      };
    }),

  restoreTabs: protectedProcedure
    .input(z.object({ id: z.string(), tabs: z.array(restorableTab) }))
    .output(z.array(restorableTab))
    .query(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      await loadOpened(ctx.userId, input.id);
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
    .output(z.array(projectDocumentListEntry))
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
      if (project) {
        // The folder is part of the create. A project whose folder cannot be
        // made is removed again, so no project exists without one.
        try {
          await ensureProjectFolder(project);
        } catch (error) {
          await project.delete();
          throwApiError(
            ApiErrorCode.SERVICE_UNAVAILABLE,
            projectFolderFailure(error)
          );
        }
        return toResponse(project);
      }

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
      return toResponse(existing);
    }),

  /**
   * Open an existing local folder as a project, without moving a file. Local
   * installs only. See `openProjectFolder` for the `.nodetool/project.json`
   * cases.
   */
  openFolder: protectedProcedure
    .input(openProjectFolderInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      return withFolderErrors(() => openProjectFolder(ctx.userId, input));
    }),

  /** Point a project whose folder moved at its new place. Local installs only. */
  relocate: protectedProcedure
    .input(relocateProjectInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      return withFolderErrors(() => relocateProjectFolder(ctx.userId, input));
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
      return toResponse(updated);
    }),

  archive: protectedProcedure
    .input(idInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const archived = await Project.archiveOwned(ctx.userId, input.id);
      if (!archived) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return toResponse(archived);
    }),

  restore: protectedProcedure
    .input(idInput)
    .output(projectResponse)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const restored = await Project.restoreOwned(ctx.userId, input.id);
      if (!restored) throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      return toResponse(restored);
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      await prepareUser(ctx.userId);
      const outcome = await deleteProjectForUser(ctx.userId, input.id);
      if (outcome === "personal") {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Personal cannot be deleted");
      }
      if (outcome === "not_found") {
        throwApiError(ApiErrorCode.NOT_FOUND, "Project not found");
      }
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
      if (input.type === "game") {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Moving a game requires moving its workspace source");
      }
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
      let moved: boolean;
      try {
        moved = await moveDocumentToProject(
          ctx.userId,
          input.type,
          input.ref,
          input.projectId
        );
      } catch (error) {
        // An entity that is a file in its project folder takes the file
        // along. With a folder unreachable nothing moves, and the caller is
        // told which folder.
        if (error instanceof ProjectFolderUnavailableError) {
          throwApiError(
            ApiErrorCode.SERVICE_UNAVAILABLE,
            error.message,
            "PRECONDITION_FAILED"
          );
        }
        throw error;
      }
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
      if (input.type === "game") {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Game copies are not supported yet");
      }
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
