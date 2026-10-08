import { createGamePanelLayoutStore, type GameLayoutStorage } from "../GamePanelLayoutStore";

function memoryStorage(): { storage: GameLayoutStorage; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, storage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }
  } };
}

it("hydrates isolated full-user and anonymous namespaces synchronously", () => {
  const { storage, data } = memoryStorage();
  const userA = createGamePanelLayoutStore({ userId: "user-a/full-id" }, storage);
  const userB = createGamePanelLayoutStore({ userId: "user-b/full-id" }, storage);
  const anonymous = createGamePanelLayoutStore({ anonymous: true }, storage);
  userA.getState().dispatch({ type: "preset", name: "Scripting" });
  userB.getState().dispatch({ type: "preset", name: "Wide" });
  anonymous.getState().dispatch({ type: "resize", region: "left", size: 420 });
  expect(data.size).toBe(3);
  const reloggedA = createGamePanelLayoutStore({ userId: "user-a/full-id" }, storage);
  const reloggedB = createGamePanelLayoutStore({ userId: "user-b/full-id" }, storage);
  const reloadedAnonymous = createGamePanelLayoutStore({ anonymous: true }, storage);
  expect(reloggedA.getState().layout).toEqual(userA.getState().layout);
  expect(reloggedB.getState().layout).toEqual(userB.getState().layout);
  expect(reloadedAnonymous.getState().layout).toEqual(anonymous.getState().layout);
  expect(reloggedA.getState().layout.sizes.bottom).toBe(360);
  expect(reloggedB.getState().layout.hidden).toContain("inspector");
  expect(reloadedAnonymous.getState().layout.sizes.left).toBe(420);
});

it("saves, replaces, renames and deletes custom copies without changing built-ins", () => {
  const { storage } = memoryStorage();
  const store = createGamePanelLayoutStore({ anonymous: true }, storage);
  store.getState().saveLayout("My work");
  store.getState().dispatch({ type: "resize", region: "right", size: 500 });
  store.getState().saveLayout("My work");
  expect(store.getState().customLayouts).toHaveLength(1);
  store.getState().renameLayout("My work", "Code");
  store.getState().selectLayout("Default");
  expect(store.getState().layout.sizes.right).toBe(340);
  store.getState().selectLayout("Code");
  expect(store.getState().layout.sizes.right).toBe(500);
  expect(() => store.getState().saveLayout("Default")).toThrow("Built-in");
  store.getState().deleteLayout("Code");
  expect(store.getState().customLayouts).toEqual([]);
  expect(() => store.getState().selectLayout("Code")).toThrow("does not exist");
});

it("recovers malformed persisted metadata without replacing action methods", () => {
  const { storage, data } = memoryStorage();
  data.set("nodetool.game-layout.v1:anonymous", JSON.stringify({
    version: 1, state: { layout: { version: 1, regions: {} }, customLayouts: [] }
  }));
  const store = createGamePanelLayoutStore({ anonymous: true }, storage);
  expect(store.getState().layout.regions.viewport[0].panels).toEqual(["viewport"]);
  store.getState().dispatch({ type: "resize", region: "left", size: 360 });
  expect(store.getState().layout.sizes.left).toBe(360);
});

it("retains a usable in-memory layout when persistence is unavailable", () => {
  const unavailable: GameLayoutStorage = {
    getItem: () => { throw new DOMException("Denied", "SecurityError"); },
    setItem: () => { throw new DOMException("Full", "QuotaExceededError"); },
    removeItem: () => { throw new DOMException("Denied", "SecurityError"); }
  };
  const store = createGamePanelLayoutStore({ anonymous: true }, unavailable);
  store.getState().dispatch({ type: "resize", region: "left", size: 460 });
  expect(store.getState().layout.sizes.left).toBe(460);
});

it("retains independent saved copies and unknown placements across reload", () => {
  const { storage } = memoryStorage();
  const store = createGamePanelLayoutStore({ userId: "copy-owner" }, storage);
  store.getState().registerPanels([{ id: "extension", title: "Extension", icon: null,
    dimensions: ["2d"], defaultRegion: "bottom" }]);
  store.getState().saveLayout("Original");
  const original = JSON.parse(JSON.stringify(store.getState().layout));
  store.getState().dispatch({ type: "resize", region: "bottom", size: 500 });
  expect(store.getState().customLayouts[0].layout).toEqual(original);
  const reloaded = createGamePanelLayoutStore({ userId: "copy-owner" }, storage);
  expect(reloaded.getState().layout.sizes.bottom).toBe(500);
  reloaded.getState().selectLayout("Original");
  expect(reloaded.getState().layout).toEqual(original);
  expect(reloaded.getState().layout.regions.bottom[0].panels).toContain("extension");
});

it.each(["not json", JSON.stringify({ version: 0, state: {} })])("falls back for unsupported serialized state %s", (payload) => {
  const { storage, data } = memoryStorage();
  data.set("nodetool.game-layout.v1:anonymous", payload);
  const report = jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const store = createGamePanelLayoutStore({ anonymous: true }, storage);
    expect(store.getState().layout.regions.viewport[0].panels).toEqual(["viewport"]);
    store.getState().dispatch({ type: "resize", region: "left", size: 400 });
    expect(store.getState().layout.sizes.left).toBe(400);
  } finally { report.mockRestore(); }
});

