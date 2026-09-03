import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb, OAuthCredential } from "@nodetool-ai/models";
import {
  generatePkcePair,
  generateState,
  oauthStateStore,
  handleOAuthRequest,
  closeActiveCodexCallbackServer,
  closeActiveClaudeLogin,
  parseCodexRedirect,
  pendingCodexLogins
} from "../src/oauth-api.js";

function getUserId(): string {
  return "test-user-1";
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("OAuth PKCE utilities", () => {
  it("generatePkcePair returns base64url verifier and challenge", () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();

    // base64url: only alphanumeric, dash, underscore (no padding)
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);

    // Verifier should be ~128 chars (96 bytes base64url encoded)
    expect(codeVerifier.length).toBeGreaterThan(100);

    // Challenge should be exactly 43 chars (SHA-256 = 32 bytes, base64url = 43 chars)
    expect(codeChallenge.length).toBe(43);
  });

  it("generatePkcePair produces unique pairs", () => {
    const pair1 = generatePkcePair();
    const pair2 = generatePkcePair();
    expect(pair1.codeVerifier).not.toBe(pair2.codeVerifier);
    expect(pair1.codeChallenge).not.toBe(pair2.codeChallenge);
  });

  it("generateState returns base64url string", () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes base64url = ~43 chars
    expect(state.length).toBeGreaterThan(30);
  });

  it("generateState produces unique values", () => {
    const s1 = generateState();
    const s2 = generateState();
    expect(s1).not.toBe(s2);
  });
});

describe("OAuth state store TTL", () => {
  beforeEach(() => {
    oauthStateStore.clear();
  });

  it("stores and retrieves state data", () => {
    oauthStateStore.set("test-state", {
      userId: "u1",
      codeVerifier: "verifier",
      redirectUri: "http://localhost/callback",
      createdAt: Date.now()
    });

    expect(oauthStateStore.has("test-state")).toBe(true);
    expect(oauthStateStore.get("test-state")?.userId).toBe("u1");
  });
});

describe("OAuth API: HuggingFace endpoints", () => {
  beforeEach(() => {
    initTestDb();

    oauthStateStore.clear();
  });

  it("GET /api/oauth/hf/start returns auth_url", async () => {
    const request = new Request("http://localhost:7777/api/oauth/hf/start", {
      headers: { "x-user-id": "test-user-1", host: "localhost:7777" }
    });

    const response = await handleOAuthRequest(
      request,
      "/api/oauth/hf/start",
      getUserId
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = (await jsonBody(response!)) as { auth_url: string };
    expect(body.auth_url).toContain("https://huggingface.co/oauth/authorize");
    expect(body.auth_url).toContain("client_id=");
    expect(body.auth_url).toContain("code_challenge=");
    expect(body.auth_url).toContain("state=");
    expect(body.auth_url).toContain("code_challenge_method=S256");

    // Verify state was stored
    expect(oauthStateStore.size).toBe(1);
  });

  it("hf/whoami sends the decrypted token, not the at-rest ciphertext", async () => {
    // Regression: the handler put credential.encrypted_access_token (ciphertext)
    // in the Authorization header, so HF always 401'd.
    const cred = await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "huggingface",
      account_id: "acc1",
      access_token: "hf_plaintext_secret_123",
      token_type: "Bearer",
      received_at: new Date().toISOString()
    });
    expect(cred.encrypted_access_token).not.toBe("hf_plaintext_secret_123");

    let sentAuth: string | null = null;
    const origFetch = global.fetch;
    global.fetch = (async (_url: unknown, init?: RequestInit) => {
      sentAuth = new Headers(init?.headers).get("Authorization");
      return new Response(JSON.stringify({ name: "u" }), { status: 200 });
    }) as typeof fetch;
    try {
      await handleOAuthRequest(
        new Request(
          "http://localhost:7777/api/oauth/hf/whoami?account_id=acc1"
        ),
        "/api/oauth/hf/whoami",
        getUserId
      );
    } finally {
      global.fetch = origFetch;
    }
    expect(sentAuth).toContain("hf_plaintext_secret_123");
    expect(sentAuth).not.toContain(cred.encrypted_access_token);
  });

  it("GET /api/oauth/hf/tokens returns empty list initially", async () => {
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
    expect(body.tokens).toEqual([]);
  });

  it("GET /api/oauth/hf/callback with missing params returns error HTML", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/hf/callback"),
      "/api/oauth/hf/callback",
      getUserId
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const html = await response!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("Missing required parameters");
  });

  it("GET /api/oauth/hf/callback with error param returns error HTML", async () => {
    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/hf/callback?error=access_denied&error_description=User+denied"
      ),
      "/api/oauth/hf/callback",
      getUserId
    );

    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("User denied");
  });

  it("GET /api/oauth/hf/callback with invalid state returns error HTML", async () => {
    const response = await handleOAuthRequest(
      new Request(
        "http://localhost:7777/api/oauth/hf/callback?code=abc&state=invalid"
      ),
      "/api/oauth/hf/callback",
      getUserId
    );

    expect(response).not.toBeNull();
    const html = await response!.text();
    expect(html).toContain("Authentication Failed");
    expect(html).toContain("expired or is invalid");
  });

  it("returns null for unknown OAuth routes", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/unknown"),
      "/api/oauth/unknown",
      getUserId
    );
    expect(response).toBeNull();
  });
});

