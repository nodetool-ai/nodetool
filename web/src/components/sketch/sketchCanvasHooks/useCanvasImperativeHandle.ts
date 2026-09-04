/**
 * useCanvasImperativeHandle
 *
 * Exposes all imperative canvas operations via React ref.
 * This is the public API surface that SketchEditor hooks call.
 *
 * After runtime-seam refactor: delegates layer operations and readback
 * to the SketchRuntime instead of manipulating Canvas2D directly.
 */

import {
  useImperativeHandle,
  type MutableRefObject,
  type Ref
} from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { LayerContentBounds, Point, Selection, SketchDocument } from "../types";
import type { SketchRuntime } from "../rendering";
import { paintAgentStroke } from "../painting/agentStrokes";
import type {
  AgentStrokeOutcome,
  AgentStrokeRequest
} from "../painting/agentStrokes";
import type { PaintSurface } from "@nodetool-ai/image-editor/painting.js";
import { useSketchStore } from "../state/useSketchStore";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import { getCanvasRasterBounds } from "../transform/geometry/layerGeometry";

export interface UseCanvasImperativeHandleParams {
  ref: Ref<SketchCanvasRef> | undefined;
  doc: SketchDocument;
  /** The rendering runtime that owns layer storage and compositing. */
  runtime: SketchRuntime;
  /** Scrolling viewport that clips the artboard (used for fit-to-screen). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  redraw: () => void;
  drainPendingStrokeCommit: () => void;
  zoom: number;
  lastPointerClientRef: MutableRefObject<{ x: number; y: number } | null>;
  cancelActiveTool: () => void;
  commitPendingCrop: () => void;
}

export function useCanvasImperativeHandle({
  ref,
  doc,
  runtime,
  containerRef,
  displayCanvasRef,
  overlayCanvasRef,
  redraw,
  drainPendingStrokeCommit,
  zoom,
  lastPointerClientRef,
  cancelActiveTool,
  commitPendingCrop
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
      rotateLayer180: (layerId: string) => {
        runtime.rotateLayer180(layerId);
        redraw();
      },
      mergeLayerDown: (upperLayerId: string, lowerLayerId: string) => {
        // Read the live document directly: when "Merge Selected" runs a
        // synchronous chain of pairwise merges, each iteration mutates the
        // store before the next call, but the imperative handle's `doc`
        // closure is still the snapshot from the previous render — using it
        // makes drawLayerToContext composite with stale contentBounds and
        // visually drops or clips the in-between layers' pixels.
        const liveDoc = useSketchStore.getState().document;
        const result = runtime.mergeLayerDown(upperLayerId, lowerLayerId, liveDoc);
        redraw();
        return result;
      },
      flattenVisible: () => {
        const liveDoc = useSketchStore.getState().document;
        return runtime.flattenVisible(liveDoc);
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
      invertLayerColors: (selection?: { width: number; height: number; data: Uint8ClampedArray; originX?: number; originY?: number } | null) => {
        runtime.invertLayerColors(doc, selection);
        redraw();
      },
      fillLayerWithColor: (layerId: string, color: string) => {
        runtime.fillLayerWithColor(layerId, color);
        redraw();
      },
      mutateLayerPixels: (layerId, mutate) => {
        const liveDoc = useSketchStore.getState().document;
        const layer = liveDoc.layers.find((entry) => entry.id === layerId);
        const canvas = runtime.getOrCreateLayerCanvas(
          layerId,
          Math.max(1, layer?.contentBounds.width || liveDoc.canvas.width),
          Math.max(1, layer?.contentBounds.height || liveDoc.canvas.height)
        );
        mutate(canvas);
        runtime.invalidateLayer(layerId);
        redraw();
      },
      sampleComposite: (x, y) => {
        const liveDoc = useSketchStore.getState().document;
        const image = runtime.readbackComposite(liveDoc, null, null);
        if (!image) {
          return null;
        }
        const px = Math.round(x);
        const py = Math.round(y);
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
          return null;
        }
        const i = (py * image.width + px) * 4;
        return {
          r: image.data[i],
          g: image.data[i + 1],
          b: image.data[i + 2],
          a: image.data[i + 3]
        };
      },
      sampleLayer: (layerId, x, y) => {
        const canvas = runtime.getLayerCanvas(layerId);
        if (!canvas) {
          return null;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }
        const liveDoc = useSketchStore.getState().document;
        const layer = liveDoc.layers.find((entry) => entry.id === layerId);
        const local = layer
          ? new CoordinateMapper({
              layerTransform: layer.transform,
              rasterBounds: getCanvasRasterBounds(canvas) ?? layer.contentBounds
            }).docToLayer({ x, y })
          : { x, y };
        const px = Math.round(local.x);
        const py = Math.round(local.y);
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
          return null;
        }
        const image = ctx.getImageData(px, py, 1, 1);
        return {
          r: image.data[0],
          g: image.data[1],
          b: image.data[2],
          a: image.data[3]
        };
      },
      paintStrokes: (strokes: readonly AgentStrokeRequest[]) => {
        // Read live state, not the render closure: a batch can follow an edit
        // made earlier in the same tick, when the store is already ahead of
        // `doc`. Same reason `mergeLayerDown` reads the store below.
        const state = useSketchStore.getState();
        const liveDoc = state.document;
        const stampCache = new Map<string, PaintSurface>();
        const outcomes: AgentStrokeOutcome[] = [];
        const touched = new Set<string>();

        for (const stroke of strokes) {
          const layer = liveDoc.layers.find((l) => l.id === stroke.layerId);
          if (!layer) {
            throw new Error(
              `Layer not found in the document: ${stroke.layerId}`
            );
          }
          outcomes.push(
            paintAgentStroke({
              stroke,
              layer,
              layerCanvas: runtime.getOrCreateLayerCanvas(
                layer.id,
                Math.max(1, layer.contentBounds.width || liveDoc.canvas.width),
                Math.max(1, layer.contentBounds.height || liveDoc.canvas.height)
              ),
              toolSettings: state.toolSettings,
              foregroundColor: state.foregroundColor,
              canvasSize: liveDoc.canvas,
              stampCache
            })
          );
          touched.add(layer.id);
        }

        // Tell the runtime the CPU pixels moved (WebGPU re-uploads the layer
        // texture here) and composite, so the user sees the strokes appear.
        for (const layerId of touched) {
          runtime.invalidateLayer(layerId);
        }
        redraw();
        return outcomes;
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
      },
      getPasteAnchorDocumentPoint: (): Point | null => {
        const client = lastPointerClientRef.current;
        const display = displayCanvasRef.current;
        if (!client || !display || zoom <= 0) {
          return null;
        }
        const rect = display.getBoundingClientRect();
        const dx = (client.x - rect.left) / zoom;
        const dy = (client.y - rect.top) / zoom;
        return { x: Math.floor(dx), y: Math.floor(dy) };
      },
      cancelActiveTool,
      commitPendingCrop,
      getLayerCanvas: (layerId: string): HTMLCanvasElement | null => {
        return runtime.getLayerCanvas(layerId) ?? null;
      },
      getViewportSize: (): { width: number; height: number } | null => {
        const container = containerRef.current;
        if (!container) {
          return null;
        }
        return {
          width: container.clientWidth,
          height: container.clientHeight
        };
      },
      getViewportElement: (): HTMLElement | null => containerRef.current
    }),
    [
      doc,
      runtime,
      redraw,
      drainPendingStrokeCommit,
      containerRef,
      displayCanvasRef,
      overlayCanvasRef,
      zoom,
      lastPointerClientRef,
      cancelActiveTool,
      commitPendingCrop
    ]
  );
}
