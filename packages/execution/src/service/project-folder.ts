/**
 * Project folders: every project has exactly one folder, named by
 * `projects.workspace_id`.
 *
 * A local project folder is a directory under the `PROJECTS_DIR` setting. A
 * cloud one is a key prefix in the deployment's object storage, with the same
 * managed key shape native games use. `.nodetool/project.json` inside the
 * folder names the project it belongs to. See docs/project-folders/prd.md (T1
 * and T9).
 */

import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createLogger,
  getProjectsDir,
  managedWorkspaceKey,
  workspaceStorageKind
} from "@nodetool-ai/config";
import {
  LOOSE_PROJECT_ID,
  PERSONAL_PROJECT_KIND,
  Project,
  Workspace as WorkspaceRow,
  getSecret,
  type WorkspaceOrigin
} from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import { workspaceFromRow } from "./workflow-workspace.js";

const log = createLogger("nodetool.execution.project-folder");

/** Where the manifest that identifies a project folder lives in it. */
export const PROJECT_MANIFEST_PATH = ".nodetool/project.json";

/** The contents of `.nodetool/project.json`. */
export interface ProjectManifest {
  format: "nodetool.project";
  version: 1;
  id: string;
  name: string;
}

/** What the project API reports about a project's folder. */
export interface ProjectFolderInfo {
  /** The absolute directory, or null for a folder in object storage. */
  path: string | null;
  origin: WorkspaceOrigin;
  is_accessible: boolean;
}

/** Folder name used when a project name has no character a folder can carry. */
const UNTITLED_FOLDER = "Untitled project";

/** Longest folder name, in characters, before the collision suffix. */
const MAX_FOLDER_NAME = 100;

/** Highest collision suffix tried before giving up. */
const MAX_FOLDER_SUFFIX = 1000;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/**
 * A folder name for a project name that is valid on every desktop OS.
 *
 * Path separators, characters Windows refuses and control characters become
 * spaces. Leading dots (a hidden folder) and trailing dots or spaces (refused
 * by Windows) are dropped. A Windows device name gets a suffix.
 */
export function projectFolderName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex -- control characters are the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const limited = Array.from(cleaned)
    .slice(0, MAX_FOLDER_NAME)
    .join("")
    .replace(/[. ]+$/, "")
    .trim();
  if (!limited) return UNTITLED_FOLDER;
  return WINDOWS_RESERVED.test(limited) ? `${limited} project` : limited;
}

/** The manifest a project's folder carries. */
export function projectManifest(project: Project): ProjectManifest {
  return {
    format: "nodetool.project",
    version: 1,
    id: project.id,
    name: project.name
  };
}

/** What the project API reports about a workspace row that is a folder. */
export function describeProjectFolder(row: WorkspaceRow): ProjectFolderInfo {
  return {
    path: row.isVirtual() ? null : row.path,
    origin: row.origin,
    is_accessible: row.isAccessible()
  };
}

function requireWorkspace(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) {
    throw new Error("Project folder storage is not configured");
  }
  return workspace;
}

async function writeManifest(
  workspace: Workspace,
  project: Project
): Promise<void> {
  await workspace.write(
    PROJECT_MANIFEST_PATH,
    `${JSON.stringify(projectManifest(project), null, 2)}\n`,
    "application/json"
  );
}

/**
 * Write the manifest into a folder the project already had, when it is absent.
 *
 * A folder that is not reachable is left alone, so a missing drive is not
 * recreated as an empty directory. A failed write is logged and does not stop
 * the project from keeping its folder.
 */
