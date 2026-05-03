import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CollectionMetadata } from "@nodetool-ai/protocol/api-schemas/collections.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/vectorstore", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/vectorstore")>();
  return {
    ...actual,
    getDefaultVectorProvider: vi.fn(),
    CollectionNotFoundError: actual.CollectionNotFoundError
  };
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workflow: { ...actual.Workflow, get: vi.fn() }
  };
});

import {
  getDefaultVectorProvider,
  CollectionNotFoundError,
  type VectorMatch
} from "@nodetool-ai/vectorstore";
import { Workflow } from "@nodetool-ai/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

function makeCollection(opts: {
  name: string;
  metadata?: CollectionMetadata;
  count?: number;
  queryResult?: VectorMatch[];
}) {
  return {
    name: opts.name,
    metadata: opts.metadata ?? {},
    count: vi.fn().mockResolvedValue(opts.count ?? 0),
    query: vi.fn().mockResolvedValue(opts.queryResult ?? []),
    modify: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue([])
  };
}

const mockedProvider = getDefaultVectorProvider as unknown as ReturnType<typeof vi.fn>;

describe("collections router", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe("list", () => {
    it("returns all collections with counts and resolved workflow_name", async () => {
      const col1 = makeCollection({
        name: "col1",
        metadata: { workflow: "wf-123" },
        count: 5
      });
      const col2 = makeCollection({ name: "col2", metadata: {}, count: 0 });
      const getCollection = vi.fn(async ({ name }: { name: string }) =>
        name === "col1" ? col1 : col2
      );
      mockedProvider.mockReturnValue({
        listCollections: vi.fn().mockResolvedValue([
          { name: "col1", metadata: { workflow: "wf-123" } },
          { name: "col2", metadata: {} }
        ]),
        getCollection
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        name: "My Workflow"
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.list();

      expect(result.count).toBe(2);
      expect(result.collections[0]).toEqual({
        name: "col1",
        count: 5,
        metadata: { workflow: "wf-123" },
        workflow_name: "My Workflow"
      });
      expect(result.collections[1]).toEqual({
        name: "col2",
        count: 0,
        metadata: {},
        workflow_name: null
      });
      expect(Workflow.get).toHaveBeenCalledWith("wf-123");
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.collections.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  describe("get", () => {
    it("returns collection details", async () => {
      const col = makeCollection({
        name: "my-col",
        metadata: { embedding_model: "text-embedding-3-small" },
        count: 42
      });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.get({ name: "my-col" });
      expect(result).toEqual({
        name: "my-col",
        metadata: { embedding_model: "text-embedding-3-small" },
        count: 42
      });
    });

    it("throws NOT_FOUND when the collection does not exist", async () => {
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockRejectedValue(new CollectionNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.get({ name: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("create", () => {
    it("creates a collection with embedding metadata", async () => {
      const col = makeCollection({
        name: "new-col",
        metadata: {
          embedding_model: "text-embedding-3-small",
          embedding_provider: "openai"
        }
      });
      const createCollection = vi.fn().mockResolvedValue(col);
      mockedProvider.mockReturnValue({ createCollection });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.create({
        name: "new-col",
        embedding_model: "text-embedding-3-small",
        embedding_provider: "openai"
      });

      expect(createCollection).toHaveBeenCalledWith({
        name: "new-col",
        metadata: {
          embedding_model: "text-embedding-3-small",
          embedding_provider: "openai"
        }
      });
      expect(result).toEqual({
        name: "new-col",
        metadata: {
          embedding_model: "text-embedding-3-small",
          embedding_provider: "openai"
        },
        count: 0
      });
    });

    it("creates with empty metadata when no embedding provided", async () => {
      const col = makeCollection({ name: "bare", metadata: {} });
      const createCollection = vi.fn().mockResolvedValue(col);
      mockedProvider.mockReturnValue({ createCollection });

      const caller = createCaller(makeCtx());
      await caller.collections.create({ name: "bare" });
      expect(createCollection).toHaveBeenCalledWith({
        name: "bare",
        metadata: {}
      });
    });
  });

  describe("update", () => {
    it("renames a collection when `rename` is provided", async () => {
      const col = makeCollection({
        name: "old-name",
        metadata: { foo: "bar" },
        count: 3
      });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.update({
        name: "old-name",
        rename: "new-name"
      });

      expect(col.modify).toHaveBeenCalledWith({
        name: "new-name",
        metadata: { foo: "bar" }
      });
      expect(result).toEqual({
        name: "new-name",
        metadata: { foo: "bar" },
        count: 3
      });
    });

    it("merges metadata with existing values", async () => {
      const col = makeCollection({
        name: "col",
        metadata: { a: "1", b: "2" }
      });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.update({
        name: "col",
        metadata: { b: "updated", c: "3" }
      });

      expect(col.modify).toHaveBeenCalledWith({
        name: "col",
        metadata: { a: "1", b: "updated", c: "3" }
      });
      expect(result.metadata).toEqual({ a: "1", b: "updated", c: "3" });
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockRejectedValue(new CollectionNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.update({ name: "missing", rename: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("delete", () => {
    it("deletes a collection and returns confirmation", async () => {
      const deleteCollection = vi.fn().mockResolvedValue(undefined);
      mockedProvider.mockReturnValue({ deleteCollection });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.delete({ name: "doomed" });

      expect(deleteCollection).toHaveBeenCalledWith("doomed");
      expect(result.message).toContain("doomed");
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      mockedProvider.mockReturnValue({
        deleteCollection: vi.fn().mockRejectedValue(new CollectionNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.delete({ name: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("query", () => {
    it("performs a query and assembles the wire shape", async () => {
      const col = makeCollection({
        name: "col",
        queryResult: [
          { id: "doc1", document: "content 1", metadata: { source: "a.txt" }, uri: null, distance: 0.1 },
          { id: "doc2", document: "content 2", metadata: { source: "b.txt" }, uri: null, distance: 0.2 }
        ]
      });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.query({
        name: "col",
        query_texts: ["search me"],
        n_results: 5
      });

      expect(col.query).toHaveBeenCalledWith({ text: "search me", topK: 5 });
      expect(result.ids).toEqual([["doc1", "doc2"]]);
      expect(result.documents).toEqual([["content 1", "content 2"]]);
      expect(result.distances).toEqual([[0.1, 0.2]]);
    });

    it("defaults n_results to 10", async () => {
      const col = makeCollection({ name: "col" });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      await caller.collections.query({ name: "col", query_texts: ["hi"] });
      expect(col.query).toHaveBeenCalledWith({ text: "hi", topK: 10 });
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockRejectedValue(new CollectionNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.query({ name: "missing", query_texts: ["x"] })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
