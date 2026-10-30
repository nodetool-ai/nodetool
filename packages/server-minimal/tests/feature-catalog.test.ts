import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createMinimalServer } from "../src/index.js";

it("identifies the optional Anthropic feature for stored workflows without its feature configured", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minimal-absent-provider-"));
  const token = "a".repeat(32);
  const app = await createMinimalServer({ directory, masterKey: "fixture-key".repeat(8), tokens: { [token]: "alice" } });
  const headers = { authorization: `Bearer ${token}` };
  const graph = { nodes: [{ id: "text", type: "anthropic.text.ChatComplete", properties: { model: "fixture", prompt: "preserve me" } }], edges: [] };
  try {
    const created = await app.inject({ method: "POST", url: "/api/workflows", headers, payload: { name: "Optional provider", graph } });
    expect(created.statusCode).toBe(200);
    const response = await app.inject({ method: "POST", url: `/api/workflows/${created.json().id}/run`, headers, payload: {} });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: "FEATURE_NOT_INSTALLED",
      validation_issues: [{ nodeType: "anthropic.text.ChatComplete", code: "FEATURE_NOT_INSTALLED", featureIds: ["provider-anthropic"] }]
    });
    const saved = await app.inject({ url: `/api/workflows/${created.json().id}`, headers });
    expect(saved.json().graph).toEqual(graph);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
