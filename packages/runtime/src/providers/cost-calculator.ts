/**
 * Centralized cost calculation for all AI providers.
 *
 * This module provides a unified interface for calculating API costs in credits.
 * 1 credit = $0.01 USD (i.e., 1000 credits = $10 USD)
 * All rates include a 50% premium over provider base costs.
 *
 * Usage:
 *    import { CostCalculator, UsageInfo } from "./cost-calculator.js";
 *
 *    // Calculate cost for a chat completion
 *    const usage: UsageInfo = { inputTokens: 1000, outputTokens: 500 };
 *    const cost = CostCalculator.calculate("gpt-4o-mini", usage, "openai");
 *
 *    // Or use convenience helper functions
 *    const cost2 = calculateChatCost("gpt-4o-mini", 1000, 500);
 */

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
  inputPer1kTokens?: number;
  outputPer1kTokens?: number;
  cachedPer1kTokens?: number;
  per1kChars?: number;
  perMinute?: number;
  perImage?: number;
  perSecondVideo?: number;
  /** Cost per submitted task (CostType.TASK_BASED). In nodetool credits (1 credit = $0.01). */
  perTask?: number;
}

/**
 * Pricing tiers by tier name - derived from Python cost_calculator.py PRICING_TIERS.
 */
export const PRICING_TIERS: Record<string, PricingTier> = {
  // GPT-5 Series (newest flagship models)
  gpt5Tier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.002625,
    outputPer1kTokens: 0.021,
    cachedPer1kTokens: 0.0002625
  },
  gpt5ProTier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0315,
    outputPer1kTokens: 0.252
  },
  gpt5MiniTier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.000375,
    outputPer1kTokens: 0.003,
    cachedPer1kTokens: 0.0000375
  },
  // GPT-4.1 family
  gpt41Tier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0045,
    outputPer1kTokens: 0.018,
    cachedPer1kTokens: 0.001125
  },
  gpt41MiniTier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0012,
    outputPer1kTokens: 0.0048,
    cachedPer1kTokens: 0.0003
  },
  gpt41NanoTier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0003,
    outputPer1kTokens: 0.0012,
    cachedPer1kTokens: 0.000075
  },
  // O4-mini (reasoning)
  o4MiniTier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.006,
    outputPer1kTokens: 0.024,
    cachedPer1kTokens: 0.0015
  },
  // O1 Series (existing reasoning models)
  o1Tier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 2.25,
    outputPer1kTokens: 9.0
  },
  o1MiniTier: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.45,
    outputPer1kTokens: 1.8
  },
  // GPT-4o Series
  topTierChat: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.375,
    outputPer1kTokens: 1.5
  },
  lowTierChat: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0225,
    outputPer1kTokens: 0.09
  },
  // GPT-4 Turbo
  gpt4Turbo: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 1.5,
    outputPer1kTokens: 6.0
  },
  // Image generation - gpt-image-1
  imageGptLow: {
    costType: CostType.IMAGE_BASED,
    perImage: 1.5
  },
  imageGptMedium: {
    costType: CostType.IMAGE_BASED,
    perImage: 6.0
  },
  imageGptHigh: {
    costType: CostType.IMAGE_BASED,
    perImage: 25.0
  },
  // Image generation GPT-image-1.5
  imageGpt15: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0075,
    outputPer1kTokens: 0.015
  },
  // Whisper / Speech-to-Text
  whisperStandard: {
    costType: CostType.DURATION_BASED,
    perMinute: 0.9
  },
  whisperLowCost: {
    costType: CostType.DURATION_BASED,
    perMinute: 0.45
  },
  // TTS / Text-to-Speech
  ttsStandard: {
    costType: CostType.CHARACTER_BASED,
    per1kChars: 0.09
  },
  ttsHd: {
    costType: CostType.CHARACTER_BASED,
    per1kChars: 2.25
  },
  ttsUltraHd: {
    costType: CostType.CHARACTER_BASED,
    per1kChars: 4.5
  },
  // Embeddings
  embeddingSmall: {
    costType: CostType.EMBEDDING,
    inputPer1kTokens: 0.003
  },
  embeddingLarge: {
    costType: CostType.EMBEDDING,
    inputPer1kTokens: 0.0195
  },
  // Anthropic Claude 4 family (2025)
  claudeOpus4: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.045,
    outputPer1kTokens: 0.15
  },
  claudeSonnet4: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0075,
    outputPer1kTokens: 0.0375
  },
  claudeHaiku4: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.00225,
    outputPer1kTokens: 0.0075
  },
  // Claude 3.7 family
  claude37Sonnet: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.009,
    outputPer1kTokens: 0.027
  },
  // Claude 3.5 family
  claude35Sonnet: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0075,
    outputPer1kTokens: 0.0225
  },
  claude35Haiku: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0015,
    outputPer1kTokens: 0.006
  },
  // Claude 3 Opus
  claude3Opus: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.045,
    outputPer1kTokens: 0.15
  },
  // Claude 3 Sonnet
  claude3Sonnet: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.0075,
    outputPer1kTokens: 0.0225
  },
  // Claude 3 Haiku
  claude3Haiku: {
    costType: CostType.TOKEN_BASED,
    inputPer1kTokens: 0.000375,
    outputPer1kTokens: 0.0015
  },

  // --- 3D generation (TASK_BASED) ---
  // Pricing sources:
  //   Meshy:  https://www.meshy.ai/pricing  (verify on each pricing change)
  //   Rodin:  https://hyperhuman.deemos.com/rodin  (verify on each pricing change)
  // All values are in nodetool credits (1 credit = $0.01 USD), including 50% premium.
  // "Preview" = shape-only (fast); "Textured" = preview + refine (PBR textures embedded).
  //
  // TODO: verify exact per-task costs against the live pricing pages above.
  meshy4TextPreviewTier: { costType: CostType.TASK_BASED, perTask: 63 },   // ~$0.42/task
  meshy4TextTexturedTier: { costType: CostType.TASK_BASED, perTask: 221 }, // ~$0.42 preview + ~$1.05 refine = $1.47/task
  meshy4ImageTier: { costType: CostType.TASK_BASED, perTask: 63 },         // ~$0.42/task
  meshy3TurboTextPreviewTier: { costType: CostType.TASK_BASED, perTask: 32 },   // ~$0.21/task
  meshy3TurboTextTexturedTier: { costType: CostType.TASK_BASED, perTask: 111 }, // ~$0.21 + ~$0.53 = $0.74/task
  meshy3TurboImageTier: { costType: CostType.TASK_BASED, perTask: 32 },    // ~$0.21/task
  rodinGen1Tier: { costType: CostType.TASK_BASED, perTask: 120 },          // ~$0.80/task
  rodinGen1TurboTier: { costType: CostType.TASK_BASED, perTask: 75 },      // ~$0.50/task
  rodinSketchTier: { costType: CostType.TASK_BASED, perTask: 45 }          // ~$0.30/task
};

