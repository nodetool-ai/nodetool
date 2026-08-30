import { render } from "@testing-library/react";
import { FC } from "react";
import { NodeInputs } from "../NodeInputs";
import { NodeProvider } from "../../../contexts/NodeContext";
import type { NodeData } from "../../../stores/NodeData";
import type { NodeMetadata } from "../../../stores/ApiTypes";
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

/** The node data these tests hand to NodeInputs, with the fields it requires. */
const makeData = (properties: Record<string, unknown>): NodeData => ({
  workflow_id: "wf1",
  properties,
  selectable: true,
  dynamic_properties: {}
});

const Harness: FC<{ data: NodeData }> = ({ data }) => (
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
      <Harness data={makeData({ prop1: "a", prop2: "b" })} />
    );

    expect(renderCounts.prop1).toBe(1);
    expect(renderCounts.prop2).toBe(1);

    // Simulate an edit to prop1: the store replaces `data` (and `properties`)
    // with a new object, but prop2's value is unchanged.
    rerender(
      <Harness
        data={makeData({ prop1: "a-changed", prop2: "b" })}
      />
    );

    // prop1 re-renders (its value changed); prop2 must be skipped by the memo.
    expect(renderCounts.prop1).toBe(2);
    expect(renderCounts.prop2).toBe(1);
  });

});

// `Harness` builds a fresh store per render, so a context update re-renders
// NodeInputs whatever its memo says. These hold one store, which is what lets
// the memo actually gate — without it these tests pass against any comparator.
describe("NodeInputs memoization", () => {
  const store = createNodeStore();
  const createStore = () => store;
  // NodeInputs takes `nodeMetadata` but reads nothing off it.
  const EMPTY_METADATA = {} as NodeMetadata;

  const StableHarness: FC<{ data: NodeData }> = ({ data }) => (
    <NodeProvider createStore={createStore}>
      <NodeInputs
        id="node1"
        nodeType="test"
        properties={properties}
        data={data}
        nodeMetadata={EMPTY_METADATA}
      />
    </NodeProvider>
  );

  beforeEach(() => {
    for (const key of Object.keys(renderCounts)) delete renderCounts[key];
  });

  it("renders a dynamic slot added to an already-rendered node", () => {
    const { rerender } = render(<StableHarness data={makeData({ prop1: "a" })} />);

    expect(renderCounts.slot1).toBeUndefined();

    rerender(
      <StableHarness
        data={{ ...makeData({ prop1: "a" }), dynamic_properties: { slot1: "" } }}
      />
    );

    expect(renderCounts.slot1).toBe(1);
  });

  it("re-renders a dynamic slot when its value changes", () => {
    const withSlot = (value: string): NodeData => ({
      ...makeData({ prop1: "a" }),
      dynamic_properties: { slot1: value }
    });
    const { rerender } = render(<StableHarness data={withSlot("one")} />);

    expect(renderCounts.slot1).toBe(1);

    rerender(<StableHarness data={withSlot("two")} />);

    expect(renderCounts.slot1).toBe(2);
  });
});
