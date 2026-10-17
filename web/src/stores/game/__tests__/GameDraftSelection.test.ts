import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { getGameDraftStore } from "../GameDraftStore";

function selectedStore(name: string) {
  const document = createTopDownRoomGame(name);
  document.scenes.push({ ...structuredClone(document.scenes[0]), id: "second", name: "Second" });
  const store = getGameDraftStore(name);
  store.getState().load(document, "base");
  return { store, document };
}

it.each(["select", "selectMany"] as const)("clears the scene qualifier when legacy %s follows qualified selection (E1)", (method) => {
  const { store } = selectedStore(`legacy-selection-${method}`);
  store.getState().select({ sceneId: "second", entityId: "player" });
  if (method === "select") { store.getState().select("camera"); }
  else { store.getState().selectMany(["camera"]); }
  expect(store.getState().selectedIds).toEqual(["camera"]);
  expect(store.getState().selectedSceneId).toBeNull();
});

it("replaces rather than mixes qualified additive selections from different scenes (E1)", () => {
  const { store, document } = selectedStore("additive-scene-selection");
  store.getState().select({ sceneId: document.entrySceneId, entityId: "player" });
  store.getState().select({ sceneId: "second", entityId: "player" }, true);
  expect(store.getState().selectedIds).toEqual(["player"]);
  expect(store.getState().selectedSceneId).toBe("second");
  store.getState().selectMany({ sceneId: document.entrySceneId, entityIds: ["camera"] }, true);
  expect(store.getState().selectedIds).toEqual(["camera"]);
  expect(store.getState().selectedSceneId).toBe(document.entrySceneId);
});

it("retains the explicitly selected scene when entity selection is empty (E9)", () => {
  const { store } = selectedStore("empty-scene-selection");
  store.getState().selectMany({ sceneId: "second", entityIds: [] });
  expect(store.getState().selectedIds).toEqual([]);
  expect(store.getState().selectedSceneId).toBe("second");
});

it.each(["load", "remove"] as const)("clears a stale qualified scene after %s without selecting its namesake (E1)", (method) => {
  const { store, document } = selectedStore(`stale-scene-selection-${method}`);
  store.getState().select({ sceneId: "second", entityId: "player" });
  if (method === "load") { store.getState().load({ ...document, scenes: [document.scenes[0]] }, "next"); }
  else { expect(store.getState().apply([{ op: "remove_scene", scene_id: "second" }])).toBe(true); }
  expect(store.getState().selectedIds).toEqual([]);
  expect(store.getState().selectedSceneId).toBeNull();
});
