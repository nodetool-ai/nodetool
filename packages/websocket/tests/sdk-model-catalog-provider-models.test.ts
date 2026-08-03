import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedModel } from "@nodetool-ai/protocol";

const getAllModels = vi.fn<(userId: string) => Promise<UnifiedModel[]>>();
const getAvailableProviderIds = vi.fn<(userId: string) => Promise<string[]>>();
const collectProviderCatalogModels =
  vi.fn<(userId: string) => Promise<UnifiedModel[]>>();

vi.mock("../src/trpc/routers/models.js", () => ({
  getAllModels: (userId: string) => getAllModels(userId),
  getAvailableProviderIds: (userId: string) => getAvailableProviderIds(userId),
  collectProviderCatalogModels: (userId: string) =>
    collectProviderCatalogModels(userId)
}));

vi.mock("@nodetool-ai/huggingface", () => ({
  getExistingDownloadManager: () => null
}));

import {
  clearProviderCatalogCache,
  getSdkV1ModelCatalog
} from "../src/sdk/sdk-model-catalog-service.js";

const query = { scope: "local" as const, limit: 200 };

const languageModel: UnifiedModel = {
  id: "gpt-test",
  name: "GPT Test",
  type: "language_model",
  provider: "openai"
};

const falImageModel: UnifiedModel = {
  id: "fal-ai/flux/schnell",
  name: "FLUX.1 Schnell",
  type: "image_model",
  provider: "fal_ai"
};

const openaiImageModel: UnifiedModel = {
  id: "gpt-image-2",
  name: "GPT Image 2",
  type: "image_model",
  provider: "openai"
};

beforeEach(() => {
  clearProviderCatalogCache();
  getAllModels.mockReset().mockResolvedValue([languageModel]);
  getAvailableProviderIds
    .mockReset()
    .mockResolvedValue(["openai", "fal_ai"]);
  collectProviderCatalogModels
    .mockReset()
    .mockResolvedValue([falImageModel, openaiImageModel]);
});

describe("SDK model catalog provider models", () => {
  it("includes provider-enumerated non-language models as ready_remote", async () => {
    const catalog = await getSdkV1ModelCatalog({ userId: "alice", query });

    const flux = catalog.entries.find(
      (entry) => entry.id === "fal-ai/flux/schnell"
    );
    expect(flux).toMatchObject({
      compatibility: "image_model",
      availability: "ready_remote",
      provider: "fal_ai"
    });
  });

  it("dedupes provider-enumerated models against the recommended list", async () => {
    const catalog = await getSdkV1ModelCatalog({ userId: "alice", query });

    // gpt-image-2 exists both in RECOMMENDED_MODELS and in the provider
    // enumeration; the catalog must carry it once per (type, provider, id).
    const gptImage = catalog.entries.filter(
      (entry) => entry.id === "gpt-image-2" && entry.provider === "openai"
    );
    expect(gptImage).toHaveLength(1);
  });

  it("caches the provider enumeration per user", async () => {
    await getSdkV1ModelCatalog({ userId: "alice", query });
    await getSdkV1ModelCatalog({ userId: "alice", query });
    expect(collectProviderCatalogModels).toHaveBeenCalledTimes(1);

    await getSdkV1ModelCatalog({ userId: "bob", query });
    expect(collectProviderCatalogModels).toHaveBeenCalledTimes(2);
    expect(collectProviderCatalogModels).toHaveBeenLastCalledWith("bob");
  });

  it("prefers an injected provider-catalog fetcher over the cache", async () => {
    const injected = vi.fn().mockResolvedValue([falImageModel]);
    await getSdkV1ModelCatalog({
      userId: "alice",
      query,
      getProviderCatalogModels: injected
    });
    expect(injected).toHaveBeenCalledWith("alice");
    expect(collectProviderCatalogModels).not.toHaveBeenCalled();
  });

  it("never enumerates providers for worker-scoped catalogs", async () => {
    const catalog = await getSdkV1ModelCatalog({
      userId: "alice",
      query: { scope: "worker" as const, limit: 200 },
      getWorkerModels: async () => [languageModel]
    });
    expect(collectProviderCatalogModels).not.toHaveBeenCalled();
    expect(getAllModels).not.toHaveBeenCalled();
    expect(catalog.scope).toBe("worker");
  });
});
