/**
 * Tests for the Workspace model.
 *
 * Covers: defaults, beforeSave (updated_at), isAccessible,
 * find, paginate, getDefault, hasLinkedWorkflows, unsetOtherDefaults.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Workspace } from "../src/workspace.js";
import { Workflow } from "../src/workflow.js";
import * as os from "node:os";

const { forceAccessSyncThrow } = vi.hoisted(() => {
  return { forceAccessSyncThrow: { value: false } };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    accessSync: (...args: Parameters<typeof actual.accessSync>) => {
      if (forceAccessSyncThrow.value) {
        throw new Error("Mock: permission denied");
      }
      return actual.accessSync(...args);
    }
  };
});

// ── Setup ────────────────────────────────────────────────────────────

function setup() {
  initTestDb();
}

// ── Helpers ─────────────────────────────────────────────────────────

async function createWorkspace(
  userId: string,
  name: string,
  path = "/tmp/ws",
  isDefault = false
): Promise<Workspace> {
  return Workspace.create<Workspace>({
    user_id: userId,
    name,
    path,
    is_default: isDefault
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Workspace model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const ws = await createWorkspace("u1", "My Workspace");
    expect(ws.id).toBeTruthy();
    expect(ws.user_id).toBe("u1");
    expect(ws.name).toBe("My Workspace");
    expect(ws.path).toBe("/tmp/ws");
    expect(ws.is_default).toBe(false);
    expect(ws.created_at).toBeTruthy();
    expect(ws.updated_at).toBeTruthy();
  });

  it("creates with is_default=true", async () => {
    const ws = await createWorkspace("u1", "Default WS", "/tmp/ws", true);
    expect(ws.is_default).toBe(true);
  });

  it("beforeSave updates updated_at", async () => {
    const ws = await createWorkspace("u1", "WS");
    const original = ws.updated_at;

    // Advance time by at least 1ms
    await new Promise((r) => setTimeout(r, 5));

    ws.name = "Renamed";
    await ws.save();
    expect(ws.updated_at >= original).toBe(true);
  });

  it("isAccessible returns true for an existing writable directory", () => {
    const tmpDir = os.tmpdir();
    const ws = new Workspace({
      user_id: "u1",
      name: "ws",
      path: tmpDir,
      id: "x"
    });
    expect(ws.isAccessible()).toBe(true);
  });

  it("isAccessible returns false for nonexistent path", () => {
    const ws = new Workspace({
      user_id: "u1",
      name: "ws",
      path: "/nonexistent/path/that/does/not/exist",
      id: "x"
    });
    expect(ws.isAccessible()).toBe(false);
  });

  it("coerces legacy numeric is_default values to booleans", () => {
    const ws = new Workspace({
      id: "x",
      user_id: "u1",
      name: "legacy",
      path: "/tmp/ws",
      is_default: 1
    });
    expect(ws.is_default).toBe(true);
  });

  it("isAccessible returns false when accessSync throws", () => {
    const tmpDir = os.tmpdir();
    const ws = new Workspace({
      user_id: "u1",
      name: "ws",
      path: tmpDir,
      id: "x"
    });

    forceAccessSyncThrow.value = true;
    try {
      expect(ws.isAccessible()).toBe(false);
    } finally {
      forceAccessSyncThrow.value = false;
    }
  });

  it("find returns workspace scoped to user", async () => {
    const ws = await createWorkspace("u1", "WS");
    const found = await Workspace.find("u1", ws.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(ws.id);
  });

  it("find returns null for wrong user", async () => {
    const ws = await createWorkspace("u1", "WS");
    const found = await Workspace.find("u2", ws.id);
    expect(found).toBeNull();
  });

  it("find returns null for nonexistent id", async () => {
    const found = await Workspace.find("u1", "nonexistent");
    expect(found).toBeNull();
  });

  it("paginate returns only workspaces for the given user", async () => {
    await createWorkspace("u1", "WS-A");
    await createWorkspace("u1", "WS-B");
    await createWorkspace("u2", "WS-C");

    const [workspaces] = await Workspace.paginate("u1");
    expect(workspaces).toHaveLength(2);
    const names = workspaces.map((w) => w.name).sort();
    expect(names).toEqual(["WS-A", "WS-B"]);
  });

  it("paginate respects limit", async () => {
    await createWorkspace("u1", "WS-A");
    await createWorkspace("u1", "WS-B");
    await createWorkspace("u1", "WS-C");

    const [workspaces] = await Workspace.paginate("u1", { limit: 2 });
    expect(workspaces).toHaveLength(2);
  });

  it("paginate returns a cursor when the limit is exceeded", async () => {
    await createWorkspace("u1", "WS-A");
    await createWorkspace("u1", "WS-B");
    await createWorkspace("u1", "WS-C");

    const [workspaces, cursor] = await Workspace.paginate("u1", { limit: 2 });
    expect(workspaces).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("paginate returns an empty page and empty cursor when limit is zero", async () => {
    await createWorkspace("u1", "WS-A");

    const [workspaces, cursor] = await Workspace.paginate("u1", { limit: 0 });
    expect(workspaces).toEqual([]);
    expect(cursor).toBe("");
  });

  it("paginate returns empty array when user has no workspaces", async () => {
    const [workspaces] = await Workspace.paginate("nobody");
    expect(workspaces).toHaveLength(0);
  });

  it("getDefault returns the default workspace", async () => {
    await createWorkspace("u1", "Regular WS");
    await createWorkspace("u1", "Default WS", "/tmp/ws", true);

    const def = await Workspace.getDefault("u1");
    expect(def).not.toBeNull();
    expect(def!.name).toBe("Default WS");
    expect(def!.is_default).toBe(true);
  });

  it("getDefault returns null when no default is set", async () => {
    await createWorkspace("u1", "Regular WS");
    const def = await Workspace.getDefault("u1");
    expect(def).toBeNull();
  });

  it("getDefault returns null for unknown user", async () => {
    const def = await Workspace.getDefault("nobody");
    expect(def).toBeNull();
  });

  it("hasLinkedWorkflows returns false when no workflows reference the workspace", async () => {
    const ws = await createWorkspace("u1", "WS");
    const result = await Workspace.hasLinkedWorkflows(ws.id);
    expect(result).toBe(false);
  });

  it("hasLinkedWorkflows returns true when a workflow references the workspace", async () => {
    const ws = await createWorkspace("u1", "WS");
    await Workflow.create<Workflow>({
      user_id: "u1",
      name: "Linked Workflow",
      workspace_id: ws.id
    });

    const result = await Workspace.hasLinkedWorkflows(ws.id);
    expect(result).toBe(true);
  });

  it("unsetOtherDefaults clears is_default for all user workspaces", async () => {
    await createWorkspace("u1", "WS-A", "/tmp/a", true);
    await createWorkspace("u1", "WS-B", "/tmp/b", true);
    await createWorkspace("u2", "WS-C", "/tmp/c", true); // different user

    await Workspace.unsetOtherDefaults("u1");

    const [u1Workspaces] = await Workspace.paginate("u1");
    for (const ws of u1Workspaces) {
      expect(ws.is_default).toBe(false);
    }

    // u2's workspace should be unaffected
    const u2Default = await Workspace.getDefault("u2");
    expect(u2Default).not.toBeNull();
    expect(u2Default!.is_default).toBe(true);
  });

  it("unsetOtherDefaults is a no-op when no defaults are set", async () => {
    await createWorkspace("u1", "WS-A");
    await createWorkspace("u1", "WS-B");

    // Should not throw
    await expect(Workspace.unsetOtherDefaults("u1")).resolves.toBeUndefined();
  });
});
