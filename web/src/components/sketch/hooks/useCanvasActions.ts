/**
 * useCanvasActions
 *
 * Canvas-level handlers: crop, export, clear, fill, nudge, resize, zoom,
 * stroke start/end, and brightness/contrast/saturation adjustments.
 *
 * Internally composes four focused sub-hooks while maintaining the exact
 * same return type and external API.
 *
 * ## State-tier ownership (Package A contract)
 *
 * | Tier                | Owner                           | Description                                               |
 * |---------------------|---------------------------------|-----------------------------------------------------------|
 * | Document state      | Zustand store (documentSlice)   | Serialized layer tree, transforms, effects, metadata.     |
 * | Live layer canvases | Canvas2DRuntime (layerCanvasesRef) | Mutable raster backing; pixels may lead store by 1 frame. |
 * | Preview state       | SketchCanvas React state        | Transient per-gesture transforms for live compositing.    |
 * | History snapshots   | historySlice (pushHistory)      | Frozen layer canvas clones + document structure.          |
 * | Thumbnail sync      | Deferred idle flush (flushLayerThumbnailsWhenIdle) | Writes layer data back to store for panel thumbnails.     |
 * | Export/readback     | syncSketchOutputsNow / flattenToDataUrl | Reads composited output; does not own compositing rules.  |
 *
 * ### Sync rules
 * - **Editing**: Tools write to the live layer canvas via PaintSession or
 *   direct Canvas2D drawing. The store is updated on stroke end (deferred).
 * - **Preview**: Tools set transient preview transforms via
 *   `setLayerTransformPreview`; compositing applies them via the shared
 *   `applyTransformPreviews` contract. Previews never replace document state.
 * - **History**: `handleStrokeStart` captures layer canvas snapshots before
 *   the gesture. `pushHistory` stores them in the undo stack.
 * - **Thumbnail sync**: After stroke end, `flushLayerThumbnailsWhenIdle`
 *   schedules an idle callback to read the layer canvas back to the store.
 * - **Export/readback**: `syncSketchOutputsNow` reads the composited output
 *   through the runtime (which applies effects). It never decides compositing
 *   rules or transform semantics.
 */

