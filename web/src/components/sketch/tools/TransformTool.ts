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
 *
 * Geometry policy is delegated to `tools/transform/` helpers and
 * `painting/resolvedLayerGeometry` so this file owns only interaction
 * orchestration.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, LayerTransform, LayerContentBounds } from "../types";
import { layerAllowsTransformWhilePixelLocked } from "../types";
import TransformIcon from "@mui/icons-material/Transform";
import {
  getEffectiveRasterBounds,
  getTransformedCenter
} from "../painting/resolvedLayerGeometry";
import {
  type TransformHandle,
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  hitTestHandles,
  buildHandlePositions,
  docToScreen,
  scaledHalfExtents,
  computeTransformForHandle
} from "./transform";
import { cursorForHandle } from "./transform/cursorMapping";

// ─── TransformTool class ──────────────────────────────────────────────────────

export { type TransformHandle } from "./transform/handleGeometry";

export class TransformTool implements ToolHandler {
  readonly toolId = "transform" as const;

  /** Transform when the tool was activated (used by cancel). */
  private originalTransform: LayerTransform = { x: 0, y: 0 };
  /** Raster bounds when the tool was activated (for scale computation). */
  private rasterBounds: LayerContentBounds = { x: 0, y: 0, width: 0, height: 0 };
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
  /**
   * Latest transform applied during a drag gesture. Used by gizmo drawing
   * so the gizmo matches the composited preview instead of lagging behind
   * the store. Cleared on up / deactivate.
   */
  private liveTransform: LayerTransform | null = null;

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
    // Use resolved raster bounds (shared seam) instead of bare contentBounds
    const layerCanvas = ctx.layerCanvasesRef.current.get(layer.id);
    const rasterBounds = getEffectiveRasterBounds(
      layer,
      layerCanvas,
      ctx.doc.canvas
    );
    // For gizmo sizing, prefer contentBounds when they represent a smaller
    // area than the full raster. This ensures small layers get a gizmo that
    // wraps their actual content instead of spanning the full canvas.
    const cb = layer.contentBounds;
    if (
      cb.width > 0 &&
      cb.height > 0 &&
      (cb.width < rasterBounds.width || cb.height < rasterBounds.height)
    ) {
      this.rasterBounds = { ...cb };
    } else {
      this.rasterBounds = rasterBounds;
    }
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.liveTransform = null;
    this.drawGizmo(ctx);
  }

  onDeactivate(ctx: ToolContext): void {
    this.activeHandle = null;
    this.hoveredHandle = null;
    this.gestureActive = false;
    this.liveTransform = null;
    ctx.clearGizmo();
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
    const currentTransform = this.liveTransform ?? layer.transform;
    const handle = hitTestHandles(
      currentTransform,
      this.rasterBounds,
      pt,
      ctx.zoom
    );
    if (!handle) {
      return false;
    }

    this.activeHandle = handle;
    this.dragStart = pt;
    this.dragStartTransform = { ...currentTransform };
    this.center = getTransformedCenter(currentTransform, this.rasterBounds);
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
    const newTransform = computeTransformForHandle(
      this.activeHandle,
      this.dragStartTransform,
      this.dragStart,
      pt,
      this.center,
      this.rasterBounds,
      shift,
      alt
    );
    // Store the live transform so the gizmo matches the composited preview.
    this.liveTransform = newTransform;
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
    const transform = this.liveTransform ?? layer.transform;
    const handle = hitTestHandles(
      transform,
      this.rasterBounds,
      docPoint,
      ctx.zoom
    );
    this.hoveredHandle = handle;
    const rot = transform.rotation ?? 0;
    return handle ? cursorForHandle(handle, rot) : null;
  }

  /**
   * Update cursor based on which handle is under the pointer during hover.
   * Encapsulates transform-specific hover policy so usePointerHandlers can
   * dispatch generically via `handler.onHoverMove`.
   */
  onHoverMove(ctx: ToolContext, event: ToolPointerEvent): void {
    const cursor = this.getHoverCursor(ctx, event.point);
    const el = ctx.containerRef.current;
    if (el) {
      el.style.cursor = cursor ?? "default";
    }
  }

  // ── Gizmo drawing (screen-resolution canvas) ──────────────────────────────

  private drawGizmo(ctx: ToolContext): void {
    ctx.drawGizmo((gc, dpr, containerW, containerH) => {
      this.paintGizmo(gc, dpr, containerW, containerH, ctx);
    });
  }

  /**
   * Internal gizmo paint routine. Uses shared resolved-geometry helpers
   * for handle positions and bounds so gizmo aligns with the rendered
   * transformed layer.
   */
  private paintGizmo(
    gc: CanvasRenderingContext2D,
    dpr: number,
    containerW: number,
    containerH: number,
    ctx: ToolContext
  ): void {
    const layer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (!layer) {
      return;
    }

    // Use the live preview transform during drag so the gizmo matches
    // the composited preview. Fall back to the stored transform otherwise.
    const transform = this.liveTransform ?? layer.transform;
    const rot = transform.rotation ?? 0;

    // Use shared geometry seam for center and extents
    const center = getTransformedCenter(transform, this.rasterBounds);
    const { hw, hh } = scaledHalfExtents(this.rasterBounds, transform);

    // Convert center to screen space
    const screenCenter = docToScreen(
      center.x,
      center.y,
      ctx.doc.canvas.width,
      ctx.doc.canvas.height,
      ctx.zoom,
      ctx.pan,
      containerW,
      containerH,
      dpr
    );

    gc.save();
    gc.translate(screenCenter.x, screenCenter.y);
    gc.rotate(rot);

    const screenW = hw * 2 * ctx.zoom * dpr;
    const screenH = hh * 2 * ctx.zoom * dpr;

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
}

export const definition: ToolDefinition = {
  tool: "transform",
  label: "Transform",
  shortcut: "F",
  Icon: TransformIcon,
  group: "painting"
};
