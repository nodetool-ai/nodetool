/**
 * CropTool – drag to select a crop rectangle, invokes onCropComplete on release.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 943-949)
 *   handlePointerMove (~line 1187-1191)
 *   handlePointerUp   (~line 1449-1469)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point } from "../types";

export class CropTool implements ToolHandler {
  readonly toolId = "crop" as const;

  private cropStart: Point | null = null;

  onDown(_ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    this.cropStart = event.point;
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.cropStart) {
      return;
    }
    ctx.drawOverlayCrop(this.cropStart, event.point);
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    if (!this.cropStart) {
      return;
    }
    const pt = ctx.screenToCanvas(
      ctx.mousePositionRef.current.x +
        (ctx.containerRef.current?.getBoundingClientRect().left ?? 0),
      ctx.mousePositionRef.current.y +
        (ctx.containerRef.current?.getBoundingClientRect().top ?? 0)
    );
    const x1 = Math.round(Math.min(this.cropStart.x, pt.x));
    const y1 = Math.round(Math.min(this.cropStart.y, pt.y));
    const x2 = Math.round(Math.max(this.cropStart.x, pt.x));
    const y2 = Math.round(Math.max(this.cropStart.y, pt.y));
    const w = x2 - x1;
    const h = y2 - y1;
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
    this.cropStart = null;
    if (w > 1 && h > 1 && ctx.onCropComplete) {
      ctx.onCropComplete(x1, y1, w, h);
    }
  }
}
