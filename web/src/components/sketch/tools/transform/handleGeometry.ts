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
import { isQuadTransformMode } from "../../types";
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
  | "move"
  | "pivot";

export type CornerHandle = Extract<
  TransformHandle,
  "top-left" | "top-right" | "bottom-right" | "bottom-left"
>;

export type EdgeHandle = Extract<
  TransformHandle,
  "top" | "bottom" | "left" | "right"
>;

export function isCornerHandle(handle: TransformHandle): handle is CornerHandle {
  return (
    handle === "top-left" ||
    handle === "top-right" ||
    handle === "bottom-left" ||
    handle === "bottom-right"
  );
}

export function isEdgeHandle(handle: TransformHandle): handle is EdgeHandle {
  return (
    handle === "top" ||
    handle === "bottom" ||
    handle === "left" ||
    handle === "right"
  );
}

// Import sizing constants from the shared gizmo module (single source of truth).
import {
  HANDLE_HIT_RADIUS,
  ROTATION_HANDLE_OFFSET as GIZMO_ROTATION_OFFSET,
  HANDLE_SIZE as GIZMO_HANDLE_SIZE,
  OUTSIDE_ROTATE_MARGIN as GIZMO_OUTSIDE_ROTATE_MARGIN,
  PIVOT_HIT_RADIUS as GIZMO_PIVOT_HIT_RADIUS,
  PIVOT_SNAP_DISTANCE as GIZMO_PIVOT_SNAP_DISTANCE
} from "../gizmo/gizmoConstants";

// Re-export with the names that existing consumers expect.
export const HANDLE_RADIUS = HANDLE_HIT_RADIUS;
export const ROTATION_HANDLE_OFFSET = GIZMO_ROTATION_OFFSET;
export const HANDLE_SIZE = GIZMO_HANDLE_SIZE;
export const OUTSIDE_ROTATE_MARGIN = GIZMO_OUTSIDE_ROTATE_MARGIN;
export const PIVOT_HIT_RADIUS = GIZMO_PIVOT_HIT_RADIUS;
export const PIVOT_SNAP_DISTANCE = GIZMO_PIVOT_SNAP_DISTANCE;

function usesAdvancedAffineTransform(transform: LayerTransform): boolean {
  return Boolean(
    (transform.matrix && transform.mode && !isQuadTransformMode(transform.mode)) ||
      (isQuadTransformMode(transform.mode) && transform.quad)
  );
}

/**
 * True when the transform is a free-form quad (warp / perspective / distort /
 * mesh-warp). For these modes, rotation/pivot are meaningless — callers
 * should disable the rotate handle, the outside-box rotate band, and the
 * custom pivot.
 */
export function isQuadOnlyTransform(transform: LayerTransform): boolean {
  return Boolean(isQuadTransformMode(transform.mode) && transform.quad);
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function normalizeVector(dx: number, dy: number): Point {
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) {
    return { x: 0, y: 0 };
  }
  return { x: dx / length, y: dy / length };
}

