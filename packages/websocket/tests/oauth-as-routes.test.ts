/**
 * fastify.inject route tests for the MCP OAuth AS + well-known plugin
 * (`../src/routes/oauth-as.ts`).
 *
 * Runs an in-process Fastify instance with only `oauthAsRoutes` registered,
 * against a temp sqlite DB (`initTestDb`, same pattern as
 * `packages/models/tests/mcp-oauth.test.ts`). `NODETOOL_PUBLIC_URL` is set
 * per test so `configuredMcpUrl()` resolves.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- oauth-as
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { initTestDb, ModelObserver } from "@nodetool-ai/models";
import { oauthAsRoutes } from "../src/routes/oauth-as.js";
import { pendingStore } from "../src/oauth/pending-store.js";
import { verifyS256 } from "../src/oauth/pkce.js";

const PUBLIC_URL = "https://nodetool.example";

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { verifier, challenge };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(oauthAsRoutes);
  await app.ready();
  return app;
}

async function registerClient(
  app: FastifyInstance,
  overrides: Partial<{ client_name: string; redirect_uris: string[] }> = {}
): Promise<{ client_id: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/oauth/register",
    payload: JSON.stringify({
      client_name: "Test Client",
      redirect_uris: ["https://client.example/cb"],
      token_endpoint_auth_method: "none",
      ...overrides
    }),
    headers: { "content-type": "application/json" }
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

let prevPublicUrl: string | undefined;
let prevDisableFlag: string | undefined;

beforeEach(() => {
  initTestDb();
  prevPublicUrl = process.env["NODETOOL_PUBLIC_URL"];
  prevDisableFlag = process.env["NODETOOL_DISABLE_MCP_OAUTH"];
  process.env["NODETOOL_PUBLIC_URL"] = PUBLIC_URL;
  delete process.env["NODETOOL_DISABLE_MCP_OAUTH"];
});

afterEach(() => {
  ModelObserver.clear();
  if (prevPublicUrl === undefined) {
    delete process.env["NODETOOL_PUBLIC_URL"];
  } else {
    process.env["NODETOOL_PUBLIC_URL"] = prevPublicUrl;
  }
  if (prevDisableFlag === undefined) {
    delete process.env["NODETOOL_DISABLE_MCP_OAUTH"];
  } else {
    process.env["NODETOOL_DISABLE_MCP_OAUTH"] = prevDisableFlag;
  }
});

describe("well-known discovery routes", () => {
  it("serves protected resource metadata with a 1h cache header", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/mcp"
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    const body = res.json();
    expect(body.resource).toBe(`${PUBLIC_URL}/mcp`);
    expect(body.authorization_servers).toEqual([PUBLIC_URL]);
  });

  it("serves the same document at the root well-known form", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().resource).toBe(`${PUBLIC_URL}/mcp`);
  });

  it("serves authorization server metadata", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.issuer).toBe(PUBLIC_URL);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.authorization_endpoint).toBe(`${PUBLIC_URL}/oauth/authorize`);
  });

  it("404s every well-known route when no public URL is configured", async () => {
    delete process.env["NODETOOL_PUBLIC_URL"];
    const app = await buildApp();
    for (const url of [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server"
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("NODETOOL_DISABLE_MCP_OAUTH", () => {
  it("404s all seven routes when set to 1", async () => {
    process.env["NODETOOL_DISABLE_MCP_OAUTH"] = "1";
    const app = await buildApp();

    const getRoutes = [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server",
      "/oauth/authorize?client_id=ntc_x&redirect_uri=https://client.example/cb&response_type=code&code_challenge=abc&code_challenge_method=S256"
    ];
    for (const url of getRoutes) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(404);
    }

    const postRoutes = ["/oauth/token", "/oauth/register", "/oauth/revoke"];
    for (const url of postRoutes) {
      const res = await app.inject({
        method: "POST",
        url,
        payload: "grant_type=authorization_code",
        headers: { "content-type": "application/x-www-form-urlencoded" }
      });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("AS gate follows the /mcp mount gate", () => {
  it("404s the AS when production has no NODETOOL_ENABLE_MCP", async () => {
    const prevEnv = process.env["NODETOOL_ENV"];
    const prevEnable = process.env["NODETOOL_ENABLE_MCP"];
    process.env["NODETOOL_ENV"] = "production";
    delete process.env["NODETOOL_ENABLE_MCP"];
    try {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/.well-known/oauth-authorization-server"
      });
      // The resource isn't mounted, so the AS that issues for it must not
      // exist either — no anonymous /oauth/register rows, no CIMD fetches.
      expect(res.statusCode).toBe(404);
      const reg = await app.inject({
        method: "POST",
        url: "/oauth/register",
        payload: JSON.stringify({
          client_name: "x",
          redirect_uris: ["https://client.example/cb"],
          token_endpoint_auth_method: "none"
        }),
        headers: { "content-type": "application/json" }
      });
      expect(reg.statusCode).toBe(404);
    } finally {
      if (prevEnv === undefined) delete process.env["NODETOOL_ENV"];
      else process.env["NODETOOL_ENV"] = prevEnv;
      if (prevEnable === undefined) delete process.env["NODETOOL_ENABLE_MCP"];
      else process.env["NODETOOL_ENABLE_MCP"] = prevEnable;
    }
  });

  it("404s the AS when the public URL is http on a non-loopback host", async () => {
    const prev = process.env["NODETOOL_PUBLIC_URL"];
    process.env["NODETOOL_PUBLIC_URL"] = "http://mcp.example.com";
    try {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/.well-known/oauth-authorization-server"
      });
      expect(res.statusCode).toBe(404);
    } finally {
      if (prev === undefined) delete process.env["NODETOOL_PUBLIC_URL"];
      else process.env["NODETOOL_PUBLIC_URL"] = prev;
    }
  });
});

describe("path-bearing public URL", () => {
  it("serves the RFC 8414/9728 path-inserted well-known forms", async () => {
    const prev = process.env["NODETOOL_PUBLIC_URL"];
    process.env["NODETOOL_PUBLIC_URL"] = "https://host.example/base";
    try {
      const app = await buildApp();
      const as = await app.inject({
        method: "GET",
        url: "/.well-known/oauth-authorization-server/base"
      });
      expect(as.statusCode).toBe(200);
      expect(as.json().issuer).toBe("https://host.example/base");
      const pr = await app.inject({
        method: "GET",
        url: "/.well-known/oauth-protected-resource/base/mcp"
      });
      expect(pr.statusCode).toBe(200);
      expect(pr.json().resource).toBe("https://host.example/base/mcp");
      // A suffix that isn't this issuer's path is nobody's document.
      const wrong = await app.inject({
        method: "GET",
        url: "/.well-known/oauth-authorization-server/other"
      });
      expect(wrong.statusCode).toBe(404);
    } finally {
      if (prev === undefined) delete process.env["NODETOOL_PUBLIC_URL"];
      else process.env["NODETOOL_PUBLIC_URL"] = prev;
    }
  });
});

describe("POST /oauth/register", () => {
  it("registers a public client and returns an ntc_ id", async () => {
    const app = await buildApp();
    const body = await registerClient(app);
    expect(body.client_id.startsWith("ntc_")).toBe(true);
    expect(body.token_endpoint_auth_method).toBe("none");
    expect(body.redirect_uris).toEqual(["https://client.example/cb"]);
  });

  it("rejects a confidential-client registration", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Confidential",
        redirect_uris: ["https://client.example/cb"],
        token_endpoint_auth_method: "client_secret_basic"
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_client_metadata");
  });

  it("rejects an over-long client_name", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "x".repeat(257),
        redirect_uris: ["https://client.example/cb"]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_client_metadata");
  });

  it("rejects more redirect_uris than a client can plausibly need", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Greedy",
        redirect_uris: Array.from(
          { length: 11 },
          (_unused, i) => `https://client.example/cb${i}`
        )
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_client_metadata");
  });

  it("rejects an over-long redirect_uri", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Long redirect",
        redirect_uris: [`https://client.example/${"p".repeat(2048)}`]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_redirect_uri");
  });

  it("refuses a body past the route's own limit, well under the server's", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Padded",
        redirect_uris: ["https://client.example/cb"],
        padding: "x".repeat(16 * 1024)
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(413);
  });

  it("rejects an unregisterable redirect_uri", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Bad redirect",
        redirect_uris: ["myapp://cb"]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_redirect_uri");
  });
});

/** Drives register → authorize → GET the request out of `pendingStore`
 * (standing in for the consent page), then mirrors what the committed
 * `approveOauthRequest` does: create the grant and mint a code via
 * `pendingStore` carrying its id. */
