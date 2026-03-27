/**
 * Pointer Events helpers for stylus / tablet input.
 *
 * Pen hover reports pressure 0. Patterns like `pressure || 0.5` treat 0 as
 * falsy and substitute 0.5, which paints a full-pressure stroke while hovering.
 */

/** Normalized pressure for storage and stroke logic (preserves pen hover = 0). */
export function normalizePointerPressure(
  e: Pick<PointerEvent, "pointerType" | "pressure">
): number {
  if (e.pointerType === "pen" || e.pointerType === "touch") {
    return e.pressure;
  }
  return e.pressure ?? 0.5;
}

/**
 * Pressure for a coalesced sample during an active stroke. Pen keeps real
 * values including 0; mouse falls back when the sample reports 0.
 */
export function coalescedStrokePressure(
  eventPoint: PointerEvent,
  fallBack: number
): number {
  const p = normalizePointerPressure(eventPoint);
  if (p > 0) {
    return p;
  }
  if (eventPoint.pointerType === "pen") {
    return 0;
  }
  return fallBack;
}

/**
 * Whether the pointer should start or continue a paint gesture.
 * Pen hover: buttons 0 and pressure 0 — do not paint (matches native apps).
 */
export function pointerHasPaintContact(
  e: Pick<PointerEvent, "pointerType" | "buttons" | "pressure">
): boolean {
  if (e.pointerType !== "pen") {
    return true;
  }
  return e.buttons !== 0 || e.pressure > 0;
}
