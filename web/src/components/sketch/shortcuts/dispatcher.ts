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
