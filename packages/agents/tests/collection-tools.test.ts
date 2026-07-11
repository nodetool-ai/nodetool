/**
 * Tests for the read-only collection discovery + query tools
 * (`list_collections`, `query_collection`). The tools dynamically import
 * `@nodetool-ai/vectorstore`, so we mock that module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const listCollections = vi.fn();
const resolveCollection = vi.fn();
const getDefaultVectorProvider = vi.fn(() => ({ listCollections }));

vi.mock("@nodetool-ai/vectorstore", () => ({
  getDefaultVectorProvider,
  resolveCollection
}));

import {
  ListCollectionsTool,
  QueryCollectionTool
} from "../src/tools/collection-tools.js";

const mockContext = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  getDefaultVectorProvider.mockReturnValue({ listCollections });
});

describe("ListCollectionsTool", () => {
  it("has the expected name, schema and user message", () => {
    const tool = new ListCollectionsTool();
    expect(tool.name).toBe("list_collections");
    expect(tool.inputSchema.required).toEqual([]);
    expect(tool.userMessage()).toBe("Listing knowledge collections");
  });

  it("maps provider infos to name + metadata summaries", async () => {
    listCollections.mockResolvedValue([
      { name: "docs", metadata: { owner: "a" } },
      { name: "notes", metadata: undefined }
    ]);
    const tool = new ListCollectionsTool();
    const result = (await tool.process(mockContext, {})) as {
      collections: Array<{ name: string; metadata?: unknown }>;
    };
    expect(result.collections).toEqual([
      { name: "docs", metadata: { owner: "a" } },
      { name: "notes", metadata: undefined }
    ]);
    expect(getDefaultVectorProvider).toHaveBeenCalledTimes(1);
    expect(listCollections).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list when the provider has no collections", async () => {
    listCollections.mockResolvedValue([]);
    const tool = new ListCollectionsTool();
    const result = (await tool.process(mockContext, {})) as {
      collections: unknown[];
    };
    expect(result.collections).toEqual([]);
  });

  it("propagates provider errors", async () => {
    listCollections.mockRejectedValue(new Error("provider down"));
    const tool = new ListCollectionsTool();
    await expect(tool.process(mockContext, {})).rejects.toThrow("provider down");
  });
});

describe("QueryCollectionTool", () => {
  it("has the expected name and required params", () => {
    const tool = new QueryCollectionTool();
    expect(tool.name).toBe("query_collection");
    expect(tool.inputSchema.required).toEqual(["collection", "query"]);
  });

  it("returns error when collection is missing", async () => {
    const tool = new QueryCollectionTool();
    const result = (await tool.process(mockContext, { query: "x" })) as {
      error?: string;
    };
    expect(result.error).toBe("collection is required");
    expect(resolveCollection).not.toHaveBeenCalled();
  });

  it("returns error when collection is empty string", async () => {
    const tool = new QueryCollectionTool();
    const result = (await tool.process(mockContext, {
      collection: "",
      query: "x"
    })) as { error?: string };
    expect(result.error).toBe("collection is required");
  });

  it("returns error when query is missing", async () => {
    const tool = new QueryCollectionTool();
    const result = (await tool.process(mockContext, {
      collection: "docs"
    })) as { error?: string };
    expect(result.error).toBe("query is required");
    expect(resolveCollection).not.toHaveBeenCalled();
  });

  it("returns error when query is empty string", async () => {
    const tool = new QueryCollectionTool();
    const result = (await tool.process(mockContext, {
      collection: "docs",
      query: ""
    })) as { error?: string };
    expect(result.error).toBe("query is required");
  });

  it("queries the resolved collection and maps matches", async () => {
    const query = vi.fn().mockResolvedValue([
      { id: "1", document: "hello", score: 0.9 },
      { id: "2", document: "world", score: 0.5 }
    ]);
    resolveCollection.mockResolvedValue({ query });
    const tool = new QueryCollectionTool();
    const result = (await tool.process(mockContext, {
      collection: "docs",
      query: "greeting",
      n_results: 3
    })) as {
      collection: string;
      matches: Array<{ id: string; document: string; score: number | null }>;
    };
    expect(resolveCollection).toHaveBeenCalledWith("docs");
    expect(query).toHaveBeenCalledWith({ text: "greeting", topK: 3 });
    expect(result.collection).toBe("docs");
    expect(result.matches).toEqual([
      { id: "1", document: "hello", score: 0.9 },
      { id: "2", document: "world", score: 0.5 }
    ]);
  });

  it("defaults n_results to 5 when omitted", async () => {
    const query = vi.fn().mockResolvedValue([]);
    resolveCollection.mockResolvedValue({ query });
    const tool = new QueryCollectionTool();
    await tool.process(mockContext, { collection: "docs", query: "q" });
    expect(query).toHaveBeenCalledWith({ text: "q", topK: 5 });
  });

  it("filters out matches whose document is null and maps missing score to null", async () => {
    const query = vi.fn().mockResolvedValue([
      { id: "1", document: "kept" },
      { id: "2", document: null, score: 0.4 },
      { id: "3", document: undefined },
      { id: "4", document: "also kept", score: 0.1 }
    ]);
    resolveCollection.mockResolvedValue({ query });
    const tool = new QueryCollectionTool();
    const result = (await tool.process(mockContext, {
      collection: "docs",
      query: "q"
    })) as { matches: Array<{ id: string; score: number | null }> };
    expect(result.matches).toEqual([
      { id: "1", document: "kept", score: null },
      { id: "4", document: "also kept", score: 0.1 }
    ]);
  });

  it("propagates errors thrown by the resolved collection query", async () => {
    const query = vi.fn().mockRejectedValue(new Error("query boom"));
    resolveCollection.mockResolvedValue({ query });
    const tool = new QueryCollectionTool();
    await expect(
      tool.process(mockContext, { collection: "docs", query: "q" })
    ).rejects.toThrow("query boom");
  });

  it("userMessage includes the collection name when present", () => {
    const tool = new QueryCollectionTool();
    expect(tool.userMessage({ collection: "docs" })).toBe(
      "Searching collection 'docs'"
    );
  });

  it("userMessage falls back to a generic message when collection absent", () => {
    const tool = new QueryCollectionTool();
    expect(tool.userMessage({})).toBe("Searching collection");
  });
});
