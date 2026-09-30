import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { AmbiguousGameIdError, Game, initTestDb } from "../src/index.js";
import { gameDocument3D } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

const USER = "game-owner";
const PREFIX = "0123456789ab";

async function insert(id: string): Promise<Game> {
  const game = await Game.insertNew({
    id,
    userId: USER,
    projectId: "project",
    workspaceId: "workspace",
    name: "Room",
    revision: "a".repeat(32)
  });
  if (!game) throw new Error("Game insertion failed");
  return game;
}

describe("game revision pointer", () => {
  beforeEach(() => initTestDb());

  it("resolves only a unique authorized 12-character prefix", async () => {
    const first = await insert(`${PREFIX}${"1".repeat(20)}`);
    expect((await Game.findOwned(USER, PREFIX))?.id).toBe(first.id);
    expect(await Game.findOwned("other-user", PREFIX)).toBeNull();
    await insert(`${PREFIX}${"2".repeat(20)}`);
    await expect(Game.findOwned(USER, PREFIX)).rejects.toBeInstanceOf(AmbiguousGameIdError);
    expect(await Game.findOwned(USER, PREFIX.slice(0, 11))).toBeNull();
  });

  it("publishes with compare-and-swap", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const next = "b".repeat(32);
    expect((await Game.publish(USER, game.id, game.current_revision, next, undefined, undefined, "First release"))?.current_revision).toBe(next);
    expect(await Game.publish(USER, game.id, game.current_revision, "c".repeat(32), undefined, undefined, "Stale release")).toBeNull();
    expect(await Game.listRevisionMessages(USER, game.id)).toEqual(new Map([[next, "First release"]]));
  });

  it("saves and records whole-document replacements with an undo source", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    const replacement = { ...original, pixelsPerUnit: 48 };
    const updated = await Game.updateDraft(USER, PREFIX, game.draft_updated_at,
      [{ op: "set_document", document: replacement }], workspace, { actor: "agent" });
    expect(updated?.document.schemaVersion === 3 ? undefined : updated?.document.pixelsPerUnit).toBe(48);
    const reopened = await Game.readDraft(USER, PREFIX, workspace);
    expect(reopened?.document.schemaVersion === 3 ? undefined : reopened?.document.pixelsPerUnit).toBe(48);
    const changes = await Game.listDraftChanges(USER, PREFIX);
    expect(changes).toHaveLength(1);
    expect(changes[0].summary).toBe("Replaced game document (1)");
    expect(changes[0].affectedEntityIds).toEqual(original.scenes[0].entities.map((entity) => entity.id));
    expect(await Game.readDraftBeforeChange(USER, PREFIX, changes[0].id, workspace)).toEqual(original);
  });

  it("applies a rebuild once against the exact preview draft", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = { ...createTopDownRoomGame(game.id), revision: game.current_revision };
    const publishedPath = `${game.source_root}/revisions/${game.current_revision}/game.json`;
    const files = new Map([[publishedPath, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    const draft = await Game.readDraft(USER, game.id, workspace);
    if (!draft) { throw new Error("Missing draft"); }
    const digest = createHash("sha256").update(JSON.stringify(draft.document)).digest("hex");
    const replacement = { ...original, pixelsPerUnit: 48 };
    expect(await Game.applyAuthoringCandidate(USER, game.id, game.draft_updated_at,
      "0".repeat(64), replacement, workspace)).toBeNull();
    expect(files.size).toBe(1);
    const saved = await Game.applyAuthoringCandidate(USER, game.id, game.draft_updated_at,
      digest, replacement, workspace);
    expect(saved?.document.schemaVersion === 3 ? undefined : saved?.document.pixelsPerUnit).toBe(48);
    expect(await Game.applyAuthoringCandidate(USER, game.id, game.draft_updated_at,
      digest, replacement, workspace)).toBeNull();
    expect(files.get(publishedPath)).toBe(JSON.stringify(original));
    const changes = await Game.listDraftChanges(USER, game.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].actor).toBe("agent");
    expect(changes[0].summary).toBe("Rebuilt retained game");
    expect(await Game.readDraftBeforeChange(USER, game.id, changes[0].id, workspace)).toEqual(draft.document);
  });
  it("round-trips 3D drafts, operations, full IDs and undo without changing revisions", async () => {
    const game = await insert(`${PREFIX}${"1".repeat(20)}`);
    const original = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: game.id,
      revision: game.current_revision, entrySceneId: "scene", tickRate: 60, presentation: { aspectRatio: 16 / 9, hudWidth: 1280, hudHeight: 720 },
      inputActions: [], assets: {}, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [{
        id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } }
      }] }] });
    const files = new Map([[`${game.source_root}/revisions/${game.current_revision}/game.json`, JSON.stringify(original)]]);
    const workspace = {
      readText: async (path: string) => files.get(path) ?? null,
      write: async (path: string, data: string) => { files.set(path, data); },
      delete: async (path: string) => files.delete(path)
    };
    expect((await Game.readDraft(USER, PREFIX, workspace))?.document).toEqual(original);
    const updated = await Game.updateDraft(USER, PREFIX, game.draft_updated_at, [{ op: "update_entity", entity_id: "camera",
      set: { transform3d: { position: { z: 5 } } } }], workspace, { actor: "agent" });
    if (!updated || updated.document.schemaVersion !== 3) { throw new Error("3D update was not saved"); }
    expect(updated.document.id).toBe(game.id);
    expect(updated.document.revision).toBe(original.revision);
    expect(updated.document.scenes[0].entities[0].transform3d.position.z).toBe(5);
    const changes = await Game.listDraftChanges(USER, PREFIX);
    expect(changes[0].affectedEntityIds).toEqual(["camera"]);
    expect(await Game.readDraftBeforeChange(USER, PREFIX, changes[0].id, workspace)).toEqual(original);
    expect(await Game.updateDraft(USER, PREFIX, game.draft_updated_at, [{ op: "update_scene", scene_id: "scene", set: { name: "Stale" } }], workspace)).toBeNull();
    expect(await Game.readDraft("another-user", PREFIX, workspace)).toBeNull();
    const legacy = { ...createTopDownRoomGame(game.id), revision: original.revision };
    await expect(Game.replaceDraft(USER, PREFIX, updated.game.draft_updated_at, legacy, workspace)).rejects.toMatchObject({
      diagnostics: [{ code: "dimension_mismatch" }]
    });
  });

});
