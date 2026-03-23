/**
 * PencilTool – simple pixel pencil, no stroke buffer, no stabilizer.
 *
 * Extracted from usePointerHandlers painting-tool sections:
 *   handlePointerDown (~line 980-1092) – pencil-specific path
 *   handlePointerMove (~line 1289-1296)
 *   handlePointerUp   (~line 1530-1640)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, PencilSettings } from "../types";
import {
  drawPencilStroke as drawPencilStrokeUtil
} from "../drawingUtils";
import type { DirtyRectTracker } from "../drawingUtils";

export class PencilTool implements ToolHandler {
  readonly toolId = "pencil" as const;

  // Stroke state
  private lastPoint: Point | null = null;
  private currentPressure = 0.5;
  private paintStrokeHasMoved = false;
  private paintLayerOffset: Point = { x: 0, y: 0 };
  private lastStrokeEnd: Point | null = null;

  // Alpha lock
  private alphaSnapshot: ImageData | null = null;

  // Dirty rect tracking
  private strokeDirtyRect: DirtyRectTracker = { current: null };

  // ── Drawing wrapper ──────────────────────────────────────────────────

  private drawPencilStroke(
    from: Point,
    to: Point,
    settings: PencilSettings,
    ctx: CanvasRenderingContext2D,
    pressure?: number
  ): void {
    drawPencilStrokeUtil(from, to, settings, ctx, pressure, this.strokeDirtyRect);
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    const pt = event.point;
    this.lastPoint = pt;
    this.currentPressure = event.pressure || 0.5;
    this.paintStrokeHasMoved = false;
    this.paintLayerOffset = { x: 0, y: 0 };
    this.strokeDirtyRect = { current: null };

    ctx.onStrokeStart();

    const currentOffset = this.paintLayerOffset;
    const localPt = pt;

    // Alpha lock snapshot
    if (activeLayer.alphaLock) {
      const layerCanvasForSnapshot = ctx.getOrCreateLayerCanvas(activeLayer.id);
      const snapCtx = layerCanvasForSnapshot.getContext("2d");
      if (snapCtx) {
        this.alphaSnapshot = snapCtx.getImageData(
          0,
          0,
          layerCanvasForSnapshot.width,
          layerCanvasForSnapshot.height
        );
      }
    } else {
      this.alphaSnapshot = null;
    }

    // Pencil paints directly onto the layer canvas (no stroke buffer)
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const paintCtx = layerCanvas.getContext("2d");
    if (paintCtx) {
      const hasSelClip = ctx.clipSelectionForOffset(paintCtx, currentOffset);

      if (ctx.shiftHeldRef.current && this.lastStrokeEnd) {
        // Shift+click: straight line from last stroke end
        const from = {
          x: this.lastStrokeEnd.x - currentOffset.x,
          y: this.lastStrokeEnd.y - currentOffset.y
        };
        const dx = localPt.x - from.x;
        const dy = localPt.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const STRAIGHT_LINE_STEP_DIVISOR = 100;
        const step = Math.max(1, Math.min(4, dist / STRAIGHT_LINE_STEP_DIVISOR));
        const steps = Math.max(1, Math.ceil(dist / step));
        let prev = from;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const current = { x: from.x + dx * t, y: from.y + dy * t };
          ctx.withMirror(
            paintCtx,
            (f, to, c) =>
              this.drawPencilStroke(f, to, doc.toolSettings.pencil, c, this.currentPressure),
            prev,
            current
          );
          prev = current;
        }
      } else {
        // Initial dab
        ctx.withMirror(
          paintCtx,
          (f, t, c) =>
            this.drawPencilStroke(f, t, doc.toolSettings.pencil, c, this.currentPressure),
          localPt,
          localPt
        );
      }

      if (hasSelClip) {
        paintCtx.restore();
      }
      ctx.redraw();
    }

    return true;
  }

  onMove(
    ctx: ToolContext,
    _event: ToolPointerEvent,
    coalescedPoints: ToolPointerEvent[]
  ): void {
    if (!this.lastPoint) {
      return;
    }
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return;
    }

    const currentOffset = this.paintLayerOffset;
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const paintCtx = layerCanvas.getContext("2d");
    if (!paintCtx) {
      return;
    }

    const hasSelectionClip = ctx.clipSelectionForOffset(paintCtx, currentOffset);

    for (const eventPoint of coalescedPoints) {
      const pt = eventPoint.point;
      if (
        !this.paintStrokeHasMoved &&
        this.lastPoint &&
        (pt.x !== this.lastPoint.x || pt.y !== this.lastPoint.y)
      ) {
        this.paintStrokeHasMoved = true;
      }
      const localPt = {
        x: pt.x - currentOffset.x,
        y: pt.y - currentOffset.y
      };
      const pressure = eventPoint.pressure;
      this.currentPressure = pressure;

      const from = this.lastPoint
        ? {
            x: this.lastPoint.x - currentOffset.x,
            y: this.lastPoint.y - currentOffset.y
          }
        : localPt;
      ctx.withMirror(
        paintCtx,
        (f, t, c) =>
          this.drawPencilStroke(f, t, doc.toolSettings.pencil, c, pressure),
        from,
        localPt
      );
      this.lastPoint = pt;
    }

    if (hasSelectionClip) {
      paintCtx.restore();
    }

    // Dirty-rect compositing
    const dirty = this.strokeDirtyRect.current;
    if (dirty && dirty.minX < dirty.maxX && dirty.minY < dirty.maxY) {
      ctx.redrawDirty(
        dirty.minX + currentOffset.x,
        dirty.minY + currentOffset.y,
        dirty.maxX - dirty.minX,
        dirty.maxY - dirty.minY
      );
    } else {
      ctx.requestRedraw();
    }
  }

  onUp(ctx: ToolContext, event: ToolPointerEvent): void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

    // Save stroke endpoint for Shift+click straight line
    this.lastStrokeEnd = event.point;

    this.lastPoint = null;
    this.paintStrokeHasMoved = false;
    this.paintLayerOffset = { x: 0, y: 0 };

    // Alpha lock: restore original alpha channel
    if (activeLayer?.alphaLock && this.alphaSnapshot) {
      const layerCanvas = ctx.layerCanvasesRef.current.get(activeLayer.id);
      if (layerCanvas) {
        const layerCtx = layerCanvas.getContext("2d");
        if (layerCtx) {
          const dirtyRect = this.strokeDirtyRect.current ?? {
            minX: 0,
            minY: 0,
            maxX: layerCanvas.width,
            maxY: layerCanvas.height
          };
          const x = Math.max(0, dirtyRect.minX);
          const y = Math.max(0, dirtyRect.minY);
          const width = Math.min(layerCanvas.width - x, dirtyRect.maxX - x);
          const height = Math.min(layerCanvas.height - y, dirtyRect.maxY - y);
          if (width > 0 && height > 0) {
            const currentData = layerCtx.getImageData(x, y, width, height);
            const snapshot = this.alphaSnapshot;
            for (let yy = 0; yy < height; yy++) {
              for (let xx = 0; xx < width; xx++) {
                const localIndex = (yy * width + xx) * 4 + 3;
                const snapshotIndex =
                  ((y + yy) * layerCanvas.width + (x + xx)) * 4 + 3;
                currentData.data[localIndex] = Math.min(
                  currentData.data[localIndex],
                  snapshot.data[snapshotIndex]
                );
              }
            }
            layerCtx.putImageData(currentData, x, y);
          }
        }
      }
      this.alphaSnapshot = null;
    }
    this.strokeDirtyRect = { current: null };
    ctx.redraw();

    if (activeLayer) {
      ctx.onStrokeEnd(activeLayer.id, null);
    }
  }
}
