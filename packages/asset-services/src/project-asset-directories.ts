/**
 * The directories of a project folder, as the asset browser's folders
 * (project folders PRD T3, T8).
 *
 * Within a project, a folder of the asset browser is a directory of the
 * project folder. It has no row. Its id comes from `projectDirectoryId` in
 * `@nodetool-ai/protocol`, and the project root is the user's home folder.
 *
 * The directories of a project are the ones on disk plus the ones its rows
 * place assets in. An asset with a file sits in the directory of its
 * `workspace_path`. An asset with no file in the folder yet sits under the
 * path of its `parent_id` chain, through legacy folder rows or a directory id,
 * until its bytes move into the folder.
 *
 * New folder rows are not created inside a project: creating a folder makes
 * a directory, and renaming one renames the directory and rewrites the path
 * of every row under it in one statement.
 */
import { createLogger } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import {
  ProjectDirectoryResolver,
  directoryFolderId,
  directoryName,
  folderNameAsDirectory,
  isWithinDirectory,
  joinDirectory,
  parentDirectory,
  withAncestorDirectories,
  type LegacyFolder
} from "@nodetool-ai/protocol";
import { WorkspacePathError, type Workspace } from "@nodetool-ai/runtime";
import {
  ProjectFolderUnavailableError,
  requireProjectFolder
} from "./project-asset-file.js";
import { withProjectFolderLock } from "./project-asset.js";

const log = createLogger("nodetool.asset-services.project-directories");

/** Directory names the asset browser never shows, besides dot-directories. */
const HIDDEN_DIRECTORIES = new Set(["node_modules"]);

/** Thrown when a folder operation names a directory it cannot use. */
export class ProjectDirectoryError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ProjectDirectoryError";
  }
}

/** One directory the asset browser shows. */
export interface ProjectDirectory {
  /** Project-relative path. Never "" (the root is the home folder). */
  path: string;
  /** Modification time in ms when the directory is on disk, else null. */
  modifiedAt: number | null;
}

/** The rows and directories of a project, read once per request. */
export interface ProjectDirectoryIndex {
  projectId: string;
  /** The project folder, or null when it cannot be reached. */
  workspace: Workspace | null;
  resolver: ProjectDirectoryResolver;
  /** Every row of the project that is not a folder. */
  assets: Asset[];
  /** Legacy folder rows of the project, with the path each stands for. */
  folders: { row: Asset; path: string }[];
}

function isHiddenDirectory(name: string): boolean {
  return name.startsWith(".") || HIDDEN_DIRECTORIES.has(name);
}

/** The folder of a project, or null when it cannot be reached. */
async function reachableFolder(
  userId: string,
  projectId: string
): Promise<Workspace | null> {
  try {
    return (await requireProjectFolder(projectId, userId)).workspace;
  } catch (error) {
    if (error instanceof ProjectFolderUnavailableError) return null;
    throw error;
  }
}

/**
 * Read the rows of a project and resolve its folder. An unreachable folder
 * leaves `workspace` null, so the browser still shows what the rows say.
 */
export async function loadProjectDirectoryIndex(
  userId: string,
  projectId: string
): Promise<ProjectDirectoryIndex> {
  const [rows, allFolders, workspace] = await Promise.all([
    Asset.listByProject(userId, projectId),
    Asset.listFolders(userId),
    reachableFolder(userId, projectId)
  ]);
  const byId = new Map<string, LegacyFolder>(
    allFolders.map((folder) => [folder.id, folder])
  );
  const resolver = new ProjectDirectoryResolver(projectId, byId);
  const assets: Asset[] = [];
  const folders: { row: Asset; path: string }[] = [];
  for (const row of rows) {
    if (row.content_type === "folder") {
      folders.push({ row, path: resolver.pathOfFolder(row) });
    } else {
      assets.push(row);
    }
  }
  return { projectId, workspace, resolver, assets, folders };
}

/**
 * Subdirectories of `path` on disk. Hidden ones are left out, and so is the
 * folder of another project inside this one: its directories are that
 * project's. Empty when unreachable.
 */
