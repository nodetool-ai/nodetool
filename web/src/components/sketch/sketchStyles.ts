/**
 * Shared design tokens and MUI sx styles for the Sketch Editor.
 */

import type { SxProps, Theme } from "@mui/material/styles";
import {
  MOTION,
  BORDER_RADIUS,
  CONTROL,
  FONT_SIZE_SANS,
  SPACING,
  TYPOGRAPHY,
  reducedMotion,
  getSpacingPx
} from "../ui_primitives";

// ─── Color Tokens ─────────────────────────────────────────────────────────────
// Semantic palette roles follow the active color scheme.

export const SKETCH_COLORS = {
  bgPrimary: "background.default",     // canvas / modal backdrop
  bgSecondary: "background.paper",   // panels, toolbars
  bgHover: "action.hover",       // hover states
  border: "divider",        // all panel borders
  textPrimary: "text.primary",   // main readable text (bright)
  textSecondary: "text.secondary", // labels, secondary info
  textMuted: "text.secondary",     // placeholders, hints
  textFaint: "text.secondary",     // disabled / very subtle
 } as const;

// Checkerboard transparency pattern used for thumbnails and color swatches.
// Two shades that are visually distinct but subtle on dark backgrounds.
export const SKETCH_CHECKERBOARD = {
  backgroundImage:
    "repeating-conic-gradient(var(--palette-grey-800) 0% 25%, var(--palette-grey-900) 0% 50%)",
  backgroundSize: "8px 8px"
} as const;

// ─── Sketch layout dimensions ────────────────────────────────────────────────

export const SKETCH_SIZE = {
  /** Row min-height matches the thumbnail so the row background never shows
   *  above or below the thumbnail (flush top/bottom). */
  layerItemHeight: "32px",
  layerThumbnail: "32px",
  panelWidth: "260px",
} as const;

// ─── Tooltip delay ───────────────────────────────────────────────────────────

/** Centralised hover delay (ms) for all MUI Tooltips inside the sketch editor. */
export const SKETCH_TOOLTIP_DELAY_MS = 500;

// ─── Z-Index Scale ───────────────────────────────────────────────────────────

export const SKETCH_Z_INDEX = {
  /** Dimension/zoom readout over canvas */ readout: 5,
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
export const sketchSliderSx: SxProps<Theme> = (t) => {
  return {
    padding: `${getSpacingPx(SPACING.md)} 0`,
    "& .MuiSlider-rail": {
      height: "2px",
      opacity: 0.3,
      backgroundColor: t.vars.palette.grey[400]
    },
    "& .MuiSlider-track": {
      height: "2px",
      border: "none",
      backgroundColor: t.vars.palette.grey[300]
    },
    "& .MuiSlider-thumb": {
      width: "10px",
      height: "10px",
      backgroundColor: t.vars.palette.grey[200],
      boxShadow: "none",
      transition: `box-shadow ${MOTION.fast}`,
      ...reducedMotion({ transition: MOTION.none }),
      // Brightest neutral on hover (#FCFCFC), never pure #fff.
      "&:hover": {
        boxShadow: "none",
        backgroundColor: t.vars.palette.c_brightest
      },
      // Keyboard focus stays visibly distinct from hover: a Studio-Blue
      // ring (WCAG 2.2 AA). Previously this shared the hover rule and set
      // `boxShadow: none`, erasing the focus indicator entirely.
      "&.Mui-focusVisible": {
        boxShadow: `0 0 0 3px ${t.vars.palette.primary.main}`,
        backgroundColor: t.vars.palette.c_brightest
      },
      "&::before": { display: "none" }
    }
  };
};

/**
 * Compact ToggleButton sizing used throughout tool settings panels.
 * Apply directly: `<ToggleButton sx={toggleButtonSmallSx} />`
 *
 * Selected state uses MUI's default theme styling (no loud override).
 */
export const toggleButtonSmallSx: SxProps<Theme> = {
  fontSize: FONT_SIZE_SANS.caption,
  py: getSpacingPx(SPACING.micro),
  px: getSpacingPx(SPACING.sm),
  fontWeight: 500
};

/**
 * Compact icon button padding used across panels and toolbars.
 */
export const iconButtonCompactSx: SxProps<Theme> = {
  padding: getSpacingPx(SPACING.xs),
};

/**
 * Color swatch: small square with checkerboard behind for alpha visibility.
 * Spread into `sx` on a Box wrapping a color layer.
 */
export const colorSwatchSx = {
  position: "relative",
  ...SKETCH_CHECKERBOARD,
  borderRadius: BORDER_RADIUS.sm,
  width: "24px",
  height: "24px",
  overflow: "hidden",
  cursor: "pointer",
  flexShrink: 0,
  border: "1px solid var(--palette-c_overlay_strong)",
} as const;

/**
 * Shared `.setting-row` child styles for tool-settings contexts.
 * Used by the top bar, modal header, and context menu tool-settings panel.
 * Pass a theme to get resolved palette colors.
 */
export const settingRowChildrenSx = (t: Theme) => ({
  // A cluster of related controls. Groups are what wrap on a narrow bar, so
  // a slider never gets separated from the label and value that name it.
  // The group gap keeps related rows closer than separate sections.
  "& .setting-group": {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
    maxWidth: "100%",
    gap: getSpacingPx(SPACING.lg),
    minHeight: CONTROL.height.sm
  },
  "& .setting-row": {
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.sm),
    minHeight: CONTROL.height.sm,
    // Reserve a fixed-width column for the numeric value so the row
    // length never changes when digits flip (e.g. 100% → 99% → 100%).
    // Previously `minWidth: 24px` allowed the value cell to grow with
    // its content and shoved every following row a pixel or two to
    // the right, which looked like the whole bar was "jumping".
    "& .setting-value": {
      ...TYPOGRAPHY.mono.code,
      width: "36px",
      flexShrink: 0,
      // Left, not right: right-aligned digits sat a whole empty cell away
      // from the slider they belong to and next to the following label, so
      // the bar read "100 Feather" instead of "Min Size 100".
      textAlign: "left",
      color: t.vars.palette.text.primary,
    },
    "& .setting-label": {
      ...TYPOGRAPHY.sans.label,
      whiteSpace: "nowrap",
      color: t.vars.palette.text.secondary,
    },
    "& .MuiSlider-root": {
      width: "72px",
      minWidth: "56px",
      // Minimal clearance — the thumb may touch label/value at the
      // extremes but the wider gap looked airy and disconnected.
      marginLeft: getSpacingPx(SPACING.micro),
      marginRight: getSpacingPx(SPACING.micro),
    },
  },
  // One control height across the bar: pickers, toggles, fields, and buttons
  // all sit on the same 28px band, so a wrapped row is a straight line rather
  // than a staircase.
  "& .MuiToggleButtonGroup-root, & .MuiInputBase-root, & .MuiButton-root": {
    minHeight: CONTROL.height.sm
  },
  "& .MuiInputBase-input": {
    ...TYPOGRAPHY.sans.label,
    paddingTop: getSpacingPx(SPACING.xs),
    paddingBottom: getSpacingPx(SPACING.xs)
  },
  // Give the frequently adjusted Size slider more room than secondary sliders.
  "& .setting-row--wide": {
    "& .MuiSlider-root": {
      width: "112px",
      minWidth: "80px",
    },
  },
  "& .MuiToggleButtonGroup-root": {
    "& .MuiToggleButton-root": {
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      ...TYPOGRAPHY.sans.label,
      // Keep selection visible in both color schemes.
      "&.Mui-selected": {
        backgroundColor: t.vars.palette.action.selected,
        color: t.vars.palette.text.primary,
        "&:hover": {
          backgroundColor: t.vars.palette.action.hover,
        },
      },
    },
  },
} as const);

