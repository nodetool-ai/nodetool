/**
 * The shared model-price lookup. Both the editor's cost preview and the
 * server-side pre-run budget estimate call this, so its answers are what a run
 * gets gated on.
 */
import { describe, it, expect } from "vitest";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import { genspendPricingCatalog } from "../src/genspend-catalog.js";
import { getModelUnitPrice } from "../src/index.js";
import { priceGenspendEntry } from "../src/genspend-calc.js";

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

  it("prices a Topaz variant at its endpoint's rate", () => {
    const endpoint = "fal-ai/topaz/upscale/image";
    const base = getModelUnitPrice({ id: endpoint, provider: "fal_ai" });
    expect(base?.unit_price).toBeGreaterThan(0);
    expect(
      getModelUnitPrice({ id: `${endpoint}/Redefine`, provider: "fal_ai" })
    ).toEqual(base);
  });

  it("does not price an unrelated id that merely extends a FAL endpoint", () => {
    expect(
      getModelUnitPrice({ id: "fal-ai/flux/schnell/nope", provider: "fal_ai" })
    ).toBeNull();
  });

  it("prices a kie model from its USD conversion, not its credit figure", () => {
    const { id, price } = firstEntry(kieUnitPricingCatalog, "usd_price");
    const found = getModelUnitPrice({ id, provider: "kie" });
    expect(found?.unit_price).toBeCloseTo(price);
    expect(found?.currency).toBe("USD");
  });

  it("falls back to the GenSpend catalog for a model the provider catalogs miss", () => {
    const entry = Object.entries(genspendPricingCatalog.prices).find(
      ([key]) => key.startsWith("replicate:") && !kieUnitPricingCatalog.prices?.[key]
    );
    if (!entry) throw new Error("no Replicate price in the GenSpend catalog");
    const [key, price] = entry;
    const id = key.slice("replicate:".length);
    expect(getModelUnitPrice({ id, provider: "replicate" })).toEqual({
      unit_price: price.unit_price,
      billing_unit: price.billing_unit,
      currency: "USD",
      source: "bundle"
    });
  });

  it("does not price a GenSpend model against the wrong provider", () => {
    const [key] = Object.entries(genspendPricingCatalog.prices).find(([k]) =>
      k.startsWith("replicate:")
    )!;
    const id = key.slice("replicate:".length);
    expect(getModelUnitPrice({ id, provider: "together" })).toBeNull();
  });

  it("returns null for a model in no catalog", () => {
    expect(getModelUnitPrice({ id: "no-such/model", provider: null })).toBeNull();
  });

  it("prices a nodetool model at its delegate's rate", () => {
    const direct = getModelUnitPrice({
      id: "fal-ai/flux-1/schnell",
      provider: "fal_ai"
    });
    expect(direct).not.toBeNull();
    expect(
      getModelUnitPrice({ id: "nodetool/flux-schnell", provider: "nodetool" })
    ).toEqual(direct);
  });

  it("returns null for an unknown nodetool model id", () => {
    expect(
      getModelUnitPrice({ id: "nodetool/nope", provider: "nodetool" })
    ).toBeNull();
  });

  it("prices a GenSpend model through the calculator when params are given", () => {
    // A key the FAL and kie catalogs miss, so the GenSpend tier is the one asked.
    const entry = Object.entries(genspendPricingCatalog.prices).find(
      ([key, price]) =>
        (price.variants ?? []).some((v) => v.resolution) &&
        !falUnitPricingCatalog.prices?.[key.split(":").slice(1).join(":")] &&
        !kieUnitPricingCatalog.prices?.[key.split(":").slice(1).join(":")]
    );
    if (!entry) throw new Error("no laddered price in the GenSpend catalog");
    const [key, price] = entry;
    const [provider, ...rest] = key.split(":");
    const model = { id: rest.join(":"), provider };
    const params = { resolution: price.variants![0].resolution, seconds: 5 };

    // Routed: the scalar path carries no reasoning, the calculator does.
    expect(getModelUnitPrice(model, params)).toEqual(
      priceGenspendEntry(price, params)
    );
    expect(getModelUnitPrice(model)?.unit_price).toBe(price.unit_price);
  });

  it("leaves the FAL tier parameter-unaware for now", () => {
    const { id } = firstEntry(falUnitPricingCatalog, "unit_price");
    expect(getModelUnitPrice({ id, provider: "fal_ai" }, { seconds: 10 })).toEqual(
      getModelUnitPrice({ id, provider: "fal_ai" })
    );
  });
});
