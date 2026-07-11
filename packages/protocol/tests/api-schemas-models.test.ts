import { describe, it, expect } from "vitest";
import {
  unifiedModel,
  providerInfo,
  recommendedInput,
  hfCacheCheckInput,
  hfCacheCheckOutput,
  hfFastCacheStatusItem,
  tryCacheFilesItem,
  hfByTypeInput,
  providerInput,
  hfDeleteInput,
  ollamaModel,
  pullOllamaModelInput,
  pullOllamaModelOutput
} from "../src/api-schemas/models.js";

describe("models.unifiedModel", () => {
  it("accepts a minimal model with only id and name", () => {
    const result = unifiedModel.safeParse({ id: "m1", name: "Model One" });
    expect(result.success).toBe(true);
  });

  it("rejects a model missing the required name", () => {
    const result = unifiedModel.safeParse({ id: "m1" });
    expect(result.success).toBe(false);
  });

  it("rejects a model missing the required id", () => {
    const result = unifiedModel.safeParse({ name: "Model One" });
    expect(result.success).toBe(false);
  });

  it("accepts nullish optional fields (null and omitted)", () => {
    const result = unifiedModel.safeParse({
      id: "m1",
      name: "Model One",
      provider: null,
      downloads: null,
      tags: null
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields on parse", () => {
    const parsed = unifiedModel.parse({
      id: "m1",
      name: "Model One",
      extraneous: "gone"
    });
    expect(parsed).not.toHaveProperty("extraneous");
  });

  it("rejects wrong types for numeric fields", () => {
    const result = unifiedModel.safeParse({
      id: "m1",
      name: "Model One",
      downloads: "lots"
    });
    expect(result.success).toBe(false);
  });
});

describe("models.providerInfo", () => {
  it("accepts provider with capabilities array", () => {
    const result = providerInfo.safeParse({
      provider: "openai",
      capabilities: ["chat", "embed"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects when capabilities is not an array", () => {
    const result = providerInfo.safeParse({
      provider: "openai",
      capabilities: "chat"
    });
    expect(result.success).toBe(false);
  });
});

describe("models.recommendedInput", () => {
  it("defaults check_servers to false when omitted", () => {
    const parsed = recommendedInput.parse({});
    expect(parsed.check_servers).toBe(false);
  });

  it("honors an explicit check_servers value", () => {
    const parsed = recommendedInput.parse({ check_servers: true });
    expect(parsed.check_servers).toBe(true);
  });
});

describe("models.hfCacheCheckInput", () => {
  it("rejects an empty repo_id", () => {
    const result = hfCacheCheckInput.safeParse({ repo_id: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a string or array allow_pattern", () => {
    expect(
      hfCacheCheckInput.safeParse({ repo_id: "r", allow_pattern: "*.bin" })
        .success
    ).toBe(true);
    expect(
      hfCacheCheckInput.safeParse({ repo_id: "r", allow_pattern: ["*.bin"] })
        .success
    ).toBe(true);
  });

  it("accepts null patterns", () => {
    const result = hfCacheCheckInput.safeParse({
      repo_id: "r",
      allow_pattern: null,
      ignore_pattern: null
    });
    expect(result.success).toBe(true);
  });
});

describe("models.hfCacheCheckOutput", () => {
  it("requires all fields present", () => {
    const result = hfCacheCheckOutput.safeParse({
      repo_id: "r",
      all_present: true,
      total_files: 3,
      missing: []
    });
    expect(result.success).toBe(true);
  });

  it("rejects when missing is not string array", () => {
    const result = hfCacheCheckOutput.safeParse({
      repo_id: "r",
      all_present: true,
      total_files: 3,
      missing: [1, 2]
    });
    expect(result.success).toBe(false);
  });
});

describe("models.hfFastCacheStatusItem", () => {
  it("accepts item with optional nullable fields", () => {
    const result = hfFastCacheStatusItem.safeParse({
      key: "k",
      repo_id: "r",
      model_type: null,
      path: null
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing key", () => {
    const result = hfFastCacheStatusItem.safeParse({ repo_id: "r" });
    expect(result.success).toBe(false);
  });
});

describe("models.tryCacheFilesItem", () => {
  it("accepts an empty object (all optional)", () => {
    expect(tryCacheFilesItem.safeParse({}).success).toBe(true);
  });
});

describe("models.hfByTypeInput / providerInput / hfDeleteInput", () => {
  it("rejects empty model_type", () => {
    expect(hfByTypeInput.safeParse({ model_type: "" }).success).toBe(false);
  });
  it("rejects empty provider", () => {
    expect(providerInput.safeParse({ provider: "" }).success).toBe(false);
  });
  it("rejects empty repo_id for delete", () => {
    expect(hfDeleteInput.safeParse({ repo_id: "" }).success).toBe(false);
  });
});

describe("models.ollamaModel", () => {
  it("accepts a full ollama model record", () => {
    const result = ollamaModel.safeParse({
      type: "llm",
      name: "llama",
      repo_id: "r",
      modified_at: "2020",
      size: 100,
      digest: "abc",
      details: { family: "llama" }
    });
    expect(result.success).toBe(true);
  });

  it("rejects when size is a string", () => {
    const result = ollamaModel.safeParse({
      type: "llm",
      name: "llama",
      repo_id: "r",
      modified_at: "2020",
      size: "100",
      digest: "abc",
      details: {}
    });
    expect(result.success).toBe(false);
  });
});

describe("models.pullOllamaModel", () => {
  it("rejects empty model name", () => {
    expect(pullOllamaModelInput.safeParse({ model: "" }).success).toBe(false);
  });
  it("requires status and message on output", () => {
    expect(
      pullOllamaModelOutput.safeParse({ status: "ok", message: "done" }).success
    ).toBe(true);
    expect(pullOllamaModelOutput.safeParse({ status: "ok" }).success).toBe(
      false
    );
  });
});
