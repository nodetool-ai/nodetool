import { FsSafeError, root, type Root } from "@openclaw/fs-safe";
import { mkdirSync, realpathSync } from "node:fs";
import { readdir, stat as fsStat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  StorageAdapter,
  StorageEntry,
  StorageListResult,
  StorageStat
} from "./storage-adapter.js";
import { isWithinRoot, normalizeStorageKey } from "./storage-keys.js";
import { assertUploadWithinLimit } from "./storage-limits.js";

/**
 * Percent-decode a storage key extracted from an `/api/storage/<key>` URL so it
 * matches the on-disk key. The HTTP route (`storage-api.ts`) decodes the same
 * way; keeping them in sync means `retrieve("…/my%20file.png")` resolves to
 * `my file.png`. Malformed escapes (`decodeURIComponent` throws) are left as-is.
 */
function decodeKey(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

/**
 * Return `uri` up to (excluding) the first `?` or `#`. A linear index scan, not
 * a `/[?#].*$/` regex — that backtracks polynomially on adversarial input and
 * CodeQL flags it as a ReDoS risk.
 */
function stripUriSuffix(uri: string): string {
  const q = uri.indexOf("?");
  const h = uri.indexOf("#");
  let cut = -1;
  if (q < 0) cut = h;
  else if (h < 0) cut = q;
  else cut = Math.min(q, h);
  return cut < 0 ? uri : uri.slice(0, cut);
}

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
    // Prevent unhandled rejection when no method is ever called on this
    // adapter (e.g. tests that construct it but only inspect tool schemas).
    // Real callers still receive the error via their own `await`.
    this.rootPromise.catch(() => {});
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
      // Strip any ?query / #fragment before decoding — the HTTP route keys off
      // the decoded path only (storage-api.ts decodeURIComponent). Cut at the
      // first `?`/`#` with a linear scan rather than a backtracking regex
      // (CodeQL flags `/[?#].*$/` as polynomial on uncontrolled input).
      const withoutSuffix = stripUriSuffix(uri);
      return decodeKey(withoutSuffix.replace(/^\/?api\/storage\//, ""));
    }
    if (/^https?:\/\//.test(uri)) {
      try {
        const parsed = new URL(uri);
        if (parsed.pathname.startsWith("/api/storage/")) {
          return decodeKey(parsed.pathname.replace(/^\/api\/storage\//, ""));
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
    assertUploadWithinLimit(key, data.byteLength);
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

  async list(
    prefix: string,
    opts: { delimiter?: string } = {}
  ): Promise<StorageListResult> {
    const delimiter = opts.delimiter ?? null;
    let normalizedPrefix = "";
    if (prefix && prefix !== "" && prefix !== "/") {
      try {
        normalizedPrefix = normalizeStorageKey(prefix);
      } catch {
        return { entries: [], commonPrefixes: [] };
      }
    }

    const entries: StorageEntry[] = [];
    const commonPrefixes = new Set<string>();

    if (delimiter === "/") {
      // Hierarchical listing — direct children of `prefix` only. Mirrors
      // FS readdir: subdirectories collapse into commonPrefixes; files
      // become entries.
      const dirAbs = resolve(this.rootDir, normalizedPrefix);
      if (!isWithinRoot(this.rootDir, dirAbs)) {
        return { entries: [], commonPrefixes: [] };
      }
      let children: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      try {
        children = await readdir(dirAbs, { withFileTypes: true });
      } catch {
        return { entries: [], commonPrefixes: [] };
      }
      for (const child of children) {
        const childKey = normalizedPrefix
          ? `${normalizedPrefix}/${child.name}`
          : child.name;
        if (child.isDirectory()) {
          commonPrefixes.add(`${childKey}/`);
          continue;
        }
        if (!child.isFile()) continue;
        const childAbs = join(dirAbs, child.name);
        try {
          const st = await fsStat(childAbs);
          entries.push({
            key: childKey,
            uri: pathToFileURL(childAbs).toString(),
            size: st.size,
            modifiedAt: st.mtimeMs
          });
        } catch {
          // skip unreadable
        }
      }
      return {
        entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
        commonPrefixes: [...commonPrefixes].sort()
      };
    }

    // Flat listing — all keys under prefix, recursive.
    const baseAbs = resolve(this.rootDir, normalizedPrefix);
    if (!isWithinRoot(this.rootDir, baseAbs)) {
      return { entries: [], commonPrefixes: [] };
    }
    const stack: string[] = [baseAbs];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let children: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
      try {
        children = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        const childAbs = join(dir, child.name);
        if (child.isDirectory()) {
          stack.push(childAbs);
          continue;
        }
        if (!child.isFile()) continue;
        try {
          const st = await fsStat(childAbs);
          const rel = childAbs.slice(this.rootDir.length).replace(/^[\\/]+/, "");
          entries.push({
            key: rel,
            uri: pathToFileURL(childAbs).toString(),
            size: st.size,
            modifiedAt: st.mtimeMs
          });
        } catch {
          // skip
        }
      }
    }
    return {
      entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
      commonPrefixes: []
    };
  }

  async delete(uri: string): Promise<boolean> {
    const key = this.keyFromUri(uri);
    if (!key) return false;
    let rel: string;
    try {
      rel = normalizeStorageKey(key);
    } catch {
      return false;
    }
    const abs = resolve(this.rootDir, rel);
    if (!isWithinRoot(this.rootDir, abs)) return false;
    try {
      await unlink(abs);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return false;
      if (err instanceof FsSafeError) return false;
      return false;
    }
  }

  async stat(uri: string): Promise<StorageStat | null> {
    const key = this.keyFromUri(uri);
    if (!key) return null;
    let rel: string;
    try {
      rel = normalizeStorageKey(key);
    } catch {
      return null;
    }
    const abs = resolve(this.rootDir, rel);
    if (!isWithinRoot(this.rootDir, abs)) return null;
    try {
      const st = await fsStat(abs);
      if (!st.isFile()) return null;
      return {
        key: rel,
        size: st.size,
        modifiedAt: st.mtimeMs
      };
    } catch {
      return null;
    }
  }
}
