/**
 * computeTransform – Pure transform computation for scale, rotate, and
 * move gestures.
 *
 * Extracted from TransformTool.ts so the tool file owns interaction flow
 * (hit testing, drag state, pointer events), not geometry policy.
 *
 * All functions are pure: they take the drag state and return a new
 * LayerTransform without side effects.
 *
 * @module tools/transform/computeTransform
 */

import type { Point, LayerTransform, LayerContentBounds } from "../../types";
import { ensureTransformMatrix } from "../../types";
import {
  rotatePoint,
  snapAngle,
  scaledHalfExtents,
  HANDLE_ANCHOR,
  type TransformHandle
} from "./handleGeometry";
import { getTransformedCenter } from "../../painting/resolvedLayerGeometry";

// ─── Move computation ────────────────────────────────────────────────────────

/**
 * Compute a new transform for a move gesture (translate only).
 * Preserves all existing scale/rotation/matrix state.
 */
export function computeMoveTransform(
  dragStartTransform: LayerTransform,
  dragStart: Point,
  cursor: Point
): LayerTransform {
  const dx = cursor.x - dragStart.x;
  const dy = cursor.y - dragStart.y;
  return ensureTransformMatrix({
    ...dragStartTransform,
    x: Math.round(dragStartTransform.x + dx),
    y: Math.round(dragStartTransform.y + dy)
  });
}

// ─── Rotation computation ────────────────────────────────────────────────────

/**
 * Compute a new transform for a rotate gesture.
 *
 * @param dragStartTransform  Transform at the start of the drag.
 * @param dragStart           Pointer position at drag start (document space).
 * @param cursor              Current pointer position (document space).
 * @param center              Layer center in document space.
 * @param shift               Whether Shift is held (snap to 15° increments).
 */
export function computeRotateTransform(
  dragStartTransform: LayerTransform,
  dragStart: Point,
  cursor: Point,
  center: Point,
  shift: boolean
): LayerTransform {
  const rot = dragStartTransform.rotation ?? 0;
  const angleStart = Math.atan2(
    dragStart.y - center.y,
    dragStart.x - center.x
  );
  const angleCursor = Math.atan2(cursor.y - center.y, cursor.x - center.x);
  let newRot = rot + (angleCursor - angleStart);
  if (shift) {
    newRot = snapAngle(newRot);
  }
  return ensureTransformMatrix({ ...dragStartTransform, rotation: newRot });
}

// ─── Scale computation ───────────────────────────────────────────────────────

/**
 * Compute a new transform for a scale gesture.
 *
 * Handles corner, edge-midpoint, and proportional/independent scaling,
 * plus the Alt modifier (scale from center) and Shift (proportional lock).
 *
 * **Left/top handle fix**: scale handles now use signed distance ratios
 * instead of absolute distances, so dragging the left or top handle
 * correctly inverts the direction (shrinking when dragged inward,
 * growing when dragged outward).
 *
 * @param dragStartTransform  Transform at the start of the drag.
 * @param dragStart           Pointer position at drag start (document space).
 * @param cursor              Current pointer position (document space).
 * @param center              Layer center in document space at drag start.
 * @param rasterBounds        Layer raster bounds (contentBounds).
 * @param handle              Which scale handle is being dragged.
 * @param shift               Whether Shift is held (proportional lock).
 * @param alt                 Whether Alt is held (scale from center).
 */
