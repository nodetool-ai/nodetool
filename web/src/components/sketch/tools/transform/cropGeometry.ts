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

/**
 * Apply a drag delta from {@link adjustStartRect} for the given handle; result is clamped to the canvas.
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
  switch (handle) {
    case "move":
      return clampCropRectToCanvas(x + dx, y + dy, w, h, cw, ch);
    case "left": {
      const right = x + w;
      const nx = x + dx;
      return clampCropRectToCanvas(nx, y, right - nx, h, cw, ch);
    }
    case "right":
      return clampCropRectToCanvas(x, y, w + dx, h, cw, ch);
    case "top": {
      const bottom = y + h;
      const ny = y + dy;
      return clampCropRectToCanvas(x, ny, w, bottom - ny, cw, ch);
    }
    case "bottom":
      return clampCropRectToCanvas(x, y, w, h + dy, cw, ch);
    case "top-left": {
      const right = x + w;
      const bottom = y + h;
      const nx = x + dx;
      const ny = y + dy;
      return clampCropRectToCanvas(nx, ny, right - nx, bottom - ny, cw, ch);
    }
    case "top-right": {
      const bottom = y + h;
      const ny = y + dy;
      return clampCropRectToCanvas(x, ny, w + dx, bottom - ny, cw, ch);
    }
    case "bottom-left": {
      const right = x + w;
      const nx = x + dx;
      return clampCropRectToCanvas(nx, y, right - nx, h + dy, cw, ch);
    }
    case "bottom-right":
      return clampCropRectToCanvas(x, y, w + dx, h + dy, cw, ch);
    default:
      return clampCropRectToCanvas(x, y, w, h, cw, ch);
  }
}
