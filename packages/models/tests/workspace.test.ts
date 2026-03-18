import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setGlobalAdapterResolver, ModelObserver } from "../src/base-model.js";
import { MemoryAdapterFactory } from "../src/memory-adapter.js";
import { Workspace } from "../src/workspace.js";
import { Workflow } from "../src/workflow.js";
import type { ModelClass } from "../src/base-model.js";

const factory = new MemoryAdapterFactory();

async function setup() {
  factory.clear();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
  await (Workspace as unknown as ModelClass).createTable();
  await (Workflow as unknown as ModelClass).createTable();
}

describe("Workspace model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "My Workspace",
      path: "/tmp/ws1",
    });
    expect(ws.id).toBeTruthy();
    expect(ws.user_id).toBe("u1");
    expect(ws.name).toBe("My Workspace");
    expect(ws.path).toBe("/tmp/ws1");
    expect(ws.is_default).toBe(false);
    expect(ws.created_at).toBeTruthy();
    expect(ws.updated_at).toBeTruthy();
  });

  it("handles is_default boolean properly", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Default WS",
      path: "/tmp/ws-default",
      is_default: true,
    });
    expect(ws.is_default).toBe(true);
  });

  it("handles numeric is_default from SQLite (0/1 conversion)", () => {
    // Simulates how SQLite stores booleans as 0 or 1
    const ws = new Workspace({
      user_id: "u1",
      name: "Test",
      path: "/tmp/test",
      is_default: 1 as unknown as boolean,
    });
    expect(ws.is_default).toBe(true);

    const ws2 = new Workspace({
      user_id: "u1",
      name: "Test2",
      path: "/tmp/test2",
      is_default: 0 as unknown as boolean,
    });
    expect(ws2.is_default).toBe(false);
  });

  it("beforeSave updates updated_at", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS",
      path: "/tmp/ws",
    });
    const originalUpdatedAt = ws.updated_at;

    // Wait a bit so timestamps differ
    await new Promise((r) => setTimeout(r, 10));
    ws.name = "Updated WS";
    await ws.save();

    expect(ws.updated_at).not.toBe(originalUpdatedAt);
  });

  // ── find ──────────────────────────────────────────────────────────

  it("find returns workspace for correct user", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS1",
      path: "/tmp/ws1",
    });

    const found = await Workspace.find("u1", ws.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(ws.id);
    expect(found!.name).toBe("WS1");
  });

  it("find returns null for wrong user", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS1",
      path: "/tmp/ws1",
    });

    const found = await Workspace.find("other-user", ws.id);
    expect(found).toBeNull();
  });

  it("find returns null for nonexistent workspace", async () => {
    const found = await Workspace.find("u1", "nonexistent-id");
    expect(found).toBeNull();
  });

  // ── paginate ──────────────────────────────────────────────────────

  it("paginate returns workspaces for user", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS1",
      path: "/tmp/ws1",
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS2",
      path: "/tmp/ws2",
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u2",
      name: "WS3",
      path: "/tmp/ws3",
    });

    const [results] = await Workspace.paginate("u1");
    expect(results).toHaveLength(2);
    expect(results.every((w) => w.user_id === "u1")).toBe(true);
  });

  it("paginate respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await (Workspace as unknown as ModelClass<Workspace>).create({
        user_id: "u1",
        name: `WS${i}`,
        path: `/tmp/ws${i}`,
      });
    }

    const [results] = await Workspace.paginate("u1", { limit: 3 });
    expect(results).toHaveLength(3);
  });

  // ── getDefault ────────────────────────────────────────────────────

  it("getDefault returns the default workspace", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Normal",
      path: "/tmp/normal",
      is_default: false,
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Default",
      path: "/tmp/default",
      is_default: true,
    });

    const def = await Workspace.getDefault("u1");
    expect(def).not.toBeNull();
    expect(def!.name).toBe("Default");
    expect(def!.is_default).toBe(true);
  });

  it("getDefault returns null when no default exists", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "Normal",
      path: "/tmp/normal",
      is_default: false,
    });

    const def = await Workspace.getDefault("u1");
    expect(def).toBeNull();
  });

  it("getDefault scopes to user", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u2",
      name: "U2 Default",
      path: "/tmp/u2-default",
      is_default: true,
    });

    const def = await Workspace.getDefault("u1");
    expect(def).toBeNull();
  });

  // ── hasLinkedWorkflows ────────────────────────────────────────────

  it("hasLinkedWorkflows returns false when no workflows linked", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS",
      path: "/tmp/ws",
    });

    const hasWorkflows = await Workspace.hasLinkedWorkflows(ws.id);
    expect(hasWorkflows).toBe(false);
  });

  it("hasLinkedWorkflows returns true when workflows are linked", async () => {
    const ws = await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS",
      path: "/tmp/ws",
    });

    await (Workflow as unknown as ModelClass<Workflow>).create({
      user_id: "u1",
      name: "Test Workflow",
      workspace_id: ws.id,
    });

    const hasWorkflows = await Workspace.hasLinkedWorkflows(ws.id);
    expect(hasWorkflows).toBe(true);
  });

  // ── unsetOtherDefaults ────────────────────────────────────────────

  it("unsetOtherDefaults clears default flag on all user workspaces", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS1",
      path: "/tmp/ws1",
      is_default: true,
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "WS2",
      path: "/tmp/ws2",
      is_default: true,
    });

    await Workspace.unsetOtherDefaults("u1");

    const [workspaces] = await Workspace.paginate("u1");
    expect(workspaces.every((w) => w.is_default === false)).toBe(true);
  });

  it("unsetOtherDefaults does not affect other users", async () => {
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u1",
      name: "U1 Default",
      path: "/tmp/u1",
      is_default: true,
    });
    await (Workspace as unknown as ModelClass<Workspace>).create({
      user_id: "u2",
      name: "U2 Default",
      path: "/tmp/u2",
      is_default: true,
    });

    await Workspace.unsetOtherDefaults("u1");

    const u2Default = await Workspace.getDefault("u2");
    expect(u2Default).not.toBeNull();
    expect(u2Default!.is_default).toBe(true);
  });

  // ── isAccessible ──────────────────────────────────────────────────

  it("isAccessible returns true for existing writable path", async () => {
    const ws = new Workspace({
      user_id: "u1",
      name: "Test",
      path: "/tmp",
    });
    expect(ws.isAccessible()).toBe(true);
  });

  it("isAccessible returns false for non-existent path", async () => {
    const ws = new Workspace({
      user_id: "u1",
      name: "Test",
      path: "/nonexistent/path/that/does/not/exist",
    });
    expect(ws.isAccessible()).toBe(false);
  });
});
