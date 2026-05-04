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

import { useEffect, useRef } from "react";
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

// ─── Params ──────────────────────────────────────────────────────────────────

export interface UseCanvasOrchestrationParams {
  // ── Document state ─────────────────────────────────────────────────
  /** Bare document (no toolSettings) — consumed by compositing. */
  doc: SketchDocument;
  /** Document merged with live toolSettings — consumed by overlay + pointer. */
  docWithTools: SketchDocument;
  selection?: Selection | null;
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
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const gizmoCanvasRef = useRef<HTMLCanvasElement>(null);
  const mousePositionRef = useRef<Point>({ x: 0, y: 0 });
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const activeStrokeRef = useRef<ActiveStrokeInfo | null>(null);

  // ─── Modifier refs (shared between overlay + pointer) ─────────────
  // Created at this level to break the circular dependency: overlay needs
  // shift/alt refs from pointer, pointer needs overlay draw callbacks.
  const shiftHeldRef = useRef(false);
  const altHeldRef = useRef(false);
  const selectStartRef = useRef<Point | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const setSelectionOriginOverride = (pos: { x: number; y: number } | null) => {
    const rt = compositing.runtime as { setSelectionOriginOverride?: (pos: { x: number; y: number } | null) => void };
    rt.setSelectionOriginOverride?.(pos);
  };

  // ─── Compositing (layer canvases, redraw) ──────────────────────────

  const compositing = useCompositing({
    doc,
    zoom,
    isolatedLayerId,
    activeStrokeRef,
    transformPreviewByLayerIdRef,
    coordinatorRef
  });

  // Wire the preview bridge refs to compositing output.
  requestPreviewRedrawRef.current = compositing.requestRedraw;
  invalidateLayerRef.current = compositing.invalidateLayer;

  // Sync active selection to the GPU runtime (WebGPU uploads r8unorm mask texture).
  // Also request a redraw so the mask texture is uploaded and ants animation starts.
  useEffect(() => {
    compositing.runtime.setSelection(selection ?? null);
    compositing.requestRedraw();
  }, [compositing.runtime, compositing.requestRedraw, selection]);

  // Wire continuous redraw callback so the GPU ants can animate at rAF rate.
  useEffect(() => {
    const rt = compositing.runtime as { onNeedsRedraw?: () => void };
    rt.onNeedsRedraw = compositing.requestRedraw;
    return () => { rt.onNeedsRedraw = undefined; };
  }, [compositing.runtime, compositing.requestRedraw]);

  // ─── Overlay and cursor rendering ──────────────────────────────────

  const overlay = useOverlayRenderer({
    doc: docWithTools,
    activeTool,
    interactionTool,
    zoom,
    pan,
    selection,
    overlayCanvasRef: compositing.overlayCanvasRef,
    selectionCanvasRef,
    cursorCanvasRef,
    gizmoCanvasRef,
    containerRef,
    shiftHeldRef,
    altHeldRef,
    selectStartRef,
    lassoPointsRef
  });

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
    displayCanvasRef: compositing.displayCanvasRef,
    overlayCanvasRef: compositing.overlayCanvasRef,
    cursorCanvasRef,
    gizmoCanvasRef,
    containerRef,
    layerCanvasesRef: compositing.layerCanvasesRef,
    mousePositionRef,
    activeStrokeRef,
    runtime: compositing.runtime,
    getOrCreateLayerCanvas: compositing.getOrCreateLayerCanvas,
    invalidateLayer: compositing.invalidateLayer,
    redraw: compositing.redraw,
    redrawDirty: compositing.redrawDirty,
    requestRedraw: compositing.requestRedraw,
    requestDirtyRedraw: compositing.requestDirtyRedraw,
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
    clearLayerTransformPreview
  });

  return {
    containerRef,
    selectionCanvasRef,
    cursorCanvasRef,
    gizmoCanvasRef,
    lastPointerClientRef,
    compositing,
    overlay,
    pointerHandlers
  };
}
