/**
 * Project folders for tests that start runs.
 *
 * A run reads and writes its project's folder and refuses to start without
 * one, so a suite that runs workflows, scripts or chat turns gives its
 * projects real folders under a temporary `PROJECTS_DIR`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Project,
  Workspace as WorkspaceRow,
  clearSecretCache
} from "@nodetool-ai/models";
import {
  ensurePersonalProject,
  ensureProjectFolder
} from "@nodetool-ai/execution/service";

const ENV_KEYS = ["PROJECTS_DIR", "NODETOOL_WORKSPACES_DIR"] as const;

export interface ProjectFolderFixture {
  /** The temporary directory every folder of this test lives under. */
  readonly root: string;
  /** Restore the environment and remove every folder. */
  cleanup(): Promise<void>;
}

/**
 * Point new project folders at a fresh temporary directory. `getSecret`
 * caches `PROJECTS_DIR` per user, so pass every user the test runs as.
 */
export async function useProjectFolders(
  userIds: readonly string[]
): Promise<ProjectFolderFixture> {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const root = await mkdtemp(join(tmpdir(), "nodetool-test-projects-"));
  process.env["PROJECTS_DIR"] = join(root, "NodeTool");
  process.env["NODETOOL_WORKSPACES_DIR"] = join(root, "workspaces");
  const clear = (): void => {
    for (const userId of userIds) clearSecretCache(userId, "PROJECTS_DIR");
  };
  clear();
  return {
    root,
    async cleanup() {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      clear();
      await rm(root, { recursive: true, force: true });
    }
  };
}

/** The user's Personal project and its folder row. */
export async function personalWithFolder(
  userId: string
): Promise<{ project: Project; folder: WorkspaceRow }> {
  const project = await ensurePersonalProject(userId);
  const folder = await WorkspaceRow.find(userId, project.workspace_id ?? "");
  if (!folder) throw new Error("Personal has no folder");
  return { project, folder };
}

/** A project, created under `id` when given, with its folder. */
export async function projectWithFolder(
  userId: string,
  name: string,
  id?: string
): Promise<{ project: Project; folder: WorkspaceRow }> {
  const project = await Project.insertNew({
    user_id: userId,
    name,
    ...(id && { id })
  });
  if (!project) throw new Error(`Could not create project ${name}`);
  return { project, folder: await ensureProjectFolder(project) };
}
