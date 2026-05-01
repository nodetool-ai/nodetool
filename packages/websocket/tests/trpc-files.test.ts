import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock node:fs/promises used by the files router
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: vi.fn(),
    stat: vi.fn()
  };
});

import * as fsPromises from "node:fs/promises";

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

const HOME = os.homedir();

/** Stub a readdir that returns a mix of files and directories */
function stubReaddir(
  entries: Array<{ name: string; isDir: boolean; size?: number; mtime?: Date }>
) {
  const dirents = entries.map(({ name, isDir }) => ({
    name,
    isDirectory: () => isDir
  }));
  (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(dirents);
  (fsPromises.stat as ReturnType<typeof vi.fn>).mockImplementation(
    (p: string) => {
      const baseName = path.basename(p);
      const entry = entries.find((e) => e.name === baseName);
      if (!entry) return Promise.reject(new Error("ENOENT"));
      return Promise.resolve({
        size: entry.size ?? 0,
        isDirectory: () => entry.isDir,
        mtime: entry.mtime ?? new Date("2026-01-01T00:00:00.000Z")
      });
    }
  );
}

describe("files router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["NODETOOL_ENV"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env["NODETOOL_ENV"];
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns directory entries with metadata", async () => {
      stubReaddir([
        { name: "docs", isDir: true, size: 0, mtime: new Date("2026-03-01T00:00:00.000Z") },
        { name: "readme.txt", isDir: false, size: 1234, mtime: new Date("2026-03-15T12:00:00.000Z") }
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.files.list({ path: "." });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: "docs",
        is_dir: true,
        size: 0,
        path: path.join(HOME, "docs")
      });
      expect(result[1]).toMatchObject({
        name: "readme.txt",
        is_dir: false,
        size: 1234,
        path: path.join(HOME, "readme.txt")
      });
      expect(fsPromises.readdir).toHaveBeenCalledWith(HOME, {
        withFileTypes: true
      });
    });

    it("returns empty array for empty directory", async () => {
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const caller = createCaller(makeCtx());
      const result = await caller.files.list({ path: "." });
      expect(result).toEqual([]);
    });

    it("throws NOT_FOUND when directory does not exist", async () => {
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT: no such file or directory")
      );
      const caller = createCaller(makeCtx());
      await expect(caller.files.list({ path: "nonexistent" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("throws FORBIDDEN for path traversal attempts", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.files.list({ path: "../../etc/passwd" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws FORBIDDEN in production mode", async () => {
      process.env["NODETOOL_ENV"] = "production";
      const caller = createCaller(makeCtx());
      await expect(caller.files.list({ path: "." })).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    it("degrades gracefully when stat fails on an entry", async () => {
      const dirents = [{ name: "broken-link", isDirectory: () => false }];
      (fsPromises.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(
        dirents
      );
      // stat fails for the broken symlink
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT")
      );
      const caller = createCaller(makeCtx());
      const result = await caller.files.list({ path: "." });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: "broken-link",
        size: 0,
        modified_at: "",
        path: path.join(HOME, "broken-link")
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.files.list({ path: "." })).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── info ──────────────────────────────────────────────────────────────────

  describe("info", () => {
    it("returns metadata for a single file", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 512,
        isDirectory: () => false,
        mtime: new Date("2026-04-01T10:00:00.000Z")
      });
      const caller = createCaller(makeCtx());
      const result = await caller.files.info({ path: "myfile.txt" });
      expect(result).toMatchObject({
        name: "myfile.txt",
        path: path.join(HOME, "myfile.txt"),
        size: 512,
        is_dir: false
      });
      expect(result.modified_at).toBe("2026-04-01T10:00:00.000Z");
    });

    it("returns metadata for a directory", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 4096,
        isDirectory: () => true,
        mtime: new Date("2026-02-01T00:00:00.000Z")
      });
      const caller = createCaller(makeCtx());
      const result = await caller.files.info({ path: "mydir" });
      expect(result.is_dir).toBe(true);
    });

    it("throws NOT_FOUND when file does not exist", async () => {
      (fsPromises.stat as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT: no such file or directory")
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.files.info({ path: "missing.txt" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws FORBIDDEN for path traversal", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.files.info({ path: "../../etc/passwd" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws FORBIDDEN in production mode", async () => {
      process.env["NODETOOL_ENV"] = "production";
      const caller = createCaller(makeCtx());
      await expect(caller.files.info({ path: "." })).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.files.info({ path: "." })).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });
});
