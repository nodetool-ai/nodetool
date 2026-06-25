/**
 * SketchCanvas
 *
 * Core canvas rendering and drawing engine for the sketch editor.
 * Manages raster drawing with brush/eraser/shape/fill tools, zoom/pan,
 * layer compositing with blend modes, and shape preview overlay.
 *
 * After refactor: thin orchestration component that delegates to:
 * - `useTransformPreviewBridge` — preview-map ownership and invalidation
 * - `useCanvasOrchestration` — ref creation, compositing/overlay/pointer wiring
 * - `SketchCanvasPresentation` — stacked canvas JSX, chrome, info bar
 */

import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
  forwardRef
} from "react";
import type { Asset } from "../../stores/ApiTypes";
import {
  deserializeDragData,
  DRAG_DATA_MIME
} from "../../lib/dragdrop/serialization";
import { useSketchStore } from "./state";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection,
  LayerTransform,
  LayerContentBounds
} from "./types";
import {
  DisplayFrameCoordinator,
  useCanvasImperativeHandle,
  useTransformPreviewBridge,
  useCanvasOrchestration
} from "./sketchCanvasHooks";
import { clientToDocumentCanvas } from "./tools/transform/handleGeometry";
import type { StrokeEndOptions } from "./tools/types";
import SketchCanvasPresentation from "./SketchCanvasPresentation";
import GeneratingLayerOverlay from "./GeneratingLayerOverlay";
import { getToolHandler } from "./tools";
import { TransformTool } from "./tools/TransformTool";

// ─── Canvas Ref Interface ────────────────────────────────────────────────────

