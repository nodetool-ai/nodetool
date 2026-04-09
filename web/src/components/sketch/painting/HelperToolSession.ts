/**
 * HelperToolSession — shared stroke lifecycle for helper paint tools.
 *
 * CloneStampTool and BlurTool operate on the layer directly (no stroke buffer)
 * but share the same lifecycle structure: coordinate mapper setup, alpha-lock
 * snapshot/restore, dirty-rect tracking, pressure normalization, selection
 * clipping, and onStrokeStart/onStrokeEnd orchestration.
 *
 * This session extracts that shared infrastructure so each helper tool only
 * provides its tool-specific setup and draw logic via callbacks.
 */

import type { Point, Layer } from "../types";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import type { DirtyRectTracker } from "../rendering/canvasUtils";
import { CoordinateMapper } from "./CoordinateMapper";
import {
  ensureLayerRasterBounds,
  getDocumentViewportLayerBounds
} from "./layerBounds";
import { captureAlphaSnapshot, restoreAlphaFromSnapshot } from "./alphaLock";
import {
  coalescedStrokePressure,
  normalizePointerPressure
} from "../pointerPen";

// ─── Callback interfaces ────────────────────────────────────────────────────

/**
 * Callback invoked once at the start of a stroke after all shared setup
 * (mapper, alpha snapshot, etc.) is complete.
 *
 * Return `false` to abort the stroke (e.g. missing clone source).
 */
export type HelperOnSetup = (ctx: ToolContext, opts: HelperSetupInfo) => boolean;

export interface HelperSetupInfo {
  layer: Layer;
  point: Point;
  mapper: CoordinateMapper;
  dirtyRect: DirtyRectTracker;
  pressure: number;
  layerCanvas: HTMLCanvasElement;
  paintCtx: CanvasRenderingContext2D;
  hasSelectionClip: boolean;
  isShiftLine: boolean;
  lastStrokeEnd: Point | null;
}

/**
 * Callback for drawing during onMove. Called once per coalesced point.
 */
export type HelperOnDraw = (opts: HelperDrawInfo) => void;

export interface HelperDrawInfo {
  ctx: ToolContext;
  localFrom: Point;
  localTo: Point;
  docFrom: Point;
  docTo: Point;
  paintCtx: CanvasRenderingContext2D;
  layerCanvas: HTMLCanvasElement;
  pressure: number;
}

/**
 * Callback invoked when the stroke ends, before alpha restoration.
 */
export type HelperOnTeardown = () => void;

// ─── HelperToolSession ──────────────────────────────────────────────────────

export class HelperToolSession {
  // Stroke state
  private lastPoint: Point | null = null;
  private currentPressure = 0.5;
  private hasMoved = false;
  private _lastStrokeEnd: Point | null = null;

  // Coordinate mapping
  private mapper: CoordinateMapper | null = null;

  // Alpha lock
  private alphaSnapshot: ImageData | null = null;

  // Dirty rect tracking
  private strokeDirtyRect: DirtyRectTracker = { current: null };

  // Layer id for the current stroke
  private activeLayerId: string | null = null;

  // Tool callbacks
  private onSetup: HelperOnSetup;
  private onDraw: HelperOnDraw;
  private onTeardown: HelperOnTeardown;

  /**
   * Whether selection clipping is applied during onMove.
   * BlurTool needs it, CloneStampTool does not currently.
   */
  private useSelectionClipOnMove: boolean;

  constructor(opts: {
    onSetup: HelperOnSetup;
    onDraw: HelperOnDraw;
    onTeardown: HelperOnTeardown;
    useSelectionClipOnMove?: boolean;
  }) {
    this.onSetup = opts.onSetup;
    this.onDraw = opts.onDraw;
    this.onTeardown = opts.onTeardown;
    this.useSelectionClipOnMove = opts.useSelectionClipOnMove ?? false;
  }

  /** The last stroke endpoint, used for Shift+click straight lines. */
  get lastStrokeEnd(): Point | null {
    return this._lastStrokeEnd;
  }

  /** Current dirty rect tracker reference, shared with drawing utils. */
  get dirtyRectTracker(): DirtyRectTracker {
    return this.strokeDirtyRect;
  }

  /** Current coordinate mapper, or null if no stroke is active. */
  get coordinateMapper(): CoordinateMapper | null {
    return this.mapper;
  }

  // ── Begin ─────────────────────────────────────────────────────────────

