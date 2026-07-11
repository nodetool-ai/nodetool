import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { initTestDb, OAuthCredential } from "@nodetool-ai/models";
import {
  generatePkcePair,
  generateState,
  oauthStateStore,
  handleOAuthRequest
} from "../src/oauth-api.js";

const USER_ID = "test-user-cov";
function getUserId(): string {
  return USER_ID;
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** Build a Response-like object used by the mocked fetch. */
function makeResponse(
  body: unknown,
  init: { status?: number } = {}
): Response {
  const status = init.status ?? 200;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** Seed a valid (unexpired) state entry and return the state token. */
function seedState(overrides: Partial<{ createdAt: number }> = {}): string {
  const state = generateState();
  oauthStateStore.set(state, {
    userId: USER_ID,
    codeVerifier: "verifier-abc",
    redirectUri: "http://localhost:7777/api/oauth/hf/callback",
    createdAt: overrides.createdAt ?? Date.now()
  });
  return state;
}

describe("oauth-api PKCE / state helpers (extended)", () => {
  it("code challenge equals base64url SHA-256 of the verifier", () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const expected = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    expect(codeChallenge).toBe(expected);
    // No base64 padding / non-url characters.
    expect(codeChallenge).not.toContain("=");
    expect(codeChallenge).not.toContain("+");
    expect(codeChallenge).not.toContain("/");
  });

  it("generateState is high-entropy and unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = generateState();
      expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });
});

describe("oauth-api router: unknown routes and trailing-slash normalisation", () => {
  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
  });

  it("returns null for a non-oauth path", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/foo"),
      "/api/foo",
      getUserId
    );
    expect(res).toBeNull();
  });

  it("normalises a trailing slash so the route still matches", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/tokens/"),
      "/api/oauth/hf/tokens/",
      getUserId
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as { tokens: unknown[] };
    expect(body.tokens).toEqual([]);
  });

  it("does not strip the slash of the root path", async () => {
    // "/" has length 1, so normalizePath leaves it untouched -> unknown route.
    const res = await handleOAuthRequest(
      new Request("http://localhost/"),
      "/",
      getUserId
    );
    expect(res).toBeNull();
  });
});

describe("oauth-api HuggingFace: method guards", () => {
  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
  });

  it("hf/start rejects non-GET with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/start", { method: "POST" }),
      "/api/oauth/hf/start",
      getUserId
    );
    expect(res!.status).toBe(405);
  });

  it("hf/callback rejects non-GET with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/callback", { method: "POST" }),
      "/api/oauth/hf/callback",
      getUserId
    );
    expect(res!.status).toBe(405);
  });

  it("hf/refresh rejects non-POST with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/refresh"),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(405);
  });

  it("hf/whoami rejects non-GET with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami", { method: "POST" }),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(405);
  });
});

describe("oauth-api hf/start redirect URI derivation", () => {
  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
  });

  it("normalises 127.0.0.1 host to localhost (http scheme)", async () => {
    const res = await handleOAuthRequest(
      new Request("http://127.0.0.1:7777/api/oauth/hf/start", {
        headers: { host: "127.0.0.1:7777" }
      }),
      "/api/oauth/hf/start",
      getUserId
    );
    const body = (await jsonBody(res!)) as { auth_url: string };
    // redirect_uri should use http and localhost
    expect(body.auth_url).toContain(
      encodeURIComponent("http://localhost:7777/api/oauth/hf/callback")
    );
  });

  it("uses https for a non-localhost host", async () => {
    const res = await handleOAuthRequest(
      new Request("http://example.com/api/oauth/hf/start", {
        headers: { host: "example.com" }
      }),
      "/api/oauth/hf/start",
      getUserId
    );
    const body = (await jsonBody(res!)) as { auth_url: string };
    expect(body.auth_url).toContain(
      encodeURIComponent("https://example.com/api/oauth/hf/callback")
    );
  });
});

