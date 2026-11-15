/**
 * The full project delete: database rows, stored asset bytes, the project
 * folder, and the live jobs and chat turns that still write into the project.
 *
 * The tRPC `projects.delete` procedure and the agent `delete_project`
 * capability both call this, so the two surfaces cannot delete different
 * amounts of a project. A host that runs jobs, chat turns or video proxies
 * passes `cancelLiveWork` to stop them before their files go.
 *
 * What happens to the folder follows who made it (PRD D12). A folder NodeTool
 * created goes to the trash, or its key prefix is deleted in object storage.
 * A folder the user brought keeps every file and loses only `.nodetool/`.
 * Workspace rows that are not the project folder are removed as rows, and
 * their files are not touched.
 */
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  createLogger,
  getManagedWorkspaceDir,
  managedWorkspaceKey
} from "@nodetool-ai/config";
import {
  PERSONAL_PROJECT_KIND,
  Project,
  Asset,
  Job,
  Thread,
  Workspace
} from "@nodetool-ai/models";
import { RESERVED_WORKSPACE_DIR } from "@nodetool-ai/runtime";
import { assetKeyCandidates } from "@nodetool-ai/storage";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import {
  assetFileNameCandidates,
  videoProxyFileNames
} from "@nodetool-ai/asset-services/asset-paths";
import { thumbnailKey } from "@nodetool-ai/asset-services/thumbnail";
import {
  configuredProjectsDir,
  isFolderMarkedCreated,
  isLocalDeployment,
  nodetoolDirFromRow,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { trashFolder } from "./folder-trash.js";

const log = createLogger("nodetool.project-services.delete");

/**
 * What deleting a project does to its folder.
 *
 * - `trash`: a local folder NodeTool created moves to the trash.
 * - `remove`: a cloud folder NodeTool created has its key prefix deleted.
 * - `keep`: a folder the user brought keeps its files and loses `.nodetool/`.
 */
export type ProjectFolderDeletePlan = "trash" | "remove" | "keep";

/**
 * What a delete did to the project's folder.
 *
 * - `trashed`: moved to the OS trash. `path` is its place there.
 * - `moved_aside`: the OS trash was out of reach, so the folder moved to
 *   `<projects dir>/.trash`. `path` is its place there.
 * - `removed`: the key prefix in object storage was deleted.
 * - `kept`: every file stayed and `.nodetool/` was removed. `path` is the
 *   folder.
 * - `trash_failed`: the folder was meant for the trash and could not be moved
 *   to either one. It stays untouched at `path`.
 * - `none`: the project had no folder, or the folder was not reachable.
 *
 * `path` is null for a folder in object storage, and on a production
 * deployment, whose callers are not shown server paths.
 */
export interface ProjectFolderDisposal {
  action:
    | "trashed"
    | "moved_aside"
    | "removed"
    | "kept"
    | "trash_failed"
    | "none";
  path: string | null;
}

/** The outcome of a project delete, with what happened to the folder. */
export type ProjectDeleteResult =
  | { outcome: "not_found" | "personal" }
  | { outcome: "deleted"; folder: ProjectFolderDisposal };

/** The live work in a project that is being deleted. */
export interface ProjectLiveWork {
  userId: string;
  jobIds: ReadonlySet<string>;
  threadIds: ReadonlySet<string>;
  assetIds: readonly string[];
}

export interface ProjectDeleteOptions {
  /** Stop the host's running jobs, chat turns and queued asset work. */
  cancelLiveWork?: (work: ProjectLiveWork) => void;
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
          thumbnailKey(asset.id),
          ...videoProxyFileNames(asset.id)
        ].flatMap((fileName) =>
          assetKeyCandidates(asset.user_id, fileName).map(async (key) => {
            const uri = storage.uriForKey(key);
            if (await storage.exists(uri)) await storage.delete(uri);
          })
        )
      )
  );
}

/**
 * True when NodeTool made the folder behind `row`.
 *
 * `origin` alone does not say so. Every row from before project folders got
 * `created` from the column default, including folders a user added by hand,
 * and a row a user points at a folder of their own keeps it too. Where the
 * folder sits says nothing either: a user's folder can lie inside the
 * projects directory. The proof is the record `createFolder` writes into
 * `.nodetool/` for the row's project. A folder without it is treated as
 * brought by the user, so its files are never moved.
 *
 * The user's default workspace and the managed root are never a folder to
 * remove: loose work lands in the first, and every managed project folder and
 * game workspace lies inside the second.
 */
