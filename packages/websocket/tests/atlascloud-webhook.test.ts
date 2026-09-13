import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  ATLASCLOUD_WEBHOOK_PATH,
  AtlasCloudWebhookVerifier,
  createAtlasCloudWebhookRoute,
  type AtlasCloudWebhookJwk,
  type AtlasCloudWebhookSink
} from "../src/routes/atlascloud-webhook.js";
import { isPublicAuthExemptRoute } from "../src/lib/public-routes.js";
import { ATLAS_WEBHOOK_PATH, type AtlasPollResult } from "@nodetool-ai/runtime";

const NOW = 1_700_000_000_000;
const PATH = "/api/providers/atlascloud/webhook";
const SESSION_ID = "session-123";
const KEY_ID = "key-1";

function fixtureKey(kid = KEY_ID): {
  jwk: AtlasCloudWebhookJwk;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
} {
  const pair = generateKeyPairSync("ed25519");
  const jwk = pair.publicKey.export({ format: "jwk" });
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    throw new Error("unexpected test key");
  }
  return {
    jwk: { kty: "OKP", crv: "Ed25519", x: jwk.x, kid },
    privateKey: pair.privateKey
  };
}

function terminalBody(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      session_id: SESSION_ID,
      event_type: "image.task.terminal",
      status: "OK",
      created_at: NOW,
      payload: {
        model: "google/nano-banana-2/text-to-image",
        status: "completed",
        outputs: ["https://cdn.atlascloud.test/a.png"]
      },
      ...overrides
    })
  );
}

function signedHeaders(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  body: Buffer,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const timestamp = String(Math.floor(NOW / 1000));
  const message = Buffer.concat([Buffer.from(`${timestamp}.`), body]);
  return {
    "x-atlascloud-webhook-id": SESSION_ID,
    "x-atlascloud-webhook-event": "image.task.terminal",
    "x-atlascloud-webhook-timestamp": timestamp,
    "x-atlascloud-webhook-key-id": KEY_ID,
    "x-atlascloud-webhook-signature-ed25519": sign(
      null,
      message,
      privateKey
    ).toString("base64url"),
    ...overrides
  };
}

class TestSink implements AtlasCloudWebhookSink {
  readonly resolved: Array<{ id: string; result: AtlasPollResult }> = [];
  readonly rejected: Array<{ id: string; reason: string }> = [];
  matched = true;

  resolve(predictionId: string, result: AtlasPollResult): boolean {
    this.resolved.push({ id: predictionId, result });
    return this.matched;
  }
  reject(predictionId: string, reason: string): boolean {
    this.rejected.push({ id: predictionId, reason });
    return this.matched;
  }
}

async function makeApp(
  sink: AtlasCloudWebhookSink,
  verifier: AtlasCloudWebhookVerifier,
  maxBodyBytes?: number
): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(
    createAtlasCloudWebhookRoute({ sink, verifier, maxBodyBytes })
  );
  await app.ready();
  return app;
}

function verifierFor(
  keys: readonly AtlasCloudWebhookJwk[]
): AtlasCloudWebhookVerifier {
  return new AtlasCloudWebhookVerifier({
    now: () => NOW,
    fetchJwks: async () => keys
  });
}

