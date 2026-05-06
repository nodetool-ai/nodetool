/**
 * ConnectedToolbar — subscribes to activeTool, select mode, and colors only.
 * Does NOT re-render on document, toolSettings, selection, or viewport changes.
 */
import React, { memo } from "react";
import SketchToolbar from "../SketchToolbar";
import { useSketchStore } from "../state";
import { useColorIntentRouter } from "../hooks";

export const ConnectedToolbar = memo(function ConnectedToolbar() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const selectMode = useSketchStore((s) => s.toolSettings.select.mode);
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const backgroundColor = useSketchStore((s) => s.backgroundColor) || "#000000";
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const setBackgroundColor = useSketchStore((s) => s.setBackgroundColor);
  const swapColors = useSketchStore((s) => s.swapColors);
  const resetColors = useSketchStore((s) => s.resetColors);
  const handleFgColorChange = useColorIntentRouter();

  return (
    <SketchToolbar
      activeTool={activeTool}
      selectMode={selectMode}
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
