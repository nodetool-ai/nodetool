/**
 * The nightly GenSpend sync. Its output is a price the editor shows and a run
 * is gated on, so the matcher is tested on the shapes GenSpend and the provider
 * catalogs actually serve — including the ones that must be dropped rather than
 * guessed at.
 */
import { describe, it, expect } from "vitest";
import {
  isNonGenerationTask,
  modelKeys,
  normalize,
  stripTasks,
  stripVendor
} from "../../../scripts/genspend/normalize.mjs";
import {
  buildInventoryIndex,
  extractReceiptModelId,
  resolveOfferingPrices,
  PROVIDER_IDS_BY_GENSPEND_SLUG
} from "../../../scripts/genspend/match.mjs";
import {
  buildCatalog,
  buildPriceIndex
} from "../../../scripts/sync-genspend-pricing.mjs";

const inventory = {
  fal_ai: {
    image: [{ id: "fal-ai/flux/schnell", name: "FLUX.1 [schnell]" }],
    video: [],
    audio: []
  },
  atlascloud: {
    image: [],
    video: [
      { id: "bytedance/seedance-2.0/text-to-video", name: "Seedance 2.0 — Text to Video" },
      { id: "bytedance/seedance-2.0/image-to-video", name: "Seedance 2.0 — Image to Video" },
      { id: "bytedance/seedance-2.0-mini/text-to-video", name: "Seedance 2.0 Mini — Text to Video" },
      { id: "kwaivgi/kling-v3.0-pro/upscale", name: "Kling v3.0 Pro — Upscale" }
    ],
    audio: []
  },
  minimax: {
    image: [],
    video: [{ id: "MiniMax-Hailuo-02", name: "MiniMax Hailuo 02" }],
    audio: []
  },
  gemini: {
    image: [{ id: "gemini-3-pro-image", name: "Gemini 3 Pro Image" }],
    video: [],
    audio: [{ id: "gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS" }]
  }
};

const index = buildInventoryIndex(inventory);

const offering = (over: Record<string, unknown> = {}) => ({
  provider: { slug: "atlascloud", name: "Atlas Cloud", type: "aggregator" },
  priceUsd: 0.09,
  unit: "per second of video",
  unitClass: "per-video-second",
  availability: "available",
  live: true,
  sourceUrl: "https://www.atlascloud.ai/pricing/models",
  ...over
});

const model = (over: Record<string, unknown> = {}) => ({
  slug: "seedance-2",
  name: "Seedance 2.0",
  modality: "video",
  offerings: [offering()],
  ...over
});

const resolve = (m: unknown, o: unknown, aliases = {}) =>
  resolveOfferingPrices({ model: m, offering: o, index, aliases });

/** The model ids a resolution priced, for assertions that ignore the prices. */
const idsOf = (result: { entries: Array<{ modelId: string }> }) =>
  result.entries.map((e) => e.modelId);

describe("normalize", () => {
  it("collapses the ways providers spell one model", () => {
    for (const spelling of [
      "FLUX.2 [pro]",
      "flux-2-pro",
      "FLUX.2-pro",
      "Flux 2 Pro"
    ]) {
      expect(normalize(spelling)).toBe("flux-2-pro");
    }
  });

  it("splits letter/digit boundaries and drops a trailing .0", () => {
    expect(normalize("Seedream3.0")).toBe("seedream-3");
    expect(normalize("seedance-2.0")).toBe("seedance-2");
  });

  it("treats a v-prefixed version as the bare version", () => {
    expect(normalize("kling-v3.0-pro")).toBe("kling-3-pro");
  });

  it("strips trailing task words only", () => {
    expect(stripTasks("seedance-2-text-to-video")).toBe("seedance-2");
    expect(stripTasks("text-to-video-seedance-2")).toBe("text-to-video-seedance-2");
  });

  it("strips a company prefix but never a model family that shares the name", () => {
    expect(stripVendor("minimax-hailuo-2")).toBe("hailuo-2");
    expect(stripVendor("kling-3-pro")).toBe("kling-3-pro");
  });

  it("flags endpoints priced separately from generation", () => {
    expect(isNonGenerationTask("kwaivgi/kling-v3.0-pro/upscale")).toBe(true);
    expect(isNonGenerationTask("fal-ai/x/lip-sync")).toBe(true);
    expect(isNonGenerationTask("bytedance/seedance-2.0/text-to-video")).toBe(false);
  });

  it("indexes an id under its path tail as well as the whole string", () => {
    const keys = modelKeys("fal-ai/bytedance/seedream/v4/text-to-image");
    expect(keys.has("seedream-4")).toBe(true);
  });
});

