import type { KeyboardEvent } from "react";
import { isEditableElement } from "../../utils/browser";

export function handleGameUndo(event: KeyboardEvent, playing: boolean, undo: () => void, redo: () => void): void {
  const target = event.target;
  if (playing || !(target instanceof HTMLElement) || Boolean(isEditableElement(target)) || !target.closest("[data-game-undo-scope]")) { return; }
  if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
    event.preventDefault();
    if (event.shiftKey) { redo(); } else { undo(); }
  }
}
