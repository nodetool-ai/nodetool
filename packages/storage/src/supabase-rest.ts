/**
 * Minimal fetch-backed client for the Supabase Storage REST API
 * (`/storage/v1/`), covering exactly the surface this package uses:
 * upload, download, info, remove, list, createSignedUrl, getPublicUrl.
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

/** Object metadata the Storage `list` endpoint reports, as this package reads it. */
export interface SupabaseObjectMetadata {
  size?: number;
  mimetype?: string;
}

/** One object's metadata, read off a `HEAD` of its key. */
export interface SupabaseObjectInfo {
  size: number;
  contentType?: string;
  /** Epoch milliseconds, absent when the response has no `Last-Modified`. */
  modifiedAt?: number;
}

/** One entry from the Storage `list` endpoint. */
export interface SupabaseObjectEntry {
  name: string;
  /** `null`/absent for pseudo-directory entries. */
  id?: string | null;
  updated_at?: string | null;
  /** Absent for pseudo-directory entries. */
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
  /** Metadata for exactly `key`. `data` is null when the object is absent. */
  info(key: string): Promise<{
    data: SupabaseObjectInfo | null;
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

/** Headers for one Storage request: name → value. */
interface StorageRequestHeaders {
  [name: string]: string;
}

/** Encode an object key path segment-by-segment (slashes stay literal). */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** The `object/sign` response body: a path relative to `/storage/v1`. */
interface SupabaseSignResponse {
  signedURL?: string;
}

/** The `object/upload/sign` response body: a path relative to `/storage/v1`. */
interface SupabaseSignUploadResponse {
  url?: string;
}

/** The error body the Storage API returns on a non-2xx response. */
interface SupabaseErrorBody {
  statusCode?: string;
  error?: string;
  message?: string;
}

/**
 * Map a Storage API error body (`{ statusCode, error, message }`) to a
 * SupabaseError, falling back to the HTTP status.
 */
async function readError(response: Response): Promise<SupabaseError> {
  let message = "";
  try {
    const body: SupabaseErrorBody = await response.json();
    message = body.message || body.error || "";
  } catch {
    // Non-JSON error body — use the status fallback below.
  }
  return {
    message:
      message ||
      `Supabase Storage request failed with status ${response.status}`
  };
}

export interface SupabaseStorageClientOptions {
  /** Attempts per request, the first included. Default 4. */
  maxAttempts?: number;
  /** Injected wait between attempts (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 4_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Full-jitter exponential backoff: a burst of uploads that all hit an
 * exhausted pool must not retry in lockstep and exhaust it again.
 */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return Math.round(ceiling * (0.5 + Math.random() / 2));
}

/**
 * Create a fetch-backed Supabase Storage client.
 *
 * Every request retries a thrown network error, a 429 and a 5xx. The Storage
 * service answers 5xx when its own database pool is exhausted ("Too many
 * connections issued to the database"), which clears within seconds. Every
 * operation here is safe to repeat: uploads from this package always upsert,
 * sign calls mint a fresh token, and the rest read or delete.
 */
export function createSupabaseStorageClient(
  supabaseUrl: string,
  supabaseKey: string,
  options: SupabaseStorageClientOptions = {}
): SupabaseStorageApi {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const sleep = options.sleep ?? defaultSleep;
  const send = async (url: string, init: RequestInit): Promise<Response> => {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        await sleep(backoffMs(attempt));
        continue;
      }
      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt >= maxAttempts) return response;
      // Drain the discarded body so the keep-alive connection is reusable.
      await response.arrayBuffer().catch(() => undefined);
      await sleep(backoffMs(attempt));
    }
  };
  let base = supabaseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  const authHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  } satisfies Record<string, string>;

  return {
    storage: {
      from(bucket: string): SupabaseBucketApi {
        const objectUrl = (key: string): string =>
          `${base}/storage/v1/object/${bucket}/${encodeKey(key)}`;

        return {
          async upload(key, data, options = {}) {
            const headers: StorageRequestHeaders = { ...authHeaders };
            if (options.contentType) {
              headers["Content-Type"] = options.contentType;
            }
            if (options.upsert) {
              headers["x-upsert"] = "true";
            }
            const response = await send(objectUrl(key), {
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
            const response = await send(objectUrl(key), {
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

          async info(key) {
            const response = await send(objectUrl(key), {
              method: "HEAD",
              headers: authHeaders
            });
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const info: SupabaseObjectInfo = {
              size: Number(response.headers.get("content-length") ?? 0)
            };
            const contentType = response.headers.get("content-type");
            if (contentType) info.contentType = contentType;
            const lastModified = Date.parse(
              response.headers.get("last-modified") ?? ""
            );
            if (Number.isFinite(lastModified)) info.modifiedAt = lastModified;
            return { data: info, error: null };
          },

          async remove(keys) {
            const response = await send(
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
            const response = await send(
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
            const response = await send(
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
            const body: SupabaseSignResponse = await response.json();
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
            const response = await send(
              `${base}/storage/v1/object/upload/sign/${bucket}/${encodeKey(key)}`,
              { method: "POST", headers: authHeaders }
            );
            if (!response.ok) {
              return { data: null, error: await readError(response) };
            }
            const body: SupabaseSignUploadResponse = await response.json();
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
