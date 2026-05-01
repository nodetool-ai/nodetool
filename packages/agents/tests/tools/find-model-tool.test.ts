/**
 * Tests for FindModelTool — capability-aware model lookup.
 */

import { describe, it, expect } from "vitest";
import { BaseProvider } from "@nodetool-ai/runtime";
import type {
  ImageModel,
  LanguageModel,
  ProcessingContext,
  ProviderId,
  TTSModel
} from "@nodetool-ai/runtime";
import { FindModelTool } from "../../src/tools/find-model-tool.js";

const ctx = {} as ProcessingContext;

class FakeImageProvider extends BaseProvider {
  constructor(id: ProviderId, private readonly models: ImageModel[]) {
    super(id);
  }
  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return this.models;
  }
}

class FakeLanguageProvider extends BaseProvider {
  constructor(id: ProviderId, private readonly models: LanguageModel[]) {
    super(id);
  }
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.models;
  }
}

class FakeTTSProvider extends BaseProvider {
  constructor(id: ProviderId, private readonly models: TTSModel[]) {
    super(id);
  }
  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this.models;
  }
}

describe("FindModelTool — schema and metadata", () => {
  it("has the expected name and description", () => {
    const tool = new FindModelTool({});
    expect(tool.name).toBe("find_model");
    expect(tool.description).toMatch(/generic AI node/i);
  });

  it("requires a capability parameter", () => {
    const tool = new FindModelTool({});
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain("capability");
  });
});

describe("FindModelTool — empty providers", () => {
  it("returns a friendly note when no providers are configured", async () => {
    const tool = new FindModelTool({});
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { total: number; results: unknown[]; note?: string };
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
    expect(result.note).toMatch(/AgentStep/i);
  });
});

describe("FindModelTool — capability filtering", () => {
  it("only returns models from providers that support the capability", async () => {
    const imageProvider = new FakeImageProvider("openai", [
      { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    ]);
    const languageOnly = new FakeLanguageProvider("anthropic", [
      { id: "claude-x", name: "Claude X", provider: "anthropic" }
    ]);
    const tool = new FindModelTool({
      openai: imageProvider,
      anthropic: languageOnly
    });

    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { results: Array<{ provider: string; model_id: string }> };

    expect(result.results.map((r) => r.provider)).toEqual(["openai"]);
    expect(result.results[0].model_id).toBe("gpt-image-1");
  });

  it("returns multiple TTS providers ranked by recommended/score", async () => {
    const openaiTts = new FakeTTSProvider("openai", [
      { id: "tts-1", name: "TTS 1", provider: "openai" }
    ]);
    const otherTts = new FakeTTSProvider("elevenlabs", [
      { id: "eleven-x", name: "Eleven X", provider: "elevenlabs" }
    ]);
    const tool = new FindModelTool({
      openai: openaiTts,
      elevenlabs: otherTts
    });

    const result = (await tool.process(ctx, {
      capability: "text_to_speech"
    })) as { total: number; results: Array<{ provider: string }> };

    expect(result.total).toBe(2);
    expect(result.results.map((r) => r.provider).sort()).toEqual([
      "elevenlabs",
      "openai"
    ]);
  });
});

describe("FindModelTool — ranking", () => {
  it("boosts matching provider_hint to position 0", async () => {
    const openai = new FakeImageProvider("openai", [
      { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    ]);
    const fal = new FakeImageProvider("fal_ai", [
      { id: "flux-1", name: "Flux 1", provider: "fal_ai" }
    ]);
    const tool = new FindModelTool({ openai, fal_ai: fal });

    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      provider_hint: "fal_ai"
    })) as { results: Array<{ provider: string }> };

    expect(result.results[0].provider).toBe("fal_ai");
  });

  it("prefer_local boosts local providers", async () => {
    const openai = new FakeImageProvider("openai", [
      { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    ]);
    const local = new FakeImageProvider("ollama", [
      { id: "sd-local", name: "SD Local", provider: "ollama" }
    ]);
    const tool = new FindModelTool({ openai, ollama: local });

    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      prefer_local: true
    })) as { results: Array<{ provider: string }> };

    expect(result.results[0].provider).toBe("ollama");
  });

  it("limits results to the requested count", async () => {
    const provider = new FakeImageProvider("openai", [
      { id: "a", name: "A", provider: "openai" },
      { id: "b", name: "B", provider: "openai" },
      { id: "c", name: "C", provider: "openai" }
    ]);
    const tool = new FindModelTool({ openai: provider });

    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      limit: 2
    })) as { total: number; results: unknown[] };

    expect(result.total).toBe(3);
    expect(result.results.length).toBe(2);
  });
});

describe("FindModelTool — invalid input", () => {
  it("rejects unknown capabilities", async () => {
    const tool = new FindModelTool({});
    const result = (await tool.process(ctx, {
      capability: "make_pizza"
    })) as { error?: string; total: number };
    expect(result.error).toBeTruthy();
    expect(result.total).toBe(0);
  });
});
