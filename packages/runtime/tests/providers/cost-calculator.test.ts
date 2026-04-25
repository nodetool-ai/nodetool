import { describe, it, expect, vi } from "vitest";
import {
  CostType,
  CostCalculator,
  PRICING_TIERS,
  MODEL_TO_TIER,
  calculateChatCost,
  calculateEmbeddingCost,
  calculateSpeechCost,
  calculateWhisperCost,
  calculateImageCost
} from "../../src/providers/cost-calculator.js";

describe("CostType enum", () => {
  it("has all expected values", () => {
    expect(CostType.TOKEN_BASED).toBe("token_based");
    expect(CostType.EMBEDDING).toBe("embedding");
    expect(CostType.CHARACTER_BASED).toBe("character_based");
    expect(CostType.DURATION_BASED).toBe("duration_based");
    expect(CostType.IMAGE_BASED).toBe("image_based");
    expect(CostType.VIDEO_BASED).toBe("video_based");
  });
});


describe("CostCalculator.getTier", () => {
  it("returns tier for direct model lookup", () => {
    expect(CostCalculator.getTier("gpt-4o", "openai")).toBe("topTierChat");
    expect(CostCalculator.getTier("gpt-4o-mini", "openai")).toBe("lowTierChat");
  });

  it("is case-insensitive", () => {
    expect(CostCalculator.getTier("GPT-4O", "OpenAI")).toBe("topTierChat");
  });

  it("returns null for unknown model", () => {
    expect(CostCalculator.getTier("unknown-model", "openai")).toBeNull();
  });

  it("returns null for unknown provider", () => {
    expect(CostCalculator.getTier("gpt-4o", "unknown-provider")).toBeNull();
  });

  it("supports prefix matching", () => {
    // "gpt-4o-2024-11-20" is a direct entry but "gpt-4o-2024-11-20-something" would prefix-match
    // Let's use a model that would match via prefix
    expect(CostCalculator.getTier("gpt-4o-2024-11-20", "openai")).toBe(
      "topTierChat"
    );
  });

  it("returns anthropic tiers", () => {
    expect(
      CostCalculator.getTier("claude-3-5-sonnet-20241022", "anthropic")
    ).toBe("claude35Sonnet");
    expect(CostCalculator.getTier("claude-3-haiku-20240307", "anthropic")).toBe(
      "claude3Haiku"
    );
  });
});

