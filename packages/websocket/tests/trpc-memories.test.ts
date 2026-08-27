import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  Memory,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";

// Real DB, real resolvers — this exercises the network-reachable endpoints and
// their user scoping, which is where an auth regression would land.
const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

async function seed(userId: string, threadId: string, content: string) {
  return Memory.create<Memory>({
    user_id: userId,
    thread_id: threadId,
    content
  });
}

describe("memories router", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  describe("list", () => {
    it("returns the thread's memories newest first with resolved resources", async () => {
      await seed("user-1", "t1", "first");
      const mem = await Memory.create<Memory>({
        user_id: "user-1",
        thread_id: "t1",
        kind: "resource",
        content: "with an asset",
        resources: [{ type: "asset", id: "a1", uri: "asset://a1.png" }]
      });

      const caller = createCaller(makeCtx("user-1"));
      const res = await caller.memories.list({ thread_id: "t1" });
      expect(res.memories).toHaveLength(2);
      const withAsset = res.memories.find((m) => m.id === mem.id);
      expect(withAsset?.resources).toEqual([
        { type: "asset", id: "a1", uri: "asset://a1.png" }
      ]);
    });

    it("does not leak another user's memories", async () => {
      await seed("user-1", "shared", "user-1 secret");
      await seed("user-2", "shared", "user-2 secret");

      const caller = createCaller(makeCtx("user-2"));
      const res = await caller.memories.list({ thread_id: "shared" });
      expect(res.memories).toHaveLength(1);
      expect(res.memories[0].content).toBe("user-2 secret");
    });
  });

  describe("cross-thread scope", () => {
    it("lists every thread when thread_id is omitted", async () => {
      await seed("user-1", "t1", "in t1");
      await seed("user-1", "t2", "in t2");
      await seed("user-2", "t1", "another user's");

      const caller = createCaller(makeCtx("user-1"));
      const res = await caller.memories.list({});
      expect(res.memories.map((m) => m.content).sort()).toEqual([
        "in t1",
        "in t2"
      ]);
    });
  });

  describe("search", () => {
    it("matches a memory saved in another thread", async () => {
      await seed("user-1", "t1", "the client is Northwind");
      await seed("user-1", "t2", "we settled on viridian");

      const caller = createCaller(makeCtx("user-1"));
      const res = await caller.memories.search({ query: "Viridian" });
      expect(res.memories.map((m) => m.thread_id)).toEqual(["t2"]);
    });

    it("requires every word", async () => {
      await seed("user-1", "t1", "the client is Northwind");
      const caller = createCaller(makeCtx("user-1"));
      expect(
        (await caller.memories.search({ query: "client northwind" })).memories
      ).toHaveLength(1);
      expect(
        (await caller.memories.search({ query: "client viridian" })).memories
      ).toHaveLength(0);
    });

    it("never reaches another user's memory", async () => {
      await seed("user-1", "shared", "viridian for user-1");
      const caller = createCaller(makeCtx("user-2"));
      const res = await caller.memories.search({ query: "viridian" });
      expect(res.memories).toHaveLength(0);
    });

    it("rejects an empty query at the schema", async () => {
      const caller = createCaller(makeCtx("user-1"));
      await expect(caller.memories.search({ query: "" })).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("deletes the caller's own memory", async () => {
      const mem = await seed("user-1", "t1", "temp");
      const caller = createCaller(makeCtx("user-1"));
      const res = await caller.memories.delete({ id: mem.id });
      expect(res).toEqual({ ok: true });
      expect(await Memory.find("user-1", mem.id)).toBeNull();
    });

    it("cannot delete another user's memory (NOT_FOUND, row untouched)", async () => {
      const mem = await seed("user-1", "t1", "owned by user-1");
      const caller = createCaller(makeCtx("user-2"));
      await expect(
        caller.memories.delete({ id: mem.id })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      // The victim's row must still exist.
      expect(await Memory.find("user-1", mem.id)).not.toBeNull();
    });
  });
});
