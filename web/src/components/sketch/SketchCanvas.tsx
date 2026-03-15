/**
 * SketchCanvas
 *
 * Core canvas rendering and drawing engine for the sketch editor.
 * Manages raster drawing with brush and eraser tools, zoom/pan, and layer compositing.
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
  EraserSettings,
  Point
} from "./types";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.grey[900],
    cursor: "crosshair",
    "& canvas": {
      position: "absolute",
      top: "50%",
      left: "50%",
      imageRendering: "pixelated"
    }
  });

// ─── Canvas Ref Interface ────────────────────────────────────────────────────

export interface SketchCanvasRef {
  /** Get the current active layer's canvas data as data URL */
  getLayerData: (layerId: string) => string | null;
  /** Load data URL into a layer's offscreen canvas */
  setLayerData: (layerId: string, data: string | null) => void;
  /** Flatten all visible layers to a single canvas and return data URL */
  flattenToDataUrl: () => string;
  /** Get mask layer data URL */
  getMaskDataUrl: () => string | null;
  /** Clear a layer */
  clearLayer: (layerId: string) => void;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SketchCanvasProps {
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  onStrokeStart: () => void;
  onStrokeEnd: (layerId: string, data: string | null) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

const SketchCanvas = forwardRef<SketchCanvasRef, SketchCanvasProps>(
  function SketchCanvas(props, ref) {
    const {
      document: doc,
      activeTool,
      zoom,
      pan,
      onZoomChange,
      onPanChange,
      onStrokeStart,
      onStrokeEnd
    } = props;

    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<Point | null>(null);
    const isPanningRef = useRef(false);
    const panStartRef = useRef<Point>({ x: 0, y: 0 });
    const panOffsetRef = useRef<Point>(pan);

    // Keep pan ref in sync
    useEffect(() => {
      panOffsetRef.current = pan;
    }, [pan]);

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
      // Clean up canvases for layers that no longer exist
      const layerIds = new Set(doc.layers.map((l) => l.id));
      for (const [id] of layerCanvasesRef.current) {
        if (!layerIds.has(id)) {
          layerCanvasesRef.current.delete(id);
        }
      }

      // Load layer data into canvases
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

      // Fill background
      ctx.fillStyle = doc.canvas.backgroundColor;
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

      // Draw checkerboard for transparency visualization
      drawCheckerboard(ctx, displayCanvas.width, displayCanvas.height);

      // Fill background again on top of checkerboard
      ctx.fillStyle = doc.canvas.backgroundColor;
      ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

      // Composite visible layers bottom to top
      for (const layer of doc.layers) {
        if (!layer.visible) {
          continue;
        }
        const layerCanvas = layerCanvasesRef.current.get(layer.id);
        if (!layerCanvas) {
          continue;
        }
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layerCanvas, 0, 0);
      }
      ctx.globalAlpha = 1;
    }, [doc.layers, doc.canvas.backgroundColor]);

    // Redraw when layers or visibility changes
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

        // Hardness affects blur
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

    // ─── Coordinate Transform ─────────────────────────────────────────

    const screenToCanvas = useCallback(
      (clientX: number, clientY: number): Point => {
        const container = containerRef.current;
        const displayCanvas = displayCanvasRef.current;
        if (!container || !displayCanvas) {
          return { x: 0, y: 0 };
        }

        const rect = displayCanvas.getBoundingClientRect();
        const x = (clientX - rect.left) / zoom;
        const y = (clientY - rect.top) / zoom;
        return { x, y };
      },
      [zoom]
    );

    // ─── Pointer Events ──────────────────────────────────────────────

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        // Middle mouse or space+click for panning
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
          isPanningRef.current = true;
          panStartRef.current = { x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y };
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
          // Pick color from display canvas
          const displayCanvas = displayCanvasRef.current;
          if (displayCanvas) {
            const ctx = displayCanvas.getContext("2d");
            if (ctx) {
              const pt = screenToCanvas(e.clientX, e.clientY);
              const pixel = ctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data;
              const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
              // We don't have direct access to setBrushSettings here,
              // so emit a custom event that the parent can handle
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

        isDrawingRef.current = true;
        const pt = screenToCanvas(e.clientX, e.clientY);
        lastPointRef.current = pt;
        onStrokeStart();

        // Draw a single dot at the start point
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          if (activeTool === "brush") {
            drawBrushStroke(pt, pt, doc.toolSettings.brush, ctx);
          } else if (activeTool === "eraser") {
            drawEraserStroke(pt, pt, doc.toolSettings.eraser, ctx);
          }
          redraw();
        }

        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      },
      [
        doc, activeTool, screenToCanvas, onStrokeStart,
        getOrCreateLayerCanvas, drawBrushStroke, drawEraserStroke, redraw
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

        if (!isDrawingRef.current || !lastPointRef.current) {
          return;
        }

        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (!activeLayer) {
          return;
        }

        const pt = screenToCanvas(e.clientX, e.clientY);
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (!ctx) {
          return;
        }

        if (activeTool === "brush") {
          drawBrushStroke(lastPointRef.current, pt, doc.toolSettings.brush, ctx);
        } else if (activeTool === "eraser") {
          drawEraserStroke(lastPointRef.current, pt, doc.toolSettings.eraser, ctx);
        }

        lastPointRef.current = pt;
        redraw();
      },
      [
        doc, activeTool, screenToCanvas,
        getOrCreateLayerCanvas, drawBrushStroke, drawEraserStroke, redraw, onPanChange
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
        lastPointRef.current = null;

        // Emit the updated layer data
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const layerCanvas = layerCanvasesRef.current.get(activeLayer.id);
          const data = layerCanvas ? layerCanvas.toDataURL("image/png") : null;
          onStrokeEnd(activeLayer.id, data);
        }
      },
      [doc.layers, doc.activeLayerId, onStrokeEnd]
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
              ctx.globalAlpha = layer.opacity;
              ctx.drawImage(layerCanvas, 0, 0);
            }
          }
          ctx.globalAlpha = 1;
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
        }
      }),
      [doc, getOrCreateLayerCanvas, redraw]
    );

    // ─── Transform style ─────────────────────────────────────────────

    const canvasStyle: React.CSSProperties = {
      transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      transformOrigin: "center center"
    };

    return (
      <div
        ref={containerRef}
        css={styles(theme)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={displayCanvasRef}
          width={doc.canvas.width}
          height={doc.canvas.height}
          style={canvasStyle}
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
