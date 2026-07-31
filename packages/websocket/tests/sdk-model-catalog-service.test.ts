import { describe, expect, it } from "vitest";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import { projectSdkModelCatalog } from "../src/sdk/sdk-model-catalog-service.js";

const query = {
  scope: "local" as const,
  limit: 200
};

const fixtures: UnifiedModel[] = [
  {
    id: "gpt-test",
    name: "GPT Test",
    type: "language_model",
    provider: "openai",
    supported_tasks: ["text_generation"]
  },
  {
    id: "image-test",
    name: "Image Test",
    type: "image_model",
    provider: "replicate",
    path: "owner/image-test"
  },
  {
    id: "qwen/test.gguf",
    repo_id: "qwen/test.gguf",
    name: "Qwen GGUF",
    type: "llama_model",
    downloaded: true
  },
  {
    id: "black-forest/flux:schnell.safetensors",
    repo_id: "black-forest/flux",
    path: "schnell.safetensors",
    name: "Flux Schnell",
    type: "hf.text_to_image",
    downloaded: false
  },
  {
    id: "Xenova/tiny-model",
    repo_id: "Xenova/tiny-model",
    name: "Tiny Transformers.js Model",
    type: "tjs.text_generation",
    downloaded: true
  },
  {
    id: "org/unclassified",
    repo_id: "org/unclassified",
    name: "Unclassified Cache Entry",
    type: null,
    cache_path: "C:/cache/org--unclassified"
  }
];

describe("SDK model catalog projection", () => {
  it("captures representative wire values without changing their model family", () => {
    const catalog = projectSdkModelCatalog(fixtures, query, {
      configuredProviderIds: new Set(["openai"]),
      recommendedModels: [fixtures[3]]
    });

    expect(catalog.entries).toHaveLength(6);
    expect(catalog.entries.find((entry) => entry.id === "gpt-test")).toMatchObject({
      availability: "ready_remote",
      compatibility: "language_model",
      wire_value: {
        type: "language_model",
        id: "gpt-test",
        name: "GPT Test",
        provider: "openai",
        supported_tasks: ["text_generation"]
      }
    });
    expect(catalog.entries.find((entry) => entry.id === "image-test")?.wire_value)
      .toEqual({
        type: "image_model",
        id: "image-test",
        name: "Image Test",
        provider: "replicate",
        path: "owner/image-test"
      });
    expect(catalog.entries.find((entry) => entry.compatibility === "llama_model"))
      .toMatchObject({
        availability: "ready_local",
        wire_value: { type: "llama_model", repo_id: "qwen/test.gguf" }
      });
    expect(catalog.entries.find((entry) => entry.compatibility === "hf.text_to_image"))
      .toMatchObject({
        availability: "downloadable",
        recommended: true,
        wire_value: {
          type: "hf.text_to_image",
          repo_id: "black-forest/flux",
          path: "schnell.safetensors"
        }
      });
    expect(catalog.entries.find((entry) => entry.compatibility === "tjs.text_generation"))
      .toMatchObject({
        availability: "ready_local",
        wire_value: {
          type: "tjs.text_generation",
          repo_id: "Xenova/tiny-model",
          path: null
        }
      });
    expect(catalog.entries.find((entry) => entry.compatibility === "unknown"))
      .toMatchObject({ availability: "ready_local" });
  });

  it("filters and paginates by stable entry keys", () => {
    const first = projectSdkModelCatalog(
      fixtures,
      { ...query, compatibility: "language_model", limit: 1 },
      { configuredProviderIds: new Set(["openai"]) }
    );
    expect(first.entries).toHaveLength(1);
    expect(first.next_cursor).toBeNull();

    const ready = projectSdkModelCatalog(
      fixtures,
      { ...query, availability: "ready_local", limit: 1 },
      { configuredProviderIds: new Set(["openai"]) }
    );
    expect(ready.entries).toHaveLength(1);
    expect(ready.next_cursor).not.toBeNull();

    const next = projectSdkModelCatalog(
      fixtures,
      { ...query, availability: "ready_local", cursor: ready.next_cursor!, limit: 1 },
      { configuredProviderIds: new Set(["openai"]) }
    );
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]?.key).not.toBe(ready.entries[0]?.key);
    expect(next.catalog_revision).toBe(ready.catalog_revision);
  });
});
