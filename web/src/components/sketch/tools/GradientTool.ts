/**
 * GradientTool – drag to define gradient start/end, draws on pointer up.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 932-941)
 *   handlePointerMove (~line 1180-1185)
 *   handlePointerUp   (~line 1430-1447)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, GradientSettings, Selection } from "../types";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import {
  getCanvasRasterBounds,
  ensureLayerRasterBounds,
  getDocumentViewportLayerBounds
} from "../painting";
import { selectionHasAnyPixels, applySelectionConstraint } from "../selection";
import GradientIcon from "@mui/icons-material/Gradient";

// ─── Gradient Drawing (moved from drawingUtils.ts) ───────────────────────────

export function drawGradient(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  settings: GradientSettings
): void {
  ctx.save();
  let gradient: CanvasGradient;
  if (settings.type === "radial") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    // Minimum radius of 1 prevents invalid gradient when start/end points overlap
    gradient = ctx.createRadialGradient(
      start.x,
      start.y,
      0,
      start.x,
      start.y,
      Math.max(radius, 1)
    );
  } else {
    gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  }
  gradient.addColorStop(0, settings.startColor);
  gradient.addColorStop(1, settings.endColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export class GradientTool implements ToolHandler {
  readonly toolId = "gradient" as const;

  private gradientStart: Point | null = null;
  private gradientEnd: Point | null = null;
  private mapper: CoordinateMapper | null = null;

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const activeLayer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    // Locked layers reject pixel edits.
    if (!activeLayer || activeLayer.locked) {
      return false;
    }

    this.mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: activeLayer.contentBounds
    });

    this.gradientStart = event.point;
    this.gradientEnd = event.point;
    ctx.onStrokeStart();
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.gradientStart) {
      return;
    }
    this.gradientEnd = event.point;
    ctx.drawOverlayGradient(this.gradientStart, event.point);
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    if (!this.gradientStart) {
      return;
    }
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      this.gradientStart = null;
      this.gradientEnd = null;
      this.mapper = null;
      return;
    }

    const start = this.gradientStart;
    const end = this.gradientEnd ?? start;
    let mapper = this.mapper ?? new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: activeLayer.contentBounds
    });
    const { selection } = ctx;
    const hasSelection = selection && selectionHasAnyPixels(selection);

    // When a selection is active, expand the layer canvas to cover the full
    // document viewport so that all selection areas (including those outside
    // the current contentBounds) receive the gradient.
    if (hasSelection) {
      const viewportBounds = getDocumentViewportLayerBounds(activeLayer, doc);
      ensureLayerRasterBounds(ctx, activeLayer, viewportBounds);
      // Recreate mapper after canvas expansion — origin may have shifted.
      mapper = new CoordinateMapper({
        layerTransform: activeLayer.transform,
        rasterBounds: viewportBounds
      });
    }

    const localStart = mapper.docToLayer(start);
    const localEnd = mapper.docToLayer(end);
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (layerCtx) {
      const beforeData = hasSelection
        ? layerCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height)
        : null;

      drawGradient(layerCtx, localStart, localEnd, doc.toolSettings.gradient);

      if (hasSelection && beforeData && selection) {
        applySelectionConstraint(layerCtx, beforeData, selection, mapper.offset.x, mapper.offset.y);
      }
      const committedBounds = getCanvasRasterBounds(layerCanvas) ?? undefined;
      ctx.onStrokeEnd(activeLayer.id, null, committedBounds);
      ctx.invalidateLayer?.(activeLayer.id);
      ctx.clearOverlay();
      ctx.drawSelectionOverlay();
      ctx.redraw();
    }
    this.gradientStart = null;
    this.gradientEnd = null;
    this.mapper = null;
  }
}

export const definition: ToolDefinition = {
  tool: "gradient",
  label: "Gradient",
  Icon: GradientIcon,
  group: "shape"
};