/**
 * Model ID to tier mapping.
 * Keys are "provider:modelId" strings for provider-specific pricing.
 */
export const MODEL_TO_TIER: Record<string, string> = {
  // GPT-5 Series (newest models) - OpenAI specific
  "openai:gpt-5": "gpt5Tier",
  "openai:gpt-5.2": "gpt5Tier",
  "openai:gpt-5.2-pro": "gpt5ProTier",
  "openai:gpt-5-mini": "gpt5MiniTier",
  // GPT-4.1 Family - OpenAI specific
  "openai:gpt-4.1": "gpt41Tier",
  "openai:gpt-4.1-mini": "gpt41MiniTier",
  "openai:gpt-4.1-nano": "gpt41NanoTier",
  // O4 Series (reasoning models) - OpenAI specific
  "openai:o4-mini": "o4MiniTier",
  // O1 Series (existing reasoning models) - OpenAI specific
  "openai:o1": "o1Tier",
  "openai:o1-preview": "o1Tier",
  "openai:o1-mini": "o1MiniTier",
  // O3 Series (future models) - OpenAI specific
  "openai:o3": "o1Tier",
  "openai:o3-mini": "o1MiniTier",
  // GPT-4o Series - OpenAI specific
  "openai:gpt-4o": "topTierChat",
  "openai:gpt-4o-2024-11-20": "topTierChat",
  "openai:gpt-4o-2024-08-06": "topTierChat",
  "openai:gpt-4o-2024-05-13": "topTierChat",
  "openai:gpt-4o-search-preview": "topTierChat",
  "openai:gpt-4o-mini": "lowTierChat",
  "openai:gpt-4o-mini-2024-07-18": "lowTierChat",
  "openai:gpt-4o-mini-search-preview": "lowTierChat",
  // GPT-4 Turbo Series - OpenAI specific
  "openai:gpt-4-turbo": "gpt4Turbo",
  "openai:gpt-4-turbo-2024-04-09": "gpt4Turbo",
  "openai:gpt-4-turbo-preview": "gpt4Turbo",
  "openai:gpt-4-0125-preview": "gpt4Turbo",
  "openai:gpt-4-1106-preview": "gpt4Turbo",
  "openai:computer-use-preview": "topTierChat",
  // Image models - OpenAI specific
  "openai:gpt-image-1.5": "imageGpt15",
  // Whisper / Speech-to-Text - OpenAI specific
  "openai:whisper-1": "whisperStandard",
  "openai:gpt-4o-transcribe": "whisperStandard",
  "openai:gpt-4o-mini-transcribe": "whisperLowCost",
  // TTS / Text-to-Speech - OpenAI specific
  "openai:gpt-4o-mini-tts": "ttsStandard",
  "openai:tts-1": "ttsHd",
  "openai:tts-1-hd": "ttsUltraHd",
  // Embeddings - OpenAI specific
  "openai:text-embedding-3-small": "embeddingSmall",
  "openai:text-embedding-3-large": "embeddingLarge",
  // Anthropic Models - Anthropic specific
  "anthropic:claude-opus-4-6": "claudeOpus4",
  "anthropic:claude-opus-4-5": "claudeOpus4",
  "anthropic:claude-opus-4-20250514": "claudeOpus4",
  "anthropic:claude-opus-4-20250501": "claudeOpus4",
  "anthropic:claude-sonnet-4-6": "claudeSonnet4",
  "anthropic:claude-sonnet-4-5": "claudeSonnet4",
  "anthropic:claude-sonnet-4-20250514": "claudeSonnet4",
  "anthropic:claude-sonnet-4-20250501": "claudeSonnet4",
  "anthropic:claude-haiku-4-5": "claudeHaiku4",
  "anthropic:claude-haiku-4-20250514": "claudeHaiku4",
  "anthropic:claude-haiku-4-20250501": "claudeHaiku4",
  "anthropic:claude-3-7-sonnet-20250511": "claude37Sonnet",
  "anthropic:claude-3-7-sonnet-20250219": "claude37Sonnet",
  "anthropic:claude-3-5-sonnet-20241022": "claude35Sonnet",
  "anthropic:claude-3-5-sonnet-20240620": "claude35Sonnet",
  "anthropic:claude-3-5-sonnet-latest": "claude35Sonnet",
  "anthropic:claude-3-5-haiku-20241022": "claude35Haiku",
  "anthropic:claude-3-5-haiku-latest": "claude35Haiku",
  "anthropic:claude-3-opus-20240229": "claude3Opus",
  "anthropic:claude-3-opus-latest": "claude3Opus",
  "anthropic:claude-3-sonnet-20240229": "claude3Sonnet",
  "anthropic:claude-3-sonnet-latest": "claude3Sonnet",
  "anthropic:claude-3-haiku-20240307": "claude3Haiku",
  "anthropic:claude-3-haiku-latest": "claude3Haiku",

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
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  inputCharacters?: number;
  durationSeconds?: number;
  imageCount?: number;
  videoSeconds?: number;
  /** Number of tasks submitted (for CostType.TASK_BASED providers). */
  taskCount?: number;
}

