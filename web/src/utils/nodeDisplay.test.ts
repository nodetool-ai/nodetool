import { getNodeDisplayName, getNodeNamespace } from "./nodeDisplay";

describe("nodeDisplay", () => {
  describe("getNodeDisplayName", () => {
    it("extracts last part from namespaced path", () => {
      expect(getNodeDisplayName("audio.PlayAudio")).toBe("PlayAudio");
      expect(getNodeDisplayName("image.GenerateImage")).toBe("GenerateImage");
      expect(getNodeDisplayName("nodetool.input.TextInput")).toBe("TextInput");
    });

    it("returns full string when no namespace", () => {
      expect(getNodeDisplayName("SimpleNode")).toBe("SimpleNode");
    });

    it("handles empty string", () => {
      expect(getNodeDisplayName("")).toBe("");
    });

    it("handles single segment", () => {
      expect(getNodeDisplayName("Node")).toBe("Node");
    });

    it("handles deeply nested paths", () => {
      expect(getNodeDisplayName("a.b.c.d.DeepNode")).toBe("DeepNode");
    });

    it("handles trailing dot", () => {
      expect(getNodeDisplayName("audio.")).toBe("audio.");
    });
  });

  describe("getNodeNamespace", () => {
    it("extracts namespace from namespaced path", () => {
      expect(getNodeNamespace("audio.PlayAudio")).toBe("audio");
      expect(getNodeNamespace("image.GenerateImage")).toBe("image");
      expect(getNodeNamespace("nodetool.input.TextInput")).toBe("nodetool.input");
    });

    it("returns empty string when no namespace", () => {
      expect(getNodeNamespace("SimpleNode")).toBe("");
    });

    it("handles empty string", () => {
      expect(getNodeNamespace("")).toBe("");
    });

    it("handles single segment", () => {
      expect(getNodeNamespace("Node")).toBe("");
    });

    it("handles deeply nested paths", () => {
      expect(getNodeNamespace("a.b.c.d.DeepNode")).toBe("a.b.c.d");
    });

    it("handles trailing dot", () => {
      expect(getNodeNamespace("audio.")).toBe("audio");
    });
  });
});
