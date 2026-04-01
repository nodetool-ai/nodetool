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
  /** Channel labels (R/G/B, H/S/L) */  xxs: "0.45rem",
  /** FG/BG labels, tiny readouts */     xs: "0.6rem",
  /** Setting labels, value readouts */  sm: "0.65rem",
  /** Layer names, general UI */         md: "0.7rem",
  /** Panel section headings */          section: "0.72rem",
} as const;

// ─── Spacing / Size Scale ─────────────────────────────────────────────────────

export const SKETCH_SPACING = {
  /** Tight inner padding (icon buttons, tiny gaps) */  xs: "2px",
  /** Standard inner gap (between small elements) */    sm: "4px",
  /** Default component gap */                          md: "6px",
  /** Generous gap (between sections) */                lg: "8px",
  /** Panel-level padding */                            xl: "12px",
} as const;

export const SKETCH_SIZE = {
  /** Row min-height; thumbnails sized to match (~40% larger than original 36/28). */
  layerItemHeight: "50.4px",
  layerThumbnail: "39.2px",
  panelWidth:      "260px",
  iconButtonPad:   "3px",
  borderRadius:    "4px",
} as const;

// ─── Z-Index Scale ───────────────────────────────────────────────────────────

export const SKETCH_Z_INDEX = {
  /** Resize handles around canvas */    handles: 6,
  /** Cursor overlay, selection ants */  overlay: 10,
  /** Modal covering the editor */       modal: 9999,
  /** Popovers above the modal */        popover: 10001,
} as const;

// ─── Shared sx Objects ────────────────────────────────────────────────────────

/**
 * Minimal, professional slider — thin 2px track, small 10px thumb, no shadows.
 * Apply directly: `<Slider sx={sketchSliderSx} />`
 */
export const sketchSliderSx: SxProps<Theme> = (theme) => ({
  padding: `${SKETCH_SPACING.lg} 0`,
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
  py: SKETCH_SPACING.xs,
  px: SKETCH_SPACING.md,
};

/**
 * Compact icon button padding used across panels and toolbars.
 */
export const iconButtonCompactSx: SxProps<Theme> = {
  padding: SKETCH_SIZE.iconButtonPad,
};

/**
 * Color swatch: small square with checkerboard behind for alpha visibility.
 * Spread into `sx` on a Box wrapping a color layer.
 */
export const colorSwatchSx = {
  position: "relative",
  ...SKETCH_CHECKERBOARD,
  borderRadius: "3px",
  width: "24px",
  height: "24px",
  overflow: "hidden",
  cursor: "pointer",
  flexShrink: 0,
  border: "1px solid rgba(255,255,255,0.2)",
} as const;

/**
 * Shared `.setting-row` child styles for tool-settings contexts.
 * Used by the top bar, modal header, and context menu tool-settings panel.
 * Pass a theme to get resolved palette colors.
 */
export const settingRowChildrenSx = (t: Theme) => ({
  "& .setting-row": {
    display: "flex",
    alignItems: "center",
    gap: SKETCH_SPACING.sm,
    "& .MuiSlider-root": {
      width: "80px",
      minWidth: "60px",
    },
    "& .setting-label": {
      fontSize: SKETCH_FONT.sm,
      whiteSpace: "nowrap",
      color: t.vars.palette.grey[300],
    },
    "& .setting-value": {
      fontSize: SKETCH_FONT.sm,
      minWidth: "24px",
      textAlign: "right",
      color: t.vars.palette.grey[200],
    },
  },
  "& .MuiToggleButtonGroup-root": {
    "& .MuiToggleButton-root": {
      padding: `${SKETCH_SPACING.xs} ${SKETCH_SPACING.md}`,
      fontSize: SKETCH_FONT.xs,
    },
  },
} as const);

/**
 * Color-picker custom slider thumb: white border, subtle shadow. Used by hue
 * and opacity sliders in `ColorPickerPopover`.
 */
export const colorPickerSliderThumbSx = {
  border: "2px solid #fff",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
  "&:hover, &.Mui-focusVisible": {
    boxShadow: "0 0 0 2px rgba(255,255,255,0.3)",
  },
} as const;

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
    gap: SKETCH_SPACING.md,
    minWidth: 0,
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: SKETCH_SPACING.lg,
      flexWrap: "wrap",
      "& .MuiSlider-root": {
        flex: "1 1 140px",
        minWidth: "120px",
        width: "100%",
        maxWidth: "100%",
      },
      "& .setting-label": {
        fontSize: SKETCH_FONT.sm,
        whiteSpace: "nowrap",
        color: t.palette.grey[300],
      },
      "& .setting-value": {
        fontSize: SKETCH_FONT.sm,
        minWidth: "24px",
        textAlign: "right",
        color: t.palette.grey[200],
      },
    },
    "& .MuiToggleButtonGroup-root": {
      alignSelf: "stretch",
      flexWrap: "wrap",
      "& .MuiToggleButton-root": {
        padding: `${SKETCH_SPACING.xs} ${SKETCH_SPACING.md}`,
        fontSize: SKETCH_FONT.xs,
      },
    },
    "& .MuiIconButton-root": {
      padding: SKETCH_SIZE.iconButtonPad,
    },
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
