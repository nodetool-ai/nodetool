/**
 * GradientTool – drag to define gradient start/end, draws on pointer up.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 932-941)
 *   handlePointerMove (~line 1180-1185)
 *   handlePointerUp   (~line 1430-1447)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point } from "../types";
import { drawGradient as drawGradientUtil } from "../drawingUtils";

export class GradientTool implements ToolHandler {
  readonly toolId = "gradient" as const;

  private gradientStart: Point | null = null;
  private gradientEnd: Point | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    this.gradientStart = event.point;
    this.gradientEnd = event.point;
    ctx.onStrokeStart();
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.gradientStart) {
      return;
    }
    this.gradientEnd = event.point;
    ctx.drawOverlayGradient(this.gradientStart, event.point);
  }

  onUp(ctx: ToolContext): void {
    if (!this.gradientStart) {
      return;
    }
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      this.gradientStart = null;
      this.gradientEnd = null;
      return;
    }

    const start = this.gradientStart;
    const end = this.gradientEnd ?? start;
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (layerCtx) {
      drawGradientUtil(layerCtx, start, end, doc.toolSettings.gradient);
      ctx.clearOverlay();
      ctx.drawSelectionOverlay();
      ctx.redraw();
    }
    this.gradientStart = null;
    this.gradientEnd = null;
    ctx.onStrokeEnd(activeLayer.id, null);
  }
}
