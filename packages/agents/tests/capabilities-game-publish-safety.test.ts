import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Game, ModelObserver, Project, Workspace, initTestDb } from "@nodetool-ai/models";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { GameDocument } from "@nodetool-ai/protocol";
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
describe("S publication interface request for K4", () => {
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
  it("F6 uses the same captured current-draft document and token", async () => {
    const { agent, created, opened } = await create();
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
  });
  it("F20 reports a committed publication as successful when its mirror write fails", async () => {
    const { agent, created } = await create();
    const storage = await workspace();
    const originalWrite = storage.write;
    vi.spyOn(Object.getPrototypeOf(storage), "write").mockImplementation(async (...args: Parameters<typeof storage.write>) => {
      if (args[0].endsWith("/draft.json")) { throw new Error("Post-commit storage failure"); }
      return originalWrite.apply(storage, args);
    });
    const published = await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision }) as Reply;
    expect(published).not.toHaveProperty("error");
    expect(published.game.revision).not.toBe(created.game.revision);
    expect((await agent.invoke("get_native_game", { game_id: created.game.id, source: "revision", view: "full" }) as Reply).game.revision)
      .toBe(published.game.revision);
  });
  it("F27 does not create timestamp-named orphan draft files after publication", async () => {
    const { agent, created } = await create();
    const storage = await workspace();
    await agent.invoke("publish_native_game", { game_id: created.game.id, base_revision: created.game.revision });
    const game = await Game.findOwned(USER, created.game.id);
    if (!game) { throw new Error("Missing game"); }
    const files = await storage.list(`${game.source_root}/drafts/`, { recursive: true });
    expect((await storage.list(game.source_root, { recursive: true })).length).toBeGreaterThan(0);
    expect(files.every((entry) => /^[a-f0-9]{64}\.json$/.test(entry.path.split("/").at(-1) ?? ""))).toBe(true);
  });
});
