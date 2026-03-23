/**
 * usePointerHandlers
 *
 * All pointer event handling for the sketch canvas: down, move, up, wheel.
 * Also manages keyboard modifier tracking (Shift, Space, S, Alt) and
 * tool-specific state refs (shape start, move snapshot, gradient, etc.).
 */

import { useCallback, useEffect, useRef } from "react";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  BlurSettings,
  CloneStampSettings
} from "../types";
import { isShapeTool, isPaintingTool } from "../types";
import {
  drawBrushStroke as drawBrushStrokeUtil,
  drawEraserStroke as drawEraserStrokeUtil,
  drawPencilStroke as drawPencilStrokeUtil,
  drawBlurStroke as drawBlurStrokeUtil,
  drawCloneStampStroke as drawCloneStampStrokeUtil,
  drawGradient as drawGradientUtil,
  floodFill as floodFillUtil,
  blendModeToComposite
} from "../drawingUtils";
import type { BlurTempCanvases } from "../drawingUtils";

// ─── Constants ──────────────────────────────────────────────────────────────
const STABILIZER_WINDOW = 4;

export interface UsePointerHandlersParams {
  doc: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;
  selection?: Selection | null;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  mousePositionRef: React.MutableRefObject<Point>;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  redraw: () => void;
  requestRedraw: () => void;
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;
  clearOverlay: () => void;
  drawSelectionOverlay: () => void;
  drawOverlayShape: (start: Point, end: Point) => void;
  drawOverlayGradient: (start: Point, end: Point) => void;
  drawOverlayCrop: (start: Point, end: Point) => void;
  drawOverlaySelection: (start: Point, end: Point) => void;
  drawCursor: (screenX: number, screenY: number) => void;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: Point) => void;
  onStrokeStart: () => void;
  onStrokeEnd: (layerId: string, data: string | null) => void;
  onBrushSizeChange?: (size: number) => void;
  onContextMenu?: (x: number, y: number) => void;
  onCropComplete?: (x: number, y: number, width: number, height: number) => void;
  onEyedropperPick?: (color: string) => void;
  onSelectionChange?: (sel: Selection | null) => void;
  onAutoPickLayer?: (layerId: string) => void;
}

export interface UsePointerHandlersResult {
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseLeave: () => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  selectStartRef: React.MutableRefObject<Point | null>;
}

