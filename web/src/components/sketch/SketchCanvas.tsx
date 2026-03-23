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
import React, { useRef, forwardRef } from "react";
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
import type { ActiveStrokeInfo } from "./sketchCanvasHooks/useCompositing";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.grey[800],
    "& canvas": {
      position: "absolute",
      top: "50%",
      left: "50%",
      imageRendering: "pixelated",
      border: "1px solid var(--palette-grey-600)"
    },
    "& .cursor-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: 10
    }
  });

// ─── Canvas Ref Interface ────────────────────────────────────────────────────

export interface SketchCanvasRef {
  getLayerData: (layerId: string) => string | null;
  setLayerData: (layerId: string, data: string | null) => void;
  reconcileLayerToDocumentSpace: (layerId: string) => string | null;
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
  nudgeLayer: (layerId: string, dx: number, dy: number) => void;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SketchCanvasProps {
  document: SketchDocument;
  activeTool: SketchTool;
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
  onStrokeEnd: (layerId: string, data: string | null) => void;
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
}

// ─── Component ───────────────────────────────────────────────────────────────

const SketchCanvas = forwardRef<SketchCanvasRef, SketchCanvasProps>(
  function SketchCanvas(props, ref) {
    const {
      document: doc,
      activeTool,
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
      className: rootClassName
    } = props;

    const theme = useTheme();

    // ─── Shared refs (created here to avoid circular deps between hooks) ─
    const containerRef = useRef<HTMLDivElement>(null);
    const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
    const mousePositionRef = useRef<Point>({ x: 0, y: 0 });
    const activeStrokeRef = useRef<ActiveStrokeInfo | null>(null);

    // ─── Compositing (layer canvases, redraw) ──────────────────────────

    const {
      displayCanvasRef,
      overlayCanvasRef,
      layerCanvasesRef,
      runtime,
      backend,
      getOrCreateLayerCanvas,
      invalidateLayer,
      redraw,
      redrawDirty,
      requestRedraw,
      requestDirtyRedraw
    } = useCompositing({ doc, isolatedLayerId, activeStrokeRef });

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

    // ─── Overlay and cursor rendering ──────────────────────────────────

    const overlay = useOverlayRenderer({
      doc,
      activeTool,
      zoom,
      selection,
      overlayCanvasRef,
      cursorCanvasRef,
      containerRef,
      shiftHeldRef,
      altHeldRef,
      selectStartRef
    });

    // ─── Pointer handlers ──────────────────────────────────────────────

    const pointerHandlers = usePointerHandlers({
      doc,
      activeTool,
      zoom,
      pan,
      mirrorX,
      mirrorY,
      symmetryMode,
      symmetryRays,
      selection,
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
      drawOverlayShape: overlay.drawOverlayShape,
      drawOverlayGradient: overlay.drawOverlayGradient,
      drawOverlayCrop: overlay.drawOverlayCrop,
      drawOverlaySelection: overlay.drawOverlaySelection,
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
      onSelectionChange,
      onAutoPickLayer,
      foregroundColor
    });

    // ─── Imperative handle ──────────────────────────────────────────────

    useCanvasImperativeHandle({
      ref,
      doc,
      runtime,
      displayCanvasRef,
      overlayCanvasRef,
      redraw
    });

    // ─── Transform style ──────────────────────────────────────────────

    const canvasStyle: React.CSSProperties = {
      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      transformOrigin: "center center"
    };

    // Determine cursor style based on tool
    const cursorStyle =
      activeTool === "move"
        ? "move"
        : activeTool === "crop" || activeTool === "select"
          ? "crosshair"
          : activeTool === "brush" ||
              activeTool === "pencil" ||
              activeTool === "eraser" ||
              activeTool === "blur"
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
        onPointerMove={pointerHandlers.handlePointerMove}
        onPointerUp={pointerHandlers.handlePointerUp}
        onMouseMove={pointerHandlers.handleMouseMove}
        onMouseLeave={pointerHandlers.handleMouseLeave}
        onContextMenu={pointerHandlers.handleContextMenu}
      >
        <canvas
          ref={displayCanvasRef}
          className="sketch-canvas__display"
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={canvasStyle}
        />
        {/* Overlay canvas for shape/gradient/crop preview */}
        <canvas
          ref={overlayCanvasRef}
          className="sketch-canvas__overlay"
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={{ ...canvasStyle, pointerEvents: "none" }}
        />
        {/* Cursor canvas for brush size preview */}
        <canvas
          ref={cursorCanvasRef}
          className="sketch-canvas__cursor cursor-overlay"
        />
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
