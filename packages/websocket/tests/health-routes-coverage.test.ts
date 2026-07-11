import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// Mock pingDb so we can drive the healthy / degraded branches of GET /health.
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return { ...actual, pingDb: vi.fn() };
});

import { pingDb } from "@nodetool-ai/models";
import healthRoute, { getVersion } from "../src/routes/health.js";

const pingDbMock = vi.mocked(pingDb);

describe("health routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    pingDbMock.mockReset();
    app = Fastify({ logger: false });
    await app.register(healthRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health returns 200 ok when the database ping succeeds", async () => {
    pingDbMock.mockResolvedValue(undefined as never);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.services).toEqual({ database: "ok", server: "ok" });
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    // timestamp is a valid ISO string.
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("GET /health returns 503 degraded when the database ping rejects", async () => {
    pingDbMock.mockRejectedValue(new Error("db down"));
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.database).toBe("error");
    expect(body.services.server).toBe("ok");
  });

  it("GET /ready always returns 200 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /api/health returns version and uptime", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.uptime).toBe("number");
  });
});

describe("getVersion", () => {
  it("reads a non-empty version string from package.json", () => {
    const v = getVersion();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });
});
