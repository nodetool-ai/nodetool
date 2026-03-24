/**
 * Tool handler interface and shared context for Phase 3: Tool/Runtime split.
 *
 * Each tool implements `ToolHandler` with optional `onDown`, `onMove`, `onUp`.
 * The pointer handler dispatches to the active tool handler instead of
 * containing all tool logic inline.
 *
 * ToolContext provides everything a tool needs without tight coupling to
 * the React hook's internal refs.
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

// ─── Tool context (injected dependencies) ─────────────────────────────────

export interface ToolContext {
  /** Current document state. */
  doc: SketchDocument;
  /** Active tool type. */
  activeTool: SketchTool;
  /** Current zoom level. */
  zoom: number;
  /** Current pan offset. */
  pan: Point;
  /** Mirror/symmetry config. */
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;
  /** Current selection rectangle, if any. */
  selection: Selection | null | undefined;

  // ── Canvas refs ──────────────────────────────────────────────────────
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  mousePositionRef: React.MutableRefObject<Point>;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;

  // ── Layer canvas ops ─────────────────────────────────────────────────
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  /** Notify the runtime that a layer's CPU-side pixels have changed. */
  invalidateLayer?: (layerId: string) => void;

  // ── Compositing requests ─────────────────────────────────────────────
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;

  // ── Overlay rendering ────────────────────────────────────────────────
  clearOverlay: () => void;
  drawSelectionOverlay: () => void;
  drawOverlayShape: (start: Point, end: Point) => void;
  drawOverlayGradient: (start: Point, end: Point) => void;
  drawOverlayCrop: (start: Point, end: Point) => void;
  drawOverlaySelection: (start: Point, end: Point) => void;
  drawCursor: (screenX: number, screenY: number) => void;

  // ── Editor callbacks ─────────────────────────────────────────────────
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  onStrokeStart: () => void;
  onStrokeEnd: (layerId: string, data: string | null, committedBounds?: LayerContentBounds) => void;
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

  // ── Coordinate helpers ───────────────────────────────────────────────
  screenToCanvas: (clientX: number, clientY: number) => Point;

  // ── Modifier key state ───────────────────────────────────────────────
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;

  // ── Symmetry helper ──────────────────────────────────────────────────
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

  // ── Selection clipping ───────────────────────────────────────────────
  clipSelectionForOffset: (
    ctx: CanvasRenderingContext2D,
    offset: Point
  ) => boolean;
}

// ─── Pointer event data ───────────────────────────────────────────────────

export interface ToolPointerEvent {
  /** Canvas-space coordinates (already transformed from screen space). */
  point: Point;
  /** Pointer pressure (0–1). */
  pressure: number;
  /** Original React pointer event (for pointer capture, etc.). */
  nativeEvent: React.PointerEvent;
}

// ─── Tool handler interface ───────────────────────────────────────────────

export interface ToolHandler {
  /** Unique tool identifier. */
  readonly toolId: SketchTool;

  /**
   * Called when the primary button is pressed.
   * Return `true` to indicate the tool started a gesture (drawing/dragging).
   * Return `false` or `undefined` to indicate the event was not handled.
   */
  onDown?(ctx: ToolContext, event: ToolPointerEvent): boolean | void;

  /**
   * Called for each pointer move while a gesture is active.
   * The `coalescedPoints` array contains all coalesced points for the event
   * (for high-frequency input devices).
   */
  onMove?(
    ctx: ToolContext,
    event: ToolPointerEvent,
    coalescedPoints: ToolPointerEvent[]
  ): void;

  /**
   * Called when the primary button is released and a gesture was active.
   */
  onUp?(ctx: ToolContext, event: ToolPointerEvent): void;

  /**
   * Called when the tool is activated (switched to).
   * Allows the tool to initialize state.
   */
  onActivate?(ctx: ToolContext): void;

  /**
   * Called when the tool is deactivated (switched away from).
   * Allows the tool to clean up state.
   */
  onDeactivate?(ctx: ToolContext): void;
}
