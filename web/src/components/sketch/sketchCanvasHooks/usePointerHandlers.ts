/**
 * usePointerHandlers
 *
 * All pointer event handling for the sketch canvas: down, move, up, wheel.
 * Keyboard modifier tracking and utility callbacks are delegated to
 * useKeyboardModifiers and usePointerHandlerUtils respectively.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import { CloneStampTool } from "../tools/CloneStampTool";
import { TransformTool } from "../tools/TransformTool";
import { CropTool } from "../tools/CropTool";
import { sampleColorHex } from "../tools/EyedropperTool";
import type { ToolContext, ToolPointerEvent, StrokeEndOptions } from "../tools/types";
import { buildToolContext } from "../tools/buildToolContext";
import { useKeyboardModifiers } from "./useKeyboardModifiers";
import { usePointerHandlerUtils } from "./usePointerHandlerUtils";
import { useWheelZoom } from "./useWheelZoom";
import { useToolLifecycle } from "./useToolLifecycle";
import type { GizmoDrawCallback } from "./useOverlayRenderer";
import {
  normalizePointerPressure,
  pointerHasPaintContact
} from "../pointerPen";
import { cursorStyleForTool } from "../sketchCursorStyle";


/**
 * Params for `usePointerHandlers`.
 *
 * ## Boundary contract
 *
 * This hook has **no direct Zustand store subscriptions**. All state flows
 * in through these params, and every param is captured into `toolCtxRef`
 * so tool handlers always read the latest values without triggering
 * re-renders of the hook itself.
 *
 * Params are grouped by state tier to make it clear where each value
 * originates and how it should be treated:
 *
 * | Tier                        | Mutates during a gesture? | Re-render safe? |
 * |-----------------------------|---------------------------|-----------------|
 * | Committed document state    | No (only on undo/commit)  | Yes (infrequent)|
 * | Viewport / tool state       | Zoom/pan change on wheel  | Yes (moderate)  |
 * | Transient interaction refs  | Yes (every pointer move)  | N/A (refs)      |
 * | Canvas element refs         | No (stable after mount)   | N/A (refs)      |
 * | Rendering infrastructure    | No (stable callbacks)     | N/A (callbacks) |
 * | Overlay drawing callbacks   | No (stable callbacks)     | N/A (callbacks) |
 * | Store-to-parent callbacks   | No (stable callbacks)     | N/A (callbacks) |
 * | Transient preview callbacks | No (stable callbacks)     | N/A (callbacks) |
 */
export interface UsePointerHandlersParams {
  // ── Committed document state ───────────────────────────────────────
  // Snapshot of the document (with live toolSettings merged in via
  // `docWithTools`). Only changes on committed store mutations.
  doc: SketchDocument;
  activeTool: SketchTool;
  /** Effective tool for gestures (spring-loaded move uses "move" while `activeTool` may stay brush). */
  interactionTool: SketchTool;
  selection?: Selection | null;
  /** Layer isolation (must match on-screen composite for wand / eyedropper readback). */
  isolatedLayerId?: string | null;
  foregroundColor?: string;

  // ── Viewport / tool state ──────────────────────────────────────────
  // Changes on wheel-zoom, pan, or tool-bar toggles. Moderate frequency.
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;

  // ── Transient interaction refs ─────────────────────────────────────
  // Mutable refs updated on every pointer event. Never trigger re-renders.
  selectStartRef: React.MutableRefObject<Point | null>;
  lassoPointsRef: React.MutableRefObject<Point[]>;
  mousePositionRef: React.MutableRefObject<Point>;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  /** Updates the GPU ants origin during a live selection move drag, without committing to the store. */
  setSelectionOriginOverride?: (pos: { x: number; y: number } | null) => void;

  // ── Canvas element refs ────────────────────────────────────────────
  // Stable after mount. Used for hit-testing and direct pixel access.
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Screen-resolution canvas for transform gizmo (not clipped by doc-stack). */
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;

  // ── Rendering infrastructure ───────────────────────────────────────
  // Compositing runtime and layer canvas management. Stable callbacks.
  /** The active SketchRuntime — used for centralized composite readback. */
  runtime: import("../rendering/types").SketchRuntime;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer: (layerId: string) => void;
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;

  // ── Overlay drawing callbacks ──────────────────────────────────────
  // Provided by `useOverlayRenderer`. Draw into overlay/cursor/gizmo canvases.
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

