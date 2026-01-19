import { wouldCreateCycle } from "../graphCycle";
import { Edge } from "@xyflow/react";

describe("graphCycle", () => {
  describe("wouldCreateCycle", () => {
    it("returns false for empty edges", () => {
      expect(wouldCreateCycle([], "a", "b")).toBe(false);
    });

    it("returns false when null source", () => {
      const edges: Edge[] = [{ id: "e1", source: "a", target: "b" }];
      expect(wouldCreateCycle(edges, null, "b")).toBe(false);
    });

    it("returns false when null target", () => {
      const edges: Edge[] = [{ id: "e1", source: "a", target: "b" }];
      expect(wouldCreateCycle(edges, "a", null)).toBe(false);
    });

    it("returns false when undefined source", () => {
      const edges: Edge[] = [{ id: "e1", source: "a", target: "b" }];
      expect(wouldCreateCycle(edges, undefined, "b")).toBe(false);
    });

    it("returns false when undefined target", () => {
      const edges: Edge[] = [{ id: "e1", source: "a", target: "b" }];
      expect(wouldCreateCycle(edges, "a", undefined)).toBe(false);
    });

    it("returns true when source equals target", () => {
      const edges: Edge[] = [{ id: "e1", source: "a", target: "b" }];
      expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
    });

    it("returns false when no path exists from target to source", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "c", target: "d" }
      ];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("returns true when adding edge creates direct cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "b", target: "c" }
      ];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
      expect(wouldCreateCycle(edges, "c", "b")).toBe(true);
    });

    it("returns true when adding edge creates indirect cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "d" }
      ];
      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
    });

    it("returns false when adding edge does not create cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "d" }
      ];
      expect(wouldCreateCycle(edges, "a", "d")).toBe(false);
    });

    it("handles edges with missing source or target", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: null as any, target: "c" },
        { id: "e3", source: "d", target: undefined as any }
      ];
      // Only e1 is valid, so no path from a to d exists
      expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
    });

    it("handles self-loop edges in graph", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "a" }
      ];
      expect(wouldCreateCycle(edges, "a", "b")).toBe(false);
    });

    it("handles complex graph with multiple paths", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "a", target: "c" },
        { id: "e4", source: "c", target: "d" },
        { id: "e5", source: "d", target: "e" }
      ];
      expect(wouldCreateCycle(edges, "e", "b")).toBe(true);
      expect(wouldCreateCycle(edges, "e", "a")).toBe(true);
      expect(wouldCreateCycle(edges, "a", "e")).toBe(false);
    });

    it("handles disconnected graph components", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "c", target: "d" },
        { id: "e3", source: "e", target: "f" }
      ];
      expect(wouldCreateCycle(edges, "a", "c")).toBe(false);
      expect(wouldCreateCycle(edges, "d", "c")).toBe(true);
    });

    it("handles diamond pattern - adding edge from d to a creates cycle", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "c" },
        { id: "e3", source: "b", target: "d" },
        { id: "e4", source: "c", target: "d" }
      ];
      // a can reach d via a->b->d or a->c->d
      // so adding d->a creates cycle: d->a->b->d
      expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
    });

    it("handles multiple edges between same nodes", () => {
      const edges: Edge[] = [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "b" },
        { id: "e3", source: "b", target: "c" }
      ];
      expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
    });
  });
});