describe("OAuth API: GitHub endpoints", () => {
  beforeEach(() => {
    initTestDb();

    oauthStateStore.clear();
  });

  it("GET /api/oauth/github/start returns error without GITHUB_CLIENT_ID", async () => {
    delete process.env.GITHUB_CLIENT_ID;

    const request = new Request(
      "http://localhost:7777/api/oauth/github/start",
      {
        headers: { host: "localhost:7777" }
      }
    );

    const response = await handleOAuthRequest(
      request,
      "/api/oauth/github/start",
      getUserId
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(500);

    const body = (await jsonBody(response!)) as { detail: string };
    expect(body.detail).toContain("GITHUB_CLIENT_ID");
  });

  it("GET /api/oauth/github/start returns auth_url with GITHUB_CLIENT_ID set", async () => {
    process.env.GITHUB_CLIENT_ID = "test-github-client-id";

    const request = new Request(
      "http://localhost:7777/api/oauth/github/start",
      {
        headers: { host: "localhost:7777" }
      }
    );

    const response = await handleOAuthRequest(
      request,
      "/api/oauth/github/start",
      getUserId
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = (await jsonBody(response!)) as { auth_url: string };
    expect(body.auth_url).toContain("https://github.com/login/oauth/authorize");
    expect(body.auth_url).toContain("client_id=test-github-client-id");

    delete process.env.GITHUB_CLIENT_ID;
  });

  it("GET /api/oauth/github/tokens returns empty list initially", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/github/tokens"),
      "/api/oauth/github/tokens",
      getUserId
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = (await jsonBody(response!)) as {
      tokens: Array<Record<string, unknown>>;
    };
    expect(body.tokens).toEqual([]);
  });
});

describe("parseCodexRedirect", () => {
  it("reads code and state from the whole redirect address", () => {
    expect(
      parseCodexRedirect(
        "http://localhost:1455/auth/callback?code=ac_abc&scope=openid+profile&state=st_xyz"
      )
    ).toEqual({ code: "ac_abc", state: "st_xyz" });
  });

  it("accepts a bare query string and ignores a fragment", () => {
    expect(parseCodexRedirect("  ?code=ac_abc&state=st_xyz#done  ")).toEqual({
      code: "ac_abc",
      state: "st_xyz"
    });
  });

  it("surfaces the provider's own refusal", () => {
    expect(() =>
      parseCodexRedirect(
        "http://localhost:1455/auth/callback?error=access_denied&error_description=User+said+no"
      )
    ).toThrow("User said no");
  });

  it("refuses a code with no state to check it against", () => {
    expect(() =>
      parseCodexRedirect("http://localhost:1455/auth/callback?code=ac_abc")
    ).toThrow(/whole address/);
    expect(() => parseCodexRedirect("ac_abc")).toThrow(/whole address/);
  });
});

describe("OAuth API: OpenAI (Codex) endpoints", () => {
  beforeEach(() => {
    initTestDb();
    oauthStateStore.clear();
    pendingCodexLogins.clear();
  });

  afterEach(async () => {
    await closeActiveCodexCallbackServer();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GET /api/oauth/openai/start returns a Codex PKCE auth_url", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/start", {
        headers: { host: "localhost:7777" }
      }),
      "/api/oauth/openai/start",
      getUserId
    );

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as { auth_url: string };
    expect(body.auth_url).toContain("https://auth.openai.com/oauth/authorize");
    // The published, secret-less Codex CLI client.
    expect(body.auth_url).toContain(
      "client_id=app_EMoamEEZ73f0CkXaXp7hrann"
    );
    expect(body.auth_url).toContain("code_challenge=");
    expect(body.auth_url).toContain("code_challenge_method=S256");
    expect(body.auth_url).toContain("state=");
    // Codex's pre-registered loopback redirect — not a server route.
    expect(body.auth_url).toContain(
      "redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback"
    );
    // Codex-specific authorization params.
    expect(body.auth_url).toContain("codex_cli_simplified_flow=true");
    expect(body.auth_url).toContain("id_token_add_organizations=true");
  });

  it("GET /api/oauth/openai/start binds no listener on a shared server", async () => {
    // A shared server's users browse from elsewhere, so localhost:1455 is
    // theirs, not ours — binding it here would only swallow the port.
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_KEY", "service-key");

    const response = await handleOAuthRequest(
      new Request("http://api.example.com/api/oauth/openai/start"),
      "/api/oauth/openai/start",
      getUserId
    );

    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as {
      auth_url: string;
      manual: boolean;
      redirect_uri: string;
    };
    expect(body.manual).toBe(true);
    expect(body.redirect_uri).toBe("http://localhost:1455/auth/callback");
    expect(pendingCodexLogins.size).toBe(1);

    // Nothing is listening, so the port is free to bind.
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(1455, "localhost", resolve);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  });

  it("GET /api/oauth/openai/start?manual=true skips the listener too", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/start?manual=true"),
      "/api/oauth/openai/start",
      getUserId
    );

    const body = (await jsonBody(response!)) as { manual: boolean };
    expect(body.manual).toBe(true);
  });

  it("POST /api/oauth/openai/complete exchanges a pasted redirect address", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_KEY", "service-key");

    await handleOAuthRequest(
      new Request("http://api.example.com/api/oauth/openai/start"),
      "/api/oauth/openai/start",
      getUserId
    );
    const [state] = [...pendingCodexLogins.keys()];

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "codex-access",
            refresh_token: "codex-refresh",
            token_type: "Bearer",
            expires_in: 3600
          }),
          { headers: { "content-type": "application/json" } }
        );
      }
      // userinfo is best-effort; refusing it must not fail the login.
      return new Response("nope", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleOAuthRequest(
      new Request("http://api.example.com/api/oauth/openai/complete", {
        method: "POST",
        body: JSON.stringify({
          code: `http://localhost:1455/auth/callback?code=ac_test&state=${state}`
        })
      }),
      "/api/oauth/openai/complete",
      getUserId
    );

    expect(response!.status).toBe(200);
    expect(await jsonBody(response!)).toEqual({ success: true });
    // The code is single-use; the pending login must not survive it.
    expect(pendingCodexLogins.size).toBe(0);

    const stored = await OAuthCredential.listForUserAndProvider(
      "test-user-1",
      "openai"
    );
    expect(stored).toHaveLength(1);
    expect(await stored[0].getDecryptedAccessToken()).toBe("codex-access");

    const tokenCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/oauth/token")
    );
    const sentBody = String(
      (tokenCall?.[1] as { body?: unknown } | undefined)?.body ?? ""
    );
    expect(sentBody).toContain("code=ac_test");
    expect(sentBody).toContain(
      "redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback"
    );
  });

  it("POST /api/oauth/openai/complete rejects an unknown state", async () => {
    const response = await handleOAuthRequest(
      new Request("http://api.example.com/api/oauth/openai/complete", {
        method: "POST",
        body: JSON.stringify({
          code: "http://localhost:1455/auth/callback?code=ac_test&state=nope"
        })
      }),
      "/api/oauth/openai/complete",
      getUserId
    );

    expect(response!.status).toBe(400);
    expect((await jsonBody(response!)) as { detail: string }).toMatchObject({
      detail: expect.stringContaining("expired or was never started")
    });
  });

  it("POST /api/oauth/openai/complete rejects another user's state", async () => {
    await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/start?manual=true"),
      "/api/oauth/openai/start",
      getUserId
    );
    const [state] = [...pendingCodexLogins.keys()];

    const response = await handleOAuthRequest(
      new Request("http://api.example.com/api/oauth/openai/complete", {
        method: "POST",
        body: JSON.stringify({
          code: `http://localhost:1455/auth/callback?code=ac_test&state=${state}`
        })
      }),
      "/api/oauth/openai/complete",
      () => "someone-else"
    );

    expect(response!.status).toBe(400);
    // The other user's login is still theirs to finish.
    expect(pendingCodexLogins.has(state)).toBe(true);
  });

  it("POST /api/oauth/openai/complete rejects a code with no state", async () => {
    const response = await handleOAuthRequest(
      new Request("http://api.example.com/api/oauth/openai/complete", {
        method: "POST",
        body: JSON.stringify({ code: "ac_just_the_code" })
      }),
      "/api/oauth/openai/complete",
      getUserId
    );

    expect(response!.status).toBe(400);
    expect((await jsonBody(response!)) as { detail: string }).toMatchObject({
      detail: expect.stringContaining("whole address")
    });
  });

  it("GET /api/oauth/openai/tokens returns empty list initially", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/tokens"),
      "/api/oauth/openai/tokens",
      getUserId
    );

    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as { tokens: unknown[] };
    expect(body.tokens).toEqual([]);
  });

  it("POST /api/oauth/openai/disconnect removes stored credentials", async () => {
    const now = new Date().toISOString();
    await OAuthCredential.upsert({
      user_id: "test-user-1",
      provider: "openai",
      account_id: "acc-openai",
      access_token: "openai-access",
      refresh_token: "openai-refresh",
      token_type: "Bearer",
      received_at: now
    });

    const before = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/tokens"),
      "/api/oauth/openai/tokens",
      getUserId
    );
    expect(((await jsonBody(before!)) as { tokens: unknown[] }).tokens).toHaveLength(1);

    const disconnect = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/disconnect", {
        method: "POST"
      }),
      "/api/oauth/openai/disconnect",
      getUserId
    );
    expect(disconnect!.status).toBe(200);
    const body = (await jsonBody(disconnect!)) as { success: boolean; removed: number };
    expect(body.success).toBe(true);
    expect(body.removed).toBe(1);

    const after = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/tokens"),
      "/api/oauth/openai/tokens",
      getUserId
    );
    expect(((await jsonBody(after!)) as { tokens: unknown[] }).tokens).toEqual([]);
  });

  it("rejects a GET to the disconnect endpoint", async () => {
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/openai/disconnect"),
      "/api/oauth/openai/disconnect",
      getUserId
    );
    expect(response!.status).toBe(405);
  });
});