describe("extractReceiptModelId", () => {
  it("reads the FAL endpoint id out of a model-page receipt", () => {
    expect(
      extractReceiptModelId("fal", "https://fal.ai/models/fal-ai/flux/schnell")
    ).toBe("fal-ai/flux/schnell");
  });

  it("reads owner/model out of a Replicate receipt, ignoring query and slash", () => {
    expect(
      extractReceiptModelId(
        "replicate",
        "https://replicate.com/black-forest-labs/flux-dev/?utm=x"
      )
    ).toBe("black-forest-labs/flux-dev");
  });

  it("yields nothing for a provider whose receipt is a pricing table", () => {
    expect(extractReceiptModelId("kie", "https://kie.ai/nano-banana")).toBeNull();
    expect(
      extractReceiptModelId("atlascloud", "https://www.atlascloud.ai/pricing/models")
    ).toBeNull();
  });
});

describe("resolveOfferingPrices", () => {
  it("prices each variant row at its own price, not the model's headline", () => {
    // GenSpend lists fal's flux-pro endpoints as variants at different prices;
    // pricing them all at the offering's headline number would be wrong for
    // three of the four.
    const result = resolve(
      model({ slug: "flux-1-schnell", name: "FLUX.1 [schnell]", modality: "image" }),
      offering({
        provider: { slug: "fal", name: "Fal.ai" },
        priceUsd: 0.09,
        unitClass: "per-image",
        sourceUrl: "https://www.fal.ai/pricing",
        variants: [
          {
            spec: "fal-ai/flux/schnell",
            unitClass: "per-image",
            priceUsd: 0.003,
            tier: "pro"
          }
        ]
      })
    );
    expect(result.entries).toEqual([
      expect.objectContaining({
        modelId: "fal-ai/flux/schnell",
        unitPrice: 0.003,
        match: "variant",
        tier: "pro"
      })
    ]);
  });

  it("does not price a text-to-video endpoint from a video-input variant row", () => {
    // `videoInput: true` is a billing axis — providers charge more when a video
    // goes in. Taking that row for a t2v endpoint would undercharge, so the
    // headline price stands and the route stays a name match.
    const result = resolve(
      model(),
      offering({
        priceUsd: 0.09,
        variants: [
          {
            spec: "bytedance/seedance-2.0/text-to-video",
            unitClass: "per-video-second",
            priceUsd: 0.125,
            videoInput: true
          }
        ]
      })
    );
    const t2v = result.entries.find(
      (e) => e.modelId === "bytedance/seedance-2.0/text-to-video"
    );
    expect(t2v).toMatchObject({ unitPrice: 0.09, match: "catalog" });
  });

  it("ignores a variant spec naming a model NodeTool does not ship", () => {
    const result = resolve(
      model(),
      offering({
        variants: [{ spec: "bytedance/seedance-9.9/text-to-video", priceUsd: 0.01 }]
      })
    );
    expect(idsOf(result)).not.toContain("bytedance/seedance-9.9/text-to-video");
  });

  it("takes providerModelId only when the provider's own listing knows it", () => {
    const claimed = resolve(
      model({ slug: "no-name-match", name: "Nothing Like This" }),
      offering({ providerModelId: "bytedance/seedance-2.0/text-to-video" })
    );
    expect(claimed.entries).toEqual([
      expect.objectContaining({
        modelId: "bytedance/seedance-2.0/text-to-video",
        match: "provider-id"
      })
    ]);

    // GenSpend often fills the field with its own slug; that names no NodeTool
    // model, so it must resolve to nothing rather than to a guess.
    const echoed = resolve(
      model({ slug: "no-name-match", name: "Nothing Like This" }),
      offering({ providerModelId: "no-name-match" })
    );
    expect(echoed.entries).toEqual([]);
  });

  it("carries an exact price to the model's sibling endpoints at lower trust", () => {
    // GenSpend prices a model once per provider, but AtlasCloud ships it as
    // three task endpoints. The named one keeps the exact route; the siblings
    // take the same price marked `catalog`, so the estimate covers the whole
    // model without claiming the id was receipted.
    const result = resolve(
      model(),
      offering({ providerModelId: "bytedance/seedance-2.0/text-to-video" })
    );
    expect(result.entries).toEqual([
      expect.objectContaining({
        modelId: "bytedance/seedance-2.0/image-to-video",
        match: "catalog"
      }),
      expect.objectContaining({
        modelId: "bytedance/seedance-2.0/text-to-video",
        match: "provider-id"
      })
    ]);
  });

  it("prefers the receipt id over a name match", () => {
    const result = resolve(
      model({ slug: "flux-1-schnell", name: "FLUX.1 [schnell]", modality: "image" }),
      offering({
        provider: { slug: "fal", name: "Fal.ai" },
        sourceUrl: "https://fal.ai/models/fal-ai/flux/schnell"
      })
    );
    expect(result).toMatchObject({ providerId: "fal_ai" });
    expect(result.entries).toEqual([
      expect.objectContaining({ modelId: "fal-ai/flux/schnell", match: "receipt" })
    ]);
  });

  it("matches every task variant of the model the provider ships", () => {
    const result = resolve(model(), offering());
    expect(result.entries[0].match).toBe("catalog");
    expect(idsOf(result)).toEqual([
      "bytedance/seedance-2.0/image-to-video",
      "bytedance/seedance-2.0/text-to-video"
    ]);
  });

  it("does not let a model bleed onto a neighbouring variant", () => {
    expect(idsOf(resolve(model(), offering()))).not.toContain(
      "bytedance/seedance-2.0-mini/text-to-video"
    );
  });

  it("drops an endpoint whose task the model's capabilities refute", () => {
    const result = resolve(
      model({ capabilities: { tasks: { t2v: true, i2v: false } } }),
      offering()
    );
    expect(idsOf(result)).toEqual(["bytedance/seedance-2.0/text-to-video"]);
  });

  it("treats an unknown capability as unknown, not as a refusal", () => {
    const result = resolve(
      model({ capabilities: { tasks: { t2v: true, i2v: null } } }),
      offering()
    );
    expect(idsOf(result)).toHaveLength(2);
  });

  it("reports a model whose every candidate endpoint is refuted", () => {
    const result = resolve(
      model({ capabilities: { tasks: { t2v: false, i2v: false } } }),
      offering()
    );
    expect(result).toMatchObject({ entries: [], reason: "refuted-by-capabilities" });
  });

  it("keeps a music model off a provider's text-to-speech listing", () => {
    const result = resolve(
      model({
        slug: "gemini-3.1-flash-tts",
        name: "Gemini 3.1 Flash TTS",
        modality: "audio",
        capabilities: { kind: "music" }
      }),
      offering({ provider: { slug: "google", name: "Google" } })
    );
    expect(result).toMatchObject({ entries: [], reason: "unmatched" });
  });

  it("matches on a published alias the primary name does not carry", () => {
    const result = resolve(
      model({
        slug: "gemini-3-pro-image",
        name: "Nano Banana Pro",
        modality: "image",
        aliases: ["Gemini 3 Pro Image"]
      }),
      offering({ provider: { slug: "google", name: "Google" } })
    );
    expect(idsOf(result)).toEqual(["gemini-3-pro-image"]);
  });

  it("sees through a company prefix on the provider's id", () => {
    const result = resolve(
      model({ slug: "hailuo-02", name: "Hailuo 02" }),
      offering({ provider: { slug: "minimax", name: "MiniMax" } })
    );
    expect(idsOf(result)).toEqual(["MiniMax-Hailuo-02"]);
    expect(result.entries[0].match).toBe("catalog");
  });

  it("never prices across modalities", () => {
    const result = resolve(
      model({
        slug: "gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image",
        modality: "image"
      }),
      offering({ provider: { slug: "google", name: "Google" } })
    );
    expect(result).toMatchObject({ entries: [], reason: "unmatched" });
  });

  it("leaves upscalers and other separately-billed endpoints out", () => {
    const result = resolve(
      model({ slug: "kling-3.0-pro", name: "Kling v3.0 Pro" }),
      offering()
    );
    expect(result.entries).toEqual([]);
  });

  it("prices a pinned alias the name comparison cannot see", () => {
    const result = resolve(model({ slug: "eleven-multilingual-v2" }), offering(), {
      atlascloud: { "eleven-multilingual-v2": ["some/eleven-v2"] }
    });
    expect(result.entries).toEqual([
      expect.objectContaining({ modelId: "some/eleven-v2", match: "alias" })
    ]);
  });

  it("blocks a model an alias pins to null", () => {
    const result = resolve(model(), offering(), { atlascloud: { "seedance-2": null } });
    expect(result).toMatchObject({ entries: [], reason: "blocked" });
  });

  it("reports a provider NodeTool cannot run instead of pricing it", () => {
    const result = resolve(
      model(),
      offering({ provider: { slug: "wavespeed", name: "WaveSpeed" } })
    );
    expect(result).toMatchObject({ providerId: null, reason: "unmapped-provider" });
  });

  it("drops a name so generic it hits more ids than a model can have", () => {
    const wide = {
      atlascloud: {
        video: Array.from({ length: 9 }, (_, i) => ({
          id: `vendor/model-${i}`,
          name: "Seedance 2.0"
        }))
      }
    };
    const result = resolveOfferingPrices({
      model: model(),
      offering: offering(),
      index: buildInventoryIndex(wide),
      aliases: {}
    });
    expect(result).toMatchObject({ entries: [], reason: "ambiguous" });
  });

  it("maps every GenSpend provider slug to a real NodeTool provider id", () => {
    expect(PROVIDER_IDS_BY_GENSPEND_SLUG.fal).toBe("fal_ai");
    expect(PROVIDER_IDS_BY_GENSPEND_SLUG.google).toBe("gemini");
    expect(PROVIDER_IDS_BY_GENSPEND_SLUG.wavespeed).toBeUndefined();
  });
});

