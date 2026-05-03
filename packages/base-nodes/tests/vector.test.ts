import { describe, it, expect, vi, beforeEach } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";

// ---------------------------------------------------------------------------
// Mock @nodetool-ai/vectorstore — backend-agnostic VectorProvider API
// ---------------------------------------------------------------------------

const { mockCollection, mockProvider, ollamaGenerateMock } = vi.hoisted(() => {
  const mockCollection = {
    name: "mock",
    metadata: { embedding_model: "test-model" } as Record<string, unknown>,
    count: vi.fn().mockResolvedValue(42),
    get: vi.fn().mockResolvedValue([
      { id: "id1", document: "doc1", metadata: {} },
      { id: "id2", document: "doc2", metadata: {} }
    ]),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    modify: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([
      { id: "id1", document: "doc1", metadata: { key: "val1" }, uri: null, distance: 0.1 },
      { id: "id2", document: "doc2", metadata: { key: "val2" }, uri: null, distance: 0.5 }
    ])
  };

  const mockProvider = {
    name: "sqlite-vec",
    getOrCreateCollection: vi.fn().mockResolvedValue(mockCollection),
    getCollection: vi.fn().mockResolvedValue(mockCollection),
    createCollection: vi.fn().mockResolvedValue(mockCollection),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
    listCollections: vi.fn().mockResolvedValue([])
  };

  const ollamaGenerateMock = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);

  return { mockCollection, mockProvider, ollamaGenerateMock };
});

vi.mock("@nodetool-ai/vectorstore", () => ({
  getDefaultVectorProvider: vi.fn(() => mockProvider),
  OllamaEmbeddingFunction: vi.fn().mockImplementation(function () {
    this.generate = ollamaGenerateMock;
  })
}));

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
  mockCollection.query.mockResolvedValue([
    { id: "id1", document: "doc1", metadata: { key: "val1" }, uri: null, distance: 0.1 },
    { id: "id2", document: "doc2", metadata: { key: "val2" }, uri: null, distance: 0.5 }
  ]);
  mockCollection.get.mockResolvedValue([
    { id: "id1", document: "doc1", metadata: {} },
    { id: "id2", document: "doc2", metadata: {} }
  ]);
});

describe("VECTOR_NODES", () => {
  it("exports 13 node classes", () => {
    expect(VECTOR_NODES).toHaveLength(13);
  });
});

describe("CollectionNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(CollectionNode));

  it("creates collection with empty embedding model when none given", async () => {
    const node = new CollectionNode();
    node.assign({ name: "test-collection" });
    const result = await node.process();
    expect(result).toEqual({ output: { name: "test-collection" } });
    expect(mockProvider.getOrCreateCollection).toHaveBeenCalledWith({
      name: "test-collection",
      metadata: { embedding_model: "" }
    });
  });

  it("uses embedding_model repo_id in metadata", async () => {
    const node = new CollectionNode();
    node.assign({ name: "col1", embedding_model: { repo_id: "my-model" } });
    await node.process();
    expect(mockProvider.getOrCreateCollection).toHaveBeenCalledWith({
      name: "col1",
      metadata: { embedding_model: "my-model" }
    });
  });

  it("throws on empty collection name", async () => {
    const node = new CollectionNode();
    node.assign({ name: "" });
    await expect(node.process()).rejects.toThrow("Collection name cannot be empty");
  });
});

describe("CountNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(CountNode));

  it("returns the collection count", async () => {
    const node = new CountNode();
    node.assign({ collection: { name: "my-col" } });
    const result = await node.process();
    expect(result).toEqual({ output: 42 });
    expect(mockCollection.count).toHaveBeenCalled();
  });

  it("throws on empty collection name", async () => {
    const node = new CountNode();
    node.assign({ collection: { name: "" } });
    await expect(node.process()).rejects.toThrow("Collection name cannot be empty");
  });
});

