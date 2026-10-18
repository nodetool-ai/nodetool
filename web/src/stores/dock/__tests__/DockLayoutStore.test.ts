import { createSampleDockStore, type SampleDockStorage } from "../../../__mocks__/sampleDockModel";

function memoryStorage(): { storage: SampleDockStorage; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, storage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }
  } };
}

it("hydrates isolated full-user and anonymous namespaces synchronously", () => {
  const { storage, data } = memoryStorage();
  const userA = createSampleDockStore({ userId: "user-a/full-id" }, storage);
  const userB = createSampleDockStore({ userId: "user-b/full-id" }, storage);
  const anonymous = createSampleDockStore({ anonymous: true }, storage);
  userA.getState().dispatch({ type: "preset", name: "Scripting" });
  userB.getState().dispatch({ type: "preset", name: "Wide" });
  anonymous.getState().dispatch({ type: "resize", region: "left", size: 420 });
  expect(data.size).toBe(3);
  const reloggedA = createSampleDockStore({ userId: "user-a/full-id" }, storage);
  const reloggedB = createSampleDockStore({ userId: "user-b/full-id" }, storage);
  const reloadedAnonymous = createSampleDockStore({ anonymous: true }, storage);
  expect(reloggedA.getState().layout).toEqual(userA.getState().layout);
  expect(reloggedB.getState().layout).toEqual(userB.getState().layout);
  expect(reloadedAnonymous.getState().layout).toEqual(anonymous.getState().layout);
  expect(reloggedA.getState().layout.sizes.bottom).toBe(360);
  expect(reloggedB.getState().layout.hidden).toContain("inspector");
  expect(reloadedAnonymous.getState().layout.sizes.left).toBe(420);
});

it("saves, replaces, renames and deletes custom copies without changing built-ins", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
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
  data.set("nodetool.dock-test.v1:anonymous", JSON.stringify({
    version: 1, state: { layout: { version: 1, regions: {} }, customLayouts: [] }
  }));
  const store = createSampleDockStore({ anonymous: true }, storage);
  expect(store.getState().layout.regions.viewport[0].panels).toEqual(["viewport"]);
  store.getState().dispatch({ type: "resize", region: "left", size: 360 });
  expect(store.getState().layout.sizes.left).toBe(360);
});

it("retains a usable in-memory layout when persistence is unavailable", () => {
  const unavailable: SampleDockStorage = {
    getItem: () => { throw new DOMException("Denied", "SecurityError"); },
    setItem: () => { throw new DOMException("Full", "QuotaExceededError"); },
    removeItem: () => { throw new DOMException("Denied", "SecurityError"); }
  };
  const store = createSampleDockStore({ anonymous: true }, unavailable);
  store.getState().dispatch({ type: "resize", region: "left", size: 460 });
  expect(store.getState().layout.sizes.left).toBe(460);
});

it("retains independent saved copies and unknown placements across reload", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ userId: "copy-owner" }, storage);
  store.getState().registerPanels([{ id: "extension", title: "Extension", icon: null,
    defaultRegion: "bottom" }]);
  store.getState().saveLayout("Original");
  const original = JSON.parse(JSON.stringify(store.getState().layout));
  store.getState().dispatch({ type: "resize", region: "bottom", size: 500 });
  expect(store.getState().customLayouts[0].layout).toEqual(original);
  const reloaded = createSampleDockStore({ userId: "copy-owner" }, storage);
  expect(reloaded.getState().layout.sizes.bottom).toBe(500);
  reloaded.getState().selectLayout("Original");
  expect(reloaded.getState().layout).toEqual(original);
  expect(reloaded.getState().layout.regions.bottom[0].panels).toContain("extension");
});

it.each(["not json", JSON.stringify({ version: 0, state: {} })])("falls back for unsupported serialized state %s", (payload) => {
  const { storage, data } = memoryStorage();
  data.set("nodetool.dock-test.v1:anonymous", payload);
  const report = jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const store = createSampleDockStore({ anonymous: true }, storage);
    expect(store.getState().layout.regions.viewport[0].panels).toEqual(["viewport"]);
    store.getState().dispatch({ type: "resize", region: "left", size: 400 });
    expect(store.getState().layout.sizes.left).toBe(400);
  } finally { report.mockRestore(); }
});

