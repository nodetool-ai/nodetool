/**
 * ShapeTool – handles line, rectangle, ellipse, and arrow tools.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 922-930)
 *   handlePointerMove (~line 1174-1178)
 *   handlePointerUp   (~line 1415-1428)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point } from "../types";

export class ShapeTool implements ToolHandler {
  readonly toolId = "line" as const; // placeholder – covers all shape tools

  private shapeStart: Point | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    this.shapeStart = event.point;
    ctx.onStrokeStart();
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.shapeStart) {
      return;
    }
    ctx.drawOverlayShape(this.shapeStart, event.point);
  }

  onUp(ctx: ToolContext): void {
    if (!this.shapeStart) {
      return;
    }
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      this.shapeStart = null;
      return;
    }

    const overlayCanvas = ctx.overlayCanvasRef.current;
    if (overlayCanvas) {
      const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
      const layerCtx = layerCanvas.getContext("2d");
      if (layerCtx) {
        layerCtx.drawImage(overlayCanvas, 0, 0);
        ctx.clearOverlay();
        ctx.drawSelectionOverlay();
        ctx.redraw();
      }
    }
    this.shapeStart = null;
    ctx.onStrokeEnd(activeLayer.id, null);
  }
}
