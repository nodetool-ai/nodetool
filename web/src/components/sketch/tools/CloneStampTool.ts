/**
 * CloneStampTool – clones pixels from a source point to the brush location.
 *
 * Extracted from usePointerHandlers:
 *   handlePointerDown (~line 838-920) – clone stamp stroke start
 *   handlePointerMove (~line 1326-1328)
 *   handlePointerUp   (~line 1411-1413)
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point } from "../types";
import {
  drawCloneStampStroke as drawCloneStampStrokeUtil,
  blendModeToComposite
} from "../drawingUtils";
import type { DirtyRectTracker } from "../drawingUtils";
import { CoordinateMapper } from "../painting/CoordinateMapper";

export class CloneStampTool implements ToolHandler {
  readonly toolId = "clone_stamp" as const;

  // Clone-specific state
  private cloneSource: Point | null = null;
  private cloneOffset: Point | null = null;
  private cloneSourceCanvas: HTMLCanvasElement | null = null;

  // Stroke state
  private lastPoint: Point | null = null;
  private lastSmoothedPoint: Point | null = null;
  private currentPressure = 0.5;
  private paintStrokeHasMoved = false;
  private lastStrokeEnd: Point | null = null;

  // Transform-aware coordinate mapper
  private mapper: CoordinateMapper | null = null;

  // Alpha lock
  private alphaSnapshot: ImageData | null = null;

  // Dirty rect tracking
  private strokeDirtyRect: DirtyRectTracker = { current: null };

  // Stabilizer
  private stabilizerBuffer: Point[] = [];

  // ── Drawing wrapper ──────────────────────────────────────────────────

  private drawCloneStampStroke(
    from: Point,
    to: Point,
    settings: import("../types").CloneStampSettings,
    ctx: CanvasRenderingContext2D
  ): void {
    const sourceCanvas = this.cloneSourceCanvas;
    const offset = this.cloneOffset;
    if (!sourceCanvas || !offset) {
      return;
    }
    drawCloneStampStrokeUtil(from, to, settings, ctx, sourceCanvas, offset);
  }

  /**
   * Set the clone source point. Called externally when Alt+click is detected
   * by the pointer handler dispatcher.
   */
  setCloneSource(point: Point): void {
    this.cloneSource = point;
    this.cloneOffset = null;
  }

  /** Returns the current clone source point (for overlay rendering). */
  getCloneSource(): Point | null {
    return this.cloneSource;
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    if (!this.cloneSource) {
      return false;
    }

    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    const pt = event.point;

    // Build coordinate mapper for this layer
    this.mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: activeLayer.contentBounds
    });

    // Calculate offset from source to destination on first stroke
    if (!this.cloneOffset) {
      this.cloneOffset = {
        x: this.cloneSource.x - pt.x,
        y: this.cloneSource.y - pt.y
      };
    }

    // Create source canvas snapshot
    const settings = doc.toolSettings.cloneStamp;
    if (settings.sampling === "composited") {
      const tmp = window.document.createElement("canvas");
      tmp.width = doc.canvas.width;
      tmp.height = doc.canvas.height;
      const tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
      if (tmpCtx) {
        for (const layer of doc.layers) {
          if (!layer.visible || layer.type === "mask") {
            continue;
          }
          const lc = ctx.layerCanvasesRef.current.get(layer.id);
          if (lc) {
            const useReconciledActiveTransform =
              layer.id === activeLayer.id &&
              ((activeLayer.transform?.x ?? 0) !== 0 ||
                (activeLayer.transform?.y ?? 0) !== 0);
            tmpCtx.save();
            tmpCtx.globalAlpha = layer.opacity;
            tmpCtx.globalCompositeOperation = blendModeToComposite(
              layer.blendMode || "normal"
            );
            tmpCtx.drawImage(
              lc,
              useReconciledActiveTransform ? 0 : (layer.transform?.x ?? 0),
              useReconciledActiveTransform ? 0 : (layer.transform?.y ?? 0)
            );
            tmpCtx.restore();
          }
        }
      }
      this.cloneSourceCanvas = tmp;
    } else {
      const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
      const snapshot = window.document.createElement("canvas");
      snapshot.width = layerCanvas.width;
      snapshot.height = layerCanvas.height;
      const snapCtx = snapshot.getContext("2d", { willReadFrequently: true });
      if (snapCtx) {
        snapCtx.drawImage(layerCanvas, 0, 0);
      }
      this.cloneSourceCanvas = snapshot;
    }

    this.lastPoint = pt;
    this.lastSmoothedPoint = pt;
    this.currentPressure = event.pressure || 0.5;
    this.paintStrokeHasMoved = false;
    this.stabilizerBuffer = [];
    this.strokeDirtyRect = { current: null };

    ctx.onStrokeStart();

    // Alpha lock snapshot
    if (activeLayer.alphaLock) {
      const lc = ctx.getOrCreateLayerCanvas(activeLayer.id);
      const snapCtx = lc.getContext("2d");
      if (snapCtx) {
        this.alphaSnapshot = snapCtx.getImageData(0, 0, lc.width, lc.height);
      }
    } else {
      this.alphaSnapshot = null;
    }

    // Initial dab (map document-space point to layer-local)
    const localPt = this.mapper.docToLayer(pt);
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const layerCtx = layerCanvas.getContext("2d");
    if (layerCtx) {
      this.drawCloneStampStroke(localPt, localPt, doc.toolSettings.cloneStamp, layerCtx);
      ctx.redraw();
    }

    return true;
  }

  onMove(
    ctx: ToolContext,
    _event: ToolPointerEvent,
    coalescedPoints: ToolPointerEvent[]
  ): void {
    if (!this.lastPoint || !this.mapper) {
      return;
    }
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return;
    }

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const paintCtx = layerCanvas.getContext("2d");
    if (!paintCtx) {
      return;
    }

    for (const eventPoint of coalescedPoints) {
      const pt = eventPoint.point;
      if (
        !this.paintStrokeHasMoved &&
        this.lastPoint &&
        (pt.x !== this.lastPoint.x || pt.y !== this.lastPoint.y)
      ) {
        this.paintStrokeHasMoved = true;
      }
      this.currentPressure = eventPoint.pressure;
      const localFrom = this.mapper.docToLayer(this.lastPoint);
      const localTo = this.mapper.docToLayer(pt);
      this.drawCloneStampStroke(localFrom, localTo, doc.toolSettings.cloneStamp, paintCtx);
      this.lastPoint = pt;
    }

    // Dirty-rect compositing (map from layer-space back to doc-space)
    const dirty = this.strokeDirtyRect.current;
    if (dirty && dirty.minX < dirty.maxX && dirty.minY < dirty.maxY) {
      const docDirty = this.mapper.dirtyToDoc(dirty);
      ctx.redrawDirty(docDirty.x, docDirty.y, docDirty.w, docDirty.h);
    } else {
      ctx.requestRedraw();
    }
  }

  onUp(ctx: ToolContext, event: ToolPointerEvent): void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

    // Save stroke endpoint for Shift+click straight line
    this.lastStrokeEnd = event.point;

    // Clear clone source canvas (per-stroke)
    this.cloneSourceCanvas = null;

    this.lastPoint = null;
    this.lastSmoothedPoint = null;
    this.paintStrokeHasMoved = false;
    this.mapper = null;

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
