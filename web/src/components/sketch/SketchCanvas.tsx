/**
 * SketchCanvas
 *
 * Core canvas rendering and drawing engine for the sketch editor.
 * Manages raster drawing with brush/eraser/shape/fill tools, zoom/pan,
 * layer compositing with blend modes, and shape preview overlay.
 *
 * After refactor: thin orchestration component that wires together
 * focused hooks for compositing, imperative methods, overlays, and pointer handling.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useRef, useState, forwardRef } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection,
  LayerTransform,
  LayerContentBounds
} from "./types";
import {
  useCompositing,
  useCanvasImperativeHandle,
  useOverlayRenderer,
  usePointerHandlers
} from "./sketchCanvasHooks";
import type { StrokeEndOptions } from "./tools/types";
import type { ActiveStrokeInfo } from "./sketchCanvasHooks/useCompositing";
import SketchCanvasResizeHandles from "./SketchCanvasResizeHandles";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.grey[800],
    // Pen/tablet: avoid browser gestures (Edge/Chrome “back” arrow on horizontal drag).
    touchAction: "none",
    overscrollBehaviorX: "none",
    overscrollBehaviorY: "contain",
    "& canvas": {
      position: "absolute",
      top: "50%",
      left: "50%",
      imageRendering: "pixelated",
      // Hit target is often the canvas; touch-action is not inherited.
      touchAction: "none"
    },
    "& .cursor-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: 10,
      imageRendering: "auto"
    }
  });

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
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SketchCanvasProps {
  document: SketchDocument;
  activeTool: SketchTool;
  /** Effective tool for pointer hit-testing and cursor (e.g. spring move while `activeTool` stays brush). */
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;
  isolatedLayerId?: string | null;
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
  selection?: Selection | null;
  onSelectionChange?: (sel: Selection | null) => void;
  onAutoPickLayer?: (layerId: string) => void;
  foregroundColor?: string;
  /** Merged onto the root container (e.g. for layout hooks / E2E). */
  className?: string;
  /** Called when the pointer leaves the canvas area (e.g. refresh layer thumbnails off the hot path). */
  onCanvasLeave?: () => void;
  /** Called when an image file is dropped onto the canvas. */
  onDropImage?: (file: File) => void;
  /** Called once when the user begins dragging a canvas resize handle (use for history snapshot). */
  onCanvasResizeStart?: () => void;
  /** Called on every pointer-move while dragging a canvas resize handle. */
  onCanvasResize?: (width: number, height: number) => void;
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
      onCropComplete,
      onEyedropperPick,
      selection,
      onSelectionChange,
      onAutoPickLayer,
      foregroundColor,
      className: rootClassName,
      onCanvasLeave,
      onDropImage,
      onCanvasResizeStart,
      onCanvasResize
    } = props;

    const theme = useTheme();
    const [transformPreviewByLayerId, setTransformPreviewByLayerId] = useState<
      Record<string, LayerTransform>
    >({});

    const setLayerTransformPreview = useCallback((layerId: string, transform: LayerTransform) => {
      setTransformPreviewByLayerId((current) => {
        const existing = current[layerId];
        if (
          existing &&
          existing.x === transform.x &&
          existing.y === transform.y &&
          (existing.scaleX ?? 1) === (transform.scaleX ?? 1) &&
          (existing.scaleY ?? 1) === (transform.scaleY ?? 1) &&
          Math.abs((existing.rotation ?? 0) - (transform.rotation ?? 0)) < 1e-9
        ) {
          return current;
        }
        return { ...current, [layerId]: transform };
      });
    }, []);

    const clearLayerTransformPreview = useCallback((layerId?: string) => {
      setTransformPreviewByLayerId((current) => {
        if (layerId == null) {
          if (Object.keys(current).length === 0) {
            return current;
          }
          return {};
        }
        if (!(layerId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[layerId];
        return next;
      });
    }, []);

    // ─── Shared refs (created here to avoid circular deps between hooks) ─
    const containerRef = useRef<HTMLDivElement>(null);
    const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
    const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
    const mousePositionRef = useRef<Point>({ x: 0, y: 0 });
    const activeStrokeRef = useRef<ActiveStrokeInfo | null>(null);

    // ─── Document-space cursor position for info bar readout ────────────
    const [cursorDocPos, setCursorDocPos] = useState<Point | null>(null);

    // ─── Compositing (layer canvases, redraw) ──────────────────────────

    const {
      displayCanvasRef,
      bootstrapDisplayRef,
      bootstrapPhaseActive,
      overlayCanvasRef,
      layerCanvasesRef,
      runtime,
      backend,
      getOrCreateLayerCanvas,
      invalidateLayer,
      redraw,
      redrawDirty,
      requestRedraw,
      requestDirtyRedraw,
      drainPendingStrokeCommit
    } = useCompositing({
      doc,
      zoom,
      isolatedLayerId,
      activeStrokeRef,
      transformPreviewByLayerId
    });

    // ─── Pointer handlers (provides shiftHeldRef, altHeldRef, selectStartRef) ─
    // These refs are needed by the overlay renderer, so we extract them first
    // with stub overlay functions, then wire the real ones below.
    //
    // NOTE: We call usePointerHandlers once with the real overlay functions.
    // shiftHeldRef/altHeldRef/selectStartRef are stable refs that don't change
    // between renders, so the overlay renderer can safely reference them even
    // though they're created inside the same hook.

    // We create the overlay renderer with refs from pointer handler.
    // But overlay renderer needs shiftHeldRef/altHeldRef from pointer handler
    // AND pointer handler needs overlay functions from overlay renderer.
    //
    // Solution: create the modifier refs at this level.
    const shiftHeldRef = useRef(false);
    const altHeldRef = useRef(false);
    const selectStartRef = useRef<Point | null>(null);
    const lassoPointsRef = useRef<Point[]>([]);
    const selectionMoveAntsRef = useRef<{
      start: Selection;
      dx: number;
      dy: number;
    } | null>(null);

    // ─── Overlay and cursor rendering ──────────────────────────────────

    const overlay = useOverlayRenderer({
      doc,
      activeTool,
      interactionTool,
      zoom,
      pan,
      selection,
      selectionMoveAntsRef,
      overlayCanvasRef,
      selectionCanvasRef,
      cursorCanvasRef,
      containerRef,
      shiftHeldRef,
      altHeldRef,
      selectStartRef,
      lassoPointsRef
    });

    // ─── Pointer handlers ──────────────────────────────────────────────

    const pointerHandlers = usePointerHandlers({
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
      foregroundColor,
      onCanvasLeave,
      setLayerTransformPreview,
      clearLayerTransformPreview
    });

    // ─── Drag-and-drop image import ─────────────────────────────────

    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        if (!onDropImage) {
          return;
        }
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.type.startsWith("image/")
        );
        if (file) {
          onDropImage(file);
        }
      },
      [onDropImage]
    );

    // ─── Imperative handle ──────────────────────────────────────────────

    useCanvasImperativeHandle({
      ref,
      doc,
      runtime,
      displayCanvasRef,
      overlayCanvasRef,
      redraw,
      drainPendingStrokeCommit
    });

    // ─── Document-space cursor tracking ─────────────────────────────────

    const updateCursorDocPosFromClient = useCallback(
      (clientX: number, clientY: number) => {
        const display = displayCanvasRef.current;
        if (display) {
          const rect = display.getBoundingClientRect();
          const dx = (clientX - rect.left) / zoom;
          const dy = (clientY - rect.top) / zoom;
          setCursorDocPos({ x: Math.floor(dx), y: Math.floor(dy) });
        }
      },
      [displayCanvasRef, zoom]
    );

    const handlePointerMoveWithCoords = useCallback(
      (e: React.PointerEvent) => {
        pointerHandlers.handlePointerMove(e);
        updateCursorDocPosFromClient(e.clientX, e.clientY);
      },
      [pointerHandlers, updateCursorDocPosFromClient]
    );

    const handleMouseLeaveWithCoords = useCallback(() => {
      pointerHandlers.handleMouseLeave();
      setCursorDocPos(null);
    }, [pointerHandlers]);

    // ─── Transform style ──────────────────────────────────────────────

    const canvasStyle: React.CSSProperties = {
      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      transformOrigin: "center center",
      // Reinforce nearest-neighbor when the bitmap is scaled via transform (some
      // engines still blur canvas layers even when the parent sets imageRendering).
      imageRendering: "pixelated"
    };

    // Determine cursor style based on tool
    const cursorStyle =
      interactionTool === "move" || interactionTool === "transform"
        ? "move"
        : interactionTool === "crop" || interactionTool === "select"
          ? "crosshair"
          : interactionTool === "brush" ||
              interactionTool === "pencil" ||
              interactionTool === "eraser" ||
              interactionTool === "blur"
            ? "none"
            : "crosshair";

    return (
      <div
        ref={containerRef}
        className={
          rootClassName ? `sketch-canvas ${rootClassName}` : "sketch-canvas"
        }
        css={styles(theme)}
        style={{ cursor: cursorStyle }}
        onPointerDown={pointerHandlers.handlePointerDown}
        onPointerMove={handlePointerMoveWithCoords}
        onPointerUp={pointerHandlers.handlePointerUp}
        onDoubleClick={pointerHandlers.handleDoubleClick}
        onPointerLeave={pointerHandlers.handleMouseLeave}
        onMouseLeave={handleMouseLeaveWithCoords}
        onContextMenu={pointerHandlers.handleContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <canvas
          ref={bootstrapDisplayRef}
          className="sketch-canvas__bootstrap"
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={{
            ...canvasStyle,
            pointerEvents: "none",
            ...(bootstrapPhaseActive ? {} : { visibility: "hidden" })
          }}
        />
        <canvas
          ref={displayCanvasRef}
          className="sketch-canvas__display"
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={{
            ...canvasStyle,
            // Hit-test the root `.sketch-canvas` div so pointer capture/stylus
            // routing matches the cursor overlay coordinate space (sibling canvases).
            pointerEvents: "none",
            ...(bootstrapPhaseActive ? { opacity: 0 } : {})
          }}
        />
        {/* Overlay canvas for shape/gradient/crop preview + pixel grid.
            Use auto (not pixelated): grid strokes are 1/zoom doc-units wide; with
            pixelated upscaling they vanish when zoomed in. */}
        <canvas
          ref={overlayCanvasRef}
          className="sketch-canvas__overlay"
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={{
            ...canvasStyle,
            pointerEvents: "none",
            imageRendering: "auto"
          }}
        />
        {/* Screen-resolution canvas for selection marching ants */}
        <canvas
          ref={selectionCanvasRef}
          className="sketch-canvas__selection cursor-overlay"
        />
        {/* Cursor canvas for brush size preview */}
        <canvas
          ref={cursorCanvasRef}
          className="sketch-canvas__cursor cursor-overlay"
        />
        {/* Canvas resize handles (edges + corners) */}
        {onCanvasResize && (
          <SketchCanvasResizeHandles
            canvasWidth={doc.canvas.width}
            canvasHeight={doc.canvas.height}
            zoom={zoom}
            pan={pan}
            onResizeStart={onCanvasResizeStart}
            onResize={onCanvasResize}
          />
        )}
        {/* Canvas info bar */}
        <Box
          className="sketch-canvas__info-bar"
          sx={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.6)",
            color: "#ccc",
            padding: "2px 12px",
            borderRadius: "4px",
            fontSize: "0.7rem",
            pointerEvents: "none",
            zIndex: 5,
            display: "flex",
            gap: "12px"
          }}
        >
          <span>
            {doc.canvas.width} × {doc.canvas.height}
          </span>
          <span>{Math.round(zoom * 100)}%</span>
          {cursorDocPos !== null && (
            <span>
              {cursorDocPos.x}, {cursorDocPos.y}
            </span>
          )}
          <span
            style={{
              textTransform: "uppercase",
              fontSize: "0.6rem",
              opacity: 0.7
            }}
          >
            {backend}
          </span>
        </Box>
      </div>
    );
  }
);

export default SketchCanvas;
