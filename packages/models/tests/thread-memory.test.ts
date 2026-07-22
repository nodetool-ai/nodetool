import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { ThreadMemory } from "../src/thread-memory.js";

function setup() {
  initTestDb();
}

describe("ThreadMemory", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates a memory with defaults", async () => {
    const memory = await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      content: "The hero image uses a teal/orange palette."
    });
    expect(memory.id).toBeTruthy();
    expect(memory.kind).toBe("note");
    expect(memory.title).toBe("");
    expect(memory.asset_ids).toBeNull();
    expect(memory.created_at).toBeTruthy();
  });

  it("persists referenced asset ids", async () => {
    const memory = await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      kind: "asset",
      content: "Generated cover art.",
      asset_ids: ["a1", "a2"]
    });
    const reloaded = await ThreadMemory.find("u1", memory.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.asset_ids).toEqual(["a1", "a2"]);
    expect(reloaded!.kind).toBe("asset");
  });

  it("find is scoped to the user", async () => {
    const memory = await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      content: "note"
    });
    expect(await ThreadMemory.find("u2", memory.id)).toBeNull();
    expect(await ThreadMemory.find("u1", memory.id)).not.toBeNull();
  });

  it("lists memories for a thread newest first", async () => {
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      content: "first",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      content: "second",
      created_at: "2026-01-02T00:00:00.000Z"
    });
    // Different thread — must not leak.
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t2",
      content: "other thread"
    });

    const memories = await ThreadMemory.listByThread("u1", "t1");
    expect(memories).toHaveLength(2);
    expect(memories[0].content).toBe("second");
    expect(memories[1].content).toBe("first");
  });

  it("does not leak memories across users", async () => {
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "shared",
      content: "u1 memory"
    });
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u2",
      thread_id: "shared",
      content: "u2 memory"
    });
    const forU1 = await ThreadMemory.listByThread("u1", "shared");
    expect(forU1).toHaveLength(1);
    expect(forU1[0].content).toBe("u1 memory");
  });

  it("deleteByThread removes only that thread's memories", async () => {
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      content: "a"
    });
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t1",
      content: "b"
    });
    await ThreadMemory.create<ThreadMemory>({
      user_id: "u1",
      thread_id: "t2",
      content: "c"
    });

    const removed = await ThreadMemory.deleteByThread("u1", "t1");
    expect(removed).toBe(2);
    expect(await ThreadMemory.listByThread("u1", "t1")).toHaveLength(0);
    expect(await ThreadMemory.listByThread("u1", "t2")).toHaveLength(1);
  });
});
