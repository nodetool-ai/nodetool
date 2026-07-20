import { describe, expect, it } from "vitest";
import {
  estimateWorkflowCost,
  type CostEstimateInput,
  type NodeMetadataLike
} from "../src/cost-estimate.js";

const FAL_TYPE = "fal.image.FluxSchnell";
const KIE_TYPE = "kie.video.Veo";
const LLM_TYPE = "nodetool.agents.Agent";
const GENERIC_TYPE = "nodetool.image.TextToImage";

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
  [KIE_TYPE]: {
    kie_unit_pricing: {
      model_id: "veo3",
      unit_price: 400,
      billing_unit: "credits",
      currency: "credits",
      usd_price: 2.5,
      source: "live"
    }
  },
  // A generic node has no fixed node-type price — it exposes a provider-model
  // property whose value carries the selected model.
  [GENERIC_TYPE]: {
    properties: [{ name: "model", type: { type: "image_model" } }]
  }
};

const getMetadata = (type: string): NodeMetadataLike | undefined =>
  metadataByType[type];

const modelPrices: Record<string, { unit_price: number; billing_unit: string }> =
  {
    "fal-ai/flux/dev": { unit_price: 0.025, billing_unit: "images" }
  };

const getModelPrice: CostEstimateInput["getModelPrice"] = (model) => {
  const price = modelPrices[model.id];
  return price
    ? { ...price, currency: "USD", source: "bundle" as const }
    : null;
};

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

  it("prices a generic node from its selected model field", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        {
          id: "g1",
          type: GENERIC_TYPE,
          data: {
            model: {
              type: "image_model",
              provider: "fal_ai",
              id: "fal-ai/flux/dev"
            }
          }
        }
      ],
      getMetadata,
      getModelPrice,
      quantities: { g1: 2 }
    });

    const item = estimate.items[0];
    expect(item.provider).toBe("fal_ai");
    expect(item.model).toBe("fal-ai/flux/dev");
    expect(item.unit_price).toBe(0.025);
    expect(item.quantity).toBe(2);
    expect(item.confidence).toBe("estimate");
    expect(item.estimated_cost).toBeCloseTo(0.05, 10);
    expect(estimate.unknown_count).toBe(0);
    expect(estimate.total).toBeCloseTo(0.05, 10);
  });

  it("reports a generic node as unknown when its model has no price", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        {
          id: "g1",
          type: GENERIC_TYPE,
          data: {
            model: { type: "image_model", id: "fal-ai/unpriced" }
          }
        }
      ],
      getMetadata,
      getModelPrice
    });

    expect(estimate.unknown_count).toBe(1);
    expect(estimate.total).toBe(0);
    expect(estimate.items[0].confidence).toBe("unknown");
  });

  it("reports a generic node as unknown when no model is selected", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "g1", type: GENERIC_TYPE, data: {} }],
      getMetadata,
      getModelPrice
    });

    expect(estimate.unknown_count).toBe(1);
    expect(estimate.items[0].confidence).toBe("unknown");
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
