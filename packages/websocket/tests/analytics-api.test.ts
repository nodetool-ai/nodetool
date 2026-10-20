/**
 * The anonymous analytics route: validation, relay and ingestion.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  analyticsDaily,
  analyticsEvents,
  getPortableDb,
  initTestDb
} from "@nodetool-ai/models";
import type { AnalyticsBatch, AnalyticsTransport } from "@nodetool-ai/analytics";
import {
  analyticsRelayEndpoint,
  analyticsRouteMode,
  createAnalyticsRoute,
  type AnalyticsRouteOptions
} from "../src/routes/analytics.js";
import { isPublicAuthExemptRoute } from "../src/lib/public-routes.js";
import {
  createBackendAnalyticsClient,
  isBackendAnalyticsEnabled
} from "../src/backend-analytics.js";

const NOW = new Date("2026-10-17T21:30:00Z");
const URL_PATH = "/api/analytics/v1/events";

const envelope = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  event: "workflow_run",
  clientType: "cloud_web",
  anonymousId: "3b241101-e2bb-4255-8caf-4136c566a962",
  sessionId: "6fa459ea-ee8a-4ca4-894e-db77e160355e",
  timestamp: "2026-10-17T21:00:00.000Z",
  appVersion: "0.8.4",
  platform: "web",
  properties: { executionMode: "cloud", nodeCountBucket: "6-20" },
  ...overrides
});

const batch = (...events: Record<string, unknown>[]): Record<string, unknown> => ({
  schemaVersion: 1,
  events: events.length > 0 ? events : [envelope()]
});

const IDENTIFYING_HEADERS = {
  "x-forwarded-for": "203.0.113.7",
  "x-real-ip": "203.0.113.7",
  "user-agent": "Mozilla/5.0 (Macintosh; secret-agent)",
  cookie: "sb-access-token=eyJsecret",
  authorization: "Bearer eyJsecret",
  referer: "http://localhost:7777/editor/0123456789abcdef0123456789abcdef"
};

let app: FastifyInstance;
let stored: AnalyticsBatch[];
let relayed: AnalyticsBatch[];

async function build(env: Record<string, string>, extra: AnalyticsRouteOptions = {}): Promise<void> {
  stored = [];
  relayed = [];
  const relay: AnalyticsTransport = {
    send: async (b) => {
      relayed.push(b);
      return true;
    }
  };
  app = Fastify({ logger: false });
  // The same parser setup as server.ts: every body arrives as a raw Buffer
  // unless the route parses JSON itself.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(
    createAnalyticsRoute({
      env,
      relay,
      store: async (b) => {
        stored.push(b);
      },
      now: () => NOW,
      ...extra
    })
  );
  await app.ready();
}

afterEach(async () => {
  await app?.close();
});

describe("POST /api/analytics/v1/events", () => {
  it("is exempt from auth so it never resolves a user", () => {
    expect(isPublicAuthExemptRoute(URL_PATH, "POST")).toBe(true);
    expect(isPublicAuthExemptRoute(URL_PATH, "GET")).toBe(false);
  });

  it("stores a valid batch in ingest mode and nothing from the request", async () => {
    await build({ NODETOOL_ANALYTICS_INGEST: "1" });
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      headers: IDENTIFYING_HEADERS,
      payload: batch()
    });
    expect(res.statusCode).toBe(202);
    expect(stored).toHaveLength(1);
    const serialized = JSON.stringify(stored);
    for (const leaked of ["203.0.113.7", "secret-agent", "eyJsecret", "localhost", "0123456789abcdef"]) {
      expect(serialized).not.toContain(leaked);
    }
    expect(Object.keys(stored[0]!)).toEqual(["schemaVersion", "events"]);
  });

  it("relays only the validated body by default", async () => {
    await build({});
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      headers: IDENTIFYING_HEADERS,
      payload: batch()
    });
    expect(res.statusCode).toBe(202);
    expect(stored).toEqual([]);
    expect(relayed).toHaveLength(1);
    expect(JSON.stringify(relayed)).not.toContain("203.0.113.7");
  });

  // A website can send `text/plain` cross-site without a preflight.
  it("refuses a body that is not application/json", async () => {
    await build({ NODETOOL_ANALYTICS_INGEST: "1" });
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      headers: { "content-type": "text/plain" },
      payload: JSON.stringify(batch())
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(stored).toEqual([]);
  });

  it("accepts and discards when relaying is off", async () => {
    await build({ NODETOOL_ANALYTICS_RELAY: "0" });
    const res = await app.inject({ method: "POST", url: URL_PATH, payload: batch() });
    expect(res.statusCode).toBe(202);
    expect(stored).toEqual([]);
    expect(relayed).toEqual([]);
  });

  it("rejects account, project and workflow identifiers", async () => {
    await build({ NODETOOL_ANALYTICS_INGEST: "1" });
    for (const bad of [
      envelope({ userId: "user-1" }),
      envelope({ properties: { executionMode: "cloud", nodeCountBucket: "6-20", workflowId: "wf" } }),
      envelope({ properties: { executionMode: "cloud", nodeCountBucket: "6-20", project_id: "p" } }),
      envelope({ anonymousId: "user@example.com" }),
      envelope({
        event: "execution_started",
        clientType: "cloud_backend",
        anonymousId: "3b241101-e2bb-4255-8caf-4136c566a962",
        sessionId: null,
        platform: "linux",
        properties: { executionMode: "cloud", feature: "workflow" }
      })
    ]) {
      const res = await app.inject({ method: "POST", url: URL_PATH, payload: batch(bad) });
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect(stored).toEqual([]);
  });

  it("rejects unknown events, extra fields, wrong versions and stale events", async () => {
    await build({ NODETOOL_ANALYTICS_INGEST: "1" });
    for (const body of [
      batch(envelope({ event: "keypress" })),
      { ...batch(), ip: "203.0.113.7" },
      { schemaVersion: "1", events: [envelope()] },
      batch(envelope({ schemaVersion: 2 })),
      batch(envelope({ timestamp: "2026-09-01T00:00:00.000Z" })),
      batch(envelope({ timestamp: "2026-10-17T21:17:00.000Z" }))
    ]) {
      const res = await app.inject({ method: "POST", url: URL_PATH, payload: body });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(stored).toEqual([]);
  });

  it("refuses oversized bodies", async () => {
    await build({ NODETOOL_ANALYTICS_INGEST: "1" });
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { schemaVersion: 1, events: [envelope()], padding: "x".repeat(70_000) }
    });
    expect(res.statusCode).toBe(413);
  });
});

describe("ingestion storage", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("persists no IP address, header or user agent", async () => {
    await build({ NODETOOL_ANALYTICS_INGEST: "1" }, { store: undefined });
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      headers: IDENTIFYING_HEADERS,
      payload: batch()
    });
    expect(res.statusCode).toBe(202);
    const raw = await getPortableDb().select().from(analyticsEvents);
    const daily = await getPortableDb().select().from(analyticsDaily);
    expect(raw).toHaveLength(1);
    expect(daily).toHaveLength(1);
    const serialized = JSON.stringify([raw, daily]);
    for (const leaked of ["203.0.113.7", "secret-agent", "eyJsecret", "localhost"]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});

describe("configuration", () => {
  it("picks the mode from the environment", () => {
    expect(analyticsRouteMode({})).toBe("relay");
    expect(analyticsRouteMode({ NODETOOL_ANALYTICS_INGEST: "1" })).toBe("ingest");
    expect(analyticsRouteMode({ NODETOOL_ANALYTICS_RELAY: "0" })).toBe("off");
  });

  it("relays only to https endpoints", () => {
    expect(analyticsRelayEndpoint({})).toMatch(/^https:\/\/analytics\.nodetool\.ai\//);
    expect(analyticsRelayEndpoint({ NODETOOL_ANALYTICS_ENDPOINT: "http://10.0.0.1/x" })).toMatch(
      /^https:\/\/analytics\.nodetool\.ai\//
    );
  });
});

describe("backend analytics", () => {
  it("is off unless the operator enables it on the cloud profile", () => {
    expect(isBackendAnalyticsEnabled({})).toBe(false);
    expect(isBackendAnalyticsEnabled({ NODETOOL_ANALYTICS_BACKEND: "1" })).toBe(false);
    expect(
      isBackendAnalyticsEnabled({
        NODETOOL_ANALYTICS_BACKEND: "1",
        NODETOOL_NODE_PROFILE: "cloud"
      })
    ).toBe(true);
    expect(
      isBackendAnalyticsEnabled({
        NODETOOL_ANALYTICS_BACKEND: "1",
        NODETOOL_NODE_PROFILE: "cloud",
        NODETOOL_TELEMETRY: "0"
      })
    ).toBe(false);
  });

  it("sends execution events without any identity", async () => {
    const sent: AnalyticsBatch[] = [];
    const client = createBackendAnalyticsClient({}, {
      send: async (b) => {
        sent.push(b);
        return true;
      }
    });
    await client.ready;
    client.track({
      event: "execution_failed",
      properties: {
        executionMode: "cloud",
        feature: "workflow",
        durationBucket: "10-30s",
        errorCategory: "provider"
      }
    });
    await client.flush({ force: true });
    client.shutdown();
    const event = sent[0]?.events[0];
    expect(event).toMatchObject({
      clientType: "cloud_backend",
      anonymousId: null,
      sessionId: null
    });
    expect(Object.keys(event?.properties ?? {}).sort()).toEqual([
      "durationBucket",
      "errorCategory",
      "executionMode",
      "feature"
    ]);
  });

  it("keeps operational metrics out of product analytics", async () => {
    const sent: AnalyticsBatch[] = [];
    const client = createBackendAnalyticsClient({}, {
      send: async (b) => {
        sent.push(b);
        return true;
      }
    });
    await client.ready;
    for (const operational of [
      { event: "queue_depth", properties: { depth: "10" } },
      { event: "worker_health", properties: {} },
      {
        event: "execution_completed",
        properties: { executionMode: "cloud", feature: "workflow", durationBucket: "<1s", cpuPercent: "80" }
      }
    ]) {
      client.track(operational as never);
    }
    await client.flush({ force: true });
    client.shutdown();
    expect(sent).toEqual([]);
  });
});
