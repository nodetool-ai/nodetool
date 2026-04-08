/**
 * handleGeometry – Shared handle positions, hit testing, and doc-to-screen
 * conversion for transform gizmos.
 *
 * This module consumes `resolvedLayerGeometry` so gizmo handles, hit targets,
 * and selection overlays all agree on the same resolved document-space extents.
 *
 * Tools should not recompute transformed layer bounds locally — they should
 * call these helpers instead.
 *
 * @module tools/transform/handleGeometry
 */

import type { Point, LayerTransform, LayerContentBounds } from "../../types";
import {
  getTransformedExtents,
  getTransformedCorners,
  getTransformedCenter,
  type DocumentExtents
} from "../../painting/resolvedLayerGeometry";

// ─── Handle types ─────────────────────────────────────────────────────────────

export type TransformHandle =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "rotate"
  | "move";

// Import sizing constants from the shared gizmo module (single source of truth).
import {
  HANDLE_HIT_RADIUS,
  ROTATION_HANDLE_OFFSET as _ROTATION_HANDLE_OFFSET,
  HANDLE_SIZE as _HANDLE_SIZE
} from "../gizmo/gizmoConstants";

// Re-export with the names that existing consumers expect.
export const HANDLE_RADIUS = HANDLE_HIT_RADIUS;
export const ROTATION_HANDLE_OFFSET = _ROTATION_HANDLE_OFFSET;
export const HANDLE_SIZE = _HANDLE_SIZE;

// ─── Geometry primitives ──────────────────────────────────────────────────────

/** Rotate a point around a center by `angle` radians. */
export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  angle: number
): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Snap angle to nearest 15° increment. */
export function snapAngle(angle: number): number {
  const step = Math.PI / 12; // 15°
  return Math.round(angle / step) * step;
}

/** Euclidean distance between two points. */
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ─── Resolved handle positions ───────────────────────────────────────────────

/**
 * Compute the center of a transformed layer in document space using the
 * shared geometry seam.
 */
