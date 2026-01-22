import { Edge } from "@xyflow/react";
import { wouldCreateCycle } from "../graphCycle";

describe("graphCycle", () => {
  const createEdge = (source: string, target: string): Edge => ({
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    type: "default",
    animated: false,
    selectable: true,
    deletable: true,
    data: {},
    style: {}
  });

  describe("wouldCreateCycle", () => {
    describe("Edge Cases", () => {
      it("should return false for empty edges array", () => {
        expect(wouldCreateCycle([], "a", "b")).toBe(false);
      });

      it("should return false when source is null", () => {
        const edges = [createEdge("a", "b")];
        expect(wouldCreateCycle(edges, null, "b")).toBe(false);
      });

      it("should return false when target is null", () => {
        const edges = [createEdge("a", "b")];
        expect(wouldCreateCycle(edges, "a", null)).toBe(false);
      });

      it("should return false when source and target are both null", () => {
        const edges = [createEdge("a", "b")];
        expect(wouldCreateCycle(edges, null, null)).toBe(false);
      });

      it("should return true when source equals target", () => {
        const edges: Edge[] = [];
        expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
      });
    });

    describe("Simple Connections", () => {
      it("should return false for simple non-cyclic connection", () => {
        const edges = [createEdge("a", "b")];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
      });

      it("should return false for connecting to unconnected node", () => {
        const edges = [createEdge("a", "b"), createEdge("b", "c")];
        expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
      });

      it("should return true when connecting would create direct cycle", () => {
        const edges = [createEdge("a", "b"), createEdge("b", "c")];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
      });

      it("should return true when connecting would create indirect cycle", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("c", "d")
        ];
        expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      });
    });

    describe("Chain Detection", () => {
      it("should detect cycle in A -> B -> C -> A", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("c", "a")
        ];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
      });

      it("should detect cycle when connecting to earlier node in chain", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("c", "d"),
          createEdge("d", "e")
        ];
        expect(wouldCreateCycle(edges, "e", "b")).toBe(true);
      });

      it("should not detect cycle when connecting forward in chain", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("c", "d")
        ];
        expect(wouldCreateCycle(edges, "a", "d")).toBe(false);
      });
    });

    describe("Branching Graphs", () => {
      it("should detect cycle in branching graph", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("a", "c"),
          createEdge("b", "d"),
          createEdge("c", "d"),
          createEdge("d", "a")
        ];
        expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      });

      it("should detect cycle in diamond graph when connecting end to start", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("a", "c"),
          createEdge("b", "d"),
          createEdge("c", "d")
        ];
        expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      });

      it("should detect cycle when connecting backward in branching graph", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("a", "c"),
          createEdge("b", "d"),
          createEdge("c", "e")
        ];
        expect(wouldCreateCycle(edges, "e", "a")).toBe(true);
      });
    });

    describe("Multiple Paths", () => {
      it("should detect cycle with multiple paths to same node", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("a", "c"),
          createEdge("b", "d"),
          createEdge("c", "d"),
          createEdge("d", "a")
        ];
        expect(wouldCreateCycle(edges, "d", "a")).toBe(true);
      });

      it("should handle disconnected components", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("x", "y"),
          createEdge("y", "z")
        ];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
        expect(wouldCreateCycle(edges, "z", "x")).toBe(true);
        expect(wouldCreateCycle(edges, "d", "a")).toBe(false);
      });
    });

    describe("Self-loops", () => {
      it("should detect self-loop as cycle", () => {
        const edges: Edge[] = [];
        expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
      });

      it("should handle existing self-loop in edges", () => {
        const edges = [createEdge("a", "a")];
        expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
      });
    });

    describe("Complex Graphs", () => {
      it("should detect cycle in complex mesh", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("c", "d"),
          createEdge("d", "e"),
          createEdge("e", "f"),
          createEdge("f", "a")
        ];
        expect(wouldCreateCycle(edges, "f", "a")).toBe(true);
      });

      it("should detect cycle when connecting backward in complex DAG", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("a", "c"),
          createEdge("b", "d"),
          createEdge("c", "d"),
          createEdge("b", "e"),
          createEdge("c", "e"),
          createEdge("d", "f"),
          createEdge("e", "f")
        ];
        expect(wouldCreateCycle(edges, "f", "a")).toBe(true);
        expect(wouldCreateCycle(edges, "f", "b")).toBe(true);
        expect(wouldCreateCycle(edges, "f", "c")).toBe(true);
      });

      it("should handle bidirectional edges", () => {
        const edges = [
          createEdge("a", "b"),
          createEdge("b", "c"),
          createEdge("c", "b")
        ];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
        expect(wouldCreateCycle(edges, "b", "a")).toBe(true);
      });
    });

    describe("Long Chains", () => {
      it("should detect cycle in 10-node chain", () => {
        const edges = [
          createEdge("0", "1"),
          createEdge("1", "2"),
          createEdge("2", "3"),
          createEdge("3", "4"),
          createEdge("4", "5"),
          createEdge("5", "6"),
          createEdge("6", "7"),
          createEdge("7", "8"),
          createEdge("8", "9")
        ];
        expect(wouldCreateCycle(edges, "9", "0")).toBe(true);
        expect(wouldCreateCycle(edges, "9", "5")).toBe(true);
        expect(wouldCreateCycle(edges, "9", "9")).toBe(true);
      });

      it("should not detect cycle when connecting new nodes", () => {
        const edges = [
          createEdge("0", "1"),
          createEdge("1", "2"),
          createEdge("2", "3")
        ];
        expect(wouldCreateCycle(edges, "4", "0")).toBe(false);
        expect(wouldCreateCycle(edges, "3", "4")).toBe(false);
      });
    });

    describe("Edge Cases with Invalid Data", () => {
      it("should handle edges with missing source", () => {
        const edges = [
          { ...createEdge("a", "b"), source: null }
        ] as unknown as Edge[];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
      });

      it("should handle edges with missing target", () => {
        const edges = [
          { ...createEdge("a", "b"), target: null }
        ] as unknown as Edge[];
        expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
      });

      it("should handle mixed valid and invalid edges", () => {
        const edges = [
          createEdge("a", "b"),
          { ...createEdge("c", "d"), source: null } as unknown as Edge,
          createEdge("b", "e")
        ];
        expect(wouldCreateCycle(edges, "e", "a")).toBe(true);
      });
    });
  });
});
