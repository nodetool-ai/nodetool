/**
 * useColorActions
 *
 * Eyedropper handling, foreground/background color management,
 * and S+drag brush-size changes.
 */

import { useCallback, useEffect, useRef } from "react";
import type { SketchTool } from "../types";
import { isShapeTool, mergeRgbHexIntoColor } from "../types";
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
  setShapeSettings: (settings: { strokeColor?: string }) => void;
  setGradientSettings: (settings: { startColor?: string }) => void;
}

/** Sync the foreground color into the given tool's color setting. */
function syncFgToTool(
  tool: SketchTool,
  color: string,
  setBrushSettings: (s: { color?: string }) => void,
  setPencilSettings: (s: { color?: string }) => void,
  setFillSettings: (s: { color?: string }) => void,
  setShapeSettings: (s: { strokeColor?: string }) => void,
  setGradientSettings: (s: { startColor?: string }) => void
): void {
  if (tool === "brush") {
    setBrushSettings({ color });
  } else if (tool === "pencil") {
    setPencilSettings({ color });
  } else if (tool === "fill") {
    setFillSettings({ color });
  } else if (isShapeTool(tool)) {
    setShapeSettings({ strokeColor: color });
  } else if (tool === "gradient") {
    setGradientSettings({ startColor: color });
  }
}

export function useColorActions({
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
}: UseColorActionsParams) {
  // ─── Eyedropper event (tool = eyedropper) ────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.color) {
        const fg = useSketchStore.getState().foregroundColor;
        const merged = mergeRgbHexIntoColor(detail.color, fg);
        setForegroundColor(merged);
        // Sync to whichever tool is active (eyedropper keeps previous tool context)
        const tool = useSketchStore.getState().activeTool;
        syncFgToTool(
          tool,
          merged,
          setBrushSettings,
          setPencilSettings,
          setFillSettings,
          setShapeSettings,
          setGradientSettings
        );
      }
    };
    window.addEventListener("sketch-eyedropper", handler);
    return () => window.removeEventListener("sketch-eyedropper", handler);
  }, [
    setBrushSettings,
    setPencilSettings,
    setFillSettings,
    setShapeSettings,
    setGradientSettings,
    setForegroundColor
  ]);

  // ─── Sync foreground color on tool change ───────────────────────
  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    if (prevToolRef.current !== activeTool) {
      prevToolRef.current = activeTool;
      const fg = useSketchStore.getState().foregroundColor;
      syncFgToTool(
        activeTool,
        fg,
        setBrushSettings,
        setPencilSettings,
        setFillSettings,
        setShapeSettings,
        setGradientSettings
      );
    }
  }, [
    activeTool,
    setBrushSettings,
    setPencilSettings,
    setFillSettings,
    setShapeSettings,
    setGradientSettings
  ]);

  // ─── Alt+click eyedropper pick (stays on current tool) ──────────
  const handleEyedropperPick = useCallback(
    (color: string) => {
      const fg = useSketchStore.getState().foregroundColor;
      const merged = mergeRgbHexIntoColor(color, fg);
      setForegroundColor(merged);
      syncFgToTool(
        activeTool,
        merged,
        setBrushSettings,
        setPencilSettings,
        setFillSettings,
        setShapeSettings,
        setGradientSettings
      );
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
