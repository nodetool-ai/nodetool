/**
 * usePointerHandlers
 *
 * All pointer event handling for the sketch canvas: down, move, up, wheel.
 * Keyboard modifier tracking and utility callbacks are delegated to
 * useKeyboardModifiers and usePointerHandlerUtils respectively.
 */

import { useCallback, useEffect, useRef } from "react";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection,
  LayerTransform,
  LayerContentBounds
} from "../types";
import {
  isShapeTool,
  isPaintingTool,
  layerAllowsTransformWhilePixelLocked
} from "../types";
import {
  drawGradient as drawGradientUtil,
  floodFill as floodFillUtil
} from "../drawingUtils";
import type { ActiveStrokeInfo } from "./useCompositing";
import { getToolHandler } from "../tools";
import type {
  ToolContext,
  ToolPointerEvent,
  StrokeEndOptions
} from "../tools/types";
import { getCanvasRasterBounds } from "../painting";
import { useKeyboardModifiers } from "./useKeyboardModifiers";
import { usePointerHandlerUtils } from "./usePointerHandlerUtils";
import {
  cloneSelectionMask,
  combineMasks,
  type SelectionCombineOp,
  magicWandFromRgba,
  polygonToBinaryMask,
  rectSelectionMask,
  selectionHasAnyPixels,
  selectionHitTest,
  translateMask
} from "../selection/selectionMask";
import {
  SKETCH_ZOOM_MAX,
  SKETCH_ZOOM_MIN
} from "../state/useSketchStore";

function selectionCombineMode(shift: boolean, alt: boolean): SelectionCombineOp {
  if (shift && alt) {
    return "intersect";
  }
  if (shift) {
    return "add";
  }
  if (alt) {
    return "subtract";
  }
  return "replace";
}

