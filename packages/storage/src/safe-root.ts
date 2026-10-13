import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  type FileHandle
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * A directory that confines every file operation to itself.
 *
 * Keys are relative paths. A key that leaves the root lexically (`..`, an
 * absolute path, a NUL byte) is rejected before any I/O. Reads also refuse
 * any symlink on the way to the file, and hardlinked files, so an alias
 * planted under the root cannot expose a file outside it. Writes replace the
 * target atomically through a temp file and `rename` in the same directory.
 *
 * Every check runs against the opened descriptor as well as the path (no
 * `O_NOFOLLOW` on Windows, so there the `lstat` + identity comparison is the
 * whole guard).
 */
export interface SafeRoot {
  /** Canonical (realpath) root directory. */
  readonly dir: string;
  /** Read a regular file. Rejects symlinks, hardlinks, and files over `maxBytes`. */
  readBytes(relativePath: string, options: { maxBytes: number }): Promise<Buffer>;
  /** Atomically create or replace a file, creating parent directories. */
  write(relativePath: string, data: Uint8Array): Promise<void>;
  /**
   * Atomically copy `sourcePath` (an absolute path outside the root is fine)
   * into the root. Rejects a symlinked or hardlinked source.
   */
  copyIn(
    relativePath: string,
    sourcePath: string,
    options: { maxBytes: number }
  ): Promise<void>;
  /**
   * Whether the path exists. Symlinks are followed while they stay inside the
   * root; one that leaves it throws.
   */
  exists(relativePath: string): Promise<boolean>;
}

export type SafeRootErrorCode =
  | "invalid-path"
  | "outside-root"
  | "symlink"
  | "hardlink"
  | "not-file"
  | "not-found"
  | "too-large"
  | "path-changed";

export class SafeRootError extends Error {
  constructor(
    readonly code: SafeRootErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SafeRootError";
  }
}

const COPY_CHUNK_BYTES = 1024 * 1024;

/** The errno code (`ENOENT`, `EEXIST`, …) of a caught Node error. */
function errorCode(cause: unknown): string | undefined {
  return cause instanceof Error && "code" in cause ? String(cause.code) : undefined;
}

function isNotFound(cause: unknown): boolean {
  const code = errorCode(cause);
  return code === "ENOENT" || code === "ENOTDIR";
}

/** `O_NOFOLLOW` where the platform has it; Windows relies on `lstat` checks. */
function noFollowFlag(): number {
  return process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0);
}

/** Never block on a FIFO or device that replaced a file after `lstat`. */
function readFlags(): number {
  const nonBlock = process.platform === "win32" ? 0 : (constants.O_NONBLOCK ?? 0);
  return constants.O_RDONLY | noFollowFlag() | nonBlock;
}

