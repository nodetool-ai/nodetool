import { escapeHtml, hexToRgb, highlightText, formatBulletList } from "../highlightText";

describe("highlightText", () => {
  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
      expect(escapeHtml("&amp;")).toBe("&amp;amp;");
      expect(escapeHtml('"quote"')).toBe("&quot;quote&quot;");
      expect(escapeHtml("'single'")).toMatch(/&#x27;|&#39;single&#39;/);
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("passes through plain text", () => {
      expect(escapeHtml("plain text")).toBe("plain text");
    });
  });

  describe("hexToRgb", () => {
    it("converts valid hex to rgb", () => {
      expect(hexToRgb("#ffffff")).toBe("255, 255, 255");
      expect(hexToRgb("#000000")).toBe("0, 0, 0");
      expect(hexToRgb("#ff0000")).toBe("255, 0, 0");
    });

    it("handles hex without #", () => {
      expect(hexToRgb("ffffff")).toBe("255, 255, 255");
    });

    it("handles hex with spaces", () => {
      expect(hexToRgb("  #ffffff  ")).toBe("255, 255, 255");
    });

    it("returns null for invalid hex", () => {
      expect(hexToRgb("invalid")).toBeNull();
      expect(hexToRgb("#gg")).toBeNull();
      expect(hexToRgb("")).toBeNull();
    });
  });

  describe("formatBulletList", () => {
    it("formats text as bullet list", () => {
      const result = formatBulletList("item1\nitem2\nitem3");
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>item1</li>");
      expect(result).toContain("<li>item2</li>");
      expect(result).toContain("<li>item3</li>");
    });

    it("filters empty lines", () => {
      const result = formatBulletList("item1\n\nitem2");
      expect(result).not.toContain("<li></li>");
    });

    it("handles empty string", () => {
      const result = formatBulletList("");
      expect(result).toBe("<ul></ul>");
    });
  });

  describe("highlightText", () => {
    it("returns plain text when no searchTerm", () => {
      const result = highlightText("Hello world", "description", null);
      expect(result.html).toBe("Hello world");
      expect(result.highlightedWords).toEqual([]);
    });

    it("returns plain text when no matches", () => {
      const result = highlightText("Hello world", "description", "searchterm", undefined);
      expect(result.html).toBe("Hello world");
      expect(result.highlightedWords).toEqual([]);
    });

    it("returns plain text when no matching key in searchInfo", () => {
      const searchInfo = { matches: [{ key: "other", value: "Hello", indices: [[0, 4]] }] };
      const result = highlightText("Hello", "description", "Hello", searchInfo);
      expect(result.html).toBe("Hello");
    });

    it("handles bullet list formatting", () => {
      const result = highlightText("item1\nitem2", "description", null, undefined, true);
      expect(result.html).toContain("<ul>");
      expect(result.html).toContain("<li>");
    });

    it("returns HighlightResult structure", () => {
      const result = highlightText("test", "description", "test", { matches: [{ key: "description", value: "test", indices: [[0, 3]] }] });
      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("highlightedWords");
      expect(typeof result.html).toBe("string");
      expect(Array.isArray(result.highlightedWords)).toBe(true);
    });
  });
});
