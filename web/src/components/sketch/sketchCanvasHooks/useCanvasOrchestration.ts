/**
 * useCanvasOrchestration
 *
 * Wires together the shared refs, compositing, overlay renderer, and pointer
 * handlers that previously lived inline in `SketchCanvas`. This hook owns:
 *
 * - Container, canvas-element, and modifier refs (the circular-dep seam)
 * - `useCompositing` → `useOverlayRenderer` → `usePointerHandlers` wiring
 * - The `requestPreviewRedrawRef` / `invalidateLayerRef` bridge assignment
 * - Active-stroke ref, cursor-position tracking ref
 *
 * It does **not** own:
 * - Transform-preview map (that is `useTransformPreviewBridge`)
 * - Presentation JSX or cursor style (that is `SketchCanvasPresentation`)
 * - Document-space cursor tracking for the info bar (stays in SketchCanvas)
 *
 * ## Boundary contract
 *
 * All state flows in through params; this hook has no direct Zustand
 * subscriptions. The docWithTools merge happens in the caller and is
 * passed as `doc` / `docWithTools`.
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
import type { ActiveStrokeInfo } from "../rendering";
import type { StrokeEndOptions } from "../tools/types";
import type { DisplayFrameCoordinator } from "./DisplayFrameCoordinator";
import {
  useCompositing,
  useOverlayRenderer,
  usePointerHandlers
} from "../sketchCanvasHooks";
import type {
  UseCompositingResult,
  UseOverlayRendererResult,
  UsePointerHandlersResult
} from "../sketchCanvasHooks";
import { selectionAntCanvasMarginCssPx } from "./useOverlayRenderer";
import { useSketchStore } from "../state/useSketchStore";

interface SelectionAntsRuntime {
  setSelectionAntsOverlayCanvas?: (canvas: HTMLCanvasElement | null) => void;
  setSelectionAntsViewport?: (params: {
    viewportWidthCss: number;
    viewportHeightCss: number;
    panXCss: number;
    panYCss: number;
    marginCss: number;
    dpr: number;
  }) => void;
  setSelectionOriginOverride?: (pos: { x: number; y: number } | null) => void;
  setSelectionPreviewMode?: (mode: "ants" | "mask") => void;
  onNeedsRedraw?: () => void;
}

// ─── Params ──────────────────────────────────────────────────────────────────

export interface UseCanvasOrchestrationParams {
  // ── Document state ─────────────────────────────────────────────────
  /** Bare document (no toolSettings) — consumed by compositing. */
  doc: SketchDocument;
  /** Document merged with live toolSettings — consumed by overlay + pointer. */
  docWithTools: SketchDocument;
  selection?: Selection | null;
  /** "ants" (default) or "mask" — red rubylith overlay over unselected pixels. */
  selectionPreviewMode?: "ants" | "mask";
  isolatedLayerId?: string | null;
  foregroundColor?: string;

  // ── Viewport / tool state ──────────────────────────────────────────
  activeTool: SketchTool;
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;

  // ── Transform preview bridge refs (from useTransformPreviewBridge) ─
  transformPreviewByLayerIdRef: React.MutableRefObject<Record<string, LayerTransform>>;
  requestPreviewRedrawRef: React.MutableRefObject<() => void>;
  invalidateLayerRef: React.MutableRefObject<(layerId: string) => void>;
  coordinatorRef?: React.MutableRefObject<DisplayFrameCoordinator | null>;
  setLayerTransformPreview: (layerId: string, transform: LayerTransform) => void;
  clearLayerTransformPreview: (layerId?: string) => void;

  // ── Store-to-parent event callbacks ────────────────────────────────
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
    contentBounds: LayerContentBounds
  ) => void;
  onBrushSizeChange?: (size: number) => void;
  onContextMenu?: (x: number, y: number) => void;
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
  onCanvasLeave?: () => void;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface UseCanvasOrchestrationResult {
  // ── Refs exposed to presentation ───────────────────────────────────
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectionGpuCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Last pointer client coords (for paste-at-cursor). */
  lastPointerClientRef: React.MutableRefObject<{ x: number; y: number } | null>;

  // ── Compositing results (display canvases, runtime, etc.) ──────────
  compositing: UseCompositingResult;

  // ── Overlay drawing API ────────────────────────────────────────────
  overlay: UseOverlayRendererResult;

  // ── Pointer handler API ────────────────────────────────────────────
  pointerHandlers: UsePointerHandlersResult;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCanvasOrchestration(
  params: UseCanvasOrchestrationParams
): UseCanvasOrchestrationResult {
  const {
    doc,
    docWithTools,
    activeTool,
    interactionTool,
    zoom,
    pan,
    mirrorX,
    mirrorY,
    symmetryMode,
    symmetryRays,
    selection,
    selectionPreviewMode = "ants",
    isolatedLayerId,
    foregroundColor,
    transformPreviewByLayerIdRef,
    requestPreviewRedrawRef,
    invalidateLayerRef,
    coordinatorRef,
    setLayerTransformPreview,
    clearLayerTransformPreview,
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
    onSelectionChange,
    onAutoPickLayer,
    onCanvasLeave
  } = params;

  // ─── Shared refs (created here to avoid circular deps between hooks) ─
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionGpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const gizmoCanvasRef = useRef<HTMLCanvasElement>(null);
  const mousePositionRef = useRef<Point>({ x: 0, y: 0 });
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const activeStrokeRef = useRef<ActiveStrokeInfo | null>(null);

  // ─── Modifier refs (shared between overlay + pointer) ─────────────
  // Created at this level to break the circular dependency: overlay needs
  // shift/alt refs while pointer handlers own keyboard listeners. Both must
  // read/write the **same** refs so shape preview (`drawOverlayShape`) sees
  // `event.shiftKey` updates from `ShapeTool.onMove` instead of always false.
  const shiftHeldRef = useRef(false);
  const altHeldRef = useRef(false);
  const selectStartRef = useRef<Point | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);

  // ─── Compositing (layer canvases, redraw) ──────────────────────────

  const compositing = useCompositing({
    doc,
    zoom,
    isolatedLayerId,
    activeStrokeRef,
    transformPreviewByLayerIdRef,
    coordinatorRef
  });
  const {
    runtime,
    requestRedraw,
    invalidateLayer,
    overlayCanvasRef,
    displayCanvasRef,
    layerCanvasesRef,
    redraw,
    redrawDirty,
    requestDirtyRedraw
  } = compositing;

  // Wire the preview bridge refs to compositing output.
  requestPreviewRedrawRef.current = requestRedraw;
  invalidateLayerRef.current = invalidateLayer;

  // Publish the runtime to the store so non-React code (selection-refine
  // GPU ops in selectionSlice) can dispatch onto it. Unregister on unmount
  // so a stale runtime reference can't outlive the editor mount.
  const setRuntimeInstance = useSketchStore((s) => s.setRuntimeInstance);
  useEffect(() => {
    setRuntimeInstance(runtime);
    return () => {
      setRuntimeInstance(null);
    };
  }, [runtime, setRuntimeInstance]);

  // Sync external selection state to the runtime. During interactive commits
  // the runtime is authoritative; the store only keeps the CPU snapshot that
  // gets published at commit/history boundaries and rehydrates undo/redo here.
  useEffect(() => {
    runtime.setSelection(selection ?? null);
    requestRedraw();
  }, [requestRedraw, runtime, selection]);

  // Push the selection preview mode (ants / mask) to the runtime so pass 4
  // picks the right pipeline. Static after each switch, so just trigger a
  // single redraw — the runtime stops the redraw loop on its own when in
  // mask mode (no animation).
  useEffect(() => {
    const rt = runtime as SelectionAntsRuntime;
    rt.setSelectionPreviewMode?.(selectionPreviewMode);
    requestRedraw();
  }, [requestRedraw, runtime, selectionPreviewMode]);

  // Schedule the next WebGPU frame while selection ants are drawn (pass 5 loads the blit).
  useEffect(() => {
    const rt = runtime as SelectionAntsRuntime;
    rt.onNeedsRedraw = requestRedraw;
    return () => {
      rt.onNeedsRedraw = undefined;
    };
  }, [requestRedraw, runtime]);

  const syncSelectionAntsViewport = useCallback(() => {
    const container = containerRef.current;
    const rt = runtime as SelectionAntsRuntime;
    rt.setSelectionAntsOverlayCanvas?.(selectionGpuCanvasRef.current);
    if (!container) {
      return;
    }
    rt.setSelectionAntsViewport?.({
      viewportWidthCss: container.clientWidth,
      viewportHeightCss: container.clientHeight,
      panXCss: pan.x,
      panYCss: pan.y,
      marginCss: selectionAntCanvasMarginCssPx(zoom),
      dpr: window.devicePixelRatio || 1
    });
  }, [pan.x, pan.y, runtime, zoom]);

  useEffect(() => {
    syncSelectionAntsViewport();
    requestRedraw();
  }, [requestRedraw, syncSelectionAntsViewport]);

  // ─── Overlay and cursor rendering ──────────────────────────────────

  const overlay = useOverlayRenderer({
    doc: docWithTools,
    activeTool,
    interactionTool,
    zoom,
    pan,
    overlayCanvasRef,
    selectionGpuCanvasRef,
    selectionCanvasRef,
    cursorCanvasRef,
    displayCanvasRef,
    gizmoCanvasRef,
    containerRef,
    shiftHeldRef,
    altHeldRef,
    selectStartRef,
    lassoPointsRef,
    onScreenCanvasMetricsChange: syncSelectionAntsViewport
  });

  const setSelectionOriginOverride = (pos: {
    x: number;
    y: number;
  } | null) => {
    const rt = runtime as SelectionAntsRuntime;
    rt.setSelectionOriginOverride?.(pos);
    overlay.setSelectionOriginOverride(pos);
  };

  // ─── Pointer handlers ──────────────────────────────────────────────

  const pointerHandlers = usePointerHandlers({
    doc: docWithTools,
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
    getOrCreateLayerCanvas: compositing.getOrCreateLayerCanvas,
    invalidateLayer,
    redraw,
    redrawDirty,
    requestRedraw,
    requestDirtyRedraw,
    clearOverlay: overlay.clearOverlay,
    drawSelectionOverlay: overlay.drawSelectionOverlay,
    appendSelectionOverlay: overlay.appendSelectionOverlay,
    drawOverlayShape: overlay.drawOverlayShape,
    drawOverlayGradient: overlay.drawOverlayGradient,
    drawOverlayCrop: overlay.drawOverlayCrop,
    drawOverlaySelection: overlay.drawOverlaySelection,
    drawOverlayLassoPreview: overlay.drawOverlayLassoPreview,
    drawCursor: overlay.drawCursor,
    clearGizmo: overlay.clearGizmo,
    drawGizmo: overlay.drawGizmo,
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
    foregroundColor,
    onCanvasLeave,
    setLayerTransformPreview,
    clearLayerTransformPreview,
    shiftHeldRef,
    altHeldRef
  });

  return {
    containerRef,
    selectionGpuCanvasRef,
    selectionCanvasRef,
    cursorCanvasRef,
    gizmoCanvasRef,
    lastPointerClientRef,
    compositing,
    overlay,
    pointerHandlers
  };
}
