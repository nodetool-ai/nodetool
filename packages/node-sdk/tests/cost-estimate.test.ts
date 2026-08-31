import { describe, expect, it } from "vitest";
import {
  estimateWorkflowCost,
  humanizeNodeType,
  nodeExpectedQuantity,
  usesAiModel,
  type CostEstimateInput,
  type NodeMetadataLike
} from "../src/cost-estimate.js";
import { extractPricingParams } from "../src/pricing-params.js";

const FAL_TYPE = "fal.image.FluxSchnell";
const FAL_VAGUE_TYPE = "fal.text_to_image.GptImage2";
const KIE_TYPE = "kie.video.Veo";
const FAL_PER_SECOND_TYPE = "fal.text_to_video.KlingVideoV3ProTextToVideo";
const KIE_PER_SECOND_TYPE = "kie.video.Runway";
const FAL_LIVE_TYPE = "fal.text_to_video.LiveRow";
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
  [FAL_VAGUE_TYPE]: {
    fal_unit_pricing: {
      endpoint_id: "openai/gpt-image-2",
      unit_price: 1,
      billing_unit: "units",
      currency: "USD",
      source: "bundle"
    }
  },
  [FAL_PER_SECOND_TYPE]: {
    properties: [{ name: "duration", type: { type: "str" } }],
    fal_unit_pricing: {
      endpoint_id: "fal-ai/kling-video/v3/pro/text-to-video",
      unit_price: 0.14,
      billing_unit: "seconds",
      currency: "USD",
      source: "bundle"
    }
  },
  [FAL_LIVE_TYPE]: {
    fal_unit_pricing: {
      endpoint_id: "fal-ai/live-row",
      unit_price: 0.2,
      billing_unit: "seconds",
      currency: "USD",
      source: "live"
    }
  },
  [KIE_PER_SECOND_TYPE]: {
    kie_unit_pricing: {
      model_id: "runway",
      unit_price: 20,
      billing_unit: "second",
      currency: "credits",
      usd_price: 0.1,
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

/**
 * A published grid for the per-second endpoint: the rung decides the rate, and
 * 4K is a rung this model does not sell. Stands in for the GenSpend catalog,
 * which the estimator reaches only through this hook.
 */
const gridRows: Record<string, number> = { "720p": 0.1, "1080p": 0.15 };

const getGridPrice: CostEstimateInput["getModelPrice"] = (model, params) => {
  if (model.id !== "fal-ai/kling-video/v3/pro/text-to-video") return null;
  const seconds = params?.seconds ?? 1;
  const resolution = params?.resolution;
  const rate = resolution ? gridRows[resolution] : gridRows["720p"];
  if (rate === undefined) {
    return {
      unit_price: 0,
      billing_unit: "",
      currency: "USD",
      source: "bundle" as const,
      declined: `no published price at ${resolution}`
    };
  }
  return {
    unit_price: rate * seconds,
    billing_unit: "seconds",
    currency: "USD",
    source: "bundle" as const,
    fromGrid: true,
    seconds,
    resolution: resolution ?? "720p"
  };
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

  it("bills a per-second fal node for the duration the node states", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        { id: "v1", type: FAL_PER_SECOND_TYPE, data: { duration: "10" } }
      ],
      getMetadata,
      getParams: (node) => extractPricingParams(node.data)
    });

    const item = estimate.items[0];
    expect(item.unit_price).toBeCloseTo(1.4, 10);
    expect(item.estimated_cost).toBeCloseTo(1.4, 10);
    expect(item.seconds).toBe(10);
    expect(item.breakdown).toBe("10 s × $0.14/s");
  });

  it("prices a per-second fal node at one second when no duration is set", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "v1", type: FAL_PER_SECOND_TYPE }],
      getMetadata,
      getParams: (node) => extractPricingParams(node.data)
    });

    const item = estimate.items[0];
    expect(item.unit_price).toBeCloseTo(0.14, 10);
    expect(item.seconds).toBe(1);
    expect(item.assumptions?.[0]).toContain("duration not set");
  });

  it("bills a per-second kie node for the duration the node states", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "k2", type: KIE_PER_SECOND_TYPE, data: { duration: 8 } }],
      getMetadata,
      getParams: (node) => extractPricingParams(node.data)
    });

    const item = estimate.items[0];
    expect(item.unit_price).toBeCloseTo(0.8, 10);
    expect(item.seconds).toBe(8);
  });

  it("moves a fal node's price with the resolution the node states", () => {
    const estimate = (resolution: string) =>
      estimateWorkflowCost({
        nodes: [
          {
            id: "v1",
            type: FAL_PER_SECOND_TYPE,
            data: { duration: "8", resolution }
          }
        ],
        getMetadata,
        getModelPrice: getGridPrice,
        getParams: (node) => extractPricingParams(node.data)
      });

    const cheap = estimate("720p").items[0];
    expect(cheap.unit_price).toBeCloseTo(0.8, 10);
    expect(cheap.resolution).toBe("720p");

    const dear = estimate("1080p").items[0];
    expect(dear.unit_price).toBeCloseTo(1.2, 10);
    expect(dear.resolution).toBe("1080p");
  });

  it("keeps the node-type rate as a floor when the grid has no such rung", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        {
          id: "v1",
          type: FAL_PER_SECOND_TYPE,
          data: { duration: "8", resolution: "4K" }
        }
      ],
      getMetadata,
      getModelPrice: getGridPrice,
      getParams: (node) => extractPricingParams(node.data)
    });

    const item = estimate.items[0];
    expect(item.unit_price).toBeCloseTo(1.12, 10);
    expect(item.assumptions?.[0]).toBe("no published price at 4K");
  });

  it("keeps a live node-type rate over a flat catalog answer", () => {
    const flat: CostEstimateInput["getModelPrice"] = () => ({
      unit_price: 0.05,
      billing_unit: "seconds",
      currency: "USD",
      source: "bundle" as const
    });
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "v1", type: FAL_LIVE_TYPE, data: { duration: "8" } }],
      getMetadata,
      getModelPrice: flat,
      getParams: (node) => extractPricingParams(node.data)
    });

    const item = estimate.items[0];
    expect(item.unit_price).toBeCloseTo(1.6, 10);
    expect(item.confidence).toBe("exact");
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

  it("omits only nodes explicitly identified as known non-billable", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        { id: "input-1", type: "nodetool.input.StringInput" },
        { id: "utility-1", type: "nodetool.string.Concat" },
        { id: "unknown-1", type: LLM_TYPE }
      ],
      getMetadata,
      isKnownNonBillable: (node) =>
        node.type.startsWith("nodetool.input.") ||
        node.type.startsWith("nodetool.string.")
    });

    expect(estimate.items.map((item) => item.node_id)).toEqual(["unknown-1"]);
    expect(estimate.unknown_count).toBe(1);
    expect(estimate.total).toBe(0);
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

