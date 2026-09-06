/**
 * macOS trackpad pinch, WebKit route.
 *
 * Chromium reports a trackpad pinch as a synthetic ctrlKey wheel, which
 * `partitionTimelineWheel` already routes to zoom. WebKit does not: Safari
 * fires `gesturestart` / `gesturechange` / `gestureend` carrying a cumulative
 * `scale` and emits no wheel event at all, so without this route a pinch over
 * the timeline zooms the page instead of the lanes.
 *
 * The math is pure so it can be tested without a WebKit-only event.
 */

/**
 * WebKit's non-standard GestureEvent. Not in lib.dom, so it is declared here.
 * `scale` is cumulative since `gesturestart` (1 = unchanged, >1 = fingers
 * apart).
 */
export interface WebKitGestureEvent extends UIEvent {
  readonly scale: number;
  readonly rotation: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** True when the browser dispatches WebKit gesture events (Safari). */
export function supportsWebKitGestures(win: Window): boolean {
  return "ongesturechange" in win;
}

/**
 * Scale (ms per pixel) for a cumulative pinch scale, clamped to the zoom
 * bounds. Fingers apart (scale > 1) zooms in, so msPerPx shrinks.
 */
export function pinchMsPerPx(
  startMsPerPx: number,
  scale: number,
  minMsPerPx: number,
  maxMsPerPx: number
): number {
  const clamp = (value: number) =>
    Math.min(maxMsPerPx, Math.max(minMsPerPx, value));
  // A zero or non-finite scale would blow up the division; Safari sends 0 for
  // a gesture that ends the instant it starts.
  if (!Number.isFinite(scale) || scale <= 0) {
    return clamp(startMsPerPx);
  }
  return clamp(startMsPerPx / scale);
}
