import type { Node, NodeProps } from "@xyflow/react";
import type { NodeData } from "../../../stores/NodeData";
import { stub } from "../../../test-utils/doubles";
import { baseNodePropsEqual } from "../baseNodePropsEqual";

const props = (
  overrides: Partial<NodeProps<Node<NodeData>>> = {}
): NodeProps<Node<NodeData>> =>
  stub<NodeProps<Node<NodeData>>>({
    id: "n",
    type: "nodetool.text.Concat",
    selected: false,
    dragging: false,
    parentId: undefined,
    height: 120,
    data: stub<NodeData>({ properties: { a: 1 } }),
    ...overrides
  });

describe("baseNodePropsEqual", () => {
  it("treats equal props as equal", () => {
    expect(baseNodePropsEqual(props(), props())).toBe(true);
  });

  it("re-renders when only the height changes", () => {
    // BaseNode caps its body's min-height at this height after a resize.
    expect(baseNodePropsEqual(props(), props({ height: 240 }))).toBe(false);
  });

  it("re-renders when the data changes", () => {
    expect(
      baseNodePropsEqual(
        props(),
        props({ data: stub<NodeData>({ properties: { a: 2 } }) })
      )
    ).toBe(false);
  });
});
