/**
 * useSketchStoreSelectors
 *
 * Shared resolved-tool-settings hook and narrow selector helpers used by
 * connected shell components.
 *
 * ## Design notes
 *
 * `useResolvedToolSettings` is the canonical way to read *all* tool settings
 * with defaults merged. Use `useActiveToolSettings()` when a component only
 * needs the settings for the currently active tool.
 *
 * See STORE_RULES.md for the full subscription architecture and rules.
 */

import { useMemo } from "react";
import { useSketchStore } from "../state";
import type { SketchTool } from "../types";
import { isShapeTool } from "../types";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_PEN_PRESSURE,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_CLONE_STAMP_SETTINGS,
  DEFAULT_SELECT_SETTINGS,
  DEFAULT_SEGMENT_SETTINGS,
  DEFAULT_MOVE_SETTINGS,
  DEFAULT_TRANSFORM_SETTINGS
} from "../types";

/**
 * Returns tool settings with defaults defensively merged.
 *
 * The result is memoised on the raw `toolSettings` slice so the reference
 * stays stable across renders that don't change tool settings.
 */
export function useResolvedToolSettings() {
  const liveToolSettings = useSketchStore((s) => s.toolSettings);

  return useMemo(() => {
    const resolvedPenPressure = {
      ...DEFAULT_PEN_PRESSURE,
      ...liveToolSettings.penPressure
    };

    return {
      brush: {
        ...DEFAULT_BRUSH_SETTINGS,
        ...liveToolSettings.brush,
        ...resolvedPenPressure
      },
      pencil: {
        ...DEFAULT_PENCIL_SETTINGS,
        ...liveToolSettings.pencil,
        ...resolvedPenPressure
      },
      eraser: { ...DEFAULT_ERASER_SETTINGS, ...liveToolSettings.eraser },
      penPressure: resolvedPenPressure,
      shape: { ...DEFAULT_SHAPE_SETTINGS, ...liveToolSettings.shape },
      fill: { ...DEFAULT_FILL_SETTINGS, ...liveToolSettings.fill },
      blur: { ...DEFAULT_BLUR_SETTINGS, ...liveToolSettings.blur },
      gradient: {
        ...DEFAULT_GRADIENT_SETTINGS,
        ...liveToolSettings.gradient
      },
      cloneStamp: {
        ...DEFAULT_CLONE_STAMP_SETTINGS,
        ...liveToolSettings.cloneStamp
      },
      select: { ...DEFAULT_SELECT_SETTINGS, ...liveToolSettings.select },
      segment: { ...DEFAULT_SEGMENT_SETTINGS, ...liveToolSettings.segment },
      move: { ...DEFAULT_MOVE_SETTINGS, ...liveToolSettings.move },
      transform: { ...DEFAULT_TRANSFORM_SETTINGS, ...liveToolSettings.transform }
    };
  }, [liveToolSettings]);
}

// ─── Active-tool-only resolved settings ─────────────────────────────────────

/** Map from active tool name to the key in the resolved settings object. */
function toolToSettingsKey(
  tool: SketchTool
): keyof ReturnType<typeof useResolvedToolSettings> | null {
  if (tool === "brush") return "brush";
  if (tool === "pencil") return "pencil";
  if (tool === "eraser") return "eraser";
  if (isShapeTool(tool)) return "shape";
  if (tool === "fill") return "fill";
  if (tool === "blur") return "blur";
  if (tool === "gradient") return "gradient";
  if (tool === "clone_stamp") return "cloneStamp";
  if (tool === "select") return "select";
  if (tool === "segment") return "segment";
  return null;
}

/**
 * Returns the resolved settings for the currently active tool only.
 *
 * This is narrower than `useResolvedToolSettings()`: it selects only the
 * raw sub-object for the active tool from the store and resolves defaults
 * in a memoised pass, so a brush-slider change while the eraser is active
 * does **not** trigger a rerender.
 */
export function useActiveToolSettings() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const liveToolSettings = useSketchStore((s) => s.toolSettings);

  return useMemo(() => {
    const key = toolToSettingsKey(activeTool);
    if (!key) return null;

    const resolvedPenPressure = {
      ...DEFAULT_PEN_PRESSURE,
      ...liveToolSettings.penPressure
    };

    switch (key) {
      case "brush":
        return {
          ...DEFAULT_BRUSH_SETTINGS,
          ...liveToolSettings.brush,
          ...resolvedPenPressure
        };
      case "pencil":
        return {
          ...DEFAULT_PENCIL_SETTINGS,
          ...liveToolSettings.pencil,
          ...resolvedPenPressure
        };
      case "eraser":
        return { ...DEFAULT_ERASER_SETTINGS, ...liveToolSettings.eraser };
      case "shape":
        return { ...DEFAULT_SHAPE_SETTINGS, ...liveToolSettings.shape };
      case "fill":
        return { ...DEFAULT_FILL_SETTINGS, ...liveToolSettings.fill };
      case "blur":
        return { ...DEFAULT_BLUR_SETTINGS, ...liveToolSettings.blur };
      case "gradient":
        return { ...DEFAULT_GRADIENT_SETTINGS, ...liveToolSettings.gradient };
      case "cloneStamp":
        return {
          ...DEFAULT_CLONE_STAMP_SETTINGS,
          ...liveToolSettings.cloneStamp
        };
      case "select":
        return { ...DEFAULT_SELECT_SETTINGS, ...liveToolSettings.select };
      case "segment":
        return { ...DEFAULT_SEGMENT_SETTINGS, ...liveToolSettings.segment };
      default:
        return null;
    }
  }, [activeTool, liveToolSettings]);
}