/**
 * Parameters — what the node states about the job (duration, resolution) —
 * reach the price lookup and its reasoning reaches the item.
 */
describe("estimateWorkflowCost with pricing parameters", () => {
  const VIDEO_TYPE = "nodetool.video.TextToVideo";
  const videoMetadata: Record<string, NodeMetadataLike> = {
    ...metadataByType,
    [VIDEO_TYPE]: {
      properties: [{ name: "model", type: { type: "video_model" } }]
    }
  };
  const getVideoMetadata = (type: string) => videoMetadata[type];

  /** A per-second model: the price arrives already multiplied by duration. */
  const getModelPriceWithParams: CostEstimateInput["getModelPrice"] = (
    model,
    params
  ) => {
    if (model.id !== "vendor/clip-2") return null;
    if (params?.resolution === "4K") {
      return {
        unit_price: 0,
        billing_unit: "",
        currency: "USD",
        source: "bundle" as const,
        declined: "no published price at 4K"
      };
    }
    const seconds = params?.seconds ?? 1;
    return {
      unit_price: 0.2 * seconds,
      billing_unit: "seconds",
      currency: "USD",
      source: "bundle" as const,
      breakdown: `${seconds} s × $0.2/s`,
      seconds,
      resolution: params?.resolution,
      ...(params?.seconds === undefined
        ? { assumptions: ["duration not set on the node — priced at 1 s"] }
        : {}),
      ...(params?.referenceImages
        ? { warnings: ["reference images are not priced here"] }
        : {})
    };
  };

  const videoNode = (data: Record<string, unknown>) => ({
    id: "v1",
    type: VIDEO_TYPE,
    data: {
      model: { type: "video_model", provider: "kie", id: "vendor/clip-2" },
      ...data
    }
  });

  it("threads node parameters into the model lookup and composes with fan-out", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({ duration: 5 })],
      getMetadata: getVideoMetadata,
      getModelPrice: getModelPriceWithParams,
      getParams: (node) => ({
        seconds: Number(node.data?.duration) || undefined
      }),
      quantities: { v1: 2 }
    });

    const item = estimate.items[0];
    expect(item.unit_price).toBeCloseTo(1.0, 10);
    expect(item.quantity).toBe(2);
    expect(item.estimated_cost).toBeCloseTo(2.0, 10);
    expect(estimate.total).toBeCloseTo(2.0, 10);
  });

  it("copies breakdown, assumptions, and warnings onto the item", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({})],
      getMetadata: getVideoMetadata,
      getModelPrice: getModelPriceWithParams,
      getParams: () => ({ referenceImages: 2 })
    });

    const item = estimate.items[0];
    expect(item.breakdown).toBe("1 s × $0.2/s");
    expect(item.assumptions).toEqual([
      "duration not set on the node — priced at 1 s"
    ]);
    expect(item.warnings).toEqual(["reference images are not priced here"]);
  });

  it("reports a declined price as unknown with the reason attached", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({ resolution: "4K" })],
      getMetadata: getVideoMetadata,
      getModelPrice: getModelPriceWithParams,
      getParams: (node) => ({ resolution: String(node.data?.resolution) })
    });

    const item = estimate.items[0];
    expect(item.confidence).toBe("unknown");
    expect(item.estimated_cost).toBe(0);
    expect(item.assumptions).toEqual(["no published price at 4K"]);
    expect(estimate.unknown_count).toBe(1);
    expect(estimate.total).toBe(0);
  });

  it("treats a model price billed in vague units as unknown, never summed", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({})],
      getMetadata: getVideoMetadata,
      getModelPrice: () => ({
        unit_price: 400,
        billing_unit: "credits",
        currency: "credits",
        source: "bundle" as const
      })
    });

    expect(estimate.total).toBe(0);
    expect(estimate.unknown_count).toBe(1);
    expect(estimate.items[0].confidence).toBe("unknown");
  });

  it("prices a generic node unchanged when no getParams is supplied", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({ duration: 5 })],
      getMetadata: getVideoMetadata,
      getModelPrice: getModelPriceWithParams
    });

    expect(estimate.items[0].unit_price).toBeCloseTo(0.2, 10);
  });

  it("carries the priced duration and rung onto the item", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({ duration: 5 })],
      getMetadata: getVideoMetadata,
      getModelPrice: getModelPriceWithParams,
      getParams: () => ({ seconds: 5, resolution: "720p" })
    });

    // The panel reads these off the item instead of parsing the breakdown.
    expect(estimate.items[0].seconds).toBe(5);
    expect(estimate.items[0].resolution).toBe("720p");
  });

  it("carries warnings onto an item the catalog declined to price", () => {
    const estimate = estimateWorkflowCost({
      nodes: [videoNode({})],
      getMetadata: getVideoMetadata,
      getModelPrice: () => ({
        unit_price: 0,
        billing_unit: "",
        currency: "USD",
        source: "bundle" as const,
        declined: "no fixed value per run",
        warnings: ["the figure is a lower bound"]
      })
    });

    expect(estimate.items[0].confidence).toBe("unknown");
    expect(estimate.items[0].warnings).toEqual(["the figure is a lower bound"]);
  });
});