describe("GetDocumentsNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(GetDocumentsNode));

  it("fetches by ids and returns documents", async () => {
    const node = new GetDocumentsNode();
    node.assign({ collection: { name: "my-col" }, ids: ["a", "b"], limit: 50, offset: 10 });
    const result = await node.process();
    expect(result).toEqual({ output: ["doc1", "doc2"] });
    expect(mockCollection.get).toHaveBeenCalledWith({ ids: ["a", "b"], limit: 50, offset: 10 });
  });

  it("passes empty ids array when ids list is empty", async () => {
    const node = new GetDocumentsNode();
    node.assign({ collection: { name: "my-col" }, ids: [] });
    await node.process();
    expect(mockCollection.get).toHaveBeenCalledWith({ ids: [], limit: 100, offset: 0 });
  });
});

describe("PeekNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(PeekNode));

  it("calls get with the configured limit", async () => {
    const node = new PeekNode();
    node.assign({ collection: { name: "my-col" }, limit: 5 });
    const result = await node.process();
    expect(result).toEqual({ output: ["doc1", "doc2"] });
    expect(mockCollection.get).toHaveBeenCalledWith({ limit: 5 });
  });
});

describe("IndexImageNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(IndexImageNode));

  it("upserts image record with uri and metadata", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { uri: "http://example.com/img.png", document_id: "img1" },
      metadata: { tag: "test" }
    });
    const result = await node.process();
    expect(result).toEqual({ output: null });
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      { id: "img1", uri: "http://example.com/img.png", metadata: { tag: "test" } }
    ]);
  });

  it("prefers index_id over document_id", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { uri: "http://x.com/i.png", document_id: "from-image" },
      index_id: "explicit"
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: "explicit" })
    ]);
  });

  it("falls back to image.asset_id for uri", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "img-col" },
      image: { asset_id: "asset-123", document_id: "d1" }
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ uri: "asset-123" })
    ]);
  });

  it("flattens non-primitive metadata to strings", async () => {
    const node = new IndexImageNode();
    node.assign({
      collection: { name: "c" },
      image: { uri: "u" },
      index_id: "id1",
      metadata: { arr: [1, 2], num: 42, bool: true }
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        metadata: { arr: "1,2", num: 42, bool: true }
      })
    ]);
  });

  it("throws when image has no uri or asset_id", async () => {
    const node = new IndexImageNode();
    node.assign({ collection: { name: "c" }, image: { document_id: "d1" }, index_id: "id1" });
    await expect(node.process()).rejects.toThrow("Image reference must have a uri or asset_id");
  });

  it("throws on empty document_id when no index_id", async () => {
    const node = new IndexImageNode();
    node.assign({ collection: { name: "c" }, image: { uri: "u" }, index_id: "" });
    await expect(node.process()).rejects.toThrow("document_id cannot be empty");
  });
});

describe("IndexEmbeddingNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(IndexEmbeddingNode));

  it("upserts a single embedding (number[])", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: [0.1, 0.2, 0.3],
      index_id: "emb1",
      metadata: { source: "test" }
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      { id: "emb1", embedding: [0.1, 0.2, 0.3], metadata: { source: "test" } }
    ]);
  });

  it("upserts a batch of embeddings (number[][])", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: [[0.1, 0.2], [0.3, 0.4]],
      index_id: ["id-a", "id-b"],
      metadata: [{ a: "1" }, { b: "2" }]
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      { id: "id-a", embedding: [0.1, 0.2], metadata: { a: "1" } },
      { id: "id-b", embedding: [0.3, 0.4], metadata: { b: "2" } }
    ]);
  });

  it("extracts embeddings from NdArray-like .data field", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: { data: [0.5, 0.6] },
      index_id: "nd1"
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ embedding: [0.5, 0.6] })
    ]);
  });

  it("uses single metadata for all records when scalar in batch mode", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "emb-col" },
      embedding: [[0.1], [0.2]],
      index_id: ["a", "b"],
      metadata: { shared: "yes" }
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ metadata: { shared: "yes" } }),
      expect.objectContaining({ metadata: { shared: "yes" } })
    ]);
  });

  it("throws on empty embedding array", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({ collection: { name: "c" }, embedding: [], index_id: "x" });
    await expect(node.process()).rejects.toThrow("The embedding cannot be empty");
  });

  it("throws on ID/embedding count mismatch", async () => {
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: [[0.1], [0.2]],
      index_id: ["only-one"]
    });
    await expect(node.process()).rejects.toThrow(
      "Number of IDs (1) must match number of embeddings (2)"
    );
  });
});

