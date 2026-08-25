/**
 * Minimal fetch-backed client for the Supabase Storage REST API
 * (`/storage/v1/`), covering exactly the surface this package uses:
 * upload, download, remove, list, createSignedUrl, getPublicUrl.
 *
 * The shape mirrors the supabase-js subset previously consumed
 * (`client.storage.from(bucket).<op>()` returning `{ data, error }`), so
 * call sites and test fakes stay small and structural.
 */

interface SupabaseError {
  message: string;
}

/** Blob-compatible download payload — only `arrayBuffer()` is consumed. */
interface SupabaseDownloadData {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Object metadata the Storage `list` endpoint reports for a stored object. */
export interface SupabaseObjectMetadata {
  size?: number;
  mimetype?: string;
  cacheControl?: string;
  lastModified?: string;
  eTag?: string;
}

/** One entry from the Storage `list` endpoint. */
export interface SupabaseObjectEntry {
  name: string;
  /** `null`/absent for pseudo-directory entries. */
  id?: string | null;
  updated_at?: string | null;
  /** `null`/absent for pseudo-directory entries. */
  metadata?: SupabaseObjectMetadata | null;
}

interface SupabaseListOptions {
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
  ): Promise<{
    data: SupabaseDownloadData | null;
    error: SupabaseError | null;
  }>;
  remove(keys: string[]): Promise<{ error: SupabaseError | null }>;
  list(
    dir: string,
    options?: SupabaseListOptions
  ): Promise<{
    data: SupabaseObjectEntry[] | null;
    error: SupabaseError | null;
  }>;
  createSignedUrl(
    key: string,
    expiresIn: number
  ): Promise<{
    data: { signedUrl: string } | null;
    error: SupabaseError | null;
  }>;
  /**
   * Mint a one-shot upload URL for `key`. The caller (typically a browser)
   * PUTs the bytes straight to the returned URL, so object bytes never pass
   * through this process. The token is scoped to this exact key — it cannot
   * be redirected at another object.
   */
  createSignedUploadUrl(key: string): Promise<{
    data: { signedUrl: string; token: string } | null;
    error: SupabaseError | null;
  }>;
  getPublicUrl(key: string): { data: { publicUrl: string } };
}

export interface SupabaseStorageApi {
  storage: {
    from(bucket: string): SupabaseBucketApi;
  };
}

/** Body of `POST /object/sign/…`: the signed path, relative to `/storage/v1`. */
interface SignResponseBody {
  signedURL?: string;
}

/** Body of `POST /object/upload/sign/…`: the token URL, also relative. */
interface UploadSignResponseBody {
  url?: string;
}

/** HTTP request headers for one Storage call: header name → value. */
interface RequestHeaders {
  [name: string]: string;
}

/** Encode an object key path segment-by-segment (slashes stay literal). */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Error body the Storage API returns. Both fields are off the wire, so neither
 * is trusted to be a string until `nonEmptyString` says so.
 */
interface SupabaseErrorBody {
  message?: unknown;
  error?: unknown;
}

function nonEmptyString(value: SupabaseErrorBody["message"]): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Map a Storage API error body (`{ statusCode, error, message }`) to a
 * SupabaseError, falling back to the HTTP status.
 */
async function readError(response: Response): Promise<SupabaseError> {
  let message = "";
  try {
    const body: SupabaseErrorBody = await response.json();
    if (nonEmptyString(body.message)) {
      message = body.message;
    } else if (nonEmptyString(body.error)) {
      message = body.error;
    }
  } catch {
    // Non-JSON error body — use the status fallback below.
  }
  return {
    message:
      message ||
      `Supabase Storage request failed with status ${response.status}`
  };
}

/**
 * Create a fetch-backed Supabase Storage client.
 */
export function createSupabaseStorageClient(
  supabaseUrl: string,
  supabaseKey: string
): SupabaseStorageApi {
  let base = supabaseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  const authHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  } satisfies RequestHeaders;

  return {
    storage: {
      from(bucket: string): SupabaseBucketApi {
        const objectUrl = (key: string): string =>
          `${base}/storage/v1/object/${bucket}/${encodeKey(key)}`;

        return {
          async upload(key, data, options = {}) {
            const headers: RequestHeaders = { ...authHeaders };
            if (options.contentType) {
              headers["Content-Type"] = options.contentType;
            }
            if (options.upsert) {
              headers["x-upsert"] = "true";
            }
            const response = await fetch(objectUrl(key), {
              method: "POST",
              headers,
              // SAFETY: `BodyInit` names `ArrayBufferView<ArrayBuffer>`, while
              // `Buffer`/`Uint8Array` are declared over `ArrayBufferLike`;
              // fetch accepts either at runtime.
              body: data as BodyInit
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
            type ListBodyFields = {
              prefix: string;
              limit: number;
              offset: number;
              sortBy: { column: string; order: string };
              search?: string;
            };
            const listBody: ListBodyFields = {
              prefix: dir,
              limit: options.limit ?? 100,
              offset: options.offset ?? 0,
              sortBy: { column: "name", order: "asc" }
            };
            if (options.search) {
              listBody.search = options.search;
            }
            const response = await fetch(
              `${base}/storage/v1/object/list/${bucket}`,
              {
                method: "POST",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify(listBody)
              }
            );
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const data: SupabaseObjectEntry[] = await response.json();
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
            const body: SignResponseBody = await response.json();
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

          async createSignedUploadUrl(key) {
            const response = await fetch(
              `${base}/storage/v1/object/upload/sign/${bucket}/${encodeKey(key)}`,
              { method: "POST", headers: authHeaders }
            );
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const body: UploadSignResponseBody = await response.json();
            if (!body.url) {
              return {
                data: null,
                error: { message: "Supabase sign response missing url" }
              };
            }
            // `url` comes back relative (`/object/upload/sign/<bucket>/<key>?token=…`).
            const signedUrl = `${base}/storage/v1${body.url}`;
            const token = new URL(signedUrl).searchParams.get("token") ?? "";
            if (!token) {
              return {
                data: null,
                error: { message: "Supabase sign response missing token" }
              };
            }
            return { data: { signedUrl, token }, error: null };
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