import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.runtime.cost");

export class CostCalculator {
  /**
   * Get the pricing tier for a model ID scoped by provider.
   *
   * @param modelId - The model identifier
   * @param provider - Provider name (e.g., "openai", "anthropic")
   * @returns The pricing tier name, or null if not found
   */
  static getTier(modelId: string, provider: string): string | null {
    const modelLower = modelId.toLowerCase();
    const providerLower = provider.toLowerCase();

    // Direct lookup with "provider:model" key
    const providerKey = `${providerLower}:${modelLower}`;
    if (providerKey in MODEL_TO_TIER) {
      return MODEL_TO_TIER[providerKey];
    }

    // Try prefix match with provider key - sort by model length descending
    // Only look at keys that match the provider
    const providerPrefix = `${providerLower}:`;
    const providerKeys = Object.keys(MODEL_TO_TIER).filter((key) =>
      key.startsWith(providerPrefix)
    );
    // Sort by model portion length descending (longest prefix first)
    providerKeys.sort(
      (a, b) =>
        b.substring(providerPrefix.length).length -
        a.substring(providerPrefix.length).length
    );
    for (const key of providerKeys) {
      const modelPart = key.substring(providerPrefix.length);
      if (modelLower.startsWith(modelPart)) {
        return MODEL_TO_TIER[key];
      }
    }

    return null;
  }

  /**
   * Calculate cost in credits for an API call.
   *
   * @param modelId - The model identifier
   * @param usage - Usage information from the API response
   * @param provider - Provider name for pricing lookup
   * @returns Cost in credits (1 credit = $0.01 USD)
   */
  static calculate(
    modelId: string,
    usage: UsageInfo,
    provider: string
  ): number {
    const tierName = CostCalculator.getTier(modelId, provider);
    if (tierName === null) {
      log.warn(
        `No pricing tier found for model: ${modelId} (provider: ${provider})`
      );
      return 0.0;
    }

    const tier = PRICING_TIERS[tierName];
    if (tier === undefined) {
      log.warn(`Pricing tier '${tierName}' not defined`);
      return 0.0;
    }

    return CostCalculator._calculateForTier(tier, usage);
  }

