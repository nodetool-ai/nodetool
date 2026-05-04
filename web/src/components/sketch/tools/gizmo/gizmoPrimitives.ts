/**
 * gizmoPrimitives – Reusable gizmo drawing functions for all overlay tools.
 *
 * Provides composable paint primitives so TransformTool, MoveTool, CropTool,
 * and future gizmo consumers share one visual implementation instead of
 * hand-writing inline Canvas2D drawing code.
 *
 * All drawing functions operate on a CanvasRenderingContext2D that is
 * already set up with the correct DPR scaling (the gizmo canvas).
 *
 * @module tools/gizmo/gizmoPrimitives
 */

import type { Point } from "../../types";
import type { TransformHandle } from "../transform/handleGeometry";
import {
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_RADIUS_FACTOR,
  PIVOT_CROSSHAIR_SIZE,
  GIZMO_PRIMARY_COLOR,
  GIZMO_PRIMARY_SEMI,
  GIZMO_PRIMARY_FAINT,
  HANDLE_FILL_DEFAULT,
  HANDLE_FILL_HOVERED,
  GIZMO_LINE_WIDTH,
  GIZMO_LINE_WIDTH_HOVERED,
  BOUNDING_BOX_DASH_ON,
  BOUNDING_BOX_DASH_OFF,
  OFF_CANVAS_INDICATOR_COLOR,
  OFF_CANVAS_DASH_ON,
  OFF_CANVAS_DASH_OFF,
  CROP_DIM_COLOR,
  CROP_BORDER_COLOR,
  CROP_GRID_COLOR
} from "./gizmoConstants";

// ─── Transform gizmo primitives ──────────────────────────────────────────────

/**
 * Draw a dashed bounding box centered at the current context origin.
 *
 * Expects the context to be already translated to the center of the box
 * and rotated to the layer's rotation angle.
 */
export function drawBoundingBox(
  gc: CanvasRenderingContext2D,
  screenW: number,
  screenH: number,
  dpr: number
): void {
  gc.strokeStyle = GIZMO_PRIMARY_SEMI;
  gc.lineWidth = GIZMO_LINE_WIDTH * dpr;
  gc.setLineDash([BOUNDING_BOX_DASH_ON * dpr, BOUNDING_BOX_DASH_OFF * dpr]);
  gc.strokeRect(-screenW / 2, -screenH / 2, screenW, screenH);
  gc.setLineDash([]);
}

function drawQuadBoundingBox(
  gc: CanvasRenderingContext2D,
  corners: [Point, Point, Point, Point],
  dpr: number
): void {
  gc.strokeStyle = GIZMO_PRIMARY_SEMI;
  gc.lineWidth = GIZMO_LINE_WIDTH * dpr;
  gc.setLineDash([BOUNDING_BOX_DASH_ON * dpr, BOUNDING_BOX_DASH_OFF * dpr]);
  gc.beginPath();
  gc.moveTo(corners[0].x, corners[0].y);
  gc.lineTo(corners[1].x, corners[1].y);
  gc.lineTo(corners[2].x, corners[2].y);
  gc.lineTo(corners[3].x, corners[3].y);
  gc.closePath();
  gc.stroke();
  gc.setLineDash([]);
}

/**
 * Draw a single square handle (corner or edge midpoint).
 *
 * @param gc - Canvas context (already translated + rotated to box center)
 * @param pos - Handle position relative to the box center
 * @param isHovered - Whether the handle is hovered or active
 * @param dpr - Device pixel ratio
 */
export function drawSquareHandle(
  gc: CanvasRenderingContext2D,
  pos: Point,
  isHovered: boolean,
  dpr: number
): void {
  const hs = HANDLE_SIZE * dpr;
  gc.fillStyle = isHovered ? HANDLE_FILL_HOVERED : HANDLE_FILL_DEFAULT;
  gc.strokeStyle = GIZMO_PRIMARY_COLOR;
  gc.lineWidth = (isHovered ? GIZMO_LINE_WIDTH_HOVERED : GIZMO_LINE_WIDTH) * dpr;
  gc.fillRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
  gc.strokeRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
}

/**
 * Draw the rotation handle: a circle above top-center with a connecting line.
 *
 * @param gc - Canvas context (already translated + rotated to box center)
 * @param screenH - Full height of the bounding box in screen pixels
 * @param isHovered - Whether the rotation handle is hovered or active
 * @param dpr - Device pixel ratio
 */
