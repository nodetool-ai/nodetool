/**
 * Timeline keyboard map.
 *
 * Every keyboard action the tracks region performs has an id here, and each
 * preset binds those ids to keys the way one editor's users expect: the
 * NodeTool layout, Premiere's, or Final Cut's. The window handler in
 * TracksRegion resolves an event to an action through `resolveTimelineAction`
 * and never looks at `e.key` itself, and the shortcut sheet renders the same
 * table, so the two cannot disagree.
 *
 * A binding names a key (`e.key`, letters lower-case) and the exact modifier
 * state. Ctrl stands for Ctrl or Cmd. Shift is ignored for a symbol key, since
 * the symbol already is the shifted character on most layouts ("?", "+").
 */

export const TIMELINE_KEYBOARD_PRESETS = ["nodetool", "premiere", "fcp"] as const;
export type TimelineKeyboardPreset = (typeof TIMELINE_KEYBOARD_PRESETS)[number];

export const TIMELINE_KEYBOARD_PRESET_LABELS: Record<TimelineKeyboardPreset, string> = {
  nodetool: "NodeTool",
  premiere: "Premiere Pro",
  fcp: "Final Cut Pro"
};

export type TimelineAction =
  | "toggleShortcuts"
  | "selectTool"
  | "cutTool"
  | "splitAtPlayhead"
  | "cutAllTracks"
  | "deleteSelected"
  | "rippleDeleteSelected"
  | "duplicate"
  | "duplicateWithGap"
  | "selectAll"
  | "escape"
  | "copy"
  | "cut"
  | "paste"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeLeftLarge"
  | "nudgeRightLarge"
  | "extendEdit"
  | "trimEditLeft"
  | "trimEditRight"
  | "trimEditLeftLarge"
  | "trimEditRightLarge"
  | "markIn"
  | "markOut"
  | "clearRange"
  | "shuttleBack"
  | "shuttleStop"
  | "shuttleForward"
  | "addMarker"
  | "nextMarker"
  | "prevMarker"
  | "prevCut"
  | "nextCut"
  | "zoomIn"
  | "zoomOut"
  | "zoomFit"
  | "undo"
  | "redo"
  | "toggleSnap"
  | "applyDefaultTransition"
  | "addKeyframe"
  | "nextKeyframe"
  | "prevKeyframe"
  | "sourceAppend"
  | "sourceInsert"
  | "sourceOverwrite";

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

type Keymap = Record<TimelineAction, KeyBinding[]>;

const k = (key: string, mods: Omit<KeyBinding, "key"> = {}): KeyBinding => ({
  key,
  ...mods
});

/** Bindings every preset shares. */
const COMMON: Partial<Keymap> = {
  toggleShortcuts: [k("?")],
  deleteSelected: [k("Delete"), k("Backspace")],
  selectAll: [k("a", { ctrl: true })],
  escape: [k("Escape")],
  copy: [k("c", { ctrl: true })],
  cut: [k("x", { ctrl: true })],
  paste: [k("v", { ctrl: true })],
  markIn: [k("i")],
  markOut: [k("o")],
  shuttleBack: [k("j")],
  shuttleStop: [k("k")],
  shuttleForward: [k("l")],
  addMarker: [k("m")],
  prevCut: [k("ArrowUp")],
  nextCut: [k("ArrowDown")],
  undo: [k("z", { ctrl: true })],
  redo: [k("z", { ctrl: true, shift: true }), k("y", { ctrl: true })],
  addKeyframe: [k("k", { alt: true })],
  nextKeyframe: [k("k", { alt: true, shift: true })],
  prevKeyframe: [k("k", { ctrl: true, alt: true, shift: true })]
};

const NODETOOL: Keymap = {
  ...(COMMON as Keymap),
  selectTool: [k("v")],
  cutTool: [k("c")],
  splitAtPlayhead: [k("s")],
  cutAllTracks: [k("k", { ctrl: true })],
  rippleDeleteSelected: [k("Delete", { shift: true }), k("Backspace", { shift: true })],
  duplicate: [k("d", { ctrl: true })],
  duplicateWithGap: [k("d", { ctrl: true, shift: true })],
  nudgeLeft: [k("ArrowLeft")],
  nudgeRight: [k("ArrowRight")],
  nudgeLeftLarge: [k("ArrowLeft", { shift: true })],
  nudgeRightLarge: [k("ArrowRight", { shift: true })],
  extendEdit: [k("e")],
  trimEditLeft: [k("ArrowLeft", { ctrl: true, shift: true })],
  trimEditRight: [k("ArrowRight", { ctrl: true, shift: true })],
  trimEditLeftLarge: [k("ArrowLeft", { ctrl: true, shift: true, alt: true })],
  trimEditRightLarge: [k("ArrowRight", { ctrl: true, shift: true, alt: true })],
  clearRange: [k("x", { ctrl: true, shift: true })],
  nextMarker: [k("m", { shift: true })],
  prevMarker: [k("m", { ctrl: true, shift: true })],
  zoomIn: [k("+"), k("=")],
  zoomOut: [k("-"), k("_")],
  zoomFit: [k("z", { shift: true })],
  toggleSnap: [k("n")],
  applyDefaultTransition: [k("t", { ctrl: true })],
  sourceAppend: [k("e", { shift: true })],
  sourceInsert: [k("w")],
  sourceOverwrite: [k("d")]
};

