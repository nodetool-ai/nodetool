/**
 * Open an existing local folder as a project, and point a project at the new
 * place of a folder that moved. See docs/project-folders/prd.md (D1, T1, US2,
 * US11).
 *
 * Both take a host path from the caller, so both are local-only: refused when
 * `NODETOOL_ENV=production`, validated by `resolveLocalPath`, and compared by
 * real path with every project folder of the user, so a symlink cannot place
 * one project's folder inside another's. Opening a folder writes nothing into
 * it except `.nodetool/project.json` when that file is absent.
 */

import { constants, existsSync } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
  ProjectFolderError,
  isLocalDeployment,
  readProjectManifest,
  removeProjectManifest,
  writeProjectManifest,
  type ProjectManifest
} from "@nodetool-ai/execution/service";
import { Project, Workspace as WorkspaceRow } from "@nodetool-ai/models";
import { createProjectInput } from "@nodetool-ai/protocol/api-schemas/projects.js";
import { localPathDenialMessage, resolveLocalPath } from "./local-file-access.js";

export type ProjectFolderOpenErrorCode =
  | "forbidden"
  | "invalid"
  | "conflict"
  | "not_found";

/** A refusal whose message is safe to show the local caller. */
export class ProjectFolderOpenError extends Error {
  override name = "ProjectFolderOpenError";

  constructor(
    readonly code: ProjectFolderOpenErrorCode,
    message: string
  ) {
    super(message);
  }
}

/** Longest project name the API accepts. */
const MAX_PROJECT_NAME = 200;

/** Name used when a folder has no name to give its project. */
const UNTITLED_PROJECT = "Untitled project";

/**
 * The real path of a folder the caller chose: allowed by `resolveLocalPath`,
 * an existing directory, and writable, since the manifest is written into it.
 */
async function resolveFolder(path: string): Promise<string> {
  if (!isLocalDeployment()) {
    throw new ProjectFolderOpenError(
      "forbidden",
      "Opening a folder as a project is disabled on this server"
    );
  }
  const allowed = await resolveLocalPath(path);
  if (!allowed.ok) {
    throw new ProjectFolderOpenError(
      "invalid",
      localPathDenialMessage(allowed.reason)
    );
  }
  let real: string;
  try {
    real = await realpath(allowed.path);
  } catch {
    throw new ProjectFolderOpenError("invalid", "Folder not found");
  }
  if (!(await stat(real)).isDirectory()) {
    throw new ProjectFolderOpenError("invalid", "This path is not a folder");
  }
  try {
    await access(real, constants.W_OK);
  } catch {
    throw new ProjectFolderOpenError("invalid", "This folder is not writable");
  }
  return real;
}

/** True when `child` is `parent` or inside it. */
function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** A folder row's real path, or its resolved path when it does not exist. */
async function realFolderPath(row: WorkspaceRow): Promise<string> {
  try {
    return await realpath(row.path);
  } catch {
    return resolve(row.path);
  }
}

/**
 * Refuse a folder that is, contains, or sits inside the folder of another
 * project of the user. `exceptProjectId` is the project being pointed at the
 * folder, whose own recorded folder does not count.
 */
async function refuseOverlap(
  userId: string,
  folder: string,
  exceptProjectId?: string
): Promise<void> {
  for (const project of await Project.listWithFolder(userId)) {
    if (project.id === exceptProjectId || !project.workspace_id) continue;
    const row = await WorkspaceRow.find(userId, project.workspace_id);
    if (!row || row.isVirtual()) continue;
    const other = await realFolderPath(row);
    let relation: string | null = null;
    if (folder === other) relation = "is already the folder of";
    else if (isWithin(folder, other)) relation = "is inside the folder of";
    else if (isWithin(other, folder)) relation = "contains the folder of";
    if (relation) {
      throw new ProjectFolderOpenError(
        "conflict",
        `This folder ${relation} project "${project.name}"`
      );
    }
  }
}

/** An unsaved row over `folder`, to read and write its reserved directory. */
function rowFor(userId: string, folder: string): WorkspaceRow {
  return new WorkspaceRow({ user_id: userId, path: folder });
}

async function readManifest(
  userId: string,
  folder: string
): Promise<ProjectManifest | null> {
  try {
    return await readProjectManifest(rowFor(userId, folder));
  } catch (error) {
    if (error instanceof ProjectFolderError) {
      throw new ProjectFolderOpenError("invalid", error.message);
    }
    throw error;
  }
}

/** True when the folder a row records is still there. */
function folderExists(row: WorkspaceRow): boolean {
  return row.isVirtual() || existsSync(row.path);
}

function projectName(name: string | undefined, folder: string): string {
  const chosen = name?.trim() || basename(folder).trim() || UNTITLED_PROJECT;
  return Array.from(chosen).slice(0, MAX_PROJECT_NAME).join("");
}

/**
 * Create a project over `folder` with an adopted folder row. The manifest is
 * written when the folder has none. A failure removes the rows and the
 * manifest it wrote again.
 */
