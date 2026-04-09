/**
 * SketchEditor
 *
 * Main sketch editor component that composes the canvas, toolbar, and layers panel.
 * Manages the editor state via the sketch store and handles keyboard shortcuts.
 *
 * ## Subscription architecture (passes 1 & 2)
 *
 * Shell components (toolbar, top bar, layers panel) subscribe directly to the
 * store slices they need via narrow connected wrappers defined below. This means
 * a hot-path change (e.g. `zoom`, `pan`, `selection`, or a tool-settings slider)
 * does **not** force the entire editor tree to re-render — only the subtree that
 * actually consumes the changed value is invalidated.
 *
 * SketchEditor itself subscribes only to the state needed for its own effects
 * and action-hook creation (`document`, `activeTool`, `transientMoveModifierHeld`,
 * `toolSettings` via ref). Children are wired through connected components.
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
import TransformContextMenu from "./TransformContextMenu";
import SketchToolbar from "./SketchToolbar";
import SketchToolTopBar from "./SketchToolTopBar";
import SketchLayersPanel from "./SketchLayersPanel";
import { useEditorKeyboardShortcuts } from "./useEditorKeyboardShortcuts";
import type {
  BlendMode,
  LayerContentBounds,
  LayerTransform,
  Point,
  SketchDocument,
  SketchTool
} from "./types";
import { isShapeTool } from "./types";
import { getToolHandler } from "./tools";
import type { SegmentTool } from "./tools/SegmentTool";
import type { StrokeEndOptions } from "./tools/types";
import {
  useResolvedToolSettings,
  useHistoryActions,
  useLayerActions,
  useCanvasActions,
  useColorActions,
  useSegmentation
} from "./hooks";
import { useSketchStore } from "./state";
import {
  resolveDisplayedActiveLayerTransform,
  type LayerTransformPreview
} from "./activeLayerTransform";

const SKETCH_CANVAS_RESIZE_HANDLES_STORAGE_KEY =
  "nodetool-sketch-canvas-resize-handles";

function readCanvasResizeHandlesEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(
      SKETCH_CANVAS_RESIZE_HANDLES_STORAGE_KEY
    );
    if (raw === null) {
      return true;
    }
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

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

// ─── Connected shell components ─────────────────────────────────────
//
// Each connected component subscribes directly to only the store slices
// it needs, so changes in other slices (zoom, pan, document, selection)
// do not force unrelated shell pieces to re-render.

/**
 * ConnectedToolbar — subscribes to activeTool + colors only.
 * Does NOT re-render on document, toolSettings, selection, or viewport changes.
 */
const ConnectedToolbar = memo(function ConnectedToolbar() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const backgroundColor = useSketchStore((s) => s.backgroundColor) || "#000000";
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBackgroundColor = useSketchStore((s) => s.setBackgroundColor);
  const swapColors = useSketchStore((s) => s.swapColors);
  const resetColors = useSketchStore((s) => s.resetColors);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);

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

  return (
    <SketchToolbar
      activeTool={activeTool}
      onToolChange={setActiveTool}
      foregroundColor={foregroundColor}
      backgroundColor={backgroundColor}
      onForegroundColorChange={handleFgColorChange}
      onBackgroundColorChange={setBackgroundColor}
      onSwapColors={swapColors}
      onResetColors={resetColors}
    />
  );
});

/**
 * ConnectedToolTopBar — subscribes to activeTool, individual tool-setting
 * sub-objects (via narrow selectors), panelsHidden, and hasActiveSelection.
 * Does NOT re-render on document, viewport, color changes, or unrelated
 * tool-setting slider changes (e.g. brush size while eraser is active).
 * Action callbacks that depend on document are passed in as props; their
 * individual references are stable via `useCallback`.
 */
interface ConnectedToolTopBarProps {
  adjBrightness: number;
  adjContrast: number;
  adjSaturation: number;
  onAdjustBrightnessChange: (v: number) => void;
  onAdjustContrastChange: (v: number) => void;
  onAdjustSaturationChange: (v: number) => void;
  onAdjustApply: () => void;
  onAdjustCancel: () => void;
  activeLayerTransform: LayerTransform;
  onTransformCommit: () => void;
  onTransformCancel: () => void;
  onTransformReset: () => void;
  segmentation: ReturnType<typeof useSegmentation>;
  onRunSegmentation: () => void;
  onClearSegmentPrompts: () => void;
}

