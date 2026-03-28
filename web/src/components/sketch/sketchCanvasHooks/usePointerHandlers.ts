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
  isLayerCompositeVisible,
  layerAllowsTransformWhilePixelLocked
} from "../types";
import {
  drawGradient as drawGradientUtil,
  floodFill as floodFillUtil
} from "../drawingUtils";
import type { ActiveStrokeInfo } from "./useCompositing";
import { Canvas2DRuntime } from "../rendering";
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
  ellipseSelectionMask,
  marqueeAdjustedDocPoints,
  marqueeRectFromDocPoints,
  rectSelectionMask,
  selectionHasAnyPixels,
  selectionHitTest,
  translateMask
} from "../selection/selectionMask";
import {
  useSketchStore,
  SKETCH_ZOOM_MAX,
  SKETCH_ZOOM_MIN
} from "../state/useSketchStore";
import {
  coalescedStrokePressure,
  normalizePointerPressure,
  pointerHasPaintContact
} from "../pointerPen";

/**
 * Wheel zoom smoothing: lerp factor per frame blends between min (near target)
 * and max (far) using relative error — lazy overall motion, a bit quicker when
 * the gap is large so stacked wheel events still land without feeling snappy.
 */
const WHEEL_ZOOM_SMOOTH_MIN = 0.26;
const WHEEL_ZOOM_SMOOTH_MAX = 0.72;

/** Rect/ellipse marquee: require this much document-space drag (px) before committing a mask. */
const MARQUEE_MIN_DRAG_DOC_PX = 1;

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

/** Matches `useOverlayRenderer` brush-ring tools (software cursor). */
function interactionToolShowsBrushCursor(t: SketchTool): boolean {
  return (
    t === "brush" ||
    t === "pencil" ||
    t === "eraser" ||
    t === "blur" ||
    t === "clone_stamp"
  );
}