  begin(ctx: ToolContext, event: ToolPointerEvent): boolean {
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
    this.hasMoved = false;
    this.strokeDirtyRect = { current: null };
    this.activeLayerId = activeLayer.id;

    // Coordinate mapping
    const rasterBounds = ensureLayerRasterBounds(
      ctx,
      activeLayer,
      getDocumentViewportLayerBounds(activeLayer, doc)
    );
    this.mapper = new CoordinateMapper({
      layerTransform: activeLayer.transform ?? { x: 0, y: 0 },
      rasterBounds
    });

    ctx.onStrokeStart();

    // Alpha lock snapshot
    if (activeLayer.alphaLock) {
      const lc = ctx.getOrCreateLayerCanvas(activeLayer.id);
      this.alphaSnapshot = captureAlphaSnapshot(lc);
    } else {
      this.alphaSnapshot = null;
    }

    // Get drawing context
    const layerCanvas = ctx.getOrCreateLayerCanvas(activeLayer.id);
    const paintCtx = layerCanvas.getContext("2d");
    if (!paintCtx) {
      return false;
    }

    // Selection clipping
    const offset = this.mapper.offset;
    const hasSelClip = ctx.clipSelectionForOffset(paintCtx, offset);

    // Shift+click detection
    const isShiftLine = !!(ctx.shiftHeldRef.current && this._lastStrokeEnd);

    // Tool-specific setup (e.g. snapshot source canvas, compute deltas)
    const setupOk = this.onSetup(ctx, {
      layer: activeLayer,
      point: pt,
      mapper: this.mapper,
      dirtyRect: this.strokeDirtyRect,
      pressure: this.currentPressure,
      layerCanvas,
      paintCtx,
      hasSelectionClip: hasSelClip,
      isShiftLine,
      lastStrokeEnd: this._lastStrokeEnd
    });

    if (hasSelClip) {
      paintCtx.restore();
    }

    if (!setupOk) {
      this.lastPoint = null;
      this.mapper = null;
      this.activeLayerId = null;
      return false;
    }

    ctx.invalidateLayer?.(activeLayer.id);
    ctx.redraw();
    return true;
  }

  // ── Move ──────────────────────────────────────────────────────────────

  move(
    ctx: ToolContext,
    _event: ToolPointerEvent,
    coalescedPoints: ToolPointerEvent[]
  ): void {
    if (!this.lastPoint || !this.mapper || !this.activeLayerId) {
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

    // Selection clipping
    const offset = this.mapper.offset;
    const hasSelClip = this.useSelectionClipOnMove
      ? ctx.clipSelectionForOffset(paintCtx, offset)
      : false;

    for (const ep of coalescedPoints) {
      const pt = ep.point;
      if (
        !this.hasMoved &&
        this.lastPoint &&
        (pt.x !== this.lastPoint.x || pt.y !== this.lastPoint.y)
      ) {
        this.hasMoved = true;
      }

      this.currentPressure = coalescedStrokePressure(
        {
          pointerType: ep.nativeEvent.pointerType,
          pressure: ep.pressure
        } as PointerEvent,
        this.currentPressure || 0.5
      );

      const localFrom = this.mapper.docToLayer(this.lastPoint);
      const localTo = this.mapper.docToLayer(pt);

      this.onDraw({
        ctx,
        localFrom,
        localTo,
        docFrom: this.lastPoint,
        docTo: pt,
        paintCtx,
        layerCanvas,
        pressure: this.currentPressure
      });

      this.lastPoint = pt;
    }

    if (hasSelClip) {
      paintCtx.restore();
    }

    // Dirty-rect compositing (map from layer-space back to doc-space)
    ctx.invalidateLayer?.(this.activeLayerId);
    const dirty = this.strokeDirtyRect.current;
    if (dirty && dirty.minX < dirty.maxX && dirty.minY < dirty.maxY && this.mapper) {
      const docDirty = this.mapper.dirtyToDoc(dirty);
      ctx.redrawDirty(docDirty.x, docDirty.y, docDirty.w, docDirty.h);
    } else {
      ctx.requestRedraw();
    }
  }

  // ── End ───────────────────────────────────────────────────────────────

  end(ctx: ToolContext, event: ToolPointerEvent): void {
    const { doc } = ctx;
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

    // Save stroke endpoint for Shift+click straight line
    this._lastStrokeEnd = event.point;

    // Tool-specific teardown
    this.onTeardown();

    this.lastPoint = null;
    this.hasMoved = false;
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
    this.activeLayerId = null;
    ctx.redraw();

    if (activeLayer) {
      ctx.onStrokeEnd(activeLayer.id, null);
    }
  }
}
