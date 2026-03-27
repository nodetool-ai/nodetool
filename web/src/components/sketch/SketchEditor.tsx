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
  useLayoutEffect,
  useMemo,
  useRef,
  useState
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
import { selectionHasAnyPixels } from "./selection/selectionMask";

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
  /**
   * The sketch store is global and survives modal unmount. SketchCanvas must not
   * mount until `initialDocument` is applied in a layout effect; otherwise the
   * compositor hydrates from stale store state and stays blank while the node
   * preview (built from props) still looks correct.
   */
  const [canvasReady, setCanvasReady] = useState(false);

  // ─── Store selectors ────────────────────────────────────────────────
  const store = useSketchStoreSelectors();

  const hasActiveSelection = useMemo(
    () => selectionHasAnyPixels(store.selection),
    [store.selection]
  );

  const activeLayerTransform = useMemo(() => {
    const layer = store.document.layers.find(
      (l) => l.id === store.document.activeLayerId
    );
    return layer?.transform ?? { x: 0, y: 0 };
  }, [store.document]);

  // ─── Flush ref (filled in after canvasActions is created) ──────────
  const flushBeforeUndoRef = useRef<() => void>(() => {});

  // ─── History actions ────────────────────────────────────────────────
  const { handleUndo, handleRedo } = useHistoryActions({
    canvasRef,
    undo: store.undo,
    redo: store.redo,
    flushBeforeUndo: useCallback(() => flushBeforeUndoRef.current(), [])
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
    flattenVisible: store.flattenVisible,
    addGroup: store.addGroup,
    toggleGroupCollapsed: store.toggleGroupCollapsed,
    moveLayerToGroup: store.moveLayerToGroup,
    ungroupLayer: store.ungroupLayer
  });

  // ─── Canvas actions ─────────────────────────────────────────────────
  const canvasActions = useCanvasActions({
    canvasRef,
    document: store.document,
    activeTool: store.activeTool,
    zoom: store.zoom,
    pushHistory: store.pushHistory,
    updateLayerData: store.updateLayerData,
    offsetLayerTransform: store.offsetLayerTransform,
    commitLayerTransform: store.commitLayerTransform,
    setLayerTransform: store.setLayerTransform,
    setLayerContentBounds: store.setLayerContentBounds,
    setDocument: store.setDocument,
    setZoom: store.setZoom,
    setPan: store.setPan,
    resizeCanvas: store.resizeCanvas,
    onExportImage,
    onExportMask
  });

  // Wire up the flush-before-undo ref now that canvasActions is available.
  flushBeforeUndoRef.current = canvasActions.flushPendingCanvasSync;

  // ─── Color actions ──────────────────────────────────────────────────
  const colorActions = useColorActions({
    activeTool: store.activeTool,
    setForegroundColor: store.setForegroundColor,
    setBrushSettings: store.setBrushSettings,
    setPencilSettings: store.setPencilSettings,
    setEraserSettings: store.setEraserSettings,
    setFillSettings: store.setFillSettings,
    setBlurSettings: store.setBlurSettings,
    setCloneStampSettings: store.setCloneStampSettings,
    setShapeSettings: store.setShapeSettings,
    setGradientSettings: store.setGradientSettings
  });

  // ─── Cancel adjustment preview if tool changes away from "adjust" ──
  const prevAdjustToolRef = useRef(store.activeTool);
  useEffect(() => {
    if (
      prevAdjustToolRef.current === "adjust" &&
      store.activeTool !== "adjust"
    ) {
      canvasActions.handleCancelAdjustments();
    }
    // Save transform baseline when switching to "transform"
    if (
      prevAdjustToolRef.current !== "transform" &&
      store.activeTool === "transform"
    ) {
      canvasActions.saveTransformOriginal();
    }
    // Cancel transform when switching away from "transform"
    if (
      prevAdjustToolRef.current === "transform" &&
      store.activeTool !== "transform"
    ) {
      canvasActions.handleTransformCancel();
    }
    prevAdjustToolRef.current = store.activeTool;
  }, [store.activeTool, canvasActions]);

  // ─── Seed global store from prop before SketchCanvas mounts ─────────
  const { setDocument } = store;
  useLayoutEffect(() => {
    initialDocumentRef.current = initialDocument;
    if (initialDocument) {
      setDocument(initialDocument);
    }
    setCanvasReady(true);
  }, [initialDocument, setDocument]);

  // ─── Autosave on document changes ──────────────────────────────────
  useEffect(() => {
    if (onDocumentChange && canvasReady) {
      onDocumentChange(store.document);
    }
  }, [store.document, onDocumentChange, canvasReady]);

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
    handleCopy: canvasActions.handleCopy,
    handleCut: canvasActions.handleCut,
    handlePaste: canvasActions.handlePaste,
    handleNudgeLayer: canvasActions.handleNudgeLayer,
    syncSketchOutputsNow: canvasActions.syncSketchOutputsNow,
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
            selectSettings={store.toolSettings.select}
            hasActiveSelection={hasActiveSelection}
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
            onSelectSettingsChange={store.setSelectSettings}
            onFeatherSelection={store.featherCurrentSelection}
            onSmoothSelectionBorders={store.smoothCurrentSelectionBorders}
            onAdjustBrightnessChange={canvasActions.setAdjBrightness}
            onAdjustContrastChange={canvasActions.setAdjContrast}
            onAdjustSaturationChange={canvasActions.setAdjSaturation}
            onAdjustApply={canvasActions.handleApplyAdjustments}
            onAdjustCancel={canvasActions.handleCancelAdjustments}
            transformScaleX={activeLayerTransform.scaleX ?? 1}
            transformScaleY={activeLayerTransform.scaleY ?? 1}
            transformRotation={activeLayerTransform.rotation ?? 0}
            onTransformCommit={canvasActions.handleTransformCommit}
            onTransformCancel={canvasActions.handleTransformCancel}
            onTransformReset={canvasActions.handleTransformReset}
          />
        )}

        <Box
          className="sketch-editor__canvas-region"
          sx={{ flex: 1, position: "relative", overflow: "hidden" }}
        >
          {canvasReady ? (
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
              onCanvasLeave={canvasActions.flushLayerThumbnailsWhenIdle}
              onLayerTransformChange={canvasActions.handleCommitLayerTransform}
              onLayerContentBoundsChange={store.setLayerContentBounds}
              onBrushSizeChange={colorActions.handleBrushSizeChange}
              onContextMenu={canvasActions.handleContextMenu}
              onCropComplete={canvasActions.handleCropComplete}
              onEyedropperPick={colorActions.handleEyedropperPick}
              selection={store.selection}
              onSelectionChange={store.setSelection}
              onAutoPickLayer={store.setActiveLayer}
              foregroundColor={store.foregroundColor}
              onDropImage={canvasActions.handleDropImage}
              onCanvasResizeStart={canvasActions.handleCanvasResizeStart}
              onCanvasResize={canvasActions.handleCanvasResizeDrag}
            />
          ) : null}
        </Box>
      </Box>

      {!store.panelsHidden && (
        <SketchLayersPanel
          foregroundColor={store.foregroundColor}
          onForegroundColorChange={handleFgColorChange}
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
          onAddGroup={layerActions.handleAddGroup}
          onToggleGroupCollapsed={layerActions.handleToggleGroupCollapsed}
          onMoveLayerToGroup={layerActions.handleMoveLayerToGroup}
          onUngroupLayer={layerActions.handleUngroupLayer}
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
