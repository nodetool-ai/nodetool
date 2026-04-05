import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";

// ---------------------------------------------------------------------------
// Mock @nodetool/vectorstore — vi.hoisted() ensures variables are available in vi.mock factory
// ---------------------------------------------------------------------------

const { mockCollection, mockStore, ollamaGenerateMock } = vi.hoisted(() => {
  const mockCollection = {
    count: vi.fn().mockResolvedValue(42),
    get: vi.fn().mockResolvedValue({ documents: ["doc1", "doc2"] }),
    peek: vi.fn().mockResolvedValue({ documents: ["peek1"] }),
    add: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({
      ids: [["id1", "id2"]],
      documents: [["doc1", "doc2"]],
      metadatas: [[{ key: "val1" }, { key: "val2" }]],
      distances: [[0.1, 0.5]]
    }),
    metadata: { embedding_model: "test-model" } as Record<string, unknown>
  };

  const mockStore = {
    getOrCreateCollection: vi.fn().mockResolvedValue(mockCollection),
    getCollection: vi.fn().mockResolvedValue(mockCollection)
  };

  // Configurable mock for OllamaEmbeddingFunction.generate
  const ollamaGenerateMock = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);

  return { mockCollection, mockStore, ollamaGenerateMock };
});

vi.mock("@nodetool/vectorstore", () => {
  return {
    getVecStore: vi.fn().mockResolvedValue(mockStore),
    getCollection: vi.fn().mockResolvedValue(mockCollection),
    OllamaEmbeddingFunction: vi.fn().mockImplementation(function () {
      this.generate = ollamaGenerateMock;
    })
  };
});

// ---------------------------------------------------------------------------
// Helper to configure Ollama embedding mock per test
// ---------------------------------------------------------------------------

function mockOllamaEmbeddings(embeddings: number[][]) {
  let callIndex = 0;
  ollamaGenerateMock.mockImplementation(async () => {
    return [embeddings[callIndex++] ?? embeddings[0]];
  });
}

function restoreOllamaEmbeddings() {
  ollamaGenerateMock.mockResolvedValue([[0.1, 0.2, 0.3]]);
}

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  CollectionNode,
  CountNode,
  GetDocumentsNode,
  PeekNode,
  IndexImageNode,
  IndexEmbeddingNode,
  IndexTextChunkNode,
  IndexAggregatedTextNode,
  IndexStringNode,
  QueryImageNode,
  QueryTextNode,
  RemoveOverlapNode,
  HybridSearchNode,
  VECTOR_NODES
} from "../src/nodes/vector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.metadata = { embedding_model: "test-model" };
  // Reset default query mock
  mockCollection.query.mockResolvedValue({
    ids: [["id1", "id2"]],
    documents: [["doc1", "doc2"]],
    metadatas: [[{ key: "val1" }, { key: "val2" }]],
    distances: [[0.1, 0.5]]
  });
});

// ============================================================
// VECTOR_NODES export
// ============================================================

describe("VECTOR_NODES", () => {
  it("exports 13 node classes", () => {
    expect(VECTOR_NODES).toHaveLength(13);
  });
});

// ============================================================
// 1. CollectionNode
// ============================================================

