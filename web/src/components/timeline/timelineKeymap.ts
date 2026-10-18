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
  | "trackSelectTool"
  | "trackSelectBackwardTool"
  | "slideTool"
  | "handTool"
  | "zoomTool"
  | "rippleTool"
  | "rollTool"
  | "rateStretchTool"
  | "cutTool"
  | "slipTool"
  | "splitAtPlayhead"
  | "cutAllTracks"
  | "deleteSelected"
  | "rippleDeleteSelected"
  | "duplicate"
  | "duplicateWithGap"
  | "selectAll"
  | "deselectAll"
  | "selectClipAtPlayhead"
  | "toggleClipEnabled"
  | "linkClips"
  | "groupClips"
  | "ungroupClips"
  | "rippleTrimPrevToPlayhead"
  | "rippleTrimNextToPlayhead"
  | "liftRange"
  | "extractRange"
  | "escape"
  | "copy"
  | "cut"
  | "paste"
  | "stepFrameBack"
  | "stepFrameForward"
  | "stepFramesBack"
  | "stepFramesForward"
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
  | "markClip"
  | "goToIn"
  | "goToOut"
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
  | "applyFades"
  | "addKeyframe"
  | "nextKeyframe"
  | "prevKeyframe"
  | "sourceAppend"
  | "sourceInsert"
  | "sourceOverwrite"
  | "toggleDawMode"
  | "speedDuration"
  | "applyDefaultAudioTransition"
  | "audioGain"
  | "pasteAttributes"
  | "pasteInsert"
  | "matchFrame"
  | "revealInProject"
  | "expandTracks"
  | "shrinkTracks"
  | "toggleLoop"
  | "playInToOut"
  | "maximizePanel"
  | "toggleProgramFullscreen"
  | "resetWorkspace"
  | "workspace1"
  | "workspace2"
  | "workspace3"
  | "workspace4";

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
  deselectAll: [k("a", { ctrl: true, shift: true })],
  // Group and ungroup are Premiere's Ctrl+G and Ctrl+Shift+G; no preset
  // uses those keys for anything else.
  groupClips: [k("g", { ctrl: true })],
  ungroupClips: [k("g", { ctrl: true, shift: true })],
  escape: [k("Escape")],
  copy: [k("c", { ctrl: true })],
  cut: [k("x", { ctrl: true })],
  paste: [k("v", { ctrl: true })],
  markIn: [k("i")],
  markOut: [k("o")],
  // X marks the clip under the playhead in Premiere and Final Cut alike.
  markClip: [k("x")],
  goToIn: [k("i", { shift: true })],
  goToOut: [k("o", { shift: true })],
  stepFrameBack: [k("ArrowLeft")],
  stepFrameForward: [k("ArrowRight")],
  shuttleBack: [k("j")],
  shuttleStop: [k("k")],
  shuttleForward: [k("l")],
  addMarker: [k("m")],
  prevCut: [k("ArrowUp"), k("PageUp")],
  nextCut: [k("ArrowDown"), k("PageDown")],
  undo: [k("z", { ctrl: true })],
  redo: [k("z", { ctrl: true, shift: true }), k("y", { ctrl: true })],
  // Final Cut applies fades to the selection on Option+T; nothing else in
  // any preset claims it.
  applyFades: [k("t", { alt: true })],
  addKeyframe: [k("k", { alt: true })],
  nextKeyframe: [k("k", { alt: true, shift: true })],
  prevKeyframe: [k("k", { ctrl: true, alt: true, shift: true })],
  // Video or DAW layout. Alt+M is free in every preset; Option+M types "µ"
  // on macOS, so the binding matches the physical key.
  toggleDawMode: [k("m", { alt: true })],
  // Premiere's Speed/Duration (Ctrl+R), audio gain (G), Hand (H), Zoom (Z),
  // Slide (U) and match frame (F) are free in every preset.
  speedDuration: [k("r", { ctrl: true })],
  audioGain: [k("g")],
  handTool: [k("h")],
  zoomTool: [k("z")],
  slideTool: [k("u")],
  matchFrame: [k("f")],
  revealInProject: [k("f", { shift: true })],
  // Premiere's workspace keys, free in every preset: ` maximizes the panel
  // group under focus, Ctrl+` shows the Program monitor full screen, and
  // Alt+Shift+1 to 4 switch workspace. Reset has no Premiere default.
  maximizePanel: [k("`")],
  toggleProgramFullscreen: [k("`", { ctrl: true })],
  resetWorkspace: [k("0", { alt: true, shift: true })],
  workspace1: [k("1", { alt: true, shift: true })],
  workspace2: [k("2", { alt: true, shift: true })],
  workspace3: [k("3", { alt: true, shift: true })],
  workspace4: [k("4", { alt: true, shift: true })]
};

