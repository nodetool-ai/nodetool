import { getNodeDisplayName, getNodeNamespace } from "../nodeDisplay";

describe("nodeDisplay", () => {
  describe("getNodeDisplayName", () => {
    it("extracts the last part after splitting by dot", () => {
      expect(getNodeDisplayName("nodetool.process.TextConcatenate")).toBe("TextConcatenate");
    });

    it("handles simple string without dots", () => {
      expect(getNodeDisplayName("SimpleNode")).toBe("SimpleNode");
    });

    it("returns empty string for empty input", () => {
      expect(getNodeDisplayName("")).toBe("");
    });

    it("handles multiple dots", () => {
      expect(getNodeDisplayName("a.b.c.d")).toBe("d");
    });

    it("handles leading dot", () => {
      expect(getNodeDisplayName(".nodetool")).toBe("nodetool");
    });
  });

  describe("getNodeNamespace", () => {
    it("returns all parts except the last after splitting by dot", () => {
      expect(getNodeNamespace("nodetool.process.TextConcatenate")).toBe("nodetool.process");
    });

    it("returns empty string for simple string without dots", () => {
      expect(getNodeNamespace("SimpleNode")).toBe("");
    });

    it("returns empty string for empty input", () => {
      expect(getNodeNamespace("")).toBe("");
    });

    it("handles multiple dots", () => {
      expect(getNodeNamespace("a.b.c.d")).toBe("a.b.c");
    });

    it("handles trailing dot", () => {
      expect(getNodeNamespace("nodetool.process.")).toBe("nodetool.process");
    });
  });
});