describe("oauth-api hf/callback token exchange (fetch mocked)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("completes the flow and stores a credential (whoami ok, expires_in set)", async () => {
    const state = seedState();
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({
          access_token: "hf-access",
          refresh_token: "hf-refresh",
          token_type: "Bearer",
          scope: "openid",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(
        makeResponse({ id: "hf-id-1", name: "octocat" })
      );

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/hf/callback?code=thecode&state=${state}`
      ),
      "/api/oauth/hf/callback",
      getUserId
    );

    const html = await res!.text();
    expect(html).toContain("Authentication Successful");
    expect(html).toContain("octocat");
    // State consumed.
    expect(oauthStateStore.has(state)).toBe(false);

    const creds = await OAuthCredential.listForUserAndProvider(
      USER_ID,
      "huggingface"
    );
    expect(creds.length).toBe(1);
    expect(creds[0].account_id).toBe("hf-id-1");
    expect(creds[0].expires_at).not.toBeNull();
  });

  it("uses token slice as account id when whoami fails", async () => {
    const state = seedState();
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ access_token: "abcdefghijklmnopqrstuvwxyz" })
      )
      .mockResolvedValueOnce(makeResponse("nope", { status: 500 }));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/hf/callback?code=c&state=${state}`
      ),
      "/api/oauth/hf/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Successful");

    const creds = await OAuthCredential.listForUserAndProvider(
      USER_ID,
      "huggingface"
    );
    expect(creds[0].account_id).toBe("abcdefghijklmnop"); // first 16 chars
  });

  it("returns error HTML when the token endpoint responds non-ok", async () => {
    const state = seedState();
    fetchMock.mockResolvedValueOnce(
      makeResponse("bad grant", { status: 400 })
    );

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/hf/callback?code=c&state=${state}`
      ),
      "/api/oauth/hf/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("bad grant");
  });

  it("returns error HTML when no access token is returned", async () => {
    const state = seedState();
    fetchMock.mockResolvedValueOnce(makeResponse({ token_type: "Bearer" }));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/hf/callback?code=c&state=${state}`
      ),
      "/api/oauth/hf/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("No access token");
  });

  it("returns internal_error HTML when fetch throws", async () => {
    const state = seedState();
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/hf/callback?code=c&state=${state}`
      ),
      "/api/oauth/hf/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("network down");
  });

  it("rejects an expired state (past TTL) with error HTML", async () => {
    const state = seedState({ createdAt: Date.now() - 10 * 60 * 1000 });
    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/hf/callback?code=c&state=${state}`
      ),
      "/api/oauth/hf/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("has expired");
    // Expired entry pruned.
    expect(oauthStateStore.has(state)).toBe(false);
  });
});

describe("oauth-api hf/refresh (fetch mocked)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when account_id is missing", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/refresh", { method: "POST" }),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(400);
    expect(((await jsonBody(res!)) as { detail: string }).detail).toContain(
      "account_id"
    );
  });

  it("returns 404 when no credential exists", async () => {
    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/refresh?account_id=missing",
        { method: "POST" }
      ),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(404);
  });

  it("returns 400 when the credential has no refresh token", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "no-refresh",
      access_token: "acc",
      refresh_token: null,
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/refresh?account_id=no-refresh",
        { method: "POST" }
      ),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(400);
    expect(((await jsonBody(res!)) as { detail: string }).detail).toContain(
      "No refresh token"
    );
  });

  it("refreshes successfully and returns success json", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "acc-refresh",
      access_token: "old-access",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "Bearer",
        scope: "openid",
        expires_in: 100
      })
    );

    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/refresh?account_id=acc-refresh",
        { method: "POST" }
      ),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("returns 400 when the refresh endpoint responds non-ok", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "acc-refresh-err",
      access_token: "old",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(makeResponse("invalid", { status: 400 }));

    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/refresh?account_id=acc-refresh-err",
        { method: "POST" }
      ),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(400);
    expect(((await jsonBody(res!)) as { detail: string }).detail).toContain(
      "Failed to refresh"
    );
  });

  it("returns 400 when the refresh response omits an access token", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "acc-refresh-noacc",
      access_token: "old",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(makeResponse({ token_type: "Bearer" }));

    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/refresh?account_id=acc-refresh-noacc",
        { method: "POST" }
      ),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(400);
    expect(((await jsonBody(res!)) as { detail: string }).detail).toContain(
      "No access token"
    );
  });

  it("returns 500 when fetch throws during refresh", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "acc-refresh-throw",
      access_token: "old",
      refresh_token: "old-refresh",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockRejectedValueOnce(new Error("boom"));

    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/refresh?account_id=acc-refresh-throw",
        { method: "POST" }
      ),
      "/api/oauth/hf/refresh",
      getUserId
    );
    expect(res!.status).toBe(500);
    expect(((await jsonBody(res!)) as { detail: string }).detail).toContain(
      "boom"
    );
  });
});

describe("oauth-api hf/whoami (fetch mocked)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 when account_id is missing", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami"),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(400);
  });

  it("returns 404 when no credential exists", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami?account_id=nope"),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(404);
  });

  it("returns 401 when the API reports an expired token", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "who-401",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(makeResponse("", { status: 401 }));

    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami?account_id=who-401"),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(401);
  });

  it("propagates a non-ok upstream status", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "who-503",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(makeResponse("down", { status: 503 }));

    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami?account_id=who-503"),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(503);
  });

  it("returns normalised user info on success", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "who-ok",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(
      makeResponse({ id: "u9", name: "Neo", type: "user" })
    );

    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami?account_id=who-ok"),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as { id: string; name: string };
    expect(body.id).toBe("u9");
    expect(body.name).toBe("Neo");
  });

  it("returns 500 when fetch throws", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "huggingface",
      account_id: "who-throw",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockRejectedValueOnce(new Error("kaput"));

    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/hf/whoami?account_id=who-throw"),
      "/api/oauth/hf/whoami",
      getUserId
    );
    expect(res!.status).toBe(500);
  });
});