describe("node titles", () => {
  it("spaces a class name apart, so a row is not a dotted path", () => {
    expect(humanizeNodeType("nodetool.video.ImageToVideo")).toBe(
      "Image To Video"
    );
    expect(humanizeNodeType("nodetool.agents.Agent")).toBe("Agent");
    expect(humanizeNodeType("fal.text_to_image.GptImage2")).toBe("Gpt Image 2");
    expect(humanizeNodeType("HTTPRequest")).toBe("HTTP Request");
    expect(humanizeNodeType("")).toBe("");
  });

  it("prefers the user's title, then the metadata title, then the type", () => {
    const estimate = estimateWorkflowCost({
      nodes: [
        { id: "named", type: FAL_TYPE },
        { id: "registered", type: KIE_TYPE },
        { id: "bare", type: "nodetool.video.ImageToVideo" }
      ],
      getMetadata: (type) =>
        type === KIE_TYPE
          ? { ...metadataByType[type], title: "Veo Clip" }
          : metadataByType[type],
      titles: { named: "Hero shot", registered: "   " }
    });

    const byId = Object.fromEntries(
      estimate.items.map((item) => [item.node_id, item.node_title])
    );
    expect(byId.named).toBe("Hero shot");
    // A blank title is not a title — fall through to the registered one.
    expect(byId.registered).toBe("Veo Clip");
    expect(byId.bare).toBe("Image To Video");
  });

  it("titles a node it could not price, which is where the name matters", () => {
    const estimate = estimateWorkflowCost({
      nodes: [{ id: "n1", type: LLM_TYPE }],
      getMetadata,
      titles: { n1: "Script writer" }
    });

    expect(estimate.unknown_count).toBe(1);
    expect(estimate.items[0].node_title).toBe("Script writer");
    expect(estimate.items[0].node_type).toBe(LLM_TYPE);
  });
});

