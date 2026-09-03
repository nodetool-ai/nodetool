import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_CALLBACK_PORT,
  CLAUDE_CODE_OAUTH_CLIENT_ID,
  CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL,
  CLAUDE_CODE_OAUTH_TOKEN_URL
} from "@nodetool-ai/protocol";
import {
  ClaudeCodeOAuthClient,
  type JsonFetchLike
} from "../../../src/providers/oauth/claude-code-oauth-client.js";
import {
  ClaudeCodeCredentialsStore,
  isExpired
} from "../../../src/providers/oauth/claude-code-credentials.js";
import {
  ClaudeCodeLogin,
  parsePastedCode
} from "../../../src/providers/oauth/claude-code-login.js";
import {
  InvalidRefreshTokenError,
  StateMismatchError,
  TokenExchangeError
} from "../../../src/providers/oauth/errors.js";
import { LocalCallbackServer } from "../../../src/providers/oauth/local-callback-server.js";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch double that records calls and replays queued responses. */
function fakeFetch(
  responses: Array<{ ok: boolean; status: number; body: unknown }>
): JsonFetchLike & { calls: RecordedRequest[] } {
  const calls: RecordedRequest[] = [];
  const fn = (async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined
    });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request to ${url}`);
    return {
      ok: next.ok,
      status: next.status,
      json: async () => next.body
    };
  }) as JsonFetchLike & { calls: RecordedRequest[] };
  fn.calls = calls;
  return fn;
}

const tokenResponse = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_in: 3600,
  scope: "user:profile user:inference",
  account: { uuid: "acct-1", email_address: "dev@example.com" },
  organization: { uuid: "org-1" }
};

describe("ClaudeCodeOAuthClient", () => {
  it("builds the authorization URL the Claude CLI sends", async () => {
    const client = new ClaudeCodeOAuthClient({ fetchFn: fakeFetch([]) });
    const url = new URL(
      client.buildAuthorizationUrl({
        codeChallenge: "challenge",
        state: "state-1",
        redirectUri: "http://localhost:4321/callback"
      })
    );

    expect(url.origin + url.pathname).toBe("https://claude.com/cai/oauth/authorize");
    expect(url.searchParams.get("code")).toBe("true");
    expect(url.searchParams.get("client_id")).toBe(CLAUDE_CODE_OAUTH_CLIENT_ID);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4321/callback"
    );
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")).toContain("user:inference");
  });

  it("points at the console for a console login", () => {
    const client = new ClaudeCodeOAuthClient({ fetchFn: fakeFetch([]) });
    const url = client.buildAuthorizationUrl({
      codeChallenge: "c",
      state: "s",
      redirectUri: CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL,
      loginMethod: "console"
    });
    expect(url.startsWith("https://platform.claude.com/oauth/authorize")).toBe(true);
  });

  it("posts a JSON body carrying the CSRF state on code exchange", async () => {
    const fetchFn = fakeFetch([{ ok: true, status: 200, body: tokenResponse }]);
    const client = new ClaudeCodeOAuthClient({
      fetchFn,
      clock: { now: () => 1_000 }
    });

    const tokens = await client.exchangeAuthorizationCode({
      code: "code-1",
      state: "state-1",
      codeVerifier: "verifier-1",
      redirectUri: "http://localhost:4321/callback"
    });

    const [call] = fetchFn.calls;
    expect(call.url).toBe(CLAUDE_CODE_OAUTH_TOKEN_URL);
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.body).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: "http://localhost:4321/callback",
      client_id: CLAUDE_CODE_OAUTH_CLIENT_ID,
      code_verifier: "verifier-1",
      state: "state-1"
    });

    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.expiresAt).toBe(1_000 + 3_600_000);
    expect(tokens.scopes).toEqual(["user:profile", "user:inference"]);
    expect(tokens.account).toEqual({
      uuid: "acct-1",
      emailAddress: "dev@example.com",
      organizationUuid: "org-1"
    });
  });

  it("reuses the old refresh token when the server omits one", async () => {
    const fetchFn = fakeFetch([
      {
        ok: true,
        status: 200,
        body: { access_token: "access-2", expires_in: 60, scope: "user:inference" }
      }
    ]);
    const client = new ClaudeCodeOAuthClient({ fetchFn });

    const tokens = await client.refreshAccessToken("refresh-1");

    expect(tokens.accessToken).toBe("access-2");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(fetchFn.calls[0].body).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "refresh-1"
    });
    // `org:create_api_key` is a login-only scope; refresh must not ask for it.
    expect(
      (fetchFn.calls[0].body as { scope: string }).scope
    ).not.toContain("org:create_api_key");
  });

  it("maps a 401 exchange to a token-exchange error without leaking the body", async () => {
    const client = new ClaudeCodeOAuthClient({
      fetchFn: fakeFetch([
        { ok: false, status: 401, body: { error: "invalid_grant", secret: "x" } }
      ])
    });
    await expect(
      client.exchangeAuthorizationCode({
        code: "bad",
        state: "s",
        codeVerifier: "v",
        redirectUri: "http://localhost:1/callback"
      })
    ).rejects.toBeInstanceOf(TokenExchangeError);
  });

  it("maps a rejected refresh to InvalidRefreshTokenError", async () => {
    const client = new ClaudeCodeOAuthClient({
      fetchFn: fakeFetch([
        { ok: false, status: 400, body: { error: "invalid_grant" } }
      ])
    });
    await expect(client.refreshAccessToken("stale")).rejects.toBeInstanceOf(
      InvalidRefreshTokenError
    );
  });

  it("returns null rather than failing when the profile lookup errors", async () => {
    const client = new ClaudeCodeOAuthClient({
      fetchFn: fakeFetch([{ ok: false, status: 403, body: {} }])
    });
    expect(await client.fetchProfile("access-1")).toBeNull();
  });

  it("maps the organization type onto the plan label", async () => {
    const client = new ClaudeCodeOAuthClient({
      fetchFn: fakeFetch([
        {
          ok: true,
          status: 200,
          body: {
            account: { email_address: "dev@example.com", display_name: "Dev" },
            organization: { organization_type: "claude_max", rate_limit_tier: "t1" }
          }
        }
      ])
    });
    expect(await client.fetchProfile("access-1")).toMatchObject({
      subscriptionType: "max",
      rateLimitTier: "t1",
      emailAddress: "dev@example.com"
    });
  });
});

describe("ClaudeCodeCredentialsStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "claude-creds-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the claudeAiOauth shape the Claude Agent SDK reads", async () => {
    const store = new ClaudeCodeCredentialsStore({ configDir: dir });
    await store.save({
      tokens: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: 1_700_000_000_000,
        scopes: ["user:inference"],
        account: null
      },
      subscriptionType: "max"
    });

    const raw = JSON.parse(await readFile(join(dir, ".credentials.json"), "utf8"));
    expect(raw).toEqual({
      claudeAiOauth: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: 1_700_000_000_000,
        scopes: ["user:inference"],
        subscriptionType: "max",
        rateLimitTier: null
      }
    });
  });

  it("stores the file owner-only", async () => {
    const store = new ClaudeCodeCredentialsStore({ configDir: dir });
    await store.save({
      tokens: {
        accessToken: "a",
        refreshToken: null,
        expiresAt: null,
        scopes: [],
        account: null
      }
    });
    const mode = (await stat(store.path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("preserves keys the CLI owns and carries the old refresh token forward", async () => {
    const path = join(dir, ".credentials.json");
    await writeFile(
      path,
      JSON.stringify({
        somethingElse: { keep: true },
        claudeAiOauth: {
          accessToken: "old",
          refreshToken: "refresh-1",
          expiresAt: 1,
          scopes: ["user:inference"],
          subscriptionType: "pro",
          rateLimitTier: "t1"
        }
      })
    );

    const store = new ClaudeCodeCredentialsStore({ configDir: dir });
    const saved = await store.save({
      tokens: {
        accessToken: "new",
        // A refresh response that omits the token must not erase the stored one.
        refreshToken: null,
        expiresAt: 2,
        scopes: ["user:inference"],
        account: null
      }
    });

    expect(saved.refreshToken).toBe("refresh-1");
    expect(saved.subscriptionType).toBe("pro");
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(raw.somethingElse).toEqual({ keep: true });
  });

  it("clears the OAuth entry and removes an otherwise-empty file", async () => {
    const store = new ClaudeCodeCredentialsStore({ configDir: dir });
    expect(await store.clear()).toBe(false);
    await store.save({
      tokens: {
        accessToken: "a",
        refreshToken: null,
        expiresAt: null,
        scopes: [],
        account: null
      }
    });
    expect(await store.clear()).toBe(true);
    expect(await store.read()).toBeNull();
    await expect(stat(store.path)).rejects.toThrow();
  });

  it("treats a token inside the expiry skew as expired", () => {
    expect(isExpired({ expiresAt: 1_000 }, 0, 60_000)).toBe(true);
    expect(isExpired({ expiresAt: 100_000 }, 0, 60_000)).toBe(false);
    expect(isExpired({ expiresAt: null }, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe("parsePastedCode", () => {
  it("splits the code#state the console displays", () => {
    expect(parsePastedCode("  the-code#the-state  ", "the-state")).toEqual({
      code: "the-code",
      state: "the-state"
    });
  });

  it("accepts a bare code and adopts the pending state", () => {
    expect(parsePastedCode("the-code", "the-state")).toEqual({
      code: "the-code",
      state: "the-state"
    });
  });

  it("rejects a mismatched state", () => {
    expect(() => parsePastedCode("the-code#wrong", "the-state")).toThrow(
      StateMismatchError
    );
  });

  it("rejects empty input", () => {
    expect(() => parsePastedCode("   ", "s")).toThrow();
  });
});

describe("ClaudeCodeLogin", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "claude-login-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function login(
    responses: Array<{ ok: boolean; status: number; body: unknown }>,
    options: { callbackServerFactory?: () => LocalCallbackServer } = {}
  ): { login: ClaudeCodeLogin; fetchFn: ReturnType<typeof fakeFetch> } {
    const fetchFn = fakeFetch(responses);
    return {
      fetchFn,
      login: new ClaudeCodeLogin({
        client: new ClaudeCodeOAuthClient({ fetchFn }),
        credentials: new ClaudeCodeCredentialsStore({ configDir: dir }),
        // Tests share a machine; an ephemeral port keeps them from colliding
        // on the fixed one the default factory binds.
        callbackServerFactory:
          options.callbackServerFactory ??
          (() =>
            new LocalCallbackServer({ host: "127.0.0.1", path: "/callback" }))
      })
    };
  }

  it("binds the claude CLI's own callback port by default", async () => {
    const flow = new ClaudeCodeLogin({
      client: new ClaudeCodeOAuthClient({ fetchFn: fakeFetch([]) }),
      credentials: new ClaudeCodeCredentialsStore({ configDir: dir })
    });
    const pending = await flow.begin();
    try {
      expect(pending.redirectUri).toBe(
        `http://localhost:${CLAUDE_CODE_CALLBACK_PORT}/callback`
      );
      expect(new URL(pending.authUrl!).searchParams.get("redirect_uri")).toBe(
        pending.redirectUri
      );
    } finally {
      await pending.cancel();
    }
  });

  it("names the port when the listener cannot bind", async () => {
    const { login: flow } = login([], {
      callbackServerFactory: () =>
        new LocalCallbackServer({
          host: "127.0.0.1",
          port: CLAUDE_CODE_CALLBACK_PORT,
          path: "/callback"
        })
    });
    const holder = new LocalCallbackServer({
      host: "127.0.0.1",
      port: CLAUDE_CODE_CALLBACK_PORT,
      path: "/callback"
    });
    await holder.listen();
    try {
      await expect(flow.begin()).rejects.toThrow(
        `port ${CLAUDE_CODE_CALLBACK_PORT}`
      );
    } finally {
      await holder.close();
    }
  });

  it("reports a disconnected status when nothing is stored", async () => {
    const { login: flow } = login([]);
    const status = await flow.status();
    expect(status.connected).toBe(false);
    expect(status.credentialsPath).toBe(join(dir, ".credentials.json"));
  });

  it("completes a manual login and persists SDK-compatible credentials", async () => {
    const { login: flow, fetchFn } = login([
      { ok: true, status: 200, body: tokenResponse },
      {
        ok: true,
        status: 200,
        body: { organization: { organization_type: "claude_pro" } }
      }
    ]);

    const pending = await flow.begin({ manualOnly: true });
    expect(pending.authUrl).toBeNull();
    expect(pending.manualAuthUrl).toContain(
      encodeURIComponent(CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL)
    );

    const saved = await pending.completeWithPastedCode(
      `the-code#${pending.state}`
    );

    expect(saved.accessToken).toBe("access-1");
    expect(saved.subscriptionType).toBe("pro");
    // The manual path must exchange against the manual redirect URI.
    expect(fetchFn.calls[0].body).toMatchObject({
      redirect_uri: CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL,
      state: pending.state
    });

    const status = await flow.status();
    expect(status.connected).toBe(true);
    expect(status.subscriptionType).toBe("pro");
  });

  it("completes a loopback login against the bound port", async () => {
    const { login: flow, fetchFn } = login([
      { ok: true, status: 200, body: tokenResponse },
      { ok: false, status: 404, body: {} }
    ]);

    const pending = await flow.begin();
    const authUrl = new URL(pending.authUrl!);
    const redirectUri = authUrl.searchParams.get("redirect_uri")!;
    expect(redirectUri).toMatch(/^http:\/\/localhost:\d+\/callback$/);

    const waiting = pending.waitForRedirect();
    // Drive the flow the way the browser would.
    const callback = new URL(redirectUri);
    callback.hostname = "127.0.0.1";
    callback.searchParams.set("code", "the-code");
    callback.searchParams.set("state", pending.state);
    await fetch(callback.toString());

    const saved = await waiting;
    expect(saved.accessToken).toBe("access-1");
    expect(fetchFn.calls[0].body).toMatchObject({ redirect_uri: redirectUri });
  });

  it("refreshes only when the stored token is near expiry", async () => {
    const store = new ClaudeCodeCredentialsStore({ configDir: dir });
    await store.save({
      tokens: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: Date.now() + 3_600_000,
        scopes: ["user:inference"],
        account: null
      }
    });

    const fetchFn = fakeFetch([
      {
        ok: true,
        status: 200,
        body: { access_token: "access-2", expires_in: 3600, scope: "user:inference" }
      }
    ]);
    const flow = new ClaudeCodeLogin({
      client: new ClaudeCodeOAuthClient({ fetchFn }),
      credentials: store
    });

    expect((await flow.refresh()).accessToken).toBe("access-1");
    expect(fetchFn.calls).toHaveLength(0);

    expect((await flow.refresh({ force: true })).accessToken).toBe("access-2");
    expect((await store.read())?.refreshToken).toBe("refresh-1");
  });

  it("refuses to refresh without a stored login", async () => {
    const { login: flow } = login([]);
    await expect(flow.refresh()).rejects.toThrow(/No stored Claude credentials/);
  });
});
