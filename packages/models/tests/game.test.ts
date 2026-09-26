import { beforeEach, describe, expect, it } from "vitest";
import { AmbiguousGameIdError, Game, initTestDb } from "../src/index.js";

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
    expect((await Game.publish(USER, game.id, game.current_revision, next))?.current_revision).toBe(next);
    expect(await Game.publish(USER, game.id, game.current_revision, "c".repeat(32))).toBeNull();
  });
});