const ConnectedToolTopBar = memo(function ConnectedToolTopBar(
  props: ConnectedToolTopBarProps
) {
  const activeTool = useSketchStore((s) => s.activeTool);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettings = useResolvedToolSettings();

  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setCloneStampSettings = useSketchStore((s) => s.setCloneStampSettings);
  const setSelectSettings = useSketchStore((s) => s.setSelectSettings);
  const setSegmentSettings = useSketchStore((s) => s.setSegmentSettings);
  const invertSelection = useSketchStore((s) => s.invertSelection);
  const featherCurrentSelection = useSketchStore(
    (s) => s.featherCurrentSelection
  );
  const smoothCurrentSelectionBorders = useSketchStore(
    (s) => s.smoothCurrentSelectionBorders
  );
  const convertSelectionToBorderOutline = useSketchStore(
    (s) => s.convertSelectionToBorderOutline
  );

  if (panelsHidden) {
    return null;
  }

  return (
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
      selectSettings={toolSettings.select}
      hasActiveSelection={hasActiveSelection}
      adjustBrightness={props.adjBrightness}
      adjustContrast={props.adjContrast}
      adjustSaturation={props.adjSaturation}
      onBrushSettingsChange={setBrushSettings}
      onPencilSettingsChange={setPencilSettings}
      onEraserSettingsChange={setEraserSettings}
      onShapeSettingsChange={setShapeSettings}
      onFillSettingsChange={setFillSettings}
      onBlurSettingsChange={setBlurSettings}
      onGradientSettingsChange={setGradientSettings}
      onCloneStampSettingsChange={setCloneStampSettings}
      onSelectSettingsChange={setSelectSettings}
      onInvertSelection={invertSelection}
      onFeatherSelection={featherCurrentSelection}
      onSmoothSelectionBorders={smoothCurrentSelectionBorders}
      onStrokeSelectionBorder={convertSelectionToBorderOutline}
      onAdjustBrightnessChange={props.onAdjustBrightnessChange}
      onAdjustContrastChange={props.onAdjustContrastChange}
      onAdjustSaturationChange={props.onAdjustSaturationChange}
      onAdjustApply={props.onAdjustApply}
      onAdjustCancel={props.onAdjustCancel}
      transformScaleX={props.activeLayerTransform.scaleX ?? 1}
      transformScaleY={props.activeLayerTransform.scaleY ?? 1}
      transformRotation={props.activeLayerTransform.rotation ?? 0}
      onTransformCommit={props.onTransformCommit}
      onTransformCancel={props.onTransformCancel}
      onTransformReset={props.onTransformReset}
      segmentSettings={toolSettings.segment}
      onSegmentSettingsChange={setSegmentSettings}
      segmentationStatus={props.segmentation.status}
      segmentModelInfo={props.segmentation.modelInfo}
      onRunSegmentation={props.onRunSegmentation}
      onApplySegmentResult={props.segmentation.applyResult}
      onDiscardSegmentResult={props.segmentation.discardResult}
      onCancelSegmentation={props.segmentation.cancelSegmentation}
      onClearSegmentPrompts={props.onClearSegmentPrompts}
      onCheckSegmentModel={props.segmentation.checkModel}
    />
  );
});

/**
 * ConnectedLayersPanel — subscribes to narrow document sub-fields (layers,
 * activeLayerId, maskLayerId, canvas dimensions), selectedLayerIds,
 * isolatedLayerId, panelsHidden, foregroundColor, and activeTool.
 * Does NOT re-render on toolSettings, viewport, or selection changes.
 * Canvas-metadata changes (activeLayerId, maskLayerId, canvas dimensions) only
 * trigger a rerender when they actually change, not on every layer-data mutation.
 */
interface ConnectedLayersPanelProps {
  onClearLayer: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onMergeDown: () => void;
  onFlattenVisible: () => void;
  onTrimLayerToBounds: () => void;
  onCropCanvasToActiveLayerVisiblePixels: () => void;
  onCropCanvasToActiveLayerExtents: () => void;
  onCanvasResize: (width: number, height: number) => void;
  onToggleVisibility: (layerId: string) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onSetMaskLayer: (layerId: string | null) => void;
  onToggleAlphaLock: (layerId: string) => void;
  onToggleExposedInput: (layerId: string) => void;
  onToggleExposedOutput: (layerId: string) => void;
  onLayerOpacityChange: (layerId: string, opacity: number) => void;
  onLayerBlendModeChange: (layerId: string, blendMode: BlendMode) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onAddGroup: () => void;
  onToggleGroupCollapsed: (groupId: string) => void;
  onMoveLayerToGroup: (layerId: string, groupId: string | null) => void;
  onUngroupLayer: (groupId: string) => void;
  onGroupSelectedLayers: () => void;
  onDeleteSelectedLayers: () => void;
  canvasResizeHandlesEnabled: boolean;
  onCanvasResizeHandlesEnabledChange: (enabled: boolean) => void;
}

