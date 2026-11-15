/**
 * Project folders: every project has exactly one folder, named by
 * `projects.workspace_id`.
 *
 * A local project folder is a directory under the `PROJECTS_DIR` setting. A
 * cloud one is a key prefix in the deployment's object storage, with the
 * managed key shape native games use, and never the same key as a game's.
 * `.nodetool/project.json` inside the folder names the project it belongs to.
 * See docs/project-folders/prd.md (T1 and T9).
 */

import { access, mkdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
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
  Setting,
  Workspace as WorkspaceRow,
  setPersonalFolderProvider,
  type WorkspaceOrigin
} from "@nodetool-ai/models";
import {
  RESERVED_WORKSPACE_DIR,
  setProjectFolderResolver,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  nodetoolDirFromRow,
  resolveProjectWorkspace
} from "./workflow-workspace.js";

const log = createLogger("nodetool.execution.project-folder");

/** The manifest's file name inside the folder's reserved directory. */
const PROJECT_MANIFEST_FILE = "project.json";

/** Where the manifest that identifies a project folder lives in it. */
export const PROJECT_MANIFEST_PATH = `${RESERVED_WORKSPACE_DIR}/${PROJECT_MANIFEST_FILE}`;

/** The contents of `.nodetool/project.json`. */
export interface ProjectManifest {
  format: "nodetool.project";
  version: 1;
  id: string;
  name: string;
}

/** The text of `.nodetool/project.json`, parsed and checked. */
const projectManifestText = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text) as object;
    } catch {
      ctx.addIssue({ code: "custom", message: "Not JSON" });
      return z.NEVER;
    }
  })
  .pipe(
    z.object({
      format: z.literal("nodetool.project"),
      version: z.literal(1),
      id: z.string().trim().min(1),
      name: z.string()
    })
  );

