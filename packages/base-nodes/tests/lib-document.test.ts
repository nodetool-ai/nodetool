import { describe, it, expect } from "vitest";
import {
  SplitDocumentNode,
  SplitHTMLNode,
  SplitJSONNode,
  SplitRecursivelyNode,
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
// DOCUMENT NODES
// ---------------------------------------------------------------------------

describe("document nodes", () => {
  // -- SplitDocumentNode --
  describe("SplitDocumentNode", () => {
    it("splits text into chunks with correct metadata", async () => {
      const text = "A".repeat(100);
      const node = new SplitDocumentNode();
      Object.assign(node, {
        document: { text, uri: "test-split" },
        chunk_size: 30,
        chunk_overlap: 5
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      // step = 30 - 5 = 25, so chunks at 0, 25, 50, 75
      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({
        chunk: "A".repeat(30),
        text: "A".repeat(30),
        source_id: "test-split",
        start_index: 0
      });
      expect(chunks[1]).toEqual({
        chunk: "A".repeat(30),
        text: "A".repeat(30),
        source_id: "test-split",
        start_index: 25
      });
      expect(chunks[2]).toEqual({
        chunk: "A".repeat(30),
        text: "A".repeat(30),
        source_id: "test-split",
        start_index: 50
      });
      expect(chunks[3]).toEqual({
        chunk: "A".repeat(25),
        text: "A".repeat(25),
        source_id: "test-split",
        start_index: 75
      });
    });

    it("returns single chunk for short text with correct fields", async () => {
      const node = new SplitDocumentNode();
      Object.assign(node, {
        document: { text: "short", uri: "my-doc" },
        chunk_size: 100,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        chunk: "short",
        text: "short",
        source_id: "my-doc",
        start_index: 0
      });
    });

    it("falls back to 'document' source_id when no uri", async () => {
      const node = new SplitDocumentNode();
      Object.assign(node, {
        document: { text: "hello" },
        chunk_size: 100,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks).toHaveLength(1);
      expect(chunks[0].source_id).toBe("document");
    });

    it("returns empty for empty document", async () => {
      const node = new SplitDocumentNode();
      Object.assign(node, {
        document: { text: "" },
        chunk_size: 100,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks).toHaveLength(0);
    });
  });

  // -- SplitHTMLNode --
  describe("SplitHTMLNode", () => {
    it("strips HTML tags and chunks with correct metadata", async () => {
      const html = "<p>Hello</p> <b>World</b> " + "x".repeat(50);
      const node = new SplitHTMLNode();
      Object.assign(node, {
        document: { text: html, uri: "test-html" },
        chunk_size: 20,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      // Structure-aware split: extracts block-level elements separately
      expect(chunks.length).toBeGreaterThan(0);
      // No chunk should contain HTML tags
      for (const c of chunks) {
        expect(c.text as string).not.toContain("<");
        expect(typeof c.source_id).toBe("string");
        expect((c.source_id as string).startsWith("test-html:")).toBe(true);
        expect(typeof c.start_index).toBe("number");
      }
    });

    it("returns single chunk for short HTML", async () => {
      const node = new SplitHTMLNode();
      Object.assign(node, {
        document: { text: "<b>Hi</b>", uri: "short-html" },
        chunk_size: 100,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        chunk: "Hi",
        text: "Hi",
        source_id: "short-html:0",
        start_index: 0
      });
    });
  });

  // -- SplitJSONNode --
  describe("SplitJSONNode", () => {
    it("pretty-prints and chunks JSON with correct metadata", async () => {
      const json = JSON.stringify({ a: 1, b: [1, 2, 3], c: "hello" });
      const node = new SplitJSONNode();
      Object.assign(node, {
        document: { text: json, uri: "test-json" },
        chunk_size: 20,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      // Structure-aware split: splits by JSON structure
      expect(chunks.length).toBeGreaterThan(0);
      // Verify all chunks have correct types
      for (let i = 0; i < chunks.length; i++) {
        expect(typeof chunks[i].text).toBe("string");
        expect(typeof chunks[i].source_id).toBe("string");
        expect((chunks[i].source_id as string).startsWith("test-json:")).toBe(true);
        expect(typeof chunks[i].start_index).toBe("number");
        expect(chunks[i].chunk).toBe(chunks[i].text);
      }
    });

    it("returns single chunk for small JSON", async () => {
      const node = new SplitJSONNode();
      Object.assign(node, {
        document: { text: '{"x":1}', uri: "tiny-json" },
        chunk_size: 1000,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(JSON.stringify({ x: 1 }, null, 2));
      expect((chunks[0].source_id as string).startsWith("tiny-json:")).toBe(true);
      expect(chunks[0].start_index).toBe(0);
    });
  });

  // -- SplitRecursivelyNode --
  describe("SplitRecursivelyNode", () => {
    it("splits by paragraphs then chunks", async () => {
      const text = "Para one content.\n\nPara two content.\n\nPara three.";
      const node = new SplitRecursivelyNode();
      Object.assign(node, {
        document: { text },
        chunk_size: 25,
        chunk_overlap: 0
      });
      const chunks = await collectGen(node.genProcess());
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  // -- SplitMarkdownNode --
  describe("SplitMarkdownNode", () => {
    it("splits markdown preserving structure", async () => {
      const md = [
        "# Heading 1",
        "Some content under heading 1.",
        "",
        "# Heading 2",
        "Some content under heading 2.",
        "More content here that should make this section long enough."
      ].join("\n");
      const node = new SplitMarkdownNode();
      Object.assign(node, {
        document: { text: md },
        chunk_size: 40,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be a non-empty string
      for (const c of chunks) {
        expect((c.chunk as string).length).toBeGreaterThan(0);
      }
    });

    it("returns single chunk for short markdown", async () => {
      const node = new SplitMarkdownNode();
      Object.assign(node, {
        document: { text: "# Hi\nShort." },
        chunk_size: 1000,
        chunk_overlap: 0
      });
      const allYields = await collectGen(node.genProcess());
      const chunks = allYields.filter((item) => !("chunks" in item));
      expect(chunks).toHaveLength(1);
    });
  });
});