export interface UsePointerHandlersParams {
  doc: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;
  selection?: Selection | null;
  selectStartRef: React.MutableRefObject<Point | null>;
  lassoPointsRef: React.MutableRefObject<Point[]>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  mousePositionRef: React.MutableRefObject<Point>;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer: (layerId: string) => void;
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;
  clearOverlay: () => void;
  drawSelectionOverlay: () => void;
  appendSelectionOverlay: () => void;
  drawOverlayShape: (start: Point, end: Point) => void;
  drawOverlayGradient: (start: Point, end: Point) => void;
  drawOverlayCrop: (start: Point, end: Point) => void;
  drawOverlaySelection: (start: Point, end: Point) => void;
  drawOverlayLassoPreview: (points: Point[], cursor: Point | null) => void;
  drawCursor: (screenX: number, screenY: number) => void;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  onStrokeStart: () => void;
  onStrokeEnd: (
    layerId: string,
    data: string | null,
    committedBounds?: LayerContentBounds,
    options?: StrokeEndOptions
  ) => void;
  onLayerTransformChange?: (layerId: string, transform: LayerTransform) => void;
  onLayerContentBoundsChange?: (
    layerId: string,
    contentBounds: { x: number; y: number; width: number; height: number }
  ) => void;
  onBrushSizeChange?: (size: number) => void;
  onContextMenu?: (x: number, y: number) => void;
  onCropComplete?: (
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  onEyedropperPick?: (color: string) => void;
  onSelectionChange?: (sel: Selection | null) => void;
  onAutoPickLayer?: (layerId: string) => void;
  foregroundColor?: string;
  /** Fires when the pointer leaves the canvas container (thumbnails, etc.). */
  onCanvasLeave?: () => void;
  setLayerTransformPreview?: (layerId: string, transform: LayerTransform) => void;
  clearLayerTransformPreview?: (layerId?: string) => void;
}

export interface UsePointerHandlersResult {
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  selectStartRef: React.MutableRefObject<Point | null>;
}

export function usePointerHandlers({
  doc,
  activeTool,
  zoom,
  pan,
  mirrorX,
  mirrorY,
  symmetryMode,
  symmetryRays,
  selection,
  selectStartRef,
  lassoPointsRef,
  displayCanvasRef,
  overlayCanvasRef,
  cursorCanvasRef,
  containerRef,
  layerCanvasesRef,
  mousePositionRef,
  activeStrokeRef,
  getOrCreateLayerCanvas,
  invalidateLayer,
  redraw,
  redrawDirty,
  requestRedraw,
  requestDirtyRedraw: _requestDirtyRedraw,
  clearOverlay,
  drawSelectionOverlay,
  appendSelectionOverlay,
  drawOverlayShape,
  drawOverlayGradient,
  drawOverlayCrop,
  drawOverlaySelection,
  drawOverlayLassoPreview,
  drawCursor,
  onZoomChange,
  onPanChange,
  onStrokeStart,
  onStrokeEnd,
  onLayerTransformChange,
  onLayerContentBoundsChange,
  onBrushSizeChange,
  onContextMenu,
  onCropComplete,
  onEyedropperPick,
  onSelectionChange,
  onAutoPickLayer,
  foregroundColor = "#000000",
  onCanvasLeave,
  setLayerTransformPreview,
  clearLayerTransformPreview
}: UsePointerHandlersParams): UsePointerHandlersResult {
  // ─── Core interaction state refs ────────────────────────────────────
  const isDrawingRef = useRef(false);
  const paintStrokeHasMovedRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const lastSmoothedPointRef = useRef<Point | null>(null);
  const isPanningRef = useRef(false);
  const isSpacePanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOffsetRef = useRef<Point>(pan);
  const isSizeDraggingRef = useRef(false);
  const sizeDragStartRef = useRef<Point>({ x: 0, y: 0 });
  const sizeDragInitialSize = useRef(0);

  // Tool-specific state
  const moveStartRef = useRef<Point | null>(null);
  const moveLayerStartTransformRef = useRef<LayerTransform>({ x: 0, y: 0 });
  const movePreviewTransformRef = useRef<LayerTransform | null>(null);
  const movePreviewLayerIdRef = useRef<string | null>(null);
  const gradientStartRef = useRef<Point | null>(null);
  const gradientEndRef = useRef<Point | null>(null);
  const cropStartRef = useRef<Point | null>(null);

  // Selection movement state
  const isMovingSelectionRef = useRef(false);
  const moveSelectionOriginRef = useRef<Point | null>(null);
  const selectionAtMoveStartRef = useRef<Selection | null>(null);

  /** Lasso + Shift: index of anchor point; segment (anchor → cursor) is a straight line. */
  const lassoStraightAnchorIndexRef = useRef(-1);
  const lassoStraightCursorRef = useRef<Point | null>(null);

  /** Shift/Alt at pointer-down for lasso or marquee (so key-up before mouse-up still applies combine). */
  const selectionDragModifiersRef = useRef<{ shift: boolean; alt: boolean } | null>(
    null
  );

  // Alpha lock & stroke tracking
  const alphaSnapshotRef = useRef<ImageData | null>(null);
  const lastStrokeEndRef = useRef<Point | null>(null);
  const currentPressureRef = useRef<number>(0.5);
  const paintLayerOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // Keep pan offset in sync
  useEffect(() => {
    panOffsetRef.current = pan;
  }, [pan]);

  // ─── Keyboard modifier tracking ─────────────────────────────────────
  const { shiftHeldRef, altHeldRef, spaceHeldRef, sKeyHeldRef } =
    useKeyboardModifiers({ isSpacePanningRef, isSizeDraggingRef });

  // ─── Utility callbacks + clone stamp / blur refs ────────────────────
  const {
    cloneSourceRef,
    cloneOffsetRef,
    clonePaintOffsetRef,
    cloneSourceCanvasRef,
    cloneSourceCanvasMetaRef,
    strokeDirtyRectRef,
    screenToCanvas,
    withMirror,
    rgbToHex,
    clipSelectionForOffset,
    ensureLayerViewportStorage,
    getLayerPaintOffset,
    getCloneSourceSignature,
    buildCloneSourceCanvas,
    drawBlurStroke,
    drawCloneStampStroke,
    drawActiveStrokePreview
  } = usePointerHandlerUtils({
    zoom,
    displayCanvasRef,
    overlayCanvasRef,
    activeStrokeRef,
    mirrorX,
    mirrorY,
    symmetryMode,
    symmetryRays,
    doc,
    layerCanvasesRef,
    selection,
    getOrCreateLayerCanvas,
    invalidateLayer,
    onLayerContentBoundsChange
  });

  // ─── Tool context ref ──────────────────────────────────────────────
  // Updated synchronously every render. Handlers read this ref to get
  // the latest values without needing all ToolContext properties in
  // their dependency arrays.
  const toolCtxRef = useRef<ToolContext>(null!);
  toolCtxRef.current = {
    doc,
    activeTool,
    zoom,
    pan,
    mirrorX,
    mirrorY,
    symmetryMode,
    symmetryRays,
    selection: selection ?? null,
    displayCanvasRef,
    overlayCanvasRef,
    cursorCanvasRef,
    containerRef,
    layerCanvasesRef,
    mousePositionRef,
    activeStrokeRef,
    getOrCreateLayerCanvas,
    invalidateLayer,
    redraw,
    redrawDirty,
    requestRedraw,
    requestDirtyRedraw: _requestDirtyRedraw,
    clearOverlay,
    drawSelectionOverlay,
    drawOverlayShape,
    drawOverlayGradient,
    drawOverlayCrop,
    drawOverlaySelection,
    drawOverlayLassoPreview,
    drawCursor,
    onZoomChange,
    onPanChange,
    onStrokeStart,
    onStrokeEnd,
    onLayerTransformChange,
    onLayerContentBoundsChange,
    onBrushSizeChange,
    onContextMenu,
    onCropComplete,
    onEyedropperPick,
    onSelectionChange,
    onAutoPickLayer,
    screenToCanvas,
    shiftHeldRef,
    altHeldRef,
    withMirror,
    clipSelectionForOffset,
  };

  // ─── Tool pointer event helpers ────────────────────────────────────
  const buildToolPointerEvent = (e: React.PointerEvent): ToolPointerEvent => ({
    point: toolCtxRef.current.screenToCanvas(e.clientX, e.clientY),
    pressure: e.pressure || 0.5,
    nativeEvent: e,
  });

  const buildCoalescedEvents = (e: React.PointerEvent): ToolPointerEvent[] => {
    const nativePointerEvent = e.nativeEvent as PointerEvent;
    const coalescedEvents =
      typeof nativePointerEvent.getCoalescedEvents === "function"
        ? nativePointerEvent.getCoalescedEvents()
        : [nativePointerEvent];
    return coalescedEvents.map((ep) => ({
      point: toolCtxRef.current.screenToCanvas(ep.clientX, ep.clientY),
      pressure: ep.pressure || 0.5,
      nativeEvent: e,
    }));
  };

  // ─── Pointer Down ──────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Clone stamp: Alt+click sets the clone source point
      if (e.button === 0 && e.altKey && activeTool === "clone_stamp") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        cloneSourceRef.current = pt;
        cloneOffsetRef.current = null;
        clonePaintOffsetRef.current = null;
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const signature = getCloneSourceSignature(
            activeLayer.id,
            doc.toolSettings.cloneStamp.sampling
          );
          cloneSourceCanvasRef.current = buildCloneSourceCanvas(
            activeLayer.id,
            doc.toolSettings.cloneStamp.sampling
          );
          cloneSourceCanvasMetaRef.current = cloneSourceCanvasRef.current
            ? {
                activeLayerId: activeLayer.id,
                sampling: doc.toolSettings.cloneStamp.sampling,
                signature
              }
            : null;
        }
        return;
      }

      // Alt+click on a painting tool samples color (eyedropper)
      if (
        e.button === 0 &&
        e.altKey &&
        isPaintingTool(activeTool) &&
        activeTool !== "clone_stamp" &&
        onEyedropperPick
      ) {
        const displayCanvas = displayCanvasRef.current;
        if (displayCanvas) {
          const ctx = displayCanvas.getContext("2d");
          if (ctx) {
            const pt = screenToCanvas(e.clientX, e.clientY);
            const pixel = ctx.getImageData(
              Math.round(pt.x),
              Math.round(pt.y),
              1,
              1
            ).data;
            onEyedropperPick(rgbToHex(pixel[0], pixel[1], pixel[2]));
          }
        }
        return;
      }

      // Alt+click pans except on the select tool (Alt = subtract from selection).
      // Middle-click or Space+drag always pan.
      if (
        e.button === 1 ||
        (e.button === 0 && e.altKey && activeTool !== "select") ||
        (e.button === 0 && spaceHeldRef.current)
      ) {
        isPanningRef.current = true;
        if (spaceHeldRef.current) {
          isSpacePanningRef.current = true;
        }
        panStartRef.current = {
          x: e.clientX - panOffsetRef.current.x,
          y: e.clientY - panOffsetRef.current.y
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) {
        return;
      }

      // S + drag to adjust brush size
      if (sKeyHeldRef.current && onBrushSizeChange) {
        isSizeDraggingRef.current = true;
        sizeDragStartRef.current = { x: e.clientX, y: e.clientY };
        const tool = activeTool;
        if (tool === "brush") {
          sizeDragInitialSize.current = doc.toolSettings.brush.size;
        } else if (tool === "pencil") {
          sizeDragInitialSize.current = doc.toolSettings.pencil.size;
        } else if (tool === "eraser") {
          sizeDragInitialSize.current = doc.toolSettings.eraser.size;
        } else if (tool === "blur") {
          sizeDragInitialSize.current = doc.toolSettings.blur.size;
        } else {
          sizeDragInitialSize.current = doc.toolSettings.brush.size;
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer || !activeLayer.visible) {
        return;
      }

      if (activeTool === "eyedropper") {
        const displayCanvas = displayCanvasRef.current;
        if (displayCanvas) {
          const ctx = displayCanvas.getContext("2d");
          if (ctx) {
            const pt = screenToCanvas(e.clientX, e.clientY);
            const pixel = ctx.getImageData(
              Math.round(pt.x),
              Math.round(pt.y),
              1,
              1
            ).data;
            const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
            containerRef.current?.dispatchEvent(
              new CustomEvent("sketch-eyedropper", {
                detail: { color: hex },
                bubbles: true
              })
            );
          }
        }
        return;
      }

      if (activeTool === "move") {
        const pt = screenToCanvas(e.clientX, e.clientY);

        // Alt+click: auto-pick the topmost layer with non-transparent pixels at click point
        if (e.altKey && onAutoPickLayer) {
          const px = Math.floor(pt.x);
          const py = Math.floor(pt.y);
          // Scan layers from top (last in array) to bottom (first in array)
          for (let i = doc.layers.length - 1; i >= 0; i--) {
            const layer = doc.layers[i];
            const skipForHit =
              !layer.visible || (layer.locked && !layer.imageReference);
            if (skipForHit) {
              continue;
            }
            const layerCanvas = layerCanvasesRef.current.get(layer.id);
            if (!layerCanvas) {
              continue;
            }
            const ctx = layerCanvas.getContext("2d");
            if (!ctx) {
              continue;
            }
            const compositeOffset = getLayerPaintOffset(layer.id);
            const localX = px - compositeOffset.x;
            const localY = py - compositeOffset.y;
            if (
              localX >= 0 &&
              localX < layerCanvas.width &&
              localY >= 0 &&
              localY < layerCanvas.height
            ) {
              const pixel = ctx.getImageData(localX, localY, 1, 1).data;
              if (pixel[3] > 0) {
                // Found a non-transparent pixel — switch to this layer
                onAutoPickLayer(layer.id);
                break;
              }
            }
          }
        }

        moveStartRef.current = pt;
        moveLayerStartTransformRef.current = {
          x: activeLayer.transform?.x ?? 0,
          y: activeLayer.transform?.y ?? 0
        };
        movePreviewTransformRef.current = {
          x: activeLayer.transform?.x ?? 0,
          y: activeLayer.transform?.y ?? 0
        };
        movePreviewLayerIdRef.current = activeLayer.id;
        clearLayerTransformPreview?.(activeLayer.id);
        isDrawingRef.current = true;
        onStrokeStart();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "crop") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        cropStartRef.current = pt;
        isDrawingRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "select") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const cw = doc.canvas.width;
        const ch = doc.canvas.height;
        const mode = doc.toolSettings.select.mode;
        if (
          mode !== "magic_wand" &&
          selection &&
          selectionHitTest(selection, pt.x, pt.y) &&
          !shiftHeldRef.current &&
          !altHeldRef.current
        ) {
          isMovingSelectionRef.current = true;
          moveSelectionOriginRef.current = pt;
          selectionAtMoveStartRef.current = cloneSelectionMask(selection);
          isDrawingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        if (mode === "magic_wand") {
          const display = displayCanvasRef.current;
          if (display && onSelectionChange) {
            const dctx = display.getContext("2d");
            if (dctx) {
              const id = dctx.getImageData(0, 0, cw, ch);
              const bin = magicWandFromRgba(
                id,
                pt.x,
                pt.y,
                doc.toolSettings.select.magicWandTolerance
              );
              const overlay: Selection = { width: cw, height: ch, data: bin };
              const op = selectionCombineMode(
                shiftHeldRef.current,
                altHeldRef.current
              );
              const base = op === "replace" ? null : selection ?? null;
              onSelectionChange(combineMasks(base, overlay, op));
            }
          }
          return;
        }
        if (mode === "lasso") {
          lassoStraightAnchorIndexRef.current = -1;
          lassoStraightCursorRef.current = null;
          lassoPointsRef.current = [pt];
          selectStartRef.current = null;
          selectionDragModifiersRef.current = {
            shift: shiftHeldRef.current,
            alt: altHeldRef.current
          };
          isDrawingRef.current = true;
          if (!shiftHeldRef.current && !altHeldRef.current) {
            onSelectionChange?.(null);
          }
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        selectStartRef.current = pt;
        lassoPointsRef.current = [];
        selectionDragModifiersRef.current = {
          shift: shiftHeldRef.current,
          alt: altHeldRef.current
        };
        isDrawingRef.current = true;
        if (!shiftHeldRef.current && !altHeldRef.current) {
          onSelectionChange?.(null);
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeLayer.locked && !layerAllowsTransformWhilePixelLocked(activeLayer)) {
        return;
      }

      if (activeTool === "fill") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        if (selection && selectionHasAnyPixels(selection)) {
          if (!selectionHitTest(selection, pt.x, pt.y)) {
            return;
          }
        }
        onStrokeStart();
        const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          paintLayerOffsetRef.current = ensuredBounds
            ? {
                x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
                y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
              }
            : getLayerPaintOffset(activeLayer.id);
          const localPt = {
            x: pt.x - paintLayerOffsetRef.current.x,
            y: pt.y - paintLayerOffsetRef.current.y
          };
          // Apply selection clip for fill
          const clipped = clipSelectionForOffset(
            ctx,
            paintLayerOffsetRef.current
          );
          floodFillUtil(ctx, localPt.x, localPt.y, {
            ...doc.toolSettings.fill,
            color: foregroundColor
          });
          if (clipped) {
            ctx.restore();
          }
          const committedBounds = getCanvasRasterBounds(layerCanvas) ?? undefined;
          onStrokeEnd(activeLayer.id, null, committedBounds);
          invalidateLayer(activeLayer.id);
          redraw();
        }
        return;
      }

      // Clone stamp: begin painting stroke
      if (activeTool === "clone_stamp") {
        if (!cloneSourceRef.current) {
          return;
        }
        const pt = screenToCanvas(e.clientX, e.clientY);
        if (!cloneOffsetRef.current) {
          cloneOffsetRef.current = {
            x: cloneSourceRef.current.x - pt.x,
            y: cloneSourceRef.current.y - pt.y
          };
        }
        clonePaintOffsetRef.current = null;
        const settings = doc.toolSettings.cloneStamp;
        const cloneSignature = getCloneSourceSignature(activeLayer.id, settings.sampling);
        const cachedMeta = cloneSourceCanvasMetaRef.current;
        if (
          !cloneSourceCanvasRef.current ||
          !cachedMeta ||
          cachedMeta.activeLayerId !== activeLayer.id ||
          cachedMeta.sampling !== settings.sampling ||
          cachedMeta.signature !== cloneSignature
        ) {
          cloneSourceCanvasRef.current = buildCloneSourceCanvas(
            activeLayer.id,
            settings.sampling
          );
          cloneSourceCanvasMetaRef.current = cloneSourceCanvasRef.current
            ? {
                activeLayerId: activeLayer.id,
                sampling: settings.sampling,
                signature: cloneSignature
              }
            : null;
        }
        isDrawingRef.current = true;
        paintStrokeHasMovedRef.current = false;
        lastPointRef.current = pt;
        lastSmoothedPointRef.current = pt;
        currentPressureRef.current = e.pressure || 0.5;
        onStrokeStart();
        const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
        paintLayerOffsetRef.current = ensuredBounds
          ? {
              x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
              y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
            }
          : getLayerPaintOffset(activeLayer.id);
        clonePaintOffsetRef.current =
          settings.sampling === "composited" && cloneOffsetRef.current
            ? {
                x: cloneOffsetRef.current.x + paintLayerOffsetRef.current.x,
                y: cloneOffsetRef.current.y + paintLayerOffsetRef.current.y
              }
            : cloneOffsetRef.current;
        strokeDirtyRectRef.current = null;
        if (activeLayer.alphaLock) {
          const lc = getOrCreateLayerCanvas(activeLayer.id);
          const snapCtx = lc.getContext("2d");
          if (snapCtx) {
            alphaSnapshotRef.current = snapCtx.getImageData(
              0,
              0,
              lc.width,
              lc.height
            );
          }
        } else {
          alphaSnapshotRef.current = null;
        }
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          const localPt = {
            x: pt.x - paintLayerOffsetRef.current.x,
            y: pt.y - paintLayerOffsetRef.current.y
          };
          drawCloneStampStroke(localPt, localPt, doc.toolSettings.cloneStamp, ctx);
          invalidateLayer(activeLayer.id);
          redraw();
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (isShapeTool(activeTool)) {
        const handler = getToolHandler(activeTool);
        const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
        if (started) {
          isDrawingRef.current = true;
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "gradient") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        gradientStartRef.current = pt;
        gradientEndRef.current = pt;
        isDrawingRef.current = true;
        onStrokeStart();
        const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
        paintLayerOffsetRef.current = ensuredBounds
          ? {
              x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
              y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
            }
          : getLayerPaintOffset(activeLayer.id);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser") {
        const handler = getToolHandler(activeTool);
        const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
        if (started) {
          isDrawingRef.current = true;
          // Live preview: render the merged active-layer preview on the overlay
          // for all paint tools while WebGPU hides the active layer underneath.
          if (activeStrokeRef.current) {
            drawActiveStrokePreview();
          }
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // ─── Blur: inline path ─────────────────────────────────────────────
      isDrawingRef.current = true;
      const pt = screenToCanvas(e.clientX, e.clientY);
      lastPointRef.current = pt;
      lastSmoothedPointRef.current = pt;
      currentPressureRef.current = e.pressure || 0.5;
      onStrokeStart();
      const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
      paintLayerOffsetRef.current = ensuredBounds
        ? {
            x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
            y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
          }
        : getLayerPaintOffset(activeLayer.id);

      strokeDirtyRectRef.current = null;

      if (activeLayer.alphaLock) {
        const layerCanvasForSnapshot = getOrCreateLayerCanvas(activeLayer.id);
        const snapCtx = layerCanvasForSnapshot.getContext("2d");
        if (snapCtx) {
          alphaSnapshotRef.current = snapCtx.getImageData(
            0,
            0,
            layerCanvasForSnapshot.width,
            layerCanvasForSnapshot.height
          );
        }
      } else {
        alphaSnapshotRef.current = null;
      }

      const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
      const paintCtx = layerCanvas.getContext("2d");
      if (paintCtx) {
        const currentOffset = paintLayerOffsetRef.current;
        const localPt = {
          x: pt.x - currentOffset.x,
          y: pt.y - currentOffset.y
        };
        const hasSelClip = clipSelectionForOffset(paintCtx, currentOffset);

        if (shiftHeldRef.current && lastStrokeEndRef.current) {
          const from = {
            x: lastStrokeEndRef.current.x - currentOffset.x,
            y: lastStrokeEndRef.current.y - currentOffset.y
          };
          if (activeTool === "blur") {
            drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
          }
        } else {
          if (activeTool === "blur") {
            drawBlurStroke(localPt, localPt, doc.toolSettings.blur, layerCanvas);
          }
        }

        if (hasSelClip) {
          paintCtx.restore();
        }

        invalidateLayer(activeLayer.id);
        redraw();
      }

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      doc,
      activeTool,
      selection,
      screenToCanvas,
      onStrokeStart,
      onStrokeEnd,
      onBrushSizeChange,
      getOrCreateLayerCanvas,
      drawBlurStroke,
      drawCloneStampStroke,
      redraw,
      clipSelectionForOffset,
      onEyedropperPick,
      rgbToHex,
      ensureLayerViewportStorage,
      getLayerPaintOffset,
      onSelectionChange,
      containerRef,
      displayCanvasRef,
      layerCanvasesRef,
      onAutoPickLayer,
      activeStrokeRef,
      invalidateLayer,
      getCloneSourceSignature,
      buildCloneSourceCanvas,
      drawActiveStrokePreview,
      cloneSourceRef,
      cloneOffsetRef,
      clonePaintOffsetRef,
      cloneSourceCanvasRef,
      cloneSourceCanvasMetaRef,
      strokeDirtyRectRef,
      spaceHeldRef,
      sKeyHeldRef,
      shiftHeldRef,
      altHeldRef,
      foregroundColor,
      clearLayerTransformPreview,
      lassoPointsRef,
      selectStartRef
    ]
  );

  // ─── Pointer Move ──────────────────────────────────────────────────

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanningRef.current) {
        const newPan = {
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y
        };
        panOffsetRef.current = newPan;
        onPanChange(newPan);
        return;
      }

      if (isSizeDraggingRef.current && onBrushSizeChange) {
        const dx = e.clientX - sizeDragStartRef.current.x;
        const maxSize = activeTool === "pencil" ? 10 : 200;
        const newSize = Math.max(
          1,
          Math.min(maxSize, Math.round(sizeDragInitialSize.current + dx * 0.5))
        );
        onBrushSizeChange(newSize);
        return;
      }

      if (!isDrawingRef.current) {
        return;
      }

      // Key off moveStartRef, not activeTool — the closure can lag the store right
      // after switching tools (e.g. V for move), which would skip this branch while
      // isDrawingRef is still true from pointerDown.
      if (moveStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const dx = pt.x - moveStartRef.current.x;
        const dy = pt.y - moveStartRef.current.y;
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const previewTransform = {
            x: Math.round(moveLayerStartTransformRef.current.x + dx),
            y: Math.round(moveLayerStartTransformRef.current.y + dy)
          };
          movePreviewTransformRef.current = previewTransform;
          movePreviewLayerIdRef.current = activeLayer.id;
          setLayerTransformPreview?.(activeLayer.id, previewTransform);
        }
        return;
      }

      if (isShapeTool(activeTool)) {
        const handler = getToolHandler(activeTool);
        handler.onMove?.(toolCtxRef.current, buildToolPointerEvent(e), []);
        return;
      }

      if (activeTool === "gradient" && gradientStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        gradientEndRef.current = pt;
        drawOverlayGradient(gradientStartRef.current, pt);
        return;
      }

      if (activeTool === "crop" && cropStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        drawOverlayCrop(cropStartRef.current, pt);
        return;
      }

      if (
        activeTool === "select" &&
        isMovingSelectionRef.current &&
        moveSelectionOriginRef.current &&
        selectionAtMoveStartRef.current
      ) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const dx = Math.round(pt.x - moveSelectionOriginRef.current.x);
        const dy = Math.round(pt.y - moveSelectionOriginRef.current.y);
        const orig = selectionAtMoveStartRef.current;
        if (onSelectionChange) {
          onSelectionChange(translateMask(orig, dx, dy));
        }
        return;
      }

      if (activeTool === "select" && lassoPointsRef.current.length > 0) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const pts = lassoPointsRef.current;

        if (shiftHeldRef.current) {
          if (lassoStraightAnchorIndexRef.current < 0) {
            lassoStraightAnchorIndexRef.current = Math.max(0, pts.length - 1);
          }
          lassoStraightCursorRef.current = pt;
          const anchor = lassoStraightAnchorIndexRef.current;
          const prefix = pts.slice(0, anchor + 1);
          drawOverlayLassoPreview([...prefix, pt], pt);
          return;
        }

        if (
          lassoStraightAnchorIndexRef.current >= 0 &&
          lassoStraightCursorRef.current
        ) {
          const end = lassoStraightCursorRef.current;
          const lastCommitted = pts[pts.length - 1];
          if (!lastCommitted || lastCommitted.x !== end.x || lastCommitted.y !== end.y) {
            pts.push(end);
          }
          lassoStraightAnchorIndexRef.current = -1;
          lassoStraightCursorRef.current = null;
        }

        const last = pts[pts.length - 1];
        if (!last || last.x !== pt.x || last.y !== pt.y) {
          pts.push(pt);
        }
        drawOverlayLassoPreview(pts, pt);
        return;
      }

      if (activeTool === "select" && selectStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        drawOverlaySelection(selectStartRef.current, pt);
        return;
      }

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser") {
        const handler = getToolHandler(activeTool);
        handler.onMove?.(
          toolCtxRef.current,
          buildToolPointerEvent(e),
          buildCoalescedEvents(e)
        );
        // Live preview: render the merged active-layer preview on the overlay
        // for all paint tools while WebGPU hides the active layer underneath.
        if (activeStrokeRef.current) {
          drawActiveStrokePreview();
        }
        return;
      }

      // ─── Blur / Clone Stamp: inline path ──────────────────────────────
      if (!lastPointRef.current) {
        return;
      }
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer) {
        return;
      }

      const nativePointerEvent = e.nativeEvent as PointerEvent;
      const coalescedEvents =
        typeof nativePointerEvent.getCoalescedEvents === "function"
          ? nativePointerEvent.getCoalescedEvents()
          : [nativePointerEvent];
      const eventPoints = coalescedEvents.map((eventPoint) => ({
        point: screenToCanvas(eventPoint.clientX, eventPoint.clientY),
        pressure: eventPoint.pressure || currentPressureRef.current || 0.5
      }));
      if (eventPoints.length === 0) {
        return;
      }

      const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
      const currentOffset = paintLayerOffsetRef.current;

      const ctx = layerCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const hasSelectionClip = clipSelectionForOffset(ctx, currentOffset);

      const pointsToProcess =
        activeTool === "blur" ? [eventPoints[eventPoints.length - 1]] : eventPoints;

      for (const eventPoint of pointsToProcess) {
        const pt = eventPoint.point;
        if (
          !paintStrokeHasMovedRef.current &&
          lastPointRef.current &&
          (pt.x !== lastPointRef.current.x || pt.y !== lastPointRef.current.y)
        ) {
          paintStrokeHasMovedRef.current = true;
        }
        const localPt = {
          x: pt.x - currentOffset.x,
          y: pt.y - currentOffset.y
        };
        const pressure = eventPoint.pressure;
        currentPressureRef.current = pressure;

        if (activeTool === "blur") {
          const from = lastPointRef.current
            ? {
                x: lastPointRef.current.x - currentOffset.x,
                y: lastPointRef.current.y - currentOffset.y
              }
            : localPt;
          drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
        } else if (activeTool === "clone_stamp") {
          const from = lastPointRef.current
            ? {
                x: lastPointRef.current.x - currentOffset.x,
                y: lastPointRef.current.y - currentOffset.y
              }
            : localPt;
          drawCloneStampStroke(
            from,
            localPt,
            doc.toolSettings.cloneStamp,
            ctx
          );
        }

        lastPointRef.current = pt;
      }

      if (hasSelectionClip) {
        ctx.restore();
      }

      invalidateLayer(activeLayer.id);
      // Use dirty-rect compositing during painting for better performance on large canvases
      const dirty = strokeDirtyRectRef.current;
      if (dirty && dirty.minX < dirty.maxX && dirty.minY < dirty.maxY) {
        redrawDirty(
          dirty.minX + currentOffset.x,
          dirty.minY + currentOffset.y,
          dirty.maxX - dirty.minX,
          dirty.maxY - dirty.minY
        );
      } else {
        requestRedraw();
      }
    },
    [
      doc,
      activeTool,
      screenToCanvas,
      onPanChange,
      onBrushSizeChange,
      getOrCreateLayerCanvas,
      drawBlurStroke,
      drawCloneStampStroke,
      drawOverlayGradient,
      drawOverlayCrop,
      redrawDirty,
      requestRedraw,
      clipSelectionForOffset,
      drawOverlaySelection,
      drawOverlayLassoPreview,
      lassoPointsRef,
      selectStartRef,
      shiftHeldRef,
      onSelectionChange,
      setLayerTransformPreview,
      activeStrokeRef,
      invalidateLayer,
      drawActiveStrokePreview,
      strokeDirtyRectRef
    ]
  );

  // ─── Pointer Up ─────────────────────────────────────────────────────

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }

      if (isSizeDraggingRef.current) {
        isSizeDraggingRef.current = false;
        return;
      }

      if (!isDrawingRef.current) {
        return;
      }
      isDrawingRef.current = false;

      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

      // Same as pointerMove: finalize using gesture refs, not activeTool closure.
      if (moveStartRef.current) {
        const previewLayerId = movePreviewLayerIdRef.current;
        const previewTransform = movePreviewTransformRef.current;
        if (previewLayerId && previewTransform && onLayerTransformChange) {
          onLayerTransformChange(previewLayerId, previewTransform);
        }
        clearLayerTransformPreview?.(previewLayerId ?? undefined);
        moveStartRef.current = null;
        moveLayerStartTransformRef.current = { x: 0, y: 0 };
        movePreviewTransformRef.current = null;
        movePreviewLayerIdRef.current = null;
        // Move only changes transform; pixels are unchanged. Do not enqueue the
        // deferred getLayerData sync used by paint tools — it can overwrite
        // document `layer.data` with empty/not-yet-hydrated CPU canvases.
        if (activeLayer) {
          onStrokeEnd(activeLayer.id, null, undefined, {
            syncDocumentFromCanvas: false
          });
        }
        return;
      }
      if (activeTool === "clone_stamp") {
        clonePaintOffsetRef.current = null;
      }

      if (isShapeTool(activeTool)) {
        const handler = getToolHandler(activeTool);
        handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));
        return;
      }

      if (
        activeTool === "gradient" &&
        gradientStartRef.current &&
        activeLayer
      ) {
        const start = gradientStartRef.current;
        const end = gradientEndRef.current ?? start;
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          const currentOffset = paintLayerOffsetRef.current;
          drawGradientUtil(
            ctx,
            {
              x: start.x - currentOffset.x,
              y: start.y - currentOffset.y
            },
            {
              x: end.x - currentOffset.x,
              y: end.y - currentOffset.y
            },
            doc.toolSettings.gradient
          );
          const committedBounds = getCanvasRasterBounds(layerCanvas) ?? undefined;
          onStrokeEnd(activeLayer.id, null, committedBounds);
          invalidateLayer(activeLayer.id);
          clearOverlay();
          drawSelectionOverlay();
          redraw();
        }
        gradientStartRef.current = null;
        gradientEndRef.current = null;
        return;
      }

      if (activeTool === "crop" && cropStartRef.current) {
        const pt = screenToCanvas(
          mousePositionRef.current.x +
            (containerRef.current?.getBoundingClientRect().left ?? 0),
          mousePositionRef.current.y +
            (containerRef.current?.getBoundingClientRect().top ?? 0)
        );
        const x1 = Math.round(Math.min(cropStartRef.current.x, pt.x));
        const y1 = Math.round(Math.min(cropStartRef.current.y, pt.y));
        const x2 = Math.round(Math.max(cropStartRef.current.x, pt.x));
        const y2 = Math.round(Math.max(cropStartRef.current.y, pt.y));
        const w = x2 - x1;
        const h = y2 - y1;
        clearOverlay();
        drawSelectionOverlay();
        cropStartRef.current = null;
        if (w > 1 && h > 1 && onCropComplete) {
          onCropComplete(x1, y1, w, h);
        }
        return;
      }

      // Finalize selection movement
      if (activeTool === "select" && isMovingSelectionRef.current) {
        isMovingSelectionRef.current = false;
        moveSelectionOriginRef.current = null;
        selectionAtMoveStartRef.current = null;
        return;
      }

      if (activeTool === "select" && lassoPointsRef.current.length > 0) {
        const pt = screenToCanvas(
          mousePositionRef.current.x +
            (containerRef.current?.getBoundingClientRect().left ?? 0),
          mousePositionRef.current.y +
            (containerRef.current?.getBoundingClientRect().top ?? 0)
        );
        if (
          lassoStraightAnchorIndexRef.current >= 0 &&
          lassoStraightCursorRef.current
        ) {
          const ptsMut = lassoPointsRef.current;
          const end = lassoStraightCursorRef.current;
          const lastM = ptsMut[ptsMut.length - 1];
          if (!lastM || lastM.x !== end.x || lastM.y !== end.y) {
            ptsMut.push(end);
          }
          lassoStraightAnchorIndexRef.current = -1;
          lassoStraightCursorRef.current = null;
        }
        const pts = [...lassoPointsRef.current];
        lassoPointsRef.current = [];
        const last = pts[pts.length - 1];
        if (!last || last.x !== pt.x || last.y !== pt.y) {
          pts.push(pt);
        }
        clearOverlay();
        drawSelectionOverlay();
        selectStartRef.current = null;
        const cw = doc.canvas.width;
        const ch = doc.canvas.height;
        if (pts.length >= 3 && onSelectionChange) {
          const bin = polygonToBinaryMask(cw, ch, pts);
          const overlay: Selection = { width: cw, height: ch, data: bin };
          if (selectionHasAnyPixels(overlay)) {
            const mod = selectionDragModifiersRef.current;
            selectionDragModifiersRef.current = null;
            const op = selectionCombineMode(
              mod?.shift ?? shiftHeldRef.current,
              mod?.alt ?? altHeldRef.current
            );
            const base = op === "replace" ? null : selection ?? null;
            onSelectionChange(combineMasks(base, overlay, op));
          }
        }
        selectionDragModifiersRef.current = null;
        return;
      }

      if (activeTool === "select" && selectStartRef.current) {
        const pt = screenToCanvas(
          mousePositionRef.current.x +
            (containerRef.current?.getBoundingClientRect().left ?? 0),
          mousePositionRef.current.y +
            (containerRef.current?.getBoundingClientRect().top ?? 0)
        );
        const x = Math.round(Math.min(selectStartRef.current.x, pt.x));
        const y = Math.round(Math.min(selectStartRef.current.y, pt.y));
        const w = Math.round(Math.abs(pt.x - selectStartRef.current.x));
        const h = Math.round(Math.abs(pt.y - selectStartRef.current.y));
        clearOverlay();
        selectStartRef.current = null;
        const cw = doc.canvas.width;
        const ch = doc.canvas.height;
        if (w > 1 && h > 1 && onSelectionChange) {
          const overlay = rectSelectionMask(cw, ch, x, y, w, h);
          const mod = selectionDragModifiersRef.current;
          selectionDragModifiersRef.current = null;
          const op = selectionCombineMode(
            mod?.shift ?? shiftHeldRef.current,
            mod?.alt ?? altHeldRef.current
          );
          const base = op === "replace" ? null : selection ?? null;
          onSelectionChange(combineMasks(base, overlay, op));
        } else {
          selectionDragModifiersRef.current = null;
        }
        drawSelectionOverlay();
        return;
      }

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser") {
        const handler = getToolHandler(activeTool);
        handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));
        // Shift-line continuation keeps `activeStrokeRef` until the next non-shift
        // stroke; WebGPU hides the active layer while it is set, so the 2D overlay
        // must keep showing the merged preview — do not clear it in that case.
        if (activeStrokeRef.current) {
          drawActiveStrokePreview();
          appendSelectionOverlay();
        } else {
          clearOverlay();
          drawSelectionOverlay();
        }
        return;
      }

      // ─── Blur / Clone Stamp: inline cleanup path ──────────────────────
      // Save the stroke endpoint for Shift+click straight line feature
      if (isPaintingTool(activeTool)) {
        lastStrokeEndRef.current = screenToCanvas(e.clientX, e.clientY);
      }

      clearOverlay();
      drawSelectionOverlay();

      lastPointRef.current = null;
      lastSmoothedPointRef.current = null;
      paintStrokeHasMovedRef.current = false;
      paintLayerOffsetRef.current = { x: 0, y: 0 };

      // Alpha lock: restore original alpha channel after merging
      if (activeLayer?.alphaLock && alphaSnapshotRef.current) {
        const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
        if (layerCanvas) {
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            const dirtyRect = strokeDirtyRectRef.current ?? {
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
              const currentData = ctx.getImageData(x, y, width, height);
              const snapshot = alphaSnapshotRef.current;
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
              ctx.putImageData(currentData, x, y);
              invalidateLayer(activeLayer.id);
            }
          }
        }
        alphaSnapshotRef.current = null;
      }
      strokeDirtyRectRef.current = null;
      redraw();

      if (activeLayer) {
        const layerId = activeLayer.id;
        const layerCanvas = layerCanvasesRef.current.get(layerId);
        const committedBounds = getCanvasRasterBounds(layerCanvas) ?? undefined;
        onStrokeEnd(layerId, null, committedBounds);
      }
    },
    [
      doc,
      activeTool,
      selection,
      onStrokeEnd,
      onLayerTransformChange,
      clearLayerTransformPreview,
      onCropComplete,
      getOrCreateLayerCanvas,
      clearOverlay,
      drawSelectionOverlay,
      appendSelectionOverlay,
      drawActiveStrokePreview,
      activeStrokeRef,
      redraw,
      screenToCanvas,
      onSelectionChange,
      containerRef,
      mousePositionRef,
      layerCanvasesRef,
      invalidateLayer,
      clonePaintOffsetRef,
      strokeDirtyRectRef,
      shiftHeldRef,
      altHeldRef,
      lassoPointsRef,
      selectStartRef
    ]
  );

  // ─── Wheel zoom ────────────────────────────────────────────────────

  const handleZoomWheel = useCallback(
    (
      event: Pick<WheelEvent, "deltaY" | "clientX" | "clientY" | "preventDefault">
    ) => {
      event.preventDefault();
      const factor = 1.3;
      const delta = event.deltaY > 0 ? 1 / factor : factor;
      const newZoom = Math.max(
        SKETCH_ZOOM_MIN,
        Math.min(SKETCH_ZOOM_MAX, zoom * delta)
      );
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = mouseX - centerX - pan.x;
        const offsetY = mouseY - centerY - pan.y;
        const zoomRatio = newZoom / zoom;
        onPanChange({
          x: pan.x + offsetX * (1 - zoomRatio),
          y: pan.y + offsetY * (1 - zoomRatio)
        });
      }
      onZoomChange(newZoom);
    },
    [zoom, pan, onZoomChange, onPanChange, containerRef]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      handleZoomWheel(e.nativeEvent);
    },
    [handleZoomWheel]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      handleZoomWheel(event);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, handleZoomWheel]);

  // ─── Mouse events (cursor + context menu) ──────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        mousePositionRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        drawCursor(mousePositionRef.current.x, mousePositionRef.current.y);
      }
    },
    [drawCursor, containerRef, mousePositionRef]
  );

  const handleMouseLeave = useCallback(() => {
    const cursorCanvas = cursorCanvasRef.current;
    if (cursorCanvas) {
      const ctx = cursorCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      }
    }
    onCanvasLeave?.();
  }, [cursorCanvasRef, onCanvasLeave]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (onContextMenu) {
        onContextMenu(e.clientX, e.clientY);
      }
    },
    [onContextMenu]
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    handleMouseMove,
    handleMouseLeave,
    handleContextMenu,
    shiftHeldRef,
    altHeldRef,
    selectStartRef
  };
}
