import { mkdirSync, realpathSync } from "node:fs";
import {
  lstat,
  readdir,
  readFile,
  realpath,
  stat as fsStat,
  unlink
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openSafeRoot, type SafeRoot } from "./safe-root.js";
import type {
  StorageAdapter,
  StorageEntry,
  StorageListResult,
  StorageStat,
  StoreIfAbsentOptions
} from "./storage-adapter.js";
import { compareStorageKeys, normalizeStorageKey } from "./storage-keys.js";
import { getMaxLocalUploadBytes } from "./storage-limits.js";
import { getDefaultAssetsPath } from "@nodetool-ai/config";

export function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

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
 * True for the errors a missing path raises. A listing treats these as an
 * empty directory and rethrows every other one: callers decide from a listing
 * whether a directory holds another project's folder, and an unreadable
 * directory is not an empty one.
 */
function isAbsentError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Return `uri` up to (excluding) the first `?` or `#`. A linear index scan
 * rather than a `/[?#].*$/` regex, which CodeQL flags as a potential ReDoS
 * pattern on uncontrolled input.
 */
function stripUriSuffix(uri: string): string {
  const q = uri.indexOf("?");
  const h = uri.indexOf("#");
  let cut = -1;
  if (q < 0) {
    cut = h;
  } else if (h < 0) {
    cut = q;
  } else {
    cut = Math.min(q, h);
  }
  return cut < 0 ? uri : uri.slice(0, cut);
}

/**
 * Maps a storage key with no object under the root to the absolute path of a
 * file the key's asset references in place, or null when it has none.
 */
export type ExternalPathLookup = (key: string) => Promise<string | null>;

let assetFolderLookup: ExternalPathLookup | null = null;

/**
 * Install the lookup that every adapter over the asset folder resolves a
 * missed key through when it was built without one of its own.
 *
 * Many hosts build their own `FileStorageAdapter` over the asset folder: the
 * CLI commands, the app and script runners. An asset whose bytes are a file
 * in its project folder has no object under its key, so such an adapter
 * could not read an asset the same run had just created. The host that
 * installs asset persistence installs this with it.
 *
 * It applies only to an adapter rooted at the asset folder
 * (`getDefaultAssetsPath()`). A workspace or a temp root never resolves a
 * key through asset rows.
 */
export function setAssetFolderPathLookup(
  lookup: ExternalPathLookup | null
): void {
  assetFolderLookup = lookup;
}