const NODETOOL: Keymap = {
  ...(COMMON as Keymap),
  // The edit tools take Premiere's letters where this layout leaves them
  // free. N is snapping here, so the Rolling Edit tool sits on Shift+B, next
  // to Ripple. D, W and Shift+E are the source edits, so the Premiere edits
  // that use them move to Shift+D, brackets and Ctrl+Shift+E.
  selectTool: [k("v")],
  trackSelectTool: [k("a")],
  trackSelectBackwardTool: [k("a", { shift: true })],
  rippleTool: [k("b")],
  rollTool: [k("b", { shift: true })],
  rateStretchTool: [k("r")],
  cutTool: [k("c")],
  slipTool: [k("y")],
  selectClipAtPlayhead: [k("d", { shift: true })],
  toggleClipEnabled: [k("e", { ctrl: true, shift: true })],
  rippleTrimPrevToPlayhead: [k("[")],
  rippleTrimNextToPlayhead: [k("]")],
  liftRange: [k(";")],
  extractRange: [k("'")],
  stepFramesBack: [k("ArrowLeft", { alt: true, shift: true })],
  stepFramesForward: [k("ArrowRight", { alt: true, shift: true })],
  splitAtPlayhead: [k("s")],
  // Ctrl/Cmd+K opens the app's command menu on every view.
  cutAllTracks: [k("k", { ctrl: true, shift: true })],
  rippleDeleteSelected: [k("Delete", { shift: true }), k("Backspace", { shift: true })],
  duplicate: [k("d", { ctrl: true })],
  duplicateWithGap: [k("d", { ctrl: true, shift: true })],
  stepFrameBack: [k("ArrowLeft", { alt: true })],
  stepFrameForward: [k("ArrowRight", { alt: true })],
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
  sourceOverwrite: [k("d")],
  linkClips: [k("l", { ctrl: true })],
  // Ctrl+Shift+D is duplicate-with-gap here, so the audio cross-fade sits
  // beside the video one on Ctrl+Alt+T.
  applyDefaultAudioTransition: [k("t", { ctrl: true, alt: true })],
  pasteAttributes: [k("v", { ctrl: true, alt: true })],
  pasteInsert: [k("v", { ctrl: true, shift: true })],
  expandTracks: [k("=", { ctrl: true })],
  shrinkTracks: [k("-", { ctrl: true })],
  toggleLoop: [k("l", { shift: true })],
  playInToOut: [k(" ", { ctrl: true, shift: true })]
};

const PREMIERE: Keymap = {
  ...(COMMON as Keymap),
  // Premiere's Tools panel: V A B N R C Y.
  selectTool: [k("v")],
  trackSelectTool: [k("a")],
  trackSelectBackwardTool: [k("a", { shift: true })],
  rippleTool: [k("b")],
  rollTool: [k("n")],
  rateStretchTool: [k("r")],
  cutTool: [k("c")],
  slipTool: [k("y")],
  selectClipAtPlayhead: [k("d")],
  toggleClipEnabled: [k("e", { shift: true })],
  rippleTrimPrevToPlayhead: [k("q")],
  rippleTrimNextToPlayhead: [k("w")],
  liftRange: [k(";")],
  extractRange: [k("'")],
  stepFramesBack: [k("ArrowLeft", { shift: true })],
  stepFramesForward: [k("ArrowRight", { shift: true })],
  // Premiere splits on Cmd+K, which opens the app's command menu here, so
  // the split adds Alt.
  splitAtPlayhead: [k("k", { ctrl: true, alt: true })],
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
  // Shift+E enables and disables clips in Premiere, so append adds Ctrl.
  sourceAppend: [k("e", { ctrl: true, shift: true })],
  sourceInsert: [k(",")],
  sourceOverwrite: [k(".")],
  linkClips: [k("l", { ctrl: true })],
  applyDefaultAudioTransition: [k("d", { ctrl: true, shift: true })],
  pasteAttributes: [k("v", { ctrl: true, alt: true })],
  pasteInsert: [k("v", { ctrl: true, shift: true })],
  expandTracks: [k("=", { ctrl: true })],
  shrinkTracks: [k("-", { ctrl: true })],
  // Premiere ships the loop toggle unbound; Shift+L sits next to the
  // shuttle keys.
  toggleLoop: [k("l", { shift: true })],
  playInToOut: [k(" ", { ctrl: true, shift: true })]
};

