/**
 * Step undo or redo until the editor is at history entry `target`.
 *
 * Undo from an unrecorded edit first appends a snapshot of it, which can trim
 * the oldest entry and shift every index down by one; the target follows.
 */

import { useSketchStore } from "../state/useSketchStore";
import { hasUncommittedHistoryTip } from "../state/slices/historySlice";
import { MAX_HISTORY_SIZE } from "../types";

export function jumpToHistoryIndex(
  target: number,
  undo: () => void,
  redo: () => void
): void {
  let goal = target;
  for (let step = 0; step <= MAX_HISTORY_SIZE * 2 + 1; step++) {
    const before = useSketchStore.getState();
    const dirty = hasUncommittedHistoryTip(before);
    if (!dirty && before.historyIndex === goal) {
      return;
    }
    if (dirty || before.historyIndex > goal) {
      undo();
    } else {
      redo();
    }
    const after = useSketchStore.getState();
    if (after.historyIndex === before.historyIndex && after.history === before.history) {
      return;
    }
    if (dirty) {
      goal -= before.history.length + 1 - after.history.length;
      if (goal < 0) {
        return;
      }
    }
  }
}
