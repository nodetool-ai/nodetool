import { FsSafeError, root, type Root } from "@openclaw/fs-safe";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { AbstractStorage } from "./abstract-storage.js";
import { isWithinRoot, normalizeStorageKey } from "./storage-keys.js";
import { assertUploadWithinLimit } from "./storage-limits.js";

/**
 * A missing path, whichever layer reported it: `node:fs` raises `ENOENT`,
 * fs-safe raises its own `not-found`.
 */
function isNotFound(err: Error): boolean {
  if (err instanceof FsSafeError) return err.code === "not-found";
  return "code" in err && err.code === "ENOENT";
}

/**
 * File-backed `AbstractStorage` that holds caller-controlled keys inside a
 * single trusted directory. Path resolution and all reads/writes go through
 * `@openclaw/fs-safe` so symlinked or hardlinked aliases pointing outside the
 * base directory are rejected, and writes are verified to land inside the
 * boundary.
 */
export class FileStorage implements AbstractStorage {
  private readonly rootPromise: Promise<Root>;

  constructor(private readonly baseDir: string) {
    this.rootPromise = root(baseDir, {
      hardlinks: "reject",
      symlinks: "reject",
      mkdir: true
    });
    this.rootPromise.catch(() => {});
  }

  private async getRoot(): Promise<Root> {
    return this.rootPromise;
  }

  async upload(key: string, data: Buffer | Uint8Array): Promise<void> {
    assertUploadWithinLimit(key, data.byteLength);
    const r = await this.getRoot();
    const rel = normalizeStorageKey(key);
    await r.write(rel, Buffer.isBuffer(data) ? data : Buffer.from(data), {
      mkdir: true,
      overwrite: true
    });
  }

  async download(key: string): Promise<Buffer> {
    const r = await this.getRoot();
    const rel = normalizeStorageKey(key);
    try {
      return await r.readBytes(rel);
    } catch (err) {
      if (err instanceof Error && isNotFound(err)) {
        throw new Error(`Key not found: ${key}`, { cause: err });
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const rel = normalizeStorageKey(key);
    // fs-safe's `remove` is idempotent, but the storage contract expects
    // missing-key deletes to throw — fall back to fs.unlink after the path
    // has been resolved through the safe root.
    const r = await this.getRoot();
    const resolved = await r.resolve(rel);
    await fs.unlink(resolved);
  }

  getUrl(key: string): string {
    const rel = normalizeStorageKey(key);
    return pathToFileURL(path.resolve(this.baseDir, rel)).toString();
  }

  async exists(key: string): Promise<boolean> {
    const r = await this.getRoot();
    const rel = normalizeStorageKey(key);
    if (process.platform !== "win32") {
      return r.exists(rel);
    }

    // @openclaw/fs-safe's pinned stat helper is not available on Windows.
    // Resolve through the safe root, then reproduce its relevant alias checks.
    try {
      const resolved = await r.resolve(rel);
      const base = path.resolve(this.baseDir);
      if (!isWithinRoot(base, resolved)) return false;
      const info = await fs.lstat(resolved);
      if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) {
        return false;
      }
      return isWithinRoot(base, await fs.realpath(resolved));
    } catch {
      return false;
    }
  }
}
