/**
 * PaintSession — shared, transform-aware paint/stroke session model.
 *
 * All common drawing tools (brush, pencil, eraser, and shape commit)
 * route through this session. It owns:
 *
 *  - input sampling / session lifecycle (begin → move → end)
 *  - document-space ↔ layer-space coordinate mapping
 *  - stroke buffer creation and commit
 *  - alpha-lock snapshot and restore
 *  - Shift+click straight-line interpolation
 *  - symmetry dispatch (delegates to ToolContext.withMirror)
 *  - dirty-rect tracking for efficient compositing
 *
 * The actual brush evaluation (pixel placement) is delegated to a
 * `PaintEngine`, making brush/pencil/eraser different engines/modes
 * inside the same session model rather than separate pipelines.
 *
 * Overlay, cursor, and live preview stay on 2D by default.
 */

import type { Point, Layer } from "../types";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import type { PaintEngine } from "./PaintEngine";
import { CoordinateMapper } from "./CoordinateMapper";
import type { ActiveStrokeInfo } from "../rendering";

// ─── Session state ──────────────────────────────────────────────────────────

export interface PaintSessionSnapshot {
  /** Alpha channel snapshot for alpha-lock restore. */
  alphaSnapshot: ImageData | null;
}

// ─── PaintSession ───────────────────────────────────────────────────────────

export class PaintSession {
  // ── Read-only references during stroke ─────────────────────────────
  private engine: PaintEngine;
  private ctx: ToolContext;
  private layer: Layer;
  private mapper: CoordinateMapper;

  // ── Stroke state ──────────────────────────────────────────────────
  private active = false;
  private lastPoint: Point | null = null;
  private lastSmoothedPoint: Point | null = null;
  private currentPressure = 0.5;
  private hasMoved = false;
  private lastStrokeEnd: Point | null = null;

  // ── Alpha lock ────────────────────────────────────────────────────
  private alphaSnapshot: ImageData | null = null;

  constructor(engine: PaintEngine) {
    // Engine is set at construction; ctx/layer/mapper are set on begin().
    this.engine = engine;
    // Placeholder values – overwritten in begin().
    this.ctx = null as unknown as ToolContext;
    this.layer = null as unknown as Layer;
    this.mapper = new CoordinateMapper({ layerTransform: { x: 0, y: 0 } });
  }

  /** Replace the engine (e.g. when switching between brush/pencil/eraser). */
  setEngine(engine: PaintEngine): void {
    this.engine = engine;
  }

  /** Get the last stroke endpoint for Shift+click behaviour. */
  getLastStrokeEnd(): Point | null {
    return this.lastStrokeEnd;
  }

  /** Whether a stroke is currently active. */
  get isActive(): boolean {
    return this.active;
  }

  // ─── Begin ────────────────────────────────────────────────────────

  /**
   * Start a new paint stroke.
   *
   * @returns `true` if the stroke was started, `false` if no active layer.
   */
  begin(ctx: ToolContext, event: ToolPointerEvent): boolean {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    this.ctx = ctx;
    this.layer = activeLayer;
    this.mapper = new CoordinateMapper({
      layerTransform: { x: 0, y: 0 } // After reconcile, offset is always 0
    });

    const pt = event.point;
    this.lastPoint = pt;
    this.lastSmoothedPoint = pt;
    this.currentPressure = event.pressure || 0.5;
    this.hasMoved = false;
    this.active = true;

    this.engine.beginStroke();
    ctx.onStrokeStart();

    // ── Alpha-lock snapshot ──────────────────────────────────────────
    if (activeLayer.alphaLock) {
      const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
      const snapCtx = layerCanvas.getContext("2d");
      if (snapCtx) {
        this.alphaSnapshot = snapCtx.getImageData(
          0,
          0,
          layerCanvas.width,
          layerCanvas.height
        );
      }
    } else {
      this.alphaSnapshot = null;
    }

    // ── Create stroke buffer (if engine wants one) ───────────────────
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);

    if (this.engine.bufferMode === "buffered") {
      const buffer = window.document.createElement("canvas");
      buffer.width = layerCanvas.width;
      buffer.height = layerCanvas.height;
      const strokeOpacity = this.getStrokeOpacity(doc);
      ctx.activeStrokeRef.current = {
        layerId: activeLayer.id,
        buffer,
        opacity: strokeOpacity,
        compositeOp: this.engine.compositeOp
      };
    }

