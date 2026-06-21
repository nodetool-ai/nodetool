/**
 * Timeline wheel-gesture routing.
 *
 * Splits a wheel event into a zoom step vs a horizontal-scroll delta so the
 * tracks surface behaves like a video editor:
 *   - Ctrl/Cmd + wheel (and the macOS trackpad pinch, which the browser reports
 *     as a synthetic ctrlKey wheel) → zoom.
 *   - Shift + wheel → horizontal scroll (for mice with a vertical-only wheel).
 *   - Trackpad two-finger horizontal swipe (deltaX dominates deltaY) →
 *     horizontal scroll. This is the native macOS gesture; the caller takes it
 *     over so it can suppress the browser's back/forward swipe at the edges.
 *   - A vertical-dominant plain wheel is left alone (scrollDelta === 0) so it
 *     bubbles to the tracks list's native vertical scroll.
 *
 * Pure and platform-agnostic — the horizontal-vs-vertical discriminator works
 * the same everywhere, so the routing is unit-testable without stubbing
 * `navigator`.
 */

export type TimelineWheelSrc = Pick<
  WheelEvent,
  "deltaX" | "deltaY" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export interface TimelineWheelMotion {
  /** Vertical delta to feed the zoom step; 0 when the gesture isn't a zoom. */
  zoomDelta: number;
  /** Raw horizontal delta to scroll by; 0 when the gesture isn't a scroll. */
  scrollDelta: number;
}

export function partitionTimelineWheel(
  event: TimelineWheelSrc
): TimelineWheelMotion {
  // Ctrl/Cmd + wheel — also the macOS pinch, reported as a synthetic ctrlKey
  // wheel — zooms. Vertical delta drives the zoom factor.
  if (event.ctrlKey || event.metaKey) {
    return { zoomDelta: event.deltaY, scrollDelta: 0 };
  }

  // Shift + wheel → horizontal scroll. Some browsers already fold Shift into
  // deltaX, so prefer it and fall back to deltaY.
  if (event.shiftKey) {
    const primary = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    return { zoomDelta: 0, scrollDelta: primary };
  }

  // Trackpad horizontal swipe → horizontal scroll. A vertical-dominant gesture
  // is left for native vertical scrolling of the tracks list.
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return { zoomDelta: 0, scrollDelta: event.deltaX };
  }

  return { zoomDelta: 0, scrollDelta: 0 };
}

/** Pixels-per-line fallback for DOM_DELTA_LINE wheel events (some mice). */
const LINE_HEIGHT_PX = 16;

/**
 * Normalize a wheel delta to pixels. Trackpads report pixel deltas, but some
 * mice report lines (DOM_DELTA_LINE) or pages (DOM_DELTA_PAGE); without this a
 * line-mode notch would scroll only a few pixels.
 */
export function normalizeWheelDeltaPx(
  delta: number,
  deltaMode: number,
  pageSizePx: number
): number {
  if (deltaMode === 1 /* DOM_DELTA_LINE */) {
    return delta * LINE_HEIGHT_PX;
  }
  if (deltaMode === 2 /* DOM_DELTA_PAGE */) {
    return delta * pageSizePx;
  }
  return delta;
}