  /**
   * Calculate cost based on tier type.
   */
  private static _calculateForTier(
    tier: PricingTier,
    usage: UsageInfo
  ): number {
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const cachedTokens = usage.cachedTokens ?? 0;
    const inputCharacters = usage.inputCharacters ?? 0;
    const durationSeconds = usage.durationSeconds ?? 0;
    const imageCount = usage.imageCount ?? 0;
    const videoSeconds = usage.videoSeconds ?? 0;

    if (tier.costType === CostType.TOKEN_BASED) {
      let inputCost: number;
      let cachedCost: number;

      if (cachedTokens > 0 && (tier.cachedPer1kTokens ?? 0) > 0) {
        const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
        inputCost = (nonCachedInput / 1000) * (tier.inputPer1kTokens ?? 0);
        cachedCost = (cachedTokens / 1000) * (tier.cachedPer1kTokens ?? 0);
      } else {
        inputCost = (inputTokens / 1000) * (tier.inputPer1kTokens ?? 0);
        cachedCost = 0.0;
      }

      const outputCost = (outputTokens / 1000) * (tier.outputPer1kTokens ?? 0);
      return inputCost + outputCost + cachedCost;
    } else if (tier.costType === CostType.EMBEDDING) {
      return (inputTokens / 1000) * (tier.inputPer1kTokens ?? 0);
    } else if (tier.costType === CostType.CHARACTER_BASED) {
      return (inputCharacters / 1000) * (tier.per1kChars ?? 0);
    } else if (tier.costType === CostType.DURATION_BASED) {
      const durationMinutes = durationSeconds / 60.0;
      return durationMinutes * (tier.perMinute ?? 0);
    } else if (tier.costType === CostType.IMAGE_BASED) {
      return imageCount * (tier.perImage ?? 0);
    } else if (tier.costType === CostType.VIDEO_BASED) {
      return videoSeconds * (tier.perSecondVideo ?? 0);
    } else if (tier.costType === CostType.TASK_BASED) {
      const taskCount = usage.taskCount ?? 1;
      return taskCount * (tier.perTask ?? 0);
    }

    return 0.0;
  }
}

// Convenience functions

/**
 * Calculate chat completion cost.
 */
export function calculateChatCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  provider: string = "openai"
): number {
  const usage: UsageInfo = { inputTokens, outputTokens, cachedTokens };
  return CostCalculator.calculate(modelId, usage, provider);
}

/**
 * Calculate embedding cost.
 */
export function calculateEmbeddingCost(
  modelId: string,
  inputTokens: number,
  provider: string = "openai"
): number {
  const usage: UsageInfo = { inputTokens };
  return CostCalculator.calculate(modelId, usage, provider);
}

/**
 * Calculate TTS cost.
 */
export function calculateSpeechCost(
  modelId: string,
  inputChars: number,
  provider: string = "openai"
): number {
  const usage: UsageInfo = { inputCharacters: inputChars };
  return CostCalculator.calculate(modelId, usage, provider);
}

/**
 * Calculate ASR/Whisper cost.
 */
export function calculateWhisperCost(
  modelId: string,
  durationSeconds: number,
  provider: string = "openai"
): number {
  const usage: UsageInfo = { durationSeconds };
  return CostCalculator.calculate(modelId, usage, provider);
}

/**
 * Calculate 3D model generation cost.
 * Pass `taskCount` > 1 only if multiple tasks were submitted (rare).
 */
export function calculateModel3DCost(
  modelId: string,
  provider: string,
  taskCount: number = 1
): number {
  const usage: UsageInfo = { taskCount };
  return CostCalculator.calculate(modelId, usage, provider);
}

/**
 * Calculate image generation cost.
 */
export function calculateImageCost(
  modelId: string,
  imageCount: number = 1,
  quality: string = "medium",
  provider: string = "openai"
): number {
  // Adjust tier based on quality for gpt-image models
  if (modelId.toLowerCase().includes("gpt-image") && !modelId.includes("1.5")) {
    const qualityMap: Record<string, string> = {
      low: "imageGptLow",
      medium: "imageGptMedium",
      high: "imageGptHigh"
    };
    const tierOverride = qualityMap[quality.toLowerCase()] ?? "imageGptMedium";
    const tier = PRICING_TIERS[tierOverride];
    if (tier) {
      const usage: UsageInfo = { imageCount };
      return CostCalculator["_calculateForTier"](tier, usage);
    }
  }

  const usage: UsageInfo = { imageCount };
  return CostCalculator.calculate(modelId, usage, provider);
}
