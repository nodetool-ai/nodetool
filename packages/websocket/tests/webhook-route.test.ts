/**
 * Tests for the `POST /api/webhooks/:token` ingestion route (Task 9).
 *
 * Two harnesses are used, both `fastify.inject()`:
 *   - `buildRouteApp()` registers only the webhook plugin (with the raw-buffer
 *     content-type parser the real server installs) to exercise handler logic.
 *   - `buildAllowlistApp()` adds an onRequest hook mirroring the server's
 *     public-route allowlist. It pins the regression that a request with **no
 *     Authorization header** reaches the handler. Building the real server
 *     module here is impractical — it top-level-awaits `app.listen`, telemetry,
 *     and a Python bridge on import — so the hook shape is replicated, exactly
 *     as `auth-hook.test.ts` does.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import {
  initTestDb,
  TriggerRegistration,
  TriggerInput
} from "@nodetool-ai/models";
import webhookRoute from "../src/triggers/webhook-route.js";
import { setTriggerWakeupService } from "../src/triggers/dispatcher.js";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function seedWebhook(
  config: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Promise<TriggerRegistration> {
  const reg = new TriggerRegistration({
    user_id: "u1",
    workflow_id: "wf-1",
    node_id: "node-1",
    kind: "webhook",
    config_json: config,
    enabled: 1,
    ...overrides
  });
  await reg.save();
  return reg;
}

function installBufferParser(app: FastifyInstance): void {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
}

async function buildRouteApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });
  installBufferParser(app);
  await app.register(webhookRoute);
  await app.ready();
  return app;
}

/** Mirrors the server's public-route allowlist onRequest hook. */
async function buildAllowlistApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 100 * 1024 * 1024 });
  installBufferParser(app);
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req, reply) => {
    const pathname = req.url.split("?")[0];
    if (pathname.startsWith("/api/webhooks/")) return; // public allowlist
    reply.status(401).send({ error: "Unauthorized" });
  });
  await app.register(webhookRoute);
  await app.ready();
  return app;
}

let app: FastifyInstance | null = null;

describe("webhook ingestion route", () => {
  beforeEach(() => {
    initTestDb();
    setTriggerWakeupService(null);
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    setTriggerWakeupService(null);
  });

  it("accepts a valid POST, stores one input with {body,headers,query,method}", async () => {
    await seedWebhook({ token: "tok-1" });
    app = await buildRouteApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-1?foo=bar",
      headers: { "content-type": "application/json", "x-custom": "hi" },
      payload: JSON.stringify({ hello: 1 })
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "accepted" });

    const inputs = await TriggerInput.findUnprocessed(10);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].run_id).toBe("wf-1");
    expect(inputs[0].node_id).toBe("node-1");
    const payload = inputs[0].payload_json as Record<string, unknown>;
    expect(payload.body).toEqual({ hello: 1 });
    expect(payload.method).toBe("POST");
    expect(payload.query).toMatchObject({ foo: "bar" });
    expect((payload.headers as Record<string, unknown>)["x-custom"]).toBe("hi");
  });

  it("requires the secret header when secret_hash is set (correct → 200)", async () => {
    await seedWebhook({ token: "tok-2", secret_hash: sha256Hex("s3cr3t") });
    app = await buildRouteApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-2",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": "s3cr3t"
      },
      payload: JSON.stringify({ ok: true })
    });

    expect(res.statusCode).toBe(200);
    const inputs = await TriggerInput.findUnprocessed(10);
    expect(inputs).toHaveLength(1);
  });

  it("rejects a wrong secret with 401 and stores nothing", async () => {
    await seedWebhook({ token: "tok-3", secret_hash: sha256Hex("right") });
    app = await buildRouteApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-3",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": "wrong"
      },
      payload: JSON.stringify({ ok: true })
    });

    expect(res.statusCode).toBe(401);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("rejects a missing secret with 401 and stores nothing", async () => {
    await seedWebhook({ token: "tok-4", secret_hash: sha256Hex("right") });
    app = await buildRouteApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-4",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ ok: true })
    });

    expect(res.statusCode).toBe(401);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("returns 404 for an unknown token", async () => {
    app = await buildRouteApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/nope",
      headers: { "content-type": "application/json" },
      payload: "{}"
    });
    expect(res.statusCode).toBe(404);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("returns 410 for a disabled registration", async () => {
    await seedWebhook({ token: "tok-5" }, { enabled: 0 });
    app = await buildRouteApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-5",
      headers: { "content-type": "application/json" },
      payload: "{}"
    });
    expect(res.statusCode).toBe(410);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("deduplicates on x-webhook-id: two deliveries → one input", async () => {
    await seedWebhook({ token: "tok-6" });
    app = await buildRouteApp();

    const send = () =>
      app!.inject({
        method: "POST",
        url: "/api/webhooks/tok-6",
        headers: {
          "content-type": "application/json",
          "x-webhook-id": "evt-42"
        },
        payload: JSON.stringify({ n: 1 })
      });

    const first = await send();
    const second = await send();

    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.body)).toEqual({ status: "accepted" });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body)).toEqual({
      status: "accepted",
      duplicate: true
    });
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
  });

  it("stores a non-JSON body as a raw string", async () => {
    await seedWebhook({ token: "tok-7" });
    app = await buildRouteApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-7",
      headers: { "content-type": "text/plain" },
      payload: "just text"
    });

    expect(res.statusCode).toBe(200);
    const inputs = await TriggerInput.findUnprocessed(10);
    const payload = inputs[0].payload_json as Record<string, unknown>;
    expect(payload.body).toBe("just text");
  });

  it("returns 413 for a body over 1 MB and stores nothing", async () => {
    await seedWebhook({ token: "tok-8" });
    app = await buildRouteApp();

    const big = "x".repeat(1024 * 1024 + 10);
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-8",
      headers: { "content-type": "text/plain" },
      payload: big
    });

    expect(res.statusCode).toBe(413);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("is reachable with no Authorization header (public allowlist)", async () => {
    await seedWebhook({ token: "tok-9" });
    app = await buildAllowlistApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/tok-9",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ reached: true })
    });

    // Reaches the handler (200), not the 401 the allowlist hook would send.
    expect(res.statusCode).toBe(200);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
  });
});
