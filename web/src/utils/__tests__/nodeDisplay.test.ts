import { getNodeDisplayName, getNodeNamespace } from "../nodeDisplay";

describe("nodeDisplay", () => {
  describe("getNodeDisplayName", () => {
    it("should extract last part of dot-separated name", () => {
      expect(getNodeDisplayName("nodetool.input.TextInput")).toBe("TextInput");
      expect(getNodeDisplayName("nodetool.output.AudioOutput")).toBe("AudioOutput");
    });

    it("should handle single name without dots", () => {
      expect(getNodeDisplayName("TextInput")).toBe("TextInput");
    });

    it("should return empty string for empty input", () => {
      expect(getNodeDisplayName("")).toBe("");
    });

    it("should handle name ending with dot", () => {
      expect(getNodeDisplayName("nodetool.")).toBe("nodetool.");
    });

    it("should handle name with multiple dots", () => {
      expect(getNodeDisplayName("a.b.c.d.E")).toBe("E");
    });
  });

  describe("getNodeNamespace", () => {
    it("should return all parts except last", () => {
      expect(getNodeNamespace("nodetool.input.TextInput")).toBe("nodetool.input");
      expect(getNodeNamespace("nodetool.output.AudioOutput")).toBe("nodetool.output");
    });

    it("should return empty string for single name without dots", () => {
      expect(getNodeNamespace("TextInput")).toBe("");
    });

    it("should return empty string for empty input", () => {
      expect(getNodeNamespace("")).toBe("");
    });

    it("should handle name with multiple dots", () => {
      expect(getNodeNamespace("a.b.c.d.E")).toBe("a.b.c.d");
    });

    it("should handle name ending with dot", () => {
      expect(getNodeNamespace("nodetool.")).toBe("nodetool");
    });
  });
});