it("rejects invalid, duplicate renamed and overflow names atomically", () => {
  const { storage } = memoryStorage();
  const store = createGamePanelLayoutStore({ anonymous: true }, storage);
  store.getState().saveLayout("First");
  store.getState().saveLayout("Second");
  const prior = store.getState().customLayouts;
  expect(() => store.getState().renameLayout("First", "Second")).toThrow("already used");
  expect(() => store.getState().saveLayout(" ")).toThrow();
  expect(() => store.getState().saveLayout("x".repeat(81))).toThrow();
  expect(store.getState().customLayouts).toBe(prior);
  for (let index = 2; index < 32; index++) { store.getState().saveLayout(`Copy ${index}`); }
  const full = store.getState().customLayouts;
  expect(full).toHaveLength(32);
  expect(() => store.getState().saveLayout("Overflow")).toThrow();
  expect(store.getState().customLayouts).toBe(full);
});

it("keeps state identity and skips persistence and notification for no-op actions", () => {
  const { storage } = memoryStorage();
  const writes = jest.fn();
  const counted: GameLayoutStorage = { ...storage, setItem: (key, value) => { writes(key); storage.setItem(key, value); } };
  const store = createGamePanelLayoutStore({ anonymous: true }, counted);
  store.getState().saveLayout("Mine");
  const before = store.getState();
  writes.mockClear();
  const listener = jest.fn();
  const unsubscribe = store.subscribe(listener);
  try {
    store.getState().dispatch({ type: "activate", panelId: "hierarchy" });
    store.getState().dispatch({ type: "reveal", panelId: "inspector" });
    store.getState().dispatch({ type: "hide", panelId: "assistant" });
    store.getState().dispatch({ type: "resize", region: "bottom", size: before.layout.sizes.bottom });
    store.getState().dispatch({ type: "move", panelId: "hierarchy", region: "left", groupId: "left-main", index: 0 });
    store.getState().dispatch({ type: "preset", name: "Default" });
    store.getState().selectLayout("Default");
    store.getState().selectLayout("Mine");
    store.getState().saveLayout("Mine");
    store.getState().renameLayout("Mine", "Mine");
    store.getState().deleteLayout("Missing");
    store.getState().registerPanels([{ id: "viewport", title: "Viewport", icon: null, dimensions: ["2d"], defaultRegion: "viewport" }]);
    expect(store.getState()).toBe(before);
    expect(store.getState().layout).toBe(before.layout);
    expect(store.getState().customLayouts).toBe(before.customLayouts);
    expect(listener).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    store.getState().dispatch({ type: "activate", panelId: "revisions" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(writes).toHaveBeenCalledTimes(1);
  } finally { unsubscribe(); }
});

it("keeps valid persisted layouts when one saved entry is invalid", () => {
  const { storage, data } = memoryStorage();
  const source = createGamePanelLayoutStore({ userId: "partial" }, storage);
  source.getState().dispatch({ type: "resize", region: "left", size: 410 });
  source.getState().saveLayout("Kept");
  const saved = JSON.parse(data.get("nodetool.game-layout.v1:user:partial") ?? "null");
  const kept = saved.state.customLayouts[0];
  saved.state.customLayouts = [
    kept,
    { name: "Hidden viewport", layout: { ...kept.layout, hidden: ["viewport"] } },
    { name: "Default", layout: kept.layout },
    { name: "Kept", layout: kept.layout },
    { name: "Unknown panel", layout: { ...kept.layout, regions: { ...kept.layout.regions,
      bottom: [{ id: "bottom-main", panels: ["scripts", "retired-extension"], activePanelId: "retired-extension" }] } } },
    "not a layout"
  ];
  data.set("nodetool.game-layout.v1:user:partial", JSON.stringify(saved));
  const reloaded = createGamePanelLayoutStore({ userId: "partial" }, storage);
  expect(reloaded.getState().layout.sizes.left).toBe(410);
  expect(reloaded.getState().customLayouts.map((entry) => entry.name)).toEqual(["Kept", "Unknown panel"]);
  reloaded.getState().selectLayout("Unknown panel");
  expect(reloaded.getState().layout.regions.bottom[0].panels).toEqual(["scripts", "retired-extension"]);
});

it("falls back to the default current layout while retaining valid saved copies", () => {
  const { storage, data } = memoryStorage();
  const source = createGamePanelLayoutStore({ userId: "current-invalid" }, storage);
  source.getState().dispatch({ type: "resize", region: "right", size: 480 });
  source.getState().saveLayout("Wide right");
  const saved = JSON.parse(data.get("nodetool.game-layout.v1:user:current-invalid") ?? "null");
  saved.state.layout = { ...saved.state.layout, regions: { ...saved.state.layout.regions, viewport: [] } };
  data.set("nodetool.game-layout.v1:user:current-invalid", JSON.stringify(saved));
  const reloaded = createGamePanelLayoutStore({ userId: "current-invalid" }, storage);
  expect(reloaded.getState().layout.regions.viewport[0].panels).toEqual(["viewport"]);
  expect(reloaded.getState().layout.sizes.right).toBe(340);
  reloaded.getState().selectLayout("Wide right");
  expect(reloaded.getState().layout.sizes.right).toBe(480);
});

it("reports saved-layout validation failures as readable messages", () => {
  const { storage } = memoryStorage();
  const store = createGamePanelLayoutStore({ anonymous: true }, storage);
  expect(() => store.getState().saveLayout(" ")).toThrow(/^Enter a layout name$/);
  expect(() => store.getState().saveLayout("x".repeat(81))).toThrow(/^Layout names are limited to 80 characters$/);
  expect(() => store.getState().saveLayout("Wide")).toThrow(/^Built-in layouts cannot be replaced$/);
  for (let index = 0; index < 32; index++) { store.getState().saveLayout(`Copy ${index}`); }
  expect(() => store.getState().saveLayout("Overflow")).toThrow(/^At most 32 layouts can be saved$/);
  expect(() => store.getState().renameLayout("Copy 0", "Copy 1")).toThrow(/^Saved layout name is already used$/);
});
