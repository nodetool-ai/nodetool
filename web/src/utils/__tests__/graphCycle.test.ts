import { Edge } from "@xyflow/react";
import { wouldCreateCycle } from "../graphCycle";

describe("graphCycle", () => {
  describe("wouldCreateCycle", () => {
    it("returns false when sourceId or targetId is undefined", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, undefined, "target")).toBe(false);
      expect(wouldCreateCycle(edges, "source", undefined)).toBe(false);
      expect(wouldCreateCycle(edges, undefined, undefined)).toBe(false);
    });

    it("returns false when sourceId or targetId is null", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, null, "target")).toBe(false);
      expect(wouldCreateCycle(edges, "source", null)).toBe(false);
    });

    it("returns true when sourceId equals targetId", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "node1", "node1")).toBe(true);
    });

    it("returns false when no existing edges", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "source", "target")).toBe(false);
    });

    it("returns false when edge does not create a cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", type: "default" } as Edge,
        { id: "e2", source: "b", target: "c", type: "default" } as Edge
      ];
      expect(wouldCreateCycle(edges, "d", "e")).toBe(false);
      expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
    });

    it("returns true when edge would create a cycle with existing path", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", type: "default" } as Edge,
        { id: "e2", source: "b", target: "c", type: "default" } as Edge
      ];
      expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    });

    it("returns true when edge would create direct self-loop", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    });

    it("returns true when edge would create cycle through multiple nodes", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", type: "default" } as Edge,
        { id: "e2", source: "b", target: "c", type: "default" } as Edge,
        { id: "e3", source: "c", target: "d", type: "default" } as Edge
      ];
      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "b")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "c")).toBe(true);
    });

    it("handles edges with missing source or target", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", type: "default" } as Edge,
        { id: "e2", source: undefined as unknown as string, target: "c", type: "default" } as Edge,
        { id: "e3", source: "d", target: undefined as unknown as string, type: "default" } as Edge
      ];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("handles complex graph with branching", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", type: "default" } as Edge,
        { id: "e2", source: "a", target: "c", type: "default" } as Edge,
        { id: "e3", source: "b", target: "d", type: "default" } as Edge,
        { id: "e4", source: "c", target: "d", type: "default" } as Edge
      ];
      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "b")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "c")).toBe(true);
    });

    it("handles empty graph", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("handles graph with only one edge", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", type: "default" } as Edge
      ];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
      expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
    });
  });
});
