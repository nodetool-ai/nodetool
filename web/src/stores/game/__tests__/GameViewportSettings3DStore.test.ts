import { createGameViewportSettings3DStore, DEFAULT_GAME_VIEWPORT_SETTINGS_3D } from "../GameViewportSettings3DStore";
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

it("persists gizmo settings per user and restores them in a new store", () => {
  const storage = memoryStorage();
  const store = createGameViewportSettings3DStore({ userId: "user-1" }, storage);
  store.getState().toggleSpace();
  store.getState().setPivot("individual");
  store.getState().setIncrement("rotate", 45);
  store.getState().toggle("orthographic");
  const reloaded = createGameViewportSettings3DStore({ userId: "user-1" }, storage);
  expect(reloaded.getState()).toMatchObject({ space: "local", pivot: "individual", orthographic: true,
    increments: { translate: 0.25, rotate: 45, scale: 0.25 } });
  expect(createGameViewportSettings3DStore({ anonymous: true }, storage).getState().space).toBe("world");
});

it("clamps snap increments and ignores values that are not numbers", () => {
  const store = createGameViewportSettings3DStore({ anonymous: true }, memoryStorage());
  store.getState().setIncrement("translate", 0);
  expect(store.getState().increments.translate).toBe(0.001);
  store.getState().setIncrement("rotate", 720);
  expect(store.getState().increments.rotate).toBe(180);
  store.getState().setIncrement("scale", Number.NaN);
  expect(store.getState().increments.scale).toBe(0.25);
});

it("cycles the pivot through centre, active entity and individual origins", () => {
  const store = createGameViewportSettings3DStore({ anonymous: true }, memoryStorage());
  const seen = [store.getState().pivot];
  for (let index = 0; index < 3; index++) { store.getState().cyclePivot(); seen.push(store.getState().pivot); }
  expect(seen).toEqual(["center", "active", "individual", "center"]);
});

it("keeps each valid stored field when another is invalid", () => {
  const storage = memoryStorage({ "nodetool.game-viewport3d.v1:anonymous": JSON.stringify({ version: 1, state: {
    space: "sideways", pivot: "active", snap: false, increments: { translate: -1, rotate: 30, scale: "big" }, orthographic: true
  } }) });
  const store = createGameViewportSettings3DStore({ anonymous: true }, storage);
  expect(store.getState()).toMatchObject({ space: "world", pivot: "active", snap: false, orthographic: true,
    surfaceSnap: false, increments: { translate: 0.25, rotate: 30, scale: 0.25 } });
  store.getState().reset();
  expect(store.getState()).toMatchObject(DEFAULT_GAME_VIEWPORT_SETTINGS_3D);
});

it("keeps settings in memory when browser storage throws", () => {
  const failing: GameLayoutStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); }
  };
  const store = createGameViewportSettings3DStore({ anonymous: true }, failing);
  store.getState().toggle("surfaceSnap");
  expect(store.getState().surfaceSnap).toBe(true);
});
