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
  LayerTransform,
  BlurSettings,
  CloneStampSettings
} from "../types";
import { isShapeTool, isPaintingTool } from "../types";
import {
  drawBlurStroke as drawBlurStrokeUtil,
  drawCloneStampStroke as drawCloneStampStrokeUtil,
  drawGradient as drawGradientUtil,
  floodFill as floodFillUtil,
  blendModeToComposite
} from "../drawingUtils";
import type { BlurTempCanvases } from "../drawingUtils";
import type { ActiveStrokeInfo } from "./useCompositing";
import { getToolHandler } from "../tools";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import {
  ensureLayerRasterBounds,
  getCanvasRasterBounds,
  getDocumentViewportLayerBounds,
  getLayerCompositeOffset
} from "../painting";


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
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer: (layerId: string) => void;
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
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
  onLayerTransformChange?: (layerId: string, transform: LayerTransform) => void;
  onLayerContentBoundsChange?: (
    layerId: string,
    contentBounds: { x: number; y: number; width: number; height: number }
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
  activeStrokeRef,
  getOrCreateLayerCanvas,
  invalidateLayer,
  redraw,
  redrawDirty,
  requestRedraw,
  requestDirtyRedraw: _requestDirtyRedraw,
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
  onLayerTransformChange,
  onLayerContentBoundsChange,
  onBrushSizeChange,
  onContextMenu,
  onCropComplete,
  onEyedropperPick,
  onSelectionChange,
  onAutoPickLayer
}: UsePointerHandlersParams): UsePointerHandlersResult {
  // ─── Interaction state refs ─────────────────────────────────────────
  const isDrawingRef = useRef(false);
  const paintStrokeHasMovedRef = useRef(false);
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
  const moveStartRef = useRef<Point | null>(null);
  const moveLayerStartTransformRef = useRef<LayerTransform>({ x: 0, y: 0 });
  const gradientStartRef = useRef<Point | null>(null);
  const gradientEndRef = useRef<Point | null>(null);
  const cropStartRef = useRef<Point | null>(null);
  const selectStartRef = useRef<Point | null>(null);
  const cloneSourceRef = useRef<Point | null>(null);
  const cloneOffsetRef = useRef<Point | null>(null);
  const clonePaintOffsetRef = useRef<Point | null>(null);
  const cloneSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cloneSourceCanvasMetaRef = useRef<{
    activeLayerId: string;
    sampling: CloneStampSettings["sampling"];
    signature: string;
  } | null>(null);

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
  const currentPressureRef = useRef<number>(0.5);
  const paintLayerOffsetRef = useRef<Point>({ x: 0, y: 0 });

  // Performance: reusable canvases
  const blurTempCanvasesRef = useRef<BlurTempCanvases>({
    tmp: null,
    blurred: null,
    mask: null
  });

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

  const drawBlurStroke = useCallback(
    (
      from: Point,
      to: Point,
      settings: BlurSettings,
      layerCanvas: HTMLCanvasElement
    ) => {
      drawBlurStrokeUtil(
        from,
        to,
        settings,
        layerCanvas,
        layerCanvas,
        strokeDirtyRectRef,
        blurTempCanvasesRef.current
      );
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
      const offset = clonePaintOffsetRef.current ?? cloneOffsetRef.current;
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
      drawFn: (
        from: Point,
        to: Point,
        c: CanvasRenderingContext2D,
        branchIndex: number
      ) => void,
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

      let branchIndex = 0;
      const drawBranch = (branchFrom: Point, branchTo: Point) => {
        drawFn(branchFrom, branchTo, ctx, branchIndex);
        branchIndex += 1;
      };

      // Always draw the original stroke
      drawBranch(from, to);

      switch (symmetryMode) {
        case "horizontal": {
          drawBranch({ x: cw - from.x, y: from.y }, { x: cw - to.x, y: to.y });
          break;
        }
        case "vertical": {
          drawBranch({ x: from.x, y: ch - from.y }, { x: to.x, y: ch - to.y });
          break;
        }
        case "dual": {
          drawBranch({ x: cw - from.x, y: from.y }, { x: cw - to.x, y: to.y });
          drawBranch({ x: from.x, y: ch - from.y }, { x: to.x, y: ch - to.y });
          drawBranch(
            { x: cw - from.x, y: ch - from.y },
            { x: cw - to.x, y: ch - to.y }
          );
          break;
        }
        case "radial": {
          // N-fold rotational symmetry
          const step = (2 * Math.PI) / symmetryRays;
          for (let i = 1; i < symmetryRays; i++) {
            const angle = step * i;
            drawBranch(rotatePoint(from, angle), rotatePoint(to, angle));
          }
          break;
        }
        case "mandala": {
          // N-fold rotational + mirror at each slice
          const mStep = (2 * Math.PI) / symmetryRays;
          for (let i = 1; i < symmetryRays; i++) {
            const angle = mStep * i;
            drawBranch(rotatePoint(from, angle), rotatePoint(to, angle));
          }
          // Mirror: reflect across X axis through center, then rotate
          const mirroredFrom = { x: cw - from.x, y: from.y };
          const mirroredTo = { x: cw - to.x, y: to.y };
          for (let i = 0; i < symmetryRays; i++) {
            const angle = mStep * i;
            drawBranch(
              rotatePoint(mirroredFrom, angle),
              rotatePoint(mirroredTo, angle)
            );
          }
          break;
        }
        default: {
          // "off" — also handle legacy mirrorX/mirrorY booleans
          if (mirrorX) {
            drawBranch(
              { x: cw - from.x, y: from.y },
              { x: cw - to.x, y: to.y }
            );
          }
          if (mirrorY) {
            drawBranch(
              { x: from.x, y: ch - from.y },
              { x: to.x, y: ch - to.y }
            );
          }
          if (mirrorX && mirrorY) {
            drawBranch(
              { x: cw - from.x, y: ch - from.y },
              { x: cw - to.x, y: ch - to.y }
            );
          }
          break;
        }
      }
    },
    [
      mirrorX,
      mirrorY,
      symmetryMode,
      symmetryRays,
      doc.canvas.width,
      doc.canvas.height
    ]
  );

  const rgbToHex = useCallback(
    (r: number, g: number, b: number): string =>
      `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
    []
  );

  const clipSelectionForOffset = useCallback(
    (ctx: CanvasRenderingContext2D, offset: Point) => {
      if (!selection || selection.width <= 0 || selection.height <= 0) {
        return false;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        selection.x - offset.x,
        selection.y - offset.y,
        selection.width,
        selection.height
      );
      ctx.clip();
      return true;
    },
    [selection]
  );

  const ensureLayerViewportStorage = useCallback(
    (layerId: string) => {
      const layer = doc.layers.find((entry) => entry.id === layerId);
      if (!layer) {
        return null;
      }
      return ensureLayerRasterBounds(
        {
          getOrCreateLayerCanvas,
          layerCanvasesRef,
          onLayerContentBoundsChange,
          invalidateLayer
        } as ToolContext,
        layer,
        getDocumentViewportLayerBounds(layer, doc)
      );
    },
    [
      doc,
      getOrCreateLayerCanvas,
      layerCanvasesRef,
      onLayerContentBoundsChange,
      invalidateLayer
    ]
  );

  const getLayerPaintOffset = useCallback(
    (layerId: string): Point => {
      const layer = doc.layers.find((entry) => entry.id === layerId);
      if (!layer) {
        return { x: 0, y: 0 };
      }
      const layerCanvas = layerCanvasesRef.current.get(layerId);
      return getLayerCompositeOffset(
        layer,
        layerCanvas
          ? { width: layerCanvas.width, height: layerCanvas.height }
          : {
              width: Math.max(1, layer.contentBounds?.width ?? doc.canvas.width),
              height: Math.max(1, layer.contentBounds?.height ?? doc.canvas.height)
            },
        layerCanvas
      );
    },
    [doc, layerCanvasesRef]
  );

  const getCloneSourceSignature = useCallback(
    (activeLayerId: string, sampling: CloneStampSettings["sampling"]): string =>
      [
        activeLayerId,
        sampling,
        doc.metadata.updatedAt,
        ...doc.layers.map(
          (layer) =>
            `${layer.id}:${layer.visible ? 1 : 0}:${layer.opacity}:${
              layer.blendMode ?? "normal"
            }:${layer.transform?.x ?? 0}:${layer.transform?.y ?? 0}:${
              layer.contentBounds?.x ?? 0
            }:${layer.contentBounds?.y ?? 0}:${
              layer.contentBounds?.width ?? doc.canvas.width
            }:${layer.contentBounds?.height ?? doc.canvas.height}`
        )
      ].join("|"),
    [doc]
  );

  const buildCloneSourceCanvas = useCallback(
    (
      activeLayerId: string,
      sampling: CloneStampSettings["sampling"]
    ): HTMLCanvasElement | null => {
      if (sampling === "composited") {
        const tmp = window.document.createElement("canvas");
        tmp.width = doc.canvas.width;
        tmp.height = doc.canvas.height;
        const tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
        if (!tmpCtx) {
          return null;
        }
        for (const layer of doc.layers) {
          if (!layer.visible || layer.type === "mask") {
            continue;
          }
          const lc = layerCanvasesRef.current.get(layer.id);
          if (!lc) {
            continue;
          }
          const compositeOffset = getLayerPaintOffset(layer.id);
          tmpCtx.save();
          tmpCtx.globalAlpha = layer.opacity;
          tmpCtx.globalCompositeOperation = blendModeToComposite(
            layer.blendMode || "normal"
          );
          tmpCtx.drawImage(lc, compositeOffset.x, compositeOffset.y);
          tmpCtx.restore();
        }
        return tmp;
      }

      const layerCanvas = getOrCreateLayerCanvas(activeLayerId);
      const snapshot = window.document.createElement("canvas");
      snapshot.width = layerCanvas.width;
      snapshot.height = layerCanvas.height;
      const snapCtx = snapshot.getContext("2d", { willReadFrequently: true });
      if (!snapCtx) {
        return null;
      }
      snapCtx.drawImage(layerCanvas, 0, 0);
      return snapshot;
    },
    [doc, layerCanvasesRef, getLayerPaintOffset, getOrCreateLayerCanvas]
  );

  const drawActiveStrokePreview = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const activeStroke = activeStrokeRef.current;
    if (!activeStroke) {
      return;
    }

    const layer = doc.layers.find((candidate) => candidate.id === activeStroke.layerId);
    const layerCanvas = layerCanvasesRef.current.get(activeStroke.layerId);
    if (!layer || !layerCanvas) {
      return;
    }

    const compositeOffset = getLayerCompositeOffset(layer, {
      width: layerCanvas.width,
      height: layerCanvas.height
    }, layerCanvas);
    const temp = window.document.createElement("canvas");
    temp.width = layerCanvas.width;
    temp.height = layerCanvas.height;
    const tempCtx = temp.getContext("2d");
    if (!tempCtx) {
      return;
    }

    tempCtx.drawImage(layerCanvas, 0, 0);
    tempCtx.save();
    tempCtx.globalAlpha = activeStroke.opacity;
    tempCtx.globalCompositeOperation = activeStroke.compositeOp;
    tempCtx.drawImage(activeStroke.buffer, 0, 0);
    tempCtx.restore();

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode);
    ctx.drawImage(temp, compositeOffset.x, compositeOffset.y);
    ctx.restore();
  }, [overlayCanvasRef, activeStrokeRef, doc.layers, layerCanvasesRef]);

  // ─── Tool context ref ──────────────────────────────────────────────
  // Updated synchronously every render. Handlers read this ref to get
  // the latest values without needing all ToolContext properties in
  // their dependency arrays.
  const toolCtxRef = useRef<ToolContext>(null!);
  toolCtxRef.current = {
    doc,
    activeTool,
    zoom,
    pan,
    mirrorX,
    mirrorY,
    symmetryMode,
    symmetryRays,
    selection: selection ?? null,
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
    requestDirtyRedraw: _requestDirtyRedraw,
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
    onLayerTransformChange,
    onLayerContentBoundsChange,
    onBrushSizeChange,
    onContextMenu,
    onCropComplete,
    onEyedropperPick,
    onSelectionChange,
    onAutoPickLayer,
    screenToCanvas,
    shiftHeldRef,
    altHeldRef,
    withMirror,
    clipSelectionForOffset,
  };

  // ─── Tool pointer event helpers ────────────────────────────────────
  const buildToolPointerEvent = (e: React.PointerEvent): ToolPointerEvent => ({
    point: toolCtxRef.current.screenToCanvas(e.clientX, e.clientY),
    pressure: e.pressure || 0.5,
    nativeEvent: e,
  });

  const buildCoalescedEvents = (e: React.PointerEvent): ToolPointerEvent[] => {
    const nativePointerEvent = e.nativeEvent as PointerEvent;
    const coalescedEvents =
      typeof nativePointerEvent.getCoalescedEvents === "function"
        ? nativePointerEvent.getCoalescedEvents()
        : [nativePointerEvent];
    return coalescedEvents.map((ep) => ({
      point: toolCtxRef.current.screenToCanvas(ep.clientX, ep.clientY),
      pressure: ep.pressure || 0.5,
      nativeEvent: e,
    }));
  };

  // ─── Pointer Down ──────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Clone stamp: Alt+click sets the clone source point
      if (e.button === 0 && e.altKey && activeTool === "clone_stamp") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        cloneSourceRef.current = pt;
        cloneOffsetRef.current = null;
        clonePaintOffsetRef.current = null;
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const signature = getCloneSourceSignature(
            activeLayer.id,
            doc.toolSettings.cloneStamp.sampling
          );
          cloneSourceCanvasRef.current = buildCloneSourceCanvas(
            activeLayer.id,
            doc.toolSettings.cloneStamp.sampling
          );
          cloneSourceCanvasMetaRef.current = cloneSourceCanvasRef.current
            ? {
                activeLayerId: activeLayer.id,
                sampling: doc.toolSettings.cloneStamp.sampling,
                signature
              }
            : null;
        }
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
            const compositeOffset = getLayerPaintOffset(layer.id);
            const localX = px - compositeOffset.x;
            const localY = py - compositeOffset.y;
            if (
              localX >= 0 &&
              localX < layerCanvas.width &&
              localY >= 0 &&
              localY < layerCanvas.height
            ) {
              const pixel = ctx.getImageData(localX, localY, 1, 1).data;
              if (pixel[3] > 0) {
                // Found a non-transparent pixel — switch to this layer
                onAutoPickLayer(layer.id);
                break;
              }
            }
          }
        }

        moveStartRef.current = pt;
        moveLayerStartTransformRef.current = {
          x: activeLayer.transform?.x ?? 0,
          y: activeLayer.transform?.y ?? 0
        };
        isDrawingRef.current = true;
        onStrokeStart();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "fill") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        // Only fill if click is within selection (when one exists)
        if (selection && selection.width > 0 && selection.height > 0) {
          if (
            pt.x < selection.x ||
            pt.x > selection.x + selection.width ||
            pt.y < selection.y ||
            pt.y > selection.y + selection.height
          ) {
            return;
          }
        }
        onStrokeStart();
        const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          paintLayerOffsetRef.current = ensuredBounds
            ? {
                x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
                y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
              }
            : getLayerPaintOffset(activeLayer.id);
          const localPt = {
            x: pt.x - paintLayerOffsetRef.current.x,
            y: pt.y - paintLayerOffsetRef.current.y
          };
          // Apply selection clip for fill
          const clipped = clipSelectionForOffset(
            ctx,
            paintLayerOffsetRef.current
          );
          floodFillUtil(ctx, localPt.x, localPt.y, doc.toolSettings.fill);
          if (clipped) {
            ctx.restore();
          }
          const committedBounds = getCanvasRasterBounds(layerCanvas);
          if (committedBounds) {
            onLayerContentBoundsChange?.(activeLayer.id, committedBounds);
          }
          invalidateLayer(activeLayer.id);
          redraw();
          onStrokeEnd(activeLayer.id, null);
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
        clonePaintOffsetRef.current = null;
        const settings = doc.toolSettings.cloneStamp;
        const cloneSignature = getCloneSourceSignature(activeLayer.id, settings.sampling);
        const cachedMeta = cloneSourceCanvasMetaRef.current;
        if (
          !cloneSourceCanvasRef.current ||
          !cachedMeta ||
          cachedMeta.activeLayerId !== activeLayer.id ||
          cachedMeta.sampling !== settings.sampling ||
          cachedMeta.signature !== cloneSignature
        ) {
          cloneSourceCanvasRef.current = buildCloneSourceCanvas(
            activeLayer.id,
            settings.sampling
          );
          cloneSourceCanvasMetaRef.current = cloneSourceCanvasRef.current
            ? {
                activeLayerId: activeLayer.id,
                sampling: settings.sampling,
                signature: cloneSignature
              }
            : null;
        }
        isDrawingRef.current = true;
        paintStrokeHasMovedRef.current = false;
        lastPointRef.current = pt;
        lastSmoothedPointRef.current = pt;
        currentPressureRef.current = e.pressure || 0.5;
        onStrokeStart();
        const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
        paintLayerOffsetRef.current = ensuredBounds
          ? {
              x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
              y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
            }
          : getLayerPaintOffset(activeLayer.id);
        clonePaintOffsetRef.current =
          settings.sampling === "composited" && cloneOffsetRef.current
            ? {
                x: cloneOffsetRef.current.x + paintLayerOffsetRef.current.x,
                y: cloneOffsetRef.current.y + paintLayerOffsetRef.current.y
              }
            : cloneOffsetRef.current;
        strokeDirtyRectRef.current = null;
        if (activeLayer.alphaLock) {
          const lc = getOrCreateLayerCanvas(activeLayer.id);
          const snapCtx = lc.getContext("2d");
          if (snapCtx) {
            alphaSnapshotRef.current = snapCtx.getImageData(
              0,
              0,
              lc.width,
              lc.height
            );
          }
        } else {
          alphaSnapshotRef.current = null;
        }
        const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          const localPt = {
            x: pt.x - paintLayerOffsetRef.current.x,
            y: pt.y - paintLayerOffsetRef.current.y
          };
          drawCloneStampStroke(localPt, localPt, doc.toolSettings.cloneStamp, ctx);
          invalidateLayer(activeLayer.id);
          redraw();
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (isShapeTool(activeTool)) {
        const handler = getToolHandler(activeTool);
        const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
        if (started) {
          isDrawingRef.current = true;
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (activeTool === "gradient") {
        const pt = screenToCanvas(e.clientX, e.clientY);
        gradientStartRef.current = pt;
        gradientEndRef.current = pt;
        isDrawingRef.current = true;
        onStrokeStart();
        const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
        paintLayerOffsetRef.current = ensuredBounds
          ? {
              x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
              y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
            }
          : getLayerPaintOffset(activeLayer.id);
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

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser") {
        const handler = getToolHandler(activeTool);
        const started = handler.onDown?.(toolCtxRef.current, buildToolPointerEvent(e));
        if (started) {
          isDrawingRef.current = true;
          // Live preview: render the merged active-layer preview on the overlay
          // for all paint tools while WebGPU hides the active layer underneath.
          if (activeStrokeRef.current) {
            drawActiveStrokePreview();
          }
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // ─── Blur: inline path (Phase 5) ──────────────────────────────────
      isDrawingRef.current = true;
      const pt = screenToCanvas(e.clientX, e.clientY);
      lastPointRef.current = pt;
      lastSmoothedPointRef.current = pt;
      currentPressureRef.current = e.pressure || 0.5;
      onStrokeStart();
      const ensuredBounds = ensureLayerViewportStorage(activeLayer.id);
      paintLayerOffsetRef.current = ensuredBounds
        ? {
            x: (activeLayer.transform?.x ?? 0) + ensuredBounds.x,
            y: (activeLayer.transform?.y ?? 0) + ensuredBounds.y
          }
        : getLayerPaintOffset(activeLayer.id);

      strokeDirtyRectRef.current = null;

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
      const paintCtx = layerCanvas.getContext("2d");
      if (paintCtx) {
        const currentOffset = paintLayerOffsetRef.current;
        const localPt = {
          x: pt.x - currentOffset.x,
          y: pt.y - currentOffset.y
        };
        const hasSelClip = clipSelectionForOffset(paintCtx, currentOffset);

        if (shiftHeldRef.current && lastStrokeEndRef.current) {
          const from = {
            x: lastStrokeEndRef.current.x - currentOffset.x,
            y: lastStrokeEndRef.current.y - currentOffset.y
          };
          if (activeTool === "blur") {
            drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
          }
        } else {
          if (activeTool === "blur") {
            drawBlurStroke(localPt, localPt, doc.toolSettings.blur, layerCanvas);
          }
        }

        if (hasSelClip) {
          paintCtx.restore();
        }

        invalidateLayer(activeLayer.id);
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
      drawBlurStroke,
      drawCloneStampStroke,
      redraw,
      clipSelectionForOffset,
      onEyedropperPick,
      rgbToHex,
      ensureLayerViewportStorage,
      getLayerPaintOffset,
      onSelectionChange,
      containerRef,
      displayCanvasRef,
      layerCanvasesRef,
      onAutoPickLayer,
      activeStrokeRef,
      invalidateLayer,
      onLayerContentBoundsChange,
      getCloneSourceSignature,
      buildCloneSourceCanvas,
      drawActiveStrokePreview
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

      if (activeTool === "move" && moveStartRef.current) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        const dx = pt.x - moveStartRef.current.x;
        const dy = pt.y - moveStartRef.current.y;
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer && onLayerTransformChange) {
          onLayerTransformChange(activeLayer.id, {
            x: Math.round(moveLayerStartTransformRef.current.x + dx),
            y: Math.round(moveLayerStartTransformRef.current.y + dy)
          });
        }
        return;
      }

      if (isShapeTool(activeTool)) {
        const handler = getToolHandler(activeTool);
        handler.onMove?.(toolCtxRef.current, buildToolPointerEvent(e), []);
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

      if (
        activeTool === "select" &&
        isMovingSelectionRef.current &&
        moveSelectionOriginRef.current &&
        selectionAtMoveStartRef.current
      ) {
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

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser") {
        const handler = getToolHandler(activeTool);
        handler.onMove?.(
          toolCtxRef.current,
          buildToolPointerEvent(e),
          buildCoalescedEvents(e)
        );
        // Live preview: render the merged active-layer preview on the overlay
        // for all paint tools while WebGPU hides the active layer underneath.
        if (activeStrokeRef.current) {
          drawActiveStrokePreview();
        }
        return;
      }

      // ─── Blur / Clone Stamp: inline path ──────────────────────────────
      if (!lastPointRef.current) {
        return;
      }
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer) {
        return;
      }

      const nativePointerEvent = e.nativeEvent as PointerEvent;
      const coalescedEvents =
        typeof nativePointerEvent.getCoalescedEvents === "function"
          ? nativePointerEvent.getCoalescedEvents()
          : [nativePointerEvent];
      const eventPoints = coalescedEvents.map((eventPoint) => ({
        point: screenToCanvas(eventPoint.clientX, eventPoint.clientY),
        pressure: eventPoint.pressure || currentPressureRef.current || 0.5
      }));
      if (eventPoints.length === 0) {
        return;
      }

      const layerCanvas = getOrCreateLayerCanvas(activeLayer.id);
      const currentOffset = paintLayerOffsetRef.current;

      const ctx = layerCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const hasSelectionClip = clipSelectionForOffset(ctx, currentOffset);

      const pointsToProcess =
        activeTool === "blur" ? [eventPoints[eventPoints.length - 1]] : eventPoints;

      for (const eventPoint of pointsToProcess) {
        const pt = eventPoint.point;
        if (
          !paintStrokeHasMovedRef.current &&
          lastPointRef.current &&
          (pt.x !== lastPointRef.current.x || pt.y !== lastPointRef.current.y)
        ) {
          paintStrokeHasMovedRef.current = true;
        }
        const localPt = {
          x: pt.x - currentOffset.x,
          y: pt.y - currentOffset.y
        };
        const pressure = eventPoint.pressure;
        currentPressureRef.current = pressure;

        if (activeTool === "blur") {
          const from = lastPointRef.current
            ? {
                x: lastPointRef.current.x - currentOffset.x,
                y: lastPointRef.current.y - currentOffset.y
              }
            : localPt;
          drawBlurStroke(from, localPt, doc.toolSettings.blur, layerCanvas);
        } else if (activeTool === "clone_stamp") {
          const from = lastPointRef.current
            ? {
                x: lastPointRef.current.x - currentOffset.x,
                y: lastPointRef.current.y - currentOffset.y
              }
            : localPt;
          drawCloneStampStroke(
            from,
            localPt,
            doc.toolSettings.cloneStamp,
            ctx
          );
        }

        lastPointRef.current = pt;
      }

      if (hasSelectionClip) {
        ctx.restore();
      }

      invalidateLayer(activeLayer.id);
      // Use dirty-rect compositing during painting for better performance on large canvases
      const dirty = strokeDirtyRectRef.current;
      if (dirty && dirty.minX < dirty.maxX && dirty.minY < dirty.maxY) {
        redrawDirty(
          dirty.minX + currentOffset.x,
          dirty.minY + currentOffset.y,
          dirty.maxX - dirty.minX,
          dirty.maxY - dirty.minY
        );
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
      drawBlurStroke,
      drawCloneStampStroke,
      drawOverlayGradient,
      drawOverlayCrop,
      redrawDirty,
      requestRedraw,
      clipSelectionForOffset,
      drawOverlaySelection,
      onSelectionChange,
      onLayerTransformChange,
      activeStrokeRef,
      invalidateLayer,
      drawActiveStrokePreview
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
        moveLayerStartTransformRef.current = { x: 0, y: 0 };
      }
      if (activeTool === "clone_stamp") {
        clonePaintOffsetRef.current = null;
      }

      if (isShapeTool(activeTool)) {
        const handler = getToolHandler(activeTool);
        handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));
        return;
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
          const currentOffset = paintLayerOffsetRef.current;
          drawGradientUtil(
            ctx,
            {
              x: start.x - currentOffset.x,
              y: start.y - currentOffset.y
            },
            {
              x: end.x - currentOffset.x,
              y: end.y - currentOffset.y
            },
            doc.toolSettings.gradient
          );
          const committedBounds = getCanvasRasterBounds(layerCanvas);
          if (committedBounds) {
            onLayerContentBoundsChange?.(activeLayer.id, committedBounds);
          }
          invalidateLayer(activeLayer.id);
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
            const ux2 = Math.max(
              selection.x + selection.width,
              newRect.x + newRect.width
            );
            const uy2 = Math.max(
              selection.y + selection.height,
              newRect.y + newRect.height
            );
            onSelectionChange({
              x: ux,
              y: uy,
              width: ux2 - ux,
              height: uy2 - uy
            });
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

      // ─── Brush / Pencil / Eraser: delegate to shared PaintSession ─────
      if (activeTool === "brush" || activeTool === "pencil" || activeTool === "eraser") {
        const handler = getToolHandler(activeTool);
        handler.onUp?.(toolCtxRef.current, buildToolPointerEvent(e));
        clearOverlay();
        drawSelectionOverlay();
        return;
      }

      // ─── Blur / Clone Stamp: inline cleanup path ──────────────────────
      // Save the stroke endpoint for Shift+click straight line feature
      if (isPaintingTool(activeTool)) {
        lastStrokeEndRef.current = screenToCanvas(e.clientX, e.clientY);
      }

      clearOverlay();
      drawSelectionOverlay();

      lastPointRef.current = null;
      lastSmoothedPointRef.current = null;
      paintStrokeHasMovedRef.current = false;
      paintLayerOffsetRef.current = { x: 0, y: 0 };

      // Alpha lock: restore original alpha channel after merging
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
              invalidateLayer(activeLayer.id);
            }
          }
        }
        alphaSnapshotRef.current = null;
      }
      strokeDirtyRectRef.current = null;
      redraw();

      if (activeLayer) {
        const layerId = activeLayer.id;
        const layerCanvas = layerCanvasesRef.current.get(layerId);
        const committedBounds = getCanvasRasterBounds(layerCanvas);
        if (committedBounds) {
          onLayerContentBoundsChange?.(layerId, committedBounds);
        }
        onStrokeEnd(layerId, null);
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
      invalidateLayer,
      onLayerContentBoundsChange
    ]
  );

  // ─── Wheel zoom ────────────────────────────────────────────────────

  const handleZoomWheel = useCallback(
    (
      event: Pick<WheelEvent, "deltaY" | "clientX" | "clientY" | "preventDefault">
    ) => {
      event.preventDefault();
      const factor = 1.3;
      const delta = event.deltaY > 0 ? 1 / factor : factor;
      const newZoom = Math.max(0.1, Math.min(10, zoom * delta));
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
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

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      handleZoomWheel(e.nativeEvent);
    },
    [handleZoomWheel]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      handleZoomWheel(event);
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, handleZoomWheel]);

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
