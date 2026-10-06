import { createNative3DGame } from "@nodetool-ai/game-runtime";
import { getGameDraftStore } from "../GameDraftStore";
import { expect, it, jest } from "@jest/globals";
import { flushGameDraft, pullGameDraft, reloadRejectedGameDraft, type DraftSaveFlight } from "../draftSave";

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


it("drops a rejected batch with an unchanged server token so the next edit can save (F4)", () => {
  const document = createNative3DGame("rejected-save-recovery");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  store.getState().apply([{ op: "update_entity", scene_id: document.entrySceneId, entity_id: "player", set: { name: "Rejected" } }]);
  store.getState().setSaving(1);
  expect(reloadRejectedGameDraft(document.id, "first", document, "first", { data: { code: "BAD_REQUEST" } })).toBe(true);
  store.getState().apply([{ op: "update_entity", scene_id: document.entrySceneId, entity_id: "player", set: { name: "Next" } }]);
  expect(store.getState().pendingOps).toEqual([{ op: "update_entity", scene_id: document.entrySceneId, entity_id: "player", set: { name: "Next" } }]);
  expect(store.getState().savingCount).toBe(0);
});


it.each([new Error("Failed to fetch"), { data: { code: "INTERNAL_SERVER_ERROR" } }])("retains edits after a transport or server failure", (cause) => {
  const document = createNative3DGame("transient-save-failure");
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "first");
  const op = { op: "update_entity", scene_id: document.entrySceneId, entity_id: "player", set: { name: "Keep this edit" } } as const;
  store.getState().apply([op]);
  expect(reloadRejectedGameDraft(document.id, "first", document, "first", cause)).toBe(false);
  expect(store.getState().pendingOps).toEqual([op]);
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
