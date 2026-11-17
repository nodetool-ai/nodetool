import {
  bindingKeys,
  formatActionShortcut,
  withActionShortcut,
  resolveTimelineAction,
  PREMIERE_ONLY_ACTIONS,
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
  it("resolves the Premiere edit keys", () => {
    expect(
      resolveTimelineAction(ev("k", { ctrlKey: true, altKey: true }), "premiere")
    ).toBe("splitAtPlayhead");
    expect(
      resolveTimelineAction(ev("K", { ctrlKey: true, shiftKey: true }), "premiere")
    ).toBe("cutAllTracks");
    expect(resolveTimelineAction(ev("Delete", { shiftKey: true }), "premiere")).toBe(
      "rippleDeleteSelected"
    );
    expect(resolveTimelineAction(ev("ArrowLeft", { altKey: true }), "premiere")).toBe(
      "nudgeLeft"
    );
    expect(
      resolveTimelineAction(ev("ArrowLeft", { altKey: true, shiftKey: true }), "premiere")
    ).toBe("nudgeLeftLarge");
  });

  it("resolves the Premiere layout", () => {
    expect(resolveTimelineAction(ev("s"), "premiere")).toBe("toggleSnap");
    expect(
      resolveTimelineAction(ev("k", { metaKey: true, altKey: true }), "premiere")
    ).toBe("splitAtPlayhead");
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

  it("binds the Premiere edits added for alignment", () => {
    expect(resolveTimelineAction(ev("r", { ctrlKey: true }), "premiere")).toBe(
      "speedDuration"
    );
    expect(resolveTimelineAction(ev("g"), "premiere")).toBe("audioGain");
    expect(
      resolveTimelineAction(ev("D", { ctrlKey: true, shiftKey: true }), "premiere")
    ).toBe("applyDefaultAudioTransition");
    expect(
      resolveTimelineAction(ev("v", { ctrlKey: true, altKey: true, code: "KeyV" }), "premiere")
    ).toBe("pasteAttributes");
    expect(resolveTimelineAction(ev("F", { shiftKey: true }), "premiere")).toBe(
      "revealInProject"
    );
    expect(resolveTimelineAction(ev("=", { ctrlKey: true }), "premiere")).toBe(
      "expandTracks"
    );
    expect(
      resolveTimelineAction(ev(" ", { ctrlKey: true, shiftKey: true }), "premiere")
    ).toBe("playInToOut");
  });

  it("gives Final Cut its loop and play-selection keys", () => {
    expect(resolveTimelineAction(ev("l", { ctrlKey: true }), "fcp")).toBe("toggleLoop");
    expect(
      resolveTimelineAction(ev("l", { ctrlKey: true, altKey: true, code: "KeyL" }), "fcp")
    ).toBe("linkClips");
    expect(resolveTimelineAction(ev("/"), "fcp")).toBe("playInToOut");
  });

  it("prefers the binding with more modifiers", () => {
    expect(resolveTimelineAction(ev("z", { ctrlKey: true }), "premiere")).toBe("undo");
    expect(
      resolveTimelineAction(ev("Z", { ctrlKey: true, shiftKey: true }), "premiere")
    ).toBe("redo");
  });

  it("matches ? whatever modifiers the layout needed", () => {
    expect(
      resolveTimelineAction(ev("?", { ctrlKey: true, altKey: true }), "premiere")
    ).toBe("toggleShortcuts");
  });

  it("returns null for an unbound key", () => {
    expect(resolveTimelineAction(ev("p"), "premiere")).toBeNull();
  });

  it("leaves Ctrl/Cmd+K to the command menu in every preset", () => {
    for (const preset of TIMELINE_KEYBOARD_PRESETS) {
      expect(resolveTimelineAction(ev("k", { ctrlKey: true }), preset)).toBeNull();
      expect(resolveTimelineAction(ev("k", { metaKey: true }), preset)).toBeNull();
    }
  });

  it("binds every action in Premiere, and in Final Cut all but the Premiere-only keys", () => {
    const actions = Object.keys(TIMELINE_KEYMAPS.premiere) as (keyof typeof TIMELINE_KEYMAPS.premiere)[];
    for (const action of actions) {
      expect(TIMELINE_KEYMAPS.premiere[action].length).toBeGreaterThan(0);
      expect(TIMELINE_KEYMAPS.fcp[action].length > 0).toBe(!PREMIERE_ONLY_ACTIONS.includes(action));
    }
  });

  it("binds Premiere's navigation, marker, track and panel keys", () => {
    const premiere = (key: string, mods: Partial<KeyEventLike> = {}) =>
      resolveTimelineAction(ev(key, mods), "premiere");
    expect(premiere("Home")).toBe("goToSequenceStart");
    expect(premiere("End", { shiftKey: true })).toBe("goToSelectedEnd");
    expect(premiere("ArrowDown", { shiftKey: true })).toBe("nextCutAnyTrack");
    expect(premiere("ArrowUp", { ctrlKey: true })).toBe("selectPrevClip");
    expect(premiere(":", { shiftKey: true, code: "Semicolon" })).toBe("nextGap");
    expect(premiere(";")).toBe("liftRange");
    expect(premiere("L", { shiftKey: true })).toBe("slowShuttleForward");
    expect(premiere("L", { ctrlKey: true, shiftKey: true })).toBe("toggleLoop");
    expect(premiere("K", { shiftKey: true })).toBe("playAround");
    expect(premiere(" ", { shiftKey: true })).toBe("playInToOutWithRoll");
    expect(premiere("ArrowLeft", { ctrlKey: true })).toBe("nudgeLeft");
    expect(premiere("x", { altKey: true })).toBe("clearRange");
    expect(premiere("m", { ctrlKey: true })).toBe("addMarkerInOut");
    expect(premiere("+", { shiftKey: true, code: "Equal" })).toBe("expandAllTracks");
    expect(premiere("]")).toBe("clipVolumeUp");
    expect(premiere("}", { shiftKey: true, code: "BracketRight" })).toBe("clipVolumeUpMore");
    expect(premiere("@", { shiftKey: true, code: "Digit2" })).toBe("panelSource");
    expect(premiere(">", { ctrlKey: true, shiftKey: true, code: "Period" })).toBe("nextPanel");
    // Alt+M stays the Video/DAW switch rather than Premiere's Clear Marker.
    expect(premiere("m", { altKey: true })).toBe("toggleDawMode");
  });

  it("Home and End reach the sequence ends in Final Cut too", () => {
    expect(resolveTimelineAction(ev("Home"), "fcp")).toBe("goToSequenceStart");
    expect(resolveTimelineAction(ev("End"), "fcp")).toBe("goToSequenceEnd");
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

describe("physical-key matching (macOS and US layouts)", () => {
  it("fires Option+T as fades even though the key is a dagger", () => {
    expect(
      resolveTimelineAction(ev("†", { altKey: true, code: "KeyT" }), "premiere")
    ).toBe("applyFades");
  });

  it("fires Option+K and Option+Shift+K as keyframe actions", () => {
    expect(
      resolveTimelineAction(ev("˚", { altKey: true, code: "KeyK" }), "premiere")
    ).toBe("addKeyframe");
    expect(
      resolveTimelineAction(
        ev("", { altKey: true, shiftKey: true, code: "KeyK" }),
        "premiere"
      )
    ).toBe("nextKeyframe");
  });

  it("fires Final Cut Shift+, and Option+, from their physical key", () => {
    expect(
      resolveTimelineAction(ev("<", { shiftKey: true, code: "Comma" }), "fcp")
    ).toBe("nudgeLeftLarge");
    expect(
      resolveTimelineAction(ev("≤", { altKey: true, code: "Comma" }), "fcp")
    ).toBe("trimEditLeft");
    expect(resolveTimelineAction(ev(",", { code: "Comma" }), "fcp")).toBe("nudgeLeft");
  });

  it("toggles the DAW layout on Option+M in every preset", () => {
    for (const preset of TIMELINE_KEYBOARD_PRESETS) {
      expect(
        resolveTimelineAction(ev("µ", { altKey: true, code: "KeyM" }), preset)
      ).toBe("toggleDawMode");
      expect(resolveTimelineAction(ev("m"), preset)).toBe("addMarker");
    }
  });

  it("still matches on key when the event has no code", () => {
    expect(resolveTimelineAction(ev("t", { altKey: true }), "premiere")).toBe(
      "applyFades"
    );
  });
});

describe("formatActionShortcut", () => {
  it("names the key the preset binds, so tooltips match the keymap", () => {
    expect(formatActionShortcut("fcp", "nudgeLeft")).toBe(",");
    expect(formatActionShortcut("premiere", "stepFrameBack")).toBe("←");
    expect(formatActionShortcut("fcp", "selectTool")).toBe("A");
    expect(formatActionShortcut("premiere", "toggleSnap")).toBe("S");
  });

  it("appends the shortcut to a label only when the action is bound", () => {
    expect(withActionShortcut("Next clip boundary", "premiere", "nextCut")).toBe(
      "Next clip boundary (↓)"
    );
  });
});

describe("backtick bindings on layouts where the key is dead", () => {
  const dead = (mods: Partial<KeyEventLike> = {}): KeyEventLike => ev("Dead", { code: "Backquote", ...mods });
  it.each([...TIMELINE_KEYBOARD_PRESETS])(
    "maximizes and shows the program full screen under %s",
    (preset) => {
      expect(resolveTimelineAction(dead(), preset)).toBe("maximizePanel");
      expect(resolveTimelineAction(dead({ ctrlKey: true }), preset)).toBe("toggleProgramFullscreen");
    }
  );
});