/** The real path of the asset folder, or its resolved path when it is absent. */
function assetFolderRoot(): string {
  const resolved = resolve(getDefaultAssetsPath());
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export interface FileStorageAdapterOptions {
  /**
   * Resolves keys of assets whose bytes stay outside the root (a file in a
   * project folder, a large local import). Consulted only after the root
   * misses, and only by reads:
   * `retrieve`, `exists`, `stat`, and `localPath`. `store`, `storeFile`, and
   * `delete` never touch the external file.
   *
   * Left out, an adapter over the asset folder uses the lookup installed
   * with {@link setAssetFolderPathLookup}. Pass `null` for an adapter that
   * must answer a key only from the object stored under it, such as a
   * caller that is about to delete that object.
   */
  externalPathLookup?: ExternalPathLookup | null;
}

/**
 * File-system storage adapter rooted to a single base directory.
 *
 * URI scheme: `file:///abs/path`. Also accepts `/api/storage/<key>` paths
 * and `https?://host/api/storage/<key>` URLs for round-trip retrieval.
 *
 * Reads and writes of stored objects go through {@link SafeRoot}, so symlink
 * and hardlink aliases pointing outside the base directory are rejected at
 * read/write time, not just at path-resolution time.
 */
export class FileStorageAdapter implements StorageAdapter {
  readonly rootDir: string;
  private readonly rootPromise: Promise<SafeRoot>;
  private readonly externalPathLookup: ExternalPathLookup | null;
  /** False for an adapter built to answer from stored objects alone. */
  private readonly usesAssetFolderLookup: boolean;

  constructor(rootDir: string, options: FileStorageAdapterOptions = {}) {
    this.externalPathLookup = options.externalPathLookup ?? null;
    this.usesAssetFolderLookup = options.externalPathLookup !== null;
    const resolvedRoot = resolve(rootDir);
    mkdirSync(resolvedRoot, { recursive: true });
    this.rootDir = realpathSync(resolvedRoot);
    this.rootPromise = openSafeRoot(this.rootDir);
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
      // first `?`/`#` with a linear scan rather than a `/[?#].*$/` regex, which
      // CodeQL flags as a potential ReDoS pattern on uncontrolled input.
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

  /**
   * The lookup this adapter resolves a missed key through: its own, else the
   * one installed for the asset folder when this adapter is rooted there.
   */
  private pathLookup(): ExternalPathLookup | null {
    if (this.externalPathLookup) return this.externalPathLookup;
    if (!this.usesAssetFolderLookup || !assetFolderLookup) return null;
    return this.rootDir === assetFolderRoot() ? assetFolderLookup : null;
  }

  /** The in-place file behind `rel`, or null when the lookup has none. */
  private async externalPathFor(rel: string): Promise<string | null> {
    const lookup = this.pathLookup();
    if (!lookup) return null;
    try {
      return await lookup(rel);
    } catch {
      return null;
    }
  }

  /** Stat the in-place file behind `rel`, or null when there is no such file. */
  private async statExternal(
    rel: string
  ): Promise<{ path: string; size: number; modifiedAt: number } | null> {
    const external = await this.externalPathFor(rel);
    if (!external) return null;
    try {
      const st = await fsStat(external);
      if (!st.isFile()) return null;
      return { path: external, size: st.size, modifiedAt: st.mtimeMs };
    } catch {
      return null;
    }
  }

  async store(
    key: string,
    data: Uint8Array,
    _contentType?: string
  ): Promise<string> {
    const max = getMaxLocalUploadBytes();
    if (data.byteLength > max) {
      throw new Error(
        `Upload for key "${key}" exceeds maximum size: ${data.byteLength} > ${max} bytes ` +
          `(set NODETOOL_MAX_UPLOAD_BYTES to raise the limit)`
      );
    }
    const r = await this.rootPromise;
    const rel = normalizeStorageKey(key);
    await r.write(rel, data);
    return this.uriForKey(rel);
  }

  async storeIfAbsent(
    key: string,
    data: Uint8Array,
    _contentType?: string,
    options: StoreIfAbsentOptions = {}
  ): Promise<string | null> {
    const max = getMaxLocalUploadBytes();
    if (data.byteLength > max) {
      throw new Error(
        `Upload for key "${key}" exceeds maximum size: ${data.byteLength} > ${max} bytes ` +
          `(set NODETOOL_MAX_UPLOAD_BYTES to raise the limit)`
      );
    }
    const r = await this.rootPromise;
    const rel = normalizeStorageKey(key);
    const created = await r.create(rel, data, {
      stagingName: options.stagingName
    });
    return created ? this.uriForKey(rel) : null;
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
      return await r.readBytes(rel, { maxBytes: getMaxLocalUploadBytes() });
    } catch {
      // A key that cannot be read — missing, denied, or outside the root — is
      // reported the same way as one that was never stored.
    }
    const external = await this.statExternal(rel);
    if (!external || external.size > getMaxLocalUploadBytes()) return null;
    try {
      return await readFile(external.path);
    } catch {
      return null;
    }
  }

  /** Atomically publish a staged local upload using a bounded streaming copy. */
  async storeFile(key: string, sourcePath: string): Promise<string> {
    const r = await this.rootPromise;
    const rel = normalizeStorageKey(key);
    await r.copyIn(rel, sourcePath, { maxBytes: getMaxLocalUploadBytes() });
    return this.uriForKey(rel);
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
      if (await r.exists(rel)) return true;
    } catch {
      // Fall through to the in-place lookup.
    }
    return (await this.statExternal(rel)) !== null;
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
      } catch (error) {
        // Only a directory that is not there is empty. A failure to read one
        // that is there must not read as empty (see `isAbsentError`).
        if (isAbsentError(error)) return { entries: [], commonPrefixes: [] };
        throw error;
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
        } catch (error) {
          // Gone since the listing was read.
          if (!isAbsentError(error)) throw error;
        }
      }
      return {
        entries: entries.sort((a, b) => compareStorageKeys(a.key, b.key)),
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
      } catch (error) {
        if (isAbsentError(error)) continue;
        throw error;
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
          const rel = childAbs
            .slice(this.rootDir.length)
            .replace(/^[\\/]+/, "")
            .replaceAll("\\", "/");
          entries.push({
            key: rel,
            uri: pathToFileURL(childAbs).toString(),
            size: st.size,
            modifiedAt: st.mtimeMs
          });
        } catch (error) {
          // Gone since the listing was read.
          if (!isAbsentError(error)) throw error;
        }
      }
    }
    return {
      entries: entries.sort((a, b) => compareStorageKeys(a.key, b.key)),
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
    // Only the object under the root is removed. An in-place file behind the
    // key belongs to the user and is never deleted.
    try {
      await unlink(abs);
      return true;
    } catch {
      // Nothing was deleted, whether the object was already gone or the
      // unlink was refused.
      return false;
    }
  }

  /**
   * As {@link stat}, but a file the system cannot stat for a reason other
   * than its absence throws. A key outside the root names no object.
   */
  async statStrict(uri: string): Promise<StorageStat | null> {
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
      if (st.isFile()) {
        return { key: rel, size: st.size, modifiedAt: st.mtimeMs };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
    const external = await this.statExternal(rel);
    return external
      ? { key: rel, size: external.size, modifiedAt: external.modifiedAt }
      : null;
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
      if (st.isFile()) {
        return { key: rel, size: st.size, modifiedAt: st.mtimeMs };
      }
    } catch {
      // Fall through to the in-place lookup.
    }
    const external = await this.statExternal(rel);
    return external
      ? { key: rel, size: external.size, modifiedAt: external.modifiedAt }
      : null;
  }

  /**
   * The file behind `uri`: the object under the root when there is one, else
   * the in-place file of an external asset. Applies the same boundary as the
   * reads: a symlink, a hardlinked file, or a path that resolves outside the
   * root is not handed out.
   */
  async localPath(uri: string): Promise<string | null> {
    const key = this.keyFromUri(uri);
    if (!key) return null;
    let rel: string;
    try {
      rel = normalizeStorageKey(key);
    } catch {
      return null;
    }
    const absolute = resolve(this.rootDir, rel);
    if (!isWithinRoot(this.rootDir, absolute)) return null;
    try {
      const info = await lstat(absolute);
      if (info.isFile() && info.nlink <= 1) {
        const real = await realpath(absolute);
        if (isWithinRoot(this.rootDir, real)) return real;
      }
    } catch {
      // Fall through to the in-place lookup.
    }
    return (await this.statExternal(rel))?.path ?? null;
  }
}