async function authorizeAndApprove(
  app: FastifyInstance,
  overrides: {
    redirectUri?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    responseType?: string;
    resource?: string;
    scope?: string;
    userId?: string;
  } = {}
): Promise<{
  clientId: string;
  redirectUri: string;
  verifier: string;
  code: string;
  requestId: string;
  grantId: string;
}> {
  const { client_id: clientId } = await registerClient(app);
  const { verifier, challenge } = pkcePair();
  const redirectUri = overrides.redirectUri ?? "https://client.example/cb";

  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: overrides.responseType ?? "code",
    code_challenge: overrides.codeChallenge ?? challenge,
    code_challenge_method: overrides.codeChallengeMethod ?? "S256",
    state: "xyz"
  });
  if (overrides.resource !== undefined) query.set("resource", overrides.resource);
  if (overrides.scope !== undefined) query.set("scope", overrides.scope);

  const authRes = await app.inject({
    method: "GET",
    url: `/oauth/authorize?${query.toString()}`
  });
  expect(authRes.statusCode).toBe(302);
  const location = authRes.headers.location as string;
  const requestId = new URL(location, "http://localhost").searchParams.get("request_id")!;
  expect(requestId).toBeTruthy();

  const request = pendingStore.takeRequestForApproval(requestId);
  expect(request).not.toBeNull();
  // Mirror what approveOauthRequest does: the consent step creates the
  // grant and threads its id through the code.
  const userId = overrides.userId ?? "user-a";
  const { McpOauthGrant } = await import("@nodetool-ai/models");
  const grant = await McpOauthGrant.create({
    user_id: userId,
    client_id: request!.clientId,
    client_name: request!.clientName,
    scope: request!.scope,
    resource: request!.resource
  });
  const code = pendingStore.putCode({
    request: request!,
    userId,
    grantId: grant.id
  });

  return { clientId, redirectUri, verifier, code, requestId, grantId: grant.id };
}

