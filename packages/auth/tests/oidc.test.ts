import { describe, it, expect, beforeAll } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey
} from "jose";
import {
  OidcClient,
  OidcSignInError,
  createOidcLoginState,
  oidcUserId,
  openOidcLoginState,
  pkceChallenge,
  readOidcConfig,
  sealOidcLoginState,
  type OidcConfig,
  type OidcLoginState
} from "../src/index.js";

const ISSUER = "https://idp.example.com/realms/acme";
const CLIENT_ID = "nodetool";

const BASE_ENV = {
  OIDC_ISSUER: ISSUER,
  OIDC_CLIENT_ID: CLIENT_ID,
  OIDC_CLIENT_SECRET: "client-secret",
  NODETOOL_PUBLIC_URL: "https://nodetool.example.com/"
};

describe("readOidcConfig", () => {
  it("is null when SSO is not configured", () => {
    expect(readOidcConfig({})).toBeNull();
  });

  it("derives the redirect and landing URLs from NODETOOL_PUBLIC_URL", () => {
    const config = readOidcConfig(BASE_ENV)!;
    expect(config.redirectUri).toBe(
      "https://nodetool.example.com/api/auth/oidc/callback"
    );
    expect(config.postLoginUrl).toBe("https://nodetool.example.com/");
    expect(config.scopes).toEqual(["openid", "email", "profile"]);
    expect(config.providerName).toBe("SSO");
    expect(config.sessionTtlSeconds).toBe(12 * 60 * 60);
    expect(config.secureCookie).toBe(true);
  });

  it("refuses a partial configuration", () => {
    expect(() => readOidcConfig({ OIDC_ISSUER: ISSUER })).toThrow(/OIDC_CLIENT_ID/);
    expect(() => readOidcConfig({ OIDC_CLIENT_ID: CLIENT_ID })).toThrow(/OIDC_ISSUER/);
  });

  it("needs a public URL or an explicit redirect URL", () => {
    expect(() =>
      readOidcConfig({ OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: CLIENT_ID })
    ).toThrow(/NODETOOL_PUBLIC_URL/);
    const config = readOidcConfig({
      OIDC_ISSUER: ISSUER,
      OIDC_CLIENT_ID: CLIENT_ID,
      OIDC_REDIRECT_URL: "https://sso.example.com/api/auth/oidc/callback"
    })!;
    expect(config.postLoginUrl).toBe("https://sso.example.com/");
  });

  it("refuses plain http except on localhost", () => {
    expect(() =>
      readOidcConfig({ ...BASE_ENV, OIDC_ISSUER: "http://idp.example.com" })
    ).toThrow(/https/);
    const local = readOidcConfig({
      ...BASE_ENV,
      OIDC_ISSUER: "http://localhost:8080/realms/dev",
      NODETOOL_PUBLIC_URL: "http://localhost:7777"
    })!;
    expect(local.secureCookie).toBe(false);
  });

  it("parses scopes, allowlists and the session lifetime", () => {
    const config = readOidcConfig({
      ...BASE_ENV,
      OIDC_SCOPES: "email profile groups",
      OIDC_ALLOWED_DOMAINS: "Example.com, @acme.org",
      OIDC_ALLOWED_GROUPS: "nodetool-users,admins",
      OIDC_GROUPS_CLAIM: "realm_access.roles",
      OIDC_ADMIN_GROUPS: "nodetool-admins ops",
      OIDC_SESSION_TTL_SECONDS: "3600",
      OIDC_PROVIDER_NAME: "Acme"
    })!;
    expect(config.scopes).toEqual(["openid", "email", "profile", "groups"]);
    expect(config.allowedDomains).toEqual(["example.com", "acme.org"]);
    expect(config.allowedGroups).toEqual(["nodetool-users", "admins"]);
    expect(config.groupsClaim).toBe("realm_access.roles");
    expect(config.adminGroups).toEqual(["nodetool-admins", "ops"]);
    expect(config.sessionTtlSeconds).toBe(3600);
    expect(config.providerName).toBe("Acme");
  });

  it("refuses an out-of-range session lifetime", () => {
    expect(() =>
      readOidcConfig({ ...BASE_ENV, OIDC_SESSION_TTL_SECONDS: "10" })
    ).toThrow(/OIDC_SESSION_TTL_SECONDS/);
    expect(() =>
      readOidcConfig({ ...BASE_ENV, OIDC_SESSION_TTL_SECONDS: "abc" })
    ).toThrow(/OIDC_SESSION_TTL_SECONDS/);
  });
});

