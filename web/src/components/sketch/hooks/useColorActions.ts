/**
 * useColorActions
 *
 * Eyedropper handling, foreground/background color management,
 * and S+drag brush-size changes.
 */

import { useCallback, useEffect } from "react";
import type { SketchTool } from "../types";
import { mergeRgbHexIntoColor } from "../types";
import { useSketchStore } from "../state";

export interface UseColorActionsParams {
  activeTool: SketchTool;
  setForegroundColor: (color: string) => void;
  setBrushSettings: (settings: { color?: string; size?: number }) => void;
  setPencilSettings: (settings: { color?: string; size?: number }) => void;
  setEraserSettings: (settings: { size?: number }) => void;
  setFillSettings: (settings: { color?: string }) => void;
  setBlurSettings: (settings: { size?: number }) => void;
  setCloneStampSettings: (settings: { size?: number }) => void;
}

export function useColorActions({
  activeTool,
  setForegroundColor,
  setBrushSettings,
  setPencilSettings,
  setEraserSettings,
  setFillSettings,
  setBlurSettings,
  setCloneStampSettings
}: UseColorActionsParams) {
  // ─── Eyedropper event (tool = eyedropper) ────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.color) {
        const fg = useSketchStore.getState().foregroundColor;
        const merged = mergeRgbHexIntoColor(detail.color, fg);
        setForegroundColor(merged);
        setBrushSettings({ color: merged });
      }
    };
    window.addEventListener("sketch-eyedropper", handler);
    return () => window.removeEventListener("sketch-eyedropper", handler);
  }, [setBrushSettings, setForegroundColor]);

  // ─── Alt+click eyedropper pick (stays on current tool) ──────────
  const handleEyedropperPick = useCallback(
    (color: string) => {
      const fg = useSketchStore.getState().foregroundColor;
      const merged = mergeRgbHexIntoColor(color, fg);
      setForegroundColor(merged);
      const tool = activeTool;
      if (tool === "brush") {
        setBrushSettings({ color: merged });
      } else if (tool === "pencil") {
        setPencilSettings({ color: merged });
      } else if (tool === "fill") {
        setFillSettings({ color: merged });
      }
    },
    [activeTool, setForegroundColor, setBrushSettings, setPencilSettings, setFillSettings]
  );

  // ─── S + drag brush size change ────────────────────────────────
  const handleBrushSizeChange = useCallback(
    (size: number) => {
      const tool = activeTool;
      if (tool === "brush") {
        setBrushSettings({ size });
      } else if (tool === "pencil") {
        setPencilSettings({ size });
      } else if (tool === "eraser") {
        setEraserSettings({ size });
      } else if (tool === "blur") {
        setBlurSettings({ size });
      } else if (tool === "clone_stamp") {
        setCloneStampSettings({ size });
      } else {
        setBrushSettings({ size });
      }
    },
    [
      activeTool,
      setBrushSettings,
      setPencilSettings,
      setEraserSettings,
      setBlurSettings,
      setCloneStampSettings
    ]
  );

  return { handleEyedropperPick, handleBrushSizeChange };
}
