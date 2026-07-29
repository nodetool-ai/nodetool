import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool-ai/models — the router orchestrates Message static methods.
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      paginate: vi.fn()
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

import { Message } from "@nodetool-ai/models";

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
});
