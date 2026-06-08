/**
 * Tests for SupabaseAuthProvider's lazy client initialisation (`_getClient`).
 *
 * The main supabase-provider.test.ts injects a fake `_client` to avoid the real
 * SDK. This file instead mocks `@supabase/supabase-js` so the `if (!this._client)`
 * creation path is actually exercised — pinning that the client is created once
 * and reused (kills the condition-removal / block-emptying mutants on L56).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAuthProvider } from "../src/providers/supabase-provider.js";

vi.mock("@supabase/supabase-js", () => {
  const getUser = vi.fn(async () => ({
    data: { user: { id: "lazy-client-user" } },
    error: null
  }));
  return { createClient: vi.fn(() => ({ auth: { getUser } })) };
});

const mockedCreateClient = vi.mocked(createClient);

describe("SupabaseAuthProvider lazy client initialisation", () => {
  beforeEach(() => {
    mockedCreateClient.mockClear();
  });

  it("creates the Supabase client and authenticates through it", async () => {
    // cacheTtl: 0 keeps caching out of the way so every call goes through the
    // client; the result proves _getClient returned a real (mocked) client
    // rather than null (which a removed `if (!this._client)` assignment causes).
    const provider = new SupabaseAuthProvider({
      supabaseUrl: "https://test.supabase.co",
      supabaseKey: "test-key",
      cacheTtl: 0
    });

    const result = await provider.verifyToken("tok");
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("lazy-client-user");
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });

  it("reuses the same client across calls instead of recreating it", async () => {
    const provider = new SupabaseAuthProvider({
      supabaseUrl: "https://test.supabase.co",
      supabaseKey: "test-key",
      cacheTtl: 0
    });

    await provider.verifyToken("tok-1");
    await provider.verifyToken("tok-2");
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });
});
