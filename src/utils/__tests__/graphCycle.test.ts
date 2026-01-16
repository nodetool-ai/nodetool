import { wouldCreateCycle } from "../graphCycle";
import { Edge } from "@xyflow/react";

describe("graphCycle utility", () => {
  it("returns false for null/undefined sourceId", () => {
    const edges: Edge[] = [];
    expect(wouldCreateCycle(edges, null, "target")).toBe(false);
    expect(wouldCreateCycle(edges, undefined, "target")).toBe(false);
  });

  it("returns false for null/undefined targetId", () => {
    const edges: Edge[] = [];
    expect(wouldCreateCycle(edges, "source", null)).toBe(false);
    expect(wouldCreateCycle(edges, "source", undefined)).toBe(false);
  });

  it("returns true when source equals target (self-loop)", () => {
    const edges: Edge[] = [];
    expect(wouldCreateCycle(edges, "node1", "node1")).toBe(true);
  });

  it("returns false for empty edges array", () => {
    const edges: Edge[] = [];
    expect(wouldCreateCycle(edges, "source", "target")).toBe(false);
  });

  it("returns false when no path exists from target to source", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node1", target: "node2", type: "default" },
      { id: "e2", source: "node3", target: "node4", type: "default" }
    ] as Edge[];
    expect(wouldCreateCycle(edges, "node1", "node3")).toBe(false);
  });

  it("returns true when target can reach source", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node1", target: "node2", type: "default" },
      { id: "e2", source: "node2", target: "node3", type: "default" }
    ] as Edge[];
    // Adding edge from node3 -> node1 would create a cycle
    expect(wouldCreateCycle(edges, "node1", "node3")).toBe(true);
  });

  it("returns false when no path from target to source exists", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node1", target: "node2", type: "default" },
      { id: "e2", source: "node2", target: "node3", type: "default" }
    ] as Edge[];
    // Adding edge from node4 -> node1 doesn't create a cycle
    expect(wouldCreateCycle(edges, "node1", "node4")).toBe(false);
  });

  it("handles edges with missing source or target", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node1", target: "node2", type: "default" },
      { id: "e2", source: null as unknown as string, target: "node3", type: "default" },
      { id: "e3", source: "node4", target: null as unknown as string, type: "default" }
    ] as Edge[];
    expect(wouldCreateCycle(edges, "node1", "node2")).toBe(false);
  });

  it("returns false for direct connection without existing path", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node1", target: "node2", type: "default" }
    ] as Edge[];
    // Direct connection node1 -> node2 doesn't create cycle
    expect(wouldCreateCycle(edges, "node2", "node1")).toBe(false);
  });

  it("handles complex graph with multiple paths", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node1", target: "node2", type: "default" },
      { id: "e2", source: "node1", target: "node3", type: "default" },
      { id: "e3", source: "node2", target: "node4", type: "default" },
      { id: "e4", source: "node3", target: "node4", type: "default" }
    ] as Edge[];
    // From node4 to node1 would create cycle
    expect(wouldCreateCycle(edges, "node1", "node4")).toBe(true);
    // From node5 to node1 is safe
    expect(wouldCreateCycle(edges, "node1", "node5")).toBe(false);
  });
});
