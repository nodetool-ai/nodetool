/**
 * ShapeTool – handles line, rectangle, ellipse, and arrow tools.
 *
 * Uses the 2D overlay for live preview (shared preview model) and
 * commits through transform-aware rules via CoordinateMapper.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point } from "../types";
import {
  CoordinateMapper,
  ensureLayerRasterBounds,
  getDocumentViewportLayerBounds,
  getCanvasRasterBounds
} from "../painting";

export class ShapeTool implements ToolHandler {
  readonly toolId = "line" as const; // placeholder – covers all shape tools

  private shapeStart: Point | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    this.shapeStart = event.point;
    ctx.onStrokeStart();
    const activeLayer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    if (activeLayer) {
      ensureLayerRasterBounds(
        ctx,
        activeLayer,
        getDocumentViewportLayerBounds(activeLayer, ctx.doc)
      );
    }

    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.shapeStart) {
      return;
    }
    ctx.drawOverlayShape(this.shapeStart, event.point);
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
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
        // Use CoordinateMapper for transform-aware commit.
        // The layer offset is applied so the overlay content lands
        // at the correct position in layer-local space.
        const mapper = new CoordinateMapper({
          layerTransform: activeLayer.transform ?? { x: 0, y: 0 },
          rasterBounds: getCanvasRasterBounds(layerCanvas) ?? activeLayer.contentBounds
        });
        if (mapper.hasOffset) {
          const off = mapper.offset;
          layerCtx.drawImage(overlayCanvas, -off.x, -off.y);
        } else {
          layerCtx.drawImage(overlayCanvas, 0, 0);
        }
        const committedBounds = getCanvasRasterBounds(layerCanvas);
        if (committedBounds) {
          ctx.onLayerContentBoundsChange?.(activeLayer.id, committedBounds);
        }
        ctx.invalidateLayer?.(activeLayer.id);
        ctx.clearOverlay();
        ctx.drawSelectionOverlay();
        ctx.redraw();
      }
    }
    this.shapeStart = null;
    ctx.onStrokeEnd(activeLayer.id, null);
  }
}