describe("GET /oauth/authorize", () => {
  it("400s in-page on an unknown client_id — never redirects", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/oauth/authorize?client_id=ntc_doesnotexist&redirect_uri=https://client.example/cb&response_type=code&code_challenge=abc&code_challenge_method=S256"
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("400s in-page on a redirect_uri not registered for the client — never redirects", async () => {
    const app = await buildApp();
    const { client_id: clientId } = await registerClient(app);
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?client_id=${clientId}&redirect_uri=https://evil.example/cb&response_type=code&code_challenge=abc&code_challenge_method=S256`
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers.location).toBeUndefined();
  });

  it("redirects with an error when code_challenge is missing (PKCE required)", async () => {
    const app = await buildApp();
    const { client_id: clientId } = await registerClient(app);
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?client_id=${clientId}&redirect_uri=https://client.example/cb&response_type=code`
    });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://client.example/cb");
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("iss")).toBe(PUBLIC_URL);
  });

  it("redirects with an error for code_challenge_method=plain", async () => {
    const app = await buildApp();
    const { client_id: clientId } = await registerClient(app);
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?client_id=${clientId}&redirect_uri=https://client.example/cb&response_type=code&code_challenge=abc&code_challenge_method=plain`
    });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });

  it("redirects with invalid_target on a mismatched resource", async () => {
    const app = await buildApp();
    const { client_id: clientId } = await registerClient(app);
    const { challenge } = pkcePair();
    const res = await app.inject({
      method: "GET",
      url: `/oauth/authorize?client_id=${clientId}&redirect_uri=https://client.example/cb&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&resource=https://evil.example/mcp`
    });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get("error")).toBe("invalid_target");
  });

  it("302s to /oauth/consent on a valid request", async () => {
    const app = await buildApp();
    const { requestId } = await (async () => {
      const { client_id: clientId } = await registerClient(app);
      const { challenge } = pkcePair();
      const res = await app.inject({
        method: "GET",
        url: `/oauth/authorize?client_id=${clientId}&redirect_uri=https://client.example/cb&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`
      });
      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string, "http://localhost");
      expect(location.pathname).toBe("/oauth/consent");
      return { requestId: location.searchParams.get("request_id")! };
    })();
    expect(pendingStore.takeRequestForApproval(requestId)).not.toBeNull();
  });
});