function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const edgeY = yj - yi;
    if (Math.abs(edgeY) <= 1e-9) {
      continue;
    }
    const intersects =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / edgeY + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(pt: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-9) {
    return dist(pt, start);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((pt.x - start.x) * dx + (pt.y - start.y) * dy) / lengthSq
    )
  );
  return Math.hypot(
    pt.x - (start.x + t * dx),
    pt.y - (start.y + t * dy)
  );
}

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
  if (usesAdvancedAffineTransform(transform)) {
    const corners = getTransformedCorners(transform, rasterBounds);
    const center = getTransformedCenter(transform, rasterBounds);
    const topMid = midpoint(corners[0], corners[1]);
    const bottomMid = midpoint(corners[2], corners[3]);
    const leftMid = midpoint(corners[0], corners[3]);
    const rightMid = midpoint(corners[1], corners[2]);
    const handles: Array<{ pos: Point; handle: TransformHandle }> = [
      { pos: corners[0], handle: "top-left" },
      { pos: corners[1], handle: "top-right" },
      { pos: corners[3], handle: "bottom-left" },
      { pos: corners[2], handle: "bottom-right" },
      { pos: topMid, handle: "top" },
      { pos: bottomMid, handle: "bottom" },
      { pos: leftMid, handle: "left" },
      { pos: rightMid, handle: "right" }
    ];
    // Rotate handle is meaningless on a free-form quad — see isQuadOnlyTransform.
    if (!isQuadOnlyTransform(transform)) {
      const rotateNormal = normalizeVector(
        topMid.x - center.x,
        topMid.y - center.y
      );
      handles.unshift({
        pos: {
          x: topMid.x + rotateNormal.x * (ROTATION_HANDLE_OFFSET / zoom),
          y: topMid.y + rotateNormal.y * (ROTATION_HANDLE_OFFSET / zoom)
        },
        handle: "rotate"
      });
    }
    return handles;
  }
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

  if (usesAdvancedAffineTransform(transform)) {
    const corners = getTransformedCorners(transform, rasterBounds);
    return pointInPolygon(canvasPt, corners) ? "move" : null;
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

// ─── Outside-box rotate zone ─────────────────────────────────────────────────

/**
 * Test whether a point falls in the "rotate zone": outside the bounding box
 * but within `OUTSIDE_ROTATE_MARGIN / zoom` document units of the box edge.
 *
 * This enables dragging outside the box to rotate.
 * Should only be called after `hitTestHandles` returns `null` — it does NOT
 * check handles or the box interior.
 */
export function isInRotateZone(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  canvasPt: Point,
  zoom: number
): boolean {
  // Free-form quads have no rotation, so the outside-box rotate band is
  // disabled — clicks there fall through to auto-select / deselect.
  if (isQuadOnlyTransform(transform)) {
    return false;
  }
  if (usesAdvancedAffineTransform(transform)) {
    const margin = OUTSIDE_ROTATE_MARGIN / zoom;
    const corners = getTransformedCorners(transform, rasterBounds);
    if (pointInPolygon(canvasPt, corners)) {
      return false;
    }
    for (let index = 0; index < corners.length; index += 1) {
      const start = corners[index];
      const end = corners[(index + 1) % corners.length];
      if (distanceToSegment(canvasPt, start, end) <= margin) {
        return true;
      }
    }
    return false;
  }
  const margin = OUTSIDE_ROTATE_MARGIN / zoom;
  const center = getTransformedCenter(transform, rasterBounds);
  const { hw, hh } = scaledHalfExtents(rasterBounds, transform);
  const rot = transform.rotation ?? 0;

  const left = center.x - hw;
  const right = center.x + hw;
  const top = center.y - hh;
  const bottom = center.y + hh;

  // Un-rotate the point into axis-aligned space
  const unrotated = rotatePoint(
    canvasPt.x,
    canvasPt.y,
    center.x,
    center.y,
    -rot
  );

  // Check if inside the expanded box (box + margin) but outside the inner box
  const inExpandedBox =
    unrotated.x >= left - margin &&
    unrotated.x <= right + margin &&
    unrotated.y >= top - margin &&
    unrotated.y <= bottom + margin;

  const inInnerBox =
    unrotated.x >= left &&
    unrotated.x <= right &&
    unrotated.y >= top &&
    unrotated.y <= bottom;

  return inExpandedBox && !inInnerBox;
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
 * Pointer client → document canvas. Matches compositing / pointer painting
 * ({@link usePointerHandlerUtils} `screenToCanvas`): when the composited
 * display canvas is available, map through its transformed layout rect; otherwise
 * fall back to pan/zoom math in {@link clientToDocumentCanvas}.
 */
export function sketchClientToDocCanvas(
  clientX: number,
  clientY: number,
  displayCanvas: HTMLCanvasElement | null,
  containerRect: ContainerRect,
  zoom: number,
  pan: Point,
  docCanvasWidth: number,
  docCanvasHeight: number
): Point {
  if (displayCanvas) {
    const rect = displayCanvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: ((clientX - rect.left) / rect.width) * docCanvasWidth,
        y: ((clientY - rect.top) / rect.height) * docCanvasHeight
      };
    }
  }
  return clientToDocumentCanvas(
    clientX,
    clientY,
    containerRect,
    zoom,
    pan,
    docCanvasWidth,
    docCanvasHeight
  );
}

/**
 * Document canvas → pointer client (inverse of {@link sketchClientToDocCanvas}
 * for coordinates inside the viewport). Use for brush/cursor overlay alignment.
 */
export function sketchDocCanvasToClient(
  docX: number,
  docY: number,
  displayCanvas: HTMLCanvasElement | null,
  containerRect: ContainerRect,
  zoom: number,
  pan: Point,
  docCanvasWidth: number,
  docCanvasHeight: number
): Point {
  if (displayCanvas) {
    const rect = displayCanvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + (docX / docCanvasWidth) * rect.width,
        y: rect.top + (docY / docCanvasHeight) * rect.height
      };
    }
  }
  return documentCanvasToClient(
    docX,
    docY,
    containerRect,
    zoom,
    pan,
    docCanvasWidth,
    docCanvasHeight
  );
}

