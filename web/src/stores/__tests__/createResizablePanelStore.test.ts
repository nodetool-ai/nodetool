import { createResizablePanelStore } from "../createResizablePanelStore";

type View = "a" | "b";
const isView = (v: unknown): v is View => v === "a" || v === "b";
const sizes = { drag: 40, min: 200, max: 600, initial: 300 };

let counter = 0;
const makeStore = (
  overrides: Partial<Parameters<typeof createResizablePanelStore<View>>[0]> = {}
) =>
  createResizablePanelStore<View>({
    name: `resizable-test-${counter++}`,
    version: 1,
    sizes,
    defaultView: "a",
    isView,
    persistVisibility: true,
    ...overrides
  });

describe("createResizablePanelStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts hidden at the initial size on the default view", () => {
    const { panel } = makeStore().getState();
    expect(panel).toMatchObject({
      panelSize: 300,
      isVisible: false,
      activeView: "a",
      minSize: 40,
      maxSize: 600
    });
  });

  describe("setSize", () => {
    it("collapses to the drag size at or below it", () => {
      const store = makeStore();
      store.getState().setSize(10);
      expect(store.getState().panel.panelSize).toBe(40);
    });

    it("caps at the maximum", () => {
      const store = makeStore();
      store.getState().setSize(5000);
      expect(store.getState().panel.panelSize).toBe(600);
    });

    it("keeps a size in range", () => {
      const store = makeStore();
      store.getState().setSize(450);
      expect(store.getState().panel.panelSize).toBe(450);
    });
  });

  describe("initializePanelSize", () => {
    it("falls back to the initial size without an argument", () => {
      const store = makeStore();
      store.getState().initializePanelSize();
      expect(store.getState().panel.panelSize).toBe(300);
    });

    it("raises a small size to the reopen minimum", () => {
      const store = makeStore();
      store.getState().initializePanelSize(50);
      expect(store.getState().panel.panelSize).toBe(200);
    });

    it("caps at the maximum", () => {
      const store = makeStore();
      store.getState().initializePanelSize(9999);
      expect(store.getState().panel.panelSize).toBe(600);
    });
  });

  it("closePanel hides the panel and leaves a sliver", () => {
    const store = makeStore();
    store.getState().setVisibility(true);
    store.getState().closePanel();
    expect(store.getState().panel).toMatchObject({
      isVisible: false,
      panelSize: 40
    });
  });

  describe("setVisibility", () => {
    it("restores the usable minimum when reopening a sliver", () => {
      const store = makeStore();
      store.getState().setSize(40);
      store.getState().setVisibility(true);
      expect(store.getState().panel).toMatchObject({
        isVisible: true,
        panelSize: 200
      });
    });

    it("keeps a usable size when reopening", () => {
      const store = makeStore();
      store.getState().setSize(400);
      store.getState().setVisibility(true);
      expect(store.getState().panel.panelSize).toBe(400);
    });

    it("does not resize when hiding", () => {
      const store = makeStore();
      store.getState().setSize(40);
      store.getState().setVisibility(false);
      expect(store.getState().panel.panelSize).toBe(40);
    });
  });

  describe("handleViewChange", () => {
    it("switches to another view and opens the panel", () => {
      const store = makeStore();
      store.getState().handleViewChange("b");
      expect(store.getState().panel).toMatchObject({
        activeView: "b",
        isVisible: true
      });
    });

    it("toggles visibility when the active view is chosen again", () => {
      const store = makeStore();
      store.getState().setVisibility(true);
      store.getState().handleViewChange("a");
      expect(store.getState().panel.isVisible).toBe(false);
      store.getState().handleViewChange("a");
      expect(store.getState().panel.isVisible).toBe(true);
    });

    it("reopens a collapsed panel at the minimum size", () => {
      const store = makeStore();
      store.getState().setSize(40);
      store.getState().handleViewChange("a");
      expect(store.getState().panel).toMatchObject({
        isVisible: true,
        panelSize: 200
      });
    });
  });

  it("sets view, drag and hasDragged flags", () => {
    const store = makeStore();
    store.getState().setActiveView("b");
    store.getState().setIsDragging(true);
    store.getState().setHasDragged(true);
    expect(store.getState().panel).toMatchObject({
      activeView: "b",
      isDragging: true,
      hasDragged: true
    });
  });

  describe("persistence", () => {
    const stored = (name: string) =>
      JSON.parse(localStorage.getItem(name) as string).state.panel;

    it("persists visibility when persistVisibility is true", () => {
      const store = makeStore({ name: "persist-visible" });
      store.getState().setVisibility(true);
      expect(stored("persist-visible")).toMatchObject({
        isVisible: true,
        activeView: "a"
      });
    });

    it("omits visibility when persistVisibility is false", () => {
      const store = makeStore({
        name: "persist-hidden",
        persistVisibility: false
      });
      store.getState().setVisibility(true);
      expect(stored("persist-hidden")).not.toHaveProperty("isVisible");
    });

    it("rehydrates a clamped size and a valid view", async () => {
      localStorage.setItem(
        "rehydrate-ok",
        JSON.stringify({
          state: { panel: { panelSize: 9999, activeView: "b", isVisible: true } },
          version: 1
        })
      );
      const store = makeStore({ name: "rehydrate-ok" });
      await store.persist.rehydrate();
      expect(store.getState().panel).toMatchObject({
        panelSize: 600,
        activeView: "b",
        isVisible: true
      });
    });

    it("ignores an unknown view and a non-numeric size", async () => {
      localStorage.setItem(
        "rehydrate-bad",
        JSON.stringify({
          state: { panel: { panelSize: "wide", activeView: "zzz" } },
          version: 1
        })
      );
      const store = makeStore({ name: "rehydrate-bad" });
      await store.persist.rehydrate();
      expect(store.getState().panel).toMatchObject({
        panelSize: 300,
        activeView: "a"
      });
    });

    it("does not restore visibility when it is derived", async () => {
      localStorage.setItem(
        "rehydrate-derived",
        JSON.stringify({
          state: { panel: { panelSize: 300, isVisible: true } },
          version: 1
        })
      );
      const store = makeStore({
        name: "rehydrate-derived",
        persistVisibility: false
      });
      await store.persist.rehydrate();
      expect(store.getState().panel.isVisible).toBe(false);
    });

    it("applies mergeExtra after the shared fields", async () => {
      localStorage.setItem(
        "rehydrate-extra",
        JSON.stringify({
          state: { panel: { activeView: "legacy" } },
          version: 1
        })
      );
      const store = makeStore({
        name: "rehydrate-extra",
        mergeExtra: (persisted) =>
          persisted.activeView === "legacy" ? { activeView: "b" } : {}
      });
      await store.persist.rehydrate();
      expect(store.getState().panel.activeView).toBe("b");
    });
  });
});
