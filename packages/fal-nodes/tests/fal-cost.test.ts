import { describe, it, expect, vi } from "vitest";
import {
  estimateFalCost,
  reportFalCost,
  getFalPricing
} from "../src/fal-cost.js";

// Real node types from the generated pricing table, one per billing unit.
// Costs are read from `getFalPricing` at runtime so the assertions survive
// pricing-value updates — only the inferred quantity logic is pinned here.
const MEGAPIXELS = "fal.audio_to_video.Ltx219BDistilledAudioToVideoLora";
const IMAGES = "fal.image_to_image.IdeogramV2Edit";
const SECONDS = "fal.audio_to_audio.NovaSr";
const GENERATIONS = "fal.3d_to_3d.Ultrashape";

describe("estimateFalCost", () => {
  it("returns null for an unknown node type", () => {
    expect(estimateFalCost("fal.nope.DoesNotExist", {})).toBeNull();
  });

  it("treats per-generation calls as a single unit", () => {
    const pricing = getFalPricing(GENERATIONS)!;
    expect(pricing.billing_unit).toBe("generations");

    const est = estimateFalCost(GENERATIONS, {})!;
    expect(est.provider).toBe("fal");
    expect(est.model).toBe(pricing.endpoint_id);
    expect(est.currency).toBe("USD");
    expect(est.quantity).toBe(1);
    expect(est.cost).toBeCloseTo(pricing.unit_price);
  });

  it("derives megapixels from output image dimensions", () => {
    const pricing = getFalPricing(MEGAPIXELS)!;
    expect(pricing.billing_unit).toBe("megapixels");

    const est = estimateFalCost(MEGAPIXELS, {
      images: [{ width: 1024, height: 1024 }]
    })!;
    const expectedMp = (1024 * 1024) / 1_000_000;
    expect(est.quantity).toBeCloseTo(expectedMp);
    expect(est.cost).toBeCloseTo(pricing.unit_price * expectedMp);
  });

  it("counts output images for per-image billing", () => {
    const est = estimateFalCost(IMAGES, {
      images: [{ width: 1, height: 1 }, { width: 1, height: 1 }]
    })!;
    expect(est.quantity).toBe(2);
  });

  it("uses media duration for per-second billing", () => {
    const pricing = getFalPricing(SECONDS)!;
    const est = estimateFalCost(SECONDS, { duration: 8 })!;
    expect(est.quantity).toBe(8);
    expect(est.cost).toBeCloseTo(pricing.unit_price * 8);
  });

  it("parses duration strings with unit suffixes (e.g. \"8s\")", () => {
    const est = estimateFalCost(SECONDS, { video: { duration: "8s" } })!;
    expect(est.quantity).toBe(8);
  });

  it("falls back to a single unit when duration is unknown", () => {
    const est = estimateFalCost(SECONDS, {})!;
    expect(est.quantity).toBe(1);
  });
});

describe("reportFalCost", () => {
  it("reports an estimated cost onto the context", () => {
    const setProviderCost = vi.fn();
    reportFalCost({ setProviderCost }, GENERATIONS, {});

    expect(setProviderCost).toHaveBeenCalledTimes(1);
    const [provider, amount, unit, details] = setProviderCost.mock.calls[0];
    const pricing = getFalPricing(GENERATIONS)!;
    expect(provider).toBe("fal");
    expect(amount).toBeCloseTo(pricing.unit_price);
    expect(unit).toBe("USD");
    expect(details).toMatchObject({
      model: pricing.endpoint_id,
      billing_unit: "generations",
      quantity: 1,
      unit_price: pricing.unit_price,
      currency: "USD"
    });
  });

  it("is a no-op for unknown node types", () => {
    const setProviderCost = vi.fn();
    reportFalCost({ setProviderCost }, "fal.nope.DoesNotExist", {});
    expect(setProviderCost).not.toHaveBeenCalled();
  });

  it("is a no-op when the context can't receive provider costs", () => {
    expect(() => reportFalCost(null, GENERATIONS, {})).not.toThrow();
    expect(() => reportFalCost({}, GENERATIONS, {})).not.toThrow();
  });
});
