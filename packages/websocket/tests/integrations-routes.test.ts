/**
 * `/api/integrations/:provider/*` — the identity layer a messaging bridge
 * talks to.
 *
 * The routes are exercised against a real database and a real
 * `DelegatedTokenProvider`: the point of the happy path is that the token the
 * route mints is one the server's auth hook would accept, and that the user it
 * names is the linked one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

import { DelegatedTokenProvider } from "@nodetool-ai/auth";
import { ExternalIdentity, Thread, initTestDb } from "@nodetool-ai/models";

import { createIntegrationRoutes } from "../src/routes/integrations.js";

const SERVICE_TOKEN = "integration-service-token-0123456789";
const SIGNING_KEY = Buffer.from("0123456789abcdef0123456789abcdef", "utf-8");

let previousToken: string | undefined;

interface BuildOptions {
  enforceAuth?: boolean;
  serviceToken?: string | null;
  now?: () => number;
}

async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const { enforceAuth = true, serviceToken = SERVICE_TOKEN, now } = options;
  if (serviceToken === null) {
    delete process.env.NODETOOL_INTEGRATION_TOKEN;
  } else {
    process.env.NODETOOL_INTEGRATION_TOKEN = serviceToken;
  }
  const app = Fastify({ logger: false });
  await app.register(
    createIntegrationRoutes({
      signingKey: () => SIGNING_KEY,
      enforceAuth,
      now
    })
  );
  await app.ready();
  return app;
}

function auth(token = SERVICE_TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

beforeEach(() => {
  previousToken = process.env.NODETOOL_INTEGRATION_TOKEN;
  initTestDb();
});

afterEach(() => {
  if (previousToken === undefined) {
    delete process.env.NODETOOL_INTEGRATION_TOKEN;
  } else {
    process.env.NODETOOL_INTEGRATION_TOKEN = previousToken;
  }
});

describe("integration routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("links an account and mints a token the delegated provider accepts", async () => {
    app = await buildApp();

    const start = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/start",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as {
      code: string;
      url: string;
      expires_at: string;
    };
    expect(started.code).toBeTruthy();
    expect(started.url).toContain(
      `/integrations/link?code=${encodeURIComponent(started.code)}`
    );
    expect(Date.parse(started.expires_at)).toBeGreaterThan(Date.now());

    const complete = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/complete",
      headers: auth(),
      payload: { external_id: "tg-1", code: started.code, user_id: "user-a" }
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toEqual({ linked: true });

    const stored = await ExternalIdentity.findByExternal("telegram", "tg-1");
    expect(stored!.user_id).toBe("user-a");

    const minted = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/token",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    expect(minted.statusCode).toBe(200);
    const body = minted.json() as {
      token: string;
      expires_at: string;
      user_id: string;
    };
    expect(body.user_id).toBe("user-a");
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now());

    const verified = await new DelegatedTokenProvider(SIGNING_KEY).verifyToken(
      body.token
    );
    expect(verified.ok).toBe(true);
    expect(verified.userId).toBe("user-a");
  });

  it("refuses a wrong or missing service token on every route", async () => {
    app = await buildApp();
    const calls = [
      { method: "POST" as const, url: "/api/integrations/telegram/link/start" },
      {
        method: "POST" as const,
        url: "/api/integrations/telegram/link/complete"
      },
      { method: "POST" as const, url: "/api/integrations/telegram/token" },
      { method: "DELETE" as const, url: "/api/integrations/telegram/link" }
    ];
    for (const call of calls) {
      const wrong = await app.inject({
        ...call,
        headers: auth("not-the-service-token-0123456789"),
        payload: { external_id: "tg-1" }
      });
      expect(wrong.statusCode).toBe(401);

      const missing = await app.inject({ ...call, payload: { external_id: "tg-1" } });
      expect(missing.statusCode).toBe(401);
    }
  });

  it("answers 404 for an external id nobody linked", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/token",
      headers: auth(),
      payload: { external_id: "tg-unknown" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("consumes a link code once — the second use is 410", async () => {
    app = await buildApp();
    const start = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/start",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    const { code } = start.json() as { code: string };

    const first = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/complete",
      headers: auth(),
      payload: { external_id: "tg-1", code, user_id: "user-a" }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/complete",
      headers: auth(),
      payload: { external_id: "tg-1", code, user_id: "user-b" }
    });
    expect(second.statusCode).toBe(410);
    const stored = await ExternalIdentity.findByExternal("telegram", "tg-1");
    expect(stored!.user_id).toBe("user-a");
  });

  it("expires a link code after its TTL", async () => {
    let clock = Date.now();
    app = await buildApp({ now: () => clock });
    const start = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/start",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    const { code } = start.json() as { code: string };

    clock += 11 * 60 * 1000;
    const late = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/complete",
      headers: auth(),
      payload: { external_id: "tg-1", code, user_id: "user-a" }
    });
    expect(late.statusCode).toBe(410);
  });

  it("refuses a code minted for a different account", async () => {
    app = await buildApp();
    const start = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/start",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    const { code } = start.json() as { code: string };

    const wrongAccount = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/complete",
      headers: auth(),
      payload: { external_id: "tg-2", code, user_id: "user-a" }
    });
    expect(wrongAccount.statusCode).toBe(400);
    expect(await ExternalIdentity.findByExternal("telegram", "tg-2")).toBeNull();
  });

  it("unlinks an account so no further token mints", async () => {
    app = await buildApp();
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-1",
      userId: "user-a"
    });

    const removed = await app.inject({
      method: "DELETE",
      url: "/api/integrations/telegram/link",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ unlinked: true });

    const minted = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/token",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    expect(minted.statusCode).toBe(404);
  });

  it("refuses to mint in local single-user trust mode", async () => {
    app = await buildApp({ enforceAuth: false });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-1",
      userId: "1"
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/token",
      headers: auth(),
      payload: { external_id: "tg-1" }
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toMatch(/single-user/i);
  });

  it("rejects a provider outside the allowlist", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/matrix/link/start",
      headers: auth(),
      payload: { external_id: "mx-1" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("validates the body", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/link/start",
      headers: auth(),
      payload: { external_id: 42 }
    });
    expect(res.statusCode).toBe(400);
  });

  it("registers nothing without NODETOOL_INTEGRATION_TOKEN", async () => {
    app = await buildApp({ serviceToken: null });
    for (const call of [
      { method: "POST" as const, url: "/api/integrations/telegram/link/start" },
      {
        method: "POST" as const,
        url: "/api/integrations/telegram/link/complete"
      },
      { method: "POST" as const, url: "/api/integrations/telegram/token" },
      { method: "DELETE" as const, url: "/api/integrations/telegram/link" }
    ]) {
      const res = await app.inject({ ...call, payload: {} });
      expect(res.statusCode).toBe(404);
    }
  });

  it("registers nothing when the service token is too short to trust", async () => {
    app = await buildApp({ serviceToken: "short" });
    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/telegram/token",
      headers: { authorization: "Bearer short" },
      payload: { external_id: "tg-1" }
    });
    expect(res.statusCode).toBe(404);
  });

  /**
   * The M1 exit criterion, at the layer this milestone owns: a token minted
   * for one linked user names that user, and a thread created under them is
   * unreadable as anyone else. The websocket turn itself lands with the bridge.
   */
  it("isolates one linked user's threads from another's", async () => {
    app = await buildApp();
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-a",
      userId: "user-a"
    });
    await ExternalIdentity.link({
      provider: "telegram",
      externalId: "tg-b",
      userId: "user-b"
    });

    const mintFor = async (externalId: string): Promise<string> => {
      const res = await app.inject({
        method: "POST",
        url: "/api/integrations/telegram/token",
        headers: auth(),
        payload: { external_id: externalId }
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { token: string }).token;
    };

    const provider = new DelegatedTokenProvider(SIGNING_KEY);
    const identityA = await provider.verifyToken(await mintFor("tg-a"));
    const identityB = await provider.verifyToken(await mintFor("tg-b"));
    expect(identityA.userId).toBe("user-a");
    expect(identityB.userId).toBe("user-b");
    expect(identityA.userId).not.toBe(identityB.userId);

    const thread = await Thread.create<Thread>({
      user_id: identityA.userId!,
      title: "from telegram"
    });

    expect(await Thread.find(identityA.userId!, thread.id)).not.toBeNull();
    expect(await Thread.find(identityB.userId!, thread.id)).toBeNull();

    const [ownerThreads] = await Thread.paginate(identityA.userId!);
    const [otherThreads] = await Thread.paginate(identityB.userId!);
    expect(ownerThreads.map((t) => t.id)).toContain(thread.id);
    expect(otherThreads).toHaveLength(0);
  });
});
