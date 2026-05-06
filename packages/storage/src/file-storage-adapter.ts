import { FsSafeError, root, type Root } from "@openclaw/fs-safe";
import { mkdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { StorageAdapter } from "./storage-adapter.js";
import { isWithinRoot, normalizeStorageKey } from "./storage-keys.js";

/**
 * File-system storage adapter rooted to a single base directory.
 *
 * URI scheme: `file:///abs/path`. Also accepts `/api/storage/<key>` paths
 * and `https?://host/api/storage/<key>` URLs for round-trip retrieval.
 *
 * All filesystem I/O goes through `@openclaw/fs-safe` so symlink and
 * hardlink aliases pointing outside the base directory are rejected at
 * read/write time, not just at path-resolution time.
 */
export class FileStorageAdapter implements StorageAdapter {
  readonly rootDir: string;
  private readonly rootPromise: Promise<Root>;

  constructor(rootDir: string) {
    const resolvedRoot = resolve(rootDir);
    mkdirSync(resolvedRoot, { recursive: true });
    this.rootDir = realpathSync(resolvedRoot);
    this.rootPromise = root(this.rootDir, {
      hardlinks: "reject",
      symlinks: "reject",
      mkdir: true
    });
  }

  private keyFromUri(uri: string): string | null {
    if (uri.startsWith("file://")) {
      let absolute: string;
      try {
        absolute = resolve(fileURLToPath(uri));
      } catch {
        return null;
      }
      if (!isWithinRoot(this.rootDir, absolute)) return null;
      const rel = absolute.slice(this.rootDir.length).replace(/^[\\/]+/, "");
      return rel || null;
    }
    if (uri.startsWith("/api/storage/") || uri.startsWith("api/storage/")) {
      return uri.replace(/^\/?api\/storage\//, "");
    }
    if (/^https?:\/\//.test(uri)) {
      try {
        const parsed = new URL(uri);
        if (parsed.pathname.startsWith("/api/storage/")) {
          return parsed.pathname.replace(/^\/api\/storage\//, "");
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  async store(
    key: string,
    data: Uint8Array,
    _contentType?: string
  ): Promise<string> {
    const r = await this.rootPromise;
    const rel = normalizeStorageKey(key);
    await r.write(rel, Buffer.from(data), { mkdir: true, overwrite: true });
    const absolutePath = await r.resolve(rel);
    return pathToFileURL(absolutePath).toString();
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const key = this.keyFromUri(uri);
    if (!key) return null;
    const r = await this.rootPromise;
    let rel: string;
    try {
      rel = normalizeStorageKey(key);
    } catch {
      return null;
    }
    try {
      return await r.readBytes(rel);
    } catch (err) {
      if (err instanceof FsSafeError) return null;
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      return null;
    }
  }

  async exists(uri: string): Promise<boolean> {
    const key = this.keyFromUri(uri);
    if (!key) return false;
    const r = await this.rootPromise;
    let rel: string;
    try {
      rel = normalizeStorageKey(key);
    } catch {
      return false;
    }
    try {
      return await r.exists(rel);
    } catch {
      return false;
    }
  }

  uriForKey(key: string): string {
    const rel = normalizeStorageKey(key);
    return pathToFileURL(resolve(this.rootDir, rel)).toString();
  }
}
