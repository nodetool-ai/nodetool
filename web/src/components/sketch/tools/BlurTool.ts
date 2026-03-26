/**
 * BlurTool – paints a blur effect using a snapshot of the layer as source.
 *
 * Extracted from usePointerHandlers painting-tool sections:
 *   handlePointerDown (~line 1009-1023) – blur snapshot creation
 *   handlePointerMove (~line 1318-1325) – blur stroke
 *   handlePointerUp   (~line 1408-1409) – cleanup
 */

import type { ToolHandler, ToolContext, ToolPointerEvent } from "./types";
import type { Point, BlurSettings } from "../types";
import {
  drawBlurStroke as drawBlurStrokeUtil
} from "../drawingUtils";
import type { BlurTempCanvases, DirtyRectTracker } from "../drawingUtils";
import { CoordinateMapper } from "../painting/CoordinateMapper";

export class BlurTool implements ToolHandler {
  readonly toolId = "blur" as const;

  // Stroke state
  private lastPoint: Point | null = null;
  private currentPressure = 0.5;
  private paintStrokeHasMoved = false;
  private lastStrokeEnd: Point | null = null;

  // Transform-aware coordinate mapper
  private mapper: CoordinateMapper | null = null;

  // Alpha lock
  private alphaSnapshot: ImageData | null = null;

  // Dirty rect tracking
  private strokeDirtyRect: DirtyRectTracker = { current: null };

  // Blur-specific
  private blurSourceCanvas: HTMLCanvasElement | null = null;
  private blurTempCanvases: BlurTempCanvases = { tmp: null, blurred: null, mask: null };

  // ── Drawing wrapper ──────────────────────────────────────────────────

  private drawBlurStroke(
    from: Point,
    to: Point,
    settings: BlurSettings,
    layerCanvas: HTMLCanvasElement
  ): void {
    const sourceCanvas = this.blurSourceCanvas ?? layerCanvas;
    drawBlurStrokeUtil(from, to, settings, layerCanvas, sourceCanvas, this.strokeDirtyRect, this.blurTempCanvases);
  }

  // ── Handlers ─────────────────────────────────────────────────────────

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!activeLayer) {
      return false;
    }

    // Locked layers reject pixel edits.
    if (activeLayer.locked) {
      return false;
    }

    const pt = event.point;
    this.lastPoint = pt;
    this.currentPressure = event.pressure || 0.5;
    this.paintStrokeHasMoved = false;
    this.strokeDirtyRect = { current: null };

    // Build coordinate mapper for this layer
    this.mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform,
      rasterBounds: activeLayer.contentBounds
    });

    ctx.onStrokeStart();

    const localPt = this.mapper.docToLayer(pt);

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

    // Create blur source snapshot
    const layerCanvasForBlur = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const blurSnapshot = window.document.createElement("canvas");
    blurSnapshot.width = layerCanvasForBlur.width;
    blurSnapshot.height = layerCanvasForBlur.height;
    const blurSnapshotCtx = blurSnapshot.getContext("2d");
    if (blurSnapshotCtx) {
      blurSnapshotCtx.drawImage(layerCanvasForBlur, 0, 0);
      this.blurSourceCanvas = blurSnapshot;
    } else {
      this.blurSourceCanvas = null;
    }

    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const paintCtx = layerCanvas.getContext("2d");
    if (paintCtx) {
      const offset = this.mapper.offset;
      const hasSelClip = ctx.clipSelectionForOffset(paintCtx, offset);

      if (ctx.shiftHeldRef.current && this.lastStrokeEnd) {
        // Shift+click: straight line from last stroke end
        const from = this.mapper.docToLayer(this.lastStrokeEnd);
        this.drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
      } else {
        // Initial dab
        this.drawBlurStroke(localPt, localPt, doc.toolSettings.blur, layerCanvas);
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

    const offset = this.mapper.offset;
    const hasSelectionClip = ctx.clipSelectionForOffset(paintCtx, offset);

    for (const eventPoint of coalescedPoints) {
      const pt = eventPoint.point;
      if (
        !this.paintStrokeHasMoved &&
        this.lastPoint &&
        (pt.x !== this.lastPoint.x || pt.y !== this.lastPoint.y)
      ) {
        this.paintStrokeHasMoved = true;
      }
      const localPt = this.mapper.docToLayer(pt);
      this.currentPressure = eventPoint.pressure;

      const from = this.mapper.docToLayer(this.lastPoint);
      this.drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
      this.lastPoint = pt;
    }

    if (hasSelectionClip) {
      paintCtx.restore();
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

    // Clear blur source
    this.blurSourceCanvas = null;

    this.lastPoint = null;
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