describe("CollectionNode", () => {
  it("has correct metadata", () => {
    expect(CollectionNode.nodeType).toBe("vector.Collection");
    expect(CollectionNode.title).toBe("Collection");
    expect(CollectionNode.description).toBeTruthy();
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(CollectionNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new CollectionNode();
    node.assign({ name: "test-collection" });
    const result = await node.process();
    expect(result).toEqual({ output: { name: "test-collection" } });
    expect(mockStore.getOrCreateCollection).toHaveBeenCalledWith({
      name: "test-collection",
      metadata: { embedding_model: "" }
    });
  });

  it("uses embedding_model repo_id in metadata", async () => {
    const node = new CollectionNode();
    node.assign({
      name: "col1",
      embedding_model: { repo_id: "my-model" }
    });
    const result = await node.process();
    expect(result).toEqual({ output: { name: "col1" } });
    expect(mockStore.getOrCreateCollection).toHaveBeenCalledWith({
      name: "col1",
      metadata: { embedding_model: "my-model" }
    });
  });

  it("falls back to props", async () => {
    const node = new CollectionNode();
    node.assign({ name: "from-props", embedding_model: { repo_id: "m1" } });
    const result = await node.process();
    expect(result).toEqual({ output: { name: "from-props" } });
  });

  it("throws on empty collection name", async () => {
    const node = new CollectionNode();
    node.assign({ name: "" });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on whitespace-only collection name", async () => {
    const node = new CollectionNode();
    node.assign({ name: "   " });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });
});

// ============================================================
// 2. CountNode
// ============================================================

describe("CountNode", () => {
  it("has correct metadata", () => {
    expect(CountNode.nodeType).toBe("vector.Count");
    expect(CountNode.title).toBe("Count");
    expect(CountNode.description).toContain("Count");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(CountNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new CountNode();
    node.assign({ collection: { name: "my-col" } });
    const result = await node.process();
    expect(result).toEqual({ output: 42 });
    expect(mockCollection.count).toHaveBeenCalled();
  });

  it("throws on empty collection name", async () => {
    const node = new CountNode();
    node.assign({ collection: { name: "" } });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("falls back to props", async () => {
    const node = new CountNode();
    node.assign({ collection: { name: "prop-col" } });
    const result = await node.process();
    expect(result).toEqual({ output: 42 });
  });
});

// ============================================================
// 3. GetDocumentsNode
// ============================================================

describe("GetDocumentsNode", () => {
  it("has correct metadata", () => {
    expect(GetDocumentsNode.nodeType).toBe("vector.GetDocuments");
    expect(GetDocumentsNode.title).toBe("Get Documents");
    expect(GetDocumentsNode.description).toContain("Get documents");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(GetDocumentsNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new GetDocumentsNode();
    node.assign({
      collection: { name: "my-col" },
      ids: ["a", "b"],
      limit: 50,
      offset: 10
    });
    const result = await node.process();
    expect(result).toEqual({ output: ["doc1", "doc2"] });
    expect(mockCollection.get).toHaveBeenCalledWith({
      ids: ["a", "b"],
      limit: 50,
      offset: 10
    });
  });

  it("passes undefined ids when empty array", async () => {
    const node = new GetDocumentsNode();
    node.assign({ collection: { name: "my-col" }, ids: [] });
    await node.process();
    expect(mockCollection.get).toHaveBeenCalledWith({
      ids: undefined,
      limit: 100,
      offset: 0
    });
  });

  it("throws on empty collection name", async () => {
    const node = new GetDocumentsNode();
    node.assign({ collection: { name: "" } });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });
});

// ============================================================
// 4. PeekNode
// ============================================================

describe("PeekNode", () => {
  it("has correct metadata", () => {
    expect(PeekNode.nodeType).toBe("vector.Peek");
    expect(PeekNode.title).toBe("Peek");
    expect(PeekNode.description).toContain("Peek");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(PeekNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new PeekNode();
    node.assign({
      collection: { name: "my-col" },
      limit: 5
    });
    const result = await node.process();
    expect(result).toEqual({ output: ["peek1"] });
    expect(mockCollection.peek).toHaveBeenCalledWith({ limit: 5 });
  });

  it("throws on empty collection name", async () => {
    const node = new PeekNode();
    node.assign({ collection: { name: "" } });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });
});

// ============================================================
// 5. IndexImageNode
// ============================================================

describe("IndexImageNode", () => {
  it("has correct metadata", () => {
    expect(IndexImageNode.nodeType).toBe("vector.IndexImage");
    expect(IndexImageNode.title).toBe("Index Image");
    expect(IndexImageNode.description).toContain("image");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(IndexImageNode);
  });

  it("process uses add for non-upsert", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { uri: "http://example.com/img.png", document_id: "img1" },
      index_id: "",
      metadata: { tag: "test" },
      upsert: false
    });
    const result = await node.process();
    expect(result).toEqual({ output: null });
    expect(mockCollection.add).toHaveBeenCalledWith({
      ids: ["img1"],
      uris: ["http://example.com/img.png"],
      metadatas: [{ tag: "test" }]
    });
  });

  it("process uses upsert when upsert=true", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { uri: "http://example.com/img.png" },
      index_id: "explicit-id",
      upsert: true
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith({
      ids: ["explicit-id"],
      uris: ["http://example.com/img.png"],
      metadatas: [{}]
    });
  });

  it("prefers index_id over document_id", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { uri: "http://x.com/i.png", document_id: "from-image" },
      index_id: "explicit"
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["explicit"] })
    );
  });

  it("falls back to image.asset_id for uri", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { asset_id: "asset-123", document_id: "d1" },
      index_id: ""
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({ uris: ["asset-123"] })
    );
  });

  it("throws on empty collection name", async () => {
    const node = new IndexImageNode();
    node.assign({ collection: { name: "" } });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on empty document_id when no index_id", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "c" },
      image: { uri: "http://x.com/i.png" },
      index_id: ""
    });
    await expect(node.process()).rejects.toThrow("document_id cannot be empty");
  });

  it("throws when image has no uri or asset_id", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "c" },
      image: { document_id: "d1" },
      index_id: "id1"
    });
    await expect(node.process()).rejects.toThrow(
      "Image reference must have a uri or asset_id"
    );
  });

  it("flattens non-primitive metadata values to strings", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "c" },
      image: { uri: "http://x.com/i.png" },
      index_id: "id1",
      metadata: { arr: [1, 2], nested: { a: 1 }, num: 42, bool: true }
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        metadatas: [
          { arr: "1,2", nested: "[object Object]", num: 42, bool: true }
        ]
      })
    );
  });
});

