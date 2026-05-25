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

describe("aggregateKiePricingByModelId", () => {
  it("uses minimum credit price and marks multi-tier models as varies", () => {
    const records: KiePricingPageRecord[] = [
      {
        modelDescription: "flux 2 pro 2K",
        interfaceType: "image",
        provider: "BFL",
        creditPrice: "7.0",
        creditUnit: "per image",
        usdPrice: "0.035",
        falPrice: "",
        discountRate: 0,
        anchor: "https://kie.ai/flux-2?model=flux-2%2Fpro-text-to-image",
        discountPrice: false,
      },
      {
        modelDescription: "flux 2 pro 1K",
        interfaceType: "image",
        provider: "BFL",
        creditPrice: "5.0",
        creditUnit: "per image",
        usdPrice: "0.025",
        falPrice: "",
        discountRate: 0,
        anchor: "https://kie.ai/flux-2?model=flux-2%2Fpro-text-to-image",
        discountPrice: false,
      },
    ];

    const out = aggregateKiePricingByModelId(records);
    expect(out["flux-2/pro-text-to-image"]).toEqual({
      model_id: "flux-2/pro-text-to-image",
      unit_price: 5,
      billing_unit: "varies",
      currency: "credits",
      usd_price: 0.025,
      tier_count: 2,
      pricing_url: "https://kie.ai/flux-2",
    });
  });
});
