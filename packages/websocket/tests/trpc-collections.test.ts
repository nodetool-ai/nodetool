import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CollectionMetadata } from "@nodetool/protocol/api-schemas/collections.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool/vectorstore — tests exercise the router's orchestration of
// store / collection handle calls, not the vector store itself.
vi.mock("@nodetool/vectorstore", async (orig) => {
  const actual = await orig<typeof import("@nodetool/vectorstore")>();
  return {
    ...actual,
    getVecStore: vi.fn(),
    VecNotFoundError: actual.VecNotFoundError
  };
});

// Mock @nodetool/models Workflow.get so list/workflow_name resolution is
// deterministic and doesn't hit the DB.
vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      get: vi.fn()
    }
  };
});

import { getVecStore, VecNotFoundError } from "@nodetool/vectorstore";
import { Workflow } from "@nodetool/models";

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

/** Build a collection handle stub with the methods exercised by the router. */
function makeCollection(opts: {
  name: string;
  metadata?: CollectionMetadata;
  count?: number;
  queryResult?: {
    ids: string[][];
    documents: (string | null)[][];
    metadatas: (Record<string, unknown> | null)[][];
    distances: number[][];
  };
}) {
  return {
    name: opts.name,
    metadata: opts.metadata ?? {},
    count: vi.fn().mockResolvedValue(opts.count ?? 0),
    query: vi.fn().mockResolvedValue(
      opts.queryResult ?? {
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]]
      }
    ),
    modify: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined)
  };
}

describe("collections router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns all collections with counts and resolved workflow_name", async () => {
      const col1 = makeCollection({
        name: "col1",
        metadata: { workflow: "wf-123" },
        count: 5
      });
      const col2 = makeCollection({ name: "col2", metadata: {}, count: 0 });
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        listCollections: vi.fn().mockResolvedValue([col1, col2])
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        name: "My Workflow"
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.list();

      expect(result.count).toBe(2);
      expect(result.collections).toHaveLength(2);
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

    it("handles workflow lookup failures gracefully (workflow_name: null)", async () => {
      const col = makeCollection({
        name: "col",
        metadata: { workflow: "missing" }
      });
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        listCollections: vi.fn().mockResolvedValue([col])
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("not found")
      );

      const caller = createCaller(makeCtx());
      const result = await caller.collections.list();
      expect(result.collections[0]?.workflow_name).toBeNull();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.collections.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns collection details", async () => {
      const col = makeCollection({
        name: "my-col",
        metadata: { embedding_model: "text-embedding-3-small" },
        count: 42
      });
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
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
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        getCollection: vi
          .fn()
          .mockRejectedValue(new VecNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.get({ name: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.collections.get({ name: "x" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── create ──────────────────────────────────────────────────────
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
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        createCollection
      });

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

    it("creates a collection with empty metadata when no embedding provided", async () => {
      const col = makeCollection({ name: "bare", metadata: {} });
      const createCollection = vi.fn().mockResolvedValue(col);
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        createCollection
      });

      const caller = createCaller(makeCtx());
      await caller.collections.create({ name: "bare" });
      expect(createCollection).toHaveBeenCalledWith({
        name: "bare",
        metadata: {}
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.collections.create({ name: "x" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── update ──────────────────────────────────────────────────────
  describe("update", () => {
    it("renames a collection when `rename` is provided", async () => {
      const col = makeCollection({
        name: "old-name",
        metadata: { foo: "bar" },
        count: 3
      });
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
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
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.update({
        name: "col",
        metadata: { b: "updated", c: "3" }
      });

      expect(col.modify).toHaveBeenCalledWith({
        name: "col", // unchanged
        metadata: { a: "1", b: "updated", c: "3" }
      });
      expect(result.metadata).toEqual({ a: "1", b: "updated", c: "3" });
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        getCollection: vi
          .fn()
          .mockRejectedValue(new VecNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.update({ name: "missing", rename: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.collections.update({ name: "x" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── delete ──────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes a collection and returns a confirmation message", async () => {
      const deleteCollection = vi.fn().mockResolvedValue(undefined);
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        deleteCollection
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.delete({ name: "doomed" });

      expect(deleteCollection).toHaveBeenCalledWith({ name: "doomed" });
      expect(result.message).toContain("doomed");
      expect(result.message).toMatch(/deleted/i);
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        deleteCollection: vi
          .fn()
          .mockRejectedValue(new VecNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.delete({ name: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.collections.delete({ name: "x" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── query ───────────────────────────────────────────────────────
  describe("query", () => {
    it("performs a query and returns the QueryResult shape", async () => {
      const col = makeCollection({
        name: "col",
        queryResult: {
          ids: [["doc1", "doc2"]],
          documents: [["content 1", "content 2"]],
          metadatas: [[{ source: "a.txt" }, { source: "b.txt" }]],
          distances: [[0.1, 0.2]]
        }
      });
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.query({
        name: "col",
        query_texts: ["search me"],
        n_results: 5
      });

      expect(col.query).toHaveBeenCalledWith({
        queryTexts: ["search me"],
        nResults: 5
      });
      expect(result.ids).toEqual([["doc1", "doc2"]]);
      expect(result.distances).toEqual([[0.1, 0.2]]);
    });

    it("defaults n_results to 10", async () => {
      const col = makeCollection({ name: "col" });
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      const caller = createCaller(makeCtx());
      await caller.collections.query({
        name: "col",
        query_texts: ["hi"]
      });
      expect(col.query).toHaveBeenCalledWith({
        queryTexts: ["hi"],
        nResults: 10
      });
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      (getVecStore as ReturnType<typeof vi.fn>).mockResolvedValue({
        getCollection: vi
          .fn()
          .mockRejectedValue(new VecNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.query({
          name: "missing",
          query_texts: ["x"]
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.collections.query({
          name: "x",
          query_texts: ["y"]
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