export function drawRotationHandle(
  gc: CanvasRenderingContext2D,
  screenH: number,
  isHovered: boolean,
  dpr: number
): void {
  const hs = HANDLE_SIZE * dpr;
  const rotYOffset = ROTATION_HANDLE_OFFSET * dpr;
  const rotY = -screenH / 2 - rotYOffset;

  // Connecting line from top-center to rotation handle
  gc.beginPath();
  gc.moveTo(0, -screenH / 2);
  gc.lineTo(0, rotY);
  gc.strokeStyle = GIZMO_PRIMARY_FAINT;
  gc.lineWidth = GIZMO_LINE_WIDTH * dpr;
  gc.stroke();

  // Rotation circle
  gc.beginPath();
  gc.arc(0, rotY, hs * ROTATION_HANDLE_RADIUS_FACTOR, 0, Math.PI * 2);
  gc.fillStyle = isHovered ? HANDLE_FILL_HOVERED : HANDLE_FILL_DEFAULT;
  gc.fill();
  gc.strokeStyle = GIZMO_PRIMARY_COLOR;
  gc.lineWidth = (isHovered ? GIZMO_LINE_WIDTH_HOVERED : GIZMO_LINE_WIDTH) * dpr;
  gc.stroke();
}

/**
 * Draw the pivot handle: a crosshair with a small circle at the center.
 *
 * @param gc - Canvas context (save/restored internally)
 * @param pos - Pivot position in screen pixels (relative to gizmo canvas origin)
 * @param isHovered - Whether the pivot handle is hovered or active
 * @param dpr - Device pixel ratio
 */
export function drawPivotHandle(
  gc: CanvasRenderingContext2D,
  pos: Point,
  isHovered: boolean,
  dpr: number
): void {
  const arm = PIVOT_CROSSHAIR_SIZE * dpr;
  const lineW = (isHovered ? GIZMO_LINE_WIDTH_HOVERED : GIZMO_LINE_WIDTH) * dpr;
  const circleRadius = 3 * dpr;

  gc.save();
  gc.strokeStyle = GIZMO_PRIMARY_COLOR;
  gc.lineWidth = lineW;

  // Crosshair arms
  gc.beginPath();
  gc.moveTo(pos.x - arm, pos.y);
  gc.lineTo(pos.x + arm, pos.y);
  gc.moveTo(pos.x, pos.y - arm);
  gc.lineTo(pos.x, pos.y + arm);
  gc.stroke();

  // Small circle at center
  gc.beginPath();
  gc.arc(pos.x, pos.y, circleRadius, 0, Math.PI * 2);
  gc.fillStyle = isHovered ? HANDLE_FILL_HOVERED : HANDLE_FILL_DEFAULT;
  gc.fill();
  gc.stroke();

  gc.restore();
}

/**
 * Draw the complete transform gizmo: bounding box, 8 scale handles,
 * rotation handle, and pivot crosshair.
 *
 * @param gc - Canvas context (will be saved/restored internally)
 * @param screenCenter - Center point in screen-space pixels
 * @param screenW - Full width of the bounding box in screen pixels
 * @param screenH - Full height of the bounding box in screen pixels
 * @param rotation - Layer rotation in radians
 * @param activeOrHoveredHandle - The currently active or hovered handle (for highlight)
 * @param dpr - Device pixel ratio
 * @param pivotScreenPos - Optional pivot position in screen-space pixels.
 *   When provided, a crosshair is drawn at this position. When omitted the
 *   pivot is drawn at the box center.
 */
