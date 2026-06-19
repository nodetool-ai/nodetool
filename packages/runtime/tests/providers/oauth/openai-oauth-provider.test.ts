import { describe, it, expect, vi } from "vitest";
import { OpenAIOAuthProvider } from "../../../src/providers/oauth/openai-oauth-provider.js";
import { OAuthClient, type FetchLike } from "../../../src/providers/oauth/oauth-client.js";
import { InMemoryTokenStore } from "../../../src/providers/oauth/token-store.js";
import { LocalCallbackServer } from "../../../src/providers/oauth/local-callback-server.js";
import type { BrowserLauncher } from "../../../src/providers/oauth/browser-launcher.js";
import {
  InvalidRefreshTokenError,
  NotAuthenticatedError,
  SessionExpiredError
} from "../../../src/providers/oauth/errors.js";
import type { OAuthClientConfig, Clock } from "../../../src/providers/oauth/types.js";

const config: OAuthClientConfig = {
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  revocationEndpoint: "https://auth.example.com/revoke",
  clientId: "client-123",
  scopes: ["openid", "offline_access"]
};

function jsonResponse(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => "" };
}

/** Mutable clock for driving expiry. */
function mutableClock(start: number): Clock & { set(v: number): void } {
  let t = start;
  return { now: () => t, set: (v) => (t = v) };
}

/**
 * Fake callback server that records the state it was asked to expect and
 * returns a canned code, so the provider's login orchestration can be tested
 * without real sockets.
 */
function fakeCallbackServerFactory(opts: { code?: string; capture?: (state: string) => void } = {}) {
  const create = () =>
    ({
      listen: vi.fn(async () => ({ port: 9999, redirectUri: "http://127.0.0.1:9999/callback" })),
      redirectUri: () => "http://127.0.0.1:9999/callback",
      waitForCode: vi.fn(async ({ expectedState }: { expectedState: string }) => {
        opts.capture?.(expectedState);
        return { code: opts.code ?? "auth-code", state: expectedState };
      }),
      close: vi.fn(async () => undefined)
    }) as unknown as LocalCallbackServer;
  return create;
}

function fakeBrowser(): BrowserLauncher & { open: ReturnType<typeof vi.fn> } {
  return { open: vi.fn(async () => undefined) };
}

interface Harness {
  provider: OpenAIOAuthProvider;
  tokenStore: InMemoryTokenStore;
  fetchFn: ReturnType<typeof vi.fn>;
  browser: ReturnType<typeof fakeBrowser>;
  clock: ReturnType<typeof mutableClock>;
  openAIClientFactory: ReturnType<typeof vi.fn>;
  capturedState: { value: string | null };
}

function makeHarness(fetchImpl: FetchLike): Harness {
  const fetchFn = vi.fn(fetchImpl) as unknown as ReturnType<typeof vi.fn>;
  const clock = mutableClock(1_000_000);
  const tokenStore = new InMemoryTokenStore();
  const browser = fakeBrowser();
  const openAIClientFactory = vi.fn((token: string) => ({ __token: token }) as unknown);
  const capturedState = { value: null as string | null };

  const provider = new OpenAIOAuthProvider({
    oauthClient: new OAuthClient({ config, fetchFn: fetchFn as unknown as FetchLike, clock }),
    tokenStore,
    browserLauncher: browser,
    callbackServerFactory: fakeCallbackServerFactory({
      capture: (s) => (capturedState.value = s)
    }),
    openAIClientFactory: openAIClientFactory as unknown as (t: string) => never,
    clock
  });

  return { provider, tokenStore, fetchFn, browser, clock, openAIClientFactory, capturedState };
}

describe("OpenAIOAuthProvider.login", () => {
  it("runs the PKCE flow, opens the browser, and persists tokens", async () => {
    const h = makeHarness(async () =>
      jsonResponse(200, {
        access_token: "access-1",
        refresh_token: "refresh-1",
        token_type: "Bearer",
        expires_in: 3600
      })
    );

    const result = await h.provider.login();

    expect(result.expiresAt).toBe(1_000_000 + 3600 * 1000);
    expect(h.browser.open).toHaveBeenCalledOnce();

    // The browser URL must carry PKCE + the same state the callback validated.
    const url = new URL(h.browser.open.mock.calls[0][0] as string);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(h.capturedState.value);

    expect((await h.tokenStore.load())?.accessToken).toBe("access-1");
    expect(await h.provider.isAuthenticated()).toBe(true);
    expect(await h.provider.getAccessToken()).toBe("access-1");
  });

  it("builds an OpenAI client bound to the current access token", async () => {
    const h = makeHarness(async () =>
      jsonResponse(200, { access_token: "access-1", refresh_token: "r", token_type: "Bearer" })
    );
    await h.provider.login();
    const client = h.provider.getClient() as unknown as { __token: string };
    expect(client.__token).toBe("access-1");
    expect(h.openAIClientFactory).toHaveBeenCalledWith("access-1");
  });
});

