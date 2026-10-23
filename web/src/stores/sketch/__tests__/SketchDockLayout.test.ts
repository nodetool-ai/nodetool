import { allDockGroups, dockGroupOfPanel, dockRegionOfGroup } from "../../dock/DockLayout";
import { createDockLayoutStore, type DockLayoutStorage } from "../../dock/DockLayoutStore";
import { SKETCH_LAYOUT_PRESETS, SKETCH_PANEL_IDS, sketchDockLayoutModel } from "../SketchDockLayout";

function memoryStorage(): DockLayoutStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }
  };
}

describe("sketch dock model", () => {
  it("names the editor, its storage key and its required canvas", () => {
    expect(sketchDockLayoutModel.editorLabel).toBe("sketch");
    expect(sketchDockLayoutModel.persistKeyPrefix).toBe("nodetool.sketch-layout.v1");
    expect(sketchDockLayoutModel.requiredPanels).toEqual(["canvas"]);
    expect(sketchDockLayoutModel.presets[0]).toBe("Essentials");
  });

  it.each(SKETCH_LAYOUT_PRESETS)("builds a valid %s layout that places every panel once", (name) => {
    const layout = sketchDockLayoutModel.createLayout(name);
    expect(sketchDockLayoutModel.schema.safeParse(layout).success).toBe(true);
    const placed = allDockGroups(layout).flatMap((group) => group.panels).sort();
    expect(placed).toEqual([...SKETCH_PANEL_IDS].sort());
    expect(layout.hidden).not.toContain("canvas");
  });

  it("keeps the canvas in the viewport and the assistant in its own left column", () => {
    for (const name of SKETCH_LAYOUT_PRESETS) {
      const layout = sketchDockLayoutModel.createLayout(name);
      const canvas = dockGroupOfPanel(layout, "canvas");
      expect(canvas && dockRegionOfGroup(layout, canvas.id)).toBe("viewport");
      expect(layout.regions.left.map((group) => group.panels)).toEqual([["assistant"]]);
    }
  });

  it("gives each layout its own emphasis", () => {
    const essentials = sketchDockLayoutModel.createLayout("Essentials");
    const painting = sketchDockLayoutModel.createLayout("Painting");
    const compositing = sketchDockLayoutModel.createLayout("Compositing");
    const assistant = sketchDockLayoutModel.createLayout("Assistant");
    const weight = (layout: typeof essentials, id: string): number => dockGroupOfPanel(layout, id)?.weight ?? 1;
    expect(essentials.hidden).toEqual(["assistant"]);
    expect(weight(painting, "color")).toBeGreaterThan(weight(essentials, "color"));
    expect(compositing.regions.right[0].panels).toEqual(["layers"]);
    expect(compositing.sizes.right).toBeGreaterThan(essentials.sizes.right);
    expect(assistant.hidden).toEqual([]);
    expect(assistant.sizes.left).toBeGreaterThan(essentials.sizes.left);
  });

  it("switches layouts and resets to the chosen one through the shared dock store", () => {
    const store = createDockLayoutStore(sketchDockLayoutModel, { anonymous: true }, memoryStorage());
    store.getState().selectLayout("Assistant");
    expect(store.getState().layout.hidden).not.toContain("assistant");
    store.getState().dispatch({ type: "hide", panelId: "assistant" });
    store.getState().dispatch({ type: "hide", panelId: "canvas" });
    expect(store.getState().layout.hidden).toEqual(["assistant"]);
    store.getState().resetLayout();
    expect(store.getState().layout.hidden).toEqual([]);
    expect(store.getState().activeLayoutName).toBe("Assistant");
  });
});
