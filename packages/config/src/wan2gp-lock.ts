import { importNodeBuiltin } from "./node-import.js";

interface Wan2GPLockOptions {
  readonly signal?: AbortSignal;
  readonly onWait?: () => void;
  readonly timeoutMs?: number;
}

/** Keep this lock outside the install, which uninstall removes while holding it. */
export async function withWan2GPLock<T>(
  installDir: string,
  action: () => Promise<T>,
  options: Wan2GPLockOptions = {}
): Promise<T> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const timers = await importNodeBuiltin<typeof import("node:timers/promises")>("node:timers/promises");
  if (!fs || !path || !timers) throw new Error("Managing Wan2GP requires Node.js");
  const target = path.resolve(installDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  let canonical: string;
  try {
    canonical = await fs.realpath(target);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    canonical = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
  }
  const lock = `${canonical}.nodetool-lock`;
  const deadline = Date.now() + (options.timeoutMs ?? 10 * 60 * 1000);
  let notified = false;
  while (true) {
    options.signal?.throwIfAborted();
    try {
      await fs.mkdir(lock);
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    if (Date.now() >= deadline) {
      // A timeout never permits deleting a lock another process may still own.
      throw new Error(`Timed out waiting for Wan2GP at ${lock}. If its owner stopped, remove this directory and retry.`);
    }
    if (!notified) {
      options.onWait?.();
      notified = true;
    }
    await timers.setTimeout(100, undefined, { signal: options.signal });
  }
  try {
    options.signal?.throwIfAborted();
    return await action();
  } finally {
    await fs.rmdir(lock);
  }
}

export async function wan2gpInstallDir(sourceDir: string): Promise<string> {
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!path) throw new Error("Managing Wan2GP requires Node.js");
  return path.dirname(path.dirname(sourceDir));
}
