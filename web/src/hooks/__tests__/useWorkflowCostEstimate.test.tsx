/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";

// The hook imports the real (pure) estimator from `@nodetool-ai/node-sdk/cost-estimate`,
// which jest.config maps to the TypeScript source (the ESM dist barrel is not
// transformable by ts-jest). No mock needed.

type MockNode = { id: string; type: string; data: Record<string, unknown> };

const baseNodes: MockNode[] = [
  { id: "n1", type: "fal.Image", data: {} },
  { id: "n2", type: "kie.Video", data: {} },
  // Uses an AI model via a language_model property but has no unit pricing.
  { id: "n3", type: "nodetool.llm.Agent", data: {} },
  // Plain data node — no model, no pricing. Excluded from the estimate.
  { id: "n4", type: "nodetool.text.Concat", data: {} }
];

// Reassigned per-test to vary the graph the hook sees.
let mockNodes: MockNode[] = baseNodes;

const mockNodeStore = {
  subscribe: () => () => {},
  getState: () => ({ nodes: mockNodes })
};

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(
    selector: (s: { getNodeStore: () => typeof mockNodeStore }) => T
  ) => selector({ getNodeStore: () => mockNodeStore })
}));

const mockMetadata: Record<string, unknown> = {
  "fal.Image": {
    fal_unit_pricing: {
      endpoint_id: "fal-ai/flux",
      unit_price: 0.05,
      billing_unit: "image",
      currency: "USD",
      source: "bundle"
    }
  },
  "kie.Video": {
    kie_unit_pricing: {
      model_id: "veo",
      unit_price: 10,
      billing_unit: "credits",
      currency: "credits",
      usd_price: 0.02,
      source: "bundle"
    }
  },
  "nodetool.llm.Agent": {
    properties: [{ name: "model", type: { type: "language_model" } }]
  },
  "nodetool.image.TextToImage": {
    properties: [{ name: "model", type: { type: "image_model" } }]
  },
  "nodetool.video.TextToVideo": {
    properties: [{ name: "model", type: { type: "video_model" } }]
  },
  "nodetool.text.Concat": {
    properties: [{ name: "a", type: { type: "str" } }]
  }
};

/** Params the mocked lookup was called with, per model id. */
const pricedWith: Array<{ id: string; params: unknown }> = [];

jest.mock("../../utils/modelUnitPricing", () => ({
  getModelUnitPrice: (model: { id: string }, params?: unknown) => {
    pricedWith.push({ id: model.id, params });
    if (model.id === "fal-ai/flux/schnell") {
      return {
        unit_price: 0.003,
        billing_unit: "images",
        currency: "USD",
        source: "bundle"
      };
    }
    if (model.id === "video/per-second") {
      // Stands in for a per-video-second catalog entry: the calculator returns
      // the already-multiplied figure, so the duration has to reach it.
      const seconds =
        mockIsNumber((params as { seconds?: number } | undefined)?.seconds)
          ? (params as { seconds: number }).seconds
          : 1;
      return {
        unit_price: 0.1 * seconds,
        billing_unit: "video",
        currency: "USD",
        source: "bundle",
        breakdown: `${seconds} s × $0.1/s`,
        seconds,
        resolution: (params as { resolution?: string } | undefined)
          ?.resolution
      };
    }
    return null;
  }
}));

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: <T,>(selector: (s: unknown) => T) =>
    selector({
      getMetadata: (nodeType: string) => mockMetadata[nodeType]
    })
}));

import { useWorkflowCostEstimate } from "../useWorkflowCostEstimate";

// jest hoists `jest.mock` above the imports, so a factory may only reach
// out-of-scope names that begin with `mock`.
const mockIsNumber = (value: unknown): value is number =>
  typeof value === "number";

