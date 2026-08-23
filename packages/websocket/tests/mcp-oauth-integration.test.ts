/**
 * End-to-end check that the MCP OAuth pieces (T1-T5) are actually wired
 * together the way `server.ts` wires them (T6): the `WWW-Authenticate`
 * challenge on an unauthenticated `/mcp` request, the full
 * register → authorize → approve → token → authenticated-`/mcp` flow, the
 * `nta_` audience restriction to `/mcp` only, `ntk_` continuing to work
 * alongside it, and `NODETOOL_DISABLE_MCP_OAUTH` turning all of it off.
 *
 * `server.ts` is a bootstrapping entry point (opens a database connection,
 * binds a port on import) and cannot be imported into a test — the same
 * constraint `auth-hook.test.ts` documents. This file instead assembles a
 * Fastify app out of the same real modules `server.ts` wires: the
 * `oauthAsRoutes` plugin unchanged, and the auth-hook / `/mcp`-mount logic
 * reproduced from `server.ts` using its actual exported pieces
 * (`denyUnauthorized`, `buildBearerChallenge`, `canonicalResource`,
 * `configuredMcpUrl`, `McpOauthToken.verifyAccess`, `handleMcpHttpRequest`),
 * so a wiring mistake in any of those still fails here.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- mcp-oauth-integration
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import {
  AccessToken,
  McpOauthToken,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";
import { oauthAsRoutes } from "../src/routes/oauth-as.js";
import { isPublicMcpOauthAsRequest } from "../src/lib/public-routes.js";
import { denyUnauthorized } from "../src/lib/ws-upgrade.js";
import {
  authenticateMcpAccessToken,
  mcpBearerChallenge
} from "../src/oauth/gate.js";
import { handleMcpHttpRequest } from "../src/mcp-server.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const PUBLIC_URL = "https://nodetool.example";
const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string | null): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return { verifier, challenge };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest("userId", null);
  app.decorateRequest("authToken", null);
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  await app.register(oauthAsRoutes);

  // The auth hook's OAuth-relevant branches, reproduced from server.ts: the
  // `nta_` audience check (before `ntk_`), `ntk_` unchanged, and a
  // WWW-Authenticate challenge on every /mcp denial.
  app.addHook("onRequest", async (req, reply) => {
    const pathname = req.url.split("?")[0] ?? "/";
    if (isPublicMcpOauthAsRequest(pathname)) return;

    const authHeader = req.headers["authorization"];
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;

    if (token && token.startsWith("nta_")) {
      // The real decision from oauth/gate.ts — the same one server.ts's
      // hook calls, so gate changes fail here instead of drifting.
      const decision = await authenticateMcpAccessToken(token, pathname);
      if (decision.ok) {
        req.userId = decision.userId;
        req.authToken = token;
        return;
      }
      denyUnauthorized(req, reply, { error: "invalid_token" }, decision.challenge);
      return;
    }

    if (token && token.startsWith("ntk_")) {
      const accessToken = await AccessToken.verify(token);
      if (accessToken) {
        req.userId = accessToken.user_id;
        req.authToken = token;
        return;
      }
    }

    const challenge = pathname.startsWith("/mcp")
      ? mcpBearerChallenge()
      : undefined;
    denyUnauthorized(req, reply, { error: "Unauthorized" }, challenge);
  });

  // The /mcp mount, reproduced from server.ts's `app.all("/mcp", …)` — same
  // Request translation, same `handleMcpHttpRequest` call.
  app.all("/mcp", async (req, reply) => {
    const url = `http://localhost${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value != null) {
        headers.set(key, value);
      }
    }
    const requestBody =
      req.method === "GET" || req.method === "DELETE"
        ? undefined
        : Buffer.isBuffer(req.body)
          ? req.body
          : req.body == null
            ? Buffer.alloc(0)
            : Buffer.from(JSON.stringify(req.body));

    const request = new Request(url, {
      method: req.method,
      headers,
      body: requestBody ? new Uint8Array(requestBody) : undefined,
      ...{ duplex: "half" }
    } as RequestInit);

    const response = await handleMcpHttpRequest(request, {
      agentToolsScope: req.userId
        ? { userId: req.userId, source: "http-session" }
        : undefined,
      unauthorizedChallenge: mcpBearerChallenge()
    });
    if (!response) {
      reply.status(404).send({ error: "Not found" });
      return;
    }
    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    reply.send(Buffer.from(await response.arrayBuffer()));
  });

  // A stand-in for the wider REST/tRPC surface — /mcp's WWW-Authenticate
  // challenge must NOT bleed onto it, and an `nta_` token must not
  // authenticate it either.
  app.get("/api/workflows", async (req) => ({ userId: req.userId }));

  await app.ready();
  return app;
}

const initializeBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" }
  }
});

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

describe("(a) unauthenticated POST /mcp", () => {
  it("401s with a WWW-Authenticate challenge naming resource_metadata and scope=mcp", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      payload: initializeBody
    });
    expect(res.statusCode).toBe(401);
    const challenge = res.headers["www-authenticate"] as string;
    expect(challenge).toContain(
      `resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`
    );
    expect(challenge).toContain('scope="mcp"');
  });
});

describe("(b) full flow: register -> authorize -> approve -> token -> /mcp", () => {
  it("an nta_ token minted through the whole flow authenticates POST /mcp initialize", async () => {
    const app = await buildApp();

    // register
    const registerRes = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Integration Test Client",
        redirect_uris: ["https://client.example/cb"]
      }),
      headers: { "content-type": "application/json" }
    });
    expect(registerRes.statusCode).toBe(201);
    const { client_id: clientId } = registerRes.json();

    // authorize
    const { verifier, challenge } = pkcePair();
    const authorizeQuery = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "https://client.example/cb",
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "state-123"
    });
    const authorizeRes = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery.toString()}`
    });
    expect(authorizeRes.statusCode).toBe(302);
    const consentLocation = new URL(
      authorizeRes.headers.location as string,
      "http://localhost"
    );
    expect(consentLocation.pathname).toBe("/oauth/consent");
    const requestId = consentLocation.searchParams.get("request_id")!;
    expect(requestId).toBeTruthy();

    // approve — through the real tRPC procedure (T4), not pendingStore directly.
    const caller = createCaller(makeCtx("user-integration"));
    const { redirect_url: approvalRedirect } =
      await caller.agentAccess.approveOauthRequest({ request_id: requestId });
    const approvalUrl = new URL(approvalRedirect);
    expect(approvalUrl.origin + approvalUrl.pathname).toBe(
      "https://client.example/cb"
    );
    expect(approvalUrl.searchParams.get("state")).toBe("state-123");
    const code = approvalUrl.searchParams.get("code")!;
    expect(code).toBeTruthy();

    // token
    const tokenRes = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: "https://client.example/cb",
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    expect(tokenRes.statusCode).toBe(200);
    const { access_token: accessToken } = tokenRes.json();
    expect(accessToken.startsWith("nta_")).toBe(true);

    // authenticated /mcp initialize
    const mcpRes = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${accessToken}`
      },
      payload: initializeBody
    });
    expect(mcpRes.statusCode).toBe(200);
    expect(mcpRes.headers["mcp-session-id"]).toBeTruthy();
  });
});

describe("(c) nta_ audience restriction", () => {
  async function mintAccessToken(app: FastifyInstance): Promise<string> {
    const registerRes = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: JSON.stringify({
        client_name: "Audience Test Client",
        redirect_uris: ["https://client.example/cb"]
      }),
      headers: { "content-type": "application/json" }
    });
    const { client_id: clientId } = registerRes.json();
    const { verifier, challenge } = pkcePair();
    const authorizeQuery = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "https://client.example/cb",
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    const authorizeRes = await app.inject({
      method: "GET",
      url: `/oauth/authorize?${authorizeQuery.toString()}`
    });
    const requestId = new URL(
      authorizeRes.headers.location as string,
      "http://localhost"
    ).searchParams.get("request_id")!;
    const caller = createCaller(makeCtx("user-audience"));
    const { redirect_url } = await caller.agentAccess.approveOauthRequest({
      request_id: requestId
    });
    const code = new URL(redirect_url).searchParams.get("code")!;
    const tokenRes = await app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: "https://client.example/cb",
        code_verifier: verifier
      }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    return tokenRes.json().access_token;
  }

  it("the same nta_ token is refused on a non-/mcp API route", async () => {
    const app = await buildApp();
    const accessToken = await mintAccessToken(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workflows",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_token");
    // The challenge must not bleed onto the wider API surface: only /mcp
    // denials advertise the OAuth flow.
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });

  it("a pre-minted nta_ token stops authenticating once NODETOOL_DISABLE_MCP_OAUTH=1", async () => {
    const app = await buildApp();
    const accessToken = await mintAccessToken(app);
    process.env["NODETOOL_DISABLE_MCP_OAUTH"] = "1";

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${accessToken}`
      },
      payload: initializeBody
    });
    // The flag turns the whole flow off at once: outstanding access tokens
    // are refused immediately, not honored for their remaining hour —
    // which is what makes configuration.md's "token paste is the only way
    // to connect" true the moment the flag is set.
    expect(res.statusCode).toBe(401);
  });
});

describe("(d) ntk_ keeps working on /mcp", () => {
  it("an AccessToken (ntk_) still authenticates /mcp initialize", async () => {
    const app = await buildApp();
    const { token } = await AccessToken.mint({
      userId: "user-ntk",
      name: "legacy client"
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`
      },
      payload: initializeBody
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["mcp-session-id"]).toBeTruthy();
  });
});

describe("(e) NODETOOL_DISABLE_MCP_OAUTH=1", () => {
  it("removes the WWW-Authenticate header and 404s the AS routes", async () => {
    process.env["NODETOOL_DISABLE_MCP_OAUTH"] = "1";
    const app = await buildApp();

    const mcpRes = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      payload: initializeBody
    });
    expect(mcpRes.statusCode).toBe(401);
    expect(mcpRes.headers["www-authenticate"]).toBeUndefined();

    const wellKnownRes = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/mcp"
    });
    expect(wellKnownRes.statusCode).toBe(404);

    const authorizeRes = await app.inject({
      method: "GET",
      url: "/oauth/authorize?client_id=ntc_x&redirect_uri=https://client.example/cb&response_type=code&code_challenge=abc&code_challenge_method=S256"
    });
    expect(authorizeRes.statusCode).toBe(404);
  });
});
