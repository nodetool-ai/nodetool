/**
 * Additional OAuth API tests for 100% statement coverage.
 * Covers: toTokenMetadata, handleHfRefresh, handleHfWhoami,
 *         handleGithubCallback, handleGithubUser, hashCode,
 *         normalizePath, oauthHtmlResponse (error paths),
 *         pruneExpiredStates, and method-not-allowed branches.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  OAuthCredential,
} from "@nodetool/models";
import {
  oauthStateStore,
  handleOAuthRequest,
  resetOAuthTableInit,
} from "../src/oauth-api.js";

function getUserId(): string {
  return "test-user-1";
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("OAuth API: HuggingFace refresh", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /api/oauth/hf/refresh returns 405 for GET", async () => {
    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=acc1",
      { method: "GET" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });

  it("POST /api/oauth/hf/refresh returns 400 without account_id", async () => {
    const request = new Request("http://localhost:7777/api/oauth/hf/refresh", {
      method: "POST",
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("Missing account_id");
  });

  it("POST /api/oauth/hf/refresh returns 404 for unknown credential", async () => {
    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=nonexistent",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  it("POST /api/oauth/hf/refresh returns 400 when no refresh_token", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-no-refresh",
      access_token: "tok",
      refresh_token: null,
      token_type: "Bearer",
      received_at: now,
    });

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=acc-no-refresh",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("No refresh token");
  });

  it("POST /api/oauth/hf/refresh succeeds with valid refresh_token", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-refreshable",
      access_token: "old-token",
      refresh_token: "refresh-tok",
      token_type: "Bearer",
      scope: "openid",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "Bearer",
          scope: "openid read-repos",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=acc-refreshable",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as { success: boolean; message: string };
    expect(body.success).toBe(true);
  });

  it("POST /api/oauth/hf/refresh handles token exchange failure", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-fail-refresh",
      access_token: "tok",
      refresh_token: "refresh-tok",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Bad request", { status: 400 })
    );

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=acc-fail-refresh",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("Failed to refresh token");
  });

  it("POST /api/oauth/hf/refresh returns 400 when no access_token in response", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-no-at",
      access_token: "tok",
      refresh_token: "refresh-tok",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ refresh_token: "new-rt" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=acc-no-at",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("No access token");
  });

  it("POST /api/oauth/hf/refresh handles network error", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-net-error",
      access_token: "tok",
      refresh_token: "refresh-tok",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/refresh?account_id=acc-net-error",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("Network error");
  });
});

describe("OAuth API: HuggingFace whoami", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/oauth/hf/whoami returns 405 for POST", async () => {
    const request = new Request(
      "http://localhost:7777/api/oauth/hf/whoami?account_id=acc1",
      { method: "POST" }
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });

  it("GET /api/oauth/hf/whoami returns 400 without account_id", async () => {
    const request = new Request("http://localhost:7777/api/oauth/hf/whoami");
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
  });

  it("GET /api/oauth/hf/whoami returns 404 for unknown credential", async () => {
    const request = new Request(
      "http://localhost:7777/api/oauth/hf/whoami?account_id=nonexistent"
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  it("GET /api/oauth/hf/whoami succeeds with valid credential", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-whoami",
      access_token: "valid-token",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "hf-user-123",
          name: "TestUser",
          email: "test@example.com",
          type: "user",
          orgs: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/whoami?account_id=acc-whoami"
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as Record<string, unknown>;
    expect(body.id).toBe("hf-user-123");
    expect(body.name).toBe("TestUser");
    expect(body.email).toBe("test@example.com");
  });

  it("GET /api/oauth/hf/whoami returns 401 for expired token", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-expired",
      access_token: "expired-token",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/whoami?account_id=acc-expired"
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it("GET /api/oauth/hf/whoami handles non-ok non-401 response", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-servererr",
      access_token: "tok",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/whoami?account_id=acc-servererr"
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("Hugging Face API error");
  });

  it("GET /api/oauth/hf/whoami handles network error", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-net",
      access_token: "tok",
      token_type: "Bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("DNS failure"));

    const request = new Request(
      "http://localhost:7777/api/oauth/hf/whoami?account_id=acc-net"
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("DNS failure");
  });
});

describe("OAuth API: HuggingFace callback with valid state and token exchange", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles successful HF callback with token exchange and whoami", async () => {
    const state = "test-state-hf";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "test-verifier",
      redirectUri: "http://localhost:7777/api/oauth/hf/callback",
      createdAt: Date.now(),
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    // Token exchange response
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "hf-access-tok",
          refresh_token: "hf-refresh-tok",
          token_type: "Bearer",
          scope: "openid read-repos",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    // Whoami response
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "hf-user-id",
          name: "HfUser",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const request = new Request(
      `http://localhost:7777/api/oauth/hf/callback?code=auth-code&state=${state}`
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Successful");
    expect(html).toContain("HfUser");
  });

  it("handles HF callback with token exchange failure", async () => {
    const state = "test-state-fail";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "test-verifier",
      redirectUri: "http://localhost:7777/api/oauth/hf/callback",
      createdAt: Date.now(),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("invalid_grant", { status: 400 })
    );

    const request = new Request(
      `http://localhost:7777/api/oauth/hf/callback?code=bad-code&state=${state}`
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("Failed to exchange authorization code");
  });

  it("handles HF callback with no access_token in response", async () => {
    const state = "test-state-noat";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "test-verifier",
      redirectUri: "http://localhost:7777/api/oauth/hf/callback",
      createdAt: Date.now(),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const request = new Request(
      `http://localhost:7777/api/oauth/hf/callback?code=code&state=${state}`
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("No access token received from Hugging Face");
  });

  it("handles HF callback with whoami failure (falls back to token prefix)", async () => {
    const state = "test-state-whoami-fail";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "test-verifier",
      redirectUri: "http://localhost:7777/api/oauth/hf/callback",
      createdAt: Date.now(),
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "hf-access-token-value",
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    fetchMock.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const request = new Request(
      `http://localhost:7777/api/oauth/hf/callback?code=code&state=${state}`
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Successful");
  });

  it("handles HF callback with network error (catch block)", async () => {
    const state = "test-state-neterr";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "test-verifier",
      redirectUri: "http://localhost:7777/api/oauth/hf/callback",
      createdAt: Date.now(),
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network down"));

    const request = new Request(
      `http://localhost:7777/api/oauth/hf/callback?code=code&state=${state}`
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("Network down");
  });

  it("handles HF callback with expired state", async () => {
    const state = "test-state-expired";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "test-verifier",
      redirectUri: "http://localhost:7777/api/oauth/hf/callback",
      createdAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
    });

    const request = new Request(
      `http://localhost:7777/api/oauth/hf/callback?code=code&state=${state}`
    );
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("expired");
  });
});

describe("OAuth API: HuggingFace tokens with toTokenMetadata", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
  });

  it("GET /api/oauth/hf/tokens returns token metadata fields", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc-meta",
      access_token: "tok",
      refresh_token: "ref",
      username: "user1",
      token_type: "Bearer",
      scope: "openid",
      received_at: now,
      expires_at: now,
    });

    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/hf/tokens"),
      "/api/oauth/hf/tokens",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as {
      tokens: Array<Record<string, unknown>>;
    };
    expect(body.tokens.length).toBe(1);
    const token = body.tokens[0];
    expect(token.provider).toBe("huggingface");
    expect(token.account_id).toBe("acc-meta");
    expect(token.username).toBe("user1");
    expect(token.token_type).toBe("Bearer");
    expect(token.scope).toBe("openid");
    // Should NOT include access_token or refresh_token
    expect(token).not.toHaveProperty("access_token");
    expect(token).not.toHaveProperty("refresh_token");
  });
});

describe("OAuth API: GitHub callback", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
  });

  it("GET /api/oauth/github/callback with error param returns error HTML", async () => {
    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/callback?error=access_denied&error_description=User+denied"
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("User denied");
  });

  it("GET /api/oauth/github/callback with missing code/state returns error", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/github/callback"),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Missing required parameters");
  });

  it("GET /api/oauth/github/callback with invalid state returns error", async () => {
    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/callback?code=abc&state=invalid"
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("expired or is invalid");
  });

  it("GET /api/oauth/github/callback with expired state returns error", async () => {
    const state = "gh-expired-state";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now() - 6 * 60 * 1000,
    });

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=abc&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("expired");
  });

  it("GET /api/oauth/github/callback without client config returns error", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;

    const state = "gh-no-config";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now(),
    });

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=abc&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("not properly configured");
  });

  it("GET /api/oauth/github/callback handles successful token exchange", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";

    const state = "gh-success-state";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now(),
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "gh-access-token",
          token_type: "bearer",
          scope: "user:email",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 12345, login: "ghuser" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=auth-code&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Successful");
    expect(html).toContain("ghuser");
  });

  it("GET /api/oauth/github/callback handles token exchange failure", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";

    const state = "gh-tokfail";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now(),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Bad request", { status: 400 })
    );

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=bad&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Failed to exchange authorization code");
  });

  it("GET /api/oauth/github/callback handles no access_token in response", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";

    const state = "gh-noat";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now(),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=code&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("No access token received from GitHub");
  });

  it("GET /api/oauth/github/callback handles user fetch failure (fallback accountId)", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";

    const state = "gh-userfail";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now(),
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "gh-at",
          token_type: "bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    fetchMock.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=code&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Successful");
  });

  it("GET /api/oauth/github/callback handles network error", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";

    const state = "gh-neterr";
    oauthStateStore.set(state, {
      userId: "test-user-1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost:7777/api/oauth/github/callback",
      createdAt: Date.now(),
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Connection refused"));

    const response = await handleOAuthRequest(
      new Request(
        `http://localhost:7777/api/oauth/github/callback?code=code&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Connection refused");
  });

  it("GET /api/oauth/github/callback returns 405 for POST", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/github/callback", {
        method: "POST",
      }),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });
});

describe("OAuth API: GitHub user", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/oauth/github/user returns 405 for POST", async () => {
    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/user?account_id=acc",
        { method: "POST" }
      ),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });

  it("GET /api/oauth/github/user returns 400 without account_id", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/github/user"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
  });

  it("GET /api/oauth/github/user returns 404 for unknown credential", async () => {
    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/user?account_id=nonexistent"
      ),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
  });

  it("GET /api/oauth/github/user succeeds with valid credential", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "github",
      account_id: "gh-acc",
      access_token: "gh-tok",
      token_type: "bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: 123, login: "ghuser", email: "gh@example.com" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/user?account_id=gh-acc"
      ),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as Record<string, unknown>;
    expect(body.login).toBe("ghuser");
  });

  it("GET /api/oauth/github/user returns 401 for expired token", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "github",
      account_id: "gh-expired",
      access_token: "expired",
      token_type: "bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/user?account_id=gh-expired"
      ),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
  });

  it("GET /api/oauth/github/user handles non-ok non-401 response", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "github",
      account_id: "gh-500",
      access_token: "tok",
      token_type: "bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Server Error", { status: 500 })
    );

    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/user?account_id=gh-500"
      ),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("GitHub API error");
  });

  it("GET /api/oauth/github/user handles network error", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "github",
      account_id: "gh-net",
      access_token: "tok",
      token_type: "bearer",
      received_at: now,
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Timeout"));

    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/github/user?account_id=gh-net"
      ),
      "/api/oauth/github/user",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);
    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("Timeout");
  });
});

describe("OAuth API: method not allowed and trailing slash", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  it("POST /api/oauth/hf/start returns 405", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/hf/start", { method: "POST" }),
      "/api/oauth/hf/start",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });

  it("POST /api/oauth/hf/callback returns 405", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/hf/callback", { method: "POST" }),
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });

  it("POST /api/oauth/github/start returns 405", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/github/start", {
        method: "POST",
      }),
      "/api/oauth/github/start",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(405);
  });

  it("normalizes trailing slash on path", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/hf/tokens/"),
      "/api/oauth/hf/tokens/",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
  });
});

describe("OAuth API: HuggingFace start host handling", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  it("handles host with protocol prefix", async () => {
    const request = new Request("http://localhost:7777/api/oauth/hf/start", {
      headers: { host: "http://example.com" },
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/start",
      getUserId
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as { auth_url: string };
    expect(body.auth_url).toContain("example.com");
  });

  it("handles 127.0.0.1 host (replaces with localhost)", async () => {
    const request = new Request("http://127.0.0.1:7777/api/oauth/hf/start", {
      headers: { host: "127.0.0.1:7777" },
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/start",
      getUserId
    );
    expect(response).not.toBeNull();
    const body = (await jsonBody(response!)) as { auth_url: string };
    // The redirect_uri query param contains the localhost replacement
    const url = new URL(body.auth_url);
    const redirectUri = url.searchParams.get("redirect_uri")!;
    expect(redirectUri).toContain("localhost:7777");
    expect(redirectUri).toContain("http://");
  });

  it("uses https for non-localhost host", async () => {
    const request = new Request("https://myapp.example.com/api/oauth/hf/start", {
      headers: { host: "myapp.example.com" },
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/start",
      getUserId
    );
    expect(response).not.toBeNull();
    const body = (await jsonBody(response!)) as { auth_url: string };
    // The redirect_uri query param contains the https scheme
    const url = new URL(body.auth_url);
    const redirectUri = url.searchParams.get("redirect_uri")!;
    expect(redirectUri).toContain("https://myapp.example.com");
  });
});

describe("OAuth API: pruneExpiredStates", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  it("prunes expired states during start", async () => {
    // Add an expired state
    oauthStateStore.set("old-state", {
      userId: "u1",
      codeVerifier: "v",
      redirectUri: "http://localhost/cb",
      createdAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
    });

    const request = new Request("http://localhost:7777/api/oauth/hf/start", {
      headers: { host: "localhost:7777" },
    });
    await handleOAuthRequest(request, "/api/oauth/hf/start", getUserId);

    // The old state should have been pruned
    expect(oauthStateStore.has("old-state")).toBe(false);
    // New state should exist
    expect(oauthStateStore.size).toBe(1);
  });
});