describe("AtlasCloud webhook verification", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts a callback signed over `<timestamp>.<raw body>`", async () => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(key.privateKey, body),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      status: "accepted",
      matched: true
    });
    expect(sink.resolved).toEqual([
      {
        id: SESSION_ID,
        result: {
          status: "completed",
          outputs: ["https://cdn.atlascloud.test/a.png"]
        }
      }
    ]);
    await app.close();
  });

  it("accepts a base64url signature sent with padding", async () => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();
    const headers = signedHeaders(key.privateKey, body);
    const unpadded = headers["x-atlascloud-webhook-signature-ed25519"];

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...headers,
        "x-atlascloud-webhook-signature-ed25519": `${unpadded}==`,
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(200);
    expect(sink.resolved).toHaveLength(1);
    await app.close();
  });

  it("accepts the signature in the documented fallback header", async () => {
    // F3: once HMAC is retired AtlasCloud moves the Ed25519 signature to the
    // bare `-Signature` header, so a delivery using it must verify.
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();
    const headers = signedHeaders(key.privateKey, body);
    const signature = headers["x-atlascloud-webhook-signature-ed25519"];
    delete headers["x-atlascloud-webhook-signature-ed25519"];

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...headers,
        "x-atlascloud-webhook-signature": signature,
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(200);
    expect(sink.resolved).toHaveLength(1);
    await app.close();
  });

  it("prefers the -Ed25519 header when both are present", async () => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(key.privateKey, body),
        // A migration delivery carries a hex HMAC here. Reading it in
        // preference to the Ed25519 header would fail the whole callback.
        "x-atlascloud-webhook-signature": "a".repeat(64),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(200);
    expect(sink.resolved).toHaveLength(1);
    await app.close();
  });

  it("rejects a legacy HMAC-only delivery", async () => {
    // A hex HMAC is not a 64-byte base64url value, so the fallback cannot
    // smuggle a signature verified under the wrong scheme.
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();
    const headers = signedHeaders(key.privateKey, body);
    delete headers["x-atlascloud-webhook-signature-ed25519"];

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...headers,
        "x-atlascloud-webhook-signature": "a".repeat(64),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("invalid_header");
    expect(sink.resolved).toHaveLength(0);
    await app.close();
  });

  it("does not refetch the JWKS for a signature that fails a known key", async () => {
    // F4: this route is unauthenticated, so refetching on any bad signature
    // let a caller drive one outbound request per attempt.
    const published = fixtureKey();
    const attacker = fixtureKey();
    let fetches = 0;
    const verifier = new AtlasCloudWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => {
        fetches += 1;
        return [published.jwk];
      }
    });
    const sink = new TestSink();
    const app = await makeApp(sink, verifier);
    const body = terminalBody();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await app.inject({
        method: "POST",
        url: PATH,
        headers: {
          ...signedHeaders(attacker.privateKey, body),
          "content-type": "application/json"
        },
        payload: body
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("invalid_signature");
    }

    // Only the cold-start load. Three bad signatures added nothing.
    expect(fetches).toBe(1);
    await app.close();
  });

  it("allows one rotation refresh per cooldown for unknown key ids", async () => {
    const published = fixtureKey("key-1");
    let fetches = 0;
    const verifier = new AtlasCloudWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => {
        fetches += 1;
        return [published.jwk];
      }
    });
    const sink = new TestSink();
    const app = await makeApp(sink, verifier);
    const body = terminalBody();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await app.inject({
        method: "POST",
        url: PATH,
        headers: {
          ...signedHeaders(published.privateKey, body, {
            "x-atlascloud-webhook-key-id": `made-up-${attempt}`
          }),
          "content-type": "application/json"
        },
        payload: body
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe("unknown_key");
    }

    // The cold-start load plus exactly one rotation refresh, not one per id.
    expect(fetches).toBe(2);
    await app.close();
  });

  it("rejects a body altered after signing", async () => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const headers = signedHeaders(key.privateKey, terminalBody());

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: { ...headers, "content-type": "application/json" },
      payload: terminalBody({ payload: { status: "completed", outputs: [] } })
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("invalid_signature");
    expect(sink.resolved).toHaveLength(0);
    await app.close();
  });

  it("rejects a signature made with a key the JWKS does not publish", async () => {
    const attacker = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([fixtureKey().jwk]));
    const body = terminalBody();

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(attacker.privateKey, body),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("invalid_signature");
    await app.close();
  });

  it("refreshes the JWKS once for an unknown key id", async () => {
    const rotated = fixtureKey("key-2");
    let fetches = 0;
    const verifier = new AtlasCloudWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => {
        fetches += 1;
        return fetches === 1 ? [fixtureKey("key-1").jwk] : [rotated.jwk];
      }
    });
    const sink = new TestSink();
    const app = await makeApp(sink, verifier);
    const body = terminalBody();

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(rotated.privateKey, body, {
          "x-atlascloud-webhook-key-id": "key-2"
        }),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(200);
    expect(fetches).toBe(2);
    await app.close();
  });

  it("answers 503 when the JWKS cannot be read, so AtlasCloud retries", async () => {
    const key = fixtureKey();
    const verifier = new AtlasCloudWebhookVerifier({
      now: () => NOW,
      fetchJwks: async () => {
        throw new Error("network down");
      }
    });
    const sink = new TestSink();
    const app = await makeApp(sink, verifier);
    const body = terminalBody();

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(key.privateKey, body),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toBe("jwks_unavailable");
    await app.close();
  });

  it("rejects a delivery outside the five-minute window", async () => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();
    const stale = String(Math.floor(NOW / 1000) - 301);
    const message = Buffer.concat([Buffer.from(`${stale}.`), body]);

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(key.privateKey, body, {
          "x-atlascloud-webhook-timestamp": stale,
          "x-atlascloud-webhook-signature-ed25519": sign(
            null,
            message,
            key.privateKey
          ).toString("base64url")
        }),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("stale_timestamp");
    await app.close();
  });

  it.each([
    ["x-atlascloud-webhook-id", "missing_header"],
    ["x-atlascloud-webhook-timestamp", "missing_header"],
    ["x-atlascloud-webhook-key-id", "missing_header"],
    ["x-atlascloud-webhook-signature-ed25519", "missing_header"]
  ])("rejects a callback with no %s", async (header, reason) => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const body = terminalBody();
    const headers: Record<string, string> = {
      ...signedHeaders(key.privateKey, body),
      "content-type": "application/json"
    };
    delete headers[header];

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers,
      payload: body
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe(reason);
    await app.close();
  });

  it("refuses a body larger than the route's limit", async () => {
    const key = fixtureKey();
    const sink = new TestSink();
    const app = await makeApp(sink, verifierFor([key.jwk]), 64);
    const body = terminalBody();

    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(key.privateKey, body),
        "content-type": "application/json"
      },
      payload: body
    });

    expect(res.statusCode).toBe(413);
    expect(sink.resolved).toHaveLength(0);
    await app.close();
  });
});

