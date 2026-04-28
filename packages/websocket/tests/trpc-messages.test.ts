import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool-ai/models — the router orchestrates Message + Thread static
// methods; we stub those here.
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      create: vi.fn(),
      get: vi.fn(),
      paginate: vi.fn()
    },
    Thread: {
      ...actual.Thread,
      create: vi.fn()
    }
  };
});

// Mock resolveContentUrls so tests don't depend on asset URL resolution logic.
vi.mock("../src/resolve-media-urls.js", async (orig) => {
  const actual = await orig<typeof import("../src/resolve-media-urls.js")>();
  return {
    ...actual,
    // Identity by default — tests can override per-test.
    resolveContentUrls: vi.fn(
      (content: string | unknown[] | Record<string, unknown> | null) => content
    )
  };
});

import { Message, Thread } from "@nodetool-ai/models";

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

/**
 * Build a Message stub with the fields the router reads + mutates. Tests
 * cast this to `Message` via `as never` at the mock-return call site.
 */
function makeMessage(opts: {
  id?: string;
  user_id?: string;
  thread_id?: string;
  role?: string;
  name?: string | null;
  content?: string | unknown[] | Record<string, unknown> | null;
  tool_calls?: unknown[] | null;
  tool_call_id?: string | null;
  created_at?: string;
  updated_at?: string;
}) {
  return {
    id: opts.id ?? "msg-1",
    user_id: opts.user_id ?? "user-1",
    thread_id: opts.thread_id ?? "thread-1",
    role: opts.role ?? "user",
    name: opts.name ?? null,
    content: opts.content ?? "hello",
    tool_calls: opts.tool_calls ?? null,
    tool_call_id: opts.tool_call_id ?? null,
    created_at: opts.created_at ?? "2026-04-17T00:00:00Z",
    updated_at: opts.updated_at ?? "2026-04-17T00:00:00Z",
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

describe("messages router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns messages paginated by thread", async () => {
      const m1 = makeMessage({ id: "m1", content: "first" });
      const m2 = makeMessage({ id: "m2", content: "second" });
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [m1, m2],
        "next-cursor"
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.messages.list({
        thread_id: "thread-1",
        limit: 50
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.id).toBe("m1");
      expect(result.messages[0]?.type).toBe("message");
      expect(result.next).toBe("next-cursor");
      expect(Message.paginate).toHaveBeenCalledWith("thread-1", {
        limit: 50,
        startKey: undefined,
        reverse: undefined
      });
    });

    it("coerces empty cursor to null", async () => {
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.messages.list({ thread_id: "t1" });
      expect(result.next).toBeNull();
    });

    it("forwards cursor + reverse options", async () => {
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      const caller = createCaller(makeCtx());
      await caller.messages.list({
        thread_id: "t1",
        cursor: "c1",
        reverse: true
      });
      expect(Message.paginate).toHaveBeenCalledWith("t1", {
        limit: 100,
        startKey: "c1",
        reverse: true
      });
    });

    it("defaults limit to 100", async () => {
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      const caller = createCaller(makeCtx());
      await caller.messages.list({ thread_id: "t1" });
      expect(Message.paginate).toHaveBeenCalledWith("t1", {
        limit: 100,
        startKey: undefined,
        reverse: undefined
      });
    });

    it("returns NOT_FOUND if any message belongs to another user", async () => {
      const mine = makeMessage({ id: "m1", user_id: "user-1" });
      const theirs = makeMessage({ id: "m2", user_id: "other-user" });
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [mine, theirs],
        ""
      ]);

      const caller = createCaller(makeCtx());
      await expect(
        caller.messages.list({ thread_id: "t1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.messages.list({ thread_id: "t1" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── create ──────────────────────────────────────────────────────
  describe("create", () => {
    it("creates a message on an existing thread", async () => {
      const msg = makeMessage({ id: "m1", thread_id: "t1" });
      (Message.create as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      const result = await caller.messages.create({
        thread_id: "t1",
        role: "user",
        content: "hello"
      });
      expect(result.id).toBe("m1");
      expect(Message.create).toHaveBeenCalledWith({
        user_id: "user-1",
        thread_id: "t1",
        role: "user",
        name: null,
        content: "hello",
        tool_calls: null
      });
      expect(Thread.create).not.toHaveBeenCalled();
    });

    it("auto-creates a thread when thread_id is omitted", async () => {
      (Thread.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "auto-thread",
        title: "New Thread"
      });
      const msg = makeMessage({
        id: "m1",
        thread_id: "auto-thread"
      });
      (Message.create as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      const result = await caller.messages.create({
        role: "user",
        content: "hello"
      });
      expect(Thread.create).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "New Thread"
      });
      expect(result.thread_id).toBe("auto-thread");
    });

    it("stringifies object/array content before storing", async () => {
      const msg = makeMessage({
        id: "m1",
        content: '[{"type":"text"}]'
      });
      (Message.create as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      await caller.messages.create({
        thread_id: "t1",
        role: "assistant",
        content: [{ type: "text", text: "hi" }]
      });
      const call = (Message.create as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(typeof call?.[0].content).toBe("string");
      expect(JSON.parse(call?.[0].content as string)).toEqual([
        { type: "text", text: "hi" }
      ]);
    });

    it("passes string content through unchanged", async () => {
      const msg = makeMessage({ id: "m1" });
      (Message.create as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      await caller.messages.create({
        thread_id: "t1",
        role: "user",
        content: "plain text"
      });
      const call = (Message.create as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call?.[0].content).toBe("plain text");
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.messages.create({
          role: "user",
          content: "hi"
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns a message when the user owns it", async () => {
      const msg = makeMessage({ id: "m1", user_id: "user-1" });
      (Message.get as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      const result = await caller.messages.get({ id: "m1" });
      expect(result.id).toBe("m1");
    });

    it("throws NOT_FOUND when the message doesn't exist", async () => {
      (Message.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.messages.get({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the user does not own the message", async () => {
      const msg = makeMessage({ id: "m1", user_id: "other-user" });
      (Message.get as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      await expect(
        caller.messages.get({ id: "m1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── delete ──────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes the message when the user owns it", async () => {
      const msg = makeMessage({ id: "m1", user_id: "user-1" });
      (Message.get as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      const result = await caller.messages.delete({ id: "m1" });
      expect(msg.delete).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it("throws NOT_FOUND when the message doesn't exist", async () => {
      (Message.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.messages.delete({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the user doesn't own the message", async () => {
      const msg = makeMessage({ id: "m1", user_id: "other-user" });
      (Message.get as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const caller = createCaller(makeCtx());
      await expect(
        caller.messages.delete({ id: "m1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(msg.delete).not.toHaveBeenCalled();
    });
  });
});
