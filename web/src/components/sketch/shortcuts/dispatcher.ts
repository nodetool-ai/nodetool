import type { SketchActionId } from "./actionRegistry";
import type { SketchTool } from "../types";
import { buildComboString, GLOBAL_MAP, TRANSFORM_MAP, CROP_MAP } from "./normalize";

const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='option']",
  "[role='menuitem']",
  "[role='slider']",
  "[role='spinbutton']",
].join(",");

export function isInteractiveTarget(el: Element | null): boolean {
  if (!el) return false;
  return el.closest(INTERACTIVE_SELECTOR) !== null;
}

// Controls whose Enter and Space activate them.
const ACTIVATABLE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='radio']",
  "[role='tab']",
  "[role='treeitem']",
].join(",");

// Composite widgets that move focus or selection with the arrow keys.
const ARROW_NAVIGABLE_SELECTOR = [
  "[role='radio']",
  "[role='tab']",
  "[role='treeitem']",
  "[role='row']",
  "[role='gridcell']",
].join(",");

const ACTIVATION_KEYS = new Set(["Enter", " ", "Escape"]);
const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isKeyboardFocused(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    // Environments without `:focus-visible` support treat focus as keyboard focus.
    return true;
  }
}

/**
 * Whether a key belongs to the focused element rather than to the editor's
 * shortcuts, so the editor must neither handle it nor stop its propagation.
 *
 * - Focus inside a dialog that does not host the editor owns every key.
 * - A control focused from the keyboard owns Enter, Space and Escape, and a
 *   composite widget (tabs, radios, tree, grid) also owns the arrows.
 *
 * A control focused by a mouse click keeps the editor's shortcuts, so Space
 * still pans and the arrows still nudge after clicking a toolbar button.
 */
export function focusOwnsKey(el: Element | null, e: KeyboardEvent): boolean {
  if (!el || el === document.body) return false;
  const dialog = el.closest("[role='dialog'], [role='alertdialog']");
  if (dialog && dialog.querySelector(".sketch-editor") === null) return true;
  if (!isKeyboardFocused(el)) return false;
  if (ACTIVATION_KEYS.has(e.key)) return el.closest(ACTIVATABLE_SELECTOR) !== null;
  if (ARROW_KEYS.has(e.key)) return el.closest(ARROW_NAVIGABLE_SELECTOR) !== null;
  return false;
}

export interface DispatcherState {
  activeTool: SketchTool;
}

/**
 * Pure dispatcher — resolves which action id to fire for a given keydown event.
 * Returns null if the event should be ignored (typing target, no matching binding).
 *
 * Scope precedence: blocked → mode:transform → mode:crop → global
 * Panel:layers bindings are dispatched by panel components, not here.
 */
export function resolveAction(
  e: KeyboardEvent,
  state: DispatcherState
): SketchActionId | null {
  if (isInteractiveTarget(document.activeElement)) return null;

  const combo = buildComboString(e);

  if (state.activeTool === "transform") {
    const action = TRANSFORM_MAP.get(combo);
    if (action) return action;
  }

  if (state.activeTool === "crop") {
    const action = CROP_MAP.get(combo);
    if (action) return action;
  }

  return GLOBAL_MAP.get(combo) ?? null;
}
