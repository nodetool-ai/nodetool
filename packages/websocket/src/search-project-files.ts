/**
 * Project folder files for library search (docs/plans/library-search.md,
 * F13): the files of each local project folder that no asset or document
 * names, listed by the same rule a cloud send uses. Installed in the indexer
 * process only. A folder on object storage is not read here, because this
 * process has no cloud storage configured.
 */

import { and, isNotNull, isNull } from "drizzle-orm";
import { getPortableDb, projects } from "@nodetool-ai/models";
import { resolveProjectWorkspace } from "@nodetool-ai/execution/service";
import { listWorkspaceFiles } from "@nodetool-ai/project-services/workspace-files";
import type { Workspace } from "@nodetool-ai/runtime";
import type { ProjectFileSource } from "@nodetool-ai/search-services";

/** The project's local folder, or null when it has none this process can read. */
async function localFolder(userId: string, projectId: string): Promise<Workspace | null> {
  const resolved = await resolveProjectWorkspace(projectId, userId, { createMissing: false });
  if (!resolved.ok || !resolved.workspace.localDir) return null;
  return resolved.workspace;
}

export const localProjectFileSource: ProjectFileSource = {
  async projects(userId) {
    const rows = await getPortableDb()
      .select({ id: projects.id, userId: projects.user_id })
      .from(projects)
      .where(and(isNull(projects.deleted_at), isNotNull(projects.workspace_id)));
    return rows
      .filter((row) => !userId || row.userId === userId)
      .map((row) => ({ userId: row.userId, projectId: row.id }));
  },
  async files(userId, projectId) {
    const folder = await localFolder(userId, projectId);
    if (!folder) throw new Error(`The folder of project ${projectId} is not readable here.`);
    return listWorkspaceFiles(userId, projectId, folder);
  },
  async size(userId, projectId, path) {
    const folder = await localFolder(userId, projectId);
    if (!folder) throw new Error(`The folder of project ${projectId} is not readable here.`);
    const stat = await folder.stat(path);
    return stat && !stat.isDirectory ? stat.size : null;
  },
  async read(userId, projectId, path) {
    const folder = await localFolder(userId, projectId);
    if (!folder) throw new Error(`The folder of project ${projectId} is not readable here.`);
    return folder.read(path);
  }
};
