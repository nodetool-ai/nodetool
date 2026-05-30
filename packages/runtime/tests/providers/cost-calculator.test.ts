import { describe, it, expect } from "vitest";
import {
  CostType,
  CostCalculator,
  PRICING_TIERS,
  MODEL_TO_TIER,
  calculateChatCost,
  calculateEmbeddingCost,
  calculateSpeechCost,
  calculateWhisperCost,
  calculateImageCost,
  calculateModel3DCost
} from "../../src/providers/cost-calculator.js";

describe("CostType enum", () => {
  it("has all expected values", () => {
    expect(CostType.TOKEN_BASED).toBe("token_based");
    expect(CostType.EMBEDDING).toBe("embedding");
    expect(CostType.CHARACTER_BASED).toBe("character_based");
    expect(CostType.DURATION_BASED).toBe("duration_based");
    expect(CostType.IMAGE_BASED).toBe("image_based");
    expect(CostType.VIDEO_BASED).toBe("video_based");
    expect(CostType.TASK_BASED).toBe("task_based");
  });
});

describe("CostCalculator.getTier", () => {
  it("returns null for token models (priced via genai-prices)", () => {
    expect(CostCalculator.getTier("gpt-4o", "openai")).toBeNull();
    expect(
      CostCalculator.getTier("claude-3-5-sonnet-20241022", "anthropic")
    ).toBeNull();
  });

  it("returns local tiers for non-token modalities", () => {
    expect(CostCalculator.getTier("whisper-1", "openai")).toBe(
      "whisperStandard"
    );
    expect(CostCalculator.getTier("tts-1", "openai")).toBe("ttsHd");
    expect(CostCalculator.getTier("meshy-4", "meshy")).toBe(
      "meshy4TextTexturedTier"
    );
  });

  it("is case-insensitive", () => {
    expect(CostCalculator.getTier("WHISPER-1", "OpenAI")).toBe(
      "whisperStandard"
    );
  });

  it("returns null for unknown model", () => {
    expect(CostCalculator.getTier("unknown-model", "openai")).toBeNull();
  });
});

describe("CostCalculator.calculate – token pricing via genai-prices (USD)", () => {
  it("prices a known chat model in real dollars", () => {
    // gpt-4o-mini: $0.15/M input, $0.60/M output → 1M+1M ≈ $0.75
    const cost = CostCalculator.calculate(
      "gpt-4o-mini",
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      "openai"
    );
    expect(cost).toBeGreaterThan(0.5);
    expect(cost).toBeLessThan(1.0);
  });

  it("charges cached input tokens at a discount", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    const full = CostCalculator.calculate("gpt-4o-mini", usage, "openai");
    const cached = CostCalculator.calculate(
      "gpt-4o-mini",
      { ...usage, cachedTokens: 1_000_000 },
      "openai"
    );
    expect(cached).toBeLessThan(full);
    expect(cached).toBeGreaterThan(0);
  });

  it("prices anthropic models", () => {
    const cost = CostCalculator.calculate(
      "claude-3-5-sonnet-20241022",
      { inputTokens: 1000, outputTokens: 500 },
      "anthropic"
    );
    expect(cost).toBeGreaterThan(0);
  });

  it("prices embeddings", () => {
    const cost = CostCalculator.calculate(
      "text-embedding-3-small",
      { inputTokens: 1_000_000 },
      "openai"
    );
    expect(cost).toBeGreaterThan(0);
  });

  it("returns 0 for local providers (ollama)", () => {
    const cost = CostCalculator.calculate(
      "llama3.2",
      { inputTokens: 1000, outputTokens: 500 },
      "ollama"
    );
    expect(cost).toBe(0);
  });

  it("returns 0 for an unknown model", () => {
    const cost = CostCalculator.calculate(
      "totally-made-up-model-xyz",
      { inputTokens: 1000, outputTokens: 500 },
      "openai"
    );
    expect(cost).toBe(0);
  });

  it("returns 0 for empty usage on a known model", () => {
    expect(CostCalculator.calculate("gpt-4o-mini", {}, "openai")).toBe(0);
  });
});

describe("CostCalculator.calculate – local non-token modalities (USD)", () => {
  it("calculates duration-based cost (Whisper)", () => {
    const cost = CostCalculator.calculate(
      "whisper-1",
      { durationSeconds: 120 },
      "openai"
    );
    expect(cost).toBeCloseTo((120 / 60) * PRICING_TIERS.whisperStandard.perMinute!);
    expect(cost).toBeCloseTo(0.012);
  });

  it("calculates character-based cost (TTS)", () => {
    const cost = CostCalculator.calculate(
      "gpt-4o-mini-tts",
      { inputCharacters: 5000 },
      "openai"
    );
    expect(cost).toBeCloseTo((5000 / 1000) * PRICING_TIERS.ttsStandard.per1kChars!);
  });

  it("calculates task-based cost (3D)", () => {
    const cost = calculateModel3DCost("meshy-4", "meshy");
    expect(cost).toBeCloseTo(PRICING_TIERS.meshy4TextTexturedTier.perTask!);
  });

  it("calculates video-based cost via a custom tier", () => {
    const tierName = "__test_video__";
    (PRICING_TIERS as Record<string, unknown>)[tierName] = {
      costType: CostType.VIDEO_BASED,
      perSecondVideo: 0.05
    };
    (MODEL_TO_TIER as Record<string, string>)["test:video-model"] = tierName;
    try {
      const cost = CostCalculator.calculate(
        "video-model",
        { videoSeconds: 10 },
        "test" as never
      );
      expect(cost).toBeCloseTo(0.5);
    } finally {
      delete (PRICING_TIERS as Record<string, unknown>)[tierName];
      delete (MODEL_TO_TIER as Record<string, string>)["test:video-model"];
    }
  });
});

describe("convenience functions", () => {
  it("calculateChatCost returns USD", () => {
    expect(calculateChatCost("gpt-4o-mini", 1000, 500)).toBeGreaterThan(0);
  });

  it("calculateEmbeddingCost returns USD", () => {
    expect(
      calculateEmbeddingCost("text-embedding-3-small", 100_000)
    ).toBeGreaterThan(0);
  });

  it("calculateSpeechCost returns USD", () => {
    expect(calculateSpeechCost("tts-1", 1000)).toBeCloseTo(
      (1000 / 1000) * PRICING_TIERS.ttsHd.per1kChars!
    );
  });

  it("calculateWhisperCost returns USD", () => {
    expect(calculateWhisperCost("whisper-1", 60)).toBeCloseTo(
      PRICING_TIERS.whisperStandard.perMinute!
    );
  });
});

describe("calculateImageCost (gpt-image-1, per-image USD)", () => {
  it("low quality", () => {
    expect(calculateImageCost("gpt-image-1", 1, "low")).toBeCloseTo(
      PRICING_TIERS.imageGptLow.perImage!
    );
  });

  it("medium quality, multiple images", () => {
    expect(calculateImageCost("gpt-image-1", 2, "medium")).toBeCloseTo(
      PRICING_TIERS.imageGptMedium.perImage! * 2
    );
  });

  it("high quality", () => {
    expect(calculateImageCost("gpt-image-1", 1, "high")).toBeCloseTo(
      PRICING_TIERS.imageGptHigh.perImage!
    );
  });

  it("defaults to medium for unknown quality", () => {
    expect(calculateImageCost("gpt-image-1", 1, "ultra")).toBeCloseTo(
      PRICING_TIERS.imageGptMedium.perImage!
    );
  });
});
