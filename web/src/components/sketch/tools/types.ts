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

import type { SvgIconProps } from "@mui/material/SvgIcon";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection,
  LayerTransform,
  LayerContentBounds
} from "../types";
import type { ActiveStrokeInfo } from "../rendering";

// ─── Tool definition types (used by toolDefinitions registry) ─────────────

export type ToolIconComponent = React.ComponentType<SvgIconProps>;

export interface ToolDefinition {
  tool: SketchTool;
  label: string;
  shortcut?: string;
  Icon: ToolIconComponent;
  group: "painting" | "shape";
}
import type { SelectionMoveAntsRef, GizmoDrawCallback } from "../sketchCanvasHooks/useOverlayRenderer";

/** Optional flags for `onStrokeEnd` when raster data is read back from the CPU canvas. */
export interface StrokeEndOptions {
  /**
   * When false, do not queue a deferred `getLayerData` → `updateLayerData` sync.
   * Transform-only tools (move) must use this so idle flush never overwrites
   * `layer.data` with empty/not-yet-hydrated canvas encodings.
   */
  syncDocumentFromCanvas?: boolean;
}

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
  /** Screen-resolution canvas for transform gizmo drawing (not clipped by doc-stack). */
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
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
  drawOverlayLassoPreview: (points: Point[], cursor: Point | null) => void;
  drawCursor: (clientX: number, clientY: number) => void;

  // ── Screen-resolution gizmo overlay ──────────────────────────────────
  /** Clear the gizmo canvas (screen-resolution overlay for tool handles). */
  clearGizmo: () => void;
  /**
   * Draw on the screen-resolution gizmo canvas. Clears the canvas first,
   * then calls `callback` with the 2D context, device pixel ratio, and
   * container CSS dimensions. Any tool can use this for crisp overlays
   * that are not clipped by the document bounds.
   */
  drawGizmo: (callback: GizmoDrawCallback) => void;

  // ── Editor callbacks ─────────────────────────────────────────────────
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

  // ── Foreground color ───────────────────────────────────────────────
  foregroundColor?: string;

  // ── Transform preview ────────────────────────────────────────────────
  setLayerTransformPreview?: (layerId: string, transform: LayerTransform) => void;
  clearLayerTransformPreview?: (layerId?: string) => void;

  // ── Selection movement overlay (marching ants during drag) ──────────
  selectionMoveAntsRef?: SelectionMoveAntsRef;
  appendSelectionOverlay?: () => void;

  // ── Lasso / polygon selection refs ──────────────────────────────────
  selectStartRef?: React.MutableRefObject<Point | null>;
  lassoPointsRef?: React.MutableRefObject<Point[]>;

  // ── Full composite readback (magic wand, eyedropper) ───────────────
  getFullCompositeImageData?: () => ImageData | null;
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
   * Called on pointer-move when no gesture is active (hover).
   * Allows tools to draw rubber-band previews (e.g. polygon lasso).
   */
  onHoverMove?(ctx: ToolContext, event: ToolPointerEvent): void;

  /**
   * Called on double-click. Used by select tool for polygon close.
   */
  onDoubleClick?(ctx: ToolContext, point: Point): void;

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

  // ── Async tool lifecycle (optional) ──────────────────────────────────
  //
  // Tools with long-running operations (e.g. SAM segmentation, AI inpaint)
  // implement these methods instead of / alongside onUp. The dispatcher
  // calls onCommit after onUp if present, catches errors, and exposes
  // getProgress to the toolbar for a progress indicator.
  //
  // Lifecycle rules:
  //   - An onCommit result is ignored if the tool/document/session changed
  //     while work was pending.
  //   - Tool switch or explicit cancel calls onCancel if present.
  //   - Only successful current-session commits may write to store/history.
  //   - Cancelled, superseded, or stale commits must not push history entries.

  /**
   * Commit the current tool operation asynchronously.
   * Called after onUp for tools that need async processing (inference, etc.).
   * Must create exactly one history transaction on success.
   */
  onCommit?(ctx: ToolContext): Promise<void>;

  /**
   * Cancel an in-progress async operation.
   * Called when the user switches tools, presses Escape, or starts a new
   * gesture that supersedes the pending one.
   */
  onCancel?(ctx: ToolContext): void;

  /**
   * Return the progress of an in-progress async operation.
   * 0–1 for determinate progress, null for indeterminate.
   * Undefined or not implemented means the tool has no async work pending.
   */
  getProgress?(ctx: ToolContext): number | null;
}
