import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestDb } from "../src/db.js";
import { setMasterKey } from "@nodetool-ai/security";
import { OAuthCredential } from "../src/oauth-credential.js";
import {
  chatGptAccountKey,
  discoverChatGptOAuth,
  findChatGptRegistration,
  parseChatGptAccountKey,
  resetChatGptDiscoveryForTests,
  resolveCodexAccessToken
} from "../src/codex-token.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz"; // base64

const DISCOVERY = {
  issuer: "https://auth.openai.com",
  authorization_endpoint: "https://auth.openai.com/oauth/authorize",
  token_endpoint: "https://auth.openai.com/oauth/token",
  revocation_endpoint: "https://auth.openai.com/oauth/revoke",
  jwks_uri: "https://auth.openai.com/.well-known/jwks.json"
};
const FULL_SCOPE =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const CLIENT_ID = "oaiapp_issued";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** Route discovery to the fixture and token requests to `token`. */
function mockOpenAI(token: (body: URLSearchParams) => Response) {
  const tokenBodies: URLSearchParams[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url, init?: RequestInit) => {
      if (String(url).endsWith("/.well-known/openid-configuration")) {
        return json(DISCOVERY);
      }
      const body = new URLSearchParams(String(init?.body));
      tokenBodies.push(body);
      return token(body);
    }
  );
  return { spy, tokenBodies };
}

async function storeSignIn(opts: {
  userId?: string;
  accountId?: string;
  scope?: string;
  expired?: boolean;
  accessToken?: string;
}) {
  return OAuthCredential.upsert({
    user_id: opts.userId ?? "user-1",
    provider: "openai_chatgpt",
    account_id: opts.accountId ?? chatGptAccountKey(CLIENT_ID, "user-sub"),
    access_token: opts.accessToken ?? (opts.expired ? "stale-token" : "valid-token"),
    refresh_token: "refresh-token",
    username: "me@example.com",
    token_type: "Bearer",
    scope: opts.scope ?? FULL_SCOPE,
    received_at: new Date(Date.now() - 7_200_000).toISOString(),
    expires_at: new Date(
      Date.now() + (opts.expired ? -3_600_000 : 3_600_000)
    ).toISOString()
  });
}

beforeEach(() => {
  initTestDb();
  setMasterKey(TEST_MASTER_KEY);
  resetChatGptDiscoveryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatGPT account keys", () => {
  it("round-trips the issued client id and subject", () => {
    expect(parseChatGptAccountKey(chatGptAccountKey("oaiapp_x", "auth0|1:2"))).toEqual({
      clientId: "oaiapp_x",
      subject: "auth0|1:2"
    });
  });

  it("rejects a key without both parts", () => {
    expect(parseChatGptAccountKey("acct")).toBeNull();
    expect(parseChatGptAccountKey(":sub")).toBeNull();
    expect(parseChatGptAccountKey("client:")).toBeNull();
  });
});

describe("discoverChatGptOAuth", () => {
  it("reads the endpoints from OpenID discovery", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(DISCOVERY));
    expect(await discoverChatGptOAuth()).toEqual({
      issuer: "https://auth.openai.com",
      authorizationEndpoint: DISCOVERY.authorization_endpoint,
      tokenEndpoint: DISCOVERY.token_endpoint,
      revocationEndpoint: DISCOVERY.revocation_endpoint,
      jwksUri: DISCOVERY.jwks_uri
    });
  });

  it("falls back to the documented endpoints when discovery points elsewhere", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ ...DISCOVERY, token_endpoint: "https://evil.example/token" })
    );
    expect(await discoverChatGptOAuth()).toEqual({
      issuer: "https://auth.openai.com",
      authorizationEndpoint: "https://auth.openai.com/api/accounts/authorize",
      tokenEndpoint: "https://auth.openai.com/api/accounts/oauth/token",
      revocationEndpoint: null,
      jwksUri: null
    });
  });
});

describe("resolveCodexAccessToken", () => {
  it("returns null when the user has not connected", async () => {
    expect(await resolveCodexAccessToken("user-1")).toBeNull();
  });

  it("returns the stored token when still valid", async () => {
    await storeSignIn({});
    expect(await resolveCodexAccessToken("user-1")).toBe("valid-token");
  });

  it("ignores a credential from the earlier Codex CLI login", async () => {
    await OAuthCredential.upsert({
      user_id: "user-1",
      provider: "openai",
      account_id: "acct",
      access_token: "codex-cli-token",
      refresh_token: "r",
      token_type: "Bearer",
      received_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString()
    });
    expect(await resolveCodexAccessToken("user-1")).toBeNull();
  });

  it("ignores a sign-in that was not granted plan usage", async () => {
    await storeSignIn({ scope: "openid profile email offline_access" });
    expect(await resolveCodexAccessToken("user-1")).toBeNull();
  });

  it("refreshes with the issued client id and resource, and persists the rotation", async () => {
    await storeSignIn({ expired: true });
    const { spy, tokenBodies } = mockOpenAI(() =>
      json({
        access_token: "fresh-token",
        refresh_token: "new-refresh",
        token_type: "Bearer",
        expires_in: 3600
      })
    );

    expect(await resolveCodexAccessToken("user-1")).toBe("fresh-token");
    expect(tokenBodies).toHaveLength(1);
    expect(Object.fromEntries(tokenBodies[0])).toEqual({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: "refresh-token",
      resource: "https://api.openai.com/v1"
    });
    expect(String(spy.mock.calls[1][0])).toBe(DISCOVERY.token_endpoint);

    const [credential] = await OAuthCredential.listForUserAndProvider(
      "user-1",
      "openai_chatgpt"
    );
    expect(await credential.getDecryptedRefreshToken()).toBe("new-refresh");
    // Scope omitted on refresh keeps the granted scopes.
    expect(credential.scope).toBe(FULL_SCOPE);

    spy.mockClear();
    expect(await resolveCodexAccessToken("user-1")).toBe("fresh-token");
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the stale token through a transient refresh failure and backs off", async () => {
    await storeSignIn({ userId: "user-2", expired: true });
    const { tokenBodies } = mockOpenAI(() =>
      json({ error: "temporarily_unavailable" }, 503)
    );

    expect(await resolveCodexAccessToken("user-2")).toBe("stale-token");
    expect(await resolveCodexAccessToken("user-2")).toBe("stale-token");
    expect(tokenBodies).toHaveLength(1);
  });

  it("clears the tokens but keeps the registration after a terminal refresh error", async () => {
    await storeSignIn({ userId: "user-3", expired: true });
    mockOpenAI(() => json({ error: "refresh_token_reused" }, 400));

    expect(await resolveCodexAccessToken("user-3")).toBeNull();
    expect(await resolveCodexAccessToken("user-3")).toBeNull();
    expect(await findChatGptRegistration("user-3")).toEqual({
      clientId: CLIENT_ID,
      subject: "user-sub",
      email: "me@example.com",
      planScopeGranted: true
    });
  });

  it("refreshes once for concurrent reads", async () => {
    await storeSignIn({ expired: true });
    const { tokenBodies } = mockOpenAI(() =>
      json({ access_token: "fresh-token", expires_in: 3600 })
    );

    const tokens = await Promise.all([
      resolveCodexAccessToken("user-1"),
      resolveCodexAccessToken("user-1"),
      resolveCodexAccessToken("user-1")
    ]);

    expect(tokens).toEqual(["fresh-token", "fresh-token", "fresh-token"]);
    expect(tokenBodies).toHaveLength(1);
  });
});
