/**
 * @jest-environment node
 */
import {
  isFalVagueBillingSummary,
  formatFalUnitPricingShort,
  formatFalUnitPricingTooltip,
  formatFalPerRunEstimate,
} from "../formatFalUnitPricing";
import type { FalUnitPricing } from "../../stores/ApiTypes";

describe("isFalVagueBillingSummary", () => {
  it('returns true for "unit" and "units"', () => {
    expect(isFalVagueBillingSummary({ billing_unit: "unit" })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "units" })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "Units" })).toBe(true);
  });

  it('returns true for "credit" and "credits"', () => {
    expect(isFalVagueBillingSummary({ billing_unit: "credit" })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "credits" })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "Credits" })).toBe(true);
  });

  it("returns false for specific billing units", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "image" })).toBe(false);
    expect(isFalVagueBillingSummary({ billing_unit: "second" })).toBe(false);
    expect(isFalVagueBillingSummary({ billing_unit: "megapixel" })).toBe(false);
  });

  it("handles whitespace-padded values", () => {
    expect(isFalVagueBillingSummary({ billing_unit: "  units  " })).toBe(true);
    expect(isFalVagueBillingSummary({ billing_unit: "  credits  " })).toBe(true);
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

  it('returns "pricing varies" for vague billing units', () => {
    const p = {
      unit_price: 1,
      currency: "USD",
      billing_unit: "units",
      endpoint_id: "openai/gpt-image-2",
    } as FalUnitPricing;
    expect(formatFalUnitPricingShort(p)).toBe("pricing varies");
  });

  it('returns "pricing varies" for credits billing', () => {
    const p = {
      unit_price: 1,
      currency: "USD",
      billing_unit: "credits",
      endpoint_id: "fal-ai/gpt-image-1-mini",
    } as FalUnitPricing;
    expect(formatFalUnitPricingShort(p)).toBe("pricing varies");
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

describe("formatFalPerRunEstimate", () => {
  it("formats historical per-run estimate", () => {
    const line = formatFalPerRunEstimate(0.042, "USD");
    expect(line).toMatch(/0[,.]042/);
    expect(line).toContain("per run");
    expect(line).toContain("historical");
  });
});
