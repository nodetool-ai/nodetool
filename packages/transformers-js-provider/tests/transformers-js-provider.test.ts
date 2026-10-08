import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadTransformers: vi.fn(),
  discoverLanguageModels: vi.fn(async () => [{ id: "m" }])
}));

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  loadTransformers: mocks.loadTransformers
}));
vi.mock("../src/model-discovery.js", () => ({
  discoverASRModels: vi.fn(async () => [{ id: "asr" }]),
  discoverEmbeddingModels: vi.fn(async () => [{ id: "emb" }]),
  discoverImageModels: vi.fn(async () => [{ id: "img" }]),
  discoverLanguageModels: mocks.discoverLanguageModels,
  discoverRerankModels: vi.fn(async () => [{ id: "rr" }]),
  discoverTTSModels: vi.fn(async () => [{ id: "tts" }])
}));

import { TransformersJsProvider } from "../src/transformers-js-provider.js";

describe("TransformersJsProvider availability", () => {
  it("lists no models and reports why when the runtime is missing", async () => {
    mocks.loadTransformers.mockRejectedValue(
      new Error("The '@huggingface/transformers' package is required")
    );
    const provider = new TransformersJsProvider();
    expect(await provider.unavailableReason()).toMatch(/is required/);
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    expect(await provider.getAvailableASRModels()).toEqual([]);
    expect(await provider.getAvailableTTSModels()).toEqual([]);
    expect(mocks.discoverLanguageModels).not.toHaveBeenCalled();
  });

  it("lists models when the runtime loads", async () => {
    mocks.loadTransformers.mockResolvedValue({});
    const provider = new TransformersJsProvider();
    expect(await provider.unavailableReason()).toBeNull();
    expect(await provider.getAvailableLanguageModels()).toEqual([{ id: "m" }]);
  });
});
