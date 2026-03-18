/**
 * Abstract storage interface for all storage backends.
 *
 * Implementations: {@link MemoryStorage}, {@link FileStorage}, {@link S3Storage},
 * {@link SupabaseStorage}.
 */
export interface AbstractStorage {
  /** Upload data under the given key, optionally specifying a MIME content type. */
  upload(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<void>;
  /** Download the data stored under the given key. Throws if the key does not exist. */
  download(key: string): Promise<Buffer>;
  /** Delete the data stored under the given key. */
  delete(key: string): Promise<void>;
  /** Return a URL that can be used to access the given key (scheme varies by backend). */
  getUrl(key: string): string;
  /** Check whether the given key exists in the store. */
  exists(key: string): Promise<boolean>;
}
