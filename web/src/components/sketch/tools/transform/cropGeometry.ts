/**
 * Axis-aligned crop rectangle hit-testing and resize math (document space).
 * Reuses {@link TransformHandle} naming from the transform gizmo.
 */

import type { Point } from "../../types";
import type { TransformHandle } from "./handleGeometry";
import { dist } from "./handleGeometry";
import { HANDLE_HIT_RADIUS } from "../gizmo/gizmoConstants";

export interface CropRectDoc {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_CROP_SIZE = 2;

/**
 * Clamp top-left size so the rect stays inside the canvas with a minimum size.
 */
export function clampCropRectToCanvas(
  x: number,
  y: number,
  w: number,
  h: number,
  cw: number,
  ch: number
): CropRectDoc {
  let nx = Math.round(x);
  let ny = Math.round(y);
  let nw = Math.round(w);
  let nh = Math.round(h);
  nx = Math.max(0, Math.min(nx, cw - MIN_CROP_SIZE));
  ny = Math.max(0, Math.min(ny, ch - MIN_CROP_SIZE));
  nw = Math.max(MIN_CROP_SIZE, Math.min(nw, cw - nx));
  nh = Math.max(MIN_CROP_SIZE, Math.min(nh, ch - ny));
  return { x: nx, y: ny, width: nw, height: nh };
}

/**
 * Hit-test crop handles (corners + edges + interior move) in document space.
 */
export function hitTestCropHandles(
  rect: CropRectDoc,
  pt: Point,
  zoom: number
): TransformHandle | null {
  const threshold = HANDLE_HIT_RADIUS / zoom;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  const handles: Array<{ pos: Point; handle: TransformHandle }> = [
    { pos: { x: left, y: top }, handle: "top-left" },
    { pos: { x: right, y: top }, handle: "top-right" },
    { pos: { x: left, y: bottom }, handle: "bottom-left" },
    { pos: { x: right, y: bottom }, handle: "bottom-right" },
    { pos: { x: cx, y: top }, handle: "top" },
    { pos: { x: cx, y: bottom }, handle: "bottom" },
    { pos: { x: left, y: cy }, handle: "left" },
    { pos: { x: right, y: cy }, handle: "right" }
  ];

  for (const { pos, handle } of handles) {
    if (dist(pt, pos) <= threshold) {
      return handle;
    }
  }

  if (
    pt.x >= left &&
    pt.x <= right &&
    pt.y >= top &&
    pt.y <= bottom
  ) {
    return "move";
  }
  return null;
}

/** Clamp a moved edge into [lo, hi] after rounding. */
function clampEdge(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(Math.round(value), hi));
}

/**
 * Apply a drag delta from {@link adjustStartRect} for the given handle; result is clamped to the canvas.
 * Only the edges the handle moves are clamped, so dragging past the canvas
 * edge stops that edge and leaves the opposite one where it was. A move keeps
 * the rect's size and stops at the canvas edge.
 */
export function resizeCropRectFromDrag(
  start: CropRectDoc,
  handle: TransformHandle,
  dx: number,
  dy: number,
  cw: number,
  ch: number
): CropRectDoc {
  const { x, y, width: w, height: h } = start;
  if (handle === "move") {
    const width = Math.min(Math.round(w), cw);
    const height = Math.min(Math.round(h), ch);
    return {
      x: clampEdge(x + dx, 0, cw - width),
      y: clampEdge(y + dy, 0, ch - height),
      width,
      height
    };
  }
  const movesLeft = handle === "left" || handle === "top-left" || handle === "bottom-left";
  const movesRight = handle === "right" || handle === "top-right" || handle === "bottom-right";
  const movesTop = handle === "top" || handle === "top-left" || handle === "top-right";
  const movesBottom = handle === "bottom" || handle === "bottom-left" || handle === "bottom-right";
  let left = x;
  let top = y;
  let right = x + w;
  let bottom = y + h;
  if (movesLeft) {
    left = clampEdge(x + dx, 0, right - MIN_CROP_SIZE);
  }
  if (movesRight) {
    right = clampEdge(right + dx, left + MIN_CROP_SIZE, cw);
  }
  if (movesTop) {
    top = clampEdge(y + dy, 0, bottom - MIN_CROP_SIZE);
  }
  if (movesBottom) {
    bottom = clampEdge(bottom + dy, top + MIN_CROP_SIZE, ch);
  }
  return clampCropRectToCanvas(left, top, right - left, bottom - top, cw, ch);
}
