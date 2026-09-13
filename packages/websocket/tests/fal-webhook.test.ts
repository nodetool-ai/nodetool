import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createFalWebhookRoute,
  FalWebhookVerifier,
  type FalWebhookDelivery,
  type FalWebhookInbox,
  type FalWebhookJwk
} from "../src/routes/fal-webhook.js";
import { isPublicAuthExemptRoute } from "../src/lib/public-routes.js";

const NOW = 1_700_000_000_000;
const TOKEN = "callback-token";
const REQUEST_ID = "request-123";
const USER_ID = "user-123";

function fixtureKey(): {
  jwk: FalWebhookJwk;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
} {
  const pair = generateKeyPairSync("ed25519");
  const jwk = pair.publicKey.export({ format: "jwk" });
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    throw new Error("unexpected test key");
  }
  return {
    jwk: { kty: "OKP", crv: "Ed25519", x: jwk.x },
    privateKey: pair.privateKey
  };
}

function signedFixture(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  body: Buffer,
  timestamp = String(Math.floor(NOW / 1000))
): Record<string, string> {
  const digest = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from(
    `${REQUEST_ID}\n${USER_ID}\n${timestamp}\n${digest}`
  );
  return {
    "x-fal-webhook-request-id": REQUEST_ID,
    "x-fal-webhook-user-id": USER_ID,
    "x-fal-webhook-timestamp": timestamp,
    "x-fal-webhook-signature": sign(null, message, privateKey).toString("hex")
  };
}

class TestInbox implements FalWebhookInbox {
  readonly deliveries: FalWebhookDelivery[] = [];
  async findAttempt(token: string) {
    return token === TOKEN
      ? { generationId: "generation-1", providerUserId: USER_ID }
      : null;
  }
  async insertIfAbsent(delivery: FalWebhookDelivery): Promise<boolean> {
    if (this.deliveries.some((item) => item.bodySha256 === delivery.bodySha256))
      return false;
    this.deliveries.push(delivery);
    return true;
  }
}

async function makeApp(
  inbox: FalWebhookInbox,
  verifier: FalWebhookVerifier,
  maxBodyBytes?: number
): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(createFalWebhookRoute({ inbox, verifier, maxBodyBytes }));
  await app.ready();
  return app;
}

describe("fal webhook verification", () => {
  afterEach(() => vi.restoreAllMocks());

  it("verifies the exact raw body and rotates keys with one refresh", async () => {
    const first = fixtureKey();
    const second = fixtureKey();
    const body = Buffer.from(
      JSON.stringify({ request_id: REQUEST_ID, status: "OK" })
    );
    let fetches = 0;
    const verifier = new FalWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => {
        fetches += 1;
        return fetches === 1 ? [first.jwk] : [second.jwk];
      }
    });
    const headers = signedFixture(second.privateKey, body);
    expect((await verifier.verify(headers, body)).ok).toBe(true);
    expect(fetches).toBe(2);
    expect((await verifier.verify(headers, Buffer.from(`${body} `))).ok).toBe(
      false
    );
    expect(fetches).toBe(3);
  });

  it("coalesces concurrent JWKS refreshes and rejects stale signatures", async () => {
    const key = fixtureKey();
    let resolveKeys: ((keys: readonly FalWebhookJwk[]) => void) | undefined;
    const pending = new Promise<readonly FalWebhookJwk[]>((resolve) => {
      resolveKeys = resolve;
    });
    const verifier = new FalWebhookVerifier({
      now: () => NOW,
      fetchJwks: () => pending
    });
    const body = Buffer.from(
      JSON.stringify({ request_id: REQUEST_ID, status: "ERROR" })
    );
    const valid = signedFixture(key.privateKey, body);
    const first = verifier.verify(valid, body);
    const second = verifier.verify(valid, body);
    resolveKeys?.([key.jwk]);
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    const stale = signedFixture(key.privateKey, body, "1699999000");
    expect((await verifier.verify(stale, body)).ok).toBe(false);
  });

  it("rejects future timestamps and reports a key outage as retryable", async () => {
    const key = fixtureKey();
    const body = Buffer.from(
      JSON.stringify({ request_id: REQUEST_ID, status: "OK" })
    );
    const futureVerifier = new FalWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => [key.jwk]
    });
    const future = signedFixture(key.privateKey, body, "1700001000");
    expect(await futureVerifier.verify(future, body)).toEqual({
      ok: false,
      retryable: false,
      reason: "stale_timestamp"
    });

    const unavailableVerifier = new FalWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => {
        throw new Error("key service unavailable");
      }
    });
    expect(
      await unavailableVerifier.verify(
        signedFixture(key.privateKey, body),
        body
      )
    ).toEqual({
      ok: false,
      retryable: true,
      reason: "jwks_unavailable"
    });
  });
});