// ============================================================
// 6. IndexEmbeddingNode
// ============================================================

describe("IndexEmbeddingNode", () => {
  it("has correct metadata", () => {
    expect(IndexEmbeddingNode.nodeType).toBe("vector.IndexEmbedding");
    expect(IndexEmbeddingNode.title).toBe("Index Embedding");
    expect(IndexEmbeddingNode.description).toContain("embedding");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(IndexEmbeddingNode);
  });

  it("process with single embedding (number[])", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: [0.1, 0.2, 0.3],
      index_id: "emb1",
      metadata: { source: "test" }
    });
    const result = await node.process();
    expect(result).toEqual({ output: null });
    expect(mockCollection.add).toHaveBeenCalledWith({
      ids: ["emb1"],
      embeddings: [[0.1, 0.2, 0.3]],
      metadatas: [{ source: "test" }]
    });
  });

  it("process with batch embeddings (number[][])", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: [
        [0.1, 0.2],
        [0.3, 0.4]
      ],
      index_id: ["id-a", "id-b"],
      metadata: [{ a: "1" }, { b: "2" }]
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith({
      ids: ["id-a", "id-b"],
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4]
      ],
      metadatas: [{ a: "1" }, { b: "2" }]
    });
  });

  it("process with NdArray-like object (data field)", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: { data: [0.5, 0.6] },
      index_id: "nd1"
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddings: [[0.5, 0.6]],
        ids: ["nd1"]
      })
    );
  });

  it("process with NdArray-like object (array field)", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: { array: [0.7, 0.8] },
      index_id: "nd2"
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({ embeddings: [[0.7, 0.8]] })
    );
  });

  it("process with NdArray-like object (embedding field)", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: { embedding: [0.9, 1.0] },
      index_id: "nd3"
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({ embeddings: [[0.9, 1.0]] })
    );
  });

  it("process with NdArray-like object containing 2D data", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: {
        data: [
          [1.0, 2.0],
          [3.0, 4.0]
        ]
      },
      index_id: ["x", "y"]
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddings: [
          [1.0, 2.0],
          [3.0, 4.0]
        ],
        ids: ["x", "y"]
      })
    );
  });

  it("batch mode uses single metadata for all when not array", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: [
        [0.1, 0.2],
        [0.3, 0.4]
      ],
      index_id: ["id-a", "id-b"],
      metadata: { shared: "yes" }
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        metadatas: [{ shared: "yes" }, { shared: "yes" }]
      })
    );
  });

  it("throws on empty collection name", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({ collection: { name: "" }, embedding: [1], index_id: "x" });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on empty embedding array", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({ collection: { name: "c" }, embedding: [], index_id: "x" });
    await expect(node.process()).rejects.toThrow(
      "The embedding cannot be empty"
    );
  });

  it("throws on non-array non-object embedding", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({ collection: { name: "c" }, embedding: "bad", index_id: "x" });
    await expect(node.process()).rejects.toThrow(
      "The embedding cannot be empty"
    );
  });

  it("throws when NdArray-like has no extractable data", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: { foo: "bar" },
      index_id: "x"
    });
    await expect(node.process()).rejects.toThrow(
      "Cannot extract embedding data"
    );
  });

  it("throws on empty single ID", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: [0.1],
      index_id: ""
    });
    await expect(node.process()).rejects.toThrow("The ID cannot be empty");
  });

  it("throws on empty batch IDs list", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: [[0.1]],
      index_id: []
    });
    await expect(node.process()).rejects.toThrow(
      "The IDs list cannot be empty"
    );
  });

  it("throws when IDs count mismatches embeddings count", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: [
        [0.1, 0.2],
        [0.3, 0.4]
      ],
      index_id: ["only-one"]
    });
    await expect(node.process()).rejects.toThrow(
      "Number of IDs (1) must match number of embeddings (2)"
    );
  });

  it("throws when metadata array count mismatches IDs count", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: [
        [0.1, 0.2],
        [0.3, 0.4]
      ],
      index_id: ["a", "b"],
      metadata: [{ x: 1 }]
    });
    await expect(node.process()).rejects.toThrow(
      "Number of IDs (2) must match number of metadatas (1)"
    );
  });

  it("single mode uses first metadata from array", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: [0.1, 0.2],
      index_id: "single-id",
      metadata: [{ first: "yes" }, { second: "no" }]
    });
    await node.process();
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        metadatas: [{ first: "yes" }]
      })
    );
  });
});

