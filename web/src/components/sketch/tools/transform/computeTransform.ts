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

import type {
  Point,
  LayerTransform,
  LayerContentBounds,
  TransformMode,
  Quad,
  SingleQuadMode,
  SingleQuadTransform
} from "../../types";
import {
  cloneTransform,
  isAffineTransform,
  makeAffineTransform,
  makeSingleQuadTransform
} from "../../types";
import {
  rotatePoint,
  snapAngle,
  scaledHalfExtents,
  HANDLE_ANCHOR,
  isEdgeHandle,
  type TransformHandle
} from "./handleGeometry";

type GestureTransformMode = TransformMode;
type PerspectiveQuad = [Point, Point, Point, Point];

const CORNER_INDEX_BY_HANDLE: Record<
  Extract<
    TransformHandle,
    "top-left" | "top-right" | "bottom-right" | "bottom-left"
  >,
  0 | 1 | 2 | 3
> = {
  "top-left": 0,
  "top-right": 1,
  "bottom-right": 2,
  "bottom-left": 3
};

function projectVector(delta: Point, axis: Point): Point {
  const length = Math.hypot(axis.x, axis.y);
  if (length <= 1e-9) {
    return { x: 0, y: 0 };
  }
  const ux = axis.x / length;
  const uy = axis.y / length;
  const amount = delta.x * ux + delta.y * uy;
  return {
    x: ux * amount,
    y: uy * amount
  };
}

function translateQuad(
  quad: Quad,
  dx: number,
  dy: number
): Quad {
  return [
    { x: quad[0].x + dx, y: quad[0].y + dy },
    { x: quad[1].x + dx, y: quad[1].y + dy },
    { x: quad[2].x + dx, y: quad[2].y + dy },
    { x: quad[3].x + dx, y: quad[3].y + dy }
  ];
}

function normalizeVector(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 1e-9) {
    return { x: 0, y: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function scaledVector(axis: Point, amount: number): Point {
  return {
    x: axis.x * amount,
    y: axis.y * amount
  };
}

function buildQuadTransform(
  mode: SingleQuadMode,
  quad: PerspectiveQuad,
  baseTransform: LayerTransform
): SingleQuadTransform {
  void baseTransform;
  return makeSingleQuadTransform(mode, quad);
}


/**
 * Resolves the gesture mode for the current drag.
 *
 * The configured base mode (set via the top bar) is the default. While in
 * `scale`, Affinity-style modifiers can temporarily promote a drag into an
 * advanced gesture:
 *
 *   - Ctrl/Cmd on a side handle  → `skew` (shear)
 *   - Ctrl + Alt + Shift          → `perspective`
 *
 * Note: Ctrl/Cmd on a *corner* is NOT a distort here — it means "scale from
 * center" (handled inside `computeScaleTransform`). Distort and warp must be
 * selected explicitly via the top bar so they don't compete with scale's
 * from-center modifier.
 *
 * Explicit modes (skew, distort, perspective, warp) are honored as
 * configured so the user can stay in a sticky advanced mode without holding
 * a modifier.
 */
export function resolveTransformGestureMode(
  baseMode: TransformMode,
  handle: TransformHandle,
  modifiers: {
    ctrlOrMeta: boolean;
    shift: boolean;
    alt: boolean;
  }
): GestureTransformMode {
  if (baseMode !== "scale") {
    return baseMode;
  }

  if (modifiers.ctrlOrMeta && modifiers.alt && modifiers.shift) {
    return "perspective";
  }
  if (modifiers.ctrlOrMeta && isEdgeHandle(handle)) {
    return "skew";
  }
  return "scale";
}


/**
 * Free 4-point distort: only the dragged corner moves. The three other
 * corners stay put, producing a true quadrilateral (Photoshop "Distort").
 *
 * Shift constrains the delta to the dominant axis (horizontal/vertical),
 * matching Affinity / Photoshop behavior.
 *
 * The earlier implementation also moved the two adjacent corners along
 * their respective edges and baked the result through TL/TR/BL — that
 * collapses back to a parallelogram, making distort visually identical
 * to scale+shear. The 4-point quad below is what the user expects.
 */
export function computeDistortTransform(
  dragStartCorners: [Point, Point, Point, Point],
  handle: Extract<
    TransformHandle,
    "top-left" | "top-right" | "bottom-right" | "bottom-left"
  >,
  dragStart: Point,
  cursor: Point,
  rasterBounds: LayerContentBounds,
  constrain: boolean,
  baseTransform: LayerTransform
): LayerTransform {
  const draggedIndex = CORNER_INDEX_BY_HANDLE[handle];
  let dx = cursor.x - dragStart.x;
  let dy = cursor.y - dragStart.y;
  if (constrain) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      dy = 0;
    } else {
      dx = 0;
    }
  }
  const next: [Point, Point, Point, Point] = [
    { ...dragStartCorners[0] },
    { ...dragStartCorners[1] },
    { ...dragStartCorners[2] },
    { ...dragStartCorners[3] }
  ];
  next[draggedIndex] = {
    x: next[draggedIndex].x + dx,
    y: next[draggedIndex].y + dy
  };
  void rasterBounds;
  return buildQuadTransform("distort", next, baseTransform);
}

