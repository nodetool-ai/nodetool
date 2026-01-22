import { highlightText, formatBulletList, escapeHtml } from "../highlightText";
import { NodeMetadata } from "../../stores/ApiTypes";

describe("highlightText utilities", () => {
  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(escapeHtml("a & b")).toBe("a &amp; b");
      expect(escapeHtml('test "quotes"')).toBe("test &quot;quotes&quot;");
      expect(escapeHtml("1 < 2")).toBe("1 &lt; 2");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles normal text without special characters", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });
  });

  describe("formatBulletList", () => {
    it("formats single line as bullet list", () => {
      const result = formatBulletList("Single line");
      expect(result).toBe("<ul><li>Single line</li></ul>");
    });

    it("formats multiple lines as bullet list", () => {
      const result = formatBulletList("Line 1\nLine 2\nLine 3");
      expect(result).toBe("<ul><li>Line 1</li>\n<li>Line 2</li>\n<li>Line 3</li></ul>");
    });

    it("filters out empty lines", () => {
      const result = formatBulletList("Line 1\n\nLine 2");
      expect(result).toBe("<ul><li>Line 1</li>\n<li>Line 2</li></ul>");
    });

    it("preserves whitespace in lines", () => {
      const result = formatBulletList("  Line 1  \n  Line 2  ");
      expect(result).toBe("<ul><li>  Line 1  </li>\n<li>  Line 2  </li></ul>");
    });

    it("handles empty string", () => {
      const result = formatBulletList("");
      expect(result).toBe("<ul></ul>");
    });
  });

  describe("highlightText", () => {
    const createSearchInfo = (matches: NonNullable<NodeMetadata["searchInfo"]>["matches"]): NonNullable<NodeMetadata["searchInfo"]> => {
      return {
        matches,
        score: 1,
      };
    };

    it("returns plain text when no searchTerm", () => {
      const result = highlightText("Hello World", "name", null);
      expect(result.html).toBe("Hello World");
      expect(result.highlightedWords).toEqual([]);
    });

    it("returns plain text when no matches", () => {
      const result = highlightText("Hello World", "name", "test", createSearchInfo([]));
      expect(result.html).toBe("Hello World");
      expect(result.highlightedWords).toEqual([]);
    });

    it("handles empty text", () => {
      const result = highlightText("", "name", "test", createSearchInfo([]));
      expect(result.html).toBe("");
      expect(result.highlightedWords).toEqual([]);
    });

    it("formats as bullet list when isBulletList is true", () => {
      const result = highlightText("Line 1\nLine 2", "name", null, undefined, true);
      expect(result.html).toBe("<ul><li>Line 1</li>\n<li>Line 2</li></ul>");
    });

    it("returns plain text for non-matching keys", () => {
      const searchInfo = createSearchInfo([
        {
          key: "differentKey",
          value: "Hello",
          indices: [[0, 4]]
        }
      ]);
      const result = highlightText("Hello", "name", "Hello", searchInfo);
      expect(result.html).toBe("Hello");
    });

    it("filters matches by key", () => {
      const searchInfo = createSearchInfo([
        { key: "name", value: "Hello", indices: [[0, 4]] },
        { key: "description", value: "Hello", indices: [[0, 4]] }
      ]);
      const result = highlightText("Hello", "name", "Hello", searchInfo);
      expect(result.html).toContain("highlight");
    });

    it("handles multiple matches with different relevance", () => {
      const searchInfo = createSearchInfo([
        { key: "name", value: "Hello World Test", indices: [[0, 4], [6, 10]] }
      ]);
      const result = highlightText("Hello World Test", "name", "World", searchInfo);
      expect(result.highlightedWords).toContain("World");
    });

    it("handles overlapping matches", () => {
      const searchInfo = createSearchInfo([
        { key: "name", value: "Hello World", indices: [[0, 5], [2, 7]] }
      ]);
      const result = highlightText("Hello World", "name", "Hello World", searchInfo);
      expect(result.highlightedWords.length).toBeGreaterThanOrEqual(1);
    });

    it("validates match start bounds", () => {
      const searchInfo = createSearchInfo([
        { key: "name", value: "Hello", indices: [[0, 4]] }
      ]);
      const result = highlightText("Hello", "name", "test", searchInfo);
      // Match [0, 4] is valid for text "Hello" (length 5)
      expect(result.html).toContain("highlight");
    });
  });
});
