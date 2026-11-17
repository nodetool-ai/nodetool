/**
 * A lock that holds across processes on one host: the desktop server and a
 * `nodetool` CLI command that share one SQLite database, for example.
 *
 * The holder first takes an operating system lock: an exclusive transaction
 * on an empty SQLite file beside the lock file, `<lock>.sqlite`. The
 * operating system keeps that lock for as long as the holder's process
 * exists, suspended or blocked included, and drops it when the process
 * exits. No other process can take it from a live holder, however long the
 * holder's heartbeat stops and whether or not its liveness can be read. It
 * reaches every process that shares the database, since SQLite relies on
 * the same file locks for the database itself.
 *
 * Under that lock the holder takes the lock file. The lock file
 * names the owner and still excludes a process whose operating system lock
 * did not hold, as on a file system without byte-range locks.
 *
 * The lock file is created with an exclusive create. It records its owner
 * (process id, host name, a random token, the process's PID namespace and
 * boot, and on Linux the process's start time), and the owner touches it
 * every {@link FolderLockFileOptions.heartbeatMs}. Another process takes the
 * lock over only when its owner is gone:
 *
 * - the owner ran in this PID namespace of this host and boot, and its
 *   process no longer exists, or its id now belongs to a process that
 *   started at another time, or
 * - the file was not touched for {@link FolderLockFileOptions.staleMs}, as
 *   when the owner was killed on another host that shares the directory.
 *
 * A process id is only asked about when the owner recorded this PID
 * namespace: two containers that share the database volume and the host
 * name see each other's ids as missing. On Linux an owner that is known to
 * still run keeps the lock however long its file goes untouched, since a
 * blocked event loop stops the heartbeat timer of a live process.
 *
 * Taking over and releasing both run under a guard file, created with an
 * exclusive create and holding a random token. The guard is held for a few
 * file operations only, so a guard older than
 * {@link FolderLockFileOptions.guardStaleMs} was left by a process that died
 * while holding it and is removed. A guard is removed by renaming it to a
 * name of its own and comparing what was renamed with the guard that was
 * judged: when another process took the guard in between, that guard is put
 * back. Under the guard the lock file is read again, and it is removed only
 * when it still records the owner that was judged gone (take-over) or the
 * caller (release). A process therefore never removes a lock that a live
 * owner took in the meantime.
 *
 * A waiter gives up after {@link FolderLockFileOptions.timeoutMs} with a
 * {@link FolderLockTimeoutError}, so a process that hangs while it holds the
 * lock stops other processes' work with an error instead of forever.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  rename,
  rmdir,
  stat,
  unlink
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { hostname, uptime } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createLogger } from "@nodetool-ai/config";
import { getDbType, getRawDb, openSqliteFile } from "@nodetool-ai/models";

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
  /**
   * The PID namespace and boot the process id belongs to, from
   * {@link processScope}. Null for a lock file of an earlier version, which
   * did not record one. Empty when the owner could not tell.
   */
  scope: string | null;
  /** The process's start time, from {@link startTimeOf}. Empty when unknown. */
  started: string;
}

/**
 * The text of a lock file: process id, host name, token, scope and start
 * time, one per line.
 */
function ownerText(owner: LockOwner): string {
  return `${owner.pid}\n${owner.host}\n${owner.token}\n${owner.scope ?? ""}\n${owner.started}\n`;
}

/** The owner a lock file records, or null for a file cut short while it was written. */
function parseOwner(text: string): LockOwner | null {
  const lines = text.split("\n");
  const [pid, host, token] = lines;
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0 || !host || !token) return null;
  // Three lines: an earlier version, which recorded no scope.
  if (lines.length === 4 && lines[3] === "") {
    return { pid: id, host, token, scope: null, started: "" };
  }
  if (lines.length !== 6 || lines[5] !== "") return null;
  return { pid: id, host, token, scope: lines[3], started: lines[4] };
}

/**
 * Where this process's id means this process: on Linux the boot and the PID
 * namespace, elsewhere the platform and the boot to the minute. Empty when
 * it cannot be read. Two processes with one host name and one scope see the
 * same processes under the same ids.
 */
async function readProcessScope(): Promise<string> {
  if (process.platform === "linux") {
    try {
      const boot = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
      const namespace = await readlink("/proc/self/ns/pid");
      return `linux:${boot}:${namespace}`;
    } catch {
      return "";
    }
  }
  // No PID namespaces. The boot keeps a lock file from before a restart
  // from naming a process that runs now.
  const bootMinute = Math.round((Date.now() / 1000 - uptime()) / 60);
  return `${process.platform}:${bootMinute}`;
}

let scopeOfThisProcess: Promise<string> | null = null;

function processScope(): Promise<string> {
  scopeOfThisProcess ??= readProcessScope();
  return scopeOfThisProcess;
}

/**
 * When process `pid` started, in clock ticks since boot (field 22 of
 * `/proc/<pid>/stat`). Null where there is no such file. A process id that
 * is given to a new process gets a new start time.
 */
async function startTimeOf(pid: number): Promise<string | null> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    // The command name in parentheses may hold spaces; the fields follow it.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/**
 * What this process can tell about the owner's process: it has exited, it
 * still runs (the same process, by its start time), or nothing, as for an
 * owner on another host or in another PID namespace.
 */
async function ownerProcessState(
  owner: LockOwner
): Promise<"exited" | "running" | "unknown"> {
  if (owner.host !== hostname() || !owner.scope) return "unknown";
  if (owner.scope !== (await processScope())) return "unknown";
  if (!processIsAlive(owner.pid)) return "exited";
  if (!owner.started) return "unknown";
  const started = await startTimeOf(owner.pid);
  if (started === null) return "unknown";
  return started === owner.started ? "running" : "exited";
}