// ============================================================
// 7. IndexTextChunkNode
// ============================================================

describe("IndexTextChunkNode", () => {
  it("has correct metadata", () => {
    expect(IndexTextChunkNode.nodeType).toBe("vector.IndexTextChunk");
    expect(IndexTextChunkNode.title).toBe("Index Text Chunk");
    expect(IndexTextChunkNode.description).toContain("text chunk");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(IndexTextChunkNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new IndexTextChunkNode();
    node.assign({
      collection: { name: "txt-col" },
      document_id: "doc-1",
      text: "hello world",
      metadata: { page: 1 }
    });
    const result = await node.process();
    expect(result).toEqual({ output: null });
    expect(mockCollection.add).toHaveBeenCalledWith({
      ids: ["doc-1"],
      documents: ["hello world"],
      metadatas: [{ page: 1 }]
    });
  });

  it("throws on empty collection name", async () => {
    const node = new IndexTextChunkNode();
    node.assign({ collection: { name: "" }, document_id: "d1", text: "hi" });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on empty document_id", async () => {
    const node = new IndexTextChunkNode();
    node.assign({ collection: { name: "c" }, document_id: "", text: "hi" });
    await expect(node.process()).rejects.toThrow(
      "The document ID cannot be empty"
    );
  });
});

// ============================================================
// 8. IndexAggregatedTextNode
// ============================================================

describe("IndexAggregatedTextNode", () => {
  it("has correct metadata", () => {
    expect(IndexAggregatedTextNode.nodeType).toBe("vector.IndexAggregatedText");
    expect(IndexAggregatedTextNode.title).toBe("Index Aggregated Text");
    expect(IndexAggregatedTextNode.description).toContain("aggregated");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(IndexAggregatedTextNode);
  });

  it("process with mean aggregation", async () => {
    mockOllamaEmbeddings([
      [1.0, 2.0, 3.0],
      [3.0, 4.0, 5.0]
    ]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "full doc",
      document_id: "agg-1",
      text_chunks: ["chunk1", "chunk2"],
      aggregation: "mean"
    });
    const result = await node.process();
    expect(result).toEqual({ output: null });

    // mean of [1,2,3] and [3,4,5] = [2,3,4]
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ["agg-1"],
        documents: ["full doc"],
        embeddings: [[2.0, 3.0, 4.0]]
      })
    );

    restoreOllamaEmbeddings();
  });

  it("process with sum aggregation", async () => {
    mockOllamaEmbeddings([
      [1.0, 2.0],
      [3.0, 4.0]
    ]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "doc",
      document_id: "agg-2",
      text_chunks: ["a", "b"],
      aggregation: "sum"
    });
    await node.process();

    // sum of [1,2] and [3,4] = [4,6]
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddings: [[4.0, 6.0]]
      })
    );

    restoreOllamaEmbeddings();
  });

  it("process with max aggregation", async () => {
    mockOllamaEmbeddings([
      [1.0, 5.0],
      [3.0, 2.0]
    ]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "doc",
      document_id: "agg-3",
      text_chunks: ["a", "b"],
      aggregation: "max"
    });
    await node.process();

    // max of [1,5] and [3,2] = [3,5]
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddings: [[3.0, 5.0]]
      })
    );

    restoreOllamaEmbeddings();
  });

  it("process with min aggregation", async () => {
    mockOllamaEmbeddings([
      [1.0, 5.0],
      [3.0, 2.0]
    ]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "doc",
      document_id: "agg-4",
      text_chunks: ["a", "b"],
      aggregation: "min"
    });
    await node.process();

    // min of [1,5] and [3,2] = [1,2]
    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({
        embeddings: [[1.0, 2.0]]
      })
    );

    restoreOllamaEmbeddings();
  });

  it("handles text_chunks as objects with text field", async () => {
    mockOllamaEmbeddings([[1.0, 2.0]]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "doc",
      document_id: "agg-5",
      text_chunks: [{ text: "object chunk" }],
      aggregation: "mean"
    });
    await node.process();

    // Verify the embedding function was called (text extracted from object)
    expect(ollamaGenerateMock).toHaveBeenCalled();

    restoreOllamaEmbeddings();
  });

  it("omits metadatas when metadata is empty", async () => {
    mockOllamaEmbeddings([[1.0]]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "doc",
      document_id: "agg-6",
      text_chunks: ["x"],
      aggregation: "mean",
      metadata: {}
    });
    await node.process();

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({ metadatas: undefined })
    );

    restoreOllamaEmbeddings();
  });

  it("includes metadatas when metadata is non-empty", async () => {
    mockOllamaEmbeddings([[1.0]]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "doc",
      document_id: "agg-7",
      text_chunks: ["x"],
      aggregation: "mean",
      metadata: { key: "val" }
    });
    await node.process();

    expect(mockCollection.add).toHaveBeenCalledWith(
      expect.objectContaining({ metadatas: [{ key: "val" }] })
    );

    restoreOllamaEmbeddings();
  });

  it("throws on empty collection name", async () => {
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "" },
      document: "d",
      document_id: "id",
      text_chunks: ["x"]
    });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on empty document_id", async () => {
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "d",
      document_id: "",
      text_chunks: ["x"]
    });
    await expect(node.process()).rejects.toThrow(
      "The document ID cannot be empty"
    );
  });

  it("throws on empty document", async () => {
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "",
      document_id: "id",
      text_chunks: ["x"]
    });
    await expect(node.process()).rejects.toThrow(
      "The document cannot be empty"
    );
  });

  it("throws on empty text_chunks", async () => {
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "doc",
      document_id: "id",
      text_chunks: []
    });
    await expect(node.process()).rejects.toThrow(
      "The text chunks cannot be empty"
    );
  });

  it("throws when collection has no embedding_model", async () => {
    mockCollection.metadata = {};
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "doc",
      document_id: "id",
      text_chunks: ["x"]
    });
    await expect(node.process()).rejects.toThrow(
      "does not have an embedding_model"
    );
  });

  it("throws on invalid aggregation method", async () => {
    mockOllamaEmbeddings([[1.0]]);

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "doc",
      document_id: "id",
      text_chunks: ["x"],
      aggregation: "median"
    });
    await expect(node.process()).rejects.toThrow(
      "Invalid aggregation method: median"
    );

    restoreOllamaEmbeddings();
  });

  it("throws when embedding function returns error", async () => {
    ollamaGenerateMock.mockRejectedValue(
      new Error("Embedding generation failed")
    );

    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "doc",
      document_id: "id",
      text_chunks: ["x"]
    });
    await expect(node.process()).rejects.toThrow("Embedding generation failed");

    restoreOllamaEmbeddings();
  });
});