describe("POST /api/providers/fal/webhook/:token", () => {
  it("persists a verified delivery and makes duplicate delivery harmless", async () => {
    const key = fixtureKey();
    const inbox = new TestInbox();
    const body = Buffer.from(
      JSON.stringify({
        request_id: REQUEST_ID,
        gateway_request_id: "gateway-1",
        status: "OK",
        payload: { images: [] }
      })
    );
    const app = await makeApp(
      inbox,
      new FalWebhookVerifier({
        now: () => NOW,
        fetchJwks: async () => [key.jwk]
      })
    );
    const headers = signedFixture(key.privateKey, body);
    const first = await app.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: body
    });
    const duplicate = await app.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: body
    });
    await app.close();
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body).duplicate).toBe(false);
    expect(duplicate.statusCode).toBe(200);
    expect(JSON.parse(duplicate.body).duplicate).toBe(true);
    expect(inbox.deliveries).toHaveLength(1);
    expect(inbox.deliveries[0]?.rawBody.equals(body)).toBe(true);
  });

  it("persists signed provider errors without treating them as HTTP failures", async () => {
    const key = fixtureKey();
    const inbox = new TestInbox();
    const body = Buffer.from(
      JSON.stringify({
        request_id: REQUEST_ID,
        status: "ERROR",
        payload_error: { type: "ModelError", message: "generation failed" }
      })
    );
    const app = await makeApp(
      inbox,
      new FalWebhookVerifier({
        now: () => NOW,
        fetchJwks: async () => [key.jwk]
      })
    );
    const response = await app.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers: signedFixture(key.privateKey, body),
      payload: body
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(inbox.deliveries[0]).toMatchObject({
      status: "ERROR",
      error: {
        type: "ModelError",
        message: "generation failed"
      },
      payloadError: {
        type: "ModelError",
        message: "generation failed"
      }
    });
  });

  it("rejects tenant and queue identity mismatches", async () => {
    const key = fixtureKey();
    const body = Buffer.from(
      JSON.stringify({ request_id: REQUEST_ID, status: "OK" })
    );
    const headers = signedFixture(key.privateKey, body);
    const wrongTenant: FalWebhookInbox = {
      findAttempt: async () => ({
        generationId: "generation-1",
        providerUserId: "different-fal-user"
      }),
      insertIfAbsent: async () => true
    };
    const tenantApp = await makeApp(
      wrongTenant,
      new FalWebhookVerifier({
        now: () => NOW,
        fetchJwks: async () => [key.jwk]
      })
    );
    const tenantResponse = await tenantApp.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: body
    });
    await tenantApp.close();
    expect(tenantResponse.statusCode).toBe(400);

    const wrongRequest: FalWebhookInbox = {
      findAttempt: async () => ({
        generationId: "generation-1",
        providerUserId: USER_ID,
        providerRequestId: "different-request"
      }),
      insertIfAbsent: async () => true
    };
    const requestApp = await makeApp(
      wrongRequest,
      new FalWebhookVerifier({
        now: () => NOW,
        fetchJwks: async () => [key.jwk]
      })
    );
    const requestResponse = await requestApp.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: body
    });
    await requestApp.close();
    expect(requestResponse.statusCode).toBe(400);

    const mismatchedBody = Buffer.from(
      JSON.stringify({ request_id: "body-request", status: "OK" })
    );
    const mismatchApp = await makeApp(
      new TestInbox(),
      new FalWebhookVerifier({
        now: () => NOW,
        fetchJwks: async () => [key.jwk]
      })
    );
    const mismatchResponse = await mismatchApp.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers: signedFixture(key.privateKey, mismatchedBody),
      payload: mismatchedBody
    });
    await mismatchApp.close();
    expect(mismatchResponse.statusCode).toBe(400);
  });

  it("fails closed for malformed auth, unknown tokens, persistence failures, and oversized bodies", async () => {
    const key = fixtureKey();
    const body = Buffer.from(
      JSON.stringify({ request_id: REQUEST_ID, status: "OK" })
    );
    const verifier = new FalWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => [key.jwk]
    });
    const app = await makeApp(new TestInbox(), verifier);
    const headers = signedFixture(key.privateKey, body);
    const missing = await app.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      payload: body
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/providers/fal/webhook/other",
      headers,
      payload: body
    });
    await app.close();
    expect(missing.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);

    const broken: FalWebhookInbox = {
      findAttempt: async () => {
        throw new Error("db offline");
      },
      insertIfAbsent: async () => true
    };
    const unavailableApp = await makeApp(broken, verifier);
    const unavailable = await unavailableApp.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: body
    });
    await unavailableApp.close();
    expect(unavailable.statusCode).toBe(503);

    const insertBroken: FalWebhookInbox = {
      findAttempt: async () => ({
        generationId: "generation-1",
        providerUserId: USER_ID
      }),
      insertIfAbsent: async () => {
        throw new Error("db offline");
      }
    };
    const insertBrokenApp = await makeApp(insertBroken, verifier);
    const insertFailure = await insertBrokenApp.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: body
    });
    await insertBrokenApp.close();
    expect(insertFailure.statusCode).toBe(503);

    const oversizedApp = await makeApp(new TestInbox(), verifier, 32);
    const oversized = await oversizedApp.inject({
      method: "POST",
      url: `/api/providers/fal/webhook/${TOKEN}`,
      headers,
      payload: Buffer.concat([body, Buffer.alloc(64)])
    });
    await oversizedApp.close();
    expect(oversized.statusCode).toBe(413);
  });
});

describe("fal webhook auth exemption", () => {
  it("exempts only POST and one token segment", () => {
    expect(
      isPublicAuthExemptRoute(`/api/providers/fal/webhook/${TOKEN}`, "POST")
    ).toBe(true);
    expect(
      isPublicAuthExemptRoute(`/api/providers/fal/webhook/${TOKEN}`, "GET")
    ).toBe(false);
    expect(
      isPublicAuthExemptRoute(`/api/providers/fal/webhook/${TOKEN}/x`, "POST")
    ).toBe(false);
    expect(
      isPublicAuthExemptRoute("/api/providers/fal/webhooks-other/token", "POST")
    ).toBe(false);
  });
});