async function adopt(
  userId: string,
  folder: string,
  fields: { id?: string; name: string; hasManifest: boolean }
): Promise<Project> {
  const project = await Project.insertNew({
    id: fields.id,
    user_id: userId,
    name: fields.name,
    kind: ""
  });
  if (!project) {
    throw new ProjectFolderOpenError(
      "conflict",
      "A project with this folder's id already exists"
    );
  }
  let row: WorkspaceRow | null = null;
  let wroteManifest = false;
  try {
    row = (await WorkspaceRow.create({
      user_id: userId,
      project_id: project.id,
      name: project.name,
      path: folder,
      origin: "adopted",
      is_default: false
    })) as WorkspaceRow;
    if (!fields.hasManifest) {
      await writeProjectManifest(row, project);
      wroteManifest = true;
    }
    await Project.claimWorkspace(userId, project.id, row.id);
    project.workspace_id = row.id;
    return project;
  } catch (error) {
    if (row && wroteManifest) {
      await removeProjectManifest(row).catch(() => undefined);
    }
    await row?.delete();
    await project.delete();
    throw error;
  }
}

/**
 * Make `folder` the project's folder: repoint its folder row, or give it an
 * adopted row when it has none.
 */
async function pointAt(project: Project, folder: string): Promise<Project> {
  const row = project.workspace_id
    ? await WorkspaceRow.find(project.user_id, project.workspace_id)
    : null;
  if (row) {
    row.path = folder;
    await row.save();
    return project;
  }
  const created = (await WorkspaceRow.create({
    user_id: project.user_id,
    project_id: project.id,
    name: project.name,
    path: folder,
    origin: "adopted",
    is_default: false
  })) as WorkspaceRow;
  const winner = await Project.claimWorkspace(
    project.user_id,
    project.id,
    created.id,
    project.workspace_id
  );
  if (winner !== created.id) {
    await created.delete();
    throw new ProjectFolderOpenError(
      "conflict",
      "The project's folder changed while it was being located"
    );
  }
  project.workspace_id = created.id;
  return project;
}

/**
 * Open `path` as a project.
 *
 * - A folder without `.nodetool/project.json` becomes a new project, and the
 *   manifest is written.
 * - A manifest whose id is unknown on this install creates the project under
 *   that id.
 * - A manifest naming a project of the user whose recorded folder is gone
 *   relocates that project here.
 * - A manifest naming a project whose recorded folder still exists is refused
 *   as a copy of that project.
 */
export async function openProjectFolder(
  userId: string,
  input: { path: string; name?: string }
): Promise<Project> {
  const folder = await resolveFolder(input.path);
  const manifest = await readManifest(userId, folder);

  if (!manifest) {
    await refuseOverlap(userId, folder);
    return adopt(userId, folder, {
      name: projectName(input.name, folder),
      hasManifest: false
    });
  }

  const id = createProjectInput.shape.id.safeParse(manifest.id);
  if (!id.success || !id.data) {
    throw new ProjectFolderOpenError(
      "invalid",
      "The folder's project file names an invalid project id"
    );
  }

  // `get` reads tombstoned rows too: their id is still taken.
  const existing = await Project.get<Project>(id.data);
  if (!existing) {
    await refuseOverlap(userId, folder);
    return adopt(userId, folder, {
      id: id.data,
      name: projectName(input.name ?? manifest.name, folder),
      hasManifest: true
    });
  }
  if (existing.user_id !== userId || existing.deleted_at) {
    throw new ProjectFolderOpenError(
      "conflict",
      "This folder belongs to a project that cannot be opened here"
    );
  }

  const recorded = existing.workspace_id
    ? await WorkspaceRow.find(userId, existing.workspace_id)
    : null;
  if (recorded && folderExists(recorded)) {
    await refuseOverlap(userId, folder);
    throw new ProjectFolderOpenError(
      "conflict",
      `This folder is a copy of project "${existing.name}"`
    );
  }
  await refuseOverlap(userId, folder, existing.id);
  return pointAt(existing, folder);
}

/**
 * Point the project at `path`, the new place of its folder. A folder whose
 * manifest names a different project is refused. A folder without one gets
 * the project's manifest.
 */
export async function relocateProjectFolder(
  userId: string,
  input: { project_id: string; path: string }
): Promise<Project> {
  const folder = await resolveFolder(input.path);
  const project = await Project.findOwned(userId, input.project_id);
  if (!project) throw new ProjectFolderOpenError("not_found", "Project not found");

  const manifest = await readManifest(userId, folder);
  if (manifest && manifest.id !== project.id) {
    const other = await Project.findOwned(userId, manifest.id);
    throw new ProjectFolderOpenError(
      "conflict",
      other
        ? `This folder belongs to project "${other.name}"`
        : "This folder belongs to another project"
    );
  }
  await refuseOverlap(userId, folder, project.id);
  await pointAt(project, folder);
  if (!manifest) {
    await writeProjectManifest(rowFor(userId, folder), project);
  }
  return project;
}
