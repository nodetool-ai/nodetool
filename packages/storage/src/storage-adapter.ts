/**
 * URI-based asset storage interface used by the runtime.
 *
 * Storage backends (file, S3, Supabase, in-memory) implement this interface
 * and round-trip data through opaque URIs that callers hand back unchanged.
 */
export interface StorageAdapter {
  /** Store an asset and return a URI. */
  store(key: string, data: Uint8Array, contentType?: string): Promise<string>;

  /** Retrieve an asset by URI (as returned by store). */
  retrieve(uri: string): Promise<Uint8Array | null>;

  /** Check if an asset exists by URI. */
  exists(uri: string): Promise<boolean>;

  /** Return the URI that store() would produce for this key, without any I/O. */
  uriForKey(key: string): string;

  /**
   * List entries under a key prefix.
   *
   * When `delimiter` is supplied (FS-readdir style), direct children are
   * returned as `entries` and "subdirectory" prefixes (keys containing the
   * delimiter beyond the prefix) collapse into `commonPrefixes`. Without a
   * delimiter the listing is flat — all keys with the prefix are returned,
   * recursive subkeys included.
   *
   * `prefix` is a storage key (no scheme); the empty string lists from root.
   */
  list(
    prefix: string,
    opts?: { delimiter?: string }
  ): Promise<StorageListResult>;

  /**
   * Delete an entry by URI (as returned by store / uriForKey).
   * Returns `true` if an entry was deleted, `false` if it didn't exist.
   */
  delete(uri: string): Promise<boolean>;

  /** Stat an entry by URI. Returns null if it doesn't exist. */
  stat(uri: string): Promise<StorageStat | null>;
}

export interface StorageEntry {
  /** Storage key (relative to root, no scheme). */
  key: string;
  /** URI you can pass to retrieve / delete / stat. */
  uri: string;
  /** Byte size of the stored object. */
  size: number;
  /** Last-modified timestamp in ms since epoch. */
  modifiedAt: number;
  /** Content-type if the backend stores it; otherwise undefined. */
  contentType?: string;
}

export interface StorageListResult {
  /** Direct entries under the prefix. */
  entries: StorageEntry[];
  /**
   * "Subdirectory" prefixes when `delimiter` was supplied. Each entry is a
   * full key prefix ending with the delimiter (e.g. `reports/`). Empty when
   * `delimiter` was omitted.
   */
  commonPrefixes: string[];
}

export interface StorageStat {
  /** Storage key. */
  key: string;
  /** Byte size. */
  size: number;
  /** Last-modified timestamp in ms since epoch. */
  modifiedAt: number;
  /** Content-type if the backend stores it. */
  contentType?: string;
}
