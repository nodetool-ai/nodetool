/** @jest-environment node */

jest.mock("@nodetool/kie-node-type-pricing", () => ({
  __esModule: true,
  default: {
    writtenAt: "2026-02-10T00:00:00Z",
    byNodeType: {
      "kie.TextToImage": {
        model_id: "kie-ai/fast-gen",
        unit_price: 5,
        billing_unit: "image",
        currency: "credits"
      }
    }
  }
}));

jest.mock("@nodetool/kie-unit-pricing-catalog", () => ({
  __esModule: true,
  default: {
    writtenAt: "2026-02-09T00:00:00Z"
  }
}));

import { attachBundleKieUnitPricing } from "../attachBundleKieUnitPricing";

describe("attachBundleKieUnitPricing", () => {
  it("attaches pricing when metadata has none", () => {
    const metadata = {
      "kie.TextToImage": { node_type: "kie.TextToImage" } as any
    };
    attachBundleKieUnitPricing(metadata);
    expect(metadata["kie.TextToImage"].kie_unit_pricing).toEqual({
      model_id: "kie-ai/fast-gen",
      unit_price: 5,
      billing_unit: "image",
      currency: "credits",
      source: "bundle",
      checked_at: "2026-02-09T00:00:00Z"
    });
  });

  it("does not overwrite live pricing", () => {
    const livePricing = {
      model_id: "kie-ai/fast-gen",
      unit_price: 8,
      billing_unit: "image",
      currency: "credits" as const,
      source: "live" as const,
      checked_at: "2026-02-08T00:00:00Z"
    };
    const metadata = {
      "kie.TextToImage": {
        node_type: "kie.TextToImage",
        kie_unit_pricing: { ...livePricing }
      } as any
    };
    attachBundleKieUnitPricing(metadata);
    expect(metadata["kie.TextToImage"].kie_unit_pricing).toEqual(livePricing);
  });

  it("fills checked_at for pricing without a date", () => {
    const metadata = {
      "kie.TextToImage": {
        node_type: "kie.TextToImage",
        kie_unit_pricing: {
          model_id: "kie-ai/fast-gen",
          unit_price: 5,
          billing_unit: "image",
          currency: "credits",
          source: undefined,
          checked_at: undefined
        }
      } as any
    };
    attachBundleKieUnitPricing(metadata);
    expect(metadata["kie.TextToImage"].kie_unit_pricing.checked_at).toBe(
      "2026-02-09T00:00:00Z"
    );
    expect(metadata["kie.TextToImage"].kie_unit_pricing.source).toBe("bundle");
  });

  it("skips entries not in the bundle", () => {
    const metadata = {
      "kie.Other": { node_type: "kie.Other" } as any
    };
    attachBundleKieUnitPricing(metadata);
    expect(metadata["kie.Other"].kie_unit_pricing).toBeUndefined();
  });

  it("skips when model_id does not match", () => {
    const original = {
      model_id: "kie-ai/different-model",
      unit_price: 10,
      billing_unit: "image",
      currency: "credits" as const,
      source: undefined,
      checked_at: undefined
    };
    const metadata = {
      "kie.TextToImage": {
        node_type: "kie.TextToImage",
        kie_unit_pricing: { ...original }
      } as any
    };
    attachBundleKieUnitPricing(metadata);
    expect(metadata["kie.TextToImage"].kie_unit_pricing).toEqual(original);
  });

  it("preserves existing pricing that already has a checked_at date", () => {
    const existing = {
      model_id: "kie-ai/fast-gen",
      unit_price: 5,
      billing_unit: "image",
      currency: "credits" as const,
      source: "bundle" as const,
      checked_at: "2026-01-01T00:00:00Z"
    };
    const metadata = {
      "kie.TextToImage": {
        node_type: "kie.TextToImage",
        kie_unit_pricing: { ...existing }
      } as any
    };
    attachBundleKieUnitPricing(metadata);
    expect(metadata["kie.TextToImage"].kie_unit_pricing).toEqual(existing);
  });
});