export interface SketchCanvasRef {
  getLayerData: (layerId: string) => string | null;
  setLayerData: (
    layerId: string,
    data: string | null,
    boundsOverride?: LayerContentBounds
  ) => void;
  reconcileLayerToDocumentSpace: (layerId: string) => string | null;
  trimLayerToBounds: (
    layerId: string
  ) => { data: string; bounds: LayerContentBounds } | null;
  snapshotLayerCanvas: (layerId: string) => HTMLCanvasElement | null;
  restoreLayerCanvas: (layerId: string, source: HTMLCanvasElement) => void;
  flattenToDataUrl: () => string;
  getMaskDataUrl: () => string | null;
  clearLayer: (layerId: string) => void;
  clearLayerRect: (
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  flipLayer: (layerId: string, direction: "horizontal" | "vertical") => void;
  rotateLayer180: (layerId: string) => void;
  mergeLayerDown: (
    upperLayerId: string,
    lowerLayerId: string
  ) => string | undefined;
  flattenVisible: () => string;
  cropCanvas: (x: number, y: number, width: number, height: number) => void;
  applyAdjustments: (
    brightness: number,
    contrast: number,
    saturation: number
  ) => void;
  invertLayerColors: (
    selection?: {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      originX?: number;
      originY?: number;
    } | null
  ) => void;
  fillLayerWithColor: (layerId: string, color: string) => void;
  fillLayerRect: (
    layerId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string
  ) => void;
  clearLayerBySelectionMask: (
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection
  ) => void;
  fillLayerBySelectionMask: (
    layerId: string,
    offsetX: number,
    offsetY: number,
    mask: Selection,
    color: string
  ) => void;
  nudgeLayer: (layerId: string, dx: number, dy: number) => void;
  /** Full display composite (layer visibility, opacity, blend, isolation). */
  redrawDisplay: () => void;
  /** Merge deferred stroke buffer onto the layer if pointer-up rAF has not run yet. */
  drainPendingStrokeCommit: () => void;
  /** Get the overlay canvas element for external drawing (e.g. segmentation mask preview). */
  getOverlayCanvas: () => HTMLCanvasElement | null;
  /**
   * Document-space pixel (top-left of cell under cursor) from the last pointer
   * sample on the canvas, or null if the user has not interacted yet.
   */
  getPasteAnchorDocumentPoint: () => Point | null;
  /** Cancel the active tool's in-progress operation (e.g. crop drag, transform). */
  cancelActiveTool: () => void;
  /** Apply pending crop (crop tool — Enter / Apply). */
  commitPendingCrop: () => void;
  /** Get the raw layer canvas element for offset/bounds lookups (authoritative over layer.contentBounds). */
  getLayerCanvas: (layerId: string) => HTMLCanvasElement | null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

/**
 * Props for `SketchCanvas`.
 *
 * ## Boundary contract
 *
 * `SketchCanvas` is the bridge between committed store state (passed as props
 * from `SketchCanvasPane`) and the rendering/interaction hooks:
 *
 * - **Compositing** (`useCompositing`) receives the bare `doc` prop — it does
 *   NOT see `toolSettings` changes. This prevents slider ticks from triggering
 *   expensive compositing redraws.
 * - **Pointer handlers** (`usePointerHandlers`) receive `docWithTools` (doc +
 *   live toolSettings) but capture it in a ref (`toolCtxRef`). Tool handlers
 *   always read the latest state without causing hook re-renders.
 * - **Overlay renderer** (`useOverlayRenderer`) receives `docWithTools` so
 *   cursor/ring previews update on tool settings changes.
 * - **Transient preview state** (transform previews, cursor position) is local
 *   `useState`/`useRef` inside this component — never stored in Zustand.
 *
 * The single Zustand subscription in this component is `toolSettings`, which
 * is merged into `docWithTools` via `useMemo`. All other state arrives as props.
 *
 * Props are grouped by concern:
 */
export interface SketchCanvasProps {
  // ── Committed document state ───────────────────────────────────────
  document: SketchDocument;
  selection?: Selection | null;
  /** "ants" (default marching ants) or "mask" (red rubylith overlay). */
  selectionPreviewMode?: "ants" | "mask";
  isolatedLayerId?: string | null;
  foregroundColor?: string;

  // ── Viewport / tool state ──────────────────────────────────────────
  activeTool: SketchTool;
  /** Effective tool for pointer hit-testing and cursor (e.g. spring move while `activeTool` stays brush). */
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;

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
  /** Called when the pointer leaves the canvas area (e.g. refresh layer thumbnails off the hot path). */
  onCanvasLeave?: () => void;
  /** Called when an image file is dropped onto the canvas. */
  onDropImage?: (file: File) => void;
  /** Called when an imported image asset is dropped onto the canvas. */
  onDropAsset?: (asset: Asset) => void;
  /** Called once when the user begins dragging a canvas resize handle (use for history snapshot). */
  onCanvasResizeStart?: () => void;
  /** Called on every pointer-move while dragging a canvas resize handle. */
  onCanvasResize?: (
    width: number,
    height: number,
    options?: { translateLayers?: Point; resizeFromCenter?: boolean }
  ) => void;

  // ── Layout / testing ───────────────────────────────────────────────
  /** Merged onto the root container (e.g. for layout hooks / E2E). */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

const SketchCanvas = forwardRef<SketchCanvasRef, SketchCanvasProps>(
  function SketchCanvas(props, ref) {
    const {
      document: doc,
      activeTool,
      interactionTool,
      zoom,
      pan,
      mirrorX,
      mirrorY,
      symmetryMode,
      symmetryRays,
      isolatedLayerId,
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
      selection,
      selectionPreviewMode,
      onSelectionChange,
      onAutoPickLayer,
      foregroundColor,
      className: rootClassName,
      onCanvasLeave,
      onDropImage,
      onDropAsset,
      onCanvasResizeStart,
      onCanvasResize
    } = props;

    // Subscribe to live toolSettings directly so that brush/color changes trigger
    // only a SketchCanvas re-render (not a compositing cascade). The bare `doc`
    // prop is intentionally passed to useCompositing so that compositing effects
    // do not fire on every slider tick.
    const liveToolSettings = useSketchStore((s) => s.toolSettings);
    const docWithTools = useMemo(
      () => ({ ...doc, toolSettings: liveToolSettings }),
      [doc, liveToolSettings]
    );

    // ─── Transform preview bridge ──────────────────────────────────────

    const coordinatorRef = useRef<DisplayFrameCoordinator | null>(null);
    if (!coordinatorRef.current) {
      coordinatorRef.current = new DisplayFrameCoordinator();
    }

    const {
      transformPreviewByLayerIdRef,
      requestPreviewRedrawRef,
      invalidateLayerRef,
      setLayerTransformPreview,
      clearLayerTransformPreview
    } = useTransformPreviewBridge({ coordinatorRef });

    // ─── Canvas orchestration (refs, compositing, overlay, pointer) ────

    const {
      containerRef,
      selectionGpuCanvasRef,
      selectionCanvasRef,
      cursorCanvasRef,
      gizmoCanvasRef,
      lastPointerClientRef,
      compositing,
      overlay,
      pointerHandlers
    } = useCanvasOrchestration({
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
      selectionPreviewMode,
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
    });

    // ─── Drag-and-drop image import ─────────────────────────────────

    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (
        e.dataTransfer.types.includes("Files") ||
        e.dataTransfer.types.includes(DRAG_DATA_MIME) ||
        e.dataTransfer.types.includes("asset")
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        const dragData = deserializeDragData(e.dataTransfer);
        const draggedAsset =
          dragData?.type === "asset" ? (dragData.payload as Asset) : null;
        if (
          draggedAsset &&
          draggedAsset.content_type.startsWith("image/") &&
          onDropAsset
        ) {
          onDropAsset(draggedAsset);
          return;
        }
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.type.startsWith("image/")
        );
        if (file && onDropImage) {
          onDropImage(file);
        }
      },
      [onDropAsset, onDropImage]
    );

    // ─── Imperative handle ──────────────────────────────────────────────

    useCanvasImperativeHandle({
      ref,
      doc,
      runtime: compositing.runtime,
      displayCanvasRef: compositing.displayCanvasRef,
      overlayCanvasRef: compositing.overlayCanvasRef,
      redraw: compositing.redraw,
      drainPendingStrokeCommit: compositing.drainPendingStrokeCommit,
      zoom,
      lastPointerClientRef,
      cancelActiveTool: pointerHandlers.cancelActiveTool,
      commitPendingCrop: pointerHandlers.commitPendingCrop
    });

    // ─── Redraw cursor when tool settings change ──────────────────────
    // When brush size/hardness/etc. change via sliders or keyboard shortcuts,
    // the cursor ring must update immediately even without pointer movement.
    useEffect(() => {
      const client = lastPointerClientRef.current;
      if (client) {
        overlay.drawCursor(client.x, client.y);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [overlay.drawCursor]);

    // ─── Document-space cursor tracking ─────────────────────────────────

    const [cursorDocPos, setCursorDocPos] = useState<Point | null>(null);
    // Mirror the document-space cursor into the store so the (standalone)
    // status bar can read it without prop-drilling. Local state still drives
    // the floating info pill used by the in-node modal.
    const setStoreCursorDocPos = useSketchStore((s) => s.setCursorDocPos);
    // The standalone editor (bound document) shows the full-width status bar,
    // which subsumes the floating info pill — hide the pill there. The in-node
    // modal (no documentId) keeps the pill.
    const standaloneDocumentId = useSketchSessionStore((s) => s.documentId);

    const updateCursorDocPosFromClient = useCallback(
      (clientX: number, clientY: number) => {
        const displayCanvas = compositing.displayCanvasRef.current;
        if (displayCanvas) {
          const rect = displayCanvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const p = {
              x: ((clientX - rect.left) / rect.width) * doc.canvas.width,
              y: ((clientY - rect.top) / rect.height) * doc.canvas.height
            };
            const next = { x: Math.floor(p.x), y: Math.floor(p.y) };
            setCursorDocPos(next);
            setStoreCursorDocPos(next);
            return;
          }
        }

        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const p = clientToDocumentCanvas(
            clientX,
            clientY,
            rect,
            zoom,
            pan,
            doc.canvas.width,
            doc.canvas.height
          );
          const next = { x: Math.floor(p.x), y: Math.floor(p.y) };
          setCursorDocPos(next);
          setStoreCursorDocPos(next);
        }
      },
      [
        compositing.displayCanvasRef,
        doc.canvas.width,
        doc.canvas.height,
        containerRef,
        zoom,
        pan,
        setStoreCursorDocPos
      ]
    );

    const handlePointerMoveWithCoords = useCallback(
      (e: React.PointerEvent) => {
        lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
        pointerHandlers.handlePointerMove(e);
        updateCursorDocPosFromClient(e.clientX, e.clientY);
      },
      [lastPointerClientRef, pointerHandlers, updateCursorDocPosFromClient]
    );

    const handlePointerDownWithClient = useCallback(
      (e: React.PointerEvent) => {
        lastPointerClientRef.current = { x: e.clientX, y: e.clientY };
        pointerHandlers.handlePointerDown(e);
      },
      [lastPointerClientRef, pointerHandlers]
    );

    const handleMouseLeaveWithCoords = useCallback(() => {
      pointerHandlers.handleMouseLeave();
      setCursorDocPos(null);
      setStoreCursorDocPos(null);
    }, [pointerHandlers, setStoreCursorDocPos]);

    // ─── Render ──────────────────────────────────────────────────────────

    const transformTool = useMemo(() => {
      const handler = getToolHandler("transform");
      if (!(handler instanceof TransformTool)) {
        throw new Error("Expected TransformTool singleton from tool registry");
      }
      return handler;
    }, []);

    return (
      <SketchCanvasPresentation
        containerRef={containerRef}
        bootstrapDisplayRef={compositing.bootstrapDisplayRef}
        displayCanvasRef={compositing.displayCanvasRef}
        overlayCanvasRef={compositing.overlayCanvasRef}
        selectionGpuCanvasRef={selectionGpuCanvasRef}
        selectionCanvasRef={selectionCanvasRef}
        cursorCanvasRef={cursorCanvasRef}
        gizmoCanvasRef={gizmoCanvasRef}
        transformTool={transformTool}
        canvasWidth={doc.canvas.width}
        canvasHeight={doc.canvas.height}
        zoom={zoom}
        pan={pan}
        interactionTool={interactionTool}
        bootstrapPhaseActive={compositing.bootstrapPhaseActive}
        backend={compositing.backend}
        cursorDocPos={cursorDocPos}
        showInfoBar={!standaloneDocumentId}
        containerCursor={pointerHandlers.containerCursor}
        onPointerDown={handlePointerDownWithClient}
        onPointerMove={handlePointerMoveWithCoords}
        onPointerUp={pointerHandlers.handlePointerUp}
        onDoubleClick={pointerHandlers.handleDoubleClick}
        onPointerLeave={pointerHandlers.handlePointerLeave}
        onMouseLeave={handleMouseLeaveWithCoords}
        onContextMenu={pointerHandlers.handleContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onCanvasResizeStart={onCanvasResizeStart}
        onCanvasResize={onCanvasResize}
        className={rootClassName}
        docOverlay={<GeneratingLayerOverlay />}
      />
    );
  }
);

export default SketchCanvas;
