/**
 * Shared design tokens and MUI sx styles for the Sketch Editor.
 *
 * Import from here instead of repeating values inline.
 * Keep all sketch-wide visual constants in one place.
 */

import type { SxProps, Theme } from "@mui/material/styles";
import { parseColorToRgba, rgbaToCss } from "./types";

// ─── Color Tokens ─────────────────────────────────────────────────────────────
// Semantic names tied to MUI's grey palette (dark theme).

export const SKETCH_COLORS = {
  bgPrimary: "grey.900",     // canvas / modal backdrop
  bgSecondary: "grey.800",   // panels, toolbars
  bgHover: "grey.700",       // hover states
  border: "grey.700",        // all panel borders
  textPrimary: "grey.200",   // main readable text
  textSecondary: "grey.400", // labels, secondary info
  textMuted: "grey.500",     // placeholders, hints
} as const;

// Checkerboard transparency pattern used for thumbnails and color swatches.
// Two shades that are visually distinct but subtle on dark backgrounds.
export const SKETCH_CHECKERBOARD = {
  backgroundImage:
    "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)",
  backgroundSize: "8px 8px",
} as const;

// ─── Typography Scale ──────────────────────────────────────────────────────────

export const SKETCH_FONT = {
  /** Tiny labels, FG/BG text */         xs: "0.6rem",
  /** Setting labels, value readouts */  sm: "0.65rem",
  /** Layer names, general UI */         md: "0.7rem",
  /** Panel section headings */         section: "0.72rem",
} as const;

// ─── Spacing / Size Scale ─────────────────────────────────────────────────────

export const SKETCH_SIZE = {
  /** Row min-height; thumbnails sized to match (~40% larger than original 36/28). */
  layerItemHeight: "50.4px",
  layerThumbnail: "39.2px",
  panelWidth:      "260px",
  iconButtonPad:   "3px",
  borderRadius:    "4px",
} as const;

// ─── Shared sx Objects ────────────────────────────────────────────────────────

/**
 * Minimal, professional slider — thin 2px track, small 10px thumb, no shadows.
 * Apply directly: `<Slider sx={sketchSliderSx} />`
 */
export const sketchSliderSx: SxProps<Theme> = (theme) => ({
  padding: "8px 0",
  "& .MuiSlider-rail": {
    height: "2px",
    opacity: 0.3,
    backgroundColor: (theme as Theme).palette.grey[400],
  },
  "& .MuiSlider-track": {
    height: "2px",
    border: "none",
    backgroundColor: (theme as Theme).palette.grey[300],
  },
  "& .MuiSlider-thumb": {
    width: "10px",
    height: "10px",
    backgroundColor: (theme as Theme).palette.grey[200],
    boxShadow: "none",
    "&:hover, &.Mui-focusVisible": {
      boxShadow: "none",
      backgroundColor: "#fff",
    },
    "&::before": { display: "none" },
  },
});

/**
 * Compact ToggleButton sizing used throughout tool settings panels.
 * Apply directly: `<ToggleButton sx={toggleButtonSmallSx} />`
 */
export const toggleButtonSmallSx: SxProps<Theme> = {
  fontSize: SKETCH_FONT.xs,
  py: "2px",
  px: "6px",
};

/**
 * Layout + `.setting-row` styles when tool settings panels render outside the top bar
 * (e.g. context menu): vertical stack, full-width sliders.
 */
export const sketchToolSettingsContainerSx: SxProps<Theme> = (theme) => {
  const t = theme as Theme;
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "6px",
    minWidth: 0,
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap",
      "& .MuiSlider-root": {
        flex: "1 1 140px",
        minWidth: "120px",
        width: "100%",
        maxWidth: "100%"
      },
      "& .setting-label": {
        fontSize: SKETCH_FONT.sm,
        whiteSpace: "nowrap",
        color: t.palette.grey[300]
      },
      "& .setting-value": {
        fontSize: SKETCH_FONT.sm,
        minWidth: "24px",
        textAlign: "right",
        color: t.palette.grey[200]
      }
    },
    "& .MuiToggleButtonGroup-root": {
      alignSelf: "stretch",
      flexWrap: "wrap",
      "& .MuiToggleButton-root": {
        padding: "2px 6px",
        fontSize: "0.6rem"
      }
    },
    "& .MuiIconButton-root": {
      padding: "3px"
    }
  };
};

// ─── Color Utilities ──────────────────────────────────────────────────────────

/**
 * Native color inputs return #rrggbb hex; this preserves the existing alpha
 * from the stored CSS color when merging a new RGB value from the picker.
 */
export function mergeHexPickerRgbPreserveAlpha(
  stored: string,
  pickerHex: string
): string {
  const { a } = parseColorToRgba(stored);
  const { r, g, b } = parseColorToRgba(pickerHex);
  return rgbaToCss({ r, g, b, a });
}
