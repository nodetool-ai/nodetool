import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, OAuthCredential } from "@nodetool-ai/models";
import {
  generatePkcePair,
  generateState,
  oauthStateStore,
  handleOAuthRequest
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