export function computeScaleTransform(
  dragStartTransform: LayerTransform,
  dragStart: Point,
  cursor: Point,
  center: Point,
  rasterBounds: LayerContentBounds,
  handle: TransformHandle,
  shift: boolean,
  alt: boolean
): LayerTransform {
  const sx = dragStartTransform.scaleX ?? 1;
  const sy = dragStartTransform.scaleY ?? 1;
  const rot = dragStartTransform.rotation ?? 0;

  // Un-rotate both start and cursor around the center
  const uStart = rotatePoint(dragStart.x, dragStart.y, center.x, center.y, -rot);
  const uCursor = rotatePoint(cursor.x, cursor.y, center.x, center.y, -rot);

  const { hw, hh } = scaledHalfExtents(rasterBounds, dragStartTransform);

  let newSx = sx;
  let newSy = sy;

  // Corner handles
  if (
    handle === "top-left" ||
    handle === "top-right" ||
    handle === "bottom-left" ||
    handle === "bottom-right"
  ) {
    // Use signed distance from center to preserve direction for left/top handles.
    // The sign of the direction vector component tells us which side of center
    // the handle is on; when the cursor crosses center the scale naturally
    // flips (clamped to min-scale later).
    const signX =
      handle === "top-left" || handle === "bottom-left" ? -1 : 1;
    const signY =
      handle === "top-left" || handle === "top-right" ? -1 : 1;

    const startDx = (uStart.x - center.x) * signX;
    const startDy = (uStart.y - center.y) * signY;
    const cursorDx = (uCursor.x - center.x) * signX;
    const cursorDy = (uCursor.y - center.y) * signY;

    if (shift) {
      // Proportional: use radial distance ratio
      const distStart = Math.hypot(startDx, startDy);
      const distCursor = Math.hypot(cursorDx, cursorDy);
      if (distStart > 1) {
        const ratio = distCursor / distStart;
        newSx = sx * ratio;
        newSy = sy * ratio;
      }
    } else {
      // Independent X/Y
      if (Math.abs(startDx) > 1) {
        newSx = sx * (cursorDx / startDx);
      }
      if (Math.abs(startDy) > 1) {
        newSy = sy * (cursorDy / startDy);
      }
    }
  }

  // Edge midpoint handles: axis-constrained
  if (handle === "left" || handle === "right") {
    if (hw > 1) {
      // Use signed distance for left handle to properly invert direction
      const sign = handle === "left" ? -1 : 1;
      const startDx = (uStart.x - center.x) * sign;
      const cursorDx = (uCursor.x - center.x) * sign;
      if (Math.abs(startDx) > 1) {
        newSx = sx * (cursorDx / startDx);
      }
      if (shift) {
        newSy = newSx;
      }
    }
  }
  if (handle === "top" || handle === "bottom") {
    if (hh > 1) {
      // Use signed distance for top handle to properly invert direction
      const sign = handle === "top" ? -1 : 1;
      const startDy = (uStart.y - center.y) * sign;
      const cursorDy = (uCursor.y - center.y) * sign;
      if (Math.abs(startDy) > 1) {
        newSy = sy * (cursorDy / startDy);
      }
      if (shift) {
        newSx = newSy;
      }
    }
  }

  // Clamp to prevent zero scale (allow negative for mirroring)
  if (Math.abs(newSx) < 0.01) {
    newSx = newSx < 0 ? -0.01 : 0.01;
  }
  if (Math.abs(newSy) < 0.01) {
    newSy = newSy < 0 ? -0.01 : 0.01;
  }

  // ALT modifier: scale from center (default behavior).
  // Without ALT, anchor the opposite edge so it stays fixed.
  const anchor = HANDLE_ANCHOR[handle];
  if (!alt && anchor) {
    const result = { ...dragStartTransform, scaleX: newSx, scaleY: newSy };
    const dScaleX = newSx - sx;
    const dScaleY = newSy - sy;

    // Offset = half the size change in the anchor direction.
    // The anchor direction points TOWARD the edge that should stay fixed,
    // so the translation must move in the OPPOSITE direction (negate the offset)
    // to keep that edge stationary.
    const offsetX = (anchor.dx * dScaleX * rasterBounds.width) / 2;
    const offsetY = (anchor.dy * dScaleY * rasterBounds.height) / 2;

    // Rotate the negated offset by the current rotation
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    result.x = Math.round(dragStartTransform.x - offsetX * cos + offsetY * sin);
    result.y = Math.round(dragStartTransform.y - offsetX * sin - offsetY * cos);

    return ensureTransformMatrix(result);
  }

  return ensureTransformMatrix({
    ...dragStartTransform,
    scaleX: newSx,
    scaleY: newSy
  });
}

// ─── Unified dispatcher ──────────────────────────────────────────────────────

/**
 * Compute a new transform for any handle type. This is the single entry
 * point that TransformTool.ts should call during a drag gesture.
 */
export function computeTransformForHandle(
  handle: TransformHandle,
  dragStartTransform: LayerTransform,
  dragStart: Point,
  cursor: Point,
  center: Point,
  rasterBounds: LayerContentBounds,
  shift: boolean,
  alt: boolean
): LayerTransform {
  if (handle === "move") {
    return computeMoveTransform(dragStartTransform, dragStart, cursor);
  }
  if (handle === "rotate") {
    return computeRotateTransform(
      dragStartTransform,
      dragStart,
      cursor,
      center,
      shift
    );
  }
  return computeScaleTransform(
    dragStartTransform,
    dragStart,
    cursor,
    center,
    rasterBounds,
    handle,
    shift,
    alt
  );
}