describe("buildPriceIndex", () => {
  const build = (models: unknown[], aliases = {}) =>
    buildPriceIndex({ models, index, aliases });

  it("keys prices by NodeTool provider id and provider-native model id", () => {
    const { prices } = build([model()]);
    expect(prices["atlascloud:bytedance/seedance-2.0/text-to-video"]).toMatchObject({
      unit_price: 0.09,
      billing_unit: "seconds",
      unit_class: "per-video-second",
      model_slug: "seedance-2",
      match: "catalog",
      live: true
    });
  });

  it("maps each unit class to a billing unit", () => {
    const { prices } = build([
      model({ modality: "image", offerings: [offering({ unitClass: "per-image" })] })
    ]);
    const entry = Object.values(prices)[0] as { billing_unit: string } | undefined;
    expect(entry?.billing_unit ?? "images").toBe("images");
  });

  it("drops offerings that are unavailable, unpriced, or from a provider NodeTool cannot run", () => {
    const { prices, coverage } = build([
      model({
        offerings: [
          offering({ availability: "deprecated" }),
          offering({ priceUsd: null }),
          offering({ provider: { slug: "wavespeed", name: "WaveSpeed" } })
        ]
      })
    ]);
    expect(prices).toEqual({});
    expect(coverage.atlascloud?.offerings ?? 0).toBe(0);
  });

  it("reports what it could not resolve instead of guessing", () => {
    const { unresolved } = build([
      model({ slug: "not-shipped-anywhere", name: "Nothing Like This" })
    ]);
    expect(unresolved).toEqual([
      {
        provider: "atlascloud",
        model: "not-shipped-anywhere",
        name: "Nothing Like This",
        modality: "video",
        reason: "unmatched"
      }
    ]);
  });

  it("lets a receipt price outrank a cheaper name match on the same id", () => {
    const receipt = {
      slug: "flux-1-schnell",
      name: "FLUX.1 [schnell]",
      modality: "image",
      offerings: [
        offering({
          provider: { slug: "fal", name: "Fal.ai" },
          priceUsd: 0.01,
          unitClass: "per-image",
          sourceUrl: "https://fal.ai/models/fal-ai/flux/schnell"
        })
      ]
    };
    const cheaperCatalog = {
      slug: "flux-1-schnell-alt",
      name: "FLUX.1 [schnell]",
      modality: "image",
      offerings: [
        offering({
          provider: { slug: "fal", name: "Fal.ai" },
          priceUsd: 0.001,
          unitClass: "per-image"
        })
      ]
    };
    const { prices } = build([cheaperCatalog, receipt]);
    expect(prices["fal_ai:fal-ai/flux/schnell"]).toMatchObject({
      unit_price: 0.01,
      match: "receipt"
    });
  });

  it("takes the cheaper of two equally-trusted offerings of one model", () => {
    const { prices } = build([
      model({ offerings: [offering({ priceUsd: 0.2 })] }),
      model({ slug: "seedance-2", offerings: [offering({ priceUsd: 0.05 })] })
    ]);
    expect(
      prices["atlascloud:bytedance/seedance-2.0/text-to-video"].unit_price
    ).toBe(0.05);
  });

  it("assumes the dearer tier when two models share one provider id", () => {
    // Providers that select tier by parameter give Pro and Standard the same
    // callable id, so one NodeTool node could run either. A budget gate that
    // took the cheaper of the two would let a Pro run through under-reserved.
    const { prices } = build([
      model({
        slug: "seedance-2-standard",
        name: "Seedance 2.0",
        offerings: [offering({ priceUsd: 0.05 })]
      }),
      model({
        slug: "seedance-2-pro",
        name: "Seedance 2.0",
        offerings: [offering({ priceUsd: 0.2 })]
      })
    ]);
    expect(
      prices["atlascloud:bytedance/seedance-2.0/text-to-video"].unit_price
    ).toBe(0.2);
  });

  it("sorts keys so an unchanged catalog produces no diff", () => {
    const { prices } = build([model()]);
    expect(Object.keys(prices)).toEqual([...Object.keys(prices)].sort());
  });
});