async function madeByNodeTool(row: Workspace): Promise<boolean> {
  if (row.origin !== "created" || row.is_default) return false;
  const managedRoot =
    row.path === getManagedWorkspaceDir(row.user_id) ||
    row.path === managedWorkspaceKey(row.user_id);
  if (managedRoot) return false;
  return isFolderMarkedCreated(row);
}

/** What deleting the project that owns this folder row does to the folder. */
export async function planProjectFolderDelete(
  row: Workspace
): Promise<ProjectFolderDeletePlan> {
  if (!(await madeByNodeTool(row))) return "keep";
  return row.isVirtual() ? "remove" : "trash";
}

/** A server path as this deployment may show it to its callers. */
function shownPath(path: string): string | null {
  return isLocalDeployment() ? path : null;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Remove `.nodetool/` from a folder and leave every other file as it is.
 *
 * A local directory is removed with `rm`, which unlinks a symlink instead of
 * following it, so a `.nodetool` that links elsewhere cannot take the linked
 * files with it.
 */
async function removeNodetoolDir(row: Workspace): Promise<void> {
  if (!row.isVirtual()) {
    await rm(join(row.path, RESERVED_WORKSPACE_DIR), {
      recursive: true,
      force: true
    });
    return;
  }
  await nodetoolDirFromRow(row)?.deleteAll("");
}

/**
 * Apply the delete plan to the project's folder.
 *
 * A folder that cannot be moved to either trash stays where it is and is
 * reported as such, so a failed move never costs the user a file.
 */
async function disposeProjectFolder(
  projectId: string,
  row: Workspace | null
): Promise<ProjectFolderDisposal> {
  // A row filed under another project is not this project's to touch.
  if (!row || row.project_id !== projectId) return { action: "none", path: null };
  const plan = await planProjectFolderDelete(row);
  if (plan === "keep") {
    if (!row.isVirtual() && !(await isDirectory(row.path))) {
      return { action: "none", path: null };
    }
    await removeNodetoolDir(row);
    return {
      action: "kept",
      path: row.isVirtual() ? null : shownPath(row.path)
    };
  }
  if (plan === "remove") {
    const workspace = workspaceFromRow(row);
    const nodetoolDir = nodetoolDirFromRow(row);
    if (!workspace || !nodetoolDir) return { action: "none", path: null };
    // `deleteAll` leaves the reserved directory alone, so it is cleared too.
    await workspace.deleteAll("");
    await nodetoolDir.deleteAll("");
    return { action: "removed", path: null };
  }
  if (!(await isDirectory(row.path))) return { action: "none", path: null };
  const { dir } = await configuredProjectsDir(row.user_id);
  try {
    const trashed = await trashFolder(row.path, dir);
    return {
      action: trashed.kind === "os_trash" ? "trashed" : "moved_aside",
      path: shownPath(trashed.location)
    };
  } catch (error) {
    log.warn("Could not move a deleted project's folder to the trash", {
      projectId,
      workspaceId: row.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return { action: "trash_failed", path: shownPath(row.path) };
  }
}

export async function deleteProjectForUser(
  userId: string,
  projectId: string,
  options: ProjectDeleteOptions = {}
): Promise<ProjectDeleteResult> {
  // A tombstoned project is still found here, so a failed delete can be retried.
  const target = await Project.findOwnedIncludingDeleted(userId, projectId);
  if (!target) return { outcome: "not_found" };
  if (target.kind === PERSONAL_PROJECT_KIND) return { outcome: "personal" };
  // The lookup accepts a short resource id. The listings and deletes below
  // match exactly, so they take the full id.
  const id = target.id;
  await Project.tombstoneOwned(userId, id);
  const [jobs, threads, assets, folderRow] = await Promise.all([
    Job.listByProject(userId, id),
    Thread.listByProject(userId, id),
    Asset.listByProject(userId, id),
    target.workspace_id ? Workspace.find(userId, target.workspace_id) : null
  ]);
  options.cancelLiveWork?.({
    userId,
    jobIds: new Set(jobs.map((job) => job.id)),
    threadIds: new Set(threads.map((thread) => thread.id)),
    assetIds: assets.map((asset) => asset.id)
  });
  // Keep the rows behind the tombstone until external cleanup succeeds.
  // A failed request can then be retried with every object identifier intact.
  await deleteProjectAssetObjects(assets);
  const folder = await disposeProjectFolder(id, folderRow);
  const deleted = await Project.deleteOwned(userId, id);
  return deleted ? { outcome: "deleted", folder } : { outcome: "not_found" };
}
