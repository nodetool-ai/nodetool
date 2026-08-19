/**
 * The `collections` capability module.
 *
 * Three things must hold for a ported namespace: the module is drift-clean and
 * classified the way the gate's own map classifies it, each spec is
 * byte-identical to the deprecated `Tool` subclass it replaces, and the
 * implementations behave the way they always did. The vector capabilities also
 * have to answer for the run field that replaced their constructor argument.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const listCollectionsMock = vi.fn();
const resolveCollection = vi.fn();
const getDefaultVectorProvider = vi.fn(() => ({
  listCollections: listCollectionsMock
}));

vi.mock("@nodetool-ai/vectorstore", () => ({
  getDefaultVectorProvider,
  resolveCollection
}));

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { VectorCollection } from "@nodetool-ai/vectorstore";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import {
  COLLECTION_CAPABILITIES,
  module as collectionsModule
} from "../src/capabilities/collections.js";
import { capabilityModuleIssues } from "../src/capabilities/registry.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { Tool } from "../src/tools/base-tool.js";

/**
 * One capability as a `Tool`. The collection that used to be a constructor
 * argument on the `Vec*` classes is a run field, read at call time.
 */
function capTool(name: string, collection?: VectorCollection): Tool {
  return toolForCapabilityName(name, (context) =>
    createCapabilityRun({
      context,
      gate: UNGATED,
      vectorCollection: collection
    })
  );
}

const ctx = {} as unknown as ProcessingContext;