describe("IndexTextChunkNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(IndexTextChunkNode));

  it("upserts text chunk with metadata", async () => {
    const node = new IndexTextChunkNode();
    node.assign({
      collection: { name: "txt-col" },
      document_id: "doc-1",
      text: "hello world",
      metadata: { page: 1 }
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      { id: "doc-1", document: "hello world", metadata: { page: 1 } }
    ]);
  });

  it("throws on empty document_id", async () => {
    const node = new IndexTextChunkNode();
    node.assign({ collection: { name: "c" }, document_id: "", text: "hi" });
    await expect(node.process()).rejects.toThrow("The document ID cannot be empty");
  });
});

describe("IndexAggregatedTextNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(IndexAggregatedTextNode));

  it("aggregates with mean", async () => {
    mockOllamaEmbeddings([[1.0, 2.0, 3.0], [3.0, 4.0, 5.0]]);
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "agg-col" },
      document: "full doc",
      document_id: "agg-1",
      text_chunks: ["chunk1", "chunk2"],
      aggregation: "mean"
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "agg-1",
        document: "full doc",
        embedding: [2.0, 3.0, 4.0]
      })
    ]);
    restoreOllamaEmbeddings();
  });

  it("aggregates with max", async () => {
    mockOllamaEmbeddings([[1.0, 5.0], [3.0, 2.0]]);
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "d",
      document_id: "id",
      text_chunks: ["a", "b"],
      aggregation: "max"
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ embedding: [3.0, 5.0] })
    ]);
    restoreOllamaEmbeddings();
  });

  it("throws when collection has no embedding_model", async () => {
    mockCollection.metadata = {};
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "d",
      document_id: "id",
      text_chunks: ["x"]
    });
    await expect(node.process()).rejects.toThrow("does not have an embedding_model");
  });

  it("throws on invalid aggregation method", async () => {
    mockOllamaEmbeddings([[1.0]]);
    const node = new IndexAggregatedTextNode();
    node.assign({
      collection: { name: "c" },
      document: "d",
      document_id: "id",
      text_chunks: ["x"],
      aggregation: "median"
    });
    await expect(node.process()).rejects.toThrow("Invalid aggregation method: median");
    restoreOllamaEmbeddings();
  });
});

describe("IndexStringNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(IndexStringNode));

  it("upserts a string document", async () => {
    const node = new IndexStringNode();
    node.assign({
      collection: { name: "str-col" },
      text: "hello",
      document_id: "str-1"
    });
    await node.process();
    expect(mockCollection.upsert).toHaveBeenCalledWith([
      { id: "str-1", document: "hello" }
    ]);
  });
});

describe("QueryImageNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(QueryImageNode));

  it("queries by uri and sorts results by id", async () => {
    mockCollection.query.mockResolvedValueOnce([
      { id: "id2", document: "doc2", metadata: { k: "v2" }, uri: null, distance: 0.5 },
      { id: "id1", document: "doc1", metadata: { k: "v1" }, uri: null, distance: 0.1 }
    ]);

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
    expect(output.distances).toEqual([0.1, 0.5]);

    expect(mockCollection.query).toHaveBeenCalledWith({
      uri: "http://x.com/img.png",
      topK: 2
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
      expect.objectContaining({ uri: "asset-xyz" })
    );
  });

  it("throws when image has no uri or asset_id", async () => {
    const node = new QueryImageNode();
    node.assign({ collection: { name: "c" }, image: {} });
    await expect(node.process()).rejects.toThrow("Image is not connected");
  });
});

describe("QueryTextNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(QueryTextNode));

  it("queries by text and sorts by id", async () => {
    mockCollection.query.mockResolvedValueOnce([
      { id: "z-id", document: "z-doc", metadata: { z: 1 }, uri: null, distance: 0.9 },
      { id: "a-id", document: "a-doc", metadata: { a: 1 }, uri: null, distance: 0.1 }
    ]);

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
      text: "search query",
      topK: 2
    });
  });
});

