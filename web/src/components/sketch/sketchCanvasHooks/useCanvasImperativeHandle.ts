/**
 * useCanvasImperativeHandle
 *
 * Exposes all imperative canvas operations via React ref.
 * This is the public API surface that SketchEditor hooks call.
 */

import { useImperativeHandle, type Ref } from "react";
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
    [doc, getOrCreateLayerCanvas, redraw, layerCanvasesRef, displayCanvasRef, overlayCanvasRef]
  );
}
