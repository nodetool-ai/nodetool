/**
 * `workspace.readFile` / `workspace.writeFile` — the text view and editor the
 * Workspace Explorer opens a file with.
 *
 * These run against a real temp directory: the procedures read and write
 * through the run's `Workspace`, so mocking `node:fs` would test nothing they
 * still call. Only the model lookup is stubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { MAX_TEXT_FILE_BYTES } from "@nodetool-ai/protocol/api-schemas/workspace.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workspace: {
      ...actual.Workspace,
      find: vi.fn()
    }
  };
});

import { Workspace } from "@nodetool-ai/models";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile as readFileFromDisk
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function makeRow(opts: {
  path: string;
  is_managed?: boolean;
  is_accessible?: boolean;
}) {
  return {
    id: "w1",
    user_id: "user-1",
    name: "My Workspace",
    path: opts.path,
    is_default: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    isAccessible: vi.fn().mockReturnValue(opts.is_accessible ?? true),
    isManaged: vi.fn().mockReturnValue(opts.is_managed ?? false),
    isVirtual: vi.fn().mockReturnValue(false),
    save: vi.fn(),
    delete: vi.fn()
  };
}

const findMock = () => Workspace.find as ReturnType<typeof vi.fn>;

describe("workspace file read/write", () => {
  let dir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.NODETOOL_ENV;
    dir = await mkdtemp(join(tmpdir(), "trpc-ws-files-"));
    findMock().mockResolvedValue(makeRow({ path: dir }));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // ── readFile ────────────────────────────────────────────────────
  describe("readFile", () => {
    it("reads an existing file as UTF-8", async () => {
      await writeFile(join(dir, "notes.md"), "# héllo\nworld\n", "utf8");

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.readFile({
        id: "w1",
        path: "notes.md"
      });
      expect(result.content).toBe("# héllo\nworld\n");
      expect(result.size).toBe(Buffer.byteLength("# héllo\nworld\n", "utf8"));
      expect(result.truncated).toBe(false);
      expect(Number.isNaN(Date.parse(result.modified_at))).toBe(false);
    });

    it("reads a file in a subdirectory", async () => {
      await mkdir(join(dir, "sub"), { recursive: true });
      await writeFile(join(dir, "sub", "inner.txt"), "inner", "utf8");

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.readFile({
        id: "w1",
        path: "sub/inner.txt"
      });
      expect(result.content).toBe("inner");
    });

    it("truncates a file past the 2 MiB cap and reports the full size", async () => {
      const big = "a".repeat(MAX_TEXT_FILE_BYTES + 1024);
      await writeFile(join(dir, "big.log"), big, "utf8");

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.readFile({
        id: "w1",
        path: "big.log"
      });
      expect(result.truncated).toBe(true);
      expect(result.content).toHaveLength(MAX_TEXT_FILE_BYTES);
      expect(result.size).toBe(MAX_TEXT_FILE_BYTES + 1024);
    });

    it("does not truncate a file exactly at the cap", async () => {
      await writeFile(join(dir, "exact.log"), "a".repeat(MAX_TEXT_FILE_BYTES));

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.readFile({
        id: "w1",
        path: "exact.log"
      });
      expect(result.truncated).toBe(false);
      expect(result.content).toHaveLength(MAX_TEXT_FILE_BYTES);
    });

    it("throws NOT_FOUND for a missing file", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.readFile({ id: "w1", path: "nope.txt" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws INVALID_INPUT when the path is a directory", async () => {
      await mkdir(join(dir, "sub"), { recursive: true });
      await writeFile(join(dir, "sub", "inner.txt"), "x");

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.readFile({ id: "w1", path: "sub" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects absolute paths", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.readFile({ id: "w1", path: "/etc/passwd" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects path traversal", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.readFile({ id: "w1", path: "../x" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when the workspace does not exist", async () => {
      findMock().mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.readFile({ id: "missing", path: "a.txt" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("refuses an unmanaged workspace in production", async () => {
      process.env.NODETOOL_ENV = "production";
      await writeFile(join(dir, "notes.md"), "x");
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.readFile({ id: "w1", path: "notes.md" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workspace.readFile({ id: "w1", path: "a.txt" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── writeFile ───────────────────────────────────────────────────
  describe("writeFile", () => {
    it("creates a file and returns its entry", async () => {
      const caller = createCaller(makeCtx());
      const entry = await caller.workspace.writeFile({
        id: "w1",
        path: "new.txt",
        content: "hello"
      });
      expect(entry.name).toBe("new.txt");
      expect(entry.path).toBe("new.txt");
      expect(entry.is_dir).toBe(false);
      expect(entry.size).toBe(5);
      expect(await readFileFromDisk(join(dir, "new.txt"), "utf8")).toBe("hello");
    });

    it("round-trips through readFile", async () => {
      const caller = createCaller(makeCtx());
      await caller.workspace.writeFile({
        id: "w1",
        path: "sub/round.md",
        content: "# round\ntrip é\n"
      });
      const result = await caller.workspace.readFile({
        id: "w1",
        path: "sub/round.md"
      });
      expect(result.content).toBe("# round\ntrip é\n");
      expect(result.truncated).toBe(false);
    });

    it("overwrites an existing file", async () => {
      await writeFile(join(dir, "over.txt"), "old", "utf8");
      const caller = createCaller(makeCtx());
      await caller.workspace.writeFile({
        id: "w1",
        path: "over.txt",
        content: "new"
      });
      expect(await readFileFromDisk(join(dir, "over.txt"), "utf8")).toBe("new");
    });

    it("refuses content past the 2 MiB cap and writes nothing", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({
          id: "w1",
          path: "huge.txt",
          content: "a".repeat(MAX_TEXT_FILE_BYTES + 1)
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        readFileFromDisk(join(dir, "huge.txt"), "utf8")
      ).rejects.toThrow();
    });

    it("rejects absolute paths", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({
          id: "w1",
          path: "/etc/evil",
          content: "x"
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects path traversal and writes nothing outside the root", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({ id: "w1", path: "../x", content: "x" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        readFileFromDisk(join(dir, "..", "x"), "utf8")
      ).rejects.toThrow();
    });

    it("refuses to overwrite a directory", async () => {
      await mkdir(join(dir, "sub"), { recursive: true });
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({ id: "w1", path: "sub", content: "x" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("refuses an unmanaged workspace in production", async () => {
      process.env.NODETOOL_ENV = "production";
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({ id: "w1", path: "a.txt", content: "x" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses a workspace whose folder is gone", async () => {
      findMock().mockResolvedValue(
        makeRow({ path: dir, is_accessible: false })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({ id: "w1", path: "a.txt", content: "x" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when the workspace does not exist", async () => {
      findMock().mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.writeFile({ id: "gone", path: "a.txt", content: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workspace.writeFile({ id: "w1", path: "a.txt", content: "x" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});
