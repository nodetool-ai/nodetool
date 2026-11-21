import { renderHook } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import { useConnectedEdgesSelector } from "../useConnectedEdges";
import { Edge } from "@xyflow/react";
import { NodeStoreState } from "../../../stores/NodeStore";

describe("useConnectedEdgesSelector", () => {
  it("returns stable references when edges are identical", () => {
    const { result } = renderHook(() => useConnectedEdgesSelector("node1"));
    const selector = result.current;

    const edge1 = { id: "e1", target: "node1" };
    const edge2 = { id: "e2", target: "node2" };

    const state1 = stub<NodeStoreState>({ edges: [edge1, edge2] });
    const res1 = selector(state1);

    expect(res1).toEqual([edge1]);

    // Same edges array
    const res2 = selector(state1);
    expect(res2).toBe(res1);

    // New edges array, but same relevant edges
    const edge3 = { id: "e3", target: "node3" };
    const state2 = stub<NodeStoreState>({ edges: [edge1, edge2, edge3] });
    const res3 = selector(state2);

    expect(res3).toBe(res1); // Must be stable reference!
  });
});
