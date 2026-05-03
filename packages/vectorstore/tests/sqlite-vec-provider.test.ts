import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

import { SqliteVecStore } from "../src/sqlite-vec-store.js";
import { SqliteVecProvider } from "../src/sqlite-vec-provider.js";
import {
  CollectionNotFoundError,
  UnsupportedFilterError,
  type EmbeddingFunction
} from "../src/index.js";

let provider: SqliteVecProvider;
let store: SqliteVecStore;
let dbPath: string;

const fakeEf: EmbeddingFunction = {
  async generate(texts) {
    // 3-dim deterministic embedding: char code sums in 3 buckets
    return texts.map((t) => {
      const v = [0, 0, 0];
      for (let i = 0; i < t.length; i++) v[i % 3] += t.charCodeAt(i);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
};

beforeEach(() => {
  dbPath = join(
    tmpdir(),
    `vec-prov-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  store = new SqliteVecStore(dbPath);
  provider = new SqliteVecProvider({ store });
});

afterEach(() => {
  try {
    store.close();
  } catch {}
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + ext);
    } catch {}
  }
});

describe("SqliteVecProvider", () => {
  it("identifies as sqlite-vec", () => {
    expect(provider.name).toBe("sqlite-vec");
  });

  it("creates, lists, and deletes collections", async () => {
    await provider.createCollection({ name: "a", metadata: { foo: "bar" } });
    await provider.createCollection({ name: "b" });

    const cols = await provider.listCollections();
    expect(cols.map((c) => c.name).sort()).toEqual(["a", "b"]);
    expect(cols.find((c) => c.name === "a")?.metadata.foo).toBe("bar");

    await provider.deleteCollection("a");
    const after = await provider.listCollections();
    expect(after.map((c) => c.name)).toEqual(["b"]);
  });

  it("throws CollectionNotFoundError for missing collections", async () => {
    await expect(
      provider.getCollection({ name: "missing" })
    ).rejects.toBeInstanceOf(CollectionNotFoundError);
    await expect(provider.deleteCollection("missing")).rejects.toBeInstanceOf(
      CollectionNotFoundError
    );
  });

  it("getOrCreateCollection is idempotent", async () => {
    const a = await provider.getOrCreateCollection({ name: "x" });
    const b = await provider.getOrCreateCollection({ name: "x" });
    expect(a.name).toBe(b.name);
    const cols = await provider.listCollections();
    expect(cols.filter((c) => c.name === "x")).toHaveLength(1);
  });

  it("upserts and fetches records by id", async () => {
    const col = await provider.createCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });

    await col.upsert([
      { id: "1", document: "hello world", metadata: { kind: "greeting" } },
      { id: "2", document: "foo bar baz", metadata: { kind: "filler" } }
    ]);

    expect(await col.count()).toBe(2);

    const got = await col.get({ ids: ["1"] });
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("1");
    expect(got[0].document).toBe("hello world");
    expect(got[0].metadata.kind).toBe("greeting");
  });

  it("queries by text using the embedding function", async () => {
    const col = await provider.createCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });

    await col.upsert([
      { id: "a", document: "alpha alpha alpha" },
      { id: "b", document: "beta beta beta" },
      { id: "c", document: "gamma gamma gamma" }
    ]);

    const results = await col.query({ text: "alpha alpha alpha", topK: 2 });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a");
    expect(results[0].distance).toBeLessThanOrEqual(results[1].distance);
  });

  it("queries by raw embedding", async () => {
    const col = await provider.createCollection({ name: "docs" });

    const [eA] = await fakeEf.generate(["alpha"]);
    const [eB] = await fakeEf.generate(["beta"]);
    await col.upsert([
      { id: "a", document: "alpha", embedding: eA },
      { id: "b", document: "beta", embedding: eB }
    ]);

    const results = await col.query({ embedding: eA, topK: 1 });
    expect(results[0].id).toBe("a");
  });

  it("deletes records by id", async () => {
    const col = await provider.createCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });
    await col.upsert([
      { id: "1", document: "x" },
      { id: "2", document: "y" }
    ]);
    await col.delete(["1"]);
    expect(await col.count()).toBe(1);
    const got = await col.get();
    expect(got.map((r) => r.id)).toEqual(["2"]);
  });

  it("rejects unsupported filter operators loudly", async () => {
    const col = await provider.createCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });
    await col.upsert([{ id: "1", document: "hello" }]);

    await expect(
      col.query({ text: "hello", filter: { kind: "greeting" } })
    ).rejects.toBeInstanceOf(UnsupportedFilterError);
  });

  it("supports document-text filters", async () => {
    const col = await provider.createCollection({
      name: "docs",
      embeddingFunction: fakeEf
    });
    await col.upsert([
      { id: "1", document: "the quick brown fox" },
      { id: "2", document: "lazy dog sleeps" }
    ]);

    const results = await col.query({
      text: "fox",
      topK: 5,
      filter: { $document: { $contains: "fox" } }
    });
    expect(results.map((r) => r.id)).toEqual(["1"]);
  });
});
