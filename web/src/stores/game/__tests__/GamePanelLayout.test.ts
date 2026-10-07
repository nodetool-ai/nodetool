import {
  createGamePanelLayout, gamePanelLayoutSchema, hydrateGamePanelLayout,
  registerMissingGamePanels, transitionGamePanelLayout
} from "../GamePanelLayout";

it("moves the viewport, repairs groups and restores Wide's usable topology", () => {
  const initial = createGamePanelLayout();
  const moved = transitionGamePanelLayout(initial, {
    type: "move", panelId: "viewport", region: "left", groupId: "left-main", index: 1
  });
  expect(moved.regions.left[0].panels).toEqual(["hierarchy", "viewport", "revisions"]);
  expect(moved.regions.left[0].activePanelId).toBe("viewport");
  expect(moved.regions.viewport).toEqual([]);
  expect(initial).toEqual(createGamePanelLayout());
  expect(transitionGamePanelLayout(moved, { type: "hide", panelId: "viewport" })).toBe(moved);
  const wide = transitionGamePanelLayout(moved, { type: "preset", name: "Wide" });
  expect(wide.regions.viewport[0].panels).toEqual(["viewport"]);
  expect(wide.hidden).not.toContain("viewport");
});

it("reorders within the final list and does not mutate input for an invalid move", () => {
  const initial = createGamePanelLayout();
  const moved = transitionGamePanelLayout(initial, {
    type: "move", panelId: "hierarchy", region: "left", groupId: "left-main", index: 1
  });
  expect(moved.regions.left[0].panels).toEqual(["revisions", "hierarchy"]);
  expect(() => transitionGamePanelLayout(initial, {
    type: "move", panelId: "hierarchy", region: "right", groupId: "left-main", index: 0
  })).toThrow("another region");
  expect(initial).toEqual(createGamePanelLayout());
});

it("rejects duplicate placement, invalid active selection and a hidden viewport during hydration", () => {
  const initial = createGamePanelLayout();
  const duplicate = { ...initial, regions: { ...initial.regions,
    bottom: [{ id: "extra", panels: ["hierarchy"], activePanelId: "hierarchy" }] } };
  const invalidActive = { ...initial, regions: { ...initial.regions,
    left: [{ ...initial.regions.left[0], activePanelId: "missing" }] } };
  for (const invalid of [duplicate, invalidActive, { ...initial, hidden: ["viewport"] }]) {
    expect(gamePanelLayoutSchema.safeParse(invalid).success).toBe(false);
    expect(hydrateGamePanelLayout(invalid)).toEqual(initial);
  }
});

it("retains unknown panel placement and appends new registration without overwriting it", () => {
  const initial = createGamePanelLayout();
  const withUnknown = { ...initial, regions: { ...initial.regions,
    right: [{ ...initial.regions.right[0], panels: ["inspector", "assistant", "later-extension"] }] } };
  const hydrated = hydrateGamePanelLayout(JSON.parse(JSON.stringify(withUnknown)));
  expect(hydrated).toEqual(withUnknown);
  const seeded = registerMissingGamePanels(hydrated, [{
    id: "new-extension", title: "New", icon: null, dimensions: ["3d"], defaultRegion: "right"
  }]);
  expect(seeded.regions.right[0].panels).toEqual(["inspector", "assistant", "later-extension", "new-extension"]);
  expect(registerMissingGamePanels(seeded, [{
    id: "new-extension", title: "New", icon: null, dimensions: ["3d"], defaultRegion: "right"
  }])).toEqual(seeded);
});

it("seeds an empty region despite existing generated IDs and maximal panel IDs", () => {
  const initial = createGamePanelLayout();
  const before = { ...initial, regions: { ...initial.regions, bottom: [],
    right: [...initial.regions.right, { id: "bottom-extension-0", panels: ["unknown"], activePanelId: "unknown" }] } };
  const panelId = "x".repeat(256);
  const after = registerMissingGamePanels(before, [{
    id: panelId, title: "Extension", icon: null, dimensions: ["2d"], defaultRegion: "bottom"
  }]);
  expect(after.regions.bottom[0].panels).toEqual([panelId]);
  expect(after.regions.bottom[0].id).not.toBe("bottom-extension-0");
  expect(gamePanelLayoutSchema.safeParse(after).success).toBe(true);
  expect(after.regions.right).toEqual(before.regions.right);
});

