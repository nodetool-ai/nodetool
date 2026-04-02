import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, get, put, del } from "./setup.js";

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

describe("Settings", () => {
  it("returns settings grouped by provider", async () => {
    const res = await get("/settings");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.settings).toBeDefined();
    expect(Array.isArray(data.settings)).toBe(true);
    expect(data.settings.length).toBeGreaterThan(0);

    const first = data.settings[0];
    expect(first).toHaveProperty("env_var");
    expect(first).toHaveProperty("group");
    expect(first).toHaveProperty("description");
  });

  it("includes API key settings", async () => {
    const data = await (await get("/settings")).json();
    const envVars = data.settings.map((s: { env_var: string }) => s.env_var);
    const hasApiKeys = envVars.some(
      (v: string) =>
        v.includes("API_KEY") || v.includes("URL") || v.includes("PATH")
    );
    expect(hasApiKeys).toBe(true);
  });
});

describe("Secrets", () => {
  it("sets and deletes a secret", async () => {
    const key = `TEST_SECRET_${Date.now()}`;

    const setRes = await put(`/settings/secrets/${key}`, {
      value: "super-secret"
    });
    expect([200, 201, 204]).toContain(setRes.status);

    const delRes = await del(`/settings/secrets/${key}`);
    expect([200, 204]).toContain(delRes.status);
  });
});
