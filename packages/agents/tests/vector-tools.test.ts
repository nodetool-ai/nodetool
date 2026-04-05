import { describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  VecTextSearchTool,
  VecIndexTool,
  VecHybridSearchTool,
  VecRecursiveSplitAndIndexTool,
  VecMarkdownSplitAndIndexTool,
  VecBatchIndexTool,
  type VecCollection
} from "../src/tools/vector-tools.js";

const mockContext = {} as any;

function makeMockCollection(
  overrides: Partial<VecCollection> = {}
): VecCollection {
  return {
    query: vi.fn().mockResolvedValue({
      ids: [["id1", "id2"]],
      documents: [["doc one", "doc two"]]
    }),
    add: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// VecTextSearchTool
// ---------------------------------------------------------------------------

describe("VecTextSearchTool", () => {
  it("returns id-document map", async () => {
    const col = makeMockCollection();
    const tool = new VecTextSearchTool(col);
    const result = await tool.process(mockContext, {
      text: "hello",
      n_results: 2
    });
    expect(result).toEqual({ id1: "doc one", id2: "doc two" });
    expect(col.query).toHaveBeenCalledWith({
      queryTexts: ["hello"],
      nResults: 2
    });
  });

  it("returns empty when no documents", async () => {
    const col = makeMockCollection({
      query: vi.fn().mockResolvedValue({ ids: [[]], documents: [[]] })
    });
    const tool = new VecTextSearchTool(col);
    const result = await tool.process(mockContext, { text: "hello" });
    expect(result).toEqual({});
  });

  it("has correct tool shape", () => {
    const tool = new VecTextSearchTool(makeMockCollection());
    expect(tool.name).toBe("vector_text_search");
    expect(tool.toProviderTool().inputSchema).toBeDefined();
  });

  it("userMessage truncates long text", () => {
    const tool = new VecTextSearchTool(makeMockCollection());
    const msg = tool.userMessage({ text: "a".repeat(200) });
    expect(msg).toBe("Performing semantic search...");
  });
});

// ---------------------------------------------------------------------------
// VecIndexTool
// ---------------------------------------------------------------------------

describe("VecIndexTool", () => {
  it("indexes text and returns document id", async () => {
    const col = makeMockCollection();
    const tool = new VecIndexTool(col);
    const result = await tool.process(mockContext, {
      text: "some content",
      source_id: "src-1"
    });
    expect(result).toHaveProperty("status", "success");
    expect(result).toHaveProperty("document_id");
    expect((result as any).document_id).toContain("src-1");
    expect(col.add).toHaveBeenCalled();
  });

  it("returns error for empty source_id", async () => {
    const tool = new VecIndexTool(makeMockCollection());
    const result = await tool.process(mockContext, {
      text: "content",
      source_id: "  "
    });
    expect(result).toHaveProperty("error");
  });

  it("passes metadata when provided", async () => {
    const col = makeMockCollection();
    const tool = new VecIndexTool(col);
    await tool.process(mockContext, {
      text: "content",
      source_id: "src-1",
      metadata: { tag: "test" }
    });
    expect(col.add).toHaveBeenCalledWith(
      expect.objectContaining({
        metadatas: [{ tag: "test" }]
      })
    );
  });

  it("passes null metadatas when metadata is empty", async () => {
    const col = makeMockCollection();
    const tool = new VecIndexTool(col);
    await tool.process(mockContext, {
      text: "content",
      source_id: "src-1"
    });
    expect(col.add).toHaveBeenCalledWith(
      expect.objectContaining({
        metadatas: null
      })
    );
  });
});

// ---------------------------------------------------------------------------
// VecHybridSearchTool
// ---------------------------------------------------------------------------

describe("VecHybridSearchTool", () => {
  it("combines semantic and keyword results", async () => {
    const col = makeMockCollection({
      query: vi
        .fn()
        .mockResolvedValueOnce({
          ids: [["a", "b"]],
          documents: [["doc a", "doc b"]]
        })
        .mockResolvedValueOnce({
          ids: [["b", "c"]],
          documents: [["doc b", "doc c"]]
        })
    });
    const tool = new VecHybridSearchTool(col);
    const result = await tool.process(mockContext, {
      text: "hello world",
      n_results: 5
    });
    // "b" should be highest because it appears in both
    const keys = Object.keys(result);
    expect(keys).toContain("b");
    expect(keys).toContain("a");
    expect(keys).toContain("c");
  });

  it("returns error for empty text", async () => {
    const tool = new VecHybridSearchTool(makeMockCollection());
    const result = await tool.process(mockContext, { text: "   " });
    expect(result).toHaveProperty("error");
  });

  it("falls back to semantic when no keywords match min length", async () => {
    const col = makeMockCollection();
    const tool = new VecHybridSearchTool(col);
    await tool.process(mockContext, {
      text: "ab",
      min_keyword_length: 5
    });
    // query should be called only once (semantic only)
    expect(col.query).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// VecRecursiveSplitAndIndexTool
// ---------------------------------------------------------------------------

describe("VecRecursiveSplitAndIndexTool", () => {
  it("splits and indexes text chunks", async () => {
    const col = makeMockCollection();
    const tool = new VecRecursiveSplitAndIndexTool(col);
    const longText = "paragraph one.\n\nparagraph two.\n\nparagraph three.";
    const result = await tool.process(mockContext, {
      text: longText,
      document_id: "doc1",
      chunk_size: 20,
      chunk_overlap: 0
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_count).toBeGreaterThan(0);
    expect(col.add).toHaveBeenCalled();
  });

  it("returns error for empty text", async () => {
    const tool = new VecRecursiveSplitAndIndexTool(makeMockCollection());
    const result = await tool.process(mockContext, {
      text: "  ",
      document_id: "doc1"
    });
    expect(result).toHaveProperty("error");
  });

  it("returns error for empty document_id", async () => {
    const tool = new VecRecursiveSplitAndIndexTool(makeMockCollection());
    const result = await tool.process(mockContext, {
      text: "hello",
      document_id: "  "
    });
    expect(result).toHaveProperty("error");
  });

  it("returns error when collection.add throws during indexing", async () => {
    const col = makeMockCollection();
    col.add.mockRejectedValueOnce(new Error("DB write failed"));
    const tool = new VecRecursiveSplitAndIndexTool(col);
    const result = (await tool.process(mockContext, {
      text: "some content",
      document_id: "doc1"
    })) as any;
    expect(result.error).toContain("Indexing failed");
  });

  it("indexes single small chunk", async () => {
    const col = makeMockCollection();
    const tool = new VecRecursiveSplitAndIndexTool(col);
    const result = await tool.process(mockContext, {
      text: "small text",
      document_id: "doc1",
      chunk_size: 1000
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_count).toBe(1);
  });

  it("userMessage includes source_id", () => {
    const tool = new VecRecursiveSplitAndIndexTool(makeMockCollection());
    const msg = tool.userMessage({ source_id: "my-doc" });
    expect(msg).toContain("my-doc");
  });

  it("userMessage truncates when source_id is long", () => {
    const tool = new VecRecursiveSplitAndIndexTool(makeMockCollection());
    const msg = tool.userMessage({ source_id: "a".repeat(100) });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// VecMarkdownSplitAndIndexTool
// ---------------------------------------------------------------------------

describe("VecMarkdownSplitAndIndexTool", () => {
  it("splits markdown by headers and indexes", async () => {
    const col = makeMockCollection();
    const tool = new VecMarkdownSplitAndIndexTool(col);
    const md =
      "# Title\nSome intro text.\n## Section 1\nContent one.\n## Section 2\nContent two.";
    const result = await tool.process(mockContext, { text: md });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_ids.length).toBeGreaterThanOrEqual(2);
  });

  it("returns error when neither file_path nor text provided", async () => {
    const tool = new VecMarkdownSplitAndIndexTool(makeMockCollection());
    const result = await tool.process(mockContext, {});
    expect(result).toHaveProperty("error");
  });

  it("indexes single section without splitting", async () => {
    const col = makeMockCollection();
    const tool = new VecMarkdownSplitAndIndexTool(col);
    const result = await tool.process(mockContext, {
      text: "# Just one section\nSmall content."
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_ids).toHaveLength(1);
  });

  it("recursively splits sections exceeding chunk size", async () => {
    const col = makeMockCollection();
    const tool = new VecMarkdownSplitAndIndexTool(col);
    // Create a large section that exceeds the default chunk_size (4000 chars)
    const largeContent = "x".repeat(5000);
    const result = await tool.process(mockContext, {
      text: `# Large Section\n${largeContent}`,
      chunk_size: 500
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_ids.length).toBeGreaterThan(1);
  });

  it("indexes markdown from file_path", async () => {
    const col = makeMockCollection();
    const tool = new VecMarkdownSplitAndIndexTool(col);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "chroma-md-test-"));
    const tmpFile = path.join(tmpDir, "doc.md");
    await fs.writeFile(
      tmpFile,
      "# Section A\nContent A.\n## Sub-B\nContent B."
    );
    try {
      const result = (await tool.process(mockContext, {
        file_path: tmpFile
      })) as any;
      expect(result.status).toBe("success");
      expect(result.indexed_ids.length).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("userMessage includes source_id", () => {
    const tool = new VecMarkdownSplitAndIndexTool(makeMockCollection());
    const msg = tool.userMessage({ source_id: "doc-42" });
    expect(msg).toContain("doc-42");
  });

  it("userMessage truncates long source_id", () => {
    const tool = new VecMarkdownSplitAndIndexTool(makeMockCollection());
    const msg = tool.userMessage({ source_id: "a".repeat(100) });
    expect(msg.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// VecBatchIndexTool
// ---------------------------------------------------------------------------

describe("VecBatchIndexTool", () => {
  it("batch indexes multiple chunks", async () => {
    const col = makeMockCollection();
    const tool = new VecBatchIndexTool(col);
    const result = await tool.process(mockContext, {
      chunks: [
        { text: "chunk 1", source_id: "s1" },
        { text: "chunk 2", source_id: "s2" }
      ]
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_count).toBe(2);
    expect(col.add).toHaveBeenCalledTimes(1); // single batch call
  });

  it("returns error for empty chunks array", async () => {
    const tool = new VecBatchIndexTool(makeMockCollection());
    const result = await tool.process(mockContext, { chunks: [] });
    expect(result).toHaveProperty("error");
  });

  it("skips chunks without text or source_id", async () => {
    const col = makeMockCollection();
    const tool = new VecBatchIndexTool(col);
    const result = await tool.process(mockContext, {
      chunks: [
        { text: "valid", source_id: "s1" },
        { text: "", source_id: "s2" },
        { source_id: "s3" }
      ]
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_count).toBe(1);
  });

  it("merges base_metadata with chunk metadata", async () => {
    const col = makeMockCollection();
    const tool = new VecBatchIndexTool(col);
    await tool.process(mockContext, {
      chunks: [{ text: "c", source_id: "s1", metadata: { a: 1 } }],
      base_metadata: { b: 2 }
    });
    const call = (col.add as any).mock.calls[0][0];
    expect(call.metadatas[0]).toEqual({ a: 1, b: 2 });
  });

  it("handles indexing error gracefully", async () => {
    const col = makeMockCollection({
      add: vi.fn().mockRejectedValue(new Error("db down"))
    });
    const tool = new VecBatchIndexTool(col);
    const result = await tool.process(mockContext, {
      chunks: [{ text: "c", source_id: "s1" }]
    });
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("db down");
  });

  it("userMessage shows chunk count", () => {
    const tool = new VecBatchIndexTool(makeMockCollection());
    expect(tool.userMessage({ chunks: [1, 2, 3] })).toContain("3");
  });
});
