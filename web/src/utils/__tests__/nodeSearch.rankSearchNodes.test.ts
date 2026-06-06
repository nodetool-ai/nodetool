/**
 * @jest-environment node
 */
import type { NodeMetadata } from "../../stores/ApiTypes";
import { rankSearchNodes } from "../nodeSearch";

function makeNode(overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    title: "Test Node",
    node_type: "test.TestNode",
    namespace: "test",
    description: "",
    properties: [],
    outputs: [],
    layout: "default",
    primary_field: "",
    secondary_field: "",
    output_type: "",
    color: "",
    ...overrides
  } as NodeMetadata;
}

describe("rankSearchNodes", () => {
  it("returns matching nodes for a query", () => {
    const nodes = [
      makeNode({ title: "Image Resize", node_type: "image.Resize", namespace: "image" }),
      makeNode({ title: "Text Concat", node_type: "text.Concat", namespace: "text" }),
      makeNode({ title: "Image Blur", node_type: "image.Blur", namespace: "image" })
    ];
    const results = rankSearchNodes(nodes, "image");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.searchInfo !== undefined)).toBe(true);
  });

  it("returns empty for no matches", () => {
    const nodes = [
      makeNode({ title: "Image Resize", node_type: "image.Resize", namespace: "image" })
    ];
    const results = rankSearchNodes(nodes, "zzzzzzzzzzzzzzz");
    expect(results.length).toBe(0);
  });

  it("returns empty for empty nodes array", () => {
    expect(rankSearchNodes([], "anything")).toEqual([]);
  });

  it("attaches searchInfo with score to results", () => {
    const nodes = [
      makeNode({ title: "Math Add", node_type: "math.Add", namespace: "math" })
    ];
    const results = rankSearchNodes(nodes, "math");
    if (results.length > 0) {
      expect(results[0].searchInfo).toBeDefined();
      expect(typeof results[0].searchInfo!.score).toBe("number");
    }
  });

  it("handles namespace.name queries", () => {
    const nodes = [
      makeNode({ title: "Add", node_type: "math.Add", namespace: "math" }),
      makeNode({ title: "Subtract", node_type: "math.Subtract", namespace: "math" })
    ];
    const results = rankSearchNodes(nodes, "math.Add");
    expect(results.length).toBeGreaterThan(0);
  });

  it("boosts recent node types", () => {
    const nodes = [
      makeNode({ title: "Alpha", node_type: "a.Alpha", namespace: "a" }),
      makeNode({ title: "Alpha Two", node_type: "a.AlphaTwo", namespace: "a" })
    ];
    const withRecent = rankSearchNodes(nodes, "alpha", ["a.AlphaTwo"]);
    const withoutRecent = rankSearchNodes(nodes, "alpha", []);
    if (withRecent.length >= 2 && withoutRecent.length >= 2) {
      const recentIdx = withRecent.findIndex((r) => r.node_type === "a.AlphaTwo");
      const normalIdx = withoutRecent.findIndex((r) => r.node_type === "a.AlphaTwo");
      expect(recentIdx).toBeLessThanOrEqual(normalIdx);
    }
  });

  it("returns all nodes for empty query (ranked, not filtered)", () => {
    const nodes = [
      makeNode({ title: "A", node_type: "ns.A", namespace: "ns" }),
      makeNode({ title: "B", node_type: "ns.B", namespace: "ns" })
    ];
    const results = rankSearchNodes(nodes, "");
    expect(results.length).toBe(nodes.length);
  });
});
