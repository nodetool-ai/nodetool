/**
 * useCanvasActions
 *
 * Canvas-level handlers: crop, export, clear, fill, nudge, resize, zoom,
 * stroke start/end, and brightness/contrast/saturation adjustments.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { SketchDocument, SketchTool, Point } from "../types";
import { useSketchStore } from "../state";

export interface UseCanvasActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pushHistory: (label: string) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
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
  setDocument,
  setZoom,
  setPan,
  resizeCanvas,
  onExportImage,
  onExportMask
}: UseCanvasActionsParams) {
  // ─── Stroke handlers ───────────────────────────────────────────────
  const handleStrokeStart = useCallback(() => {
    pushHistory(`${activeTool} stroke`);
  }, [pushHistory, activeTool]);

  const handleStrokeEnd = useCallback(
    (layerId: string, data: string | null) => {
      updateLayerData(layerId, data);
      if (canvasRef.current) {
        if (onExportImage) {
          onExportImage(canvasRef.current.flattenToDataUrl());
        }
        if (onExportMask) {
          onExportMask(canvasRef.current.getMaskDataUrl());
        }
      }
    },
    [updateLayerData, onExportImage, onExportMask, canvasRef]
  );

  // ─── Clear active layer (or selection area) ────────────────────────
  const handleClearLayer = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    if (!activeLayerId || !canvasRef.current) {
      return;
    }
    const sel = useSketchStore.getState().selection;
    if (sel && sel.width > 0 && sel.height > 0) {
      pushHistory("clear selection");
      canvasRef.current.clearLayerRect(
        activeLayerId,
        sel.x,
        sel.y,
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
  }, [document.activeLayerId, pushHistory, updateLayerData, canvasRef]);

  // ─── Fill layer with color ─────────────────────────────────────────
  const handleFillLayerWithColor = useCallback(
    (color: string) => {
      const activeLayerId = document.activeLayerId;
      const layer = document.layers.find((l) => l.id === activeLayerId);
      if (!activeLayerId || !canvasRef.current || !layer || layer.locked) {
        return;
      }
      pushHistory("fill layer");
      canvasRef.current.fillLayerWithColor(activeLayerId, color);
      const data = canvasRef.current.getLayerData(activeLayerId);
      updateLayerData(activeLayerId, data);
    },
    [document.activeLayerId, document.layers, pushHistory, updateLayerData, canvasRef]
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
      canvasRef.current.nudgeLayer(activeLayerId, dx, dy);
      const data = canvasRef.current.getLayerData(activeLayerId);
      updateLayerData(activeLayerId, data);
    },
    [document.activeLayerId, document.layers, pushHistory, updateLayerData, canvasRef]
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
    link.download = "sketch-export.png";
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
    [pushHistory, setDocument, updateLayerData, canvasRef]
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
        adjustmentBaseRef.current = canvasRef.current.snapshotLayerCanvas(layerId);
        pushHistory("adjustments");
      }
      if (adjustmentBaseRef.current) {
        canvasRef.current.restoreLayerCanvas(layerId, adjustmentBaseRef.current);
      }
      canvasRef.current.applyAdjustments(brightness, contrast, saturation);
      const data = canvasRef.current.getLayerData(layerId);
      updateLayerData(layerId, data);
    },
    [pushHistory, document.activeLayerId, updateLayerData, canvasRef]
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
    adjBrightness,
    adjContrast,
    adjSaturation,
    setAdjBrightness,
    setAdjContrast,
    setAdjSaturation,
    handleResetAdjustments
  };
}