export function computeSkewTransform(
  dragStartCorners: [Point, Point, Point, Point],
  handle: Extract<TransformHandle, "top" | "bottom" | "left" | "right">,
  dragStart: Point,
  cursor: Point,
  rasterBounds: LayerContentBounds,
  baseTransform: LayerTransform
): LayerTransform {
  const delta = {
    x: cursor.x - dragStart.x,
    y: cursor.y - dragStart.y
  };
  const nextCorners: [Point, Point, Point, Point] = [
    { ...dragStartCorners[0] },
    { ...dragStartCorners[1] },
    { ...dragStartCorners[2] },
    { ...dragStartCorners[3] }
  ];

  if (handle === "top" || handle === "bottom") {
    const edgeStart =
      handle === "top" ? dragStartCorners[0] : dragStartCorners[3];
    const edgeEnd =
      handle === "top" ? dragStartCorners[1] : dragStartCorners[2];
    const projected = projectVector(delta, {
      x: edgeEnd.x - edgeStart.x,
      y: edgeEnd.y - edgeStart.y
    });
    const indices = handle === "top" ? [0, 1] : [3, 2];
    for (const index of indices) {
      nextCorners[index] = {
        x: nextCorners[index].x + projected.x,
        y: nextCorners[index].y + projected.y
      };
    }
  } else {
    const edgeStart =
      handle === "left" ? dragStartCorners[0] : dragStartCorners[1];
    const edgeEnd =
      handle === "left" ? dragStartCorners[3] : dragStartCorners[2];
    const projected = projectVector(delta, {
      x: edgeEnd.x - edgeStart.x,
      y: edgeEnd.y - edgeStart.y
    });
    const indices = handle === "left" ? [0, 3] : [1, 2];
    for (const index of indices) {
      nextCorners[index] = {
        x: nextCorners[index].x + projected.x,
        y: nextCorners[index].y + projected.y
      };
    }
  }

  void rasterBounds;
  return buildQuadTransform("skew", nextCorners, baseTransform);
}

export function computePerspectiveTransform(
  dragStartCorners: [Point, Point, Point, Point],
  handle: Extract<
    TransformHandle,
    "top-left" | "top-right" | "bottom-right" | "bottom-left"
  >,
  dragStart: Point,
  cursor: Point,
  rasterBounds: LayerContentBounds,
  baseTransform: LayerTransform
): LayerTransform {
  const delta = {
    x: cursor.x - dragStart.x,
    y: cursor.y - dragStart.y
  };
  const xAxis = normalizeVector({
    x:
      ((dragStartCorners[1].x - dragStartCorners[0].x) +
        (dragStartCorners[2].x - dragStartCorners[3].x)) /
      2,
    y:
      ((dragStartCorners[1].y - dragStartCorners[0].y) +
        (dragStartCorners[2].y - dragStartCorners[3].y)) /
      2
  });
  const yAxis = normalizeVector({
    x:
      ((dragStartCorners[3].x - dragStartCorners[0].x) +
        (dragStartCorners[2].x - dragStartCorners[1].x)) /
      2,
    y:
      ((dragStartCorners[3].y - dragStartCorners[0].y) +
        (dragStartCorners[2].y - dragStartCorners[1].y)) /
      2
  });
  const horizontal = scaledVector(xAxis, dot(delta, xAxis));
  const vertical = scaledVector(yAxis, dot(delta, yAxis));
  const nextQuad: PerspectiveQuad = [
    { ...dragStartCorners[0] },
    { ...dragStartCorners[1] },
    { ...dragStartCorners[2] },
    { ...dragStartCorners[3] }
  ];

  if (handle === "top-left") {
    nextQuad[0] = {
      x: nextQuad[0].x + horizontal.x + vertical.x,
      y: nextQuad[0].y + horizontal.y + vertical.y
    };
    nextQuad[1] = {
      x: nextQuad[1].x - horizontal.x,
      y: nextQuad[1].y - horizontal.y
    };
    nextQuad[3] = {
      x: nextQuad[3].x - vertical.x,
      y: nextQuad[3].y - vertical.y
    };
  } else if (handle === "top-right") {
    nextQuad[1] = {
      x: nextQuad[1].x + horizontal.x + vertical.x,
      y: nextQuad[1].y + horizontal.y + vertical.y
    };
    nextQuad[0] = {
      x: nextQuad[0].x - horizontal.x,
      y: nextQuad[0].y - horizontal.y
    };
    nextQuad[2] = {
      x: nextQuad[2].x - vertical.x,
      y: nextQuad[2].y - vertical.y
    };
  } else if (handle === "bottom-right") {
    nextQuad[2] = {
      x: nextQuad[2].x + horizontal.x + vertical.x,
      y: nextQuad[2].y + horizontal.y + vertical.y
    };
    nextQuad[3] = {
      x: nextQuad[3].x - horizontal.x,
      y: nextQuad[3].y - horizontal.y
    };
    nextQuad[1] = {
      x: nextQuad[1].x - vertical.x,
      y: nextQuad[1].y - vertical.y
    };
  } else {
    nextQuad[3] = {
      x: nextQuad[3].x + horizontal.x + vertical.x,
      y: nextQuad[3].y + horizontal.y + vertical.y
    };
    nextQuad[2] = {
      x: nextQuad[2].x - horizontal.x,
      y: nextQuad[2].y - horizontal.y
    };
    nextQuad[0] = {
      x: nextQuad[0].x - vertical.x,
      y: nextQuad[0].y - vertical.y
    };
  }

  void rasterBounds;
  return buildQuadTransform("perspective", nextQuad, baseTransform);
}

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
  switch (dragStartTransform.kind) {
    case "affine":
      return makeAffineTransform({
        ...dragStartTransform,
        x: Math.round(dragStartTransform.x + dx),
        y: Math.round(dragStartTransform.y + dy)
      });
    case "quad":
      return makeSingleQuadTransform(
        dragStartTransform.mode,
        translateQuad(dragStartTransform.quad, dx, dy)
      );
  }
}

