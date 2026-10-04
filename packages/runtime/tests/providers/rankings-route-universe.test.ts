/**
 * The model-rankings sync ranks only what NodeTool's providers list, so the
 * route universe it reads (`scripts/rankings/routes.mjs`) must really come from
 * the runtime providers. This pins that against the real provider classes — no
 * network, no key — and pins what happens when a provider lists nothing.
 */
import { describe, it, expect } from "vitest";
import * as runtime from "../../src/index.js";
import {
  RANKED_PROVIDERS,
  loadProviderRoutes,
  routesOfProvider
} from "../../../../scripts/rankings/routes.mjs";

describe("loadProviderRoutes", () => {
  it("lists routes for every ranked provider from the real runtime providers", async () => {
    const { routes, providers } = await loadProviderRoutes({ runtime });
    // Spelled out, not read from RANKED_PROVIDERS: dropping a provider from
    // that list would otherwise shrink the expectation with it.
    expect(Object.keys(providers).sort()).toEqual([
      "atlascloud",
      "elevenlabs",
      "fal_ai",
      "gemini",
      "kie",
      "minimax",
      "openai",
      "replicate",
      "together"
    ]);
    for (const [provider, count] of Object.entries(providers)) {
      expect(count, provider).toBeGreaterThan(0);
    }
    expect(routes.length).toBe(
      Object.values(providers as Record<string, number>).reduce((a, b) => a + b, 0)
    );
  });

  it("lists each route once, keyed <provider>:<model_id>", async () => {
    const { routes } = await loadProviderRoutes({ runtime });
    const keys = routes.map(
      (r: { provider: string; modelId: string }) => `${r.provider}:${r.modelId}`
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("openai:gpt-image-2");
  });

  it("carries the tasks a provider declares for a model", async () => {
    const { routes } = await loadProviderRoutes({ runtime });
    const tts = routes.find(
      (r: { provider: string; modelId: string }) =>
        r.provider === "openai" && r.modelId === "tts-1"
    );
    expect(tts.tasks).toEqual(["text_to_speech"]);
  });

  it("restores fetch and never calls it", async () => {
    const before = globalThis.fetch;
    await loadProviderRoutes({ runtime });
    expect(globalThis.fetch).toBe(before);
  });

  it("refuses a provider that lists nothing", async () => {
    class Empty {
      async getAvailableImageModels() {
        return [];
      }
    }
    const fake = Object.fromEntries(
      Object.values(RANKED_PROVIDERS).map((name) => [name, Empty])
    );
    await expect(loadProviderRoutes({ runtime: fake })).rejects.toThrow(
      /listed no models/
    );
  });

  it("refuses a runtime that lacks a provider class", async () => {
    await expect(loadProviderRoutes({ runtime: {} })).rejects.toThrow(
      /does not export AtlasCloudProvider/
    );
  });

  it("restores fetch when a provider fails", async () => {
    const before = globalThis.fetch;
    await expect(loadProviderRoutes({ runtime: {} })).rejects.toThrow();
    expect(globalThis.fetch).toBe(before);
  });
});

describe("routesOfProvider", () => {
  const provider = {
    async getAvailableImageModels() {
      return [
        { id: "m/edit", name: "Edit", supportedTasks: ["image_to_image"] },
        { id: "m/both", name: "Both" }
      ];
    },
    async getAvailableVideoModels() {
      return [{ id: "m/both", name: "Both", supportedTasks: ["text_to_video"] }];
    },
    async getAvailableTTSModels() {
      return [{ id: "m/voice", name: "Voice" }];
    }
  };

  it("takes a model's declared tasks, else the task its list implies", async () => {
    const routes = await routesOfProvider("p", provider);
    const byId = Object.fromEntries(routes.map((r: { modelId: string }) => [r.modelId, r]));
    expect(byId["m/edit"].tasks).toEqual(["image_to_image"]);
    expect(byId["m/voice"].tasks).toEqual(["text_to_speech"]);
  });

  it("leaves a route unrestricted when any list declares nothing for it", async () => {
    // `m/both` is listed by an image list that names no task, so a filter
    // built from the video list alone would wrongly exclude its image rank.
    const routes = await routesOfProvider("p", provider);
    expect(routes.find((r: { modelId: string }) => r.modelId === "m/both").tasks).toEqual([]);
  });

  it("skips a model with no id", async () => {
    const routes = await routesOfProvider("p", {
      async getAvailableImageModels() {
        return [{ name: "No id" }, { id: "ok" }];
      }
    });
    expect(routes.map((r: { modelId: string }) => r.modelId)).toEqual(["ok"]);
  });
});
