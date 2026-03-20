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
import {
  SketchDocument,
  SketchTool,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  Point,
  BlendMode,
  isShapeTool
} from "./types";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.grey[900],
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
  flipLayer: (layerId: string, direction: "horizontal" | "vertical") => void;
  mergeLayerDown: (upperLayerId: string, lowerLayerId: string) => string | undefined;
  flattenVisible: () => string;
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
}

// ─── Blend mode mapping ──────────────────────────────────────────────────────

function blendModeToComposite(mode: BlendMode): GlobalCompositeOperation {
  switch (mode) {
    case "multiply": return "multiply";
    case "screen": return "screen";
    case "overlay": return "overlay";
    case "darken": return "darken";
    case "lighten": return "lighten";
    case "color-dodge": return "color-dodge";
    case "color-burn": return "color-burn";
    case "hard-light": return "hard-light";
    case "soft-light": return "soft-light";
    case "difference": return "difference";
    case "exclusion": return "exclusion";
    default: return "source-over";
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
      onStrokeEnd
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

    // Shape tool state
    const shapeStartRef = useRef<Point | null>(null);

    // Move tool state
    const moveStartRef = useRef<Point | null>(null);
    const moveLayerSnapshotRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      panOffsetRef.current = pan;
    }, [pan]);

    // Track Shift and Space key state for constraints and panning
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Shift") { shiftHeldRef.current = true; }
        if (e.key === " ") { spaceHeldRef.current = true; }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Shift") { shiftHeldRef.current = false; }
        if (e.key === " ") {
          spaceHeldRef.current = false;
          if (isSpacePanningRef.current) {
            isSpacePanningRef.current = false;
          }
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
        if (canvas.width !== doc.canvas.width || canvas.height !== doc.canvas.height) {
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
    }, [doc.layers.length, doc.canvas.width, doc.canvas.height]);

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

      ctx.fillStyle = doc.canvas.backgroundColor;
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

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
        ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode || "normal");
        ctx.drawImage(layerCanvas, 0, 0);
        ctx.restore();
      }
    }, [doc.layers, doc.canvas.backgroundColor]);

    useEffect(() => {
      redraw();
    }, [redraw, doc.layers]);

    // ─── Drawing Functions ────────────────────────────────────────────

    const drawBrushStroke = useCallback(
      (from: Point, to: Point, settings: BrushSettings, ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalAlpha = settings.opacity;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = settings.color;
        ctx.lineWidth = settings.size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (settings.hardness < 1) {
          ctx.filter = `blur(${(1 - settings.hardness) * settings.size * 0.3}px)`;
        }
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      },
      []
    );

    const drawEraserStroke = useCallback(
      (from: Point, to: Point, settings: EraserSettings, ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalAlpha = settings.opacity;
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = settings.size;
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
      (from: Point, to: Point, settings: PencilSettings, ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalAlpha = settings.opacity;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = settings.color;
        ctx.lineWidth = settings.size;
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

    // ─── Shape Drawing ────────────────────────────────────────────────

    /** Apply shift-constraint to shape end point */
    const constrainEnd = useCallback(
      (start: Point, end: Point, tool: SketchTool): Point => {
        if (!shiftHeldRef.current) { return end; }
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
            ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
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
            const angle = Math.atan2(constrained.y - start.y, constrained.x - start.x);
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
      (ctx: CanvasRenderingContext2D, startX: number, startY: number, settings: FillSettings) => {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const sx = Math.round(startX);
        const sy = Math.round(startY);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
          return;
        }

        const fillR = parseInt(settings.color.slice(1, 3), 16);
        const fillG = parseInt(settings.color.slice(3, 5), 16);
        const fillB = parseInt(settings.color.slice(5, 7), 16);

        const idx = (sy * w + sx) * 4;
        const targetR = data[idx];
        const targetG = data[idx + 1];
        const targetB = data[idx + 2];
        const targetA = data[idx + 3];

        if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === 255) {
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
          data[i + 3] = 255;

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

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && spaceHeldRef.current)) {
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
              const pixel = ctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data;
              const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
              containerRef.current?.dispatchEvent(
                new CustomEvent("sketch-eyedropper", { detail: { color: hex }, bubbles: true })
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

        isDrawingRef.current = true;
        const pt = screenToCanvas(e.clientX, e.clientY);
        lastPointRef.current = pt;
        onStrokeStart();

        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          if (activeTool === "brush") {
            withMirror(
              ctx,
              (f, t, c) => drawBrushStroke(f, t, doc.toolSettings.brush, c),
              pt, pt
            );
          } else if (activeTool === "pencil") {
            withMirror(
              ctx,
              (f, t, c) => drawPencilStroke(f, t, doc.toolSettings.pencil, c),
              pt, pt
            );
          } else if (activeTool === "eraser") {
            withMirror(
              ctx,
              (f, t, c) => drawEraserStroke(f, t, doc.toolSettings.eraser, c),
              pt, pt
            );
          }
          redraw();
        }

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      },
      [
        doc, activeTool, screenToCanvas, onStrokeStart, onStrokeEnd,
        getOrCreateLayerCanvas, drawBrushStroke, drawPencilStroke, drawEraserStroke,
        floodFill, redraw, withMirror
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

        if (!isDrawingRef.current) {
          return;
        }

        const pt = screenToCanvas(e.clientX, e.clientY);

        if (activeTool === "move" && moveStartRef.current && moveLayerSnapshotRef.current) {
          const dx = pt.x - moveStartRef.current.x;
          const dy = pt.y - moveStartRef.current.y;
          const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
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
          withMirror(
            ctx,
            (f, t, c) => drawBrushStroke(f, t, doc.toolSettings.brush, c),
            lastPointRef.current, pt
          );
        } else if (activeTool === "pencil") {
          withMirror(
            ctx,
            (f, t, c) => drawPencilStroke(f, t, doc.toolSettings.pencil, c),
            lastPointRef.current, pt
          );
        } else if (activeTool === "eraser") {
          withMirror(
            ctx,
            (f, t, c) => drawEraserStroke(f, t, doc.toolSettings.eraser, c),
            lastPointRef.current, pt
          );
        }

        lastPointRef.current = pt;
        redraw();
      },
      [
        doc, activeTool, screenToCanvas, onPanChange,
        getOrCreateLayerCanvas, drawBrushStroke, drawPencilStroke, drawEraserStroke,
        drawOverlayShape, redraw, withMirror
      ]
    );

    const handlePointerUp = useCallback(
      (_e: React.PointerEvent) => {
        if (isPanningRef.current) {
          isPanningRef.current = false;
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

        lastPointRef.current = null;

        if (activeLayer) {
          const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
          const data = layerCanvas ? layerCanvas.toDataURL("image/png") : null;
          onStrokeEnd(activeLayer.id, data);
        }
      },
      [doc.layers, doc.activeLayerId, activeTool, onStrokeEnd, getOrCreateLayerCanvas, clearOverlay, redraw]
    );

    // ─── Wheel zoom ──────────────────────────────────────────────────

    const handleWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(10, zoom * delta));
        onZoomChange(newZoom);
      },
      [zoom, onZoomChange]
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
              ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode || "normal");
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
        flipLayer: (layerId: string, direction: "horizontal" | "vertical") => {
          const canvas = layerCanvasesRef.current.get(layerId);
          if (!canvas) { return; }
          const ctx = canvas.getContext("2d");
          if (!ctx) { return; }
          const temp = window.document.createElement("canvas");
          temp.width = canvas.width;
          temp.height = canvas.height;
          const tempCtx = temp.getContext("2d");
          if (!tempCtx) { return; }
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
          if (!upperCanvas || !lowerCanvas) { return; }
          const lowerCtx = lowerCanvas.getContext("2d");
          if (!lowerCtx) { return; }
          const upperLayer = doc.layers.find((l) => l.id === upperLayerId);
          if (upperLayer) {
            lowerCtx.save();
            lowerCtx.globalAlpha = upperLayer.opacity;
            lowerCtx.globalCompositeOperation = blendModeToComposite(upperLayer.blendMode || "normal");
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
          if (!ctx) { return ""; }
          ctx.fillStyle = doc.canvas.backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (const layer of doc.layers) {
            if (!layer.visible) { continue; }
            const layerCanvas = layerCanvasesRef.current.get(layer.id);
            if (layerCanvas) {
              ctx.save();
              ctx.globalAlpha = layer.opacity;
              ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode || "normal");
              ctx.drawImage(layerCanvas, 0, 0);
              ctx.restore();
            }
          }
          return canvas.toDataURL("image/png");
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

    const drawCursor = useCallback((screenX: number, screenY: number) => {
      const cursorCanvas = cursorCanvasRef.current;
      if (!cursorCanvas) { return; }
      const ctx = cursorCanvas.getContext("2d");
      if (!ctx) { return; }

      const container = containerRef.current;
      if (container) {
        cursorCanvas.width = container.clientWidth;
        cursorCanvas.height = container.clientHeight;
      }

      ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

      // Only show brush cursor for brush/pencil/eraser tools
      if (activeTool !== "brush" && activeTool !== "pencil" && activeTool !== "eraser") {
        return;
      }

      let size: number;
      if (activeTool === "brush") {
        size = doc.toolSettings.brush.size;
      } else if (activeTool === "pencil") {
        size = doc.toolSettings.pencil.size;
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
    }, [activeTool, doc.toolSettings.brush.size, doc.toolSettings.pencil.size, doc.toolSettings.eraser.size, zoom]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        mousePositionRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        drawCursor(mousePositionRef.current.x, mousePositionRef.current.y);
      }
    }, [drawCursor]);

    const handleMouseLeave = useCallback(() => {
      const cursorCanvas = cursorCanvasRef.current;
      if (cursorCanvas) {
        const ctx = cursorCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        }
      }
    }, []);

    // Determine cursor style based on tool
    const cursorStyle = activeTool === "move"
      ? "move"
      : (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser")
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
      >
        <canvas
          ref={displayCanvasRef}
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={canvasStyle}
        />
        {/* Overlay canvas for shape preview */}
        <canvas
          ref={overlayCanvasRef}
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={{ ...canvasStyle, pointerEvents: "none" }}
        />
        {/* Cursor canvas for brush size preview */}
        <canvas
          ref={cursorCanvasRef}
          className="cursor-overlay"
        />
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
