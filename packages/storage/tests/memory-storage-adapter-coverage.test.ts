/**
 * Coverage tests for InMemoryStorageAdapter (src/memory-storage-adapter.ts).
 *
 * The adapter is fully in-process, so no mocks are needed. Covers
 * store/retrieve/exists/delete/stat/uriForKey and the list() branches
 * (prefix matching, delimiter grouping, invalid-prefix guard) plus the
 * missing-key / wrong-scheme return paths.
 */

import { describe, it, expect } from "vitest";
import { InMemoryStorageAdapter } from "../src/memory-storage-adapter.js";

describe("InMemoryStorageAdapter store/retrieve", () => {
  it("stores bytes and returns a normalized memory:// uri", async () => {
    const s = new InMemoryStorageAdapter();
    const uri = await s.store("/a//b.txt", new Uint8Array([1, 2, 3]));
    expect(uri).toBe("memory://a/b.txt");
    expect(await s.retrieve(uri)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("copies the input so later mutation does not change stored bytes", async () => {
    const s = new InMemoryStorageAdapter();
    const data = new Uint8Array([9, 9, 9]);
    const uri = await s.store("k", data);
    data[0] = 0;
    expect(await s.retrieve(uri)).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("retrieve returns a fresh copy each call (defensive clone)", async () => {
    const s = new InMemoryStorageAdapter();
    const uri = await s.store("k", new Uint8Array([5, 6]));
    const first = await s.retrieve(uri);
    expect(first).not.toBeNull();
    first![0] = 42;
    const second = await s.retrieve(uri);
    expect(second).toEqual(new Uint8Array([5, 6]));
  });

  it("retrieve returns null for a missing key", async () => {
    const s = new InMemoryStorageAdapter();
    expect(await s.retrieve("memory://absent")).toBeNull();
  });

  it("retrieve returns null for a non-memory uri", async () => {
    const s = new InMemoryStorageAdapter();
    await s.store("k", new Uint8Array([1]));
    expect(await s.retrieve("file:///k")).toBeNull();
    expect(await s.retrieve("s3://b/k")).toBeNull();
  });

  it("overwrites an existing key", async () => {
    const s = new InMemoryStorageAdapter();
    await s.store("k", new Uint8Array([1]));
    await s.store("k", new Uint8Array([2, 2]));
    expect(await s.retrieve("memory://k")).toEqual(new Uint8Array([2, 2]));
  });
});

describe("InMemoryStorageAdapter exists / delete", () => {
  it("exists is true after store, false after delete", async () => {
    const s = new InMemoryStorageAdapter();
    const uri = await s.store("k", new Uint8Array([1]));
    expect(await s.exists(uri)).toBe(true);
    expect(await s.delete(uri)).toBe(true);
    expect(await s.exists(uri)).toBe(false);
  });

  it("exists is false for a non-memory uri", async () => {
    const s = new InMemoryStorageAdapter();
    expect(await s.exists("file:///k")).toBe(false);
  });

  it("delete returns false for a missing key", async () => {
    const s = new InMemoryStorageAdapter();
    expect(await s.delete("memory://absent")).toBe(false);
  });

  it("delete returns false for a non-memory uri", async () => {
    const s = new InMemoryStorageAdapter();
    expect(await s.delete("s3://b/k")).toBe(false);
  });
});

describe("InMemoryStorageAdapter uriForKey", () => {
  it("normalizes and prefixes the key", () => {
    const s = new InMemoryStorageAdapter();
    expect(s.uriForKey("/x/y")).toBe("memory://x/y");
  });

  it("throws on a path-traversal key", () => {
    const s = new InMemoryStorageAdapter();
    expect(() => s.uriForKey("../escape")).toThrow(/Invalid storage key/);
  });
});

describe("InMemoryStorageAdapter stat", () => {
  it("returns size / modifiedAt / contentType", async () => {
    const before = Date.now();
    const s = new InMemoryStorageAdapter();
    const uri = await s.store("k.png", new Uint8Array([1, 2, 3, 4]), "image/png");
    const stat = await s.stat(uri);
    expect(stat).not.toBeNull();
    expect(stat!.key).toBe("k.png");
    expect(stat!.size).toBe(4);
    expect(stat!.contentType).toBe("image/png");
    expect(stat!.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it("omits contentType when none was supplied", async () => {
    const s = new InMemoryStorageAdapter();
    const uri = await s.store("k", new Uint8Array([1]));
    const stat = await s.stat(uri);
    expect(stat).not.toBeNull();
    expect(stat!.contentType).toBeUndefined();
  });

  it("returns null for a missing key", async () => {
    const s = new InMemoryStorageAdapter();
    expect(await s.stat("memory://absent")).toBeNull();
  });

  it("returns null for a non-memory uri", async () => {
    const s = new InMemoryStorageAdapter();
    expect(await s.stat("file:///k")).toBeNull();
  });
});

describe("InMemoryStorageAdapter list", () => {
  async function seed(): Promise<InMemoryStorageAdapter> {
    const s = new InMemoryStorageAdapter();
    await s.store("runs/r1/a.txt", new Uint8Array([1]), "text/plain");
    await s.store("runs/r1/b.txt", new Uint8Array([2, 2]));
    await s.store("runs/r1/sub/c.txt", new Uint8Array([3, 3, 3]));
    await s.store("other/z.txt", new Uint8Array([4]));
    return s;
  }

  it("lists everything sorted when the prefix is empty", async () => {
    const s = await seed();
    const res = await s.list("");
    expect(res.entries.map((e) => e.key)).toEqual([
      "other/z.txt",
      "runs/r1/a.txt",
      "runs/r1/b.txt",
      "runs/r1/sub/c.txt"
    ]);
    expect(res.commonPrefixes).toEqual([]);
  });

  it("treats '/' the same as an empty prefix", async () => {
    const s = await seed();
    const res = await s.list("/");
    expect(res.entries).toHaveLength(4);
  });

  it("filters by a normalized prefix", async () => {
    const s = await seed();
    const res = await s.list("runs/r1");
    expect(res.entries.map((e) => e.key)).toEqual([
      "runs/r1/a.txt",
      "runs/r1/b.txt",
      "runs/r1/sub/c.txt"
    ]);
  });

  it("groups nested keys into commonPrefixes with a '/' delimiter", async () => {
    const s = await seed();
    const res = await s.list("runs/r1", { delimiter: "/" });
    expect(res.entries.map((e) => e.key)).toEqual([
      "runs/r1/a.txt",
      "runs/r1/b.txt"
    ]);
    expect(res.commonPrefixes).toEqual(["runs/r1/sub/"]);
  });

  it("carries size and contentType on returned entries", async () => {
    const s = await seed();
    const res = await s.list("runs/r1");
    const a = res.entries.find((e) => e.key === "runs/r1/a.txt");
    expect(a).toBeDefined();
    expect(a!.size).toBe(1);
    expect(a!.contentType).toBe("text/plain");
    expect(a!.uri).toBe("memory://runs/r1/a.txt");
    const b = res.entries.find((e) => e.key === "runs/r1/b.txt");
    expect(b!.contentType).toBeUndefined();
  });

  it("returns an empty result for an invalid (traversal) prefix", async () => {
    const s = await seed();
    const res = await s.list("../../etc");
    expect(res).toEqual({ entries: [], commonPrefixes: [] });
  });

  it("returns empty when the prefix matches nothing", async () => {
    const s = await seed();
    const res = await s.list("nope");
    expect(res.entries).toEqual([]);
    expect(res.commonPrefixes).toEqual([]);
  });
});
