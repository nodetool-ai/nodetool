import {
  createSampleLayout, sampleLayoutSchema, hydrateSampleLayout,
  registerMissingSamplePanels, transitionSampleLayout
} from "../../../__mocks__/sampleDockModel";
import { createDockLayoutModel } from "../DockLayout";

it("moves the viewport, repairs groups and restores Wide's usable topology", () => {
  const initial = createSampleLayout();
  const moved = transitionSampleLayout(initial, {
    type: "move", panelId: "viewport", region: "left", groupId: "left-main", index: 1
  });
  expect(moved.regions.left[0].panels).toEqual(["hierarchy", "viewport", "revisions"]);
  expect(moved.regions.left[0].activePanelId).toBe("viewport");
  expect(moved.regions.viewport).toEqual([]);
  expect(initial).toEqual(createSampleLayout());
  expect(transitionSampleLayout(moved, { type: "hide", panelId: "viewport" })).toBe(moved);
  const wide = transitionSampleLayout(moved, { type: "preset", name: "Wide" });
  expect(wide.regions.viewport[0].panels).toEqual(["viewport"]);
  expect(wide.hidden).not.toContain("viewport");
});

it("reorders within the final list and does not mutate input for an invalid move", () => {
  const initial = createSampleLayout();
  const moved = transitionSampleLayout(initial, {
    type: "move", panelId: "hierarchy", region: "left", groupId: "left-main", index: 1
  });
  expect(moved.regions.left[0].panels).toEqual(["revisions", "hierarchy"]);
  expect(() => transitionSampleLayout(initial, {
    type: "move", panelId: "hierarchy", region: "right", groupId: "left-main", index: 0
  })).toThrow("another region");
  expect(initial).toEqual(createSampleLayout());
});

it("rejects duplicate placement, invalid active selection and a hidden viewport during hydration", () => {
  const initial = createSampleLayout();
  const duplicate = { ...initial, regions: { ...initial.regions,
    bottom: [{ id: "extra", panels: ["hierarchy"], activePanelId: "hierarchy" }] } };
  const invalidActive = { ...initial, regions: { ...initial.regions,
    left: [{ ...initial.regions.left[0], activePanelId: "missing" }] } };
  for (const invalid of [duplicate, invalidActive, { ...initial, hidden: ["viewport"] }]) {
    expect(sampleLayoutSchema.safeParse(invalid).success).toBe(false);
    expect(hydrateSampleLayout(invalid)).toEqual(initial);
  }
});

it("retains unknown panel placement and appends new registration without overwriting it", () => {
  const initial = createSampleLayout();
  const withUnknown = { ...initial, regions: { ...initial.regions,
    right: [{ ...initial.regions.right[0], panels: ["inspector", "assistant", "later-extension"] }] } };
  const hydrated = hydrateSampleLayout(JSON.parse(JSON.stringify(withUnknown)));
  expect(hydrated).toEqual(withUnknown);
  const seeded = registerMissingSamplePanels(hydrated, [{
    id: "new-extension", title: "New", icon: null, defaultRegion: "right"
  }]);
  expect(seeded.regions.right[0].panels).toEqual(["inspector", "assistant", "later-extension", "new-extension"]);
  expect(registerMissingSamplePanels(seeded, [{
    id: "new-extension", title: "New", icon: null, defaultRegion: "right"
  }])).toEqual(seeded);
});

it("seeds an empty region despite existing generated IDs and maximal panel IDs", () => {
  const initial = createSampleLayout();
  const before = { ...initial, regions: { ...initial.regions, bottom: [],
    right: [...initial.regions.right, { id: "bottom-extension-0", panels: ["unknown"], activePanelId: "unknown" }] } };
  const panelId = "x".repeat(256);
  const after = registerMissingSamplePanels(before, [{
    id: panelId, title: "Extension", icon: null, defaultRegion: "bottom"
  }]);
  expect(after.regions.bottom[0].panels).toEqual([panelId]);
  expect(after.regions.bottom[0].id).not.toBe("bottom-extension-0");
  expect(sampleLayoutSchema.safeParse(after).success).toBe(true);
  expect(after.regions.right).toEqual(before.regions.right);
});

it("keeps a singleton group in place for a within-group no-op", () => {
  const initial = createSampleLayout();
  const before = { ...initial, regions: { ...initial.regions,
    bottom: [{ id: "scripts-group", panels: ["scripts"], activePanelId: "scripts" },
      { id: "later", panels: ["extension"], activePanelId: "extension" }] } };
  const after = transitionSampleLayout(before, {
    type: "move", panelId: "scripts", region: "bottom", groupId: "scripts-group", index: 0
  });
  expect(after).toBe(before);
  expect(after.regions.bottom.map((entry) => entry.id)).toEqual(["scripts-group", "later"]);
});

