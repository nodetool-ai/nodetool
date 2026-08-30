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
import { isParameterPriceable, priceGenspendEntry } from "../src/genspend-calc.js";

/**
 * The first catalog row priced per run — one image, one generation. A row
 * billed per second or per credit is a rate, not a run, and the lookup now
 * says so; those are pinned case by case below.
 */
const PER_RUN_UNITS = new Set(["images", "image", "generations", "videos"]);

const firstEntry = (
  catalog: { prices?: Record<string, unknown> },
  field: "unit_price" | "usd_price"
): { id: string; price: number } => {
  for (const [id, entry] of Object.entries(catalog.prices ?? {})) {
    const row = entry as Record<string, unknown>;
    const price = row[field];
    const unit = typeof row.billing_unit === "string" ? row.billing_unit : "";
    if (
      typeof price === "number" &&
      price > 0 &&
      PER_RUN_UNITS.has(unit.trim()) &&
      !genspendPricingCatalog.prices[`fal_ai:${id}`] &&
      !genspendPricingCatalog.prices[`kie:${id}`]
    ) {
      return { id, price };
    }
  }
  throw new Error(`no per-run ${field} in catalog`);
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
      ([key, price]) =>
        key.startsWith("replicate:") &&
        !kieUnitPricingCatalog.prices?.[key] &&
        !isParameterPriceable(price)
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
    // Without params the grid still answers — at the base spec, said out loud.
    expect(getModelUnitPrice(model)).toEqual(priceGenspendEntry(price, {}));
  });

  it("prices a per-second FAL endpoint for the stated clip, not per second", () => {
    // fal-ai/pixverse/c1: the FAL catalog's $0.005 is one second at the
    // cheapest rung; a 4 s 720p clip really bills 4 × $0.05.
    const price = getModelUnitPrice(
      { id: "fal-ai/pixverse/c1/text-to-video", provider: "fal_ai" },
      { resolution: "720p", seconds: 4 }
    );
    expect(price?.unit_price).toBeCloseTo(0.2, 6);
    expect(price?.seconds).toBe(4);
    expect(price?.resolution).toBe("720p");
    expect(price?.breakdown).toBe("4 s × $0.05/s at 720p");
    // The scalar the GenSpend grid now beats.
    expect(
      falUnitPricingCatalog.prices?.["fal-ai/pixverse/c1/text-to-video"]
        ?.unit_price
    ).toBe(0.005);
  });

  it("prices minimax/h3 off its published ladder", () => {
    const price = getModelUnitPrice(
      { id: "minimax/h3/text-to-video", provider: "fal_ai" },
      { resolution: "720p", seconds: 4 }
    );
    expect(price?.unit_price).toBeCloseTo(0.32, 6);
    expect(price?.seconds).toBe(4);
  });

  it("multiplies a per-second FAL scalar by the stated duration", () => {
    // A per-second FAL row the GenSpend catalog does not carry, so the
    // fallback scalar is what answers — as a whole run, not a rate.
    const entry = Object.entries(falUnitPricingCatalog.prices ?? {}).find(
      ([id, row]) =>
        (row as { billing_unit?: string }).billing_unit === "seconds" &&
        ((row as { unit_price?: number }).unit_price ?? 0) > 0 &&
        !genspendPricingCatalog.prices[`fal_ai:${id}`]
    );
    if (!entry) throw new Error("no per-second FAL row outside GenSpend");
    const [id, row] = entry;
    const rate = (row as { unit_price: number }).unit_price;
    const model = { id, provider: "fal_ai" };
    expect(getModelUnitPrice(model, { seconds: 6 })?.unit_price).toBeCloseTo(
      rate * 6,
      9
    );
    expect(getModelUnitPrice(model, { seconds: 6 })?.seconds).toBe(6);
    // Unstated duration is one second of output, said out loud.
    expect(getModelUnitPrice(model)?.unit_price).toBeCloseTo(rate, 9);
    expect(getModelUnitPrice(model)?.assumptions?.length).toBe(1);
  });

  it("divides a block-unit scalar into whole blocks, rounded up", () => {
    const entry = Object.entries(falUnitPricingCatalog.prices ?? {}).find(
      ([id, row]) =>
        (row as { billing_unit?: string }).billing_unit === "5 seconds" &&
        !genspendPricingCatalog.prices[`fal_ai:${id}`]
    );
    if (!entry) throw new Error("no 5-second FAL row outside GenSpend");
    const [id, row] = entry;
    const perBlock = (row as { unit_price: number }).unit_price;
    const price = getModelUnitPrice({ id, provider: "fal_ai" }, { seconds: 12 });
    // 12 s needs three 5-second blocks, not 2.4.
    expect(price?.unit_price).toBeCloseTo(perBlock * 3, 9);
    expect(price?.breakdown).toContain("3 × 5 s blocks");
  });

  it("declines a scalar whose unit has no fixed value per run", () => {
    const entry = Object.entries(falUnitPricingCatalog.prices ?? {}).find(
      ([id, row]) =>
        (row as { billing_unit?: string }).billing_unit === "units" &&
        !genspendPricingCatalog.prices[`fal_ai:${id}`]
    );
    if (!entry) throw new Error("no unit-billed FAL row outside GenSpend");
    const price = getModelUnitPrice({ id: entry[0], provider: "fal_ai" });
    expect(price?.declined).toContain("no fixed value per run");
    expect(price?.unit_price).toBe(0);
  });

  /** The first FAL row billed in `unit`, outside the GenSpend grid. */
  const falRowBilledIn = (unit: string): [string, { unit_price: number }] => {
    const entry = Object.entries(falUnitPricingCatalog.prices ?? {}).find(
      ([id, row]) =>
        (row as { billing_unit?: string }).billing_unit?.trim() === unit &&
        ((row as { unit_price?: number }).unit_price ?? 0) > 0 &&
        !genspendPricingCatalog.prices[`fal_ai:${id}`]
    );
    if (!entry) throw new Error(`no ${unit}-billed FAL row outside GenSpend`);
    return entry as [string, { unit_price: number }];
  };

  it("declines a rate over something the node never states", () => {
    // 222 FAL rows bill "compute seconds" — wall-clock time on FAL's machines.
    // No node property says how long that will be, so the rate is not a run.
    const [id] = falRowBilledIn("compute seconds");
    const price = getModelUnitPrice({ id, provider: "fal_ai" });
    expect(price?.declined).toContain("compute seconds");
    expect(price?.unit_price).toBe(0);
  });

  it("prorates a per-minute scalar over the stated duration", () => {
    const [id, row] = falRowBilledIn("minutes");
    const model = { id, provider: "fal_ai" };
    expect(getModelUnitPrice(model, { seconds: 90 })?.unit_price).toBeCloseTo(
      row.unit_price * 1.5,
      9
    );
    // Unstated duration is one minute, said out loud.
    expect(getModelUnitPrice(model)?.unit_price).toBeCloseTo(row.unit_price, 9);
    expect(getModelUnitPrice(model)?.assumptions?.length).toBe(1);
  });

  it("multiplies a per-megapixel scalar by the output size", () => {
    const [id, row] = falRowBilledIn("megapixels");
    const model = { id, provider: "fal_ai" };
    expect(
      getModelUnitPrice(model, { megapixels: 4.19 })?.unit_price
    ).toBeCloseTo(row.unit_price * 4.19, 9);
    // Unstated size is one megapixel, said out loud.
    expect(getModelUnitPrice(model)?.unit_price).toBeCloseTo(row.unit_price, 9);
    expect(getModelUnitPrice(model)?.assumptions?.length).toBe(1);
  });

  it("prices a speech model by the characters it will synthesize", () => {
    // ElevenLabs publishes $100 per million characters. Read as a per-run
    // figure that made one line of dialogue cost $100.
    const model = { id: "eleven_multilingual_v2", provider: "elevenlabs" };
    const entry = genspendPricingCatalog.prices["elevenlabs:eleven_multilingual_v2"];
    expect(entry?.unit_class).toBe("per-1m-chars");

    const price = getModelUnitPrice(model, { characters: 200 });
    expect(price?.declined).toBeUndefined();
    expect(price?.unit_price).toBeCloseTo((entry.unit_price * 200) / 1_000_000, 12);
    expect(price?.breakdown).toContain("200 chars");
    expect(price?.characters).toBe(200);
  });

  it("declines a character-billed model when no text length is given", () => {
    const price = getModelUnitPrice({
      id: "eleven_multilingual_v2",
      provider: "elevenlabs"
    });
    expect(price?.declined).toContain("no text length");
    // The block price must never reach a caller as the price of a run.
    expect(price?.unit_price).toBe(0);
  });

  it("prices a character-billed model that also publishes a variant grid", () => {
    // This row is parameter-priceable (it carries a tier variant), so it takes
    // the GenSpend calculator's path rather than the flat-scalar one.
    const id = "fal-ai/elevenlabs/tts/turbo-v2.5";
    const entry = genspendPricingCatalog.prices[`fal_ai:${id}`];
    expect(isParameterPriceable(entry)).toBe(true);
    const price = getModelUnitPrice({ id, provider: "fal_ai" }, { characters: 1000 });
    expect(price?.unit_price).toBeCloseTo((entry.unit_price * 1000) / 1_000_000, 12);
  });

  it("declines a speech model billed per token of generated audio", () => {
    // A script's text says nothing about how many audio tokens come out, so
    // there is no honest conversion — $12 per million must not read as $12.
    const price = getModelUnitPrice(
      { id: "gpt-4o-mini-tts", provider: "openai" },
      { characters: 200 }
    );
    expect(price?.declined).toContain("token");
    expect(price?.unit_price).toBe(0);
  });

  it("leaves image and video pricing untouched", () => {
    expect(
      getModelUnitPrice(
        { id: "fal-ai/flux/schnell", provider: "fal_ai" },
        { resolution: "1K", megapixels: 1 }
      )?.unit_price
    ).toBeGreaterThan(0);
    const clip = getModelUnitPrice(
      { id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", provider: "fal_ai" },
      { resolution: "1080p", seconds: 5 }
    );
    expect(clip?.breakdown).toContain("5 s ×");
  });

  it("warns that a collapsed kie row is the cheapest of its tiers", () => {
    const entry = Object.entries(kieUnitPricingCatalog.prices ?? {}).find(
      ([id, row]) =>
        ((row as { tier_count?: number }).tier_count ?? 0) > 1 &&
        typeof (row as { usd_price?: number }).usd_price === "number" &&
        !genspendPricingCatalog.prices[`kie:${id}`]
    );
    if (!entry) throw new Error("no collapsed kie row outside GenSpend");
    const price = getModelUnitPrice({ id: entry[0], provider: "kie" });
    expect(price?.warnings?.join(" ")).toContain("lower bound");
  });
});
