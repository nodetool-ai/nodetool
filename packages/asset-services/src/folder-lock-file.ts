/**
 * A lock that holds across processes on one host: the desktop server and a
 * `nodetool` CLI command that share one SQLite database, for example.
 *
 * The lock is a file created with an exclusive create. It records its owner
 * (process id, host name and a random token), and the owner touches it every
 * {@link FolderLockFileOptions.heartbeatMs}. Another process takes the lock
 * over only when its owner is gone:
 *
 * - the owner ran on this host and its process no longer exists, or
 * - the file was not touched for {@link FolderLockFileOptions.staleMs}, as
 *   when the owner was killed on another host that shares the directory.
 *
 * Taking over and releasing both run under a guard directory, created with
 * an exclusive `mkdir`. The guard is held for a few file operations only, so
 * a guard older than {@link FolderLockFileOptions.guardStaleMs} was left by a
 * process that died while holding it and is removed. Under the guard the
 * lock file is read again, and it is removed only when it still records the
 * owner that was judged gone (take-over) or the caller (release). A process
 * therefore never removes a lock that a live owner took in the meantime.
 *
 * A waiter gives up after {@link FolderLockFileOptions.timeoutMs} with a
 * {@link FolderLockTimeoutError}, so a process that hangs while it holds the
 * lock stops other processes' work with an error instead of forever.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rmdir, stat, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createLogger } from "@nodetool-ai/config";
import { getDbType, getRawDb } from "@nodetool-ai/models";

const log = createLogger("nodetool.asset-services.folder-lock-file");

export interface FolderLockFileOptions {
  /** How often the owner touches the lock file, in ms. */
  heartbeatMs?: number;
  /** How long an untouched lock file stays its owner's, in ms. */
  staleMs?: number;
  /** How long a guard directory may stay before it counts as left behind, in ms. */
  guardStaleMs?: number;
  /** How long a waiter waits before it gives up, in ms. */
  timeoutMs?: number;
  /** The longest pause between two tries, in ms. */
  maxPollMs?: number;
}

const DEFAULTS: Required<FolderLockFileOptions> = {
  heartbeatMs: 2_000,
  staleMs: 15_000,
  guardStaleMs: 5_000,
  timeoutMs: 5 * 60_000,
  maxPollMs: 200
};

/** Thrown when a lock stayed with another owner for the whole wait. */
export class FolderLockTimeoutError extends Error {
  readonly path: string;

  constructor(path: string, waitedMs: number) {
    super(
      `The project folder is busy in another NodeTool process (lock ${path} held for over ${Math.round(waitedMs / 1000)} s)`
    );
    this.name = "FolderLockTimeoutError";
    this.path = path;
  }
}

/** What a lock file records about its owner. */
interface LockOwner {
  pid: number;
  host: string;
  token: string;
}

/** The text of a lock file: process id, host name and token, one per line. */
function ownerText(owner: LockOwner): string {
  return `${owner.pid}\n${owner.host}\n${owner.token}\n`;
}

/** The owner a lock file records, or null for a file cut short while it was written. */
function parseOwner(text: string): LockOwner | null {
  const [pid, host, token, rest] = text.split("\n");
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0 || !host || !token || rest !== "") {
    return null;
  }
  return { pid: id, host, token };
}

/** The errno code of a failed file system call, if it has one. */
function errnoCode(error: Error): string | undefined {
  return "code" in error ? String(error.code) : undefined;
}

/** Whether `error` is a file system failure with `code`. */
function failedWith(error: Error, code: string): boolean {
  return errnoCode(error) === code;
}

/** False only when the process certainly no longer exists. */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to another user.
    return !(error instanceof Error && failedWith(error, "ESRCH"));
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && failedWith(error, "ENOENT")) return null;
    throw error;
  }
}

/** Remove `path`. A file that is already gone is not an error. */
async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!(error instanceof Error && failedWith(error, "ENOENT"))) throw error;
  }
}

/** A lock file this process holds. */
export interface HeldFolderLock {
  /** Remove the lock file, when it still records this owner. */
  release(): Promise<void>;
}

class LockFile {
  private readonly path: string;
  private readonly options: Required<FolderLockFileOptions>;
  private readonly guard: string;

  constructor(path: string, options: FolderLockFileOptions) {
    this.path = path;
    this.options = { ...DEFAULTS, ...options };
    this.guard = `${path}.guard`;
  }

  async acquire(): Promise<HeldFolderLock> {
    const owner: LockOwner = {
      pid: process.pid,
      host: hostname(),
      token: randomUUID()
    };
    const contents = ownerText(owner);
    const started = Date.now();
    let pause = 5;
    for (;;) {
      const handle = await this.tryCreate(contents);
      if (handle) return this.held(handle, contents);
      await this.takeOverIfGone();
      const waited = Date.now() - started;
      if (waited >= this.options.timeoutMs) {
        throw new FolderLockTimeoutError(this.path, waited);
      }
      await delay(pause);
      pause = Math.min(pause * 2, this.options.maxPollMs);
    }
  }

  private async tryCreate(contents: string): Promise<FileHandle | null> {
    let handle: FileHandle;
    try {
      handle = await open(this.path, "wx");
    } catch (error) {
      if (error instanceof Error && failedWith(error, "EEXIST")) return null;
      throw error;
    }
    try {
      await handle.writeFile(contents);
      await handle.sync();
      return handle;
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(this.path).catch(() => undefined);
      throw error;
    }
  }