describe("CostCalculator.calculate", () => {
  it("returns 0 for unknown model with a warning", () => {
    const warnSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const cost = CostCalculator.calculate(
      "unknown-model",
      { inputTokens: 1000 },
      "openai"
    );
    expect(cost).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("calculates token-based cost", () => {
    const cost = CostCalculator.calculate(
      "gpt-4o",
      { inputTokens: 1000, outputTokens: 500 },
      "openai"
    );
    const tier = PRICING_TIERS.topTierChat;
    const expected =
      (1000 / 1000) * tier.inputPer1kTokens! +
      (500 / 1000) * tier.outputPer1kTokens!;
    expect(cost).toBeCloseTo(expected);
  });

  it("calculates token-based cost with cached tokens", () => {
    // gpt-4.1 has cachedPer1kTokens
    const cost = CostCalculator.calculate(
      "gpt-4.1",
      { inputTokens: 1000, outputTokens: 500, cachedTokens: 300 },
      "openai"
    );
    const tier = PRICING_TIERS.gpt41Tier;
    const nonCached = Math.max(0, 1000 - 300);
    const expected =
      (nonCached / 1000) * tier.inputPer1kTokens! +
      (300 / 1000) * tier.cachedPer1kTokens! +
      (500 / 1000) * tier.outputPer1kTokens!;
    expect(cost).toBeCloseTo(expected);
  });

  it("ignores cached tokens when tier has no cachedPer1kTokens", () => {
    // topTierChat (gpt-4o) has no cachedPer1kTokens
    const cost = CostCalculator.calculate(
      "gpt-4o",
      { inputTokens: 1000, outputTokens: 500, cachedTokens: 300 },
      "openai"
    );
    const tier = PRICING_TIERS.topTierChat;
    // cachedPer1kTokens is undefined so it goes to else branch
    const expected =
      (1000 / 1000) * tier.inputPer1kTokens! +
      (500 / 1000) * tier.outputPer1kTokens!;
    expect(cost).toBeCloseTo(expected);
  });

  it("calculates embedding cost", () => {
    const cost = CostCalculator.calculate(
      "text-embedding-3-small",
      { inputTokens: 2000 },
      "openai"
    );
    const tier = PRICING_TIERS.embeddingSmall;
    const expected = (2000 / 1000) * tier.inputPer1kTokens!;
    expect(cost).toBeCloseTo(expected);
  });

  it("calculates character-based cost (TTS)", () => {
    const cost = CostCalculator.calculate(
      "gpt-4o-mini-tts",
      { inputCharacters: 5000 },
      "openai"
    );
    const tier = PRICING_TIERS.ttsStandard;
    const expected = (5000 / 1000) * tier.per1kChars!;
    expect(cost).toBeCloseTo(expected);
  });

  it("calculates duration-based cost (Whisper)", () => {
    const cost = CostCalculator.calculate(
      "whisper-1",
      { durationSeconds: 120 },
      "openai"
    );
    const tier = PRICING_TIERS.whisperStandard;
    const expected = (120 / 60) * tier.perMinute!;
    expect(cost).toBeCloseTo(expected);
  });

  it("calculates image-based cost", () => {
    // gpt-image-1.5 is token-based, but we can test via calculateImageCost for gpt-image-1
    // Let's test directly with a forced image tier
    const tier = PRICING_TIERS.imageGptMedium;
    expect(tier.costType).toBe(CostType.IMAGE_BASED);
    // We'll test via calculateImageCost below
  });

  it("handles empty usage info", () => {
    const cost = CostCalculator.calculate("gpt-4o", {}, "openai");
    expect(cost).toBe(0);
  });

  it("handles video-based cost type", () => {
    // No current model maps to video-based, but we can test the logic
    // by verifying the formula path exists
    // We test indirectly: _calculateForTier is private, but we can
    // create a scenario that reaches it if we had a video tier
    // For now, verify the cost type enum exists
    expect(CostType.VIDEO_BASED).toBe("video_based");
  });

  it("warns and returns 0 for undefined tier name", () => {
    const warnSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // Temporarily add a bad mapping to test the "tier not defined" path
    const original = MODEL_TO_TIER["openai:__test_model__"];
    MODEL_TO_TIER["openai:__test_model__"] = "nonexistent_tier";
    const cost = CostCalculator.calculate(
      "__test_model__",
      { inputTokens: 100 },
      "openai"
    );
    expect(cost).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not defined")
    );
    // Cleanup
    if (original === undefined) {
      delete MODEL_TO_TIER["openai:__test_model__"];
    } else {
      MODEL_TO_TIER["openai:__test_model__"] = original;
    }
    warnSpy.mockRestore();
  });
});

describe("calculateChatCost", () => {
  it("calculates cost with default provider", () => {
    const cost = calculateChatCost("gpt-4o-mini", 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it("calculates cost with cached tokens", () => {
    const cost = calculateChatCost("gpt-4.1", 1000, 500, 200, "openai");
    expect(cost).toBeGreaterThan(0);
  });

  it("calculates cost for anthropic provider", () => {
    const cost = calculateChatCost(
      "claude-3-5-sonnet-20241022",
      1000,
      500,
      0,
      "anthropic"
    );
    expect(cost).toBeGreaterThan(0);
  });
});

describe("calculateEmbeddingCost", () => {
  it("calculates embedding cost", () => {
    const cost = calculateEmbeddingCost("text-embedding-3-small", 1000);
    expect(cost).toBeGreaterThan(0);
  });

  it("calculates embedding cost with explicit provider", () => {
    const cost = calculateEmbeddingCost(
      "text-embedding-3-large",
      500,
      "openai"
    );
    expect(cost).toBeGreaterThan(0);
  });
});

describe("calculateSpeechCost", () => {
  it("calculates TTS cost", () => {
    const cost = calculateSpeechCost("tts-1", 1000);
    expect(cost).toBeGreaterThan(0);
  });

  it("calculates TTS HD cost", () => {
    const cost = calculateSpeechCost("tts-1-hd", 1000, "openai");
    expect(cost).toBeGreaterThan(0);
  });
});

describe("calculateWhisperCost", () => {
  it("calculates whisper cost", () => {
    const cost = calculateWhisperCost("whisper-1", 60);
    expect(cost).toBeGreaterThan(0);
  });

  it("calculates low-cost whisper", () => {
    const cost = calculateWhisperCost("gpt-4o-mini-transcribe", 120, "openai");
    expect(cost).toBeGreaterThan(0);
  });
});

describe("calculateImageCost", () => {
  it("calculates gpt-image-1 cost with quality override (low)", () => {
    const cost = calculateImageCost("gpt-image-1", 1, "low");
    expect(cost).toBeCloseTo(PRICING_TIERS.imageGptLow.perImage!);
  });

  it("calculates gpt-image-1 cost with quality override (medium)", () => {
    const cost = calculateImageCost("gpt-image-1", 2, "medium");
    expect(cost).toBeCloseTo(PRICING_TIERS.imageGptMedium.perImage! * 2);
  });

  it("calculates gpt-image-1 cost with quality override (high)", () => {
    const cost = calculateImageCost("gpt-image-1", 1, "high");
    expect(cost).toBeCloseTo(PRICING_TIERS.imageGptHigh.perImage!);
  });

  it("defaults to medium quality for unknown quality", () => {
    const cost = calculateImageCost("gpt-image-1", 1, "ultra");
    expect(cost).toBeCloseTo(PRICING_TIERS.imageGptMedium.perImage!);
  });

  it("does not apply quality override for gpt-image-1.5", () => {
    // gpt-image-1.5 is token-based, not affected by quality override logic
    const cost = calculateImageCost("gpt-image-1.5", 1, "low", "openai");
    // This goes through normal calculate path (token-based), so imageCount doesn't matter for token cost
    // It will be 0 since no tokens are provided
    expect(cost).toBe(0);
  });

  it("uses default provider and count", () => {
    const cost = calculateImageCost("gpt-image-1");
    expect(cost).toBeCloseTo(PRICING_TIERS.imageGptMedium.perImage!);
  });

  it("returns 0 for unknown image model", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cost = calculateImageCost(
      "unknown-image-model",
      1,
      "medium",
      "openai"
    );
    expect(cost).toBe(0);
    warnSpy.mockRestore();
  });
});

describe("CostCalculator – getTier prefix match", () => {
  it("matches model by prefix when no exact match exists", () => {
    // "gpt-4o-2024-05-13" is not an exact key but starts with "gpt-4o"
    const tier = CostCalculator.getTier("gpt-4o-2024-05-13", "openai");
    expect(tier).toBe("topTierChat");
  });
});

describe("CostCalculator – VIDEO_BASED cost type", () => {
  it("calculates video-based cost using videoSeconds", () => {
    // We need to test the VIDEO_BASED branch.
    // Since there's no predefined VIDEO_BASED tier mapped to a model,
    // we can test _calculateForTier indirectly by adding a temporary mapping.
    // Instead, test the calculate method with a custom tier via PRICING_TIERS.
    const tierName = "__test_video__";
    (PRICING_TIERS as any)[tierName] = {
      costType: CostType.VIDEO_BASED,
      perSecondVideo: 0.05
    };
    (MODEL_TO_TIER as any)["test:video-model"] = tierName;

    try {
      const cost = CostCalculator.calculate(
        "video-model",
        { videoSeconds: 10 },
        "test"
      );
      expect(cost).toBeCloseTo(0.5);
    } finally {
      delete (PRICING_TIERS as any)[tierName];
      delete (MODEL_TO_TIER as any)["test:video-model"];
    }
  });
});

describe("CostCalculator – fallback return 0 for unknown cost type", () => {
  it("returns 0 for an unknown cost type", () => {
    const tierName = "__test_unknown_type__";
    (PRICING_TIERS as any)[tierName] = {
      costType: "unknown_type" as any
    };
    (MODEL_TO_TIER as any)["test:unknown-model"] = tierName;

    try {
      const cost = CostCalculator.calculate(
        "unknown-model",
        { inputTokens: 100 },
        "test"
      );
      expect(cost).toBe(0);
    } finally {
      delete (PRICING_TIERS as any)[tierName];
      delete (MODEL_TO_TIER as any)["test:unknown-model"];
    }
  });
});
