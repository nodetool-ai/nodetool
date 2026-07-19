import type { FalUnitPricing } from "../stores/ApiTypes";
import {
  isFalVagueBillingSummary,
  formatFalPerRunEstimate,
  formatFalUnitPricingShort,
  formatFalUnitPricingTooltip,
} from "./formatFalUnitPricing";

function makePricing(overrides: Partial<FalUnitPricing> = {}): FalUnitPricing {
  return {
    endpoint_id: "fal-ai/flux/schnell",
    unit_price: 0.025,
    billing_unit: "image",
    currency: "USD",
    ...overrides,
  };
}

describe("isFalVagueBillingSummary", () => {
  it("returns false for a concrete billing unit like 'image'", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "image" })).toBe(false);
  });

  it("returns true when billing_unit is 'unit'", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "unit" })).toBe(true);
  });

  it("returns true when billing_unit is 'units'", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "units" })).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "Units" })).toBe(true);
  });

  it("returns false for 'megapixel'", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "megapixel" })).toBe(false);
  });
});

describe("formatFalPerRunEstimate", () => {
  it("formats a small estimate with currency symbol", () => {
    const result = formatFalPerRunEstimate(0.03, "USD");
    expect(result).toContain("$0.03");
    expect(result).toContain("per run");
    expect(result).toContain("historical avg");
  });

  it("formats a very small amount with 4 decimal places", () => {
    const result = formatFalPerRunEstimate(0.003, "USD");
    expect(result).toContain("0.003");
  });
});

describe("formatFalUnitPricingShort", () => {
  it("formats the unit price as money", () => {
    const result = formatFalUnitPricingShort(makePricing({ unit_price: 0.05, currency: "USD" }));
    expect(result).toContain("$");
    expect(result).toContain("0.05");
  });

  it("handles zero price", () => {
    const result = formatFalUnitPricingShort(makePricing({ unit_price: 0 }));
    expect(result).toContain("$");
  });
});

describe("formatFalUnitPricingTooltip", () => {
  it("includes the endpoint_id", () => {
    const tooltip = formatFalUnitPricingTooltip(makePricing());
    expect(tooltip).toContain("fal-ai/flux/schnell");
  });

  it("includes the billing unit", () => {
    const tooltip = formatFalUnitPricingTooltip(makePricing({ billing_unit: "megapixel" }));
    expect(tooltip).toContain("megapixel");
  });

  it("shows SEE DETAILS for vague billing units", () => {
    const tooltip = formatFalUnitPricingTooltip(makePricing({ billing_unit: "units" }));
    expect(tooltip).toContain("SEE DETAILS");
    expect(tooltip).toContain("fal.ai");
  });

  it("does not show SEE DETAILS for concrete billing units", () => {
    const tooltip = formatFalUnitPricingTooltip(makePricing({ billing_unit: "image" }));
    expect(tooltip).not.toContain("SEE DETAILS");
  });

  it("shows 'date unknown' when checked_at is null", () => {
    const tooltip = formatFalUnitPricingTooltip(makePricing({ checked_at: null }));
    expect(tooltip).toContain("date unknown");
  });
});
