import { getNodeDisplayName, getNodeNamespace } from "../nodeDisplay";

describe("nodeDisplay", () => {
  describe("getNodeDisplayName", () => {
    it("extracts simple node name", () => {
      expect(getNodeDisplayName("LLM")).toBe("LLM");
    });

    it("extracts last part of namespaced node", () => {
      expect(getNodeDisplayName("nodetool.llm.LLM")).toBe("LLM");
    });

    it("extracts last part of deeply namespaced node", () => {
      expect(getNodeDisplayName("nodetool.workflows.base_node.Comment")).toBe("Comment");
    });

    it("returns original text when empty string after split", () => {
      expect(getNodeDisplayName("")).toBe("");
    });

    it("handles single segment", () => {
      expect(getNodeDisplayName("TextNode")).toBe("TextNode");
    });

    it("handles multiple dots", () => {
      expect(getNodeDisplayName("a.b.c.d")).toBe("d");
    });
  });

  describe("getNodeNamespace", () => {
    it("returns empty for simple node", () => {
      expect(getNodeNamespace("LLM")).toBe("");
    });

    it("returns namespace without last part", () => {
      expect(getNodeNamespace("nodetool.llm.LLM")).toBe("nodetool.llm");
    });

    it("returns partial namespace for deeply nested", () => {
      expect(getNodeNamespace("nodetool.workflows.base_node.Comment")).toBe("nodetool.workflows.base_node");
    });

    it("returns empty for empty string", () => {
      expect(getNodeNamespace("")).toBe("");
    });

    it("returns empty for single segment", () => {
      expect(getNodeNamespace("TextNode")).toBe("");
    });

    it("returns all but last for multiple dots", () => {
      expect(getNodeNamespace("a.b.c.d")).toBe("a.b.c");
    });
  });
});
