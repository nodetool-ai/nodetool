/**
 * Moves a deleted project's folder out of the way without destroying it.
 *
 * The server is a plain Node process with no desktop shell binding, so it
 * reaches the OS trash by the platform's own layout: the FreeDesktop home
 * trash on Linux and `~/.Trash` on macOS. Both are a rename on one volume.
 * Windows has no Recycle Bin a process can reach without the shell, and the
 * shell deletes a folder outright when the bin cannot hold it, so there the
 * folder always goes to the fallback.
 *
 * The fallback is `<projects dir>/.trash/<name>-<timestamp>`. A project
 * folder name never starts with a dot, so `.trash` cannot collide with one.
 *
 * Nothing here copies or deletes. A folder that cannot be renamed into either
 * place stays where it is.
 */
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** Where a folder went: the OS trash, or the projects directory's own. */
export interface TrashedFolder {
  kind: "os_trash" | "projects_trash";
  /** The folder's new absolute path. */
  location: string;
}

/** Most names tried for one folder before giving up on a trash directory. */
const MAX_NAME_ATTEMPTS = 1000;

/** The directory inside the projects directory that holds deleted folders. */
export const PROJECTS_TRASH_DIR = ".trash";

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local time as `YYYY-MM-DDThh:mm:ss`, the form a `.trashinfo` file takes. */
function trashInfoDate(now: Date): string {
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/** Local time as `YYYYMMDD-hhmmss`, for a fallback trash folder name. */
function folderTimestamp(now: Date): string {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/**
 * The FreeDesktop home trash: reserve a name by creating its `.trashinfo`
 * exclusively, then rename the folder under that name.
 */
async function moveToXdgTrash(path: string, now: Date): Promise<string> {
  const dataHome =
    process.env["XDG_DATA_HOME"]?.trim() || join(homedir(), ".local", "share");
  const trash = join(dataHome, "Trash");
  const files = join(trash, "files");
  const info = join(trash, "info");
  await mkdir(files, { recursive: true, mode: 0o700 });
  await mkdir(info, { recursive: true, mode: 0o700 });
  const original = path.split("/").map(encodeURIComponent).join("/");
  const record = `[Trash Info]\nPath=${original}\nDeletionDate=${trashInfoDate(now)}\n`;
  const name = basename(path);
  for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
    const candidate = n === 1 ? name : `${name} ${n}`;
    const infoFile = join(info, `${candidate}.trashinfo`);
    try {
      await writeFile(infoFile, record, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    const target = join(files, candidate);
    try {
      // A leftover entry without a record must not be replaced by the rename.
      if (await pathExists(target)) {
        await rm(infoFile, { force: true });
        continue;
      }
      await rename(path, target);
      return target;
    } catch (error) {
      await rm(infoFile, { force: true });
      throw error;
    }
  }
  throw new Error(`No free name for "${name}" in the trash`);
}

/** Rename `path` into `directory` under the first of `names` that is free. */
async function renameInto(
  path: string,
  directory: string,
  names: (attempt: number) => string
): Promise<string> {
  for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
    const target = join(directory, names(n));
    // `rename` replaces an empty directory, so a taken name is skipped first.
    if (await pathExists(target)) continue;
    await rename(path, target);
    return target;
  }
  throw new Error(`No free name for "${basename(path)}" in ${directory}`);
}

/**
 * Move a folder to the OS trash. Answers its new path, or null when this
 * process cannot reach the trash: an unsupported platform, a missing home
 * trash, or a folder on another volume. The folder is untouched on null.
 */
export async function moveToOsTrash(
  path: string,
  now: Date = new Date()
): Promise<string | null> {
  try {
    if (process.platform === "darwin") {
      const trash = join(homedir(), ".Trash");
      if (!(await pathExists(trash))) return null;
      const name = basename(path);
      return await renameInto(path, trash, (n) =>
        n === 1 ? name : `${name} ${n}`
      );
    }
    if (process.platform === "win32") return null;
    return await moveToXdgTrash(path, now);
  } catch {
    return null;
  }
}

/**
 * Move a folder to `<projectsDir>/.trash/<name>-<timestamp>`. Throws when the
 * rename fails, leaving the folder where it was.
 */
export async function moveToProjectsTrash(
  path: string,
  projectsDir: string,
  now: Date = new Date()
): Promise<string> {
  const trash = join(projectsDir, PROJECTS_TRASH_DIR);
  await mkdir(trash, { recursive: true });
  const name = `${basename(path)}-${folderTimestamp(now)}`;
  return renameInto(path, trash, (n) => (n === 1 ? name : `${name}-${n}`));
}

/**
 * Move a folder to the OS trash, or to the projects directory's trash when
 * the OS trash is out of reach. Throws when neither rename works.
 */
export async function trashFolder(
  path: string,
  projectsDir: string,
  now: Date = new Date()
): Promise<TrashedFolder> {
  const inOsTrash = await moveToOsTrash(path, now);
  if (inOsTrash) return { kind: "os_trash", location: inOsTrash };
  return {
    kind: "projects_trash",
    location: await moveToProjectsTrash(path, projectsDir, now)
  };
}
