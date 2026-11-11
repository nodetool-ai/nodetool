/**
 * The SSO browser hops: /api/auth/oidc/login and /api/auth/oidc/callback.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey
} from "jose";
import {
  OidcClient,
  OidcSessionTokenProvider,
  oidcUserId,
  readOidcConfig
} from "@nodetool-ai/auth";
import {
  getUserAccount,
  initTestDb,
  updateUserAccount
} from "@nodetool-ai/models";
import oidcAuthRoutes, {
  OIDC_LOGIN_COOKIE,
  SSO_ERROR_FRAGMENT,
  SSO_TOKEN_FRAGMENT,
  readCookie
} from "../src/routes/oidc-auth.js";

const ISSUER = "https://idp.example.com";
const CLIENT_ID = "nodetool";
const STATE_KEY = Buffer.alloc(32, 3);
const SESSION_KEY = Buffer.alloc(32, 4);

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

describe("SSO routes", () => {
  let keys: KeyPair;
  let jwks: JWTVerifyGetKey;
  let app: FastifyInstance;
  let nextIdToken: (nonce: string) => Promise<string>;
  let providerUp: boolean;

  beforeAll(async () => {
    keys = await generateKeyPair("RS256");
    jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(keys.publicKey)), alg: "RS256", kid: "k" }]
    });
  });

  const sign = (claims: Record<string, unknown>): Promise<string> =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject("sub-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);

  beforeEach(async () => {
    initTestDb();
    providerUp = true;
    let lastNonce = "";
    nextIdToken = (nonce) => sign({ nonce, email: "ada@example.com" });
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!providerUp) return new Response("down", { status: 503 });
      if (url.endsWith("/.well-known/openid-configuration")) {
        return Response.json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/jwks`
        });
      }
      if (url === `${ISSUER}/token`) {
        void init;
        return Response.json({ id_token: await nextIdToken(lastNonce) });
      }
      return new Response("nf", { status: 404 });
    }) as typeof fetch;

    const config = readOidcConfig({
      OIDC_ISSUER: ISSUER,
      OIDC_CLIENT_ID: CLIENT_ID,
      OIDC_CLIENT_SECRET: "secret",
      NODETOOL_PUBLIC_URL: "https://nodetool.example.com"
    })!;
    const client = new OidcClient(config, { fetch: fakeFetch, jwks });
    // Capture the nonce the login route sends, as a real provider would echo it.
    const original = client.authorizationUrl.bind(client);
    client.authorizationUrl = async (state) => {
      lastNonce = state.nonce;
      return original(state);
    };

    app = Fastify({ logger: false });
    await app.register(oidcAuthRoutes, {
      client,
      loginStateKey: () => STATE_KEY,
      sessionKey: () => SESSION_KEY
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function startLogin(): Promise<{ cookie: string; state: string }> {
    const res = await app.inject({ method: "GET", url: "/api/auth/oidc/login" });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Path=/api/auth/oidc");
    const cookie = readCookie(setCookie.split(";")[0], OIDC_LOGIN_COOKIE)!;
    return { cookie, state: location.searchParams.get("state")! };
  }

  const fragmentOf = (location: string): URLSearchParams =>
    new URLSearchParams(new URL(location).hash.slice(1));

  it("redirects to the provider, then back to the app with a session", async () => {
    const { cookie, state } = await startLogin();
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback?code=abc&state=${encodeURIComponent(state)}`,
      headers: { cookie: `${OIDC_LOGIN_COOKIE}=${cookie}` }
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location.startsWith("https://nodetool.example.com/#")).toBe(true);
    const token = fragmentOf(location).get(SSO_TOKEN_FRAGMENT)!;
    const verified = await new OidcSessionTokenProvider(SESSION_KEY).verifyToken(token);
    expect(verified.ok).toBe(true);
    expect(verified.userId).toBe(oidcUserId(ISSUER, "sub-1"));
    // The single-use login cookie is cleared.
    expect(String(res.headers["set-cookie"])).toContain("Max-Age=0");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("refuses a callback whose state does not match the cookie", async () => {
    const { cookie } = await startLogin();
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oidc/callback?code=abc&state=forged",
      headers: { cookie: `${OIDC_LOGIN_COOKIE}=${cookie}` }
    });
    expect(fragmentOf(res.headers.location as string).get(SSO_ERROR_FRAGMENT)).toBe(
      "invalid_state"
    );
  });

  it("refuses a callback with no login cookie", async () => {
    const { state } = await startLogin();
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback?code=abc&state=${encodeURIComponent(state)}`
    });
    expect(fragmentOf(res.headers.location as string).get(SSO_ERROR_FRAGMENT)).toBe(
      "invalid_state"
    );
  });

  it("passes on a denial from the provider", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/oidc/callback?error=access_denied"
    });
    expect(fragmentOf(res.headers.location as string).get(SSO_ERROR_FRAGMENT)).toBe(
      "access_denied"
    );
  });

  it("reports an ID token that fails verification", async () => {
    nextIdToken = () => sign({ nonce: "wrong" });
    const { cookie, state } = await startLogin();
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback?code=abc&state=${encodeURIComponent(state)}`,
      headers: { cookie: `${OIDC_LOGIN_COOKIE}=${cookie}` }
    });
    const fragment = fragmentOf(res.headers.location as string);
    expect(fragment.get(SSO_TOKEN_FRAGMENT)).toBeNull();
    expect(fragment.get(SSO_ERROR_FRAGMENT)).toBe("invalid_id_token");
  });

  async function finishLogin(): Promise<URLSearchParams> {
    const { cookie, state } = await startLogin();
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/oidc/callback?code=abc&state=${encodeURIComponent(state)}`,
      headers: { cookie: `${OIDC_LOGIN_COOKIE}=${cookie}` }
    });
    expect(res.statusCode).toBe(302);
    return fragmentOf(res.headers.location as string);
  }

  it("records the signed-in user in the directory, with groups", async () => {
    nextIdToken = (nonce) =>
      sign({ nonce, email: "ada@example.com", name: "Ada", groups: ["staff"] });
    await finishLogin();
    const account = await getUserAccount(oidcUserId(ISSUER, "sub-1"));
    expect(account).toMatchObject({
      email: "ada@example.com",
      displayName: "Ada",
      authSource: "oidc",
      groups: ["staff"],
      role: "member",
      status: "active"
    });
  });

  it("keeps the admin's role and refreshes the profile on the next sign-in", async () => {
    await finishLogin();
    const userId = oidcUserId(ISSUER, "sub-1");
    await updateUserAccount(userId, { role: "admin" });
    nextIdToken = (nonce) => sign({ nonce, email: "ada@new.example.com" });
    await finishLogin();
    expect(await getUserAccount(userId)).toMatchObject({
      email: "ada@new.example.com",
      role: "admin"
    });
  });

  it("refuses a sign-in to a disabled account", async () => {
    await finishLogin();
    await updateUserAccount(oidcUserId(ISSUER, "sub-1"), { status: "disabled" });
    const fragment = await finishLogin();
    expect(fragment.get(SSO_TOKEN_FRAGMENT)).toBeNull();
    expect(fragment.get(SSO_ERROR_FRAGMENT)).toBe("account_disabled");
  });

  it("reports an unreachable provider at login", async () => {
    providerUp = false;
    const res = await app.inject({ method: "GET", url: "/api/auth/oidc/login" });
    expect(res.statusCode).toBe(302);
    expect(fragmentOf(res.headers.location as string).get(SSO_ERROR_FRAGMENT)).toBe(
      "provider_unavailable"
    );
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(readCookie("a=1; nodetool_oidc_login=xyz.abc; b=2", OIDC_LOGIN_COOKIE)).toBe(
      "xyz.abc"
    );
    expect(readCookie(undefined, OIDC_LOGIN_COOKIE)).toBeUndefined();
    expect(readCookie("other=1", OIDC_LOGIN_COOKIE)).toBeUndefined();
  });
});
