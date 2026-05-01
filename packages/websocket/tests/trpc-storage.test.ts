import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: vi.fn(),
    unlink: vi.fn(),
    readdir: vi.fn()
  };
});

// Mock @nodetool-ai/config to control storage path
vi.mock("@nodetool-ai/config", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    getDefaultAssetsPath: vi.fn(() => "/mock-storage")
  };
});

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

const ROOT = "/mock-storage";

describe("storage router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns an empty list when storage is empty", async () => {
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const caller = createCaller(makeCtx());
      const result = await caller.storage.list({});
      expect(result).toEqual({ entries: [], count: 0 });
    });

    it("returns files with metadata", async () => {
      const dirents = [
        { name: "image.png", isDirectory: () => false }
      ];
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(
        dirents
      );
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 2048,
        isDirectory: () => false,
        mtime: new Date("2026-04-01T00:00:00.000Z")
      });

      const caller = createCaller(makeCtx());
      const result = await caller.storage.list({});
      expect(result.count).toBe(1);
      expect(result.entries[0]).toMatchObject({
        key: "image.png",
        size: 2048,
        content_type: "image/png",
        last_modified: "2026-04-01T00:00:00.000Z"
      });
    });

    it("filters by prefix when provided", async () => {
      // readdir for the 'temp' subdirectory
      const dirents = [
        { name: "session.json", isDirectory: () => false }
      ];
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(
        dirents
      );
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 512,
        isDirectory: () => false,
        mtime: new Date("2026-04-01T00:00:00.000Z")
      });

      const caller = createCaller(makeCtx());
      const result = await caller.storage.list({ prefix: "temp" });
      expect(result.count).toBe(1);
      // readdir called with temp subdirectory
      expect(fsPromises.readdir).toHaveBeenCalledWith(
        path.join(ROOT, "temp"),
        { withFileTypes: true }
      );
    });

    it("rejects path traversal in prefix", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.storage.list({ prefix: "../../../etc" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("handles missing storage directory gracefully", async () => {
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.storage.list({});
      expect(result).toEqual({ entries: [], count: 0 });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.storage.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── metadata ─────────────────────────────────────────────────────────────

  describe("metadata", () => {
    it("returns metadata for an existing object", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 4096,
        isDirectory: () => false,
        mtime: new Date("2026-03-15T12:00:00.000Z")
      });

      const caller = createCaller(makeCtx());
      const result = await caller.storage.metadata({ key: "photo.jpg" });
      expect(result).toMatchObject({
        key: "photo.jpg",
        size: 4096,
        content_type: "image/jpeg",
        last_modified: "2026-03-15T12:00:00.000Z"
      });
      expect(fsPromises.stat).toHaveBeenCalledWith(
        path.join(ROOT, "photo.jpg")
      );
    });

    it("throws NOT_FOUND when object does not exist", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT")
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.storage.metadata({ key: "missing.png" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws BAD_REQUEST for invalid key (path traversal)", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.storage.metadata({ key: "../../../etc/passwd" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws BAD_REQUEST for absolute key", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.storage.metadata({ key: "/absolute/key" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.storage.metadata({ key: "test.txt" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("deletes an existing object and returns ok:true", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 100,
        isDirectory: () => false,
        mtime: new Date()
      });
      (fsPromises.unlink as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
      );

      const caller = createCaller(makeCtx());
      const result = await caller.storage.delete({ key: "audio.mp3" });
      expect(result).toEqual({ ok: true });
      expect(fsPromises.stat).toHaveBeenCalledWith(
        path.join(ROOT, "audio.mp3")
      );
      expect(fsPromises.unlink).toHaveBeenCalledWith(
        path.join(ROOT, "audio.mp3")
      );
    });

    it("throws NOT_FOUND when object does not exist", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT")
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.storage.delete({ key: "gone.txt" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it("throws BAD_REQUEST for invalid key (path traversal)", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.storage.delete({ key: "../../etc/shadow" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(fsPromises.stat).not.toHaveBeenCalled();
      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.storage.delete({ key: "test.txt" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