/**
 * Color-picker custom slider thumb: white border, subtle shadow. Used by hue
 * and opacity sliders in `ColorPickerPopover`.
 */
export const colorPickerSliderThumbSx = {
  border: "2px solid var(--palette-grey-0)",
  boxShadow: "0 0 0 1px var(--palette-c_scrim)",
  "&:hover, &.Mui-focusVisible": {
    boxShadow: "0 0 0 2px var(--palette-c_overlay_strong)",
  },
} as const;

/**
 * Layout + `.setting-row` styles when tool settings panels render outside the top bar
 * (e.g. context menu): vertical stack, full-width sliders.
 */
export const sketchToolSettingsContainerSx: SxProps<Theme> = (t) => {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: getSpacingPx(SPACING.sm),
    minWidth: 0,
    // Stacked context: a group is a column of rows, with no divider.
    "& .setting-group": {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: getSpacingPx(SPACING.sm),
      minWidth: 0
    },
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      flexWrap: "nowrap",
      "& .MuiSlider-root": {
        flex: "1 1 80px",
        minWidth: "60px",
        width: "100%",
        maxWidth: "100%",
        marginLeft: getSpacingPx(SPACING.micro),
        marginRight: getSpacingPx(SPACING.micro),
      },
      "& .setting-label": {
        ...TYPOGRAPHY.sans.label,
        whiteSpace: "nowrap",
        color: t.vars.palette.text.secondary,
      },
      "& .setting-value": {
        ...TYPOGRAPHY.mono.code,
        width: "36px",
        flexShrink: 0,
        textAlign: "right",
        color: t.vars.palette.text.primary,
      },
    },
    "& .MuiToggleButtonGroup-root": {
      alignSelf: "stretch",
      flexWrap: "wrap",
      "& .MuiToggleButton-root": {
        padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
        ...TYPOGRAPHY.sans.label,
        "&.Mui-selected": {
          backgroundColor: t.vars.palette.action.selected,
          color: t.vars.palette.text.primary,
          "&:hover": {
            backgroundColor: t.vars.palette.action.hover,
          },
        },
      },
    },
    "& .MuiIconButton-root": {
      padding: getSpacingPx(SPACING.xs),
    },
  };
};

// ─── Shared Button / Hint Styles ──────────────────────────────────────────

/**
 * Small action buttons (Apply, Cancel, Commit, Reset) used in tool settings.
 * Keeps font and padding consistent across all panels.
 */
export const sketchButtonSmallSx: SxProps<Theme> = {
  ...TYPOGRAPHY.sans.label,
  py: SPACING.micro,
  minHeight: CONTROL.height.sm,
  minWidth: "56px",
};

/**
 * Italic hint text (e.g. "Alt+click to set source point", "No settings for this tool").
 */
export const sketchHintTextSx: SxProps<Theme> = {
  fontSize: FONT_SIZE_SANS.label,
  color: SKETCH_COLORS.textFaint,
  fontStyle: "italic",
};


/** Quiet editable surface. Hover, focus, and errors retain distinct outlines. */
export const sketchFieldSx = {
  backgroundColor: "action.hover",
  borderRadius: BORDER_RADIUS.sm,
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "divider" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
  "&.Mui-error .MuiOutlinedInput-notchedOutline": { borderColor: "error.main" }
} as const;