  private held(handle: FileHandle, contents: string): HeldFolderLock {
    let beat: Promise<void> = Promise.resolve();
    const touch = async (): Promise<void> => {
      const now = new Date();
      try {
        // Through the open handle: a lock file taken over and created again
        // by another owner is another file, and is not touched.
        await handle.utimes(now, now);
      } catch (error) {
        log.warn("Could not touch a project folder lock", {
          path: this.path,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
    const timer = setInterval(() => {
      beat = beat.then(touch);
    }, this.options.heartbeatMs);
    timer.unref();
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        clearInterval(timer);
        await beat;
        await handle.close().catch(() => undefined);
        await this.underGuard(async () => {
          if ((await readText(this.path)) === contents) await unlink(this.path);
        });
      }
    };
  }

  /** Remove the lock file when its owner is gone. */
  private async takeOverIfGone(): Promise<void> {
    const seen = await this.goneOwner();
    if (seen === null) return;
    await this.underGuard(async () => {
      // Judged again under the guard: the owner may have released the lock
      // and another one taken it since.
      if ((await this.goneOwner()) !== seen) return;
      await removeFile(this.path);
      log.warn("Took over a project folder lock whose owner is gone", {
        path: this.path
      });
    });
  }

  /** The text of the lock file when its owner is gone, else null. */
  private async goneOwner(): Promise<string | null> {
    let info;
    try {
      info = await stat(this.path);
    } catch (error) {
      if (error instanceof Error && failedWith(error, "ENOENT")) return null;
      throw error;
    }
    const text = await readText(this.path);
    if (text === null) return null;
    const owner = parseOwner(text);
    const untouched = Date.now() - info.mtimeMs > this.options.staleMs;
    const exited =
      owner !== null && owner.host === hostname() && !processIsAlive(owner.pid);
    return untouched || exited ? text : null;
  }

  /** Run `task` while this process holds the guard directory. */
  private async underGuard(task: () => Promise<void>): Promise<void> {
    const started = Date.now();
    for (;;) {
      try {
        await mkdir(this.guard);
        break;
      } catch (error) {
        if (!(error instanceof Error && failedWith(error, "EEXIST"))) throw error;
      }
      const info = await stat(this.guard).catch(() => null);
      if (info && Date.now() - info.mtimeMs > this.options.guardStaleMs) {
        await rmdir(this.guard).catch(() => undefined);
        continue;
      }
      if (Date.now() - started >= this.options.timeoutMs) {
        throw new FolderLockTimeoutError(this.guard, Date.now() - started);
      }
      await delay(5);
    }
    try {
      await task();
    } finally {
      await rmdir(this.guard).catch(() => undefined);
    }
  }
}

/**
 * Wait for the lock file at `path` and hold it. The directory of `path` must
 * exist. Throws {@link FolderLockTimeoutError} after `options.timeoutMs`.
 */
export function acquireFolderLockFile(
  path: string,
  options: FolderLockFileOptions = {}
): Promise<HeldFolderLock> {
  return new LockFile(path, options).acquire();
}

// ── The lock of one project folder ──────────────────────────────────────────

/** Not resolved yet, a directory, or null for no lock between processes. */
let lockDirectory: string | null | undefined;

/**
 * Set the directory the project folder locks are kept in. Null keeps the
 * lock within the process. Undefined goes back to the default, which
 * {@link projectFolderLockDirectory} describes. For hosts and tests.
 */
export function setProjectFolderLockDirectory(
  directory: string | null | undefined
): void {
  lockDirectory = directory;
}

/**
 * The directory the project folder locks are kept in, or null when there is
 * no lock between processes.
 *
 * By default it sits beside the SQLite database file, as
 * `<database>.locks/`. Two processes that share one database, the only ones
 * that can work on the same asset rows, then share the locks. An in-memory
 * database and PostgreSQL have no such file, and the lock then holds within
 * the process only.
 */
export async function projectFolderLockDirectory(): Promise<string | null> {
  if (lockDirectory !== undefined) return lockDirectory;
  let file: string;
  try {
    if (getDbType() !== "sqlite") return null;
    file = getRawDb().name;
  } catch {
    // No database is open yet. The next call looks again.
    return null;
  }
  if (!file || file === ":memory:" || file.startsWith("file:")) return null;
  const directory = `${resolve(file)}.locks`;
  await mkdir(directory, { recursive: true });
  return directory;
}

/** The lock file of one project folder in `directory`. */
export function projectFolderLockPath(
  directory: string,
  userId: string,
  projectId: string
): string {
  const name = createHash("sha256")
    .update(`${userId}\u0000${projectId}`)
    .digest("hex")
    .slice(0, 40);
  return join(directory, `${name}.lock`);
}

// ── A named lock ────────────────────────────────────────────────────────────

const namedQueues = new Map<string, Promise<unknown>>();

/**
 * Run `task` after every earlier task of the same `name`, in this process
 * and, beside a SQLite database file, in every process that shares it. The
 * lock file is kept in {@link projectFolderLockDirectory}.
 *
 * For work that reads what to do and then does it, such as checking that a
 * folder is no project's before giving it to one, so two callers never both
 * pass the check.
 */
export function withNamedLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const previous = namedQueues.get(name) ?? Promise.resolve();
  const locked = async (): Promise<T> => {
    const directory = await projectFolderLockDirectory();
    if (directory === null) return task();
    const file = createHash("sha256").update(name).digest("hex").slice(0, 40);
    const held = await acquireFolderLockFile(join(directory, `named-${file}.lock`));
    try {
      return await task();
    } finally {
      await held.release();
    }
  };
  const next = previous.then(locked, locked);
  const settled = next.catch(() => undefined);
  namedQueues.set(name, settled);
  void settled.then(() => {
    if (namedQueues.get(name) === settled) namedQueues.delete(name);
  });
  return next;
}
