/**
 * Integration test: the full browser-OAuth login + refresh flow exercised over
 * real TCP sockets. A real localhost token server stands in for OpenAI's
 * authorization server, a real `LocalCallbackServer` receives the redirect, and
 * a stub "browser" performs the redirect GET the way a user's browser would.
 * Only the human click is faked — every wire interaction is real.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { OpenAIOAuthProvider } from "../../../src/providers/oauth/openai-oauth-provider.js";
import { OAuthClient } from "../../../src/providers/oauth/oauth-client.js";
import { PKCEHelper } from "../../../src/providers/oauth/pkce-helper.js";
import { LocalCallbackServer } from "../../../src/providers/oauth/local-callback-server.js";
import { InMemoryTokenStore } from "../../../src/providers/oauth/token-store.js";
import type { BrowserLauncher } from "../../../src/providers/oauth/browser-launcher.js";
import type { OAuthClientConfig, Clock } from "../../../src/providers/oauth/types.js";

interface TokenServer {
  server: Server;
  url: string;
  /** PKCE verifiers seen at the token endpoint, for assertions. */
  exchanges: Array<{ code: string; codeVerifier: string }>;
  refreshes: string[];
}

/** A minimal RFC 6749 token endpoint that validates grant types. */
async function startTokenServer(): Promise<TokenServer> {
  const exchanges: Array<{ code: string; codeVerifier: string }> = [];
  const refreshes: string[] = [];
  let issued = 0;

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const grant = params.get("grant_type");
      res.setHeader("content-type", "application/json");

      if (grant === "authorization_code") {
        exchanges.push({
          code: params.get("code") ?? "",
          codeVerifier: params.get("code_verifier") ?? ""
        });
        issued += 1;
        res.end(
          JSON.stringify({
            access_token: `access-${issued}`,
            refresh_token: `refresh-${issued}`,
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid offline_access"
          })
        );
        return;
      }
      if (grant === "refresh_token") {
        refreshes.push(params.get("refresh_token") ?? "");
        issued += 1;
        res.end(
          JSON.stringify({
            access_token: `access-${issued}`,
            refresh_token: `refresh-${issued}`,
            token_type: "Bearer",
            expires_in: 3600
          })
        );
        return;
      }
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "unsupported_grant_type" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}`, exchanges, refreshes };
}

/** A "browser" that fulfils the OAuth redirect by GETting the callback URL. */
function redirectingBrowser(): BrowserLauncher {
  return {
    open: async (authUrl: string) => {
      const url = new URL(authUrl);
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      if (!redirectUri || !state) throw new Error("auth URL missing redirect/state");
      const cb = new URL(redirectUri);
      cb.searchParams.set("code", "real-auth-code");
      cb.searchParams.set("state", state);
      // Fire-and-forget, mirroring a browser navigation racing the callback wait.
      void fetch(cb.toString()).catch(() => undefined);
    }
  };
}

let tokenServer: TokenServer | null = null;
afterEach(async () => {
  if (tokenServer) {
    await new Promise<void>((resolve) => tokenServer!.server.close(() => resolve()));
    tokenServer = null;
  }
});

function mutableClock(start: number): Clock & { set(v: number): void } {
  let t = start;
  return { now: () => t, set: (v) => (t = v) };
}

describe("OpenAI OAuth end-to-end flow", () => {
  it("logs in via browser redirect and persists usable tokens", async () => {
    tokenServer = await startTokenServer();
    const clock = mutableClock(1_000_000);
    const config: OAuthClientConfig = {
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: `${tokenServer.url}/token`,
      clientId: "integration-client",
      scopes: ["openid", "offline_access"]
    };
    const tokenStore = new InMemoryTokenStore();
    const provider = new OpenAIOAuthProvider({
      oauthClient: new OAuthClient({ config, clock }),
      tokenStore,
      browserLauncher: redirectingBrowser(),
      callbackServerFactory: () => new LocalCallbackServer({ path: "/callback" }),
      pkce: new PKCEHelper(),
      openAIClientFactory: (token) => ({ token }) as never,
      clock
    });

    await provider.login({ timeoutMs: 5000 });

    expect(await provider.getAccessToken()).toBe("access-1");
    expect(tokenServer.exchanges).toHaveLength(1);
    // The token endpoint received a non-empty PKCE verifier.
    expect(tokenServer.exchanges[0].codeVerifier.length).toBeGreaterThan(20);
    expect(tokenServer.exchanges[0].code).toBe("real-auth-code");
  });

  it("refreshes the access token against the real token endpoint after expiry", async () => {
    tokenServer = await startTokenServer();
    const clock = mutableClock(1_000_000);
    const config: OAuthClientConfig = {
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: `${tokenServer.url}/token`,
      clientId: "integration-client",
      scopes: ["openid", "offline_access"]
    };
    const provider = new OpenAIOAuthProvider({
      oauthClient: new OAuthClient({ config, clock }),
      tokenStore: new InMemoryTokenStore(),
      browserLauncher: redirectingBrowser(),
      callbackServerFactory: () => new LocalCallbackServer({ path: "/callback" }),
      pkce: new PKCEHelper(),
      openAIClientFactory: (token) => ({ token }) as never,
      clock
    });

    await provider.login({ timeoutMs: 5000 });
    expect(await provider.getAccessToken()).toBe("access-1");

    clock.set(1_000_000 + 3600 * 1000 + 120_000);
    expect(await provider.getAccessToken()).toBe("access-2");
    expect(tokenServer.refreshes).toEqual(["refresh-1"]);
  });
});
