/**
 * The `projects` capability module — list, search, create, edit, move items
 * into and delete the caller's projects.
 *
 * Reads and edits go through `Project` in `@nodetool-ai/models`, the same
 * model methods the tRPC `projects` router calls. Deletion is different: the
 * full delete also removes stored asset bytes and workspace files and stops
 * live runs, and those live in the server. The host injects that operation as
 * `run.deleteProject`, and a run without it says so.
 *
 * Ownership is the rule the router applies: another user's project reads as
 * missing rather than as forbidden.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Project } from "@nodetool-ai/models";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listProjectsSpec,
  searchProjectsSpec,
  createProjectSpec,
  updateProjectSpec,
  moveToProjectSpec,
  deleteProjectSpec,
  MAX_PROJECTS_PER_CALL,
  MOVABLE_PROJECT_ITEM_TYPES
} from "./projects.specs.js";
import { isNonBlankString, isString } from "../utils/type-guards.js";

type ToolError = { error: string };

/** Rows `search_projects` reads before it filters. */
const SEARCH_SCAN_LIMIT = 500;

function userOf(run: CapabilityRun): string | ToolError {
  const userId = (run.context as ProcessingContext).userId;
  if (!userId) return { error: "No user is bound to this session." };
  return userId;
}

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

function clamp(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function projectIdOf(params: Record<string, unknown>): string | ToolError {
  const id = params["project_id"];
  if (!isNonBlankString(id)) {
    return { error: "project_id is required (use list_projects to find one)." };
  }
  return id.trim();
}

const notFound = (id: string): ToolError => ({
  error: `Project ${id} was not found.`
});

function summarizeProject(project: Project) {
  const response = project.toResponse();
  return {
    id: response.id,
    name: response.name,
    kind: response.kind,
    is_personal: response.isPersonal,
    archived_at: response.archivedAt ?? undefined,
    created_at: response.createdAt,
    updated_at: response.updatedAt
  };
}

const listProjects: CapabilityExport = {
  spec: listProjectsSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const { Project } = await import("@nodetool-ai/models");
    // The router does the same before every read, so a user who never opened
    // the projects UI still sees their Personal project.
    await Project.migrateToPersonal(userId);
    const limit = clamp(params["limit"], 50, MAX_PROJECTS_PER_CALL);
    const rows = await Project.listByUser(
      userId,
      limit,
      params["archived"] === true
    );
    return { projects: rows.map(summarizeProject) };
  }
};

