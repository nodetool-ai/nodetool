/**
 * Centralized cost calculation for all AI providers — in real US dollars.
 *
 * Token and embedding pricing comes from `@pydantic/genai-prices` (the bundled,
 * community-maintained price catalog), so chat/LLM costs track each provider's
 * published per-token rates exactly, including prompt-cache discounts and
 * tiered (context-length) pricing. No markup is applied.
 *
 * A small local table covers the modalities genai-prices does not price per
 * token — image generation (per image), speech-to-text (per minute),
 * text-to-speech (per 1k characters) and 3D generation (per task). Those values
 * are the providers' list prices in USD.
 *
 * Usage:
 *    import { CostCalculator, UsageInfo } from "./cost-calculator.js";
 *    const cost = CostCalculator.calculate("gpt-4o-mini", { inputTokens: 1000, outputTokens: 500 }, "openai");
 */

import { calcPrice, type Usage } from "@pydantic/genai-prices";
import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS, type ProviderId } from "@nodetool-ai/protocol";

// Stryker disable next-line StringLiteral: logger name is diagnostic text, not a behavioural contract.
const log = createLogger("nodetool.runtime.cost");

export enum CostType {
  TOKEN_BASED = "token_based",
  EMBEDDING = "embedding",
  CHARACTER_BASED = "character_based",
  DURATION_BASED = "duration_based",
  IMAGE_BASED = "image_based",
  VIDEO_BASED = "video_based",
  /** Flat per-task cost, e.g. 3D generation APIs billed per submitted job. */
  TASK_BASED = "task_based"
}

export interface PricingTier {
  costType: CostType;
  /** USD per 1000 characters (CostType.CHARACTER_BASED). */
  per1kChars?: number;
  /** USD per minute of audio (CostType.DURATION_BASED). */
  perMinute?: number;
  /** USD per generated image (CostType.IMAGE_BASED). */
  perImage?: number;
  /** USD per second of video (CostType.VIDEO_BASED). */
  perSecondVideo?: number;
  /** USD per submitted task (CostType.TASK_BASED). */
  perTask?: number;
}

/**
 * Local pricing for non-token modalities, in USD (provider list prices).
 * Token/embedding models are intentionally absent — those are priced via
 * `@pydantic/genai-prices`.
 */
export const PRICING_TIERS: Record<string, PricingTier> = {
  // OpenAI gpt-image-1 — per generated 1024² image, by quality.
  imageGptLow: { costType: CostType.IMAGE_BASED, perImage: 0.011 },
  imageGptMedium: { costType: CostType.IMAGE_BASED, perImage: 0.042 },
  imageGptHigh: { costType: CostType.IMAGE_BASED, perImage: 0.167 },
  // Whisper / Speech-to-Text — per minute.
  whisperStandard: { costType: CostType.DURATION_BASED, perMinute: 0.006 },
  whisperLowCost: { costType: CostType.DURATION_BASED, perMinute: 0.003 },
  // TTS / Text-to-Speech — per 1000 characters.
  // tts-1 = $15/1M chars ($0.015/1k); tts-1-hd = $30/1M chars ($0.03/1k).
  ttsHd: { costType: CostType.CHARACTER_BASED, per1kChars: 0.015 },
  ttsUltraHd: { costType: CostType.CHARACTER_BASED, per1kChars: 0.03 },
  // gpt-4o-mini-tts is natively token-based (text in + audio out); OpenAI's
  // own estimate is ~$0.015/min of audio. Approximated here per-1k-chars
  // (~1 min ≈ 900–1000 chars) since the TTS call meters characters, not tokens.
  ttsGpt4oMini: { costType: CostType.CHARACTER_BASED, per1kChars: 0.015 },

  // --- 3D generation (TASK_BASED) — USD per task ---
  // Pricing sources (verify on each pricing change):
  //   Meshy:  https://www.meshy.ai/pricing
  //   Rodin:  https://hyperhuman.deemos.com/rodin
  // "Preview" = shape-only (fast); "Textured" = preview + refine (PBR textures).
  meshy4TextPreviewTier: { costType: CostType.TASK_BASED, perTask: 0.42 },
  meshy4TextTexturedTier: { costType: CostType.TASK_BASED, perTask: 1.47 },
  meshy4ImageTier: { costType: CostType.TASK_BASED, perTask: 0.42 },
  meshy3TurboTextPreviewTier: { costType: CostType.TASK_BASED, perTask: 0.21 },
  meshy3TurboTextTexturedTier: { costType: CostType.TASK_BASED, perTask: 0.74 },
  meshy3TurboImageTier: { costType: CostType.TASK_BASED, perTask: 0.21 },
  rodinGen1Tier: { costType: CostType.TASK_BASED, perTask: 0.8 },
  rodinGen1TurboTier: { costType: CostType.TASK_BASED, perTask: 0.5 },
  rodinSketchTier: { costType: CostType.TASK_BASED, perTask: 0.3 }
};

