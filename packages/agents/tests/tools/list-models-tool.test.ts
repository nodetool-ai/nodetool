/**
 * Tests for ListModelsTool — in-process model listing across configured providers.
 */

import { describe, it, expect } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  ImageModel,
  LanguageModel,
  ProcessingContext,
  ProviderId
} from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../../src/capabilities/lazy-tool.js";
import { UNGATED, createCapabilityRun } from "../../src/capabilities/index.js";

const ctx = {} as ProcessingContext;

/** The provider map was a constructor argument; it now rides on the run. */
function listModelsTool(providers: Record<string, BaseProvider>) {
  return toolForCapabilityName("list_models", (context) =>
    createCapabilityRun({ context, gate: UNGATED, providers })
  );
}

interface Listed {
  provider: string;
  model_id: string;
  name: string;
  type: string;
  downloaded: boolean;
}

interface Result {
  total: number;
  truncated?: boolean;
  results: Listed[];
  note?: string;
  error?: string;
}

class FakeLanguageProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: LanguageModel[]
  ) {
    super(id);
  }
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.models;
  }
}

class FakeImageProvider extends BaseProvider {
  constructor(
    id: ProviderId,
    private readonly models: ImageModel[]
  ) {
    super(id);
  }
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.models;
  }
}

/** Reaches out on every call and fails — a provider with no key configured. */
class UnreachableProvider extends BaseProvider {
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    throw new Error("401 unauthorized");
  }
}

const lang = (id: string, name: string, provider: string): LanguageModel =>
  ({ type: "language_model", id, name, provider }) as LanguageModel;

const img = (id: string, name: string, provider: string): ImageModel =>
  ({ type: "image_model", id, name, provider }) as ImageModel;

const openai = () =>
  new FakeLanguageProvider("openai" as ProviderId, [
    lang("gpt-5-mini", "GPT-5 Mini", "openai"),
    lang("gpt-5.4", "GPT-5.4", "openai")
  ]);

const ollama = () =>
  new FakeLanguageProvider("ollama" as ProviderId, [
    lang("qwen3:8b", "Qwen3 8B", "ollama")
  ]);

const falAi = () =>
  new FakeImageProvider("fal_ai" as ProviderId, [
    img("fal-ai/flux/schnell", "Flux Schnell", "fal_ai")
  ]);

describe("ListModelsTool — schema and metadata", () => {
  it("has the expected name", () => {
    expect(listModelsTool({}).name).toBe("list_models");
  });

  it("requires no parameters", () => {
    const schema = listModelsTool({}).inputSchema as Record<
      string,
      unknown
    >;
    expect(schema.required).toEqual([]);
  });

  it("userMessage names the provider and type", () => {
    const tool = listModelsTool({});
    expect(tool.userMessage({ provider: "anthropic" })).toContain("anthropic");
    expect(tool.userMessage({})).toContain("all");
    expect(tool.userMessage({ model_type: "image" })).toContain("image");
  });
});

describe("ListModelsTool — listing", () => {
  it("lists models from every configured provider", async () => {
    const tool = listModelsTool({ openai: openai(), fal_ai: falAi() });
    const result = (await tool.process(ctx, {})) as Result;
    expect(result.total).toBe(3);
    expect(result.results.map((m) => m.model_id)).toEqual([
      "fal-ai/flux/schnell",
      "gpt-5-mini",
      "gpt-5.4"
    ]);
  });

  it("tags each model with its provider and type", async () => {
    const tool = listModelsTool({ fal_ai: falAi() });
    const result = (await tool.process(ctx, {})) as Result;
    expect(result.results[0]).toMatchObject({
      provider: "fal_ai",
      model_id: "fal-ai/flux/schnell",
      name: "Flux Schnell",
      type: "image",
      downloaded: false
    });
  });

  it("filters by provider", async () => {
    const tool = listModelsTool({ openai: openai(), ollama: ollama() });
    const result = (await tool.process(ctx, { provider: "ollama" })) as Result;
    expect(result.results.map((m) => m.provider)).toEqual(["ollama"]);
  });

  it("treats provider 'all' as no filter", async () => {
    const tool = listModelsTool({ openai: openai(), ollama: ollama() });
    const result = (await tool.process(ctx, { provider: "all" })) as Result;
    expect(result.total).toBe(3);
  });

  it("filters by model type", async () => {
    const tool = listModelsTool({ openai: openai(), fal_ai: falAi() });
    const result = (await tool.process(ctx, { model_type: "image" })) as Result;
    expect(result.results.map((m) => m.type)).toEqual(["image"]);
  });

  it("accepts model_type aliases an agent is likely to guess", async () => {
    const tool = listModelsTool({ openai: openai(), fal_ai: falAi() });
    const result = (await tool.process(ctx, { model_type: "LLM" })) as Result;
    expect(result.results.every((m) => m.type === "language")).toBe(true);
    expect(result.total).toBe(2);
  });

  it("rejects an unknown model type instead of returning everything", async () => {
    const tool = listModelsTool({ openai: openai() });
    const result = (await tool.process(ctx, {
      model_type: "hologram"
    })) as Result;
    expect(result.total).toBe(0);
    expect(result.error).toMatch(/model_type must be one of/);
  });

  it("marks local providers as downloaded and honours downloaded_only", async () => {
    const tool = listModelsTool({ openai: openai(), ollama: ollama() });
    const result = (await tool.process(ctx, {
      downloaded_only: true
    })) as Result;
    expect(result.results.map((m) => m.provider)).toEqual(["ollama"]);
    expect(result.results[0]?.downloaded).toBe(true);
  });

  it("applies limit and reports truncation", async () => {
    const tool = listModelsTool({ openai: openai(), ollama: ollama() });
    const result = (await tool.process(ctx, { limit: 2 })) as Result;
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

describe("ListModelsTool — degraded providers", () => {
  it("returns a note when no providers are configured", async () => {
    const tool = listModelsTool({});
    const result = (await tool.process(ctx, {})) as Result;
    expect(result.total).toBe(0);
    expect(result.note).toMatch(/No providers are configured/i);
  });

  it("names the configured providers when the filter matches none", async () => {
    const tool = listModelsTool({ openai: openai() });
    const result = (await tool.process(ctx, { provider: "gemini" })) as Result;
    expect(result.total).toBe(0);
    expect(result.note).toContain("gemini");
    expect(result.note).toContain("openai");
  });

  it("drops an unreachable provider instead of failing the call", async () => {
    const tool = listModelsTool({
      openai: openai(),
      broken: new UnreachableProvider("broken" as ProviderId)
    });
    const result = (await tool.process(ctx, {})) as Result;
    expect(result.total).toBe(2);
    expect(result.results.every((m) => m.provider === "openai")).toBe(true);
  });
});
