/**
 * ConnectedCanvasSizePanel — document canvas dimensions + resize-handle preference;
 * delegates actions to session props. Hidden when `panelsHidden`.
 */
import React, { memo } from "react";
import SketchCanvasSizePanel from "../SketchCanvasSizePanel";
import { useSketchStore } from "../state";

export interface ConnectedCanvasSizePanelProps {
  onCanvasResize: (width: number, height: number) => void;
  canvasResizeHandlesEnabled: boolean;
  onCanvasResizeHandlesEnabledChange: (enabled: boolean) => void;
}

export const ConnectedCanvasSizePanel = memo(function ConnectedCanvasSizePanel({
  onCanvasResize,
  canvasResizeHandlesEnabled,
  onCanvasResizeHandlesEnabledChange
}: ConnectedCanvasSizePanelProps) {
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const canvasWidth = useSketchStore((s) => s.document.canvas.width);
  const canvasHeight = useSketchStore((s) => s.document.canvas.height);

  if (panelsHidden) {
    return null;
  }

  return (
    <SketchCanvasSizePanel
      canvasWidth={canvasWidth}
      canvasHeight={canvasHeight}
      onCanvasResize={onCanvasResize}
      canvasResizeHandlesEnabled={canvasResizeHandlesEnabled}
      onCanvasResizeHandlesEnabledChange={onCanvasResizeHandlesEnabledChange}
    />
  );
});