describe("RemoveOverlapNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(RemoveOverlapNode));

  it("returns empty for empty input", async () => {
    const node = new RemoveOverlapNode();
    node.assign({ documents: [] });
    expect(await node.process()).toEqual({ documents: [] });
  });

  it("removes overlapping words between consecutive strings", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["the quick brown fox jumps", "brown fox jumps over the lazy dog"],
      min_overlap_words: 2
    });
    const result = (await node.process()) as { documents: string[] };
    expect(result.documents).toEqual([
      "the quick brown fox jumps",
      "over the lazy dog"
    ]);
  });

  it("respects min_overlap_words threshold", async () => {
    const node = new RemoveOverlapNode();
    node.assign({
      documents: ["hello world", "world goodbye"],
      min_overlap_words: 2
    });
    const result = (await node.process()) as { documents: string[] };
    expect(result.documents).toEqual(["hello world", "world goodbye"]);
  });
});

describe("HybridSearchNode", () => {
  it("returns expected defaults", () => expectMetadataDefaults(HybridSearchNode));

  it("performs semantic + keyword search and fuses results", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "c" },
      text: "search query text",
      n_results: 2
    });
    const result = await node.process();
    expect(result.ids).toBeDefined();
    expect(result.scores).toBeDefined();
    expect(mockCollection.query).toHaveBeenCalledTimes(2);
  });

  it("only performs semantic search when no keywords pass min length", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "c" },
      text: "ab cd",
      n_results: 2,
      min_keyword_length: 5
    });
    await node.process();
    expect(mockCollection.query).toHaveBeenCalledTimes(1);
  });

  it("wraps single keyword filter under $document.$contains", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "c" },
      text: "longword ab",
      n_results: 2,
      min_keyword_length: 3
    });
    await node.process();
    expect(mockCollection.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter: { $document: { $contains: "longword" } }
      })
    );
  });

  it("wraps multiple keywords as $document.$or", async () => {
    const node = new HybridSearchNode();
    node.assign({
      collection: { name: "c" },
      text: "hello world test",
      n_results: 2,
      min_keyword_length: 3
    });
    await node.process();
    expect(mockCollection.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter: {
          $document: {
            $or: [
              { $contains: "hello" },
              { $contains: "world" },
              { $contains: "test" }
            ]
          }
        }
      })
    );
  });

  it("reciprocal rank fusion ranks shared ids highest", async () => {
    mockCollection.query
      .mockResolvedValueOnce([
        { id: "id1", document: "doc1", metadata: {}, uri: null, distance: 0.1 },
        { id: "id2", document: "doc2", metadata: {}, uri: null, distance: 0.2 }
      ])
      .mockResolvedValueOnce([
        { id: "id2", document: "doc2", metadata: {}, uri: null, distance: 0.3 },
        { id: "id3", document: "doc3", metadata: {}, uri: null, distance: 0.4 }
      ]);

    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "test query", n_results: 10 });
    const result = (await node.process()) as { ids: string[] };
    expect(result.ids[0]).toBe("id2");
    expect(result.ids).toEqual(expect.arrayContaining(["id1", "id2", "id3"]));
  });

  it("limits results to n_results", async () => {
    mockCollection.query.mockResolvedValue([
      { id: "a", document: "da", metadata: {}, uri: null, distance: 0.1 },
      { id: "b", document: "db", metadata: {}, uri: null, distance: 0.2 },
      { id: "c", document: "dc", metadata: {}, uri: null, distance: 0.3 }
    ]);

    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "test query", n_results: 2 });
    const result = (await node.process()) as { ids: string[] };
    expect(result.ids).toHaveLength(2);
  });

  it("uses topK = nResults * 2 for internal queries", async () => {
    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "test query", n_results: 3 });
    await node.process();
    expect(mockCollection.query).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 6 })
    );
  });

  it("throws on empty search text", async () => {
    const node = new HybridSearchNode();
    node.assign({ collection: { name: "c" }, text: "" });
    await expect(node.process()).rejects.toThrow("Search text cannot be empty");
  });
});
