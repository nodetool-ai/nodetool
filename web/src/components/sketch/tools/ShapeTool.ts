/**
 * ShapeTool – handles line, rectangle, ellipse, and arrow tools.
 *
 * Uses the 2D overlay for live preview (shared preview model) and
 * commits vector shapes in layer-local space via CoordinateMapper.
 *
 * Commit must **not** use drawImage(overlay): the overlay also paints the
 * pixel grid and other UI; copying the full bitmap would tint the whole layer.
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, ShapeToolType, ShapeSettings } from "../types";
import CategoryIcon from "@mui/icons-material/Category";
import {
  CoordinateMapper,
  ensureLayerRasterBounds,
  getDocumentViewportLayerBounds,
  getCanvasRasterBounds
} from "../painting";

// ─── Shape Drawing Helpers (moved from drawingUtils.ts) ──────────────────────

/** Apply shift-constraint to shape end point */
export function constrainEnd(
  start: Point,
  end: Point,
  tool: ShapeToolType,
  shiftHeld: boolean
): Point {
  if (!shiftHeld) {
    return end;
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: start.x + size * Math.sign(dx || 1),
      y: start.y + size * Math.sign(dy || 1)
    };
  }
  if (tool === "line" || tool === "arrow") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return {
      x: start.x + dist * Math.cos(snapped),
      y: start.y + dist * Math.sin(snapped)
    };
  }
  return end;
}

/**
 * When Alt is held for rectangle/ellipse, the start point is treated as
 * the center of the shape. Returns adjusted {start, end} pair.
 */
export function applyAltCenterDraw(
  start: Point,
  end: Point,
  tool: ShapeToolType,
  altHeld: boolean
): { start: Point; end: Point } {
  if (!altHeld) {
    return { start, end };
  }
  if (tool === "rectangle" || tool === "ellipse") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return {
      start: { x: start.x - dx, y: start.y - dy },
      end: { x: start.x + dx, y: start.y + dy }
    };
  }
  return { start, end };
}

export function drawShapeOnCtx(
  ctx: CanvasRenderingContext2D,
  tool: ShapeToolType,
  start: Point,
  end: Point,
  settings: ShapeSettings,
  shiftHeld: boolean,
  altHeld: boolean
): void {
  // Apply Alt (draw from center) before constraint
  const centered = applyAltCenterDraw(start, end, tool, altHeld);
  const constrained = constrainEnd(
    centered.start,
    centered.end,
    tool,
    shiftHeld
  );
  const s = centered.start;
  ctx.save();
  ctx.strokeStyle = settings.strokeColor;
  ctx.lineWidth = settings.strokeWidth;
  ctx.fillStyle = settings.fillColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (tool) {
    case "rectangle": {
      const x = Math.min(s.x, constrained.x);
      const y = Math.min(s.y, constrained.y);
      const w = Math.abs(constrained.x - s.x);
      const h = Math.abs(constrained.y - s.y);
      if (settings.filled) {
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const cx = (s.x + constrained.x) / 2;
      const cy = (s.y + constrained.y) / 2;
      const rx = Math.abs(constrained.x - s.x) / 2;
      const ry = Math.abs(constrained.y - s.y) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        Math.max(rx, 0.1),
        Math.max(ry, 0.1),
        0,
        0,
        Math.PI * 2
      );
      if (settings.filled) {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(constrained.x, constrained.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(constrained.x, constrained.y);
      ctx.stroke();
      const angle = Math.atan2(constrained.y - s.y, constrained.x - s.x);
      const headLen = Math.max(settings.strokeWidth * 3, 10);
      ctx.beginPath();
      ctx.moveTo(constrained.x, constrained.y);
      ctx.lineTo(
        constrained.x - headLen * Math.cos(angle - Math.PI / 6),
        constrained.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(constrained.x, constrained.y);
      ctx.lineTo(
        constrained.x - headLen * Math.cos(angle + Math.PI / 6),
        constrained.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

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

export const definition: ToolDefinition = {
  tool: "shape",
  label: "Shape",
  Icon: CategoryIcon,
  group: "shape"
};
