/**
 * SketchCanvasPane subscribes directly to hot viewport state (zoom, pan)
 * and canvas-specific state (mirror, symmetry, selection, foreground, isolated)
 * so the parent SketchEditor doesn't need to forward them.
 */
import React, { memo, useCallback, useEffect } from "react";
import type { Asset } from "../../../stores/ApiTypes";
import SketchCanvas, { type SketchCanvasRef } from "../SketchCanvas";
import { useSketchStore } from "../state";
import type { LayerContentBounds, LayerTransform, Point } from "../types";
import type { StrokeEndOptions } from "../tools/types";
import type { useSegmentation } from "../hooks/useSegmentation";

export interface SketchCanvasPaneProps {
  canvasReady: boolean;
  canvasRef: React.RefObject<SketchCanvasRef | null>;
  document: import("../types").SketchDocument;
  activeTool: import("../types").SketchTool;
  interactionTool: import("../types").SketchTool;
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
  onDropAsset?: (asset: Asset) => void;
  onCanvasResizeStart?: () => void;
  onCanvasResize?: (
    width: number,
    height: number,
    options?: { translateLayers?: Point; resizeFromCenter?: boolean }
  ) => void;
  segmentation: ReturnType<typeof useSegmentation>;
}

export const SketchCanvasPane = memo(function SketchCanvasPane({
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
  onLayerContentBoundsChange,
  onBrushSizeChange,
  onContextMenu,
  onTransformContextMenu,
  onCropComplete,
  onEyedropperPick,
  onAutoPickLayer,
  onDropImage,
  onDropAsset,
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
  const pushHistory = useSketchStore((s) => s.pushHistory);

  const handleSelectionChange = useCallback((sel: import("../types").Selection | null) => {
    setSelection(sel);
    pushHistory("selection", undefined, { selectionOnly: true });
  }, [setSelection, pushHistory]);

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
      onLayerContentBoundsChange={onLayerContentBoundsChange}
      onBrushSizeChange={onBrushSizeChange}
      onContextMenu={onContextMenu}
      onTransformContextMenu={onTransformContextMenu}
      onCropComplete={onCropComplete}
      onEyedropperPick={onEyedropperPick}
      selection={selection}
      onSelectionChange={handleSelectionChange}
      onAutoPickLayer={onAutoPickLayer}
      foregroundColor={foregroundColor}
      onDropImage={onDropImage}
      onDropAsset={onDropAsset}
      onCanvasResizeStart={onCanvasResizeStart}
      onCanvasResize={onCanvasResize}
    />
  );
});