it("rejects a hide beyond persisted capacity without committing invalid metadata", () => {
  const initial = createSampleLayout();
  const ids = Array.from({ length: 512 }, (_, index) => `extension-${index}`);
  const before = { ...initial, hidden: ids, regions: { ...initial.regions,
    bottom: [{ id: "many", panels: ids, activePanelId: ids[0] },
      { id: "last", panels: ["one-more"], activePanelId: "one-more" }] } };
  expect(sampleLayoutSchema.safeParse(before).success).toBe(true);
  expect(() => transitionSampleLayout(before, { type: "hide", panelId: "one-more" })).toThrow();
  expect(before.hidden).toEqual(ids);
  expect(sampleLayoutSchema.safeParse(before).success).toBe(true);
});

it("resets only built-in topology while retaining mixed and unavailable extension placement", () => {
  const initial = createSampleLayout();
  const before = { ...initial, hidden: ["assistant", "unavailable"], regions: {
    left: [{ id: "right-main", panels: ["viewport", "unknown-a", "unknown-b"], activePanelId: "viewport" }],
    right: [{ id: "mixed", panels: ["hierarchy", "unavailable", "inspector"], activePanelId: "unavailable" }],
    bottom: [{ id: "bottom-main", panels: ["scripts", "unknown-c"], activePanelId: "unknown-c" }],
    viewport: [{ id: "other-built-ins", panels: ["revisions", "assistant"], activePanelId: "revisions" }]
  } };
  expect(sampleLayoutSchema.safeParse(before).success).toBe(true);
  const after = transitionSampleLayout(before, { type: "preset", name: "Wide" });
  expect(after.regions.viewport[0].panels).toEqual(["viewport"]);
  expect(after.hidden).not.toContain("viewport");
  expect(after.hidden).toContain("unavailable");
  expect(after.regions.left.flatMap((entry) => entry.panels).filter((id) => id.startsWith("unknown")))
    .toEqual(["unknown-a", "unknown-b"]);
  expect(after.regions.left.find((entry) => entry.panels.includes("unknown-a"))?.id).not.toBe("right-main");
  expect(after.regions.right.find((entry) => entry.id === "mixed")?.panels).toEqual(["unavailable"]);
  expect(after.regions.bottom[0].panels).toEqual(["scripts", "unknown-c"]);
  expect(sampleLayoutSchema.safeParse(after).success).toBe(true);
  expect(before.regions.left[0].panels).toEqual(["viewport", "unknown-a", "unknown-b"]);
});

it("rejects preset capacity overflow without altering the previous valid layout", () => {
  const initial = createSampleLayout();
  const left = Array.from({ length: 128 }, (_, index) => ({
    id: `unknown-group-${index}`, panels: [`unknown-${index}`], activePanelId: `unknown-${index}`
  }));
  const before = { ...initial, regions: { ...initial.regions, left,
    right: [{ ...initial.regions.right[0], panels: [...initial.regions.right[0].panels, "hierarchy", "revisions"] }] } };
  expect(sampleLayoutSchema.safeParse(before).success).toBe(true);
  expect(() => transitionSampleLayout(before, { type: "preset", name: "Default" })).toThrow();
  expect(before.regions.left).toHaveLength(128);
  expect(sampleLayoutSchema.safeParse(before).success).toBe(true);
});

it("returns the same layout object for every no-op transition", () => {
  const initial = createSampleLayout();
  const noOps = [
    { type: "activate", panelId: "hierarchy" },
    { type: "reveal", panelId: "inspector" },
    { type: "hide", panelId: "assistant" },
    { type: "resize", region: "left", size: initial.sizes.left },
    { type: "move", panelId: "hierarchy", region: "left", groupId: "left-main", index: 0 },
    { type: "preset", name: "Default" }
  ] as const;
  for (const action of noOps) {
    expect(transitionSampleLayout(initial, action)).toBe(initial);
  }
  const wide = transitionSampleLayout(initial, { type: "preset", name: "Wide" });
  expect(wide).not.toBe(initial);
  expect(transitionSampleLayout(wide, { type: "preset", name: "Wide" })).toBe(wide);
  expect(initial).toEqual(createSampleLayout());
});