const ConnectedLayersPanel = memo(function ConnectedLayersPanel(
  props: ConnectedLayersPanelProps
) {
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  // Narrow document field selectors — only rerender when the specific field changes
  const layers = useSketchStore((s) => s.document.layers);
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const maskLayerId = useSketchStore((s) => s.document.maskLayerId);
  const canvasWidth = useSketchStore((s) => s.document.canvas.width);
  const canvasHeight = useSketchStore((s) => s.document.canvas.height);
  const selectedLayerIds = useSketchStore((s) => s.selectedLayerIds);
  const isolatedLayerId = useSketchStore((s) => s.isolatedLayerId);
  const foregroundColor =
    useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const toggleLayerInSelection = useSketchStore(
    (s) => s.toggleLayerInSelection
  );
  const selectLayerRangeInPanelOrder = useSketchStore(
    (s) => s.selectLayerRangeInPanelOrder
  );
  const toggleIsolateLayer = useSketchStore((s) => s.toggleIsolateLayer);
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const activeTool = useSketchStore((s) => s.activeTool);

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

  if (panelsHidden) {
    return null;
  }

  return (
    <SketchLayersPanel
      foregroundColor={foregroundColor}
      onForegroundColorChange={handleFgColorChange}
      layers={layers}
      activeLayerId={activeLayerId}
      selectedLayerIds={selectedLayerIds}
      maskLayerId={maskLayerId}
      isolatedLayerId={isolatedLayerId}
      onSelectLayer={setActiveLayer}
      onToggleLayerInSelection={toggleLayerInSelection}
      onSelectLayerRangeInPanelOrder={selectLayerRangeInPanelOrder}
      onToggleVisibility={props.onToggleVisibility}
      onAddLayer={props.onAddLayer}
      onRemoveLayer={props.onRemoveLayer}
      onDuplicateLayer={props.onDuplicateLayer}
      onReorderLayers={props.onReorderLayers}
      onSetMaskLayer={props.onSetMaskLayer}
      onToggleAlphaLock={props.onToggleAlphaLock}
      onToggleIsolateLayer={toggleIsolateLayer}
      onToggleExposedInput={props.onToggleExposedInput}
      onToggleExposedOutput={props.onToggleExposedOutput}
      onLayerOpacityChange={props.onLayerOpacityChange}
      onLayerBlendModeChange={props.onLayerBlendModeChange}
      onRenameLayer={props.onRenameLayer}
      onClearLayer={props.onClearLayer}
      onFlipHorizontal={props.onFlipHorizontal}
      onFlipVertical={props.onFlipVertical}
      onMergeDown={props.onMergeDown}
      onFlattenVisible={props.onFlattenVisible}
      onTrimLayerToBounds={props.onTrimLayerToBounds}
      onCropCanvasToActiveLayerVisiblePixels={
        props.onCropCanvasToActiveLayerVisiblePixels
      }
      onCropCanvasToActiveLayerExtents={
        props.onCropCanvasToActiveLayerExtents
      }
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      onCanvasResize={props.onCanvasResize}
      canvasResizeHandlesEnabled={props.canvasResizeHandlesEnabled}
      onCanvasResizeHandlesEnabledChange={
        props.onCanvasResizeHandlesEnabledChange
      }
      onAddGroup={props.onAddGroup}
      onToggleGroupCollapsed={props.onToggleGroupCollapsed}
      onMoveLayerToGroup={props.onMoveLayerToGroup}
      onUngroupLayer={props.onUngroupLayer}
      onGroupSelectedLayers={props.onGroupSelectedLayers}
      onDeleteSelectedLayers={props.onDeleteSelectedLayers}
    />
  );
});

/**
 * ConnectedContextMenu — subscribes to activeTool, toolSettings,
 * hasActiveSelection (boolean), foregroundColor, backgroundColor,
 * canUndo, canRedo.
 * Does NOT re-render on document, viewport, panelsHidden, or full
 * selection mask changes.
 */
interface ConnectedContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  adjBrightness: number;
  adjContrast: number;
  adjSaturation: number;
  onClose: () => void;
  onAdjustBrightnessChange: (v: number) => void;
  onAdjustContrastChange: (v: number) => void;
  onAdjustSaturationChange: (v: number) => void;
  onAdjustApply: () => void;
  onAdjustCancel: () => void;
  activeLayerTransform: LayerTransform;
  onTransformCommit: () => void;
  onTransformCancel: () => void;
  onTransformReset: () => void;
  segmentation: ReturnType<typeof useSegmentation>;
  onRunSegmentation: () => void;
  onClearSegmentPrompts: () => void;
  onSwapColors: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearLayer: () => void;
  onExportPng: () => void;
  onFillSelectionWithForeground: () => void;
  onNewLayer: () => void;
  onLayerViaCopy: () => void;
  onLayerViaCut: () => void;
  onFreeTransform: () => void;
}

