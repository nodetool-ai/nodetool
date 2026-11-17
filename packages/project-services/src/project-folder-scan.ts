/**
 * Reading a project folder for a reconcile: which directories are entered,
 * what a scan and a look at one path find, and the options and the result
 * the reconciles of the folder share.
 *
 * The asset index (`project-index.ts`) and the document files
 * (`document-file-sync.ts`) both compare the folder with rows. They read the
 * folder through this module, which imports neither of them.
 *
 * A project folder can hold the folder of another project or of a game:
 * Personal's managed folder holds `projects/<id>`. Those files belong to the
 * other project, and the folder's `Workspace` reaches none of them. So
 * {@link scanFolder} never enters such a directory. {@link scanChangedPaths}
 * and every reader that follows a row to a path ask {@link NestedFolders}
 * before they look, so that such a path counts as not this folder's and no
 * refusal has to be read as a missing file.
 */
import {
  NestedFolders,
  WorkspacePathError,
  isReservedWorkspaceKey,
  type Workspace
} from "@nodetool-ai/runtime";

export { NestedFolders };

/** Directory names the scan never enters, besides every dot-directory. */
const SKIPPED_DIRECTORIES = new Set(["node_modules"]);

/** One file the scan found. `path` is relative to the project folder. */
export interface FolderFile {
  path: string;
  size: number;
  modifiedAt: number;
}

/** Whether the scan skips the directory called `name`. */
export function isSkippedDirectory(name: string): boolean {
  return name.startsWith(".") || SKIPPED_DIRECTORIES.has(name);
}

/** Whether `path` lies in a directory the scan does not enter. */
export function isInSkippedDirectory(path: string): boolean {
  return path.split("/").slice(0, -1).some(isSkippedDirectory);
}

/**
 * Whether a change at `path` can never change the index: the path lies in
 * the directory NodeTool reserves or in a directory the scan does not enter.
 */
export function isIgnoredProjectPath(path: string): boolean {
  return isReservedWorkspaceKey(path) || isInSkippedDirectory(path);
}

/**
 * Every file in the folder, by path. A local folder is read one directory at
 * a time, each listed once. `Workspace.list` leaves out `.nodetool/` and
 * symbolic links, and a directory whose real location is outside the folder
 * is refused with a `WorkspacePathError` and skipped. Any other listing
 * failure ends the scan, so a directory that could not be read never makes
 * its files look deleted.
 *
 * A folder in object storage is read with one flat listing of every key
 * below `start`. Listed one directory at a time, it would cost a request
 * for the listing and one more per directory, to ask whether that directory
 * is the folder of another project. The flat listing names the `.nodetool/`
 * keys too, which answers that question for every directory in it.
 *
 * A directory that is the folder of another project or of a game is not
 * entered, so none of its files is in the result: `Workspace.list` leaves
 * such a directory out at every depth, and refuses one as `start`.
 */
export async function scanFolder(
  workspace: Workspace,
  start = "",
  files = new Map<string, FolderFile>()
): Promise<Map<string, FolderFile>> {
  if (workspace.localDir === null) return scanFlat(workspace, start, files);
  const directories = [start];
  for (let next = directories.pop(); next !== undefined; next = directories.pop()) {
    let entries: Awaited<ReturnType<Workspace["list"]>>;
    try {
      entries = await workspace.list(next);
    } catch (error) {
      if (error instanceof WorkspacePathError) continue;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!isSkippedDirectory(entry.name)) directories.push(entry.path);
      } else {
        files.set(entry.path, {
          path: entry.path,
          size: entry.size,
          modifiedAt: entry.modifiedAt
        });
      }
    }
  }
  return files;
}

/** {@link scanFolder} for a folder in object storage. */
async function scanFlat(
  workspace: Workspace,
  start: string,
  files: Map<string, FolderFile>
): Promise<Map<string, FolderFile>> {
  let entries: Awaited<ReturnType<Workspace["list"]>>;
  try {
    entries = await workspace.list(start, { recursive: true });
  } catch (error) {
    if (error instanceof WorkspacePathError) return files;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    // The directories below `start` that a scan does not enter.
    const below = start ? entry.path.slice(start.length + 1) : entry.path;
    if (isInSkippedDirectory(below)) continue;
    files.set(entry.path, {
      path: entry.path,
      size: entry.size,
      modifiedAt: entry.modifiedAt
    });
  }
  return files;
}

