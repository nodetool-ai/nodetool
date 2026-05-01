/**
 * Supabase JWT authentication provider — T-SEC-4.
 *
 * Validates Supabase JWT tokens by calling supabase.auth.getUser(token).
 * Uses an LRU token cache with TTL to avoid repeated API calls.
 *
 * Ported from Python: src/nodetool/security/providers/supabase.py
 */

import { createHash } from "node:crypto";
import {
  createClient,
  type SupabaseClient as SupabaseClientType
} from "@supabase/supabase-js";
import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";

type SupabaseClient = SupabaseClientType;

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
  private _client: SupabaseClient | null = null;

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

  private _getClient(): SupabaseClient {
    if (!this._client) {
      this._client = createClient(this.supabaseUrl, this.supabaseKey);
    }
    return this._client;
  }

  // ── Cache helpers ────────────────────────────────────────────────────

  private _makeCacheKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private _getCachedUser(token: string): string | null {
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
    if (this.cacheTtl <= 0 || this.cacheMax <= 0) return;

    const key = this._makeCacheKey(token);
    const expiresAt = performance.now() + this.cacheTtl * 1000;

    // Remove existing entry (if any) so re-insert goes to end
    this._cache.delete(key);
    this._cache.set(key, [userId, expiresAt]);

    // Evict oldest (first key) when over capacity
    if (this._cache.size > this.cacheMax) {
      const oldest = this._cache.keys().next().value;
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
        const errMsg =
          typeof error === "object" && error !== null && "message" in error
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
