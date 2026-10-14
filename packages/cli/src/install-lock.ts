import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, open, readFile, realpath, rmdir, stat, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export interface InstallLockOptions {
  readonly signal?: AbortSignal;
  readonly onWait?: (path: string) => void;
  readonly timeoutMs?: number;
  readonly heartbeatMs?: number;
  readonly staleMs?: number;
  readonly pollMs?: number;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Serialize lock creation, stale recovery, and release across processes. */
async function mutateLock<T>(path: string, action: () => Promise<T>, options: InstallLockOptions): Promise<T> {
  const guard = `${path}.guard`;
  const start = Date.now();
  while (true) {
    options.signal?.throwIfAborted();
    try {
      await mkdir(guard);
      break;
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw error;
      }
    }
    if (Date.now() - start >= (options.timeoutMs ?? 600_000)) {
      // Never steal this guard: deletion races can admit concurrent installers.
      throw new Error(`Timed out waiting for the install lock guard at ${guard}. If its owner stopped, remove this directory before retrying.`);
    }
    await delay(options.pollMs ?? 250, undefined, { signal: options.signal });
  }
  try {
    return await action();
  } finally {
    await rmdir(guard);
  }
}

/** Both installers place their lock inside the real install target. */
export async function acquireInstallLock(
  target: string,
  filename: string,
  options: InstallLockOptions = {}
): Promise<() => Promise<void>> {
  if (!filename || filename === "." || filename === ".." || dirname(filename) !== ".") {
    throw new Error("An install lock filename must stay inside its target");
  }
  await mkdir(target, { recursive: true });
  const path = join(await realpath(target), filename);
  const token = randomUUID();
  const contents = JSON.stringify({ pid: process.pid, hostname: hostname(), token, startedAt: new Date().toISOString() });
  const start = Date.now();
  let nextNotice = start;
  while (true) {
    options.signal?.throwIfAborted();
    const handle = await mutateLock(path, async () => {
      try {
        const info = await stat(path);
        if (Date.now() - info.mtimeMs > (options.staleMs ?? 60_000)) {
          await unlink(path);
        }
      } catch (error) {
        if (!hasCode(error, "ENOENT")) {
          throw error;
        }
      }
      let file;
      try {
        file = await open(path, "wx");
      } catch (error) {
        if (hasCode(error, "EEXIST")) {
          return null;
        }
        throw error;
      }
      try {
        await file.writeFile(contents);
        return file;
      } catch (error) {
        await file.close();
        await unlink(path);
        throw error;
      }
    }, options);
    if (handle) {
      let heartbeat: Promise<void> = Promise.resolve();
      let heartbeatError: unknown;
      const timer = setInterval(() => {
        heartbeat = heartbeat.then(async () => {
          const now = new Date();
          await handle.utimes(now, now);
        }).catch((error: unknown) => { heartbeatError = error; });
      }, options.heartbeatMs ?? 5_000);
      timer.unref();
      let released = false;
      return async () => {
        if (released) {
          return;
        }
        released = true;
        clearInterval(timer);
        await heartbeat;
        await handle.close();
        // Cancellation must not stop cleanup of the owner's lock.
        const { signal: _signal, ...releaseOptions } = options;
        await mutateLock(path, async () => {
          try {
            if (await readFile(path, "utf8") === contents) {
              await unlink(path);
            }
          } catch (error) {
            if (!hasCode(error, "ENOENT")) {
              throw error;
            }
          }
        }, releaseOptions);
        if (heartbeatError) {
          throw heartbeatError;
        }
      };
    }
    if (Date.now() - start >= (options.timeoutMs ?? 600_000)) {
      throw new Error(`Timed out waiting for the install lock at ${path}`);
    }
    if (Date.now() >= nextNotice) {
      options.onWait?.(path);
      nextNotice = Date.now() + 10_000;
    }
    await delay(options.pollMs ?? 250, undefined, { signal: options.signal });
  }
}

export async function withInstallLock<T>(
  target: string,
  filename: string,
  action: () => Promise<T>,
  options: InstallLockOptions = {}
): Promise<T> {
  const release = await acquireInstallLock(target, filename, options);
  try {
    return await action();
  } finally {
    await release();
  }
}
