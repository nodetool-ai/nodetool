import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { StorageAdapter } from "./storage-adapter.js";
import { isWithinRoot, normalizeStorageKey } from "./storage-keys.js";

/**
 * File-system storage adapter rooted to a single base directory.
 *
 * URI scheme: `file:///abs/path`. Also accepts `/api/storage/<key>` paths
 * and `https?://host/api/storage/<key>` URLs for round-trip retrieval.
 */
export class FileStorageAdapter implements StorageAdapter {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
  }

  private resolvePathFromKey(key: string): string {
    const normalized = normalizeStorageKey(key);
    const absolute = resolve(join(this.rootDir, normalized));
    if (!isWithinRoot(this.rootDir, absolute)) {
      throw new Error(`Storage key escapes root: ${key}`);
    }
    return absolute;
  }

  private resolvePathFromUri(uri: string): string | null {
    let absolute: string | null = null;

    if (uri.startsWith("file://")) {
      try {
        absolute = resolve(fileURLToPath(uri));
      } catch {
        return null;
      }
    } else if (
      uri.startsWith("/api/storage/") ||
      uri.startsWith("api/storage/")
    ) {
      const key = uri.replace(/^\/?api\/storage\//, "");
      absolute = this.resolvePathFromKey(key);
    } else if (/^https?:\/\//.test(uri)) {
      try {
        const parsed = new URL(uri);
        if (parsed.pathname.startsWith("/api/storage/")) {
          const key = parsed.pathname.replace(/^\/api\/storage\//, "");
          absolute = this.resolvePathFromKey(key);
        }
      } catch {
        return null;
      }
    } else {
      return null;
    }

    if (absolute === null || !isWithinRoot(this.rootDir, absolute)) {
      return null;
    }
    return absolute;
  }

  async store(
    key: string,
    data: Uint8Array,
    _contentType?: string
  ): Promise<string> {
    const absolutePath = this.resolvePathFromKey(key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
    return pathToFileURL(absolutePath).toString();
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const absolutePath = this.resolvePathFromUri(uri);
    if (!absolutePath) return null;
    try {
      return await readFile(absolutePath);
    } catch {
      return null;
    }
  }

  async exists(uri: string): Promise<boolean> {
    const absolutePath = this.resolvePathFromUri(uri);
    if (!absolutePath) return false;
    try {
      await access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