async function diskSubdirectories(
  workspace: Workspace | null,
  path: string
): Promise<ProjectDirectory[]> {
  if (!workspace) return [];
  try {
    const directories: ProjectDirectory[] = [];
    for (const entry of await workspace.list(path)) {
      if (!entry.isDirectory || isHiddenDirectory(entry.name)) continue;
      if (await workspace.isNestedFolder(entry.path)) continue;
      directories.push({ path: entry.path, modifiedAt: entry.modifiedAt });
    }
    return directories;
  } catch (error) {
    if (!(error instanceof WorkspacePathError)) {
      log.debug("Could not list a project directory", {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return [];
  }
}

/** Every directory on disk under the folder root, each listed once. */
async function allDiskDirectories(
  workspace: Workspace | null
): Promise<ProjectDirectory[]> {
  const found: ProjectDirectory[] = [];
  const pending = [""];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const dir of await diskSubdirectories(workspace, next)) {
      found.push(dir);
      pending.push(dir.path);
    }
  }
  return found;
}

/** The directories the rows of `index` name, with every ancestor. */
function rowDirectories(index: ProjectDirectoryIndex): string[] {
  const paths: string[] = index.folders.map((folder) => folder.path);
  for (const asset of index.assets) {
    paths.push(index.resolver.directoryOf(asset));
  }
  return withAncestorDirectories(paths);
}

/** Merge directories from disk and from rows, one entry per path, sorted. */
function mergeDirectories(
  disk: readonly ProjectDirectory[],
  fromRows: readonly string[]
): ProjectDirectory[] {
  const byPath = new Map<string, ProjectDirectory>();
  for (const path of fromRows) byPath.set(path, { path, modifiedAt: null });
  for (const dir of disk) byPath.set(dir.path, dir);
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Every directory of the project: on disk, or named by a row. */
export async function listProjectDirectories(
  index: ProjectDirectoryIndex
): Promise<ProjectDirectory[]> {
  const disk = await allDiskDirectories(index.workspace);
  return mergeDirectories(disk, rowDirectories(index));
}

/** What one directory holds: its assets and its direct subdirectories. */
export interface ProjectDirectoryContents {
  assets: Asset[];
  directories: ProjectDirectory[];
}

/** The assets in `path` and its direct subdirectories. */
export async function listProjectDirectory(
  index: ProjectDirectoryIndex,
  path: string
): Promise<ProjectDirectoryContents> {
  const assets = index.assets.filter(
    (asset) => index.resolver.directoryOf(asset) === path
  );
  const fromRows = rowDirectories(index).filter(
    (dir) => parentDirectory(dir) === path
  );
  const disk = await diskSubdirectories(index.workspace, path);
  return { assets, directories: mergeDirectories(disk, fromRows) };
}

/** Every asset under `path`, at any depth, and every directory below it. */
export async function listProjectDirectoryTree(
  index: ProjectDirectoryIndex,
  path: string
): Promise<ProjectDirectoryContents> {
  const assets = index.assets.filter((asset) =>
    isWithinDirectory(index.resolver.directoryOf(asset), path)
  );
  const directories = (await listProjectDirectories(index)).filter(
    (dir) => dir.path !== path && isWithinDirectory(dir.path, path)
  );
  return { assets, directories };
}

/** Whether `path` is a directory of the project, on disk or named by a row. */
async function directoryExists(
  index: ProjectDirectoryIndex,
  path: string
): Promise<boolean> {
  if (rowDirectories(index).includes(path)) return true;
  if (!index.workspace) return false;
  try {
    return (await index.workspace.stat(path)) !== null;
  } catch {
    return false;
  }
}

/** The folder of the project, or the reason it cannot be used. */
function requireWorkspace(index: ProjectDirectoryIndex): Workspace {
  if (!index.workspace) {
    throw new ProjectFolderUnavailableError(
      "The project folder cannot be reached"
    );
  }
  return index.workspace;
}

/**
 * The project-relative path of a folder named `name` in `parent`. Throws
 * {@link ProjectDirectoryError} for a name that cannot be a directory there.
 */
function childPath(workspace: Workspace, parent: string, name: string): string {
  const segment = folderNameAsDirectory(name);
  if (isHiddenDirectory(segment)) {
    throw new ProjectDirectoryError(
      `"${segment}" is a hidden name. Folder names cannot start with a dot.`
    );
  }
  try {
    return workspace.key(joinDirectory(parent, segment));
  } catch {
    throw new ProjectDirectoryError(`"${name}" cannot be a folder name here`);
  }
}

/**
 * Make the directory `name` inside `parent` and return its path. A name in
 * use is refused rather than suffixed: the user named the folder.
 */
export async function createProjectDirectory(
  userId: string,
  projectId: string,
  parent: string,
  name: string
): Promise<string> {
  const index = await loadProjectDirectoryIndex(userId, projectId);
  const workspace = requireWorkspace(index);
  const path = childPath(workspace, parent, name);
  return withProjectFolderLock(userId, projectId, async () => {
    if (await directoryExists(index, path)) {
      throw new ProjectDirectoryError(
        `A folder or file named "${directoryName(path)}" already exists here`
      );
    }
    await workspace.mkdir(path);
    log.info("project directory created", { projectId, path });
    return path;
  });
}

/** What a directory rename or move changed. */
export interface ProjectDirectoryMove {
  from: string;
  to: string;
  /** Rows whose file moved with the directory. */
  files: number;
  /** Rows with no file in the folder yet that were refiled under `to`. */
  legacy: number;
}

/**
 * Rename or move the directory `from` to `to`, both project-relative, and
 * rewrite every row under it. The directory moves in one step on disk where
 * the folder allows it, and the rows that keep a file there are rewritten in
 * one statement, so the cost does not grow with a request per asset.
 *
 * Rows with no file in the folder yet are refiled under `to` through
 * directory ids, so they keep their place until their bytes move.
 *
 * Throws {@link ProjectDirectoryError} when `to` exists or lies inside
 * `from`, and `ProjectFolderUnavailableError` when the folder cannot be
 * reached. When the rows cannot be rewritten, the directory moves back.
 */
export async function moveProjectDirectory(
  userId: string,
  projectId: string,
  from: string,
  to: string
): Promise<ProjectDirectoryMove> {
  const index = await loadProjectDirectoryIndex(userId, projectId);
  const workspace = requireWorkspace(index);
  let target: string;
  try {
    target = workspace.key(to);
  } catch {
    throw new ProjectDirectoryError(`"${to}" cannot be a folder here`);
  }
  if (!from) throw new ProjectDirectoryError("The project folder cannot move");
  if (target === from) {
    return { from, to: target, files: 0, legacy: 0 };
  }
  if (isWithinDirectory(target, from)) {
    throw new ProjectDirectoryError("A folder cannot move into itself");
  }
  if (isHiddenDirectory(directoryName(target))) {
    throw new ProjectDirectoryError(
      `"${directoryName(target)}" is a hidden name. Folder names cannot start with a dot.`
    );
  }

  return withProjectFolderLock(userId, projectId, async () => {
    const caseOnly = target.toLowerCase() === from.toLowerCase();
    if (!caseOnly && (await directoryExists(index, target))) {
      throw new ProjectDirectoryError(
        `A folder or file named "${directoryName(target)}" already exists there`
      );
    }
    const onDisk = (await workspace.stat(from))?.isDirectory === true;
    if (onDisk) await workspace.move(from, target);

    let files: number;
    try {
      files = await Asset.moveWorkspaceDirectory(userId, projectId, from, target);
    } catch (error) {
      if (onDisk) await moveBack(workspace, target, from);
      throw error;
    }

    const legacy = await refileLegacyRows(index, from, target);
    log.info("project directory moved", {
      projectId,
      from,
      to: target,
      files,
      legacy
    });
    return { from, to: target, files, legacy };
  });
}

/** Undo a directory move whose rows could not be rewritten. Never throws. */
async function moveBack(
  workspace: Workspace,
  moved: string,
  original: string
): Promise<void> {
  try {
    await workspace.move(moved, original);
  } catch (error) {
    log.error("Could not move a directory back after its rows failed", {
      from: original,
      to: moved,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** `path` with its leading `from` replaced by `to`. */
function remap(path: string, from: string, to: string): string {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

/**
 * Point the rows under `from` that keep no file in the folder at the same
 * place under `to`. A legacy folder row at or below `from` takes the new
 * name and is filed by directory id, and so is every asset row inside one.
 */
async function refileLegacyRows(
  index: ProjectDirectoryIndex,
  from: string,
  to: string
): Promise<number> {
  const { resolver, projectId } = index;
  const changes: { row: Asset; parent: string; name?: string }[] = [];
  for (const { row, path } of index.folders) {
    if (!isWithinDirectory(path, from)) continue;
    const moved = remap(path, from, to);
    changes.push({
      row,
      parent: parentDirectory(moved),
      name: directoryName(moved)
    });
  }
  for (const row of index.assets) {
    if (row.workspace_path) continue;
    const dir = resolver.directoryOfParent(row.parent_id);
    if (!isWithinDirectory(dir, from)) continue;
    changes.push({ row, parent: remap(dir, from, to) });
  }
  for (const { row, parent, name } of changes) {
    row.parent_id = directoryFolderId(row.user_id, projectId, parent);
    if (name !== undefined) row.name = name;
    await row.save();
  }
  return changes.length;
}

/**
 * Remove the directory `path` when nothing is left in it. A directory that
 * still holds files the asset browser does not index stays, with them.
 * Returns whether it was removed.
 */
export async function removeEmptyProjectDirectory(
  userId: string,
  projectId: string,
  path: string
): Promise<boolean> {
  if (!path) return false;
  const { workspace } = await requireProjectFolder(projectId, userId);
  return withProjectFolderLock(userId, projectId, async () => {
    const info = await workspace.stat(path);
    if (!info?.isDirectory) return false;
    const left = await workspace.list(path, { recursive: true });
    if (left.some((entry) => !entry.isDirectory)) return false;
    await workspace.deleteAll(path);
    return true;
  });
}
