/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";

// The hook imports the real (pure) estimator from `@nodetool-ai/node-sdk/cost-estimate`,
// which jest.config maps to the TypeScript source (the ESM dist barrel is not
// transformable by ts-jest). No mock needed.

const mockNodes = [
  { id: "n1", type: "fal.Image", data: {} },
  { id: "n2", type: "kie.Video", data: {} },
  // Uses an AI model via a language_model property but has no unit pricing.
  { id: "n3", type: "nodetool.llm.Agent", data: {} },
  // Plain data node — no model, no pricing. Excluded from the estimate.
  { id: "n4", type: "nodetool.text.Concat", data: {} }
];

const mockNodeStore = {
  subscribe: () => () => {},
  getState: () => ({ nodes: mockNodes })
};

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (s: unknown) => unknown) =>
    selector({ getNodeStore: () => mockNodeStore })
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
  "nodetool.text.Concat": {
    properties: [{ name: "a", type: { type: "str" } }]
  }
};

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) =>
    selector({
      getMetadata: (nodeType: string) => mockMetadata[nodeType]
    })
}));

import { useWorkflowCostEstimate } from "../useWorkflowCostEstimate";

describe("useWorkflowCostEstimate", () => {
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
});
