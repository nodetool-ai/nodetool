import { createGameShortcutStore } from "../GameShortcutStore";
import type { GameLayoutStorage } from "../GamePanelLayoutStore";

function memoryStorage(initial: Record<string, string> = {}): GameLayoutStorage & { readonly values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }
  };
}

it("persists rebinding per user and restores it in a new store", () => {
  const storage = memoryStorage();
  const store = createGameShortcutStore({ userId: "user-1" }, storage);
  store.getState().setBindings("edit.undo", [{ code: "KeyU", mod: true }]);
  expect(storage.values.has("nodetool.game-shortcuts.v1:user:user-1")).toBe(true);
  const reloaded = createGameShortcutStore({ userId: "user-1" }, storage);
  expect(reloaded.getState().overrides["edit.undo"]).toEqual([{ code: "KeyU", mod: true }]);
  expect(createGameShortcutStore({ anonymous: true }, storage).getState().overrides).toEqual({});
});

it("rejects a shortcut another command in a shared editor already uses", () => {
  const store = createGameShortcutStore({ anonymous: true }, memoryStorage());
  expect(() => store.getState().setBindings("view.resetCamera", [{ code: "KeyF" }])).toThrow("Frame selection already uses this shortcut");
  // Copy exists only in 2D and Move only in 3D, so they can share W.
  store.getState().setBindings("edit.copy", [{ code: "KeyW" }]);
  expect(store.getState().overrides["edit.copy"]).toEqual([{ code: "KeyW" }]);
});

it("frees a default for another command and refuses a reset that would collide", () => {
  const store = createGameShortcutStore({ anonymous: true }, memoryStorage());
  store.getState().setBindings("view.frameSelection", []);
  store.getState().setBindings("view.resetCamera", [{ code: "KeyF" }]);
  expect(() => store.getState().resetBindings("view.frameSelection")).toThrow("Reset camera already uses the default shortcut");
  store.getState().resetAll();
  expect(store.getState().overrides).toEqual({});
});

it("drops unknown commands, malformed bindings and conflicting entries when loading", () => {
  const storage = memoryStorage({ "nodetool.game-shortcuts.v1:anonymous": JSON.stringify({ version: 1, state: { overrides: {
    "edit.undo": [{ code: "KeyU" }],
    "removed.command": [{ code: "KeyQ" }],
    "edit.redo": [{ code: 5 }],
    "view.resetCamera": [{ code: "KeyF" }]
  } } }) });
  const store = createGameShortcutStore({ anonymous: true }, storage);
  expect(store.getState().overrides).toEqual({ "edit.undo": [{ code: "KeyU" }] });
});

it("keeps working when browser storage throws", () => {
  const store = createGameShortcutStore({ anonymous: true }, {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); }
  });
  store.getState().setBindings("edit.undo", [{ code: "KeyU" }]);
  expect(store.getState().overrides["edit.undo"]).toEqual([{ code: "KeyU" }]);
});