function isInside(rootDir: string, target: string): boolean {
  const rel = relative(rootDir, target);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function sameFile(
  a: { dev: number; ino: number },
  b: { dev: number; ino: number }
): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/**
 * Open a regular file for reading without following a symlink at its final
 * component, and verify the descriptor is the file the path names.
 */
async function openVerifiedFile(
  filePath: string,
  maxBytes: number
): Promise<FileHandle> {
  let before;
  try {
    before = await lstat(filePath);
  } catch (error) {
    if (isNotFound(error)) throw new SafeRootError("not-found", "file not found");
    throw error;
  }
  if (before.isSymbolicLink()) {
    throw new SafeRootError("symlink", "symlink not allowed");
  }
  if (!before.isFile()) throw new SafeRootError("not-file", "not a file");

  let handle: FileHandle;
  try {
    handle = await open(filePath, readFlags());
  } catch (error) {
    const code = errorCode(error);
    if (isNotFound(error)) throw new SafeRootError("not-found", "file not found");
    // ELOOP (Linux) / EMLINK (macOS, BSD): the path became a symlink.
    if (code === "ELOOP" || code === "EMLINK") {
      throw new SafeRootError("symlink", "symlink open blocked");
    }
    throw error;
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new SafeRootError("not-file", "not a file");
    if (!sameFile(opened, before)) {
      throw new SafeRootError("path-changed", "path changed before open");
    }
    if (opened.nlink > 1) {
      throw new SafeRootError("hardlink", "hardlinked file not allowed");
    }
    if (opened.size > maxBytes) {
      throw new SafeRootError(
        "too-large",
        `file exceeds limit of ${maxBytes} bytes (got ${opened.size})`
      );
    }
    return handle;
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

/** Read at most `maxBytes`, failing if the file grew past it since `stat`. */
async function readBounded(handle: FileHandle, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const scratch = Buffer.allocUnsafe(Math.min(COPY_CHUNK_BYTES, maxBytes + 1));
  for (;;) {
    const length = Math.min(scratch.length, maxBytes - total + 1);
    const { bytesRead } = await handle.read(scratch, 0, length, null);
    if (bytesRead === 0) return Buffer.concat(chunks, total);
    total += bytesRead;
    if (total > maxBytes) {
      throw new SafeRootError("too-large", `file exceeds limit of ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(scratch.subarray(0, bytesRead)));
  }
}

/** Persist a rename. Directories cannot be opened for fsync on Windows. */
async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const handle = await open(dir, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best effort: some file systems refuse fsync on a directory.
  }
}

class SafeRootImpl implements SafeRoot {
  constructor(readonly dir: string) {}

  /**
   * Absolute path for `relativePath`, rejected when it is absolute, contains
   * a NUL byte, or resolves outside the root.
   */
  private lexicalPath(relativePath: string): string {
    if (relativePath.includes("\0")) {
      throw new SafeRootError("invalid-path", "path contains a NUL byte");
    }
    if (isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) {
      throw new SafeRootError("invalid-path", "path must be relative");
    }
    const absolute = resolve(this.dir, relativePath);
    if (absolute === this.dir || !isInside(this.dir, absolute)) {
      throw new SafeRootError("outside-root", "path is outside the root");
    }
    return absolute;
  }

  /** Path segments below the root, after lexical validation. */
  private segments(relativePath: string): string[] {
    return relative(this.dir, this.lexicalPath(relativePath))
      .split(sep)
      .filter(Boolean);
  }

  /**
   * Walk `segments` from the root one component at a time. With
   * `follow: false` any symlink throws; with `follow: true` a symlink is
   * replaced by its realpath, which must stay inside the root. Returns the
   * canonical path reached and whether it exists.
   */
  private async walk(
    segments: string[],
    follow: boolean
  ): Promise<{ path: string; exists: boolean }> {
    let cursor = this.dir;
    for (let i = 0; i < segments.length; i += 1) {
      cursor = join(cursor, segments[i]!);
      let info;
      try {
        info = await lstat(cursor);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        return { path: join(cursor, ...segments.slice(i + 1)), exists: false };
      }
      if (!info.isSymbolicLink()) continue;
      if (!follow) throw new SafeRootError("symlink", "symlink path component not allowed");
      try {
        cursor = await realpath(cursor);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        // Dangling link: its target cannot be checked against the root.
        throw new SafeRootError("symlink", "dangling symlink");
      }
      if (!isInside(this.dir, cursor)) {
        throw new SafeRootError("outside-root", "symlink escapes the root");
      }
    }
    return { path: cursor, exists: true };
  }

  async readBytes(
    relativePath: string,
    options: { maxBytes: number }
  ): Promise<Buffer> {
    const { path: filePath, exists } = await this.walk(this.segments(relativePath), false);
    if (!exists) throw new SafeRootError("not-found", "file not found");
    const handle = await openVerifiedFile(filePath, options.maxBytes);
    try {
      // A parent directory swapped for a symlink after the walk would pass
      // the checks above; the realpath catches it.
      if (!isInside(this.dir, await realpath(filePath))) {
        throw new SafeRootError("outside-root", "file is outside the root");
      }
      return await readBounded(handle, options.maxBytes);
    } finally {
      await handle.close().catch(() => {});
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    return (await this.walk(this.segments(relativePath), true)).exists;
  }

  async write(relativePath: string, data: Uint8Array): Promise<void> {
    await this.replaceFile(relativePath, async (handle) => {
      await handle.writeFile(data);
    });
  }

  async copyIn(
    relativePath: string,
    sourcePath: string,
    options: { maxBytes: number }
  ): Promise<void> {
    if (sourcePath.includes("\0")) {
      throw new SafeRootError("invalid-path", "source path contains a NUL byte");
    }
    const source = await openVerifiedFile(sourcePath, options.maxBytes);
    try {
      const sourceStat = await source.stat();
      await this.replaceFile(
        relativePath,
        async (target) => {
          const buffer = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
          let total = 0;
          for (;;) {
            const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
            if (bytesRead === 0) break;
            total += bytesRead;
            if (total > options.maxBytes) {
              throw new SafeRootError(
                "too-large",
                `file exceeds limit of ${options.maxBytes} bytes`
              );
            }
            let offset = 0;
            while (offset < bytesRead) {
              const { bytesWritten } = await target.write(buffer, offset, bytesRead - offset);
              offset += bytesWritten;
            }
          }
        },
        async () => {
          // The source path must still name the file that was copied.
          const current = await lstat(sourcePath);
          if (current.isSymbolicLink() || !sameFile(current, sourceStat)) {
            throw new SafeRootError("path-changed", "copy source changed");
          }
        }
      );
    } finally {
      await source.close().catch(() => {});
    }
  }

  /**
   * Create the parent directories one component at a time (refusing any
   * symlinked component), fill a temp file beside the target, and rename it
   * over the target. A symlink at the target itself is replaced, never
   * written through, and only when it points inside the root.
   */
  private async replaceFile(
    relativePath: string,
    fill: (handle: FileHandle) => Promise<void>,
    beforeCommit?: () => Promise<void>
  ): Promise<void> {
    const segments = this.segments(relativePath);
    const name = segments.pop()!;
    let parent = this.dir;
    for (const segment of segments) {
      parent = join(parent, segment);
      try {
        await mkdir(parent);
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
      }
      const info = await lstat(parent);
      if (info.isSymbolicLink()) {
        throw new SafeRootError("symlink", "symlink path component not allowed");
      }
      if (!info.isDirectory()) {
        throw new SafeRootError("not-file", "path component is not a directory");
      }
    }
    if (!isInside(this.dir, await realpath(parent))) {
      throw new SafeRootError("outside-root", "directory is outside the root");
    }

    const target = join(parent, name);
    let mode = 0o600;
    try {
      const existing = await lstat(target);
      if (existing.isSymbolicLink()) {
        let real: string;
        try {
          real = await realpath(target);
        } catch (error) {
          if (!isNotFound(error)) throw error;
          throw new SafeRootError("symlink", "dangling symlink");
        }
        if (!isInside(this.dir, real)) {
          throw new SafeRootError("outside-root", "symlink escapes the root");
        }
        // The replacement takes the mode of the file the link pointed to.
        const linked = await lstat(real);
        if (!linked.isFile()) throw new SafeRootError("not-file", "not a file");
        if (linked.nlink > 1) {
          throw new SafeRootError("hardlink", "hardlinked file not allowed");
        }
        mode = linked.mode & 0o777;
      } else if (!existing.isFile()) {
        throw new SafeRootError("not-file", "not a file");
      } else if (existing.nlink > 1) {
        throw new SafeRootError("hardlink", "hardlinked file not allowed");
      } else {
        mode = existing.mode & 0o777;
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }

    const tempPath = join(parent, `.${name}.${process.pid}.${randomUUID()}.tmp`);
    const handle = await open(
      tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(),
      mode
    );
    let renamed = false;
    try {
      let tempStat;
      try {
        // `open` applies the umask; set the mode the file should have.
        await handle.chmod(mode);
        await fill(handle);
        await handle.sync();
        tempStat = await handle.stat();
      } finally {
        await handle.close().catch(() => {});
      }
      await beforeCommit?.();
      await rename(tempPath, target);
      renamed = true;
      await syncDirectory(parent);
      const committed = await lstat(target);
      if (committed.isSymbolicLink() || !sameFile(committed, tempStat)) {
        throw new SafeRootError("path-changed", "target changed during write");
      }
    } finally {
      if (!renamed) await rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

/** Open `rootDir` (created if missing) as a {@link SafeRoot}. */
export async function openSafeRoot(rootDir: string): Promise<SafeRoot> {
  if (rootDir.includes("\0")) {
    throw new SafeRootError("invalid-path", "root path contains a NUL byte");
  }
  const resolved = resolve(rootDir);
  await mkdir(resolved, { recursive: true });
  const real = await realpath(resolved);
  if (!(await lstat(real)).isDirectory()) {
    throw new SafeRootError("invalid-path", "root is not a directory");
  }
  return new SafeRootImpl(real);
}
