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
  isPaintingTool,
} from "../types";
import type { ActiveStrokeInfo } from "./useCompositing";
import { getToolHandler } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import { CloneStampTool } from "../tools/CloneStampTool";
import { SelectTool } from "../tools/SelectTool";
import type { ToolContext, ToolPointerEvent, StrokeEndOptions } from "../tools/types";
import { useKeyboardModifiers } from "./useKeyboardModifiers";
import { usePointerHandlerUtils } from "./usePointerHandlerUtils";
import type { SelectionMoveAntsRef, GizmoDrawCallback } from "./useOverlayRenderer";
import {
  SKETCH_ZOOM_MAX,
  SKETCH_ZOOM_MIN
} from "../state/useSketchStore";
import {
  normalizePointerPressure,
  pointerHasPaintContact
} from "../pointerPen";

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
  /** Screen-resolution canvas for transform gizmo (not clipped by doc-stack). */
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  mousePositionRef: React.MutableRefObject<Point>;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  /** The active SketchRuntime — used for centralized composite readback. */
  runtime: import("../rendering/types").SketchRuntime;
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
  clearGizmo: () => void;
  drawGizmo: (callback: GizmoDrawCallback) => void;
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
  /** Shared with `useOverlayRenderer` for marching ants while moving selection (unclipped until pointer up). */
  selectionMoveAntsRef: SelectionMoveAntsRef;
  onAutoPickLayer?: (layerId: string) => void;
  foregroundColor?: string;
  /**
   * Fires when the **primary pointer** leaves the canvas container (layer thumbnails,
   * deferred doc sync). Use pointerleave only — not mouseleave — so stylus input does
   * not spuriously flush while the pen is still down (Windows often fires mouseleave
   * for the logical mouse while the pen tip remains over the canvas).
   */
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
  /** Pointer left the root — flush deferred layer thumbnails / doc sync. */
  handlePointerLeave: () => void;
  /** Mouse `mouseleave` only — clear cursor; do not flush thumbnails (avoids pen + mouse divergence). */
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
  gizmoCanvasRef,
  containerRef,
  layerCanvasesRef,
  mousePositionRef,
  activeStrokeRef,
  runtime,
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
  clearGizmo,
  drawGizmo,
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
  selectionMoveAntsRef,
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
  const _paintStrokeHasMovedRef = useRef(false);
  const _lastPointRef = useRef<Point | null>(null);
  const _lastSmoothedPointRef = useRef<Point | null>(null);
  const isPanningRef = useRef(false);
  const isSpacePanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOffsetRef = useRef<Point>(pan);
  const isSizeDraggingRef = useRef(false);
  const sizeDragStartRef = useRef<Point>({ x: 0, y: 0 });
  const sizeDragInitialSize = useRef(0);

  // Tool-specific state (now managed by tool handlers; only kept for legacy refs)

  // Keep pan offset in sync
  useEffect(() => {
    panOffsetRef.current = pan;
  }, [pan]);

  // ─── Keyboard modifier tracking ─────────────────────────────────────
  const { shiftHeldRef, altHeldRef, spaceHeldRef, sKeyHeldRef } =
    useKeyboardModifiers({ isSpacePanningRef, isSizeDraggingRef });

  // ─── Utility callbacks ───────────────────────────────────────────────
  const {
    screenToCanvas,
    withMirror,
    rgbToHex,
    clipSelectionForOffset,
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

  // ─── Composite readback helpers ─────────────────────────────────────

  // Keep a stable ref to the runtime so the readback callback doesn't
  // re-create on every render while still using the latest runtime.
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const getFullCompositeImageData = useCallback((): ImageData | null => {
    return runtimeRef.current.readbackComposite(
      doc,
      isolatedLayerId ?? null,
      activeStrokeRef.current
    );
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activeStrokeRef is stable
  [doc, isolatedLayerId]);

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
    gizmoCanvasRef,
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
    clearGizmo,
    drawGizmo,
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
    foregroundColor,
    setLayerTransformPreview,
    clearLayerTransformPreview,
    selectionMoveAntsRef,
    appendSelectionOverlay,
    selectStartRef,
    lassoPointsRef,
    getFullCompositeImageData,
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

  // ─── Pointer Down ──────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Clone stamp: Alt+click sets the clone source point
      if (e.button === 0 && e.altKey && activeTool === "clone_stamp") {
        const handler = getToolHandler("clone_stamp");
        if (handler instanceof CloneStampTool) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          handler.setCloneSource(pt);
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

      // ─── Generic tool delegation ─────────────────────────────────────
      // For transform: ensure the layer canvas exists for live preview compositing
      if (interactionTool === "transform") {
        getOrCreateLayerCanvas(activeLayer.id);
      }

      const handler = getToolHandler(interactionTool);
      const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
      if (started) {
        isDrawingRef.current = true;
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Post-delegation: active stroke preview for paint tools
      if (
        started &&
        (interactionTool === "brush" ||
          interactionTool === "pencil" ||
          interactionTool === "eraser") &&
        activeStrokeRef.current
      ) {
        drawActiveStrokePreview();
      }
    },
    [
      doc,
      activeTool,
      interactionTool,
      screenToCanvas,
      onBrushSizeChange,
      getOrCreateLayerCanvas,
      onEyedropperPick,
      rgbToHex,
      activeStrokeRef,
      drawActiveStrokePreview,
      spaceHeldRef,
      sKeyHeldRef,
      sampleRgbAtDocPoint,
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

      // ─── Non-drawing hover dispatches ─────────────────────────────────
      if (!isDrawingRef.current) {
        // Select tool: polygon lasso rubber-band preview
        if (interactionTool === "select") {
          const handler = getToolHandler("select");
          handler.onHoverMove?.(toolCtxRef.current, buildToolPointerEvent(e));
        }

        // Transform tool: update cursor based on which handle is under the pointer
        if (interactionTool === "transform") {
          const handler = getToolHandler(interactionTool);
          if (handler instanceof TransformTool) {
            const docPt = screenToCanvas(e.clientX, e.clientY);
            const cursor = handler.getHoverCursor(toolCtxRef.current, docPt);
            const el = containerRef.current;
            if (el) {
              el.style.cursor = cursor ?? "default";
            }
          }
        }
        return;
      }

      // ─── Active drawing: delegate to tool handler ─────────────────────
      const handler = getToolHandler(interactionTool);
      handler.onMove?.(
        toolCtxRef.current,
        buildToolPointerEvent(e),
        buildCoalescedEvents(e)
      );

      // Post-delegation: active stroke preview for paint tools
      if (
        (interactionTool === "brush" ||
          interactionTool === "pencil" ||
          interactionTool === "eraser") &&
        activeStrokeRef.current
      ) {
        drawActiveStrokePreview();
      }

      // Post-delegation: cursor update for brush-cursor tools during drawing
      if (interactionToolShowsBrushCursor(interactionTool)) {
        const r = containerRef.current?.getBoundingClientRect();
        if (r) {
          mousePositionRef.current = {
            x: e.clientX - r.left,
            y: e.clientY - r.top
          };
          drawCursor(e.clientX, e.clientY);
        }
      }
    },
    [
      activeTool,
      interactionTool,
      screenToCanvas,
      onPanChange,
      onBrushSizeChange,
      activeStrokeRef,
      drawActiveStrokePreview,
      drawCursor,
      containerRef,
      mousePositionRef,
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

      // ─── Generic tool delegation ─────────────────────────────────────
      const handler = getToolHandler(interactionTool);
      handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));

      // Post-delegation: active stroke preview for paint tools
      if (
        interactionTool === "brush" ||
        interactionTool === "pencil" ||
        interactionTool === "eraser"
      ) {
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
      }
    },
    [
      interactionTool,
      clearOverlay,
      drawSelectionOverlay,
      appendSelectionOverlay,
      drawActiveStrokePreview,
      activeStrokeRef,
    ]
  );

  // ─── Wheel zoom ────────────────────────────────────────────────────

  const handleZoomWheel = useCallback(
    (
      event: Pick<WheelEvent, "deltaY" | "clientX" | "clientY" | "preventDefault">
    ) => {
      event.preventDefault();
      const factor = 1.3;
      const wheelDelta = event.deltaY > 0 ? 1 / factor : factor;
      const newZoom = Math.max(
        SKETCH_ZOOM_MIN,
        Math.min(SKETCH_ZOOM_MAX, zoom * wheelDelta)
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

  const handleMouseMove = useCallback((_e: React.MouseEvent) => {
    // Cursor position comes from handlePointerMove only. Compatibility mousemove
    // after pointer events can report the system mouse, not the pen tip.
  }, []);

  const clearCursorOverlay = useCallback(() => {
    const cursorCanvas = cursorCanvasRef.current;
    if (cursorCanvas) {
      const ctx = cursorCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      }
    }
  }, [cursorCanvasRef]);

  const handlePointerLeave = useCallback(() => {
    clearCursorOverlay();
    onCanvasLeave?.();
  }, [clearCursorOverlay, onCanvasLeave]);

  const handleMouseLeave = useCallback(() => {
    clearCursorOverlay();
  }, [clearCursorOverlay]);

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
      if (interactionTool !== "select") {
        return;
      }
      const handler = getToolHandler("select");
      const pt = screenToCanvas(
        mousePositionRef.current.x +
          (containerRef.current?.getBoundingClientRect().left ?? 0),
        mousePositionRef.current.y +
          (containerRef.current?.getBoundingClientRect().top ?? 0)
      );
      handler.onDoubleClick?.(toolCtxRef.current, pt);
    },
    [
      interactionTool,
      screenToCanvas,
      containerRef,
      mousePositionRef,
    ]
  );

  // Clear in-progress polygon when selection is cleared externally (e.g. Escape)
  useEffect(() => {
    if (!selection && lassoPointsRef.current.length > 0 && doc.toolSettings.select.mode === "lasso_polygon") {
      lassoPointsRef.current = [];
      // Also clear internal SelectTool state
      const handler = getToolHandler("select");
      if (handler instanceof SelectTool) {
        handler.clearPolygon();
      }
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
    // Cancel any pending async work before deactivating
    prevHandler.onCancel?.(toolCtxRef.current);
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
    handlePointerLeave,
    handleMouseLeave,
    handleContextMenu,
    shiftHeldRef,
    altHeldRef,
    selectStartRef
  };
}
