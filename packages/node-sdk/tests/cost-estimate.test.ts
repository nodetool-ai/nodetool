import { describe, expect, it } from "vitest";
import {
  estimateWorkflowCost,
  withinBudget,
  type NodeMetadataLike
} from "../src/cost-estimate.js";
import type { Budget } from "@nodetool-ai/protocol";

const FAL_TYPE = "fal.image.FluxSchnell";
const FAL_VAGUE_TYPE = "fal.text_to_image.GptImage2";
const KIE_TYPE = "kie.video.Veo";
const LLM_TYPE = "nodetool.agents.Agent";

const metadataByType: Record<string, NodeMetadataLike> = {
  [FAL_TYPE]: {
    fal_unit_pricing: {
      endpoint_id: "fal-ai/flux/schnell",
      unit_price: 0.02,
      billing_unit: "images",
      currency: "USD",
      source: "bundle"
    }
  },
  [FAL_VAGUE_TYPE]: {
    fal_unit_pricing: {
      endpoint_id: "openai/gpt-image-2",
      unit_price: 1,
      billing_unit: "units",
      currency: "USD",
      source: "bundle"
    }
  },
  [KIE_TYPE]: {
    kie_unit_pricing: {
      model_id: "veo3",
      unit_price: 400,
      billing_unit: "credits",
      currency: "credits",
      usd_price: 2.5,
      source: "live"
    }
  }
};

const getMetadata = (type: string): NodeMetadataLike | undefined =>
  metadataByType[type];

describe("estimateWorkflowCost", () => {
  it("prices a fal node as unit_price * quantity with fan-out", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "n1", type: FAL_TYPE }],
      getMetadata,
      quantities: { n1: 3 }
    });

    expect(estimate.currency).toBe("USD");
    expect(estimate.unknown_count).toBe(0);
    expect(estimate.items).toHaveLength(1);

    const item = estimate.items[0];
    expect(item.provider).toBe("fal");
    expect(item.model).toBe("fal-ai/flux/schnell");
    expect(item.unit_price).toBe(0.02);
    expect(item.quantity).toBe(3);
    expect(item.confidence).toBe("estimate");
    expect(item.estimated_cost).toBeCloseTo(0.06, 10);
    expect(estimate.total).toBeCloseTo(0.06, 10);
  });

  it("prices a kie node from usd_price and marks live prices exact", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "k1", type: KIE_TYPE }],
      getMetadata
    });

    const item = estimate.items[0];
    expect(item.provider).toBe("kie");
    expect(item.model).toBe("veo3");
    expect(item.unit_price).toBe(2.5);
    expect(item.quantity).toBe(1);
    expect(item.confidence).toBe("exact");
    expect(item.estimated_cost).toBeCloseTo(2.5, 10);
    expect(estimate.total).toBeCloseTo(2.5, 10);
  });

  it("treats fal nodes with vague billing (units/credits) as unknown", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "v1", type: FAL_VAGUE_TYPE }],
      getMetadata
    });

    expect(estimate.unknown_count).toBe(1);
    expect(estimate.total).toBe(0);

    const item = estimate.items[0];
    expect(item.confidence).toBe("unknown");
    expect(item.estimated_cost).toBe(0);
    expect(item.provider).toBeNull();
  });

  it("reports unpriced nodes as unknown without affecting the total", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        { id: "n1", type: FAL_TYPE },
        { id: "x1", type: LLM_TYPE }
      ],
      getMetadata
    });

    expect(estimate.unknown_count).toBe(1);
    expect(estimate.total).toBeCloseTo(0.02, 10);

    const unknown = estimate.items.find((i) => i.node_id === "x1");
    expect(unknown).toBeDefined();
    expect(unknown?.confidence).toBe("unknown");
    expect(unknown?.estimated_cost).toBe(0);
    expect(unknown?.provider).toBeNull();
    expect(unknown?.model).toBeNull();
    expect(unknown?.quantity).toBe(1);
  });

  it("defaults quantity to 1 for non-positive or missing entries", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "n1", type: FAL_TYPE }],
      getMetadata,
      quantities: { n1: 0 }
    });
    expect(estimate.items[0].quantity).toBe(1);
    expect(estimate.total).toBeCloseTo(0.02, 10);
  });
});

describe("withinBudget", () => {
  const estimate = estimateWorkflowCost({
    nodes: [{ id: "k1", type: KIE_TYPE }],
    getMetadata
  });

  it("is true when estimate + spent stays within the cap", () => {
    const budget: Budget = { currency: "USD", cap: 10, spent: 5 };
    expect(withinBudget(estimate, budget)).toBe(true);
  });

  it("is false when estimate + spent exceeds the cap", () => {
    const budget: Budget = { currency: "USD", cap: 6, spent: 5 };
    expect(withinBudget(estimate, budget)).toBe(false);
  });
});