export function computeLayerCenter(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Point {
  return getTransformedCenter(transform, rasterBounds);
}

/**
 * Scaled half-widths for a layer's raster bounds (used for handle placement).
 */
export function scaledHalfExtents(
  rasterBounds: LayerContentBounds,
  transform: LayerTransform
): { hw: number; hh: number } {
  const sx = transform.scaleX ?? 1;
  const sy = transform.scaleY ?? 1;
  return {
    hw: (rasterBounds.width * sx) / 2,
    hh: (rasterBounds.height * sy) / 2
  };
}

/**
 * Build all handle positions in document space for a given layer transform
 * and raster bounds, using the shared resolved-geometry seam.
 *
 * The rotation handle is placed `ROTATION_HANDLE_OFFSET / zoom` document
 * units above the top-center.
 */
export function buildHandlePositions(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  zoom: number
): Array<{ pos: Point; handle: TransformHandle }> {
  const center = getTransformedCenter(transform, rasterBounds);
  const { hw, hh } = scaledHalfExtents(rasterBounds, transform);
  const rot = transform.rotation ?? 0;

  const cx = center.x;
  const cy = center.y;

  // Pre-rotation corner / edge positions (centered at origin)
  const left = cx - hw;
  const right = cx + hw;
  const top = cy - hh;
  const bottom = cy + hh;

  return [
    // Rotation handle above top-center
    {
      pos: rotatePoint(cx, top - ROTATION_HANDLE_OFFSET / zoom, cx, cy, rot),
      handle: "rotate" as const
    },
    // Corners
    { pos: rotatePoint(left, top, cx, cy, rot), handle: "top-left" as const },
    { pos: rotatePoint(right, top, cx, cy, rot), handle: "top-right" as const },
    {
      pos: rotatePoint(left, bottom, cx, cy, rot),
      handle: "bottom-left" as const
    },
    {
      pos: rotatePoint(right, bottom, cx, cy, rot),
      handle: "bottom-right" as const
    },
    // Edge midpoints
    { pos: rotatePoint(cx, top, cx, cy, rot), handle: "top" as const },
    { pos: rotatePoint(cx, bottom, cx, cy, rot), handle: "bottom" as const },
    { pos: rotatePoint(left, cy, cx, cy, rot), handle: "left" as const },
    { pos: rotatePoint(right, cy, cx, cy, rot), handle: "right" as const }
  ];
}

// ─── Hit testing ─────────────────────────────────────────────────────────────

/**
 * Hit-test all transform handles against a document-space point.
 *
 * Returns the handle under the pointer, or null. The "move" handle is
 * returned when the point falls inside the (rotated) bounding box but
 * doesn't hit any specific handle.
 */
export function hitTestHandles(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  canvasPt: Point,
  zoom: number
): TransformHandle | null {
  const threshold = HANDLE_RADIUS / zoom;
  const handles = buildHandlePositions(transform, rasterBounds, zoom);

  for (const { pos, handle } of handles) {
    if (dist(canvasPt, pos) <= threshold) {
      return handle;
    }
  }

  // Check if inside the bounding box (for "move")
  const center = getTransformedCenter(transform, rasterBounds);
  const { hw, hh } = scaledHalfExtents(rasterBounds, transform);
  const rot = transform.rotation ?? 0;

  const left = center.x - hw;
  const right = center.x + hw;
  const top = center.y - hh;
  const bottom = center.y + hh;

  // Un-rotate the click point into axis-aligned space
  const unrotated = rotatePoint(
    canvasPt.x,
    canvasPt.y,
    center.x,
    center.y,
    -rot
  );
  if (
    unrotated.x >= left &&
    unrotated.x <= right &&
    unrotated.y >= top &&
    unrotated.y <= bottom
  ) {
    return "move";
  }

  return null;
}

// ─── Doc-to-screen conversion ────────────────────────────────────────────────

/**
 * Convert a document-space point to screen-space pixel coordinates on the
 * gizmo canvas. The gizmo canvas is backed at `dpr × CSS-size` to stay crisp.
 */
export function docToScreen(
  docX: number,
  docY: number,
  docCanvasWidth: number,
  docCanvasHeight: number,
  zoom: number,
  pan: Point,
  containerW: number,
  containerH: number,
  dpr: number
): Point {
  return {
    x: ((docX - docCanvasWidth / 2) * zoom + containerW / 2 + pan.x) * dpr,
    y: ((docY - docCanvasHeight / 2) * zoom + containerH / 2 + pan.y) * dpr
  };
}

type ContainerRect = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

/**
 * Viewport client position → document canvas coordinates. Matches the pan/zoom
 * model in {@link docToScreen} (CSS space, `dpr = 1`) and wheel-zoom anchoring
 * in `usePointerHandlers`.
 */
export function clientToDocumentCanvas(
  clientX: number,
  clientY: number,
  containerRect: ContainerRect,
  zoom: number,
  pan: Point,
  docCanvasWidth: number,
  docCanvasHeight: number
): Point {
  const mx = clientX - containerRect.left;
  const my = clientY - containerRect.top;
  const cw = containerRect.width;
  const ch = containerRect.height;
  return {
    x: (mx - cw / 2 - pan.x) / zoom + docCanvasWidth / 2,
    y: (my - ch / 2 - pan.y) / zoom + docCanvasHeight / 2
  };
}

/** Document canvas coordinates → viewport client (inverse of {@link clientToDocumentCanvas}). */
export function documentCanvasToClient(
  docX: number,
  docY: number,
  containerRect: ContainerRect,
  zoom: number,
  pan: Point,
  docCanvasWidth: number,
  docCanvasHeight: number
): Point {
  const mx =
    (docX - docCanvasWidth / 2) * zoom + containerRect.width / 2 + pan.x;
  const my =
    (docY - docCanvasHeight / 2) * zoom + containerRect.height / 2 + pan.y;
  return {
    x: containerRect.left + mx,
    y: containerRect.top + my
  };
}

/**
 * Convert a document-space rect (AABB) to gizmo canvas pixel coordinates.
 */
export function docRectToScreen(
  docX: number,
  docY: number,
  docW: number,
  docH: number,
  docCanvasWidth: number,
  docCanvasHeight: number,
  zoom: number,
  pan: Point,
  containerW: number,
  containerH: number,
  dpr: number
): { x: number; y: number; w: number; h: number } {
  const topLeft = docToScreen(
    docX,
    docY,
    docCanvasWidth,
    docCanvasHeight,
    zoom,
    pan,
    containerW,
    containerH,
    dpr
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: docW * zoom * dpr,
    h: docH * zoom * dpr
  };
}

/**
 * Return the resolved axis-aligned bounding box (AABB) and transformed
 * corners for a layer, consuming the shared geometry seam.
 *
 * This is the single source for gizmo outline bounds and selection overlay
 * alignment.
 */
export function getLayerGizmoBounds(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): {
  extents: DocumentExtents;
  corners: [Point, Point, Point, Point];
  center: Point;
} {
  return {
    extents: getTransformedExtents(transform, rasterBounds),
    corners: getTransformedCorners(transform, rasterBounds),
    center: getTransformedCenter(transform, rasterBounds)
  };
}

/**
 * Anchor direction table for scale handles: the opposite edge stays fixed
 * while the dragged edge moves. { dx, dy } point from center toward the anchor.
 */
export const HANDLE_ANCHOR: Partial<
  Record<TransformHandle, { dx: number; dy: number }>
> = {
  "top-left": { dx: 1, dy: 1 },
  "top-right": { dx: -1, dy: 1 },
  "bottom-left": { dx: 1, dy: -1 },
  "bottom-right": { dx: -1, dy: -1 },
  left: { dx: 1, dy: 0 },
  right: { dx: -1, dy: 0 },
  top: { dx: 0, dy: 1 },
  bottom: { dx: 0, dy: -1 }
};
