/**
 * modifierIntent — shared modifier-key interpretation layer.
 *
 * Tools consume semantic flags (`combineMode`, `fromCenter`, `constrain`)
 * instead of interpreting raw `shiftHeldRef` / `altHeldRef` booleans ad hoc.
 *
 * This centralizes the modifier-to-intent mapping so:
 *   - Selection tools, transform tools, and shape tools share one truth
 *   - Adding a new modifier behaviour is a single-point change
 *   - Tests can verify intent derivation without instantiating tool handlers
 */

import type { SelectionCombineOp } from "../selection";

// ── Modifier snapshot ──────────────────────────────────────────────────────

/** Raw modifier key state captured at a point in time. */
export interface ModifierSnapshot {
  shift: boolean;
  alt: boolean;
}

/** Capture a snapshot from mutable refs. */
export function captureModifiers(
  shiftRef: React.MutableRefObject<boolean>,
  altRef: React.MutableRefObject<boolean>
): ModifierSnapshot {
  return { shift: shiftRef.current, alt: altRef.current };
}

// ── Selection combine intent ───────────────────────────────────────────────

/**
 * Derive the selection combine operation from modifier keys.
 *
 *   Shift + Alt → intersect
 *   Shift       → add
 *   Alt         → subtract
 *   (none)      → replace
 */
export function selectionCombineMode(
  shift: boolean,
  alt: boolean
): SelectionCombineOp {
  if (shift && alt) {
    return "intersect";
  }
  if (shift) {
    return "add";
  }
  if (alt) {
    return "subtract";
  }
  return "replace";
}

/**
 * Derive the selection combine operation from a modifier snapshot.
 * Convenience wrapper around `selectionCombineMode`.
 */
export function selectionCombineModeFromSnapshot(
  mods: ModifierSnapshot | null
): SelectionCombineOp {
  return selectionCombineMode(mods?.shift ?? false, mods?.alt ?? false);
}

// ── Marquee / shape constraint intent ──────────────────────────────────────

/** Semantic flags for marquee and shape constraint during drag. */
export interface ShapeConstraintIntent {
  /** Draw from center (Alt held). */
  fromCenter: boolean;
  /** Constrain to square/circle or lock aspect ratio (Shift held). */
  constrain: boolean;
}

/**
 * Derive shape constraint intent from live modifier refs.
 * Used during drag to apply real-time constraint feedback.
 */
export function shapeConstraintFromRefs(
  shiftRef: React.MutableRefObject<boolean>,
  altRef: React.MutableRefObject<boolean>
): ShapeConstraintIntent {
  return {
    fromCenter: altRef.current,
    constrain: shiftRef.current
  };
}
