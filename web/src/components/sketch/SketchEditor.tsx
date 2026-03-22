/**
 * SketchEditor
 *
 * Main sketch editor component that composes the canvas, toolbar, and layers panel.
 * Manages the editor state via the sketch store and handles keyboard shortcuts.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import SketchCanvas, { SketchCanvasRef } from "./SketchCanvas";
import SketchCanvasContextMenu from "./SketchCanvasContextMenu";
import SketchToolbar from "./SketchToolbar";
import SketchToolTopBar from "./SketchToolTopBar";
import SketchLayersPanel from "./SketchLayersPanel";
import { useEditorKeyboardShortcuts } from "./useEditorKeyboardShortcuts";
import { useSketchStore } from "./state";
import {
  SketchDocument,
  BlendMode,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_CLONE_STAMP_SETTINGS,
  mergeRgbHexIntoColor,
  isShapeTool
} from "./types";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.grey[900],
    overflow: "hidden"
  });

export interface SketchEditorHandle {
  undo: () => void;
  redo: () => void;
  clearLayer: () => void;
  exportPng: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  mergeDown: () => void;
  flattenVisible: () => void;
}

export interface SketchEditorProps {
  initialDocument?: SketchDocument;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

const SketchEditor = forwardRef<SketchEditorHandle, SketchEditorProps>(function SketchEditor({
  initialDocument,
  onDocumentChange,
  onExportImage,
  onExportMask
}, ref) {
  const theme = useTheme();
  const canvasRef = useRef<SketchCanvasRef>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const adjustmentBaseRef = useRef<HTMLCanvasElement | null>(null);
  const [adjBrightness, setAdjBrightness] = useState(0);
  const [adjContrast, setAdjContrast] = useState(0);
  const [adjSaturation, setAdjSaturation] = useState(0);
  const adjustDebounceRef = useRef<number | null>(null);

  // ─── Store selectors ────────────────────────────────────────────────
  const document = useSketchStore((s) => s.document);
  const activeTool = useSketchStore((s) => s.activeTool);
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const setDocument = useSketchStore((s) => s.setDocument);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setCloneStampSettings = useSketchStore((s) => s.setCloneStampSettings);
  const setZoom = useSketchStore((s) => s.setZoom);
  const setPan = useSketchStore((s) => s.setPan);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const addLayer = useSketchStore((s) => s.addLayer);
  const removeLayer = useSketchStore((s) => s.removeLayer);
  const duplicateLayer = useSketchStore((s) => s.duplicateLayer);
  const reorderLayers = useSketchStore((s) => s.reorderLayers);
  const toggleLayerVisibility = useSketchStore((s) => s.toggleLayerVisibility);
  const setLayerOpacity = useSketchStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useSketchStore((s) => s.setLayerBlendMode);
  const renameLayer = useSketchStore((s) => s.renameLayer);
  const updateLayerData = useSketchStore((s) => s.updateLayerData);
  const setMaskLayer = useSketchStore((s) => s.setMaskLayer);
  const toggleAlphaLock = useSketchStore((s) => s.toggleAlphaLock);
  const toggleLayerExposedInput = useSketchStore((s) => s.toggleLayerExposedInput);
  const toggleLayerExposedOutput = useSketchStore((s) => s.toggleLayerExposedOutput);
  const pushHistory = useSketchStore((s) => s.pushHistory);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);
  const mergeLayerDown = useSketchStore((s) => s.mergeLayerDown);
  const flattenVisible = useSketchStore((s) => s.flattenVisible);
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  const backgroundColor = useSketchStore((s) => s.backgroundColor);
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBackgroundColor = useSketchStore((s) => s.setBackgroundColor);
  const swapColors = useSketchStore((s) => s.swapColors);
  const resetColors = useSketchStore((s) => s.resetColors);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);
  const mirrorX = useSketchStore((s) => s.mirrorX);
  const mirrorY = useSketchStore((s) => s.mirrorY);
  const setMirrorX = useSketchStore((s) => s.setMirrorX);
  const setMirrorY = useSketchStore((s) => s.setMirrorY);
  const resizeCanvas = useSketchStore((s) => s.resizeCanvas);
  const selection = useSketchStore((s) => s.selection);
  const setSelection = useSketchStore((s) => s.setSelection);
  const isolatedLayerId = useSketchStore((s) => s.isolatedLayerId);
  const toggleIsolateLayer = useSketchStore((s) => s.toggleIsolateLayer);

  // Defensively merge defaults so older/incomplete documents cannot break render.
  const toolSettings = {
    brush: { ...DEFAULT_BRUSH_SETTINGS, ...document.toolSettings?.brush },
    pencil: { ...DEFAULT_PENCIL_SETTINGS, ...document.toolSettings?.pencil },
    eraser: { ...DEFAULT_ERASER_SETTINGS, ...document.toolSettings?.eraser },
    shape: { ...DEFAULT_SHAPE_SETTINGS, ...document.toolSettings?.shape },
    fill: { ...DEFAULT_FILL_SETTINGS, ...document.toolSettings?.fill },
    blur: { ...DEFAULT_BLUR_SETTINGS, ...document.toolSettings?.blur },
    gradient: { ...DEFAULT_GRADIENT_SETTINGS, ...document.toolSettings?.gradient },
    cloneStamp: { ...DEFAULT_CLONE_STAMP_SETTINGS, ...document.toolSettings?.cloneStamp }
  };
  const safeForegroundColor = foregroundColor || "#ffffff";
  const safeBackgroundColor = backgroundColor || "#000000";

  // ─── Initialize from prop ───────────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initialDocument && !initializedRef.current) {
      setDocument(initialDocument);
      initializedRef.current = true;
    }
  }, [initialDocument, setDocument]);

  // ─── Autosave on document changes ──────────────────────────────────
  useEffect(() => {
    if (onDocumentChange && initializedRef.current) {
      onDocumentChange(document);
    }
  }, [document, onDocumentChange]);

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
    [updateLayerData, onExportImage, onExportMask]
  );

  // ─── Eyedropper event ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.color) {
        const fg = useSketchStore.getState().foregroundColor;
        const merged = mergeRgbHexIntoColor(detail.color, fg);
        setForegroundColor(merged);
        setBrushSettings({ color: merged });
      }
    };
    window.addEventListener("sketch-eyedropper", handler);
    return () => window.removeEventListener("sketch-eyedropper", handler);
  }, [setBrushSettings, setForegroundColor]);

  // ─── Alt+click eyedropper pick (stays on current tool) ─────────────
  const handleEyedropperPick = useCallback(
    (color: string) => {
      const fg = useSketchStore.getState().foregroundColor;
      const merged = mergeRgbHexIntoColor(color, fg);
      setForegroundColor(merged);
      const tool = activeTool;
      if (tool === "brush") {
        setBrushSettings({ color: merged });
      } else if (tool === "pencil") {
        setPencilSettings({ color: merged });
      } else if (tool === "fill") {
        setFillSettings({ color: merged });
      }
    },
    [
      activeTool,
      setForegroundColor,
      setBrushSettings,
      setPencilSettings,
      setFillSettings
    ]
  );

  // ─── S + drag brush size change ────────────────────────────────────
  const handleBrushSizeChange = useCallback(
    (size: number) => {
      const tool = activeTool;
      if (tool === "brush") {
        setBrushSettings({ size });
      } else if (tool === "pencil") {
        setPencilSettings({ size });
      } else if (tool === "eraser") {
        setEraserSettings({ size });
      } else if (tool === "blur") {
        setBlurSettings({ size });
      } else if (tool === "clone_stamp") {
        setCloneStampSettings({ size });
      } else {
        setBrushSettings({ size });
      }
    },
    [
      activeTool,
      setBrushSettings,
      setPencilSettings,
      setEraserSettings,
      setBlurSettings,
      setCloneStampSettings
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
      canvasRef.current.nudgeLayer(activeLayerId, dx, dy);
      const data = canvasRef.current.getLayerData(activeLayerId);
      updateLayerData(activeLayerId, data);
    },
    [document.activeLayerId, document.layers, pushHistory, updateLayerData]
  );

  // ─── Undo/Redo handlers ────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const entry = undo();
    if (entry && canvasRef.current) {
      for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
        canvasRef.current.setLayerData(layerId, data);
      }
    }
  }, [undo]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry && canvasRef.current) {
      for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
        canvasRef.current.setLayerData(layerId, data);
      }
    }
  }, [redo]);

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
  }, [document.activeLayerId, pushHistory, updateLayerData]);

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
    [document.activeLayerId, document.layers, pushHistory, updateLayerData]
  );

  // ─── Layer operations with undo history ─────────────────────────────
  const handleAddLayer = useCallback(
    (fillColor?: string | null) => {
      pushHistory("add layer");
      const newLayerId = addLayer();
      // Fill the new layer canvas with the specified color.
      // When fillColor is null/undefined, the layer stays transparent (no fill).
      if (fillColor && canvasRef.current) {
        // Use requestAnimationFrame to ensure the layer canvas is created first
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            canvasRef.current.fillLayerWithColor(newLayerId, fillColor);
            const data = canvasRef.current.getLayerData(newLayerId);
            if (data) {
              updateLayerData(newLayerId, data);
            }
          }
        });
      }
    },
    [pushHistory, addLayer, updateLayerData]
  );

  const handleRemoveLayer = useCallback(
    (layerId: string) => {
      pushHistory("remove layer");
      removeLayer(layerId);
    },
    [pushHistory, removeLayer]
  );

  const handleDuplicateLayer = useCallback(
    (layerId: string) => {
      pushHistory("duplicate layer");
      duplicateLayer(layerId);
    },
    [pushHistory, duplicateLayer]
  );

  const handleReorderLayers = useCallback(
    (fromIndex: number, toIndex: number) => {
      pushHistory("reorder layers");
      reorderLayers(fromIndex, toIndex);
    },
    [pushHistory, reorderLayers]
  );

  const handleToggleVisibility = useCallback(
    (layerId: string) => {
      pushHistory("toggle visibility");
      toggleLayerVisibility(layerId);
    },
    [pushHistory, toggleLayerVisibility]
  );

  const handleSetLayerOpacity = useCallback(
    (layerId: string, opacity: number) => {
      pushHistory("change opacity");
      setLayerOpacity(layerId, opacity);
    },
    [pushHistory, setLayerOpacity]
  );

  const handleSetLayerBlendMode = useCallback(
    (layerId: string, blendMode: BlendMode) => {
      pushHistory("change blend mode");
      setLayerBlendMode(layerId, blendMode);
    },
    [pushHistory, setLayerBlendMode]
  );

  const handleRenameLayer = useCallback(
    (layerId: string, name: string) => {
      pushHistory("rename layer");
      renameLayer(layerId, name);
    },
    [pushHistory, renameLayer]
  );

  const handleSetMaskLayer = useCallback(
    (layerId: string | null) => {
      pushHistory("set mask layer");
      setMaskLayer(layerId);
    },
    [pushHistory, setMaskLayer]
  );

  const handleToggleAlphaLock = useCallback(
    (layerId: string) => {
      pushHistory("toggle alpha lock");
      toggleAlphaLock(layerId);
    },
    [pushHistory, toggleAlphaLock]
  );

  const handleToggleExposedInput = useCallback(
    (layerId: string) => {
      toggleLayerExposedInput(layerId);
    },
    [toggleLayerExposedInput]
  );

  const handleToggleExposedOutput = useCallback(
    (layerId: string) => {
      toggleLayerExposedOutput(layerId);
    },
    [toggleLayerExposedOutput]
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
  }, []);

  // ─── Flip active layer ─────────────────────────────────────────────
  const handleFlipHorizontal = useCallback(() => {
    const layerId = document.activeLayerId;
    if (!layerId || !canvasRef.current) {
      return;
    }
    const layer = document.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) {
      return;
    }
    pushHistory("flip horizontal");
    canvasRef.current.flipLayer(layerId, "horizontal");
    const data = canvasRef.current.getLayerData(layerId);
    updateLayerData(layerId, data);
  }, [document.activeLayerId, document.layers, pushHistory, updateLayerData]);

  const handleFlipVertical = useCallback(() => {
    const layerId = document.activeLayerId;
    if (!layerId || !canvasRef.current) {
      return;
    }
    const layer = document.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) {
      return;
    }
    pushHistory("flip vertical");
    canvasRef.current.flipLayer(layerId, "vertical");
    const data = canvasRef.current.getLayerData(layerId);
    updateLayerData(layerId, data);
  }, [document.activeLayerId, document.layers, pushHistory, updateLayerData]);

  // ─── Merge / Flatten ───────────────────────────────────────────────
  const handleMergeDown = useCallback(() => {
    const layers = document.layers;
    const idx = layers.findIndex((l) => l.id === document.activeLayerId);
    if (idx <= 0 || !canvasRef.current) {
      return;
    }
    const upper = layers[idx];
    const lower = layers[idx - 1];
    if (lower.locked) {
      return;
    }
    pushHistory("merge down");
    const mergedData = canvasRef.current.mergeLayerDown(upper.id, lower.id);
    mergeLayerDown(upper.id);
    if (mergedData) {
      updateLayerData(lower.id, mergedData);
    }
  }, [
    document.layers,
    document.activeLayerId,
    pushHistory,
    mergeLayerDown,
    updateLayerData
  ]);

  const handleFlattenVisible = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    pushHistory("flatten visible");
    const flatData = canvasRef.current.flattenVisible();
    flattenVisible();
    // Set the data on the new flattened layer
    const newState = useSketchStore.getState();
    if (newState.document.layers.length > 0 && flatData) {
      updateLayerData(newState.document.layers[0].id, flatData);
      canvasRef.current.setLayerData(newState.document.layers[0].id, flatData);
    }
  }, [pushHistory, flattenVisible, updateLayerData]);

  // ─── Foreground color change (syncs to active tool settings) ──────
  const handleFgColorChange = useCallback(
    (color: string) => {
      setForegroundColor(color);
      if (activeTool === "brush") {
        setBrushSettings({ color });
      } else if (activeTool === "pencil") {
        setPencilSettings({ color });
      } else if (activeTool === "fill") {
        setFillSettings({ color });
      } else if (isShapeTool(activeTool)) {
        setShapeSettings({ strokeColor: color });
      } else if (activeTool === "gradient") {
        setGradientSettings({ startColor: color });
      } else {
        setBrushSettings({ color });
      }
    },
    [
      activeTool,
      setForegroundColor,
      setBrushSettings,
      setPencilSettings,
      setFillSettings,
      setShapeSettings,
      setGradientSettings
    ]
  );

  // ─── Zoom handlers ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => setZoom(zoom * 1.3), [zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(zoom / 1.3), [zoom, setZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan]);

  // ─── Adjustment preview (auto-apply with snapshot) ──────────────
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
        // Restore original and clear base
        if (adjustmentBaseRef.current !== null) {
          canvasRef.current.restoreLayerCanvas(
            layerId,
            adjustmentBaseRef.current
          );
          const data = canvasRef.current.getLayerData(layerId);
          updateLayerData(layerId, data);
          adjustmentBaseRef.current = null;
        }
        return;
      }

      // Save base snapshot on first non-zero call
      if (adjustmentBaseRef.current === null) {
        adjustmentBaseRef.current =
          canvasRef.current.snapshotLayerCanvas(layerId);
        pushHistory("adjustments");
      }

      // Restore from base, then apply adjustments
      if (adjustmentBaseRef.current) {
        canvasRef.current.restoreLayerCanvas(
          layerId,
          adjustmentBaseRef.current
        );
      }
      canvasRef.current.applyAdjustments(brightness, contrast, saturation);
      const data = canvasRef.current.getLayerData(layerId);
      updateLayerData(layerId, data);
    },
    [pushHistory, document.activeLayerId, updateLayerData]
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
      canvasRef.current.restoreLayerCanvas(
        layerId,
        adjustmentBaseRef.current
      );
      const data = canvasRef.current.getLayerData(layerId);
      updateLayerData(layerId, data);
      adjustmentBaseRef.current = null;
    }
    setAdjBrightness(0);
    setAdjContrast(0);
    setAdjSaturation(0);
  }, [document.activeLayerId, updateLayerData]);

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

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEditorKeyboardShortcuts({
    handleUndo,
    handleRedo,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleExportPng,
    handleClearLayer,
    handleFillLayerWithColor,
    handleNudgeLayer,
    setActiveTool,
    setZoom,
    setMirrorX,
    setMirrorY,
    setBrushSettings,
    setPencilSettings,
    setEraserSettings,
    setBlurSettings,
    setCloneStampSettings,
    swapColors,
    resetColors,
    togglePanelsHidden
  });

  // ─── Canvas resize ─────────────────────────────────────────────
  const handleCanvasResize = useCallback(
    (width: number, height: number) => {
      pushHistory("resize canvas");
      resizeCanvas(width, height);
    },
    [pushHistory, resizeCanvas]
  );

  // ─── Context menu ──────────────────────────────────────────────
  const handleContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Crop completion ───────────────────────────────────────────
  const handleCropComplete = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!canvasRef.current) {
        return;
      }
      pushHistory("crop");
      canvasRef.current.cropCanvas(x, y, width, height);
      // Update document dimensions
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
      // Update layer data for all layers
      for (const layer of state.document.layers) {
        const data = canvasRef.current.getLayerData(layer.id);
        updateLayerData(layer.id, data);
      }
    },
    [pushHistory, setDocument, updateLayerData]
  );

  // ─── Imperative handle for modal header actions ─────────────────
  useImperativeHandle(ref, () => ({
    undo: handleUndo,
    redo: handleRedo,
    clearLayer: handleClearLayer,
    exportPng: handleExportPng,
    flipHorizontal: handleFlipHorizontal,
    flipVertical: handleFlipVertical,
    mergeDown: handleMergeDown,
    flattenVisible: handleFlattenVisible
  }), [
    handleUndo, handleRedo, handleClearLayer, handleExportPng,
    handleFlipHorizontal, handleFlipVertical, handleMergeDown, handleFlattenVisible
  ]);

  return (
    <Box className="sketch-editor" css={styles(theme)}>
      {/* SketchToolbar is always rendered (colors must stay visible) */}
      <SketchToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        foregroundColor={safeForegroundColor}
        backgroundColor={safeBackgroundColor}
        onForegroundColorChange={handleFgColorChange}
        onBackgroundColorChange={setBackgroundColor}
        onSwapColors={swapColors}
        onResetColors={resetColors}
      />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!panelsHidden && (
          <SketchToolTopBar
            activeTool={activeTool}
            brushSettings={toolSettings.brush}
            pencilSettings={toolSettings.pencil}
            eraserSettings={toolSettings.eraser}
            shapeSettings={toolSettings.shape}
            fillSettings={toolSettings.fill}
            blurSettings={toolSettings.blur}
            gradientSettings={toolSettings.gradient}
            cloneStampSettings={toolSettings.cloneStamp}
            adjustBrightness={adjBrightness}
            adjustContrast={adjContrast}
            adjustSaturation={adjSaturation}
            onBrushSettingsChange={setBrushSettings}
            onPencilSettingsChange={setPencilSettings}
            onEraserSettingsChange={setEraserSettings}
            onShapeSettingsChange={setShapeSettings}
            onFillSettingsChange={setFillSettings}
            onBlurSettingsChange={setBlurSettings}
            onGradientSettingsChange={setGradientSettings}
            onCloneStampSettingsChange={setCloneStampSettings}
            onAdjustBrightnessChange={setAdjBrightness}
            onAdjustContrastChange={setAdjContrast}
            onAdjustSaturationChange={setAdjSaturation}
            onAdjustReset={handleResetAdjustments}
          />
        )}

        <Box
          className="sketch-editor__canvas-region"
          sx={{ flex: 1, position: "relative", overflow: "hidden" }}
        >
          <SketchCanvas
            ref={canvasRef}
            className="sketch-editor__canvas"
            document={document}
            activeTool={activeTool}
            zoom={zoom}
            pan={pan}
            mirrorX={mirrorX}
            mirrorY={mirrorY}
            isolatedLayerId={isolatedLayerId}
            onZoomChange={setZoom}
            onPanChange={setPan}
            onStrokeStart={handleStrokeStart}
            onStrokeEnd={handleStrokeEnd}
            onBrushSizeChange={handleBrushSizeChange}
            onContextMenu={handleContextMenu}
            onCropComplete={handleCropComplete}
            onEyedropperPick={handleEyedropperPick}
            selection={selection}
            onSelectionChange={setSelection}
          />
        </Box>
      </Box>

      {!panelsHidden && (
        <SketchLayersPanel
          layers={document.layers}
          activeLayerId={document.activeLayerId}
          maskLayerId={document.maskLayerId}
          isolatedLayerId={isolatedLayerId}
          onSelectLayer={setActiveLayer}
          onToggleVisibility={handleToggleVisibility}
          onAddLayer={handleAddLayer}
          onRemoveLayer={handleRemoveLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onReorderLayers={handleReorderLayers}
          onSetMaskLayer={handleSetMaskLayer}
          onToggleAlphaLock={handleToggleAlphaLock}
          onToggleIsolateLayer={toggleIsolateLayer}
          onToggleExposedInput={handleToggleExposedInput}
          onToggleExposedOutput={handleToggleExposedOutput}
          onLayerOpacityChange={handleSetLayerOpacity}
          onLayerBlendModeChange={handleSetLayerBlendMode}
          onRenameLayer={handleRenameLayer}
          onMergeDown={handleMergeDown}
          onFlattenVisible={handleFlattenVisible}
          canvasWidth={document.canvas.width}
          canvasHeight={document.canvas.height}
          onCanvasResize={handleCanvasResize}
        />
      )}

      <SketchCanvasContextMenu
        className="sketch-editor__context-menu"
        open={contextMenu !== null}
        position={contextMenu}
        activeTool={activeTool}
        brushSettings={toolSettings.brush}
        pencilSettings={toolSettings.pencil}
        eraserSettings={toolSettings.eraser}
        shapeSettings={toolSettings.shape}
        fillSettings={toolSettings.fill}
        blurSettings={toolSettings.blur}
        gradientSettings={toolSettings.gradient}
        cloneStampSettings={toolSettings.cloneStamp}
        foregroundColor={safeForegroundColor}
        backgroundColor={safeBackgroundColor}
        canUndo={canUndo()}
        canRedo={canRedo()}
        onClose={handleContextMenuClose}
        onToolChange={setActiveTool}
        onForegroundColorChange={setForegroundColor}
        onBrushSettingsChange={setBrushSettings}
        onPencilSettingsChange={setPencilSettings}
        onEraserSettingsChange={setEraserSettings}
        onShapeSettingsChange={setShapeSettings}
        onFillSettingsChange={setFillSettings}
        onBlurSettingsChange={setBlurSettings}
        onGradientSettingsChange={setGradientSettings}
        onCloneStampSettingsChange={setCloneStampSettings}
        onSwapColors={swapColors}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearLayer={handleClearLayer}
        onExportPng={handleExportPng}
      />
    </Box>
  );
});

export default memo(SketchEditor);