// ─── Rotation computation ────────────────────────────────────────────────────

/**
 * Compute a new transform for a rotate gesture.
 *
 * @param dragStartTransform  Transform at the start of the drag.
 * @param dragStart           Pointer position at drag start (document space).
 * @param cursor              Current pointer position (document space).
 * @param pivot               Rotation pivot point (document space). Usually the
 *   layer center, but may be a user-placed pivot handle position.
 * @param shift               Whether Shift is held (snap to 15° increments).
 * @param layerCenter         Original layer center (document space). When
 *   provided and different from `pivot`, the layer orbits the pivot so the
 *   center follows a circular arc. Omit when pivot === layer center.
 */
export function computeRotateTransform(
  dragStartTransform: LayerTransform,
  dragStart: Point,
  cursor: Point,
  pivot: Point,
  shift: boolean,
  layerCenter?: Point
): LayerTransform {
  if (!isAffineTransform(dragStartTransform)) {
    console.warn(
      "computeRotateTransform: rotate is only supported on affine transforms"
    );
    return cloneTransform(dragStartTransform);
  }
  const rot = dragStartTransform.rotation;
  const angleStart = Math.atan2(
    dragStart.y - pivot.y,
    dragStart.x - pivot.x
  );
  const angleCursor = Math.atan2(cursor.y - pivot.y, cursor.x - pivot.x);
  let deltaAngle = angleCursor - angleStart;
  let newRot = rot + deltaAngle;
  if (shift) {
    newRot = snapAngle(newRot);
    deltaAngle = newRot - rot;
  }

  let nextX = dragStartTransform.x;
  let nextY = dragStartTransform.y;
  if (layerCenter) {
    const orbited = rotatePoint(
      layerCenter.x,
      layerCenter.y,
      pivot.x,
      pivot.y,
      deltaAngle
    );
    nextX = Math.round(dragStartTransform.x + (orbited.x - layerCenter.x));
    nextY = Math.round(dragStartTransform.y + (orbited.y - layerCenter.y));
  }

  return makeAffineTransform({
    ...dragStartTransform,
    x: nextX,
    y: nextY,
    rotation: newRot
  });
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
 * @param shift               Whether Shift is held. On a CORNER, Shift inverts
 *   the default proportional behaviour: held = independent X/Y, released =
 *   proportional (Affinity / Figma / Photoshop CC 2019+ convention). On an
 *   EDGE handle, Shift mirrors the scale to the other axis.
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
  if (!isAffineTransform(dragStartTransform)) {
    console.warn(
      "computeScaleTransform: scale is only supported on affine transforms"
    );
    return cloneTransform(dragStartTransform);
  }
  const sx = dragStartTransform.scaleX;
  const sy = dragStartTransform.scaleY;
  const rot = dragStartTransform.rotation;

  // Un-rotate both start and cursor around the center
  const uStart = rotatePoint(dragStart.x, dragStart.y, center.x, center.y, -rot);
  const uCursor = rotatePoint(cursor.x, cursor.y, center.x, center.y, -rot);

  const { hw, hh } = scaledHalfExtents(rasterBounds, dragStartTransform);

  let newSx = sx;
  let newSy = sy;

  // When Alt is NOT held, the opposite edge is anchored (only one side moves).
  // The cursor delta affects only ONE half of the layer, so we halve the delta
  // for the scale computation. With Alt (scale from center), both sides move
  // so the full delta is used.
  const edgeFactor = alt ? 1 : 0.5;

  // Corner handles
  if (
    handle === "top-left" ||
    handle === "top-right" ||
    handle === "bottom-left" ||
    handle === "bottom-right"
  ) {
    // Use signed distance from center to preserve direction for left/top handles.
    const signX =
      handle === "top-left" || handle === "bottom-left" ? -1 : 1;
    const signY =
      handle === "top-left" || handle === "top-right" ? -1 : 1;

    const startDx = (uStart.x - center.x) * signX;
    const startDy = (uStart.y - center.y) * signY;
    const cursorDx = (uCursor.x - center.x) * signX;
    const cursorDy = (uCursor.y - center.y) * signY;

    // Use the handle's known position (hw, hh) as the reference to avoid
    // amplification when the click doesn't land exactly on the handle center.
    // The cursor delta is applied to the handle position for 1:1 tracking.
    const handleRefX = hw;
    const handleRefY = hh;
    const deltaX = (cursorDx - startDx) * edgeFactor;
    const deltaY = (cursorDy - startDy) * edgeFactor;

    if (shift) {
      // Shift held: independent X/Y — apply delta to handle reference position
      if (handleRefX > 1) {
        newSx = sx * ((handleRefX + deltaX) / handleRefX);
      }
      if (handleRefY > 1) {
        newSy = sy * ((handleRefY + deltaY) / handleRefY);
      }
    } else {
      // Default: proportional. Use radial distance ratio from handle reference.
      const origDist = Math.hypot(handleRefX, handleRefY);
      if (origDist > 1) {
        const virtualDist = Math.hypot(handleRefX + deltaX, handleRefY + deltaY);
        const ratio = virtualDist / origDist;
        newSx = sx * ratio;
        newSy = sy * ratio;
      }
    }
  }

  // Edge midpoint handles: axis-constrained
  if (handle === "left" || handle === "right") {
    if (hw > 1) {
      const sign = handle === "left" ? -1 : 1;
      const startDx = (uStart.x - center.x) * sign;
      const cursorDx = (uCursor.x - center.x) * sign;
      const deltaX = (cursorDx - startDx) * edgeFactor;
      // Use handle reference position for 1:1 tracking
      newSx = sx * ((hw + deltaX) / hw);
      if (shift) {
        newSy = newSx;
      }
    }
  }
  if (handle === "top" || handle === "bottom") {
    if (hh > 1) {
      const sign = handle === "top" ? -1 : 1;
      const startDy = (uStart.y - center.y) * sign;
      const cursorDy = (uCursor.y - center.y) * sign;
      const deltaY = (cursorDy - startDy) * edgeFactor;
      // Use handle reference position for 1:1 tracking
      newSy = sy * ((hh + deltaY) / hh);
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
    const dScaleX = newSx - sx;
    const dScaleY = newSy - sy;

    const offsetX = (anchor.dx * dScaleX * rasterBounds.width) / 2;
    const offsetY = (anchor.dy * dScaleY * rasterBounds.height) / 2;

    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return makeAffineTransform({
      ...dragStartTransform,
      scaleX: newSx,
      scaleY: newSy,
      x: Math.round(dragStartTransform.x - offsetX * cos + offsetY * sin),
      y: Math.round(dragStartTransform.y - offsetX * sin - offsetY * cos)
    });
  }

  return makeAffineTransform({
    ...dragStartTransform,
    scaleX: newSx,
    scaleY: newSy
  });
}

// ─── Unified dispatcher ──────────────────────────────────────────────────────

/**
 * Compute a new transform for any handle type. This is the single entry
 * point that TransformTool.ts should call during a drag gesture.
 *
 * @param layerCenter  Original layer center (document space). Only needed
 *   when `center` is a custom pivot (different from the layer center) and
 *   `handle` is `"rotate"`. When provided, the layer orbits the pivot.
 */
export function computeTransformForHandle(
  handle: TransformHandle,
  dragStartTransform: LayerTransform,
  dragStart: Point,
  cursor: Point,
  center: Point,
  rasterBounds: LayerContentBounds,
  shift: boolean,
  alt: boolean,
  layerCenter?: Point
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
      shift,
      layerCenter
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
