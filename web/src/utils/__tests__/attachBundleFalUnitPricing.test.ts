/** @jest-environment node */

jest.mock("@nodetool/fal-node-type-pricing", () => ({
  __esModule: true,
  default: {
    writtenAt: "2026-01-15T00:00:00Z",
    byNodeType: {
      "fal.TextToImage": {
        endpoint_id: "fal-ai/fast-sdxl",
        unit_price: 0.01,
        billing_unit: "image",
        currency: "usd",
      },
    },
  },
}));

jest.mock("@nodetool/fal-unit-pricing-catalog", () => ({
  __esModule: true,
  default: {
    writtenAt: "2026-01-14T00:00:00Z",
  },
}));

import { attachBundleFalUnitPricing } from "../attachBundleFalUnitPricing";

describe("attachBundleFalUnitPricing", () => {
  it("attaches pricing when metadata has none", () => {
    const metadata = {
      "fal.TextToImage": { node_type: "fal.TextToImage" } as any,
    };
    attachBundleFalUnitPricing(metadata);
    expect(metadata["fal.TextToImage"].fal_unit_pricing).toEqual({
      endpoint_id: "fal-ai/fast-sdxl",
      unit_price: 0.01,
      billing_unit: "image",
      currency: "usd",
      source: "bundle",
      checked_at: "2026-01-14T00:00:00Z",
    });
  });

  it("does not overwrite live pricing", () => {
    const livePricing = {
      endpoint_id: "fal-ai/fast-sdxl",
      unit_price: 0.02,
      billing_unit: "image",
      currency: "usd",
      source: "live" as const,
      checked_at: "2026-01-13T00:00:00Z",
    };
    const metadata = {
      "fal.TextToImage": {
        node_type: "fal.TextToImage",
        fal_unit_pricing: { ...livePricing },
      } as any,
    };
    attachBundleFalUnitPricing(metadata);
    expect(metadata["fal.TextToImage"].fal_unit_pricing).toEqual(livePricing);
  });

  it("fills checked_at for SDK pricing without a date", () => {
    const metadata = {
      "fal.TextToImage": {
        node_type: "fal.TextToImage",
        fal_unit_pricing: {
          endpoint_id: "fal-ai/fast-sdxl",
          unit_price: 0.01,
          billing_unit: "image",
          currency: "usd",
          source: undefined,
          checked_at: undefined,
        },
      } as any,
    };
    attachBundleFalUnitPricing(metadata);
    expect(metadata["fal.TextToImage"].fal_unit_pricing.checked_at).toBe(
      "2026-01-14T00:00:00Z"
    );
    expect(metadata["fal.TextToImage"].fal_unit_pricing.source).toBe("bundle");
  });

  it("skips entries not in the bundle", () => {
    const metadata = {
      "fal.Other": { node_type: "fal.Other" } as any,
    };
    attachBundleFalUnitPricing(metadata);
    expect(metadata["fal.Other"].fal_unit_pricing).toBeUndefined();
  });

  it("skips when endpoint_id does not match", () => {
    const original = {
      endpoint_id: "fal-ai/different-model",
      unit_price: 0.05,
      billing_unit: "image",
      currency: "usd",
      source: undefined,
      checked_at: undefined,
    };
    const metadata = {
      "fal.TextToImage": {
        node_type: "fal.TextToImage",
        fal_unit_pricing: { ...original },
      } as any,
    };
    attachBundleFalUnitPricing(metadata);
    expect(metadata["fal.TextToImage"].fal_unit_pricing).toEqual(original);
  });
});
