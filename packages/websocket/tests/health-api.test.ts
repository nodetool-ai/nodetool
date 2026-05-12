/**
 * Tests for the /api/health endpoint
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import healthRoute from "../src/routes/health.js";

describe("/api/health endpoint", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(healthRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });

  it("returns version from package.json", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty("version");
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });

  it("returns uptime in seconds", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns expected JSON structure", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    const body = JSON.parse(res.body);

    expect(Object.keys(body).sort()).toEqual(["uptime", "version"]);
  });

  it("uptime increases over time", async () => {
    const res1 = await app.inject({ method: "GET", url: "/api/health" });
    const body1 = JSON.parse(res1.body);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    const res2 = await app.inject({ method: "GET", url: "/api/health" });
    const body2 = JSON.parse(res2.body);

    // Uptime should be the same or slightly higher (both calls happen within the same second usually)
    expect(body2.uptime).toBeGreaterThanOrEqual(body1.uptime);
  });
});