it("still returns a new layout when a transition changes state", () => {
  const initial = createSampleLayout();
  const activated = transitionSampleLayout(initial, { type: "activate", panelId: "revisions" });
  expect(activated).not.toBe(initial);
  expect(activated.regions.left[0].activePanelId).toBe("revisions");
  const revealed = transitionSampleLayout(initial, { type: "reveal", panelId: "assistant" });
  expect(revealed.hidden).not.toContain("assistant");
  expect(revealed.regions.right[0].activePanelId).toBe("assistant");
  expect(transitionSampleLayout(initial, { type: "resize", region: "left", size: 300 }).sizes.left).toBe(300);
});

it("places a new group beside its anchor and keeps the moved panel's old group weights", () => {
  const initial = createSampleLayout();
  const above = transitionSampleLayout(initial, {
    type: "move", panelId: "revisions", region: "left", groupId: "left-revisions", index: 0,
    anchor: { groupId: "left-main", side: "before" }
  });
  expect(above.regions.left.map((entry) => entry.id)).toEqual(["left-revisions", "left-main"]);
  expect(above.regions.left[1].panels).toEqual(["hierarchy"]);
  const beside = transitionSampleLayout(above, {
    type: "move", panelId: "scripts", region: "left", groupId: "left-scripts", index: 0,
    anchor: { groupId: "left-revisions", side: "after" }
  });
  expect(beside.regions.left.map((entry) => entry.id)).toEqual(["left-revisions", "left-scripts", "left-main"]);
  expect(beside.regions.bottom).toEqual([]);
  const missingAnchor = transitionSampleLayout(initial, {
    type: "move", panelId: "inspector", region: "bottom", groupId: "bottom-inspector", index: 0,
    anchor: { groupId: "nowhere", side: "before" }
  });
  expect(missingAnchor.regions.bottom.map((entry) => entry.id)).toEqual(["bottom-main", "bottom-inspector"]);
});

it("stores group weights, compares them and rejects out-of-range values", () => {
  const split = transitionSampleLayout(createSampleLayout(), {
    type: "move", panelId: "revisions", region: "left", groupId: "left-revisions", index: 0
  });
  const weighted = transitionSampleLayout(split, { type: "resizeGroups", region: "left", weights: { "left-main": 1.5, "left-revisions": 0.5 } });
  expect(weighted.regions.left.map((entry) => entry.weight)).toEqual([1.5, 0.5]);
  expect(transitionSampleLayout(weighted, { type: "resizeGroups", region: "left", weights: { "left-main": 1.5 } })).toBe(weighted);
  expect(() => transitionSampleLayout(weighted, { type: "resizeGroups", region: "left", weights: { "left-main": 0 } })).toThrow();
  expect(hydrateSampleLayout(JSON.parse(JSON.stringify(weighted)))).toEqual(weighted);
});

it("enforces every configured required panel and the configured presets", () => {
  const model = createDockLayoutModel({
    editorLabel: "demo", persistKeyPrefix: "demo.v1", requiredPanels: ["program", "tracks"], presets: ["Edit", "Review"],
    createPreset: (name) => ({
      version: 1,
      regions: {
        left: [], right: [{ id: "right-main", panels: ["inspector"], activePanelId: "inspector" }],
        bottom: [{ id: "bottom-main", panels: ["tracks"], activePanelId: "tracks" }],
        viewport: [{ id: "viewport-main", panels: ["program"], activePanelId: "program" }]
      },
      hidden: name === "Review" ? ["inspector"] : [],
      sizes: { left: 200, right: 300, bottom: 240 }
    })
  });
  const layout = model.createLayout();
  expect(layout.hidden).toEqual([]);
  expect(model.createLayout("Review").hidden).toEqual(["inspector"]);
  expect(model.transition(layout, { type: "hide", panelId: "tracks" })).toBe(layout);
  expect(model.transition(layout, { type: "hide", panelId: "program" })).toBe(layout);
  expect(model.transition(layout, { type: "hide", panelId: "inspector" }).hidden).toEqual(["inspector"]);
  expect(model.schema.safeParse({ ...layout, hidden: ["tracks"] }).success).toBe(false);
  const withoutTracks = { ...layout, regions: { ...layout.regions, bottom: [] } };
  expect(model.schema.safeParse(withoutTracks).success).toBe(false);
  expect(model.hydrate(withoutTracks)).toEqual(layout);
  expect(model.transition(model.transition(layout, { type: "hide", panelId: "inspector" }), { type: "preset", name: "Edit" }).hidden)
    .toEqual([]);
  expect(() => model.transition(layout, { type: "activate", panelId: "missing" })).toThrow("Demo panel missing has no layout placement");
});
