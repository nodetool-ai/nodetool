/**
 * Minimal fetch-backed client for the Supabase Storage REST API
 * (`/storage/v1/`), covering exactly the surface this package uses:
 * upload, download, remove, list, createSignedUrl, getPublicUrl.
 *
 * The shape mirrors the supabase-js subset previously consumed
 * (`client.storage.from(bucket).<op>()` returning `{ data, error }`), so
 * call sites and test fakes stay small and structural.
 */

export interface SupabaseError {
  message: string;
}

/** Blob-compatible download payload — only `arrayBuffer()` is consumed. */
export interface SupabaseDownloadData {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** One entry from the Storage `list` endpoint. */
export interface SupabaseObjectEntry {
  name: string;
  /** `null`/absent for pseudo-directory entries. */
  id?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SupabaseListOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

export interface SupabaseUploadOptions {
  contentType?: string;
  upsert?: boolean;
}

export interface SupabaseBucketApi {
  upload(
    key: string,
    data: Buffer | Uint8Array,
    options?: SupabaseUploadOptions
  ): Promise<{ error: SupabaseError | null }>;
  download(
    key: string
  ): Promise<{ data: SupabaseDownloadData | null; error: SupabaseError | null }>;
  remove(keys: string[]): Promise<{ error: SupabaseError | null }>;
  list(
    dir: string,
    options?: SupabaseListOptions
  ): Promise<{ data: SupabaseObjectEntry[] | null; error: SupabaseError | null }>;
  createSignedUrl(
    key: string,
    expiresIn: number
  ): Promise<{ data: { signedUrl: string } | null; error: SupabaseError | null }>;
  getPublicUrl(key: string): { data: { publicUrl: string } };
}

export interface SupabaseStorageApi {
  storage: {
    from(bucket: string): SupabaseBucketApi;
  };
}

/** Encode an object key path segment-by-segment (slashes stay literal). */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Map a Storage API error body (`{ statusCode, error, message }`) to a
 * SupabaseError, falling back to the HTTP status.
 */
async function readError(response: Response): Promise<SupabaseError> {
  let message = "";
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.message === "string" && body.message) {
      message = body.message;
    } else if (typeof body.error === "string" && body.error) {
      message = body.error;
    }
  } catch {
    // Non-JSON error body — use the status fallback below.
  }
  return {
    message:
      message || `Supabase Storage request failed with status ${response.status}`
  };
}

/**
 * Create a fetch-backed Supabase Storage client.
 */
export function createSupabaseStorageClient(
  supabaseUrl: string,
  supabaseKey: string
): SupabaseStorageApi {
  const base = supabaseUrl.replace(/\/+$/, "");
  const authHeaders: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  };

  return {
    storage: {
      from(bucket: string): SupabaseBucketApi {
        const objectUrl = (key: string): string =>
          `${base}/storage/v1/object/${bucket}/${encodeKey(key)}`;

        return {
          async upload(key, data, options = {}) {
            const headers: Record<string, string> = { ...authHeaders };
            if (options.contentType) {
              headers["Content-Type"] = options.contentType;
            }
            if (options.upsert) {
              headers["x-upsert"] = "true";
            }
            const response = await fetch(objectUrl(key), {
              method: "POST",
              headers,
              body: data as unknown as BodyInit
            });
            if (!response.ok) {
              return { error: await readError(response) };
            }
            return { error: null };
          },

          async download(key) {
            const response = await fetch(objectUrl(key), {
              method: "GET",
              headers: authHeaders
            });
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const bytes = await response.arrayBuffer();
            return {
              data: { arrayBuffer: async () => bytes },
              error: null
            };
          },

          async remove(keys) {
            const response = await fetch(
              `${base}/storage/v1/object/${bucket}`,
              {
                method: "DELETE",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({ prefixes: keys })
              }
            );
            if (!response.ok) {
              return { error: await readError(response) };
            }
            return { error: null };
          },

          async list(dir, options = {}) {
            const response = await fetch(
              `${base}/storage/v1/object/list/${bucket}`,
              {
                method: "POST",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({
                  prefix: dir,
                  limit: options.limit ?? 100,
                  offset: options.offset ?? 0,
                  sortBy: { column: "name", order: "asc" },
                  ...(options.search ? { search: options.search } : {})
                })
              }
            );
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const data = (await response.json()) as SupabaseObjectEntry[];
            return { data, error: null };
          },

          async createSignedUrl(key, expiresIn) {
            const response = await fetch(
              `${base}/storage/v1/object/sign/${bucket}/${encodeKey(key)}`,
              {
                method: "POST",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({ expiresIn })
              }
            );
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const body = (await response.json()) as { signedURL?: string };
            if (!body.signedURL) {
              return {
                data: null,
                error: { message: "Supabase sign response missing signedURL" }
              };
            }
            return {
              data: { signedUrl: `${base}/storage/v1${body.signedURL}` },
              error: null
            };
          },

          getPublicUrl(key) {
            return {
              data: {
                publicUrl: `${base}/storage/v1/object/public/${bucket}/${key}`
              }
            };
          }
        };
      }
    }
  };
}