async function writeManifestIfAbsent(
  row: WorkspaceRow,
  project: Project
): Promise<void> {
  if (!row.isAccessible()) return;
  try {
    const workspace = requireWorkspace(row);
    if (await workspace.exists(PROJECT_MANIFEST_PATH)) return;
    await writeManifest(workspace, project);
  } catch (error) {
    log.warn("Could not write the project manifest", {
      projectId: project.id,
      workspaceId: row.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Make `row` the project's folder unless a concurrent caller already chose
 * one, and answer the folder the project ends up with.
 */
async function claim(
  project: Project,
  row: WorkspaceRow
): Promise<WorkspaceRow> {
  const winner = await Project.claimWorkspace(
    project.user_id,
    project.id,
    row.id,
    project.workspace_id
  );
  if (winner === row.id) {
    project.workspace_id = row.id;
    return row;
  }
  const existing = winner
    ? await WorkspaceRow.find(project.user_id, winner)
    : null;
  if (!existing) throw new Error("Project not found");
  project.workspace_id = existing.id;
  return existing;
}

/**
 * Create a new directory for `name` under `parent`, adding " 2", " 3" and so
 * on when the name is taken on disk or by another workspace row.
 *
 * The final `mkdir` is not recursive, so two creates racing for one name
 * cannot both claim it.
 */
async function claimLocalFolder(parent: string, name: string): Promise<string> {
  await mkdir(parent, { recursive: true });
  for (let n = 1; n <= MAX_FOLDER_SUFFIX; n++) {
    const path = join(parent, n === 1 ? name : `${name} ${n}`);
    if (await WorkspaceRow.isPathTaken(path)) continue;
    try {
      await mkdir(path);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error(`No free folder name for "${name}" in ${parent}`);
}

/** Create a new folder for the project and record it. */
async function createFolder(project: Project): Promise<WorkspaceRow> {
  let path: string;
  let createdDir: string | null = null;
  if (workspaceStorageKind() === "cloud") {
    const segment = createHash("sha256").update(project.id).digest("hex");
    path = `${managedWorkspaceKey(project.user_id)}/projects/${segment}`;
  } else {
    const setting = await getSecret("PROJECTS_DIR", project.user_id);
    path = await claimLocalFolder(
      getProjectsDir(setting),
      projectFolderName(project.name)
    );
    createdDir = path;
  }

  let row: WorkspaceRow | null = null;
  try {
    row = (await WorkspaceRow.create({
      user_id: project.user_id,
      project_id: project.id,
      name: project.name,
      path,
      origin: "created",
      is_default: false
    })) as WorkspaceRow;
    await writeManifest(requireWorkspace(row), project);
    const folder = await claim(project, row);
    if (folder.id !== row.id) {
      // A concurrent caller recorded its folder first. A cloud folder shares
      // the winner's key, so only a local directory of our own is removed.
      await row.delete();
      if (createdDir) await rm(createdDir, { recursive: true, force: true });
    }
    return folder;
  } catch (error) {
    await row?.delete();
    if (createdDir) await rm(createdDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * The project's folder, created or assigned when it has none. Idempotent.
 *
 * - A project whose `workspace_id` names an existing row keeps that row.
 * - Personal uses the user's default workspace and claims that row for itself
 *   when the row is in no project or already Personal's, and no game uses it.
 *   No files move.
 * - Any other project keeps its oldest workspace row that no game uses. Other
 *   rows and their files are left as they are.
 * - Otherwise a new folder is created.
 *
 * `.nodetool/project.json` is written into the folder when it is absent.
 * Throws when a new folder cannot be created, leaving no row or directory
 * behind.
 */
export async function ensureProjectFolder(
  project: Project
): Promise<WorkspaceRow> {
  if (project.workspace_id) {
    const existing = await WorkspaceRow.find(
      project.user_id,
      project.workspace_id
    );
    if (existing) return existing;
  }

  if (project.kind === PERSONAL_PROJECT_KIND) {
    // `ensureDefault` promotes a user's first workspace when none is the
    // default, and that row can belong to another project or a game. Personal
    // takes only a row in no project or already its own, and otherwise gets
    // a folder like any other project.
    const row = await WorkspaceRow.ensureDefault(project.user_id);
    const claimable =
      (row.project_id === project.id || row.project_id === LOOSE_PROJECT_ID) &&
      !(await WorkspaceRow.isUsedByGame(row.id));
    if (claimable) {
      if (row.project_id !== project.id) {
        row.project_id = project.id;
        await row.save();
      }
      await writeManifestIfAbsent(row, project);
      return claim(project, row);
    }
  }

  const candidate = await WorkspaceRow.oldestProjectFolderCandidate(
    project.user_id,
    project.id
  );
  if (candidate) {
    await writeManifestIfAbsent(candidate, project);
    return claim(project, candidate);
  }

  return createFolder(project);
}

export interface ProjectFolderMigrationReport {
  /** Projects that had no folder when the migration reached them. */
  checked: number;
  /** Projects that have a folder now. */
  assigned: number;
  /** Projects left without a folder, logged one by one. */
  failed: number;
}

/** Projects read per query by {@link migrateProjectFolders}. */
const MIGRATION_BATCH = 200;

/**
 * Give every live project of every user a folder.
 *
 * Runs at startup. Each project is one {@link ensureProjectFolder} call, so an
 * interrupted run loses nothing and the next one continues where it stopped.
 * A project whose folder cannot be created is logged and skipped.
 */
export async function migrateProjectFolders(): Promise<ProjectFolderMigrationReport> {
  const report: ProjectFolderMigrationReport = {
    checked: 0,
    assigned: 0,
    failed: 0
  };
  let after: { created_at: string; id: string } | undefined;
  for (;;) {
    const batch = await Project.listWithoutFolder(MIGRATION_BATCH, after);
    if (batch.length === 0) break;
    for (const project of batch) {
      report.checked++;
      try {
        await ensureProjectFolder(project);
        report.assigned++;
      } catch (error) {
        report.failed++;
        log.warn("Could not give a project a folder", {
          projectId: project.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    const last = batch[batch.length - 1];
    after = { created_at: last.created_at, id: last.id };
  }
  return report;
}