/**
 * Model ID to tier mapping for the local (non-token) pricing table.
 * Keys are "provider:modelId". Token/embedding models are priced via
 * genai-prices and are deliberately not listed here.
 */
export const MODEL_TO_TIER: Record<string, string> = {
  // Whisper / Speech-to-Text
  "openai:whisper-1": "whisperStandard",
  "openai:gpt-4o-transcribe": "whisperStandard",
  "openai:gpt-4o-mini-transcribe": "whisperLowCost",
  // TTS / Text-to-Speech
  "openai:gpt-4o-mini-tts": "ttsGpt4oMini",
  "openai:tts-1": "ttsHd",
  "openai:tts-1-hd": "ttsUltraHd",
  // Meshy 3D generation — text tier is textured (preview + refine); image is single-step
  "meshy:meshy-4": "meshy4TextTexturedTier",
  "meshy:meshy-4-preview": "meshy4TextPreviewTier",
  "meshy:meshy-4-image": "meshy4ImageTier",
  "meshy:meshy-3-turbo": "meshy3TurboTextTexturedTier",
  "meshy:meshy-3-turbo-preview": "meshy3TurboTextPreviewTier",
  "meshy:meshy-3-turbo-image": "meshy3TurboImageTier",
  // Rodin 3D generation
  "rodin:rodin-gen-1": "rodinGen1Tier",
  "rodin:rodin-gen-1-turbo": "rodinGen1TurboTier",
  "rodin:rodin-sketch": "rodinSketchTier"
};

export interface UsageInfo {
  /**
   * Total prompt/input tokens, **inclusive** of `cachedTokens` and
   * `cacheWriteTokens`. This matches the `@pydantic/genai-prices` contract,
   * which derives the full-price text input as
   * `inputTokens - cachedTokens - cacheWriteTokens`. Providers whose API
   * reports the uncached portion separately (e.g. Anthropic) must add the
   * cache read/write counts back in before populating this field.
   */
  inputTokens?: number;
  outputTokens?: number;
  /** Cache-read (hit) tokens — a subset of {@link inputTokens}, priced at a discount. */
  cachedTokens?: number;
  /** Cache-write (creation) tokens — a subset of {@link inputTokens}, priced at a premium. */
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  inputCharacters?: number;
  durationSeconds?: number;
  imageCount?: number;
  videoSeconds?: number;
  /** Number of tasks submitted (for CostType.TASK_BASED providers). */
  taskCount?: number;
}

/**
 * NodeTool provider id → genai-prices provider id. Providers absent here fall
 * back to genai-prices' model-name matching (`providerId` omitted).
 */
// The remapped id only selects which entry of the external @pydantic/genai-prices
// catalog is hit. Asserting an individual remapping would couple a unit test to
// that volatile price table, so these string mutants are equivalent for our
// purposes — the cost math itself is pinned by the calculate() tests.
// Stryker disable all
const GENAI_PROVIDER_MAP: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  claude_agent_sdk: "anthropic",
  "claude-agent-sdk": "anthropic",
  gemini: "google",
  google: "google",
  mistral: "mistral",
  groq: "groq",
  deepseek: "deepseek",
  xai: "x-ai",
  grok: "x-ai"
};
// Stryker restore all

