/**
 * gizmoPrimitives – Reusable gizmo drawing functions for canvas-based overlays.
 *
 * Provides composable paint primitives for MoveTool's off-canvas indicator and
 * CropTool's overlay + handles. The TransformTool's gizmo is React/SVG and
 * does NOT use this module — see `transform/gizmo/TransformGizmo.tsx`.
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
  GIZMO_PRIMARY_COLOR,
  HANDLE_FILL_DEFAULT,
  HANDLE_FILL_HOVERED,
  GIZMO_LINE_WIDTH,
  GIZMO_LINE_WIDTH_HOVERED,
  OFF_CANVAS_INDICATOR_COLOR,
  OFF_CANVAS_CORNER_ARM_CSS,
  CROP_DIM_COLOR,
  CROP_BORDER_COLOR,
  CROP_GRID_COLOR
} from "./gizmoConstants";

// ─── Internal: square handle (used by crop overlay) ──────────────────────────

function drawSquareHandle(
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

// ─── Off-canvas indicator ────────────────────────────────────────────────────

/**
 * Draw corner brackets for layer extents that spill outside the document
 * (MoveTool). Uses the transformed quad in screen space — solid strokes at
 * each vertex, no full bounding rectangle.
 *
 * @param screenCorners - Four corners in gizmo canvas pixels (TL, TR, BR, BL)
 * @param dpr - Device pixel ratio
 */
export function drawOffCanvasIndicator(
  gc: CanvasRenderingContext2D,
  screenCorners: [Point, Point, Point, Point],
  dpr: number
): void {
  const armBase = OFF_CANVAS_CORNER_ARM_CSS * dpr;
  gc.save();
  gc.strokeStyle = OFF_CANVAS_INDICATOR_COLOR;
  gc.lineWidth = Math.max(1, dpr);
  gc.lineCap = "square";
  gc.setLineDash([]);

  for (let i = 0; i < 4; i++) {
    const p = screenCorners[i]!;
    const prev = screenCorners[(i + 3) % 4]!;
    const next = screenCorners[(i + 1) % 4]!;
    const e1x = p.x - prev.x;
    const e1y = p.y - prev.y;
    const e2x = next.x - p.x;
    const e2y = next.y - p.y;
    const len1 = Math.hypot(e1x, e1y);
    const len2 = Math.hypot(e2x, e2y);
    if (len1 < 1e-6 || len2 < 1e-6) {
      continue;
    }
    const L = Math.min(armBase, len1 * 0.49, len2 * 0.49);
    if (L < 1e-6) {
      continue;
    }
    const ux = e2x / len2;
    const uy = e2y / len2;
    const vx = -e1x / len1;
    const vy = -e1y / len1;
    gc.beginPath();
    gc.moveTo(p.x, p.y);
    gc.lineTo(p.x + ux * L, p.y + uy * L);
    gc.moveTo(p.x, p.y);
    gc.lineTo(p.x + vx * L, p.y + vy * L);
    gc.stroke();
  }

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
