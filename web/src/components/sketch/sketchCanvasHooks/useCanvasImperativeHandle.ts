/**
 * useCanvasImperativeHandle
 *
 * Exposes all imperative canvas operations via React ref.
 * This is the public API surface that SketchEditor hooks call.
 */

import { useCallback, useImperativeHandle, type Ref } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { SketchDocument } from "../types";
import { blendModeToComposite } from "../drawingUtils";

export interface UseCanvasImperativeHandleParams {
  ref: Ref<SketchCanvasRef>;
  doc: SketchDocument;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  redraw: () => void;
}

export function useCanvasImperativeHandle({
  ref,
  doc,
  layerCanvasesRef,
  displayCanvasRef,
  overlayCanvasRef,
  getOrCreateLayerCanvas,
  redraw
}: UseCanvasImperativeHandleParams): void {
  const drawLayerToContext = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      layerId: string,
      includeOpacity = true
    ) => {
      const layer = doc.layers.find((item) => item.id === layerId);
      const layerCanvas = layerCanvasesRef.current.get(layerId);
      if (!layer || !layerCanvas) {
        return;
      }

      ctx.save();
      if (includeOpacity) {
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = blendModeToComposite(
          layer.blendMode || "normal"
        );
      }
      ctx.drawImage(
        layerCanvas,
        layer.transform?.x ?? 0,
        layer.transform?.y ?? 0
      );
      ctx.restore();
    },
    [doc.layers, layerCanvasesRef]
  );

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
        const desiredWidth = Math.max(1, doc.canvas.width);
        const desiredHeight = Math.max(1, doc.canvas.height);
        if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
          canvas.width = desiredWidth;
          canvas.height = desiredHeight;
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
      reconcileLayerToDocumentSpace: (layerId: string) => {
        const layer = doc.layers.find((item) => item.id === layerId);
        const canvas = layerCanvasesRef.current.get(layerId);
        if (!layer || !canvas) {
          return null;
        }

        const tx = layer.transform?.x ?? 0;
        const ty = layer.transform?.y ?? 0;
        if (tx === 0 && ty === 0) {
          return canvas.toDataURL("image/png");
        }

        const temp = window.document.createElement("canvas");
        temp.width = doc.canvas.width;
        temp.height = doc.canvas.height;
        const tempCtx = temp.getContext("2d");
        canvas.width = doc.canvas.width;
        canvas.height = doc.canvas.height;
        const ctx = canvas.getContext("2d");
        if (!tempCtx || !ctx) {
          return canvas.toDataURL("image/png");
        }

        tempCtx.drawImage(canvas, tx, ty);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(temp, 0, 0);
        redraw();
        return canvas.toDataURL("image/png");
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
        if (canvas.width !== source.width || canvas.height !== source.height) {
          canvas.width = source.width;
          canvas.height = source.height;
        }
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
          drawLayerToContext(ctx, layer.id);
        }
        return canvas.toDataURL("image/png");
      },
      getMaskDataUrl: () => {
        if (!doc.maskLayerId) {
          return null;
        }
        const canvas = window.document.createElement("canvas");
        canvas.width = doc.canvas.width;
        canvas.height = doc.canvas.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }
        drawLayerToContext(ctx, doc.maskLayerId, false);
        return canvas.toDataURL("image/png");
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
        const lowerCanvas = layerCanvasesRef.current.get(lowerLayerId);
        if (!lowerCanvas) {
          return;
        }
        const lowerCtx = lowerCanvas.getContext("2d");
        if (!lowerCtx) {
          return;
        }
        const upperLayer = doc.layers.find((l) => l.id === upperLayerId);
        const lowerLayer = doc.layers.find((l) => l.id === lowerLayerId);
        const mergedCanvas = window.document.createElement("canvas");
        mergedCanvas.width = doc.canvas.width;
        mergedCanvas.height = doc.canvas.height;
        const mergedCtx = mergedCanvas.getContext("2d");
        if (!mergedCtx) {
          return;
        }
        if (lowerLayer) {
          drawLayerToContext(mergedCtx, lowerLayerId);
        }
        if (upperLayer) {
          drawLayerToContext(mergedCtx, upperLayerId);
        }
        lowerCtx.clearRect(0, 0, lowerCanvas.width, lowerCanvas.height);
        lowerCtx.drawImage(mergedCanvas, 0, 0);
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
          drawLayerToContext(ctx, layer.id);
        }
        return canvas.toDataURL("image/png");
      },
      cropCanvas: (x: number, y: number, width: number, height: number) => {
        for (const [, layerCanvas] of layerCanvasesRef.current) {
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
      fillLayerRect: (layerId: string, x: number, y: number, width: number, height: number, color: string) => {
        const canvas = getOrCreateLayerCanvas(layerId);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.save();
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);
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
    [
      doc,
      getOrCreateLayerCanvas,
      redraw,
      layerCanvasesRef,
      displayCanvasRef,
      overlayCanvasRef,
      drawLayerToContext
    ]
  );
}
