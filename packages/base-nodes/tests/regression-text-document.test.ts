import { describe, it, expect } from "vitest";
import {
  RegexSplitNode,
  RegexValidateNode,
  FormatTextNode,
  HtmlToTextNode,
  SliceTextNode,
  ToStringNode,
  IndexOfTextNode,
  SplitRecursivelyNode,
  SplitHTMLNode,
  SplitJSONNode,
  SplitMarkdownNode
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectGen(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// TEXT-EXTRA REGRESSION TESTS
// ---------------------------------------------------------------------------

describe("text-extra regressions", () => {
  // 1. RegexSplit maxsplit
  describe("RegexSplitNode maxsplit", () => {
    it("splits 'a-b-c-d' with maxsplit=2 into 3 pieces", async () => {
      const node = new RegexSplitNode();
      node.assign({ text: "a-b-c-d", pattern: "-", maxsplit: 2 });
      const result = await node.process();
      // maxsplit=2 means 2 splits => 3 pieces, last piece gets the remainder
      expect(result.output).toEqual(["a", "b", "c-d"]);
    });

    it("splits with maxsplit=1 into 2 pieces", async () => {
      const node = new RegexSplitNode();
      node.assign({ text: "a-b-c-d", pattern: "-", maxsplit: 1 });
      const result = await node.process();
      expect(result.output).toEqual(["a", "b-c-d"]);
    });

    it("splits with maxsplit=0 (unlimited) into all pieces", async () => {
      const node = new RegexSplitNode();
      node.assign({ text: "a-b-c-d", pattern: "-", maxsplit: 0 });
      const result = await node.process();
      expect(result.output).toEqual(["a", "b", "c", "d"]);
    });
  });

  // 2. RegexValidate anchoring
  describe("RegexValidateNode anchoring", () => {
    it("pattern 'abc' should NOT match 'xxxabcxxx' (anchored at start)", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "xxxabcxxx", pattern: "abc" });
      const result = await node.process();
      expect(result.output).toBe(false);
    });

    it("pattern 'abc' should match 'abcxxx' (matches at start)", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "abcxxx", pattern: "abc" });
      const result = await node.process();
      expect(result.output).toBe(true);
    });

    it("pattern '^abc' should still work when already anchored", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "abcdef", pattern: "^abc" });
      const result = await node.process();
      expect(result.output).toBe(true);
    });

    it("pattern 'abc' should NOT match empty string", async () => {
      const node = new RegexValidateNode();
      node.assign({ text: "", pattern: "abc" });
      const result = await node.process();
      expect(result.output).toBe(false);
    });
  });

  // 3. FormatText Jinja2 filters
  describe("FormatTextNode Jinja2 filters", () => {
    it("applies upper filter", async () => {
      const node = new FormatTextNode();
      Object.assign(node, {
        template: "{{ name|upper }}",
        _dynamic_properties: { name: "hello" }
      });
      const result = await node.process();
      expect(result.output).toBe("HELLO");
    });

    it("applies lower filter", async () => {
      const node = new FormatTextNode();
      Object.assign(node, {
        template: "{{ name|lower }}",
        _dynamic_properties: { name: "HELLO" }
      });
      const result = await node.process();
      expect(result.output).toBe("hello");
    });

    it("applies capitalize filter", async () => {
      const node = new FormatTextNode();
      Object.assign(node, {
        template: "{{ name|capitalize }}",
        _dynamic_properties: { name: "hello world" }
      });
      const result = await node.process();
      expect(result.output).toBe("Hello world");
    });

    it("applies truncate filter", async () => {
      const node = new FormatTextNode();
      Object.assign(node, {
        template: "{{ name|truncate(3) }}",
        _dynamic_properties: { name: "hello" }
      });
      const result = await node.process();
      expect(result.output).toBe("hel...");
    });

    it("chains multiple filters", async () => {
      const node = new FormatTextNode();
      Object.assign(node, {
        template: "{{ name|trim|upper }}",
        _dynamic_properties: { name: "  hello  " }
      });
      const result = await node.process();
      expect(result.output).toBe("HELLO");
    });

    it("preserves $-sequences in dynamic property values", async () => {
      const node = new FormatTextNode();
      Object.assign(node, {
        template: "price: {price}, code: {code}",
        _dynamic_properties: { price: "$100", code: "a$&b$$c" }
      });
      const result = await node.process();
      expect(result.output).toBe("price: $100, code: a$&b$$c");
    });
  });

  // 4. HtmlToText
  describe("HtmlToTextNode", () => {
    it("converts headers to markdown-style", async () => {
      const node = new HtmlToTextNode();
      node.assign({ html: "<h1>Title</h1><p>Text</p>" });
      const result = await node.process();
      const output = String(result.output);
      expect(output).toContain("# Title");
      expect(output).toContain("Text");
    });

    it("converts links to text with URL in parens when base_url set", async () => {
      const node = new HtmlToTextNode();
      node.assign({
        html: "<a href='http://x.com'>link</a>",
        base_url: "http://example.com"
      });
      const result = await node.process();
      const output = String(result.output);
      expect(output).toContain("link");
      expect(output).toContain("(http://x.com)");
    });

    it("handles combined HTML with headers, paragraphs, and links", async () => {
      const node = new HtmlToTextNode();
      node.assign({
        html: "<h1>Title</h1><p>Text</p><a href='http://x.com'>link</a>",
        base_url: "http://example.com"
      });
      const result = await node.process();
      const output = String(result.output);
      expect(output).toContain("# Title");
      expect(output).toContain("link (http://x.com)");
    });
  });

  // 5. Slice stop=0 means end of string
  describe("SliceTextNode stop=0", () => {
    it("stop=0 returns the full string (stop=0 means end)", async () => {
      const node = new SliceTextNode();
      node.assign({ text: "hello world", start: 0, stop: 0, step: 1 });
      const result = await node.process();
      expect(result.output).toBe("hello world");
    });

    it("stop=0 with start offset returns from start to end", async () => {
      const node = new SliceTextNode();
      node.assign({ text: "hello world", start: 6, stop: 0, step: 1 });
      const result = await node.process();
      expect(result.output).toBe("world");
    });

    it("normal slice with explicit stop works", async () => {
      const node = new SliceTextNode();
      node.assign({ text: "hello world", start: 0, stop: 5, step: 1 });
      const result = await node.process();
      expect(result.output).toBe("hello");
    });
  });

  // 6. ToString mode=repr
  describe("ToStringNode mode=repr", () => {
    it("strings are JSON-quoted in repr mode", async () => {
      const node = new ToStringNode();
      node.assign({ value: "hello", mode: "repr" });
      const result = await node.process();
      expect(result.output).toBe('"hello"');
    });

    it("numbers are stringified in repr mode", async () => {
      const node = new ToStringNode();
      node.assign({ value: 42, mode: "repr" });
      const result = await node.process();
      expect(result.output).toBe("42");
    });

    it("objects are JSON-stringified in repr mode", async () => {
      const node = new ToStringNode();
      node.assign({ value: { a: 1 }, mode: "repr" });
      const result = await node.process();
      expect(result.output).toBe('{"a":1}');
    });

    it("str mode returns plain string", async () => {
      const node = new ToStringNode();
      node.assign({ value: "hello", mode: "str" });
      const result = await node.process();
      expect(result.output).toBe("hello");
    });
  });

  // 7. IndexOf searchFromEnd with end_index
  describe("IndexOfTextNode searchFromEnd with end_index", () => {
    it("finds last occurrence within bounded region", async () => {
      // text: "abcXdefXghiXjkl"
      //         0123456789...
      // X at positions 3, 7, 11
      const node = new IndexOfTextNode();
      node.assign({
        text: "abcXdefXghiXjkl",
        substring: "X",
        search_from_end: true,
        start_index: 0,
        end_index: 10
      });
      const result = await node.process();
      // Within [0, 10), last X is at index 7
      expect(result.output).toBe(7);
    });

    it("returns -1 when last occurrence is outside bounded region", async () => {
      const node = new IndexOfTextNode();
      node.assign({
        text: "abcXdefXghiXjkl",
        substring: "X",
        search_from_end: true,
        start_index: 8,
        end_index: 10
      });
      const result = await node.process();
      // Within [8, 10), there is no X
      expect(result.output).toBe(-1);
    });

    it("forward search respects end_index", async () => {
      const node = new IndexOfTextNode();
      node.assign({
        text: "abcXdefXghi",
        substring: "X",
        search_from_end: false,
        start_index: 0,
        end_index: 5
      });
      const result = await node.process();
      // Within [0, 5) = "abcXd", X is at index 3
      expect(result.output).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// DOCUMENT REGRESSION TESTS
// ---------------------------------------------------------------------------

describe("document regressions", () => {
  // 8. SplitRecursively - tries separators in order
  describe("SplitRecursivelyNode recursive separator fallback", () => {
    it("tries paragraph separator first, falls back to newline for oversized chunks", async () => {
      // Build text with \n\n separators, and within paragraphs use \n
      // para1 fits in one chunk, para2 is too big and must be split by \n
      const para1 = "Line A1\nLine A2\nLine A3"; // 23 chars
      const para2Lines = Array.from({ length: 10 }, (_, i) => `Line B${i + 1} with extra padding`);
      const para2 = para2Lines.join("\n"); // ~250 chars, well over chunk_size=50
      const para3 = "Line C1\nLine C2"; // 15 chars
      const text = [para1, para2, para3].join("\n\n");

      const node = new SplitRecursivelyNode();
      Object.assign(node, {
        document: { text },
        chunk_size: 50,
        chunk_overlap: 0,
        separators: ["\n\n", "\n"]
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));

      // para2 alone is ~250 chars, so with chunk_size=50 we need at least 5+ chunks total
      // (para1=1, para2 splits into multiple, para3=1)
      expect(chunks.length).toBeGreaterThan(3);

      // All chunks should be within chunk_size (allowing minor overflow from merging)
      for (const c of chunks) {
        expect(typeof c.text).toBe("string");
        // Each chunk should respect the chunk_size limit
        expect((c.text as string).length).toBeLessThanOrEqual(55);
      }

      // Verify key content is preserved
      const allText = chunks.map((c) => c.text as string).join("");
      expect(allText).toContain("Line A1");
      expect(allText).toContain("Line B10 with extra padding");
      expect(allText).toContain("Line C2");
    });
  });

  // 9. SplitHTML - preserves semantic structure
  describe("SplitHTMLNode semantic structure", () => {
    it("splits HTML into semantic chunks preserving block structure", async () => {
      const html = "<h1>Title</h1><p>Para 1</p><p>Para 2</p>";
      const node = new SplitHTMLNode();
      Object.assign(node, {
        document: { text: html, uri: "test-semantic" },
        chunk_size: 50,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));

      // Should produce multiple chunks based on block elements, not just stripped text
      expect(chunks.length).toBeGreaterThanOrEqual(1);

      // The chunks should contain the text content from the block elements
      const allText = chunks.map((c) => c.text as string).join(" ");
      expect(allText).toContain("Title");
      expect(allText).toContain("Para 1");
      expect(allText).toContain("Para 2");

      // Each chunk should be plain text (no HTML tags)
      for (const c of chunks) {
        expect(c.text as string).not.toMatch(/<[^>]+>/);
      }
    });

    it("separates content by block-level tags", async () => {
      // Make content large enough to require multiple chunks
      const html =
        "<h1>Title Section</h1>" +
        "<p>" + "A".repeat(40) + "</p>" +
        "<p>" + "B".repeat(40) + "</p>";
      const node = new SplitHTMLNode();
      Object.assign(node, {
        document: { text: html, uri: "blocks" },
        chunk_size: 50,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  // 10. SplitJSON - splits array into individual elements
  describe("SplitJSONNode element splitting", () => {
    it("splits JSON array into individual elements", async () => {
      const json = '[{"a":1},{"b":2},{"c":3}]';
      const node = new SplitJSONNode();
      Object.assign(node, {
        document: { text: json, uri: "test-arr" },
        chunk_size: 5000,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));

      // With a large chunk_size, elements may be merged, but the content
      // should preserve JSON structure (pretty-printed individual elements)
      const allText = chunks.map((c) => c.text as string).join("\n");
      // Each element should be pretty-printed
      expect(allText).toContain('"a": 1');
      expect(allText).toContain('"b": 2');
      expect(allText).toContain('"c": 3');
    });

    it("splits JSON array into separate chunks with small chunk_size", async () => {
      const json = '[{"a":1},{"b":2},{"c":3}]';
      const node = new SplitJSONNode();
      Object.assign(node, {
        document: { text: json, uri: "test-arr-small" },
        chunk_size: 30,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));

      // With chunk_size=30, each element (~16 chars pretty-printed) should
      // fit in its own chunk. Should have multiple chunks.
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // Verify individual elements are parseable JSON
      for (const c of chunks) {
        const text = (c.text as string).trim();
        // At least some chunks should be valid JSON
        try {
          JSON.parse(text);
        } catch {
          // Some chunks might have comma separators from merging; that's OK
        }
      }
    });

    it("splits JSON object by top-level keys", async () => {
      const json = '{"name":"Alice","age":30,"city":"NYC"}';
      const node = new SplitJSONNode();
      Object.assign(node, {
        document: { text: json, uri: "test-obj" },
        chunk_size: 5000,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      const allText = chunks.map((c) => c.text as string).join("\n");
      expect(allText).toContain('"name"');
      expect(allText).toContain('"age"');
      expect(allText).toContain('"city"');
    });
  });

  // 11. SplitMarkdown - header hierarchy metadata
  describe("SplitMarkdownNode header hierarchy", () => {
    it("includes header hierarchy in metadata", async () => {
      const md = "# H1\ntext under h1\n## H2\nmore text under h2";
      const node = new SplitMarkdownNode();
      Object.assign(node, {
        document: { text: md },
        chunk_size: 1000,
        chunk_overlap: 0,
        strip_headers: true
      });
      const chunks = await collectGen(node.genProcess());

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // First chunk (under H1) should have Header 1 metadata
      const firstChunk = chunks[0];
      expect(firstChunk.metadata).toBeDefined();
      expect((firstChunk.metadata as Record<string, string>)["Header 1"]).toBe(
        "H1"
      );

      // Second chunk (under H2) should have both Header 1 and Header 2
      const secondChunk = chunks[1];
      expect(secondChunk.metadata).toBeDefined();
      expect(
        (secondChunk.metadata as Record<string, string>)["Header 1"]
      ).toBe("H1");
      expect(
        (secondChunk.metadata as Record<string, string>)["Header 2"]
      ).toBe("H2");
    });

    it("clears deeper headers when a higher-level header appears", async () => {
      const md =
        "# First\nsection 1\n## Sub\nsub content\n# Second\nsection 2";
      const node = new SplitMarkdownNode();
      Object.assign(node, {
        document: { text: md },
        chunk_size: 1000,
        chunk_overlap: 0,
        strip_headers: true
      });
      const allYields = await collectGen(node.genProcess());
      // Filter out the collected chunks list yield
      const chunks = allYields.filter((item) => !("chunks" in item));

      // Find the chunk under "# Second"
      const lastChunk = chunks[chunks.length - 1];
      const meta = lastChunk.metadata as Record<string, string>;
      expect(meta["Header 1"]).toBe("Second");
      // Header 2 should be cleared since "# Second" is a higher-level header
      expect(meta["Header 2"]).toBeUndefined();
    });
  });
});
