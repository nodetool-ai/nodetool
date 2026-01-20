import { Edge } from "@xyflow/react";
import { wouldCreateCycle } from "../graphCycle";

describe("graphCycle", () => {
  describe("wouldCreateCycle", () => {
    it("returns false for null sourceId", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, null, "target")).toBe(false);
    });

    it("returns false for null targetId", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "source", null)).toBe(false);
    });

    it("returns false for undefined sourceId", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, undefined, "target")).toBe(false);
    });

    it("returns false for undefined targetId", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "source", undefined)).toBe(false);
    });

    it("returns true when source equals target", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "node1", "node1")).toBe(true);
    });

    it("returns false when adding edge creates no cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "b", target: "c", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "a", "d")).toBe(false);
    });

    it("returns false when target cannot reach source", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "c", target: "d", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("returns true when target can reach source (simple cycle)", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "b", target: "c", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    });

    it("returns true when target can reach source (longer path)", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "b", target: "c", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "c", target: "d", sourceHandle: null, targetHandle: null },
        { id: "e4", source: "d", target: "e", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "e", "a")).toBe(true);
    });

    it("returns false when no path exists between source and target", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "c", target: "d", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "b", "c")).toBe(false);
    });

    it("handles edges with missing source or target gracefully", () => {
      const edges: Edge<any, any>[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: null as unknown as string, target: "c", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "d", target: null as unknown as string, sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("returns true for direct cycle (a -> b, adding b -> a)", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
    });

    it("returns false when adding edge to disconnected graph", () => {
      const edges: Edge[] = [
        { id: "e1", source: "x", target: "y", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("handles complex branching graphs correctly", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "a", target: "c", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "b", target: "d", sourceHandle: null, targetHandle: null },
        { id: "e4", source: "c", target: "d", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "b")).toBe(true);
      expect(wouldCreateCycle(edges, "a", "d")).toBe(false);
    });

    it("handles diamond pattern correctly", () => {
      const edges: Edge[] = [
        { id: "e1", source: "start", target: "a", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "start", target: "b", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "a", target: "end", sourceHandle: null, targetHandle: null },
        { id: "e4", source: "b", target: "end", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "end", "start")).toBe(true);
      expect(wouldCreateCycle(edges, "end", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "end", "b")).toBe(true);
      expect(wouldCreateCycle(edges, "start", "end")).toBe(false);
      expect(wouldCreateCycle(edges, "a", "end")).toBe(false);
    });

    it("handles self-loop edge", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "a", sourceHandle: null, targetHandle: null },
      ];

      expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    });
  });
});
