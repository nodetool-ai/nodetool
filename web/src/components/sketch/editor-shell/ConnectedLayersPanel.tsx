/**
 * ConnectedLayersPanel — subscribes to narrow document sub-fields (layers,
 * activeLayerId, maskLayerId, canvas dimensions), selectedLayerIds,
 * isolatedLayerId, panelsHidden, foregroundColor, and activeTool.
 * Does NOT re-render on toolSettings, viewport, or selection changes.
 * Canvas-metadata changes (activeLayerId, maskLayerId, canvas dimensions) only
 * trigger a rerender when they actually change, not on every layer-data mutation.
 */
import React, { memo } from "react";
import SketchLayersPanel from "../SketchLayersPanel";
import { useSketchStore } from "../state";
import { useColorIntentRouter } from "../hooks";
import type { BlendMode } from "../types";

export interface ConnectedLayersPanelProps {
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
  onAddLayer: (fillColor?: string | null) => void;
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
  onMergeSelectedLayers: () => void;
  onDeleteSelectedLayers: () => void;
  canvasResizeHandlesEnabled: boolean;
  onCanvasResizeHandlesEnabledChange: (enabled: boolean) => void;
  onLoadLayerAsSelection: (layerId: string) => void;
}

export const ConnectedLayersPanel = memo(function ConnectedLayersPanel(
  props: ConnectedLayersPanelProps
) {
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
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
  const handleFgColorChange = useColorIntentRouter();

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
      onMergeSelectedLayers={props.onMergeSelectedLayers}
      onDeleteSelectedLayers={props.onDeleteSelectedLayers}
      onLoadLayerAsSelection={props.onLoadLayerAsSelection}
    />
  );
});
