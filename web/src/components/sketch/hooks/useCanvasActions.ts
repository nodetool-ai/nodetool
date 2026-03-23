/**
 * useCanvasActions
 *
 * Canvas-level handlers: crop, export, clear, fill, nudge, resize, zoom,
 * stroke start/end, and brightness/contrast/saturation adjustments.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { SketchDocument, SketchTool, Point, LayerContentBounds } from "../types";
import { useSketchStore } from "../state";
import { getLayerCompositeOffset } from "../painting";

export interface UseCanvasActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>
  ) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  translateLayer: (layerId: string, dx: number, dy: number) => void;
  setLayerTransform: (layerId: string, transform: Point) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  setDocument: (doc: SketchDocument) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  resizeCanvas: (width: number, height: number) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

export function useCanvasActions({
  canvasRef,
  document,
  activeTool,
  zoom,
  pushHistory,
  updateLayerData,
  translateLayer,
  setLayerTransform,
  setLayerContentBounds,
  setDocument,
  setZoom,
  setPan,
  resizeCanvas,
  onExportImage,
  onExportMask
}: UseCanvasActionsParams) {
  interface PendingStrokeFinalize {
    hasSnapshot: boolean;
    data: string | null;
  }

  interface PendingExportSync {
    image: boolean;
    mask: boolean;
  }

  const pendingStrokeFinalizeRef = useRef<Map<string, PendingStrokeFinalize>>(new Map());
  const pendingExportSyncRef = useRef<PendingExportSync>({ image: false, mask: false });

  const flushPendingStrokeFinalization = useCallback(() => {
    const pendingEntries = Array.from(pendingStrokeFinalizeRef.current.entries());
    pendingStrokeFinalizeRef.current.clear();

    if (pendingEntries.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    for (const [layerId, pending] of pendingEntries) {
      const nextData = pending.hasSnapshot
        ? pending.data
        : canvas?.getLayerData(layerId) ?? null;
      updateLayerData(layerId, nextData);
    }

  }, [canvasRef, updateLayerData]);

  const flushPendingExportSync = useCallback(() => {
    const pending = pendingExportSyncRef.current;
    pendingExportSyncRef.current = { image: false, mask: false };

    if (!pending.image && !pending.mask) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (pending.image && onExportImage) {
      onExportImage(canvas.flattenToDataUrl());
    }
    if (pending.mask && onExportMask) {
      onExportMask(canvas.getMaskDataUrl());
    }
  }, [canvasRef, onExportImage, onExportMask]);

  const flushPendingCanvasSync = useCallback(() => {
    flushPendingStrokeFinalization();
    flushPendingExportSync();
  }, [flushPendingStrokeFinalization, flushPendingExportSync]);

  // ─── Stroke handlers ───────────────────────────────────────────────
  const handleStrokeStart = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    const activeLayerSnapshot =
      activeLayerId && canvasRef.current
        ? canvasRef.current.snapshotLayerCanvas(activeLayerId)
        : null;

    pushHistory(
      `${activeTool} stroke`,
      activeLayerId ? { [activeLayerId]: activeLayerSnapshot } : undefined
    );
  }, [document.activeLayerId, canvasRef, pushHistory, activeTool]);

  const handleStrokeEnd = useCallback(
    (layerId: string, data: string | null) => {
      pendingStrokeFinalizeRef.current.set(layerId, {
        hasSnapshot: data !== null,
        data
      });
      if (onExportImage) {
        pendingExportSyncRef.current.image = true;
      }
      if (onExportMask) {
        pendingExportSyncRef.current.mask = true;
      }
    },
    [onExportImage, onExportMask]
  );

  const handleReconcileLayer = useCallback(
    (layerId: string) => {
      const layer = document.layers.find((entry) => entry.id === layerId);
      if (!layer || !canvasRef.current) {
        return;
      }

      const tx = layer.transform?.x ?? 0;
      const ty = layer.transform?.y ?? 0;
      if (tx === 0 && ty === 0) {
        return;
      }

      const data = canvasRef.current.reconcileLayerToDocumentSpace(layerId);
      setLayerTransform(layerId, { x: 0, y: 0 });
      setLayerContentBounds(layerId, {
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height
      });
      updateLayerData(layerId, data);
    },
    [
      document.layers,
      document.canvas.width,
      document.canvas.height,
      canvasRef,
      setLayerTransform,
      setLayerContentBounds,
      updateLayerData
    ]
  );

  // ─── Clear active layer (or selection area) ────────────────────────
  const handleClearLayer = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    if (!activeLayerId || !canvasRef.current) {
      return;
    }
    const layer = document.layers.find((entry) => entry.id === activeLayerId);
    if (!layer) {
      return;
    }
    const sel = useSketchStore.getState().selection;
    if (sel && sel.width > 0 && sel.height > 0) {
      pushHistory("clear selection");
      const offset = getLayerCompositeOffset(layer, {
        width: Math.max(1, layer.contentBounds?.width ?? document.canvas.width),
        height: Math.max(1, layer.contentBounds?.height ?? document.canvas.height)
      });
      canvasRef.current.clearLayerRect(
        activeLayerId,
        sel.x - offset.x,
        sel.y - offset.y,
        sel.width,
        sel.height
      );
      const data = canvasRef.current.getLayerData(activeLayerId);
      updateLayerData(activeLayerId, data);
    } else {
      pushHistory("clear layer");
      canvasRef.current.clearLayer(activeLayerId);
      updateLayerData(activeLayerId, null);
    }
  }, [
    document.activeLayerId,
    document.layers,
    document.canvas.width,
    document.canvas.height,
    pushHistory,
    updateLayerData,
    canvasRef
  ]);

  // ─── Fill layer with color (respects selection) ─────────────────
  const handleFillLayerWithColor = useCallback(
    (color: string) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!activeLayerId || !canvasRef.current || !layer || layer.locked) {
        return;
      }
      const sel = useSketchStore.getState().selection;
      if (sel && sel.width > 0 && sel.height > 0) {
        pushHistory("fill selection");
        const offset = getLayerCompositeOffset(layer, {
          width: Math.max(1, layer.contentBounds?.width ?? document.canvas.width),
          height: Math.max(1, layer.contentBounds?.height ?? document.canvas.height)
        });
        canvasRef.current.fillLayerRect(
          activeLayerId,
          sel.x - offset.x,
          sel.y - offset.y,
          sel.width,
          sel.height,
          color
        );
      } else {
        pushHistory("fill layer");
        canvasRef.current.fillLayerWithColor(activeLayerId, color);
      }
      const data = canvasRef.current.getLayerData(activeLayerId);
      updateLayerData(activeLayerId, data);
    },
    [
      document.activeLayerId,
      document.layers,
      document.canvas.width,
      document.canvas.height,
      pushHistory,
      updateLayerData,
      canvasRef
    ]
  );

  // ─── Arrow key nudge for active layer ───────────────────────────
  const handleNudgeLayer = useCallback(
    (dx: number, dy: number) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!activeLayerId || !canvasRef.current || !layer || layer.locked) {
        return;
      }
      pushHistory("nudge layer");
      translateLayer(activeLayerId, dx, dy);
      if (canvasRef.current) {
        if (onExportImage) {
          onExportImage(canvasRef.current.flattenToDataUrl());
        }
        if (onExportMask) {
          onExportMask(canvasRef.current.getMaskDataUrl());
        }
      }
    },
    [
      document.activeLayerId,
      document.layers,
      pushHistory,
      translateLayer,
      onExportImage,
      onExportMask,
      canvasRef
    ]
  );

  // ─── Export PNG download ───────────────────────────────────────────
  const handleExportPng = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const dataUrl = canvasRef.current.flattenToDataUrl();
    if (!dataUrl) {
      return;
    }
    const link = window.document.createElement("a");
    link.download = "image-editor-export.png";
    link.href = dataUrl;
    link.click();
  }, [canvasRef]);

  // ─── Canvas resize ─────────────────────────────────────────────
  const handleCanvasResize = useCallback(
    (width: number, height: number) => {
      pushHistory("resize canvas");
      resizeCanvas(width, height);
    },
    [pushHistory, resizeCanvas]
  );

  // ─── Zoom handlers ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => setZoom(zoom * 1.3), [zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(zoom / 1.3), [zoom, setZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan]);

  // ─── Crop completion ───────────────────────────────────────────
  const handleCropComplete = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!canvasRef.current) {
        return;
      }
      pushHistory("crop");
      for (const layer of document.layers) {
        handleReconcileLayer(layer.id);
      }
      canvasRef.current.cropCanvas(x, y, width, height);
      const state = useSketchStore.getState();
      setDocument({
        ...state.document,
        canvas: {
          ...state.document.canvas,
          width,
          height
        },
        metadata: {
          ...state.document.metadata,
          updatedAt: new Date().toISOString()
        }
      });
      for (const layer of state.document.layers) {
        const data = canvasRef.current.getLayerData(layer.id);
        updateLayerData(layer.id, data);
      }
    },
    [pushHistory, setDocument, updateLayerData, canvasRef, document.layers, handleReconcileLayer]
  );

  // ─── Context menu ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Adjustment preview (auto-apply with snapshot) ──────────────
  const adjustmentBaseRef = useRef<HTMLCanvasElement | null>(null);
  const [adjBrightness, setAdjBrightness] = useState(0);
  const [adjContrast, setAdjContrast] = useState(0);
  const [adjSaturation, setAdjSaturation] = useState(0);
  const adjustDebounceRef = useRef<number | null>(null);

  const handleAdjustmentPreview = useCallback(
    (brightness: number, contrast: number, saturation: number) => {
      if (!canvasRef.current) {
        return;
      }
      const layerId = document.activeLayerId;
      if (!layerId) {
        return;
      }
      const allZero = brightness === 0 && contrast === 0 && saturation === 0;
      if (allZero) {
        if (adjustmentBaseRef.current !== null) {
          canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
          const data = canvasRef.current.getLayerData(layerId);
          updateLayerData(layerId, data);
          adjustmentBaseRef.current = null;
        }
        return;
      }
      if (adjustmentBaseRef.current === null) {
        pushHistory("adjustments");
        adjustmentBaseRef.current = canvasRef.current.snapshotLayerCanvas(layerId);
      }
      if (adjustmentBaseRef.current) {
        canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
      }
      canvasRef.current.applyAdjustments(brightness, contrast, saturation);
      const data = canvasRef.current.getLayerData(layerId);
      updateLayerData(layerId, data);
    },
    [
      pushHistory,
      document.activeLayerId,
      updateLayerData,
      canvasRef
    ]
  );

  const handleResetAdjustments = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const layerId = document.activeLayerId;
    if (!layerId) {
      return;
    }
    if (adjustmentBaseRef.current !== null) {
      canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
      const data = canvasRef.current.getLayerData(layerId);
      updateLayerData(layerId, data);
      adjustmentBaseRef.current = null;
    }
    setAdjBrightness(0);
    setAdjContrast(0);
    setAdjSaturation(0);
  }, [document.activeLayerId, updateLayerData, canvasRef]);

  // Auto-apply adjustments with 100ms debounce
  useEffect(() => {
    if (adjustDebounceRef.current !== null) {
      clearTimeout(adjustDebounceRef.current);
    }
    adjustDebounceRef.current = window.setTimeout(() => {
      handleAdjustmentPreview(adjBrightness, adjContrast, adjSaturation);
      adjustDebounceRef.current = null;
    }, 100);
    return () => {
      if (adjustDebounceRef.current !== null) {
        clearTimeout(adjustDebounceRef.current);
      }
    };
  }, [adjBrightness, adjContrast, adjSaturation, handleAdjustmentPreview]);

  return {
    handleStrokeStart,
    handleStrokeEnd,
    flushPendingCanvasSync,
    handleClearLayer,
    handleFillLayerWithColor,
    handleNudgeLayer,
    handleExportPng,
    handleCanvasResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleCropComplete,
    contextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleReconcileLayer,
    adjBrightness,
    adjContrast,
    adjSaturation,
    setAdjBrightness,
    setAdjContrast,
    setAdjSaturation,
    handleResetAdjustments
  };
}