describe("usesAiModel", () => {
  it("is true for a node carrying provider unit pricing", () => {
    expect(usesAiModel(metadataByType[FAL_TYPE])).toBe(true);
    expect(usesAiModel(metadataByType[KIE_TYPE])).toBe(true);
  });

  it("is true for a node exposing a provider-backed model property", () => {
    expect(usesAiModel(metadataByType[GENERIC_TYPE])).toBe(true);
  });

  it("is false for a plain node and for missing metadata", () => {
    expect(usesAiModel({ properties: [{ type: { type: "str" } }] })).toBe(false);
    expect(usesAiModel({ properties: null })).toBe(false);
    expect(usesAiModel(undefined)).toBe(false);
  });

  it("is false for a local model property, which no provider catalog prices", () => {
    expect(
      usesAiModel({ properties: [{ type: { type: "llama_model" } }] })
    ).toBe(false);
  });
});

describe("nodeExpectedQuantity", () => {
  it("reads the fan-out properties, most specific first", () => {
    expect(nodeExpectedQuantity({ num_images: 4 })).toBe(4);
    expect(nodeExpectedQuantity({ num_outputs: 3 })).toBe(3);
    expect(nodeExpectedQuantity({ num_samples: 2 })).toBe(2);
    expect(nodeExpectedQuantity({ batch_size: 8 })).toBe(8);
    expect(nodeExpectedQuantity({ num_images: 4, num_outputs: 9 })).toBe(4);
  });

  it("floors a fractional count and never returns less than one", () => {
    expect(nodeExpectedQuantity({ num_images: 2.7 })).toBe(2);
    expect(nodeExpectedQuantity({ num_images: 0 })).toBe(1);
    expect(nodeExpectedQuantity({ num_images: -3 })).toBe(1);
    expect(nodeExpectedQuantity({ num_images: "4" })).toBe(1);
    expect(nodeExpectedQuantity({})).toBe(1);
    expect(nodeExpectedQuantity(undefined)).toBe(1);
  });

  it("does not read num_frames — that is one video's length, not a batch", () => {
    expect(nodeExpectedQuantity({ num_frames: 81 })).toBe(1);
  });
});
