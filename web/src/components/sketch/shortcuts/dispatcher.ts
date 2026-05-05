import type { SketchActionId } from "./actionRegistry";
import type { SketchTool } from "../types";
import { buildComboString, GLOBAL_MAP, TRANSFORM_MAP, CROP_MAP } from "./normalize";

const TYPING_ROLES = new Set(["textbox", "searchbox", "spinbutton"]);
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute("role");
  if (role && TYPING_ROLES.has(role)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
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
  if (isTypingTarget(document.activeElement)) return null;

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