describe("OpenAIOAuthProvider token lifecycle", () => {
  it("auto-refreshes an expired access token before serving requests", async () => {
    let phase = 0;
    const h = makeHarness(async () => {
      phase += 1;
      return jsonResponse(200, {
        access_token: phase === 1 ? "access-1" : "access-2",
        refresh_token: phase === 1 ? "refresh-1" : "refresh-2",
        token_type: "Bearer",
        expires_in: 3600
      });
    });

    await h.provider.login();
    // Advance past expiry (1h + skew).
    h.clock.set(1_000_000 + 3600 * 1000 + 120_000);

    const token = await h.provider.getAccessToken();
    expect(token).toBe("access-2");
    expect((await h.tokenStore.load())?.refreshToken).toBe("refresh-2");
  });

  it("keeps the old refresh token when the server omits a rotated one", async () => {
    let phase = 0;
    const h = makeHarness(async () => {
      phase += 1;
      return jsonResponse(200, {
        access_token: phase === 1 ? "access-1" : "access-2",
        refresh_token: phase === 1 ? "refresh-1" : undefined,
        token_type: "Bearer",
        expires_in: 3600
      });
    });
    await h.provider.login();
    h.clock.set(1_000_000 + 3600 * 1000 + 120_000);
    await h.provider.getAccessToken();
    expect((await h.tokenStore.load())?.refreshToken).toBe("refresh-1");
  });

  it("clears the session and throws when the refresh token is invalid", async () => {
    let phase = 0;
    const h = makeHarness(async () => {
      phase += 1;
      if (phase === 1) {
        return jsonResponse(200, {
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "Bearer",
          expires_in: 3600
        });
      }
      return jsonResponse(400, { error: "invalid_grant" });
    });
    await h.provider.login();
    h.clock.set(1_000_000 + 3600 * 1000 + 120_000);

    await expect(h.provider.getAccessToken()).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    expect(await h.tokenStore.load()).toBeNull();
    expect(await h.provider.isAuthenticated()).toBe(false);
  });

  it("coalesces concurrent refreshes into a single token request", async () => {
    let phase = 0;
    const h = makeHarness(async () => {
      phase += 1;
      return jsonResponse(200, {
        access_token: phase === 1 ? "access-1" : "access-2",
        refresh_token: "refresh-x",
        token_type: "Bearer",
        expires_in: 3600
      });
    });
    await h.provider.login();
    h.fetchFn.mockClear();
    h.clock.set(1_000_000 + 3600 * 1000 + 120_000);

    const [a, b] = await Promise.all([h.provider.getAccessToken(), h.provider.getAccessToken()]);
    expect(a).toBe("access-2");
    expect(b).toBe("access-2");
    expect(h.fetchFn).toHaveBeenCalledOnce();
  });
});

describe("OpenAIOAuthProvider unauthenticated guards", () => {
  it("throws NotAuthenticatedError from getClient before login", () => {
    const h = makeHarness(async () => jsonResponse(200, {}));
    expect(() => h.provider.getClient()).toThrow(NotAuthenticatedError);
  });

  it("throws NotAuthenticatedError from getAccessToken with no stored session", async () => {
    const h = makeHarness(async () => jsonResponse(200, {}));
    await expect(h.provider.getAccessToken()).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it("throws SessionExpiredError when an expired session has no refresh token", async () => {
    const h = makeHarness(async () =>
      jsonResponse(200, { access_token: "access-1", token_type: "Bearer", expires_in: 1 })
    );
    await h.provider.login();
    h.clock.set(1_000_000 + 120_000);
    await expect(h.provider.getAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("does not expose the OAuth bearer through container env", async () => {
    const h = makeHarness(async () =>
      jsonResponse(200, { access_token: "access-1", refresh_token: "r", token_type: "Bearer" })
    );
    await h.provider.login();
    expect(h.provider.getContainerEnv()).toEqual({});
  });
});

describe("OpenAIOAuthProvider.logout", () => {
  it("revokes the refresh token and clears storage", async () => {
    const h = makeHarness(async () =>
      jsonResponse(200, { access_token: "access-1", refresh_token: "refresh-1", token_type: "Bearer" })
    );
    await h.provider.login();
    h.fetchFn.mockClear();

    await h.provider.logout();

    expect(h.fetchFn).toHaveBeenCalledWith(
      "https://auth.example.com/revoke",
      expect.objectContaining({ method: "POST" })
    );
    expect(await h.tokenStore.load()).toBeNull();
    expect(await h.provider.isAuthenticated()).toBe(false);
  });
});
