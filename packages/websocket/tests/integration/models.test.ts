import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, get, post } from "./setup.js";

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

describe("Model providers", () => {
  it("returns a list of providers with capabilities", async () => {
    const res = await get("/models/providers");
    expect(res.status).toBe(200);
    const providers = await res.json();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);

    const first = providers[0];
    expect(first).toHaveProperty("provider");
    expect(first).toHaveProperty("capabilities");
    expect(Array.isArray(first.capabilities)).toBe(true);
  });

  it("each provider has a name and capabilities array", async () => {
    const providers = await (await get("/models/providers")).json();
    for (const p of providers) {
      expect(p.provider).toBeTypeOf("string");
      expect(Array.isArray(p.capabilities)).toBe(true);
    }
  });
});

describe("Model listing", () => {
  it("returns all models as a deduplicated list", async () => {
    const res = await get("/models/all");
    expect(res.status).toBe(200);
    const models = await res.json();
    expect(Array.isArray(models)).toBe(true);

    // Verify no duplicates by (repo_id, path) key
    const keys = new Set<string>();
    for (const m of models) {
      const key = `${m.repo_id ?? ""}::${m.path ?? ""}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("returns recommended models", async () => {
    const res = await get("/models/recommended");
    expect(res.status).toBe(200);
    const models = await res.json();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });
});

describe("HuggingFace cache status", () => {
  it("reports cache status for non-existent repos", async () => {
    const res = await post("/models/huggingface/cache_status", [
      { key: "test", repo_id: "fake/nonexistent", allow_patterns: "*.bin" },
    ]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([{ key: "test", downloaded: false }]);
  });
});
