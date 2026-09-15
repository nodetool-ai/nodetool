// Verda cloud API transport — authentication, retries, and response decoding.
//
// Split from `verda.ts` so the provider reads as lifecycle logic while the
// awkward parts of the wire protocol live here:
//
//   * OAuth2 client-credentials tokens (`POST /v1/oauth2/token`) with a single
//     in-flight refresh per client, refreshed before expiry.
//   * The documented rate limits (500 authenticated req/min per project, 60/min
//     per method+path) surface as 429 + `Retry-After`, honoured with bounded
//     retries.
//   * Verda answers instance actions asynchronously: 202 (accepted), 204 (the
//     single action was already satisfied), 207 (a bulk action partly failed).
//     Callers get the status code, not a decoded resource, so they can tell
//     "accepted" from "done".
//
// Credentials are injected by the caller (the `WorkerManager` sources them from
// the secret store); this module never reads `process.env`.

/** Production base URL. The rendered API reference advertises localhost in its
 * `servers` block, so it is pinned here rather than taken from a generator. */
const VERDA_API_BASE_URL = "https://api.verda.com";

/** Refresh a token this long before it expires, to cover clock skew + latency. */
const TOKEN_REFRESH_SKEW_MS = 60_000;

/** Cap on retries of a 429/503 before the call fails. */
const MAX_RETRIES = 3;

/** Fallback backoff when a 429 carries no usable `Retry-After`. */
const DEFAULT_RETRY_DELAY_MS = 2_000;

export type VerdaMethod = "GET" | "POST" | "PUT" | "DELETE";

/** A decoded Verda response: the HTTP status plus the parsed body (if any). */
export interface VerdaResponse<T = unknown> {
  status: number;
  body: T;
}

/** Verda cloud API credentials — distinct from the separate inference key. */
export interface VerdaCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * A Verda API failure carrying the HTTP status, so callers can tell apart the
 * failures the brief requires be handled distinctly: no capacity (503),
 * authentication (401/403), quota/funds (402/422) and malformed input (400).
 */
export class VerdaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
    this.name = "VerdaApiError";
  }

  /** The provider reported no capacity for the requested configuration. */
  get isNoCapacity(): boolean {
    return this.status === 503;
  }

  /** The credentials were rejected — retrying with the same token cannot help. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * Reject a resource identifier that would escape its intended API path.
 *
 * The Verda Python SDK shipped a path-traversal fix in 1.24.1 (a crafted
 * resource name or id could redirect an authenticated request to a different
 * endpoint). NodeTool interpolates ids into paths too — a `provider_ref` read
 * back from the registry, a volume id from a provider response — so the same
 * check is enforced here rather than trusted to the far side.
 */
export function assertSafeId(id: string, label: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(
      `Unsafe Verda ${label} ${JSON.stringify(id)}: ids may contain only ` +
        `letters, digits, dot, underscore and hyphen`
    );
  }
  return id;
}

/** Parse `Retry-After` (delta-seconds or HTTP-date) into milliseconds. */
function retryAfterMs(header: string | null): number {
  if (!header) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return DEFAULT_RETRY_DELAY_MS;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Authenticated Verda REST client. One instance per credential pair holds that
 * pair's access token; refresh is serialized so a burst of concurrent calls
 * mints one token rather than racing.
 */
export class VerdaApiClient {
  private accessToken: string | null = null;
  private expiresAt = 0;
  /** In-flight refresh, shared by every caller that arrives during it. */
  private pending: Promise<string> | null = null;

  constructor(
    private readonly credentials: VerdaCredentials,
    private readonly baseUrl: string = VERDA_API_BASE_URL
  ) {
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error(
        "Verda requires both VERDA_CLIENT_ID and VERDA_CLIENT_SECRET"
      );
    }
  }

  /**
   * Call an authenticated endpoint. Retries 429/503 with backoff, and retries
   * ONCE after a 401 with a freshly minted token (a token can expire mid-flight);
   * a second 401 is a credential problem and is surfaced.
   */
  async request<T = unknown>(
    method: VerdaMethod,
    path: string,
    body?: Record<string, unknown>
  ): Promise<VerdaResponse<T>> {
    let reauthed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.token();
      const response = await this.send(method, path, token, body);

      if (response.status === 401 && !reauthed) {
        // The token was rejected — drop it and mint a new one exactly once.
        reauthed = true;
        this.invalidate();
        continue;
      }

      if (
        (response.status === 429 || response.status === 503) &&
        attempt < MAX_RETRIES
      ) {
        await sleep(retryAfterMs(response.headers.get("retry-after")));
        continue;
      }

      return this.decode<T>(response, method, path);
    }
  }

  /** Drop the cached token, forcing the next call to mint a fresh one. */
  invalidate(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  // --- Internals ----------------------------------------------------------

  private async send(
    method: VerdaMethod,
    path: string,
    token: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    };
    if (body && method !== "GET") {
      init.body = JSON.stringify(body);
    }
    return fetch(`${this.baseUrl}${path}`, init);
  }

  private async decode<T>(
    response: Response,
    method: VerdaMethod,
    path: string
  ): Promise<VerdaResponse<T>> {
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      // Response bodies can echo request fields; include only the provider's
      // message, never the request body, which carries the worker token.
      throw new VerdaApiError(
        `Verda ${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`,
        response.status,
        path
      );
    }
    // 202/204 legitimately carry no body — an action was accepted, not applied.
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Some creates answer with a bare id rather than JSON; keep the text.
        parsed = text;
      }
    }
    return { status: response.status, body: parsed as T };
  }

  /** Return a live access token, refreshing when absent or near expiry. */
  private token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - TOKEN_REFRESH_SKEW_MS) {
      return Promise.resolve(this.accessToken);
    }
    // Serialize: concurrent callers share one refresh rather than each minting
    // a token (and burning the per-path rate limit on /oauth2/token).
    this.pending ??= this.refresh().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async refresh(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      // Never echo the body: the request carried the client secret and a
      // provider error may quote it back.
      throw new VerdaApiError(
        `Verda authentication failed (${response.status}). Check ` +
          `VERDA_CLIENT_ID and VERDA_CLIENT_SECRET.`,
        response.status,
        "/v1/oauth2/token"
      );
    }

    const token = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!token.access_token) {
      throw new Error("Verda token response contained no access_token");
    }
    this.accessToken = token.access_token;
    // Treat a missing expires_in conservatively rather than caching forever.
    const ttl = typeof token.expires_in === "number" ? token.expires_in : 300;
    this.expiresAt = Date.now() + ttl * 1_000;
    return token.access_token;
  }
}
