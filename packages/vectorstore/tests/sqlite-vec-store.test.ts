import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SqliteVecStore,
  VecNotFoundError,
  getDefaultStore,
  resetDefaultStore
} from "../src/sqlite-vec-store.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

let store: SqliteVecStore;
let dbPath: string;

function freshDb(): SqliteVecStore {
  dbPath = join(
    tmpdir(),
    `vec-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  return new SqliteVecStore(dbPath);
}

function cleanup() {
  try {
    store.close();
  } catch {}
  try {
    unlinkSync(dbPath);
  } catch {}
  try {
    unlinkSync(dbPath + "-wal");
  } catch {}
  try {
    unlinkSync(dbPath + "-shm");
  } catch {}
}

describe("SqliteVecStore", () => {
  beforeEach(() => {
    store = freshDb();
  });
  afterEach(cleanup);

  // ── Collection CRUD ────────────────────────────────────────────

  describe("collection management", () => {
    it("creates and lists collections", async () => {
      await store.createCollection({ name: "col-a", metadata: { foo: "bar" } });
      await store.createCollection({ name: "col-b" });

      const cols = await store.listCollections();
      expect(cols).toHaveLength(2);
      expect(cols.map((c) => c.name).sort()).toEqual(["col-a", "col-b"]);
      expect(cols.find((c) => c.name === "col-a")!.metadata.foo).toBe("bar");
    });

    it("getCollection returns existing collection", async () => {
      await store.createCollection({ name: "exists" });
      const col = await store.getCollection({ name: "exists" });
      expect(col.name).toBe("exists");
    });

    it("getCollection throws VecNotFoundError for missing", async () => {
      await expect(store.getCollection({ name: "nope" })).rejects.toThrow(
        VecNotFoundError
      );
    });

    it("getOrCreateCollection creates if missing", async () => {
      const col = await store.getOrCreateCollection({ name: "auto" });
      expect(col.name).toBe("auto");
      const count = await col.count();
      expect(count).toBe(0);
    });

    it("getOrCreateCollection returns existing if present", async () => {
      await store.createCollection({ name: "dup", metadata: { v: "1" } });
      const col = await store.getOrCreateCollection({
        name: "dup",
        metadata: { v: "2" }
      });
      expect(col.metadata.v).toBe("1"); // original metadata preserved
    });

    it("deleteCollection removes collection and data", async () => {
      const col = await store.createCollection({ name: "del-me" });
      await col.add({ ids: ["d1"], documents: ["hello"] });
      await store.deleteCollection({ name: "del-me" });

      const cols = await store.listCollections();
      expect(cols).toHaveLength(0);
      await expect(store.getCollection({ name: "del-me" })).rejects.toThrow(
        VecNotFoundError
      );
    });

    it("deleteCollection throws for missing collection", async () => {
      await expect(store.deleteCollection({ name: "ghost" })).rejects.toThrow(
        VecNotFoundError
      );
    });
  });

  // ── Document operations ────────────────────────────────────────

  describe("document add/get/delete", () => {
    it("adds and retrieves documents", async () => {
      const col = await store.createCollection({ name: "docs" });
      await col.add({
        ids: ["a", "b"],
        documents: ["hello", "world"],
        metadatas: [{ k: "v1" }, { k: "v2" }]
      });

      expect(await col.count()).toBe(2);

      const result = await col.get();
      expect(result.ids).toEqual(["a", "b"]);
      expect(result.documents).toEqual(["hello", "world"]);
      expect(result.metadatas[0]).toEqual({ k: "v1" });
    });

    it("get with ids filter", async () => {
      const col = await store.createCollection({ name: "filter" });
      await col.add({ ids: ["x", "y", "z"], documents: ["a", "b", "c"] });

      const result = await col.get({ ids: ["y"] });
      expect(result.ids).toEqual(["y"]);
      expect(result.documents).toEqual(["b"]);
    });

    it("get with limit and offset", async () => {
      const col = await store.createCollection({ name: "paged" });
      await col.add({
        ids: ["1", "2", "3", "4"],
        documents: ["a", "b", "c", "d"]
      });

      const page1 = await col.get({ limit: 2 });
      expect(page1.ids).toEqual(["1", "2"]);

      const page2 = await col.get({ limit: 2, offset: 2 });
      expect(page2.ids).toEqual(["3", "4"]);
    });

    it("peek returns first N documents", async () => {
      const col = await store.createCollection({ name: "peek" });
      await col.add({ ids: ["a", "b", "c"], documents: ["1", "2", "3"] });

      const result = await col.peek({ limit: 2 });
      expect(result.ids).toEqual(["a", "b"]);
    });

    it("delete removes documents", async () => {
      const col = await store.createCollection({ name: "del" });
      await col.add({ ids: ["a", "b", "c"], documents: ["1", "2", "3"] });

      await col.delete({ ids: ["b"] });
      expect(await col.count()).toBe(2);

      const result = await col.get();
      expect(result.ids).toEqual(["a", "c"]);
    });

    it("upsert replaces existing documents", async () => {
      const col = await store.createCollection({ name: "upsert" });
      await col.add({
        ids: ["a"],
        documents: ["original"],
        embeddings: [[1, 0, 0]]
      });

      await col.upsert({
        ids: ["a"],
        documents: ["updated"],
        embeddings: [[0, 1, 0]]
      });

      expect(await col.count()).toBe(1);
      const result = await col.get({ ids: ["a"] });
      expect(result.documents[0]).toBe("updated");
    });

    it("add with URIs", async () => {
      const col = await store.createCollection({ name: "uris" });
      await col.add({
        ids: ["img1"],
        uris: ["file:///tmp/test.png"],
        metadatas: [{ type: "image" }]
      });

      const result = await col.get({ ids: ["img1"] });
      expect(result.ids).toEqual(["img1"]);
      expect(result.metadatas[0]).toEqual({ type: "image" });
    });
  });

  // ── Vector search ─────────────────────────────────────────────

  describe("vector query", () => {
    it("returns nearest neighbors by embedding", async () => {
      const col = await store.createCollection({ name: "vec" });
      await col.add({
        ids: ["north", "east", "up"],
        documents: ["go north", "go east", "go up"],
        embeddings: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ]
      });

      const result = await col.query({
        queryEmbeddings: [[0.9, 0.1, 0]],
        nResults: 2
      });

      expect(result.ids[0]).toHaveLength(2);
      // "north" [1,0,0] should be closest to [0.9,0.1,0]
      expect(result.ids[0][0]).toBe("north");
      expect(result.distances[0][0]).toBeLessThan(result.distances[0][1]);
    });

    it("returns empty when no embeddings stored", async () => {
      const col = await store.createCollection({ name: "empty-vec" });
      await col.add({ ids: ["a"], documents: ["text only"] });

      const result = await col.query({
        queryEmbeddings: [[1, 0, 0]],
        nResults: 5
      });
      expect(result.ids[0]).toEqual([]);
    });

    it("returns documents and metadata with results", async () => {
      const col = await store.createCollection({ name: "meta-vec" });
      await col.add({
        ids: ["d1"],
        documents: ["the document"],
        embeddings: [[1, 0]],
        metadatas: [{ source: "test" }]
      });

      const result = await col.query({
        queryEmbeddings: [[1, 0]],
        nResults: 1
      });
      expect(result.documents[0][0]).toBe("the document");
      expect(result.metadatas[0][0]).toEqual({ source: "test" });
    });

    it("handles multiple query vectors", async () => {
      const col = await store.createCollection({ name: "multi-q" });
      await col.add({
        ids: ["a", "b"],
        documents: ["alpha", "beta"],
        embeddings: [
          [1, 0],
          [0, 1]
        ]
      });

      const result = await col.query({
        queryEmbeddings: [
          [1, 0],
          [0, 1]
        ],
        nResults: 1
      });
      expect(result.ids).toHaveLength(2);
      expect(result.ids[0][0]).toBe("a");
      expect(result.ids[1][0]).toBe("b");
    });
  });

  // ── Keyword search ────────────────────────────────────────────

  describe("keyword search fallback", () => {
    it("searches by keyword when no embedding function", async () => {
      const col = await store.createCollection({ name: "kw" });
      await col.add({
        ids: ["d1", "d2", "d3"],
        documents: [
          "apple pie recipe",
          "banana bread guide",
          "apple sauce tutorial"
        ]
      });

      const result = await col.query({
        queryTexts: ["apple"],
        nResults: 5
      });
      expect(result.ids[0].sort()).toEqual(["d1", "d3"]);
    });

    it("keyword search with whereDocument $contains", async () => {
      const col = await store.createCollection({ name: "kw-filter" });
      await col.add({
        ids: ["d1", "d2"],
        documents: ["apple pie recipe", "apple sauce tutorial"],
        embeddings: [
          [1, 0],
          [0, 1]
        ]
      });

      const result = await col.query({
        queryEmbeddings: [[0.5, 0.5]],
        nResults: 5,
        whereDocument: { $contains: "pie" }
      });
      expect(result.ids[0]).toEqual(["d1"]);
    });

    it("keyword search with whereDocument $or", async () => {
      const col = await store.createCollection({ name: "kw-or" });
      await col.add({
        ids: ["d1", "d2", "d3"],
        documents: ["apple pie", "banana bread", "cherry tart"],
        embeddings: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ]
      });

      const result = await col.query({
        queryEmbeddings: [[0.3, 0.3, 0.3]],
        nResults: 5,
        whereDocument: {
          $or: [{ $contains: "apple" }, { $contains: "cherry" }]
        }
      });
      expect(result.ids[0].sort()).toEqual(["d1", "d3"]);
    });
  });

  // ── URI search ────────────────────────────────────────────────

  describe("URI search", () => {
    it("searches by URI when no embeddings available", async () => {
      const col = await store.createCollection({ name: "uri-search" });
      await col.add({
        ids: ["img1", "img2"],
        uris: ["file:///photos/cat.jpg", "file:///photos/dog.jpg"]
      });

      const result = await col.query({
        queryURIs: ["cat"],
        nResults: 5
      });
      expect(result.ids[0]).toEqual(["img1"]);
    });
  });

  // ── Collection modify ─────────────────────────────────────────

  describe("collection modify", () => {
    it("modifies collection name", async () => {
      await store.createCollection({ name: "old-name" });
      const col = await store.getCollection({ name: "old-name" });
      await col.modify({ name: "new-name" });

      await expect(store.getCollection({ name: "old-name" })).rejects.toThrow(
        VecNotFoundError
      );
      const renamed = await store.getCollection({ name: "new-name" });
      expect(renamed.name).toBe("new-name");
    });

    it("modifies collection metadata", async () => {
      await store.createCollection({ name: "meta-mod", metadata: { a: "1" } });
      const col = await store.getCollection({ name: "meta-mod" });
      await col.modify({ metadata: { a: "2", b: "3" } });

      const updated = await store.getCollection({ name: "meta-mod" });
      expect(updated.metadata).toEqual({ a: "2", b: "3" });
    });
  });

  // ── Embedding function integration ────────────────────────────

  describe("embedding function", () => {
    it("auto-embeds documents via embedding function on add", async () => {
      const mockEf = {
        generate: async (texts: string[]) =>
          texts.map(() => [1, 0, 0] as number[])
      };

      const col = await store.createCollection({
        name: "auto-embed",
        embeddingFunction: mockEf
      });

      await col.add({
        ids: ["d1"],
        documents: ["test document"]
        // No explicit embeddings — should use mockEf
      });

      // The embedding function should have been called, creating a vec0 index
      const result = await col.query({
        queryEmbeddings: [[1, 0, 0]],
        nResults: 1
      });
      expect(result.ids[0]).toEqual(["d1"]);
    });

    it("auto-embeds query texts via embedding function", async () => {
      const mockEf = {
        generate: async (texts: string[]) =>
          texts.map(() => [1, 0, 0] as number[])
      };

      const col = await store.createCollection({
        name: "auto-query",
        embeddingFunction: mockEf
      });

      await col.add({
        ids: ["d1"],
        documents: ["test"],
        embeddings: [[1, 0, 0]]
      });

      // Query by text — embedding function should convert to vector
      const result = await col.query({
        queryTexts: ["anything"],
        nResults: 1
      });
      expect(result.ids[0]).toEqual(["d1"]);
    });
  });

  // ── Delete with vec0 cleanup ──────────────────────────────────

  describe("delete with vector index cleanup", () => {
    it("deleting a doc removes it from vec0 index", async () => {
      const col = await store.createCollection({ name: "del-vec" });
      await col.add({
        ids: ["a", "b"],
        documents: ["alpha", "beta"],
        embeddings: [
          [1, 0],
          [0, 1]
        ]
      });

      await col.delete({ ids: ["a"] });

      const result = await col.query({
        queryEmbeddings: [[1, 0]],
        nResults: 5
      });
      // Only "b" should remain
      expect(result.ids[0]).toEqual(["b"]);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    it("count returns 0 for empty collection", async () => {
      const col = await store.createCollection({ name: "empty-count" });
      expect(await col.count()).toBe(0);
    });

    it("get returns empty result for empty collection", async () => {
      const col = await store.createCollection({ name: "empty-get" });
      const result = await col.get();
      expect(result.ids).toEqual([]);
      expect(result.documents).toEqual([]);
      expect(result.metadatas).toEqual([]);
    });

    it("query with nResults greater than available documents", async () => {
      const col = await store.createCollection({ name: "small-col" });
      await col.add({
        ids: ["a"],
        documents: ["only one"],
        embeddings: [[1, 0]]
      });

      const result = await col.query({
        queryEmbeddings: [[1, 0]],
        nResults: 100
      });
      expect(result.ids[0]).toHaveLength(1);
      expect(result.ids[0][0]).toBe("a");
    });

    it("handles high-dimensional vectors (128-dim)", async () => {
      const dim = 128;
      const makeVec = (hot: number) =>
        Array.from({ length: dim }, (_, i) => (i === hot ? 1 : 0));

      const col = await store.createCollection({ name: "high-dim" });
      await col.add({
        ids: ["v0", "v1", "v2"],
        documents: ["zero", "one", "two"],
        embeddings: [makeVec(0), makeVec(1), makeVec(2)]
      });

      const result = await col.query({
        queryEmbeddings: [makeVec(1)],
        nResults: 1
      });
      expect(result.ids[0][0]).toBe("v1");
    });

    it("handles batch add of many documents", async () => {
      const n = 100;
      const ids = Array.from({ length: n }, (_, i) => `doc-${i}`);
      const documents = ids.map((id) => `Content for ${id}`);
      const embeddings = ids.map((_, i) => [i / n, 1 - i / n]);

      const col = await store.createCollection({ name: "batch" });
      await col.add({ ids, documents, embeddings });

      expect(await col.count()).toBe(n);

      const result = await col.query({
        queryEmbeddings: [[0, 1]],
        nResults: 3
      });
      // doc-0 has embedding [0, 1] — should be first
      expect(result.ids[0][0]).toBe("doc-0");
    });

    it("delete with empty ids list is a no-op", async () => {
      const col = await store.createCollection({ name: "del-empty" });
      await col.add({ ids: ["a"], documents: ["hello"] });
      await col.delete({ ids: [] });
      expect(await col.count()).toBe(1);
    });

    it("keyword search with whereDocument $contains via queryTexts", async () => {
      const col = await store.createCollection({ name: "kw-where-text" });
      await col.add({
        ids: ["d1", "d2", "d3"],
        documents: ["apple pie recipe", "apple sauce tutorial", "banana bread"]
      });

      // No embedding function → falls back to keyword search; whereDocument applies
      const result = await col.query({
        queryTexts: ["apple"],
        nResults: 5,
        whereDocument: { $contains: "pie" }
      });
      expect(result.ids[0]).toEqual(["d1"]);
    });

    it("listCollections returns empty array when no collections exist", async () => {
      const cols = await store.listCollections();
      expect(cols).toEqual([]);
    });

    it("createCollection preserves metadata with nested values", async () => {
      await store.createCollection({
        name: "meta-types",
        metadata: { count: 42, active: true, label: "test" }
      });
      const col = await store.getCollection({ name: "meta-types" });
      expect(col.metadata.count).toBe(42);
      expect(col.metadata.active).toBe(true);
      expect(col.metadata.label).toBe("test");
    });

    it("peek on empty collection returns empty result", async () => {
      const col = await store.createCollection({ name: "empty-peek" });
      const result = await col.peek({ limit: 5 });
      expect(result.ids).toEqual([]);
    });
  });

  // ── Default store singleton ───────────────────────────────────

  describe("default store singleton", () => {
    afterEach(() => {
      resetDefaultStore();
    });

    it("getDefaultStore returns the same instance on repeated calls", () => {
      process.env.VECTORSTORE_DB_PATH = dbPath;
      const s1 = getDefaultStore();
      const s2 = getDefaultStore();
      expect(s1).toBe(s2);
    });

    it("resetDefaultStore clears the singleton", () => {
      process.env.VECTORSTORE_DB_PATH = dbPath;
      const s1 = getDefaultStore();
      resetDefaultStore();
      const s2 = getDefaultStore();
      expect(s1).not.toBe(s2);
      s2.close();
    });
  });
});
