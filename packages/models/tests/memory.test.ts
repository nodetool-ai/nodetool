import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Memory, memorySearchTerms } from "../src/memory.js";

function setup() {
  initTestDb();
}

describe("Memory", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates a memory with defaults", async () => {
    const memory = await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      content: "The hero image uses a teal/orange palette."
    });
    expect(memory.id).toBeTruthy();
    expect(memory.kind).toBe("note");
    expect(memory.title).toBe("");
    expect(memory.resources).toBeNull();
    expect(memory.created_at).toBeTruthy();
  });

  it("persists typed resource references", async () => {
    const memory = await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      kind: "resource",
      content: "Generated cover art and the workflow that made it.",
      resources: [
        { type: "asset", id: "a1", uri: "asset://a1.png" },
        { type: "workflow", id: "wf1", label: "Cover generator" }
      ]
    });
    const reloaded = await Memory.find("u1", memory.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.resources).toEqual([
      { type: "asset", id: "a1", uri: "asset://a1.png" },
      { type: "workflow", id: "wf1", label: "Cover generator" }
    ]);
    expect(reloaded!.kind).toBe("resource");
  });

  it("find is scoped to the user", async () => {
    const memory = await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      content: "note"
    });
    expect(await Memory.find("u2", memory.id)).toBeNull();
    expect(await Memory.find("u1", memory.id)).not.toBeNull();
  });

  it("lists memories for a thread newest first", async () => {
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      content: "first",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      content: "second",
      created_at: "2026-01-02T00:00:00.000Z"
    });
    // Different thread — must not leak.
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t2",
      content: "other thread"
    });

    const memories = await Memory.listByThread("u1", "t1");
    expect(memories).toHaveLength(2);
    expect(memories[0].content).toBe("second");
    expect(memories[1].content).toBe("first");
  });

  it("does not leak memories across users", async () => {
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "shared",
      content: "u1 memory"
    });
    await Memory.create<Memory>({
      user_id: "u2",
      thread_id: "shared",
      content: "u2 memory"
    });
    const forU1 = await Memory.listByThread("u1", "shared");
    expect(forU1).toHaveLength(1);
    expect(forU1[0].content).toBe("u1 memory");
  });

  it("deleteByThread removes only that thread's memories", async () => {
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      content: "a"
    });
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t1",
      content: "b"
    });
    await Memory.create<Memory>({
      user_id: "u1",
      thread_id: "t2",
      content: "c"
    });

    const removed = await Memory.deleteByThread("u1", "t1");
    expect(removed).toBe(2);
    expect(await Memory.listByThread("u1", "t1")).toHaveLength(0);
    expect(await Memory.listByThread("u1", "t2")).toHaveLength(1);
  });

  describe("cross-thread scope", () => {
    async function seed() {
      await Memory.create<Memory>({
        user_id: "u1",
        thread_id: "t1",
        kind: "decision",
        title: "Brand colour",
        content: "We settled on viridian."
      });
      await Memory.create<Memory>({
        user_id: "u1",
        thread_id: "t2",
        kind: "fact",
        content: "The client is Northwind."
      });
      await Memory.create<Memory>({
        user_id: "u2",
        thread_id: "t1",
        content: "Another user's memory."
      });
    }

    it("lists every thread by default and narrows on request", async () => {
      await seed();
      expect(await Memory.list("u1")).toHaveLength(2);
      expect(await Memory.list("u1", { threadId: "t1" })).toHaveLength(1);
    });

    it("never crosses the user boundary", async () => {
      await seed();
      const all = await Memory.list("u1");
      expect(all.every((m) => m.user_id === "u1")).toBe(true);
    });

    it("filters by kind", async () => {
      await seed();
      const decisions = await Memory.list("u1", { kinds: ["decision"] });
      expect(decisions.map((m) => m.content)).toEqual([
        "We settled on viridian."
      ]);
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await Memory.create<Memory>({
        user_id: "u1",
        thread_id: "t1",
        title: "Brand colour",
        content: "We settled on viridian."
      });
      await Memory.create<Memory>({
        user_id: "u1",
        thread_id: "t2",
        content: "The client is Northwind."
      });
      await Memory.create<Memory>({
        user_id: "u2",
        thread_id: "t1",
        content: "viridian belongs to another user."
      });
    });

    it("matches a keyword in the content, across threads", async () => {
      const matches = await Memory.search("u1", "northwind");
      expect(matches.map((m) => m.thread_id)).toEqual(["t2"]);
    });

    it("matches the title as well as the content", async () => {
      const matches = await Memory.search("u1", "brand");
      expect(matches.map((m) => m.title)).toEqual(["Brand colour"]);
    });

    it("requires every word, so more words find less", async () => {
      expect(await Memory.search("u1", "settled viridian")).toHaveLength(1);
      expect(await Memory.search("u1", "settled northwind")).toHaveLength(0);
    });

    it("matches a word spanning the title and the content", async () => {
      // "brand" is in the title, "viridian" in the content — one memory has both.
      expect(await Memory.search("u1", "brand viridian")).toHaveLength(1);
    });

    it("ignores case on both sides", async () => {
      expect(await Memory.search("u1", "VIRIDIAN")).toHaveLength(1);
    });

    it("matches a substring, not just a whole word", async () => {
      expect(await Memory.search("u1", "virid")).toHaveLength(1);
    });

    it("stays inside the user boundary", async () => {
      const matches = await Memory.search("u1", "viridian");
      expect(matches).toHaveLength(1);
      expect(matches[0].user_id).toBe("u1");
    });

    it("narrows to one thread on request", async () => {
      expect(
        await Memory.search("u1", "viridian", { threadId: "t2" })
      ).toHaveLength(0);
      expect(
        await Memory.search("u1", "viridian", { threadId: "t1" })
      ).toHaveLength(1);
    });

    it("honours the limit", async () => {
      const matches = await Memory.search("u1", "e", { limit: 1 });
      expect(matches).toHaveLength(1);
    });

    it("matches nothing for an empty query", async () => {
      expect(await Memory.search("u1", "")).toHaveLength(0);
      expect(await Memory.search("u1", "   ")).toHaveLength(0);
    });

    it("treats a LIKE wildcard as a literal, not a match-all", async () => {
      // Unescaped, "%" would match every memory the user has.
      expect(await Memory.search("u1", "%")).toHaveLength(0);
      expect(await Memory.search("u1", "_")).toHaveLength(0);
      await Memory.create<Memory>({
        user_id: "u1",
        thread_id: "t1",
        content: "100% cotton"
      });
      expect(await Memory.search("u1", "100%")).toHaveLength(1);
    });
  });

  describe("memorySearchTerms", () => {
    it("splits on whitespace and lowercases", () => {
      expect(memorySearchTerms("Brand  Colour")).toEqual(["brand", "colour"]);
    });

    it("drops duplicates", () => {
      expect(memorySearchTerms("fox fox FOX")).toEqual(["fox"]);
    });

    it("returns nothing for whitespace alone", () => {
      expect(memorySearchTerms("   ")).toEqual([]);
    });

    it("caps the number of terms", () => {
      const terms = memorySearchTerms(
        "a b c d e f g h i j k l"
      );
      expect(terms).toHaveLength(8);
    });
  });
});
