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
import { toolForCapabilityName } from "../../src/capabilities/lazy-tool.js";
import { UNGATED, createCapabilityRun } from "../../src/capabilities/index.js";

const ctx = {} as ProcessingContext;

/** The provider map was a constructor argument; it now rides on the run. */
function findModelTool(providers: Record<string, BaseProvider>) {
  return toolForCapabilityName("find_model", (context) =>
    createCapabilityRun({ context, gate: UNGATED, providers })
  );
}

class FakeImageProvider extends BaseProvider {
  constructor(id: ProviderId, private readonly models: ImageModel[]) {
    super(id);
  }
  protected override declaredCapabilities() {
    return ["text_to_image", "image_to_image"] as const;
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
  protected override declaredCapabilities() {
    return ["text_to_speech"] as const;
  }
  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return this.models;
  }
}

describe("find_model — schema and metadata", () => {
  it("has the expected name and description", () => {
    const tool = findModelTool({});
    expect(tool.name).toBe("find_model");
    expect(tool.description).toMatch(/generic AI node/i);
  });

  it("requires a capability parameter", () => {
    const tool = findModelTool({});
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toContain("capability");
  });
});

describe("find_model — empty providers", () => {
  it("returns a friendly note when no providers are configured", async () => {
    const tool = findModelTool({});
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as { total: number; results: unknown[]; note?: string };
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
    expect(result.note).toMatch(/nodetool\.agents\.Agent/i);
  });
});

describe("find_model — capability filtering", () => {
  it("only returns models from providers that support the capability", async () => {
    const imageProvider = new FakeImageProvider("openai", [
      { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    ]);
    const languageOnly = new FakeLanguageProvider("anthropic", [
      { id: "claude-x", name: "Claude X", provider: "anthropic" }
    ]);
    const tool = findModelTool({
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
    const tool = findModelTool({
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

describe("find_model — ranking", () => {
  it("boosts matching provider_hint to position 0", async () => {
    const openai = new FakeImageProvider("openai", [
      { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    ]);
    const fal = new FakeImageProvider("fal_ai", [
      { id: "flux-1", name: "Flux 1", provider: "fal_ai" }
    ]);
    const tool = findModelTool({ openai, fal_ai: fal });

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
    const tool = findModelTool({ openai, ollama: local });

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
    const tool = findModelTool({ openai: provider });

    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      limit: 2
    })) as { total: number; results: unknown[] };

    expect(result.total).toBe(3);
    expect(result.results.length).toBe(2);
  });
});

describe("find_model — provider_hint that cannot be honoured", () => {
  const fal = () =>
    new FakeImageProvider("fal_ai", [
      { id: "flux-1", name: "Flux 1", provider: "fal_ai" }
    ]);

  it("says the hinted provider is not configured instead of answering silently", async () => {
    const tool = findModelTool({ fal_ai: fal() });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      provider_hint: "codex"
    })) as {
      results: Array<{ provider: string }>;
      provider_hint_matched?: boolean;
      note?: string;
    };
    expect(result.results[0].provider).toBe("fal_ai");
    expect(result.provider_hint_matched).toBe(false);
    expect(result.note).toMatch(
      /^provider_hint 'codex' is not configured here \(configured: fal_ai\)/
    );
  });

  it("says when the hinted provider does not offer the capability", async () => {
    const anthropic = new FakeLanguageProvider("anthropic", [
      { id: "claude", name: "Claude", provider: "anthropic" }
    ]);
    const tool = findModelTool({ fal_ai: fal(), anthropic });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      provider_hint: "anthropic"
    })) as { provider_hint_matched?: boolean; note?: string };
    expect(result.provider_hint_matched).toBe(false);
    expect(result.note).toMatch(/'anthropic' does not offer text_to_image/);
  });

  it("reads `provider` as the hint", async () => {
    const openai = new FakeImageProvider("openai", [
      { id: "gpt-image-1", name: "GPT Image 1", provider: "openai" }
    ]);
    const tool = findModelTool({ openai, fal_ai: fal() });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      provider: "fal_ai"
    })) as { results: Array<{ provider: string }>; provider_hint_matched?: boolean };
    expect(result.results[0].provider).toBe("fal_ai");
    expect(result.provider_hint_matched).toBe(true);
  });

  it("omits provider_hint_matched when no hint was given", async () => {
    const tool = findModelTool({ fal_ai: fal() });
    const result = (await tool.process(ctx, {
      capability: "text_to_image"
    })) as Record<string, unknown>;
    expect(result).not.toHaveProperty("provider_hint_matched");
  });
});

describe("find_model — invalid input", () => {
  it("rejects an argument it does not read", async () => {
    const tool = findModelTool({
      fal_ai: new FakeImageProvider("fal_ai", [
        { id: "flux-1", name: "Flux 1", provider: "fal_ai" }
      ])
    });
    const result = (await tool.process(ctx, {
      capability: "text_to_image",
      vendor: "codex"
    })) as { error?: string; total: number };
    expect(result.total).toBe(0);
    expect(result.error).toMatch(/find_model has no argument 'vendor'/);
  });

  it("rejects unknown capabilities", async () => {
    const tool = findModelTool({});
    const result = (await tool.process(ctx, {
      capability: "make_pizza"
    })) as { error?: string; total: number };
    expect(result.error).toBeTruthy();
    expect(result.total).toBe(0);
  });
});
