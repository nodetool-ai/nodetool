/**
 * Regression tests for vector node bugs:
 *  - QueryText/QueryImage wrapped their results in a single `output` key,
 *    so the declared `ids`/`documents`/`metadatas`/`distances` handles never
 *    routed anything downstream.
 *  - GetDocuments passed `ids: []` (dead ternary) with a comment claiming
 *    empty ids return nothing, while the provider treats it as "no filter".
 *  - IndexEmbedding could not extract data from objects keyed by `value`,
 *    the very shape its own prop default declares.
 *  - Collection emitted a ref without its `type` tag.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const query = vi.fn();
  const get = vi.fn();
  const upsert = vi.fn();
  const count = vi.fn();
  const collection = {
    query,
    get,
    upsert,
    count,
    metadata: { embedding_model: "test-model" }
  };
  return {
    query,
    get,
    upsert,
    count,
    collection,
    getCollection: vi.fn(async () => collection),
    getOrCreateCollection: vi.fn(async () => collection)
  };
});

vi.mock("@nodetool-ai/vectorstore", () => ({
  getDefaultVectorProvider: () => ({
    getCollection: h.getCollection,
    getOrCreateCollection: h.getOrCreateCollection
  }),
  OllamaEmbeddingFunction: class {
    async generate(texts: string[]): Promise<number[][]> {
      return texts.map(() => [0.1, 0.2]);
    }
  }
}));

// Import from source (not the package's dist entry) so the vectorstore mock
// above intercepts the import — dist modules are externalized by vitest and
// would load the real provider.
import {
  CollectionNode,
  GetDocumentsNode,
  IndexEmbeddingNode,
  QueryImageNode,
  QueryTextNode
} from "../src/nodes/vector.js";

beforeEach(() => {
  h.query.mockReset();
  h.get.mockReset();
  h.upsert.mockReset();
});

describe("QueryTextNode", () => {
  it("returns results on the declared top-level handles, not wrapped in `output`", async () => {
    h.query.mockResolvedValue([
      { id: "b", document: "doc-b", metadata: { k: 1 }, distance: 0.2 },
      { id: "a", document: "doc-a", metadata: { k: 2 }, distance: 0.1 }
    ]);
    const node = new QueryTextNode();
    node.assign({ collection: { name: "c" }, text: "hello", n_results: 2 });

    const out = await node.process();
    expect(out).not.toHaveProperty("output");
    expect(out.ids).toEqual(["a", "b"]);
    expect(out.documents).toEqual(["doc-a", "doc-b"]);
    expect(out.metadatas).toEqual([{ k: 2 }, { k: 1 }]);
    expect(out.distances).toEqual([0.1, 0.2]);
  });
});

describe("QueryImageNode", () => {
  it("returns results on the declared top-level handles, not wrapped in `output`", async () => {
    h.query.mockResolvedValue([
      { id: "x", document: "img", metadata: {}, distance: 0.5 }
    ]);
    const node = new QueryImageNode();
    node.assign({
      collection: { name: "c" },
      image: { type: "image", uri: "file:///img.png" }
    });

    const out = await node.process();
    expect(out).not.toHaveProperty("output");
    expect(out.ids).toEqual(["x"]);
    expect(out.distances).toEqual([0.5]);
  });
});

describe("GetDocumentsNode", () => {
  it("treats empty ids as no filter so limit/offset listing works", async () => {
    h.get.mockResolvedValue([
      { id: "1", document: "d1", uri: null, metadata: {} }
    ]);
    const node = new GetDocumentsNode();
    node.assign({ collection: { name: "c" }, ids: [], limit: 10, offset: 0 });

    const out = await node.process();
    expect(h.get).toHaveBeenCalledWith({ ids: undefined, limit: 10, offset: 0 });
    expect(out).toEqual({ output: ["d1"] });
  });

  it("passes explicit ids through", async () => {
    h.get.mockResolvedValue([]);
    const node = new GetDocumentsNode();
    node.assign({ collection: { name: "c" }, ids: ["a", "b"] });

    await node.process();
    expect(h.get).toHaveBeenCalledWith({
      ids: ["a", "b"],
      limit: 100,
      offset: 0
    });
  });
});

describe("IndexEmbeddingNode", () => {
  it("extracts embedding data from objects keyed by `value`", async () => {
    h.upsert.mockResolvedValue(undefined);
    const node = new IndexEmbeddingNode();
    node.assign({
      collection: { name: "c" },
      embedding: { type: "list", value: [0.1, 0.2, 0.3] },
      index_id: "doc-1"
    });

    await node.process();
    expect(h.upsert).toHaveBeenCalledWith([
      { id: "doc-1", embedding: [0.1, 0.2, 0.3], metadata: {} }
    ]);
  });
});

describe("CollectionNode", () => {
  it("returns a typed collection ref", async () => {
    const node = new CollectionNode();
    node.assign({ name: "my-collection" });

    const out = await node.process();
    expect(out).toEqual({
      output: { type: "collection", name: "my-collection" }
    });
  });
});
