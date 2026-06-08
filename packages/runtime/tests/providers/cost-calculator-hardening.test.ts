/**
 * Mutation-hardening tests for the cost calculator.
 *
 * `cost-calculator.test.ts` proves the happy paths run; these tests pin the
 * *exact* observable behaviour that ordinary coverage leaves unverified, so a
 * silent regression (a wrong tier price, a dropped local-free provider, an
 * inverted longest-prefix sort) fails a test instead of mispricing in
 * production. Each test reads as Arrange/Act/Assert and asserts one
 * externally-meaningful property. See MUTATION_TESTING.md.
 */
import { describe, it, expect } from "vitest";
import {
  CostType,
  CostCalculator,
  PRICING_TIERS,
  MODEL_TO_TIER,
  calculateModel3DCost,
  calculateImageCost
} from "../../src/providers/cost-calculator.js";
import type { ProviderId } from "@nodetool-ai/protocol";

/** Usage + expected cost that exercises a tier's cost type with unit inputs. */
function unitUsageFor(tierName: string): {
  usage: Record<string, number>;
  expected: number;
} {
  const tier = PRICING_TIERS[tierName];
  switch (tier.costType) {
    case CostType.CHARACTER_BASED:
      return { usage: { inputCharacters: 1000 }, expected: tier.per1kChars! };
    case CostType.DURATION_BASED:
      return { usage: { durationSeconds: 60 }, expected: tier.perMinute! };
    case CostType.IMAGE_BASED:
      return { usage: { imageCount: 1 }, expected: tier.perImage! };
    case CostType.VIDEO_BASED:
      return { usage: { videoSeconds: 1 }, expected: tier.perSecondVideo! };
    case CostType.TASK_BASED:
      return { usage: { taskCount: 1 }, expected: tier.perTask! };
    default:
      throw new Error(`untested cost type: ${tier.costType}`);
  }
}

describe("MODEL_TO_TIER × PRICING_TIERS — every mapping prices exactly", () => {
  // Kills: each MODEL_TO_TIER key/value StringLiteral mutant (a broken mapping
  // falls through to token pricing, which is 0 for these non-token models), and
  // each PRICING_TIERS ObjectLiteral mutant (an emptied tier prices to 0).
  for (const [key, tierName] of Object.entries(MODEL_TO_TIER)) {
    const colon = key.indexOf(":");
    const provider = key.slice(0, colon) as ProviderId;
    const model = key.slice(colon + 1);
    it(`${key} → ${tierName} at its published rate`, () => {
      const { usage, expected } = unitUsageFor(tierName);
      expect(expected).toBeGreaterThan(0);
      expect(CostCalculator.calculate(model, usage, provider)).toBeCloseTo(
        expected
      );
    });
  }
});

describe("local-free providers bill nothing", () => {
  // A model genai-prices *does* know, so the only reason cost is 0 is the
  // free-provider short-circuit. Dropping a provider from the set (StringLiteral
  // → "" or the whole ArrayDeclaration → []) makes this model price > 0.
  const freeProviders = [
    "ollama",
    "local",
    "lmstudio",
    "llama_cpp",
    "llamacpp",
    "llama-cpp"
  ];
  for (const provider of freeProviders) {
    it(`${provider} is free even for a priced model id`, () => {
      const cost = CostCalculator.calculate(
        "gpt-4o-mini",
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        provider as ProviderId
      );
      expect(cost).toBe(0);
    });
  }

  it("a non-free provider DOES price the same model id", () => {
    const cost = CostCalculator.calculate(
      "gpt-4o-mini",
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      "openai"
    );
    expect(cost).toBeGreaterThan(0);
  });
});

describe("getTier longest-prefix matching", () => {
  it("matches a versioned model id by prefix", () => {
    // "openai:whisper-1" is the only exact key; a dated variant must still
    // resolve via the prefix scan (kills the forced-true exact-match mutant,
    // which would return undefined for a non-exact key).
    expect(CostCalculator.getTier("whisper-1-2024-10", "openai")).toBe(
      "whisperStandard"
    );
  });

  it("prefers the LONGEST matching prefix", () => {
    // Both "rodin-gen-1" and "rodin-gen-1-turbo" prefix this id; the longer one
    // must win. An inverted sort (b−a → a−b) would pick rodinGen1Tier instead.
    expect(CostCalculator.getTier("rodin-gen-1-turbo-v2", "rodin")).toBe(
      "rodinGen1TurboTier"
    );
  });

  it("does not match a prefix from a different provider", () => {
    // The provider segment scopes the scan; whisper is an openai tier only.
    expect(CostCalculator.getTier("whisper-1", "anthropic")).toBeNull();
  });
});

