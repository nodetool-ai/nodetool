import {
  bindingKeys,
  resolveTimelineAction,
  TIMELINE_KEYMAPS,
  TIMELINE_KEYBOARD_PRESETS,
  type KeyEventLike
} from "../timelineKeymap";

const ev = (key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods
});

describe("resolveTimelineAction", () => {
  it("resolves the NodeTool layout", () => {
    expect(resolveTimelineAction(ev("s"), "nodetool")).toBe("splitAtPlayhead");
    expect(resolveTimelineAction(ev("k", { ctrlKey: true }), "nodetool")).toBe("cutAllTracks");
    expect(resolveTimelineAction(ev("Delete", { shiftKey: true }), "nodetool")).toBe(
      "rippleDeleteSelected"
    );
    expect(resolveTimelineAction(ev("ArrowLeft"), "nodetool")).toBe("nudgeLeft");
    expect(resolveTimelineAction(ev("ArrowLeft", { shiftKey: true }), "nodetool")).toBe(
      "nudgeLeftLarge"
    );
  });

  it("resolves the Premiere layout", () => {
    expect(resolveTimelineAction(ev("s"), "premiere")).toBe("toggleSnap");
    expect(resolveTimelineAction(ev("k", { metaKey: true }), "premiere")).toBe(
      "splitAtPlayhead"
    );
    expect(resolveTimelineAction(ev("\\"), "premiere")).toBe("zoomFit");
    expect(resolveTimelineAction(ev("d", { ctrlKey: true }), "premiere")).toBe(
      "applyDefaultTransition"
    );
  });

  it("resolves the Final Cut layout, where Delete ripples", () => {
    expect(resolveTimelineAction(ev("Delete"), "fcp")).toBe("rippleDeleteSelected");
    expect(resolveTimelineAction(ev("Delete", { shiftKey: true }), "fcp")).toBe(
      "deleteSelected"
    );
    expect(resolveTimelineAction(ev("a"), "fcp")).toBe("selectTool");
    expect(resolveTimelineAction(ev("e"), "fcp")).toBe("sourceAppend");
    expect(resolveTimelineAction(ev("X", { shiftKey: true }), "fcp")).toBe("extendEdit");
  });

  it("prefers the binding with more modifiers", () => {
    expect(resolveTimelineAction(ev("z", { ctrlKey: true }), "nodetool")).toBe("undo");
    expect(
      resolveTimelineAction(ev("Z", { ctrlKey: true, shiftKey: true }), "nodetool")
    ).toBe("redo");
  });

  it("matches ? whatever modifiers the layout needed", () => {
    expect(
      resolveTimelineAction(ev("?", { ctrlKey: true, altKey: true }), "premiere")
    ).toBe("toggleShortcuts");
  });

  it("returns null for an unbound key", () => {
    expect(resolveTimelineAction(ev("q"), "nodetool")).toBeNull();
  });

  it("binds every action in every preset", () => {
    const actions = Object.keys(TIMELINE_KEYMAPS.nodetool);
    for (const preset of TIMELINE_KEYBOARD_PRESETS) {
      for (const action of actions) {
        expect(TIMELINE_KEYMAPS[preset][action as keyof typeof TIMELINE_KEYMAPS.nodetool].length).toBeGreaterThan(0);
      }
    }
  });

  it("no two actions share a binding inside a preset", () => {
    for (const preset of TIMELINE_KEYBOARD_PRESETS) {
      const seen = new Map<string, string>();
      for (const [action, bindings] of Object.entries(TIMELINE_KEYMAPS[preset])) {
        for (const b of bindings) {
          const sig = `${b.key}|${b.ctrl ? 1 : 0}${b.shift ? 1 : 0}${b.alt ? 1 : 0}`;
          expect(seen.get(sig) ?? action).toBe(action);
          seen.set(sig, action);
        }
      }
    }
  });
});

describe("bindingKeys", () => {
  it("spells modifiers and arrows for the sheet", () => {
    expect(bindingKeys({ key: "ArrowLeft", ctrl: true, shift: true })).toEqual([
      "Ctrl",
      "Shift",
      "←"
    ]);
    expect(bindingKeys({ key: "z", shift: true })).toEqual(["Shift", "Z"]);
  });
});
