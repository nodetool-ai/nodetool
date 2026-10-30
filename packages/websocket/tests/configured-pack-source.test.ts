import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import * as catalog from "@nodetool-ai/node-catalog";
import { createCatalogPackSource } from "../src/pack-source.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("administrator-configured installed packs", () => {
  it("rejects duplicate selections and missing prerequisites before registration", async () => {
    const duplicate = new NodeRegistry();
    await expect(createCatalogPackSource({ configuredPackIds: ["text", "text"] }).register(duplicate, {})).rejects.toThrow("configured more than once");
    expect(duplicate.list()).toEqual([]);
    const prerequisite = new NodeRegistry();
    await expect(createCatalogPackSource({ configuredPackIds: ["code"] }).register(prerequisite, {})).rejects.toThrow("Required feature");
    expect(prerequisite.list()).toEqual([]);
  });

  it("loads only configured packs and preserves missing-node catalog metadata", async () => {
    const registry = new NodeRegistry();
    const source = createCatalogPackSource({ configuredPackIds: ["text"] });
    await source.register(registry, {});
    expect(registry.list().length).toBeGreaterThan(0);
    expect(registry.list().every((type) => registry.getNodePackageId(type) === "text")).toBe(true);
    expect(source.configuredFeatures?.().map((feature) => feature.id)).toEqual(["text"]);
    await expect(source.setEnabled(registry, "fal", true)).rejects.toThrow("administrator configuration");
  });

  it("preserves the cause when a configured installed module is broken", async () => {
    const failure = new Error("fixture dependency initialization failed");
    vi.spyOn(catalog, "importPack").mockRejectedValueOnce(failure);
    await expect(createCatalogPackSource({ configuredPackIds: ["text"] }).register(new NodeRegistry(), {})).rejects.toMatchObject({ cause: failure });
  });
});
