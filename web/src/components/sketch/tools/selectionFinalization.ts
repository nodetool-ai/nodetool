/**
 * selectionFinalization — shared selection finalization flow.
 *
 * Centralizes the selection overlay → mask → combine → apply pipeline
 * so SelectTool does not repeat the same rAF + selectionHasAnyPixels +
 * combineMasks pattern for every selection mode (marquee, lasso, polygon,
 * magic wand).
 *
 * The flow:
 *   1. Generate a binary mask from the selection shape
 *   2. Check if the mask has any active pixels
 *   3. Derive the combine operation from captured modifiers
 *   4. Combine with the existing selection (if any)
 *   5. Commit via onSelectionChange
 *   6. Redraw the selection overlay
 */

import type { Selection } from "../types";
import type { SelectionCombineOp } from "../selection";
import {
  selectionHasAnyPixels,
  combineMasks
} from "../selection";
import { selectionCombineModeFromSnapshot, type ModifierSnapshot } from "./modifierIntent";

/** Parameters for the shared finalization flow. */
export interface SelectionFinalizationParams {
  /** The newly generated selection mask overlay. */
  overlay: Selection;
  /** Modifier snapshot captured at pointer-down. */
  modifiers: ModifierSnapshot | null;
  /** Current selection at the time the gesture started (captured at down). */
  currentSelection: Selection | null | undefined;
  /** Store callback to commit the new selection. */
  onSelectionChange: (sel: Selection | null) => void;
  /** Redraw the marching-ants overlay after committing. */
  drawSelectionOverlay: () => void;
}

/**
 * Apply the standard selection finalization flow synchronously.
 *
 * This is the "inner" logic that runs inside a rAF callback (or immediately
 * for magic wand). Callers decide whether to wrap it in rAF or not.
 *
 * Returns true if a selection was committed, false if the mask was empty.
 */
export function applySelectionFinalization(
  params: SelectionFinalizationParams
): boolean {
  const {
    overlay,
    modifiers,
    currentSelection,
    onSelectionChange,
    drawSelectionOverlay
  } = params;

  if (!selectionHasAnyPixels(overlay)) {
    drawSelectionOverlay();
    return false;
  }

  const op: SelectionCombineOp = selectionCombineModeFromSnapshot(modifiers);
  const base = op === "replace" ? null : currentSelection ?? null;

  const _t0 = performance.now();
  const combined = combineMasks(base, overlay, op);
  const _t1 = performance.now();
  onSelectionChange(combined);
  const _t2 = performance.now();
  drawSelectionOverlay();
  const _t3 = performance.now();
  console.log(`[sel] combine:${(_t1-_t0).toFixed(0)}ms onSelChange:${(_t2-_t1).toFixed(0)}ms drawOverlay:${(_t3-_t2).toFixed(0)}ms mask:${overlay.width}x${overlay.height}`);

  return true;
}

/**
 * Schedule selection finalization on the next animation frame.
 *
 * Clears the overlay canvas immediately (so the UI feels responsive),
 * then defers the heavy mask generation and combine to the next frame.
 *
 * @param generateMask - Function that produces the selection mask.
 *   Called inside the rAF callback to defer heavy computation.
 * @param params - Finalization parameters (minus the overlay, which is
 *   generated lazily by `generateMask`).
 * @param clearOverlay - Called immediately before scheduling rAF to clear
 *   the visual overlay.
 */
export function scheduleSelectionFinalization(
  generateMask: () => Selection,
  params: Omit<SelectionFinalizationParams, "overlay">,
  clearOverlay: () => void
): void {
  clearOverlay();
  requestAnimationFrame(() => {
    const _rafStart = performance.now();
    const overlay = generateMask();
    const _afterMask = performance.now();
    console.log(`[sel] rAF start, maskGen:${(_afterMask-_rafStart).toFixed(0)}ms`);
    applySelectionFinalization({ ...params, overlay });
    console.log(`[sel] rAF done, total:${(performance.now()-_rafStart).toFixed(0)}ms`);
  });
}
