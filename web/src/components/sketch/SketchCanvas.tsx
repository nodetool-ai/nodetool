/**
 * SketchCanvas
 *
 * Core canvas rendering and drawing engine for the sketch editor.
 * Manages raster drawing with brush/eraser/shape/fill tools, zoom/pan,
 * layer compositing with blend modes, and shape preview overlay.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import {
  SketchDocument,
  SketchTool,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  Point,
  Selection,
  isShapeTool,
  isPaintingTool
} from "./types";
import {
  blendModeToComposite,
  drawCheckerboard,
  drawBrushStroke as drawBrushStrokeUtil,
  drawEraserStroke as drawEraserStrokeUtil,
  drawPencilStroke as drawPencilStrokeUtil,
  drawBlurStroke as drawBlurStrokeUtil,
  drawCloneStampStroke as drawCloneStampStrokeUtil,
  drawGradient as drawGradientUtil,
  constrainEnd as constrainEndUtil,
  applyAltCenterDraw as applyAltCenterDrawUtil,
  drawShapeOnCtx as drawShapeOnCtxUtil,
  floodFill as floodFillUtil
} from "./drawingUtils";
import type { BlurTempCanvases } from "./drawingUtils";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.grey[700],
    "& canvas": {
      position: "absolute",
      top: "50%",
      left: "50%",
      imageRendering: "pixelated"
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
  isolatedLayerId?: string | null;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  onStrokeStart: () => void;
  onStrokeEnd: (layerId: string, data: string | null) => void;
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
  /** Merged onto the root container (e.g. for layout hooks / E2E). */
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const STABILIZER_WINDOW = 4; // Number of points to average
const SELECTION_DASH_LENGTH = 4;
const SELECTION_DASH_OFFSET = SELECTION_DASH_LENGTH;

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
      isolatedLayerId,
      onZoomChange,
      onPanChange,
      onStrokeStart,
      onStrokeEnd,
      onBrushSizeChange,
      onContextMenu,
      onCropComplete,
      onEyedropperPick,
      selection,
      onSelectionChange,
      className: rootClassName
    } = props;

    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
    const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<Point | null>(null);
    const lastSmoothedPointRef = useRef<Point | null>(null);
    const isPanningRef = useRef(false);
    const isSpacePanningRef = useRef(false);
    const panStartRef = useRef<Point>({ x: 0, y: 0 });
    const panOffsetRef = useRef<Point>(pan);
    const mousePositionRef = useRef<Point>({ x: 0, y: 0 });
    const shiftHeldRef = useRef(false);
    const spaceHeldRef = useRef(false);
    const sKeyHeldRef = useRef(false);
    const altHeldRef = useRef(false);
    const isSizeDraggingRef = useRef(false);
    const sizeDragStartRef = useRef<Point>({ x: 0, y: 0 });
    const sizeDragInitialSize = useRef(0);

    // Shape tool state
    const shapeStartRef = useRef<Point | null>(null);

    // Move tool state
    const moveStartRef = useRef<Point | null>(null);
    const moveLayerSnapshotRef = useRef<HTMLCanvasElement | null>(null);

    // Gradient tool state
    const gradientStartRef = useRef<Point | null>(null);
    const gradientEndRef = useRef<Point | null>(null);

    // Crop tool state
    const cropStartRef = useRef<Point | null>(null);

    // Select tool state
    const selectStartRef = useRef<Point | null>(null);

    // Clone stamp state
    const cloneSourceRef = useRef<Point | null>(null);
    const cloneOffsetRef = useRef<Point | null>(null);
    const cloneSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // Alpha lock: snapshot of layer alpha before stroke starts
    const alphaSnapshotRef = useRef<ImageData | null>(null);
    const strokeDirtyRectRef = useRef<{
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } | null>(null);

    // Shift+click straight line: persists the end point of the last stroke
    const lastStrokeEndRef = useRef<Point | null>(null);

    // Stroke stabilizer: circular buffer of recent points for smoothing
    const stabilizerBufferRef = useRef<Point[]>([]);

    // Pressure sensitivity: store current pointer pressure
    const currentPressureRef = useRef<number>(0.5);

    // Performance: rAF-batched redraw to avoid recompositing on every pointer move
    const redrawRequestRef = useRef<number | null>(null);

    // Performance: reusable temp canvases for blur tool (avoids 3 allocs per stroke)
    const blurTempCanvasesRef = useRef<BlurTempCanvases>({ tmp: null, blurred: null, mask: null });
    const blurSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const brushStampCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const eraserStampCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

    useEffect(() => {
      panOffsetRef.current = pan;
    }, [pan]);

    // Size the cursor overlay canvas only when the container size changes.
    useEffect(() => {
      const container = containerRef.current;
      const cursorCanvas = cursorCanvasRef.current;
      if (!container || !cursorCanvas) {
        return;
      }

      const updateCursorCanvasSize = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (cursorCanvas.width !== width) {
          cursorCanvas.width = width;
        }
        if (cursorCanvas.height !== height) {
          cursorCanvas.height = height;
        }
      };

      updateCursorCanvasSize();

      const resizeObserver = new ResizeObserver(() => {
        updateCursorCanvasSize();
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
      };
    }, []);

    // Track Shift, Space, S, and Alt key state for constraints, panning, size adjust, center-draw
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Shift") {
          shiftHeldRef.current = true;
        }
        if (e.key === " ") {
          spaceHeldRef.current = true;
        }
        if (e.key === "s" || e.key === "S") {
          sKeyHeldRef.current = true;
        }
        if (e.key === "Alt") {
          altHeldRef.current = true;
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Shift") {
          shiftHeldRef.current = false;
        }
        if (e.key === " ") {
          spaceHeldRef.current = false;
          if (isSpacePanningRef.current) {
            isSpacePanningRef.current = false;
          }
        }
        if (e.key === "s" || e.key === "S") {
          sKeyHeldRef.current = false;
          isSizeDraggingRef.current = false;
        }
        if (e.key === "Alt") {
          altHeldRef.current = false;
        }
      };
      // Use capture phase (third arg = true) so these handlers fire BEFORE the
      // SketchEditor's capture-phase handler that calls stopPropagation().
      // Without this, Shift/Space/S key state would never be tracked, which
      // breaks Shift+click straight lines, Space+drag panning, and S+drag
      // brush size adjustment. See SKETCH_FEATURES.md "Fix Shift+click".
      window.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("keyup", handleKeyUp, true);
      return () => {
        window.removeEventListener("keydown", handleKeyDown, true);
        window.removeEventListener("keyup", handleKeyUp, true);
      };
    }, []);

    // Cleanup rAF on unmount
    useEffect(() => {
      return () => {
        if (redrawRequestRef.current !== null) {
          cancelAnimationFrame(redrawRequestRef.current);
        }
      };
    }, []);

    // ─── Layer Canvas Management ──────────────────────────────────────

    const getOrCreateLayerCanvas = useCallback(
      (layerId: string): HTMLCanvasElement => {
        let canvas = layerCanvasesRef.current.get(layerId);
        if (!canvas) {
          canvas = window.document.createElement("canvas");
          canvas.width = doc.canvas.width;
          canvas.height = doc.canvas.height;
          layerCanvasesRef.current.set(layerId, canvas);
        }
        return canvas;
      },
      [doc.canvas.width, doc.canvas.height]
    );

    // ─── Initialize layer canvases from document data ─────────────────

    useEffect(() => {
      const layerIds = new Set(doc.layers.map((l) => l.id));
      for (const [id] of layerCanvasesRef.current) {
        if (!layerIds.has(id)) {
          layerCanvasesRef.current.delete(id);
        }
      }

      for (const layer of doc.layers) {
        const canvas = getOrCreateLayerCanvas(layer.id);
        if (
          canvas.width !== doc.canvas.width ||
          canvas.height !== doc.canvas.height
        ) {
          canvas.width = doc.canvas.width;
          canvas.height = doc.canvas.height;
        }
        if (layer.data) {
          const img = new Image();
          img.onload = () => {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              redraw();
            }
          };
          img.src = layer.data;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc.layers.length, doc.layers.map((l) => l.id).join(","), doc.canvas.width, doc.canvas.height]);

    // ─── Composite and redraw display canvas ──────────────────────────

    const redraw = useCallback(() => {
      const displayCanvas = displayCanvasRef.current;
      if (!displayCanvas) {
        return;
      }
      const ctx = displayCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      drawCheckerboard(ctx, displayCanvas.width, displayCanvas.height);

      for (const layer of doc.layers) {
        if (!layer.visible) {
          continue;
        }
        // When a layer is isolated/solo'd, skip all other layers
        if (isolatedLayerId && layer.id !== isolatedLayerId) {
          continue;
        }
        const layerCanvas = layerCanvasesRef.current.get(layer.id);
        if (!layerCanvas) {
          continue;
        }
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = blendModeToComposite(
          layer.blendMode || "normal"
        );
        ctx.drawImage(layerCanvas, 0, 0);
        ctx.restore();
      }

      // Draw a subtle border around the canvas to show its boundaries
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, displayCanvas.width - 1, displayCanvas.height - 1);
      ctx.restore();
    }, [doc.layers, isolatedLayerId]);

    /**
     * Batched redraw using requestAnimationFrame.
     * During active drawing, multiple pointer move events can fire per frame.
     * This coalesces redraws so we only composite layers once per animation frame.
     */
    const requestRedraw = useCallback(() => {
      if (redrawRequestRef.current === null) {
        redrawRequestRef.current = requestAnimationFrame(() => {
          redrawRequestRef.current = null;
          redraw();
        });
      }
    }, [redraw]);

    useEffect(() => {
      redraw();
    }, [redraw, doc.layers]);

    // ─── Drawing Functions ────────────────────────────────────────────

    const drawBrushStroke = useCallback(
      (
        from: Point,
        to: Point,
        settings: BrushSettings,
        ctx: CanvasRenderingContext2D,
        pressure?: number
      ) => {
        drawBrushStrokeUtil(from, to, settings, ctx, pressure, strokeDirtyRectRef, brushStampCacheRef.current);
      },
      []
    );

    const drawEraserStroke = useCallback(
      (
        from: Point,
        to: Point,
        settings: EraserSettings,
        ctx: CanvasRenderingContext2D,
        pressure?: number
      ) => {
        drawEraserStrokeUtil(from, to, settings, ctx, pressure, strokeDirtyRectRef, eraserStampCacheRef.current);
      },
      []
    );

    const drawPencilStroke = useCallback(
      (
        from: Point,
        to: Point,
        settings: PencilSettings,
        ctx: CanvasRenderingContext2D,
        pressure?: number
      ) => {
        drawPencilStrokeUtil(from, to, settings, ctx, pressure, strokeDirtyRectRef);
      },
      []
    );

    const drawBlurStroke = useCallback(
      (
        from: Point,
        to: Point,
        settings: BlurSettings,
        layerCanvas: HTMLCanvasElement
      ) => {
        const sourceCanvas = blurSourceCanvasRef.current ?? layerCanvas;
        drawBlurStrokeUtil(from, to, settings, layerCanvas, sourceCanvas, strokeDirtyRectRef, blurTempCanvasesRef.current);
      },
      []
    );

    const drawCloneStampStroke = useCallback(
      (
        from: Point,
        to: Point,
        settings: CloneStampSettings,
        ctx: CanvasRenderingContext2D
      ) => {
        const sourceCanvas = cloneSourceCanvasRef.current;
        const offset = cloneOffsetRef.current;
        if (!sourceCanvas || !offset) {
          return;
        }
        drawCloneStampStrokeUtil(from, to, settings, ctx, sourceCanvas, offset);
      },
      []
    );

    const drawGradient = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        start: Point,
        end: Point,
        settings: GradientSettings
      ) => {
        drawGradientUtil(ctx, start, end, settings);
      },
      []
    );

    /** Apply shift-constraint to shape end point */
    const constrainEnd = useCallback(
      (start: Point, end: Point, tool: SketchTool): Point => {
        return constrainEndUtil(start, end, tool, shiftHeldRef.current);
      },
      []
    );

    /**
     * When Alt is held for rectangle/ellipse, the start point is treated as
     * the center of the shape. Returns adjusted {start, end} pair.
     */
    const applyAltCenterDraw = useCallback(
      (start: Point, end: Point, tool: SketchTool): { start: Point; end: Point } => {
        return applyAltCenterDrawUtil(start, end, tool, altHeldRef.current);
      },
      []
    );

    const drawShapeOnCtx = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        tool: SketchTool,
        start: Point,
        end: Point,
        settings: ShapeSettings
      ) => {
        drawShapeOnCtxUtil(ctx, tool, start, end, settings, shiftHeldRef.current, altHeldRef.current);
      },
      []
    );

    const floodFill = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        startX: number,
        startY: number,
        settings: FillSettings
      ) => {
        floodFillUtil(ctx, startX, startY, settings);
      },
      []
    );

    // ─── Overlay (shape preview) ──────────────────────────────────────

    const clearOverlay = useCallback(() => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    }, []);

    const drawSelectionOverlay = useCallback(() => {
      const overlay = overlayCanvasRef.current;
      if (!overlay || !selection) {
        return;
      }
      // Don't draw persistent selection while actively dragging a new one
      if (selectStartRef.current) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      const { x, y, width, height } = selection;
      ctx.save();
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.setLineDash([SELECTION_DASH_LENGTH, SELECTION_DASH_LENGTH]);
      ctx.strokeRect(x, y, width, height);
      ctx.strokeStyle = "#000000";
      ctx.lineDashOffset = SELECTION_DASH_OFFSET;
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }, [selection]);

    // Redraw selection overlay when selection changes
    useEffect(() => {
      drawSelectionOverlay();
    }, [drawSelectionOverlay]);

    useEffect(() => {
      if (activeTool !== "gradient") {
        gradientStartRef.current = null;
        gradientEndRef.current = null;
        clearOverlay();
        // Preserve selection overlay when switching tools
        drawSelectionOverlay();
      }
    }, [activeTool, clearOverlay, drawSelectionOverlay]);

    const drawOverlayShape = useCallback(
      (start: Point, end: Point) => {
        const overlay = overlayCanvasRef.current;
        if (!overlay) {
          return;
        }
        const ctx = overlay.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        drawShapeOnCtx(ctx, activeTool, start, end, doc.toolSettings.shape);
      },
      [activeTool, doc.toolSettings.shape, drawShapeOnCtx]
    );

    const drawOverlayGradient = useCallback(
      (start: Point, end: Point) => {
        const overlay = overlayCanvasRef.current;
        if (!overlay) {
          return;
        }
        const ctx = overlay.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        drawGradient(ctx, start, end, doc.toolSettings.gradient);
        // Draw guide line
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      },
      [doc.toolSettings.gradient, drawGradient]
    );

    const drawOverlayCrop = useCallback((start: Point, end: Point) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      // Dim outside selection
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, overlay.width, overlay.height);
      ctx.clearRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }, []);

    const drawOverlaySelection = useCallback(
      (start: Point, end: Point) => {
        const overlay = overlayCanvasRef.current;
        if (!overlay) {
          return;
        }
        const ctx = overlay.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        if (w < 1 || h < 1) {
          return;
        }
        // Marching ants: white dashes + offset black dashes
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.setLineDash([SELECTION_DASH_LENGTH, SELECTION_DASH_LENGTH]);
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle = "#000000";
        ctx.lineDashOffset = SELECTION_DASH_OFFSET;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      },
      []
    );

    // ─── Coordinate Transform ─────────────────────────────────────────

    const screenToCanvas = useCallback(
      (clientX: number, clientY: number): Point => {
        const displayCanvas = displayCanvasRef.current;
        if (!displayCanvas) {
          return { x: 0, y: 0 };
        }
        const rect = displayCanvas.getBoundingClientRect();
        const x = (clientX - rect.left) / zoom;
        const y = (clientY - rect.top) / zoom;
        return { x, y };
      },
      [zoom]
    );

    // ─── Helper: perform mirrored drawing ─────────────────────────────

    const withMirror = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        drawFn: (from: Point, to: Point, c: CanvasRenderingContext2D) => void,
        from: Point,
        to: Point
      ) => {
        drawFn(from, to, ctx);
        if (mirrorX) {
          const cw = doc.canvas.width;
          const mirroredFrom = { x: cw - from.x, y: from.y };
          const mirroredTo = { x: cw - to.x, y: to.y };
          drawFn(mirroredFrom, mirroredTo, ctx);
        }
        if (mirrorY) {
          const ch = doc.canvas.height;
          const mirroredFrom = { x: from.x, y: ch - from.y };
          const mirroredTo = { x: to.x, y: ch - to.y };
          drawFn(mirroredFrom, mirroredTo, ctx);
        }
        if (mirrorX && mirrorY) {
          const cw = doc.canvas.width;
          const ch = doc.canvas.height;
          const mirroredFrom = { x: cw - from.x, y: ch - from.y };
          const mirroredTo = { x: cw - to.x, y: ch - to.y };
          drawFn(mirroredFrom, mirroredTo, ctx);
        }
      },
      [mirrorX, mirrorY, doc.canvas.width, doc.canvas.height]
    );

    // ─── Pointer Events ──────────────────────────────────────────────

    /** Smooth a raw pointer point using a moving-average stabilizer */
    const stabilizePoint = useCallback((raw: Point): Point => {
      const buf = stabilizerBufferRef.current;
      buf.push(raw);
      if (buf.length > STABILIZER_WINDOW) {
        buf.shift();
      }
      if (buf.length === 1) {
        return raw;
      }
      let sx = 0,
        sy = 0;
      for (const p of buf) {
        sx += p.x;
        sy += p.y;
      }
      return { x: sx / buf.length, y: sy / buf.length };
    }, []);

    /** Convert RGB pixel values to a hex color string */
    const rgbToHex = useCallback(
      (r: number, g: number, b: number): string =>
        `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
      []
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        // Clone stamp: Alt+click sets the clone source point
        if (
          e.button === 0 &&
          e.altKey &&
          activeTool === "clone_stamp"
        ) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          cloneSourceRef.current = pt;
          cloneOffsetRef.current = null; // Reset offset so next stroke recalculates
          return;
        }

        // Alt+click on a painting tool samples color (Photoshop eyedropper).
        // This check MUST come before the Alt+click pan check below so that
        // painting tools get eyedropper behavior instead of panning.
        if (
          e.button === 0 &&
          e.altKey &&
          isPaintingTool(activeTool) &&
          activeTool !== "clone_stamp" &&
          onEyedropperPick
        ) {
          const displayCanvas = displayCanvasRef.current;
          if (displayCanvas) {
            const ctx = displayCanvas.getContext("2d");
            if (ctx) {
              const pt = screenToCanvas(e.clientX, e.clientY);
              const pixel = ctx.getImageData(
                Math.round(pt.x),
                Math.round(pt.y),
                1,
                1
              ).data;
              onEyedropperPick(rgbToHex(pixel[0], pixel[1], pixel[2]));
            }
          }
          return;
        }

        // Alt+click (non-painting tools) or middle-click or Space+drag: pan canvas
        if (
          e.button === 1 ||
          (e.button === 0 && e.altKey) ||
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
        if (!activeLayer || activeLayer.locked || !activeLayer.visible) {
          return;
        }

        if (activeTool === "eyedropper") {
          const displayCanvas = displayCanvasRef.current;
          if (displayCanvas) {
            const ctx = displayCanvas.getContext("2d");
            if (ctx) {
              const pt = screenToCanvas(e.clientX, e.clientY);
              const pixel = ctx.getImageData(
                Math.round(pt.x),
                Math.round(pt.y),
                1,
                1
              ).data;
              const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
              containerRef.current?.dispatchEvent(
                new CustomEvent("sketch-eyedropper", {
                  detail: { color: hex },
                  bubbles: true
                })
              );
            }
          }
          return;
        }

        if (activeTool === "move") {
          const pt = screenToCanvas(e.clientX, e.clientY);
          moveStartRef.current = pt;
          isDrawingRef.current = true;
          onStrokeStart();
          // Snapshot the current layer content before moving.
          // Use a padded canvas so content is preserved when moved outside
          // the visible bounds and then moved back.
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const pad = Math.max(layerCanvas.width, layerCanvas.height);
          const snapshot = window.document.createElement("canvas");
          snapshot.width = layerCanvas.width + pad * 2;
          snapshot.height = layerCanvas.height + pad * 2;
          const snapCtx = snapshot.getContext("2d");
          if (snapCtx) {
            snapCtx.drawImage(layerCanvas, pad, pad);
          }
          moveLayerSnapshotRef.current = snapshot;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        if (activeTool === "fill") {
          const pt = screenToCanvas(e.clientX, e.clientY);
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            onStrokeStart();
            floodFill(ctx, pt.x, pt.y, doc.toolSettings.fill);
            redraw();
            const data = layerCanvas.toDataURL("image/png");
            onStrokeEnd(activeLayer.id, data);
          }
          return;
        }

        // Clone stamp: begin painting stroke (requires source to be set via Alt+click)
        if (activeTool === "clone_stamp") {
          if (!cloneSourceRef.current) {
            // No source set yet — do nothing
            return;
          }
          const pt = screenToCanvas(e.clientX, e.clientY);
          // On the first stroke after setting source, calculate the offset
          if (!cloneOffsetRef.current) {
            cloneOffsetRef.current = {
              x: cloneSourceRef.current.x - pt.x,
              y: cloneSourceRef.current.y - pt.y
            };
          }
          // Snapshot the source canvas for sampling during this stroke
          const settings = doc.toolSettings.cloneStamp;
          if (settings.sampling === "composited") {
            // Composite all visible layers into a temp canvas
            const tmp = window.document.createElement("canvas");
            tmp.width = doc.canvas.width;
            tmp.height = doc.canvas.height;
            const tmpCtx = tmp.getContext("2d");
            if (tmpCtx) {
              for (const layer of doc.layers) {
                if (!layer.visible || layer.type === "mask") {
                  continue;
                }
                const lc = layerCanvasesRef.current.get(layer.id);
                if (lc) {
                  tmpCtx.save();
                  tmpCtx.globalAlpha = layer.opacity;
                  tmpCtx.globalCompositeOperation = blendModeToComposite(
                    layer.blendMode || "normal"
                  );
                  tmpCtx.drawImage(lc, 0, 0);
                  tmpCtx.restore();
                }
              }
            }
            cloneSourceCanvasRef.current = tmp;
          } else {
            // Sample from active layer only
            const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
            const snapshot = window.document.createElement("canvas");
            snapshot.width = layerCanvas.width;
            snapshot.height = layerCanvas.height;
            const snapCtx = snapshot.getContext("2d");
            if (snapCtx) {
              snapCtx.drawImage(layerCanvas, 0, 0);
            }
            cloneSourceCanvasRef.current = snapshot;
          }
          isDrawingRef.current = true;
          lastPointRef.current = pt;
          lastSmoothedPointRef.current = pt;
          currentPressureRef.current = e.pressure || 0.5;
          onStrokeStart();
          stabilizerBufferRef.current = [];
          strokeDirtyRectRef.current = null;
          // Alpha lock snapshot
          if (activeLayer.alphaLock) {
            const lc = getOrCreateLayerCanvas(activeLayer.id);
            const snapCtx = lc.getContext("2d");
            if (snapCtx) {
              alphaSnapshotRef.current = snapCtx.getImageData(
                0, 0, lc.width, lc.height
              );
            }
          } else {
            alphaSnapshotRef.current = null;
          }
          // Paint initial dot
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            drawCloneStampStroke(pt, pt, doc.toolSettings.cloneStamp, ctx);
            redraw();
          }
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        if (isShapeTool(activeTool)) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          shapeStartRef.current = pt;
          isDrawingRef.current = true;
          onStrokeStart();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        if (activeTool === "gradient") {
          const pt = screenToCanvas(e.clientX, e.clientY);
          gradientStartRef.current = pt;
          gradientEndRef.current = pt;
          isDrawingRef.current = true;
          onStrokeStart();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        if (activeTool === "crop") {
          const pt = screenToCanvas(e.clientX, e.clientY);
          cropStartRef.current = pt;
          isDrawingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        if (activeTool === "select") {
          const pt = screenToCanvas(e.clientX, e.clientY);
          selectStartRef.current = pt;
          isDrawingRef.current = true;
          // Clear existing selection when starting a new one
          if (onSelectionChange) {
            onSelectionChange(null);
          }
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        isDrawingRef.current = true;
        const pt = screenToCanvas(e.clientX, e.clientY);
        lastPointRef.current = pt;
        lastSmoothedPointRef.current = pt;
        currentPressureRef.current = e.pressure || 0.5;
        onStrokeStart();

        // Reset stroke stabilizer buffer for a fresh stroke
        stabilizerBufferRef.current = [];
        strokeDirtyRectRef.current = null;

        // Alpha lock: snapshot original alpha channel before drawing
        if (activeLayer.alphaLock) {
          const layerCanvasForSnapshot = getOrCreateLayerCanvas(activeLayer.id);
          const snapCtx = layerCanvasForSnapshot.getContext("2d");
          if (snapCtx) {
            alphaSnapshotRef.current = snapCtx.getImageData(
              0,
              0,
              layerCanvasForSnapshot.width,
              layerCanvasForSnapshot.height
            );
          }
        } else {
          alphaSnapshotRef.current = null;
        }

        if (activeTool === "blur") {
          const layerCanvasForBlur = getOrCreateLayerCanvas(activeLayer.id);
          const blurSnapshot = window.document.createElement("canvas");
          blurSnapshot.width = layerCanvasForBlur.width;
          blurSnapshot.height = layerCanvasForBlur.height;
          const blurSnapshotCtx = blurSnapshot.getContext("2d");
          if (blurSnapshotCtx) {
            blurSnapshotCtx.drawImage(layerCanvasForBlur, 0, 0);
            blurSourceCanvasRef.current = blurSnapshot;
          } else {
            blurSourceCanvasRef.current = null;
          }
        } else {
          blurSourceCanvasRef.current = null;
        }

        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          // Shift+click straight line: draw from last stroke endpoint to click point
          if (shiftHeldRef.current && lastStrokeEndRef.current) {
            const from = lastStrokeEndRef.current;
            const dx = pt.x - from.x;
            const dy = pt.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Interpolate points along the line at small intervals for smooth coverage
            const STRAIGHT_LINE_STEP_DIVISOR = 100;
            const step = Math.max(1, Math.min(4, dist / STRAIGHT_LINE_STEP_DIVISOR));
            const steps = Math.max(1, Math.ceil(dist / step));
            let prev = from;
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              const current = { x: from.x + dx * t, y: from.y + dy * t };
              if (activeTool === "brush") {
                withMirror(
                  ctx,
                  (f, to, c) =>
                    drawBrushStroke(f, to, doc.toolSettings.brush, c, currentPressureRef.current),
                  prev,
                  current
                );
              } else if (activeTool === "pencil") {
                withMirror(
                  ctx,
                  (f, to, c) =>
                    drawPencilStroke(f, to, doc.toolSettings.pencil, c, currentPressureRef.current),
                  prev,
                  current
                );
              } else if (activeTool === "eraser") {
                withMirror(
                  ctx,
                  (f, to, c) =>
                    drawEraserStroke(f, to, doc.toolSettings.eraser, c, currentPressureRef.current),
                  prev,
                  current
                );
              } else if (activeTool === "blur") {
                drawBlurStroke(
                  prev,
                  current,
                  doc.toolSettings.blur,
                  layerCanvas
                );
              }
              prev = current;
            }
          } else {
            if (activeTool === "brush") {
              withMirror(
                ctx,
                (f, t, c) => drawBrushStroke(f, t, doc.toolSettings.brush, c, currentPressureRef.current),
                pt,
                pt
              );
            } else if (activeTool === "pencil") {
              withMirror(
                ctx,
                (f, t, c) =>
                  drawPencilStroke(f, t, doc.toolSettings.pencil, c, currentPressureRef.current),
                pt,
                pt
              );
            } else if (activeTool === "eraser") {
              withMirror(
                ctx,
                (f, t, c) =>
                  drawEraserStroke(f, t, doc.toolSettings.eraser, c, currentPressureRef.current),
                pt,
                pt
              );
            } else if (activeTool === "blur") {
              drawBlurStroke(pt, pt, doc.toolSettings.blur, layerCanvas);
            }
          }
          redraw();
        }

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      },
      [
        doc,
        activeTool,
        screenToCanvas,
        onStrokeStart,
        onStrokeEnd,
        onBrushSizeChange,
        getOrCreateLayerCanvas,
        drawBrushStroke,
        drawPencilStroke,
        drawEraserStroke,
        drawBlurStroke,
        drawCloneStampStroke,
        floodFill,
        redraw,
        withMirror,
        onEyedropperPick,
        rgbToHex,
        onSelectionChange
      ]
    );

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

        // S + drag: adjust brush size by horizontal delta
        if (isSizeDraggingRef.current && onBrushSizeChange) {
          const dx = e.clientX - sizeDragStartRef.current.x;
          const maxSize = activeTool === "pencil" ? 10 : 200;
          const newSize = Math.max(
            1,
            Math.min(
              maxSize,
              Math.round(sizeDragInitialSize.current + dx * 0.5)
            )
          );
          onBrushSizeChange(newSize);
          return;
        }

        if (!isDrawingRef.current) {
          return;
        }

        if (
          activeTool === "move" &&
          moveStartRef.current &&
          moveLayerSnapshotRef.current
        ) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          const dx = pt.x - moveStartRef.current.x;
          const dy = pt.y - moveStartRef.current.y;
          const activeLayer = doc.layers.find(
            (l) => l.id === doc.activeLayerId
          );
          if (activeLayer) {
            const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
            const ctx = layerCanvas.getContext("2d");
            if (ctx) {
              // The snapshot is padded; calculate the source offset to draw
              // from so that content moved outside bounds is preserved.
              const pad =
                (moveLayerSnapshotRef.current.width - layerCanvas.width) / 2;
              ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
              ctx.drawImage(
                moveLayerSnapshotRef.current,
                pad - dx,
                pad - dy,
                layerCanvas.width,
                layerCanvas.height,
                0,
                0,
                layerCanvas.width,
                layerCanvas.height
              );
              requestRedraw();
            }
          }
          return;
        }

        if (isShapeTool(activeTool) && shapeStartRef.current) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          drawOverlayShape(shapeStartRef.current, pt);
          return;
        }

        if (activeTool === "gradient" && gradientStartRef.current) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          gradientEndRef.current = pt;
          drawOverlayGradient(gradientStartRef.current, pt);
          return;
        }

        if (activeTool === "crop" && cropStartRef.current) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          drawOverlayCrop(cropStartRef.current, pt);
          return;
        }

        if (activeTool === "select" && selectStartRef.current) {
          const pt = screenToCanvas(e.clientX, e.clientY);
          drawOverlaySelection(selectStartRef.current, pt);
          return;
        }

        if (!lastPointRef.current) {
          return;
        }
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (!activeLayer) {
          return;
        }

        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (!ctx) {
          return;
        }

        const nativePointerEvent = e.nativeEvent as PointerEvent;
        const coalescedEvents =
          typeof nativePointerEvent.getCoalescedEvents === "function"
            ? nativePointerEvent.getCoalescedEvents()
            : [nativePointerEvent];

        for (const eventPoint of coalescedEvents) {
          const pt = screenToCanvas(eventPoint.clientX, eventPoint.clientY);
          const pressure = eventPoint.pressure || currentPressureRef.current || 0.5;
          currentPressureRef.current = pressure;

          if (activeTool === "brush") {
            const smoothPt = stabilizePoint(pt);
            const from = lastSmoothedPointRef.current ?? lastPointRef.current ?? smoothPt;
            withMirror(
              ctx,
              (f, t, c) =>
                drawBrushStroke(f, t, doc.toolSettings.brush, c, pressure),
              from,
              smoothPt
            );
            lastSmoothedPointRef.current = smoothPt;
          } else if (activeTool === "pencil") {
            withMirror(
              ctx,
              (f, t, c) =>
                drawPencilStroke(f, t, doc.toolSettings.pencil, c, pressure),
              lastPointRef.current,
              pt
            );
          } else if (activeTool === "eraser") {
            const smoothPt = stabilizePoint(pt);
            const from = lastSmoothedPointRef.current ?? lastPointRef.current ?? smoothPt;
            withMirror(
              ctx,
              (f, t, c) =>
                drawEraserStroke(f, t, doc.toolSettings.eraser, c, pressure),
              from,
              smoothPt
            );
            lastSmoothedPointRef.current = smoothPt;
          } else if (activeTool === "blur") {
            drawBlurStroke(
              lastPointRef.current,
              pt,
              doc.toolSettings.blur,
              layerCanvas
            );
          } else if (activeTool === "clone_stamp") {
            drawCloneStampStroke(
              lastPointRef.current,
              pt,
              doc.toolSettings.cloneStamp,
              ctx
            );
          }

          lastPointRef.current = pt;
        }
        requestRedraw();
      },
      [
        doc,
        activeTool,
        screenToCanvas,
        onPanChange,
        onBrushSizeChange,
        getOrCreateLayerCanvas,
        drawBrushStroke,
        drawPencilStroke,
        drawEraserStroke,
        drawBlurStroke,
        drawCloneStampStroke,
        drawOverlayShape,
        drawOverlayGradient,
        drawOverlayCrop,
        requestRedraw,
        withMirror,
        stabilizePoint,
        drawOverlaySelection
      ]
    );

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

        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);

        if (activeTool === "move") {
          moveStartRef.current = null;
          moveLayerSnapshotRef.current = null;
        }
        if (activeTool === "blur") {
          blurSourceCanvasRef.current = null;
        }
        if (activeTool === "clone_stamp") {
          cloneSourceCanvasRef.current = null;
        }

        if (isShapeTool(activeTool) && shapeStartRef.current && activeLayer) {
          const overlay = overlayCanvasRef.current;
          if (overlay) {
            const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
            const ctx = layerCanvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(overlay, 0, 0);
              clearOverlay();
              drawSelectionOverlay();
              redraw();
            }
          }
          shapeStartRef.current = null;
        }

        if (
          activeTool === "gradient" &&
          gradientStartRef.current &&
          activeLayer
        ) {
          const start = gradientStartRef.current;
          const end = gradientEndRef.current ?? start;
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            drawGradient(ctx, start, end, doc.toolSettings.gradient);
            clearOverlay();
            drawSelectionOverlay();
            redraw();
          }
          gradientStartRef.current = null;
          gradientEndRef.current = null;
        }

        if (activeTool === "crop" && cropStartRef.current) {
          const pt = screenToCanvas(
            mousePositionRef.current.x +
              (containerRef.current?.getBoundingClientRect().left ?? 0),
            mousePositionRef.current.y +
              (containerRef.current?.getBoundingClientRect().top ?? 0)
          );
          const x1 = Math.round(Math.min(cropStartRef.current.x, pt.x));
          const y1 = Math.round(Math.min(cropStartRef.current.y, pt.y));
          const x2 = Math.round(Math.max(cropStartRef.current.x, pt.x));
          const y2 = Math.round(Math.max(cropStartRef.current.y, pt.y));
          const w = x2 - x1;
          const h = y2 - y1;
          clearOverlay();
          drawSelectionOverlay();
          cropStartRef.current = null;
          if (w > 1 && h > 1 && onCropComplete) {
            onCropComplete(x1, y1, w, h);
          }
          return;
        }

        if (activeTool === "select" && selectStartRef.current) {
          const pt = screenToCanvas(
            mousePositionRef.current.x +
              (containerRef.current?.getBoundingClientRect().left ?? 0),
            mousePositionRef.current.y +
              (containerRef.current?.getBoundingClientRect().top ?? 0)
          );
          const x = Math.round(Math.min(selectStartRef.current.x, pt.x));
          const y = Math.round(Math.min(selectStartRef.current.y, pt.y));
          const w = Math.round(Math.abs(pt.x - selectStartRef.current.x));
          const h = Math.round(Math.abs(pt.y - selectStartRef.current.y));
          clearOverlay();
          selectStartRef.current = null;
          if (w > 1 && h > 1 && onSelectionChange) {
            onSelectionChange({ x, y, width: w, height: h });
          }
          return;
        }

        // Save the stroke endpoint for Shift+click straight line feature
        // (must be done before lastPointRef is nulled)
        if (isPaintingTool(activeTool)) {
          lastStrokeEndRef.current = screenToCanvas(
            e.clientX,
            e.clientY
          );
        }

        lastPointRef.current = null;
        lastSmoothedPointRef.current = null;

        // Alpha lock: restore original alpha channel after drawing.
        if (activeLayer?.alphaLock && alphaSnapshotRef.current) {
          const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
          if (layerCanvas) {
            const ctx = layerCanvas.getContext("2d");
            if (ctx) {
              const dirtyRect = strokeDirtyRectRef.current ?? {
                minX: 0,
                minY: 0,
                maxX: layerCanvas.width,
                maxY: layerCanvas.height
              };
              const x = Math.max(0, dirtyRect.minX);
              const y = Math.max(0, dirtyRect.minY);
              const width = Math.min(layerCanvas.width - x, dirtyRect.maxX - x);
              const height = Math.min(layerCanvas.height - y, dirtyRect.maxY - y);
              if (width > 0 && height > 0) {
                const currentData = ctx.getImageData(x, y, width, height);
                const snapshot = alphaSnapshotRef.current;
                for (let yy = 0; yy < height; yy++) {
                  for (let xx = 0; xx < width; xx++) {
                    const localIndex = (yy * width + xx) * 4 + 3;
                    const snapshotIndex =
                      ((y + yy) * layerCanvas.width + (x + xx)) * 4 + 3;
                    currentData.data[localIndex] = Math.min(
                      currentData.data[localIndex],
                      snapshot.data[snapshotIndex]
                    );
                  }
                }
                ctx.putImageData(currentData, x, y);
                redraw();
              }
            }
          }
          alphaSnapshotRef.current = null;
        }
        strokeDirtyRectRef.current = null;

        if (activeLayer) {
          // Defer the expensive toDataURL encoding to the next frame so the
          // current frame can finish without stutter.
          const layerId = activeLayer.id;
          requestAnimationFrame(() => {
            const layerCanvas = layerCanvasesRef.current.get(layerId);
            const data = layerCanvas
              ? layerCanvas.toDataURL("image/png")
              : null;
            onStrokeEnd(layerId, data);
          });
        }
      },
      [
        doc.layers,
        doc.activeLayerId,
        doc.toolSettings.gradient,
        activeTool,
        onStrokeEnd,
        onCropComplete,
        getOrCreateLayerCanvas,
        clearOverlay,
        drawSelectionOverlay,
        redraw,
        screenToCanvas,
        drawGradient,
        onSelectionChange
      ]
    );

    // ─── Wheel zoom ──────────────────────────────────────────────────

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const factor = 1.3;
        const delta = e.deltaY > 0 ? 1 / factor : factor;
        const newZoom = Math.max(0.1, Math.min(10, zoom * delta));
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
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
      [zoom, pan, onZoomChange, onPanChange]
    );

    // ─── Imperative handle ────────────────────────────────────────────

    useImperativeHandle(
      ref,
      () => ({
        getLayerData: (layerId: string) => {
          const canvas = layerCanvasesRef.current.get(layerId);
          return canvas ? canvas.toDataURL("image/png") : null;
        },
        setLayerData: (layerId: string, data: string | null) => {
          const canvas = getOrCreateLayerCanvas(layerId);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (data) {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              redraw();
            };
            img.src = data;
          } else {
            redraw();
          }
        },
        snapshotLayerCanvas: (layerId: string) => {
          const source = layerCanvasesRef.current.get(layerId);
          if (!source) {
            return null;
          }
          const snapshot = window.document.createElement("canvas");
          snapshot.width = source.width;
          snapshot.height = source.height;
          const ctx = snapshot.getContext("2d");
          if (ctx) {
            ctx.drawImage(source, 0, 0);
          }
          return snapshot;
        },
        restoreLayerCanvas: (
          layerId: string,
          source: HTMLCanvasElement
        ) => {
          const canvas = getOrCreateLayerCanvas(layerId);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(source, 0, 0);
          redraw();
        },
        flattenToDataUrl: () => {
          const canvas = window.document.createElement("canvas");
          canvas.width = doc.canvas.width;
          canvas.height = doc.canvas.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return "";
          }
          ctx.fillStyle = doc.canvas.backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (const layer of doc.layers) {
            if (!layer.visible || layer.type === "mask") {
              continue;
            }
            const layerCanvas = layerCanvasesRef.current.get(layer.id);
            if (layerCanvas) {
              ctx.save();
              ctx.globalAlpha = layer.opacity;
              ctx.globalCompositeOperation = blendModeToComposite(
                layer.blendMode || "normal"
              );
              ctx.drawImage(layerCanvas, 0, 0);
              ctx.restore();
            }
          }
          return canvas.toDataURL("image/png");
        },
        getMaskDataUrl: () => {
          if (!doc.maskLayerId) {
            return null;
          }
          const canvas = layerCanvasesRef.current.get(doc.maskLayerId);
          return canvas ? canvas.toDataURL("image/png") : null;
        },
        clearLayer: (layerId: string) => {
          const canvas = layerCanvasesRef.current.get(layerId);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              redraw();
            }
          }
        },
        clearLayerRect: (
          layerId: string,
          x: number,
          y: number,
          width: number,
          height: number
        ) => {
          const canvas = layerCanvasesRef.current.get(layerId);
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(x, y, width, height);
              redraw();
            }
          }
        },
        flipLayer: (layerId: string, direction: "horizontal" | "vertical") => {
          const canvas = layerCanvasesRef.current.get(layerId);
          if (!canvas) {
            return;
          }
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          const temp = window.document.createElement("canvas");
          temp.width = canvas.width;
          temp.height = canvas.height;
          const tempCtx = temp.getContext("2d");
          if (!tempCtx) {
            return;
          }
          tempCtx.drawImage(canvas, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          if (direction === "horizontal") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          } else {
            ctx.translate(0, canvas.height);
            ctx.scale(1, -1);
          }
          ctx.drawImage(temp, 0, 0);
          ctx.restore();
          redraw();
        },
        mergeLayerDown: (upperLayerId: string, lowerLayerId: string) => {
          const upperCanvas = layerCanvasesRef.current.get(upperLayerId);
          const lowerCanvas = layerCanvasesRef.current.get(lowerLayerId);
          if (!upperCanvas || !lowerCanvas) {
            return;
          }
          const lowerCtx = lowerCanvas.getContext("2d");
          if (!lowerCtx) {
            return;
          }
          const upperLayer = doc.layers.find((l) => l.id === upperLayerId);
          if (upperLayer) {
            lowerCtx.save();
            lowerCtx.globalAlpha = upperLayer.opacity;
            lowerCtx.globalCompositeOperation = blendModeToComposite(
              upperLayer.blendMode || "normal"
            );
            lowerCtx.drawImage(upperCanvas, 0, 0);
            lowerCtx.restore();
          }
          layerCanvasesRef.current.delete(upperLayerId);
          redraw();
          return lowerCanvas.toDataURL("image/png");
        },
        flattenVisible: () => {
          const canvas = window.document.createElement("canvas");
          canvas.width = doc.canvas.width;
          canvas.height = doc.canvas.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return "";
          }
          ctx.fillStyle = doc.canvas.backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (const layer of doc.layers) {
            if (!layer.visible) {
              continue;
            }
            const layerCanvas = layerCanvasesRef.current.get(layer.id);
            if (layerCanvas) {
              ctx.save();
              ctx.globalAlpha = layer.opacity;
              ctx.globalCompositeOperation = blendModeToComposite(
                layer.blendMode || "normal"
              );
              ctx.drawImage(layerCanvas, 0, 0);
              ctx.restore();
            }
          }
          return canvas.toDataURL("image/png");
        },
        cropCanvas: (x: number, y: number, width: number, height: number) => {
          // Crop all layer canvases and display canvas
          for (const [id, layerCanvas] of layerCanvasesRef.current) {
            const ctx = layerCanvas.getContext("2d");
            if (!ctx) {
              continue;
            }
            const imgData = ctx.getImageData(x, y, width, height);
            layerCanvas.width = width;
            layerCanvas.height = height;
            ctx.putImageData(imgData, 0, 0);
          }
          const displayCanvas = displayCanvasRef.current;
          if (displayCanvas) {
            displayCanvas.width = width;
            displayCanvas.height = height;
          }
          const overlay = overlayCanvasRef.current;
          if (overlay) {
            overlay.width = width;
            overlay.height = height;
          }
          redraw();
        },
        applyAdjustments: (
          brightness: number,
          contrast: number,
          saturation: number
        ) => {
          const activeLayer = doc.layers.find(
            (l) => l.id === doc.activeLayerId
          );
          if (!activeLayer) {
            return;
          }
          const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
          if (!layerCanvas) {
            return;
          }
          const ctx = layerCanvas.getContext("2d");
          if (!ctx) {
            return;
          }
          // Map slider values (-100..100) to CSS filter multipliers.
          // Clamped to non-negative: CSS filter values must be >= 0
          // (brightness(0) = black, contrast(0) = gray, saturate(0) = grayscale)
          const b = Math.max(0, 1 + brightness / 100);
          const c = Math.max(0, 1 + contrast / 100);
          const s = Math.max(0, 1 + saturation / 100);
          const tmp = window.document.createElement("canvas");
          tmp.width = layerCanvas.width;
          tmp.height = layerCanvas.height;
          const tmpCtx = tmp.getContext("2d");
          if (!tmpCtx) {
            return;
          }
          tmpCtx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
          tmpCtx.drawImage(layerCanvas, 0, 0);
          ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
          ctx.drawImage(tmp, 0, 0);
          redraw();
        },
        fillLayerWithColor: (layerId: string, color: string) => {
          const canvas = getOrCreateLayerCanvas(layerId);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          ctx.save();
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
          redraw();
        },
        nudgeLayer: (layerId: string, dx: number, dy: number) => {
          const canvas = layerCanvasesRef.current.get(layerId);
          if (!canvas) {
            return;
          }
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return;
          }
          const tmp = window.document.createElement("canvas");
          tmp.width = canvas.width;
          tmp.height = canvas.height;
          const tmpCtx = tmp.getContext("2d");
          if (!tmpCtx) {
            return;
          }
          tmpCtx.drawImage(canvas, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(tmp, dx, dy);
          redraw();
        }
      }),
      [doc, getOrCreateLayerCanvas, redraw]
    );

    // ─── Transform style ─────────────────────────────────────────────

    const canvasStyle: React.CSSProperties = {
      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      transformOrigin: "center center"
    };

    // ─── Cursor rendering ─────────────────────────────────────────────

    const drawCursor = useCallback(
      (screenX: number, screenY: number) => {
        const cursorCanvas = cursorCanvasRef.current;
        if (!cursorCanvas) {
          return;
        }
        const ctx = cursorCanvas.getContext("2d");
        if (!ctx) {
          return;
        }

        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

        // Only show brush cursor for brush/pencil/eraser/blur/clone_stamp tools
        if (
          activeTool !== "brush" &&
          activeTool !== "pencil" &&
          activeTool !== "eraser" &&
          activeTool !== "blur" &&
          activeTool !== "clone_stamp"
        ) {
          return;
        }

        let size: number;
        if (activeTool === "brush") {
          size = doc.toolSettings.brush.size;
        } else if (activeTool === "pencil") {
          size = doc.toolSettings.pencil.size;
        } else if (activeTool === "blur") {
          size = doc.toolSettings.blur.size;
        } else if (activeTool === "clone_stamp") {
          size = doc.toolSettings.cloneStamp.size;
        } else {
          size = doc.toolSettings.eraser.size;
        }

        // Calculate the visual radius on screen (accounting for zoom)
        const screenRadius = (size / 2) * zoom;

        ctx.beginPath();
        ctx.arc(screenX, screenY, Math.max(1, screenRadius), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Inner dark ring for contrast
        ctx.beginPath();
        ctx.arc(screenX, screenY, Math.max(1, screenRadius), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Center dot
        ctx.beginPath();
        ctx.arc(screenX, screenY, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fill();
      },
      [
        activeTool,
        doc.toolSettings.brush.size,
        doc.toolSettings.pencil.size,
        doc.toolSettings.eraser.size,
        doc.toolSettings.blur.size,
        zoom
      ]
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          mousePositionRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          };
          drawCursor(mousePositionRef.current.x, mousePositionRef.current.y);
        }
      },
      [drawCursor]
    );

    const handleMouseLeave = useCallback(() => {
      const cursorCanvas = cursorCanvasRef.current;
      if (cursorCanvas) {
        const ctx = cursorCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        }
      }
    }, []);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (onContextMenu) {
          onContextMenu(e.clientX, e.clientY);
        }
      },
      [onContextMenu]
    );

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
        className={rootClassName ? `sketch-canvas ${rootClassName}` : "sketch-canvas"}
        css={styles(theme)}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
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
        </Box>
      </div>
    );
  }
);

export default SketchCanvas;
