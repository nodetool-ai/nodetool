/**
 * buildToolContext — shared tool-runtime context builder.
 *
 * Extracts the ToolContext construction from usePointerHandlers so the
 * same builder can be used by tests, and so usePointerHandlers and
 * tools/types.ts share one authoritative mapping from runtime params
 * to ToolContext fields.
 *
 * The builder takes a subset of UsePointerHandlersParams (plus utility
 * callbacks) and returns a complete ToolContext object.
 */

import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection,
  LayerTransform,
  LayerContentBounds
} from "../types";
import type { ActiveStrokeInfo } from "../rendering";
import type { ToolContext, StrokeEndOptions, ToolRuntime } from "./types";
import type { GizmoDrawCallback } from "../sketchCanvasHooks/useOverlayRenderer";

/** All dependencies needed to build a ToolContext. */
export interface BuildToolContextParams {
  // ── Document / tool state ──
  doc: SketchDocument;
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;
  selection: Selection | null | undefined;
  foregroundColor?: string;

  // ── Canvas refs ──
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  mousePositionRef: React.MutableRefObject<Point>;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  runtime?: ToolRuntime;

  // ── Layer canvas ops ──
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer?: (layerId: string) => void;

  // ── Compositing ──
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;

  // ── Overlays ──
  clearOverlay: () => void;
  drawSelectionOverlay: () => void;
  drawOverlayShape: (start: Point, end: Point) => void;
  drawOverlayGradient: (start: Point, end: Point) => void;
  drawOverlayCrop: (start: Point, end: Point) => void;
  drawOverlaySelection: (start: Point, end: Point) => void;
  drawOverlayLassoPreview: (points: Point[], cursor: Point | null) => void;
  drawCursor: (clientX: number, clientY: number) => void;
  clearGizmo: () => void;
  drawGizmo: (callback: GizmoDrawCallback) => void;

  // ── Editor callbacks ──
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
  onCropComplete?: (
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  onEyedropperPick?: (color: string) => void;
  onSelectionChange?: (sel: Selection | null) => void;
  onAutoPickLayer?: (layerId: string) => void;

  // ── Coordinate helpers ──
  screenToCanvas: (clientX: number, clientY: number) => Point;

  // ── Modifier refs ──
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;

  // ── Symmetry helper ──
  withMirror: (
    ctx: CanvasRenderingContext2D,
    drawFn: (
      from: Point,
      to: Point,
      c: CanvasRenderingContext2D,
      branchIndex: number
    ) => void,
    from: Point,
    to: Point
  ) => void;

  // ── Transform preview ──
  setLayerTransformPreview?: (layerId: string, transform: LayerTransform) => void;
  clearLayerTransformPreview?: (layerId?: string) => void;

  // ── Selection movement ──
  setSelectionOriginOverride?: (pos: { x: number; y: number } | null) => void;
  appendSelectionOverlay?: () => void;

  // ── Lasso / polygon refs ──
  selectStartRef?: React.MutableRefObject<Point | null>;
  lassoPointsRef?: React.MutableRefObject<Point[]>;

  // ── Full composite readback ──
  getFullCompositeImageData?: () => ImageData | null;
}

/**
 * Build a ToolContext from the given parameters.
 *
 * This is a pure mapping function — no side effects, no hooks, no state.
 * It centralizes the parameter-to-context mapping that was previously
 * inlined in `usePointerHandlers`.
 */
export function buildToolContext(params: BuildToolContextParams): ToolContext {
  return {
    doc: params.doc,
    activeTool: params.interactionTool,
    zoom: params.zoom,
    pan: params.pan,
    mirrorX: params.mirrorX,
    mirrorY: params.mirrorY,
    symmetryMode: params.symmetryMode,
    symmetryRays: params.symmetryRays,
    selection: params.selection ?? null,
    displayCanvasRef: params.displayCanvasRef,
    overlayCanvasRef: params.overlayCanvasRef,
    gizmoCanvasRef: params.gizmoCanvasRef,
    cursorCanvasRef: params.cursorCanvasRef,
    containerRef: params.containerRef,
    layerCanvasesRef: params.layerCanvasesRef,
    mousePositionRef: params.mousePositionRef,
    activeStrokeRef: params.activeStrokeRef,
    runtime: params.runtime,
    getOrCreateLayerCanvas: params.getOrCreateLayerCanvas,
    invalidateLayer: params.invalidateLayer,
    redraw: params.redraw,
    redrawDirty: params.redrawDirty,
    requestRedraw: params.requestRedraw,
    requestDirtyRedraw: params.requestDirtyRedraw,
    clearOverlay: params.clearOverlay,
    drawSelectionOverlay: params.drawSelectionOverlay,
    drawOverlayShape: params.drawOverlayShape,
    drawOverlayGradient: params.drawOverlayGradient,
    drawOverlayCrop: params.drawOverlayCrop,
    drawOverlaySelection: params.drawOverlaySelection,
    drawOverlayLassoPreview: params.drawOverlayLassoPreview,
    drawCursor: params.drawCursor,
    clearGizmo: params.clearGizmo,
    drawGizmo: params.drawGizmo,
    onZoomChange: params.onZoomChange,
    onPanChange: params.onPanChange,
    onStrokeStart: params.onStrokeStart,
    onStrokeEnd: params.onStrokeEnd,
    onLayerTransformChange: params.onLayerTransformChange,
    onLayerContentBoundsChange: params.onLayerContentBoundsChange,
    onBrushSizeChange: params.onBrushSizeChange,
    onContextMenu: params.onContextMenu,
    onCropComplete: params.onCropComplete,
    onEyedropperPick: params.onEyedropperPick,
    onSelectionChange: params.onSelectionChange,
    onAutoPickLayer: params.onAutoPickLayer,
    screenToCanvas: params.screenToCanvas,
    shiftHeldRef: params.shiftHeldRef,
    altHeldRef: params.altHeldRef,
    withMirror: params.withMirror,
    foregroundColor: params.foregroundColor,
    setLayerTransformPreview: params.setLayerTransformPreview,
    clearLayerTransformPreview: params.clearLayerTransformPreview,
    setSelectionOriginOverride: params.setSelectionOriginOverride,
    appendSelectionOverlay: params.appendSelectionOverlay,
    selectStartRef: params.selectStartRef,
    lassoPointsRef: params.lassoPointsRef,
    getFullCompositeImageData: params.getFullCompositeImageData,
  };
}
