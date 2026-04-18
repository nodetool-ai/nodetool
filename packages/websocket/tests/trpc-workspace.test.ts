import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WorkspaceResponse } from "@nodetool/protocol/api-schemas/workspace.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool/models — the router orchestrates Workspace static methods +
// filesystem calls; we stub those here to keep tests hermetic.
vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Workspace: {
      ...actual.Workspace,
      find: vi.fn(),
      paginate: vi.fn(),
      getDefault: vi.fn(),
      hasLinkedWorkflows: vi.fn(),
      unsetOtherDefaults: vi.fn(),
      create: vi.fn()
    }
  };
});

// Mock node:fs/promises and node:fs for path-validation branches.
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: vi.fn(),
    readdir: vi.fn(),
    access: vi.fn()
  };
});
vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn()
  };
});

import { Workspace } from "@nodetool/models";
import { stat, readdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";

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

/** Build a Workspace model stub with the methods exercised by the router. */
function makeWorkspace(opts: {
  id?: string;
  user_id?: string;
  name?: string;
  path?: string;
  is_default?: boolean;
  is_accessible?: boolean;
  created_at?: string;
  updated_at?: string;
}) {
  const ws = {
    id: opts.id ?? "ws-1",
    user_id: opts.user_id ?? "user-1",
    name: opts.name ?? "My Workspace",
    path: opts.path ?? "/home/user/workspace",
    is_default: opts.is_default ?? false,
    created_at: opts.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: opts.updated_at ?? "2026-01-01T00:00:00Z",
    isAccessible: vi.fn().mockReturnValue(opts.is_accessible ?? true),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
  return ws;
}

describe("workspace router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure tests run in non-production (the router rejects in prod).
    delete process.env.NODETOOL_ENV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── production gate ─────────────────────────────────────────────
  describe("production mode", () => {
    it("rejects with FORBIDDEN when NODETOOL_ENV=production", async () => {
      process.env.NODETOOL_ENV = "production";
      const caller = createCaller(makeCtx());
      await expect(caller.workspace.list({ limit: 10 })).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
    });
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns paginated workspaces", async () => {
      const ws = makeWorkspace({ id: "w1", name: "Alpha" });
      (Workspace.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [ws],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.list({ limit: 10 });
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0]?.id).toBe("w1");
      expect(result.workspaces[0]?.name).toBe("Alpha");
      expect(result.workspaces[0]?.is_accessible).toBe(true);
      expect(result.next).toBeNull();
    });

    it("defaults limit to 50", async () => {
      (Workspace.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);
      const caller = createCaller(makeCtx());
      await caller.workspace.list({});
      expect(Workspace.paginate).toHaveBeenCalledWith("user-1", { limit: 50 });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workspace.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── getDefault ──────────────────────────────────────────────────
  describe("getDefault", () => {
    it("returns the default workspace when one exists", async () => {
      const ws = makeWorkspace({ id: "default", is_default: true });
      (Workspace.getDefault as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.getDefault();
      expect(result).not.toBeNull();
      expect((result as WorkspaceResponse).id).toBe("default");
      expect((result as WorkspaceResponse).is_default).toBe(true);
    });

    it("returns null when no default workspace is set", async () => {
      (Workspace.getDefault as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      const result = await caller.workspace.getDefault();
      expect(result).toBeNull();
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns a workspace by id", async () => {
      const ws = makeWorkspace({ id: "w1" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.get({ id: "w1" });
      expect(result.id).toBe("w1");
    });

    it("throws NOT_FOUND when workspace does not exist", async () => {
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.get({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── create ──────────────────────────────────────────────────────
  describe("create", () => {
    it("creates a workspace when path is valid", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        isDirectory: () => true
      });
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const ws = makeWorkspace({
        id: "new-ws",
        name: "New",
        path: "/home/user/ws"
      });
      (Workspace.create as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.create({
        name: "New",
        path: "/home/user/ws"
      });
      expect(Workspace.create).toHaveBeenCalledWith({
        user_id: "user-1",
        name: "New",
        path: "/home/user/ws",
        is_default: false
      });
      expect(result.id).toBe("new-ws");
    });

    it("unsets other defaults when is_default is true", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        isDirectory: () => true
      });
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (Workspace.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeWorkspace({ is_default: true })
      );

      const caller = createCaller(makeCtx());
      await caller.workspace.create({
        name: "Default",
        path: "/home/user/ws",
        is_default: true
      });
      expect(Workspace.unsetOtherDefaults).toHaveBeenCalledWith("user-1");
    });

    it("throws INVALID_INPUT when path is relative", async () => {
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.create({ name: "x", path: "relative/path" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws INVALID_INPUT when path does not exist", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.create({ name: "x", path: "/does/not/exist" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws INVALID_INPUT when path is not a directory", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        isDirectory: () => false
      });
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.create({ name: "x", path: "/some/file" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws INVALID_INPUT when path is not writable", async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        isDirectory: () => true
      });
      (access as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("EACCES")
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.create({ name: "x", path: "/read/only" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // ── update ──────────────────────────────────────────────────────
  describe("update", () => {
    it("updates name and path", async () => {
      const ws = makeWorkspace({ id: "w1", name: "Old", path: "/old" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.update({
        id: "w1",
        name: "New",
        path: "/new"
      });
      expect(ws.name).toBe("New");
      expect(ws.path).toBe("/new");
      expect(ws.save).toHaveBeenCalled();
      expect(result.name).toBe("New");
      expect(result.path).toBe("/new");
    });

    it("unsets other defaults when setting is_default=true", async () => {
      const ws = makeWorkspace({ id: "w1", is_default: false });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      await caller.workspace.update({ id: "w1", is_default: true });
      expect(Workspace.unsetOtherDefaults).toHaveBeenCalledWith("user-1");
      expect(ws.is_default).toBe(true);
    });

    it("throws NOT_FOUND when workspace does not exist", async () => {
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.update({ id: "missing", name: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── delete ──────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes an unlinked workspace", async () => {
      const ws = makeWorkspace({ id: "w1" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);
      (Workspace.hasLinkedWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue(
        false
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.delete({ id: "w1" });
      expect(ws.delete).toHaveBeenCalled();
      expect(result.message).toMatch(/deleted/i);
    });

    it("throws INVALID_INPUT when the workspace has linked workflows", async () => {
      const ws = makeWorkspace({ id: "w1" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);
      (Workspace.hasLinkedWorkflows as ReturnType<typeof vi.fn>).mockResolvedValue(
        true
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.delete({ id: "w1" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("throws NOT_FOUND when workspace does not exist", async () => {
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.delete({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── listFiles ───────────────────────────────────────────────────
  describe("listFiles", () => {
    it("lists entries in the workspace root", async () => {
      const ws = makeWorkspace({ id: "w1", path: "/home/user/ws" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);
      (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        "file.txt",
        "sub"
      ]);
      const mtime = new Date("2026-04-01T12:00:00Z");
      (stat as ReturnType<typeof vi.fn>).mockImplementation(
        (p: string) =>
          Promise.resolve({
            isDirectory: () => p.endsWith("/sub"),
            size: p.endsWith("/file.txt") ? 123 : 0,
            mtime
          })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.listFiles({
        id: "w1",
        path: "."
      });
      expect(result).toHaveLength(2);
      const file = result.find((f) => f.name === "file.txt");
      expect(file?.size).toBe(123);
      expect(file?.is_dir).toBe(false);
      const sub = result.find((f) => f.name === "sub");
      expect(sub?.is_dir).toBe(true);
    });

    it("defaults path to '.'", async () => {
      const ws = makeWorkspace({ id: "w1", path: "/home/user/ws" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);
      (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.listFiles({ id: "w1" });
      expect(result).toEqual([]);
    });

    it("throws NOT_FOUND when workspace does not exist", async () => {
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.listFiles({ id: "missing", path: "." })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects absolute paths", async () => {
      const ws = makeWorkspace({ id: "w1", path: "/home/user/ws" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.listFiles({ id: "w1", path: "/etc/passwd" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects path traversal attempts", async () => {
      const ws = makeWorkspace({ id: "w1", path: "/home/user/ws" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.listFiles({ id: "w1", path: "../../../etc" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when directory does not exist on disk", async () => {
      const ws = makeWorkspace({ id: "w1", path: "/home/user/ws" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);
      (readdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENOENT")
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.listFiles({ id: "w1", path: "nonexistent-subdir" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