const FCP: Keymap = {
  ...(COMMON as Keymap),
  // Final Cut's Trim tool (T) ripples an edge and Shift+T stands in for its
  // roll. C selects the clip under the playhead, V toggles it on and off,
  // and Option+[ / Option+] trim to the playhead.
  selectTool: [k("a")],
  trackSelectTool: [k("a", { shift: true })],
  trackSelectBackwardTool: [k("a", { alt: true, shift: true })],
  rippleTool: [k("t")],
  rollTool: [k("t", { shift: true })],
  rateStretchTool: [k("r")],
  cutTool: [k("b")],
  slipTool: [k("y")],
  selectClipAtPlayhead: [k("c")],
  toggleClipEnabled: [k("v")],
  rippleTrimPrevToPlayhead: [k("[", { alt: true })],
  rippleTrimNextToPlayhead: [k("]", { alt: true })],
  liftRange: [k(";")],
  extractRange: [k("'")],
  stepFramesBack: [k("ArrowLeft", { shift: true })],
  stepFramesForward: [k("ArrowRight", { shift: true })],
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
  sourceOverwrite: [k("d")],
  // Final Cut loops playback on Cmd+L and plays the selection on /, so
  // linking moves to Ctrl+Alt+L. It pastes attributes on Cmd+Shift+V, and
  // Ctrl+= and Ctrl+- zoom, so track height moves to Ctrl+Alt+arrows.
  linkClips: [k("l", { ctrl: true, alt: true })],
  applyDefaultAudioTransition: [k("t", { ctrl: true, alt: true })],
  pasteAttributes: [k("v", { ctrl: true, shift: true })],
  pasteInsert: [k("v", { ctrl: true, alt: true })],
  expandTracks: [k("ArrowUp", { ctrl: true, alt: true })],
  shrinkTracks: [k("ArrowDown", { ctrl: true, alt: true })],
  toggleLoop: [k("l", { ctrl: true })],
  playInToOut: [k("/")]
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
  /** Physical key (`KeyboardEvent.code`). Optional so synthetic events still match on `key`. */
  code?: string;
}

const SYMBOL_CODES: Record<string, string> = {
  ",": "Comma",
  ".": "Period",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  ";": "Semicolon",
  "\\": "Backslash",
  "=": "Equal",
  "-": "Minus",
  "`": "Backquote"
};

/** The `e.code` of a binding's physical key, or null when it has none to match. */
function codeOf(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return SYMBOL_CODES[key] ?? null;
}

const isLetter = (key: string): boolean => /^[a-z]$/i.test(key);

function matches(binding: KeyBinding, e: KeyEventLike): boolean {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = isLetter(e.key) ? e.key.toLowerCase() : e.key;
  // Option+T types "†" and Shift+, types "<" on macOS and US layouts, so
  // bindings that use Alt or Shift on a symbol match the physical key.
  const bindingCode = codeOf(binding.key);
  const symbolKey = binding.key.length === 1 && !isLetter(binding.key);
  const byCode =
    e.code !== undefined &&
    bindingCode !== null &&
    (binding.alt || (symbolKey && binding.shift));
  if (byCode ? e.code !== bindingCode : key !== binding.key) return false;
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
  Escape: "Esc",
  PageUp: "Page Up",
  PageDown: "Page Down"
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

/** One binding as tooltip text, e.g. "Alt+←". */
export function formatBinding(binding: KeyBinding): string {
  return bindingKeys(binding).join("+");
}

/** The first key `action` is bound to under `preset`, as tooltip text, or
 *  null when the preset leaves it unbound. */
export function formatActionShortcut(
  preset: TimelineKeyboardPreset,
  action: TimelineAction
): string | null {
  const binding = TIMELINE_KEYMAPS[preset][action]?.[0];
  return binding ? formatBinding(binding) : null;
}

/** `label` with the shortcut for `action` appended in parentheses, when bound. */
export function withActionShortcut(
  label: string,
  preset: TimelineKeyboardPreset,
  action: TimelineAction
): string {
  const shortcut = formatActionShortcut(preset, action);
  return shortcut ? `${label} (${shortcut})` : label;
}
