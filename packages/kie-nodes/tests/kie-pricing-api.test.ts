import { describe, expect, it } from "vitest";
import {
  aggregateKiePricingByModelId,
  modelIdFromKiePricingAnchor,
  normalizeKieModelId,
  resolveKiePricing,
  type KieModelPricingSummary,
  type KiePricingPageRecord,
} from "../src/kie-pricing-api.js";

describe("modelIdFromKiePricingAnchor", () => {
  it("extracts model query param", () => {
    expect(
      modelIdFromKiePricingAnchor(
        "https://kie.ai/grok-imagine?model=grok-imagine%2Ftext-to-image",
      ),
    ).toBe("grok-imagine/text-to-image");
  });
});

function row(
  over: Partial<KiePricingPageRecord> & Pick<KiePricingPageRecord, "creditPrice" | "anchor">,
): KiePricingPageRecord {
  return {
    modelDescription: "",
    interfaceType: "image",
    provider: "",
    creditUnit: "per image",
    usdPrice: "",
    falPrice: "",
    discountRate: 0,
    discountPrice: false,
    ...over,
  };
}

describe("aggregateKiePricingByModelId", () => {
  it("uses minimum credit price and keeps the shared billing unit across tiers", () => {
    const out = aggregateKiePricingByModelId([
      row({
        creditPrice: "7.0",
        usdPrice: "0.035",
        anchor: "https://kie.ai/flux-2?model=flux-2%2Fpro-text-to-image",
      }),
      row({
        creditPrice: "5.0",
        usdPrice: "0.025",
        anchor: "https://kie.ai/flux-2?model=flux-2%2Fpro-text-to-image",
      }),
    ]);
    expect(out["flux-2/pro-text-to-image"]).toEqual({
      model_id: "flux-2/pro-text-to-image",
      unit_price: 5,
      billing_unit: "image",
      currency: "credits",
      usd_price: 0.025,
      tier_count: 2,
      pricing_url: "https://kie.ai/flux-2",
    });
  });

  it("keeps per-second unit for multi-tier video models (lowest tier wins)", () => {
    const anchor =
      "https://kie.ai/seedance-2-0?model=bytedance%2Fseedance-2-fast";
    const out = aggregateKiePricingByModelId([
      row({ creditPrice: "33", creditUnit: "per second", usdPrice: "0.165", interfaceType: "video", anchor }),
      row({ creditPrice: "9", creditUnit: "per second", usdPrice: "0.045", interfaceType: "video", anchor }),
      row({ creditPrice: "20", creditUnit: "per second", usdPrice: "0.10", interfaceType: "video", anchor }),
      row({ creditPrice: "15.5", creditUnit: "per second", usdPrice: "0.0775", interfaceType: "video", anchor }),
    ]);
    expect(out["bytedance/seedance-2-fast"]).toMatchObject({
      unit_price: 9,
      billing_unit: "second",
      usd_price: 0.045,
      tier_count: 4,
    });
  });

  it("falls back to 'varies' only when tiers disagree on the unit", () => {
    const anchor = "https://kie.ai/x?model=acme%2Fmixed";
    const out = aggregateKiePricingByModelId([
      row({ creditPrice: "5", creditUnit: "per image", anchor }),
      row({ creditPrice: "8", creditUnit: "per second", anchor }),
    ]);
    expect(out["acme/mixed"].billing_unit).toBe("varies");
  });

  it("recovers the id from a slug-like description when the anchor lacks ?model=", () => {
    // kie's seedance-2 (non-fast) rows carry the id only in the description.
    const out = aggregateKiePricingByModelId([
      row({
        creditPrice: "11.5",
        creditUnit: "per second",
        interfaceType: "video",
        modelDescription: "bytedance/seedance-2, 480p with video input",
        anchor: "https://kie.ai/seedance-2-0",
      }),
    ]);
    expect(out["bytedance/seedance-2"]).toMatchObject({ unit_price: 11.5 });
  });

  it("recovers the id from the anchor path when neither ?model= nor a slug description exists", () => {
    const out = aggregateKiePricingByModelId([
      row({
        creditPrice: "5",
        modelDescription: "Qwen image-edit, image-to-image",
        anchor: "https://kie.ai/qwen/image-edit",
      }),
      row({
        creditPrice: "20",
        creditUnit: "per image",
        modelDescription: "Topaz Image Upscaler, image-upscale, 4K",
        anchor: "https://kie.ai/topaz-image-upscale",
      }),
    ]);
    expect(out["qwen/image-edit"]).toBeDefined();
    expect(out["topaz-image-upscale"]).toBeDefined();
  });

  it("skips chat/token pricing rows", () => {
    const out = aggregateKiePricingByModelId([
      row({
        creditPrice: "400",
        creditUnit: "per million tokens",
        interfaceType: "chat",
        modelDescription: "Claude-Opus-4-8, chat, Input",
        anchor: "https://kie.ai/claude-opus-4.8",
      }),
    ]);
    expect(Object.keys(out)).toHaveLength(0);
  });
});

describe("resolveKiePricing", () => {
  const summary = (model_id: string, unit_price: number): KieModelPricingSummary => ({
    model_id,
    unit_price,
    billing_unit: "request",
    currency: "credits",
    tier_count: 1,
  });
  const catalog = {
    "ai-music-api/generate": summary("ai-music-api/generate", 12),
    "topaz-image-upscale": summary("topaz-image-upscale", 20),
    "bytedance/seedance-2-fast": summary("bytedance/seedance-2-fast", 9),
  };

  it("matches exact ids", () => {
    expect(resolveKiePricing(catalog, "ai-music-api/generate")?.unit_price).toBe(12);
  });

  it("matches via the curated alias map (Suno → ai-music-api)", () => {
    expect(resolveKiePricing(catalog, "generate-music")?.unit_price).toBe(12);
  });

  it("matches via normalized key (slug punctuation differs)", () => {
    expect(resolveKiePricing(catalog, "topaz/image-upscale")?.unit_price).toBe(20);
  });

  it("does NOT match a different model with a similar id (no wrong price)", () => {
    // seedance-2 must not borrow seedance-2-fast's price.
    expect(resolveKiePricing(catalog, "bytedance/seedance-2")).toBeUndefined();
    expect(resolveKiePricing(catalog, "bytedance/seedream-v4-edit")).toBeUndefined();
  });
});

describe("normalizeKieModelId", () => {
  it("collapses punctuation and case", () => {
    expect(normalizeKieModelId("topaz/image-upscale")).toBe(
      normalizeKieModelId("topaz-image-upscale"),
    );
    expect(normalizeKieModelId("bytedance/seedance-2")).not.toBe(
      normalizeKieModelId("bytedance/seedance-2-fast"),
    );
  });
});
