/**
 * ShapeTool – handles line, rectangle, ellipse, and arrow tools.
 *
 * Uses the 2D overlay for live preview (shared preview model) and
 * commits vector shapes in layer-local space via CoordinateMapper.
 *
 * Commit must **not** use drawImage(overlay): the overlay also paints the
 * pixel grid and other UI; copying the full bitmap would tint the whole layer.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point } from "../types";
import { drawShapeOnCtx } from "../drawingUtils";
import {
  CoordinateMapper,
  ensureLayerRasterBounds,
  getDocumentViewportLayerBounds,
  getCanvasRasterBounds
} from "../painting";

export class ShapeTool implements ToolHandler {
  readonly toolId = "shape" as const;

  private shapeStart: Point | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const activeLayer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    // Locked layers reject pixel edits.
    if (!activeLayer || activeLayer.locked) {
      return false;
    }

    this.shapeStart = event.point;
    ctx.onStrokeStart();
    ensureLayerRasterBounds(
      ctx,
      activeLayer,
      getDocumentViewportLayerBounds(activeLayer, ctx.doc)
    );

    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.shapeStart) {
      return;
    }
    ctx.drawOverlayShape(this.shapeStart, event.point);
  }

  onUp(ctx: ToolContext, event?: ToolPointerEvent): void {
    if (!this.shapeStart) {
      return;
    }
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      this.shapeStart = null;
      return;
    }

    const endDoc = event?.point ?? this.shapeStart;

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) {
      this.shapeStart = null;
      return;
    }

    const mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform ?? { x: 0, y: 0 },
      rasterBounds: getCanvasRasterBounds(layerCanvas) ?? activeLayer.contentBounds
    });

    const shapeSettings = doc.toolSettings.shape;
    const shiftHeld = ctx.shiftHeldRef.current;
    const altHeld = ctx.altHeldRef.current;

    const clipped = ctx.clipSelectionForOffset(layerCtx, mapper.offset);

    ctx.withMirror(
      layerCtx,
      (fromDoc, toDoc, c, _branch) => {
        const fromLayer = mapper.docToLayer(fromDoc);
        const toLayer = mapper.docToLayer(toDoc);
        drawShapeOnCtx(
          c,
          shapeSettings.shapeType,
          fromLayer,
          toLayer,
          shapeSettings,
          shiftHeld,
          altHeld
        );
      },
      this.shapeStart,
      endDoc
    );

    if (clipped) {
      layerCtx.restore();
    }

    ctx.onStrokeEnd(activeLayer.id, null);
    const committedBounds = getCanvasRasterBounds(layerCanvas);
    if (committedBounds) {
      ctx.onLayerContentBoundsChange?.(activeLayer.id, committedBounds);
    }
    ctx.invalidateLayer?.(activeLayer.id);
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
    ctx.redraw();

    this.shapeStart = null;
  }
}