// ============================================================
// 9. IndexStringNode
// ============================================================

describe("IndexStringNode", () => {
  it("has correct metadata", () => {
    expect(IndexStringNode.nodeType).toBe("vector.IndexString");
    expect(IndexStringNode.title).toBe("Index String");
    expect(IndexStringNode.description).toContain("string");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(IndexStringNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new IndexStringNode();
    node.assign({
      collection: { name: "str-col" },
      text: "hello",
      document_id: "str-1"
    });
    const result = await node.process();
    expect(result).toEqual({ output: null });
    expect(mockCollection.add).toHaveBeenCalledWith({
      ids: ["str-1"],
      documents: ["hello"]
    });
  });

  it("throws on empty collection name", async () => {
    const node = new IndexStringNode();
    node.assign({ collection: { name: "" }, text: "hi", document_id: "d" });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on empty document_id", async () => {
    const node = new IndexStringNode();
    node.assign({ collection: { name: "c" }, text: "hi", document_id: "" });
    await expect(node.process()).rejects.toThrow(
      "The document ID cannot be empty"
    );
  });
});

// ============================================================
// 10. QueryImageNode
// ============================================================

describe("QueryImageNode", () => {
  it("has correct metadata", () => {
    expect(QueryImageNode.nodeType).toBe("vector.QueryImage");
    expect(QueryImageNode.title).toBe("Query Image");
    expect(QueryImageNode.description).toContain("image");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(QueryImageNode);
  });

  it("process succeeds and results are sorted by ID", async () => {
    // Mock returns id2 before id1 — verify sorting
    mockCollection.query.mockResolvedValueOnce({
      ids: [["id2", "id1"]],
      documents: [["doc2", "doc1"]],
      metadatas: [[{ k: "v2" }, { k: "v1" }]],
      distances: [[0.5, 0.1]]
    });

    const node = new QueryImageNode();
    node.assign({
      collection: { name: "q-col" },
      image: { uri: "http://x.com/img.png" },
      n_results: 2
    });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.ids).toEqual(["id1", "id2"]);
    expect(output.documents).toEqual(["doc1", "doc2"]);
    expect(output.metadatas).toEqual([{ k: "v1" }, { k: "v2" }]);
    expect(output.distances).toEqual([0.1, 0.5]);

    expect(mockCollection.query).toHaveBeenCalledWith({
      queryURIs: ["http://x.com/img.png"],
      nResults: 2,
      include: ["documents", "metadatas", "distances"]
    });
  });

  it("falls back to asset_id for uri", async () => {
    const node = new QueryImageNode();
    node.assign({
      collection: { name: "q-col" },
      image: { asset_id: "asset-xyz" }
    });
    await node.process();
    expect(mockCollection.query).toHaveBeenCalledWith(
      expect.objectContaining({ queryURIs: ["asset-xyz"] })
    );
  });

  it("throws on empty collection name", async () => {
    const node = new QueryImageNode();
    node.assign({ collection: { name: "" }, image: { uri: "x" } });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws when image has no uri or asset_id", async () => {
    const node = new QueryImageNode();
    node.assign({ collection: { name: "c" }, image: {} });
    await expect(node.process()).rejects.toThrow("Image is not connected");
  });

  it("throws when ids not returned", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: null,
      documents: [["d"]],
      metadatas: [[{}]],
      distances: [[0]]
    });
    const node = new QueryImageNode();
    node.assign({ collection: { name: "c" }, image: { uri: "x" } });
    await expect(node.process()).rejects.toThrow("Ids are not returned");
  });

  it("throws when documents not returned", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: [["id"]],
      documents: null,
      metadatas: [[{}]],
      distances: [[0]]
    });
    const node = new QueryImageNode();
    node.assign({ collection: { name: "c" }, image: { uri: "x" } });
    await expect(node.process()).rejects.toThrow("Documents are not returned");
  });

  it("throws when metadatas not returned", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: [["id"]],
      documents: [["d"]],
      metadatas: null,
      distances: [[0]]
    });
    const node = new QueryImageNode();
    node.assign({ collection: { name: "c" }, image: { uri: "x" } });
    await expect(node.process()).rejects.toThrow("Metadatas are not returned");
  });

  it("throws when distances not returned", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: [["id"]],
      documents: [["d"]],
      metadatas: [[{}]],
      distances: null
    });
    const node = new QueryImageNode();
    node.assign({ collection: { name: "c" }, image: { uri: "x" } });
    await expect(node.process()).rejects.toThrow("Distances are not returned");
  });
});

