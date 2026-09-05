/**
 * useSketchStoreSelectors
 *
 * Shared resolved-tool-settings hook and narrow selector helpers used by
 * connected shell components.
 *
 * ## Design notes
 *
 * `useResolvedToolSettings` is the canonical way to read *all* tool settings
 * with defaults merged.
 *
 * See STORE_RULES.md for the full subscription architecture and rules.
 */

import { useMemo } from "react";
import { useSketchStore } from "../state";
import type { ToolSettings } from "../types";
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
export function useResolvedToolSettings(): ToolSettings {
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
      transform: (() => {
        const merged = {
          ...DEFAULT_TRANSFORM_SETTINGS,
          ...liveToolSettings.transform
        };
        // Persisted settings from older versions may still hold modes that
        // were removed by the Affinity-parity consolidation. Coerce them so
        // the panel renders a valid selection and gesture resolution stays
        // sane: legacy quad-tag aliases map to their current equivalents,
        // anything else (incl. the old "auto" mode) falls back to default.
        const raw = merged.mode as string;
        if (raw === "warp") {
          merged.mode = "distort";
        } else if (raw === "perspective-distort" || raw === "perspective-dual") {
          merged.mode = "perspective";
        } else if (
          raw !== "scale" &&
          raw !== "distort" &&
          raw !== "skew" &&
          raw !== "perspective" &&
          raw !== "mesh-warp"
        ) {
          merged.mode = DEFAULT_TRANSFORM_SETTINGS.mode;
        }
        return merged;
      })()
    };
  }, [liveToolSettings]);
}
