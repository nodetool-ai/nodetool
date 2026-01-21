import { searchNodes, NodeSearchResult } from "../nodeSearch";
import { NodeMetadata } from "../stores/MetadataStore";

describe("nodeSearch", () => {
  const mockNodes: NodeMetadata[] = [
    {
      node_type: "nodetool.input.text_input",
      name: "Text Input",
      description: "Input text for processing",
      category: "Input",
      inputs: [{ name: "text", type: "text" }],
      outputs: [{ name: "text", type: "text" }],
      properties: {},
      default_properties: {},
    },
    {
      node_type: "nodetool.process.llm",
      name: "LLM Processor",
      description: "Large language model for text processing",
      category: "Processing",
      inputs: [{ name: "text", type: "text" }],
      outputs: [{ name: "text", type: "text" }],
      properties: {},
      default_properties: {},
    },
    {
      node_type: "nodetool.output.text_output",
      name: "Text Output",
      description: "Display text output",
      category: "Output",
      inputs: [{ name: "text", type: "text" }],
      outputs: [],
      properties: {},
      default_properties: {},
    },
  ];

  describe("searchNodes", () => {
    it("returns all nodes for empty query", () => {
      const results = searchNodes("", mockNodes);
      expect(results).toHaveLength(3);
    });

    it("filters nodes by name", () => {
      const results = searchNodes("Text", mockNodes);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.node.name)).toContain("Text Input");
      expect(results.map(r => r.node.name)).toContain("Text Output");
    });

    it("filters nodes by description", () => {
      const results = searchNodes("language", mockNodes);
      expect(results).toHaveLength(1);
      expect(results[0].node.name).toBe("LLM Processor");
    });

    it("filters nodes by category", () => {
      const results = searchNodes("Processing", mockNodes);
      expect(results).toHaveLength(1);
      expect(results[0].node.name).toBe("LLM Processor");
    });

    it("is case-insensitive", () => {
      const results1 = searchNodes("TEXT", mockNodes);
      const results2 = searchNodes("text", mockNodes);
      expect(results1).toHaveLength(results2.length);
    });

    it("returns empty array for non-matching query", () => {
      const results = searchNodes("xyz123", mockNodes);
      expect(results).toHaveLength(0);
    });

    it("returns results sorted by relevance", () => {
      const results = searchNodes("text", mockNodes);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("returns node_type in results", () => {
      const results = searchNodes("LLM", mockNodes);
      expect(results[0].node.node_type).toBe("nodetool.process.llm");
    });
  });
});