    // ── Get the target context (buffer or layer) ─────────────────────
    const paintCanvas = this.getPaintCanvas(ctx, activeLayer.id);
    const paintCtx = paintCanvas?.getContext("2d");
    if (!paintCtx) {
      return true;
    }

    const offset = this.mapper.offset;
    const hasSelClip = ctx.clipSelectionForOffset(paintCtx, offset);

    // ── Shift+click: straight line from last stroke end ──────────────
    if (ctx.shiftHeldRef.current && this.lastStrokeEnd) {
      const from = this.mapper.docToLayer(this.lastStrokeEnd);
      const localPt = this.mapper.docToLayer(pt);
      this.drawStraightLine(paintCtx, from, localPt);
    } else if (this.engine.dabOnDown) {
      // Initial dab (e.g. pencil)
      const localPt = this.mapper.docToLayer(pt);
      ctx.withMirror(
        paintCtx,
        (f, t, c, branchIdx) =>
          this.engine.evaluate(f, t, c, this.currentPressure, branchIdx),
        localPt,
        localPt
      );
    }

    if (hasSelClip) {
      paintCtx.restore();
    }

    // For direct mode, notify runtime that layer pixels changed
    if (this.engine.bufferMode === "direct") {
      this.invalidateRuntimeLayer(activeLayer.id);
    }
    ctx.redraw();

