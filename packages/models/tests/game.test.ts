import { beforeEach, describe, expect, it } from "vitest";
import { AmbiguousGameIdError, Game, initTestDb } from "../src/index.js";
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
    expect(updated?.document.pixelsPerUnit).toBe(48);
    expect((await Game.readDraft(USER, PREFIX, workspace))?.document.pixelsPerUnit).toBe(48);
    const changes = await Game.listDraftChanges(USER, PREFIX);
    expect(changes).toHaveLength(1);
    expect(changes[0].summary).toBe("Replaced game document (1)");
    expect(changes[0].affectedEntityIds).toEqual(original.scenes[0].entities.map((entity) => entity.id));
    expect(await Game.readDraftBeforeChange(USER, PREFIX, changes[0].id, workspace)).toEqual(original);
  });
});
