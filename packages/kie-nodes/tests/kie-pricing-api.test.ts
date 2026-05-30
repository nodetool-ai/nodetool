import { describe, expect, it } from "vitest";
import {
  aggregateKiePricingByModelId,
  modelIdFromKiePricingAnchor,
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
});
