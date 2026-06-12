import { collectNodeClasses, normalizeGraphForKernel } from "../browserRunnerCore";

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
      const graph = {
        nodes: [
          { id: "n1", type: "nodetool.foo.Foo", data: { prompt: "hello" } },
        ],
        edges: [],
      };

      const result = normalizeGraphForKernel(graph as any);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]).toHaveProperty("properties", { prompt: "hello" });
      expect(result.nodes[0]).not.toHaveProperty("data");
    });

    it("preserves node.properties if already present", () => {
      const graph = {
        nodes: [
          { id: "n1", type: "nodetool.foo.Foo", properties: { x: 1 } },
        ],
        edges: [],
      };

      const result = normalizeGraphForKernel(graph as any);
      expect(result.nodes[0]).toHaveProperty("properties", { x: 1 });
    });

    it("normalizes edge type to edge_type", () => {
      const graph = {
        nodes: [],
        edges: [
          { id: "e1", source: "a", target: "b", type: "data" },
          { id: "e2", source: "b", target: "c", type: "control" },
        ],
      };

      const result = normalizeGraphForKernel(graph as any);
      expect(result.edges[0]).toHaveProperty("edge_type", "data");
      expect(result.edges[1]).toHaveProperty("edge_type", "control");
      expect(result.edges[0]).not.toHaveProperty("type");
    });

    it("defaults edge_type to 'data' for unknown types", () => {
      const graph = {
        nodes: [],
        edges: [
          { id: "e1", source: "a", target: "b", type: "something_else" },
          { id: "e2", source: "c", target: "d" },
        ],
      };

      const result = normalizeGraphForKernel(graph as any);
      expect(result.edges[0]).toHaveProperty("edge_type", "data");
      expect(result.edges[1]).toHaveProperty("edge_type", "data");
    });

    it("preserves existing edge_type field", () => {
      const graph = {
        nodes: [],
        edges: [
          { id: "e1", source: "a", target: "b", edge_type: "control" },
        ],
      };

      const result = normalizeGraphForKernel(graph as any);
      expect(result.edges[0]).toHaveProperty("edge_type", "control");
    });

    it("handles empty graph", () => {
      const result = normalizeGraphForKernel({ nodes: [], edges: [] } as any);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it("handles undefined nodes/edges gracefully", () => {
      const result = normalizeGraphForKernel({} as any);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });
  });
});
