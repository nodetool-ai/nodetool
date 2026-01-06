// Mock ThemeNodetool to avoid heavy imports
jest.mock("../../components/themes/ThemeNodetool", () => ({
  __esModule: true,
  default: { vars: { palette: { c_hl1: "#ff0000" } } }
}));

import {
  highlightText,
  escapeHtml,
  hexToRgb,
  formatBulletList
} from "../highlightText";
import { NodeMetadata } from "../../stores/ApiTypes";

describe("highlightText utilities", () => {
  describe("escapeHtml", () => {
    it("escapes all HTML special characters", () => {
      expect(escapeHtml("<div>&</div>")).toBe("&lt;div&gt;&amp;&lt;/div&gt;");
    });

    it("handles quotes and apostrophes", () => {
      // The implementation now properly escapes all HTML special characters including quotes
      expect(escapeHtml("\"Hello\" & 'World'")).toBe("&quot;Hello&quot; &amp; &#39;World&#39;");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles string with no special characters", () => {
      expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
    });

    it("handles very long strings", () => {
      const longString = "a".repeat(10000) + "<>&";
      const result = escapeHtml(longString);
      expect(result.endsWith("&lt;&gt;&amp;")).toBe(true);
      expect(result.length).toBeGreaterThan(10000);
    });

    it("handles all special characters comprehensively", () => {
      // The implementation escapes all HTML special characters including quotes
      // Note: replacements are processed in the order defined in the map object
      expect(escapeHtml("<>&\"'/>")).toBe("&lt;&gt;&amp;&quot;&#39;/&gt;");
    });
  });

  describe("hexToRgb", () => {
    it("converts valid 6-digit hex colors", () => {
      expect(hexToRgb("#ffffff")).toBe("255, 255, 255");
      expect(hexToRgb("#000000")).toBe("0, 0, 0");
      expect(hexToRgb("#ff0000")).toBe("255, 0, 0");
      expect(hexToRgb("#00ff00")).toBe("0, 255, 0");
      expect(hexToRgb("#0000ff")).toBe("0, 0, 255");
    });

    it("handles hex without # prefix", () => {
      expect(hexToRgb("ffffff")).toBe("255, 255, 255");
      expect(hexToRgb("000000")).toBe("0, 0, 0");
    });

    it("handles mixed case hex values", () => {
      expect(hexToRgb("#FFffFF")).toBe("255, 255, 255");
      expect(hexToRgb("#AbCdEf")).toBe("171, 205, 239");
    });

    it("returns null for invalid hex formats", () => {
      expect(hexToRgb("invalid")).toBeNull();
      expect(hexToRgb("#fff")).toBeNull(); // 3-digit not supported
      expect(hexToRgb("#ffff")).toBeNull(); // 4-digit not supported
      expect(hexToRgb("#fffff")).toBeNull(); // 5-digit not supported
      expect(hexToRgb("#fffffff")).toBeNull(); // 7-digit not supported
      expect(hexToRgb("#gggggg")).toBeNull(); // Invalid characters
      expect(hexToRgb("")).toBeNull(); // Empty string
      expect(hexToRgb("#")).toBeNull(); // Just hash
    });
  });

  describe("formatBulletList", () => {
    it("converts lines to bullet list", () => {
      const result = formatBulletList("a\nb");
      expect(result).toBe("<ul><li>a</li>\n<li>b</li></ul>");
    });

    it("handles empty string", () => {
      expect(formatBulletList("")).toBe("<ul></ul>");
    });

    it("handles single line without newlines", () => {
      expect(formatBulletList("single item")).toBe(
        "<ul><li>single item</li></ul>"
      );
    });

    it("filters out empty lines", () => {
      expect(formatBulletList("a\n\nb\n\n\nc")).toBe(
        "<ul><li>a</li>\n<li>b</li>\n<li>c</li></ul>"
      );
    });

    it("handles lines with only whitespace", () => {
      expect(formatBulletList("a\n   \nb\n\t\nc")).toBe(
        "<ul><li>a</li>\n<li>b</li>\n<li>c</li></ul>"
      );
    });

    it("preserves leading/trailing whitespace in content", () => {
      expect(formatBulletList("  item 1  \n  item 2  ")).toBe(
        "<ul><li>  item 1  </li>\n<li>  item 2  </li></ul>"
      );
    });
  });

  describe("highlightText", () => {
    describe("basic functionality", () => {
      it("returns plain text when no search info", () => {
        const result = highlightText("hello", "title", null, undefined);
        expect(result.html).toBe("hello");
        expect(result.highlightedWords).toEqual([]);
      });

      it("handles searchTerm without searchInfo", () => {
        const result = highlightText(
          "hello world",
          "title",
          "hello",
          undefined
        );
        expect(result.html).toBe("hello world");
        expect(result.highlightedWords).toEqual([]);
      });

      it("handles empty text", () => {
        const result = highlightText("", "title", "search", undefined);
        expect(result.html).toBe("");
        expect(result.highlightedWords).toEqual([]);
      });

      it("formats bullet lists correctly", () => {
        const result = highlightText(
          "item1\nitem2",
          "title",
          null,
          undefined,
          true
        );
        expect(result.html).toBe("<ul><li>item1</li>\n<li>item2</li></ul>");
        expect(result.highlightedWords).toEqual([]);
      });
    });

    describe("highlighting matches", () => {
      it("highlights single match", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [{ key: "title", value: "hello world", indices: [[0, 4]] }]
        };
        const result = highlightText(
          "hello world",
          "title",
          "hello",
          searchInfo
        );
        expect(result.highlightedWords).toEqual(["hello"]);
        expect(result.html).toContain('<span class="highlight"');
        expect(result.html).toContain("hello");

        // More robust HTML validation
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.html, "text/html");
        const highlights = doc.querySelectorAll(".highlight");
        expect(highlights.length).toBe(1);
        expect(highlights[0].textContent).toBe("hello");
      });

      it("highlights multiple matches", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [
            {
              key: "title",
              value: "hello world hello",
              indices: [
                [0, 4],
                [12, 16]
              ]
            }
          ]
        };
        const result = highlightText(
          "hello world hello",
          "title",
          "hello",
          searchInfo
        );
        expect(result.highlightedWords).toEqual(["hello", "hello"]);

        const parser = new DOMParser();
        const doc = parser.parseFromString(result.html, "text/html");
        const highlights = doc.querySelectorAll(".highlight");
        expect(highlights.length).toBe(2);
      });

      it("handles matches at string boundaries", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [{ key: "title", value: "test", indices: [[0, 3]] }]
        };
        const result = highlightText("test", "title", "test", searchInfo);
        expect(result.highlightedWords).toEqual(["test"]);
        expect(result.html).toContain('<span class="highlight"');
      });

      it("handles matches at the end of string", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [{ key: "title", value: "hello test", indices: [[6, 9]] }]
        };
        const result = highlightText("hello test", "title", "test", searchInfo);
        expect(result.highlightedWords).toEqual(["test"]);
        expect(result.html).toContain('hello <span class="highlight"');
      });

      it("ignores matches with invalid indices", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [
            { key: "title", value: "hello", indices: [[10, 15]] } // Out of bounds
          ]
        };
        const result = highlightText("hello", "title", "hello", searchInfo);
        expect(result.highlightedWords).toEqual([]);
        expect(result.html).toBe("hello");
      });

      it("handles overlapping matches by selecting the best one", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [
            {
              key: "title",
              value: "abcde",
              indices: [
                [0, 2],
                [1, 3]
              ]
            }
          ]
        };
        const result = highlightText("abcde", "title", "abc", searchInfo);
        expect(result.highlightedWords).toEqual(["abc"]);

        const parser = new DOMParser();
        const doc = parser.parseFromString(result.html, "text/html");
        const highlights = doc.querySelectorAll(".highlight");
        expect(highlights.length).toBe(1);
      });

      it("handles matches with different relevance scores", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [
            {
              key: "title",
              value: "test testing",
              indices: [
                [0, 3],
                [5, 11]
              ]
            }
          ]
        };
        const result = highlightText(
          "test testing",
          "title",
          "test",
          searchInfo
        );
        expect(result.highlightedWords.length).toBe(2);
        expect(result.highlightedWords).toContain("test");
        expect(result.highlightedWords).toContain("testing");
      });

      it("escapes HTML in matched text", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [
            { key: "title", value: "<script>alert</script>", indices: [[0, 7]] }
          ]
        };
        const result = highlightText(
          "<script>alert</script>",
          "title",
          "<script>",
          searchInfo
        );
        expect(result.html).not.toContain("<script>");
        expect(result.html).toContain("&lt;script&gt;");
      });

      it("handles very long text with many matches efficiently", () => {
        const longText = "word ".repeat(1000);
        const indices: Array<[number, number]> = [];
        for (let i = 0; i < longText.length - 4; i += 5) {
          indices.push([i, i + 3]);
        }
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [{ key: "title", value: longText, indices }]
        };

        const start = performance.now();
        const result = highlightText(longText, "title", "word", searchInfo);
        const end = performance.now();

        expect(end - start).toBeLessThan(1000); // allow slower environments
        expect(result.highlightedWords.length).toBe(1000);
      });

      it("filters matches for different keys", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [
            { key: "title", value: "hello", indices: [[0, 4]] },
            { key: "description", value: "hello", indices: [[0, 4]] }
          ]
        };
        const result = highlightText("hello", "title", "hello", searchInfo);
        expect(result.highlightedWords).toEqual(["hello"]);

        const parser = new DOMParser();
        const doc = parser.parseFromString(result.html, "text/html");
        const highlights = doc.querySelectorAll(".highlight");
        expect(highlights.length).toBe(1);
      });

      it("handles bullet list with highlights", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [{ key: "title", value: "hello\nworld", indices: [[0, 4]] }]
        };
        const result = highlightText(
          "hello\nworld",
          "title",
          "hello",
          searchInfo,
          true
        );
        expect(result.html).toContain("<ul>");
        expect(result.html).toContain("<li>");
        expect(result.html).toContain('<span class="highlight"');
        expect(result.highlightedWords).toEqual(["hello"]);
      });
    });

    describe("cache behavior", () => {
      it("returns consistent results for same inputs", () => {
        const searchInfo: NodeMetadata["searchInfo"] = {
          matches: [{ key: "title", value: "hello", indices: [[0, 4]] }]
        };
        const result1 = highlightText("hello", "title", "hello", searchInfo);
        const result2 = highlightText("hello", "title", "hello", searchInfo);

        expect(result1.html).toBe(result2.html);
        expect(result1.highlightedWords).toEqual(result2.highlightedWords);
      });
    });
  });
});
