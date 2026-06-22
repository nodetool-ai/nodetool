import { render } from "@testing-library/react";
import React, { FC } from "react";
import { NodeInputs } from "../NodeInputs";
import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";

// Count how many times each property's field renders, keyed by property name.
const renderCounts: Record<string, number> = {};
jest.mock("../PropertyField", () => ({
  __esModule: true,
  default: (props: { property: { name: string } }) => {
    const name = props.property.name;
    renderCounts[name] = (renderCounts[name] ?? 0) + 1;
    return <div data-testid={`field-${name}`} />;
  }
}));

const properties = [
  { name: "prop1", type: { type: "string" } },
  { name: "prop2", type: { type: "string" } }
] as any;

const Harness: FC<{ data: any }> = ({ data }) => (
  <NodeProvider createStore={() => createNodeStore()}>
    <NodeInputs
      id="node1"
      nodeType="test"
      properties={properties}
      data={data}
      nodeMetadata={{} as any}
    />
  </NodeProvider>
);

describe("NodeInputs field memoization", () => {
  beforeEach(() => {
    for (const key of Object.keys(renderCounts)) delete renderCounts[key];
  });

  it("does not re-render a sibling field when an unrelated property value changes", () => {
    const { rerender } = render(
      <Harness data={{ workflow_id: "wf1", properties: { prop1: "a", prop2: "b" } }} />
    );

    expect(renderCounts.prop1).toBe(1);
    expect(renderCounts.prop2).toBe(1);

    // Simulate an edit to prop1: the store replaces `data` (and `properties`)
    // with a new object, but prop2's value is unchanged.
    rerender(
      <Harness
        data={{ workflow_id: "wf1", properties: { prop1: "a-changed", prop2: "b" } }}
      />
    );

    // prop1 re-renders (its value changed); prop2 must be skipped by the memo.
    expect(renderCounts.prop1).toBe(2);
    expect(renderCounts.prop2).toBe(1);
  });
});