const searchProjects: CapabilityExport = {
  spec: searchProjectsSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const query = params["query"];
    const words = isString(query)
      ? query.toLowerCase().split(/\s+/).filter((word) => word !== "")
      : [];
    if (words.length === 0) {
      return { error: "query is required (use list_projects to see them all)." };
    }
    const { Project } = await import("@nodetool-ai/models");
    await Project.migrateToPersonal(userId);
    const limit = clamp(params["limit"], 20, MAX_PROJECTS_PER_CALL);
    const active = await Project.listByUser(userId, SEARCH_SCAN_LIMIT, false);
    const archived =
      params["include_archived"] === false
        ? []
        : await Project.listByUser(userId, SEARCH_SCAN_LIMIT, true);
    const matches = [...active, ...archived].filter((project) => {
      const haystack = `${project.name} ${project.kind}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
    return { projects: matches.slice(0, limit).map(summarizeProject) };
  }
};

const updateProject: CapabilityExport = {
  spec: updateProjectSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const id = projectIdOf(params);
    if (isError(id)) return id;

    const fields: { name?: string; kind?: string } = {};
    const name = params["name"];
    if (name !== undefined) {
      if (!isString(name) || name.trim() === "" || name.length > 200) {
        return { error: "name must be 1 to 200 characters." };
      }
      fields.name = name;
    }
    const kind = params["kind"];
    if (kind !== undefined) {
      if (!isString(kind) || kind.length > 64) {
        return { error: "kind must be a string of at most 64 characters." };
      }
      fields.kind = kind;
    }
    const archived = params["archived"];
    if (archived !== undefined && typeof archived !== "boolean") {
      return { error: "archived must be true or false." };
    }
    if (Object.keys(fields).length === 0 && archived === undefined) {
      return { error: "Pass at least one of name, kind or archived." };
    }

    const { Project, PERSONAL_PROJECT_KIND } = await import(
      "@nodetool-ai/models"
    );
    const existing = await Project.findOwned(userId, id);
    if (!existing) return notFound(id);
    if (
      fields.kind !== undefined &&
      fields.kind !== existing.kind &&
      (existing.kind === PERSONAL_PROJECT_KIND ||
        fields.kind === PERSONAL_PROJECT_KIND)
    ) {
      return {
        error: `The "${PERSONAL_PROJECT_KIND}" kind is reserved for the Personal project and cannot be set or changed.`
      };
    }

    // The model reads the 12-char prefix CodeAct hands it; write by the full id.
    let updated: Project | null = existing;
    if (Object.keys(fields).length > 0) {
      updated = await Project.updateOwned(userId, existing.id, fields);
    }
    if (updated && archived === true) {
      updated = await Project.archiveOwned(userId, existing.id);
    } else if (updated && archived === false) {
      updated = await Project.restoreOwned(userId, existing.id);
    }
    if (!updated) return notFound(id);
    return { project: summarizeProject(updated) };
  }
};

const createProject: CapabilityExport = {
  spec: createProjectSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const name = params["name"];
    if (!isString(name) || name.trim() === "" || name.length > 200) {
      return { error: "name must be 1 to 200 characters." };
    }
    const kind = params["kind"] ?? "";
    if (!isString(kind) || kind.length > 64) {
      return { error: "kind must be a string of at most 64 characters." };
    }
    const { Project, PERSONAL_PROJECT_KIND } = await import(
      "@nodetool-ai/models"
    );
    if (kind === PERSONAL_PROJECT_KIND) {
      return {
        error: `The "${PERSONAL_PROJECT_KIND}" kind is reserved for the Personal project.`
      };
    }
    const project = await Project.insertNew({
      user_id: userId,
      name: name.trim(),
      kind
    });
    if (!project) return { error: "The project could not be created." };
    // The folder is part of the create, as in the projects router: a project
    // whose folder cannot be made is removed again.
    const { ensureProjectFolder } = await import(
      "@nodetool-ai/execution/service"
    );
    try {
      await ensureProjectFolder(project);
    } catch (error) {
      await project.delete();
      return {
        error: `The project folder could not be created: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    return { project: summarizeProject(project) };
  }
};

type MovableType = (typeof MOVABLE_PROJECT_ITEM_TYPES)[number];

const isMovableType = (value: unknown): value is MovableType =>
  isString(value) &&
  (MOVABLE_PROJECT_ITEM_TYPES as readonly string[]).includes(value);

/**
 * The full id of an item the caller owns, from a full id or a 12-char prefix.
 * Null when the caller owns no such item.
 */
async function ownedItemId(
  userId: string,
  type: Exclude<MovableType, "asset" | "entity">,
  id: string
): Promise<string | null> {
  const models = await import("@nodetool-ai/models");
  const getters: Record<
    typeof type,
    () => Promise<{ id: string; user_id: string } | null>
  > = {
    storyboard: () => models.Storyboard.get(id),
    script: () => models.Script.get(id),
    timeline: () => models.TimelineSequence.get(id),
    sketch: () => models.ImageDocument.get(id),
    application: () => models.Application.get(id),
    jsscript: () => models.JsScript.get(id)
  };
  const row = await getters[type]();
  return row && row.user_id === userId ? row.id : null;
}

const moveToProject: CapabilityExport = {
  spec: moveToProjectSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const named = projectIdOf(params);
    if (isError(named)) return named;
    const type = params["type"];
    if (!isMovableType(type)) {
      return {
        error: `type must be one of ${MOVABLE_PROJECT_ITEM_TYPES.join(", ")}.`
      };
    }
    const rawId = params["id"];
    if (!isNonBlankString(rawId)) return { error: "id is required." };
    const itemId = rawId.trim();

    const models = await import("@nodetool-ai/models");
    const target = await models.Project.findOwned(userId, named);
    if (!target) return notFound(named);

    try {
      if (type === "asset") {
        const asset = await models.Asset.find(userId, itemId);
        if (!asset) return { error: `Asset ${itemId} was not found.` };
        await models.saveAssetInProject(asset, target.id);
        return { moved: true, type, id: asset.id, project_id: target.id };
      }
      let fullId = itemId;
      if (type === "entity") {
        const asset = await models.Asset.find(userId, itemId);
        if (!asset) return { error: `Entity ${itemId} was not found.` };
        fullId = asset.id;
      } else {
        const owned = await ownedItemId(userId, type, itemId);
        if (!owned) return { error: `${type} ${itemId} was not found.` };
        fullId = owned;
      }
      if (await models.hasProjectDocumentDependents(userId, type, fullId)) {
        return {
          error:
            "Other documents reference this item, so it cannot move. Copy it into the destination project instead."
        };
      }
      const moved = await models.moveDocumentToProject(
        userId,
        type,
        fullId,
        target.id
      );
      if (!moved) return { error: `${type} ${itemId} was not found.` };
      return { moved: true, type, id: fullId, project_id: target.id };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

const deleteProject: CapabilityExport = {
  spec: deleteProjectSpec,
  impl: async (run, params) => {
    const userId = userOf(run);
    if (isError(userId)) return userId;
    const named = projectIdOf(params);
    if (isError(named)) return named;
    // The model names projects by the 12-char prefix CodeAct hands it. Resolve
    // the row once, so the guard and the host compare and delete the full id.
    const { Project } = await import("@nodetool-ai/models");
    const target = await Project.findOwnedIncludingDeleted(userId, named);
    if (!target) return notFound(named);
    const id = target.id;
    // Deleting the run's own project would abort the conversation that asked,
    // before it can report what happened.
    if (isNonBlankString(run.projectId) && run.projectId.trim() === id) {
      return {
        error:
          "This conversation belongs to that project, so it cannot delete it. Delete it from another conversation or from the projects page."
      };
    }
    const deleter = run.deleteProject;
    if (!deleter) {
      return {
        error:
          "Project deletion is not available in this host. Delete the project from the projects page."
      };
    }
    const report = await deleter(userId, id);
    if (report.outcome !== "deleted") {
      return report.outcome === "personal"
        ? { error: "The Personal project cannot be deleted." }
        : notFound(id);
    }
    return { project_id: id, deleted: true, folder: report.folder };
  }
};

/** Every project capability, in declaration order. */
export const PROJECT_CAPABILITIES: readonly CapabilityExport[] = [
  listProjects,
  searchProjects,
  createProject,
  updateProject,
  moveToProject,
  deleteProject
];

export const module: CapabilityModule = {
  module: "projects",
  exports: PROJECT_CAPABILITIES
};

export {
  listProjects,
  searchProjects,
  createProject,
  updateProject,
  moveToProject,
  deleteProject
};
