import { collectNodeClasses, normalizeGraphForKernel } from "../browserRunnerCore";
import type { WorkflowGraph } from "../../../stores/ApiTypes";

function makeGraph(
  overrides: {
    nodes?: Record<string, unknown>[];
    edges?: Record<string, unknown>[];
  } = {}
): WorkflowGraph {
  return {
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
  } as WorkflowGraph;
}

describe("browserRunnerCore", () => {
  describe("collectNodeClasses", () => {
    it("collects classes with a static nodeType string", () => {
      class FooNode {
        static nodeType = "nodetool.foo.Foo";
      }
      class BarNode {
        static nodeType = "nodetool.bar.Bar";
      }

      const result = collectNodeClasses({ FooNode, BarNode });
      expect(result).toHaveLength(2);
      expect(result).toContain(FooNode);
      expect(result).toContain(BarNode);
    });

    it("collects classes from array exports", () => {
      class Alpha {
        static nodeType = "nodetool.alpha.Alpha";
      }
      class Beta {
        static nodeType = "nodetool.beta.Beta";
      }

      const result = collectNodeClasses({
        SOME_NODES: [Alpha, Beta],
      });
      expect(result).toHaveLength(2);
      expect(result).toContain(Alpha);
      expect(result).toContain(Beta);
    });

    it("deduplicates classes exported both individually and in arrays", () => {
      class Gamma {
        static nodeType = "nodetool.gamma.Gamma";
      }

      const result = collectNodeClasses({
        Gamma,
        ALL_NODES: [Gamma],
      });
      expect(result).toHaveLength(1);
      expect(result).toContain(Gamma);
    });

    it("ignores non-class exports", () => {
      const result = collectNodeClasses({
        VERSION: "1.0.0",
        config: { debug: true },
        noop: () => {},
      });
      expect(result).toHaveLength(0);
    });

    it("ignores functions without a static nodeType", () => {
      function NotANode() {}
      const result = collectNodeClasses({ NotANode });
      expect(result).toHaveLength(0);
    });

    it("ignores array items that are not node classes", () => {
      class RealNode {
        static nodeType = "nodetool.real.Real";
      }
      const result = collectNodeClasses({
        mixed: [RealNode, "not-a-class", 42, null],
      });
      expect(result).toHaveLength(1);
      expect(result).toContain(RealNode);
    });

    it("returns empty array for empty module", () => {
      expect(collectNodeClasses({})).toHaveLength(0);
    });
  });

  describe("normalizeGraphForKernel", () => {
    it("moves node.data to node.properties", () => {
      const graph = makeGraph({
        nodes: [
          { id: "n1", type: "nodetool.foo.Foo", data: { prompt: "hello" } },
        ],
      });

      const result = normalizeGraphForKernel(graph);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]).toHaveProperty("properties", { prompt: "hello" });
      expect(result.nodes[0]).not.toHaveProperty("data");
    });

    it("preserves node.properties if already present", () => {
      const graph = makeGraph({
        nodes: [
          { id: "n1", type: "nodetool.foo.Foo", properties: { x: 1 } },
        ],
      });

      const result = normalizeGraphForKernel(graph);
      expect(result.nodes[0]).toHaveProperty("properties", { x: 1 });
    });

    it("normalizes edge type to edge_type", () => {
      const graph = makeGraph({
        edges: [
          { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", type: "data" },
          { id: "e2", source: "b", sourceHandle: "out", target: "c", targetHandle: "in", type: "control" },
        ],
      });

      const result = normalizeGraphForKernel(graph);
      expect(result.edges[0]).toHaveProperty("edge_type", "data");
      expect(result.edges[1]).toHaveProperty("edge_type", "control");
      expect(result.edges[0]).not.toHaveProperty("type");
    });

    it("defaults edge_type to 'data' for unknown types", () => {
      const graph = makeGraph({
        edges: [
          { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", type: "something_else" },
          { id: "e2", source: "c", sourceHandle: "out", target: "d", targetHandle: "in" },
        ],
      });

      const result = normalizeGraphForKernel(graph);
      expect(result.edges[0]).toHaveProperty("edge_type", "data");
      expect(result.edges[1]).toHaveProperty("edge_type", "data");
    });

    it("preserves existing edge_type field", () => {
      const graph = makeGraph({
        edges: [
          { id: "e1", source: "a", sourceHandle: "out", target: "b", targetHandle: "in", edge_type: "control" },
        ],
      });

      const result = normalizeGraphForKernel(graph);
      expect(result.edges[0]).toHaveProperty("edge_type", "control");
    });

    it("handles empty graph", () => {
      const result = normalizeGraphForKernel(makeGraph());
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it("handles undefined nodes/edges gracefully", () => {
      const result = normalizeGraphForKernel({} as WorkflowGraph);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });
});
