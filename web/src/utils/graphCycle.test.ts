import { Edge } from "@xyflow/react";
import { wouldCreateCycle } from "./graphCycle";

describe("graphCycle", () => {
  describe("wouldCreateCycle", () => {
    it("returns false when sourceId or targetId is null/undefined", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "a", null)).toBe(false);
      expect(wouldCreateCycle(edges, null, "b")).toBe(false);
      expect(wouldCreateCycle(edges, undefined, undefined)).toBe(false);
    });

    it("returns true when sourceId equals targetId", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    });

    it("returns false when no edges exist", () => {
      const edges: Edge[] = [];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("returns false when adding edge does not create cycle", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
      expect(wouldCreateCycle(edges, "d", "e")).toBe(false);
    });

    it("returns true when adding edge would create a cycle", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    });

    it("returns true when adding edge would create indirect cycle", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "b", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "3", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "b")).toBe(true);
    });

    it("returns false when target cannot reach source", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
      expect(wouldCreateCycle(edges, "d", "b")).toBe(false);
    });

    it("skips edges with missing source or target", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "3", source: "d", target: "", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
    });

    it("handles self-loop in existing edges", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "a", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "b", "a")).toBe(false);
    });

    it("handles complex graph with multiple paths", () => {
      const edges: Edge[] = [
        { id: "1", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "a", target: "c", sourceHandle: "out", targetHandle: "in" },
        { id: "3", source: "b", target: "d", sourceHandle: "out", targetHandle: "in" },
        { id: "4", source: "c", target: "d", sourceHandle: "out", targetHandle: "in" },
      ];
      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "d", "b")).toBe(true);
    });
  });
});
