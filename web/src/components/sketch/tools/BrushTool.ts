/**
 * BrushTool – full-featured brush with stroke buffer, stabilizer, symmetry.
 *
 * Extracted from usePointerHandlers painting-tool sections:
 *   handlePointerDown (~line 980-1092) – brush-specific path
 *   handlePointerMove (~line 1268-1288)
 *   handlePointerUp   (~line 1530-1640)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, BrushSettings } from "../types";
import {
  drawBrushStroke as drawBrushStrokeUtil
} from "../drawingUtils";
import type { StrokeStampState, DirtyRectTracker } from "../drawingUtils";

const STABILIZER_WINDOW = 4;

export class BrushTool implements ToolHandler {
  readonly toolId = "brush" as const;

  // Stroke state
  private lastPoint: Point | null = null;
  private lastSmoothedPoint: Point | null = null;
  private currentPressure = 0.5;
  private paintStrokeHasMoved = false;
  private paintLayerOffset: Point = { x: 0, y: 0 };
  private lastStrokeEnd: Point | null = null;

  // Alpha lock
  private alphaSnapshot: ImageData | null = null;

  // Dirty rect tracking (DirtyRectTracker-compatible object)
  private strokeDirtyRect: DirtyRectTracker = { current: null };

  // Stabilizer
  private stabilizerBuffer: Point[] = [];

  // Stamp state per symmetry branch
  private brushStrokeStampStates: Map<number, StrokeStampState> = new Map();

  // Stamp cache (persistent across strokes for perf)
  private brushStampCache: Map<string, HTMLCanvasElement> = new Map();

  // ── Drawing wrapper ──────────────────────────────────────────────────

  private drawBrushStroke(
    from: Point,
    to: Point,
    settings: BrushSettings,
    ctx: CanvasRenderingContext2D,
    pressure: number | undefined,
    branchIndex = 0
  ): void {
    let stampState = this.brushStrokeStampStates.get(branchIndex);
    if (!stampState) {
      stampState = { hasStamped: false, distanceToNextDab: 0 };
      this.brushStrokeStampStates.set(branchIndex, stampState);
    }
    drawBrushStrokeUtil(
      from,
      to,
      settings,
      ctx,
      pressure,
      this.strokeDirtyRect,
      this.brushStampCache,
      stampState
    );
  }

  // ── Stabilizer ──────────────────────────────────────────────────────

  private stabilizePoint(raw: Point): Point {
    this.stabilizerBuffer.push(raw);
    if (this.stabilizerBuffer.length > STABILIZER_WINDOW) {
      this.stabilizerBuffer.shift();
    }
    if (this.stabilizerBuffer.length === 1) {
      return raw;
    }
    let sx = 0,
      sy = 0;
    for (const p of this.stabilizerBuffer) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / this.stabilizerBuffer.length, y: sy / this.stabilizerBuffer.length };
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
    this.lastSmoothedPoint = pt;
    this.currentPressure = event.pressure || 0.5;
    this.paintStrokeHasMoved = false;
    this.paintLayerOffset = { x: 0, y: 0 };
    this.stabilizerBuffer = [];
    this.strokeDirtyRect = { current: null };
    this.brushStrokeStampStates.clear();

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

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);

    // Create stroke buffer for correct opacity compositing
    const buffer = window.document.createElement("canvas");
    buffer.width = layerCanvas.width;
    buffer.height = layerCanvas.height;
    const strokeOpacity = doc.toolSettings.brush.opacity;
    ctx.activeStrokeRef.current = {
      layerId: activeLayer.id,
      buffer,
      opacity: strokeOpacity,
      compositeOp: "source-over"
    };

    const paintCtx = ctx.activeStrokeRef.current.buffer.getContext("2d");
    if (paintCtx) {
      const hasSelClip = ctx.clipSelectionForOffset(paintCtx, currentOffset);

      // Shift+click: straight line from last stroke end
      if (ctx.shiftHeldRef.current && this.lastStrokeEnd) {
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
            (f, to, c, branchIndex) =>
              this.drawBrushStroke(f, to, doc.toolSettings.brush, c, this.currentPressure, branchIndex),
            prev,
            current
          );
          prev = current;
        }
      }
      // No initial dab for brush (unlike pencil) — the move handler draws it

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
    const activeStroke = ctx.activeStrokeRef.current;
    const paintCanvas =
      activeStroke ? activeStroke.buffer : ctx.getOrCreateLayerCanvas(activeLayer.id);
    const paintCtx = paintCanvas.getContext("2d");
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

      const smoothPt = this.stabilizePoint(localPt);
      const from =
        (this.lastSmoothedPoint
          ? {
              x: this.lastSmoothedPoint.x - currentOffset.x,
              y: this.lastSmoothedPoint.y - currentOffset.y
            }
          : null) ??
        (this.lastPoint
          ? {
              x: this.lastPoint.x - currentOffset.x,
              y: this.lastPoint.y - currentOffset.y
            }
          : null) ??
        smoothPt;
      ctx.withMirror(
        paintCtx,
        (f, t, c, branchIndex) =>
          this.drawBrushStroke(f, t, doc.toolSettings.brush, c, pressure, branchIndex),
        from,
        smoothPt
      );
      this.lastSmoothedPoint = {
        x: smoothPt.x + currentOffset.x,
        y: smoothPt.y + currentOffset.y
      };
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

    const activeStroke = ctx.activeStrokeRef.current;
    if (activeLayer && activeStroke) {
      const pt = event.point;
      const currentOffset = this.paintLayerOffset;
      const localPt = {
        x: pt.x - currentOffset.x,
        y: pt.y - currentOffset.y
      };

      // Single dab for click-without-drag
      if (!this.paintStrokeHasMoved) {
        const bufferCtx = activeStroke.buffer.getContext("2d");
        if (bufferCtx) {
          const hasSelClip = ctx.clipSelectionForOffset(bufferCtx, currentOffset);
          ctx.withMirror(
            bufferCtx,
            (f, t, c, branchIndex) =>
              this.drawBrushStroke(
                f,
                t,
                doc.toolSettings.brush,
                c,
                this.currentPressure,
                branchIndex
              ),
            localPt,
            localPt
          );
          if (hasSelClip) {
            bufferCtx.restore();
          }
        }
      }

      // Merge stroke buffer onto layer canvas
      const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
      const layerCtx = layerCanvas.getContext("2d");
      if (layerCtx) {
        layerCtx.save();
        layerCtx.globalAlpha = activeStroke.opacity;
        layerCtx.globalCompositeOperation = activeStroke.compositeOp;
        layerCtx.drawImage(activeStroke.buffer, 0, 0);
        layerCtx.restore();
      }
      ctx.activeStrokeRef.current = null;
    }

    this.lastPoint = null;
    this.lastSmoothedPoint = null;
    this.paintStrokeHasMoved = false;
    this.brushStrokeStampStates.clear();
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
