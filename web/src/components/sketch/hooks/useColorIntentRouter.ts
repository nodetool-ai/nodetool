/**
 * useColorIntentRouter
 *
 * Routes a new foreground color to both the global `foregroundColor` state
 * and the active tool's color setting.
 */

import { useCallback } from "react";
import { useSketchStore } from "../state";
import { isShapeTool } from "../types";

/**
 * Returns a stable callback that:
 * 1. Sets the global foreground color.
 * 2. Syncs the color into the active tool's own color/strokeColor setting.
 *
 * The callback subscribes to `activeTool` via the store so it always routes
 * to the correct tool without the caller needing to know which tool is active.
 */
export function useColorIntentRouter(): (color: string) => void {
  const activeTool = useSketchStore((s) => s.activeTool);
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);

  return useCallback(
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
        // Default fallback: route to brush settings so even non-painting tools
        // (e.g. select, move) keep the brush color in sync with foreground.
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
}
