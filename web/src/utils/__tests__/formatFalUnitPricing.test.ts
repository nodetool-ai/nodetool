/**
 * @jest-environment node
 */
import {
  isFalVagueBillingSummary,
  formatFalUnitPricingShort,
  formatFalUnitPricingTooltip,
} from "../formatFalUnitPricing";
import type { FalUnitPricing } from "../../stores/ApiTypes";

describe("isFalVagueBillingSummary", () => {
  it('returns true for "unit" and "units"', () => {
    expect(isFalVagueBillingSummary({ billing_unit: "unit" })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "units" })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "Units" })).toBe(true);
  });

  it("returns false for specific billing units", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "image" })).toBe(false);
    expect(isFalVagueBillingSummary({ billing_unit: "second" })).toBe(false);
    expect(isFalVagueBillingSummary({ billing_unit: "megapixel" })).toBe(false);
  });

  it("handles whitespace-padded values", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "  units  " })).toBe(true);
  });
});

describe("formatFalUnitPricingShort", () => {
  it("formats a simple USD price", () => {
    const p = {
      unit_price: 0.05,
      currency: "USD",
      billing_unit: "image",
      endpoint_id: "test/model",
    } as FalUnitPricing;
    const result = formatFalUnitPricingShort(p);
    expect(result).toContain("0.05");
  });

  it("formats a very small price with extra decimal digits", () => {
    const p = {
      unit_price: 0.001,
      currency: "USD",
      billing_unit: "image",
      endpoint_id: "test/model",
    } as FalUnitPricing;
    const result = formatFalUnitPricingShort(p);
    expect(result).toContain("0.001");
  });

  it("formats a zero price", () => {
    const p = {
      unit_price: 0,
      currency: "USD",
      billing_unit: "image",
      endpoint_id: "test/model",
    } as FalUnitPricing;
    const result = formatFalUnitPricingShort(p);
    expect(result).toContain("0.00");
  });
});

describe("formatFalUnitPricingTooltip", () => {
  const base: FalUnitPricing = {
    unit_price: 0.05,
    currency: "USD",
    billing_unit: "image",
    endpoint_id: "fal-ai/flux/dev",
    checked_at: null,
  } as FalUnitPricing;

  it("includes the money and billing unit", () => {
    const tooltip = formatFalUnitPricingTooltip(base);
    expect(tooltip).toContain("per image");
    expect(tooltip).toContain("0.05");
  });

  it("includes the endpoint ID", () => {
    const tooltip = formatFalUnitPricingTooltip(base);
    expect(tooltip).toContain("fal-ai/flux/dev");
  });

  it('adds SEE DETAILS warning for vague "units" billing', () => {
    const vague: FalUnitPricing = {
      ...base,
      billing_unit: "units",
    };
    const tooltip = formatFalUnitPricingTooltip(vague);
    expect(tooltip).toContain("SEE DETAILS");
    expect(tooltip).toContain("Varies by resolution");
  });

  it("does not add SEE DETAILS for specific billing units", () => {
    const tooltip = formatFalUnitPricingTooltip(base);
    expect(tooltip).not.toContain("SEE DETAILS");
  });

  it('shows "date unknown" when checked_at is null', () => {
    const tooltip = formatFalUnitPricingTooltip(base);
    expect(tooltip).toContain("date unknown");
  });
});
