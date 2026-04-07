/**
 * BlurTool – paints a blur effect using a snapshot of the layer as source.
 *
 * Extracted from usePointerHandlers painting-tool sections:
 *   handlePointerDown (~line 1009-1023) – blur snapshot creation
 *   handlePointerMove (~line 1318-1325) – blur stroke
 *   handlePointerUp   (~line 1408-1409) – cleanup
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, BlurSettings } from "../types";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import {
  drawBlurStroke as drawBlurStrokeUtil
} from "../drawingUtils";
import type { BlurTempCanvases, DirtyRectTracker } from "../drawingUtils";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import { captureAlphaSnapshot, restoreAlphaFromSnapshot } from "../painting/alphaLock";
import {
  coalescedStrokePressure,
  normalizePointerPressure
} from "../pointerPen";

export class BlurTool implements ToolHandler {
  readonly toolId = "blur" as const;
  readonly showsBrushCursor = true;

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
    this.currentPressure = normalizePointerPressure(event.nativeEvent);
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
      this.alphaSnapshot = captureAlphaSnapshot(layerCanvasForSnapshot);
    } else {
      this.alphaSnapshot = null;
    }

    // No source snapshot: blur reads from the current layer state on each dab,
    // allowing the effect to accumulate as the user paints continuously.
    this.blurSourceCanvas = null;

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
      this.currentPressure = coalescedStrokePressure(
        {
          pointerType: eventPoint.nativeEvent.pointerType,
          pressure: eventPoint.pressure
        } as PointerEvent,
        this.currentPressure || 0.5
      );

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
        restoreAlphaFromSnapshot(
          layerCanvas,
          this.alphaSnapshot,
          this.strokeDirtyRect.current
        );
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

export const definition: ToolDefinition = {
  tool: "blur",
  label: "Blur",
  shortcut: "Q",
  Icon: BlurOnIcon,
  group: "painting"
};