describe("oauth-api GitHub start/callback (fetch + env mocked)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedId = process.env.GITHUB_CLIENT_ID;
  const savedSecret = process.env.GITHUB_CLIENT_SECRET;

  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedId === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = savedId;
    if (savedSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = savedSecret;
  });

  it("github/start rejects non-GET with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/start", {
        method: "POST"
      }),
      "/api/oauth/github/start",
      getUserId
    );
    expect(res!.status).toBe(405);
  });

  it("github/callback rejects non-GET with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/callback", {
        method: "POST"
      }),
      "/api/oauth/github/callback",
      getUserId
    );
    expect(res!.status).toBe(405);
  });

  it("github/callback returns error HTML on provider error param", async () => {
    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/github/callback?error=access_denied"
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Failed");
  });

  it("github/callback returns error HTML on missing params", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/callback"),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Missing required parameters");
  });

  it("github/callback rejects an unknown state", async () => {
    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/github/callback?code=c&state=unknown"
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("expired or is invalid");
  });

  it("github/callback rejects an expired state", async () => {
    const state = seedState({ createdAt: Date.now() - 10 * 60 * 1000 });
    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("has expired");
  });

  it("github/callback errors when client id/secret are not configured", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    const state = seedState();
    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("not properly configured");
  });

  it("github/callback completes and stores a credential (user ok)", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    const state = seedState();
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({
          access_token: "gh-access",
          token_type: "bearer",
          scope: "read:user"
        })
      )
      .mockResolvedValueOnce(makeResponse({ id: 42, login: "ghuser" }));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Successful");
    expect(html).toContain("ghuser");

    const creds = await OAuthCredential.listForUserAndProvider(
      USER_ID,
      "github"
    );
    expect(creds.length).toBe(1);
    expect(creds[0].account_id).toBe("42");
  });

  it("github/callback derives a hash account id when the user call fails", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    const state = seedState();
    fetchMock
      .mockResolvedValueOnce(makeResponse({ access_token: "gh-access-xyz" }))
      .mockResolvedValueOnce(makeResponse("nope", { status: 500 }));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Successful");

    const creds = await OAuthCredential.listForUserAndProvider(
      USER_ID,
      "github"
    );
    expect(creds.length).toBe(1);
    // Fallback id is a numeric string derived from a hash.
    expect(creds[0].account_id).toMatch(/^\d+$/);
  });

  it("github/callback returns error HTML on non-ok token exchange", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    const state = seedState();
    fetchMock.mockResolvedValueOnce(
      makeResponse("bad code", { status: 400 })
    );

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("bad code");
  });

  it("github/callback returns error HTML when no access token is returned", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    const state = seedState();
    fetchMock.mockResolvedValueOnce(makeResponse({ token_type: "bearer" }));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("No access token received from GitHub");
  });

  it("github/callback returns internal_error HTML when fetch throws", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    const state = seedState();
    fetchMock.mockRejectedValueOnce(new Error("gh network"));

    const res = await handleOAuthRequest(
      new Request(
        `http://localhost/api/oauth/github/callback?code=c&state=${state}`
      ),
      "/api/oauth/github/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).toContain("gh network");
  });
});

describe("oauth-api github/user (fetch mocked)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-GET with 405", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user", {
        method: "POST"
      }),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(405);
  });

  it("returns 400 when account_id is missing", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(400);
  });

  it("returns 404 when the credential is absent", async () => {
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user?account_id=missing"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(404);
  });

  it("maps an upstream 401 to a 401", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "github",
      account_id: "gh-401",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(makeResponse("", { status: 401 }));
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user?account_id=gh-401"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(401);
  });

  it("propagates a non-ok upstream status", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "github",
      account_id: "gh-500",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(makeResponse("boom", { status: 502 }));
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user?account_id=gh-500"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(502);
  });

  it("returns the raw user payload on success", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "github",
      account_id: "gh-ok",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockResolvedValueOnce(
      makeResponse({ id: 7, login: "mona" })
    );
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user?account_id=gh-ok"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(200);
    const body = (await jsonBody(res!)) as { login: string };
    expect(body.login).toBe("mona");
  });

  it("returns 500 when fetch throws", async () => {
    await OAuthCredential.upsert({
      user_id: USER_ID,
      provider: "github",
      account_id: "gh-throw",
      access_token: "acc",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    fetchMock.mockRejectedValueOnce(new Error("ghx"));
    const res = await handleOAuthRequest(
      new Request("http://localhost/api/oauth/github/user?account_id=gh-throw"),
      "/api/oauth/github/user",
      getUserId
    );
    expect(res!.status).toBe(500);
  });
});

describe("oauth-api HTML escaping in error responses", () => {
  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
  });

  it("escapes angle brackets from the error param", async () => {
    const res = await handleOAuthRequest(
      new Request(
        "http://localhost/api/oauth/hf/callback?error=%3Cscript%3E&error_description=%3Cb%3Ehi%3C%2Fb%3E"
      ),
      "/api/oauth/hf/callback",
      getUserId
    );
    const html = await res!.text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
