/**
 * usePointerHandlerUtils
 *
 * Utility callbacks and canvas-state refs shared by the pointer handlers:
 * - Coordinate transform (screenToCanvas)
 * - Mirror / symmetry drawing helper (withMirror)
 * - Color helpers (rgbToHex)
 * - Selection clipping (clipSelectionForOffset)
 * - Layer helpers (ensureLayerViewportStorage, getLayerPaintOffset)
 * - Clone stamp helpers (getCloneSourceSignature, buildCloneSourceCanvas, drawCloneStampStroke)
 * - Blur helper (drawBlurStroke)
 * - Active-stroke preview (drawActiveStrokePreview)
 *
 * Also owns the refs that are tightly coupled to these helpers:
 *   cloneSourceRef, cloneOffsetRef, clonePaintOffsetRef,
 *   cloneSourceCanvasRef, cloneSourceCanvasMetaRef,
 *   blurTempCanvasesRef, strokeDirtyRectRef
 */

import { useCallback, useRef } from "react";
import type {
  SketchDocument,
  Point,
  Selection,
  BlurSettings,
  CloneStampSettings
} from "../types";
import {
  drawBlurStroke as drawBlurStrokeUtil,
  drawCloneStampStroke as drawCloneStampStrokeUtil,
  blendModeToComposite
} from "../drawingUtils";
import type { BlurTempCanvases } from "../drawingUtils";
import type { ActiveStrokeInfo } from "./useCompositing";
import type { ToolContext } from "../tools/types";
import {
  ensureLayerRasterBounds,
  getCanvasRasterBounds,
  getDocumentViewportLayerBounds,
  getLayerCompositeOffset
} from "../painting";

export interface UsePointerHandlerUtilsParams {
  zoom: number;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  mirrorX: boolean;
  mirrorY: boolean;
  symmetryMode: string;
  symmetryRays: number;
  doc: SketchDocument;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  selection?: Selection | null;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer: (layerId: string) => void;
  onLayerContentBoundsChange?: (
    layerId: string,
    contentBounds: { x: number; y: number; width: number; height: number }
  ) => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function usePointerHandlerUtils({
  zoom,
  displayCanvasRef,
  overlayCanvasRef,
  activeStrokeRef,
  mirrorX,
  mirrorY,
  symmetryMode,
  symmetryRays,
  doc,
  layerCanvasesRef,
  selection,
  getOrCreateLayerCanvas,
  invalidateLayer,
  onLayerContentBoundsChange
}: UsePointerHandlerUtilsParams) {
  // ─── Clone stamp state refs ────────────────────────────────────────
  const cloneSourceRef = useRef<Point | null>(null);
  const cloneOffsetRef = useRef<Point | null>(null);
  const clonePaintOffsetRef = useRef<Point | null>(null);
  const cloneSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cloneSourceCanvasMetaRef = useRef<{
    activeLayerId: string;
    sampling: CloneStampSettings["sampling"];
    signature: string;
  } | null>(null);

  // ─── Performance: reusable blur canvases ──────────────────────────
  const blurTempCanvasesRef = useRef<BlurTempCanvases>({
    tmp: null,
    blurred: null,
    mask: null
  });

  // ─── Stroke dirty rect for paint tools ────────────────────────────
  const strokeDirtyRectRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);

  // ─── Coordinate transform ──────────────────────────────────────────
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

  // ─── Mirror / Symmetry drawing helper ─────────────────────────────
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
          const step = (2 * Math.PI) / symmetryRays;
          for (let i = 1; i < symmetryRays; i++) {
            const angle = step * i;
            drawBranch(rotatePoint(from, angle), rotatePoint(to, angle));
          }
          break;
        }
        case "mandala": {
          const mStep = (2 * Math.PI) / symmetryRays;
          for (let i = 1; i < symmetryRays; i++) {
            const angle = mStep * i;
            drawBranch(rotatePoint(from, angle), rotatePoint(to, angle));
          }
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

  // ─── Color helpers ─────────────────────────────────────────────────
  const rgbToHex = useCallback(
    (r: number, g: number, b: number): string =>
      `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`,
    []
  );

  // ─── Selection clipping ────────────────────────────────────────────
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

  // ─── Layer helpers ─────────────────────────────────────────────────
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

  // ─── Clone stamp helpers ───────────────────────────────────────────
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

  // ─── Active-stroke preview ─────────────────────────────────────────
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

  return {
    // Clone stamp state refs
    cloneSourceRef,
    cloneOffsetRef,
    clonePaintOffsetRef,
    cloneSourceCanvasRef,
    cloneSourceCanvasMetaRef,
    // Shared stroke tracking refs
    strokeDirtyRectRef,
    blurTempCanvasesRef,
    // Callbacks
    screenToCanvas,
    withMirror,
    rgbToHex,
    clipSelectionForOffset,
    ensureLayerViewportStorage,
    getLayerPaintOffset,
    getCloneSourceSignature,
    buildCloneSourceCanvas,
    drawBlurStroke,
    drawCloneStampStroke,
    drawActiveStrokePreview
  };
}