describe("AtlasCloud webhook dispatch", () => {
  async function post(
    sink: TestSink,
    body: Buffer
  ): Promise<{ statusCode: number; body: string }> {
    const key = fixtureKey();
    const app = await makeApp(sink, verifierFor([key.jwk]));
    const res = await app.inject({
      method: "POST",
      url: PATH,
      headers: {
        ...signedHeaders(key.privateKey, body),
        "content-type": "application/json"
      },
      payload: body
    });
    await app.close();
    return { statusCode: res.statusCode, body: res.body };
  }

  it("fails the prediction on a top-level ERROR", async () => {
    const sink = new TestSink();
    const res = await post(
      sink,
      terminalBody({
        status: "ERROR",
        error: "content policy",
        payload: { model: "x/y/z", status: "failed" }
      })
    );

    expect(res.statusCode).toBe(200);
    expect(sink.rejected).toEqual([
      { id: SESSION_ID, reason: "content policy" }
    ]);
    expect(sink.resolved).toHaveLength(0);
  });

  it("fails the prediction when the payload reports a failed job under OK", async () => {
    const sink = new TestSink();
    const res = await post(
      sink,
      terminalBody({ payload: { model: "x/y/z", status: "timeout" } })
    );

    expect(res.statusCode).toBe(200);
    expect(sink.rejected).toEqual([{ id: SESSION_ID, reason: "timeout" }]);
  });

  it("reports matched:false for a delivery nothing is waiting on", async () => {
    const sink = new TestSink();
    sink.matched = false;
    const res = await post(sink, terminalBody());

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      status: "accepted",
      matched: false
    });
  });

  it("rejects a body whose session_id is not the signed webhook id", async () => {
    const sink = new TestSink();
    const res = await post(sink, terminalBody({ session_id: "other" }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Session ID mismatch");
    expect(sink.resolved).toHaveLength(0);
  });

  it("rejects a status AtlasCloud does not define", async () => {
    const sink = new TestSink();
    const res = await post(sink, terminalBody({ status: "MAYBE" }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Invalid webhook status");
  });

  it("rejects a signed body that is not JSON", async () => {
    const sink = new TestSink();
    const res = await post(sink, Buffer.from("not json"));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Invalid JSON body");
  });
});

describe("AtlasCloud webhook auth exemption", () => {
  it("serves the path the provider is told to call", () => {
    // The submitted `webhook_url` is built from the runtime constant, and this
    // route is mounted on the websocket one. A drift between them would be a
    // 404 only AtlasCloud ever sees.
    expect(ATLASCLOUD_WEBHOOK_PATH).toBe(ATLAS_WEBHOOK_PATH);
    expect(ATLASCLOUD_WEBHOOK_PATH).toBe(PATH);
  });

  it("exempts only POSTs to the exact callback path", () => {
    expect(isPublicAuthExemptRoute(PATH, "POST")).toBe(true);
    expect(isPublicAuthExemptRoute(PATH, "GET")).toBe(false);
    expect(isPublicAuthExemptRoute(`${PATH}/extra`, "POST")).toBe(false);
    expect(
      isPublicAuthExemptRoute("/api/providers/atlascloud/keys", "POST")
    ).toBe(false);
  });
});
