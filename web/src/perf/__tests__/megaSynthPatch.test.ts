/**
 * @jest-environment node
 */
import { buildMegaSynthPatch } from "../megaSynthPatch";

describe("buildMegaSynthPatch", () => {
  describe("single layer", () => {
    const patch = buildMegaSynthPatch(1);

    it("returns nodes and edges arrays", () => {
      expect(Array.isArray(patch.nodes)).toBe(true);
      expect(Array.isArray(patch.edges)).toBe(true);
      expect(patch.nodes.length).toBeGreaterThan(0);
      expect(patch.edges.length).toBeGreaterThan(0);
    });

    it("produces unique node ids", () => {
      const ids = patch.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("produces unique edge ids", () => {
      const ids = patch.edges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every edge references existing node ids", () => {
      const nodeIds = new Set(patch.nodes.map((n) => n.id));
      for (const edge of patch.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });

    it("includes shared clock nodes", () => {
      const ids = new Set(patch.nodes.map((n) => n.id));
      expect(ids.has("clk16")).toBe(true);
      expect(ids.has("clk8")).toBe(true);
      expect(ids.has("clk2")).toBe(true);
      expect(ids.has("clkBar")).toBe(true);
    });

    it("includes master chain nodes", () => {
      const ids = new Set(patch.nodes.map((n) => n.id));
      expect(ids.has("master-gain")).toBe(true);
      expect(ids.has("master-hp")).toBe(true);
      expect(ids.has("speaker")).toBe(true);
    });

    it("every node has position data", () => {
      for (const node of patch.nodes) {
        expect(node.ui_properties).toBeDefined();
        expect(typeof node.ui_properties.position.x).toBe("number");
        expect(typeof node.ui_properties.position.y).toBe("number");
      }
    });

    it("every node has a valid type string", () => {
      for (const node of patch.nodes) {
        expect(node.type).toMatch(/^nodetool\./);
      }
    });

    it("does not suffix node ids with layer index for single layer", () => {
      const layerSuffixed = patch.nodes.filter((n) => n.id.endsWith("-0"));
      expect(layerSuffixed).toHaveLength(0);
    });
  });

  describe("multi-layer scaling", () => {
    const single = buildMegaSynthPatch(1);
    const triple = buildMegaSynthPatch(3);

    it("scales node count with layers", () => {
      expect(triple.nodes.length).toBeGreaterThan(single.nodes.length);
    });

    it("scales edge count with layers", () => {
      expect(triple.edges.length).toBeGreaterThan(single.edges.length);
    });

    it("shares clock nodes across layers", () => {
      const clockNodes = triple.nodes.filter((n) =>
        ["clk16", "clk8", "clk2", "clkBar"].includes(n.id)
      );
      expect(clockNodes).toHaveLength(4);
    });

    it("suffixes layer-specific nodes with layer index", () => {
      const layer1Nodes = triple.nodes.filter((n) => n.id.endsWith("-1"));
      const layer2Nodes = triple.nodes.filter((n) => n.id.endsWith("-2"));
      expect(layer1Nodes.length).toBeGreaterThan(0);
      expect(layer2Nodes.length).toBeGreaterThan(0);
    });

    it("produces fold mixers for multi-layer", () => {
      const foldNodes = triple.nodes.filter((n) => n.id.startsWith("fold-"));
      expect(foldNodes.length).toBeGreaterThan(0);
    });

    it("all edges still reference valid nodes", () => {
      const nodeIds = new Set(triple.nodes.map((n) => n.id));
      for (const edge of triple.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });
  });

  describe("edge cases", () => {
    it("clamps layers below 1 to 1", () => {
      const zero = buildMegaSynthPatch(0);
      const neg = buildMegaSynthPatch(-5);
      const one = buildMegaSynthPatch(1);
      expect(zero.nodes.length).toBe(one.nodes.length);
      expect(neg.nodes.length).toBe(one.nodes.length);
    });

    it("handles fractional layers by flooring", () => {
      const patch = buildMegaSynthPatch(2.9);
      const two = buildMegaSynthPatch(2);
      expect(patch.nodes.length).toBe(two.nodes.length);
    });

    it("handles large layer count without error", () => {
      const patch = buildMegaSynthPatch(8);
      expect(patch.nodes.length).toBeGreaterThan(0);
      const nodeIds = new Set(patch.nodes.map((n) => n.id));
      for (const edge of patch.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });
  });
});
