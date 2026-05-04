/**
 * URI-based asset storage interface used by the runtime.
 *
 * Storage backends (file, S3, Supabase) implement this interface and
 * round-trip data through opaque URIs that callers hand back unchanged.
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
}