// ============================================================
// 11. QueryTextNode
// ============================================================

describe("QueryTextNode", () => {
  it("has correct metadata", () => {
    expect(QueryTextNode.nodeType).toBe("vector.QueryText");
    expect(QueryTextNode.title).toBe("Query Text");
    expect(QueryTextNode.description).toContain("text");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(QueryTextNode);
  });

  it("process succeeds and results are sorted by ID", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: [["z-id", "a-id"]],
      documents: [["z-doc", "a-doc"]],
      metadatas: [[{ z: 1 }, { a: 1 }]],
      distances: [[0.9, 0.1]]
    });

    const node = new QueryTextNode();
    node.assign({
      collection: { name: "q-col" },
      text: "search query",
      n_results: 2
    });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.ids).toEqual(["a-id", "z-id"]);
    expect(output.documents).toEqual(["a-doc", "z-doc"]);

    expect(mockCollection.query).toHaveBeenCalledWith({
      queryTexts: ["search query"],
      nResults: 2,
      include: ["documents", "metadatas", "distances"]
    });
  });

  it("throws on empty collection name", async () => {
    const node = new QueryTextNode();
    node.assign({ collection: { name: "" }, text: "hi" });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws when ids not returned", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: null,
      documents: [["d"]],
      metadatas: [[{}]],
      distances: [[0]]
    });
    const node = new QueryTextNode();
    node.assign({ collection: { name: "c" }, text: "q" });
    await expect(node.process()).rejects.toThrow("Ids are not returned");
  });

  it("handles null document/metadata/distance values gracefully", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: [["id1"]],
      documents: [[null]],
      metadatas: [[null]],
      distances: [[null]]
    });

    const node = new QueryTextNode();
    node.assign({
      collection: { name: "c" },
      text: "q"
    });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.documents).toEqual([""]);
    expect(output.metadatas).toEqual([{}]);
    expect(output.distances).toEqual([0]);
  });
});

