import { escapeHtml, hexToRgb, highlightText, formatBulletList } from "../highlightText";

describe("highlightText utilities", () => {
  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(escapeHtml("&amp;")).toBe("&amp;amp;");
      expect(escapeHtml('"quote"')).toBe("&quot;quote&quot;");
      expect(escapeHtml("'single'")).toMatch(/&#/);
    });

    it("preserves regular text", () => {
      expect(escapeHtml("Hello World")).toBe("Hello World");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });
  });

  describe("hexToRgb", () => {
    it("converts valid hex to RGB", () => {
      expect(hexToRgb("#FF0000")).toBe("255, 0, 0");
      expect(hexToRgb("#00FF00")).toBe("0, 255, 0");
      expect(hexToRgb("#0000FF")).toBe("0, 0, 255");
    });

    it("handles hex without hash", () => {
      expect(hexToRgb("FF0000")).toBe("255, 0, 0");
    });

    it("handles hex with spaces", () => {
      expect(hexToRgb(" #FF0000 ")).toBe("255, 0, 0");
    });

    it("returns null for invalid hex", () => {
      expect(hexToRgb("not-hex")).toBeNull();
      expect(hexToRgb("#GGG")).toBeNull();
      expect(hexToRgb("")).toBeNull();
    });
  });

  describe("formatBulletList", () => {
    it("converts newlines to bullet list", () => {
      const result = formatBulletList("item1\nitem2\nitem3");
      expect(result).toBe("<ul><li>item1</li>\n<li>item2</li>\n<li>item3</li></ul>");
    });

    it("filters empty lines", () => {
      const result = formatBulletList("item1\n\nitem2");
      expect(result).toBe("<ul><li>item1</li>\n<li>item2</li></ul>");
    });

    it("handles single item", () => {
      const result = formatBulletList("single item");
      expect(result).toBe("<ul><li>single item</li></ul>");
    });

    it("handles empty string", () => {
      const result = formatBulletList("");
      expect(result).toBe("<ul></ul>");
    });
  });

  describe("highlightText", () => {
    const mockNodeMetadata = {
      searchInfo: {
        matches: [
          {
            key: "description",
            indices: [[0, 4]]
          }
        ]
      }
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns plain text when no searchTerm", () => {
      const result = highlightText("Hello World", "description", null);
      expect(result.html).toBe("Hello World");
      expect(result.highlightedWords).toHaveLength(0);
    });

    it("returns plain text when no matches", () => {
      const result = highlightText("Hello World", "description", "search", {
        matches: []
      });
      expect(result.html).toBe("Hello World");
    });

    it("applies bullet list formatting", () => {
      const result = highlightText("item1\nitem2", "description", null, undefined, true);
      expect(result.html).toContain("<ul>");
    });

    it("returns plain text for non-matching key", () => {
      const result = highlightText("Hello World", "name", "hello", mockNodeMetadata.searchInfo);
      expect(result.html).toBe("Hello World");
    });

    it("handles empty text", () => {
      const result = highlightText("", "description", "search", mockNodeMetadata.searchInfo);
      expect(result.html).toBe("");
    });
  });
});
