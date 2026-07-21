import type { SketchActionId } from "./actionRegistry";

export type ShortcutScope = "global" | "mode:transform" | "mode:crop" | "panel:layers";

export interface BindingEntry {
  /** Lowercase alpha or standard key name: "z", "ArrowUp", "[", "Escape", "Enter", "Backspace", "Delete", "Tab" */
  readonly key: string;
  readonly modifiers: {
    /** Ctrl on Win/Linux, Cmd on Mac — normalized at match time */
    readonly ctrl?: true;
    readonly shift?: true;
    readonly alt?: true;
  };
  readonly actionId: SketchActionId;
  readonly scope: ShortcutScope;
}

export const BINDING_CATALOG: readonly BindingEntry[] = [
  // ── Global: Edit ──────────────────────────────────────────────────────────
  { key: "z", modifiers: { ctrl: true }, actionId: "undo", scope: "global" },
  { key: "z", modifiers: { ctrl: true, shift: true }, actionId: "redo", scope: "global" },
  { key: "y", modifiers: { ctrl: true }, actionId: "redo", scope: "global" },
  { key: "c", modifiers: { ctrl: true }, actionId: "copy", scope: "global" },
  { key: "x", modifiers: { ctrl: true }, actionId: "cut", scope: "global" },
  { key: "v", modifiers: { ctrl: true }, actionId: "paste", scope: "global" },
  { key: "v", modifiers: { ctrl: true, shift: true }, actionId: "paste-masked", scope: "global" },
  { key: "t", modifiers: { ctrl: true }, actionId: "free-transform", scope: "global" },
  { key: "t", modifiers: { ctrl: true, shift: true }, actionId: "repeat-transform", scope: "global" },
  { key: "t", modifiers: { ctrl: true, shift: true, alt: true }, actionId: "repeat-transform-on-copy", scope: "global" },
  { key: "Backspace", modifiers: {}, actionId: "clear-layer", scope: "global" },
  { key: "Delete", modifiers: {}, actionId: "clear-layer", scope: "global" },
  { key: "Backspace", modifiers: { ctrl: true }, actionId: "fill-background", scope: "global" },
  { key: "Backspace", modifiers: { alt: true }, actionId: "fill-foreground", scope: "global" },
  { key: "i", modifiers: { ctrl: true }, actionId: "invert-colors", scope: "global" },
  { key: "Escape", modifiers: {}, actionId: "cancel-or-deselect", scope: "global" },
  { key: "ArrowUp", modifiers: {}, actionId: "nudge-up", scope: "global" },
  { key: "ArrowDown", modifiers: {}, actionId: "nudge-down", scope: "global" },
  { key: "ArrowLeft", modifiers: {}, actionId: "nudge-left", scope: "global" },
  { key: "ArrowRight", modifiers: {}, actionId: "nudge-right", scope: "global" },

  // ── Global: Selection ─────────────────────────────────────────────────────
  { key: "a", modifiers: { ctrl: true }, actionId: "select-all", scope: "global" },
  { key: "d", modifiers: { ctrl: true }, actionId: "deselect", scope: "global" },
  { key: "d", modifiers: { ctrl: true, shift: true }, actionId: "reselect", scope: "global" },
  { key: "i", modifiers: { ctrl: true, shift: true }, actionId: "invert-selection", scope: "global" },

  // ── Global: Canvas ────────────────────────────────────────────────────────
  { key: "0", modifiers: { ctrl: true }, actionId: "zoom-fit", scope: "global" },
  { key: "1", modifiers: { ctrl: true }, actionId: "zoom-100", scope: "global" },
  { key: "+", modifiers: {}, actionId: "zoom-in", scope: "global" },
  { key: "=", modifiers: {}, actionId: "zoom-in", scope: "global" },
  { key: "-", modifiers: {}, actionId: "zoom-out", scope: "global" },
  { key: "Tab", modifiers: {}, actionId: "toggle-panels", scope: "global" },

  // ── Global: Color ─────────────────────────────────────────────────────────
  { key: "x", modifiers: {}, actionId: "swap-colors", scope: "global" },
  { key: "d", modifiers: {}, actionId: "reset-colors", scope: "global" },

  // ── Global: Layers ────────────────────────────────────────────────────────
  { key: "j", modifiers: { ctrl: true }, actionId: "layer-via-copy", scope: "global" },
  { key: "j", modifiers: { ctrl: true, shift: true }, actionId: "layer-via-cut", scope: "global" },
  // Photoshop-style stack order: Ctrl+] brings the active layer forward, Ctrl+[ sends it back.
  { key: "]", modifiers: { ctrl: true }, actionId: "layer-move-up", scope: "global" },
  { key: "[", modifiers: { ctrl: true }, actionId: "layer-move-down", scope: "global" },

  // ── Global: Paint settings ────────────────────────────────────────────────
  { key: "[", modifiers: {}, actionId: "tool-size-decrease", scope: "global" },
  { key: "]", modifiers: {}, actionId: "tool-size-increase", scope: "global" },
  { key: "{", modifiers: {}, actionId: "tool-hardness-decrease", scope: "global" },
  { key: "}", modifiers: {}, actionId: "tool-hardness-increase", scope: "global" },
  // Digits 0–9 share a single action id; the handler reads e.key to get the digit.
  { key: "0", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "1", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "2", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "3", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "4", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "5", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "6", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "7", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "8", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },
  { key: "9", modifiers: {}, actionId: "tool-opacity-preset", scope: "global" },

  // ── Global: Tool switches ─────────────────────────────────────────────────
  { key: "v", modifiers: {}, actionId: "tool-move", scope: "global" },
  { key: "b", modifiers: {}, actionId: "tool-brush", scope: "global" },
  { key: "p", modifiers: {}, actionId: "tool-pencil", scope: "global" },
  { key: "e", modifiers: {}, actionId: "tool-eraser", scope: "global" },
  { key: "g", modifiers: {}, actionId: "tool-fill", scope: "global" },
  { key: "i", modifiers: {}, actionId: "tool-eyedropper", scope: "global" },
  { key: "q", modifiers: {}, actionId: "tool-blur", scope: "global" },
  { key: "s", modifiers: {}, actionId: "tool-clone-stamp", scope: "global" },
  { key: "j", modifiers: {}, actionId: "tool-adjust", scope: "global" },
  { key: "w", modifiers: {}, actionId: "tool-select-magic-wand", scope: "global" },
  { key: "m", modifiers: {}, actionId: "tool-select-rect", scope: "global" },
  { key: "c", modifiers: {}, actionId: "tool-crop", scope: "global" },
  { key: "t", modifiers: {}, actionId: "tool-gradient", scope: "global" },
  { key: "f", modifiers: {}, actionId: "tool-transform", scope: "global" },
  { key: "u", modifiers: {}, actionId: "tool-shape", scope: "global" },
  { key: "l", modifiers: {}, actionId: "tool-shape-line", scope: "global" },
  { key: "r", modifiers: {}, actionId: "tool-shape-rect", scope: "global" },
  { key: "o", modifiers: {}, actionId: "tool-shape-ellipse", scope: "global" },
  { key: "a", modifiers: {}, actionId: "tool-shape-arrow", scope: "global" },

  // ── Mode: transform ───────────────────────────────────────────────────────
  { key: "z", modifiers: { ctrl: true }, actionId: "transform-undo", scope: "mode:transform" },
  { key: "z", modifiers: { ctrl: true, shift: true }, actionId: "transform-redo", scope: "mode:transform" },
  { key: "y", modifiers: { ctrl: true }, actionId: "transform-redo", scope: "mode:transform" },
  { key: "Enter", modifiers: {}, actionId: "transform-commit", scope: "mode:transform" },
  { key: "Escape", modifiers: {}, actionId: "transform-cancel", scope: "mode:transform" },
  // Affinity-style: "." resets the transform box to identity (without committing).
  { key: ".", modifiers: {}, actionId: "transform-reset", scope: "mode:transform" },

  // ── Mode: crop ────────────────────────────────────────────────────────────
  { key: "Enter", modifiers: {}, actionId: "crop-commit", scope: "mode:crop" },
  { key: "Escape", modifiers: {}, actionId: "crop-cancel", scope: "mode:crop" },

  // ── Panel: layers (documented only — dispatched by panel component) ────────
  { key: "ArrowUp", modifiers: {}, actionId: "blend-mode-prev", scope: "panel:layers" },
  { key: "ArrowDown", modifiers: {}, actionId: "blend-mode-next", scope: "panel:layers" },
  { key: "ArrowUp", modifiers: {}, actionId: "canvas-preset-prev", scope: "panel:layers" },
  { key: "ArrowDown", modifiers: {}, actionId: "canvas-preset-next", scope: "panel:layers" },
];
