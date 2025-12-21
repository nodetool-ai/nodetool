import { wouldCreateCycle } from "../graphCycle";
import type { Edge } from "@xyflow/react";

describe("graphCycle", () => {
  describe("wouldCreateCycle", () => {
    it("returns false when sourceId is null", () => {
      const edges: Edge[] = [];
      const result = wouldCreateCycle(edges, null, "target");
      expect(result).toBe(false);
    });

    it("returns false when targetId is null", () => {
      const edges: Edge[] = [];
      const result = wouldCreateCycle(edges, "source", null);
      expect(result).toBe(false);
    });

    it("returns false when both sourceId and targetId are null", () => {
      const edges: Edge[] = [];
      const result = wouldCreateCycle(edges, null, null);
      expect(result).toBe(false);
    });

    it("returns true when sourceId equals targetId (self-loop)", () => {
      const edges: Edge[] = [];
      const result = wouldCreateCycle(edges, "node1", "node1");
      expect(result).toBe(true);
    });

    it("returns false for empty graph", () => {
      const edges: Edge[] = [];
      const result = wouldCreateCycle(edges, "node1", "node2");
      expect(result).toBe(false);
    });

    it("returns false when no path exists from target to source", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "C" }
      ];
      // Adding D -> A would not create cycle since A->B->C doesn't lead back to D
      const result = wouldCreateCycle(edges, "D", "A");
      expect(result).toBe(false);
    });

    it("returns true for simple direct cycle (A->B, adding B->A)", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" }
      ];
      // Adding B -> A would create cycle
      const result = wouldCreateCycle(edges, "B", "A");
      expect(result).toBe(true);
    });

    it("returns true for indirect cycle (A->B->C, adding C->A)", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "C" }
      ];
      // Adding C -> A would create cycle
      const result = wouldCreateCycle(edges, "C", "A");
      expect(result).toBe(true);
    });

    it("returns true for longer chain cycle (A->B->C->D, adding D->A)", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "C" },
        { id: "e3", source: "C", target: "D" }
      ];
      // Adding D -> A would create cycle
      const result = wouldCreateCycle(edges, "D", "A");
      expect(result).toBe(true);
    });

    it("returns false when adding edge to unconnected component", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "C", target: "D" }
      ];
      // Adding E -> A doesn't create cycle
      const result = wouldCreateCycle(edges, "E", "A");
      expect(result).toBe(false);
    });

    it("handles complex branching without cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "C" },
        { id: "e3", source: "B", target: "D" },
        { id: "e4", source: "C", target: "D" }
      ];
      // Adding D -> E doesn't create cycle
      const result = wouldCreateCycle(edges, "D", "E");
      expect(result).toBe(false);
    });

    it("detects cycle in diamond pattern", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "C" },
        { id: "e3", source: "B", target: "D" },
        { id: "e4", source: "C", target: "D" }
      ];
      // Adding D -> A would create cycle
      const result = wouldCreateCycle(edges, "D", "A");
      expect(result).toBe(true);
    });

    it("handles edges with missing source", () => {
      const edges: Edge[] = [
        { id: "e1", source: "", target: "B" },
        { id: "e2", source: "A", target: "C" }
      ];
      const result = wouldCreateCycle(edges, "C", "A");
      expect(result).toBe(true);
    });

    it("handles edges with missing target", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "" },
        { id: "e2", source: "A", target: "B" }
      ];
      const result = wouldCreateCycle(edges, "B", "A");
      expect(result).toBe(true);
    });

    it("returns false for parallel edges without cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "B" } // duplicate edge
      ];
      const result = wouldCreateCycle(edges, "C", "A");
      expect(result).toBe(false);
    });

    it("correctly identifies no cycle in tree structure", () => {
      const edges: Edge[] = [
        { id: "e1", source: "root", target: "child1" },
        { id: "e2", source: "root", target: "child2" },
        { id: "e3", source: "child1", target: "grandchild1" },
        { id: "e4", source: "child1", target: "grandchild2" }
      ];
      // Adding new leaf doesn't create cycle
      const result = wouldCreateCycle(edges, "grandchild1", "newnode");
      expect(result).toBe(false);
    });

    it("detects cycle attempt in tree structure", () => {
      const edges: Edge[] = [
        { id: "e1", source: "root", target: "child1" },
        { id: "e2", source: "root", target: "child2" },
        { id: "e3", source: "child1", target: "grandchild1" }
      ];
      // Adding grandchild1 -> root would create cycle
      const result = wouldCreateCycle(edges, "grandchild1", "root");
      expect(result).toBe(true);
    });

    it("handles multiple disconnected subgraphs", () => {
      const edges: Edge[] = [
        // Graph 1: A -> B
        { id: "e1", source: "A", target: "B" },
        // Graph 2: C -> D -> E
        { id: "e2", source: "C", target: "D" },
        { id: "e3", source: "D", target: "E" }
      ];
      // Adding B -> C connects the graphs but doesn't create cycle
      const result = wouldCreateCycle(edges, "B", "C");
      expect(result).toBe(false);
    });
  });
});
