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
 * Pressure for a coalesced sample during an active stroke.
 * Pen/touch: a 0 sample often means a dropped reading mid-stroke — reuse
 * `fallBack` (last good pressure) when it is > 0. Mouse uses fallBack when
 * the sample is 0.
 */
export function coalescedStrokePressure(
  eventPoint: PointerEvent,
  fallBack: number
): number {
  const p = normalizePointerPressure(eventPoint);
  if (p > 0) {
    return p;
  }
  if (eventPoint.pointerType === "pen" || eventPoint.pointerType === "touch") {
    return fallBack > 0 ? fallBack : p;
  }
  return fallBack;
}

/**
 * Whether to **start** a left-button paint gesture on pointerdown.
 * Do not use on pointermove (drivers often clear `buttons` between samples).
 *
 * - **pen**: require primary button (tip). Proximity often sets `pressure > 0`
 *   without the primary bit — that was causing ink before touch.
 * - **mouse**: same; some tablets report the stylus as `pointerType: "mouse"`.
 * - **touch** / unknown: no hover equivalent; allow (first contact is the down).
 */
export function pointerHasPaintContact(
  e: Pick<PointerEvent, "pointerType" | "buttons" | "pressure">
): boolean {
  const primaryDown = (e.buttons & 1) !== 0;
  if (e.pointerType === "pen" || e.pointerType === "mouse") {
    return primaryDown;
  }
  return true;
}