describe("token pricing — cache accounting", () => {
  it("prices cache-write tokens at a premium over plain input", () => {
    // Anthropic bills cache *creation* above the base input rate. inputTokens is
    // inclusive of cacheWriteTokens, so the all-cache-write call must cost more
    // than the same volume as plain input. Covers the cacheWriteTokens branch.
    const model = "claude-3-5-sonnet-20241022";
    const plain = CostCalculator.calculate(
      model,
      { inputTokens: 1_000_000, outputTokens: 0 },
      "anthropic"
    );
    const allCacheWrite = CostCalculator.calculate(
      model,
      { inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 1_000_000 },
      "anthropic"
    );
    expect(plain).toBeGreaterThan(0);
    expect(allCacheWrite).toBeGreaterThan(plain);
  });
});

describe("_calculateForTier — per-modality math", () => {
  it("scales task-based cost by taskCount", () => {
    // Kills the convenience-fn ObjectLiteral mutant (which drops taskCount) and
    // the `?? 1` default mutant: 2 tasks must cost twice one task.
    const one = calculateModel3DCost("meshy-4", "meshy", 1);
    const two = calculateModel3DCost("meshy-4", "meshy", 2);
    expect(two).toBeCloseTo(one * 2);
    expect(two).toBeCloseTo(PRICING_TIERS.meshy4TextTexturedTier.perTask! * 2);
  });

  it("falls back to token pricing when the tier name has no PRICING_TIERS entry", () => {
    // A model mapped to a tier that doesn't exist must NOT crash on the
    // undefined tier — it logs and falls through to token pricing (0 for this
    // unknown model). Covers the `tier !== undefined` guard + warn branch.
    (MODEL_TO_TIER as Record<string, string>)["test:dangling-model"] =
      "__no_such_tier__";
    try {
      expect(
        CostCalculator.calculate(
          "dangling-model",
          { imageCount: 3 },
          "test" as ProviderId
        )
      ).toBe(0);
    } finally {
      delete (MODEL_TO_TIER as Record<string, string>)["test:dangling-model"];
    }
  });

  it("returns 0 for an unrecognized cost type (switch default)", () => {
    const tierName = "__test_bogus__";
    (PRICING_TIERS as Record<string, unknown>)[tierName] = {
      costType: "totally-bogus",
      perImage: 9.99
    };
    (MODEL_TO_TIER as Record<string, string>)["test:bogus-model"] = tierName;
    try {
      expect(
        CostCalculator.calculate(
          "bogus-model",
          { imageCount: 5 },
          "test" as ProviderId
        )
      ).toBe(0);
    } finally {
      delete (PRICING_TIERS as Record<string, unknown>)[tierName];
      delete (MODEL_TO_TIER as Record<string, string>)["test:bogus-model"];
    }
  });
});

describe("calculateImageCost — gpt-image gate", () => {
  it("prices gpt-image-1 per image by quality (default medium)", () => {
    expect(calculateImageCost("gpt-image-1")).toBeCloseTo(
      PRICING_TIERS.imageGptMedium.perImage!
    );
  });

  it("does NOT use per-image tiers for a non-image model", () => {
    // The `includes("gpt-image")` gate must exclude unrelated models; they go to
    // token pricing (0 here), never the legacy per-image table.
    expect(calculateImageCost("dall-e-3", 1, "low", "openai")).not.toBeCloseTo(
      PRICING_TIERS.imageGptLow.perImage!
    );
  });

  it("does NOT use per-image tiers for gpt-image-1.5", () => {
    // The `!includes("1.5")` guard excludes the next-gen model from the legacy
    // per-image table; it must fall through to token pricing (0 here), not the
    // medium image price.
    expect(calculateImageCost("gpt-image-1.5", 1, "medium")).not.toBeCloseTo(
      PRICING_TIERS.imageGptMedium.perImage!
    );
  });

  it("scales a non-gpt-image IMAGE tier by imageCount through calculate()", () => {
    // A non-gpt-image model mapped to an IMAGE_BASED tier flows through the
    // generic `calculate` path, where usage must carry imageCount. Dropping it
    // (the `{ imageCount }` → `{}` mutant) would price every count as 0.
    const tierName = "__test_img__";
    (PRICING_TIERS as Record<string, unknown>)[tierName] = {
      costType: CostType.IMAGE_BASED,
      perImage: 0.5
    };
    (MODEL_TO_TIER as Record<string, string>)["test:img-model"] = tierName;
    try {
      expect(
        calculateImageCost("img-model", 3, "medium", "test" as ProviderId)
      ).toBeCloseTo(1.5);
    } finally {
      delete (PRICING_TIERS as Record<string, unknown>)[tierName];
      delete (MODEL_TO_TIER as Record<string, string>)["test:img-model"];
    }
  });
});

describe("getTier — provider scoping filter", () => {
  it("ignores an identically-named model under a different provider", () => {
    // Without the `startsWith(providerPrefix)` filter, the scan would consider
    // every provider's keys; both prefixes are the same length, so a key under
    // "yyy" would wrongly match a lookup under "zzz". The filter must scope it.
    (MODEL_TO_TIER as Record<string, string>)["yyy:abc"] = "whisperStandard";
    try {
      expect(CostCalculator.getTier("abc", "zzz" as ProviderId)).toBeNull();
    } finally {
      delete (MODEL_TO_TIER as Record<string, string>)["yyy:abc"];
    }
  });
});