describe("useWorkflowCostEstimate", () => {
  beforeEach(() => {
    mockNodes = baseNodes;
    pricedWith.length = 0;
  });

  it("estimates cost from AI-model nodes + metadata", () => {
    const { result } = renderHook(() => useWorkflowCostEstimate("wf1"));

    const estimate = result.current;
    expect(estimate).not.toBeNull();
    expect(estimate!.currency).toBe("USD");
    // Only the three AI-model nodes are listed; the plain Concat node is dropped.
    expect(estimate!.items).toHaveLength(3);
    expect(
      estimate!.items.some((i) => i.node_type === "nodetool.text.Concat")
    ).toBe(false);
    // fal 0.05 (USD) + kie 0.02 (usd_price preferred over credits)
    expect(estimate!.total).toBeCloseTo(0.07, 5);
    // the agent node uses a model but has no pricing metadata
    expect(estimate!.unknown_count).toBe(1);
    const unknown = estimate!.items.find(
      (i) => i.node_type === "nodetool.llm.Agent"
    );
    expect(unknown?.confidence).toBe("unknown");
  });

  it("prices a generic node from its selected model field", () => {
    mockNodes = [
      {
        id: "t2i",
        type: "nodetool.image.TextToImage",
        data: {
          model: {
            type: "image_model",
            provider: "huggingface_fal_ai",
            id: "fal-ai/flux/schnell"
          },
          num_images: 2
        }
      }
    ];

    const { result } = renderHook(() => useWorkflowCostEstimate("wf1"));

    const item = result.current!.items.find((i) => i.node_id === "t2i");
    expect(item?.model).toBe("fal-ai/flux/schnell");
    expect(item?.provider).toBe("huggingface_fal_ai");
    expect(item?.quantity).toBe(2);
    expect(item?.estimated_cost).toBeCloseTo(0.006, 5);
    expect(item?.confidence).toBe("estimate");
    expect(result.current!.unknown_count).toBe(0);
  });

  it("prices an editor node, whose values live under data.properties", () => {
    // The real editor shape (web/src/stores/NodeData.ts): property values are
    // nested under `properties`, not spread on `data`.
    mockNodes = [
      {
        id: "t2i",
        type: "nodetool.image.TextToImage",
        data: {
          properties: {
            model: {
              type: "image_model",
              provider: "huggingface_fal_ai",
              id: "fal-ai/flux/schnell"
            },
            num_images: 2
          }
        }
      }
    ];

    const { result } = renderHook(() => useWorkflowCostEstimate("wf1"));

    const item = result.current!.items.find((i) => i.node_id === "t2i");
    expect(item?.model).toBe("fal-ai/flux/schnell");
    expect(item?.quantity).toBe(2);
    expect(item?.estimated_cost).toBeCloseTo(0.006, 5);
    expect(result.current!.unknown_count).toBe(0);
  });

  it("prices a per-second model at the duration the node states", () => {
    mockNodes = [
      {
        id: "t2v",
        type: "nodetool.video.TextToVideo",
        data: {
          properties: {
            model: {
              type: "video_model",
              provider: "genspend_provider",
              id: "video/per-second"
            },
            duration: 5,
            resolution: "720p"
          }
        }
      }
    ];

    const { result } = renderHook(() => useWorkflowCostEstimate("wf1"));

    expect(pricedWith).toContainEqual({
      id: "video/per-second",
      params: { seconds: 5, resolution: "720p" }
    });
    const item = result.current!.items.find((i) => i.node_id === "t2v");
    expect(item?.estimated_cost).toBeCloseTo(0.5, 5);
    expect(item?.breakdown).toBe("5 s × $0.1/s");
    // Structured fields, not just breakdown prose — what the panel reads.
    expect(item?.seconds).toBe(5);
    expect(item?.resolution).toBe("720p");
  });

  it("re-prices when a duration property changes", () => {
    const nodeWith = (duration: number): MockNode => ({
      id: "t2v",
      type: "nodetool.video.TextToVideo",
      data: {
        properties: {
          model: {
            type: "video_model",
            provider: "genspend_provider",
            id: "video/per-second"
          },
          duration
        }
      }
    });
    mockNodes = [nodeWith(2)];

    const { result, rerender } = renderHook(() =>
      useWorkflowCostEstimate("wf1")
    );
    expect(
      result.current!.items.find((i) => i.node_id === "t2v")?.estimated_cost
    ).toBeCloseTo(0.2, 5);

    // A property edit replaces the node object in the store; the estimate
    // follows it rather than staying pinned to the first duration.
    mockNodes = [nodeWith(8)];
    rerender();

    expect(
      result.current!.items.find((i) => i.node_id === "t2v")?.estimated_cost
    ).toBeCloseTo(0.8, 5);
  });

  it("multiplies a node's cost by its fan-out output count", () => {
    // fal.Image at 0.05/image with num_images: 3 → quantity 3, cost 0.15.
    mockNodes = [{ id: "n1", type: "fal.Image", data: { num_images: 3 } }];

    const { result } = renderHook(() => useWorkflowCostEstimate("wf1"));

    const item = result.current!.items.find((i) => i.node_id === "n1");
    expect(item?.quantity).toBe(3);
    expect(item?.estimated_cost).toBeCloseTo(0.15, 5);
    expect(result.current!.total).toBeCloseTo(0.15, 5);
  });
});
