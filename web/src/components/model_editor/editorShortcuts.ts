/**
 * Keyboard shortcuts of the 3D model editor. The editor binds these and the
 * shortcuts dialog and tooltips read them, so the help never drifts from the
 * bindings. `keys` are display labels; `combos` are the dispatcher strings
 * (lower-case keys, sorted, joined with "+").
 */

export type EditorAction =
  | "undo"
  | "redo"
  | "save"
  | "translate"
  | "rotate"
  | "scale"
  | "toggleSpace"
  | "toggleSnap"
  | "duplicate"
  | "delete"
  | "deselect"
  | "focusSelection"
  | "frameAll"
  | "hide"
  | "unhideAll"
  | "viewFront"
  | "viewBack"
  | "viewRight"
  | "viewLeft"
  | "viewTop"
  | "viewBottom"
  | "toggleGrid"
  | "toggleWireframe"
  | "showShortcuts";

export interface EditorShortcut {
  action: EditorAction;
  label: string;
  group: "General" | "Transform" | "Selection" | "View";
  keys: string[];
  combos: string[];
}

export const EDITOR_SHORTCUTS: readonly EditorShortcut[] = [
  { action: "undo", label: "Undo", group: "General", keys: ["Ctrl", "Z"], combos: ["control+z", "meta+z"] },
  {
    action: "redo",
    label: "Redo",
    group: "General",
    keys: ["Ctrl", "Shift", "Z"],
    combos: ["control+shift+z", "meta+shift+z", "control+y"]
  },
  { action: "save", label: "Save", group: "General", keys: ["Ctrl", "S"], combos: ["control+s", "meta+s"] },
  { action: "showShortcuts", label: "Keyboard shortcuts", group: "General", keys: ["?"], combos: ["?+shift"] },
  { action: "translate", label: "Move tool", group: "Transform", keys: ["G"], combos: ["g", "w"] },
  { action: "rotate", label: "Rotate tool", group: "Transform", keys: ["R"], combos: ["r", "e"] },
  { action: "scale", label: "Scale tool", group: "Transform", keys: ["S"], combos: ["s"] },
  { action: "toggleSpace", label: "Toggle local / world space", group: "Transform", keys: ["X"], combos: ["x"] },
  { action: "toggleSnap", label: "Toggle snapping (hold Ctrl to invert)", group: "Transform", keys: ["J"], combos: ["j"] },
  { action: "duplicate", label: "Duplicate", group: "Selection", keys: ["Ctrl", "D"], combos: ["control+d", "d+meta", "d+shift"] },
  { action: "delete", label: "Delete", group: "Selection", keys: ["Del"], combos: ["delete", "backspace"] },
  { action: "deselect", label: "Deselect", group: "Selection", keys: ["Esc"], combos: ["escape"] },
  { action: "hide", label: "Hide / show selected", group: "Selection", keys: ["H"], combos: ["h"] },
  { action: "unhideAll", label: "Show all", group: "Selection", keys: ["Alt", "H"], combos: ["alt+h"] },
  { action: "focusSelection", label: "Focus selection", group: "View", keys: ["F"], combos: ["f"] },
  { action: "frameAll", label: "Frame all", group: "View", keys: ["Home"], combos: ["home", "a+shift"] },
  { action: "viewFront", label: "Front view", group: "View", keys: ["1"], combos: ["1"] },
  { action: "viewBack", label: "Back view", group: "View", keys: ["Ctrl", "1"], combos: ["1+control"] },
  { action: "viewRight", label: "Right view", group: "View", keys: ["3"], combos: ["3"] },
  { action: "viewLeft", label: "Left view", group: "View", keys: ["Ctrl", "3"], combos: ["3+control"] },
  { action: "viewTop", label: "Top view", group: "View", keys: ["7"], combos: ["7"] },
  { action: "viewBottom", label: "Bottom view", group: "View", keys: ["Ctrl", "7"], combos: ["7+control"] },
  { action: "toggleGrid", label: "Toggle grid", group: "View", keys: ["Shift", "G"], combos: ["g+shift"] },
  { action: "toggleWireframe", label: "Toggle wireframe overlay", group: "View", keys: ["Shift", "W"], combos: ["shift+w"] }
];

const BY_ACTION = new Map(EDITOR_SHORTCUTS.map((s) => [s.action, s]));

/** Display keys for an action, for tooltips: `shortcutKeys("undo")` → ["Ctrl","Z"]. */
export const shortcutKeys = (action: EditorAction): string[] =>
  BY_ACTION.get(action)?.keys ?? [];

/** Tooltip text such as "Undo (Ctrl+Z)". */
export const withShortcut = (label: string, action: EditorAction): string => {
  const keys = shortcutKeys(action);
  return keys.length > 0 ? `${label} (${keys.join("+")})` : label;
};