// ============================================================
// 12. RemoveOverlapNode
// ============================================================

describe("RemoveOverlapNode", () => {
  it("has correct metadata", () => {
    expect(RemoveOverlapNode.nodeType).toBe("vector.RemoveOverlap");
    expect(RemoveOverlapNode.title).toBe("Remove Overlap");
    expect(RemoveOverlapNode.description).toContain("overlap");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(RemoveOverlapNode);
  });

  it("returns empty documents for empty input", async () => {
    const node = new RemoveOverlapNode();
    node.assign({ documents: [] });
    const result = await node.process();
    expect(result).toEqual({ output: { documents: [] } });
  });

  it("returns single document unchanged", async () => {
    const node = new RemoveOverlapNode();
    node.assign({ documents: ["hello world"] });
    const result = await node.process();
    expect(result).toEqual({ output: { documents: ["hello world"] } });
  });

  it("removes overlapping words between consecutive strings", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: [
        "the quick brown fox jumps",
        "brown fox jumps over the lazy dog"
      ],
      min_overlap_words: 2
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    expect(output.documents).toEqual([
      "the quick brown fox jumps",
      "over the lazy dog"
    ]);
  });

  it("does not remove overlap below min_overlap_words threshold", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["hello world", "world goodbye"],
      min_overlap_words: 2
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    // "world" is only 1 word overlap, below min of 2
    expect(output.documents).toEqual(["hello world", "world goodbye"]);
  });

  it("removes overlap when min_overlap_words is 1", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["hello world", "world goodbye"],
      min_overlap_words: 1
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    expect(output.documents).toEqual(["hello world", "goodbye"]);
  });

  it("handles multiple consecutive documents", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["a b c d", "c d e f", "e f g h"],
      min_overlap_words: 2
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    expect(output.documents).toEqual(["a b c d", "e f", "g h"]);
  });

  it("handles no overlap between consecutive documents", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["alpha beta", "gamma delta"],
      min_overlap_words: 2
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    expect(output.documents).toEqual(["alpha beta", "gamma delta"]);
  });

  it("skips document if entire content is overlap", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["a b c", "a b c"],
      min_overlap_words: 2
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    // After removing all overlapping words, newText is empty, so the doc is skipped
    expect(output.documents).toEqual(["a b c"]);
  });

  it("handles extra whitespace in input", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["hello   world  foo", "world foo bar"],
      min_overlap_words: 2
    });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    expect(output.documents).toEqual(["hello   world  foo", "bar"]);
  });

  it("uses props fallback", async () => {
    const node = new RemoveOverlapNode();
    node.assign({ documents: ["x y z", "y z w"], min_overlap_words: 2 });
    const result = await node.process();
    const output = result.output as { documents: string[] };
    expect(output.documents).toEqual(["x y z", "w"]);
  });
});

// ============================================================
// 13. HybridSearchNode
// ============================================================