describe("OAuthCredential model CRUD", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("creates and retrieves a credential", async () => {
    const now = new Date().toISOString();
    const cred = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "huggingface",
      account_id: "acc123",
      access_token: "hf_token_abc",
      refresh_token: "hf_refresh_xyz",
      username: "testuser",
      token_type: "Bearer",
      scope: "openid read-repos",
      received_at: now,
      expires_at: null
    });

    expect(cred.user_id).toBe("u1");
    expect(cred.provider).toBe("huggingface");
    expect(cred.account_id).toBe("acc123");
    // Tokens are encrypted at rest; verify via decryption
    const decryptedAccess = await cred.getDecryptedAccessToken();
    expect(decryptedAccess).toBe("hf_token_abc");
    const decryptedRefresh = await cred.getDecryptedRefreshToken();
    expect(decryptedRefresh).toBe("hf_refresh_xyz");
    expect(cred.username).toBe("testuser");
    expect(cred.id).toBeDefined();
  });

  it("upserts existing credential", async () => {
    const now = new Date().toISOString();
    const cred1 = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "huggingface",
      account_id: "acc123",
      access_token: "token1",
      token_type: "Bearer",
      received_at: now
    });

    const cred2 = await OAuthCredential.upsert({
      user_id: "u1",
      provider: "huggingface",
      account_id: "acc123",
      access_token: "token2",
      token_type: "Bearer",
      received_at: now
    });

    expect(cred2.id).toBe(cred1.id);
    // Tokens are encrypted at rest; verify via decryption
    const decrypted = await cred2.getDecryptedAccessToken();
    expect(decrypted).toBe("token2");
  });

  it("findByAccount returns null for non-existent credential", async () => {
    const result = await OAuthCredential.findByAccount(
      "u1",
      "huggingface",
      "nonexistent"
    );
    expect(result).toBeNull();
  });

  it("listForUserAndProvider returns correct credentials", async () => {
    const now = new Date().toISOString();

    await OAuthCredential.upsert({
      user_id: "u1",
      provider: "huggingface",
      account_id: "acc1",
      access_token: "tok1",
      token_type: "Bearer",
      received_at: now
    });

    await OAuthCredential.upsert({
      user_id: "u1",
      provider: "huggingface",
      account_id: "acc2",
      access_token: "tok2",
      token_type: "Bearer",
      received_at: now
    });

    await OAuthCredential.upsert({
      user_id: "u1",
      provider: "github",
      account_id: "acc3",
      access_token: "tok3",
      token_type: "Bearer",
      received_at: now
    });

    const hfCreds = await OAuthCredential.listForUserAndProvider(
      "u1",
      "huggingface"
    );
    expect(hfCreds.length).toBe(2);

    const ghCreds = await OAuthCredential.listForUserAndProvider(
      "u1",
      "github"
    );
    expect(ghCreds.length).toBe(1);
    expect(ghCreds[0].account_id).toBe("acc3");
  });

  it("different users have isolated credentials", async () => {
    const now = new Date().toISOString();

    await OAuthCredential.upsert({
      user_id: "u1",
      provider: "huggingface",
      account_id: "acc1",
      access_token: "tok1",
      token_type: "Bearer",
      received_at: now
    });

    await OAuthCredential.upsert({
      user_id: "u2",
      provider: "huggingface",
      account_id: "acc2",
      access_token: "tok2",
      token_type: "Bearer",
      received_at: now
    });

    const u1Creds = await OAuthCredential.listForUserAndProvider(
      "u1",
      "huggingface"
    );
    expect(u1Creds.length).toBe(1);
    // Tokens are encrypted at rest; verify via decryption
    const decryptedU1 = await u1Creds[0].getDecryptedAccessToken();
    expect(decryptedU1).toBe("tok1");

    const u2Creds = await OAuthCredential.listForUserAndProvider(
      "u2",
      "huggingface"
    );
    expect(u2Creds.length).toBe(1);
    const decryptedU2 = await u2Creds[0].getDecryptedAccessToken();
    expect(decryptedU2).toBe("tok2");
  });
});

