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

  it("keeps the unit for multi-tier models that share one (e.g. per second)", () => {
    expect(
      formatKieUnitPricingShort({ ...base, billing_unit: "second", tier_count: 4 }),
    ).toBe("from 5 credits / second");
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
    expect(tooltip).toMatch(/credits per image/);
  });

  it("avoids per varies copy for multi-tier models", () => {
    const tooltip = formatKieUnitPricingTooltip({
      model_id: "flux-2/flex-image-to-image",
      unit_price: 14,
      billing_unit: "varies",
      currency: "credits",
      tier_count: 3,
      usd_price: 0.07,
    });
    expect(tooltip).toContain("From 14 credits");
    expect(tooltip).not.toContain("per varies");
    expect(tooltip).toContain("Varies by resolution, duration, and quality.");
  });

  it("shows the per-unit rate for multi-tier models that share a unit", () => {
    const tooltip = formatKieUnitPricingTooltip({
      model_id: "bytedance/seedance-2-fast",
      unit_price: 9,
      billing_unit: "second",
      currency: "credits",
      tier_count: 4,
      usd_price: 0.045,
    });
    expect(tooltip).toContain("From 9 credits per second");
    expect(tooltip).toContain("Varies by resolution, duration, and quality.");
  });
});