const PREMIERE: Keymap = {
  ...(COMMON as Keymap),
  selectTool: [k("v")],
  cutTool: [k("c")],
  splitAtPlayhead: [k("k", { ctrl: true })],
  cutAllTracks: [k("k", { ctrl: true, shift: true })],
  rippleDeleteSelected: [k("Delete", { shift: true }), k("Backspace", { shift: true })],
  duplicate: [k("d", { alt: true })],
  duplicateWithGap: [k("d", { alt: true, shift: true })],
  nudgeLeft: [k("ArrowLeft", { alt: true })],
  nudgeRight: [k("ArrowRight", { alt: true })],
  nudgeLeftLarge: [k("ArrowLeft", { alt: true, shift: true })],
  nudgeRightLarge: [k("ArrowRight", { alt: true, shift: true })],
  extendEdit: [k("e")],
  trimEditLeft: [k("ArrowLeft", { ctrl: true, alt: true })],
  trimEditRight: [k("ArrowRight", { ctrl: true, alt: true })],
  trimEditLeftLarge: [k("ArrowLeft", { ctrl: true, alt: true, shift: true })],
  trimEditRightLarge: [k("ArrowRight", { ctrl: true, alt: true, shift: true })],
  clearRange: [k("x", { ctrl: true, shift: true })],
  nextMarker: [k("m", { shift: true })],
  prevMarker: [k("m", { ctrl: true, shift: true })],
  zoomIn: [k("=")],
  zoomOut: [k("-")],
  zoomFit: [k("\\")],
  toggleSnap: [k("s")],
  applyDefaultTransition: [k("d", { ctrl: true })],
  sourceAppend: [k("e", { shift: true })],
  sourceInsert: [k(",")],
  sourceOverwrite: [k(".")]
};

const FCP: Keymap = {
  ...(COMMON as Keymap),
  selectTool: [k("a")],
  cutTool: [k("b")],
  splitAtPlayhead: [k("b", { ctrl: true })],
  cutAllTracks: [k("b", { ctrl: true, shift: true })],
  // Final Cut ripples on Delete; Shift+Delete lifts and leaves the gap.
  deleteSelected: [k("Delete", { shift: true }), k("Backspace", { shift: true })],
  rippleDeleteSelected: [k("Delete"), k("Backspace")],
  duplicate: [k("d", { ctrl: true })],
  duplicateWithGap: [k("d", { ctrl: true, shift: true })],
  nudgeLeft: [k(",")],
  nudgeRight: [k(".")],
  nudgeLeftLarge: [k(",", { shift: true })],
  nudgeRightLarge: [k(".", { shift: true })],
  extendEdit: [k("x", { shift: true })],
  trimEditLeft: [k(",", { alt: true })],
  trimEditRight: [k(".", { alt: true })],
  trimEditLeftLarge: [k(",", { alt: true, shift: true })],
  trimEditRightLarge: [k(".", { alt: true, shift: true })],
  clearRange: [k("x", { alt: true })],
  nextMarker: [k("'", { ctrl: true })],
  prevMarker: [k(";", { ctrl: true })],
  zoomIn: [k("=", { ctrl: true }), k("+", { ctrl: true })],
  zoomOut: [k("-", { ctrl: true })],
  zoomFit: [k("z", { shift: true })],
  toggleSnap: [k("n")],
  applyDefaultTransition: [k("t", { ctrl: true })],
  sourceAppend: [k("e")],
  sourceInsert: [k("w")],
  sourceOverwrite: [k("d")]
};

export const TIMELINE_KEYMAPS: Record<TimelineKeyboardPreset, Keymap> = {
  nodetool: NODETOOL,
  premiere: PREMIERE,
  fcp: FCP
};

/** The subset of a KeyboardEvent a binding is matched against. */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const isLetter = (key: string): boolean => /^[a-z]$/i.test(key);

function matches(binding: KeyBinding, e: KeyEventLike): boolean {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = isLetter(e.key) ? e.key.toLowerCase() : e.key;
  if (key !== binding.key) return false;
  // "?" can arrive as AltGr on some layouts (ctrl+alt); match the character.
  if (binding.key === "?") return true;
  if (ctrl !== Boolean(binding.ctrl)) return false;
  if (e.altKey !== Boolean(binding.alt)) return false;
  const symbol = binding.key.length === 1 && !isLetter(binding.key);
  if (!symbol && e.shiftKey !== Boolean(binding.shift)) return false;
  if (symbol && binding.shift && !e.shiftKey) return false;
  return true;
}

/**
 * The action `e` triggers under `preset`, or null. Bindings with more
 * modifiers are tried first so Ctrl+Shift+Z resolves to redo, not undo.
 */
export function resolveTimelineAction(
  e: KeyEventLike,
  preset: TimelineKeyboardPreset
): TimelineAction | null {
  const map = TIMELINE_KEYMAPS[preset];
  let best: { action: TimelineAction; weight: number } | null = null;
  for (const action of Object.keys(map) as TimelineAction[]) {
    for (const binding of map[action]) {
      if (!matches(binding, e)) continue;
      const weight =
        (binding.ctrl ? 1 : 0) + (binding.shift ? 1 : 0) + (binding.alt ? 1 : 0);
      if (!best || weight > best.weight) best = { action, weight };
    }
  }
  return best?.action ?? null;
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  " ": "Space",
  Escape: "Esc"
};

/** The key chips the shortcut sheet shows for one binding. */
export function bindingKeys(binding: KeyBinding): string[] {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");
  const label = KEY_LABELS[binding.key] ?? binding.key.toUpperCase();
  parts.push(label);
  return parts;
}
