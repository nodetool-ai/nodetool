/**
 * The asset store of a deployment that keeps no local files, extended with
 * the same key-miss lookup the local file store has.
 *
 * A reader asks for `<owner>/<assetId>.<ext>`. An asset whose file is in its
 * project's folder has no object at that key, so a miss is resolved through
 * the asset row to the file and read through the folder's `Workspace`. The
 * local `FileStorageAdapter` does the same with a path
 * (`externalPathLookup`). An object store has no path to hand out, so it
 * reads the bytes instead.
 */
import { FileStorageAdapter } from "@nodetool-ai/storage";
import type {
  DownloadUrlOptions,
  StorageAdapter,
  StorageListResult,
  StorageStat,
  StoreIfAbsentOptions,
  UploadTarget,
  UploadUrlOptions
} from "@nodetool-ai/storage";
import { lookupProjectAssetFile } from "./external-asset-lookup.js";
import {
  localProjectAssetPath,
  type ProjectAssetFile
} from "./project-asset-file.js";

/** Maps a storage key with no object to the project folder file behind it. */
export type ProjectAssetFileLookup = (
  key: string
) => Promise<ProjectAssetFile | null>;

/**
 * The key `uri` names in `adapter`, or null when the URI is not one this
 * adapter mints. Every adapter builds a URI as a fixed base followed by the
 * key, so the base is read off a one-character key.
 */
export function storageKeyForUri(
  adapter: StorageAdapter,
  uri: string
): string | null {
  const base = adapter.uriForKey("k").slice(0, -1);
  if (!uri.startsWith(base) || uri.length === base.length) return null;
  return uri.slice(base.length);
}

export class ProjectAssetStorageAdapter implements StorageAdapter {
  storeIfAbsent?: (
    key: string,
    data: Uint8Array,
    contentType?: string,
    options?: StoreIfAbsentOptions
  ) => Promise<string | null>;
  createUploadUrl?: (
    key: string,
    opts?: UploadUrlOptions
  ) => Promise<UploadTarget | null>;
  createDownloadUrl?: (
    uri: string,
    opts?: DownloadUrlOptions
  ) => Promise<string | null>;

  constructor(
    readonly inner: StorageAdapter,
    private readonly lookup: ProjectAssetFileLookup = lookupProjectAssetFile
  ) {
    // Callers test for these methods to choose an upload or download path,
    // so each exists here only when the wrapped adapter has it.
    if (inner.storeIfAbsent) {
      this.storeIfAbsent = (key, data, contentType, options) =>
        inner.storeIfAbsent?.(key, data, contentType, options) ??
        Promise.resolve(null);
    }
    if (inner.createUploadUrl) {
      this.createUploadUrl = (key, opts) =>
        inner.createUploadUrl?.(key, opts) ?? Promise.resolve(null);
    }
    if (inner.createDownloadUrl) {
      this.createDownloadUrl = (uri, opts) =>
        inner.createDownloadUrl?.(uri, opts) ?? Promise.resolve(null);
    }
  }

  /** The project folder file behind `uri`, or null when the lookup has none. */
  private async fileFor(uri: string): Promise<ProjectAssetFile | null> {
    const key = storageKeyForUri(this.inner, uri);
    if (!key) return null;
    try {
      return await this.lookup(key);
    } catch {
      // A lookup that fails leaves the key as missing as the store said.
      return null;
    }
  }

  store(key: string, data: Uint8Array, contentType?: string): Promise<string> {
    return this.inner.store(key, data, contentType);
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    const stored = await this.inner.retrieve(uri);
    if (stored) return stored;
    const file = await this.fileFor(uri);
    if (!file) return null;
    try {
      return await file.workspace.read(file.path);
    } catch {
      return null;
    }
  }

  async exists(uri: string): Promise<boolean> {
    if (await this.inner.exists(uri)) return true;
    const file = await this.fileFor(uri);
    return file ? file.workspace.exists(file.path) : false;
  }

  uriForKey(key: string): string {
    return this.inner.uriForKey(key);
  }

  list(
    prefix: string,
    opts?: { delimiter?: string }
  ): Promise<StorageListResult> {
    return this.inner.list(prefix, opts);
  }

  /** Only the object under the key. A project folder file is not removed here. */
  delete(uri: string): Promise<boolean> {
    return this.inner.delete(uri);
  }

  async stat(uri: string): Promise<StorageStat | null> {
    const stored = await this.inner.stat(uri);
    if (stored) return stored;
    const key = storageKeyForUri(this.inner, uri);
    const file = key ? await this.fileFor(uri) : null;
    if (!key || !file) return null;
    try {
      const info = await file.workspace.stat(file.path);
      if (!info || info.isDirectory) return null;
      return {
        key,
        size: info.size,
        modifiedAt: info.modifiedAt,
        contentType: info.contentType
      };
    } catch {
      return null;
    }
  }

  async localPath(uri: string): Promise<string | null> {
    const stored = await this.inner.localPath(uri);
    if (stored) return stored;
    const file = await this.fileFor(uri);
    return file ? localProjectAssetPath(file) : null;
  }
}

/**
 * `adapter` without the lookup through asset rows: a key is answered only
 * from the object stored under it.
 *
 * The asset store answers a key that has no object, or whose object could
 * not be read, from the file its asset row points at. A caller that is about
 * to delete an object must know what is under the key itself, so it reads,
 * stats and deletes through this view. An adapter that has no such lookup is
 * returned as it is.
 */
export function storedObjectsOf(adapter: StorageAdapter): StorageAdapter {
  if (adapter instanceof ProjectAssetStorageAdapter) return adapter.inner;
  if (adapter instanceof FileStorageAdapter) {
    // Null, not left out: an adapter over the asset folder would otherwise
    // take the lookup installed for that folder.
    return new FileStorageAdapter(adapter.rootDir, { externalPathLookup: null });
  }
  return adapter;
}
