import { render, act } from "@testing-library/react";
import React, { FC } from "react";
import { NodeInputs } from "../NodeInputs";
import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";

// Mock out heavy child components that cause errors
jest.mock("../PropertyField", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-property-field" />
}));

let renderCount = 0;

const Wrapper: FC<any> = (props) => {
  renderCount++;
  return <NodeInputs {...props} />;
};

describe("NodeInputs Performance", () => {
  it("does not re-render when unrelated edges change", () => {
    const store = createNodeStore();

    // Add some nodes
    act(() => {
      store.getState().addNode({ id: "node1", type: "test", data: { properties: {} }, position: { x: 0, y: 0 } } as any);
      store.getState().addNode({ id: "node2", type: "test", data: { properties: {} }, position: { x: 0, y: 0 } } as any);
      store.getState().addNode({ id: "node3", type: "test", data: { properties: {} }, position: { x: 0, y: 0 } } as any);
    });

    renderCount = 0;

    render(
      <NodeProvider createStore={() => store}>
        <Wrapper
          id="node1"
          nodeType="test"
          properties={[{ name: "prop1", type: { type: "string" } }]}
          data={{ properties: { prop1: "val" } } as any}
          nodeMetadata={{} as any}
        />
      </NodeProvider>
    );

    const initialRenderCount = renderCount;
    expect(initialRenderCount).toBeGreaterThan(0);

    // Add an unrelated edge
    act(() => {
      store.getState().addEdge({ id: "e1", source: "node2", target: "node3", sourceHandle: "out", targetHandle: "in" } as any);
    });

    const countAfterUnrelated = renderCount;

    expect(countAfterUnrelated).toBe(initialRenderCount); // Shouldn't re-render on unrelated
  });
});
