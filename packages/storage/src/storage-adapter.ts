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

  /**
   * Mint a short-lived target the *client* can upload to directly, so object
   * bytes never pass through the API process. The key is chosen by the
   * caller (the server), never by the browser, so a client can only ever
   * write where it was told to.
   *
   * Returns `null` on backends with no such concept — the local file store
   * and the in-memory store — which is the signal to fall back to a
   * server-side upload.
   */
  createUploadUrl?(
    key: string,
    opts?: UploadUrlOptions
  ): Promise<UploadTarget | null>;

  /**
   * Mint a short-lived HTTPS URL the *client* can GET the object from, so a
   * cloud object is readable without the bucket being public and without the
   * bytes passing through the API process.
   *
   * Returns `null` when the URI does not belong to this adapter, when the
   * backend has no such concept (the local file store and the in-memory
   * store), or when signing fails — every one of which is the signal to fall
   * back to another URL form.
   */
  createDownloadUrl?(
    uri: string,
    opts?: DownloadUrlOptions
  ): Promise<string | null>;
}

export interface DownloadUrlOptions {
  /** Lifetime in seconds. Backends may clamp this to their own maximum. */
  expiresIn?: number;
}

export interface UploadUrlOptions {
  /** Sent as the object's Content-Type when the client uploads. */
  contentType?: string;
  /** Lifetime in seconds. Backends may clamp this to their own maximum. */
  expiresIn?: number;
}

/** A one-shot, key-scoped upload target handed to a client. */
export interface UploadTarget {
  /** Absolute URL the client sends the bytes to. */
  url: string;
  /** HTTP method the client must use. */
  method: "PUT" | "POST";
  /** Headers the client must send verbatim (e.g. Content-Type). */
  headers: Record<string, string>;
  /** Epoch milliseconds after which the target stops working. */
  expiresAt: number;
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
