import { expect, it, jest } from "@jest/globals";
import { applyAnyGameOps, createNative3DGame, createTopDownRoomGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import { absorbServerGameDraft, flushGameDraft, pullGameDraft, type DraftSaveFlight } from "../draftSave";
import { getGameDraftStore } from "../GameDraftStore";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it("serializes concurrent flush callers and drains each caller’s latest edits (F14)", async () => {
  const flight: DraftSaveFlight = { current: null };
  const response = deferred();
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const save = jest.fn(async () => {
    calls++;
    active++;
    maximumActive = Math.max(maximumActive, active);
    await response.promise;
    await Promise.resolve();
    active--;
  });
  const first = flushGameDraft(flight, save);
  const second = flushGameDraft(flight, save);
  const third = flushGameDraft(flight, save);
  await Promise.resolve();
  expect(calls).toBe(1);
  response.resolve();
  await Promise.all([first, second, third]);
  expect(calls).toBe(3);
  expect(maximumActive).toBe(1);
  expect(flight.current).toBeNull();
});

it("waits for acknowledgement before pulling a save echo (F5)", async () => {
  const flight: DraftSaveFlight = { current: null };
  const response = deferred();
  const events: string[] = [];
  const save = flushGameDraft(flight, async () => { await response.promise; events.push("acknowledged"); });
  const pull = pullGameDraft(flight, async () => { events.push("pulled"); });
  await Promise.resolve();
  expect(events).toEqual([]);
  response.resolve();
  await Promise.all([save, pull]);
  expect(events).toEqual(["acknowledged", "pulled"]);
});


it("holds the save flight while pulling after two queued saves (F5)", async () => {
  const flight: DraftSaveFlight = { current: null };
  const firstResponse = deferred();
  const secondResponse = deferred();
  const pullResponse = deferred();
  const events: string[] = [];
  const first = flushGameDraft(flight, async () => { await firstResponse.promise; events.push("first"); });
  const second = flushGameDraft(flight, async () => { events.push("second started"); await secondResponse.promise; events.push("second"); });
  const pull = pullGameDraft(flight, async () => { events.push("pull started"); await pullResponse.promise; events.push("pull"); });
  firstResponse.resolve();
  await first;
  await Promise.resolve();
  expect(events).toEqual(["first", "second started"]);
  secondResponse.resolve();
  await second;
  await Promise.resolve();
  const next = flushGameDraft(flight, async () => { events.push("next save"); });
  expect(events).toEqual(["first", "second started", "second", "pull started"]);
  pullResponse.resolve();
  await Promise.all([pull, next]);
  expect(events.at(-1)).toBe("next save");
});

it.each(["2d", "3d"] as const)("keeps edits, saves and undo made while a server asset generation ran (%s)", async (dimension) => {
  const id = `asset-generation-${dimension}`;
  const base: AnyGameDocument = dimension === "2d" ? createTopDownRoomGame(id) : createNative3DGame(id);
  const sceneId = dimension === "2d" ? "room" : base.entrySceneId;
  const rename = (name: string): AnyGameDocumentOp[] => [{ op: "update_entity", scene_id: sceneId, entity_id: "player", set: { name } }];
  const playerName = (): string | undefined => getGameDraftStore(id).getState().document?.scenes
    .find((scene) => scene.id === sceneId)?.entities.find((entity) => entity.id === "player")?.name;
  const bind: AnyGameDocumentOp = dimension === "2d" && base.schemaVersion !== 3
    ? { op: "bind_asset", slot: "player", binding: { ...base.assets.player, digest: "f".repeat(64) } }
    : { op: "bind_asset", slot: "theme", binding: { assetId: "a".repeat(32), digest: "f".repeat(64), mediaKind: "audio" } };
  const store = getGameDraftStore(id);
  store.getState().load(base, "t0");
  const flight: DraftSaveFlight = { current: null };
  const generation = deferred();
  let server = { document: base, game: { draftUpdatedAt: "t0" } };

  // The panel's server edit: the request runs for minutes, then the editor merges the saved draft in.
  const serverEdit = (async () => {
    await generation.promise;
    await pullGameDraft(flight, async () => { absorbServerGameDraft(id, server); });
  })();

  store.getState().apply(rename("Saved during generation"), { label: "Rename" });
  await flushGameDraft(flight, async () => {
    const ops = store.getState().captureSaveOps();
    store.getState().setSaving(ops.length);
    server = { document: applyAnyGameOps(server.document, ops), game: { draftUpdatedAt: "t1" } };
    store.getState().acknowledge(server.document, "t1", ops.length);
  });
  store.getState().apply(rename("Unsaved when generation finished"), { label: "Rename" });
  // The server binds onto the draft current when the bytes are ready, which already holds the autosave.
  server = { document: applyAnyGameOps(server.document, [bind]), game: { draftUpdatedAt: "t2" } };
  generation.resolve();
  await serverEdit;

  const state = store.getState();
  expect(state.baseUpdatedAt).toBe("t2");
  expect(playerName()).toBe("Unsaved when generation finished");
  expect(state.document?.assets[bind.op === "bind_asset" ? bind.slot : ""]?.digest).toBe("f".repeat(64));
  expect(state.pendingOps.length).toBeGreaterThan(0);
  expect(applyAnyGameOps(server.document, state.pendingOps)).toEqual(state.document);
  expect(state.canUndo).toBe(true);
  store.getState().undo();
  expect(playerName()).toBe("Saved during generation");
  expect(store.getState().document?.assets[bind.op === "bind_asset" ? bind.slot : ""]?.digest).toBe("f".repeat(64));
});
