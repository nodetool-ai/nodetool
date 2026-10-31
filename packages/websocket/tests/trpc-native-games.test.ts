import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { nativeGameDocument } from "@nodetool-ai/protocol/native-game";
import { nativeGamesRouter } from "../src/trpc/routers/nativeGames.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("../src/lib/native-game-worker.js", () => ({ NativeGameWorker: class {
  constructor(options: { executable: string }) { workers(options); }
  async request(operation: string, input: Record<string, unknown> = {}) {
    if (operation === "validate") { nativeGameDocument.parse(input.document); }
    return {};
  }
  close() {}
} }));
const workers = vi.hoisted(() => vi.fn());
const executable = vi.hoisted(() => vi.fn(() => "/installed/native-game-worker"));
vi.mock("@nodetool-ai/game-runtime/native", async (original) => ({ ...await original<object>(), nativeCppExecutable: executable }));
const caller = (userId: string) => createCallerFactory(nativeGamesRouter)({ userId } as Context);
let directory: string;
let workspaceId: string;
const previousWorker = process.env.NODETOOL_NATIVE_GAME_WORKER;
beforeEach(async () => {
  initTestDb();
  directory = await mkdtemp(join(tmpdir(), "nodetool-native-game-"));
  await Project.insertNew({ id: "project", user_id: "owner", name: "Games", kind: "game" });
  const row = await Workspace.create({ user_id: "owner", project_id: "project", name: "Games", path: directory, is_default: false });
  workspaceId = row.id;
  process.env.NODETOOL_NATIVE_GAME_WORKER = "test-worker";
});
afterEach(async () => {
  if (previousWorker === undefined) { delete process.env.NODETOOL_NATIVE_GAME_WORKER; }
  else { process.env.NODETOOL_NATIVE_GAME_WORKER = previousWorker; }
  await rm(directory, { recursive: true, force: true });
});
describe("native game routes", () => {
  it("creates and saves with an installed worker when the environment override is absent", async () => {
    delete process.env.NODETOOL_NATIVE_GAME_WORKER;
    const document = nativeGameDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "candidate", title: "Installed", initialSceneId: "scene", scenes: [{ id: "scene" }] });
    const created = await caller("owner").create({ projectId: "project", workspaceId, document });
    await caller("owner").save({ id: created.id, expectedRevision: 0, document: { ...created, revision: 1 } });
    expect(executable).toHaveBeenCalledWith("worker");
    expect(workers).toHaveBeenLastCalledWith({ executable: "/installed/native-game-worker" });
  });
  it("reports unavailable installed execution as a precondition failure", async () => {
    executable.mockImplementationOnce(() => { throw new Error("missing installed worker"); });
    const document = nativeGameDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "candidate", title: "Unavailable", initialSceneId: "scene", scenes: [{ id: "scene" }] });
    await expect(caller("owner").create({ projectId: "project", workspaceId, document })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("authorizes full and compact IDs, preserves native fields, and rejects stale writes", async () => {
    const document = nativeGameDocument.parse({ schemaVersion: 4, engine: "native-cpp-1", dimension: "3d", id: "candidate",
      title: "Course", initialSceneId: "scene", scenes: [{ id: "scene" }], scripts: [{ id: "script", source: "({onStart(){}})" }] });
    const created = await caller("owner").create({ projectId: "project", workspaceId, document });
    expect(created.id).toMatch(/^[a-f0-9]{32}$/);
    expect(await caller("owner").get({ id: created.id.slice(0, 12) })).toEqual(created);
    await expect(caller("other").get({ id: created.id })).rejects.toThrow("not found");
    const saved = await caller("owner").save({ id: created.id, expectedRevision: 0, document: { ...created, revision: 1, title: "Changed" } });
    expect(saved.scripts).toEqual(created.scripts);
    expect(await caller("owner").get({ id: created.id })).toEqual(saved);
    await expect(caller("owner").save({ id: created.id, expectedRevision: 0, document: { ...created, revision: 1 } })).rejects.toThrow("revision changed");
    await expect(caller("other").create({ projectId: "project", workspaceId, document })).rejects.toThrow("not found");
  });
});
