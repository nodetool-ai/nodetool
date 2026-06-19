import { describe, it, expect, vi } from "vitest";
import { OAuthClient, type FetchLike } from "../../../src/providers/oauth/oauth-client.js";
import {
  CredentialsRevokedError,
  InvalidRefreshTokenError,
  OAuthNetworkError,
  TokenExchangeError
} from "../../../src/providers/oauth/errors.js";
import type { OAuthClientConfig } from "../../../src/providers/oauth/types.js";

const config: OAuthClientConfig = {
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  revocationEndpoint: "https://auth.example.com/revoke",
  clientId: "client-123",
  scopes: ["openid", "api.read"]
};

function jsonResponse(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

const fixedClock = { now: () => 1_000_000 };

describe("OAuthClient.buildAuthorizationUrl", () => {
  it("includes PKCE, state, and the configured scopes", () => {
    const client = new OAuthClient({ config, fetchFn: vi.fn(), clock: fixedClock });
    const url = new URL(
      client.buildAuthorizationUrl({
        redirectUri: "http://127.0.0.1:9000/callback",
        state: "state-xyz",
        codeChallenge: "challenge-abc",
        codeChallengeMethod: "S256"
      })
    );
    expect(url.origin + url.pathname).toBe("https://auth.example.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:9000/callback");
    expect(url.searchParams.get("scope")).toBe("openid api.read");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("OAuthClient.exchangeAuthorizationCode", () => {
  it("posts the code + verifier and normalizes the token response", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, {
        access_token: "access-1",
        refresh_token: "refresh-1",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid api.read"
      })
    ) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });

    const tokens = await client.exchangeAuthorizationCode({
      code: "auth-code",
      codeVerifier: "verifier",
      redirectUri: "http://127.0.0.1:9000/callback"
    });

    expect(tokens).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      tokenType: "Bearer",
      scope: "openid api.read",
      expiresAt: 1_000_000 + 3600 * 1000,
      receivedAt: 1_000_000
    });

    const [, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier");
    expect(body.get("client_id")).toBe("client-123");
  });

  it("throws TokenExchangeError when access_token is missing", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { token_type: "Bearer" })) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    await expect(
      client.exchangeAuthorizationCode({ code: "c", codeVerifier: "v", redirectUri: "r" })
    ).rejects.toBeInstanceOf(TokenExchangeError);
  });

  it("wraps fetch rejections as OAuthNetworkError", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    await expect(
      client.exchangeAuthorizationCode({ code: "c", codeVerifier: "v", redirectUri: "r" })
    ).rejects.toBeInstanceOf(OAuthNetworkError);
  });
});

describe("OAuthClient.refreshAccessToken", () => {
  it("maps invalid_grant to InvalidRefreshTokenError", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(400, { error: "invalid_grant", error_description: "expired" })
    ) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    await expect(client.refreshAccessToken("bad-refresh")).rejects.toBeInstanceOf(
      InvalidRefreshTokenError
    );
  });

  it("maps access_denied to CredentialsRevokedError", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(403, { error: "access_denied" })) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    await expect(client.refreshAccessToken("revoked")).rejects.toBeInstanceOf(
      CredentialsRevokedError
    );
  });

  it("maps 5xx responses to OAuthNetworkError", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(503, {})) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    await expect(client.refreshAccessToken("any")).rejects.toBeInstanceOf(OAuthNetworkError);
  });

  it("never includes the token in a thrown error message", async () => {
    const secret = "super-secret-refresh-token-value";
    const fetchFn = vi.fn(async () => jsonResponse(400, { error: "invalid_grant" })) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    const err = await client.refreshAccessToken(secret).catch((e) => e as Error);
    expect(err.message).not.toContain(secret);
  });
});

describe("OAuthClient.revokeToken", () => {
  it("no-ops when no revocation endpoint is configured", async () => {
    const fetchFn = vi.fn() as unknown as FetchLike;
    const client = new OAuthClient({
      config: { ...config, revocationEndpoint: undefined },
      fetchFn,
      clock: fixedClock
    });
    await client.revokeToken("token");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts to the revocation endpoint when configured", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, {})) as unknown as FetchLike;
    const client = new OAuthClient({ config, fetchFn, clock: fixedClock });
    await client.revokeToken("token", "refresh_token");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://auth.example.com/revoke",
      expect.objectContaining({ method: "POST" })
    );
  });
});