/** Providers that run locally and incur no API cost. */
const LOCAL_FREE_PROVIDERS = new Set([
  "ollama",
  "local",
  "lmstudio",
  "llama_cpp",
  "llamacpp",
  "llama-cpp"
]);

/**
 * Token/embedding cost in USD via genai-prices. Returns `null` when no price is
 * known (so the caller can fall back or report zero), and `0` for local models.
 */
function calcTokenPriceUsd(
  modelId: string,
  usage: UsageInfo,
  provider: ProviderId
): number | null {
  const providerLower = provider.toLowerCase();
  if (LOCAL_FREE_PROVIDERS.has(providerLower)) return 0;

  const gpUsage: Usage = {
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0
  };
  // genai-prices prices a 0/undefined cache count identically to an absent one,
  // so these guards only avoid passing redundant fields — toggling them is
  // behaviour-preserving. The discount/premium themselves are pinned by the
  // cache-read and cache-write tests, so we suppress the equivalent mutants.
  // Stryker disable all
  if (usage.cachedTokens && usage.cachedTokens > 0) {
    gpUsage.cache_read_tokens = usage.cachedTokens;
  }
  if (usage.cacheWriteTokens && usage.cacheWriteTokens > 0) {
    gpUsage.cache_write_tokens = usage.cacheWriteTokens;
  }
  // Stryker restore all

  const providerId = GENAI_PROVIDER_MAP[providerLower];
  const result = calcPrice(
    gpUsage,
    modelId,
    providerId ? { providerId } : undefined
  );
  return result ? result.total_price : null;
}

export class CostCalculator {
  /**
   * Get the local (non-token) pricing tier for a model, scoped by provider.
   * Token/embedding models are priced via genai-prices and return `null` here.
   */
  static getTier(modelId: string, provider: ProviderId): string | null {
    const modelLower = modelId.toLowerCase();
    const providerLower = provider.toLowerCase();

    // Fast path. The longest-prefix scan below returns the identical tier for an
    // exact id (a key is always a prefix of itself, and ties to the longest
    // candidate), so mutating this block away is a perf change, not a behaviour
    // change — hence equivalent mutants we suppress rather than chase.
    // Stryker disable all
    const providerKey = `${providerLower}:${modelLower}`;
    if (providerKey in MODEL_TO_TIER) {
      return MODEL_TO_TIER[providerKey];
    }
    // Stryker restore all

    // Longest-prefix match within the same provider.
    const providerPrefix = `${providerLower}:`;
    // All filtered keys share the same-length providerPrefix, so sorting by raw
    // key length is identical to sorting by model-part length (longest first).
    const providerKeys = Object.keys(MODEL_TO_TIER)
      .filter((key) => key.startsWith(providerPrefix))
      .sort((a, b) => b.length - a.length);
    for (const key of providerKeys) {
      const modelPart = key.substring(providerPrefix.length);
      if (modelLower.startsWith(modelPart)) {
        return MODEL_TO_TIER[key];
      }
    }

    return null;
  }

  /**
   * Calculate the cost of an API call in USD.
   *
   * @param modelId - The model identifier
   * @param usage - Usage information from the API response
   * @param provider - Provider name for pricing lookup
   * @returns Cost in US dollars (0 when no price is known)
   */
  static calculate(
    modelId: string,
    usage: UsageInfo,
    provider: ProviderId
  ): number {
    // Non-token modalities (image / audio duration / characters / 3D task).
    const tierName = CostCalculator.getTier(modelId, provider);
    // Stryker disable next-line ConditionalExpression: forcing this true is equivalent — PRICING_TIERS[null] is undefined, so it falls through to token pricing with only a redundant warn.
    if (tierName !== null) {
      const tier = PRICING_TIERS[tierName];
      if (tier !== undefined) {
        return CostCalculator._calculateForTier(tier, usage);
      }
      // Stryker disable next-line StringLiteral: warning text is for humans, not asserted.
      log.warn(`Pricing tier '${tierName}' not defined`);
    }

    // Token / embedding pricing via @pydantic/genai-prices (real USD).
    const tokenCost = calcTokenPriceUsd(modelId, usage, provider);
    if (tokenCost !== null) return tokenCost;

    // Stryker disable next-line StringLiteral: warning text is for humans, not asserted.
    log.warn(`No price found for model: ${modelId} (provider: ${provider})`);
    return 0.0;
  }

