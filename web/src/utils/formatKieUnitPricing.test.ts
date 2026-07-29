import type { KieUnitPricing } from "../stores/ApiTypes";
import {
  isKieVagueBillingSummary,
  formatKieUnitPricingShort,
  formatKieUnitPricingTooltip,
  kiePricingExternalUrl,
} from "./formatKieUnitPricing";

function makePricing(overrides: Partial<KieUnitPricing> = {}): KieUnitPricing {
  return {
    model_id: "test-model",
    unit_price: 10,
    billing_unit: "image",
    currency: "credits",
    ...overrides,
  };
}

describe("isKieVagueBillingSummary", () => {
  it("returns false for a concrete billing unit", () => {
    expect(isKieVagueBillingSummary(makePricing({ billing_unit: "image" }))).toBe(false);
  });

  it("returns true when billing_unit is 'varies'", () => {
    expect(isKieVagueBillingSummary(makePricing({ billing_unit: "varies" }))).toBe(true);
  });

  it("returns true when billing_unit is 'Varies' (case-insensitive)", () => {
    expect(isKieVagueBillingSummary(makePricing({ billing_unit: "Varies" }))).toBe(true);
  });

  it("returns true when tier_count > 1", () => {
    expect(
      isKieVagueBillingSummary(makePricing({ billing_unit: "image", tier_count: 3 }))
    ).toBe(true);
  });

  it("returns false when tier_count is 1", () => {
    expect(
      isKieVagueBillingSummary(makePricing({ billing_unit: "image", tier_count: 1 }))
    ).toBe(false);
  });
});

describe("formatKieUnitPricingShort", () => {
  it("formats a simple per-unit price", () => {
    const result = formatKieUnitPricingShort(makePricing({ unit_price: 5, billing_unit: "image" }));
    expect(result).toContain("5");
    expect(result).toContain("credits");
    expect(result).toContain("image");
  });

  it("omits unit suffix for 'run' billing unit", () => {
    const result = formatKieUnitPricingShort(makePricing({ unit_price: 3, billing_unit: "run" }));
    expect(result).toContain("3");
    expect(result).toContain("credits");
    expect(result).not.toContain("run");
  });

  it("shows 'from' prefix for vague pricing", () => {
    const result = formatKieUnitPricingShort(
      makePricing({ unit_price: 2, billing_unit: "varies" })
    );
    expect(result).toMatch(/^from /i);
  });

  it("handles fractional prices", () => {
    const result = formatKieUnitPricingShort(makePricing({ unit_price: 0.5, billing_unit: "second" }));
    expect(result).toContain("0.5");
  });
});

describe("formatKieUnitPricingTooltip", () => {
  it("includes model_id", () => {
    const tooltip = formatKieUnitPricingTooltip(makePricing({ model_id: "flux-pro" }));
    expect(tooltip).toContain("flux-pro");
  });

  it("includes USD price when provided", () => {
    const tooltip = formatKieUnitPricingTooltip(
      makePricing({ usd_price: 0.0035 })
    );
    expect(tooltip).toContain("$0.0035");
  });

  it("omits USD line when usd_price is null", () => {
    const tooltip = formatKieUnitPricingTooltip(
      makePricing({ usd_price: undefined })
    );
    expect(tooltip).not.toContain("$");
  });

  it("mentions kie.ai for vague pricing", () => {
    const tooltip = formatKieUnitPricingTooltip(
      makePricing({ billing_unit: "varies" })
    );
    expect(tooltip).toContain("kie.ai");
  });

  it("shows 'date unknown' when checked_at is null", () => {
    const tooltip = formatKieUnitPricingTooltip(
      makePricing({ checked_at: null })
    );
    expect(tooltip).toContain("date unknown");
  });
});

describe("kiePricingExternalUrl", () => {
  it("returns pricing_url when provided", () => {
    const url = kiePricingExternalUrl(
      makePricing({ pricing_url: "https://kie.ai/models/flux" })
    );
    expect(url).toBe("https://kie.ai/models/flux");
  });

  it("falls back to kie.ai/pricing when pricing_url is empty", () => {
    expect(kiePricingExternalUrl(makePricing({ pricing_url: "" }))).toBe(
      "https://kie.ai/pricing"
    );
  });

  it("falls back to kie.ai/pricing when pricing_url is undefined", () => {
    expect(kiePricingExternalUrl(makePricing({ pricing_url: undefined }))).toBe(
      "https://kie.ai/pricing"
    );
  });
});
