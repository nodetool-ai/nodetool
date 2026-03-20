/**
 * SketchEditor
 *
 * Main sketch editor component that composes the canvas, toolbar, and layers panel.
 * Manages the editor state via the sketch store and handles keyboard shortcuts.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import SketchCanvas, { SketchCanvasRef } from "./SketchCanvas";
import SketchToolbar from "./SketchToolbar";
import SketchLayersPanel from "./SketchLayersPanel";
import { useSketchStore } from "./state";
import { SketchDocument } from "./types";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.grey[900],
    overflow: "hidden"
  });

export interface SketchEditorProps {
  initialDocument?: SketchDocument;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

const SketchEditor: React.FC<SketchEditorProps> = ({
  initialDocument,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const theme = useTheme();
  const canvasRef = useRef<SketchCanvasRef>(null);
  const [mirrorX, setMirrorX] = useState(false);
  const [mirrorY, setMirrorY] = useState(false);

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
        setBrushSettings({ color: detail.color });
        setActiveTool("brush");
      }
    };
    window.addEventListener("sketch-eyedropper", handler);
    return () => window.removeEventListener("sketch-eyedropper", handler);
  }, [setBrushSettings, setActiveTool]);

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

  // ─── Clear active layer ────────────────────────────────────────────
  const handleClearLayer = useCallback(() => {
    const activeLayerId = document.activeLayerId;
    if (activeLayerId && canvasRef.current) {
      pushHistory("clear layer");
      canvasRef.current.clearLayer(activeLayerId);
      updateLayerData(activeLayerId, null);
    }
  }, [document.activeLayerId, pushHistory, updateLayerData]);

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
    if (!layerId || !canvasRef.current) { return; }
    const layer = document.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) { return; }
    pushHistory("flip horizontal");
    canvasRef.current.flipLayer(layerId, "horizontal");
    const data = canvasRef.current.getLayerData(layerId);
    updateLayerData(layerId, data);
  }, [document.activeLayerId, document.layers, pushHistory, updateLayerData]);

  const handleFlipVertical = useCallback(() => {
    const layerId = document.activeLayerId;
    if (!layerId || !canvasRef.current) { return; }
    const layer = document.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) { return; }
    pushHistory("flip vertical");
    canvasRef.current.flipLayer(layerId, "vertical");
    const data = canvasRef.current.getLayerData(layerId);
    updateLayerData(layerId, data);
  }, [document.activeLayerId, document.layers, pushHistory, updateLayerData]);

  // ─── Merge / Flatten ───────────────────────────────────────────────
  const handleMergeDown = useCallback(() => {
    const layers = document.layers;
    const idx = layers.findIndex((l) => l.id === document.activeLayerId);
    if (idx <= 0 || !canvasRef.current) { return; }
    const upper = layers[idx];
    const lower = layers[idx - 1];
    if (lower.locked) { return; }
    pushHistory("merge down");
    const mergedData = canvasRef.current.mergeLayerDown(upper.id, lower.id);
    mergeLayerDown(upper.id);
    if (mergedData) {
      updateLayerData(lower.id, mergedData);
    }
  }, [document.layers, document.activeLayerId, pushHistory, mergeLayerDown, updateLayerData]);

  const handleFlattenVisible = useCallback(() => {
    if (!canvasRef.current) { return; }
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

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  // Capture phase handler prevents shortcuts from reaching the node editor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Prevent sketch shortcuts from bleeding to node editor
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
        if (e.key === "y") {
          e.preventDefault();
          handleRedo();
        }
        if (e.key === "0") {
          e.preventDefault();
          handleZoomReset();
        }
        if (e.key === "s") {
          e.preventDefault();
          handleExportPng();
        }
      } else {
        switch (e.key) {
          case "b": setActiveTool("brush"); break;
          case "p": setActiveTool("pencil"); break;
          case "e": setActiveTool("eraser"); break;
          case "i": setActiveTool("eyedropper"); break;
          case "g": setActiveTool("fill"); break;
          case "l": setActiveTool("line"); break;
          case "r": setActiveTool("rectangle"); break;
          case "o": setActiveTool("ellipse"); break;
          case "a": setActiveTool("arrow"); break;
          case "m": setMirrorX((prev) => !prev); break;
          case "v": setActiveTool("move"); break;
          case "x": swapColors(); break;
          case "d": resetColors(); break;
          case "Tab":
            e.preventDefault();
            togglePanelsHidden();
            break;
          case "[": {
            const store = useSketchStore.getState();
            const tool = store.activeTool;
            if (tool === "brush") {
              const newSize = Math.max(1, store.document.toolSettings.brush.size - 5);
              setBrushSettings({ size: newSize });
            } else if (tool === "pencil") {
              const newSize = Math.max(1, store.document.toolSettings.pencil.size - 1);
              setPencilSettings({ size: newSize });
            } else if (tool === "eraser") {
              const newSize = Math.max(1, store.document.toolSettings.eraser.size - 5);
              setEraserSettings({ size: newSize });
            }
            break;
          }
          case "]": {
            const store = useSketchStore.getState();
            const tool = store.activeTool;
            if (tool === "brush") {
              const newSize = Math.min(200, store.document.toolSettings.brush.size + 5);
              setBrushSettings({ size: newSize });
            } else if (tool === "pencil") {
              const newSize = Math.min(10, store.document.toolSettings.pencil.size + 1);
              setPencilSettings({ size: newSize });
            } else if (tool === "eraser") {
              const newSize = Math.min(200, store.document.toolSettings.eraser.size + 5);
              setEraserSettings({ size: newSize });
            }
            break;
          }
          case "=":
          case "+":
            handleZoomIn();
            break;
          case "-":
            handleZoomOut();
            break;
          case "Delete":
          case "Backspace":
            handleClearLayer();
            break;
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Zoom handlers ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => setZoom(zoom * 1.2), [zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(zoom * 0.8), [zoom, setZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan]);

  // ─── Layer reorder ─────────────────────────────────────────────────
  const handleMoveLayerUp = useCallback(
    (index: number) => {
      if (index < document.layers.length - 1) {
        reorderLayers(index, index + 1);
      }
    },
    [document.layers.length, reorderLayers]
  );

  const handleMoveLayerDown = useCallback(
    (index: number) => {
      if (index > 0) {
        reorderLayers(index, index - 1);
      }
    },
    [reorderLayers]
  );

  return (
    <Box css={styles(theme)}>
      {!panelsHidden && (
        <SketchToolbar
          activeTool={activeTool}
          brushSettings={document.toolSettings.brush}
          pencilSettings={document.toolSettings.pencil}
          eraserSettings={document.toolSettings.eraser}
          shapeSettings={document.toolSettings.shape}
          fillSettings={document.toolSettings.fill}
          zoom={zoom}
          mirrorX={mirrorX}
          mirrorY={mirrorY}
          canUndo={canUndo()}
          canRedo={canRedo()}
          foregroundColor={foregroundColor}
          backgroundColor={backgroundColor}
          onToolChange={setActiveTool}
          onBrushSettingsChange={setBrushSettings}
          onPencilSettingsChange={setPencilSettings}
          onEraserSettingsChange={setEraserSettings}
          onShapeSettingsChange={setShapeSettings}
          onFillSettingsChange={setFillSettings}
          onMirrorXChange={setMirrorX}
          onMirrorYChange={setMirrorY}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onClearLayer={handleClearLayer}
          onExportPng={handleExportPng}
          onFlipHorizontal={handleFlipHorizontal}
          onFlipVertical={handleFlipVertical}
          onMergeDown={handleMergeDown}
          onFlattenVisible={handleFlattenVisible}
          onForegroundColorChange={setForegroundColor}
          onBackgroundColorChange={setBackgroundColor}
          onSwapColors={swapColors}
          onResetColors={resetColors}
        />
      )}

      <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <SketchCanvas
          ref={canvasRef}
          document={document}
          activeTool={activeTool}
          zoom={zoom}
          pan={pan}
          mirrorX={mirrorX}
          mirrorY={mirrorY}
          onZoomChange={setZoom}
          onPanChange={setPan}
          onStrokeStart={handleStrokeStart}
          onStrokeEnd={handleStrokeEnd}
        />
      </Box>

      {!panelsHidden && (
        <SketchLayersPanel
          layers={document.layers}
          activeLayerId={document.activeLayerId}
          maskLayerId={document.maskLayerId}
          onSelectLayer={setActiveLayer}
          onToggleVisibility={toggleLayerVisibility}
          onAddLayer={() => addLayer()}
          onRemoveLayer={removeLayer}
          onDuplicateLayer={duplicateLayer}
          onMoveLayerUp={handleMoveLayerUp}
          onMoveLayerDown={handleMoveLayerDown}
          onSetMaskLayer={setMaskLayer}
          onLayerOpacityChange={setLayerOpacity}
          onLayerBlendModeChange={setLayerBlendMode}
          onRenameLayer={renameLayer}
          onMergeDown={handleMergeDown}
          onFlattenVisible={handleFlattenVisible}
        />
      )}
    </Box>
  );
};

export default memo(SketchEditor);
