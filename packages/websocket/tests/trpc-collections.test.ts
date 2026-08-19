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
          owner_user_id: "user-1",
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
        metadata: { owner_user_id: "user-1" }
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
        getCollection: vi.fn(async ({ name }: { name: string }) => {
          if (name === "old-name") return col;
          throw new CollectionNotFoundError(name);
        })
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
      mockedProvider.mockReturnValue({
        deleteCollection,
        getCollection: vi
          .fn()
          .mockResolvedValue(makeCollection({ name: "doomed" }))
      });

      const caller = createCaller(makeCtx());
      const result = await caller.collections.delete({ name: "doomed" });

      expect(deleteCollection).toHaveBeenCalledWith("doomed");
      expect(result.message).toContain("doomed");
    });

    it("throws NOT_FOUND when the collection is missing", async () => {
      mockedProvider.mockReturnValue({
        deleteCollection: vi.fn().mockResolvedValue(undefined),
        getCollection: vi
          .fn()
          .mockRejectedValue(new CollectionNotFoundError("missing"))
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.collections.delete({ name: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
  // ── Ownership isolation ───────────────────────────────────────────
  // Collections live in one global namespace in every provider, so these
  // rules are the only thing separating tenants. See @nodetool-ai/vectorstore collection-access.ts.
  describe("ownership", () => {
    /** A provider whose single collection belongs to someone else. */
    function providerOwnedBy(owner: string, name = "theirs") {
      const col = makeCollection({
        name,
        metadata: { owner_user_id: owner, secret: "value" },
        count: 42
      });
      const deleteCollection = vi.fn().mockResolvedValue(undefined);
      mockedProvider.mockReturnValue({
        listCollections: vi
          .fn()
          .mockResolvedValue([{ name, metadata: { owner_user_id: owner } }]),
        getCollection: vi.fn().mockResolvedValue(col),
        deleteCollection
      });
      return { col, deleteCollection };
    }

    it("omits another user's collection from the listing", async () => {
      providerOwnedBy("user-2");
      const result = await createCaller(makeCtx()).collections.list();
      expect(result.collections).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("still lists the caller's own collections", async () => {
      providerOwnedBy("user-1", "mine");
      const result = await createCaller(makeCtx()).collections.list();
      expect(result.collections.map((c) => c.name)).toEqual(["mine"]);
    });

    it("still lists unowned legacy collections", async () => {
      const col = makeCollection({ name: "legacy", metadata: {} });
      mockedProvider.mockReturnValue({
        listCollections: vi
          .fn()
          .mockResolvedValue([{ name: "legacy", metadata: {} }]),
        getCollection: vi.fn().mockResolvedValue(col)
      });
      const result = await createCaller(makeCtx()).collections.list();
      expect(result.collections.map((c) => c.name)).toEqual(["legacy"]);
    });

    it("answers NOT_FOUND — not FORBIDDEN — when updating another user's collection", async () => {
      // FORBIDDEN would confirm the name exists and let a caller enumerate
      // other users' collections by probing.
      const { col } = providerOwnedBy("user-2");
      await expect(
        createCaller(makeCtx()).collections.update({
          name: "theirs",
          metadata: { a: "1" }
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(col.modify).not.toHaveBeenCalled();
    });

    it("refuses to delete another user's collection", async () => {
      const { deleteCollection } = providerOwnedBy("user-2");
      await expect(
        createCaller(makeCtx()).collections.delete({ name: "theirs" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(deleteCollection).not.toHaveBeenCalled();
    });

    it("ignores a client attempt to rewrite owner_user_id", async () => {
      const col = makeCollection({
        name: "mine",
        metadata: { owner_user_id: "user-1" }
      });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      await createCaller(makeCtx()).collections.update({
        name: "mine",
        metadata: { owner_user_id: "user-2", note: "hi" }
      });

      expect(col.modify).toHaveBeenCalledWith({
        name: "mine",
        metadata: { owner_user_id: "user-1", note: "hi" }
      });
    });

    it("leaves an unowned collection unowned after an update", async () => {
      // Claiming it for the first editor would lock out everyone else who had
      // been sharing it.
      const col = makeCollection({ name: "legacy", metadata: { a: "1" } });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      await createCaller(makeCtx()).collections.update({
        name: "legacy",
        metadata: { b: "2" }
      });

      expect(col.modify).toHaveBeenCalledWith({
        name: "legacy",
        metadata: { a: "1", b: "2" }
      });
    });
  });

  describe("input validation", () => {
    it("rejects a name containing a path separator", async () => {
      mockedProvider.mockReturnValue({ createCollection: vi.fn() });
      await expect(
        createCaller(makeCtx()).collections.create({ name: "a/b" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects an over-long name", async () => {
      mockedProvider.mockReturnValue({ createCollection: vi.fn() });
      await expect(
        createCaller(makeCtx()).collections.create({ name: "x".repeat(129) })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("reports a duplicate name as ALREADY_EXISTS, not a driver error", async () => {
      mockedProvider.mockReturnValue({
        createCollection: vi
          .fn()
          .mockRejectedValue(
            new Error("UNIQUE constraint failed: vec_collections.name")
          ),
        getCollection: vi
          .fn()
          .mockResolvedValue(makeCollection({ name: "dupe" }))
      });

      await expect(
        createCaller(makeCtx()).collections.create({ name: "dupe" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("refuses to rename onto an existing collection", async () => {
      const col = makeCollection({ name: "mine", metadata: {} });
      mockedProvider.mockReturnValue({
        getCollection: vi.fn().mockResolvedValue(col)
      });

      await expect(
        createCaller(makeCtx()).collections.update({
          name: "mine",
          rename: "taken"
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(col.modify).not.toHaveBeenCalled();
    });
  });
});
