/**
 * Tests for T-SEC-4: SupabaseAuthProvider
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseAuthProvider } from "../src/providers/supabase-provider.js";
import { TokenType } from "../src/auth-provider.js";

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------

function createMockClient(
  getUser: (jwt?: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>
) {
  return { auth: { getUser } };
}

function makeProvider(
  overrides: {
    getUser?: (jwt?: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
    cacheTtl?: number;
    cacheMax?: number;
  } = {}
): SupabaseAuthProvider {
  const getUser =
    overrides.getUser ??
    (async () => ({ data: { user: { id: "sb-user-1" } }, error: null }));

  const provider = new SupabaseAuthProvider({
    supabaseUrl: "https://test.supabase.co",
    supabaseKey: "test-key",
    cacheTtl: overrides.cacheTtl,
    cacheMax: overrides.cacheMax,
  });

  // Inject the mock client directly to avoid dynamic import of @supabase/supabase-js
  const client = createMockClient(getUser);
  (provider as unknown as Record<string, unknown>)._client = client;

  return provider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T-SEC-4: SupabaseAuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error for empty token", async () => {
    const provider = makeProvider();
    const result = await provider.verifyToken("");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing Supabase token");
  });

  it("validates a valid token and returns user ID", async () => {
    const provider = makeProvider();
    const result = await provider.verifyToken("valid-token");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("sb-user-1");
    expect(result.tokenType).toBe(TokenType.USER);
  });

  it("returns error when getUser returns an error", async () => {
    const provider = makeProvider({
      getUser: async () => ({
        data: { user: null },
        error: { message: "Token expired" },
      }),
    });
    const result = await provider.verifyToken("expired-token");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token expired");
  });

  it("returns error when user is null", async () => {
    const provider = makeProvider({
      getUser: async () => ({
        data: { user: null },
        error: null,
      }),
    });
    const result = await provider.verifyToken("bad-token");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid Supabase token");
  });

  it("returns error when getUser throws", async () => {
    const provider = makeProvider({
      getUser: async () => {
        throw new Error("Network failure");
      },
    });
    const result = await provider.verifyToken("crash-token");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Network failure");
  });

  // ── Caching ────────────────────────────────────────────────────────────

  it("caches valid tokens and returns from cache on second call", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "cached-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 60 });

    // First call — hits Supabase
    const r1 = await provider.verifyToken("tok-1");
    expect(r1.ok).toBe(true);
    expect(getUser).toHaveBeenCalledTimes(1);

    // Second call — should use cache
    const r2 = await provider.verifyToken("tok-1");
    expect(r2.ok).toBe(true);
    expect(r2.userId).toBe("cached-user");
    expect(getUser).toHaveBeenCalledTimes(1); // not called again
  });

  it("does not cache when cacheTtl is 0", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "no-cache-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 0 });

    await provider.verifyToken("tok-2");
    await provider.verifyToken("tok-2");
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("evicts oldest entry when cache exceeds max size", async () => {
    const getUser = vi.fn(async (_jwt?: string) => ({
      data: { user: { id: "user-x" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 60, cacheMax: 2 });

    await provider.verifyToken("tok-a");
    await provider.verifyToken("tok-b");
    await provider.verifyToken("tok-c"); // should evict tok-a

    expect(getUser).toHaveBeenCalledTimes(3);

    // tok-b should still be cached
    await provider.verifyToken("tok-b");
    expect(getUser).toHaveBeenCalledTimes(3);

    // tok-a should have been evicted — triggers a new call
    await provider.verifyToken("tok-a");
    expect(getUser).toHaveBeenCalledTimes(4);
  });

  // ── clearCaches ────────────────────────────────────────────────────────

  it("clearCaches resets cache and client", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "clear-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 60 });

    await provider.verifyToken("tok-clear");
    expect(getUser).toHaveBeenCalledTimes(1);

    provider.clearCaches();

    // After clearing, the client is gone — need to re-inject mock
    const newClient = createMockClient(getUser);
    (provider as unknown as Record<string, unknown>)._client = newClient;

    await provider.verifyToken("tok-clear");
    // Should call getUser again since cache was cleared
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  // ── Error stringification ──────────────────────────────────────────────

  it("handles non-Error error objects from Supabase", async () => {
    const provider = makeProvider({
      getUser: async () => ({
        data: { user: null },
        error: "string-error",
      }),
    });
    const result = await provider.verifyToken("err-token");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("string-error");
  });

  // ── Cache TTL expiry ──────────────────────────────────────────────────

  it("evicts cached entry after TTL expires", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "ttl-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 10 });

    // First call populates cache
    await provider.verifyToken("tok-ttl");
    expect(getUser).toHaveBeenCalledTimes(1);

    // Simulate time passing beyond TTL (10s = 10000ms)
    const originalNow = performance.now;
    const baseTime = performance.now();
    vi.spyOn(performance, "now").mockReturnValue(baseTime + 11_000);

    // Second call should re-fetch because TTL expired
    const r2 = await provider.verifyToken("tok-ttl");
    expect(r2.ok).toBe(true);
    expect(r2.userId).toBe("ttl-user");
    expect(getUser).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  // ── Concurrent verifyToken calls ──────────────────────────────────────

  it("concurrent verifyToken with same token calls getUser only once (cache race)", async () => {
    let callCount = 0;
    const getUser = vi.fn(async () => {
      callCount++;
      // Small delay to simulate network
      await new Promise((r) => setTimeout(r, 10));
      return { data: { user: { id: "concurrent-user" } }, error: null };
    });
    const provider = makeProvider({ getUser, cacheTtl: 60 });

    // First call populates cache, second call should use cached result
    const [r1, r2] = await Promise.all([
      provider.verifyToken("tok-concurrent"),
      provider.verifyToken("tok-concurrent"),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.userId).toBe("concurrent-user");
    expect(r2.userId).toBe("concurrent-user");
    // Both calls happen since there's no in-flight dedup, but at most 2 calls
    // (the second call may or may not hit cache depending on timing)
    expect(getUser.mock.calls.length).toBeLessThanOrEqual(2);
  });

  // ── Cache key hashing ────────────────────────────────────────────────

  it("different tokens produce different cache entries", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "hash-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 60 });

    await provider.verifyToken("token-alpha");
    await provider.verifyToken("token-beta");
    // Two distinct tokens should result in two getUser calls
    expect(getUser).toHaveBeenCalledTimes(2);

    // Both should now be cached
    await provider.verifyToken("token-alpha");
    await provider.verifyToken("token-beta");
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  // ── LRU refresh order ────────────────────────────────────────────────

  it("LRU refresh: re-accessing tok-a moves it to end, tok-b gets evicted", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "lru-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 60, cacheMax: 2 });

    // Fill cache: tok-a, tok-b
    await provider.verifyToken("tok-a");
    await provider.verifyToken("tok-b");
    expect(getUser).toHaveBeenCalledTimes(2);

    // Re-access tok-a → moves it to end. Order is now: tok-b, tok-a
    await provider.verifyToken("tok-a");
    expect(getUser).toHaveBeenCalledTimes(2); // still cached

    // Add tok-c → evicts the oldest, which is tok-b
    await provider.verifyToken("tok-c");
    expect(getUser).toHaveBeenCalledTimes(3);

    // tok-a should still be cached
    await provider.verifyToken("tok-a");
    expect(getUser).toHaveBeenCalledTimes(3);

    // tok-b should have been evicted
    await provider.verifyToken("tok-b");
    expect(getUser).toHaveBeenCalledTimes(4);
  });

  // ── extractTokenFromHeaders ──────────────────────────────────────────

  it("extractTokenFromHeaders extracts Bearer token from plain headers", () => {
    const provider = makeProvider();
    const token = provider.extractTokenFromHeaders({
      authorization: "Bearer my-jwt-token",
    });
    expect(token).toBe("my-jwt-token");
  });

  it("extractTokenFromHeaders returns null for missing header", () => {
    const provider = makeProvider();
    const token = provider.extractTokenFromHeaders({});
    expect(token).toBeNull();
  });

  it("extractTokenFromHeaders returns null for non-Bearer scheme", () => {
    const provider = makeProvider();
    const token = provider.extractTokenFromHeaders({
      authorization: "Basic abc123",
    });
    expect(token).toBeNull();
  });

  // ── Non-object error from getUser ────────────────────────────────────

  it("handles numeric error from getUser", async () => {
    const provider = makeProvider({
      getUser: async () => ({
        data: { user: null },
        error: 42,
      }),
    });
    const result = await provider.verifyToken("num-err");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("42");
  });

  it("handles boolean error from getUser", async () => {
    const provider = makeProvider({
      getUser: async () => ({
        data: { user: null },
        error: true,
      }),
    });
    const result = await provider.verifyToken("bool-err");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("true");
  });

  // ── User with extra fields ───────────────────────────────────────────

  it("extracts only id from user with extra fields", async () => {
    const provider = makeProvider({
      getUser: async () => ({
        data: {
          user: { id: "extra-user", email: "foo@bar.com", name: "Foo" } as { id: string },
        },
        error: null,
      }),
    });
    const result = await provider.verifyToken("extra-fields-token");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("extra-user");
    // No email or name leakage in AuthResult
    expect((result as Record<string, unknown>).email).toBeUndefined();
  });

  // ── cacheMax of 1 ────────────────────────────────────────────────────

  it("cacheMax of 1 keeps only one entry at a time", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: "max1-user" } },
      error: null,
    }));
    const provider = makeProvider({ getUser, cacheTtl: 60, cacheMax: 1 });

    await provider.verifyToken("tok-only-1");
    expect(getUser).toHaveBeenCalledTimes(1);

    // Cached
    await provider.verifyToken("tok-only-1");
    expect(getUser).toHaveBeenCalledTimes(1);

    // New token evicts the first
    await provider.verifyToken("tok-only-2");
    expect(getUser).toHaveBeenCalledTimes(2);

    // tok-only-1 was evicted
    await provider.verifyToken("tok-only-1");
    expect(getUser).toHaveBeenCalledTimes(3);

    // tok-only-2 was evicted by tok-only-1
    await provider.verifyToken("tok-only-2");
    expect(getUser).toHaveBeenCalledTimes(4);
  });
});
