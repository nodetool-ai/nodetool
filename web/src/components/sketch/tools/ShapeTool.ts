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
import { CoordinateMapper } from "../painting";
import { ensureLayerRasterBounds } from "../transform/geometry/ensureRasterBounds";
import {
  getDocumentViewportInLayerSpace,
  getCanvasRasterBounds
} from "../transform/geometry/layerGeometry";

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
    // Shift snaps lines/arrows to 30° increments (0, 30, 60, 90, …).
    const step = Math.PI / 6;
    const snapped = Math.round(angle / step) * step;
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
      // Designers Republic-style chevron arrow.
      //
      // The head is a "wing + tip" silhouette: from the shaft edges the
      // outline steps perpendicular OUT to the wing, runs PARALLEL to
      // the shaft along the wing's outer edge, then cuts in at 45° to
      // the apex. Mirrored on the underside.
      //
      // Counting the head vertices including the shaft-junction points:
      //   1 shaft-top-end → 2 wing back-outer → 3 wing front-outer
      //   → 4 apex → 5 wing front-outer (lower) → 6 wing back-outer
      //   (lower) → 7 shaft-bottom-end. That's the 7-vertex head the
      // designer-republic posters use.
      const dx = constrained.x - s.x;
      const dy = constrained.y - s.y;
      const L = Math.hypot(dx, dy);
      if (L < 0.5) {
        break;
      }
      const angle = Math.atan2(dy, dx);
      const sw = Math.max(1, settings.strokeWidth);
      // Narrow shaft, wings that clearly outstep it, 45° tip.
      const T = Math.max(3, sw * 1.6);
      const W = Math.max(T * 3, sw * 6);
      // Clean 45° symmetry: tip slope and barb slope are mirrored so
      // the apex angle equals the rear-barb angle and the head reads
      // as a regular chevron with a small flat wing tip on top/bottom.
      const halfSpan = W / 2 - T / 2;
      // Head height (from apex down to where the shaft enters) equals
      // the stem width T. The apex sits T above the wing fronts, and
      // the wing fronts sit level with the shaft junction so all three
      // "top" points are within T of the shaft top edge.
      // 90° apex angle: each tip diagonal sits at 45° from the arrow
      // axis, which requires tipLen == W/2.
      const tipLen = W / 2;
      const headLen = tipLen;
      const barb = halfSpan;
      const apexX = L;
      const wingFront = Math.max(0, apexX - tipLen);
      const wingShaftJunction = Math.max(0, apexX - headLen);
      const wingBack = Math.max(0, wingShaftJunction - barb);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const local = (lx: number, ly: number): [number, number] => [
        s.x + lx * cos - ly * sin,
        s.y + lx * sin + ly * cos
      ];
      const pts: Array<[number, number]> = [
        local(0, -T / 2),
        local(wingShaftJunction, -T / 2),
        local(wingBack, -W / 2),
        local(wingFront, -W / 2),
        local(apexX, 0),
        local(wingFront, W / 2),
        local(wingBack, W / 2),
        local(wingShaftJunction, T / 2),
        local(0, T / 2)
      ];
      ctx.save();
      ctx.lineJoin = "miter";
      ctx.miterLimit = 10;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = settings.strokeColor;
      ctx.fill();
      ctx.lineWidth = Math.max(1, sw * 0.5);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}

export class ShapeTool implements ToolHandler {
  readonly toolId = "shape" as const;

  private shapeStart: Point | null = null;
  private lastEnd: Point | null = null;
  private activeCtx: ToolContext | null = null;
  private modifierKeyListener: ((e: KeyboardEvent) => void) | null = null;

  private redrawPreview(): void {
    if (!this.activeCtx || !this.shapeStart || !this.lastEnd) {
      return;
    }
    this.activeCtx.drawOverlayShape(this.shapeStart, this.lastEnd);
  }

  private installModifierListener(ctx: ToolContext): void {
    if (this.modifierKeyListener) {
      return;
    }
    const listener = (e: KeyboardEvent) => {
      if (e.key !== "Shift" && e.key !== "Alt") {
        return;
      }
      // Update modifier refs and re-render the preview so snap reacts
      // immediately when the user presses/releases Shift or Alt mid-drag,
      // even without a pointer move.
      ctx.shiftHeldRef.current = e.shiftKey;
      ctx.altHeldRef.current = e.altKey;
      this.redrawPreview();
    };
    window.addEventListener("keydown", listener, true);
    window.addEventListener("keyup", listener, true);
    this.modifierKeyListener = listener;
  }

  private removeModifierListener(): void {
    if (!this.modifierKeyListener) {
      return;
    }
    window.removeEventListener("keydown", this.modifierKeyListener, true);
    window.removeEventListener("keyup", this.modifierKeyListener, true);
    this.modifierKeyListener = null;
  }

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const activeLayer = ctx.doc.layers.find((l) => l.id === ctx.doc.activeLayerId);
    // Locked layers reject pixel edits.
    if (!activeLayer || activeLayer.locked) {
      return false;
    }

    this.shapeStart = event.point;
    this.lastEnd = event.point;
    this.activeCtx = ctx;
    ctx.onStrokeStart();
    ensureLayerRasterBounds(
      ctx,
      activeLayer,
      getDocumentViewportInLayerSpace(activeLayer, ctx.doc)
    );
    this.installModifierListener(ctx);

    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    if (!this.shapeStart) {
      return;
    }
    ctx.shiftHeldRef.current = event.nativeEvent.shiftKey;
    ctx.altHeldRef.current = event.nativeEvent.altKey;
    this.lastEnd = event.point;
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
    if (event) {
      ctx.shiftHeldRef.current = event.nativeEvent.shiftKey;
      ctx.altHeldRef.current = event.nativeEvent.altKey;
    }

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

    // Pair the new bounds with the deferred pixel sync — passing
    // committedBounds into onStrokeEnd lets flushPendingStrokeFinalization
    // update layer.data and contentBounds together. If we instead pushed
    // new contentBounds *now* (via onLayerContentBoundsChange) while
    // layer.data is still the pre-stroke snapshot, useLayerHydration would
    // re-fire setLayerData with stale pixels + new bounds and wipe the
    // just-drawn shape (and adjacent pixels).
    const committedBounds = getCanvasRasterBounds(layerCanvas);
    ctx.onStrokeEnd(activeLayer.id, null, committedBounds ?? undefined);
    ctx.invalidateLayer?.(activeLayer.id);
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
    ctx.redraw();

    this.shapeStart = null;
    this.lastEnd = null;
    this.activeCtx = null;
    this.removeModifierListener();
  }
}

export const definition: ToolDefinition = {
  tool: "shape",
  label: "Shape",
  Icon: CategoryIcon,
  group: "shape"
};