/** Time a path the folder refused is given before it is looked at again. */
const REFUSED_PATH_RETRY_MS = 50;

/**
 * What is at `path` now: a file, a directory, or nothing. A path the folder
 * refuses counts as nothing. It is asked twice, because a path inside a
 * directory that is being created at that moment can be refused once.
 */
export async function probePath(
  workspace: Workspace,
  path: string
): Promise<FolderFile | "directory" | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const info = await workspace.stat(path);
      if (!info) return null;
      return info.isDirectory
        ? "directory"
        : { path, size: info.size, modifiedAt: info.modifiedAt };
    } catch (error) {
      if (!(error instanceof WorkspacePathError) || attempt > 0) return null;
      await new Promise((resolve) => setTimeout(resolve, REFUSED_PATH_RETRY_MS));
    }
  }
}

/** What {@link scanChangedPaths} found at the changed paths. */
export interface ChangedPaths {
  /** Files that are there, by path. */
  files: Map<string, FolderFile>;
  /**
   * The changed paths that are not a file: what was at or below them is
   * gone, or they are directories.
   */
  places: Set<string>;
}

/**
 * The changed paths only. A path that is a file now is in `files`. A path
 * that is a directory now stands for every file below it, since a directory
 * that was renamed or moved in reports itself and not its files. A path with
 * nothing at it is in `places`, and stands for the rows at and below it. No
 * other directory is listed and no other file is looked at.
 *
 * A path is left out when it is outside the folder, in the directory NodeTool
 * reserves, in a directory the scan does not enter, or in the folder of
 * another project.
 */
export async function scanChangedPaths(
  workspace: Workspace,
  paths: Iterable<string>
): Promise<ChangedPaths> {
  const files = new Map<string, FolderFile>();
  const places = new Set<string>();
  const nested = new NestedFolders(workspace);
  for (const raw of new Set(paths)) {
    let path: string;
    try {
      path = workspace.key(raw);
    } catch {
      // Outside the folder, or in the directory NodeTool reserves.
      continue;
    }
    if (isInSkippedDirectory(path)) continue;
    if (await nested.covers(path)) continue;
    const found = await probePath(workspace, path);
    if (found === null) {
      places.add(path);
    } else if (found === "directory") {
      if (isSkippedDirectory(path.slice(path.lastIndexOf("/") + 1))) continue;
      places.add(path);
      await scanFolder(workspace, path, files);
    } else {
      files.set(path, found);
    }
  }
  return { files, places };
}

/** Whether `path` or one of the directories above it is in `directories`. */
export function isAtOrUnder(path: string, directories: ReadonlySet<string>): boolean {
  if (directories.has(path)) return true;
  for (let slash = path.lastIndexOf("/"); slash > 0; ) {
    const parent = path.slice(0, slash);
    if (directories.has(parent)) return true;
    slash = parent.lastIndexOf("/");
  }
  return false;
}

/** What limits a reconcile of a project folder. */
export interface ReconcileOptions {
  /**
   * Project-relative paths that changed. The reconcile then looks at these
   * paths only: it lists no directory but a changed one and marks no row
   * offline whose file is not at or below one of them. A row that is already
   * offline is still pointed at a changed file that has its content. Without
   * it the whole folder is scanned.
   */
  paths?: Iterable<string>;
}

/**
 * What a reconcile found in the folder. The document files are compared with
 * it afterwards, so the folder is listed once for both.
 */
export interface ScannedFolder {
  /** Files that were there, by path. */
  files: ReadonlyMap<string, FolderFile>;
  /**
   * The changed paths that are not a file: what was at or below them is
   * gone, or they are directories. Null when the whole folder was scanned.
   */
  places: ReadonlySet<string> | null;
  /**
   * The folder as the reconcile read it. Whatever compares the folder with
   * rows in the same pass reads it through this one, so what it learned
   * about the folders of other projects inside is not asked again.
   */
  workspace?: Workspace;
}

/**
 * How long a media file with the content of an indexed file waits for its
 * row, in ms. A move seen half done finishes within this time, and the row of
 * the file that moved then follows it.
 */
export const COPY_GRACE_MS = 10_000;