/** What the project API reports about a project's folder. */
export interface ProjectFolderInfo {
  /** The workspace row clients list and read the folder's files through. */
  workspace_id: string;
  /**
   * The absolute directory, or null for a folder in object storage and for
   * every folder on a production deployment, whose callers are not local.
   */
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

/** The setting that names the directory new local project folders go in. */
export const PROJECTS_DIR_SETTING = "PROJECTS_DIR";

/**
 * True when the people calling this server run it themselves, so a host path
 * is theirs to see and choose. A production deployment serves other people:
 * the workspace router refuses folder management there for the same reason.
 */
export function isLocalDeployment(): boolean {
  return process.env["NODETOOL_ENV"] !== "production";
}

/** A project folder could not be made, for a reason safe to show any caller. */
export class ProjectFolderError extends Error {
  override name = "ProjectFolderError";
}

/** What the project API reports about a workspace row that is a folder. */
export function describeProjectFolder(row: WorkspaceRow): ProjectFolderInfo {
  return {
    workspace_id: row.id,
    path: row.isVirtual() || !isLocalDeployment() ? null : row.path,
    origin: row.origin,
    is_accessible: row.isAccessible()
  };
}

/**
 * The folder's reserved directory. Run code cannot reach the manifest through
 * the folder's own workspace, so NodeTool writes it through this one.
 */
function requireNodetoolDir(row: WorkspaceRow): Workspace {
  const workspace = nodetoolDirFromRow(row);
  if (!workspace) {
    throw new Error("Project folder storage is not configured");
  }
  return workspace;
}

async function writeManifest(
  nodetoolDir: Workspace,
  project: Project
): Promise<void> {
  await nodetoolDir.write(
    PROJECT_MANIFEST_FILE,
    `${JSON.stringify(projectManifest(project), null, 2)}\n`,
    "application/json"
  );
}

/** Write the folder's `.nodetool/project.json` for `project`. */
export async function writeProjectManifest(
  row: WorkspaceRow,
  project: Project
): Promise<void> {
  await writeManifest(requireNodetoolDir(row), project);
}

/** Remove the folder's `.nodetool/project.json`, when it is there. */
export async function removeProjectManifest(row: WorkspaceRow): Promise<void> {
  await requireNodetoolDir(row).delete(PROJECT_MANIFEST_FILE);
}

/**
 * The manifest a folder carries, or null when it has none.
 *
 * Throws {@link ProjectFolderError} when the file is there but is not a
 * project manifest, so a caller never overwrites a file it cannot read.
 */
export async function readProjectManifest(
  row: WorkspaceRow
): Promise<ProjectManifest | null> {
  const text = await requireNodetoolDir(row).readText(PROJECT_MANIFEST_FILE);
  if (text === null) return null;
  const manifest = projectManifestText.safeParse(text);
  if (!manifest.success) {
    throw new ProjectFolderError(
      `The folder's ${PROJECT_MANIFEST_PATH} is not a NodeTool project file`
    );
  }
  return manifest.data;
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
    const nodetoolDir = requireNodetoolDir(row);
    if (await nodetoolDir.exists(PROJECT_MANIFEST_FILE)) return;
    await writeManifest(nodetoolDir, project);
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
  throw new ProjectFolderError(`No free folder name for "${name}"`);
}

/**
 * The directory new local project folders go in, checked the way the
 * workspace router checks a folder a user adds: absolute, a directory, and
 * writable.
 *
 * A user's `PROJECTS_DIR` setting is honoured only on a local deployment. On a
 * production server it would let any user have the server create folders
 * wherever its process may write, so there the operator's environment variable
 * or the default applies. A directory the user named must already exist. The
 * operator's directory or the default is created when missing.
 */
async function projectsParent(userId: string): Promise<string> {
  const configured =
    (await Setting.find(userId, PROJECTS_DIR_SETTING))?.value.trim() || null;
  const stored = isLocalDeployment() ? configured : null;
  if (configured && !stored) {
    log.warn("Ignoring a user's PROJECTS_DIR setting on a production server", {
      userId
    });
  }
  const parent = getProjectsDir(stored);
  if (!isAbsolute(parent)) {
    throw new ProjectFolderError("The projects folder must be an absolute path");
  }
  let info = await stat(parent).catch(() => null);
  if (!info && !stored) {
    await mkdir(parent, { recursive: true });
    info = await stat(parent).catch(() => null);
  }
  if (!info) {
    throw new ProjectFolderError("The projects folder does not exist");
  }
  if (!info.isDirectory()) {
    throw new ProjectFolderError("The projects folder is not a directory");
  }
  try {
    await access(parent, constants.W_OK);
  } catch {
    throw new ProjectFolderError("The projects folder is not writable");
  }
  return parent;
}

/** Create a new folder for the project and record it. */
async function createFolder(project: Project): Promise<WorkspaceRow> {
  let path: string;
  let createdDir: string | null = null;
  if (workspaceStorageKind() === "cloud") {
    const managed = managedWorkspaceKey(project.user_id);
    path = await WorkspaceRow.freeManagedProjectPath(
      project.id,
      (segment) => `${managed}/projects/${segment}`
    );
  } else {
    path = await claimLocalFolder(
      await projectsParent(project.user_id),
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
    await writeManifest(requireNodetoolDir(row), project);
    const folder = await claim(project, row);
    if (folder.id !== row.id) {
      // A concurrent caller recorded its folder first. Two cloud callers that
      // raced picked the same free key, so only a local directory of our own
      // is removed.
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
 *   No files move. Otherwise Personal gets a new folder and the row is left as
 *   it is.
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
    // takes only a row in no project or already its own that no game uses,
    // and otherwise gets a new folder, leaving the game's workspace alone.
    const row = await WorkspaceRow.ensureDefault(project.user_id);
    const claimable =
      (row.project_id === project.id || row.project_id === LOOSE_PROJECT_ID) &&
      !(await WorkspaceRow.isUsedByGame(row.id));
    if (!claimable) return createFolder(project);
    if (row.project_id !== project.id) {
      row.project_id = project.id;
      await row.save();
    }
    await writeManifestIfAbsent(row, project);
    return claim(project, row);
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

/**
 * The user's Personal project, with its folder.
 *
 * Host setup, not run resolution: the CLI calls it before a run that has no
 * stored record, the way the server gives Personal its folder when projects
 * are first listed. The run then resolves the folder like any other.
 */
export async function ensurePersonalProject(userId: string): Promise<Project> {
  const personal = await Project.ensurePersonal(userId);
  await ensureProjectFolder(personal);
  return personal;
}

// A Personal project gets its folder when `Project.ensurePersonal` creates it,
// wherever that happens first, so every host that loads project folders installs
// this. `ensureProjectFolder` reads the project row it was handed, never
// `ensurePersonal`, so the call cannot recurse.
setPersonalFolderProvider(async (project) => {
  await ensureProjectFolder(project);
});

// Asset services read and write asset files in project folders. They sit
// below this package, so they reach folders through the resolver installed
// here. It is installed next to the Personal folder provider on purpose: a
// run with no project resolves to Personal, and that resolves only once
// Personal has been given its folder.
setProjectFolderResolver(resolveProjectWorkspace);

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
