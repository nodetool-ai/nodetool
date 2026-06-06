import { describe, it, expect } from "@jest/globals";
import { __testOnly_buildPlan as buildPlan } from "../useGroupIntoSubgraph";
import { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

const makeNode = (
  id: string,
  type = "test.Node",
  position = { x: 0, y: 0 }
): RFNode<NodeData> =>
  ({
    id,
    type,
    position,
    data: {
      properties: {},
      title: id,
      collapsed: false,
      dynamic_properties: {},
      dynamic_inputs: undefined,
      dynamic_outputs: undefined
    }
  } as unknown as RFNode<NodeData>);

const makeEdge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): RFEdge =>
  ({
    id,
    source,
    sourceHandle,
    target,
    targetHandle
  } as RFEdge);

const center = { x: 0, y: 0 };

describe("buildPlan (Group into Subgraph cut-set)", () => {
  it("moves purely-internal edges into the subgraph unchanged", () => {
    const selected = ["a", "b"];
    const selectedNodes = selected.map((id) => makeNode(id));
    const edges = [makeEdge("e1", "a", "output", "b", "input")];

    const plan = buildPlan(
      new Set(selected),
      selectedNodes,
      edges,
      "sub-1",
      center
    );

    expect(plan.innerEdges).toHaveLength(1);
    expect(plan.innerEdges[0].source).toBe("a");
    expect(plan.innerEdges[0].target).toBe("b");
    expect(plan.outerEdgesToAdd).toHaveLength(0);
    expect(plan.outerEdgesToRemove).toEqual(["e1"]);
  });

  it("rewires an incoming crossing edge through a new StringInput port", () => {
    const selected = ["b"];
    const selectedNodes = selected.map((id) => makeNode(id));
    const edges = [makeEdge("e1", "a", "output", "b", "input")];

    const plan = buildPlan(
      new Set(selected),
      selectedNodes,
      edges,
      "sub-1",
      center
    );

    // One input node + an internal edge from it to b.
    const inputNodes = plan.innerNodes.filter(
      (n) => n.type === "nodetool.input.StringInput"
    );
    expect(inputNodes).toHaveLength(1);
    const inputNode = inputNodes[0] as unknown as {
      id: string;
      data: { name: string };
    };
    expect(inputNode.data.name).toBe("in1");

    expect(plan.innerEdges).toHaveLength(1);
    expect(plan.innerEdges[0].source).toBe(inputNode.id);
    expect(plan.innerEdges[0].sourceHandle).toBe("output");
    expect(plan.innerEdges[0].target).toBe("b");
    expect(plan.innerEdges[0].targetHandle).toBe("input");

    // Outer edge rewired to point at the subgraph node's `in1` handle.
    expect(plan.outerEdgesToAdd).toHaveLength(1);
    expect(plan.outerEdgesToAdd[0].source).toBe("a");
    expect(plan.outerEdgesToAdd[0].sourceHandle).toBe("output");
    expect(plan.outerEdgesToAdd[0].target).toBe("sub-1");
    expect(plan.outerEdgesToAdd[0].targetHandle).toBe("in1");

    expect(plan.outerEdgesToRemove).toEqual(["e1"]);
  });

  it("rewires an outgoing crossing edge through a new Output port", () => {
    const selected = ["a"];
    const selectedNodes = selected.map((id) => makeNode(id));
    const edges = [makeEdge("e1", "a", "output", "b", "input")];

    const plan = buildPlan(
      new Set(selected),
      selectedNodes,
      edges,
      "sub-1",
      center
    );

    const outputNodes = plan.innerNodes.filter(
      (n) => n.type === "nodetool.output.Output"
    );
    expect(outputNodes).toHaveLength(1);
    const outputNode = outputNodes[0] as unknown as {
      id: string;
      data: { name: string };
    };
    expect(outputNode.data.name).toBe("out1");

    expect(plan.innerEdges).toHaveLength(1);
    expect(plan.innerEdges[0].source).toBe("a");
    expect(plan.innerEdges[0].target).toBe(outputNode.id);
    expect(plan.innerEdges[0].targetHandle).toBe("value");

    expect(plan.outerEdgesToAdd).toHaveLength(1);
    expect(plan.outerEdgesToAdd[0].source).toBe("sub-1");
    expect(plan.outerEdgesToAdd[0].sourceHandle).toBe("out1");
    expect(plan.outerEdgesToAdd[0].target).toBe("b");
  });

  it("dedupes multiple outer-edges from same source/handle to one Output port", () => {
    // a is selected; a.output → b.in, a.output → c.in (fan-out)
    const selected = ["a"];
    const selectedNodes = selected.map((id) => makeNode(id));
    const edges = [
      makeEdge("e1", "a", "output", "b", "in"),
      makeEdge("e2", "a", "output", "c", "in")
    ];

    const plan = buildPlan(
      new Set(selected),
      selectedNodes,
      edges,
      "sub-1",
      center
    );

    const outputNodes = plan.innerNodes.filter(
      (n) => n.type === "nodetool.output.Output"
    );
    expect(outputNodes).toHaveLength(1);
    expect(plan.innerEdges).toHaveLength(1);
    expect(plan.outerEdgesToAdd).toHaveLength(2);
    expect(plan.outerEdgesToAdd.every((e) => e.source === "sub-1")).toBe(true);
    expect(
      plan.outerEdgesToAdd.every((e) => e.sourceHandle === "out1")
    ).toBe(true);
    expect(plan.outerEdgesToAdd.map((e) => e.target).sort()).toEqual([
      "b",
      "c"
    ]);
  });

  it("ignores edges where neither endpoint is in the selection", () => {
    const selected = ["x"];
    const selectedNodes = selected.map((id) => makeNode(id));
    const edges = [makeEdge("e1", "a", "output", "b", "input")];

    const plan = buildPlan(
      new Set(selected),
      selectedNodes,
      edges,
      "sub-1",
      center
    );

    expect(plan.innerEdges).toHaveLength(0);
    expect(plan.outerEdgesToAdd).toHaveLength(0);
    expect(plan.outerEdgesToRemove).toEqual([]);
    // Selection nodes themselves still get moved inside (as inner nodes).
    expect(plan.innerNodes).toHaveLength(1);
    expect((plan.innerNodes[0] as { id: string }).id).toBe("x");
  });

  it("handles mixed crossing + internal edges in a single pass", () => {
    // Selection: { a, b }. Pattern:
    //   ext1 → a (incoming),  a → b (internal),  b → ext2 (outgoing)
    const selected = ["a", "b"];
    const selectedNodes = selected.map((id) => makeNode(id));
    const edges = [
      makeEdge("e1", "ext1", "output", "a", "in"),
      makeEdge("e2", "a", "output", "b", "in"),
      makeEdge("e3", "b", "output", "ext2", "in")
    ];

    const plan = buildPlan(
      new Set(selected),
      selectedNodes,
      edges,
      "sub-1",
      center
    );

    // Inner has a + b + 1 InputNode + 1 OutputNode + 3 inner edges.
    expect(plan.innerNodes).toHaveLength(4);
    expect(plan.innerEdges).toHaveLength(3);
    expect(plan.outerEdgesToAdd).toHaveLength(2);
    expect(plan.outerEdgesToRemove.sort()).toEqual(["e1", "e2", "e3"]);
  });
});
