/**
 * TransformTool – scale, rotate, translate the active layer with live preview.
 *
 * Handle layout:
 *   - 4 corner handles: proportional scale (drag to resize)
 *   - 4 edge midpoint handles: axis-constrained scale
 *   - rotation handle: above top-center, drag to rotate
 *   - center area: drag to translate
 *
 * The transform is "live" – it updates the LayerTransform in the store as
 * the user drags. Commit (Enter / button) or cancel (Escape / button) from
 * the top bar.
 *
 * Modifiers:
 *   - Shift: constrain proportions (scale) or snap angle (rotate)
 *   - Alt: scale from center (keep center fixed)
 *
 * The gizmo is drawn on a dedicated screen-resolution canvas (`gizmoCanvasRef`)
 * so it is not clipped by the document-stack overflow and appears crisp at any zoom.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, LayerTransform, LayerContentBounds } from "../types";
import { layerAllowsTransformWhilePixelLocked } from "../types";

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

/** Screen-space radius for handle hit testing (CSS px). */
const HANDLE_RADIUS = 8;
/** Distance (in CSS px) of the rotation handle above the top edge. */
const ROTATION_HANDLE_OFFSET = 24;
/** Screen-space size of a handle square (CSS px). */
const HANDLE_SIZE = 8;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function layerDocBounds(
  contentBounds: LayerContentBounds,
  transform: LayerTransform
): Box {
  const tx = transform.x ?? 0;
  const ty = transform.y ?? 0;
  return {
    x: contentBounds.x + tx,
    y: contentBounds.y + ty,
    width: contentBounds.width,
    height: contentBounds.height
  };
}

/** Rotate a point around a center. */
function rotatePoint(px: number, py: number, cx: number, cy: number, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Snap angle to nearest 15° increment. */
function snapAngle(angle: number): number {
  const step = Math.PI / 12; // 15°
  return Math.round(angle / step) * step;
}

/** Distance between two points. */
function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** CSS cursor for a given handle (accounting for rotation). */
function cursorForHandle(handle: TransformHandle | null, rotation: number): string {
  if (!handle) {
    return "default";
  }
  if (handle === "move") {
    return "move";
  }
  if (handle === "rotate") {
    return "grab";
  }
  // For scale handles, pick a directional resize cursor rotated by the layer rotation
  const baseDeg: Partial<Record<TransformHandle, number>> = {
    "top": 0,
    "top-right": 45,
    "right": 90,
    "bottom-right": 135,
    "bottom": 180,
    "bottom-left": 225,
    "left": 270,
    "top-left": 315
  };
  const base = baseDeg[handle] ?? 0;
  // Normalize the total angle into a cursor bucket (8 directions, 45° each)
  const totalDeg = ((base + (rotation * 180) / Math.PI) % 360 + 360) % 360;
  const bucket = Math.round(totalDeg / 45) % 4;
  const cursors = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];
  return cursors[bucket];
}

/**
 * Anchor direction for each scale handle: the opposite edge stays fixed
 * while the dragged edge moves. { dx, dy } point from center toward the anchor.
 */
const HANDLE_ANCHOR: Partial<Record<TransformHandle, { dx: number; dy: number }>> = {
  "top-left":     { dx:  1, dy:  1 },
  "top-right":    { dx: -1, dy:  1 },
  "bottom-left":  { dx:  1, dy: -1 },
  "bottom-right": { dx: -1, dy: -1 },
  "left":         { dx:  1, dy:  0 },
  "right":        { dx: -1, dy:  0 },
  "top":          { dx:  0, dy:  1 },
  "bottom":       { dx:  0, dy: -1 }
};

// ─── TransformTool class ──────────────────────────────────────────────────────

export class TransformTool implements ToolHandler {
  readonly toolId = "transform" as const;