import { useCallback, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import {
  type LayerContentBounds,
  type LayerTransform,
  type Point,
  type PushHistoryOptions,
  type SketchDocument,
  type SketchTool
} from "../types";
import { useExportSyncActions } from "./useExportSyncActions";
import { useStrokeLifecycleActions } from "./useStrokeLifecycleActions";
import { useTransformActions } from "./useTransformActions";
import { useCanvasGeometryActions } from "./useCanvasGeometryActions";
import { getLayerGeometry } from "../transform/geometry/layerGeometry";
import { useSketchStore } from "../state";
import { combineMasks, type SelectionCombineOp } from "../selection";

export interface UseCanvasActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  activeTool: SketchTool;
  /** Effective gesture tool (spring-loaded move uses "move" while activeTool may stay "brush"). */
  interactionTool: SketchTool;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  offsetLayerTransform: (layerId: string, dx: number, dy: number) => void;
  commitLayerTransform: (layerId: string, transform: LayerTransform) => void;
  setLayerTransform: (layerId: string, transform: LayerTransform) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  setDocument: (doc: SketchDocument) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  resizeCanvas: (width: number, height: number) => void;
  offsetAllPaintLayersTransform: (dx: number, dy: number) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

export function useCanvasActions({
  canvasRef,
  document,
  activeTool,
  interactionTool,
  pushHistory,
  updateLayerData,
  offsetLayerTransform,
  commitLayerTransform,
  setLayerTransform,
  setLayerContentBounds,
  setDocument,
  setZoom,
  setPan,
  resizeCanvas,
  offsetAllPaintLayersTransform,
  onExportImage,
  onExportMask
}: UseCanvasActionsParams) {
  // ─── Export sync (owns pendingExportSyncRef) ────────────────────
  const exportSync = useExportSyncActions({
    canvasRef,
    onExportImage,
    onExportMask
  });

  // ─── Stroke lifecycle (uses export sync ref for deferred export) ─
  const strokeLifecycle = useStrokeLifecycleActions({
    canvasRef,
    document,
    activeTool,
    interactionTool,
    pushHistory,
    updateLayerData,
    setLayerContentBounds,
    pendingExportSyncRef: exportSync.pendingExportSyncRef,
    onExportImage,
    onExportMask
  });

  // ─── Transform actions (uses syncSketchOutputsNow) ─────────────
  const transformActions = useTransformActions({
    canvasRef,
    document,
    pushHistory,
    updateLayerData,
    offsetLayerTransform,
    commitLayerTransform,
    setLayerTransform,
    setLayerContentBounds,
    syncSketchOutputsNow: exportSync.syncSketchOutputsNow
  });

  // ─── Geometry actions (canvas resize, zoom, crop, etc.) ────────
  const geometryActions = useCanvasGeometryActions({
    canvasRef,
    document,
    pushHistory,
    updateLayerData,
    setDocument,
    setZoom,
    setPan,
    resizeCanvas,
    offsetAllPaintLayersTransform,
    commitPixelLayerChange: strokeLifecycle.commitPixelLayerChange,
    syncPixelLayerFromCanvas: strokeLifecycle.syncPixelLayerFromCanvas,
    reconcileAllLayerTransforms: transformActions.reconcileAllLayerTransforms,
    syncSketchOutputsNow: exportSync.syncSketchOutputsNow
  });

  const handleCropCommit = useCallback(() => {
    canvasRef.current?.commitPendingCrop();
  }, [canvasRef]);

  const handleCropCancelPreview = useCallback(() => {
    canvasRef.current?.cancelActiveTool();
  }, [canvasRef]);

  // ─── Load layer alpha as selection mask ────────────────────────
  // `op` defaults to "replace" (Ctrl/Cmd + click). Pass "add" to union with
  // the current selection (Ctrl/Cmd + Shift + click).
  const handleLoadLayerAsSelection = useCallback(
    (layerId: string, op: SelectionCombineOp = "replace") => {
      const layer = document.layers.find((l) => l.id === layerId);
      if (!layer || layer.type === "group") return;
      const snapshot = canvasRef.current?.snapshotLayerCanvas(layerId);
      if (!snapshot) return;

      const tmpCtx = snapshot.getContext("2d", { willReadFrequently: true });
      if (!tmpCtx) return;

      const { width: docW, height: docH } = document.canvas;
      const offset = getLayerGeometry(layer, snapshot, {
        width: snapshot.width,
        height: snapshot.height
      }).compositeOffset;
      const imgData = tmpCtx.getImageData(0, 0, snapshot.width, snapshot.height);
      const selData = new Uint8ClampedArray(docW * docH);

      for (let py = 0; py < snapshot.height; py++) {
        for (let px = 0; px < snapshot.width; px++) {
          const alpha = imgData.data[(py * snapshot.width + px) * 4 + 3];
          if (alpha > 0) {
            const docX = Math.round(px + offset.x);
            const docY = Math.round(py + offset.y);
            if (docX >= 0 && docX < docW && docY >= 0 && docY < docH) {
              selData[docY * docW + docX] = alpha;
            }
          }
        }
      }

      const overlay = { width: docW, height: docH, data: selData };
      const store = useSketchStore.getState();
      const next =
        op === "replace"
          ? overlay
          : combineMasks(store.selection, overlay, op);
      store.setSelection(next);
    },
    [document, canvasRef]
  );

  // ─── Combined flush (stroke finalization + export sync) ─────────
  const flushPendingCanvasSync = useCallback(() => {
    strokeLifecycle.flushPendingStrokeFinalization();
    exportSync.flushPendingExportSync();
  }, [strokeLifecycle, exportSync]);

  return {
    handleStrokeStart: strokeLifecycle.handleStrokeStart,
    handleStrokeEnd: strokeLifecycle.handleStrokeEnd,
    flushPendingCanvasSync,
    syncSketchOutputsNow: exportSync.syncSketchOutputsNow,
    flushLayerThumbnailsWhenIdle: strokeLifecycle.flushLayerThumbnailsWhenIdle,
    handleClearLayer: geometryActions.handleClearLayer,
    handleFillLayerWithColor: geometryActions.handleFillLayerWithColor,
    handleCommitLayerTransform: transformActions.handleCommitLayerTransform,
    handleNudgeLayer: transformActions.handleNudgeLayer,
    handleTrimLayerToBounds: geometryActions.handleTrimLayerToBounds,
    handleExportPng: exportSync.handleExportPng,
    handleCanvasResize: geometryActions.handleCanvasResize,
    handleCanvasResizeStart: geometryActions.handleCanvasResizeStart,
    handleCanvasResizeDrag: geometryActions.handleCanvasResizeDrag,
    handleZoomIn: geometryActions.handleZoomIn,
    handleZoomOut: geometryActions.handleZoomOut,
    handleZoomFit: geometryActions.handleZoomFit,
    handleCropComplete: geometryActions.handleCropComplete,
    handleCropCommit,
    handleCropCancelPreview,
    handleCropCanvasToActiveLayerVisiblePixels:
      geometryActions.handleCropCanvasToActiveLayerVisiblePixels,
    handleCropCanvasToActiveLayerExtents:
      geometryActions.handleCropCanvasToActiveLayerExtents,
    handleCropCanvasToSelection: geometryActions.handleCropCanvasToSelection,
    contextMenu: geometryActions.contextMenu,
    handleContextMenu: geometryActions.handleContextMenu,
    handleContextMenuClose: geometryActions.handleContextMenuClose,
    transformContextMenu: geometryActions.transformContextMenu,
    handleTransformContextMenu: geometryActions.handleTransformContextMenu,
    handleTransformContextMenuClose: geometryActions.handleTransformContextMenuClose,
    handleCopy: geometryActions.handleCopy,
    handleCut: geometryActions.handleCut,
    handlePaste: geometryActions.handlePaste,
    handlePasteAsNewLayer: geometryActions.handlePasteAsNewLayer,
    handleDropImage: geometryActions.handleDropImage,
    handleDropAsset: geometryActions.handleDropAsset,
    adjBrightness: geometryActions.adjBrightness,
    adjContrast: geometryActions.adjContrast,
    adjSaturation: geometryActions.adjSaturation,
    setAdjBrightness: geometryActions.setAdjBrightness,
    setAdjContrast: geometryActions.setAdjContrast,
    setAdjSaturation: geometryActions.setAdjSaturation,
    handleApplyAdjustments: geometryActions.handleApplyAdjustments,
    handleCancelAdjustments: geometryActions.handleCancelAdjustments,
    handleInvertLayerColors: geometryActions.handleInvertLayerColors,
    saveTransformOriginal: transformActions.saveTransformOriginal,
    prepareSelectionFreeTransform: transformActions.prepareSelectionFreeTransform,
    handleTransformCommit: transformActions.handleTransformCommit,
    handleTransformCancel: transformActions.handleTransformCancel,
    handleTransformReset: transformActions.handleTransformReset,
    handleTransformUndo: transformActions.handleTransformUndo,
    handleTransformRedo: transformActions.handleTransformRedo,
    handleTransformRotate: transformActions.handleTransformRotate,
    handleTransformFlipH: transformActions.handleTransformFlipH,
    handleTransformFlipV: transformActions.handleTransformFlipV,
    handleRepeatLastTransform: transformActions.handleRepeatLastTransform,
    handleRepeatLastTransformOnCopy:
      transformActions.handleRepeatLastTransformOnCopy,
    handleLoadLayerAsSelection
  };
}