/**
 * Map a document canvas point (bitmap space 0…canvas dimensions) to gizmo–canvas
 * device pixels. Mirrors {@link usePointerHandlerUtils}' `screenToCanvas`: uses the
 * display canvas UV mapping when available, otherwise {@link documentCanvasToClient}.
 *
 * Use this when painting crop overlays on the gizmo layer so they align with
 * pointer-derived document coordinates (see `screenToCanvas` in
 * `usePointerHandlerUtils.ts`).
 */
export function canvasDocPointToGizmoDevicePixels(
  docX: number,
  docY: number,
  docCanvasWidth: number,
  docCanvasHeight: number,
  zoom: number,
  pan: Point,
  displayCanvas: HTMLCanvasElement | null,
  containerRect: ContainerRect,
  dpr: number
): Point {
  let clientX: number;
  let clientY: number;

  if (displayCanvas) {
    const rect = displayCanvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      clientX = rect.left + (docX / docCanvasWidth) * rect.width;
      clientY = rect.top + (docY / docCanvasHeight) * rect.height;
    } else {
      const c = documentCanvasToClient(
        docX,
        docY,
        containerRect,
        zoom,
        pan,
        docCanvasWidth,
        docCanvasHeight
      );
      clientX = c.x;
      clientY = c.y;
    }
  } else {
    const c = documentCanvasToClient(
      docX,
      docY,
      containerRect,
      zoom,
      pan,
      docCanvasWidth,
      docCanvasHeight
    );
    clientX = c.x;
    clientY = c.y;
  }

  const mx = clientX - containerRect.left;
  const my = clientY - containerRect.top;
  return { x: mx * dpr, y: my * dpr };
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

// ─── Pivot handle ────────────────────────────────────────────────────────────

/**
 * Hit-test the pivot handle at a document-space position.
 *
 * @param pivotDoc - Current pivot position in document space.
 * @param canvasPt - Point to test (document space).
 * @param zoom     - Current zoom level (scales hit radius).
 * @returns `true` if the point is within the pivot hit radius.
 */
export function hitTestPivot(
  pivotDoc: Point,
  canvasPt: Point,
  zoom: number
): boolean {
  const threshold = PIVOT_HIT_RADIUS / zoom;
  return dist(canvasPt, pivotDoc) <= threshold;
}

/**
 * Snap anchor points for the pivot: center, 4 corners, and 4 edge midpoints.
 *
 * Positions are in document space, computed from the resolved layer center
 * and raster bounds (identical to the handle positions minus the rotation handle).
 */
export function getPivotSnapAnchors(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Point[] {
  if (usesAdvancedAffineTransform(transform)) {
    const corners = getTransformedCorners(transform, rasterBounds);
    return [
      getTransformedCenter(transform, rasterBounds),
      corners[0],
      corners[1],
      corners[3],
      corners[2],
      midpoint(corners[0], corners[1]),
      midpoint(corners[3], corners[2]),
      midpoint(corners[0], corners[3]),
      midpoint(corners[1], corners[2])
    ];
  }
  const center = getTransformedCenter(transform, rasterBounds);
  const { hw, hh } = scaledHalfExtents(rasterBounds, transform);
  const rot = transform.rotation ?? 0;
  const cx = center.x;
  const cy = center.y;

  return [
    // Center
    center,
    // Corners
    rotatePoint(cx - hw, cy - hh, cx, cy, rot),
    rotatePoint(cx + hw, cy - hh, cx, cy, rot),
    rotatePoint(cx - hw, cy + hh, cx, cy, rot),
    rotatePoint(cx + hw, cy + hh, cx, cy, rot),
    // Edge midpoints
    rotatePoint(cx, cy - hh, cx, cy, rot),
    rotatePoint(cx, cy + hh, cx, cy, rot),
    rotatePoint(cx - hw, cy, cx, cy, rot),
    rotatePoint(cx + hw, cy, cx, cy, rot)
  ];
}

/**
 * Snap a document-space point to the nearest pivot anchor if within
 * `PIVOT_SNAP_DISTANCE / zoom`. Returns the snapped point (or the
 * original if no anchor is close enough).
 */
export function snapPivotToAnchor(
  docPoint: Point,
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  zoom: number
): Point {
  const threshold = PIVOT_SNAP_DISTANCE / zoom;
  const anchors = getPivotSnapAnchors(transform, rasterBounds);
  let nearest: Point | null = null;
  let nearestDist = Infinity;
  for (const anchor of anchors) {
    const d = dist(docPoint, anchor);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = anchor;
    }
  }
  if (nearest && nearestDist <= threshold) {
    return nearest;
  }
  return docPoint;
}
