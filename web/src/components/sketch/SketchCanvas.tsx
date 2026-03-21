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
  useMemo,
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
  BrushType,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  Point,
  BlendMode,
  Selection,
  isShapeTool,
  isPaintingTool,
  parseColorToRgba
} from "./types";

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
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SketchCanvasProps {
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
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
}

// ─── Blend mode mapping ──────────────────────────────────────────────────────

function blendModeToComposite(mode: BlendMode): GlobalCompositeOperation {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "darken":
      return "darken";
    case "lighten":
      return "lighten";
    case "color-dodge":
      return "color-dodge";
    case "color-burn":
      return "color-burn";
    case "hard-light":
      return "hard-light";
    case "soft-light":
      return "soft-light";
    case "difference":
      return "difference";
    case "exclusion":
      return "exclusion";
    default:
      return "source-over";
  }
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
      onZoomChange,
      onPanChange,
      onStrokeStart,
      onStrokeEnd,
      onBrushSizeChange,
      onContextMenu,
      onCropComplete,
      onEyedropperPick,
      selection,
      onSelectionChange
    } = props;

    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
    const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<Point | null>(null);
    const isPanningRef = useRef(false);
    const isSpacePanningRef = useRef(false);
    const panStartRef = useRef<Point>({ x: 0, y: 0 });
    const panOffsetRef = useRef<Point>(pan);
    const mousePositionRef = useRef<Point>({ x: 0, y: 0 });
    const shiftHeldRef = useRef(false);
    const spaceHeldRef = useRef(false);
    const sKeyHeldRef = useRef(false);
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

    // Alpha lock: snapshot of layer alpha before stroke starts
    const alphaSnapshotRef = useRef<ImageData | null>(null);

    // Shift+click straight line: persists the end point of the last stroke
    const lastStrokeEndRef = useRef<Point | null>(null);

    // Stroke stabilizer: circular buffer of recent points for smoothing
    const stabilizerBufferRef = useRef<Point[]>([]);
    const STABILIZER_WINDOW = 4; // Number of points to average

    // Pressure sensitivity: store current pointer pressure
    const currentPressureRef = useRef<number>(0.5);
    const MIN_PRESSURE_FACTOR = 0.2; // Minimum pressure scaling (20% of full size/opacity)

    // Selection overlay constants
    const SELECTION_DASH_LENGTH = 4;
    const SELECTION_DASH_OFFSET = SELECTION_DASH_LENGTH;

    useEffect(() => {
      panOffsetRef.current = pan;
    }, [pan]);

    // Track Shift, Space, and S key state for constraints, panning, size adjust
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
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
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

      const hasVisibleLayer = doc.layers.some((layer) => layer.visible);
      if (hasVisibleLayer) {
        ctx.fillStyle = doc.canvas.backgroundColor;
        ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
      }

      for (const layer of doc.layers) {
        if (!layer.visible) {
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
    }, [doc.layers, doc.canvas.backgroundColor]);

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
        const brushType = settings.brushType || "round";

        // Apply pressure sensitivity
        let effectiveSize = settings.size;
        let effectiveOpacity = settings.opacity;
        if (settings.pressureSensitivity && pressure !== undefined && pressure > 0) {
          const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
          if (settings.pressureAffects === "size" || settings.pressureAffects === "both") {
            effectiveSize = settings.size * pressureFactor;
          }
          if (settings.pressureAffects === "opacity" || settings.pressureAffects === "both") {
            effectiveOpacity = settings.opacity * pressureFactor;
          }
        }

        // Apply roundness and angle transform
        const needsTransform = settings.roundness < 1.0;
        if (needsTransform) {
          ctx.save();
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          const angleRad = (settings.angle * Math.PI) / 180;
          ctx.translate(midX, midY);
          ctx.rotate(angleRad);
          ctx.scale(1, settings.roundness);
          ctx.rotate(-angleRad);
          ctx.translate(-midX, -midY);
        }

        if (brushType === "spray") {
          // Spray: scatter random dots within brush radius
          ctx.save();
          ctx.globalAlpha = effectiveOpacity;
          ctx.fillStyle = settings.color;
          const density = Math.max(5, Math.round(effectiveSize * 0.8));
          const r = effectiveSize / 2;
          for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * r;
            const px = to.x + Math.cos(angle) * dist;
            const py = to.y + Math.sin(angle) * dist;
            const dotSize = Math.max(1, Math.random() * 2);
            ctx.beginPath();
            ctx.arc(px, py, dotSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          if (needsTransform) {
            ctx.restore();
          }
          return;
        }

        if (brushType === "airbrush") {
          // Airbrush: low-opacity radial dab that accumulates over time
          ctx.save();
          const dabOpacity = effectiveOpacity * 0.15;
          ctx.globalAlpha = dabOpacity;
          const r = effectiveSize / 2;
          const grad = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, r);
          grad.addColorStop(0, settings.color);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(to.x, to.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (needsTransform) {
            ctx.restore();
          }
          return;
        }

        // Round / Soft brush — standard stroke approach
        ctx.save();
        ctx.globalAlpha = effectiveOpacity;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = settings.color;
        ctx.lineWidth = effectiveSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const effectiveHardness =
          brushType === "soft"
            ? Math.min(settings.hardness, 0.3)
            : settings.hardness;
        if (effectiveHardness < 1) {
          ctx.filter = `blur(${(1 - effectiveHardness) * effectiveSize * 0.3}px)`;
        }
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
        if (needsTransform) {
          ctx.restore();
        }
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
        let effectiveSize = settings.size;
        let effectiveOpacity = settings.opacity;
        if (pressure !== undefined && pressure > 0) {
          const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
          effectiveSize = settings.size * pressureFactor;
          effectiveOpacity = settings.opacity * pressureFactor;
        }

        ctx.save();
        ctx.globalAlpha = effectiveOpacity;
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = effectiveSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
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
        let effectiveSize = settings.size;
        let effectiveOpacity = settings.opacity;
        if (pressure !== undefined && pressure > 0) {
          const pressureFactor = Math.max(MIN_PRESSURE_FACTOR, pressure);
          effectiveSize = settings.size * pressureFactor;
          effectiveOpacity = settings.opacity * pressureFactor;
        }

        ctx.save();
        ctx.globalAlpha = effectiveOpacity;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = settings.color;
        ctx.lineWidth = effectiveSize;
        ctx.lineCap = "square";
        ctx.lineJoin = "miter";
        ctx.imageSmoothingEnabled = false;
        ctx.beginPath();
        ctx.moveTo(Math.round(from.x), Math.round(from.y));
        ctx.lineTo(Math.round(to.x), Math.round(to.y));
        ctx.stroke();
        ctx.restore();
      },
      []
    );

    const drawBlurStroke = useCallback(
      (
        point: Point,
        settings: BlurSettings,
        layerCanvas: HTMLCanvasElement
      ) => {
        const ctx = layerCanvas.getContext("2d");
        if (!ctx) {
          return;
        }
        const r = Math.round(settings.size / 2);
        // Pad the sample region by 2× the blur strength so the CSS blur
        // filter doesn't clip at the edges (the filter kernel extends beyond
        // the drawn region by roughly 2× its radius).
        const pad = Math.ceil(settings.strength * 2);
        const x = Math.round(point.x) - r - pad;
        const y = Math.round(point.y) - r - pad;
        const w = (r + pad) * 2;
        const h = (r + pad) * 2;
        // Clamp to canvas bounds
        const sx = Math.max(0, x);
        const sy = Math.max(0, y);
        const sw = Math.min(layerCanvas.width - sx, w - (sx - x));
        const sh = Math.min(layerCanvas.height - sy, h - (sy - y));
        if (sw <= 0 || sh <= 0) {
          return;
        }

        // Read original pixels
        const imgData = ctx.getImageData(sx, sy, sw, sh);

        // Create temp canvas for blurred version
        const tmp = window.document.createElement("canvas");
        tmp.width = sw;
        tmp.height = sh;
        const tmpCtx = tmp.getContext("2d");
        if (!tmpCtx) {
          return;
        }
        tmpCtx.putImageData(imgData, 0, 0);

        // Create blurred version on a second temp canvas
        const blurred = window.document.createElement("canvas");
        blurred.width = sw;
        blurred.height = sh;
        const blurCtx = blurred.getContext("2d");
        if (!blurCtx) {
          return;
        }
        blurCtx.filter = `blur(${settings.strength}px)`;
        blurCtx.drawImage(tmp, 0, 0);

        // Blend blurred result into original using a circular gradient mask.
        // This avoids the hard edges from clearRect.
        const cx = Math.round(point.x) - sx;
        const cy = Math.round(point.y) - sy;
        const maskCanvas = window.document.createElement("canvas");
        maskCanvas.width = sw;
        maskCanvas.height = sh;
        const maskCtx = maskCanvas.getContext("2d");
        if (!maskCtx) {
          return;
        }

        // Draw original pixels first
        maskCtx.putImageData(imgData, 0, 0);

        // Draw blurred pixels with a circular clip and radial gradient alpha
        maskCtx.save();
        maskCtx.beginPath();
        maskCtx.arc(cx, cy, r, 0, Math.PI * 2);
        maskCtx.clip();

        // Use a radial gradient to soft-blend the edges
        const grad = maskCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.7, "rgba(255,255,255,0.8)");
        grad.addColorStop(1, "rgba(255,255,255,0)");

        // Clear and draw blurred
        maskCtx.globalCompositeOperation = "source-over";
        maskCtx.clearRect(cx - r, cy - r, r * 2, r * 2);
        maskCtx.drawImage(blurred, 0, 0);

        // Apply radial gradient fade using destination-in
        maskCtx.globalCompositeOperation = "destination-in";
        maskCtx.fillStyle = grad;
        maskCtx.fillRect(cx - r, cy - r, r * 2, r * 2);
        maskCtx.restore();

        // Now composite: put original back, then overlay masked blur
        ctx.save();
        ctx.clearRect(sx, sy, sw, sh);
        ctx.putImageData(imgData, sx, sy);
        // Draw the soft-blurred circle on top
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(maskCanvas, sx, sy);
        ctx.restore();
      },
      []
    );

    // ─── Gradient Drawing ─────────────────────────────────────────────

    const drawGradient = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        start: Point,
        end: Point,
        settings: GradientSettings
      ) => {
        ctx.save();
        let gradient: CanvasGradient;
        if (settings.type === "radial") {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const radius = Math.sqrt(dx * dx + dy * dy);
          // Minimum radius of 1 prevents invalid gradient when start/end points overlap
          gradient = ctx.createRadialGradient(
            start.x,
            start.y,
            0,
            start.x,
            start.y,
            Math.max(radius, 1)
          );
        } else {
          gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        }
        gradient.addColorStop(0, settings.startColor);
        gradient.addColorStop(1, settings.endColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      },
      []
    );

    // ─── Shape Drawing ────────────────────────────────────────────────

    /** Apply shift-constraint to shape end point */
    const constrainEnd = useCallback(
      (start: Point, end: Point, tool: SketchTool): Point => {
        if (!shiftHeldRef.current) {
          return end;
        }
        if (tool === "rectangle" || tool === "ellipse") {
          // Constrain to square / circle
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          return {
            x: start.x + size * Math.sign(dx || 1),
            y: start.y + size * Math.sign(dy || 1)
          };
        }
        if (tool === "line" || tool === "arrow") {
          // Snap to nearest 45° angle
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.sqrt(dx * dx + dy * dy);
          return {
            x: start.x + dist * Math.cos(snapped),
            y: start.y + dist * Math.sin(snapped)
          };
        }
        return end;
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
        const constrained = constrainEnd(start, end, tool);
        ctx.save();
        ctx.strokeStyle = settings.strokeColor;
        ctx.lineWidth = settings.strokeWidth;
        ctx.fillStyle = settings.fillColor;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        switch (tool) {
          case "rectangle": {
            const x = Math.min(start.x, constrained.x);
            const y = Math.min(start.y, constrained.y);
            const w = Math.abs(constrained.x - start.x);
            const h = Math.abs(constrained.y - start.y);
            if (settings.filled) {
              ctx.fillRect(x, y, w, h);
            }
            ctx.strokeRect(x, y, w, h);
            break;
          }
          case "ellipse": {
            const cx = (start.x + constrained.x) / 2;
            const cy = (start.y + constrained.y) / 2;
            const rx = Math.abs(constrained.x - start.x) / 2;
            const ry = Math.abs(constrained.y - start.y) / 2;
            ctx.beginPath();
            ctx.ellipse(
              cx,
              cy,
              Math.max(rx, 0.1),
              Math.max(ry, 0.1),
              0,
              0,
              Math.PI * 2
            );
            if (settings.filled) {
              ctx.fill();
            }
            ctx.stroke();
            break;
          }
          case "line": {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(constrained.x, constrained.y);
            ctx.stroke();
            break;
          }
          case "arrow": {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(constrained.x, constrained.y);
            ctx.stroke();
            const angle = Math.atan2(
              constrained.y - start.y,
              constrained.x - start.x
            );
            const headLen = Math.max(settings.strokeWidth * 3, 10);
            ctx.beginPath();
            ctx.moveTo(constrained.x, constrained.y);
            ctx.lineTo(
              constrained.x - headLen * Math.cos(angle - Math.PI / 6),
              constrained.y - headLen * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(constrained.x, constrained.y);
            ctx.lineTo(
              constrained.x - headLen * Math.cos(angle + Math.PI / 6),
              constrained.y - headLen * Math.sin(angle + Math.PI / 6)
            );
            ctx.stroke();
            break;
          }
        }
        ctx.restore();
      },
      [constrainEnd]
    );

    // ─── Flood Fill ───────────────────────────────────────────────────

    const floodFill = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        startX: number,
        startY: number,
        settings: FillSettings
      ) => {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const sx = Math.round(startX);
        const sy = Math.round(startY);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
          return;
        }

        const fillParsed = parseColorToRgba(settings.color);
        const fillR = fillParsed.r;
        const fillG = fillParsed.g;
        const fillB = fillParsed.b;
        const fillA = Math.round(Math.max(0, Math.min(1, fillParsed.a)) * 255);

        const idx = (sy * w + sx) * 4;
        const targetR = data[idx];
        const targetG = data[idx + 1];
        const targetB = data[idx + 2];
        const targetA = data[idx + 3];

        if (
          targetR === fillR &&
          targetG === fillG &&
          targetB === fillB &&
          targetA === fillA
        ) {
          return;
        }

        const tolerance = settings.tolerance;
        const matches = (i: number): boolean => {
          return (
            Math.abs(data[i] - targetR) <= tolerance &&
            Math.abs(data[i + 1] - targetG) <= tolerance &&
            Math.abs(data[i + 2] - targetB) <= tolerance &&
            Math.abs(data[i + 3] - targetA) <= tolerance
          );
        };

        const stack: [number, number][] = [[sx, sy]];
        const visited = new Uint8Array(w * h);

        while (stack.length > 0) {
          const [x, y] = stack.pop()!;
          const pi = y * w + x;
          if (x < 0 || x >= w || y < 0 || y >= h || visited[pi]) {
            continue;
          }
          const i = pi * 4;
          if (!matches(i)) {
            continue;
          }
          visited[pi] = 1;
          data[i] = fillR;
          data[i + 1] = fillG;
          data[i + 2] = fillB;
          data[i + 3] = fillA;

          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        ctx.putImageData(imageData, 0, 0);
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

    useEffect(() => {
      if (activeTool !== "gradient") {
        gradientStartRef.current = null;
        gradientEndRef.current = null;
        clearOverlay();
      }
    }, [activeTool, clearOverlay]);

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
        // Alt+click on a painting tool samples color (Photoshop eyedropper).
        // This check MUST come before the Alt+click pan check below so that
        // painting tools get eyedropper behavior instead of panning.
        if (
          e.button === 0 &&
          e.altKey &&
          isPaintingTool(activeTool) &&
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
          // Snapshot the current layer content before moving
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const snapshot = window.document.createElement("canvas");
          snapshot.width = layerCanvas.width;
          snapshot.height = layerCanvas.height;
          const snapCtx = snapshot.getContext("2d");
          if (snapCtx) {
            snapCtx.drawImage(layerCanvas, 0, 0);
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
        currentPressureRef.current = e.pressure || 0.5;
        onStrokeStart();

        // Reset stroke stabilizer buffer for a fresh stroke
        stabilizerBufferRef.current = [];

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
                drawBlurStroke(current, doc.toolSettings.blur, layerCanvas);
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
              drawBlurStroke(pt, doc.toolSettings.blur, layerCanvas);
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
        floodFill,
        redraw,
        withMirror,
        onEyedropperPick,
        rgbToHex
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

        const pt = screenToCanvas(e.clientX, e.clientY);
        currentPressureRef.current = e.pressure || 0.5;

        if (
          activeTool === "move" &&
          moveStartRef.current &&
          moveLayerSnapshotRef.current
        ) {
          const dx = pt.x - moveStartRef.current.x;
          const dy = pt.y - moveStartRef.current.y;
          const activeLayer = doc.layers.find(
            (l) => l.id === doc.activeLayerId
          );
          if (activeLayer) {
            const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
            const ctx = layerCanvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
              ctx.drawImage(moveLayerSnapshotRef.current, dx, dy);
              redraw();
            }
          }
          return;
        }

        if (isShapeTool(activeTool) && shapeStartRef.current) {
          drawOverlayShape(shapeStartRef.current, pt);
          return;
        }

        if (activeTool === "gradient" && gradientStartRef.current) {
          gradientEndRef.current = pt;
          drawOverlayGradient(gradientStartRef.current, pt);
          return;
        }

        if (activeTool === "crop" && cropStartRef.current) {
          drawOverlayCrop(cropStartRef.current, pt);
          return;
        }

        if (activeTool === "select" && selectStartRef.current) {
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

        if (activeTool === "brush") {
          const smoothPt = stabilizePoint(pt);
          const smoothLast = lastPointRef.current;
          withMirror(
            ctx,
            (f, t, c) => drawBrushStroke(f, t, doc.toolSettings.brush, c, currentPressureRef.current),
            smoothLast,
            smoothPt
          );
        } else if (activeTool === "pencil") {
          withMirror(
            ctx,
            (f, t, c) => drawPencilStroke(f, t, doc.toolSettings.pencil, c, currentPressureRef.current),
            lastPointRef.current,
            pt
          );
        } else if (activeTool === "eraser") {
          withMirror(
            ctx,
            (f, t, c) => drawEraserStroke(f, t, doc.toolSettings.eraser, c, currentPressureRef.current),
            lastPointRef.current,
            pt
          );
        } else if (activeTool === "blur") {
          drawBlurStroke(pt, doc.toolSettings.blur, layerCanvas);
        }

        lastPointRef.current = pt;
        redraw();
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
        drawOverlayShape,
        drawOverlayGradient,
        drawOverlayCrop,
        redraw,
        withMirror,
        stabilizePoint
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

        if (isShapeTool(activeTool) && shapeStartRef.current && activeLayer) {
          const overlay = overlayCanvasRef.current;
          if (overlay) {
            const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
            const ctx = layerCanvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(overlay, 0, 0);
              clearOverlay();
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

        // Alpha lock: restore original alpha channel after drawing.
        // Note: iterates all pixels; for very large canvases a dirty-rect
        // optimization could limit this to the stroke bounding box.
        if (activeLayer?.alphaLock && alphaSnapshotRef.current) {
          const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
          if (layerCanvas) {
            const ctx = layerCanvas.getContext("2d");
            if (ctx) {
              const currentData = ctx.getImageData(
                0,
                0,
                layerCanvas.width,
                layerCanvas.height
              );
              const snapshot = alphaSnapshotRef.current;
              // Replace alpha channel of drawn pixels with original alpha
              for (let i = 3; i < currentData.data.length; i += 4) {
                currentData.data[i] = Math.min(
                  currentData.data[i],
                  snapshot.data[i]
                );
              }
              ctx.putImageData(currentData, 0, 0);
              redraw();
            }
          }
          alphaSnapshotRef.current = null;
        }

        if (activeLayer) {
          const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
          const data = layerCanvas ? layerCanvas.toDataURL("image/png") : null;
          onStrokeEnd(activeLayer.id, data);
        }
      },
      [
        doc.layers,
        doc.activeLayerId,
        activeTool,
        onStrokeEnd,
        onCropComplete,
        getOrCreateLayerCanvas,
        clearOverlay,
        redraw,
        screenToCanvas
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

        const container = containerRef.current;
        if (container) {
          cursorCanvas.width = container.clientWidth;
          cursorCanvas.height = container.clientHeight;
        }

        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

        // Only show brush cursor for brush/pencil/eraser/blur tools
        if (
          activeTool !== "brush" &&
          activeTool !== "pencil" &&
          activeTool !== "eraser" &&
          activeTool !== "blur"
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
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={canvasStyle}
        />
        {/* Overlay canvas for shape/gradient/crop preview */}
        <canvas
          ref={overlayCanvasRef}
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={{ ...canvasStyle, pointerEvents: "none" }}
        />
        {/* Cursor canvas for brush size preview */}
        <canvas ref={cursorCanvasRef} className="cursor-overlay" />
        {/* Canvas info bar */}
        <Box
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const size = 8;
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#3a3a3a";
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }
}

export default SketchCanvas;