/** What a guard was when it was judged: removed only while it is still that. */
interface GuardSeen {
  directory: boolean;
  dev?: number;
  ino?: number;
  text: string | null;
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

/** A connection that holds the operating system lock of one lock file. */
type SystemLock = ReturnType<typeof openSqliteFile>;

/**
 * Take the operating system lock at `path`: an exclusive transaction on an
 * empty SQLite file, which no other connection, in this process or another,
 * can begin while it is open. Null while another holder has it.
 */
function tryTakeSystemLock(path: string): SystemLock | null {
  const db = openSqliteFile(path);
  try {
    db.exec("BEGIN EXCLUSIVE");
    return db;
  } catch (error) {
    db.close();
    if (error instanceof Error && failedWith(error, "SQLITE_BUSY")) return null;
    throw error;
  }
}

/** Give up the operating system lock. */
function releaseSystemLock(db: SystemLock): void {
  try {
    db.exec("ROLLBACK");
  } finally {
    db.close();
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
      token: randomUUID(),
      scope: await processScope(),
      started: (await startTimeOf(process.pid)) ?? ""
    };
    const contents = ownerText(owner);
    const started = Date.now();
    let pause = 5;
    const wait = async (): Promise<void> => {
      const waited = Date.now() - started;
      if (waited >= this.options.timeoutMs) {
        throw new FolderLockTimeoutError(this.path, waited);
      }
      await delay(pause);
      pause = Math.min(pause * 2, this.options.maxPollMs);
    };
    let system = tryTakeSystemLock(`${this.path}.sqlite`);
    while (system === null) {
      await wait();
      system = tryTakeSystemLock(`${this.path}.sqlite`);
    }
    try {
      for (;;) {
        const handle = await this.tryCreate(contents);
        if (handle) return this.held(handle, contents, system);
        await this.takeOverIfGone();
        await wait();
      }
    } catch (error) {
      releaseSystemLock(system);
      throw error;
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

  private held(
    handle: FileHandle,
    contents: string,
    system: SystemLock
  ): HeldFolderLock {
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
        try {
          await this.underGuard(async () => {
            if ((await readText(this.path)) === contents) await unlink(this.path);
          });
        } finally {
          releaseSystemLock(system);
        }
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
    const state = owner === null ? "unknown" : await ownerProcessState(owner);
    if (state === "exited") return text;
    if (state === "running") return null;
    return Date.now() - info.mtimeMs > this.options.staleMs ? text : null;
  }

  /** Run `task` while this process holds the guard file. */
  private async underGuard(task: () => Promise<void>): Promise<void> {
    const token = randomUUID();
    const started = Date.now();
    for (;;) {
      if (await this.tryCreateGuard(token)) break;
      const seen = await this.seeGuard();
      if (seen && Date.now() - seen.mtimeMs > this.options.guardStaleMs) {
        await this.removeGuard(seen);
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
      try {
        await this.removeGuard({ directory: false, text: token });
      } catch (error) {
        log.warn("Could not remove a project folder lock guard", {
          path: this.guard,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /** Create the guard holding `token`. False when it is taken. */
  private async tryCreateGuard(token: string): Promise<boolean> {
    let handle: FileHandle;
    try {
      handle = await open(this.guard, "wx");
    } catch (error) {
      if (error instanceof Error && failedWith(error, "EEXIST")) return false;
      throw error;
    }
    try {
      await handle.writeFile(token);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(this.guard).catch(() => undefined);
      throw error;
    }
    await handle.close();
    return true;
  }

  /** The guard as it is now, or null when there is none. */
  private async seeGuard(): Promise<(GuardSeen & { mtimeMs: number }) | null> {
    const info = await lstat(this.guard).catch(() => null);
    if (!info) return null;
    // A directory: the guard of an earlier version.
    if (info.isDirectory()) {
      return { directory: true, dev: info.dev, ino: info.ino, text: null, mtimeMs: info.mtimeMs };
    }
    const text = await readText(this.guard);
    if (text === null) return null;
    return { directory: false, dev: info.dev, ino: info.ino, text, mtimeMs: info.mtimeMs };
  }

  /**
   * Remove the guard when it is still `expected`. It is renamed to a name of
   * its own first, which no other process can take from under this one, and
   * then compared. A guard another process took in the meantime is put back.
   */
  private async removeGuard(expected: GuardSeen): Promise<void> {
    const removed = `${this.guard}.${randomUUID()}.removed`;
    try {
      await rename(this.guard, removed);
    } catch (error) {
      if (error instanceof Error && failedWith(error, "ENOENT")) return;
      throw error;
    }
    const info = await lstat(removed);
    const sameFile =
      expected.ino === undefined ||
      (info.ino === expected.ino && info.dev === expected.dev);
    if (info.isDirectory()) {
      if (expected.directory && sameFile) {
        await rmdir(removed).catch(() => undefined);
        return;
      }
      // An earlier version's live guard. A directory cannot be linked back.
      await rename(removed, this.guard).catch(() => rmdir(removed).catch(() => undefined));
      return;
    }
    if (!expected.directory && sameFile && (await readText(removed)) === expected.text) {
      await unlink(removed);
      return;
    }
    // Another process's guard. A link puts it back without replacing a guard
    // that a third process took since.
    try {
      await link(removed, this.guard);
    } catch (error) {
      if (!(error instanceof Error && failedWith(error, "EEXIST"))) {
        await rename(removed, this.guard).catch(() => undefined);
        return;
      }
      log.warn("A project folder lock guard was taken while it was put back", {
        path: this.guard
      });
    }
    await unlink(removed).catch(() => undefined);
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
