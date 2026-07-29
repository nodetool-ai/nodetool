/**
 * The nightly GenSpend sync. Its output is a price the editor shows and a run
 * is gated on, so the normalizer is tested on the shapes GenSpend actually
 * serves — including the ones that must be dropped rather than guessed at.
 */
import { describe, it, expect } from "vitest";
import {
  buildCatalog,
  buildPriceIndex,
  extractModelId
} from "../../../scripts/sync-genspend-pricing.mjs";

const offering = (over: Record<string, unknown> = {}) => ({
  provider: { slug: "fal", name: "Fal.ai", type: "aggregator" },
  priceUsd: 0.04,
  unit: "per image",
  unitClass: "per-image",
  availability: "available",
  live: true,
  sourceUrl: "https://fal.ai/models/fal-ai/flux/schnell",
  variants: [],
  ...over
});

const model = (over: Record<string, unknown> = {}) => ({
  slug: "flux-schnell",
  name: "FLUX schnell",
  modality: "image",
  offerings: [offering()],
  ...over
});

describe("extractModelId", () => {
  it("reads the FAL endpoint id out of a model-page receipt", () => {
    expect(
      extractModelId("fal", "https://fal.ai/models/fal-ai/flux/schnell")
    ).toBe("fal-ai/flux/schnell");
  });

  it("reads owner/model out of a Replicate receipt", () => {
    expect(
      extractModelId("replicate", "https://replicate.com/black-forest-labs/flux-dev/")
    ).toBe("black-forest-labs/flux-dev");
  });

  it("ignores query strings and fragments", () => {
    expect(
      extractModelId("fal", "https://fal.ai/models/fal-ai/flux/schnell?tab=api#pricing")
    ).toBe("fal-ai/flux/schnell");
  });

  it("yields nothing for a provider whose receipt is a pricing table", () => {
    expect(extractModelId("kie", "https://kie.ai/nano-banana")).toBeNull();
    expect(
      extractModelId("atlascloud", "https://www.atlascloud.ai/pricing/models")
    ).toBeNull();
  });
});

describe("buildPriceIndex", () => {
  it("keys prices by NodeTool provider id and provider-native model id", () => {
    const { prices } = buildPriceIndex([model()]);
    expect(prices["fal_ai:fal-ai/flux/schnell"]).toMatchObject({
      unit_price: 0.04,
      billing_unit: "images",
      currency: "USD",
      unit_class: "per-image",
      model_slug: "flux-schnell",
      live: true
    });
  });

  it("maps each unit class to a billing unit", () => {
    const { prices } = buildPriceIndex([
      model({
        offerings: [
          offering({ unitClass: "per-video-second", priceUsd: 0.062 })
        ]
      })
    ]);
    expect(prices["fal_ai:fal-ai/flux/schnell"].billing_unit).toBe("seconds");
  });

  it("keeps the provider's published per-spec variants", () => {
    const { prices } = buildPriceIndex([
      model({
        offerings: [
          offering({
            variants: [
              { spec: "720p · 5s", unitClass: "per-video-second", priceUsd: 0.062 },
              { spec: "1080p · 5s", unitClass: "per-video-second", priceUsd: 0.155 }
            ]
          })
        ]
      })
    ]);
    expect(prices["fal_ai:fal-ai/flux/schnell"].variants).toEqual([
      { spec: "720p · 5s", unit_class: "per-video-second", unit_price: 0.062 },
      { spec: "1080p · 5s", unit_class: "per-video-second", unit_price: 0.155 }
    ]);
  });

  it("drops offerings that are not available, unpriced, or unmappable", () => {
    const { prices, offeringCount } = buildPriceIndex([
      model({
        offerings: [
          offering({ availability: "deprecated" }),
          offering({ priceUsd: null }),
          offering({
            provider: { slug: "atlascloud", name: "Atlas Cloud" },
            sourceUrl: "https://www.atlascloud.ai/pricing/models"
          })
        ]
      })
    ]);
    expect(prices).toEqual({});
    expect(offeringCount).toBe(3);
  });

  it("takes the cheaper of two offerings that collapse to one key", () => {
    const { prices } = buildPriceIndex([
      model({ offerings: [offering({ priceUsd: 0.09 })] }),
      model({ slug: "flux-schnell-alt", offerings: [offering({ priceUsd: 0.03 })] })
    ]);
    expect(prices["fal_ai:fal-ai/flux/schnell"].unit_price).toBe(0.03);
  });

  it("sorts keys so an unchanged catalog produces no diff", () => {
    const { prices } = buildPriceIndex([
      model({
        offerings: [
          offering({ sourceUrl: "https://fal.ai/models/z/model" }),
          offering({ sourceUrl: "https://fal.ai/models/a/model" })
        ]
      })
    ]);
    expect(Object.keys(prices)).toEqual(["fal_ai:a/model", "fal_ai:z/model"]);
  });
});

describe("buildCatalog", () => {
  it("keeps the previous updatedAt when no price moved", () => {
    const first = buildCatalog([model()], null, "2026-01-01T00:00:00.000Z");
    const second = buildCatalog([model()], first, "2026-01-02T00:00:00.000Z");
    expect(second.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("stamps a new updatedAt when a price moved", () => {
    const first = buildCatalog([model()], null, "2026-01-01T00:00:00.000Z");
    const second = buildCatalog(
      [model({ offerings: [offering({ priceUsd: 0.05 })] })],
      first,
      "2026-01-02T00:00:00.000Z"
    );
    expect(second.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("counts the whole upstream catalog, not just what it could price", () => {
    const catalog = buildCatalog(
      [
        model(),
        model({
          slug: "unmappable",
          offerings: [
            offering({
              provider: { slug: "runway", name: "Runway" },
              sourceUrl: "https://docs.dev.runwayml.com/guides/pricing/"
            })
          ]
        })
      ],
      null,
      "2026-01-01T00:00:00.000Z"
    );
    expect(catalog).toMatchObject({
      catalogModels: 2,
      catalogOfferings: 2,
      pricedModels: 1,
      source: "https://genspend.io/api/v1/models"
    });
  });
});
