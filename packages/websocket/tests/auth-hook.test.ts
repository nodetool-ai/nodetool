/**
 * Tests for the auth onRequest hook behavior.
 * We test the hook logic in isolation by building a minimal Fastify app
 * that registers the same hook and route, then using fastify.inject().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  SupabaseAuthProvider,
  LocalAuthProvider,
  DelegatedTokenProvider,
  isDelegatedToken,
  mintDelegatedToken
} from "@nodetool-ai/auth";

// Helper: build a minimal Fastify app with the auth hook and a protected route
async function buildApp(opts: {
  supabaseMode: boolean;
  mockVerify?: (
    token: string
  ) => Promise<{ ok: boolean; userId?: string; error?: string }>;
  /** Signing key for the delegated-token leg of the chain; omitted = off. */
  delegatedKey?: Buffer;
}): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy: true, logger: false });

  // Type augmentation is global, so we just decorate here
  app.decorateRequest("userId", null);

  const provider = opts.supabaseMode
    ? new SupabaseAuthProvider({
        supabaseUrl: "http://fake",
        supabaseKey: "fake"
      })
    : new LocalAuthProvider();

  if (opts.mockVerify && opts.supabaseMode) {
    vi.spyOn(provider, "verifyToken").mockImplementation(
      opts.mockVerify as any
    );
  }

  const delegatedProvider = opts.delegatedKey
    ? new DelegatedTokenProvider(opts.delegatedKey)
    : null;

  app.addHook("onRequest", async (req, reply) => {
    const pathname = req.url.split("?")[0];
    if (pathname === "/health" || req.url.startsWith("/api/oauth/")) return;

    const isWs = req.headers["upgrade"]?.toLowerCase() === "websocket";
    const searchParams = new URLSearchParams(req.url.split("?")[1] ?? "");
    const token = isWs
      ? provider.extractTokenFromWs(
          req.headers as Record<string, string>,
          searchParams
        )
      : provider.extractTokenFromHeaders(req.headers as Record<string, string>);

    // Delegated tokens are checked first, and only when they announce
    // themselves by prefix. Anything else falls through unchanged.
    if (delegatedProvider && token && isDelegatedToken(token)) {
      const delegated = await delegatedProvider.verifyToken(token);
      if (delegated.ok) {
        req.userId = delegated.userId ?? null;
        return;
      }
    }

    if (opts.supabaseMode) {
      if (!token) {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      const result = await provider.verifyToken(token);
      if (!result.ok) {
        reply.status(401).send({ error: result.error ?? "Unauthorized" });
        return;
      }
      req.userId = result.userId ?? null;
      return;
    }

    // Dev mode
    const remoteAddr = req.socket?.remoteAddress ?? "127.0.0.1";
    const isLocalhost = remoteAddr === "127.0.0.1" || remoteAddr === "::1";
    if (!isLocalhost) {
      reply
        .status(401)
        .send({ error: "Remote access requires authentication" });
      return;
    }
    req.userId = "1";
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/oauth/callback", async () => ({ oauth: true }));
  app.get("/api/protected", async (req) => ({ userId: req.userId }));

  await app.ready();
  return app;
}

describe("auth hook — dev mode (no Supabase)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ supabaseMode: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows /health without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("allows /api/oauth/* without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/oauth/callback" });
    expect(res.statusCode).toBe(200);
  });

  it("allows localhost requests and sets userId='1'", async () => {
    // fastify.inject() uses 127.0.0.1 as remoteAddress
    const res = await app.inject({ method: "GET", url: "/api/protected" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "1" });
  });
});

describe("auth hook — Supabase mode", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      supabaseMode: true,
      mockVerify: async (token: string) => {
        if (token === "valid-token") return { ok: true, userId: "user-42" };
        return { ok: false, error: "Invalid token" };
      }
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows /health without token", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/protected" });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: "Bearer bad-token" }
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid token" });
  });

  it("allows request with valid token and sets userId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: "Bearer valid-token" }
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "user-42" });
  });

  it("returns 401 for WS upgrade with no api_key param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ws",
      headers: { upgrade: "websocket", connection: "upgrade" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for WS upgrade with invalid api_key param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ws?api_key=bad-token",
      headers: { upgrade: "websocket", connection: "upgrade" }
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("auth hook — delegated tokens chained before the provider", () => {
  const DELEGATED_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf-8");
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      supabaseMode: true,
      delegatedKey: DELEGATED_KEY,
      mockVerify: async (token: string) => {
        if (token === "valid-token") return { ok: true, userId: "user-42" };
        return { ok: false, error: "Invalid token" };
      }
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("authenticates a minted delegated token as its mapped user", async () => {
    const { token } = mintDelegatedToken(DELEGATED_KEY, "user-a", 3600);
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "user-a" });
  });

  it("leaves non-delegated tokens to the configured provider", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: "Bearer valid-token" }
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "user-42" });
  });

  it("falls through — and is rejected — when a delegated token expired", async () => {
    const { token } = mintDelegatedToken(DELEGATED_KEY, "user-a", -1);
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(401);
  });

  it("falls through — and is rejected — when a delegated token was tampered with", async () => {
    const { token } = mintDelegatedToken(DELEGATED_KEY, "user-a", 3600);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const res = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: { authorization: `Bearer ${tampered}` }
    });
    expect(res.statusCode).toBe(401);
  });
});