export interface UsePointerHandlersParams {
  doc: SketchDocument;
  activeTool: SketchTool;
  /** Effective tool for gestures (spring-loaded move uses "move" while `activeTool` may stay brush). */
  interactionTool: SketchTool;
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
  drawCursor: (clientX: number, clientY: number) => void;
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
  /** Layer isolation (must match on-screen composite for wand / eyedropper readback). */
  isolatedLayerId?: string | null;
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
  handleDoubleClick: (e: React.MouseEvent) => void;
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
  interactionTool,
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
  isolatedLayerId,
  onSelectionChange,
  onAutoPickLayer,
  foregroundColor = "#000000",
  onCanvasLeave,
  setLayerTransformPreview,
  clearLayerTransformPreview
}: UsePointerHandlersParams): UsePointerHandlersResult {
  const drawCursorRef = useRef(drawCursor);
  drawCursorRef.current = drawCursor;
  const interactionToolCursorRef = useRef(interactionTool);
  interactionToolCursorRef.current = interactionTool;

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

  /** Shift/Alt at pointer-down for lasso / polygon / wand (combine); key-up before up still applies. */
  const selectionDragModifiersRef = useRef<{ shift: boolean; alt: boolean } | null>(
    null
  );

  /**
   * Rect/ellipse: Shift/Alt at pointer-down set combine (add / subtract / intersect),
   * same as lasso. While dragging, live Shift/Alt in refs control constrain and
   * from-center; commit still uses these captured flags for combine op only.
   */
  const marqueeCombineAtDownRef = useRef<{
    shift: boolean;
    alt: boolean;
  } | null>(null);

  /**
   * Rect/ellipse: true after pointermove shows ≥ {@link MARQUEE_MIN_DRAG_DOC_PX}
   * document-pixel delta from the marquee anchor. Distinguishes a deliberate drag
   * (including a 1×1 mask when zoomed) from a click whose pointer-up coords may
   * not exactly match pointer-down.
   */
  const marqueeDocDragSeenRef = useRef(false);

  // Alpha lock & stroke tracking
  const alphaSnapshotRef = useRef<ImageData | null>(null);
  const lastStrokeEndRef = useRef<Point | null>(null);
  const currentPressureRef = useRef<number>(0.5);
  const paintLayerOffsetRef = useRef<Point>({ x: 0, y: 0 });

  /**
   * WebGPU uses a "webgpu" context on the display canvas, so getContext("2d") is null.
   * Magic wand and eyedropper need RGBA; we composite once via Canvas2D onto this buffer
   * (same shared layer map as the active runtime).
   */
  const displayReadbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayReadbackRuntimeRef = useRef<Canvas2DRuntime | null>(null);

  // Keep pan offset in sync
  useEffect(() => {
    panOffsetRef.current = pan;
  }, [pan]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const zoomWheelRafRef = useRef<number | null>(null);
  const zoomWheelAnimatedRef = useRef(zoom);
  const zoomWheelTargetRef = useRef(zoom);
  const zoomWheelPanRef = useRef<Point>({ x: pan.x, y: pan.y });
  const zoomWheelOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onPanChangeRef = useRef(onPanChange);
  onPanChangeRef.current = onPanChange;

  useEffect(() => {
    if (zoomWheelRafRef.current != null) {
      const a = zoomWheelAnimatedRef.current;
      const t = zoomWheelTargetRef.current;
      if (Math.abs(zoom - a) > 1e-3 && Math.abs(zoom - t) > 1e-3) {
        cancelAnimationFrame(zoomWheelRafRef.current);
        zoomWheelRafRef.current = null;
      }
    }
    if (zoomWheelRafRef.current == null) {
      zoomWheelAnimatedRef.current = zoom;
      zoomWheelTargetRef.current = zoom;
    }
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (zoomWheelRafRef.current != null) {
        cancelAnimationFrame(zoomWheelRafRef.current);
        zoomWheelRafRef.current = null;
      }
    };
  }, []);

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
    activeTool: interactionTool,
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
    pressure: normalizePointerPressure(e.nativeEvent),
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
      pressure: normalizePointerPressure(ep),
      nativeEvent: e,
    }));
  };

  const getFullCompositeImageData = useCallback((): ImageData | null => {
    const cw = doc.canvas.width;
    const ch = doc.canvas.height;
    const display = displayCanvasRef.current;
    if (display) {
      const d2d = display.getContext("2d", { willReadFrequently: true });
      if (d2d && display.width === cw && display.height === ch) {
        return d2d.getImageData(0, 0, cw, ch);
      }
    }
    let rb = displayReadbackCanvasRef.current;
    if (!rb || rb.width !== cw || rb.height !== ch) {
      rb = document.createElement("canvas");
      rb.width = cw;
      rb.height = ch;
      displayReadbackCanvasRef.current = rb;
    }
    if (!displayReadbackRuntimeRef.current) {
      displayReadbackRuntimeRef.current = new Canvas2DRuntime(
        layerCanvasesRef.current
      );
    }
    const rt = displayReadbackRuntimeRef.current;
    rt.zoom = zoom;
    // First getContext wins for willReadFrequently; compositeToDisplay uses getContext("2d")
    // without attributes, so we must acquire a readback-friendly context before compositing.
    void rb.getContext("2d", { willReadFrequently: true });
    rt.compositeToDisplay(
      rb,
      doc,
      isolatedLayerId ?? null,
      activeStrokeRef.current,
      null
    );
    const rctx = rb.getContext("2d", { willReadFrequently: true });
    return rctx ? rctx.getImageData(0, 0, cw, ch) : null;
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- displayCanvasRef, layerCanvasesRef, activeStrokeRef are stable
  [doc, zoom, isolatedLayerId]);

  const sampleRgbAtDocPoint = useCallback(
    (clientX: number, clientY: number): { r: number; g: number; b: number } | null => {
      const pt = screenToCanvas(clientX, clientY);
      const x = Math.round(pt.x);
      const y = Math.round(pt.y);
      const display = displayCanvasRef.current;
      if (
        display &&
        x >= 0 &&
        x < display.width &&
        y >= 0 &&
        y < display.height
      ) {
        const ctx = display.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          return { r: pixel[0], g: pixel[1], b: pixel[2] };
        }
      }
      const id = getFullCompositeImageData();
      if (!id) {
        return null;
      }
      if (x < 0 || y < 0 || x >= id.width || y >= id.height) {
        return null;
      }
      const i = (y * id.width + x) * 4;
      return { r: id.data[i], g: id.data[i + 1], b: id.data[i + 2] };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayCanvasRef is stable; read via .current
    [screenToCanvas, getFullCompositeImageData]
  );

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
        !(e.ctrlKey || e.metaKey) &&
        isPaintingTool(activeTool) &&
        activeTool !== "clone_stamp" &&
        onEyedropperPick
      ) {
        const rgb = sampleRgbAtDocPoint(e.clientX, e.clientY);
        if (rgb) {
          onEyedropperPick(rgbToHex(rgb.r, rgb.g, rgb.b));
        }
        return;
      }

      // Alt+click pans except on the select tool (Alt = subtract from selection).
      // Middle-click or Space+drag always pan.
      if (
        e.button === 1 ||
        (e.button === 0 &&
          e.altKey &&
          !(e.ctrlKey || e.metaKey) &&
          interactionTool !== "select") ||
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

      // Pen hover must not start left-button gestures (some stacks fire pointerdown).
      if (!pointerHasPaintContact(e.nativeEvent)) {
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
      if (!activeLayer) {
        return;
      }
      // Selection (rect/lasso/magic wand, move mask) does not paint the active
      // layer — allow it even when the active layer is hidden.
      if (!activeLayer.visible && interactionTool !== "select") {
        return;
      }

      if (interactionTool === "eyedropper") {
        const rgb = sampleRgbAtDocPoint(e.clientX, e.clientY);
        if (rgb) {
          const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
          containerRef.current?.dispatchEvent(
            new CustomEvent("sketch-eyedropper", {
              detail: { color: hex },
              bubbles: true
            })
          );
        }
        return;
      }

      if (interactionTool === "move") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        let moveTargetLayer = activeLayer;

        if ((e.ctrlKey || e.metaKey) && e.altKey) {
          useSketchStore.getState().duplicateLayer(activeLayer.id);
          const freshDoc = useSketchStore.getState().document;
          const dup = freshDoc.layers.find((l) => l.id === freshDoc.activeLayerId);
          if (dup) {
            moveTargetLayer = dup;
          }
        } else if (e.altKey && onAutoPickLayer) {
          const px = Math.floor(pt.x);
          const py = Math.floor(pt.y);
          for (let i = doc.layers.length - 1; i >= 0; i--) {
            const layer = doc.layers[i];
            const skipForHit =
              !isLayerCompositeVisible(doc.layers, layer, null) ||
              (layer.locked && !layer.imageReference);
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
                onAutoPickLayer(layer.id);
                break;
              }
            }
          }
        }

        moveStartRef.current = pt;
        moveLayerStartTransformRef.current = {
          x: moveTargetLayer.transform?.x ?? 0,
          y: moveTargetLayer.transform?.y ?? 0
        };
        movePreviewTransformRef.current = {
          x: moveTargetLayer.transform?.x ?? 0,
          y: moveTargetLayer.transform?.y ?? 0
        };
        movePreviewLayerIdRef.current = moveTargetLayer.id;
        clearLayerTransformPreview?.(moveTargetLayer.id);
        isDrawingRef.current = true;
        onStrokeStart();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (interactionTool === "transform") {
        const handler = getToolHandler(interactionTool);
        const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
        if (started) {
          isDrawingRef.current = true;
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (interactionTool === "crop") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        cropStartRef.current = pt;
        isDrawingRef.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (interactionTool === "select") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const cw = doc.canvas.width;
        const ch = doc.canvas.height;
        const mode = doc.toolSettings.select.mode;
        const polygonInProgress =
          mode === "lasso_polygon" && lassoPointsRef.current.length > 0;
        if (
          mode !== "magic_wand" &&
          !polygonInProgress &&
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
          if (onSelectionChange) {
            const id = getFullCompositeImageData();
            if (id) {
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
        if (mode === "lasso_polygon") {
          // Click to add vertices; pointer-move rubber-band when !isDrawing (below).
          // Double-click closes the polygon (handleDoubleClick).
          selectStartRef.current = null;
          const isFirstVertex = lassoPointsRef.current.length === 0;
          if (isFirstVertex) {
            selectionDragModifiersRef.current = {
              shift: shiftHeldRef.current,
              alt: altHeldRef.current
            };
            if (!shiftHeldRef.current && !altHeldRef.current) {
              onSelectionChange?.(null);
            }
          }
          lassoPointsRef.current = [...lassoPointsRef.current, pt];
          drawOverlayLassoPreview(lassoPointsRef.current, pt);
          return;
        }
        selectStartRef.current = pt;
        lassoPointsRef.current = [];
        marqueeDocDragSeenRef.current = false;
        marqueeCombineAtDownRef.current = {
          shift: shiftHeldRef.current,
          alt: altHeldRef.current
        };
        selectionDragModifiersRef.current = null;
        isDrawingRef.current = true;
        const marqueeOpAtDown = selectionCombineMode(
          marqueeCombineAtDownRef.current.shift,
          marqueeCombineAtDownRef.current.alt
        );
        if (marqueeOpAtDown === "replace") {
          onSelectionChange?.(null);
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeLayer.locked && !layerAllowsTransformWhilePixelLocked(activeLayer)) {
        return;
      }

      if (interactionTool === "fill") {
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
      if (interactionTool === "clone_stamp") {
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
        currentPressureRef.current = normalizePointerPressure(e.nativeEvent);
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

      if (isShapeTool(interactionTool)) {
        const handler = getToolHandler(interactionTool);
        const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
        if (started) {
          isDrawingRef.current = true;
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (interactionTool === "gradient") {
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
      if (
        interactionTool === "brush" ||
        interactionTool === "pencil" ||
        interactionTool === "eraser"
      ) {
        const handler = getToolHandler(interactionTool);
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
      currentPressureRef.current = normalizePointerPressure(e.nativeEvent);
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
          if (interactionTool === "blur") {
            drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
          }
        } else {
          if (interactionTool === "blur") {
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
      interactionTool,
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
      selectStartRef,
      drawOverlayLassoPreview,
      getFullCompositeImageData,
      sampleRgbAtDocPoint
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

      // Stylus/tablet: pointermove fires while the pen is down but many drivers do not
      // emit compatibility mousemove events, so the software brush ring never moved.
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        mousePositionRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        drawCursor(e.clientX, e.clientY);
      }

      if (
        !isDrawingRef.current &&
        interactionTool === "select" &&
        doc.toolSettings.select.mode === "lasso_polygon" &&
        lassoPointsRef.current.length > 0
      ) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        drawOverlayLassoPreview(lassoPointsRef.current, pt);
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
        const previewId = movePreviewLayerIdRef.current;
        const freshDoc = useSketchStore.getState().document;
        const layer =
          previewId != null
            ? freshDoc.layers.find((l) => l.id === previewId)
            : null;
        if (layer) {
          const previewTransform = {
            x: Math.round(moveLayerStartTransformRef.current.x + dx),
            y: Math.round(moveLayerStartTransformRef.current.y + dy)
          };
          movePreviewTransformRef.current = previewTransform;
          movePreviewLayerIdRef.current = layer.id;
          setLayerTransformPreview?.(layer.id, previewTransform);
        }
        return;
      }

      if (interactionTool === "transform") {
        const handler = getToolHandler(interactionTool);
        handler.onMove?.(toolCtxRef.current, buildToolPointerEvent(e), []);
        return;
      }

      if (isShapeTool(interactionTool)) {
        const handler = getToolHandler(interactionTool);
        handler.onMove?.(toolCtxRef.current, buildToolPointerEvent(e), []);
        return;
      }

      if (interactionTool === "gradient" && gradientStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        gradientEndRef.current = pt;
        drawOverlayGradient(gradientStartRef.current, pt);
        return;
      }

      if (interactionTool === "crop" && cropStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        drawOverlayCrop(cropStartRef.current, pt);
        return;
      }

      if (
        interactionTool === "select" &&
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

      if (interactionTool === "select" && lassoPointsRef.current.length > 0) {
        const selectMode = doc.toolSettings.select.mode;
        const pt = screenToCanvas(e.clientX, e.clientY);
        const pts = lassoPointsRef.current;

        if (selectMode === "lasso") {
          const last = pts[pts.length - 1];
          if (!last || last.x !== pt.x || last.y !== pt.y) {
            pts.push(pt);
          }
          drawOverlayLassoPreview(pts, pt);
          return;
        }
      }

      if (interactionTool === "select" && selectStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const sm = doc.toolSettings.select.mode;
        if (sm === "rectangle" || sm === "ellipse") {
          const anchor = selectStartRef.current;
          if (
            Math.abs(pt.x - anchor.x) >= MARQUEE_MIN_DRAG_DOC_PX ||
            Math.abs(pt.y - anchor.y) >= MARQUEE_MIN_DRAG_DOC_PX
          ) {
            marqueeDocDragSeenRef.current = true;
          }
          const { start, end } = marqueeAdjustedDocPoints(
            selectStartRef.current,
            pt,
            {
              fromCenter: altHeldRef.current,
              constrainSquare: shiftHeldRef.current
            }
          );
          drawOverlaySelection(start, end);
        } else {
          drawOverlaySelection(selectStartRef.current, pt);
        }
        return;
      }

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (
        interactionTool === "brush" ||
        interactionTool === "pencil" ||
        interactionTool === "eraser"
      ) {
        // Do not gate pointermove on pen contact: many tablet drivers briefly
        // report buttons=0 / pressure=0 between samples while the tip is down;
        // skipping moves causes short, broken strokes. Hover is filtered on
        // pointerdown via pointerHasPaintContact.
        const handler = getToolHandler(interactionTool);
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
        // Draw last: compatibility mousemove may run after pointermove and would
        // call drawCursor with stale coords if we only relied on the top of handler.
        const r = containerRef.current?.getBoundingClientRect();
        if (r) {
          mousePositionRef.current = {
            x: e.clientX - r.left,
            y: e.clientY - r.top
          };
          drawCursor(e.clientX, e.clientY);
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
        pressure: coalescedStrokePressure(
          eventPoint,
          currentPressureRef.current || 0.5
        )
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
        interactionTool === "blur" ? [eventPoints[eventPoints.length - 1]] : eventPoints;

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

        if (interactionTool === "blur") {
          const from = lastPointRef.current
            ? {
                x: lastPointRef.current.x - currentOffset.x,
                y: lastPointRef.current.y - currentOffset.y
              }
            : localPt;
          drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
        } else if (interactionTool === "clone_stamp") {
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

      const rPaint = containerRef.current?.getBoundingClientRect();
      if (rPaint) {
        mousePositionRef.current = {
          x: e.clientX - rPaint.left,
          y: e.clientY - rPaint.top
        };
        drawCursor(e.clientX, e.clientY);
      }
    },
    [
      doc,
      activeTool,
      interactionTool,
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
      onSelectionChange,
      setLayerTransformPreview,
      activeStrokeRef,
      invalidateLayer,
      drawActiveStrokePreview,
      strokeDirtyRectRef,
      drawCursor,
      containerRef,
      mousePositionRef
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
        if (previewLayerId) {
          onStrokeEnd(previewLayerId, null, undefined, {
            syncDocumentFromCanvas: false
          });
        }
        return;
      }
      if (interactionTool === "clone_stamp") {
        clonePaintOffsetRef.current = null;
      }

      if (interactionTool === "transform") {
        const handler = getToolHandler(interactionTool);
        handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));
        return;
      }

      if (isShapeTool(interactionTool)) {
        const handler = getToolHandler(interactionTool);
        handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));
        return;
      }

      if (
        interactionTool === "gradient" &&
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

      if (interactionTool === "crop" && cropStartRef.current) {
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
      if (interactionTool === "select" && isMovingSelectionRef.current) {
        isMovingSelectionRef.current = false;
        moveSelectionOriginRef.current = null;
        selectionAtMoveStartRef.current = null;
        return;
      }

      if (interactionTool === "select" && lassoPointsRef.current.length > 0) {
        if (doc.toolSettings.select.mode === "lasso_polygon") {
          return;
        }
        const pt = screenToCanvas(
          mousePositionRef.current.x +
            (containerRef.current?.getBoundingClientRect().left ?? 0),
          mousePositionRef.current.y +
            (containerRef.current?.getBoundingClientRect().top ?? 0)
        );
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

      if (interactionTool === "select" && selectStartRef.current) {
        const pt = screenToCanvas(
          mousePositionRef.current.x +
            (containerRef.current?.getBoundingClientRect().left ?? 0),
          mousePositionRef.current.y +
            (containerRef.current?.getBoundingClientRect().top ?? 0)
        );
        const selMode = doc.toolSettings.select.mode;
        const anchor = selectStartRef.current;
        const { start: mStart, end: mEnd } =
          selMode === "rectangle" || selMode === "ellipse"
            ? marqueeAdjustedDocPoints(anchor, pt, {
                fromCenter: altHeldRef.current,
                constrainSquare: shiftHeldRef.current
              })
            : { start: anchor, end: pt };
        const { x, y, w, h } = marqueeRectFromDocPoints(mStart, mEnd);
        clearOverlay();
        selectStartRef.current = null;
        const cw = doc.canvas.width;
        const ch = doc.canvas.height;
        const mc = marqueeCombineAtDownRef.current;
        marqueeCombineAtDownRef.current = null;
        const op: SelectionCombineOp = mc
          ? selectionCombineMode(mc.shift, mc.alt)
          : "replace";
        const isMarqueeShape =
          selMode === "rectangle" || selMode === "ellipse";
        const marqueeDragged = marqueeDocDragSeenRef.current;
        marqueeDocDragSeenRef.current = false;
        if (
          w >= 1 &&
          h >= 1 &&
          onSelectionChange &&
          (!isMarqueeShape || marqueeDragged)
        ) {
          const overlay =
            selMode === "ellipse"
              ? ellipseSelectionMask(cw, ch, x, y, w, h)
              : rectSelectionMask(cw, ch, x, y, w, h);
          if (selectionHasAnyPixels(overlay)) {
            const base = op === "replace" ? null : selection ?? null;
            onSelectionChange(combineMasks(base, overlay, op));
          }
        }
        drawSelectionOverlay();
        return;
      }

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (
        interactionTool === "brush" ||
        interactionTool === "pencil" ||
        interactionTool === "eraser"
      ) {
        const handler = getToolHandler(interactionTool);
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
      interactionTool,
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

  // ─── Wheel zoom (damped toward target via rAF for smoother steps) ──

  const handleZoomWheel = useCallback(
    (
      event: Pick<WheelEvent, "deltaY" | "clientX" | "clientY" | "preventDefault">
    ) => {
      event.preventDefault();
      const factor = 1.3;
      const delta = event.deltaY > 0 ? 1 / factor : factor;
      const container = containerRef.current;
      if (!container) {
        return;
      }

      if (zoomWheelRafRef.current == null) {
        const z = zoomRef.current;
        zoomWheelAnimatedRef.current = z;
        zoomWheelTargetRef.current = z;
        zoomWheelPanRef.current = { ...panRef.current };
      }

      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      zoomWheelOffsetRef.current = {
        x: mouseX - centerX - zoomWheelPanRef.current.x,
        y: mouseY - centerY - zoomWheelPanRef.current.y
      };

      // Compound the *target* so rapid wheel events stack (not the lagging animated value).
      zoomWheelTargetRef.current = Math.max(
        SKETCH_ZOOM_MIN,
        Math.min(SKETCH_ZOOM_MAX, zoomWheelTargetRef.current * delta)
      );

      const tick = () => {
        const z0 = zoomWheelAnimatedRef.current;
        const zT = zoomWheelTargetRef.current;
        const denom = Math.max(Math.abs(z0), Math.abs(zT), 1e-6);
        const relErr = Math.abs(zT - z0) / denom;
        const k = Math.min(1, relErr * 1.45);
        const alpha =
          WHEEL_ZOOM_SMOOTH_MIN +
          (WHEEL_ZOOM_SMOOTH_MAX - WHEEL_ZOOM_SMOOTH_MIN) * k * k;
        let z1 = z0 + (zT - z0) * alpha;
        const snapEps = 1e-5;
        if (Math.abs(zT - z1) < snapEps) {
          z1 = zT;
        }
        const ratio = z1 / z0;
        const ox = zoomWheelOffsetRef.current.x;
        const oy = zoomWheelOffsetRef.current.y;
        zoomWheelPanRef.current = {
          x: zoomWheelPanRef.current.x + ox * (1 - ratio),
          y: zoomWheelPanRef.current.y + oy * (1 - ratio)
        };
        zoomWheelAnimatedRef.current = z1;
        onZoomChangeRef.current(z1);
        onPanChangeRef.current({
          x: zoomWheelPanRef.current.x,
          y: zoomWheelPanRef.current.y
        });

        if (Math.abs(z1 - zT) < snapEps) {
          zoomWheelRafRef.current = null;
          return;
        }
        zoomWheelRafRef.current = requestAnimationFrame(tick);
      };

      if (zoomWheelRafRef.current == null) {
        zoomWheelRafRef.current = requestAnimationFrame(tick);
      }
    },
    [containerRef]
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

  const handleMouseMove = useCallback((_e: React.MouseEvent) => {
    // Cursor position comes from handlePointerMove only. Compatibility mousemove
    // after pointer events can report the system mouse, not the pen tip.
  }, []);

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

  // ─── Double-click (polygon lasso close) ────────────────────────────

  const handleDoubleClick = useCallback(
    (_e: React.MouseEvent) => {
      if (
        interactionTool !== "select" ||
        doc.toolSettings.select.mode !== "lasso_polygon" ||
        lassoPointsRef.current.length < 3
      ) {
        return;
      }
      const pts = [...lassoPointsRef.current];
      lassoPointsRef.current = [];
      clearOverlay();
      drawSelectionOverlay();
      const cw = doc.canvas.width;
      const ch = doc.canvas.height;
      if (onSelectionChange) {
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
    },
    [
      interactionTool,
      doc.toolSettings.select.mode,
      doc.canvas.width,
      doc.canvas.height,
      selection,
      onSelectionChange,
      clearOverlay,
      drawSelectionOverlay,
      lassoPointsRef,
      shiftHeldRef,
      altHeldRef
    ]
  );

  // Clear in-progress polygon when selection is cleared externally (e.g. Escape)
  useEffect(() => {
    if (!selection && lassoPointsRef.current.length > 0 && doc.toolSettings.select.mode === "lasso_polygon") {
      lassoPointsRef.current = [];
      clearOverlay();
    }
  }, [selection, doc.toolSettings.select.mode, lassoPointsRef, clearOverlay]);

  // Pen/tablet: `pointermove` is often coalesced/throttled; `pointerrawupdate` carries
  // every physical sample so the brush ring tracks the tip while drawing.
  useEffect(() => {
    const el = containerRef.current;
    if (el == null || typeof window.PointerEvent === "undefined") {
      return;
    }
    const onRaw: EventListener = (ev) => {
      const e = ev as PointerEvent;
      if (!interactionToolShowsBrushCursor(interactionToolCursorRef.current)) {
        return;
      }
      const rect = el.getBoundingClientRect();
      mousePositionRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      // Viewport coords — drawCursor maps into the cursor canvas (some styluses
      // report as pointerType "mouse"; raw updates still carry the pen position).
      drawCursorRef.current(e.clientX, e.clientY);
    };
    el.addEventListener("pointerrawupdate", onRaw, { capture: true });
    return () => {
      el.removeEventListener("pointerrawupdate", onRaw, { capture: true });
    };
  }, [containerRef, mousePositionRef]);

  // ─── Tool activation lifecycle ────────────────────────────────────
  const prevActiveToolRef = useRef(activeTool);
  useEffect(() => {
    const prev = prevActiveToolRef.current;
    if (prev === activeTool) {
      return;
    }
    const prevHandler = getToolHandler(prev);
    prevHandler.onDeactivate?.(toolCtxRef.current);
    const nextHandler = getToolHandler(activeTool);
    nextHandler.onActivate?.(toolCtxRef.current);
    prevActiveToolRef.current = activeTool;
  }, [activeTool]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleWheel,
    handleMouseMove,
    handleMouseLeave,
    handleContextMenu,
    shiftHeldRef,
    altHeldRef,
    selectStartRef
  };
}
