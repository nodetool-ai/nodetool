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
import React, { memo, useEffect, useRef, useState } from "react";
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
    setMirrorX,
    setMirrorY,
    setBrushSettings: store.setBrushSettings,
    setPencilSettings: store.setPencilSettings,
    setEraserSettings: store.setEraserSettings,
    setBlurSettings: store.setBlurSettings,
    setCloneStampSettings: store.setCloneStampSettings,
    swapColors: store.swapColors,
    resetColors: store.resetColors,
    togglePanelsHidden: store.togglePanelsHidden
  });

  return (
    <Box className="sketch-editor" css={styles(theme)}>
      {!store.panelsHidden && (
        <SketchToolbar
          activeTool={store.activeTool}
          onToolChange={store.setActiveTool}
        />
      )}

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
            zoom={store.zoom}
            mirrorX={mirrorX}
            mirrorY={mirrorY}
            canUndo={store.canUndo()}
            canRedo={store.canRedo()}
            foregroundColor={store.foregroundColor}
            backgroundColor={store.backgroundColor}
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
            onMirrorXChange={setMirrorX}
            onMirrorYChange={setMirrorY}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onZoomIn={canvasActions.handleZoomIn}
            onZoomOut={canvasActions.handleZoomOut}
            onZoomReset={canvasActions.handleZoomReset}
            onClearLayer={canvasActions.handleClearLayer}
            onExportPng={canvasActions.handleExportPng}
            onFlipHorizontal={layerActions.handleFlipHorizontal}
            onFlipVertical={layerActions.handleFlipVertical}
            onMergeDown={layerActions.handleMergeDown}
            onFlattenVisible={layerActions.handleFlattenVisible}
            onForegroundColorChange={store.setForegroundColor}
            onBackgroundColorChange={store.setBackgroundColor}
            onSwapColors={store.swapColors}
            onResetColors={store.resetColors}
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
            mirrorX={mirrorX}
            mirrorY={mirrorY}
            isolatedLayerId={store.isolatedLayerId}
            onZoomChange={store.setZoom}
            onPanChange={store.setPan}
            onStrokeStart={canvasActions.handleStrokeStart}
            onStrokeEnd={canvasActions.handleStrokeEnd}
            onBrushSizeChange={colorActions.handleBrushSizeChange}
            onContextMenu={canvasActions.handleContextMenu}
            onCropComplete={canvasActions.handleCropComplete}
            onEyedropperPick={colorActions.handleEyedropperPick}
            selection={store.selection}
            onSelectionChange={store.setSelection}
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
        onForegroundColorChange={store.setForegroundColor}
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
};

export default memo(SketchEditor);