const ConnectedContextMenu = memo(function ConnectedContextMenu(
  props: ConnectedContextMenuProps
) {
  const activeTool = useSketchStore((s) => s.activeTool);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettings = useResolvedToolSettings();
  const foregroundColor =
    useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const backgroundColor =
    useSketchStore((s) => s.backgroundColor) || "#000000";
  const canUndo = useSketchStore((s) => s.canUndo());
  const canRedo = useSketchStore((s) => s.canRedo());

  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setCloneStampSettings = useSketchStore(
    (s) => s.setCloneStampSettings
  );
  const setSelectSettings = useSketchStore((s) => s.setSelectSettings);
  const setSegmentSettings = useSketchStore((s) => s.setSegmentSettings);
  const invertSelection = useSketchStore((s) => s.invertSelection);
  const featherCurrentSelection = useSketchStore(
    (s) => s.featherCurrentSelection
  );
  const smoothCurrentSelectionBorders = useSketchStore(
    (s) => s.smoothCurrentSelectionBorders
  );
  const convertSelectionToBorderOutline = useSketchStore(
    (s) => s.convertSelectionToBorderOutline
  );
  const deselectSelection = useCallback(
    () => useSketchStore.getState().setSelection(null),
    []
  );
  const reselectSelection = useSketchStore((s) => s.reselectLastSelection);

  return (
    <SketchCanvasContextMenu
      className="sketch-editor__context-menu"
      open={props.open}
      position={props.position}
      activeTool={activeTool}
      brushSettings={toolSettings.brush}
      pencilSettings={toolSettings.pencil}
      eraserSettings={toolSettings.eraser}
      shapeSettings={toolSettings.shape}
      fillSettings={toolSettings.fill}
      blurSettings={toolSettings.blur}
      gradientSettings={toolSettings.gradient}
      cloneStampSettings={toolSettings.cloneStamp}
      selectSettings={toolSettings.select}
      hasActiveSelection={hasActiveSelection}
      adjustBrightness={props.adjBrightness}
      adjustContrast={props.adjContrast}
      adjustSaturation={props.adjSaturation}
      foregroundColor={foregroundColor}
      backgroundColor={backgroundColor}
      canUndo={canUndo}
      canRedo={canRedo}
      onClose={props.onClose}
      onToolChange={setActiveTool}
      onBrushSettingsChange={setBrushSettings}
      onPencilSettingsChange={setPencilSettings}
      onEraserSettingsChange={setEraserSettings}
      onShapeSettingsChange={setShapeSettings}
      onFillSettingsChange={setFillSettings}
      onBlurSettingsChange={setBlurSettings}
      onGradientSettingsChange={setGradientSettings}
      onCloneStampSettingsChange={setCloneStampSettings}
      onSelectSettingsChange={setSelectSettings}
      onInvertSelection={invertSelection}
      onFeatherSelection={featherCurrentSelection}
      onSmoothSelectionBorders={smoothCurrentSelectionBorders}
      onStrokeSelectionBorder={convertSelectionToBorderOutline}
      onDeselectSelection={deselectSelection}
      onReselectSelection={reselectSelection}
      onFillSelectionWithForeground={props.onFillSelectionWithForeground}
      onNewLayer={props.onNewLayer}
      onLayerViaCopy={props.onLayerViaCopy}
      onLayerViaCut={props.onLayerViaCut}
      onFreeTransform={props.onFreeTransform}
      onAdjustBrightnessChange={props.onAdjustBrightnessChange}
      onAdjustContrastChange={props.onAdjustContrastChange}
      onAdjustSaturationChange={props.onAdjustSaturationChange}
      onAdjustApply={props.onAdjustApply}
      onAdjustCancel={props.onAdjustCancel}
      transformScaleX={props.activeLayerTransform.scaleX ?? 1}
      transformScaleY={props.activeLayerTransform.scaleY ?? 1}
      transformRotation={props.activeLayerTransform.rotation ?? 0}
      onTransformCommit={props.onTransformCommit}
      onTransformCancel={props.onTransformCancel}
      onTransformReset={props.onTransformReset}
      segmentSettings={toolSettings.segment}
      onSegmentSettingsChange={setSegmentSettings}
      segmentationStatus={props.segmentation.status}
      segmentModelInfo={props.segmentation.modelInfo}
      onRunSegmentation={props.onRunSegmentation}
      onApplySegmentResult={props.segmentation.applyResult}
      onDiscardSegmentResult={props.segmentation.discardResult}
      onCancelSegmentation={props.segmentation.cancelSegmentation}
      onClearSegmentPrompts={props.onClearSegmentPrompts}
      onCheckSegmentModel={props.segmentation.checkModel}
      onSwapColors={props.onSwapColors}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      onClearLayer={props.onClearLayer}
      onExportPng={props.onExportPng}
    />
  );
});

interface SketchCanvasPaneProps {
  canvasReady: boolean;
  canvasRef: React.RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  activeTool: SketchTool;
  interactionTool: SketchTool;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onStrokeStart: () => void;
  onStrokeEnd: (
    layerId: string,
    data: string | null,
    committedBounds?: LayerContentBounds,
    options?: StrokeEndOptions
  ) => void;
  onCanvasLeave: () => void;
  onLayerTransformChange?: (layerId: string, transform: LayerTransform) => void;
  onLayerTransformPreviewChange?: (preview: LayerTransformPreview | null) => void;
  onLayerContentBoundsChange: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  onBrushSizeChange?: (size: number) => void;
  onContextMenu?: (x: number, y: number) => void;
  onTransformContextMenu?: (x: number, y: number) => void;
  onCropComplete?: (x: number, y: number, width: number, height: number) => void;
  onEyedropperPick?: (color: string) => void;
  onAutoPickLayer?: (layerId: string) => void;
  onDropImage?: (file: File) => void;
  onCanvasResizeStart?: () => void;
  onCanvasResize?: (
    width: number,
    height: number,
    options?: { translateLayers?: Point; resizeFromCenter?: boolean }
  ) => void;
  segmentation: ReturnType<typeof useSegmentation>;
}

/**
 * SketchCanvasPane subscribes directly to hot viewport state (zoom, pan)
 * and canvas-specific state (mirror, symmetry, selection, foreground, isolated)
 * so the parent SketchEditor doesn't need to forward them.
 */
