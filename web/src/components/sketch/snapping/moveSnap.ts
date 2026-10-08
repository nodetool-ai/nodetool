/**
 * Move snapping — pure geometry for snapping a dragged rectangle's edges and
 * center to canvas edges, the canvas center, ruler guides and the edges and
 * centers of other layers.
 *
 * All values are in document pixels. The caller converts its screen-space
 * threshold with `SNAP_THRESHOLD_SCREEN_PX / zoom` so snapping feels the same
 * at every zoom level.
 */

import type { SketchGuide } from "../types";

/** Snap distance in screen (CSS) pixels. */
export const SNAP_THRESHOLD_SCREEN_PX = 6;

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Candidate lines: `x` holds vertical lines, `y` holds horizontal lines. */
export interface SnapTargets {
  x: number[];
  y: number[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  /** The vertical line the rect snapped to, or null. */
  snappedX: number | null;
  /** The horizontal line the rect snapped to, or null. */
  snappedY: number | null;
}

export function buildSnapTargets(
  canvas: { width: number; height: number },
  guides: readonly SketchGuide[],
  otherRects: readonly SnapRect[]
): SnapTargets {
  const x = [0, canvas.width / 2, canvas.width];
  const y = [0, canvas.height / 2, canvas.height];
  for (const guide of guides) {
    if (guide.orientation === "vertical") {
      x.push(guide.position);
    } else {
      y.push(guide.position);
    }
  }
  for (const r of otherRects) {
    if (r.width <= 0 || r.height <= 0) {
      continue;
    }
    x.push(r.x, r.x + r.width / 2, r.x + r.width);
    y.push(r.y, r.y + r.height / 2, r.y + r.height);
  }
  return { x, y };
}

function snapAxis(
  start: number,
  size: number,
  delta: number,
  targets: readonly number[],
  threshold: number
): { delta: number; line: number | null } {
  const edges = [start + delta, start + delta + size / 2, start + delta + size];
  let best: { offset: number; line: number } | null = null;
  for (const target of targets) {
    for (const edge of edges) {
      const offset = target - edge;
      if (
        Math.abs(offset) <= threshold &&
        (best === null || Math.abs(offset) < Math.abs(best.offset))
      ) {
        best = { offset, line: target };
      }
    }
  }
  if (!best) {
    return { delta, line: null };
  }
  return { delta: delta + best.offset, line: best.line };
}

/**
 * Adjust a drag delta so the nearest edge or center of `rect` (at its drag
 * start position) lands on a target line within `threshold` document pixels.
 * Each axis snaps independently.
 */
export function snapMoveDelta(
  rect: SnapRect,
  dx: number,
  dy: number,
  targets: SnapTargets,
  threshold: number
): SnapResult {
  const sx = snapAxis(rect.x, rect.width, dx, targets.x, threshold);
  const sy = snapAxis(rect.y, rect.height, dy, targets.y, threshold);
  return { dx: sx.delta, dy: sy.delta, snappedX: sx.line, snappedY: sy.line };
}

/**
 * Snap a single coordinate (a guide being dragged) to the nearest target
 * within `threshold`. Returns the input unchanged when nothing is close.
 */
export function snapValue(
  value: number,
  targets: readonly number[],
  threshold: number
): number {
  let best = value;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}