describe("POST /oauth/token — authorization_code", () => {
  it("happy path: mints an access+refresh pair with the correct verifier", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token.startsWith("nta_")).toBe(true);
    expect(body.refresh_token.startsWith("ntr_")).toBe(true);
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("mcp");
    expect(body.expires_in).toBe(3600);
  });

  it("rejects a wrong PKCE verifier", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, code } = await authorizeAndApprove(app);

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: "not-the-right-verifier"
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_grant");
  });

  it("a failed exchange does not burn the code — the real client still redeems it", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code, grantId } =
      await authorizeAndApprove(app);

    // Someone holding the code but not the verifier gets one refusal...
    const stolen = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: "not-the-right-verifier"
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(stolen.statusCode).toBe(400);

    // ...and the legitimate exchange still works, instead of reading as a
    // replay and revoking the grant.
    const real = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(real.statusCode).toBe(200);
    expect(real.json().access_token.startsWith("nta_")).toBe(true);

    const { McpOauthGrant } = await import("@nodetool-ai/models");
    const grant = await McpOauthGrant.get(grantId);
    expect(grant!.revoked_at).toBeNull();
  });

  it("rejects an expired code", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);

    // The pending store's codes are TTL'd at 10 minutes (`pending-store.ts`
    // CODE_TTL_MS) and pruned lazily on the next access — advance real time
    // past that and the next consumeCode call (inside the token endpoint)
    // finds it gone.
    // Only `Date` is faked — faking timers wholesale stalls fastify's
    // `inject` (it leans on real `setTimeout`/`setImmediate` internally).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 600_001);

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    vi.useRealTimers();
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_grant");
  });

  it("rejects an unknown code", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier } = await authorizeAndApprove(app);

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: "not-a-real-code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_grant");
  });

  it("resource mismatch is refused with invalid_target", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        resource: "https://evil.example/mcp"
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_target");
  });

  it("unknown client_id at token time is refused", async () => {
    const app = await buildApp();
    const { redirectUri, verifier, code } = await authorizeAndApprove(app);

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "ntc_someoneelse",
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_grant");
  });

  it("code replay revokes every token issued from that code", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);

    const exchangeBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier
    }).toString();
    const headers = { "content-type": "application/x-www-form-urlencoded" };

    const first = await app.inject({ method: "POST", url: "/oauth/token", payload: exchangeBody, headers });
    expect(first.statusCode).toBe(200);
    const { access_token: accessToken } = first.json();

    // First-issue tokens verify before the replay.
    const { McpOauthToken: TokenModel } = await import("@nodetool-ai/models");
    expect(await TokenModel.verifyAccess(accessToken)).not.toBeNull();

    // Replay the same code.
    const replay = await app.inject({ method: "POST", url: "/oauth/token", payload: exchangeBody, headers });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error).toBe("invalid_grant");

    // The token minted on first use must now be dead — prove it the same
    // way `/mcp` would: revoking it a second time via /oauth/revoke reports
    // 200 either way (RFC 7009), so assert through the model directly that
    // the access token no longer verifies.
    const { McpOauthToken } = await import("@nodetool-ai/models");
    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();
  });
});

describe("POST /oauth/token — refresh_token", () => {
  async function issueTokenPair(app: FastifyInstance): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);
    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return { accessToken: body.access_token, refreshToken: body.refresh_token };
  }

  it("rotates: old refresh token stops working, new pair verifies", async () => {
    const app = await buildApp();
    const { refreshToken } = await issueTokenPair(app);

    const rotated = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(rotated.statusCode).toBe(200);
    const body = rotated.json();
    expect(body.refresh_token).not.toBe(refreshToken);
    expect(body.access_token.startsWith("nta_")).toBe(true);
  });

  it("reuse of a rotated-out refresh token revokes the grant", async () => {
    const app = await buildApp();
    const { accessToken, refreshToken } = await issueTokenPair(app);

    const rotated = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(rotated.statusCode).toBe(200);
    const newAccessToken = rotated.json().access_token;

    // Reuse the pre-rotation refresh token.
    const reuse = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json().error).toBe("invalid_grant");

    const { McpOauthToken } = await import("@nodetool-ai/models");
    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();
    expect(await McpOauthToken.verifyAccess(newAccessToken)).toBeNull();
  });

  it("missing refresh_token is invalid_request", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({ grant_type: "refresh_token" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });
});

describe("refresh_token client binding", () => {
  it("a wrong client_id on a valid refresh token revokes the grant", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    const issued = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers
    });
    expect(issued.statusCode).toBe(200);
    const { refresh_token: refreshToken } = issued.json();

    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: "ntc_someoneelse"
      }).toString(),
      headers
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_grant");

    // A compromise signal revokes the grant: the same refresh token is now
    // dead even under the right identity.
    const retry = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId
      }).toString(),
      headers
    });
    expect(retry.statusCode).toBe(400);
  });
});

describe("unsupported grant_type", () => {
  it("400s with unsupported_grant_type", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("unsupported_grant_type");
  });
});

describe("POST /oauth/revoke", () => {
  it("always answers 200, even for an unknown token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/oauth/revoke",
      payload: new URLSearchParams({ token: "nta_deadbeef_x" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(res.statusCode).toBe(200);
  });

  it("actually revokes a real token", async () => {
    const app = await buildApp();
    const { clientId, redirectUri, verifier, code } = await authorizeAndApprove(app);
    const tokenRes = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    const { access_token: accessToken } = tokenRes.json();

    const revokeRes = await app.inject({
      method: "POST",
      url: "/oauth/revoke",
      payload: new URLSearchParams({ token: accessToken }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(revokeRes.statusCode).toBe(200);

    const { McpOauthToken } = await import("@nodetool-ai/models");
    expect(await McpOauthToken.verifyAccess(accessToken)).toBeNull();
  });
});

// Sanity: verifyS256 imported to keep the pkce helper's contract exercised
// from this file too (redundant with oauth-core tests, but cheap).
describe("pkce sanity", () => {
  it("verifies a matching pair", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyS256(verifier, challenge)).toBe(true);
  });
});
