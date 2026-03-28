/**
 * useCanvasImperativeHandle
 *
 * Exposes all imperative canvas operations via React ref.
 * This is the public API surface that SketchEditor hooks call.
 *
 * After runtime-seam refactor: delegates layer operations and readback
 * to the SketchRuntime instead of manipulating Canvas2D directly.
 */

import { useImperativeHandle, type Ref } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { LayerContentBounds, Selection, SketchDocument } from "../types";
import type { SketchRuntime } from "../rendering";

export interface UseCanvasImperativeHandleParams {
  ref: Ref<SketchCanvasRef>;
  doc: SketchDocument;
  /** The rendering runtime that owns layer storage and compositing. */
  runtime: SketchRuntime;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  redraw: () => void;
  drainPendingStrokeCommit: () => void;
}

export function useCanvasImperativeHandle({
  ref,
  doc,
  runtime,
  displayCanvasRef,
  overlayCanvasRef,
  redraw,
  drainPendingStrokeCommit
}: UseCanvasImperativeHandleParams): void {
  useImperativeHandle(
    ref,
    () => ({
      getLayerData: (layerId: string) => {
        return runtime.getLayerData(layerId);
      },
      setLayerData: (
        layerId: string,
        data: string | null,
        boundsOverride?: LayerContentBounds
      ) => {
        const layer = doc.layers.find((entry) => entry.id === layerId);
        const bounds =
          boundsOverride ?? {
            x: layer?.contentBounds?.x ?? 0,
            y: layer?.contentBounds?.y ?? 0,
            width: Math.max(1, layer?.contentBounds?.width ?? doc.canvas.width),
            height: Math.max(1, layer?.contentBounds?.height ?? doc.canvas.height)
          };
        runtime.setLayerData(layerId, data, bounds, () => redraw());
      },
      reconcileLayerToDocumentSpace: (layerId: string) => {
        const result = runtime.reconcileLayerToDocumentSpace(layerId, doc);
        if (result !== null) {
          redraw();
        }
        return result;
      },
      trimLayerToBounds: (layerId: string) => {
        const result = runtime.trimLayerToBounds(layerId);
        if (result !== null) {
          redraw();
        }
        return result;
      },
      snapshotLayerCanvas: (layerId: string) => {
        return runtime.snapshotLayerCanvas(layerId);
      },
      restoreLayerCanvas: (
        layerId: string,
        source: HTMLCanvasElement
      ) => {
        runtime.restoreLayerCanvas(layerId, source);
        redraw();
      },
      flattenToDataUrl: () => {
        return runtime.flattenToDataUrl(doc);
      },
      getMaskDataUrl: () => {
        return runtime.getMaskDataUrl(doc);
      },
      clearLayer: (layerId: string) => {
        runtime.clearLayer(layerId);
        redraw();
      },
      clearLayerRect: (
        layerId: string,
        x: number,
        y: number,
        width: number,
        height: number
      ) => {
        runtime.clearLayerRect(layerId, x, y, width, height);
        redraw();
      },
      flipLayer: (layerId: string, direction: "horizontal" | "vertical") => {
        runtime.flipLayer(layerId, direction);
        redraw();
      },
      mergeLayerDown: (upperLayerId: string, lowerLayerId: string) => {
        const result = runtime.mergeLayerDown(upperLayerId, lowerLayerId, doc);
        redraw();
        return result;
      },
      flattenVisible: () => {
        return runtime.flattenVisible(doc);
      },
      cropCanvas: (x: number, y: number, width: number, height: number) => {
        runtime.cropLayers(x, y, width, height);
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
        runtime.applyAdjustments(doc, brightness, contrast, saturation);
        redraw();
      },
      fillLayerWithColor: (layerId: string, color: string) => {
        runtime.fillLayerWithColor(layerId, color);
        redraw();
      },
      fillLayerRect: (layerId: string, x: number, y: number, width: number, height: number, color: string) => {
        runtime.fillLayerRect(layerId, x, y, width, height, color);
        redraw();
      },
      clearLayerBySelectionMask: (
        layerId: string,
        offsetX: number,
        offsetY: number,
        mask: Selection
      ) => {
        runtime.clearLayerBySelectionMask(layerId, offsetX, offsetY, mask);
        redraw();
      },
      fillLayerBySelectionMask: (
        layerId: string,
        offsetX: number,
        offsetY: number,
        mask: Selection,
        color: string
      ) => {
        runtime.fillLayerBySelectionMask(
          layerId,
          offsetX,
          offsetY,
          mask,
          color
        );
        redraw();
      },
      nudgeLayer: (layerId: string, dx: number, dy: number) => {
        runtime.nudgeLayer(layerId, dx, dy);
        redraw();
      },
      redrawDisplay: () => {
        redraw();
      },
      drainPendingStrokeCommit: () => {
        drainPendingStrokeCommit();
      },
      getOverlayCanvas: () => {
        return overlayCanvasRef.current;
      }
    }),
    [
      doc,
      runtime,
      redraw,
      drainPendingStrokeCommit,
      displayCanvasRef,
      overlayCanvasRef
    ]
  );
}
