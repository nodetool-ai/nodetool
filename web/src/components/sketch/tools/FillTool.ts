/**
 * FillTool – flood-fills a region on the active layer canvas.
 *
 * Extracted from usePointerHandlers handlePointerDown (~line 810-835).
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import { floodFill as floodFillUtil } from "../drawingUtils";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import {
  selectionHasAnyPixels,
  selectionHitTest
} from "../selection/selectionMask";

export class FillTool implements ToolHandler {
  readonly toolId = "fill" as const;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc, selection } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    // Locked layers reject pixel edits.
    if (activeLayer.locked) {
      return false;
    }

    const pt = event.point;
    if (selection && selectionHasAnyPixels(selection)) {
      if (!selectionHitTest(selection, pt.x, pt.y)) {
        return false;
      }
    }

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) {
      return false;
    }

    ctx.onStrokeStart();

    // Map the document-space click into the layer's backing raster space
    const mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: activeLayer.contentBounds
    });
    const localPt = mapper.docToLayer(pt);

    // Apply selection clip for fill
    const offset = mapper.offset;
    const clipped = ctx.clipSelectionForOffset(layerCtx, offset);
    floodFillUtil(layerCtx, localPt.x, localPt.y, doc.toolSettings.fill);
    if (clipped) {
      layerCtx.restore();
    }
    ctx.redraw();
    ctx.onStrokeEnd(activeLayer.id, null);
    return false;
  }
}