export function drawTransformGizmo(
  gc: CanvasRenderingContext2D,
  screenCenter: Point | null,
  screenW: number | null,
  screenH: number | null,
  rotation: number | null,
  activeOrHoveredHandle: TransformHandle | null,
  dpr: number,
  pivotScreenPos?: Point | null,
  screenCorners?: [Point, Point, Point, Point] | null,
  visibleHandles?: readonly TransformHandle[]
): void {
  const visible = new Set<TransformHandle>(
    visibleHandles ?? [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "top",
      "bottom",
      "left",
      "right",
      "rotate"
    ]
  );

  if (screenCorners) {
    const topMid = {
      x: (screenCorners[0].x + screenCorners[1].x) / 2,
      y: (screenCorners[0].y + screenCorners[1].y) / 2
    };
    const bottomMid = {
      x: (screenCorners[2].x + screenCorners[3].x) / 2,
      y: (screenCorners[2].y + screenCorners[3].y) / 2
    };
    const leftMid = {
      x: (screenCorners[0].x + screenCorners[3].x) / 2,
      y: (screenCorners[0].y + screenCorners[3].y) / 2
    };
    const rightMid = {
      x: (screenCorners[1].x + screenCorners[2].x) / 2,
      y: (screenCorners[1].y + screenCorners[2].y) / 2
    };
    const center = screenCenter ?? {
      x: (screenCorners[0].x + screenCorners[2].x) / 2,
      y: (screenCorners[0].y + screenCorners[2].y) / 2
    };
    const topDx = topMid.x - center.x;
    const topDy = topMid.y - center.y;
    const topLength = Math.hypot(topDx, topDy) || 1;
    const rotatePos = {
      x: topMid.x + (topDx / topLength) * ROTATION_HANDLE_OFFSET * dpr,
      y: topMid.y + (topDy / topLength) * ROTATION_HANDLE_OFFSET * dpr
    };

    gc.save();
    drawQuadBoundingBox(gc, screenCorners, dpr);
    if (visible.has("top-left")) {
      drawSquareHandle(gc, screenCorners[0], activeOrHoveredHandle === "top-left", dpr);
    }
    if (visible.has("top-right")) {
      drawSquareHandle(gc, screenCorners[1], activeOrHoveredHandle === "top-right", dpr);
    }
    if (visible.has("bottom-right")) {
      drawSquareHandle(gc, screenCorners[2], activeOrHoveredHandle === "bottom-right", dpr);
    }
    if (visible.has("bottom-left")) {
      drawSquareHandle(gc, screenCorners[3], activeOrHoveredHandle === "bottom-left", dpr);
    }
    if (visible.has("top")) {
      drawSquareHandle(gc, topMid, activeOrHoveredHandle === "top", dpr);
    }
    if (visible.has("bottom")) {
      drawSquareHandle(gc, bottomMid, activeOrHoveredHandle === "bottom", dpr);
    }
    if (visible.has("left")) {
      drawSquareHandle(gc, leftMid, activeOrHoveredHandle === "left", dpr);
    }
    if (visible.has("right")) {
      drawSquareHandle(gc, rightMid, activeOrHoveredHandle === "right", dpr);
    }
    if (visible.has("rotate")) {
      gc.beginPath();
      gc.moveTo(topMid.x, topMid.y);
      gc.lineTo(rotatePos.x, rotatePos.y);
      gc.strokeStyle = GIZMO_PRIMARY_FAINT;
      gc.lineWidth = GIZMO_LINE_WIDTH * dpr;
      gc.stroke();
      gc.beginPath();
      gc.arc(
        rotatePos.x,
        rotatePos.y,
        HANDLE_SIZE * ROTATION_HANDLE_RADIUS_FACTOR * dpr,
        0,
        Math.PI * 2
      );
      gc.fillStyle =
        activeOrHoveredHandle === "rotate"
          ? HANDLE_FILL_HOVERED
          : HANDLE_FILL_DEFAULT;
      gc.fill();
      gc.strokeStyle = GIZMO_PRIMARY_COLOR;
      gc.lineWidth =
        (activeOrHoveredHandle === "rotate"
          ? GIZMO_LINE_WIDTH_HOVERED
          : GIZMO_LINE_WIDTH) * dpr;
      gc.stroke();
    }
    gc.restore();
    drawPivotHandle(gc, pivotScreenPos ?? center, activeOrHoveredHandle === "pivot", dpr);
    return;
  }

  if (!screenCenter || screenW === null || screenH === null || rotation === null) {
    return;
  }

  gc.save();
  gc.translate(screenCenter.x, screenCenter.y);
  gc.rotate(rotation);

  // Bounding box
  drawBoundingBox(gc, screenW, screenH, dpr);

  // Corner handles
  const cornerHandles: Array<{ pos: Point; handle: TransformHandle }> = [
    { pos: { x: -screenW / 2, y: -screenH / 2 }, handle: "top-left" },
    { pos: { x: screenW / 2, y: -screenH / 2 }, handle: "top-right" },
    { pos: { x: -screenW / 2, y: screenH / 2 }, handle: "bottom-left" },
    { pos: { x: screenW / 2, y: screenH / 2 }, handle: "bottom-right" }
  ];
  for (const { pos, handle } of cornerHandles) {
    if (visible.has(handle)) {
      drawSquareHandle(gc, pos, activeOrHoveredHandle === handle, dpr);
    }
  }

  // Edge midpoint handles
  const midHandles: Array<{ pos: Point; handle: TransformHandle }> = [
    { pos: { x: 0, y: -screenH / 2 }, handle: "top" },
    { pos: { x: 0, y: screenH / 2 }, handle: "bottom" },
    { pos: { x: -screenW / 2, y: 0 }, handle: "left" },
    { pos: { x: screenW / 2, y: 0 }, handle: "right" }
  ];
  for (const { pos, handle } of midHandles) {
    if (visible.has(handle)) {
      drawSquareHandle(gc, pos, activeOrHoveredHandle === handle, dpr);
    }
  }

  // Rotation handle
  if (visible.has("rotate")) {
    drawRotationHandle(gc, screenH, activeOrHoveredHandle === "rotate", dpr);
  }

  gc.restore();

  // Pivot crosshair — drawn in un-rotated screen space (after gc.restore)
  // so the crosshair orientation stays axis-aligned regardless of layer rotation.
  const pivotPos: Point = pivotScreenPos ?? screenCenter;
  drawPivotHandle(gc, pivotPos, activeOrHoveredHandle === "pivot", dpr);
}