  /** Cost for a local non-token modality tier, in USD. */
  private static _calculateForTier(
    tier: PricingTier,
    usage: UsageInfo
  ): number {
    const inputCharacters = usage.inputCharacters ?? 0;
    const durationSeconds = usage.durationSeconds ?? 0;
    const imageCount = usage.imageCount ?? 0;
    const videoSeconds = usage.videoSeconds ?? 0;

    switch (tier.costType) {
      case CostType.CHARACTER_BASED:
        return (inputCharacters / 1000) * (tier.per1kChars ?? 0);
      case CostType.DURATION_BASED:
        return (durationSeconds / 60.0) * (tier.perMinute ?? 0);
      case CostType.IMAGE_BASED:
        return imageCount * (tier.perImage ?? 0);
      case CostType.VIDEO_BASED:
        return videoSeconds * (tier.perSecondVideo ?? 0);
      case CostType.TASK_BASED:
        return (usage.taskCount ?? 1) * (tier.perTask ?? 0);
      default:
        return 0.0;
    }
  }
}

// Convenience functions

/** Calculate chat completion cost in USD. */
export function calculateChatCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  provider: ProviderId = PROVIDER_IDS.OPENAI
): number {
  const usage: UsageInfo = { inputTokens, outputTokens, cachedTokens };
  return CostCalculator.calculate(modelId, usage, provider);
}

/** Calculate embedding cost in USD. */
export function calculateEmbeddingCost(
  modelId: string,
  inputTokens: number,
  provider: ProviderId = PROVIDER_IDS.OPENAI
): number {
  const usage: UsageInfo = { inputTokens };
  return CostCalculator.calculate(modelId, usage, provider);
}

/** Calculate TTS cost in USD. */
export function calculateSpeechCost(
  modelId: string,
  inputChars: number,
  provider: ProviderId = PROVIDER_IDS.OPENAI
): number {
  const usage: UsageInfo = { inputCharacters: inputChars };
  return CostCalculator.calculate(modelId, usage, provider);
}

/** Calculate ASR/Whisper cost in USD. */
export function calculateWhisperCost(
  modelId: string,
  durationSeconds: number,
  provider: ProviderId = PROVIDER_IDS.OPENAI
): number {
  const usage: UsageInfo = { durationSeconds };
  return CostCalculator.calculate(modelId, usage, provider);
}

/**
 * Calculate 3D model generation cost in USD.
 * Pass `taskCount` > 1 only if multiple tasks were submitted (rare).
 */
export function calculateModel3DCost(
  modelId: string,
  provider: ProviderId,
  taskCount: number = 1
): number {
  const usage: UsageInfo = { taskCount };
  return CostCalculator.calculate(modelId, usage, provider);
}

/** Calculate image generation cost in USD. */
export function calculateImageCost(
  modelId: string,
  imageCount: number = 1,
  // Stryker disable next-line StringLiteral: default "medium" and "" both resolve to imageGptMedium via the ?? fallback below.
  quality: string = "medium",
  provider: ProviderId = PROVIDER_IDS.OPENAI
): number {
  // gpt-image-1 is priced per image by quality.
  if (modelId.toLowerCase().includes("gpt-image") && !modelId.includes("1.5")) {
    const qualityMap: Record<string, string> = {
      low: "imageGptLow",
      medium: "imageGptMedium",
      high: "imageGptHigh"
    };
    const tierOverride = qualityMap[quality.toLowerCase()] ?? "imageGptMedium";
    const tier = PRICING_TIERS[tierOverride];
    // Stryker disable next-line ConditionalExpression: tierOverride is always a valid PRICING_TIERS key (low/medium/high or the medium fallback), so tier is always defined here.
    if (tier) {
      return CostCalculator["_calculateForTier"](tier, { imageCount });
    }
  }

  const usage: UsageInfo = { imageCount };
  return CostCalculator.calculate(modelId, usage, provider);
}