const SketchCanvasPane = memo(function SketchCanvasPane({
  canvasReady,
  canvasRef,
  document,
  activeTool,
  interactionTool,
  onZoomChange,
  onPanChange,
  onStrokeStart,
  onStrokeEnd,
  onCanvasLeave,
  onLayerTransformChange,
  onLayerTransformPreviewChange,
  onLayerContentBoundsChange,
  onBrushSizeChange,
  onContextMenu,
  onTransformContextMenu,
  onCropComplete,
  onEyedropperPick,
  onAutoPickLayer,
  onDropImage,
  onCanvasResizeStart,
  onCanvasResize,
  segmentation
}: SketchCanvasPaneProps) {
  // Subscribe directly to hot/canvas-specific state
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const mirrorX = useSketchStore((s) => s.mirrorX);
  const mirrorY = useSketchStore((s) => s.mirrorY);
  const symmetryMode = useSketchStore((s) => s.symmetryMode);
  const symmetryRays = useSketchStore((s) => s.symmetryRays);
  const isolatedLayerId = useSketchStore((s) => s.isolatedLayerId);
  const selection = useSketchStore((s) => s.selection);
  const foregroundColor =
    useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const setSelection = useSketchStore((s) => s.setSelection);

  useEffect(() => {
    if (segmentation.status !== "previewing" || !segmentation.result) {
      return;
    }
    const overlayCanvas = canvasRef.current?.getOverlayCanvas();
    if (!overlayCanvas) {
      return;
    }
    const ctx = overlayCanvas.getContext("2d");
    if (!ctx) {
      return;
    }
    segmentation.drawMaskPreview(ctx, zoom, pan);
  }, [segmentation, zoom, pan, canvasRef]);

  if (!canvasReady) {
    return null;
  }

  return (
    <SketchCanvas
      ref={canvasRef}
      className="sketch-editor__canvas"
      document={document}
      activeTool={activeTool}
      interactionTool={interactionTool}
      zoom={zoom}
      pan={pan}
      mirrorX={mirrorX}
      mirrorY={mirrorY}
      symmetryMode={symmetryMode}
      symmetryRays={symmetryRays}
      isolatedLayerId={isolatedLayerId}
      onZoomChange={onZoomChange}
      onPanChange={onPanChange}
      onStrokeStart={onStrokeStart}
      onStrokeEnd={onStrokeEnd}
      onCanvasLeave={onCanvasLeave}
      onLayerTransformChange={onLayerTransformChange}
      onLayerTransformPreviewChange={onLayerTransformPreviewChange}
      onLayerContentBoundsChange={onLayerContentBoundsChange}
      onBrushSizeChange={onBrushSizeChange}
      onContextMenu={onContextMenu}
      onTransformContextMenu={onTransformContextMenu}
      onCropComplete={onCropComplete}
      onEyedropperPick={onEyedropperPick}
      selection={selection}
      onSelectionChange={setSelection}
      onAutoPickLayer={onAutoPickLayer}
      foregroundColor={foregroundColor}
      onDropImage={onDropImage}
      onCanvasResizeStart={onCanvasResizeStart}
      onCanvasResize={onCanvasResize}
    />
  );
});

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
  const [activeLayerTransformPreview, setActiveLayerTransformPreview] =
    useState<LayerTransformPreview | null>(null);
  const [canvasResizeHandlesEnabled, setCanvasResizeHandlesEnabled] = useState(
    readCanvasResizeHandlesEnabled
  );

  const handleCanvasResizeHandlesEnabledChange = useCallback(
    (enabled: boolean) => {
      setCanvasResizeHandlesEnabled(enabled);
      try {
        window.localStorage.setItem(
          SKETCH_CANVAS_RESIZE_HANDLES_STORAGE_KEY,
          enabled ? "1" : "0"
        );
      } catch {
        // localStorage may be unavailable (private mode, etc.)
      }
    },
    []
  );

  // ─── Narrow store selectors ──────────────────────────────────────────
  // SketchEditor subscribes only to state it needs for its own effects
  // and action-hook creation. Children subscribe via connected components.
  const document = useSketchStore((s) => s.document);
  const activeTool = useSketchStore((s) => s.activeTool);
  const transientMoveModifierHeld = useSketchStore(
    (s) => s.transientMoveModifierHeld
  );
  const setDocument = useSketchStore((s) => s.setDocument);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const pushHistory = useSketchStore((s) => s.pushHistory);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  const updateLayerData = useSketchStore((s) => s.updateLayerData);
  const setLayerTransform = useSketchStore((s) => s.setLayerTransform);
  const commitLayerTransform = useSketchStore((s) => s.commitLayerTransform);
  const setLayerContentBounds = useSketchStore(
    (s) => s.setLayerContentBounds
  );
  const offsetLayerTransform = useSketchStore(
    (s) => s.offsetLayerTransform
  );
  const setZoom = useSketchStore((s) => s.setZoom);
  const setPan = useSketchStore((s) => s.setPan);
  const resizeCanvas = useSketchStore((s) => s.resizeCanvas);
  const offsetAllPaintLayersTransform = useSketchStore(
    (s) => s.offsetAllPaintLayersTransform
  );
  const addLayer = useSketchStore((s) => s.addLayer);
  const removeLayer = useSketchStore((s) => s.removeLayer);
  const duplicateLayer = useSketchStore((s) => s.duplicateLayer);
  const reorderLayers = useSketchStore((s) => s.reorderLayers);
  const toggleLayerVisibility = useSketchStore(
    (s) => s.toggleLayerVisibility
  );
  const setLayerOpacity = useSketchStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useSketchStore((s) => s.setLayerBlendMode);
  const renameLayer = useSketchStore((s) => s.renameLayer);
  const setMaskLayer = useSketchStore((s) => s.setMaskLayer);
  const toggleAlphaLock = useSketchStore((s) => s.toggleAlphaLock);
  const toggleLayerExposedInput = useSketchStore(
    (s) => s.toggleLayerExposedInput
  );
  const toggleLayerExposedOutput = useSketchStore(
    (s) => s.toggleLayerExposedOutput
  );
  const mergeLayerDown = useSketchStore((s) => s.mergeLayerDown);
  const flattenVisible = useSketchStore((s) => s.flattenVisible);
  const addGroup = useSketchStore((s) => s.addGroup);
  const toggleGroupCollapsed = useSketchStore(
    (s) => s.toggleGroupCollapsed
  );
  const moveLayerToGroup = useSketchStore((s) => s.moveLayerToGroup);
  const ungroupLayer = useSketchStore((s) => s.ungroupLayer);
  const groupLayers = useSketchStore((s) => s.groupLayers);
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setCloneStampSettings = useSketchStore(
    (s) => s.setCloneStampSettings
  );
  const swapColors = useSketchStore((s) => s.swapColors);
  const resetColors = useSketchStore((s) => s.resetColors);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);
  const setMirrorX = useSketchStore((s) => s.setMirrorX);
  const setMirrorY = useSketchStore((s) => s.setMirrorY);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);

  /** Pointer/cursor routing: spring-loaded Ctrl/Cmd+drag move without changing `activeTool`. */
  const interactionTool = useMemo<SketchTool>(
    () =>
      transientMoveModifierHeld && activeTool !== "move"
        ? "move"
        : activeTool,
    [transientMoveModifierHeld, activeTool]
  );

  const activeLayerTransform = useMemo(() => {
    return resolveDisplayedActiveLayerTransform(document, activeLayerTransformPreview);
  }, [document, activeLayerTransformPreview]);

  // Keep a ref to live toolSettings so the autosave effect can include them
  // without adding toolSettings as a dependency (which would cause autosave to
  // fire on every brush slider tick).
  const liveToolSettings = useSketchStore((s) => s.toolSettings);
  const liveToolSettingsRef = useRef(liveToolSettings);
  liveToolSettingsRef.current = liveToolSettings;

  // ─── Flush ref (filled in after canvasActions is created) ──────────
  const flushBeforeUndoRef = useRef<() => void>(() => {});

  // ─── History actions ────────────────────────────────────────────────
  const { handleUndo, handleRedo } = useHistoryActions({
    canvasRef,
    undo,
    redo,
    flushBeforeUndo: useCallback(() => flushBeforeUndoRef.current(), [])
  });

  // ─── Layer actions ──────────────────────────────────────────────────
  const layerActions = useLayerActions({
    canvasRef,
    document,
    pushHistory,
    addLayer,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    toggleLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    renameLayer,
    updateLayerData,
    setMaskLayer,
    toggleAlphaLock,
    toggleLayerExposedInput,
    toggleLayerExposedOutput,
    mergeLayerDown,
    flattenVisible,
    addGroup,
    toggleGroupCollapsed,
    moveLayerToGroup,
    ungroupLayer,
    groupLayers
  });

  // ─── Canvas actions ─────────────────────────────────────────────────
  const canvasActions = useCanvasActions({
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
  });

  // Wire up the flush-before-undo ref now that canvasActions is available.
  flushBeforeUndoRef.current = canvasActions.flushPendingCanvasSync;

  // ─── Color actions ──────────────────────────────────────────────────
  const colorActions = useColorActions({
    activeTool,
    setForegroundColor,
    setBrushSettings,
    setPencilSettings,
    setEraserSettings,
    setFillSettings,
    setBlurSettings,
    setCloneStampSettings,
    setShapeSettings,
    setGradientSettings
  });

  // ─── Segmentation actions ──────────────────────────────────────────
  const segmentation = useSegmentation({
    canvasRef,
    pushHistory
  });

  const handleRunSegmentation = useCallback(() => {
    const handler = getToolHandler("segment") as SegmentTool;
    segmentation.runSegmentation(
      [...handler.getPointPrompts()],
      handler.getBoxPrompt()
    );
  }, [segmentation]);

  const handleClearSegmentPrompts = useCallback(() => {
    const handler = getToolHandler("segment") as SegmentTool;
    handler.clearPrompts();
  }, []);

  // ─── Selection context-menu action callbacks ───────────────────────
  const handleFillSelectionWithForeground = useCallback(() => {
    const fg = useSketchStore.getState().foregroundColor;
    canvasActions.handleFillLayerWithColor(fg);
  }, [canvasActions]);

  const handleNewLayerFromContextMenu = useCallback(() => {
    layerActions.handleAddLayer();
  }, [layerActions]);

  const handleLayerViaCopy = useCallback(async () => {
    // Copy sets the internal clipboard buffer synchronously.
    canvasActions.handleCopy();
    layerActions.handleAddLayer();
    // preferInternalClipboardFirst=true so the in-app buffer is used,
    // avoiding async OS clipboard read for this operation.
    await canvasActions.handlePaste(true);
  }, [canvasActions, layerActions]);

  const handleLayerViaCut = useCallback(async () => {
    // Cut = copy + clear; both are synchronous for the internal buffer.
    canvasActions.handleCut();
    layerActions.handleAddLayer();
    await canvasActions.handlePaste(true);
  }, [canvasActions, layerActions]);

  const handleFreeTransform = useCallback(() => {
    setActiveTool("transform" as SketchTool);
  }, [setActiveTool]);

  // ─── Cancel adjustment preview if tool changes away from "adjust" ──
  const prevAdjustToolRef = useRef(activeTool);
  useEffect(() => {
    if (
      prevAdjustToolRef.current === "adjust" &&
      activeTool !== "adjust"
    ) {
      canvasActions.handleCancelAdjustments();
    }
    // Save transform baseline when switching to "transform"
    if (
      prevAdjustToolRef.current !== "transform" &&
      activeTool === "transform"
    ) {
      canvasActions.saveTransformOriginal();
    }
    // Cancel transform when switching away from "transform"
    if (
      prevAdjustToolRef.current === "transform" &&
      activeTool !== "transform"
    ) {
      canvasActions.handleTransformCancel();
    }
    // Auto-check model availability when switching to segment tool
    if (
      prevAdjustToolRef.current !== "segment" &&
      activeTool === "segment"
    ) {
      segmentation.checkModel();
    }
    prevAdjustToolRef.current = activeTool;
  }, [activeTool, canvasActions, segmentation]);

  // ─── Seed global store from prop before SketchCanvas mounts ─────────
  useLayoutEffect(() => {
    initialDocumentRef.current = initialDocument;
    if (initialDocument) {
      setDocument(initialDocument);
    }
    setCanvasReady(true);
  }, [initialDocument, setDocument]);

  // ─── Autosave on document changes ──────────────────────────────────
  // ## Autosave boundary contract
  //
  // This effect fires only on **committed** document mutations (layer CRUD,
  // history undo/redo, canvas resize, etc.) — not on hot viewport state
  // (zoom, pan), tool settings slider ticks, or transient preview state.
  //
  // - `document` comes from a narrow store selector that returns the
  //   immutable document snapshot. A new reference is produced only when
  //   the document slice mutates.
  // - `toolSettings` is merged via a stable ref (`liveToolSettingsRef`)
  //   so tool settings changes do NOT fire this effect. The ref is read
  //   at snapshot time to capture the latest settings without dependency.
  // - Export sync (image/mask) is handled separately by the deferred
  //   `pendingExportSyncRef` pattern in `useExportSyncActions`, which
  //   flushes on stroke-end, undo/redo, and nudge-session-end — never
  //   in this effect.
  useEffect(() => {
    if (onDocumentChange && canvasReady) {
      // Merge live toolSettings into the persisted document so callers receive
      // the current tool state without toolSettings mutations triggering this
      // effect on every slider tick.
      onDocumentChange({ ...document, toolSettings: liveToolSettingsRef.current });
    }
  }, [document, onDocumentChange, canvasReady]);

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
    setActiveTool,
    setZoom,
    setMirrorX,
    setMirrorY,
    setBrushSettings,
    setPencilSettings,
    setEraserSettings,
    setShapeSettings,
    setBlurSettings,
    setCloneStampSettings,
    swapColors,
    resetColors,
    togglePanelsHidden,
    cancelActiveTool: () => canvasRef.current?.cancelActiveTool(),
    handleInvertLayerColors: canvasActions.handleInvertLayerColors,
    handleTransformCommit: canvasActions.handleTransformCommit,
    handleTransformCancel: canvasActions.handleTransformCancel,
    handleTransformUndo: canvasActions.handleTransformUndo,
    handleTransformRedo: canvasActions.handleTransformRedo,
    handleLayerViaCopy,
    handleLayerViaCut
  });

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
        setDocument(doc);
        if (canvasRef.current) {
          for (const layer of doc.layers) {
            canvasRef.current.setLayerData(layer.id, layer.data ?? null);
          }
        }
      }
    }),
    [handleUndo, handleRedo, canvasActions, layerActions, setDocument]
  );

  return (
    <Box className="sketch-editor" css={styles(theme)}>
      {/* ConnectedToolbar subscribes to its own state — no prop drilling */}
      <ConnectedToolbar />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ConnectedToolTopBar handles its own panelsHidden check */}
        <ConnectedToolTopBar
          adjBrightness={canvasActions.adjBrightness}
          adjContrast={canvasActions.adjContrast}
          adjSaturation={canvasActions.adjSaturation}
          onAdjustBrightnessChange={canvasActions.setAdjBrightness}
          onAdjustContrastChange={canvasActions.setAdjContrast}
          onAdjustSaturationChange={canvasActions.setAdjSaturation}
          onAdjustApply={canvasActions.handleApplyAdjustments}
          onAdjustCancel={canvasActions.handleCancelAdjustments}
          activeLayerTransform={activeLayerTransform}
          onTransformCommit={canvasActions.handleTransformCommit}
          onTransformCancel={canvasActions.handleTransformCancel}
          onTransformReset={canvasActions.handleTransformReset}
          segmentation={segmentation}
          onRunSegmentation={handleRunSegmentation}
          onClearSegmentPrompts={handleClearSegmentPrompts}
        />

        <Box
          className="sketch-editor__canvas-region"
          sx={{ flex: 1, position: "relative", overflow: "hidden" }}
        >
          <SketchCanvasPane
            canvasReady={canvasReady}
            canvasRef={canvasRef}
            document={document}
            activeTool={activeTool}
            interactionTool={interactionTool}
            onZoomChange={setZoom}
            onPanChange={setPan}
            onStrokeStart={canvasActions.handleStrokeStart}
            onStrokeEnd={canvasActions.handleStrokeEnd}
            onCanvasLeave={canvasActions.flushLayerThumbnailsWhenIdle}
            onLayerTransformChange={canvasActions.handleCommitLayerTransform}
            onLayerTransformPreviewChange={setActiveLayerTransformPreview}
            onLayerContentBoundsChange={setLayerContentBounds}
            onBrushSizeChange={colorActions.handleBrushSizeChange}
            onContextMenu={canvasActions.handleContextMenu}
            onTransformContextMenu={canvasActions.handleTransformContextMenu}
            onCropComplete={canvasActions.handleCropComplete}
            onEyedropperPick={colorActions.handleEyedropperPick}
            onAutoPickLayer={setActiveLayer}
            onDropImage={canvasActions.handleDropImage}
            onCanvasResizeStart={
              canvasResizeHandlesEnabled
                ? canvasActions.handleCanvasResizeStart
                : undefined
            }
            onCanvasResize={
              canvasResizeHandlesEnabled
                ? canvasActions.handleCanvasResizeDrag
                : undefined
            }
            segmentation={segmentation}
          />
        </Box>
      </Box>

      {/* ConnectedLayersPanel handles its own panelsHidden check */}
      <ConnectedLayersPanel
        onClearLayer={canvasActions.handleClearLayer}
        onFlipHorizontal={layerActions.handleFlipHorizontal}
        onFlipVertical={layerActions.handleFlipVertical}
        onMergeDown={layerActions.handleMergeDown}
        onFlattenVisible={layerActions.handleFlattenVisible}
        onTrimLayerToBounds={canvasActions.handleTrimLayerToBounds}
        onCropCanvasToActiveLayerVisiblePixels={
          canvasActions.handleCropCanvasToActiveLayerVisiblePixels
        }
        onCropCanvasToActiveLayerExtents={
          canvasActions.handleCropCanvasToActiveLayerExtents
        }
        onCanvasResize={canvasActions.handleCanvasResize}
        onToggleVisibility={layerActions.handleToggleVisibility}
        onAddLayer={layerActions.handleAddLayer}
        onRemoveLayer={layerActions.handleRemoveLayer}
        onDuplicateLayer={layerActions.handleDuplicateLayer}
        onReorderLayers={layerActions.handleReorderLayers}
        onSetMaskLayer={layerActions.handleSetMaskLayer}
        onToggleAlphaLock={layerActions.handleToggleAlphaLock}
        onToggleExposedInput={layerActions.handleToggleExposedInput}
        onToggleExposedOutput={layerActions.handleToggleExposedOutput}
        onLayerOpacityChange={layerActions.handleSetLayerOpacity}
        onLayerBlendModeChange={layerActions.handleSetLayerBlendMode}
        onRenameLayer={layerActions.handleRenameLayer}
        onAddGroup={layerActions.handleAddGroup}
        onToggleGroupCollapsed={layerActions.handleToggleGroupCollapsed}
        onMoveLayerToGroup={layerActions.handleMoveLayerToGroup}
        onUngroupLayer={layerActions.handleUngroupLayer}
        onGroupSelectedLayers={layerActions.handleGroupSelectedLayers}
        onDeleteSelectedLayers={layerActions.handleDeleteSelectedLayers}
        canvasResizeHandlesEnabled={canvasResizeHandlesEnabled}
        onCanvasResizeHandlesEnabledChange={
          handleCanvasResizeHandlesEnabledChange
        }
      />

      <ConnectedContextMenu
        open={canvasActions.contextMenu !== null}
        position={canvasActions.contextMenu}
        adjBrightness={canvasActions.adjBrightness}
        adjContrast={canvasActions.adjContrast}
        adjSaturation={canvasActions.adjSaturation}
        onClose={canvasActions.handleContextMenuClose}
        onAdjustBrightnessChange={canvasActions.setAdjBrightness}
        onAdjustContrastChange={canvasActions.setAdjContrast}
        onAdjustSaturationChange={canvasActions.setAdjSaturation}
        onAdjustApply={canvasActions.handleApplyAdjustments}
        onAdjustCancel={canvasActions.handleCancelAdjustments}
        activeLayerTransform={activeLayerTransform}
        onTransformCommit={canvasActions.handleTransformCommit}
        onTransformCancel={canvasActions.handleTransformCancel}
        onTransformReset={canvasActions.handleTransformReset}
        segmentation={segmentation}
        onRunSegmentation={handleRunSegmentation}
        onClearSegmentPrompts={handleClearSegmentPrompts}
        onSwapColors={swapColors}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearLayer={canvasActions.handleClearLayer}
        onExportPng={canvasActions.handleExportPng}
        onFillSelectionWithForeground={handleFillSelectionWithForeground}
        onNewLayer={handleNewLayerFromContextMenu}
        onLayerViaCopy={handleLayerViaCopy}
        onLayerViaCut={handleLayerViaCut}
        onFreeTransform={handleFreeTransform}
      />

      <TransformContextMenu
        open={canvasActions.transformContextMenu !== null}
        position={canvasActions.transformContextMenu}
        onClose={canvasActions.handleTransformContextMenuClose}
        onTransformCommit={() => {
          canvasActions.handleTransformCommit();
          setActiveTool("move");
        }}
        onTransformCancel={() => {
          canvasActions.handleTransformCancel();
          setActiveTool("move");
        }}
        onTransformReset={canvasActions.handleTransformReset}
        onRotate90CW={() => canvasActions.handleTransformRotate(Math.PI / 2)}
        onRotate90CCW={() => canvasActions.handleTransformRotate(-Math.PI / 2)}
        onRotate180={() => canvasActions.handleTransformRotate(Math.PI)}
        onFlipHorizontal={canvasActions.handleTransformFlipH}
        onFlipVertical={canvasActions.handleTransformFlipV}
      />
    </Box>
  );
});

export default memo(SketchEditor);