  /** Transform when the tool was activated (used by cancel). */
  private originalTransform: LayerTransform = { x: 0, y: 0 };
  /** Bounding box when the tool was activated. */
  private originalBounds: Box = { x: 0, y: 0, width: 0, height: 0 };
  /** Transform at the start of the current drag. */
  private dragStartTransform: LayerTransform = { x: 0, y: 0 };
  /** Which handle is being dragged. */
  private activeHandle: TransformHandle | null = null;
  /** Pointer position at drag start (canvas space). */
  private dragStart: Point | null = null;
  /** Center of the layer content (document space) – computed at drag start. */
  private center: Point = { x: 0, y: 0 };
  /** Whether a transform gesture has been started. */
  private gestureActive = false;
  /** Currently hovered handle (for cursor feedback). */
  private hoveredHandle: TransformHandle | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onActivate(ctx: ToolContext): void {
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }
    this.originalTransform = {
      x: layer.transform.x,
      y: layer.transform.y,
      scaleX: layer.transform.scaleX ?? 1,
      scaleY: layer.transform.scaleY ?? 1,
      rotation: layer.transform.rotation ?? 0
    };
    this.originalBounds = layerDocBounds(layer.contentBounds, { x: 0, y: 0 });
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.drawGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.clearGizmo(ctx);
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer) {
      return false;
    }
    if (layer.locked && !layerAllowsTransformWhilePixelLocked(layer)) {
      return false;
    }

    const pt = event.point;
    const handle = this.hitTestHandle(layer, pt, ctx.zoom);
    if (!handle) {
      return false;
    }

    this.activeHandle = handle;
    this.dragStart = pt;
    this.dragStartTransform = { ...layer.transform };
    this.center = this.computeCenter(layer);
    this.gestureActive = true;
    ctx.onStrokeStart();
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.dragStart || !this.activeHandle) {
      return;
    }
    const pt = event.point;
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer || !ctx.onLayerTransformChange) {
      return;
    }

    const shift = ctx.shiftHeldRef.current;
    const alt = ctx.altHeldRef.current;
    const newTransform = this.computeTransform(pt, shift, alt);
    ctx.onLayerTransformChange(layer.id, newTransform);

    // Redraw gizmo to reflect new handles
    this.drawGizmo(ctx);
  }

  onUp(ctx: ToolContext): void {
    this.activeHandle = null;
    this.dragStart = null;

    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (layer) {
      ctx.onStrokeEnd(layer.id, null, undefined, {
        syncDocumentFromCanvas: false
      });
    }
    this.drawGizmo(ctx);
  }

  // ── Public API (for settings panel commit/cancel/reset) ────────────────────

  /** Get the original transform captured when the tool was activated. */
  getOriginalTransform(): LayerTransform {
    return { ...this.originalTransform };
  }

  /** Refresh the gizmo (e.g. after external transform change). */
  refreshOverlay(ctx: ToolContext): void {
    this.drawGizmo(ctx);
  }

  /**
   * Hit-test handles for cursor feedback during hover (called from pointer handler).
   * Returns the CSS cursor string, or null if no handle is under the pointer.
   */
  getHoverCursor(ctx: ToolContext, docPoint: Point): string | null {
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return null;
    }
    const handle = this.hitTestHandle(layer, docPoint, ctx.zoom);
    this.hoveredHandle = handle;
    const rot = layer.transform.rotation ?? 0;
    return handle ? cursorForHandle(handle, rot) : null;
  }

  // ── Handle hit testing ─────────────────────────────────────────────────────

  private hitTestHandle(
    layer: { transform: LayerTransform; contentBounds: LayerContentBounds },
    canvasPt: Point,
    zoom: number
  ): TransformHandle | null {
    const bounds = layerDocBounds(layer.contentBounds, layer.transform);
    const sx = layer.transform.scaleX ?? 1;
    const sy = layer.transform.scaleY ?? 1;
    const rot = layer.transform.rotation ?? 0;
    const cx = bounds.x + (bounds.width * sx) / 2;
    const cy = bounds.y + (bounds.height * sy) / 2;

    const threshold = HANDLE_RADIUS / zoom;

    // Build handle positions in document space (pre-rotation around center)
    const w = bounds.width * sx;
    const h = bounds.height * sy;
    const left = cx - w / 2;
    const right = cx + w / 2;
    const top = cy - h / 2;
    const bottom = cy + h / 2;

    const handles: Array<{ pos: Point; handle: TransformHandle }> = [
      // Rotation handle above top-center
      { pos: rotatePoint(cx, top - ROTATION_HANDLE_OFFSET / zoom, cx, cy, rot), handle: "rotate" },
      // Corners
      { pos: rotatePoint(left, top, cx, cy, rot), handle: "top-left" },
      { pos: rotatePoint(right, top, cx, cy, rot), handle: "top-right" },
      { pos: rotatePoint(left, bottom, cx, cy, rot), handle: "bottom-left" },
      { pos: rotatePoint(right, bottom, cx, cy, rot), handle: "bottom-right" },
      // Edge midpoints
      { pos: rotatePoint(cx, top, cx, cy, rot), handle: "top" },
      { pos: rotatePoint(cx, bottom, cx, cy, rot), handle: "bottom" },
      { pos: rotatePoint(left, cy, cx, cy, rot), handle: "left" },
      { pos: rotatePoint(right, cy, cx, cy, rot), handle: "right" }
    ];

    for (const { pos, handle } of handles) {
      if (dist(canvasPt, pos) <= threshold) {
        return handle;
      }
    }

    // Check if inside the bounding box (for move)
    // Transform the click point into un-rotated space
    const unrotated = rotatePoint(canvasPt.x, canvasPt.y, cx, cy, -rot);
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

  private computeCenter(layer: {
    transform: LayerTransform;
    contentBounds: LayerContentBounds;
  }): Point {
    const bounds = layerDocBounds(layer.contentBounds, layer.transform);
    const sx = layer.transform.scaleX ?? 1;
    const sy = layer.transform.scaleY ?? 1;
    return {
      x: bounds.x + (bounds.width * sx) / 2,
      y: bounds.y + (bounds.height * sy) / 2
    };
  }

  // ── Transform computation ──────────────────────────────────────────────────

  private computeTransform(cursor: Point, shift: boolean, alt: boolean): LayerTransform {
    const ds = this.dragStartTransform;
    const start = this.dragStart!;
    const handle = this.activeHandle!;
    const sx = ds.scaleX ?? 1;
    const sy = ds.scaleY ?? 1;
    const rot = ds.rotation ?? 0;

    if (handle === "move") {
      const dx = cursor.x - start.x;
      const dy = cursor.y - start.y;
      return {
        ...ds,
        x: Math.round(ds.x + dx),
        y: Math.round(ds.y + dy)
      };
    }

    if (handle === "rotate") {
      const angleStart = Math.atan2(start.y - this.center.y, start.x - this.center.x);
      const angleCursor = Math.atan2(cursor.y - this.center.y, cursor.x - this.center.x);
      let newRot = rot + (angleCursor - angleStart);
      if (shift) {
        newRot = snapAngle(newRot);
      }
      return { ...ds, rotation: newRot };
    }

    // Scale handles
    const bounds = this.originalBounds;
    const centerX = this.center.x;
    const centerY = this.center.y;

    // Un-rotate both start and cursor around the center
    const uStart = rotatePoint(start.x, start.y, centerX, centerY, -rot);
    const uCursor = rotatePoint(cursor.x, cursor.y, centerX, centerY, -rot);

    let newSx = sx;
    let newSy = sy;

    const halfW = (bounds.width * sx) / 2;
    const halfH = (bounds.height * sy) / 2;

    // Corner handles: proportional scale
    if (
      handle === "top-left" ||
      handle === "top-right" ||
      handle === "bottom-left" ||
      handle === "bottom-right"
    ) {
      const distStart = Math.hypot(uStart.x - centerX, uStart.y - centerY);
      const distCursor = Math.hypot(uCursor.x - centerX, uCursor.y - centerY);
      if (distStart > 1) {
        const ratio = distCursor / distStart;
        if (shift) {
          // Proportional
          newSx = sx * ratio;
          newSy = sy * ratio;
        } else {
          // Independent X/Y based on direction
          const dxStart = Math.abs(uStart.x - centerX);
          const dyStart = Math.abs(uStart.y - centerY);
          const dxCursor = Math.abs(uCursor.x - centerX);
          const dyCursor = Math.abs(uCursor.y - centerY);
          newSx = dxStart > 1 ? sx * (dxCursor / dxStart) : sx;
          newSy = dyStart > 1 ? sy * (dyCursor / dyStart) : sy;
        }
      }
    }

    // Edge midpoint handles: axis-constrained
    if (handle === "left" || handle === "right") {
      if (halfW > 1) {
        const dxCursor = Math.abs(uCursor.x - centerX);
        newSx = (dxCursor / halfW) * sx;
        if (shift) {
          newSy = newSx;
        }
      }
    }
    if (handle === "top" || handle === "bottom") {
      if (halfH > 1) {
        const dyCursor = Math.abs(uCursor.y - centerY);
        newSy = (dyCursor / halfH) * sy;
        if (shift) {
          newSx = newSy;
        }
      }
    }

    // Clamp scale to prevent zero/negative
    newSx = Math.max(0.01, newSx);
    newSy = Math.max(0.01, newSy);

    // ALT modifier: scale from center (default behavior).
    // Without ALT, anchor the opposite edge so it stays fixed.
    const anchor = HANDLE_ANCHOR[handle];
    if (!alt && anchor) {
      const result = { ...ds, scaleX: newSx, scaleY: newSy };
      // Compute the translation offset to keep the opposite edge fixed
      const dScaleX = newSx - sx;
      const dScaleY = newSy - sy;

      // Offset = half the size change, in the anchor direction, rotated by layer rotation
      const offsetX = (anchor.dx * dScaleX * bounds.width) / 2;
      const offsetY = (anchor.dy * dScaleY * bounds.height) / 2;

      // Rotate the offset by the current rotation
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      result.x = Math.round(ds.x + offsetX * cos - offsetY * sin);
      result.y = Math.round(ds.y + offsetX * sin + offsetY * cos);

      return result;
    }

    return { ...ds, scaleX: newSx, scaleY: newSy };
  }

  // ── Gizmo drawing (screen-resolution canvas) ──────────────────────────────

  private clearGizmo(ctx: ToolContext): void {
    const gizmo = ctx.gizmoCanvasRef.current;
    if (!gizmo) {
      return;
    }
    const gc = gizmo.getContext("2d");
    if (gc) {
      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.clearRect(0, 0, gizmo.width, gizmo.height);
    }
  }

  /**
   * Convert a document-space point to screen-space (gizmo canvas pixel coordinates).
   * The gizmo canvas is backed at dpr × CSS-size to stay crisp.
   */
  private docToScreen(
    docX: number,
    docY: number,
    ctx: ToolContext,
    containerW: number,
    containerH: number,
    dpr: number
  ): Point {
    const docW = ctx.doc.canvas.width;
    const docH = ctx.doc.canvas.height;
    return {
      x: ((docX - docW / 2) * ctx.zoom + containerW / 2 + ctx.pan.x) * dpr,
      y: ((docY - docH / 2) * ctx.zoom + containerH / 2 + ctx.pan.y) * dpr
    };
  }

  private drawGizmo(ctx: ToolContext): void {
    const gizmo = ctx.gizmoCanvasRef.current;
    const container = ctx.containerRef.current;
    if (!gizmo || !container) {
      // Fall back to old overlay approach if gizmo canvas unavailable
      this.drawOverlayFallback(ctx);
      return;
    }
    const gc = gizmo.getContext("2d");
    if (!gc) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.clearRect(0, 0, gizmo.width, gizmo.height);

    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }

    const bounds = layerDocBounds(layer.contentBounds, layer.transform);
    const sx = layer.transform.scaleX ?? 1;
    const sy = layer.transform.scaleY ?? 1;
    const rot = layer.transform.rotation ?? 0;

    const w = bounds.width * sx;
    const h = bounds.height * sy;
    const docCx = bounds.x + w / 2;
    const docCy = bounds.y + h / 2;

    // Convert center to screen space
    const screenCenter = this.docToScreen(docCx, docCy, ctx, containerW, containerH, dpr);

    gc.save();
    gc.translate(screenCenter.x, screenCenter.y);
    gc.rotate(rot);

    const screenW = w * ctx.zoom * dpr;
    const screenH = h * ctx.zoom * dpr;

    // Bounding box
    gc.strokeStyle = "rgba(0, 120, 255, 0.8)";
    gc.lineWidth = 1 * dpr;
    gc.setLineDash([4 * dpr, 4 * dpr]);
    gc.strokeRect(-screenW / 2, -screenH / 2, screenW, screenH);
    gc.setLineDash([]);

    // Handle size in screen pixels
    const hs = HANDLE_SIZE * dpr;
    const hoveredHandle = this.activeHandle ?? this.hoveredHandle;

    // Corner handles (filled squares)
    const cornerHandles: Array<{ pos: Point; handle: TransformHandle }> = [
      { pos: { x: -screenW / 2, y: -screenH / 2 }, handle: "top-left" },
      { pos: { x: screenW / 2, y: -screenH / 2 }, handle: "top-right" },
      { pos: { x: -screenW / 2, y: screenH / 2 }, handle: "bottom-left" },
      { pos: { x: screenW / 2, y: screenH / 2 }, handle: "bottom-right" }
    ];
    for (const { pos, handle } of cornerHandles) {
      const isHovered = hoveredHandle === handle;
      gc.fillStyle = isHovered ? "rgba(0, 120, 255, 0.15)" : "#ffffff";
      gc.strokeStyle = "rgba(0, 120, 255, 1)";
      gc.lineWidth = (isHovered ? 2 : 1) * dpr;
      gc.fillRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
      gc.strokeRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
    }

    // Edge midpoint handles (filled squares)
    const midHandles: Array<{ pos: Point; handle: TransformHandle }> = [
      { pos: { x: 0, y: -screenH / 2 }, handle: "top" },
      { pos: { x: 0, y: screenH / 2 }, handle: "bottom" },
      { pos: { x: -screenW / 2, y: 0 }, handle: "left" },
      { pos: { x: screenW / 2, y: 0 }, handle: "right" }
    ];
    for (const { pos, handle } of midHandles) {
      const isHovered = hoveredHandle === handle;
      gc.fillStyle = isHovered ? "rgba(0, 120, 255, 0.15)" : "#ffffff";
      gc.strokeStyle = "rgba(0, 120, 255, 1)";
      gc.lineWidth = (isHovered ? 2 : 1) * dpr;
      gc.fillRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
      gc.strokeRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
    }

    // Rotation handle: circle above top-center with connecting line
    const rotYOffset = ROTATION_HANDLE_OFFSET * dpr;
    const rotY = -screenH / 2 - rotYOffset;
    gc.beginPath();
    gc.moveTo(0, -screenH / 2);
    gc.lineTo(0, rotY);
    gc.strokeStyle = "rgba(0, 120, 255, 0.6)";
    gc.lineWidth = 1 * dpr;
    gc.stroke();

    const isRotHovered = hoveredHandle === "rotate";
    gc.beginPath();
    gc.arc(0, rotY, hs * 0.7, 0, Math.PI * 2);
    gc.fillStyle = isRotHovered ? "rgba(0, 120, 255, 0.15)" : "#ffffff";
    gc.fill();
    gc.strokeStyle = "rgba(0, 120, 255, 1)";
    gc.lineWidth = (isRotHovered ? 2 : 1) * dpr;
    gc.stroke();

    gc.restore();
  }

  /** Fallback: draw gizmo on the document-space overlay canvas (clipped, lower resolution). */
  private drawOverlayFallback(ctx: ToolContext): void {
    const overlay = ctx.overlayCanvasRef.current;
    if (!overlay) {
      return;
    }
    const oc = overlay.getContext("2d");
    if (!oc) {
      return;
    }

    oc.clearRect(0, 0, overlay.width, overlay.height);

    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }

    const bounds = layerDocBounds(layer.contentBounds, layer.transform);
    const sx = layer.transform.scaleX ?? 1;
    const sy = layer.transform.scaleY ?? 1;
    const rot = layer.transform.rotation ?? 0;

    const w = bounds.width * sx;
    const h = bounds.height * sy;
    const cx = bounds.x + w / 2;
    const cy = bounds.y + h / 2;

    oc.save();
    oc.translate(cx, cy);
    oc.rotate(rot);

    // Bounding box
    oc.strokeStyle = "rgba(0, 120, 255, 0.8)";
    oc.lineWidth = 1 / ctx.zoom;
    oc.setLineDash([4 / ctx.zoom, 4 / ctx.zoom]);
    oc.strokeRect(-w / 2, -h / 2, w, h);
    oc.setLineDash([]);

    // Handle size
    const hs = 6 / ctx.zoom;

    // Corner handles (filled squares)
    const corners: Point[] = [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: -w / 2, y: h / 2 },
      { x: w / 2, y: h / 2 }
    ];
    oc.fillStyle = "#ffffff";
    oc.strokeStyle = "rgba(0, 120, 255, 1)";
    oc.lineWidth = 1 / ctx.zoom;
    for (const c of corners) {
      oc.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
      oc.strokeRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
    }

    // Edge midpoint handles (filled squares)
    const mids: Point[] = [
      { x: 0, y: -h / 2 },
      { x: 0, y: h / 2 },
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 }
    ];
    for (const m of mids) {
      oc.fillRect(m.x - hs / 2, m.y - hs / 2, hs, hs);
      oc.strokeRect(m.x - hs / 2, m.y - hs / 2, hs, hs);
    }

    // Rotation handle: circle above top-center with connecting line
    const rotY = -h / 2 - ROTATION_HANDLE_OFFSET / ctx.zoom;
    oc.beginPath();
    oc.moveTo(0, -h / 2);
    oc.lineTo(0, rotY);
    oc.strokeStyle = "rgba(0, 120, 255, 0.6)";
    oc.lineWidth = 1 / ctx.zoom;
    oc.stroke();

    oc.beginPath();
    oc.arc(0, rotY, hs * 0.7, 0, Math.PI * 2);
    oc.fillStyle = "#ffffff";
    oc.fill();
    oc.strokeStyle = "rgba(0, 120, 255, 1)";
    oc.stroke();

    oc.restore();
  }
}