it("rejects invalid, duplicate renamed and overflow names atomically", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
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
  const counted: SampleDockStorage = { ...storage, setItem: (key, value) => { writes(key); storage.setItem(key, value); } };
  const store = createSampleDockStore({ anonymous: true }, counted);
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
    store.getState().saveLayout("Mine");
    store.getState().renameLayout("Mine", "Mine");
    store.getState().deleteLayout("Missing");
    store.getState().registerPanels([{ id: "viewport", title: "Viewport", icon: null, defaultRegion: "viewport" }]);
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
  const source = createSampleDockStore({ userId: "partial" }, storage);
  source.getState().dispatch({ type: "resize", region: "left", size: 410 });
  source.getState().saveLayout("Kept");
  const saved = JSON.parse(data.get("nodetool.dock-test.v1:user:partial") ?? "null");
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
  data.set("nodetool.dock-test.v1:user:partial", JSON.stringify(saved));
  const reloaded = createSampleDockStore({ userId: "partial" }, storage);
  expect(reloaded.getState().layout.sizes.left).toBe(410);
  expect(reloaded.getState().customLayouts.map((entry) => entry.name)).toEqual(["Kept", "Unknown panel"]);
  reloaded.getState().selectLayout("Unknown panel");
  expect(reloaded.getState().layout.regions.bottom[0].panels).toEqual(["scripts", "retired-extension"]);
});

it("falls back to the default current layout while retaining valid saved copies", () => {
  const { storage, data } = memoryStorage();
  const source = createSampleDockStore({ userId: "current-invalid" }, storage);
  source.getState().dispatch({ type: "resize", region: "right", size: 480 });
  source.getState().saveLayout("Wide right");
  const saved = JSON.parse(data.get("nodetool.dock-test.v1:user:current-invalid") ?? "null");
  saved.state.layout = { ...saved.state.layout, regions: { ...saved.state.layout.regions, viewport: [] } };
  data.set("nodetool.dock-test.v1:user:current-invalid", JSON.stringify(saved));
  const reloaded = createSampleDockStore({ userId: "current-invalid" }, storage);
  expect(reloaded.getState().layout.regions.viewport[0].panels).toEqual(["viewport"]);
  expect(reloaded.getState().layout.sizes.right).toBe(340);
  reloaded.getState().selectLayout("Wide right");
  expect(reloaded.getState().layout.sizes.right).toBe(480);
});

it("reports saved-layout validation failures as readable messages", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  expect(() => store.getState().saveLayout(" ")).toThrow(/^Enter a layout name$/);
  expect(() => store.getState().saveLayout("x".repeat(81))).toThrow(/^Layout names are limited to 80 characters$/);
  expect(() => store.getState().saveLayout("Wide")).toThrow(/^Built-in layouts cannot be replaced$/);
  for (let index = 0; index < 32; index++) { store.getState().saveLayout(`Copy ${index}`); }
  expect(() => store.getState().saveLayout("Overflow")).toThrow(/^At most 32 layouts can be saved$/);
  expect(() => store.getState().renameLayout("Copy 0", "Copy 1")).toThrow(/^Saved layout name is already used$/);
});

it("persists under the configured key prefix and never persists the layout epoch", () => {
  const { storage, data } = memoryStorage();
  const store = createSampleDockStore({ userId: "a/b" }, storage);
  store.getState().dispatch({ type: "resize", region: "left", size: 300 });
  store.getState().selectLayout("Scripting");
  expect([...data.keys()]).toEqual(["nodetool.dock-test.v1:user:a%2Fb"]);
  expect(data.get("nodetool.dock-test.v1:user:a%2Fb")).not.toContain("layoutEpoch");
  expect(createSampleDockStore({ userId: "a/b" }, storage).getState().layoutEpoch).toBe(0);
});

