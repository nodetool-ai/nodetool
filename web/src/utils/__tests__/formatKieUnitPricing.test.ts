/**
 * @jest-environment node
 */
import {
  formatKieUnitPricingShort,
  formatKieUnitPricingTooltip,
  isKieVagueBillingSummary,
} from "../formatKieUnitPricing";
import type { KieUnitPricing } from "../../stores/ApiTypes";

describe("isKieVagueBillingSummary", () => {
  it("is true when tier_count > 1 or billing_unit is varies", () => {
    expect(
      isKieVagueBillingSummary({ billing_unit: "image", tier_count: 2 }),
    ).toBe(true);
    expect(isKieVagueBillingSummary({ billing_unit: "varies" })).toBe(true);
    expect(isKieVagueBillingSummary({ billing_unit: "image", tier_count: 1 })).toBe(
      false,
    );
  });
});

describe("formatKieUnitPricingShort", () => {
  const base: KieUnitPricing = {
    model_id: "grok-imagine/text-to-image",
    unit_price: 5,
    billing_unit: "4 images",
    currency: "credits",
  };

  it("formats credits with billing unit", () => {
    expect(formatKieUnitPricingShort(base)).toBe("5 credits / 4 images");
  });

  it("prefixes from when pricing varies", () => {
    expect(
      formatKieUnitPricingShort({ ...base, billing_unit: "varies", tier_count: 3 }),
    ).toBe("from 5 credits");
  });
});

describe("formatKieUnitPricingTooltip", () => {
  it("includes model id", () => {
    const tooltip = formatKieUnitPricingTooltip({
      model_id: "seedream/4.5-text-to-image",
      unit_price: 6.5,
      billing_unit: "image",
      currency: "credits",
      usd_price: 0.0325,
    });
    expect(tooltip).toContain("seedream/4.5-text-to-image");
    expect(tooltip).toContain("USD");
  });
});
