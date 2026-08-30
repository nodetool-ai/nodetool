/**
 * The two adapters onto the compact cost line: what each reads, and when each
 * refuses to show a figure at all.
 */

import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import { generationCostLine, workflowCostLine } from "../costLine";

describe("generationCostLine", () => {
  it("passes nothing through when there is no estimate", () => {
    expect(generationCostLine(null)).toBeNull();
  });

  it("reads as a floor once the catalog warns of a missing cost", () => {
    const line = generationCostLine({
      label: "$0.50",
      total: 0.5,
      quantity: 1,
      breakdown: "5 s × $0.1/s at 720p",
      warnings: ["audio is billed separately"]
    });
    expect(line?.isLowerBound).toBe(true);
    expect(line?.lines).toEqual([
      "5 s × $0.1/s at 720p",
      "audio is billed separately"
    ]);
  });

  it("names the fan-out the figure covers", () => {
    const line = generationCostLine({
      label: "$0.16",
      total: 0.16,
      quantity: 4,
      breakdown: "$0.04 per image"
    });
    expect(line?.isLowerBound).toBe(false);
    expect(line?.lines?.[0]).toBe("4 outputs × $0.04 per image");
  });
});

function detail(
  overrides: Partial<WorkflowCostEstimateDetail> = {}
): WorkflowCostEstimateDetail {
  return {
    currency: "USD",
    total: 0.2,
    unknown_count: 0,
    items: [
      {
        node_id: "n1",
        node_type: "nodetool.image.TextToImage",
        provider: "fal_ai",
        model: "flux",
        quantity: 1,
        estimated_cost: 0.2,
        confidence: "exact",
        breakdown: "$0.2 per image"
      }
    ],
    ...overrides
  };
}

describe("workflowCostLine", () => {
  it("shows nothing for a graph with no AI-model node", () => {
    expect(workflowCostLine(detail({ items: [], total: 0 }))).toBeNull();
  });

  it("shows nothing when no node in the graph could be priced", () => {
    const unknownOnly = detail({ unknown_count: 1, total: 0 });
    unknownOnly.items[0] = {
      ...unknownOnly.items[0],
      confidence: "unknown",
      estimated_cost: 0
    };
    expect(workflowCostLine(unknownOnly)).toBeNull();
  });

  it("lists each priced node and totals them", () => {
    const line = workflowCostLine(detail());
    expect(line?.label).toBe("$0.2");
    expect(line?.isLowerBound).toBe(false);
    expect(line?.lines).toEqual([
      "nodetool.image.TextToImage: $0.2 — $0.2 per image"
    ]);
  });

  it("reads as a floor while any node is unpriced, and says how many", () => {
    const line = workflowCostLine(detail({ unknown_count: 2 }));
    expect(line?.isLowerBound).toBe(true);
    expect(line?.lines?.at(-1)).toBe(
      "2 nodes without a known price are excluded."
    );
  });
});
