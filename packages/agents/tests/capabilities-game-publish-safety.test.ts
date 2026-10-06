import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { AnyGameDocument as GameDocument } from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const USER = "publication-safety-owner";
const PROJECT = "publication-safety-project";
let directory: string;
interface Reply { game: { id: string; revision: string }; document: GameDocument; draft_updated_at: string }
function run() {
  return createCapabilityRun({ context: { userId: USER } as ProcessingContext, gate: UNGATED });
}
async function create() {
  const agent = run();
  const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "Reviewed room" }) as Reply;
  const opened = await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as Reply;
  return { agent, created, opened };
}
async function workspace() {
  const [row] = await Workspace.listByProject(USER, PROJECT);
  const result = row && workspaceFromRow(row);
  if (!result) { throw new Error("Missing workspace"); }
  return result;
}
describe("native game publication safety", () => {
  beforeEach(async () => {
    initTestDb();
    directory = await mkdtemp(join(tmpdir(), "native-game-publish-safety-"));
    await Project.insertNew({ id: PROJECT, user_id: USER, name: "Game", kind: "game" });
    await Workspace.create({ user_id: USER, project_id: PROJECT, name: "Files", path: directory, is_default: false });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    ModelObserver.clear();
    await rm(directory, { recursive: true, force: true });
  });
  it("F6 requires the caller draft token for an explicit document", async () => {
    const { agent, created, opened } = await create();
    expect(await agent.invoke("publish_native_game", { game_id: created.game.id,
      base_revision: created.game.revision, document: opened.document })).toHaveProperty("error");
    expect((await agent.invoke("get_native_game", { game_id: created.game.id, source: "revision", view: "full" }) as Reply).game.revision)
      .toBe(created.game.revision);
  });
  it("F6 rejects an explicit document whose caller token predates a saved edit", async () => {
    const { agent, created, opened } = await create();
    const edited = await agent.invoke("edit_native_game", { game_id: created.game.id, base_updated_at: opened.draft_updated_at,
      ops: [{ op: "update_scene", scene_id: opened.document.entrySceneId, set: { name: "Newer saved edit" } }] }) as Reply;
    expect(await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision,
      base_updated_at: opened.draft_updated_at, document: opened.document })).toHaveProperty("error");
    expect((await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as Reply).document).toEqual(edited.document);
  });
  it("returns the draft token captured with the document when an edit arrives during get", async () => {
    const { agent, created, opened } = await create();
    const readDraft = Game.readDraft;
    let injectEdit = true;
    vi.spyOn(Game, "readDraft").mockImplementation(async (...args) => {
      if (injectEdit) {
        injectEdit = false;
        await Game.updateDraft(USER, created.game.id, opened.draft_updated_at,
          [{ op: "update_scene", scene_id: opened.document.entrySceneId, set: { name: "Fresh read" } }], args[2]);
      }
      return readDraft.apply(Game, args);
    });
    const current = await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as Reply;
    expect(current.document.scenes[0].name).toBe("Fresh read");
    expect(current.draft_updated_at).toBe((await Game.findOwned(USER, created.game.id))?.draft_updated_at);
    expect(current.draft_updated_at).not.toBe(opened.draft_updated_at);
  });
  it("F6 uses the same captured current-draft document and token", async () => {
    const { agent, created, opened } = await create();
    const storage = await workspace();
    const game = await Game.findOwned(USER, created.game.id);
    if (!game) { throw new Error("Missing game"); }
    const revisionPaths = async () => (await storage.list(`${game.source_root}/revisions/`, { recursive: true }))
      .map((entry) => entry.path).sort();
    const revisionsBefore = await revisionPaths();
    const readDraft = Game.readDraft;
    let injectEdit = true;
    vi.spyOn(Game, "readDraft").mockImplementation(async (...args) => {
      const captured = await readDraft.apply(Game, args);
      if (injectEdit && captured) {
        injectEdit = false;
        await Game.updateDraft(USER, created.game.id, captured.game.draft_updated_at,
          [{ op: "update_scene", scene_id: opened.document.entrySceneId, set: { name: "Concurrent edit" } }], args[2]);
      }
      return captured;
    });
    expect(await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision }))
      .toHaveProperty("error");
    expect((await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as Reply).document.scenes[0].name)
      .toBe("Concurrent edit");
    expect(await revisionPaths()).toEqual(revisionsBefore);
  });
  it("returns the publication conflict when losing-revision cleanup fails", async () => {
    const { agent, created } = await create();
    const storage = await workspace();
    const originalDelete = storage.delete;
    let revisionCleanupAttempted = false;
    vi.spyOn(Game, "publish").mockResolvedValue(null);
    vi.spyOn(Object.getPrototypeOf(storage), "delete").mockImplementation(async (...args: Parameters<typeof storage.delete>) => {
      if (args[0].includes("/revisions/")) {
        revisionCleanupAttempted = true;
        throw new Error("Losing-revision cleanup failure");
      }
      return originalDelete.apply(storage, args);
    });
    expect(await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision }))
      .toHaveProperty("error", "Game was modified concurrently");
    expect(revisionCleanupAttempted).toBe(true);
  });
  it("F20 publishes without writing the obsolete draft mirror", async () => {
    const { agent, created } = await create();
    const storage = await workspace();
    const originalWrite = storage.write;
    let mirrorAttempts = 0;
    vi.spyOn(Object.getPrototypeOf(storage), "write").mockImplementation(async (...args: Parameters<typeof storage.write>) => {
      if (args[0].endsWith("/draft.json")) {
        mirrorAttempts += 1;
        throw new Error("Post-commit storage failure");
      }
      return originalWrite.apply(storage, args);
    });
    const published = await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision }) as Reply;
    expect(published).not.toHaveProperty("error");
    expect(mirrorAttempts).toBe(0);
    expect(published.game.revision).not.toBe(created.game.revision);
    expect((await agent.invoke("get_native_game", { game_id: created.game.id, source: "revision", view: "full" }) as Reply).game.revision)
      .toBe(published.game.revision);
  });
  it("reports success when revision pruning fails after publication commits", async () => {
    const { agent, created } = await create();
    vi.spyOn(Game, "pruneRevisionFiles").mockRejectedValue(new Error("Cleanup failure"));
    const published = await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision }) as Reply;
    expect(published).not.toHaveProperty("error");
    expect((await Game.findOwned(USER, created.game.id))?.current_revision).toBe(published.game.revision);
  });
  it("publishes an explicit 3D document with its paired draft token", async () => {
    const agent = run();
    const created = await agent.invoke("create_native_game", { project_id: PROJECT, name: "3D room", dimension: "3d" }) as Reply;
    const opened = await agent.invoke("get_native_game", { game_id: created.game.id, view: "full" }) as Reply;
    const published = await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision,
      document: opened.document, base_updated_at: opened.draft_updated_at }) as Reply;
    expect(published).not.toHaveProperty("error");
    expect(published.document.schemaVersion).toBe(3);
    expect(published.game.revision).not.toBe(created.game.revision);
  });
  it("F27 does not create extra draft files after publication", async () => {
    const { agent, created } = await create();
    const storage = await workspace();
    const existingGame = await Game.findOwned(USER, created.game.id);
    if (!existingGame) { throw new Error("Missing game"); }
    const draftPrefix = `${existingGame.source_root}/drafts/`;
    const beforePaths = (await storage.list(draftPrefix, { recursive: true })).map((entry) => entry.path).sort();
    const published = await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision }) as Reply;
    expect(published).not.toHaveProperty("error");
    expect(published.game.revision).not.toBe(created.game.revision);
    const game = await Game.findOwned(USER, created.game.id);
    if (!game) { throw new Error("Missing game"); }
    const afterPaths = (await storage.list(draftPrefix, { recursive: true })).map((entry) => entry.path).sort();
    expect((await storage.list(game.source_root, { recursive: true })).length).toBeGreaterThan(0);
    expect(afterPaths).toEqual(beforePaths);
  });
});
