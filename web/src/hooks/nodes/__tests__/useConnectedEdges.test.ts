import { renderHook } from "@testing-library/react";
import { useConnectedEdgesSelector } from "../useConnectedEdges";
import { Edge } from "@xyflow/react";
import { NodeStoreState } from "../../../stores/NodeStore";

describe("useConnectedEdgesSelector", () => {
  it("returns stable references when edges are identical", () => {
    const { result } = renderHook(() => useConnectedEdgesSelector("node1"));
    const selector = result.current;

    const edge1 = { id: "e1", target: "node1" } as Edge;
    const edge2 = { id: "e2", target: "node2" } as Edge;

    const state1 = { edges: [edge1, edge2] } as NodeStoreState;
    const res1 = selector(state1);

    expect(res1).toEqual([edge1]);

    // Same edges array
    const res2 = selector(state1);
    expect(res2).toBe(res1);

    // New edges array, but same relevant edges
    const edge3 = { id: "e3", target: "node3" } as Edge;
    const state2 = { edges: [edge1, edge2, edge3] } as NodeStoreState;
    const res3 = selector(state2);

    expect(res3).toBe(res1); // Must be stable reference!
  });
});