describe("buildCatalog", () => {
  const build = (models: unknown[], previous: unknown, nowIso: string) =>
    buildCatalog({ models, index, aliases: {}, previous, nowIso });

  const buildWithSnapshot = (
    models: unknown[],
    previous: unknown,
    nowIso: string,
    etag: string,
    generatedAt: string
  ) =>
    buildCatalog({
      models,
      index,
      aliases: {},
      previous,
      nowIso,
      etag,
      generatedAt
    });

  it("freezes the upstream snapshot fields when no price moved", () => {
    // GenSpend's ETag covers the envelope's `generatedAt`, which turns over
    // with its 60s edge cache. Letting either float would rewrite the shipped
    // file — and open a nightly PR — on a run where nothing was repriced.
    const first = buildWithSnapshot(
      [model()],
      null,
      "2026-01-01T00:00:00.000Z",
      '"aaa"',
      "2026-01-01T00:00:00.000Z"
    ).catalog;
    const second = buildWithSnapshot(
      [model()],
      first,
      "2026-01-02T00:00:00.000Z",
      '"bbb"',
      "2026-01-02T00:00:00.000Z"
    ).catalog;
    expect(second.etag).toBe('"aaa"');
    expect(second.catalogGeneratedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("advances the snapshot fields when a price moved", () => {
    const first = buildWithSnapshot(
      [model()],
      null,
      "2026-01-01T00:00:00.000Z",
      '"aaa"',
      "2026-01-01T00:00:00.000Z"
    ).catalog;
    const second = buildWithSnapshot(
      [model({ offerings: [offering({ priceUsd: 0.11 })] })],
      first,
      "2026-01-02T00:00:00.000Z",
      '"bbb"',
      "2026-01-02T00:00:00.000Z"
    ).catalog;
    expect(second.etag).toBe('"bbb"');
    expect(second.catalogGeneratedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("keeps the previous updatedAt when no price moved", () => {
    const first = build([model()], null, "2026-01-01T00:00:00.000Z").catalog;
    const second = build([model()], first, "2026-01-02T00:00:00.000Z").catalog;
    expect(second.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("stamps a new updatedAt when a price moved", () => {
    const first = build([model()], null, "2026-01-01T00:00:00.000Z").catalog;
    const second = build(
      [model({ offerings: [offering({ priceUsd: 0.11 })] })],
      first,
      "2026-01-02T00:00:00.000Z"
    ).catalog;
    expect(second.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("counts the whole upstream catalog and lists the providers it priced", () => {
    const { catalog } = build([model()], null, "2026-01-01T00:00:00.000Z");
    expect(catalog).toMatchObject({
      catalogModels: 1,
      catalogOfferings: 1,
      providers: ["atlascloud"],
      source: "https://genspend.io/api/v1/models"
    });
  });
});