it("keeps a singleton group in place for a within-group no-op", () => {
  const initial = createGamePanelLayout();
  const before = { ...initial, regions: { ...initial.regions,
    bottom: [{ id: "scripts-group", panels: ["scripts"], activePanelId: "scripts" },
      { id: "later", panels: ["extension"], activePanelId: "extension" }] } };
  const after = transitionGamePanelLayout(before, {
    type: "move", panelId: "scripts", region: "bottom", groupId: "scripts-group", index: 0
  });
  expect(after).toBe(before);
  expect(after.regions.bottom.map((entry) => entry.id)).toEqual(["scripts-group", "later"]);
});

it("rejects a hide beyond persisted capacity without committing invalid metadata", () => {
  const initial = createGamePanelLayout();
  const ids = Array.from({ length: 512 }, (_, index) => `extension-${index}`);
  const before = { ...initial, hidden: ids, regions: { ...initial.regions,
    bottom: [{ id: "many", panels: ids, activePanelId: ids[0] },
      { id: "last", panels: ["one-more"], activePanelId: "one-more" }] } };
  expect(gamePanelLayoutSchema.safeParse(before).success).toBe(true);
  expect(() => transitionGamePanelLayout(before, { type: "hide", panelId: "one-more" })).toThrow();
  expect(before.hidden).toEqual(ids);
  expect(gamePanelLayoutSchema.safeParse(before).success).toBe(true);
});

it("resets only built-in topology while retaining mixed and unavailable extension placement", () => {
  const initial = createGamePanelLayout();
  const before = { ...initial, hidden: ["assistant", "unavailable"], regions: {
    left: [{ id: "right-main", panels: ["viewport", "unknown-a", "unknown-b"], activePanelId: "viewport" }],
    right: [{ id: "mixed", panels: ["hierarchy", "unavailable", "inspector"], activePanelId: "unavailable" }],
    bottom: [{ id: "bottom-main", panels: ["scripts", "unknown-c"], activePanelId: "unknown-c" }],
    viewport: [{ id: "other-built-ins", panels: ["revisions", "assistant"], activePanelId: "revisions" }]
  } };
  expect(gamePanelLayoutSchema.safeParse(before).success).toBe(true);
  const after = transitionGamePanelLayout(before, { type: "preset", name: "Wide" });
  expect(after.regions.viewport[0].panels).toEqual(["viewport"]);
  expect(after.hidden).not.toContain("viewport");
  expect(after.hidden).toContain("unavailable");
  expect(after.regions.left.flatMap((entry) => entry.panels).filter((id) => id.startsWith("unknown")))
    .toEqual(["unknown-a", "unknown-b"]);
  expect(after.regions.left.find((entry) => entry.panels.includes("unknown-a"))?.id).not.toBe("right-main");
  expect(after.regions.right.find((entry) => entry.id === "mixed")?.panels).toEqual(["unavailable"]);
  expect(after.regions.bottom[0].panels).toEqual(["scripts", "unknown-c"]);
  expect(gamePanelLayoutSchema.safeParse(after).success).toBe(true);
  expect(before.regions.left[0].panels).toEqual(["viewport", "unknown-a", "unknown-b"]);
});

it("rejects preset capacity overflow without altering the previous valid layout", () => {
  const initial = createGamePanelLayout();
  const left = Array.from({ length: 128 }, (_, index) => ({
    id: `unknown-group-${index}`, panels: [`unknown-${index}`], activePanelId: `unknown-${index}`
  }));
  const before = { ...initial, regions: { ...initial.regions, left,
    right: [{ ...initial.regions.right[0], panels: [...initial.regions.right[0].panels, "hierarchy", "revisions"] }] } };
  expect(gamePanelLayoutSchema.safeParse(before).success).toBe(true);
  expect(() => transitionGamePanelLayout(before, { type: "preset", name: "Default" })).toThrow();
  expect(before.regions.left).toHaveLength(128);
  expect(gamePanelLayoutSchema.safeParse(before).success).toBe(true);
});
