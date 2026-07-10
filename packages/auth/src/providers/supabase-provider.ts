/**
 * Supabase JWT authentication provider — T-SEC-4.
 *
 * Validates Supabase JWT tokens against the GoTrue REST endpoint
 * (`GET /auth/v1/user`) with a plain `fetch` call — no supabase-js.
 * Uses an LRU token cache with TTL to avoid repeated API calls.
 *
 * Ported from Python: src/nodetool/security/providers/supabase.py
 */

import { createHash } from "node:crypto";
import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";

/** The slice of the GoTrue user object we consume. */
interface GoTrueUser {
  id: string;
}

interface GetUserResult {
  data: { user: GoTrueUser | null };
  error: { message: string } | null;
}

/**
 * Minimal client shape kept structurally compatible with the supabase-js
 * subset previously used (`client.auth.getUser(token)`), so tests can inject
 * a stub.
 */
interface SupabaseAuthClient {
  auth: {
    getUser(token: string): Promise<GetUserResult>;
  };
}

/** Extract a human-readable message from a GoTrue error body. */
function readGoTrueErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const field of ["msg", "message", "error_description", "error"]) {
      const val = obj[field];
      if (typeof val === "string" && val) return val;
    }
  }
  return `Supabase auth request failed with status ${status}`;
}

/**
 * fetch-backed GoTrue client covering exactly the surface we use:
 * `GET {supabaseUrl}/auth/v1/user` with the token as Bearer auth.
 */
function createGoTrueClient(
  supabaseUrl: string,
  supabaseKey: string
): SupabaseAuthClient {
  let base = supabaseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return {
    auth: {
      async getUser(token: string): Promise<GetUserResult> {
        const response = await fetch(`${base}/auth/v1/user`, {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${token}`
          }
        });

        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          // Non-JSON body (e.g. empty 5xx) — handled below via status.
        }

        if (!response.ok) {
          return {
            data: { user: null },
            error: {
              message: readGoTrueErrorMessage(body, response.status)
            }
          };
        }

        const user =
          body && typeof body === "object" && "id" in body
            ? { id: String((body as { id: unknown }).id) }
            : null;
        return { data: { user }, error: null };
      }
    }
  };
}

export interface SupabaseAuthProviderOptions {
  supabaseUrl: string;
  supabaseKey: string;
  /** Cache TTL in seconds. Set to 0 to disable caching. Default: 60. */
  cacheTtl?: number;
  /** Maximum number of cached tokens. Default: 2000. */
  cacheMax?: number;
}

/**
 * Auth provider that validates Supabase JWT tokens.
 */
export class SupabaseAuthProvider extends AuthProvider {
  private supabaseUrl: string;
  private supabaseKey: string;
  private cacheTtl: number;
  private cacheMax: number;
  private _client: SupabaseAuthClient | null = null;

  /**
   * LRU cache: Map preserves insertion order; we delete-and-reinsert on access
   * to keep most-recently-used entries at the end.
   * Value: [userId, expiresAt (ms monotonic via performance.now)].
   */
  private _cache = new Map<string, [string, number]>();

  constructor(options: SupabaseAuthProviderOptions) {
    super();
    this.supabaseUrl = options.supabaseUrl;
    this.supabaseKey = options.supabaseKey;
    this.cacheTtl = Math.max(options.cacheTtl ?? 60, 0);
    this.cacheMax = Math.max(options.cacheMax ?? 2000, 0);
  }

  // ── Client initialisation ────────────────────────────────────────────

  private _getClient(): SupabaseAuthClient {
    if (!this._client) {
      this._client = createGoTrueClient(this.supabaseUrl, this.supabaseKey);
    }
    return this._client;
  }

  // ── Cache helpers ────────────────────────────────────────────────────

  private _makeCacheKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private _getCachedUser(token: string): string | null {
    // Stryker disable next-line ConditionalExpression,EqualityOperator: redundant
    // with _cacheUser's matching ttl gate — entries are never stored when
    // cacheTtl<=0, so this guarded cache read is unreachable (equivalent).
    if (this.cacheTtl <= 0) return null;

    const key = this._makeCacheKey(token);
    const entry = this._cache.get(key);
    if (!entry) return null;

    const [userId, expiresAt] = entry;
    if (performance.now() >= expiresAt) {
      // Expired
      this._cache.delete(key);
      return null;
    }

    // Refresh LRU order: delete and re-insert at end
    this._cache.delete(key);
    this._cache.set(key, entry);
    return userId;
  }

  private _cacheUser(token: string, userId: string): void {
    // Stryker disable next-line all: redundant fast-path. cacheTtl<=0 entries are
    // never read (gated in _getCachedUser), and cacheMax<=0 stores are immediately
    // removed by the size>cacheMax eviction below, so every mutant here leaves the
    // observable cache state unchanged (equivalent).
    if (this.cacheTtl <= 0 || this.cacheMax <= 0) return;

    const key = this._makeCacheKey(token);
    const expiresAt = performance.now() + this.cacheTtl * 1000;

    // Remove existing entry (if any) so re-insert goes to end
    this._cache.delete(key);
    this._cache.set(key, [userId, expiresAt]);

    // Evict oldest (first key) when over capacity
    if (this._cache.size > this.cacheMax) {
      const oldest = this._cache.keys().next().value;
      // Stryker disable next-line ConditionalExpression: eviction only runs when
      // size>cacheMax, so the map is non-empty and oldest is always defined here
      // (the undefined guard can never be false — equivalent).
      if (oldest !== undefined) {
        this._cache.delete(oldest);
      }
    }
  }

  // ── AuthProvider implementation ──────────────────────────────────────

  async verifyToken(token: string): Promise<AuthResult> {
    if (!token) {
      return { ok: false, error: "Missing Supabase token" };
    }

    // Check cache first
    const cachedUserId = this._getCachedUser(token);
    if (cachedUserId) {
      return { ok: true, userId: cachedUserId, tokenType: TokenType.USER };
    }

    const client = this._getClient();

    try {
      const { data, error } = await client.auth.getUser(token);

      if (error) {
        // `error` is truthy here, so it cannot be null — no null guard needed.
        const errMsg =
          typeof error === "object" && "message" in error
            ? String((error as { message: string }).message)
            : String(error);
        return { ok: false, error: errMsg };
      }

      const user = data?.user;
      if (!user?.id) {
        return { ok: false, error: "Invalid Supabase token" };
      }

      const userId = String(user.id);
      this._cacheUser(token, userId);
      return { ok: true, userId, tokenType: TokenType.USER };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  override clearCaches(): void {
    this._cache.clear();
    this._client = null;
  }
}