export function usePointerHandlers({
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
  getOrCreateLayerCanvas,
  redraw,
  requestRedraw,
  requestDirtyRedraw,
  clearOverlay,
  drawSelectionOverlay,
  drawOverlayShape,
  drawOverlayGradient,
  drawOverlayCrop,
  drawOverlaySelection,
  drawCursor,
  onZoomChange,
  onPanChange,
  onStrokeStart,
  onStrokeEnd,
  onBrushSizeChange,
  onContextMenu,
  onCropComplete,
  onEyedropperPick,
  onSelectionChange,
  onAutoPickLayer
}: UsePointerHandlersParams): UsePointerHandlersResult {
  // ─── Interaction state refs ─────────────────────────────────────────
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const lastSmoothedPointRef = useRef<Point | null>(null);
  const isPanningRef = useRef(false);
  const isSpacePanningRef = useRef(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOffsetRef = useRef<Point>(pan);
  const shiftHeldRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const sKeyHeldRef = useRef(false);
  const altHeldRef = useRef(false);
  const isSizeDraggingRef = useRef(false);
  const sizeDragStartRef = useRef<Point>({ x: 0, y: 0 });
  const sizeDragInitialSize = useRef(0);

  // Tool-specific state
  const shapeStartRef = useRef<Point | null>(null);
  const moveStartRef = useRef<Point | null>(null);
  const moveLayerSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const gradientStartRef = useRef<Point | null>(null);
  const gradientEndRef = useRef<Point | null>(null);
  const cropStartRef = useRef<Point | null>(null);
  const selectStartRef = useRef<Point | null>(null);
  const cloneSourceRef = useRef<Point | null>(null);
  const cloneOffsetRef = useRef<Point | null>(null);
  const cloneSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Selection movement state
  const isMovingSelectionRef = useRef(false);
  const moveSelectionOriginRef = useRef<Point | null>(null);
  const selectionAtMoveStartRef = useRef<Selection | null>(null);

  // Alpha lock & stroke tracking
  const alphaSnapshotRef = useRef<ImageData | null>(null);
  const strokeDirtyRectRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const lastStrokeEndRef = useRef<Point | null>(null);
  const stabilizerBufferRef = useRef<Point[]>([]);
  const currentPressureRef = useRef<number>(0.5);

  // Performance: reusable canvases
  const blurTempCanvasesRef = useRef<BlurTempCanvases>({ tmp: null, blurred: null, mask: null });
  const blurSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushStampCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const eraserStampCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Keep pan offset in sync
  useEffect(() => {
    panOffsetRef.current = pan;
  }, [pan]);

  // ─── Keyboard modifier tracking ────────────────────────────────────

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
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, []);

  // ─── Drawing function wrappers ──────────────────────────────────────

  const drawBrushStroke = useCallback(
    (from: Point, to: Point, settings: BrushSettings, ctx: CanvasRenderingContext2D, pressure?: number) => {
      drawBrushStrokeUtil(from, to, settings, ctx, pressure, strokeDirtyRectRef, brushStampCacheRef.current);
    },
    []
  );

  const drawEraserStroke = useCallback(
    (from: Point, to: Point, settings: EraserSettings, ctx: CanvasRenderingContext2D, pressure?: number) => {
      drawEraserStrokeUtil(from, to, settings, ctx, pressure, strokeDirtyRectRef, eraserStampCacheRef.current);
    },
    []
  );

  const drawPencilStroke = useCallback(
    (from: Point, to: Point, settings: PencilSettings, ctx: CanvasRenderingContext2D, pressure?: number) => {
      drawPencilStrokeUtil(from, to, settings, ctx, pressure, strokeDirtyRectRef);
    },
    []
  );

  const drawBlurStroke = useCallback(
    (from: Point, to: Point, settings: BlurSettings, layerCanvas: HTMLCanvasElement) => {
      const sourceCanvas = blurSourceCanvasRef.current ?? layerCanvas;
      drawBlurStrokeUtil(from, to, settings, layerCanvas, sourceCanvas, strokeDirtyRectRef, blurTempCanvasesRef.current);
    },
    []
  );

  const drawCloneStampStroke = useCallback(
    (from: Point, to: Point, settings: CloneStampSettings, ctx: CanvasRenderingContext2D) => {
      const sourceCanvas = cloneSourceCanvasRef.current;
      const offset = cloneOffsetRef.current;
      if (!sourceCanvas || !offset) {
        return;
      }
      drawCloneStampStrokeUtil(from, to, settings, ctx, sourceCanvas, offset);
    },
    []
  );

  // ─── Coordinate transform ───────────────────────────────────────────

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
    [zoom, displayCanvasRef]
  );

  // ─── Mirror / Symmetry drawing helper ────────────────────────────────

  const withMirror = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      drawFn: (from: Point, to: Point, c: CanvasRenderingContext2D) => void,
      from: Point,
      to: Point
    ) => {
      const cw = doc.canvas.width;
      const ch = doc.canvas.height;
      const cx = cw / 2;
      const cy = ch / 2;

      // Helper: rotate a point around center
      const rotatePoint = (p: Point, angle: number): Point => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = p.x - cx;
        const dy = p.y - cy;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
      };

      // Always draw the original stroke
      drawFn(from, to, ctx);

      switch (symmetryMode) {
        case "horizontal": {
          drawFn({ x: cw - from.x, y: from.y }, { x: cw - to.x, y: to.y }, ctx);
          break;
        }
        case "vertical": {
          drawFn({ x: from.x, y: ch - from.y }, { x: to.x, y: ch - to.y }, ctx);
          break;
        }
        case "dual": {
          drawFn({ x: cw - from.x, y: from.y }, { x: cw - to.x, y: to.y }, ctx);
          drawFn({ x: from.x, y: ch - from.y }, { x: to.x, y: ch - to.y }, ctx);
          drawFn({ x: cw - from.x, y: ch - from.y }, { x: cw - to.x, y: ch - to.y }, ctx);
          break;
        }
        case "radial": {
          // N-fold rotational symmetry
          const step = (2 * Math.PI) / symmetryRays;
          for (let i = 1; i < symmetryRays; i++) {
            const angle = step * i;
            drawFn(rotatePoint(from, angle), rotatePoint(to, angle), ctx);
          }
          break;
        }
        case "mandala": {
          // N-fold rotational + mirror at each slice
          const mStep = (2 * Math.PI) / symmetryRays;
          for (let i = 1; i < symmetryRays; i++) {
            const angle = mStep * i;
            drawFn(rotatePoint(from, angle), rotatePoint(to, angle), ctx);
          }
          // Mirror: reflect across X axis through center, then rotate
          const mirroredFrom = { x: cw - from.x, y: from.y };
          const mirroredTo = { x: cw - to.x, y: to.y };
          for (let i = 0; i < symmetryRays; i++) {
            const angle = mStep * i;
            drawFn(rotatePoint(mirroredFrom, angle), rotatePoint(mirroredTo, angle), ctx);
          }
          break;
        }
        default: {
          // "off" — also handle legacy mirrorX/mirrorY booleans
          if (mirrorX) {
            drawFn({ x: cw - from.x, y: from.y }, { x: cw - to.x, y: to.y }, ctx);
          }
          if (mirrorY) {
            drawFn({ x: from.x, y: ch - from.y }, { x: to.x, y: ch - to.y }, ctx);
          }
          if (mirrorX && mirrorY) {
            drawFn({ x: cw - from.x, y: ch - from.y }, { x: cw - to.x, y: ch - to.y }, ctx);
          }
          break;
        }
      }
    },
    [mirrorX, mirrorY, symmetryMode, symmetryRays, doc.canvas.width, doc.canvas.height]
  );

  // ─── Stabilizer ─────────────────────────────────────────────────────

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

  const rgbToHex = useCallback(
    (r: number, g: number, b: number): string =>
      `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
    []
  );

  // ─── Pointer Down ──────────────────────────────────────────────────

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
        cloneOffsetRef.current = null;
        return;
      }

      // Alt+click on a painting tool samples color (eyedropper)
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

        // Alt+click: auto-pick the topmost layer with non-transparent pixels at click point
        if (e.altKey && onAutoPickLayer) {
          const px = Math.floor(pt.x);
          const py = Math.floor(pt.y);
          // Scan layers from top (last in array) to bottom (first in array)
          for (let i = doc.layers.length - 1; i >= 0; i--) {
            const layer = doc.layers[i];
            if (!layer.visible || layer.locked) {
              continue;
            }
            const layerCanvas = layerCanvasesRef.current.get(layer.id);
            if (!layerCanvas) {
              continue;
            }
            const ctx = layerCanvas.getContext("2d");
            if (!ctx) {
              continue;
            }
            if (px >= 0 && px < layerCanvas.width && py >= 0 && py < layerCanvas.height) {
              const pixel = ctx.getImageData(px, py, 1, 1).data;
              if (pixel[3] > 0) {
                // Found a non-transparent pixel — switch to this layer
                onAutoPickLayer(layer.id);
                break;
              }
            }
          }
        }

        moveStartRef.current = pt;
        isDrawingRef.current = true;
        onStrokeStart();
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        // Use 4x canvas size as padding so the user can move the layer far
        // outside the canvas bounds without cropping the content.
        const pad = Math.max(layerCanvas.width, layerCanvas.height) * 4;
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
        // Only fill if click is within selection (when one exists)
        if (selection && selection.width > 0 && selection.height > 0) {
          if (pt.x < selection.x || pt.x > selection.x + selection.width ||
              pt.y < selection.y || pt.y > selection.y + selection.height) {
            return;
          }
        }
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          onStrokeStart();
          // Apply selection clip for fill
          if (selection && selection.width > 0 && selection.height > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(selection.x, selection.y, selection.width, selection.height);
            ctx.clip();
          }
          floodFillUtil(ctx, pt.x, pt.y, doc.toolSettings.fill);
          if (selection && selection.width > 0 && selection.height > 0) {
            ctx.restore();
          }
          redraw();
          const data = layerCanvas.toDataURL("image/png");
          onStrokeEnd(activeLayer.id, data);
        }
        return;
      }

      // Clone stamp: begin painting stroke
      if (activeTool === "clone_stamp") {
        if (!cloneSourceRef.current) {
          return;
        }
        const pt = screenToCanvas(e.clientX, e.clientY);
        if (!cloneOffsetRef.current) {
          cloneOffsetRef.current = {
            x: cloneSourceRef.current.x - pt.x,
            y: cloneSourceRef.current.y - pt.y
          };
        }
        const settings = doc.toolSettings.cloneStamp;
        if (settings.sampling === "composited") {
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
        if (activeLayer.alphaLock) {
          const lc = getOrCreateLayerCanvas(activeLayer.id);
          const snapCtx = lc.getContext("2d");
          if (snapCtx) {
            alphaSnapshotRef.current = snapCtx.getImageData(0, 0, lc.width, lc.height);
          }
        } else {
          alphaSnapshotRef.current = null;
        }
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
        // Check if clicking inside an existing selection — start moving it
        if (
          selection &&
          !shiftHeldRef.current &&
          !altHeldRef.current &&
          pt.x >= selection.x &&
          pt.x < selection.x + selection.width &&
          pt.y >= selection.y &&
          pt.y < selection.y + selection.height
        ) {
          isMovingSelectionRef.current = true;
          moveSelectionOriginRef.current = pt;
          selectionAtMoveStartRef.current = { ...selection };
          isDrawingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
        // Otherwise draw a new selection (Shift=add, Alt=subtract handled on pointerUp)
        selectStartRef.current = pt;
        isDrawingRef.current = true;
        if (!shiftHeldRef.current && !altHeldRef.current) {
          onSelectionChange?.(null);
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

      stabilizerBufferRef.current = [];
      strokeDirtyRectRef.current = null;

      if (activeLayer.alphaLock) {
        const layerCanvasForSnapshot = getOrCreateLayerCanvas(activeLayer.id);
        const snapCtx = layerCanvasForSnapshot.getContext("2d");
        if (snapCtx) {
          alphaSnapshotRef.current = snapCtx.getImageData(
            0, 0,
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
        // Apply selection clip for initial stroke
        const hasSelClip = selection && selection.width > 0 && selection.height > 0;
        if (hasSelClip) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(selection.x, selection.y, selection.width, selection.height);
          ctx.clip();
        }

        if (shiftHeldRef.current && lastStrokeEndRef.current) {
          const from = lastStrokeEndRef.current;
          const dx = pt.x - from.x;
          const dy = pt.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const STRAIGHT_LINE_STEP_DIVISOR = 100;
          const step = Math.max(1, Math.min(4, dist / STRAIGHT_LINE_STEP_DIVISOR));
          const steps = Math.max(1, Math.ceil(dist / step));
          let prev = from;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const current = { x: from.x + dx * t, y: from.y + dy * t };
            if (activeTool === "brush") {
              withMirror(ctx, (f, to, c) => drawBrushStroke(f, to, doc.toolSettings.brush, c, currentPressureRef.current), prev, current);
            } else if (activeTool === "pencil") {
              withMirror(ctx, (f, to, c) => drawPencilStroke(f, to, doc.toolSettings.pencil, c, currentPressureRef.current), prev, current);
            } else if (activeTool === "eraser") {
              withMirror(ctx, (f, to, c) => drawEraserStroke(f, to, doc.toolSettings.eraser, c, currentPressureRef.current), prev, current);
            } else if (activeTool === "blur") {
              drawBlurStroke(prev, current, doc.toolSettings.blur, layerCanvas);
            }
            prev = current;
          }
        } else {
          if (activeTool === "brush") {
            withMirror(ctx, (f, t, c) => drawBrushStroke(f, t, doc.toolSettings.brush, c, currentPressureRef.current), pt, pt);
          } else if (activeTool === "pencil") {
            withMirror(ctx, (f, t, c) => drawPencilStroke(f, t, doc.toolSettings.pencil, c, currentPressureRef.current), pt, pt);
          } else if (activeTool === "eraser") {
            withMirror(ctx, (f, t, c) => drawEraserStroke(f, t, doc.toolSettings.eraser, c, currentPressureRef.current), pt, pt);
          } else if (activeTool === "blur") {
            drawBlurStroke(pt, pt, doc.toolSettings.blur, layerCanvas);
          }
        }

        if (hasSelClip) {
          ctx.restore();
        }

        redraw();
      }

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      doc,
      activeTool,
      selection,
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
      redraw,
      withMirror,
      onEyedropperPick,
      rgbToHex,
      onSelectionChange,
      containerRef,
      displayCanvasRef,
      layerCanvasesRef
    ]
  );

  // ─── Pointer Move ──────────────────────────────────────────────────

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

      if (isSizeDraggingRef.current && onBrushSizeChange) {
        const dx = e.clientX - sizeDragStartRef.current.x;
        const maxSize = activeTool === "pencil" ? 10 : 200;
        const newSize = Math.max(
          1,
          Math.min(maxSize, Math.round(sizeDragInitialSize.current + dx * 0.5))
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
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            const pad = (moveLayerSnapshotRef.current.width - layerCanvas.width) / 2;
            ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
            ctx.drawImage(
              moveLayerSnapshotRef.current,
              pad - dx, pad - dy,
              layerCanvas.width, layerCanvas.height,
              0, 0,
              layerCanvas.width, layerCanvas.height
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

      if (activeTool === "select" && isMovingSelectionRef.current && moveSelectionOriginRef.current && selectionAtMoveStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const dx = pt.x - moveSelectionOriginRef.current.x;
        const dy = pt.y - moveSelectionOriginRef.current.y;
        const orig = selectionAtMoveStartRef.current;
        if (onSelectionChange) {
          onSelectionChange({
            x: Math.round(orig.x + dx),
            y: Math.round(orig.y + dy),
            width: orig.width,
            height: orig.height
          });
        }
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

      // Apply selection clip if a selection exists
      const hasSelectionClip = selection && selection.width > 0 && selection.height > 0;
      if (hasSelectionClip) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(selection.x, selection.y, selection.width, selection.height);
        ctx.clip();
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
          withMirror(ctx, (f, t, c) => drawBrushStroke(f, t, doc.toolSettings.brush, c, pressure), from, smoothPt);
          lastSmoothedPointRef.current = smoothPt;
        } else if (activeTool === "pencil") {
          withMirror(ctx, (f, t, c) => drawPencilStroke(f, t, doc.toolSettings.pencil, c, pressure), lastPointRef.current, pt);
        } else if (activeTool === "eraser") {
          const smoothPt = stabilizePoint(pt);
          const from = lastSmoothedPointRef.current ?? lastPointRef.current ?? smoothPt;
          withMirror(ctx, (f, t, c) => drawEraserStroke(f, t, doc.toolSettings.eraser, c, pressure), from, smoothPt);
          lastSmoothedPointRef.current = smoothPt;
        } else if (activeTool === "blur") {
          drawBlurStroke(lastPointRef.current, pt, doc.toolSettings.blur, layerCanvas);
        } else if (activeTool === "clone_stamp") {
          drawCloneStampStroke(lastPointRef.current, pt, doc.toolSettings.cloneStamp, ctx);
        }

        lastPointRef.current = pt;
      }

      // Restore context if selection clip was applied
      if (hasSelectionClip) {
        ctx.restore();
      }

      // Use dirty-rect compositing during painting for better performance on large canvases
      const dirty = strokeDirtyRectRef.current;
      if (dirty && dirty.minX < dirty.maxX && dirty.minY < dirty.maxY) {
        requestDirtyRedraw(dirty.minX, dirty.minY, dirty.maxX - dirty.minX, dirty.maxY - dirty.minY);
      } else {
        requestRedraw();
      }
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
      requestDirtyRedraw,
      withMirror,
      stabilizePoint,
      drawOverlaySelection,
      onSelectionChange
    ]
  );

  // ─── Pointer Up ─────────────────────────────────────────────────────

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
        const overlayCanvas = overlayCanvasRef.current;
        if (overlayCanvas) {
          const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(overlayCanvas, 0, 0);
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
          drawGradientUtil(ctx, start, end, doc.toolSettings.gradient);
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

      // Finalize selection movement
      if (activeTool === "select" && isMovingSelectionRef.current) {
        isMovingSelectionRef.current = false;
        moveSelectionOriginRef.current = null;
        selectionAtMoveStartRef.current = null;
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
          const newRect = { x, y, width: w, height: h };
          if (shiftHeldRef.current && selection) {
            // Shift+drag: add (union) the new rect with existing selection
            const ux = Math.min(selection.x, newRect.x);
            const uy = Math.min(selection.y, newRect.y);
            const ux2 = Math.max(selection.x + selection.width, newRect.x + newRect.width);
            const uy2 = Math.max(selection.y + selection.height, newRect.y + newRect.height);
            onSelectionChange({ x: ux, y: uy, width: ux2 - ux, height: uy2 - uy });
          } else if (altHeldRef.current && selection) {
            // Alt+drag: subtract the new rect from existing selection
            // We approximate this by clipping the existing selection to exclude the new rect.
            // Since we only support rectangular selections, we clip the existing rect:
            // If the new rect fully covers the selection, deselect.
            // NOTE: Partial subtraction is not supported because we only
            // support rectangular selections. A full non-rectangular
            // selection system would be needed for true subtract.
            const sx1 = selection.x;
            const sy1 = selection.y;
            const sx2 = selection.x + selection.width;
            const sy2 = selection.y + selection.height;
            const nx1 = newRect.x;
            const ny1 = newRect.y;
            const nx2 = newRect.x + newRect.width;
            const ny2 = newRect.y + newRect.height;
            if (nx1 <= sx1 && ny1 <= sy1 && nx2 >= sx2 && ny2 >= sy2) {
              onSelectionChange(null);
            } else {
              // Partial overlap: keep existing selection unchanged
              onSelectionChange(selection);
            }
          } else {
            onSelectionChange(newRect);
          }
        }
        return;
      }

      // Save the stroke endpoint for Shift+click straight line feature
      if (isPaintingTool(activeTool)) {
        lastStrokeEndRef.current = screenToCanvas(e.clientX, e.clientY);
      }

      lastPointRef.current = null;
      lastSmoothedPointRef.current = null;

      // Alpha lock: restore original alpha channel after drawing
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
      selection,
      onStrokeEnd,
      onCropComplete,
      getOrCreateLayerCanvas,
      clearOverlay,
      drawSelectionOverlay,
      redraw,
      screenToCanvas,
      onSelectionChange,
      containerRef,
      mousePositionRef,
      layerCanvasesRef,
      overlayCanvasRef
    ]
  );

  // ─── Wheel zoom ────────────────────────────────────────────────────

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
    [zoom, pan, onZoomChange, onPanChange, containerRef]
  );

  // ─── Mouse events (cursor + context menu) ──────────────────────────

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
    [drawCursor, containerRef, mousePositionRef]
  );

  const handleMouseLeave = useCallback(() => {
    const cursorCanvas = cursorCanvasRef.current;
    if (cursorCanvas) {
      const ctx = cursorCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      }
    }
  }, [cursorCanvasRef]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (onContextMenu) {
        onContextMenu(e.clientX, e.clientY);
      }
    },
    [onContextMenu]
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    handleMouseMove,
    handleMouseLeave,
    handleContextMenu,
    shiftHeldRef,
    altHeldRef,
    selectStartRef
  };
}
