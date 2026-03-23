/**
 * FillTool – flood-fills a region on the active layer canvas.
 *
 * Extracted from usePointerHandlers handlePointerDown (~line 810-835).
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import { floodFill as floodFillUtil } from "../drawingUtils";

export class FillTool implements ToolHandler {
  readonly toolId = "fill" as const;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc, selection } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    const pt = event.point;

    // Only fill if click is within selection (when one exists)
    if (selection && selection.width > 0 && selection.height > 0) {
      if (
        pt.x < selection.x ||
        pt.x > selection.x + selection.width ||
        pt.y < selection.y ||
        pt.y > selection.y + selection.height
      ) {
        return false;
      }
    }

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) {
      return false;
    }

    ctx.onStrokeStart();

    // Apply selection clip for fill
    const offset = { x: 0, y: 0 };
    const clipped = ctx.clipSelectionForOffset(layerCtx, offset);
    floodFillUtil(layerCtx, pt.x, pt.y, doc.toolSettings.fill);
    if (clipped) {
      layerCtx.restore();
    }
    ctx.redraw();
    ctx.onStrokeEnd(activeLayer.id, null);
    return false;
  }
}
