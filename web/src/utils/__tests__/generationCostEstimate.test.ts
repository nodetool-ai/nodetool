/**
 * estimateGenerationCost — priced against the shipped catalogs, not a mock, so
 * a catalog change that breaks the editors' figures fails here too.
 */

import { estimateGenerationCost } from "../generationCostEstimate";

/** A fal video endpoint whose published grid sells 720p and 1080p apart. */
const VIDEO = { provider: "fal_ai", model: "wan/v2.6/image-to-video" };
/** A fal image endpoint with a 1K / 2K / 4K ladder. */
const IMAGE = { provider: "fal_ai", model: "fal-ai/nano-banana-2" };

describe("estimateGenerationCost", () => {
  it("returns nothing while no model is picked", () => {
    expect(
      estimateGenerationCost({ kind: "video", provider: "fal_ai", seconds: 5 })
    ).toBeNull();
  });

  it("returns nothing for a model no catalog prices", () => {
    expect(
      estimateGenerationCost({
        kind: "image",
        provider: "fal_ai",
        model: "totally-not-a-real-model-xyz"
      })
    ).toBeNull();
  });

  it("bills a per-second video model for the clip's whole duration", () => {
    const five = estimateGenerationCost({
      ...VIDEO,
      kind: "video",
      resolution: "720p",
      seconds: 5
    });
    const ten = estimateGenerationCost({
      ...VIDEO,
      kind: "video",
      resolution: "720p",
      seconds: 10
    });
    expect(five?.total).toBeGreaterThan(0);
    expect(ten?.total).toBeCloseTo((five?.total ?? 0) * 2, 10);
    expect(five?.breakdown).toContain("5 s");
  });

  it("prices a video rung apart from the one below it", () => {
    const hd = estimateGenerationCost({
      ...VIDEO,
      kind: "video",
      resolution: "720p",
      seconds: 5
    });
    const fullHd = estimateGenerationCost({
      ...VIDEO,
      kind: "video",
      resolution: "1080p",
      seconds: 5
    });
    expect(fullHd?.total).toBeGreaterThan(hd?.total ?? 0);
  });

  it("multiplies an image price by the fan-out", () => {
    const one = estimateGenerationCost({ ...IMAGE, kind: "image" });
    const four = estimateGenerationCost({
      ...IMAGE,
      kind: "image",
      quantity: 4
    });
    expect(one?.total).toBeGreaterThan(0);
    expect(one?.quantity).toBe(1);
    expect(four?.quantity).toBe(4);
    expect(four?.total).toBeCloseTo((one?.total ?? 0) * 4, 10);
  });

  it("reads the megapixels off a stored pixel size", () => {
    const bySize = estimateGenerationCost({
      ...IMAGE,
      kind: "image",
      width: 2048,
      height: 2048
    });
    const byPreset = estimateGenerationCost({
      ...IMAGE,
      kind: "image",
      resolution: "2K",
      aspectRatio: "1:1"
    });
    expect(bySize?.total).toBeGreaterThan(0);
    expect(bySize?.total).toBe(byPreset?.total);
  });
});
