/**
 * @jest-environment jsdom
 */
import { BINDING_CATALOG, type ShortcutScope } from "../bindingCatalog";
import { SKETCH_ACTION_IDS, type SketchActionId } from "../actionRegistry";
import { ACTION_HANDLERS } from "../actionHandlers";

const ALL_ACTION_IDS = new Set<string>(SKETCH_ACTION_IDS);

describe("binding catalog integrity", () => {
  it("every actionId in the catalog exists in the action registry", () => {
    const unknown = BINDING_CATALOG.filter((b) => !ALL_ACTION_IDS.has(b.actionId));
    expect(unknown.map((b) => b.actionId)).toEqual([]);
  });

  it("has no duplicate bindings within the same scope (same key + modifiers)", () => {
    const seen = new Map<string, SketchActionId>();
    const duplicates: string[] = [];

    for (const entry of BINDING_CATALOG) {
      // panel:layers entries share keys intentionally (different focus targets) — skip.
      if (entry.scope === "panel:layers") continue;

      const parts: string[] = [entry.scope];
      if (entry.modifiers.ctrl) parts.push("ctrl");
      if (entry.modifiers.shift) parts.push("shift");
      if (entry.modifiers.alt) parts.push("alt");
      parts.push(entry.key);
      const fingerprint = parts.join("+");

      const existing = seen.get(fingerprint);
      if (existing && existing !== entry.actionId) {
        duplicates.push(`${fingerprint}: ${existing} vs ${entry.actionId}`);
      } else {
        seen.set(fingerprint, entry.actionId);
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("Ctrl+I and Ctrl+Shift+I are distinct (invert-colors vs invert-selection)", () => {
    const ctrlI = BINDING_CATALOG.find(
      (b) => b.key === "i" && b.modifiers.ctrl && !b.modifiers.shift && b.scope === "global"
    );
    const ctrlShiftI = BINDING_CATALOG.find(
      (b) => b.key === "i" && b.modifiers.ctrl && b.modifiers.shift && b.scope === "global"
    );
    expect(ctrlI?.actionId).toBe("invert-colors");
    expect(ctrlShiftI?.actionId).toBe("invert-selection");
  });

  it("M is bound to tool-select-rect (not mirror) in global scope", () => {
    const mBindings = BINDING_CATALOG.filter(
      (b) => b.key === "m" && !b.modifiers.ctrl && !b.modifiers.shift && !b.modifiers.alt && b.scope === "global"
    );
    expect(mBindings).toHaveLength(1);
    expect(mBindings[0].actionId).toBe("tool-select-rect");
  });

  it("mirror actions (M / Shift+M) have no catalog entries", () => {
    const mirrorEntries = BINDING_CATALOG.filter(
      (b) => b.actionId === ("mirror-horizontal" as SketchActionId) || b.actionId === ("mirror-vertical" as SketchActionId)
    );
    expect(mirrorEntries).toHaveLength(0);
  });

  it("every scope value is a known scope", () => {
    const validScopes: ShortcutScope[] = ["global", "mode:transform", "mode:crop", "panel:layers"];
    const invalid = BINDING_CATALOG.filter((b) => !validScopes.includes(b.scope));
    expect(invalid).toHaveLength(0);
  });

  it("mode:transform has undo, redo, commit, and cancel entries", () => {
    const transformEntries = BINDING_CATALOG.filter((b) => b.scope === "mode:transform");
    const ids = new Set(transformEntries.map((b) => b.actionId));
    expect(ids.has("transform-undo")).toBe(true);
    expect(ids.has("transform-redo")).toBe(true);
    expect(ids.has("transform-commit")).toBe(true);
    expect(ids.has("transform-cancel")).toBe(true);
  });

  it("mode:crop has commit and cancel entries", () => {
    const cropEntries = BINDING_CATALOG.filter((b) => b.scope === "mode:crop");
    const ids = new Set(cropEntries.map((b) => b.actionId));
    expect(ids.has("crop-commit")).toBe(true);
    expect(ids.has("crop-cancel")).toBe(true);
  });
});

describe("action handler coverage", () => {
  const NUDGE_IDS = new Set<SketchActionId>(["nudge-up", "nudge-down", "nudge-left", "nudge-right"]);
  const PANEL_IDS = new Set<SketchActionId>(["blend-mode-prev", "blend-mode-next", "canvas-preset-prev", "canvas-preset-next"]);

  it("every non-nudge, non-panel action in the catalog has a handler", () => {
    const missing: SketchActionId[] = [];
    for (const entry of BINDING_CATALOG) {
      if (NUDGE_IDS.has(entry.actionId)) continue;
      if (PANEL_IDS.has(entry.actionId)) continue;
      if (!(entry.actionId in ACTION_HANDLERS)) {
        missing.push(entry.actionId);
      }
    }
    // Deduplicate (same action may appear multiple times in catalog)
    expect([...new Set(missing)]).toEqual([]);
  });
});
