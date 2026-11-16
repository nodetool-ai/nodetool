/**
 * Reading a project folder for a reconcile: which directories are entered,
 * what a scan and a look at one path find, and the options and the result
 * the reconciles of the folder share.
 *
 * The asset index (`project-index.ts`) and the document files
 * (`document-file-sync.ts`) both compare the folder with rows. They read the
 * folder through this module, which imports neither of them.
 */
import {
  WorkspacePathError,
  isReservedWorkspaceKey,
  type Workspace
} from "@nodetool-ai/runtime";

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
 * Every file in the folder, by path. Each directory is listed once.
 * `Workspace.list` leaves out `.nodetool/` and symbolic links, and a
 * directory whose real location is outside the folder is refused with a
 * `WorkspacePathError` and skipped. Any other listing failure ends the scan,
 * so a directory that could not be read never makes its files look deleted.
 */
export async function scanFolder(
  workspace: Workspace,
  start = "",
  files = new Map<string, FolderFile>()
): Promise<Map<string, FolderFile>> {
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
}

/**
 * How long a media file with the content of an indexed file waits for its
 * row, in ms. A move seen half done finishes within this time, and the row of
 * the file that moved then follows it.
 */
export const COPY_GRACE_MS = 10_000;
