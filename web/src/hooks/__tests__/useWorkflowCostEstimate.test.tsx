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
  { id: "n3", type: "nodetool.text.Concat", data: {} }
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
  it("estimates cost from nodes + metadata", () => {
    const { result } = renderHook(() => useWorkflowCostEstimate("wf1"));

    const estimate = result.current;
    expect(estimate).not.toBeNull();
    expect(estimate!.currency).toBe("USD");
    expect(estimate!.items).toHaveLength(3);
    // fal 0.05 (USD) + kie 0.02 (usd_price preferred over credits)
    expect(estimate!.total).toBeCloseTo(0.07, 5);
    // the concat node has no pricing metadata
    expect(estimate!.unknown_count).toBe(1);
    const unknown = estimate!.items.find(
      (i) => i.node_type === "nodetool.text.Concat"
    );
    expect(unknown?.confidence).toBe("unknown");
  });
});