describe("HybridSearchNode", () => {
  it("has correct metadata", () => {
    expect(HybridSearchNode.nodeType).toBe("vector.HybridSearch");
    expect(HybridSearchNode.title).toBe("Hybrid Search");
    expect(HybridSearchNode.description).toContain("Hybrid");
  });

  it("returns expected defaults", () => {
    expectMetadataDefaults(HybridSearchNode);
  });

  it("process succeeds with valid inputs", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "search query text",
      n_results: 2
    });
    const result = await node.process();

    const output = result.output as Record<string, unknown>;
    expect(output.ids).toBeDefined();
    expect(output.documents).toBeDefined();
    expect(output.metadatas).toBeDefined();
    expect(output.distances).toBeDefined();
    expect(output.scores).toBeDefined();

    // Should have called query twice: semantic + keyword
    expect(mockCollection.query).toHaveBeenCalledTimes(2);
  });

  it("performs only semantic search when all keywords below min length", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "ab cd",
      n_results: 2,
      min_keyword_length: 5
    });
    await node.process();

    // Only semantic search (no keyword query because tokens too short)
    expect(mockCollection.query).toHaveBeenCalledTimes(1);
  });

  it("generates single $contains for one keyword", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "longword ab",
      n_results: 2,
      min_keyword_length: 3
    });
    await node.process();

    // Should be called twice; the second with whereDocument
    expect(mockCollection.query).toHaveBeenCalledTimes(2);
    expect(mockCollection.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        whereDocument: { $contains: "longword" }
      })
    );
  });

  it("generates $or for multiple keywords", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "hello world test",
      n_results: 2,
      min_keyword_length: 3
    });
    await node.process();

    expect(mockCollection.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        whereDocument: {
          $or: [
            { $contains: "hello" },
            { $contains: "world" },
            { $contains: "test" }
          ]
        }
      })
    );
  });

  it("splits on punctuation for keyword extraction", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "hello,world!test-case",
      n_results: 2,
      min_keyword_length: 3
    });
    await node.process();

    // hello, world, test, case — all >= 3 chars
    expect(mockCollection.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        whereDocument: {
          $or: [
            { $contains: "hello" },
            { $contains: "world" },
            { $contains: "test" },
            { $contains: "case" }
          ]
        }
      })
    );
  });

  it("reciprocal rank fusion combines and deduplicates results", async () => {
    // First call (semantic): id1, id2
    // Second call (keyword): id2, id3
    mockCollection.query
      .mockResolvedValueOnce({
        ids: [["id1", "id2"]],
        documents: [["doc1", "doc2"]],
        metadatas: [[{ s: 1 }, { s: 2 }]],
        distances: [[0.1, 0.2]]
      })
      .mockResolvedValueOnce({
        ids: [["id2", "id3"]],
        documents: [["doc2", "doc3"]],
        metadatas: [[{ k: 2 }, { k: 3 }]],
        distances: [[0.3, 0.4]]
      });

    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "test query",
      n_results: 10,
      k_constant: 60
    });
    const result = await node.process();

    const output = result.output as {
      ids: string[];
      scores: number[];
    };

    // id2 appears in both, so it should have the highest combined score
    expect(output.ids).toContain("id1");
    expect(output.ids).toContain("id2");
    expect(output.ids).toContain("id3");

    const id2Idx = output.ids.indexOf("id2");
    // id2 should be first (highest score from appearing in both results)
    expect(id2Idx).toBe(0);
  });

  it("limits results to n_results", async () => {
    mockCollection.query.mockResolvedValue({
      ids: [["a", "b", "c", "d", "e"]],
      documents: [["da", "db", "dc", "dd", "de"]],
      metadatas: [[{}, {}, {}, {}, {}]],
      distances: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });

    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "hybrid-col" },
      text: "test query",
      n_results: 2
    });
    const result = await node.process();

    const output = result.output as { ids: string[] };
    expect(output.ids).toHaveLength(2);
  });

  it("throws on empty collection name", async () => {
    const node = new HybridSearchNode();
    node.assign({ collection: { name: "" }, text: "hi" });
    await expect(node.process()).rejects.toThrow(
      "Collection name cannot be empty"
    );
  });

  it("throws on empty search text", async () => {
    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "" });
    await expect(node.process()).rejects.toThrow("Search text cannot be empty");
  });

  it("throws on whitespace-only search text", async () => {
    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "   " });
    await expect(node.process()).rejects.toThrow("Search text cannot be empty");
  });

  it("throws when query returns no ids", async () => {
    mockCollection.query.mockResolvedValueOnce({
      ids: null,
      documents: [["d"]],
      metadatas: [[{}]],
      distances: [[0]]
    });

    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "ab" });
    await expect(node.process()).rejects.toThrow("Ids are not returned");
  });

  it("uses nResults * 2 for internal queries", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "c" },
      text: "test query",
      n_results: 3
    });
    await node.process();

    expect(mockCollection.query).toHaveBeenCalledWith(
      expect.objectContaining({ nResults: 6 })
    );
  });
});
