/**
 * Layer binding → price mapping, and what a document adds up to. Priced
 * against the shipped catalogs rather than a mock.
 */

import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import { layerGenerationSpec } from "../useLayerCostEstimate";
import { summarizeLayerCosts } from "../useSketchCostEstimate";

/** A fal image endpoint with a 1K / 2K / 4K ladder. */
const IMAGE = { provider: "fal_ai", model: "fal-ai/nano-banana-2" };

function binding(
  overrides: Partial<LayerWorkflowBinding> = {}
): LayerWorkflowBinding {
  return {
    layerId: "l1",
    kind: "text-to-image",
    ...IMAGE,
    resolution: "1K",
    aspectRatio: "1:1",
    status: "draft",
    versions: [],
    ...overrides
  };
}

describe("layerGenerationSpec", () => {
  it("declines a workflow-bound layer — its cost is its graph's", () => {
    expect(
      layerGenerationSpec(binding({ kind: "workflow", workflowId: "w1" }))
    ).toBeNull();
  });

  it("declines a layer with no model picked", () => {
    expect(layerGenerationSpec(binding({ model: undefined }))).toBeNull();
  });

  it("prices an inpaint layer like the image generation it is", () => {
    expect(layerGenerationSpec(binding({ kind: "inpaint" }))).toMatchObject({
      kind: "image",
      resolution: "1K"
    });
  });
});

describe("summarizeLayerCosts", () => {
  it("returns nothing for a document with no bindings", () => {
    expect(summarizeLayerCosts([])).toBeNull();
  });

  it("sums every priced layer", () => {
    const one = summarizeLayerCosts([binding()]);
    const two = summarizeLayerCosts([
      binding(),
      binding({ layerId: "l2" })
    ]);
    expect(one?.total).toBeGreaterThan(0);
    expect(two?.total).toBeCloseTo((one?.total ?? 0) * 2, 10);
    expect(two?.pricedCount).toBe(2);
    expect(two?.isLowerBound).toBe(false);
  });

  it("counts a layer it cannot price and says the total is a floor", () => {
    const summary = summarizeLayerCosts([
      binding(),
      binding({ layerId: "l2", kind: "workflow", workflowId: "w1" })
    ]);
    expect(summary?.pricedCount).toBe(1);
    expect(summary?.unpricedCount).toBe(1);
    expect(summary?.isLowerBound).toBe(true);
    expect(summary?.lines.at(-1)).toContain("1 layer without a known price");
  });
});