it("reveals a hidden panel and makes it the active tab of its group", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  store.getState().revealPanel("assistant");
  expect(store.getState().layout.hidden).not.toContain("assistant");
  expect(store.getState().layout.regions.right[0].activePanelId).toBe("assistant");
});

it("counts layout switches and resets, so each canvas can leave maximize", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  expect(store.getState().layoutEpoch).toBe(0);
  store.getState().selectLayout("Scripting");
  expect(store.getState().layoutEpoch).toBe(1);
  store.getState().resetLayout();
  expect(store.getState().layoutEpoch).toBe(2);
  store.getState().saveLayout("Mine");
  store.getState().selectLayout("Mine");
  expect(store.getState().layoutEpoch).toBe(3);
  store.getState().selectLayout("Mine");
  expect(store.getState().layoutEpoch).toBe(4);
});

it("keeps every required panel visible and rejects a layout that hides or drops one", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  store.getState().dispatch({ type: "hide", panelId: "viewport" });
  store.getState().togglePanels(["viewport"]);
  expect(store.getState().layout.hidden).not.toContain("viewport");
  expect(store.getState().model.requiredPanels).toEqual(["viewport"]);
});

it("resets to the active built-in layout, undoing moves, resizes and hidden panels", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  store.getState().selectLayout("Scripting");
  const scripting = store.getState().layout;
  store.getState().dispatch({ type: "resize", region: "bottom", size: 500 });
  store.getState().dispatch({ type: "hide", panelId: "inspector" });
  expect(store.getState().layout).not.toEqual(scripting);
  store.getState().resetLayout();
  expect(store.getState().layout).toEqual(scripting);
  expect(store.getState().activeLayoutName).toBe("Scripting");
});

it("resets to the saved layout last chosen, not the built-in it was copied from", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  store.getState().dispatch({ type: "resize", region: "right", size: 500 });
  store.getState().saveLayout("Wide inspector");
  expect(store.getState().activeLayoutName).toBe("Wide inspector");
  store.getState().dispatch({ type: "resize", region: "right", size: 200 });
  store.getState().resetLayout();
  expect(store.getState().layout.sizes.right).toBe(500);
  store.getState().renameLayout("Wide inspector", "Inspector heavy");
  expect(store.getState().activeLayoutName).toBe("Inspector heavy");
});

it("has no active layout after the active saved layout is deleted, and reset does nothing until one is chosen", () => {
  const { storage } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  store.getState().dispatch({ type: "resize", region: "right", size: 500 });
  store.getState().saveLayout("Wide inspector");
  store.getState().saveLayout("Other");
  store.getState().selectLayout("Wide inspector");
  store.getState().deleteLayout("Other");
  expect(store.getState().activeLayoutName).toBe("Wide inspector");
  store.getState().deleteLayout("Wide inspector");
  expect(store.getState().activeLayoutName).toBeNull();
  const kept = store.getState().layout;
  const epoch = store.getState().layoutEpoch;
  store.getState().resetLayout();
  expect(store.getState().layout).toBe(kept);
  expect(store.getState().layoutEpoch).toBe(epoch);
  expect(createSampleDockStore({ anonymous: true }, storage).getState().activeLayoutName).toBeNull();
  store.getState().selectLayout("Default");
  expect(store.getState().activeLayoutName).toBe("Default");
});

it("keeps the active layout name across a reload and ignores a name that no longer exists", () => {
  const { storage, data } = memoryStorage();
  const store = createSampleDockStore({ anonymous: true }, storage);
  store.getState().selectLayout("Animation");
  const reloaded = createSampleDockStore({ anonymous: true }, storage);
  expect(reloaded.getState().activeLayoutName).toBe("Animation");
  const [key, raw] = [...data.entries()][0];
  data.set(key, raw.replace("Animation", "Deleted layout"));
  expect(createSampleDockStore({ anonymous: true }, storage).getState().activeLayoutName).toBe("Default");
});