describe("login state cookie", () => {
  const key = Buffer.alloc(32, 1);
  const now = (): number => 1_800_000_000_000;

  it("round-trips", () => {
    const state = createOidcLoginState(now);
    expect(openOidcLoginState(key, sealOidcLoginState(key, state), now)).toEqual(state);
  });

  it("is refused when tampered with, signed elsewhere, expired or missing", () => {
    const state = createOidcLoginState(now);
    const sealed = sealOidcLoginState(key, state);
    const forged = sealOidcLoginState(Buffer.alloc(32, 2), state);
    expect(openOidcLoginState(key, forged, now)).toBeNull();
    expect(openOidcLoginState(key, `x${sealed}`, now)).toBeNull();
    expect(openOidcLoginState(key, undefined, now)).toBeNull();
    expect(openOidcLoginState(key, "nodot", now)).toBeNull();
    const later = (): number => now() + 11 * 60 * 1000;
    expect(openOidcLoginState(key, sealed, later)).toBeNull();
  });
});

describe("oidcUserId", () => {
  it("is 32 hex characters, stable, and scoped to the issuer", () => {
    const id = oidcUserId(ISSUER, "auth0|12345");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(oidcUserId(`${ISSUER}/`, "auth0|12345")).toBe(id);
    expect(oidcUserId("https://other.example.com", "auth0|12345")).not.toBe(id);
    expect(oidcUserId(ISSUER, "auth0|12346")).not.toBe(id);
  });
});

// ---------------------------------------------------------------------------
// OidcClient against a fake identity provider
// ---------------------------------------------------------------------------

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

interface FakeProvider {
  fetch: typeof fetch;
  requests: { url: string; init?: RequestInit }[];
  idToken: string | null;
  tokenStatus: number;
  discovery: Record<string, unknown>;
}

