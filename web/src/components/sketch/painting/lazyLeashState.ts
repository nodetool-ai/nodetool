/**
 * lazyLeashState — module-level publisher for the active lazy-brush leash.
 *
 * When a paint stroke runs with stroke-assist `mode === "lazy"`, the brush
 * tip lags behind the raw pointer. The overlay cursor renderer reads this
 * state to draw a connecting line between the raw cursor and the lagging
 * brush tip, mirroring Krita's lazy brush UX.
 *
 * Kept as a tiny module-scope publisher rather than threaded through the
 * ToolContext / store so that PaintSession and useOverlayRenderer remain
 * decoupled. Subscribers are not needed today (the cursor canvas is
 * already redrawn on every pointer move during a stroke), but the API
 * leaves room for a non-pointer-driven repaint if needed later.
 */

import type { Point } from "../types";

export interface LazyLeash {
  /** Raw pointer position in document coordinates. */
  rawDoc: Point;
  /** Lazy brush tip in document coordinates (the actual paint anchor). */
  tipDoc: Point;
}

let current: LazyLeash | null = null;

export function setLazyLeash(next: LazyLeash | null): void {
  current = next;
}

export function getLazyLeash(): LazyLeash | null {
  return current;
}

export function clearLazyLeash(): void {
  current = null;
}
