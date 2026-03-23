/**
 * SketchEditor
 *
 * Main sketch editor component that composes the canvas, toolbar, and layers panel.
 * Manages the editor state via the sketch store and handles keyboard shortcuts.
 *
 * After refactor: orchestration and component wiring only. All store selection,
 * history, layer, canvas, and color logic lives in focused controller hooks.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
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
import type { SketchDocument } from "./types";
import { isShapeTool } from "./types";
import {
  useSketchStoreSelectors,
  useHistoryActions,
  useLayerActions,
  useCanvasActions,
  useColorActions
} from "./hooks";

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
  discardToInitial: () => void;
  flushPendingChanges: () => void;
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
  // Snapshot of the document as it was when the editor first loaded
  const initialDocumentRef = useRef(initialDocument);

  // ─── Store selectors ────────────────────────────────────────────────
  const store = useSketchStoreSelectors();

  // ─── History actions ────────────────────────────────────────────────
  const { handleUndo, handleRedo } = useHistoryActions({
    canvasRef,
    undo: store.undo,
    redo: store.redo
  });

  // ─── Layer actions ──────────────────────────────────────────────────
  const layerActions = useLayerActions({
    canvasRef,
    document: store.document,
    pushHistory: store.pushHistory,
    addLayer: store.addLayer,
    removeLayer: store.removeLayer,
    duplicateLayer: store.duplicateLayer,
    reorderLayers: store.reorderLayers,
    toggleLayerVisibility: store.toggleLayerVisibility,
    setLayerOpacity: store.setLayerOpacity,
    setLayerBlendMode: store.setLayerBlendMode,
    renameLayer: store.renameLayer,
    updateLayerData: store.updateLayerData,
    setLayerTransform: store.setLayerTransform,
    setLayerContentBounds: store.setLayerContentBounds,
    setMaskLayer: store.setMaskLayer,
    toggleAlphaLock: store.toggleAlphaLock,
    toggleLayerExposedInput: store.toggleLayerExposedInput,
    toggleLayerExposedOutput: store.toggleLayerExposedOutput,
    mergeLayerDown: store.mergeLayerDown,
    flattenVisible: store.flattenVisible
  });

  // ─── Canvas actions ─────────────────────────────────────────────────
  const canvasActions = useCanvasActions({
    canvasRef,
    document: store.document,
    activeTool: store.activeTool,
    zoom: store.zoom,
    pushHistory: store.pushHistory,
    updateLayerData: store.updateLayerData,
    translateLayer: store.translateLayer,
    setLayerTransform: store.setLayerTransform,
    setLayerContentBounds: store.setLayerContentBounds,
    setDocument: store.setDocument,
    setZoom: store.setZoom,
    setPan: store.setPan,
    resizeCanvas: store.resizeCanvas,
    onExportImage,
    onExportMask
  });

  // ─── Color actions ──────────────────────────────────────────────────
  const colorActions = useColorActions({
    activeTool: store.activeTool,
    setForegroundColor: store.setForegroundColor,
    setBrushSettings: store.setBrushSettings,
    setPencilSettings: store.setPencilSettings,
    setEraserSettings: store.setEraserSettings,
    setFillSettings: store.setFillSettings,
    setBlurSettings: store.setBlurSettings,
    setCloneStampSettings: store.setCloneStampSettings
  });

  // ─── Initialize from prop ───────────────────────────────────────────
  const initializedRef = useRef(false);
  const { setDocument } = store;
  useEffect(() => {
    if (initialDocument && !initializedRef.current) {
      setDocument(initialDocument);
      initializedRef.current = true;
    }
  }, [initialDocument, setDocument]);

  // ─── Autosave on document changes ──────────────────────────────────
  useEffect(() => {
    if (onDocumentChange && initializedRef.current) {
      onDocumentChange(store.document);
    }
  }, [store.document, onDocumentChange]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEditorKeyboardShortcuts({
    handleUndo,
    handleRedo,
    handleZoomIn: canvasActions.handleZoomIn,
    handleZoomOut: canvasActions.handleZoomOut,
    handleZoomReset: canvasActions.handleZoomReset,
    handleExportPng: canvasActions.handleExportPng,
    handleClearLayer: canvasActions.handleClearLayer,
    handleFillLayerWithColor: canvasActions.handleFillLayerWithColor,
    handleNudgeLayer: canvasActions.handleNudgeLayer,
    setActiveTool: store.setActiveTool,
    setZoom: store.setZoom,
    setMirrorX: store.setMirrorX,
    setMirrorY: store.setMirrorY,
    setBrushSettings: store.setBrushSettings,
    setPencilSettings: store.setPencilSettings,
    setEraserSettings: store.setEraserSettings,
    setShapeSettings: store.setShapeSettings,
    setBlurSettings: store.setBlurSettings,
    setCloneStampSettings: store.setCloneStampSettings,
    swapColors: store.swapColors,
    resetColors: store.resetColors,
    togglePanelsHidden: store.togglePanelsHidden
  });

  // ─── Foreground color change (syncs to active tool settings) ───────
  const {
    activeTool,
    setForegroundColor,
    setBrushSettings,
    setPencilSettings,
    setFillSettings,
    setShapeSettings,
    setGradientSettings
  } = store;
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

  // ─── Imperative handle for modal header actions ─────────────────────
  useImperativeHandle(
    ref,
    () => ({
      undo: handleUndo,
      redo: handleRedo,
      clearLayer: canvasActions.handleClearLayer,
      exportPng: canvasActions.handleExportPng,
      flipHorizontal: layerActions.handleFlipHorizontal,
      flipVertical: layerActions.handleFlipVertical,
      mergeDown: layerActions.handleMergeDown,
      flattenVisible: layerActions.handleFlattenVisible,
      flushPendingChanges: canvasActions.flushPendingCanvasSync,
      discardToInitial: () => {
        const doc = initialDocumentRef.current;
        if (!doc) { return; }
        store.setDocument(doc);
        if (canvasRef.current) {
          for (const layer of doc.layers) {
            canvasRef.current.setLayerData(layer.id, layer.data ?? null);
          }
        }
      }
    }),
    [handleUndo, handleRedo, canvasActions, layerActions, store]
  );

  return (
    <Box className="sketch-editor" css={styles(theme)}>
      {/* SketchToolbar is always rendered — colors must stay visible */}
      <SketchToolbar
        activeTool={store.activeTool}
        onToolChange={store.setActiveTool}
        foregroundColor={store.foregroundColor}
        backgroundColor={store.backgroundColor}
        onForegroundColorChange={handleFgColorChange}
        onBackgroundColorChange={store.setBackgroundColor}
        onSwapColors={store.swapColors}
        onResetColors={store.resetColors}
      />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!store.panelsHidden && (
          <SketchToolTopBar
            activeTool={store.activeTool}
            brushSettings={store.toolSettings.brush}
            pencilSettings={store.toolSettings.pencil}
            eraserSettings={store.toolSettings.eraser}
            shapeSettings={store.toolSettings.shape}
            fillSettings={store.toolSettings.fill}
            blurSettings={store.toolSettings.blur}
            gradientSettings={store.toolSettings.gradient}
            cloneStampSettings={store.toolSettings.cloneStamp}
            adjustBrightness={canvasActions.adjBrightness}
            adjustContrast={canvasActions.adjContrast}
            adjustSaturation={canvasActions.adjSaturation}
            onBrushSettingsChange={store.setBrushSettings}
            onPencilSettingsChange={store.setPencilSettings}
            onEraserSettingsChange={store.setEraserSettings}
            onShapeSettingsChange={store.setShapeSettings}
            onFillSettingsChange={store.setFillSettings}
            onBlurSettingsChange={store.setBlurSettings}
            onGradientSettingsChange={store.setGradientSettings}
            onCloneStampSettingsChange={store.setCloneStampSettings}
            onAdjustBrightnessChange={canvasActions.setAdjBrightness}
            onAdjustContrastChange={canvasActions.setAdjContrast}
            onAdjustSaturationChange={canvasActions.setAdjSaturation}
            onAdjustReset={canvasActions.handleResetAdjustments}
          />
        )}

        <Box
          className="sketch-editor__canvas-region"
          sx={{ flex: 1, position: "relative", overflow: "hidden" }}
        >
          <SketchCanvas
            ref={canvasRef}
            className="sketch-editor__canvas"
            document={store.document}
            activeTool={store.activeTool}
            zoom={store.zoom}
            pan={store.pan}
            mirrorX={store.mirrorX}
            mirrorY={store.mirrorY}
            symmetryMode={store.symmetryMode}
            symmetryRays={store.symmetryRays}
            isolatedLayerId={store.isolatedLayerId}
            onZoomChange={store.setZoom}
            onPanChange={store.setPan}
            onStrokeStart={canvasActions.handleStrokeStart}
            onStrokeEnd={canvasActions.handleStrokeEnd}
            onLayerTransformChange={store.setLayerTransform}
            onLayerContentBoundsChange={store.setLayerContentBounds}
            onBrushSizeChange={colorActions.handleBrushSizeChange}
            onContextMenu={canvasActions.handleContextMenu}
            onCropComplete={canvasActions.handleCropComplete}
            onEyedropperPick={colorActions.handleEyedropperPick}
            selection={store.selection}
            onSelectionChange={store.setSelection}
            onAutoPickLayer={store.setActiveLayer}
            foregroundColor={store.foregroundColor}
          />
        </Box>
      </Box>

      {!store.panelsHidden && (
        <SketchLayersPanel
          layers={store.document.layers}
          activeLayerId={store.document.activeLayerId}
          maskLayerId={store.document.maskLayerId}
          isolatedLayerId={store.isolatedLayerId}
          onSelectLayer={store.setActiveLayer}
          onToggleVisibility={layerActions.handleToggleVisibility}
          onAddLayer={layerActions.handleAddLayer}
          onRemoveLayer={layerActions.handleRemoveLayer}
          onDuplicateLayer={layerActions.handleDuplicateLayer}
          onReorderLayers={layerActions.handleReorderLayers}
          onSetMaskLayer={layerActions.handleSetMaskLayer}
          onToggleAlphaLock={layerActions.handleToggleAlphaLock}
          onToggleIsolateLayer={store.toggleIsolateLayer}
          onToggleExposedInput={layerActions.handleToggleExposedInput}
          onToggleExposedOutput={layerActions.handleToggleExposedOutput}
          onLayerOpacityChange={layerActions.handleSetLayerOpacity}
          onLayerBlendModeChange={layerActions.handleSetLayerBlendMode}
          onRenameLayer={layerActions.handleRenameLayer}
          onMergeDown={layerActions.handleMergeDown}
          onFlattenVisible={layerActions.handleFlattenVisible}
          onTrimLayerToBounds={canvasActions.handleTrimLayerToBounds}
          canvasWidth={store.document.canvas.width}
          canvasHeight={store.document.canvas.height}
          onCanvasResize={canvasActions.handleCanvasResize}
        />
      )}

      <SketchCanvasContextMenu
        className="sketch-editor__context-menu"
        open={canvasActions.contextMenu !== null}
        position={canvasActions.contextMenu}
        activeTool={store.activeTool}
        brushSettings={store.toolSettings.brush}
        pencilSettings={store.toolSettings.pencil}
        eraserSettings={store.toolSettings.eraser}
        shapeSettings={store.toolSettings.shape}
        fillSettings={store.toolSettings.fill}
        blurSettings={store.toolSettings.blur}
        gradientSettings={store.toolSettings.gradient}
        cloneStampSettings={store.toolSettings.cloneStamp}
        foregroundColor={store.foregroundColor}
        backgroundColor={store.backgroundColor}
        canUndo={store.canUndo()}
        canRedo={store.canRedo()}
        onClose={canvasActions.handleContextMenuClose}
        onToolChange={store.setActiveTool}
        onForegroundColorChange={handleFgColorChange}
        onBrushSettingsChange={store.setBrushSettings}
        onPencilSettingsChange={store.setPencilSettings}
        onEraserSettingsChange={store.setEraserSettings}
        onShapeSettingsChange={store.setShapeSettings}
        onFillSettingsChange={store.setFillSettings}
        onBlurSettingsChange={store.setBlurSettings}
        onGradientSettingsChange={store.setGradientSettings}
        onCloneStampSettingsChange={store.setCloneStampSettings}
        onSwapColors={store.swapColors}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearLayer={canvasActions.handleClearLayer}
        onExportPng={canvasActions.handleExportPng}
      />
    </Box>
  );
});

export default memo(SketchEditor);
