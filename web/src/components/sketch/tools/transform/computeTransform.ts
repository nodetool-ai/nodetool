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

import type { Point, LayerTransform, LayerContentBounds, TransformMode } from "../../types";
import { ensureTransformMatrix } from "../../types";
import {
  rotatePoint,
  snapAngle,
  scaledHalfExtents,
  HANDLE_ANCHOR,
  type TransformHandle
} from "./handleGeometry";
import { getTransformedCenter } from "../../painting/resolvedLayerGeometry";

type PhotoshopTransformMode = Exclude<TransformMode, "auto">;
type PerspectiveQuad = NonNullable<LayerTransform["quad"]>;

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

const DISTORT_NEIGHBORS: Record<
  Extract<
    TransformHandle,
    "top-left" | "top-right" | "bottom-right" | "bottom-left"
  >,
  { adjacentA: 0 | 1 | 2 | 3; adjacentB: 0 | 1 | 2 | 3 }
> = {
  "top-left": { adjacentA: 1, adjacentB: 3 },
  "top-right": { adjacentA: 0, adjacentB: 2 },
  "bottom-right": { adjacentA: 1, adjacentB: 3 },
  "bottom-left": { adjacentA: 0, adjacentB: 2 }
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
  quad: PerspectiveQuad,
  dx: number,
  dy: number
): PerspectiveQuad {
  return quad.map((corner) => ({
    x: corner.x + dx,
    y: corner.y + dy
  })) as PerspectiveQuad;
}

function rotateQuad(
  quad: PerspectiveQuad,
  pivot: Point,
  angle: number
): PerspectiveQuad {
  return quad.map((corner) =>
    rotatePoint(corner.x, corner.y, pivot.x, pivot.y, angle)
  ) as PerspectiveQuad;
}