function fakeProvider(): FakeProvider {
  const provider: FakeProvider = {
    requests: [],
    idToken: null,
    tokenStatus: 200,
    discovery: {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
      token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
      jwks_uri: `${ISSUER}/protocol/openid-connect/certs`
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      provider.requests.push({ url, init });
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return Response.json(provider.discovery);
      }
      if (url === provider.discovery["token_endpoint"]) {
        if (provider.tokenStatus !== 200) {
          return Response.json({ error: "invalid_grant" }, { status: provider.tokenStatus });
        }
        return Response.json({ access_token: "at", id_token: provider.idToken });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch
  };
  return provider;
}

describe("OidcClient", () => {
  let keys: KeyPair;
  let otherKeys: KeyPair;
  let jwks: JWTVerifyGetKey;

  beforeAll(async () => {
    keys = await generateKeyPair("RS256");
    otherKeys = await generateKeyPair("RS256");
    const jwk = await exportJWK(keys.publicKey);
    jwks = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256", kid: "k1" }] });
  });

  const config = (overrides: Record<string, string> = {}): OidcConfig =>
    readOidcConfig({ ...BASE_ENV, ...overrides })!;

  async function idToken(
    claims: Record<string, unknown>,
    opts: { key?: KeyPair; issuer?: string; audience?: string | string[] } = {}
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? CLIENT_ID)
      .setSubject("user-123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign((opts.key ?? keys).privateKey);
  }

  async function signIn(
    provider: FakeProvider,
    overrides: Record<string, string> = {},
    state: OidcLoginState = createOidcLoginState()
  ) {
    const client = new OidcClient(config(overrides), { fetch: provider.fetch, jwks });
    return client.completeSignIn("the-code", state);
  }

  it("builds an authorization URL with PKCE, state and nonce", async () => {
    const provider = fakeProvider();
    const client = new OidcClient(config(), { fetch: provider.fetch, jwks });
    const state = createOidcLoginState();
    const url = new URL(await client.authorizationUrl(state));
    expect(url.origin + url.pathname).toBe(provider.discovery["authorization_endpoint"]);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://nodetool.example.com/api/auth/oidc/callback"
    );
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(state.state);
    expect(url.searchParams.get("nonce")).toBe(state.nonce);
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(state.codeVerifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("signs a user in and exchanges the code with the verifier and basic auth", async () => {
    const provider = fakeProvider();
    const state = createOidcLoginState();
    provider.idToken = await idToken({
      nonce: state.nonce,
      email: "ada@example.com",
      name: "Ada Lovelace"
    });
    const identity = await signIn(provider, {}, state);
    expect(identity).toEqual({
      userId: oidcUserId(ISSUER, "user-123"),
      subject: "user-123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      groups: []
    });

    const tokenRequest = provider.requests.find((r) => r.url.endsWith("/token"))!;
    const body = new URLSearchParams(String(tokenRequest.init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe(state.codeVerifier);
    expect(body.get("client_secret")).toBeNull();
    const headers = new Headers(tokenRequest.init?.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from(`${CLIENT_ID}:client-secret`).toString("base64")}`
    );
  });

  it("posts the secret in the body when the provider only accepts that", async () => {
    const provider = fakeProvider();
    provider.discovery["token_endpoint_auth_methods_supported"] = ["client_secret_post"];
    const state = createOidcLoginState();
    provider.idToken = await idToken({ nonce: state.nonce });
    await signIn(provider, {}, state);
    const tokenRequest = provider.requests.find((r) => r.url.endsWith("/token"))!;
    const body = new URLSearchParams(String(tokenRequest.init?.body));
    expect(body.get("client_id")).toBe(CLIENT_ID);
    expect(body.get("client_secret")).toBe("client-secret");
  });

  it("refuses an ID token with the wrong nonce", async () => {
    const provider = fakeProvider();
    provider.idToken = await idToken({ nonce: "someone-elses" });
    await expect(signIn(provider)).rejects.toMatchObject({ code: "invalid_id_token" });
  });

  it("refuses an ID token signed by a key the provider did not publish", async () => {
    const provider = fakeProvider();
    const state = createOidcLoginState();
    provider.idToken = await idToken({ nonce: state.nonce }, { key: otherKeys });
    await expect(signIn(provider, {}, state)).rejects.toBeInstanceOf(OidcSignInError);
  });

  it("refuses an ID token for another client or issuer", async () => {
    const provider = fakeProvider();
    const state = createOidcLoginState();
    provider.idToken = await idToken({ nonce: state.nonce }, { audience: "other-app" });
    await expect(signIn(provider, {}, state)).rejects.toMatchObject({ code: "invalid_id_token" });

    provider.idToken = await idToken({ nonce: state.nonce }, { issuer: "https://evil.example.com" });
    await expect(signIn(provider, {}, state)).rejects.toMatchObject({ code: "invalid_id_token" });

    provider.idToken = await idToken(
      { nonce: state.nonce, azp: "other-app" },
      { audience: [CLIENT_ID, "other-app"] }
    );
    await expect(signIn(provider, {}, state)).rejects.toMatchObject({ code: "invalid_id_token" });
  });

  it("reports a refused code exchange", async () => {
    const provider = fakeProvider();
    provider.tokenStatus = 400;
    await expect(signIn(provider)).rejects.toMatchObject({ code: "token_exchange_failed" });
  });

  it("refuses a discovery document for another issuer", async () => {
    const provider = fakeProvider();
    provider.discovery["issuer"] = "https://evil.example.com";
    const client = new OidcClient(config(), { fetch: provider.fetch, jwks });
    await expect(client.authorizationUrl(createOidcLoginState())).rejects.toThrow(
      /does not match OIDC_ISSUER/
    );
  });

  it("retries discovery after a failure instead of caching it", async () => {
    const provider = fakeProvider();
    let fail = true;
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      if (fail) {
        fail = false;
        return new Response("down", { status: 503 });
      }
      return provider.fetch(input, init);
    }) as typeof fetch;
    const client = new OidcClient(config(), { fetch: flaky, jwks });
    await expect(client.discover()).rejects.toThrow(/503/);
    await expect(client.discover()).resolves.toMatchObject({ issuer: ISSUER });
  });

  describe("allowlists", () => {
    it("admits a verified email in an allowed domain", async () => {
      const provider = fakeProvider();
      const state = createOidcLoginState();
      provider.idToken = await idToken({
        nonce: state.nonce,
        email: "ada@Example.com",
        email_verified: true
      });
      await expect(
        signIn(provider, { OIDC_ALLOWED_DOMAINS: "example.com" }, state)
      ).resolves.toMatchObject({ subject: "user-123" });
    });

    it("refuses another domain, an unverified email, or no email", async () => {
      const provider = fakeProvider();
      const state = createOidcLoginState();
      const env = { OIDC_ALLOWED_DOMAINS: "example.com" };
      provider.idToken = await idToken({ nonce: state.nonce, email: "eve@evil.com" });
      await expect(signIn(provider, env, state)).rejects.toMatchObject({ code: "not_allowed" });

      provider.idToken = await idToken({
        nonce: state.nonce,
        email: "eve@example.com",
        email_verified: false
      });
      await expect(signIn(provider, env, state)).rejects.toMatchObject({ code: "not_allowed" });

      provider.idToken = await idToken({ nonce: state.nonce });
      await expect(signIn(provider, env, state)).rejects.toMatchObject({ code: "not_allowed" });
    });

    it("checks groups, including a nested claim", async () => {
      const provider = fakeProvider();
      const state = createOidcLoginState();
      const env = {
        OIDC_ALLOWED_GROUPS: "nodetool-users",
        OIDC_GROUPS_CLAIM: "realm_access.roles"
      };
      provider.idToken = await idToken({
        nonce: state.nonce,
        realm_access: { roles: ["offline_access", "nodetool-users"] }
      });
      await expect(signIn(provider, env, state)).resolves.toMatchObject({
        subject: "user-123",
        groups: ["offline_access", "nodetool-users"]
      });

      provider.idToken = await idToken({
        nonce: state.nonce,
        realm_access: { roles: ["offline_access"] }
      });
      await expect(signIn(provider, env, state)).rejects.toMatchObject({ code: "not_allowed" });
    });
  });
});
