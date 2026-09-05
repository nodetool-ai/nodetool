import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool-ai/models — the router orchestrates Workspace static methods +
// filesystem calls; we stub those here to keep tests hermetic.
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workspace: {
      ...actual.Workspace,
      find: vi.fn(),
      paginate: vi.fn(),
      hasLinkedWorkflows: vi.fn(),
      unsetOtherDefaults: vi.fn(),
      ensureDefault: vi.fn(),
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

/**
 * The unmocked module. `afterEach`'s `restoreAllMocks` strips any
 * implementation the mock factory supplied, so the default is re-bound in
 * `beforeEach` instead.
 */
const realFsPromises =
  await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

import { Workspace } from "@nodetool-ai/models";
import { stat, readdir, access } from "node:fs/promises";
import {
  mkdtemp as realMkdtemp,
  mkdir as realMkdir,
  rm as realRm,
  writeFile as realWriteFile
} from "node:fs/promises";
import { tmpdir as realTmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { basename } from "node:path";

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
  is_managed?: boolean;
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
    isManaged: vi.fn().mockReturnValue(opts.is_managed ?? false),
    // listFiles reads through the Workspace `workspaceFromRow` builds; an
    // absolute path means a local one.
    isVirtual: vi.fn().mockReturnValue(!opts.path?.startsWith("/") ?? false),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
  return ws;
}

/**
 * Let the fs spies through to the real implementation for one test. Only the
 * cases that populate a real temp directory want this: the consolidated
 * FileStorageAdapter reads through node:fs/promises, and the module mock's
 * default `vi.fn()` resolves to undefined. Left global it would make every
 * other case depend on whatever exists on the host.
 */
function useRealFs(): void {
  vi.mocked(stat).mockImplementation(realFsPromises.stat);
  vi.mocked(readdir).mockImplementation(realFsPromises.readdir);
  vi.mocked(access).mockImplementation(realFsPromises.access);
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
    it("rejects creating a workspace when NODETOOL_ENV=production", async () => {
      process.env.NODETOOL_ENV = "production";
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.create({ name: "n", path: "/tmp", is_default: false })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lists only the managed workspace and reports can_manage false", async () => {
      process.env.NODETOOL_ENV = "production";
      const managed = makeWorkspace({ id: "managed", is_managed: true });
      const local = makeWorkspace({ id: "local", is_managed: false });
      (Workspace.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [managed, local],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.list({ limit: 10 });
      expect(result.workspaces.map((w) => w.id)).toEqual(["managed"]);
      expect(result.can_manage).toBe(false);
    });

    it("refuses to list files of a workspace it does not manage", async () => {
      process.env.NODETOOL_ENV = "production";
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeWorkspace({ id: "local", is_managed: false })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.listFiles({ id: "local", path: "." })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
      expect(result.can_manage).toBe(true);
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

    it("creates the default workspace before listing", async () => {
      (Workspace.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);
      const caller = createCaller(makeCtx());
      await caller.workspace.list({});
      expect(Workspace.ensureDefault).toHaveBeenCalledWith("user-1");
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workspace.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
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
      // update now validates the new path exactly like create.
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        isDirectory: () => true
      });
      (access as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

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

    it("rejects a non-existent path on update (validation now enforced)", async () => {
      const ws = makeWorkspace({ id: "w1", name: "Old", path: "/old" });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.update({ id: "w1", path: "/etc" })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(ws.save).not.toHaveBeenCalled();
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
  //
  // These run against a real temp directory rather than mocked `readdir`/
  // `stat`: the router reads through the run's `Workspace` now, so mocking
  // `node:fs` would test nothing the router still calls.
  describe("listFiles", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await realMkdtemp(join(realTmpdir(), "trpc-ws-list-"));
    });

    afterEach(async () => {
      await realRm(dir, { recursive: true, force: true });
    });

    it("lists entries in the workspace root", async () => {
      useRealFs();
      await realWriteFile(join(dir, "file.txt"), "x".repeat(123));
      await realMkdir(join(dir, "sub"), { recursive: true });
      await realWriteFile(join(dir, "sub", "inner.txt"), "y");

      const ws = makeWorkspace({ id: "w1", path: dir });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      const result = await caller.workspace.listFiles({ id: "w1", path: "." });
      expect(result).toHaveLength(2);
      const file = result.find((f) => f.name === "file.txt");
      expect(file?.size).toBe(123);
      expect(file?.is_dir).toBe(false);
      const sub = result.find((f) => f.name === "sub");
      expect(sub?.is_dir).toBe(true);
    });

    it("defaults path to '.'", async () => {
      useRealFs();
      const ws = makeWorkspace({ id: "w1", path: dir });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      expect(await caller.workspace.listFiles({ id: "w1" })).toEqual([]);
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
      // A writable path: constructing the adapter now creates its root (see
      // the note on the NOT_FOUND case below), so a fixture the process
      // cannot mkdir fails with EACCES before the assertion is reached.
      const ws = makeWorkspace({ id: "w1", path: join(dir, "ws-traversal") });
      (Workspace.find as ReturnType<typeof vi.fn>).mockResolvedValue(ws);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workspace.listFiles({ id: "w1", path: "../../../etc" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws NOT_FOUND when directory does not exist on disk", async () => {
      // `path` must be writable: `FileStorageAdapter`'s constructor calls
      // `mkdirSync(root, { recursive: true })`. The runtime adapter this
      // branch consolidated away only resolved the path, so a read used to
      // touch nothing. "Does not exist on disk" is still what this asserts —
      // the listing itself is what fails, via the rejected readdir below.
      const ws = makeWorkspace({ id: "w1", path: join(dir, "ws-missing") });
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