function quadCenter(quad: PerspectiveQuad): Point {
  return {
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4
  };
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

function buildPerspectiveTransform(
  quad: PerspectiveQuad,
  rasterBounds: LayerContentBounds,
  baseTransform: LayerTransform
): LayerTransform {
  const { matrix: _matrix, quad: _quad, mode: _mode, ...rest } = baseTransform;
  const center = quadCenter(quad);
  const topVector = {
    x: ((quad[1].x - quad[0].x) + (quad[2].x - quad[3].x)) / 2,
    y: ((quad[1].y - quad[0].y) + (quad[2].y - quad[3].y)) / 2
  };
  const leftVector = {
    x: ((quad[3].x - quad[0].x) + (quad[2].x - quad[1].x)) / 2,
    y: ((quad[3].y - quad[0].y) + (quad[2].y - quad[1].y)) / 2
  };
  return {
    ...rest,
    x: Math.round(center.x - rasterBounds.x - rasterBounds.width / 2),
    y: Math.round(center.y - rasterBounds.y - rasterBounds.height / 2),
    scaleX:
      Math.hypot(topVector.x, topVector.y) / Math.max(1, rasterBounds.width),
    scaleY:
      Math.hypot(leftVector.x, leftVector.y) / Math.max(1, rasterBounds.height),
    rotation: Math.atan2(topVector.y, topVector.x),
    mode: "perspective",
    quad
  };
}

function isCornerHandle(
  handle: TransformHandle
): handle is Extract<
  TransformHandle,
  "top-left" | "top-right" | "bottom-right" | "bottom-left"
> {
  return (
    handle === "top-left" ||
    handle === "top-right" ||
    handle === "bottom-right" ||
    handle === "bottom-left"
  );
}

function isEdgeHandle(
  handle: TransformHandle
): handle is Extract<TransformHandle, "top" | "bottom" | "left" | "right"> {
  return (
    handle === "top" ||
    handle === "bottom" ||
    handle === "left" ||
    handle === "right"
  );
}

export function resolvePhotoshopTransformMode(
  baseMode: TransformMode,
  handle: TransformHandle,
  modifiers: {
    ctrlOrMeta: boolean;
    shift: boolean;
    alt: boolean;
  }
): PhotoshopTransformMode {
  if (baseMode !== "auto") {
    if (baseMode === "perspective") {
      return "perspective";
    }
    return baseMode;
  }

  if (modifiers.ctrlOrMeta && modifiers.alt && modifiers.shift) {
    return "perspective";
  }
  if (modifiers.ctrlOrMeta && isCornerHandle(handle)) {
    return "distort";
  }
  if (modifiers.ctrlOrMeta && isEdgeHandle(handle)) {
    return "skew";
  }
  return "scale";
}

function fitAffineFromCorners(
  corners: [Point, Point, Point, Point],
  rasterBounds: LayerContentBounds
): NonNullable<LayerTransform["matrix"]> {
  const tl = corners[0];
  const tr = corners[1];
  const bl = corners[3];
  const width = Math.max(1, rasterBounds.width);
  const height = Math.max(1, rasterBounds.height);
  const a = (tr.x - tl.x) / width;
  const b = (tr.y - tl.y) / width;
  const c = (bl.x - tl.x) / height;
  const d = (bl.y - tl.y) / height;
  const e = tl.x - a * rasterBounds.x - c * rasterBounds.y;
  const f = tl.y - b * rasterBounds.x - d * rasterBounds.y;
  return [a, b, c, d, e, f];
}

function buildAdvancedTransform(
  corners: [Point, Point, Point, Point],
  rasterBounds: LayerContentBounds,
  mode: "distort" | "skew"
): LayerTransform {
  const matrix = fitAffineFromCorners(corners, rasterBounds);
  const topVector = {
    x: corners[1].x - corners[0].x,
    y: corners[1].y - corners[0].y
  };
  const leftVector = {
    x: corners[3].x - corners[0].x,
    y: corners[3].y - corners[0].y
  };
  return {
    x: matrix[4],
    y: matrix[5],
    scaleX: Math.hypot(topVector.x, topVector.y) / Math.max(1, rasterBounds.width),
    scaleY:
      Math.hypot(leftVector.x, leftVector.y) / Math.max(1, rasterBounds.height),
    rotation: Math.atan2(topVector.y, topVector.x),
    matrix,
    mode
  };
}

export function computeDistortTransform(
  dragStartCorners: [Point, Point, Point, Point],
  handle: Extract<
    TransformHandle,
    "top-left" | "top-right" | "bottom-right" | "bottom-left"
  >,
  dragStart: Point,
  cursor: Point,
  rasterBounds: LayerContentBounds,
  constrain: boolean
): LayerTransform {
  const draggedIndex = CORNER_INDEX_BY_HANDLE[handle];
  const { adjacentA, adjacentB } = DISTORT_NEIGHBORS[handle];
  const draggedCorner = dragStartCorners[draggedIndex];
  const adjacentCornerA = dragStartCorners[adjacentA];
  const adjacentCornerB = dragStartCorners[adjacentB];
  const delta = {
    x: cursor.x - dragStart.x,
    y: cursor.y - dragStart.y
  };

  let alongA = projectVector(delta, {
    x: adjacentCornerA.x - draggedCorner.x,
    y: adjacentCornerA.y - draggedCorner.y
  });
  let alongB = projectVector(delta, {
    x: adjacentCornerB.x - draggedCorner.x,
    y: adjacentCornerB.y - draggedCorner.y
  });

  if (constrain) {
    if (Math.hypot(alongA.x, alongA.y) >= Math.hypot(alongB.x, alongB.y)) {
      alongB = { x: 0, y: 0 };
    } else {
      alongA = { x: 0, y: 0 };
    }
  }

  const nextCorners = dragStartCorners.map((corner) => ({ ...corner })) as [
    Point,
    Point,
    Point,
    Point
  ];

  nextCorners[draggedIndex] = {
    x: draggedCorner.x + alongA.x + alongB.x,
    y: draggedCorner.y + alongA.y + alongB.y
  };
  nextCorners[adjacentA] = {
    x: adjacentCornerA.x + alongB.x,
    y: adjacentCornerA.y + alongB.y
  };
  nextCorners[adjacentB] = {
    x: adjacentCornerB.x + alongA.x,
    y: adjacentCornerB.y + alongA.y
  };

  return buildAdvancedTransform(nextCorners, rasterBounds, "distort");
}

export function computeSkewTransform(
  dragStartCorners: [Point, Point, Point, Point],
  handle: Extract<TransformHandle, "top" | "bottom" | "left" | "right">,
  dragStart: Point,
  cursor: Point,
  rasterBounds: LayerContentBounds
): LayerTransform {
  const delta = {
    x: cursor.x - dragStart.x,
    y: cursor.y - dragStart.y
  };
  const nextCorners = dragStartCorners.map((corner) => ({ ...corner })) as [
    Point,
    Point,
    Point,
    Point
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

  return buildAdvancedTransform(nextCorners, rasterBounds, "skew");
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
  const nextQuad = dragStartCorners.map((corner) => ({
    ...corner
  })) as PerspectiveQuad;

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

  return buildPerspectiveTransform(nextQuad, rasterBounds, baseTransform);
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
  if (dragStartTransform.mode === "perspective" && dragStartTransform.quad) {
    return {
      ...dragStartTransform,
      x: Math.round(dragStartTransform.x + dx),
      y: Math.round(dragStartTransform.y + dy),
      quad: translateQuad(dragStartTransform.quad, dx, dy)
    };
  }
  if (dragStartTransform.matrix && dragStartTransform.mode) {
    return {
      ...dragStartTransform,
      x: Math.round(dragStartTransform.x + dx),
      y: Math.round(dragStartTransform.y + dy),
      matrix: [
        dragStartTransform.matrix[0],
        dragStartTransform.matrix[1],
        dragStartTransform.matrix[2],
        dragStartTransform.matrix[3],
        dragStartTransform.matrix[4] + dx,
        dragStartTransform.matrix[5] + dy
      ]
    };
  }
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
  if (dragStartTransform.mode === "perspective" && dragStartTransform.quad) {
    const angleStart = Math.atan2(
      dragStart.y - pivot.y,
      dragStart.x - pivot.x
    );
    const angleCursor = Math.atan2(cursor.y - pivot.y, cursor.x - pivot.x);
    let deltaAngle = angleCursor - angleStart;
    let newRot = (dragStartTransform.rotation ?? 0) + deltaAngle;
    if (shift) {
      newRot = snapAngle(newRot);
      deltaAngle = newRot - (dragStartTransform.rotation ?? 0);
    }
    const nextQuad = rotateQuad(dragStartTransform.quad, pivot, deltaAngle);
    const startCenter = quadCenter(dragStartTransform.quad);
    const nextCenter = quadCenter(nextQuad);
    return {
      ...dragStartTransform,
      x: Math.round(dragStartTransform.x + (nextCenter.x - startCenter.x)),
      y: Math.round(dragStartTransform.y + (nextCenter.y - startCenter.y)),
      rotation: newRot,
      quad: nextQuad
    };
  }
  const rot = dragStartTransform.rotation ?? 0;
  const angleStart = Math.atan2(
    dragStart.y - pivot.y,
    dragStart.x - pivot.x
  );
  const angleCursor = Math.atan2(cursor.y - pivot.y, cursor.x - pivot.x);
  let deltaAngle = angleCursor - angleStart;
  let newRot = rot + deltaAngle;
  if (shift) {
    newRot = snapAngle(newRot);
    // Recalculate delta after snapping so the orbit stays consistent
    deltaAngle = newRot - rot;
  }

  const result: LayerTransform = { ...dragStartTransform, rotation: newRot };

  // If the pivot differs from the layer center, adjust translation so the
  // layer orbits the pivot (center follows a circular arc around the pivot).
  if (layerCenter) {
    const orbited = rotatePoint(
      layerCenter.x,
      layerCenter.y,
      pivot.x,
      pivot.y,
      deltaAngle
    );
    result.x = Math.round(dragStartTransform.x + (orbited.x - layerCenter.x));
    result.y = Math.round(dragStartTransform.y + (orbited.y - layerCenter.y));
  }

  return ensureTransformMatrix(result);
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
      // Proportional: use radial distance ratio from handle reference
      const origDist = Math.hypot(handleRefX, handleRefY);
      if (origDist > 1) {
        const virtualDist = Math.hypot(handleRefX + deltaX, handleRefY + deltaY);
        const ratio = virtualDist / origDist;
        newSx = sx * ratio;
        newSy = sy * ratio;
      }
    } else {
      // Independent X/Y — apply delta to handle reference position
      if (handleRefX > 1) {
        newSx = sx * ((handleRefX + deltaX) / handleRefX);
      }
      if (handleRefY > 1) {
        newSy = sy * ((handleRefY + deltaY) / handleRefY);
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
