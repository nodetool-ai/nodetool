/**
 * The shared model-price lookup. Both the editor's cost preview and the
 * server-side pre-run budget estimate call this, so its answers are what a run
 * gets gated on.
 */
import { describe, it, expect } from "vitest";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import { getModelUnitPrice } from "../src/index.js";

const firstEntry = (
  catalog: { prices?: Record<string, unknown> },
  field: "unit_price" | "usd_price"
): { id: string; price: number } => {
  for (const [id, entry] of Object.entries(catalog.prices ?? {})) {
    const price = (entry as Record<string, unknown>)[field];
    if (typeof price === "number" && price > 0) return { id, price };
  }
  throw new Error(`no ${field} in catalog`);
};

describe("getModelUnitPrice", () => {
  it("prices a FAL endpoint from the bundled catalog", () => {
    const { id, price } = firstEntry(falUnitPricingCatalog, "unit_price");
    expect(getModelUnitPrice({ id, provider: "fal_ai" })).toMatchObject({
      unit_price: price,
      currency: "USD",
      source: "bundle"
    });
  });

  it("prices a kie model from its USD conversion, not its credit figure", () => {
    const { id, price } = firstEntry(kieUnitPricingCatalog, "usd_price");
    const found = getModelUnitPrice({ id, provider: "kie" });
    expect(found?.unit_price).toBeCloseTo(price);
    expect(found?.currency).toBe("USD");
  });

  it("returns null for a model in neither catalog", () => {
    expect(getModelUnitPrice({ id: "no-such/model", provider: null })).toBeNull();
  });
});
