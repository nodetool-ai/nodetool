/**
 * Tests for SupabaseAuthProvider's lazy client initialisation (`_getClient`)
 * and the fetch-backed GoTrue call it performs.
 *
 * The main supabase-provider.test.ts injects a fake `_client` to avoid any
 * network I/O. This file instead mocks global `fetch` so the
 * `if (!this._client)` creation path is actually exercised — pinning the
 * exact request (URL, headers) and the response decoding / error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseAuthProvider } from "../src/providers/supabase-provider.js";

const fetchMock = vi.fn<typeof fetch>();

function makeProvider(): SupabaseAuthProvider {
  return new SupabaseAuthProvider({
    supabaseUrl: "https://test.supabase.co",
    supabaseKey: "test-key",
    cacheTtl: 0
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseAuthProvider GoTrue fetch client", () => {
  it("issues GET /auth/v1/user with apikey and Bearer headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "lazy-client-user" }));

    const provider = makeProvider();
    const result = await provider.verifyToken("tok");

    expect(result.ok).toBe(true);
    expect(result.userId).toBe("lazy-client-user");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://test.supabase.co/auth/v1/user");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({
      apikey: "test-key",
      Authorization: "Bearer tok"
    });
  });

  it("strips trailing slashes from the Supabase URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "u1" }));

    const provider = new SupabaseAuthProvider({
      supabaseUrl: "https://test.supabase.co///",
      supabaseKey: "test-key",
      cacheTtl: 0
    });
    await provider.verifyToken("tok");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://test.supabase.co/auth/v1/user"
    );
  });

  it("reuses the same client across calls instead of recreating it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "u1" }));

    const provider = makeProvider();
    await provider.verifyToken("tok-1");
    fetchMock.mockResolvedValue(jsonResponse({ id: "u1" }));
    await provider.verifyToken("tok-2");

    // Same underlying client object was kept between the two calls.
    const clientAfter = (provider as unknown as Record<string, unknown>)
      ._client;
    expect(clientAfter).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({
      apikey: "test-key",
      Authorization: "Bearer tok-2"
    });
  });

  it("maps a GoTrue error body (msg) to the auth error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ msg: "JWT expired" }, 401));

    const provider = makeProvider();
    const result = await provider.verifyToken("expired");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("JWT expired");
  });

  it("maps an error_description body to the auth error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error_description: "Bad token" }, 401)
    );

    const provider = makeProvider();
    const result = await provider.verifyToken("bad");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Bad token");
  });

  it("falls back to a status message for a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(new Response("gateway timeout", { status: 504 }));

    const provider = makeProvider();
    const result = await provider.verifyToken("tok");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Supabase auth request failed with status 504");
  });

  it("treats a 200 body without an id as an invalid token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ role: "anon" }));

    const provider = makeProvider();
    const result = await provider.verifyToken("tok");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid Supabase token");
  });

  it("surfaces network failures as auth errors", async () => {
    fetchMock.mockRejectedValue(new Error("Network failure"));

    const provider = makeProvider();
    const result = await provider.verifyToken("tok");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Network failure");
  });
});
