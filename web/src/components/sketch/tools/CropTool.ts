/**
 * CropTool — drag a marquee, adjust edges/corners like the transform gizmo,
 * then apply via Enter or the Apply button (canvas crop runs only on commit).
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point } from "../types";
import CropIcon from "@mui/icons-material/Crop";
import { canvasDocPointToGizmoDevicePixels } from "./transform/handleGeometry";
import type { TransformHandle } from "./transform/handleGeometry";
import {
  clampCropRectToCanvas,
  hitTestCropHandles,
  resizeCropRectFromDrag,
  type CropRectDoc
} from "./transform/cropGeometry";
import { drawCropOverlay, drawCropGizmoWithHandles } from "./gizmo";
import { cursorForHandle } from "./transform/cursorMapping";
import { applyCursorFeedback } from "./transform/transformHoverPolicy";
import { useSketchStore } from "../state/useSketchStore";

export class CropTool implements ToolHandler {
  readonly toolId = "crop" as const;

  private marqueeStart: Point | null = null;
  private marqueeEnd: Point | null = null;

  /** Committed marquee — editable until Apply / Enter. */
  private pendingRect: CropRectDoc | null = null;

  private adjustHandle: TransformHandle | null = null;
  private adjustStartRect: CropRectDoc | null = null;
  private adjustStartPoint: Point | null = null;

  private hoveredHandle: TransformHandle | null = null;

  private publishPreview(bounds: CropRectDoc | null): void {
    useSketchStore.getState().setCropPreviewBounds(bounds);
  }

  private resetSession(ctx: ToolContext): void {
    this.marqueeStart = null;
    this.marqueeEnd = null;
    this.pendingRect = null;
    this.adjustHandle = null;
    this.adjustStartRect = null;
    this.adjustStartPoint = null;
    this.hoveredHandle = null;
    this.publishPreview(null);
    ctx.clearGizmo();
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
  }

  /** Discard preview without cropping (Esc, Cancel, tool switch). */
  discardPreview(ctx: ToolContext): void {
    this.resetSession(ctx);
    applyCursorFeedback(ctx, "crosshair");
  }

  /** Apply the pending crop if valid (Enter / Apply button). */
  commitPending(ctx: ToolContext): void {
    if (!ctx.onCropComplete) {
      return;
    }

    // Finalize an in-progress marquee so Enter works before pointer up (and if
    // pointer-up was missed, e.g. capture lost).
    if (this.marqueeStart && !this.adjustHandle) {
      const end = this.marqueeEnd ?? this.marqueeStart;
      const rect = this.marqueeToPendingRect(ctx, this.marqueeStart, end);
      this.marqueeStart = null;
      this.marqueeEnd = null;
      if (!rect) {
        ctx.clearGizmo();
        ctx.drawSelectionOverlay();
        this.publishPreview(null);
        return;
      }
      this.pendingRect = rect;
      this.publishPreview(rect);
    }

    // Handle geometry is already applied to pendingRect during onMove.
    if (this.adjustHandle) {
      this.adjustHandle = null;
      this.adjustStartRect = null;
      this.adjustStartPoint = null;
    }

    if (!this.pendingRect) {
      return;
    }

    const { x, y, width, height } = this.pendingRect;
    if (width <= 1 || height <= 1) {
      return;
    }
    ctx.onCropComplete(x, y, width, height);
    this.resetSession(ctx);
    applyCursorFeedback(ctx, "crosshair");
  }

  onDown(_ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const pt = event.point;

    if (this.pendingRect) {
      const hit = hitTestCropHandles(this.pendingRect, pt, _ctx.zoom);
      if (hit) {
        this.adjustHandle = hit;
        this.adjustStartRect = { ...this.pendingRect };
        this.adjustStartPoint = { ...pt };
        return true;
      }
      this.pendingRect = null;
      this.publishPreview(null);
      _ctx.clearGizmo();
      _ctx.drawSelectionOverlay();
    }

    this.marqueeStart = { ...pt };
    this.marqueeEnd = { ...pt };
    return true;
  }

  onMove(
    ctx: ToolContext,
    event: ToolPointerEvent,
    _coalescedPoints: ToolPointerEvent[]
  ): void {
    if (this.marqueeStart && !this.adjustHandle) {
      this.marqueeEnd = event.point;
      this.paintCropGizmoMarquee(ctx, this.marqueeStart, event.point);
      return;
    }
    if (
      this.adjustHandle &&
      this.adjustStartRect &&
      this.adjustStartPoint
    ) {
      const dx = event.point.x - this.adjustStartPoint.x;
      const dy = event.point.y - this.adjustStartPoint.y;
      const cw = ctx.doc.canvas.width;
      const ch = ctx.doc.canvas.height;
      this.pendingRect = resizeCropRectFromDrag(
        this.adjustStartRect,
        this.adjustHandle,
        dx,
        dy,
        cw,
        ch
      );
      this.publishPreview(this.pendingRect);
      this.paintPendingCropGizmo(ctx);
    }
  }

  onUp(ctx: ToolContext, event: ToolPointerEvent): void {
    if (this.marqueeStart && !this.adjustHandle) {
      const end = event?.point ?? this.marqueeEnd ?? this.marqueeStart;
      const rect = this.marqueeToPendingRect(ctx, this.marqueeStart, end);
      this.marqueeStart = null;
      this.marqueeEnd = null;
      if (rect) {
        this.pendingRect = rect;
        this.publishPreview(rect);
        this.paintPendingCropGizmo(ctx);
      } else {
        ctx.clearGizmo();
        ctx.drawSelectionOverlay();
      }
      return;
    }

    if (this.adjustHandle) {
      this.adjustHandle = null;
      this.adjustStartRect = null;
      this.adjustStartPoint = null;
      this.paintPendingCropGizmo(ctx);
    }
  }

  onHoverMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (this.marqueeStart || this.adjustHandle) {
      return;
    }
    if (this.pendingRect) {
      const hit = hitTestCropHandles(this.pendingRect, event.point, ctx.zoom);
      this.hoveredHandle = hit;
      const cursor = hit === null ? "crosshair" : cursorForHandle(hit, 0);
      applyCursorFeedback(ctx, cursor);
      this.paintPendingCropGizmo(ctx);
      return;
    }
    this.hoveredHandle = null;
    applyCursorFeedback(ctx, "crosshair");
  }

  onCancel(ctx: ToolContext): void {
    if (
      this.marqueeStart ||
      this.pendingRect ||
      this.adjustHandle
    ) {
      this.discardPreview(ctx);
    }
  }

  onDeactivate(ctx: ToolContext): void {
    this.discardPreview(ctx);
  }

  onViewportChange(ctx: ToolContext): void {
    if (this.marqueeStart && this.marqueeEnd) {
      this.paintCropGizmoMarquee(ctx, this.marqueeStart, this.marqueeEnd);
    } else if (this.pendingRect) {
      this.paintPendingCropGizmo(ctx);
    }
  }

  private marqueeToPendingRect(
    ctx: ToolContext,
    start: Point,
    end: Point
  ): CropRectDoc | null {
    const cw = ctx.doc.canvas.width;
    const ch = ctx.doc.canvas.height;
    const x1 = Math.round(Math.min(start.x, end.x));
    const y1 = Math.round(Math.min(start.y, end.y));
    const x2 = Math.round(Math.max(start.x, end.x));
    const y2 = Math.round(Math.max(start.y, end.y));
    const w = x2 - x1;
    const h = y2 - y1;
    if (w <= 1 || h <= 1) {
      return null;
    }
    return clampCropRectToCanvas(x1, y1, w, h, cw, ch);
  }

  private paintCropGizmoMarquee(
    ctx: ToolContext,
    start: Point,
    end: Point
  ): void {
    const containerEl = ctx.containerRef.current;
    if (!containerEl) {
      return;
    }

    const docW = ctx.doc.canvas.width;
    const docH = ctx.doc.canvas.height;
    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const x2 = Math.max(start.x, end.x);
    const y2 = Math.max(start.y, end.y);

    ctx.drawGizmo((gc, dpr, containerW, containerH) => {
      const containerRect = containerEl.getBoundingClientRect();
      const displayEl = ctx.displayCanvasRef.current;

      const tl = canvasDocPointToGizmoDevicePixels(
        x1,
        y1,
        docW,
        docH,
        ctx.zoom,
        ctx.pan,
        displayEl,
        containerRect,
        dpr
      );
      const br = canvasDocPointToGizmoDevicePixels(
        x2,
        y2,
        docW,
        docH,
        ctx.zoom,
        ctx.pan,
        displayEl,
        containerRect,
        dpr
      );

      const minX = Math.min(tl.x, br.x);
      const minY = Math.min(tl.y, br.y);
      const sw = Math.max(Math.abs(br.x - tl.x), dpr);
      const sh = Math.max(Math.abs(br.y - tl.y), dpr);

      drawCropOverlay(
        gc,
        { x: minX, y: minY },
        sw,
        sh,
        containerW * dpr,
        containerH * dpr,
        dpr
      );
    });
  }

  private paintPendingCropGizmo(ctx: ToolContext): void {
    if (!this.pendingRect) {
      return;
    }
    const containerEl = ctx.containerRef.current;
    if (!containerEl) {
      return;
    }

    const r = this.pendingRect;
    const docW = ctx.doc.canvas.width;
    const docH = ctx.doc.canvas.height;
    const hoverOrActive =
      this.adjustHandle ?? this.hoveredHandle;

    ctx.drawGizmo((gc, dpr, containerW, containerH) => {
      const containerRect = containerEl.getBoundingClientRect();
      const displayEl = ctx.displayCanvasRef.current;

      const tl = canvasDocPointToGizmoDevicePixels(
        r.x,
        r.y,
        docW,
        docH,
        ctx.zoom,
        ctx.pan,
        displayEl,
        containerRect,
        dpr
      );
      const br = canvasDocPointToGizmoDevicePixels(
        r.x + r.width,
        r.y + r.height,
        docW,
        docH,
        ctx.zoom,
        ctx.pan,
        displayEl,
        containerRect,
        dpr
      );

      const minX = Math.min(tl.x, br.x);
      const minY = Math.min(tl.y, br.y);
      const sw = Math.max(Math.abs(br.x - tl.x), dpr * 2);
      const sh = Math.max(Math.abs(br.y - tl.y), dpr * 2);

      drawCropGizmoWithHandles(
        gc,
        { x: minX, y: minY },
        sw,
        sh,
        containerW * dpr,
        containerH * dpr,
        dpr,
        hoverOrActive
      );
    });
  }
}

export const definition: ToolDefinition = {
  tool: "crop",
  label: "Crop",
  shortcut: "C",
  Icon: CropIcon,
  group: "shape"
};