// ─── Off-canvas indicator ────────────────────────────────────────────────────

/**
 * Draw a dashed rectangle indicating off-canvas layer extents.
 *
 * @param gc - Canvas context
 * @param screenRect - Screen-space rect (x, y, w, h) in gizmo canvas pixels
 * @param dpr - Device pixel ratio
 */
export function drawOffCanvasIndicator(
  gc: CanvasRenderingContext2D,
  screenRect: { x: number; y: number; w: number; h: number },
  dpr: number
): void {
  gc.save();
  gc.strokeStyle = OFF_CANVAS_INDICATOR_COLOR;
  gc.lineWidth = dpr;
  gc.setLineDash([OFF_CANVAS_DASH_ON * dpr, OFF_CANVAS_DASH_OFF * dpr]);
  gc.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
  gc.setLineDash([]);
  gc.restore();
}

// ─── Crop overlay ────────────────────────────────────────────────────────────

/**
 * Draw the crop overlay: dimmed area outside the crop rect, white border,
 * and rule-of-thirds grid.
 *
 * @param gc - Canvas context
 * @param topLeft - Top-left corner of the crop rect in screen pixels
 * @param cropW - Width of the crop rect in screen pixels
 * @param cropH - Height of the crop rect in screen pixels
 * @param canvasW - Full gizmo canvas width in pixels
 * @param canvasH - Full gizmo canvas height in pixels
 * @param dpr - Device pixel ratio
 */
export function drawCropOverlay(
  gc: CanvasRenderingContext2D,
  topLeft: Point,
  cropW: number,
  cropH: number,
  canvasW: number,
  canvasH: number,
  dpr: number
): void {
  // Dim the area outside the crop rect
  gc.fillStyle = CROP_DIM_COLOR;
  gc.fillRect(0, 0, canvasW, canvasH);
  gc.clearRect(topLeft.x, topLeft.y, cropW, cropH);

  // Crisp 1-DPR-px border
  gc.strokeStyle = CROP_BORDER_COLOR;
  gc.lineWidth = dpr;
  gc.setLineDash([]);
  gc.strokeRect(
    topLeft.x + 0.5 * dpr,
    topLeft.y + 0.5 * dpr,
    cropW - dpr,
    cropH - dpr
  );

  // Rule-of-thirds grid
  gc.strokeStyle = CROP_GRID_COLOR;
  gc.lineWidth = dpr;
  for (let i = 1; i <= 2; i++) {
    const gx = topLeft.x + (cropW * i) / 3;
    const gy = topLeft.y + (cropH * i) / 3;
    gc.beginPath();
    gc.moveTo(gx, topLeft.y);
    gc.lineTo(gx, topLeft.y + cropH);
    gc.stroke();
    gc.beginPath();
    gc.moveTo(topLeft.x, gy);
    gc.lineTo(topLeft.x + cropW, gy);
    gc.stroke();
  }
}

const CROP_RESIZE_HANDLES: ReadonlySet<TransformHandle> = new Set([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top",
  "bottom",
  "left",
  "right"
]);

/**
 * Crop overlay plus eight resize handles (corners + edge midpoints).
 * Handle positions are in gizmo pixel space (same as {@link drawCropOverlay}).
 */
export function drawCropGizmoWithHandles(
  gc: CanvasRenderingContext2D,
  topLeft: Point,
  cropW: number,
  cropH: number,
  canvasW: number,
  canvasH: number,
  dpr: number,
  activeOrHoveredHandle: TransformHandle | null
): void {
  drawCropOverlay(gc, topLeft, cropW, cropH, canvasW, canvasH, dpr);

  const hl =
    activeOrHoveredHandle &&
    CROP_RESIZE_HANDLES.has(activeOrHoveredHandle)
      ? activeOrHoveredHandle
      : null;

  const midX = topLeft.x + cropW / 2;
  const midY = topLeft.y + cropH / 2;
  const right = topLeft.x + cropW;
  const bottom = topLeft.y + cropH;

  const handles: Array<{ pos: Point; handle: TransformHandle }> = [
    { pos: { x: topLeft.x, y: topLeft.y }, handle: "top-left" },
    { pos: { x: right, y: topLeft.y }, handle: "top-right" },
    { pos: { x: topLeft.x, y: bottom }, handle: "bottom-left" },
    { pos: { x: right, y: bottom }, handle: "bottom-right" },
    { pos: { x: midX, y: topLeft.y }, handle: "top" },
    { pos: { x: midX, y: bottom }, handle: "bottom" },
    { pos: { x: topLeft.x, y: midY }, handle: "left" },
    { pos: { x: right, y: midY }, handle: "right" }
  ];

  for (const { pos, handle } of handles) {
    drawSquareHandle(gc, pos, hl === handle, dpr);
  }
}
