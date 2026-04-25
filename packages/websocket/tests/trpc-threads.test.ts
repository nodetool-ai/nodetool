import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool/models — router orchestrates Thread + Message static methods.
vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Thread: {
      ...actual.Thread,
      create: vi.fn(),
      find: vi.fn(),
      paginate: vi.fn()
    },
    Message: {
      ...actual.Message,
      paginate: vi.fn()
    }
  };
});

import { Thread, Message } from "@nodetool/models";

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
 * Build a Thread stub with the methods + properties the router touches.
 * `getEtag` is a real DBModel instance method; we stub it inline.
 */
function makeThread(opts: {
  id?: string;
  user_id?: string;
  title?: string;
  etag?: string;
  created_at?: string;
  updated_at?: string;
}) {
  const stub = {
    id: opts.id ?? "t1",
    user_id: opts.user_id ?? "user-1",
    title: opts.title ?? "Alpha",
    created_at: opts.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: opts.updated_at ?? "2026-01-01T00:00:00Z",
    getEtag: vi.fn().mockReturnValue(opts.etag ?? "etag-1"),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
  return stub;
}

describe("threads router", () => {
  beforeEach(() => {
    // resetAllMocks clears queued `mockResolvedValueOnce` values between tests
    // (clearAllMocks only resets call history, not the queue).
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns paginated threads with masked etags", async () => {
      const t1 = makeThread({ id: "t1", title: "Alpha", etag: "e1" });
      const t2 = makeThread({ id: "t2", title: "Beta", etag: "e2" });
      (Thread.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [t1, t2],
        "next-cursor"
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.list({ limit: 10 });
      expect(result.threads).toHaveLength(2);
      expect(result.threads[0]?.id).toBe("t1");
      expect(result.threads[0]?.etag).toBe("e1");
      expect(result.next).toBe("next-cursor");
      expect(Thread.paginate).toHaveBeenCalledWith("user-1", {
        limit: 10,
        startKey: undefined,
        reverse: undefined
      });
    });

    it("coerces empty cursor to null", async () => {
      (Thread.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.list({});
      expect(result.next).toBeNull();
    });

    it("defaults limit to 10", async () => {
      (Thread.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      const caller = createCaller(makeCtx());
      await caller.threads.list({});
      expect(Thread.paginate).toHaveBeenCalledWith("user-1", {
        limit: 10,
        startKey: undefined,
        reverse: undefined
      });
    });

    it("forwards cursor + reverse options", async () => {
      (Thread.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      const caller = createCaller(makeCtx());
      await caller.threads.list({ cursor: "c1", reverse: true });
      expect(Thread.paginate).toHaveBeenCalledWith("user-1", {
        limit: 10,
        startKey: "c1",
        reverse: true
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.threads.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── create ──────────────────────────────────────────────────────
  describe("create", () => {
    it("creates a thread with provided title", async () => {
      const t = makeThread({ id: "new-t", title: "My Thread" });
      (Thread.create as ReturnType<typeof vi.fn>).mockResolvedValue(t);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.create({ title: "My Thread" });
      expect(Thread.create).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "My Thread"
      });
      expect(result.id).toBe("new-t");
      expect(result.title).toBe("My Thread");
    });

    it("defaults title to 'New Thread' when omitted", async () => {
      const t = makeThread({ id: "auto", title: "New Thread" });
      (Thread.create as ReturnType<typeof vi.fn>).mockResolvedValue(t);

      const caller = createCaller(makeCtx());
      await caller.threads.create({});
      expect(Thread.create).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "New Thread"
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns a thread the user owns", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.get({ id: "t1" });
      expect(Thread.find).toHaveBeenCalledWith("user-1", "t1");
      expect(result.id).toBe("t1");
    });

    it("throws NOT_FOUND when thread does not exist", async () => {
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.threads.get({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── update ──────────────────────────────────────────────────────
  describe("update", () => {
    it("updates the title", async () => {
      const t = makeThread({ id: "t1", title: "Old" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.update({
        id: "t1",
        title: "New Title"
      });
      expect(t.title).toBe("New Title");
      expect(t.save).toHaveBeenCalled();
      expect(result.title).toBe("New Title");
    });

    it("throws NOT_FOUND when thread does not exist", async () => {
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.threads.update({ id: "missing", title: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── delete ──────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes thread and its messages in batches", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      const msg1 = { delete: vi.fn().mockResolvedValue(undefined) };
      const msg2 = { delete: vi.fn().mockResolvedValue(undefined) };
      // First batch returns messages, second returns empty → loop exits.
      (Message.paginate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([[msg1, msg2], ""])
        .mockResolvedValueOnce([[], ""]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.delete({ id: "t1" });
      expect(msg1.delete).toHaveBeenCalled();
      expect(msg2.delete).toHaveBeenCalled();
      expect(t.delete).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it("exits the delete loop when paginate returns fewer than limit", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      // Single batch with < 100 messages — loop should not re-enter.
      const msg = { delete: vi.fn().mockResolvedValue(undefined) };
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        [msg],
        ""
      ]);

      const caller = createCaller(makeCtx());
      await caller.threads.delete({ id: "t1" });
      expect(Message.paginate).toHaveBeenCalledTimes(1);
      expect(t.delete).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when thread does not exist", async () => {
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.threads.delete({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── summarize ───────────────────────────────────────────────────
  describe("summarize", () => {
    it("derives a title from the first string message", async () => {
      const t = makeThread({ id: "t1", title: "Old" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [{ content: "Hello world" }],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.summarize({ id: "t1" });
      expect(result.title).toBe("Hello world");
      expect(t.title).toBe("Hello world");
      expect(t.save).toHaveBeenCalled();
    });

    it("truncates long titles with '...'", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      const longText = "a".repeat(100);
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [{ content: longText }],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.summarize({ id: "t1" });
      expect(result.title).toHaveLength(60); // 57 chars + "..."
      expect(result.title.endsWith("...")).toBe(true);
    });

    it("collapses whitespace in titles", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [{ content: "  Hello\n\nworld   " }],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.summarize({ id: "t1" });
      expect(result.title).toBe("Hello world");
    });

    it("falls back to 'New Thread' when messages have no usable content", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      // Empty-content messages only.
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [{ content: "" }, { content: "   " }],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.summarize({ id: "t1" });
      expect(result.title).toBe("New Thread");
    });

    it("extracts text from array content (MessageTextContent)", async () => {
      const t = makeThread({ id: "t1" });
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(t);
      (Message.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [
          {
            content: [
              { type: "image", uri: "x" },
              { type: "text", text: "From array" }
            ]
          }
        ],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.threads.summarize({ id: "t1" });
      expect(result.title).toBe("From array");
    });

    it("throws NOT_FOUND when thread does not exist", async () => {
      (Thread.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.threads.summarize({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
