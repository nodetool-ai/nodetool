/**
 * Shared design tokens and MUI sx styles for the Sketch Editor.
 */

import type { SxProps, Theme } from "@mui/material/styles";
import {
  MOTION,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx
} from "../ui_primitives";

// ─── Color Tokens ─────────────────────────────────────────────────────────────
// Semantic names tied to MUI's grey palette (dark theme).

export const SKETCH_COLORS = {
  bgPrimary: "grey.900",     // canvas / modal backdrop
  bgSecondary: "grey.800",   // panels, toolbars
  bgHover: "grey.700",       // hover states
  border: "grey.700",        // all panel borders
  textPrimary: "grey.100",   // main readable text (bright)
  textSecondary: "grey.300", // labels, secondary info
  textMuted: "grey.400",     // placeholders, hints
  textFaint: "grey.500",     // disabled / very subtle
 } as const;

// Checkerboard transparency pattern used for thumbnails and color swatches.
// Two shades that are visually distinct but subtle on dark backgrounds.
export const SKETCH_CHECKERBOARD = {
  backgroundImage:
    "repeating-conic-gradient(var(--palette-grey-800) 0% 25%, var(--palette-grey-900) 0% 50%)",
  backgroundSize: "8px 8px"
} as const;

// ─── Typography Scale ──────────────────────────────────────────────────────────

/** Monospace stack — keep in sync with ThemeNodetool `fontFamily2`. */
const SKETCH_FONT_FAMILY_MONO =
  "'JetBrains Mono', 'Inter', Arial, sans-serif" as const;

export const SKETCH_FONT = {
  /** Monospace for coordinates, dimensions readouts, hex. Same as `theme.fontFamily2`. */
  familyMono: SKETCH_FONT_FAMILY_MONO,
  /** Channel labels (R/G/B, H/S/L) */ xxs: "0.45rem",
  /** FG/BG labels, tiny readouts */ xs: "0.6rem",
  /** Setting labels, value readouts */ sm: "0.65rem",
  /** Layer names, general UI */ md: "0.7rem",
  /** Panel section headings */ section: "0.72rem",
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
  /** Row min-height matches the thumbnail so the row background never shows
   *  above or below the thumbnail (flush top/bottom). */
  layerItemHeight: "39.2px",
  layerThumbnail: "39.2px",
  panelWidth: "260px",
  /** One height for every control on a tool bar — picker, toggle, field, button. */
  control: "28px",
  iconButtonPad: "3px",
  borderRadius: BORDER_RADIUS.sm
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
    padding: `${SKETCH_SPACING.lg} 0`,
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
  fontSize: SKETCH_FONT.xs,
  py: SKETCH_SPACING.xs,
  px: SKETCH_SPACING.md,
  fontWeight: 500
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
  // Three gap steps carry the hierarchy, each one step of the 4px scale:
  // 6px inside a row, 16px inside a group, 24px between groups (the latter
  // set by the hosting bar).
  "& .setting-group": {
    display: "flex",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: getSpacingPx(SPACING.xl),
    minHeight: SKETCH_SIZE.control
  },
  "& .setting-row": {
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.sm),
    minHeight: SKETCH_SIZE.control,
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
      color: t.vars.palette.grey[100],
    },
    "& .setting-label": {
      ...TYPOGRAPHY.sans.label,
      whiteSpace: "nowrap",
      color: t.vars.palette.grey[300],
    },
    "& .MuiSlider-root": {
      width: "96px",
      minWidth: "72px",
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
    minHeight: SKETCH_SIZE.control
  },
  "& .MuiInputBase-input": {
    ...TYPOGRAPHY.sans.label,
    paddingTop: getSpacingPx(SPACING.xs),
    paddingBottom: getSpacingPx(SPACING.xs)
  },
  // Opt-in wider slider for the primary "Size" control. Doubling its
  // width (relative to other sliders) gives the user finer control on
  // the value most often tuned, without bloating every other row.
  "& .setting-row--wide": {
    "& .MuiSlider-root": {
      width: "200px",
      minWidth: "140px",
    },
  },
  "& .MuiToggleButtonGroup-root": {
    "& .MuiToggleButton-root": {
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      ...TYPOGRAPHY.sans.label,
      // Make the selected state pop against the dark toolbar — MUI's
      // default selected background is barely a few percent lighter
      // than the surrounding bar, so users couldn't tell which option
      // was active in tool params.
      "&.Mui-selected": {
        backgroundColor: t.vars.palette.grey[600],
        color: t.vars.palette.grey[50],
        "&:hover": {
          backgroundColor: t.vars.palette.grey[500],
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
    gap: SKETCH_SPACING.md,
    minWidth: 0,
    // Stacked context: a group is a column of rows, with no divider.
    "& .setting-group": {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: SKETCH_SPACING.md,
      minWidth: 0
    },
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: SKETCH_SPACING.md,
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
        color: t.vars.palette.grey[300],
      },
      "& .setting-value": {
        ...TYPOGRAPHY.mono.code,
        width: "36px",
        flexShrink: 0,
        textAlign: "right",
        color: t.vars.palette.grey[100],
      },
    },
    "& .MuiToggleButtonGroup-root": {
      alignSelf: "stretch",
      flexWrap: "wrap",
      "& .MuiToggleButton-root": {
        padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
        ...TYPOGRAPHY.sans.label,
        "&.Mui-selected": {
          backgroundColor: t.vars.palette.grey[600],
          color: t.vars.palette.grey[50],
          "&:hover": {
            backgroundColor: t.vars.palette.grey[500],
          },
        },
      },
    },
    "& .MuiIconButton-root": {
      padding: SKETCH_SIZE.iconButtonPad,
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
  minHeight: SKETCH_SIZE.control,
  minWidth: "56px",
};

/**
 * Italic hint text (e.g. "Alt+click to set source point", "No settings for this tool").
 */
export const sketchHintTextSx: SxProps<Theme> = {
  fontSize: SKETCH_FONT.md,
  color: SKETCH_COLORS.textFaint,
  fontStyle: "italic",
};