    return true;
  }

  // ─── Move ─────────────────────────────────────────────────────────

  move(
    ctx: ToolContext,
    _event: ToolPointerEvent,
    coalescedPoints: ToolPointerEvent[]
  ): void {
    if (!this.active || !this.lastPoint) {
      return;
    }

    const paintCanvas = this.getPaintCanvas(ctx, this.layer.id);
    const paintCtx = paintCanvas?.getContext("2d");
    if (!paintCtx) {
      return;
    }

    const offset = this.mapper.offset;
    const hasSelClip = ctx.clipSelectionForOffset(paintCtx, offset);

    for (const ep of coalescedPoints) {
      const pt = ep.point;

      // Track if pointer has moved at all (for click-without-drag dab)
      if (
        !this.hasMoved &&
        this.lastPoint &&
        (pt.x !== this.lastPoint.x || pt.y !== this.lastPoint.y)
      ) {
        this.hasMoved = true;
      }

      const localPt = this.mapper.docToLayer(pt);
      const pressure = ep.pressure;
      this.currentPressure = pressure;

      // Stabilize if the engine supports it
      const smoothPt = this.engine.stabilize(localPt);

      // Determine the "from" point
      const from = this.resolveFromPoint(offset);

      ctx.withMirror(
        paintCtx,
        (f, t, c, branchIdx) =>
          this.engine.evaluate(f, t, c, pressure, branchIdx),
        from,
        smoothPt
      );

      // Update tracked points
      if (this.engine.hasStabilizer) {
        this.lastSmoothedPoint = this.mapper.layerToDoc(smoothPt);
      }
      this.lastPoint = pt;
    }

    if (hasSelClip) {
      paintCtx.restore();
    }

    // For direct mode, notify runtime that layer pixels changed
    if (this.engine.bufferMode === "direct") {
      this.invalidateRuntimeLayer(this.layer.id);
    }

    // ── Dirty-rect compositing ──────────────────────────────────────
    const dirtyRect = this.engine.getDirtyRect();
    if (dirtyRect && dirtyRect.minX < dirtyRect.maxX && dirtyRect.minY < dirtyRect.maxY) {
      const doc = this.mapper.dirtyToDoc(dirtyRect);
      ctx.redrawDirty(doc.x, doc.y, doc.w, doc.h);
    } else {
      ctx.requestRedraw();
    }
  }

  // ─── End ──────────────────────────────────────────────────────────

  end(ctx: ToolContext, event: ToolPointerEvent): void {
    if (!this.active) {
      return;
    }

    // Save stroke endpoint for Shift+click straight line
    this.lastStrokeEnd = event.point;

    const activeStroke = ctx.activeStrokeRef.current;

    // ── Click-without-drag dab ──────────────────────────────────────
    if (!this.hasMoved && activeStroke) {
      const pt = event.point;
      const localPt = this.mapper.docToLayer(pt);
      const bufferCtx = activeStroke.buffer.getContext("2d");
      if (bufferCtx) {
        const offset = this.mapper.offset;
        const hasSelClip = ctx.clipSelectionForOffset(bufferCtx, offset);
        ctx.withMirror(
          bufferCtx,
          (f, t, c, branchIdx) =>
            this.engine.evaluate(f, t, c, this.currentPressure, branchIdx),
          localPt,
          localPt
        );
        if (hasSelClip) {
          bufferCtx.restore();
        }
      }
    }

    // ── Merge stroke buffer onto layer canvas ───────────────────────
    if (activeStroke) {
      const layerCanvas = ctx.getOrCreateLayerCanvas(this.layer.id);
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

    // ── Alpha-lock: restore original alpha channel ──────────────────
    this.restoreAlphaLock(ctx);

    // ── Clean up ────────────────────────────────────────────────────
    this.lastPoint = null;
    this.lastSmoothedPoint = null;
    this.hasMoved = false;
    this.active = false;

    ctx.redraw();

    ctx.onStrokeEnd(this.layer.id, null);
  }

  // ─── Internals ────────────────────────────────────────────────────

  /** Return the paint target (stroke buffer or layer canvas). */
  private getPaintCanvas(
    ctx: ToolContext,
    layerId: string
  ): HTMLCanvasElement | null {
    const activeStroke = ctx.activeStrokeRef.current;
    if (activeStroke) {
      return activeStroke.buffer;
    }
    return ctx.getOrCreateLayerCanvas(layerId);
  }

  /** Resolve the "from" point for the current segment. */
  private resolveFromPoint(offset: Point): Point {
    if (this.engine.hasStabilizer) {
      // Use last smoothed point when available, fall back to last raw point
      return (
        (this.lastSmoothedPoint
          ? this.mapper.docToLayer(this.lastSmoothedPoint)
          : null) ??
        (this.lastPoint
          ? this.mapper.docToLayer(this.lastPoint)
          : { x: 0, y: 0 })
      );
    }
    // No stabilizer — use the raw last point
    return this.lastPoint
      ? this.mapper.docToLayer(this.lastPoint)
      : { x: 0, y: 0 };
  }

  /** Draw a straight line between two layer-local points. */
  private drawStraightLine(
    paintCtx: CanvasRenderingContext2D,
    from: Point,
    to: Point
  ): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const STRAIGHT_LINE_STEP_DIVISOR = 100;
    const step = Math.max(
      1,
      Math.min(4, dist / STRAIGHT_LINE_STEP_DIVISOR)
    );
    const steps = Math.max(1, Math.ceil(dist / step));
    let prev = from;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const current = { x: from.x + dx * t, y: from.y + dy * t };
      this.ctx.withMirror(
        paintCtx,
        (f, tt, c, branchIdx) =>
          this.engine.evaluate(f, tt, c, this.currentPressure, branchIdx),
        prev,
        current
      );
      prev = current;
    }
  }

  /** Restore the original alpha channel after alpha-locked painting. */
  private restoreAlphaLock(ctx: ToolContext): void {
    if (!this.layer.alphaLock || !this.alphaSnapshot) {
      this.alphaSnapshot = null;
      return;
    }

    const layerCanvas = ctx.layerCanvasesRef.current.get(this.layer.id);
    if (!layerCanvas) {
      this.alphaSnapshot = null;
      return;
    }

    const layerCtx = layerCanvas.getContext("2d");
    if (!layerCtx) {
      this.alphaSnapshot = null;
      return;
    }

    const dirtyRect = this.engine.getDirtyRect() ?? {
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

    this.alphaSnapshot = null;
  }

  /** Get the stroke opacity from the current tool settings. */
  private getStrokeOpacity(doc: {
    toolSettings: {
      brush: { opacity: number };
      eraser: { opacity: number };
    };
  }): number {
    switch (this.engine.engineId) {
      case "brush":
        return doc.toolSettings.brush.opacity;
      case "eraser":
        return doc.toolSettings.eraser.opacity;
      default:
        return 1;
    }
  }

  /** Notify the runtime that a layer's CPU-side pixels have changed. */
  private invalidateRuntimeLayer(layerId: string): void {
    // The ToolContext redraw methods already handle runtime invalidation
    // for WebGPU. For Canvas2DRuntime this is a no-op since compositing
    // reads directly from the layer canvas. This hook exists so we can
    // add explicit invalidateLayer() calls if needed in the future.
  }
}
