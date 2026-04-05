/**
 * CropTool – drag to select a crop rectangle, invokes onCropComplete on release.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 943-949)
 *   handlePointerMove (~line 1187-1191)
 *   handlePointerUp   (~line 1449-1469)
 *
 * The crop gizmo is drawn on the screen-resolution gizmo canvas (same approach
 * as TransformTool) so it stays crisp at any zoom level.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point } from "../types";
import CropIcon from "@mui/icons-material/Crop";

/** Convert a document-space point to gizmo canvas pixel coordinates. */
function docToGizmo(
  docX: number,
  docY: number,
  docW: number,
  docH: number,
  zoom: number,
  pan: Point,
  containerW: number,
  containerH: number,
  dpr: number
): Point {
  return {
    x: ((docX - docW / 2) * zoom + containerW / 2 + pan.x) * dpr,
    y: ((docY - docH / 2) * zoom + containerH / 2 + pan.y) * dpr
  };
}

export class CropTool implements ToolHandler {
  readonly toolId = "crop" as const;

  private cropStart: Point | null = null;
  /** Updated every onMove so onUp has the correct end position. */
  private cropEnd: Point | null = null;

  onDown(_ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    this.cropStart = event.point;
    this.cropEnd = event.point;
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.cropStart) {
      return;
    }
    this.cropEnd = event.point;
    this.paintCropGizmo(ctx, this.cropStart, event.point);
  }

  onUp(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.cropStart) {
      return;
    }
    // Use the event point directly (document space), falling back to the last
    // stored cropEnd so the final rect always matches what the user saw.
    const end = event?.point ?? this.cropEnd ?? this.cropStart;
    const x1 = Math.round(Math.min(this.cropStart.x, end.x));
    const y1 = Math.round(Math.min(this.cropStart.y, end.y));
    const x2 = Math.round(Math.max(this.cropStart.x, end.x));
    const y2 = Math.round(Math.max(this.cropStart.y, end.y));
    const w = x2 - x1;
    const h = y2 - y1;
    ctx.clearGizmo();
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
    this.cropStart = null;
    this.cropEnd = null;
    if (w > 1 && h > 1 && ctx.onCropComplete) {
      ctx.onCropComplete(x1, y1, w, h);
    }
  }

  /** Cancel an in-progress crop (e.g. ESC key). */
  onCancel(ctx: ToolContext): void {
    if (this.cropStart) {
      ctx.clearGizmo();
      ctx.clearOverlay();
      ctx.drawSelectionOverlay();
      this.cropStart = null;
      this.cropEnd = null;
    }
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.clearGizmo();
    this.cropStart = null;
    this.cropEnd = null;
  }

  /** Draw the crop gizmo on the screen-resolution gizmo canvas for crisp rendering. */
  private paintCropGizmo(ctx: ToolContext, start: Point, end: Point): void {
    const { doc, zoom, pan } = ctx;
    const docW = doc.canvas.width;
    const docH = doc.canvas.height;

    ctx.drawGizmo((gc, dpr, containerW, containerH) => {
      const toScreen = (dx: number, dy: number) =>
        docToGizmo(dx, dy, docW, docH, zoom, pan, containerW, containerH, dpr);

      const tl = toScreen(Math.min(start.x, end.x), Math.min(start.y, end.y));
      const br = toScreen(Math.max(start.x, end.x), Math.max(start.y, end.y));
      const sw = br.x - tl.x;
      const sh = br.y - tl.y;

      // Dim the area outside the crop rect
      const cw = containerW * dpr;
      const ch = containerH * dpr;
      gc.fillStyle = "rgba(0,0,0,0.45)";
      gc.fillRect(0, 0, cw, ch);
      gc.clearRect(tl.x, tl.y, sw, sh);

      // Crisp 1-DPR-px border
      gc.strokeStyle = "rgba(255,255,255,0.9)";
      gc.lineWidth = dpr;
      gc.setLineDash([]);
      gc.strokeRect(tl.x + 0.5 * dpr, tl.y + 0.5 * dpr, sw - dpr, sh - dpr);

      // Rule-of-thirds grid
      gc.strokeStyle = "rgba(255,255,255,0.35)";
      gc.lineWidth = dpr;
      for (let i = 1; i <= 2; i++) {
        const gx = tl.x + (sw * i) / 3;
        const gy = tl.y + (sh * i) / 3;
        gc.beginPath();
        gc.moveTo(gx, tl.y);
        gc.lineTo(gx, tl.y + sh);
        gc.stroke();
        gc.beginPath();
        gc.moveTo(tl.x, gy);
        gc.lineTo(tl.x + sw, gy);
        gc.stroke();
      }
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
