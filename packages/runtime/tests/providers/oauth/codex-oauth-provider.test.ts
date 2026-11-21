import { describe, it, expect, vi } from "vitest";
import OpenAI from "openai";
import {
  createCodexOAuthProvider,
  CODEX_OAUTH_CLIENT_ID,
  CODEX_BACKEND_BASE_URL,
  CODEX_ORIGINATOR,
  CODEX_CALLBACK_PORT,
  CODEX_CALLBACK_PATH,
  DEFAULT_CODEX_OAUTH_CONFIG
} from "../../../src/providers/oauth/index.js";
import { OpenAIOAuthProvider } from "../../../src/providers/oauth/openai-oauth-provider.js";
import { InMemoryTokenStore } from "../../../src/providers/oauth/token-store.js";
import type { OAuthTokens } from "../../../src/providers/oauth/types.js";

/** Mint a Codex-shaped access-token JWT carrying a chatgpt_account_id claim. */
function codexJwt(accountId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } })
  ).toString("base64url");
  return `${header}.${body}.sig`;
}

function tokensFor(accessToken: string): OAuthTokens {
  return {
    accessToken,
    refreshToken: "refresh-x",
    tokenType: "Bearer",
    scope: "openid",
    expiresAt: null,
    receivedAt: Date.now()
  };
}

describe("DEFAULT_CODEX_OAUTH_CONFIG", () => {
  it("carries the Codex scopes and simplified-flow auth params", () => {
    expect(DEFAULT_CODEX_OAUTH_CONFIG.scopes).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access"
    ]);
    expect(DEFAULT_CODEX_OAUTH_CONFIG.extraAuthParams).toEqual({
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true"
    });
  });
});

describe("createCodexOAuthProvider", () => {
  it("builds an OpenAIOAuthProvider using the public Codex client id", () => {
    const provider = createCodexOAuthProvider({ tokenStore: new InMemoryTokenStore() });
    expect(provider).toBeInstanceOf(OpenAIOAuthProvider);
  });

  it("uses the Codex client id and simplified-flow params in the auth URL", async () => {
    const provider = createCodexOAuthProvider({
      tokenStore: new InMemoryTokenStore(),
      browserLauncher: { open: vi.fn(async () => undefined) }
    });
    // Reach into the OAuth client to build an authorization URL deterministically.
    const oauthClient = (provider as unknown as { oauthClient: {
      buildAuthorizationUrl(p: {
        redirectUri: string;
        state: string;
        codeChallenge: string;
        codeChallengeMethod: "S256";
      }): string;
    } }).oauthClient;

    const url = new URL(
      oauthClient.buildAuthorizationUrl({
        redirectUri: `http://localhost:${CODEX_CALLBACK_PORT}${CODEX_CALLBACK_PATH}`,
        state: "state-1",
        codeChallenge: "challenge-1",
        codeChallengeMethod: "S256"
      })
    );

    expect(url.searchParams.get("client_id")).toBe(CODEX_OAUTH_CLIENT_ID);
    expect(url.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(url.searchParams.get("scope")).toBe("openid profile email offline_access");
  });

  it("pins the callback server to the Codex-registered loopback redirect", () => {
    const provider = createCodexOAuthProvider({ tokenStore: new InMemoryTokenStore() });
    const factory = (provider as unknown as {
      callbackServerFactory: () => { requestedPort?: number; path?: string };
    }).callbackServerFactory;
    const server = factory() as unknown as { requestedPort: number; path: string };
    expect(server.requestedPort).toBe(CODEX_CALLBACK_PORT);
    expect(server.path).toBe(CODEX_CALLBACK_PATH);
  });

  it("targets the Codex backend with originator and chatgpt-account-id headers", async () => {
    const tokenStore = new InMemoryTokenStore();
    const accessToken = codexJwt("acct-789");
    await tokenStore.save(tokensFor(accessToken));

    const provider = createCodexOAuthProvider({ tokenStore });
    // Prime the in-memory session from the store, then build the SDK client.
    expect(await provider.getAccessToken()).toBe(accessToken);
    const client = provider.getClient();

    expect(client).toBeInstanceOf(OpenAI);
    expect(client.baseURL).toBe(CODEX_BACKEND_BASE_URL);

    const headers = (client as unknown as {
      _options: { defaultHeaders: Record<string, string> };
    })._options.defaultHeaders;
    expect(headers.originator).toBe(CODEX_ORIGINATOR);
    expect(headers["chatgpt-account-id"]).toBe("acct-789");
  });

  it("omits the account-id header when the token is opaque (non-JWT)", async () => {
    const tokenStore = new InMemoryTokenStore();
    await tokenStore.save(tokensFor("sk-opaque"));

    const provider = createCodexOAuthProvider({ tokenStore });
    await provider.getAccessToken();
    const client = provider.getClient();

    const headers = (client as unknown as {
      _options: { defaultHeaders: Record<string, string> };
    })._options.defaultHeaders;
    expect(headers.originator).toBe(CODEX_ORIGINATOR);
    expect(headers["chatgpt-account-id"]).toBeUndefined();
  });
});
