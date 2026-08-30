import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { isPublicAuthExemptRoute } from "../src/lib/public-routes.js";
import {
  initTestDb,
  ModelObserver,
  TriggerInput,
  TriggerRegistration
} from "@nodetool-ai/models";
import { DrizzleTriggerInputStore } from "../src/triggers/stores.js";
import {
  createWebhookRoute,
  type WebhookTriggerSink
} from "../src/triggers/webhook-route.js";

const SECRET = "s3cr3t-webhook-secret";
const TOKEN = "abc123token";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Durable sink over the same store the server wires in production, so the
 * assertions below check real `trigger_inputs` rows rather than a spy.
 */
class DurableSink implements WebhookTriggerSink {
  private store = new DrizzleTriggerInputStore();

  async deliverTriggerInput(opts: {
    runId: string;
    nodeId: string;
    inputId: string;
    payload: unknown;
  }): Promise<boolean> {
    return this.store.insertIfAbsent({
      runId: opts.runId,
      nodeId: opts.nodeId,
      inputId: opts.inputId,
      payload: opts.payload,
      processed: false,
      createdAt: new Date()
    });
  }
}

async function makeRegistration(
  overrides: Partial<{
    token: string;
    secretHash: string | undefined;
    enabled: number;
    nodeId: string;
    workflowId: string;
  }> = {}
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: overrides.workflowId ?? "wf-1",
    node_id: overrides.nodeId ?? "node-1",
    kind: "webhook",
    enabled: overrides.enabled ?? 1,
    config_json: {
      webhook_token: overrides.token ?? TOKEN,
      webhook_secret_hash:
        overrides.secretHash === undefined
          ? sha256(SECRET)
          : overrides.secretHash
    }
  })) as TriggerRegistration;
}

let app: FastifyInstance;
const notify = vi.fn();

async function buildApp(
  options: { maxBodyBytes?: number } = {}
): Promise<FastifyInstance> {
  const instance = Fastify();
  await instance.register(
    createWebhookRoute({
      wakeupService: new DurableSink(),
      notify,
      maxBodyBytes: options.maxBodyBytes
    })
  );
  await instance.ready();
  return instance;
}

beforeEach(async () => {
  initTestDb();
  notify.mockClear();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  ModelObserver.clear();
});

describe("POST /api/webhooks/:token", () => {
  it("stores exactly one trigger input and notifies the dispatcher", async () => {
    const reg = await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}?a=1&b=two`,
      headers: { "x-webhook-secret": SECRET, "x-custom": "yes" },
      payload: { hello: 1 }
    });

    expect(res.statusCode).toBe(200);

    const stored = await TriggerInput.findUnprocessed(10);
    expect(stored).toHaveLength(1);
    expect(stored[0].run_id).toBe(reg.workflow_id);
    expect(stored[0].node_id).toBe(reg.node_id);

    const payload = stored[0].payload_json as {
      body: unknown;
      headers: Record<string, string>;
      query: Record<string, string>;
      method: string;
    };
    expect(payload.body).toEqual({ hello: 1 });
    expect(payload.query).toEqual({ a: "1", b: "two" });
    expect(payload.method).toBe("POST");
    expect(payload.headers["x-custom"]).toBe("yes");
    // The shared secret must never be persisted into the event payload.
    expect(payload.headers["x-webhook-secret"]).toBeUndefined();

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("works without an Authorization header (public route)", async () => {
    await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}`,
      headers: { "x-webhook-secret": SECRET },
      payload: { hello: 1 }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });

  it("rejects a wrong secret with 401 and stores nothing", async () => {
    await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}`,
      headers: { "x-webhook-secret": "nope" },
      payload: { hello: 1 }
    });

    expect(res.statusCode).toBe(401);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("rejects a missing secret with 401 and stores nothing", async () => {
    await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}`,
      payload: { hello: 1 }
    });

    expect(res.statusCode).toBe(401);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("returns 404 for an unknown token", async () => {
    await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/not-a-token",
      headers: { "x-webhook-secret": SECRET },
      payload: { hello: 1 }
    });

    expect(res.statusCode).toBe(404);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("returns 410 for a disabled registration", async () => {
    await makeRegistration({ enabled: 0 });

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}`,
      headers: { "x-webhook-secret": SECRET },
      payload: { hello: 1 }
    });

    expect(res.statusCode).toBe(410);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });

  it("stores one input for a duplicate delivery carrying the same x-webhook-id", async () => {
    await makeRegistration();

    const send = () =>
      app.inject({
        method: "POST",
        url: `/api/webhooks/${TOKEN}`,
        headers: { "x-webhook-secret": SECRET, "x-webhook-id": "delivery-1" },
        payload: { n: Math.random() }
      });

    const first = await send();
    const second = await send();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).duplicate).toBe(true);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("derives an idempotency key from token+body+minute when x-webhook-id is absent", async () => {
    await makeRegistration();

    // The key buckets by wall-clock minute, so two real-time sends can
    // straddle a boundary and derive two keys. Pin the clock mid-minute.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:00:30Z"));
    try {
      const send = () =>
        app.inject({
          method: "POST",
          url: `/api/webhooks/${TOKEN}`,
          headers: { "x-webhook-secret": SECRET },
          payload: { same: "body" }
        });

      await send();
      await send();
    } finally {
      vi.useRealTimers();
    }

    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(1);
  });

  it("stores the raw string when the body is not JSON", async () => {
    await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}`,
      headers: { "x-webhook-secret": SECRET, "content-type": "text/plain" },
      payload: "not json at all"
    });

    expect(res.statusCode).toBe(200);
    const stored = await TriggerInput.findUnprocessed(10);
    expect((stored[0].payload_json as { body: unknown }).body).toBe(
      "not json at all"
    );
  });

  it("rejects an oversized body without storing anything", async () => {
    await app.close();
    app = await buildApp({ maxBodyBytes: 64 });
    await makeRegistration();

    const res = await app.inject({
      method: "POST",
      url: `/api/webhooks/${TOKEN}`,
      headers: { "x-webhook-secret": SECRET },
      payload: { big: "x".repeat(500) }
    });

    expect(res.statusCode).toBe(413);
    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
  });
});

describe("server public-route allowlist", () => {
  it("lets /api/webhooks/* through without a session", () => {
    expect(isPublicAuthExemptRoute("/api/webhooks/tok-1", "POST")).toBe(true);
  });
});