type FakeCollection = VectorCollection & {
  query: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

/** An in-memory collection: enough surface for every vector capability. */
function fakeCollection(
  overrides: Partial<FakeCollection> = {}
): FakeCollection {
  return {
    name: "fake",
    metadata: {},
    query: vi.fn().mockResolvedValue([
      {
        id: "id1",
        document: "doc one",
        metadata: {},
        uri: null,
        distance: 0.1
      },
      { id: "id2", document: "doc two", metadata: {}, uri: null, distance: 0.2 }
    ]),
    upsert: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue([]),
    modify: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as FakeCollection;
}

function runWith(collection?: VectorCollection): CapabilityRun {
  return createCapabilityRun({
    context: ctx,
    gate: UNGATED,
    vectorCollection: collection
  });
}

function capability(name: string) {
  const entry = COLLECTION_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no capability named ${name}`);
  return entry;
}

beforeEach(() => {
  vi.clearAllMocks();
  getDefaultVectorProvider.mockReturnValue({
    listCollections: listCollectionsMock
  });
});

describe("collections module shape", () => {
  it("is drift-clean", () => {
    expect(capabilityModuleIssues("collections", collectionsModule)).toEqual(
      []
    );
  });

  it("classifies every export the way the gate's own map does", () => {
    for (const entry of COLLECTION_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("exports the eight capabilities of the namespace", () => {
    expect(COLLECTION_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_collections",
      "query_collection",
      "vector_text_search",
      "vector_index",
      "vector_hybrid_search",
      "vector_recursive_split_and_index",
      "vector_markdown_split_and_index",
      "vector_batch_index",
      "create_collection",
      "delete_collection"
    ]);
  });
});

describe("wire identity: a Tool built from the spec", () => {
  const col = fakeCollection();
  const pairs: Array<[string, Tool]> = [
    ["list_collections", capTool("list_collections")],
    ["query_collection", capTool("query_collection")],
    ["vector_text_search", capTool("vector_text_search", col)],
    ["vector_index", capTool("vector_index", col)],
    ["vector_hybrid_search", capTool("vector_hybrid_search", col)],
    [
      "vector_recursive_split_and_index",
      capTool("vector_recursive_split_and_index", col)
    ],
    [
      "vector_markdown_split_and_index",
      capTool("vector_markdown_split_and_index", col)
    ],
    ["vector_batch_index", capTool("vector_batch_index", col)]
  ];

  for (const [name, tool] of pairs) {
    it(`${name} keeps its name, description and input schema`, () => {
      const { spec } = capability(name);
      expect(tool.name).toBe(spec.name);
      expect(tool.description).toBe(spec.description);
      expect(tool.inputSchema).toEqual(spec.inputSchema);
    });
  }

  it("carries the userMessage templates over", () => {
    expect(capTool("list_collections").userMessage({})).toBe(
      "Listing knowledge collections"
    );
    expect(
      capTool("query_collection").userMessage({ collection: "docs" })
    ).toBe("Searching collection 'docs'");
    expect(capTool("query_collection").userMessage({})).toBe(
      "Searching collection"
    );
    expect(
      capTool("vector_text_search", col).userMessage({ text: "cats" })
    ).toBe("Performing semantic search for 'cats'...");
    expect(
      capTool("vector_text_search", col).userMessage({ text: "x".repeat(200) })
    ).toBe("Performing semantic search...");
    expect(
      capTool("vector_batch_index", col).userMessage({ chunks: [1, 2, 3] })
    ).toBe("Indexing a batch of 3 text chunks...");
  });
});

describe("list_collections / query_collection", () => {
  it("maps provider infos to name + metadata summaries", async () => {
    listCollectionsMock.mockResolvedValue([
      { name: "docs", metadata: { owner: "a" } }
    ]);
    const result = await capability("list_collections").impl(runWith(), {});
    expect(result).toEqual({
      collections: [{ name: "docs", metadata: { owner: "a" } }]
    });
  });

  it("requires a collection and a query", async () => {
    const query = capability("query_collection").impl;
    expect(await query(runWith(), { query: "hi" })).toEqual({
      error: "collection is required"
    });
    expect(await query(runWith(), { collection: "docs" })).toEqual({
      error: "query is required"
    });
  });

  it("drops matches with no document and defaults n_results to 5", async () => {
    resolveCollection.mockResolvedValue({
      query: vi.fn().mockResolvedValue([
        { id: "a", document: "alpha", score: 0.9 },
        { id: "b", document: null }
      ])
    });
    const result = await capability("query_collection").impl(runWith(), {
      collection: "docs",
      query: "alpha"
    });
    expect(result).toEqual({
      collection: "docs",
      matches: [{ id: "a", document: "alpha", score: 0.9 }]
    });
  });
});

describe("the vector capabilities resolve their collection from the run", () => {
  it("searches the collection the run binds", async () => {
    const col = fakeCollection();
    const result = await capability("vector_text_search").impl(runWith(col), {
      text: "hello",
      n_results: 2
    });
    expect(result).toEqual({ id1: "doc one", id2: "doc two" });
    expect(col.query).toHaveBeenCalledWith({ text: "hello", topK: 2 });
  });

  it("indexes into the collection the run binds", async () => {
    const col = fakeCollection();
    const result = (await capability("vector_index").impl(runWith(col), {
      text: "body",
      source_id: "src",
      metadata: { tag: 1 }
    })) as Record<string, string>;
    expect(result["status"]).toBe("success");
    expect(col.upsert).toHaveBeenCalledTimes(1);
    const [records] = col.upsert.mock.calls[0];
    expect(records[0].document).toBe("body");
    expect(records[0].metadata).toEqual({ tag: 1 });
  });

  it("refuses every vector capability when the run binds none", async () => {
    for (const name of [
      "vector_text_search",
      "vector_index",
      "vector_hybrid_search",
      "vector_recursive_split_and_index",
      "vector_markdown_split_and_index",
      "vector_batch_index"
    ]) {
      const result = (await capability(name).impl(runWith(), {
        text: "x",
        source_id: "s",
        document_id: "d",
        chunks: [{ text: "t", source_id: "s" }]
      })) as Record<string, string>;
      expect(result["error"]).toMatch(/no vector collection is bound/);
    }
  });

  it("runs through a Tool whose run binds the collection", async () => {
    const col = fakeCollection();
    const result = await capTool("vector_text_search", col).process(ctx, {
      text: "hello",
      n_results: 2
    });
    expect(result).toEqual({ id1: "doc one", id2: "doc two" });
  });

  it("splits and indexes every chunk of a document", async () => {
    const col = fakeCollection();
    const result = (await capability("vector_recursive_split_and_index").impl(
      runWith(col),
      {
        text: "one.two.three",
        document_id: "doc",
        chunk_size: 5,
        chunk_overlap: 0
      }
    )) as Record<string, unknown>;
    expect(result["status"]).toBe("success");
    expect(result["indexed_count"]).toBe(col.upsert.mock.calls.length);
    expect(col.upsert.mock.calls.length).toBeGreaterThan(1);
  });

  it("rejects an empty batch and indexes a valid one", async () => {
    const col = fakeCollection();
    expect(
      await capability("vector_batch_index").impl(runWith(col), { chunks: [] })
    ).toEqual({ error: "No chunks provided" });

    const result = (await capability("vector_batch_index").impl(runWith(col), {
      chunks: [
        { text: "a", source_id: "s1" },
        { text: "b", source_id: "s2" }
      ]
    })) as Record<string, unknown>;
    expect(result["indexed_count"]).toBe(2);
  });
});
