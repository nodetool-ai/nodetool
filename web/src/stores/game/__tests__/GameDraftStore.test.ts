import { gameDocument } from "@nodetool-ai/protocol";
import { describe, expect, it } from "@jest/globals";
import { applyGameOps, createTopDownRoomGame, type GameDocumentOp } from "@nodetool-ai/game-runtime";

import { getGameDraftStore } from "../GameDraftStore";

describe("native game draft saves", () => {
  it("retains a script keystroke made while an earlier save is in flight", () => {
    const gameId = "script-save-race";
    const document = createTopDownRoomGame(gameId);
    document.scenes[0].entities[1].behaviors.push({ kind: "script", source: "({ state }) => ({ state, commands: [] })", maxCommands: 16, maxTickMs: 8 });
    const store = getGameDraftStore(gameId);
    store.getState().load(document, "first");
    const first: GameDocumentOp = { op: "set_script", scene_id: "room", entity_id: "player", index: 2,
      source: "({ state }) => ({ state, commands: [{ kind: 'emit', event: 'first' }] })" };
    const second: GameDocumentOp = { ...first,
      source: "({ state }) => ({ state, commands: [{ kind: 'emit', event: 'second' }] })" };

    store.getState().apply([first]);
    store.getState().setSaving(1);
    store.getState().apply([second]);
    expect(store.getState().pendingOps).toEqual([first, second]);

    store.getState().acknowledge(applyGameOps(document, [first]), "second", 1);
    expect(store.getState().pendingOps).toEqual([second]);
    expect(store.getState().saveStatus).toBe("unsaved");
    expect(gameDocument.parse(store.getState().document).scenes[0].entities[1].behaviors[2]).toMatchObject({ source: second.source });
  });

  it("keeps a different entity edit made during an in-flight save", () => {
    const gameId = "entity-save-race";
    const document = createTopDownRoomGame(gameId);
    const store = getGameDraftStore(gameId);
    store.getState().load(document, "first");
    const player: GameDocumentOp = { op: "update_entity", scene_id: "room", entity_id: "player", set: { transform2d: { x: 1 } } };
    const gem: GameDocumentOp = { op: "update_entity", scene_id: "room", entity_id: "gem", set: { transform2d: { x: 4 } } };
    store.getState().apply([player]);
    store.getState().setSaving(1);
    store.getState().apply([gem]);

    store.getState().acknowledge(applyGameOps(document, [player]), "second", 1);
    expect(store.getState().pendingOps).toEqual([gem]);
    expect(gameDocument.parse(store.getState().document).scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.x).toBe(1);
    expect(gameDocument.parse(store.getState().document).scenes[0].entities.find((entity) => entity.id === "gem")?.transform2d.x).toBe(4);
  });

  it("does not undo an agent merge when the user invokes local undo", () => {
    const document = createTopDownRoomGame("merge-undo");
    const store = getGameDraftStore("merge-undo");
    store.getState().load(document, "first");
    store.getState().apply([{ op: "update_entity", scene_id: "room", entity_id: "player", set: { transform2d: { x: 2 } } }]);
    const server = applyGameOps(document, [{ op: "update_entity", scene_id: "room", entity_id: "gem", set: { transform2d: { x: 4 } } }]);
    const local = applyGameOps(server, [{ op: "update_entity", scene_id: "room", entity_id: "player", set: { transform2d: { x: 2 } } }]);
    store.getState().applyMerged(local, server, "second");
    store.getState().undo();
    expect(gameDocument.parse(store.getState().document).scenes[0].entities.find((entity) => entity.id === "gem")?.transform2d.x).toBe(4);
  });
});