describe("OAuth API: Claude subscription endpoints", () => {
  // The Claude routes persist to the Claude Agent SDK's credential file rather
  // than the database, so every test points CLAUDE_CONFIG_DIR at a scratch dir.
  let configDir: string;
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
    configDir = await mkdtemp(join(tmpdir(), "claude-oauth-api-"));
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(async () => {
    await closeActiveClaudeLogin();
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
    }
    await rm(configDir, { recursive: true, force: true });
  });

  /** Mirrors the server: the router is handed a pathname, not a full URL. */
  function claudeRequest(
    path: string,
    init?: RequestInit
  ): Promise<Response | null> {
    const url = new URL(`http://localhost:7777${path}`);
    return handleOAuthRequest(new Request(url, init), url.pathname, getUserId);
  }

  it("GET /api/oauth/claude/start returns both authorization URLs", async () => {
    const response = await claudeRequest("/api/oauth/claude/start");

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);

    const body = (await jsonBody(response!)) as {
      auth_url: string;
      manual_auth_url: string;
      manual: boolean;
      redirect_uri: string | null;
      state: string;
    };
    const authUrl = new URL(body.auth_url);
    expect(authUrl.origin + authUrl.pathname).toBe(
      "https://claude.com/cai/oauth/authorize"
    );
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("state")).toBe(body.state);
    // The loopback listener is bound on the `claude` CLI's own port, so the
    // redirect points back at this process.
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:54545/callback"
    );
    expect(body.manual).toBe(false);
    expect(body.redirect_uri).toBe("http://localhost:54545/callback");
    expect(body.manual_auth_url).toContain(
      encodeURIComponent("https://platform.claude.com/oauth/code/callback")
    );
  });

  it("offers only the paste flow on a shared server", async () => {
    // A shared server's users browse from elsewhere, so localhost:54545 is
    // theirs, not ours — binding it here would only swallow the port.
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_KEY", "service-key");

    const response = await claudeRequest("/api/oauth/claude/start");
    const body = (await jsonBody(response!)) as {
      auth_url: string;
      manual_auth_url: string;
      manual: boolean;
      redirect_uri: string | null;
    };
    expect(body.manual).toBe(true);
    expect(body.redirect_uri).toBeNull();
    expect(body.auth_url).toBe(body.manual_auth_url);

    // Nothing is listening, so the port is free to bind.
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(54545, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  });

  it("offers only the paste flow when the browser can't reach this process", async () => {
    const response = await claudeRequest("/api/oauth/claude/start?manual=true");

    const body = (await jsonBody(response!)) as {
      auth_url: string;
      manual_auth_url: string;
    };
    // With no listener bound, `auth_url` falls back to the manual URL.
    expect(body.auth_url).toBe(body.manual_auth_url);
    expect(body.auth_url).not.toContain("localhost%3A");
  });

  it("points at the console for a console login", async () => {
    const response = await claudeRequest(
      "/api/oauth/claude/start?login_method=console&manual=true"
    );
    const body = (await jsonBody(response!)) as { auth_url: string };
    expect(body.auth_url).toContain(
      "https://platform.claude.com/oauth/authorize"
    );
  });

  it("GET /api/oauth/claude/tokens reports disconnected with no stored login", async () => {
    const response = await claudeRequest("/api/oauth/claude/tokens");

    expect(response!.status).toBe(200);
    const body = (await jsonBody(response!)) as { tokens: unknown[] };
    expect(body.tokens).toEqual([]);
  });

  it("GET /api/oauth/claude/tokens reflects a stored login", async () => {
    await writeFile(
      join(configDir, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "access-1",
          refreshToken: "refresh-1",
          expiresAt: Date.now() + 3_600_000,
          scopes: ["user:profile", "user:inference"],
          subscriptionType: "max",
          rateLimitTier: null
        }
      })
    );

    const response = await claudeRequest("/api/oauth/claude/tokens");
    const body = (await jsonBody(response!)) as {
      tokens: Array<Record<string, unknown>>;
    };

    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0]).toMatchObject({
      provider: "claude",
      scope: "user:profile user:inference",
      expired: false,
      subscription_type: "max"
    });
    // Token material must never reach the status response.
    expect(JSON.stringify(body)).not.toContain("access-1");
    expect(JSON.stringify(body)).not.toContain("refresh-1");
  });

  it("POST /api/oauth/claude/disconnect removes the stored login", async () => {
    await writeFile(
      join(configDir, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "access-1",
          refreshToken: "refresh-1",
          expiresAt: null,
          scopes: [],
          subscriptionType: null,
          rateLimitTier: null
        }
      })
    );

    const response = await claudeRequest("/api/oauth/claude/disconnect", {
      method: "POST"
    });

    expect(response!.status).toBe(200);
    expect(await jsonBody(response!)).toEqual({ success: true, removed: 1 });

    const after = (await jsonBody(
      (await claudeRequest("/api/oauth/claude/tokens"))!
    )) as { tokens: unknown[] };
    expect(after.tokens).toEqual([]);
  });

  it("POST /api/oauth/claude/complete rejects a code with no login in progress", async () => {
    const response = await claudeRequest("/api/oauth/claude/complete", {
      method: "POST",
      body: JSON.stringify({ code: "the-code#the-state" })
    });

    expect(response!.status).toBe(400);
    expect(await jsonBody(response!)).toMatchObject({
      detail: expect.stringContaining("No Claude login in progress")
    });
  });

  it("POST /api/oauth/claude/complete rejects a mismatched state", async () => {
    await claudeRequest("/api/oauth/claude/start?manual=true");

    const response = await claudeRequest("/api/oauth/claude/complete", {
      method: "POST",
      body: JSON.stringify({ code: "the-code#not-the-state" })
    });

    expect(response!.status).toBe(400);
    expect(await jsonBody(response!)).toMatchObject({
      detail: expect.stringContaining("state mismatch")
    });
  });

  it("rejects the wrong method on the mutating routes", async () => {
    for (const path of [
      "/api/oauth/claude/complete",
      "/api/oauth/claude/disconnect"
    ]) {
      const response = await claudeRequest(path);
      expect(response!.status).toBe(405);
    }
  });
});
