import type { Shortcut } from "../../config/shortcuts";
import { ACTION_MAP } from "./shortcuts/actionRegistry";
import {
  BINDING_CATALOG,
  type BindingEntry
} from "./shortcuts/bindingCatalog";

function bindingToWinKeyCombo(entry: BindingEntry): string[] {
  const combo: string[] = [];
  if (entry.modifiers.ctrl) {
    combo.push("Control");
  }
  if (entry.modifiers.shift) {
    combo.push("Shift");
  }
  if (entry.modifiers.alt) {
    combo.push("Alt");
  }
  const raw = entry.key;
  if (raw.length === 1 && /[a-zA-Z]/.test(raw)) {
    combo.push(raw.toLowerCase());
  } else {
    combo.push(raw);
  }
  return combo;
}

function bindingToShortcut(entry: BindingEntry, index: number): Shortcut {
  const meta = ACTION_MAP.get(entry.actionId);
  const title = meta?.label ?? entry.actionId;

  let description: string | undefined;
  if (entry.scope === "mode:transform") {
    description = "While the transform tool is active";
  } else if (entry.scope === "mode:crop") {
    description = "While the crop tool is active";
  } else if (entry.scope === "panel:layers") {
    description = "When focus is in the Layers panel";
  }

  return {
    title,
    slug: `sketch-${entry.actionId}-b${index}`,
    keyCombo: bindingToWinKeyCombo(entry),
    category: "image-editor",
    description
  };
}

/** Shortcut rows for {@link KeyboardShortcutsView} in the image editor. */
export const SKETCH_KEYBOARD_SHORTCUTS: Shortcut[] = BINDING_CATALOG.map(
  (entry, index) => bindingToShortcut(entry, index)
);