  // ── Store-to-parent event callbacks ────────────────────────────────
  // Stable callbacks that propagate changes upward to SketchEditor.
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
  /** Called on right-click inside the transform bounding box (when transform tool is active). */
  onTransformContextMenu?: (x: number, y: number) => void;
  onCropComplete?: (
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  onEyedropperPick?: (color: string) => void;
  onSelectionChange?: (sel: Selection | null) => void;
  onAutoPickLayer?: (layerId: string) => void;
  /**
   * Fires when the **primary pointer** leaves the canvas container (layer thumbnails,
   * deferred doc sync). Use pointerleave only — not mouseleave — so stylus input does
   * not spuriously flush while the pen is still down (Windows often fires mouseleave
   * for the logical mouse while the pen tip remains over the canvas).
   */
  onCanvasLeave?: () => void;

  // ── Transient preview callbacks ────────────────────────────────────
  // Local React state setters for transform preview. Never persisted.
  setLayerTransformPreview?: (layerId: string, transform: LayerTransform) => void;
  clearLayerTransformPreview?: (layerId?: string) => void;

  /**
   * Must match `useOverlayRenderer`'s modifier refs when both hooks are
   * composed (see `useCanvasOrchestration`). Otherwise overlay shape
   * preview reads stale Shift/Alt while `ToolContext` uses pointer-updated refs.
   */
  shiftHeldRef?: React.MutableRefObject<boolean>;
  altHeldRef?: React.MutableRefObject<boolean>;
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
  /** Cancel the active tool's in-progress operation (e.g. crop drag, transform). */
  cancelActiveTool: () => void;
  /** Apply pending crop rectangle (crop tool). */
  commitPendingCrop: () => void;
  /** Root container cursor (tool, space pan hint, or active pan). */
  containerCursor: string;
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
  onTransformContextMenu,
  onCropComplete,
  onEyedropperPick,
  isolatedLayerId,
  onSelectionChange,
  setSelectionOriginOverride,
  onAutoPickLayer,
  foregroundColor = "#000000",
  onCanvasLeave,
  setLayerTransformPreview,
  clearLayerTransformPreview,
  shiftHeldRef: shiftHeldRefShared,
  altHeldRef: altHeldRefShared
}: UsePointerHandlersParams): UsePointerHandlersResult {
  const [spaceHeldUi, setSpaceHeldUi] = useState(false);
  const [isPanningUi, setIsPanningUi] = useState(false);

  // ─── Core interaction state refs ────────────────────────────────────
  const isDrawingRef = useRef(false);
  // Locks the effective tool for the duration of a pointer-down gesture so that
  // pressing Ctrl mid-drag (e.g. during a selection draw) cannot switch the tool.
  const gestureToolRef = useRef<SketchTool | null>(null);
  const isPanningRef = useRef(false);
  const isSpacePanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOffsetRef = useRef<Point>(pan);
  const isSizeDraggingRef = useRef(false);
  const sizeDragStartRef = useRef<Point>({ x: 0, y: 0 });
  const sizeDragInitialSize = useRef(0);

  // Keep pan offset in sync
  useEffect(() => {
    panOffsetRef.current = pan;
  }, [pan]);

  // ─── Keyboard modifier tracking ─────────────────────────────────────
  const { shiftHeldRef, altHeldRef, spaceHeldRef, sKeyHeldRef } =
    useKeyboardModifiers({
      isSpacePanningRef,
      isSizeDraggingRef,
      onSpaceHeldChange: setSpaceHeldUi,
      shiftHeldRef: shiftHeldRefShared,
      altHeldRef: altHeldRefShared
    });

  const [transformHoverCursor, setTransformHoverCursor] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (interactionTool !== "transform") {
      setTransformHoverCursor(null);
    }
  }, [interactionTool]);

  const containerCursor = isPanningUi
    ? "grabbing"
    : spaceHeldUi
      ? "grab"
      : interactionTool === "transform" && transformHoverCursor !== null
        ? transformHoverCursor
        : cursorStyleForTool(interactionTool);

  // ─── Utility callbacks ───────────────────────────────────────────────
  const {
    screenToCanvas,
    withMirror,
    drawActiveStrokePreview
  } = usePointerHandlerUtils({
    zoom,
    pan,
    containerRef,
    doc,
    displayCanvasRef,
    overlayCanvasRef,
    activeStrokeRef,
    mirrorX,
    mirrorY,
    symmetryMode,
    symmetryRays,
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

  // ─── Async tool commit generation ──────────────────────────────────
  // Monotonically increasing counter used to detect stale async commits.
  // Incremented whenever a new gesture starts, the tool changes, or a new
  // onCommit is dispatched — ensuring that only the most recent commit is
  // accepted.
  const commitGenRef = useRef(0);

  // ─── Tool context ref ──────────────────────────────────────────────
  // Updated synchronously every render. Handlers read this ref to get
  // the latest values without needing all ToolContext properties in
  // their dependency arrays.
  const toolCtxRef = useRef<ToolContext>(null!);
  toolCtxRef.current = buildToolContext({
    doc,
    interactionTool,
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
    runtime,
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
    foregroundColor,
    setLayerTransformPreview,
    clearLayerTransformPreview,
    setSelectionOriginOverride,
    appendSelectionOverlay,
    selectStartRef,
    lassoPointsRef,
    getFullCompositeImageData,
    setTransformHoverCursor,
  });

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
          drawCursor(e.clientX, e.clientY);
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
        const pt = screenToCanvas(e.clientX, e.clientY);
        const hex = sampleColorHex(toolCtxRef.current, pt);
        if (hex) {
          onEyedropperPick(hex);
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
        setIsPanningUi(true);
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
        gestureToolRef.current = interactionTool;
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Post-delegation: active stroke preview for tools that declare the capability
      if (
        started &&
        handler.showsActiveStrokePreview &&
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
      activeStrokeRef,
      drawActiveStrokePreview,
      spaceHeldRef,
      sKeyHeldRef,
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

      const hoverHandler = getToolHandler(interactionTool);

      // ─── Non-drawing hover dispatches ─────────────────────────────────
      if (!isDrawingRef.current) {
        // Generic hover dispatch: any tool with onHoverMove receives hover events
        hoverHandler.onHoverMove?.(toolCtxRef.current, buildToolPointerEvent(e));
        return;
      }

      // ─── Active drawing: lock to gesture-started tool ─────────────────
      // Mid-gesture modifier keys (e.g. Ctrl during a selection drag) must not switch tools.
      const drawHandler = getToolHandler(gestureToolRef.current ?? interactionTool);
      drawHandler.onMove?.(
        toolCtxRef.current,
        buildToolPointerEvent(e),
        buildCoalescedEvents(e)
      );

      // Post-delegation: active stroke preview for tools that declare the capability
      if (drawHandler.showsActiveStrokePreview && activeStrokeRef.current) {
        drawActiveStrokePreview();
      }

      // Post-delegation: cursor update for brush-cursor tools during drawing
      if (drawHandler.showsBrushCursor) {
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
        setIsPanningUi(false);
        return;
      }

      if (isSizeDraggingRef.current) {
        isSizeDraggingRef.current = false;
        return;
      }

      if (!isDrawingRef.current) {
        return;
      }
      const gestureTool = gestureToolRef.current ?? interactionTool;
      gestureToolRef.current = null;
      isDrawingRef.current = false;

      // ─── Generic tool delegation ─────────────────────────────────────
      const handler = getToolHandler(gestureTool);
      handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));

      // ─── Async tool lifecycle: call onCommit if present ──────────────
      // onCommit allows tools with long-running async work (e.g. SAM
      // inference, AI inpaint) to finalize after onUp.  A generation
      // counter guards against stale results: if the tool, document, or
      // session changed while the Promise was pending, the result is
      // silently discarded.
      if (handler.onCommit) {
        const gen = ++commitGenRef.current;
        handler.onCommit(toolCtxRef.current).catch((err) => {
          // Only log if this commit was not superseded by a newer one
          if (commitGenRef.current === gen) {
            console.error(`Tool ${gestureTool} onCommit error:`, err);
          }
        });
      }

      // Post-delegation: active stroke preview for tools that declare the capability
      if (handler.showsActiveStrokePreview) {
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

  const { handleWheel } = useWheelZoom({ zoom, pan, containerRef, onZoomChange, onPanChange });

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
    setTransformHoverCursor(null);
    onCanvasLeave?.();
  }, [clearCursorOverlay, onCanvasLeave]);

  const handleMouseLeave = useCallback(() => {
    clearCursorOverlay();
    setTransformHoverCursor(null);
  }, [clearCursorOverlay]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // When the transform tool is active, check if the right-click is inside the
      // transform bounding box. If so, show the transform-specific context menu.
      if (interactionTool === "transform" && onTransformContextMenu) {
        const handler = getToolHandler("transform");
        if (handler instanceof TransformTool) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          if (handler.isPointInsideBoundingBox(toolCtxRef.current, pt)) {
            onTransformContextMenu(e.clientX, e.clientY);
            return;
          }
        }
      }
      if (onContextMenu) {
        onContextMenu(e.clientX, e.clientY);
      }
    },
    [onContextMenu, onTransformContextMenu, interactionTool, screenToCanvas]
  );

  // ─── Double-click (polygon lasso close) ────────────────────────────

  const handleDoubleClick = useCallback(
    (_e: React.MouseEvent) => {
      if (interactionTool !== "select") {
        return;
      }
      const handler = getToolHandler("select");
      const rect = containerRef.current?.getBoundingClientRect();
      const pt = screenToCanvas(
        mousePositionRef.current.x + (rect?.left ?? 0),
        mousePositionRef.current.y + (rect?.top ?? 0)
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

  // ─── Tool lifecycle effects ─────────────────────────────────────────
  useToolLifecycle({
    activeTool,
    interactionTool,
    zoom,
    pan,
    selection,
    doc,
    toolCtxRef,
    commitGenRef,
    containerRef,
    mousePositionRef,
    drawCursor,
    lassoPointsRef,
    clearOverlay,
  });

  /** Cancel the active tool's in-progress operation (e.g. crop drag, transform). */
  const cancelActiveTool = useCallback(() => {
    const handler = getToolHandler(activeTool);
    handler.onCancel?.(toolCtxRef.current);
  }, [activeTool]);

  const commitPendingCrop = useCallback(() => {
    const crop = getToolHandler("crop");
    if (crop instanceof CropTool) {
      crop.commitPending(toolCtxRef.current);
    }
  }, []);

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
    selectStartRef,
    cancelActiveTool,
    commitPendingCrop,
    containerCursor
  };
}
