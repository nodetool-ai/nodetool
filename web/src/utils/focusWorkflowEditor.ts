import { canTakeFocus } from "./browser";

const findFocusable = (
  root: ParentNode,
  selector: string
): HTMLElement | null => {
  for (const candidate of root.querySelectorAll<HTMLElement>(selector)) {
    if (canTakeFocus(candidate)) {
      return candidate;
    }
  }
  return null;
};

/** Restores keyboard focus to the selected node, or the active canvas. */
export const focusActiveWorkflowEditor = (
  root: ParentNode = document
): boolean => {
  const focusTarget =
    findFocusable(root, ".react-flow__node.selected") ??
    findFocusable(root, ".react-flow__pane");
  if (!focusTarget) {
    return false;
  }
  if (!focusTarget.hasAttribute("tabindex")) {
    focusTarget.tabIndex = -1;
  }
  focusTarget.focus();
  return document.activeElement === focusTarget;
};
