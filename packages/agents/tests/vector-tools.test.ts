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

type AnyMock = ReturnType<typeof vi.fn>;
type MockCollection = VecCollection & {
  query: AnyMock;
  upsert: AnyMock;
  count: AnyMock;
  delete: AnyMock;
  get: AnyMock;
  modify: AnyMock;
};

function makeMockCollection(
  overrides: Partial<MockCollection> = {}
): MockCollection {
  const col: MockCollection = {
    name: "mock",
    metadata: {},
    query: vi.fn().mockResolvedValue([
      { id: "id1", document: "doc one", metadata: {}, uri: null, distance: 0.1 },
      { id: "id2", document: "doc two", metadata: {}, uri: null, distance: 0.2 }
    ]),
    upsert: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue([]),
    modify: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
  return col;
}

describe("VecTextSearchTool", () => {
  it("returns id-document map", async () => {
    const col = makeMockCollection();
    const tool = new VecTextSearchTool(col);
    const result = await tool.process(mockContext, { text: "hello", n_results: 2 });
    expect(result).toEqual({ id1: "doc one", id2: "doc two" });
    expect(col.query).toHaveBeenCalledWith({ text: "hello", topK: 2 });
  });

  it("returns empty when no matches", async () => {
    const col = makeMockCollection({ query: vi.fn().mockResolvedValue([]) });
    const tool = new VecTextSearchTool(col);
    expect(await tool.process(mockContext, { text: "hello" })).toEqual({});
  });
});

describe("VecIndexTool", () => {
  it("indexes text and returns document id", async () => {
    const col = makeMockCollection();
    const tool = new VecIndexTool(col);
    const result = await tool.process(mockContext, {
      text: "some content",
      source_id: "src-1"
    });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).document_id).toContain("src-1");
    expect(col.upsert).toHaveBeenCalled();
  });

  it("returns error for empty source_id", async () => {
    const tool = new VecIndexTool(makeMockCollection());
    const result = await tool.process(mockContext, { text: "c", source_id: "  " });
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
    expect(col.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ metadata: { tag: "test" } })
    ]);
  });

  it("omits metadata when metadata is empty", async () => {
    const col = makeMockCollection();
    const tool = new VecIndexTool(col);
    await tool.process(mockContext, { text: "content", source_id: "src-1" });
    expect(col.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ metadata: undefined })
    ]);
  });
});

describe("VecHybridSearchTool", () => {
  it("combines semantic and keyword results, ranking shared ids first", async () => {
    const col = makeMockCollection({
      query: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "a", document: "doc a", metadata: {}, uri: null, distance: 0.1 },
          { id: "b", document: "doc b", metadata: {}, uri: null, distance: 0.2 }
        ])
        .mockResolvedValueOnce([
          { id: "b", document: "doc b", metadata: {}, uri: null, distance: 0.3 },
          { id: "c", document: "doc c", metadata: {}, uri: null, distance: 0.4 }
        ])
    });
    const tool = new VecHybridSearchTool(col);
    const result = await tool.process(mockContext, {
      text: "hello world",
      n_results: 5
    });
    const keys = Object.keys(result);
    expect(keys[0]).toBe("b");
    expect(keys).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("returns error for empty text", async () => {
    const tool = new VecHybridSearchTool(makeMockCollection());
    expect(await tool.process(mockContext, { text: "   " })).toHaveProperty("error");
  });

  it("falls back to semantic-only when no keywords pass min length", async () => {
    const col = makeMockCollection();
    const tool = new VecHybridSearchTool(col);
    await tool.process(mockContext, { text: "ab", min_keyword_length: 5 });
    expect(col.query).toHaveBeenCalledTimes(1);
  });

  it("wraps multi-keyword filter under $document.$or", async () => {
    const col = makeMockCollection();
    const tool = new VecHybridSearchTool(col);
    await tool.process(mockContext, {
      text: "hello world",
      min_keyword_length: 3
    });
    expect(col.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter: {
          $document: {
            $or: [{ $contains: "hello" }, { $contains: "world" }]
          }
        }
      })
    );
  });
});

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
    expect(col.upsert).toHaveBeenCalled();
  });

  it("returns error for empty text", async () => {
    const tool = new VecRecursiveSplitAndIndexTool(makeMockCollection());
    expect(
      await tool.process(mockContext, { text: "  ", document_id: "doc1" })
    ).toHaveProperty("error");
  });

  it("returns error when upsert throws during indexing", async () => {
    const col = makeMockCollection();
    col.upsert.mockRejectedValueOnce(new Error("DB write failed"));
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
    expect((result as any).indexed_count).toBe(1);
  });
});

describe("VecMarkdownSplitAndIndexTool", () => {
  it("splits markdown by headers and indexes", async () => {
    const col = makeMockCollection();
    const tool = new VecMarkdownSplitAndIndexTool(col);
    const md =
      "# Title\nSome intro.\n## Section 1\nContent one.\n## Section 2\nContent two.";
    const result = await tool.process(mockContext, { text: md });
    expect(result).toHaveProperty("status", "success");
    expect((result as any).indexed_ids.length).toBeGreaterThanOrEqual(2);
  });

  it("returns error when neither file_path nor text provided", async () => {
    const tool = new VecMarkdownSplitAndIndexTool(makeMockCollection());
    expect(await tool.process(mockContext, {})).toHaveProperty("error");
  });

  it("indexes markdown from file_path", async () => {
    const col = makeMockCollection();
    const tool = new VecMarkdownSplitAndIndexTool(col);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "md-test-"));
    const tmpFile = path.join(tmpDir, "doc.md");
    await fs.writeFile(tmpFile, "# A\nA\n## B\nB");
    try {
      const result = (await tool.process(mockContext, { file_path: tmpFile })) as any;
      expect(result.status).toBe("success");
      expect(result.indexed_ids.length).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("VecBatchIndexTool", () => {
  it("batch indexes multiple chunks in one call", async () => {
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
    expect(col.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns error for empty chunks array", async () => {
    const tool = new VecBatchIndexTool(makeMockCollection());
    expect(await tool.process(mockContext, { chunks: [] })).toHaveProperty("error");
  });

  it("skips chunks missing text or source_id", async () => {
    const col = makeMockCollection();
    const tool = new VecBatchIndexTool(col);
    const result = await tool.process(mockContext, {
      chunks: [
        { text: "valid", source_id: "s1" },
        { text: "", source_id: "s2" },
        { source_id: "s3" }
      ]
    });
    expect((result as any).indexed_count).toBe(1);
  });

  it("merges base_metadata with chunk metadata", async () => {
    const col = makeMockCollection();
    const tool = new VecBatchIndexTool(col);
    await tool.process(mockContext, {
      chunks: [{ text: "c", source_id: "s1", metadata: { a: 1 } }],
      base_metadata: { b: 2 }
    });
    const records = (col.upsert as AnyMock).mock.calls[0][0];
    expect(records[0].metadata).toEqual({ a: 1, b: 2 });
  });

  it("returns error when upsert fails", async () => {
    const col = makeMockCollection({
      upsert: vi.fn().mockRejectedValue(new Error("db down"))
    });
    const tool = new VecBatchIndexTool(col);
    const result = await tool.process(mockContext, {
      chunks: [{ text: "c", source_id: "s1" }]
    });
    expect((result as any).error).toContain("db down");
  });
});
