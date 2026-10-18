import { DOCK_REGIONS, allDockGroups, dockRegionOfGroup } from "../../dock/DockLayout";
import { gameDockLayoutModel } from "../../game/GamePanelLayout";
import {
  TIMELINE_PANEL_IDS, TIMELINE_SIDE_PANEL_IDS, TIMELINE_WORKSPACES, timelineDockLayoutModel
} from "../TimelineDockLayout";
import { createDockLayoutStoreCache } from "../../dock/browserDockLayoutStores";
import { applyLegacyPanelVisibility, createTimelineDockLayoutStoreCache } from "../useTimelineDockLayoutStore";
import type { DockLayoutStorage } from "../../dock/DockLayoutStore";

function memoryStorage(initial: Record<string, string> = {}): { storage: DockLayoutStorage; data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, storage: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); }
  } };
}

describe("timeline dock model", () => {
  it("names the editor, its storage key and its required panels", () => {
    expect(timelineDockLayoutModel.editorLabel).toBe("timeline");
    expect(timelineDockLayoutModel.persistKeyPrefix).toBe("nodetool.timeline-layout.v1");
    expect(timelineDockLayoutModel.requiredPanels).toEqual(["program", "tracks"]);
    expect(timelineDockLayoutModel.presets[0]).toBe("Editing");
  });

  it.each(TIMELINE_WORKSPACES)("builds a valid %s workspace that places every panel once", (name) => {
    const layout = timelineDockLayoutModel.createLayout(name);
    expect(timelineDockLayoutModel.schema.safeParse(layout).success).toBe(true);
    const placed = allDockGroups(layout).flatMap((group) => group.panels).sort();
    expect(placed).toEqual([...TIMELINE_PANEL_IDS].sort());
    for (const id of timelineDockLayoutModel.requiredPanels) {
      expect(layout.hidden).not.toContain(id);
    }
  });

  it("puts the source monitor in its own group beside the program monitor", () => {
    const layout = timelineDockLayoutModel.createLayout("Editing");
    const program = allDockGroups(layout).find((group) => group.panels.includes("program"));
    const source = allDockGroups(layout).find((group) => group.panels.includes("source"));
    expect(program && source && program.id !== source.id).toBe(true);
    expect(dockRegionOfGroup(layout, program?.id ?? "")).toBe("viewport");
    expect(dockRegionOfGroup(layout, source?.id ?? "")).toBe("viewport");
    expect(layout.hidden).toEqual([]);
  });

  it("keeps the tracks in the bottom region, with the side panels in one right group", () => {
    const layout = timelineDockLayoutModel.createLayout("Editing");
    expect(layout.regions.bottom.map((group) => group.panels)).toEqual([["tracks"]]);
    expect(layout.regions.right).toHaveLength(1);
    expect(layout.regions.right[0].panels).toEqual([...TIMELINE_SIDE_PANEL_IDS]);
    expect(layout.regions.left[0].panels).toEqual(["transcript"]);
  });

  it("gives each workspace its own emphasis", () => {
    const editing = timelineDockLayoutModel.createLayout("Editing");
    const script = timelineDockLayoutModel.createLayout("Script");
    const assistant = timelineDockLayoutModel.createLayout("Assistant");
    const review = timelineDockLayoutModel.createLayout("Review");
    expect(script.sizes.left).toBeGreaterThan(editing.sizes.left);
    expect(script.hidden).not.toContain("transcript");
    expect(assistant.regions.right[0].activePanelId).toBe("assistant");
    expect(assistant.sizes.right).toBeGreaterThan(editing.sizes.right);
    expect(assistant.hidden).toContain("transcript");
    expect(review.hidden.sort()).toEqual(["source", "transcript", ...TIMELINE_SIDE_PANEL_IDS].sort());
  });

  it("lets the tracks take most of the height, while the game keeps its half", () => {
    expect(timelineDockLayoutModel.maxBottomFraction).toBe(0.75);
    expect(gameDockLayoutModel.maxBottomFraction).toBeUndefined();
  });

  it("covers every dock region the canvas knows", () => {
    const layout = timelineDockLayoutModel.createLayout("Editing");
    for (const region of DOCK_REGIONS) {
      expect(layout.regions[region].length).toBeGreaterThan(0);
    }
  });
});

describe("legacy panel visibility", () => {
  const legacy = (state: Record<string, boolean>): Record<string, string> => ({ "nodetool.timeline.layout": JSON.stringify({ state, version: 0 }) });

  it("hides the transcript and the side panels the old toggles had closed, on a first visit only", () => {
    const { storage, data } = memoryStorage(legacy({ transcriptVisible: false, sidePanelVisible: false }));
    const cache = createTimelineDockLayoutStoreCache(storage);
    const store = cache("user-1");
    expect(store.getState().layout.hidden.sort()).toEqual(["transcript", ...TIMELINE_SIDE_PANEL_IDS].sort());
    expect(data.has("nodetool.timeline-layout.v1:user:user-1")).toBe(true);
    store.getState().dispatch({ type: "reveal", panelId: "transcript" });
    const reloaded = createTimelineDockLayoutStoreCache(storage)("user-1");
    expect(reloaded.getState().layout.hidden).not.toContain("transcript");
  });

  it("leaves a dock that already has a saved layout alone", () => {
    const { storage } = memoryStorage(legacy({ transcriptVisible: false, sidePanelVisible: false }));
    createDockLayoutStoreCache(timelineDockLayoutModel, storage)(null).getState().dispatch({ type: "resize", region: "left", size: 400 });
    const reloaded = createTimelineDockLayoutStoreCache(storage)(null);
    expect(reloaded.getState().layout.sizes.left).toBe(400);
    expect(reloaded.getState().layout.hidden).toEqual([]);
  });

  it("keeps the default layout when the old toggles were open or unreadable", () => {
    const open = createTimelineDockLayoutStoreCache(memoryStorage(legacy({ transcriptVisible: true, sidePanelVisible: true })).storage)(null);
    expect(open.getState().layout.hidden).toEqual([]);
    const broken = createTimelineDockLayoutStoreCache(memoryStorage({ "nodetool.timeline.layout": "{not json" }).storage)(null);
    expect(broken.getState().layout.hidden).toEqual([]);
  });

  it("can be applied to any store", () => {
    const { storage } = memoryStorage(legacy({ transcriptVisible: false }));
    const store = createTimelineDockLayoutStoreCache(memoryStorage().storage)("other");
    applyLegacyPanelVisibility(store, storage);
    expect(store.getState().layout.hidden).toEqual(["transcript"]);
  });
});
